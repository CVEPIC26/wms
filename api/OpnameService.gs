/**
 * OpnameService.gs
 * Modul STOCK OPNAME: pencatatan stock fisik + STOCK_ADJUSTMENT.
 *
 * Alur status:
 *   DRAFT → MENUNGGU_VERIFIKASI → DISETUJUI → STOCK_ADJUSTMENT (jika selisih != 0)
 *
 * Aturan inti:
 * - system_qty adalah SNAPSHOT STOCK.qty_stock saat detail dibuat dan
 *   tidak berubah meskipun stok berubah setelahnya.
 * - difference_qty = physical_qty - system_qty (dihitung SERVER-SIDE).
 * - Detail TIDAK mengubah STOCK. Adjustment hanya terjadi pada
 *   opname_verify, melalui Stock Core (applyStockMovement_).
 * - Satu SKU hanya satu detail per opname (OPNAME_DETAIL_DUPLICATE).
 * - Idempotency adjustment: source=STOCK_OPNAME, source_id=opname_id,
 *   sku, tipe=STOCK_ADJUSTMENT.
 */

function nextOpnameId_() {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_OPNAME);
  var count = sheet.getLastRow();
  var seq = ('000' + count).slice(-3);
  return 'OPN-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd') + '-' + seq;
}

function findOpname_(opnameId) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_OPNAME);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === opnameId) {
      return {
        row: i + 1,
        opname_id: opnameId,
        tanggal: values[i][1],
        lokasi: String(values[i][2]).trim(),
        user_email: String(values[i][3]).trim(),
        status: String(values[i][4]).trim()
      };
    }
  }
  return null;
}

function getOpnameDetails_(opnameId) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_OPNAME_DETAIL);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === opnameId) {
      result.push({
        row: i + 1,
        opname_id: opnameId,
        sku: String(values[i][1]).trim(),
        system_qty: Number(values[i][2]) || 0,
        physical_qty: Number(values[i][3]) || 0,
        difference_qty: Number(values[i][4]) || 0,
        notes: String(values[i][5]).trim()
      });
    }
  }
  return result;
}

function findOpnameDetailBySku_(opnameId, sku) {
  var details = getOpnameDetails_(opnameId);
  for (var i = 0; i < details.length; i++) {
    if (details[i].sku === sku) return details[i];
  }
  return null;
}

/**
 * POST action=opname_create
 * Body: { tanggal, lokasi, user_email }
 * Membuat header opname berstatus DRAFT.
 */
function opnameCreate_(payload) {
  var tanggal = optionalString_(payload.tanggal) || todayDate_();
  var lokasi = optionalString_(payload.lokasi);
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }
  try {
    var opnameId = nextOpnameId_();
    getSheet_(CONFIG.SHEETS.STOCK_OPNAME).appendRow([
      opnameId, tanggal, lokasi, user.email, CONFIG.STATUS.DRAFT, nowDatetime_()
    ]);
    return { opname_id: opnameId, status: CONFIG.STATUS.DRAFT };
  } finally {
    lock.releaseLock();
  }
}

/**
 * GET action=opname_sku&sku=...&opname_id=...
 * Lookup SKU untuk pola scanning: kembalikan sku, nama_produk,
 * system_qty (snapshot STOCK saat ini).
 * Jika SKU sudah punya detail dalam opname yang sama → OPNAME_DETAIL_DUPLICATE.
 */
function opnameSkuLookup_(opnameId, sku) {
  opnameId = requireString_(opnameId, 'opname_id');
  sku = requireString_(sku, 'sku');

  var opname = findOpname_(opnameId);
  if (!opname) {
    throw validationError_('Opname tidak ditemukan: ' + opnameId, 'OPNAME_NOT_FOUND');
  }
  if (findOpnameDetailBySku_(opnameId, sku)) {
    throw validationError_('SKU sudah tercatat dalam opname ini: ' + sku,
      'OPNAME_DETAIL_DUPLICATE');
  }

  var master = requireActiveSku_(sku);
  var stock = getStockBySku_(sku);
  return {
    sku: sku,
    nama_produk: master.nama_produk,
    system_qty: stock ? stock.qty_stock : 0
  };
}

/**
 * POST action=opname_add_detail
 * Body: { opname_id, sku, physical_qty, notes, user_email }
 * Menambah detail: snapshot system_qty dari STOCK, hitung difference
 * server-side. Hanya saat opname berstatus DRAFT. Tidak mengubah STOCK.
 */
function opnameAddDetail_(payload) {
  var opnameId = requireString_(payload.opname_id, 'opname_id');
  var user = requireVerifiedUser_(payload.user_email);
  var sku = requireString_(payload.sku, 'sku');
  var physicalQty = requireNonNegativeInt_(payload.physical_qty, 'physical_qty');
  var notes = optionalString_(payload.notes);
  var master = requireActiveSku_(sku);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }
  try {
    var opname = findOpname_(opnameId);
    if (!opname) {
      throw validationError_('Opname tidak ditemukan: ' + opnameId, 'OPNAME_NOT_FOUND');
    }
    if (opname.status !== CONFIG.STATUS.DRAFT) {
      throw validationError_(
        'Detail hanya dapat ditambah saat opname DRAFT. Status saat ini: ' +
        opname.status, 'INVALID_STATUS');
    }
    if (findOpnameDetailBySku_(opnameId, sku)) {
      throw validationError_('SKU sudah tercatat dalam opname ini: ' + sku,
        'OPNAME_DETAIL_DUPLICATE');
    }

    // Snapshot system_qty dari STOCK saat detail dibuat.
    var stock = getStockBySku_(sku);
    var systemQty = stock ? stock.qty_stock : 0;
    var differenceQty = physicalQty - systemQty; // dihitung server-side

    getSheet_(CONFIG.SHEETS.STOCK_OPNAME_DETAIL).appendRow([
      opnameId, sku, systemQty, physicalQty, differenceQty, notes
    ]);

    return {
      opname_id: opnameId,
      sku: sku,
      nama_produk: master.nama_produk,
      system_qty: systemQty,
      physical_qty: physicalQty,
      difference_qty: differenceQty
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * GET action=opname_get&opname_id=...
 * Mengembalikan header + seluruh detail opname.
 */
function opnameGet_(opnameId) {
  opnameId = requireString_(opnameId, 'opname_id');
  var opname = findOpname_(opnameId);
  if (!opname) {
    throw validationError_('Opname tidak ditemukan: ' + opnameId, 'OPNAME_NOT_FOUND');
  }
  var details = getOpnameDetails_(opnameId).map(function (d) {
    return {
      sku: d.sku,
      system_qty: d.system_qty,
      physical_qty: d.physical_qty,
      difference_qty: d.difference_qty,
      notes: d.notes
    };
  });
  return {
    opname_id: opname.opname_id,
    tanggal: opname.tanggal,
    lokasi: opname.lokasi,
    user_email: opname.user_email,
    status: opname.status,
    items: details
  };
}

/**
 * GET action=opname_list
 * Daftar seluruh opname (header saja).
 */
function opnameList_() {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_OPNAME);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0]).trim();
    if (id === '') continue;
    result.push({
      opname_id: id,
      tanggal: values[i][1],
      lokasi: String(values[i][2]).trim(),
      user_email: String(values[i][3]).trim(),
      status: String(values[i][4]).trim(),
      created_at: values[i][5]
    });
  }
  return result;
}

/**
 * POST action=opname_submit
 * Body: { opname_id, user_email }
 * DRAFT → MENUNGGU_VERIFIKASI. Tidak membuat adjustment.
 */
function opnameSubmit_(payload) {
  var opnameId = requireString_(payload.opname_id, 'opname_id');
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }
  try {
    var opname = findOpname_(opnameId);
    if (!opname) {
      throw validationError_('Opname tidak ditemukan: ' + opnameId, 'OPNAME_NOT_FOUND');
    }
    if (opname.status !== CONFIG.STATUS.DRAFT) {
      throw validationError_(
        'Hanya opname DRAFT yang dapat disubmit. Status saat ini: ' +
        opname.status, 'INVALID_STATUS');
    }
    if (getOpnameDetails_(opnameId).length === 0) {
      throw validationError_('Opname tidak memiliki detail: ' + opnameId, 'VALIDATION_ERROR');
    }

    getSheet_(CONFIG.SHEETS.STOCK_OPNAME)
      .getRange(opname.row, 5)
      .setValue(CONFIG.STATUS.MENUNGGU_VERIFIKASI);

    return {
      opname_id: opnameId,
      status: CONFIG.STATUS.MENUNGGU_VERIFIKASI,
      disubmit_oleh: user.email
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST action=opname_verify
 * Body: { opname_id, user_email }
 * MENUNGGU_VERIFIKASI → DISETUJUI, lalu STOCK_ADJUSTMENT untuk
 * setiap detail dengan difference_qty != 0.
 *
 * Atomicity: sebelum adjustment apa pun, seluruh detail divalidasi
 * (idempotency + adjustment negatif tidak membuat stok negatif).
 * Satu gagal → tidak ada adjustment, status tidak berubah.
 */
function opnameVerify_(payload) {
  var opnameId = requireString_(payload.opname_id, 'opname_id');
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }
  try {
    var opname = findOpname_(opnameId);
    if (!opname) {
      throw validationError_('Opname tidak ditemukan: ' + opnameId, 'OPNAME_NOT_FOUND');
    }
    if (opname.status === CONFIG.STATUS.DISETUJUI) {
      // Sudah diproses — sukses idempotent tanpa adjustment ulang.
      return {
        opname_id: opnameId,
        status: CONFIG.STATUS.DISETUJUI,
        sudah_diproses: true
      };
    }
    if (opname.status !== CONFIG.STATUS.MENUNGGU_VERIFIKASI) {
      throw validationError_(
        'Hanya opname MENUNGGU_VERIFIKASI yang dapat diverifikasi. Status saat ini: ' +
        opname.status, 'INVALID_STATUS');
    }

    var details = getOpnameDetails_(opnameId);
    if (details.length === 0) {
      throw validationError_('Opname tidak memiliki detail: ' + opnameId, 'VALIDATION_ERROR');
    }

    // --- Tahap 1: validasi SELURUH detail sebelum adjustment apa pun ---
    var toAdjust = [];
    var noAdjustment = 0;
    for (var i = 0; i < details.length; i++) {
      var d = details[i];
      // Gunakan difference dari snapshot (bukan hitung ulang dari stok terbaru).
      if (d.difference_qty === 0) {
        noAdjustment++;
        continue;
      }
      var sudahAda = movementExistsFull_(
        CONFIG.MOVEMENT_SOURCE.STOCK_OPNAME, opnameId, d.sku,
        CONFIG.MOVEMENT_TYPE.STOCK_ADJUSTMENT);
      if (sudahAda) {
        noAdjustment++; // sudah disesuaikan sebelumnya — jangan double
        continue;
      }
      // Cegah adjustment negatif yang membuat stok negatif.
      if (d.difference_qty < 0) {
        var stock = getStockBySku_(d.sku);
        var tersedia = stock ? stock.qty_stock : 0;
        if (tersedia + d.difference_qty < 0) {
          throw validationError_(
            'Adjustment negatif membuat stok negatif untuk SKU ' + d.sku +
            ' pada opname ' + opnameId +
            ' (tersedia: ' + tersedia + ', adjustment: ' + d.difference_qty + '). ' +
            'Seluruh verifikasi dibatalkan, tidak ada adjustment.',
            'STOCK_INSUFFICIENT');
        }
      }
      toAdjust.push(d);
    }

    // --- Tahap 2: proses seluruh adjustment via Stock Core ---
    var adjusted = [];
    for (var j = 0; j < toAdjust.length; j++) {
      var item = toAdjust[j];
      var result = applyStockMovement_(
        CONFIG.MOVEMENT_TYPE.STOCK_ADJUSTMENT,
        item.sku,
        item.difference_qty,
        CONFIG.MOVEMENT_SOURCE.STOCK_OPNAME,
        opnameId,
        'OPNAME ' + opnameId,
        user.email);
      if (!result.sudah_diproses) {
        adjusted.push({
          sku: item.sku,
          difference_qty: item.difference_qty,
          movement_id: result.movement.movement_id,
          qty_after: result.stock.qty_after
        });
      }
    }

    // MENUNGGU_VERIFIKASI → DISETUJUI (kolom 5 = status).
    getSheet_(CONFIG.SHEETS.STOCK_OPNAME)
      .getRange(opname.row, 5)
      .setValue(CONFIG.STATUS.DISETUJUI);

    return {
      opname_id: opnameId,
      status: CONFIG.STATUS.DISETUJUI,
      diverifikasi_oleh: user.email,
      adjustment_dibuat: adjusted.length,
      tanpa_adjustment: noAdjustment,
      items: adjusted
    };
  } finally {
    lock.releaseLock();
  }
}

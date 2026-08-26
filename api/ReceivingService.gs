/**
 * ReceivingService.gs
 * Logika transaksi RECEIVING + QC dan STOCK_IN.
 *
 * Alur status FINAL:
 *   DRAFT → MENUNGGU_VERIFIKASI → TERVERIFIKASI → STOCK_IN
 *
 * - receiving_create : membuat DRAFT (tidak menyentuh STOCK/MOVEMENT)
 * - receiving_submit : DRAFT → MENUNGGU_VERIFIKASI (tidak menyentuh STOCK/MOVEMENT)
 * - receiving_verify : MENUNGGU_VERIFIKASI → TERVERIFIKASI + STOCK_IN
 *                      (idempotency per SKU + LockService)
 */

function nextReceivingId_() {
  var sheet = getSheet_(CONFIG.SHEETS.RECEIVING);
  var count = sheet.getLastRow();
  var seq = ('000' + count).slice(-3);
  return 'RCV-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd') + '-' + seq;
}

/**
 * POST action=receiving_create
 * Body: { tanggal, supplier, nomor_po, user_email, items: [
 *   { sku, qty_diterima, qty_reject, alasan_reject, catatan }, ... ] }
 *
 * Membuat header RECEIVING (status DRAFT) + baris RECEIVING_DETAIL.
 * Seluruh input divalidasi SEBELUM menulis ke spreadsheet; jika satu
 * detail invalid, tidak ada baris RECEIVING/RECEIVING_DETAIL yang ditulis.
 * nama_produk diambil dari MASTER_SKU (bukan dipercaya dari client).
 * Tidak membuat STOCK_MOVEMENT dan tidak mengubah STOCK.
 */
function receivingCreate_(payload) {
  // --- Tahap 1: validasi seluruh input (belum menulis apa pun) ---
  var tanggal = optionalString_(payload.tanggal) || todayDate_();
  var supplier = requireString_(payload.supplier, 'supplier');
  var nomorPo = requireString_(payload.nomor_po, 'nomor_po');
  var user = requireVerifiedUser_(payload.user_email);
  var items = requireArray_(payload.items, 'items');

  var details = [];
  for (var i = 0; i < items.length; i++) {
    details.push(validateReceivingItem_(items[i], i));
  }

  // --- Tahap 2: penulisan atomik di dalam lock ---
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }

  var receivingRow = null;
  var detailRowCount = 0;
  try {
    var receivingId = nextReceivingId_();
    var createdAt = nowDatetime_();

    var receivingSheet = getSheet_(CONFIG.SHEETS.RECEIVING);
    receivingSheet.appendRow([
      receivingId, tanggal, supplier, nomorPo, user.email,
      CONFIG.STATUS.DRAFT, createdAt
    ]);
    receivingRow = receivingSheet.getLastRow();

    // Tulis seluruh detail sekaligus (bukan append per baris).
    var detailRows = [];
    for (var j = 0; j < details.length; j++) {
      var d = details[j];
      detailRows.push([
        receivingId, d.sku, d.nama_produk, d.qty_diterima,
        d.qty_reject, d.qty_diterima_qc, d.alasan_reject, d.catatan
      ]);
    }
    var detailSheet = getSheet_(CONFIG.SHEETS.RECEIVING_DETAIL);
    var detailStartRow = detailSheet.getLastRow() + 1;
    detailSheet
      .getRange(detailStartRow, 1, detailRows.length, detailRows[0].length)
      .setValues(detailRows);
    detailRowCount = detailRows.length;

    return {
      receiving_id: receivingId,
      status: CONFIG.STATUS.DRAFT,
      jumlah_item: details.length
    };
  } catch (err) {
    Logger.log('receivingCreate_ error: ' + err.message);
    rollbackReceivingCreate_(receivingRow, detailRowCount);
    throw err;
  } finally {
    lock.releaseLock();
  }
}

/**
 * Rollback aman untuk receiving_create yang gagal di tengah penulisan.
 * Hanya menghapus baris yang baru saja ditulis oleh proses ini —
 * tidak menyentuh baris transaksi lain. Jika rollback gagal, cukup
 * dicatat agar bisa dibersihkan manual.
 */
function rollbackReceivingCreate_(receivingRow, detailRowCount) {
  try {
    if (receivingRow) {
      getSheet_(CONFIG.SHEETS.RECEIVING).deleteRow(receivingRow);
    }
    if (detailRowCount > 0) {
      var detailSheet = getSheet_(CONFIG.SHEETS.RECEIVING_DETAIL);
      var lastRow = detailSheet.getLastRow();
      detailSheet.deleteRows(lastRow - detailRowCount + 1, detailRowCount);
    }
  } catch (rollbackErr) {
    Logger.log('rollbackReceivingCreate_ gagal, perlu pembersihan manual: ' +
      rollbackErr.message);
  }
}

/**
 * Validasi satu item detail receiving.
 */
function validateReceivingItem_(item, index) {
  var prefix = 'items[' + index + ']: ';
  var sku = requireString_(item.sku, prefix + 'sku');
  var master = requireActiveSku_(sku);

  var qtyDiterima = requireNonNegativeInt_(item.qty_diterima, prefix + 'qty_diterima');
  var qtyReject = requireNonNegativeInt_(item.qty_reject, prefix + 'qty_reject');
  if (qtyReject > qtyDiterima) {
    throw validationError_(prefix + 'qty_reject tidak boleh lebih besar dari qty_diterima', 'VALIDATION_ERROR');
  }
  var alasanReject = optionalString_(item.alasan_reject);
  if (qtyReject > 0 && alasanReject === '') {
    throw validationError_(prefix + 'alasan_reject wajib jika qty_reject > 0', 'VALIDATION_ERROR');
  }

  return {
    sku: sku,
    nama_produk: master.nama_produk,
    qty_diterima: qtyDiterima,
    qty_reject: qtyReject,
    qty_diterima_qc: qtyDiterima - qtyReject,
    alasan_reject: alasanReject,
    catatan: optionalString_(item.catatan)
  };
}

function findReceiving_(receivingId) {
  var sheet = getSheet_(CONFIG.SHEETS.RECEIVING);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === receivingId) {
      return {
        row: i + 1,
        receiving_id: receivingId,
        tanggal: values[i][1],
        supplier: String(values[i][2]).trim(),
        nomor_po: String(values[i][3]).trim(),
        user_email: String(values[i][4]).trim(),
        status: String(values[i][5]).trim()
      };
    }
  }
  return null;
}

function getReceivingDetails_(receivingId) {
  var sheet = getSheet_(CONFIG.SHEETS.RECEIVING_DETAIL);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === receivingId) {
      result.push({
        sku: String(values[i][1]).trim(),
        nama_produk: String(values[i][2]).trim(),
        qty_diterima: Number(values[i][3]) || 0,
        qty_reject: Number(values[i][4]) || 0,
        qty_diterima_qc: Number(values[i][5]) || 0
      });
    }
  }
  return result;
}

/**
 * GET action=receiving_list
 * Daftar seluruh receiving (header saja), READ-ONLY.
 */
function receivingList_() {
  var sheet = getSheet_(CONFIG.SHEETS.RECEIVING);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0]).trim();
    if (id === '') continue;
    result.push({
      receiving_id: id,
      tanggal: values[i][1],
      supplier: String(values[i][2]).trim(),
      nomor_po: String(values[i][3]).trim(),
      user_email: String(values[i][4]).trim(),
      status: String(values[i][5]).trim(),
      created_at: values[i][6]
    });
  }
  return result;
}

/**
 * GET action=receiving_get&receiving_id=...
 * Satu receiving: header + seluruh detail, READ-ONLY.
 */
function receivingGet_(receivingId) {
  receivingId = requireString_(receivingId, 'receiving_id');
  var receiving = findReceiving_(receivingId);
  if (!receiving) {
    throw validationError_('Receiving tidak ditemukan: ' + receivingId, 'RECEIVING_NOT_FOUND');
  }
  return {
    receiving_id: receiving.receiving_id,
    tanggal: receiving.tanggal,
    supplier: receiving.supplier,
    nomor_po: receiving.nomor_po,
    user_email: receiving.user_email,
    status: receiving.status,
    items: getReceivingDetails_(receivingId)
  };
}

/**
 * POST action=receiving_submit
 * Body: { receiving_id, user_email }
 *
 * Mengajukan receiving untuk diverifikasi:
 * DRAFT → MENUNGGU_VERIFIKASI.
 * TIDAK membuat STOCK_MOVEMENT dan TIDAK mengubah STOCK.
 */
function receivingSubmit_(payload) {
  var receivingId = requireString_(payload.receiving_id, 'receiving_id');
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }

  try {
    var receiving = findReceiving_(receivingId);
    if (!receiving) {
      throw validationError_('Receiving tidak ditemukan: ' + receivingId, 'RECEIVING_NOT_FOUND');
    }
    if (receiving.status !== CONFIG.STATUS.DRAFT) {
      throw validationError_(
        'Hanya receiving berstatus DRAFT yang dapat disubmit. Status saat ini: ' +
        receiving.status, 'INVALID_STATUS');
    }

    var details = getReceivingDetails_(receivingId);
    if (details.length === 0) {
      throw validationError_('Receiving tidak memiliki detail: ' + receivingId, 'VALIDATION_ERROR');
    }

    // DRAFT → MENUNGGU_VERIFIKASI (kolom 6 = status).
    getSheet_(CONFIG.SHEETS.RECEIVING)
      .getRange(receiving.row, 6)
      .setValue(CONFIG.STATUS.MENUNGGU_VERIFIKASI);

    return {
      receiving_id: receivingId,
      status: CONFIG.STATUS.MENUNGGU_VERIFIKASI,
      disubmit_oleh: user.email
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST action=receiving_verify
 * Body: { receiving_id, user_email }
 *
 * Verifikasi receiving: MENUNGGU_VERIFIKASI → TERVERIFIKASI,
 * lalu memproses STOCK_IN.
 * STOCK_IN hanya terjadi pada proses ini.
 *
 * Anti-double-stock:
 * - LockService membungkus seluruh perubahan status + movement + stock.
 * - Idempotency per SKU: skip SKU yang movement-nya sudah ada.
 * - Receiving yang sudah TERVERIFIKASI mengembalikan sukses idempotent
 *   tanpa memproses ulang.
 */
function receivingVerify_(payload) {
  var receivingId = requireString_(payload.receiving_id, 'receiving_id');
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }

  try {
    var receiving = findReceiving_(receivingId);
    if (!receiving) {
      throw validationError_('Receiving tidak ditemukan: ' + receivingId, 'RECEIVING_NOT_FOUND');
    }
    if (receiving.status === CONFIG.STATUS.TERVERIFIKASI) {
      // Sudah diproses — sukses idempotent tanpa memproses ulang.
      return {
        receiving_id: receivingId,
        status: CONFIG.STATUS.TERVERIFIKASI,
        sudah_diproses: true
      };
    }
    if (receiving.status !== CONFIG.STATUS.MENUNGGU_VERIFIKASI) {
      throw validationError_(
        'Hanya receiving berstatus MENUNGGU_VERIFIKASI yang dapat diverifikasi. ' +
        'Status saat ini: ' + receiving.status, 'INVALID_STATUS');
    }

    var details = getReceivingDetails_(receivingId);
    if (details.length === 0) {
      throw validationError_('Receiving tidak memiliki detail: ' + receivingId, 'VALIDATION_ERROR');
    }

    // MENUNGGU_VERIFIKASI → TERVERIFIKASI (kolom 6 = status).
    getSheet_(CONFIG.SHEETS.RECEIVING)
      .getRange(receiving.row, 6)
      .setValue(CONFIG.STATUS.TERVERIFIKASI);

    var movementsCreated = 0;
    var movementsSkipped = 0;
    var tanggal = todayDate_();
    var keterangan = 'PO ' + receiving.nomor_po + ' / ' + receiving.supplier;

    for (var i = 0; i < details.length; i++) {
      var d = details[i];
      if (d.qty_diterima_qc <= 0) {
        movementsSkipped++; // qty_stock_in = 0 → tidak membuat movement
        continue;
      }
      // Idempotency per SKU: jangan proses dua kali.
      if (movementExists_(CONFIG.MOVEMENT_SOURCE.RECEIVING, receivingId, d.sku)) {
        movementsSkipped++;
        continue;
      }
      createMovement_({
        movement_id: nextMovementId_(),
        tanggal: tanggal,
        sku: d.sku,
        tipe_transaksi: CONFIG.MOVEMENT_TYPE.STOCK_IN,
        qty: d.qty_diterima_qc,
        source: CONFIG.MOVEMENT_SOURCE.RECEIVING,
        source_id: receivingId,
        keterangan: keterangan,
        user_email: receiving.user_email,
        created_at: nowDatetime_()
      });
      addStock_(d.sku, d.nama_produk, d.qty_diterima_qc);
      movementsCreated++;
    }

    return {
      receiving_id: receivingId,
      status: CONFIG.STATUS.TERVERIFIKASI,
      diverifikasi_oleh: user.email,
      movement_dibuat: movementsCreated,
      movement_dilewati: movementsSkipped
    };
  } finally {
    lock.releaseLock();
  }
}

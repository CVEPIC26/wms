/**
 * AdjustmentService.gs
 * STOCK_ADJUSTMENT manual (koreksi stok di luar Stock Opname)
 * dengan audit trail lengkap.
 *
 * Prinsip: STOCK tidak pernah diedit langsung. Semua koreksi melalui
 *   Adjustment Request → validasi → verifikasi → STOCK_MOVEMENT → STOCK.
 *
 * Alur status:
 *   DRAFT → MENUNGGU_VERIFIKASI → DISETUJUI → STOCK_ADJUSTMENT
 *
 * Movement: source=ADJUSTMENT (BUKAN STOCK_OPNAME),
 * tipe=STOCK_ADJUSTMENT, source_id=adjustment_id.
 * Idempotency: source + source_id + sku + tipe_transaksi.
 *
 * Audit: sheet STOCK_ADJUSTMENT mencatat pembuat, alasan, sku, qty,
 * status, verified_by, created_at, verified_at. movement_id dapat
 * ditelusuri lewat STOCK_MOVEMENT (source + source_id).
 *
 * Catatan keamanan: pembuatan adjustment tidak mengubah stok sampai
 * diverifikasi user lain (pemisahan tugas pembuat vs verifier).
 */

function nextAdjustmentId_() {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_ADJUSTMENT);
  var count = sheet.getLastRow();
  var seq = ('000' + count).slice(-3);
  return 'ADJ-' + Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyyMMdd') + '-' + seq;
}

function findAdjustment_(adjustmentId) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_ADJUSTMENT);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === adjustmentId) {
      return {
        row: i + 1,
        adjustment_id: adjustmentId,
        tanggal: values[i][1],
        sku: String(values[i][2]).trim(),
        nama_produk: String(values[i][3]).trim(),
        qty_adjustment: Number(values[i][4]) || 0,
        alasan: String(values[i][5]).trim(),
        user_email: String(values[i][6]).trim(),
        status: String(values[i][7]).trim(),
        verified_by: String(values[i][8]).trim(),
        created_at: values[i][9],
        verified_at: values[i][10]
      };
    }
  }
  return null;
}

/**
 * POST action=adjustment_create
 * Body: { tanggal, sku, qty_adjustment, alasan, user_email }
 * Membuat adjustment berstatus DRAFT. Tidak mengubah STOCK.
 */
function adjustmentCreate_(payload) {
  var tanggal = optionalString_(payload.tanggal) || todayDate_();
  var sku = requireString_(payload.sku, 'sku');
  var master = requireActiveSku_(sku);
  var qty = requireInt_(payload.qty_adjustment, 'qty_adjustment');
  if (qty === 0) {
    throw validationError_('qty_adjustment tidak boleh 0', 'VALIDATION_ERROR');
  }
  var alasan = requireString_(payload.alasan, 'alasan');
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }
  try {
    var adjustmentId = nextAdjustmentId_();
    getSheet_(CONFIG.SHEETS.STOCK_ADJUSTMENT).appendRow([
      adjustmentId, tanggal, sku, master.nama_produk, qty, alasan,
      user.email, CONFIG.STATUS.DRAFT, '', nowDatetime_(), ''
    ]);
    return { adjustment_id: adjustmentId, status: CONFIG.STATUS.DRAFT };
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST action=adjustment_submit
 * Body: { adjustment_id, user_email }
 * DRAFT → MENUNGGU_VERIFIKASI. Tidak mengubah STOCK.
 */
function adjustmentSubmit_(payload) {
  var adjustmentId = requireString_(payload.adjustment_id, 'adjustment_id');
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }
  try {
    var adj = findAdjustment_(adjustmentId);
    if (!adj) {
      throw validationError_('Adjustment tidak ditemukan: ' + adjustmentId, 'ADJUSTMENT_NOT_FOUND');
    }
    if (adj.status !== CONFIG.STATUS.DRAFT) {
      throw validationError_(
        'Hanya adjustment DRAFT yang dapat disubmit. Status saat ini: ' +
        adj.status, 'INVALID_STATUS');
    }

    getSheet_(CONFIG.SHEETS.STOCK_ADJUSTMENT)
      .getRange(adj.row, 8)
      .setValue(CONFIG.STATUS.MENUNGGU_VERIFIKASI);

    return {
      adjustment_id: adjustmentId,
      status: CONFIG.STATUS.MENUNGGU_VERIFIKASI,
      disubmit_oleh: user.email
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * POST action=adjustment_verify
 * Body: { adjustment_id, user_email }
 * MENUNGGU_VERIFIKASI → DISETUJUI + STOCK_ADJUSTMENT via Stock Core.
 *
 * Atomicity: seluruh validasi (status, verifier, SKU, qty, kecukupan
 * stok untuk qty negatif, idempotency) sebelum ada perubahan. Gagal →
 * tidak ada movement/stok berubah, status tetap MENUNGGU_VERIFIKASI.
 */
function adjustmentVerify_(payload) {
  var adjustmentId = requireString_(payload.adjustment_id, 'adjustment_id');
  var user = requireVerifiedUser_(payload.user_email);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }
  try {
    var adj = findAdjustment_(adjustmentId);
    if (!adj) {
      throw validationError_('Adjustment tidak ditemukan: ' + adjustmentId, 'ADJUSTMENT_NOT_FOUND');
    }
    if (adj.status === CONFIG.STATUS.DISETUJUI) {
      // Sudah diproses — sukses idempotent tanpa movement kedua.
      return {
        adjustment_id: adjustmentId,
        status: CONFIG.STATUS.DISETUJUI,
        sudah_diproses: true
      };
    }
    if (adj.status !== CONFIG.STATUS.MENUNGGU_VERIFIKASI) {
      throw validationError_(
        'Hanya adjustment MENUNGGU_VERIFIKASI yang dapat diverifikasi. Status saat ini: ' +
        adj.status, 'INVALID_STATUS');
    }

    // Pemisahan tugas: pembuat tidak boleh menjadi verifier.
    if (adj.user_email.toLowerCase() === user.email.toLowerCase()) {
      throw validationError_(
        'Pembuat adjustment tidak boleh menjadi verifier', 'VERIFIER_SAME_AS_CREATOR');
    }

    // Validasi SKU & qty (bertahan jika master berubah setelah dibuat).
    requireActiveSku_(adj.sku);
    var qty = requireInt_(adj.qty_adjustment, 'qty_adjustment');
    if (qty === 0) {
      throw validationError_('qty_adjustment tidak boleh 0', 'VALIDATION_ERROR');
    }

    // Cek idempotency movement.
    var sudahAda = movementExistsFull_(
      CONFIG.MOVEMENT_SOURCE.ADJUSTMENT, adjustmentId, adj.sku,
      CONFIG.MOVEMENT_TYPE.STOCK_ADJUSTMENT);

    var movementId = null;
    var qtyAfter = null;

    if (sudahAda) {
      // Movement sudah ada (misal proses sebelumnya terputus setelah
      // movement tapi sebelum status berubah) — jangan buat movement kedua.
      var existing = getStockBySku_(adj.sku);
      qtyAfter = existing ? existing.qty_stock : null;
    } else {
      // Untuk qty negatif, Stock Core mencegah stok negatif
      // (STOCK_INSUFFICIENT) — approval gagal, status tetap.
      var result = applyStockMovement_(
        CONFIG.MOVEMENT_TYPE.STOCK_ADJUSTMENT,
        adj.sku,
        qty,
        CONFIG.MOVEMENT_SOURCE.ADJUSTMENT,
        adjustmentId,
        'ADJUSTMENT ' + adjustmentId + ' - ' + adj.alasan,
        user.email);
      movementId = result.movement.movement_id;
      qtyAfter = result.stock.qty_after;
    }

    // MENUNGGU_VERIFIKASI → DISETUJUI + audit verifikasi.
    var sheet = getSheet_(CONFIG.SHEETS.STOCK_ADJUSTMENT);
    sheet.getRange(adj.row, 8).setValue(CONFIG.STATUS.DISETUJUI);   // status
    sheet.getRange(adj.row, 9).setValue(user.email);                 // verified_by
    sheet.getRange(adj.row, 11).setValue(nowDatetime_());            // verified_at

    return {
      adjustment_id: adjustmentId,
      status: CONFIG.STATUS.DISETUJUI,
      verified_by: user.email,
      movement_id: movementId,
      qty_after: qtyAfter
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * GET action=adjustment_get&adjustment_id=...
 * Satu adjustment lengkap (audit trail).
 */
function adjustmentGet_(adjustmentId) {
  adjustmentId = requireString_(adjustmentId, 'adjustment_id');
  var adj = findAdjustment_(adjustmentId);
  if (!adj) {
    throw validationError_('Adjustment tidak ditemukan: ' + adjustmentId, 'ADJUSTMENT_NOT_FOUND');
  }
  return {
    adjustment_id: adj.adjustment_id,
    tanggal: adj.tanggal,
    sku: adj.sku,
    nama_produk: adj.nama_produk,
    qty_adjustment: adj.qty_adjustment,
    alasan: adj.alasan,
    user_email: adj.user_email,
    status: adj.status,
    verified_by: adj.verified_by,
    created_at: adj.created_at,
    verified_at: adj.verified_at
  };
}

/**
 * GET action=adjustment_list
 * Daftar seluruh adjustment dengan status.
 */
function adjustmentList_() {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_ADJUSTMENT);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][0]).trim();
    if (id === '') continue;
    result.push({
      adjustment_id: id,
      tanggal: values[i][1],
      sku: String(values[i][2]).trim(),
      nama_produk: String(values[i][3]).trim(),
      qty_adjustment: Number(values[i][4]) || 0,
      alasan: String(values[i][5]).trim(),
      user_email: String(values[i][6]).trim(),
      status: String(values[i][7]).trim(),
      verified_by: String(values[i][8]).trim(),
      created_at: values[i][9],
      verified_at: values[i][10]
    });
  }
  return result;
}

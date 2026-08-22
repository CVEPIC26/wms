/**
 * ReceivingService.gs
 * Logika transaksi RECEIVING + QC dan STOCK_IN.
 *
 * Alur status: DRAFT → MENUNGGU_VERIFIKASI → TERVERIFIKASI
 * STOCK_IN hanya dibuat saat receiving menjadi TERVERIFIKASI,
 * dengan idempotency per SKU + LockService.
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
 * nama_produk diambil dari MASTER_SKU (bukan dipercaya dari client).
 */
function receivingCreate_(payload) {
  var tanggal = optionalString_(payload.tanggal) || todayDate_();
  var supplier = requireString_(payload.supplier, 'supplier');
  var nomorPo = requireString_(payload.nomor_po, 'nomor_po');
  var user = requireVerifiedUser_(payload.user_email);
  var items = requireArray_(payload.items, 'items');

  var details = [];
  for (var i = 0; i < items.length; i++) {
    details.push(validateReceivingItem_(items[i], i));
  }

  var receivingId = nextReceivingId_();
  var createdAt = nowDatetime_();

  getSheet_(CONFIG.SHEETS.RECEIVING).appendRow([
    receivingId, tanggal, supplier, nomorPo, user.email,
    CONFIG.STATUS.DRAFT, createdAt
  ]);

  var detailSheet = getSheet_(CONFIG.SHEETS.RECEIVING_DETAIL);
  for (var j = 0; j < details.length; j++) {
    var d = details[j];
    detailSheet.appendRow([
      receivingId, d.sku, d.nama_produk, d.qty_diterima,
      d.qty_reject, d.qty_diterima_qc, d.alasan_reject, d.catatan
    ]);
  }

  return {
    receiving_id: receivingId,
    status: CONFIG.STATUS.DRAFT,
    jumlah_item: details.length
  };
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
 * POST action=receiving_submit
 * Body: { receiving_id, user_email }
 *
 * Menyelesaikan RECEIVING + QC:
 * DRAFT/MENUNGGU_VERIFIKASI → TERVERIFIKASI, lalu STOCK_IN.
 *
 * Anti-double-stock:
 * - LockService mencegah dua request bersamaan.
 * - Idempotency: skip SKU yang movement-nya sudah ada.
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
    if (receiving.status === CONFIG.STATUS.TERVERIFIKASI) {
      // Sudah diproses — kembalikan sukses idempotent tanpa memproses ulang.
      return {
        receiving_id: receivingId,
        status: CONFIG.STATUS.TERVERIFIKASI,
        sudah_diproses: true
      };
    }

    var details = getReceivingDetails_(receivingId);
    if (details.length === 0) {
      throw validationError_('Receiving tidak memiliki detail: ' + receivingId, 'VALIDATION_ERROR');
    }

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

    // Update status menjadi TERVERIFIKASI (kolom 6 = status).
    getSheet_(CONFIG.SHEETS.RECEIVING)
      .getRange(receiving.row, 6)
      .setValue(CONFIG.STATUS.TERVERIFIKASI);

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

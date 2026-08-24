/**
 * PreparationService.gs
 * Integrasi source eksternal PENYIAPAN menjadi STOCK_OUT.
 *
 * Alur:
 *   PENYIAPAN → ambil transaksi valid → validasi SKU & qty
 *   → cek idempotency (source + source_id + sku + STOCK_OUT)
 *   → STOCK_MOVEMENT → STOCK berkurang (via Stock Core)
 *
 * Aturan:
 * - PENYIAPAN adalah sheet eksternal: data tidak dihapus/diubah.
 * - STOCK tidak pernah dikurangi langsung di file ini — seluruh
 *   perubahan stok melalui Stock Core (applyStockMovement_ /
 *   subtractStock_).
 * - Satu transaksi multi-SKU bersifat atomik: divalidasi penuh
 *   (SKU aktif, qty, kecukupan stok) sebelum stok apa pun berubah.
 */

/**
 * Membaca sheet PENYIAPAN dan mengelompokkan baris per transaksi.
 * Mengembalikan array: [{ penyiapan_id, items: [{sku, qty}, ...] }, ...]
 *
 * - Baris tanpa ID/SKU dilewati.
 * - Jika kolom status ada, hanya baris berstatus siap proses
 *   (CONFIG.PENYIAPAN.STATUS_SIAP) yang diambil.
 * - Data PENYIAPAN tidak diubah.
 */
function getPreparationData_() {
  var cfg = CONFIG.PENYIAPAN;
  var spreadsheet = cfg.SPREADSHEET_ID
    ? SpreadsheetApp.openById(cfg.SPREADSHEET_ID)
    : getSpreadsheet_();
  var sheet = spreadsheet.getSheetByName(cfg.SHEET_NAME);
  if (!sheet) {
    throw validationError_('Sheet PENYIAPAN tidak ditemukan: ' + cfg.SHEET_NAME,
      'PREPARATION_SOURCE_NOT_FOUND');
  }

  var values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  // Petakan header ke indeks kolom.
  var headerRow = values[0];
  var colIndex = {};
  for (var c = 0; c < headerRow.length; c++) {
    colIndex[String(headerRow[c]).trim().toLowerCase()] = c;
  }
  var idCol = colIndex[String(cfg.HEADERS.ID).toLowerCase()];
  var skuCol = colIndex[String(cfg.HEADERS.SKU).toLowerCase()];
  var qtyCol = colIndex[String(cfg.HEADERS.QTY).toLowerCase()];
  var statusCol = colIndex[String(cfg.HEADERS.STATUS).toLowerCase()];

  if (idCol === undefined || skuCol === undefined || qtyCol === undefined) {
    throw validationError_(
      'Header PENYIAPAN tidak lengkap: wajib ada kolom ' +
      cfg.HEADERS.ID + ', ' + cfg.HEADERS.SKU + ', ' + cfg.HEADERS.QTY,
      'PREPARATION_HEADER_INVALID');
  }

  var byId = {};
  var order = [];
  for (var i = 1; i < values.length; i++) {
    var id = String(values[i][idCol]).trim();
    var sku = String(values[i][skuCol]).trim();
    if (id === '' || sku === '') continue;

    // Filter status hanya jika kolom status benar-benar ada.
    if (statusCol !== undefined) {
      var status = String(values[i][statusCol]).trim().toUpperCase();
      if (status !== '' && cfg.STATUS_SIAP.indexOf(status) === -1) continue;
    }

    var qty = Number(values[i][qtyCol]);
    if (!byId[id]) {
      byId[id] = { penyiapan_id: id, items: [] };
      order.push(id);
    }
    byId[id].items.push({ sku: sku, qty: qty });
  }

  var result = [];
  for (var k = 0; k < order.length; k++) {
    result.push(byId[order[k]]);
  }
  return result;
}

/**
 * Validasi satu transaksi PENYIAPAN (seluruh item) SEBELUM ada
 * perubahan stok. Melempar error jika ada item yang tidak valid.
 * Mengembalikan array item tervalidasi: [{ sku, nama_produk, qty }, ...]
 */
function validatePreparationTransaction_(transaction) {
  var items = requireArray_(transaction.items, 'items');
  var validated = [];
  for (var i = 0; i < items.length; i++) {
    var prefix = 'penyiapan ' + transaction.penyiapan_id + ' items[' + i + ']: ';
    var sku = requireString_(items[i].sku, prefix + 'sku');
    var master = requireActiveSku_(sku); // SKU harus ada & aktif
    var qty = requirePositiveInt_(items[i].qty, prefix + 'qty');
    validated.push({ sku: sku, nama_produk: master.nama_produk, qty: qty });
  }
  return validated;
}

/**
 * Memproses satu transaksi PENYIAPAN menjadi STOCK_OUT secara atomik.
 *
 * Tahap 1 (tanpa mengubah apa pun): validasi seluruh item — SKU aktif,
 * qty integer positif, stok mencukupi, dan belum pernah diproses
 * (idempotency 4 kolom). Satu item gagal → seluruh transaksi gagal,
 * tidak ada movement/stok parsial.
 *
 * Tahap 2 (di dalam LockService): untuk tiap item, proses STOCK_OUT
 * via Stock Core (applyStockMovement_).
 *
 * Mengembalikan { penyiapan_id, diproses, dilewati, items }.
 */
function processPreparationStockOut_(penyiapanId, userEmail) {
  penyiapanId = requireString_(penyiapanId, 'penyiapan_id');
  var user = requireVerifiedUser_(userEmail);

  // Ambil transaksi dari sumber.
  var transactions = getPreparationData_();
  var target = null;
  for (var i = 0; i < transactions.length; i++) {
    if (transactions[i].penyiapan_id === penyiapanId) {
      target = transactions[i];
      break;
    }
  }
  if (!target) {
    throw validationError_('Transaksi PENYIAPAN tidak ditemukan / tidak siap diproses: ' +
      penyiapanId, 'PREPARATION_NOT_FOUND');
  }

  // --- Tahap 1: validasi penuh sebelum perubahan stok (atomik) ---
  var validated = validatePreparationTransaction_(target);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }

  try {
    // Cek idempotency + kecukupan stok untuk SELURUH item dulu.
    var toProcess = [];
    var skipped = [];
    for (var j = 0; j < validated.length; j++) {
      var item = validated[j];
      var sudahAda = movementExistsFull_(
        CONFIG.MOVEMENT_SOURCE.PENYIAPAN, penyiapanId, item.sku,
        CONFIG.MOVEMENT_TYPE.STOCK_OUT);
      if (sudahAda) {
        skipped.push(item.sku);
        continue;
      }
      var stock = getStockBySku_(item.sku);
      var tersedia = stock ? stock.qty_stock : 0;
      if (tersedia - item.qty < 0) {
        throw validationError_(
          'Stok tidak mencukupi untuk SKU ' + item.sku +
          ' pada penyiapan ' + penyiapanId +
          ' (tersedia: ' + tersedia + ', diminta: ' + item.qty + '). ' +
          'Seluruh transaksi dibatalkan, tidak ada stok yang berkurang.',
          'STOCK_INSUFFICIENT');
      }
      toProcess.push(item);
    }

    // --- Tahap 2: proses STOCK_OUT via Stock Core ---
    var processed = [];
    for (var m = 0; m < toProcess.length; m++) {
      var it = toProcess[m];
      var result = applyStockMovement_(
        CONFIG.MOVEMENT_TYPE.STOCK_OUT,
        it.sku,
        it.qty,
        CONFIG.MOVEMENT_SOURCE.PENYIAPAN,
        penyiapanId,
        'OUT PENYIAPAN ' + penyiapanId,
        user.email);
      if (!result.sudah_diproses) {
        processed.push({
          sku: it.sku,
          qty: it.qty,
          movement_id: result.movement.movement_id,
          qty_after: result.stock.qty_after
        });
      } else {
        skipped.push(it.sku);
      }
    }

    return {
      penyiapan_id: penyiapanId,
      diproses: processed.length,
      dilewati: skipped.length,
      sku_dilewati: skipped,
      items: processed
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * Memproses seluruh transaksi PENYIAPAN yang siap diproses.
 * Setiap transaksi bersifat atomik; kegagalan satu transaksi tidak
 * menghentikan transaksi lain (dicatat di ringkasan).
 *
 * Mengembalikan ringkasan batch.
 */
function processPreparationBatch_(userEmail) {
  var user = requireVerifiedUser_(userEmail);
  var transactions = getPreparationData_();

  var berhasil = [];
  var dilewatiPenuh = [];
  var gagal = [];

  for (var i = 0; i < transactions.length; i++) {
    var t = transactions[i];
    try {
      var result = processPreparationStockOut_(t.penyiapan_id, user.email);
      if (result.diproses === 0 && result.dilewati > 0) {
        dilewatiPenuh.push(t.penyiapan_id);
      } else {
        berhasil.push(result);
      }
    } catch (err) {
      Logger.log('processPreparationBatch_ gagal untuk ' + t.penyiapan_id +
        ': ' + err.message);
      gagal.push({
        penyiapan_id: t.penyiapan_id,
        error_code: err.code || 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }

  return {
    total_transaksi: transactions.length,
    berhasil: berhasil.length,
    dilewati: dilewatiPenuh.length,
    gagal: gagal.length,
    detail_berhasil: berhasil,
    detail_gagal: gagal
  };
}

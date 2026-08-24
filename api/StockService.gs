/**
 * StockService.gs — STOCK CORE
 * Fondasi seluruh transaksi stok WMS.
 *
 * Aturan:
 * - STOCK tidak boleh diedit manual sebagai transaksi; seluruh
 *   perubahan saldo hanya melalui fungsi di file ini, yang selalu
 *   didahului pencatatan STOCK_MOVEMENT oleh pemanggil.
 * - STOCK_IN menambah qty_stock, STOCK_OUT mengurangi,
 *   STOCK_ADJUSTMENT menyesuaikan (boleh negatif/positif).
 * - Hasil akhir qty_stock tidak boleh negatif.
 * - Seluruh operasi perubahan stok dipanggil dalam konteks LockService
 *   oleh pemanggil (applyStockMovement_ / ReceivingService).
 */

/**
 * Membaca satu baris STOCK berdasarkan SKU.
 * Mengembalikan null jika SKU belum ada di STOCK.
 */
function getStockBySku_(sku) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === sku) {
      return {
        row: i + 1,
        sku: sku,
        nama_produk: String(values[i][1]).trim(),
        qty_stock: Number(values[i][2]) || 0,
        updated_at: values[i][3]
      };
    }
  }
  return null;
}

/**
 * Membaca seluruh baris STOCK.
 */
function getAllStock_() {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var sku = String(values[i][0]).trim();
    if (sku === '') continue;
    result.push({
      sku: sku,
      nama_produk: String(values[i][1]).trim(),
      qty_stock: Number(values[i][2]) || 0,
      updated_at: values[i][3]
    });
  }
  return result;
}

/**
 * Kartu stok: histori STOCK_MOVEMENT sebuah SKU,
 * urut dari transaksi lama ke baru (mengikuti urutan baris sheet
 * yang bersifat append-only).
 */
function getStockCard_(sku) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK_MOVEMENT);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][2]).trim() === sku) {
      result.push({
        movement_id: String(values[i][0]).trim(),
        tanggal: values[i][1],
        sku: String(values[i][2]).trim(),
        tipe_transaksi: String(values[i][3]).trim(),
        qty: Number(values[i][4]) || 0,
        source: String(values[i][5]).trim(),
        source_id: String(values[i][6]).trim(),
        keterangan: String(values[i][7]).trim(),
        user_email: String(values[i][8]).trim(),
        created_at: values[i][9]
      });
    }
  }
  return result;
}

/**
 * Menambah saldo stok sebuah SKU (STOCK_IN).
 * qty harus integer > 0. Jika SKU belum ada di STOCK, buat baris baru.
 */
function addStock_(sku, namaProduk, qty) {
  qty = requirePositiveInt_(qty, 'qty');
  var current = getStockBySku_(sku);
  if (current) {
    var sheet = getSheet_(CONFIG.SHEETS.STOCK);
    var qtyAfter = current.qty_stock + qty;
    sheet.getRange(current.row, 3).setValue(qtyAfter);
    sheet.getRange(current.row, 4).setValue(nowDatetime_());
    return { sku: sku, qty_before: current.qty_stock, qty_after: qtyAfter };
  }
  getSheet_(CONFIG.SHEETS.STOCK).appendRow([sku, namaProduk, qty, nowDatetime_()]);
  return { sku: sku, qty_before: 0, qty_after: qty };
}

/**
 * Mengurangi saldo stok sebuah SKU (STOCK_OUT).
 * qty harus integer > 0. Gagal (STOCK_INSUFFICIENT) jika SKU belum
 * ada di STOCK atau hasil akhir negatif.
 */
function subtractStock_(sku, qty) {
  qty = requirePositiveInt_(qty, 'qty');
  var current = getStockBySku_(sku);
  var qtyBefore = current ? current.qty_stock : 0;
  var qtyAfter = qtyBefore - qty;
  if (qtyAfter < 0) {
    throw validationError_(
      'Stok tidak mencukupi untuk SKU ' + sku +
      ' (tersedia: ' + qtyBefore + ', diminta: ' + qty + ')',
      'STOCK_INSUFFICIENT');
  }
  var sheet = getSheet_(CONFIG.SHEETS.STOCK);
  sheet.getRange(current.row, 3).setValue(qtyAfter);
  sheet.getRange(current.row, 4).setValue(nowDatetime_());
  return { sku: sku, qty_before: qtyBefore, qty_after: qtyAfter };
}

/**
 * Menyesuaikan saldo stok (STOCK_ADJUSTMENT).
 * differenceQty integer, boleh positif/negatif (tidak boleh 0).
 * Jika SKU belum ada di STOCK, baris baru hanya boleh dibuat jika
 * hasil akhir valid (differenceQty > 0). Hasil akhir tidak boleh negatif.
 */
function adjustStock_(sku, namaProduk, differenceQty) {
  differenceQty = requireInt_(differenceQty, 'difference_qty');
  if (differenceQty === 0) {
    throw validationError_('difference_qty tidak boleh 0', 'VALIDATION_ERROR');
  }
  var current = getStockBySku_(sku);
  var qtyBefore = current ? current.qty_stock : 0;
  var qtyAfter = qtyBefore + differenceQty;
  if (qtyAfter < 0) {
    throw validationError_(
      'Adjustment menghasilkan stok negatif untuk SKU ' + sku +
      ' (tersedia: ' + qtyBefore + ', adjustment: ' + differenceQty + ')',
      'STOCK_INSUFFICIENT');
  }
  if (current) {
    var sheet = getSheet_(CONFIG.SHEETS.STOCK);
    sheet.getRange(current.row, 3).setValue(qtyAfter);
    sheet.getRange(current.row, 4).setValue(nowDatetime_());
  } else {
    getSheet_(CONFIG.SHEETS.STOCK).appendRow([sku, namaProduk, qtyAfter, nowDatetime_()]);
  }
  return { sku: sku, qty_before: qtyBefore, qty_after: qtyAfter };
}

/**
 * Memproses satu transaksi stok secara utuh (movement + update STOCK)
 * di dalam LockService, dengan idempotency
 * source + source_id + sku + tipe_transaksi.
 *
 * Parameter:
 *   tipeTransaksi : STOCK_IN / STOCK_OUT / STOCK_ADJUSTMENT
 *   sku           : harus ada dan aktif di MASTER_SKU
 *   qty           : integer > 0 untuk STOCK_IN/STOCK_OUT;
 *                   integer != 0 untuk STOCK_ADJUSTMENT (bertanda)
 *   source        : harus ada di CONFIG.MOVEMENT_SOURCE
 *   sourceId      : identitas transaksi per SKU pada sumbernya
 *   keterangan    : opsional
 *   userEmail     : pelaksana (wajib terdaftar & aktif di USERS)
 *
 * Mengembalikan { movement, stock, sudah_diproses }.
 */
function applyStockMovement_(tipeTransaksi, sku, qty, source, sourceId, keterangan, userEmail) {
  requireValidMovementType_(tipeTransaksi);
  requireValidMovementSource_(source);
  sku = requireString_(sku, 'sku');
  var master = requireActiveSku_(sku);
  sourceId = requireString_(sourceId, 'source_id');
  var user = requireVerifiedUser_(userEmail);

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    throw validationError_('Sistem sibuk, coba lagi beberapa saat', 'LOCK_TIMEOUT');
  }

  try {
    // Idempotency: transaksi yang sama tidak menghasilkan movement ganda.
    if (movementExistsFull_(source, sourceId, sku, tipeTransaksi)) {
      var existing = getStockBySku_(sku);
      return {
        movement: null,
        stock: existing ? {
          sku: sku, qty_before: existing.qty_stock, qty_after: existing.qty_stock
        } : null,
        sudah_diproses: true
      };
    }

    var stockResult;
    if (tipeTransaksi === CONFIG.MOVEMENT_TYPE.STOCK_IN) {
      stockResult = addStock_(sku, master.nama_produk, qty);
    } else if (tipeTransaksi === CONFIG.MOVEMENT_TYPE.STOCK_OUT) {
      stockResult = subtractStock_(sku, qty);
    } else {
      stockResult = adjustStock_(sku, master.nama_produk, qty);
    }

    // Movement tidak boleh ber-qty 0.
    if (qty === 0) {
      throw validationError_('Movement tidak boleh memiliki qty 0', 'VALIDATION_ERROR');
    }

    var movement = createMovement_({
      movement_id: nextMovementId_(),
      tanggal: todayDate_(),
      sku: sku,
      tipe_transaksi: tipeTransaksi,
      qty: qty,
      source: source,
      source_id: sourceId,
      keterangan: optionalString_(keterangan),
      user_email: user.email,
      created_at: nowDatetime_()
    });

    return { movement: movement, stock: stockResult, sudah_diproses: false };
  } finally {
    lock.releaseLock();
  }
}

/**
 * StockService.gs
 * Mengelola sheet STOCK (saldo dikelola sistem, bukan diedit manual).
 * Perubahan saldo hanya terjadi dari transaksi yang tercatat di
 * STOCK_MOVEMENT. Dipanggil dalam konteks LockService.
 */

/**
 * Menambah saldo stok sebuah SKU (STOCK_IN).
 * Jika SKU belum ada di STOCK, buat baris baru.
 */
function addStock_(sku, namaProduk, qty) {
  var sheet = getSheet_(CONFIG.SHEETS.STOCK);
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === sku) {
      var current = Number(values[i][2]) || 0;
      sheet.getRange(i + 1, 3).setValue(current + qty);
      sheet.getRange(i + 1, 4).setValue(nowDatetime_());
      return { sku: sku, qty_before: current, qty_after: current + qty };
    }
  }
  sheet.appendRow([sku, namaProduk, qty, nowDatetime_()]);
  return { sku: sku, qty_before: 0, qty_after: qty };
}

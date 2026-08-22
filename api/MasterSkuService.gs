/**
 * MasterSkuService.gs
 * Membaca MASTER_SKU.
 */

function getAllMasterSku_() {
  var sheet = getSheet_(CONFIG.SHEETS.MASTER_SKU);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var sku = String(values[i][0]).trim();
    if (sku === '') continue;
    result.push({
      sku: sku,
      nama_produk: String(values[i][1]).trim(),
      status_aktif: String(values[i][2]).trim()
    });
  }
  return result;
}

function findMasterSku_(sku) {
  var all = getAllMasterSku_();
  for (var i = 0; i < all.length; i++) {
    if (all[i].sku === sku) return all[i];
  }
  return null;
}

/**
 * Validasi SKU untuk transaksi: harus ada dan aktif.
 * Mengembalikan record master SKU jika valid, melempar error jika tidak.
 */
function requireActiveSku_(sku) {
  var master = findMasterSku_(sku);
  if (!master) {
    throw validationError_('SKU tidak ditemukan di MASTER_SKU: ' + sku, 'SKU_NOT_FOUND');
  }
  if (master.status_aktif !== CONFIG.AKTIF) {
    throw validationError_('SKU tidak aktif: ' + sku, 'SKU_INACTIVE');
  }
  return master;
}

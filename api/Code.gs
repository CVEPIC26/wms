/**
 * Code.gs
 * Entry point Web App Apps Script.
 * Routing sederhana via parameter ?action=...
 *
 * Endpoint yang tersedia (tahap RECEIVING + QC + STOCK IN + STOCK CORE):
 *   GET  /exec?action=master_sku
 *   GET  /exec?action=users
 *   GET  /exec?action=stock_get&sku=...    (saldo satu SKU)
 *   GET  /exec?action=stock_list           (seluruh saldo STOCK)
 *   GET  /exec?action=stock_card&sku=...   (kartu stok / histori movement SKU)
 *   POST /exec?action=receiving_create  (buat DRAFT)
 *   POST /exec?action=receiving_submit  (DRAFT → MENUNGGU_VERIFIKASI)
 *   POST /exec?action=receiving_verify  (MENUNGGU_VERIFIKASI → TERVERIFIKASI + STOCK_IN)
 */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  try {
    switch (action) {
      case 'master_sku':
        return successResponse_('Daftar master SKU', { items: getAllMasterSku_() });
      case 'users':
        return successResponse_('Daftar users', { items: getAllUsers_() });
      case 'stock_get': {
        var skuGet = requireString_(e.parameter.sku, 'sku');
        var stock = getStockBySku_(skuGet);
        if (!stock) {
          return errorResponse_('Stok untuk SKU tidak ditemukan: ' + skuGet, 'STOCK_NOT_FOUND');
        }
        return successResponse_('Saldo stok ' + skuGet, {
          sku: stock.sku,
          nama_produk: stock.nama_produk,
          qty_stock: stock.qty_stock,
          updated_at: stock.updated_at
        });
      }
      case 'stock_list':
        return successResponse_('Daftar saldo stok', { items: getAllStock_() });
      case 'stock_card': {
        var skuCard = requireString_(e.parameter.sku, 'sku');
        return successResponse_('Kartu stok ' + skuCard, {
          sku: skuCard,
          items: getStockCard_(skuCard)
        });
      }
      default:
        return errorResponse_('Action tidak dikenal: ' + action, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    Logger.log('doGet error [' + action + ']: ' + err.message);
    return errorResponse_(err.message, err.code || 'INTERNAL_ERROR');
  }
}

function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  try {
    var payload = parsePostBody_(e);
    switch (action) {
      case 'receiving_create':
        return successResponse_('Receiving dibuat (DRAFT)', receivingCreate_(payload));
      case 'receiving_submit':
        return successResponse_('Receiving disubmit, menunggu verifikasi', receivingSubmit_(payload));
      case 'receiving_verify':
        return successResponse_('Receiving terverifikasi, STOCK_IN diproses', receivingVerify_(payload));
      default:
        return errorResponse_('Action tidak dikenal: ' + action, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    Logger.log('doPost error [' + action + ']: ' + err.message);
    return errorResponse_(err.message, err.code || 'INTERNAL_ERROR');
  }
}

function parsePostBody_(e) {
  if (!e || !e.postBody || !e.postBody.contents) {
    throw validationError_('Body request kosong', 'VALIDATION_ERROR');
  }
  try {
    return JSON.parse(e.postBody.contents);
  } catch (err) {
    throw validationError_('Body request bukan JSON valid', 'VALIDATION_ERROR');
  }
}

/**
 * Code.gs
 * Entry point Web App Apps Script.
 * Routing sederhana via parameter ?action=...
 *
 * Endpoint yang tersedia (tahap RECEIVING + QC + STOCK IN):
 *   GET  /exec?action=master_sku
 *   GET  /exec?action=users
 *   POST /exec?action=receiving_create
 *   POST /exec?action=receiving_submit
 */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  try {
    switch (action) {
      case 'master_sku':
        return successResponse_('Daftar master SKU', { items: getAllMasterSku_() });
      case 'users':
        return successResponse_('Daftar users', { items: getAllUsers_() });
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
        return successResponse_('Receiving terverifikasi, STOCK_IN diproses', receivingSubmit_(payload));
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

/**
 * Response.gs
 * Helper untuk response JSON yang konsisten.
 * Apps Script Web App tidak mendukung custom HTTP status code,
 * sehingga status keberhasilan disampaikan lewat field "success".
 */

function successResponse_(message, data) {
  return jsonOutput_({
    success: true,
    message: message,
    data: data || {}
  });
}

function errorResponse_(message, errorCode) {
  return jsonOutput_({
    success: false,
    message: message,
    error_code: errorCode
  });
}

function jsonOutput_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

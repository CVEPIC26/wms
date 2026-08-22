/**
 * Validation.gs
 * Validasi input request. Melempar Error dengan properti code
 * agar bisa dipetakan ke error_code pada response.
 */

function validationError_(message, code) {
  var err = new Error(message);
  err.code = code;
  return err;
}

function requireString_(value, fieldName) {
  if (value === undefined || value === null || String(value).trim() === '') {
    throw validationError_('Field wajib kosong: ' + fieldName, 'VALIDATION_ERROR');
  }
  return String(value).trim();
}

function optionalString_(value) {
  if (value === undefined || value === null) return '';
  return String(value).trim();
}

function requireNonNegativeInt_(value, fieldName) {
  var num = Number(value);
  if (value === undefined || value === null || value === '' ||
      isNaN(num) || !isFinite(num) || Math.floor(num) !== num || num < 0) {
    throw validationError_(fieldName + ' harus integer >= 0', 'VALIDATION_ERROR');
  }
  return num;
}

function requireArray_(value, fieldName) {
  if (!Array.isArray(value) || value.length === 0) {
    throw validationError_(fieldName + ' harus berupa array berisi minimal 1 item', 'VALIDATION_ERROR');
  }
  return value;
}

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

function requireInt_(value, fieldName) {
  var num = Number(value);
  if (value === undefined || value === null || value === '' ||
      isNaN(num) || !isFinite(num) || Math.floor(num) !== num) {
    throw validationError_(fieldName + ' harus berupa integer', 'VALIDATION_ERROR');
  }
  return num;
}

function requirePositiveInt_(value, fieldName) {
  var num = requireInt_(value, fieldName);
  if (num <= 0) {
    throw validationError_(fieldName + ' harus integer > 0', 'VALIDATION_ERROR');
  }
  return num;
}

function requireValidMovementType_(tipe) {
  var valid = false;
  for (var key in CONFIG.MOVEMENT_TYPE) {
    if (CONFIG.MOVEMENT_TYPE[key] === tipe) { valid = true; break; }
  }
  if (!valid) {
    throw validationError_('Tipe transaksi tidak valid: ' + tipe, 'INVALID_MOVEMENT_TYPE');
  }
  return tipe;
}

function requireValidMovementSource_(source) {
  var valid = false;
  for (var key in CONFIG.MOVEMENT_SOURCE) {
    if (CONFIG.MOVEMENT_SOURCE[key] === source) { valid = true; break; }
  }
  if (!valid) {
    throw validationError_('Source transaksi tidak valid: ' + source, 'INVALID_MOVEMENT_SOURCE');
  }
  return source;
}

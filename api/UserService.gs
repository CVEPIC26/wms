/**
 * UserService.gs
 * Membaca USERS dan verifikasi email pelaksana.
 * Tahap ini tidak memakai login/password — cukup validasi email
 * yang dikirim client terhadap sheet USERS.
 */

function getAllUsers_() {
  var sheet = getSheet_(CONFIG.SHEETS.USERS);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    var email = String(values[i][0]).trim();
    if (email === '') continue;
    result.push({
      email: email,
      nama: String(values[i][1]).trim(),
      peran: String(values[i][2]).trim(),
      status_aktif: String(values[i][3]).trim()
    });
  }
  return result;
}

function findUserByEmail_(email) {
  var all = getAllUsers_();
  var target = String(email).trim().toLowerCase();
  for (var i = 0; i < all.length; i++) {
    if (all[i].email.toLowerCase() === target) return all[i];
  }
  return null;
}

/**
 * Verifikasi user pelaksana: email harus ada di USERS dan aktif.
 */
function requireVerifiedUser_(email) {
  email = requireString_(email, 'user_email');
  var user = findUserByEmail_(email);
  if (!user) {
    throw validationError_('Email tidak terdaftar di USERS: ' + email, 'USER_NOT_FOUND');
  }
  if (user.status_aktif !== CONFIG.AKTIF) {
    throw validationError_('User tidak aktif: ' + email, 'USER_INACTIVE');
  }
  return user;
}

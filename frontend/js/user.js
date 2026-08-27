// Layer current user WMS.
// Mengambil info user dari backend SEKALI saat bootstrap dan menyimpan
// di memory (AppState.currentUser). Backend tetap sumber authorization;
// layer ini hanya untuk tampilan (topbar) — bukan security.

var AppState = {
  currentUser: null,
  userReady: false,
  userError: null
};

var UserService = (function () {
  'use strict';

  /**
   * Ambil current user dari backend berdasarkan APP_CONFIG.USER_EMAIL.
   * Mengembalikan Promise yang resolve dengan user atau menolak error.
   * Hanya dipanggil sekali saat bootstrap.
   */
  function loadCurrentUser() {
    AppState.userReady = false;
    AppState.userError = null;

    if (!APP_CONFIG.USER_EMAIL) {
      AppState.userError = 'USER_EMAIL belum dikonfigurasi di js/config.js';
      AppState.userReady = true;
      return Promise.reject(new Error(AppState.userError));
    }

    return ApiClient.get('user_me', { user_email: APP_CONFIG.USER_EMAIL })
      .then(function (data) {
        AppState.currentUser = {
          email: data.email,
          nama: data.nama,
          peran: data.peran,
          status_aktif: data.status_aktif
        };
        AppState.userReady = true;
        return AppState.currentUser;
      })
      .catch(function (err) {
        AppState.userError = err.message || 'Gagal memuat user.';
        AppState.userReady = true;
        throw err;
      });
  }

  function getDisplayName() {
    var u = AppState.currentUser;
    if (!u) return '-';
    return u.nama || u.email || '-';
  }

  function getRole() {
    var u = AppState.currentUser;
    if (!u || !u.peran) return '-';
    return String(u.peran).toUpperCase();
  }

  function isActive() {
    return !!AppState.currentUser && AppState.currentUser.status_aktif === 'YA';
  }

  return {
    loadCurrentUser: loadCurrentUser,
    getDisplayName: getDisplayName,
    getRole: getRole,
    isActive: isActive
  };
})();

// Konfigurasi frontend WMS.
// Satu-satunya tempat untuk URL backend dan identitas user aktif.
// Jangan menyimpan password/secret/credential di file ini.

var APP_CONFIG = {
  APP_NAME: 'WMS',
  COMPANY: 'CV Edukasi Pratama Insan Cemerlang',

  // URL Web App Google Apps Script (akhiri dengan /exec).
  // Isi dengan URL deployment backend Anda.
  API_BASE_URL: '',

  // Email user aktif. Backend memvalidasi terhadap sheet USERS.
  // Sementara diisi manual; jangan hardcode di file lain.
  USER_EMAIL: ''
};

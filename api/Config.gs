/**
 * Config.gs
 * Konfigurasi nama sheet dan header kolom.
 * Nama sheet dan header HARUS persis sama dengan docs/google-sheets-setup.md.
 * Jangan mengubah struktur sheet atau menambah sheet baru.
 */

var CONFIG = {
  // Isi dengan ID Google Spreadsheet database WMS (dari URL spreadsheet).
  // Kosongkan jika script ini terikat (container-bound) ke spreadsheet.
  SPREADSHEET_ID: '',

  SHEETS: {
    MASTER_SKU: 'MASTER_SKU',
    USERS: 'USERS',
    RECEIVING: 'RECEIVING',
    RECEIVING_DETAIL: 'RECEIVING_DETAIL',
    STOCK: 'STOCK',
    STOCK_MOVEMENT: 'STOCK_MOVEMENT'
  },

  HEADERS: {
    MASTER_SKU: ['sku', 'nama_produk', 'status_aktif'],
    USERS: ['email', 'nama', 'peran', 'status_aktif'],
    RECEIVING: ['receiving_id', 'tanggal', 'supplier', 'nomor_po', 'user_email', 'status', 'created_at'],
    RECEIVING_DETAIL: ['receiving_id', 'sku', 'nama_produk', 'qty_diterima', 'qty_reject', 'qty_diterima_qc', 'alasan_reject', 'catatan'],
    STOCK: ['sku', 'nama_produk', 'qty_stock', 'updated_at'],
    STOCK_MOVEMENT: ['movement_id', 'tanggal', 'sku', 'tipe_transaksi', 'qty', 'source', 'source_id', 'keterangan', 'user_email', 'created_at']
  },

  STATUS: {
    DRAFT: 'DRAFT',
    MENUNGGU_VERIFIKASI: 'MENUNGGU_VERIFIKASI',
    TERVERIFIKASI: 'TERVERIFIKASI'
  },

  MOVEMENT_TYPE: {
    STOCK_IN: 'STOCK_IN'
  },

  MOVEMENT_SOURCE: {
    RECEIVING: 'RECEIVING'
  },

  AKTIF: 'YA'
};

function getSpreadsheet_() {
  if (CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID);
  }
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_(sheetName) {
  var sheet = getSpreadsheet_().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Sheet tidak ditemukan: ' + sheetName);
  }
  return sheet;
}

function nowDatetime_() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm');
}

function todayDate_() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
}

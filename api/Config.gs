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
    STOCK_MOVEMENT: 'STOCK_MOVEMENT',
    STOCK_OPNAME: 'STOCK_OPNAME',
    STOCK_OPNAME_DETAIL: 'STOCK_OPNAME_DETAIL',
    STOCK_ADJUSTMENT: 'STOCK_ADJUSTMENT'
  },

  HEADERS: {
    MASTER_SKU: ['sku', 'nama_produk', 'status_aktif'],
    USERS: ['email', 'nama', 'peran', 'status_aktif'],
    RECEIVING: ['receiving_id', 'tanggal', 'supplier', 'nomor_po', 'user_email', 'status', 'created_at'],
    RECEIVING_DETAIL: ['receiving_id', 'sku', 'nama_produk', 'qty_diterima', 'qty_reject', 'qty_diterima_qc', 'alasan_reject', 'catatan'],
    STOCK: ['sku', 'nama_produk', 'qty_stock', 'updated_at'],
    STOCK_MOVEMENT: ['movement_id', 'tanggal', 'sku', 'tipe_transaksi', 'qty', 'source', 'source_id', 'keterangan', 'user_email', 'created_at'],
    STOCK_OPNAME: ['opname_id', 'tanggal', 'lokasi', 'user_email', 'status', 'created_at'],
    STOCK_OPNAME_DETAIL: ['opname_id', 'sku', 'system_qty', 'physical_qty', 'difference_qty', 'notes'],
    STOCK_ADJUSTMENT: ['adjustment_id', 'tanggal', 'sku', 'nama_produk', 'qty_adjustment', 'alasan', 'user_email', 'status', 'verified_by', 'created_at', 'verified_at']
  },

  STATUS: {
    DRAFT: 'DRAFT',
    MENUNGGU_VERIFIKASI: 'MENUNGGU_VERIFIKASI',
    TERVERIFIKASI: 'TERVERIFIKASI',
    DISETUJUI: 'DISETUJUI'
  },

  MOVEMENT_TYPE: {
    STOCK_IN: 'STOCK_IN',
    STOCK_OUT: 'STOCK_OUT',
    STOCK_ADJUSTMENT: 'STOCK_ADJUSTMENT'
  },

  MOVEMENT_SOURCE: {
    RECEIVING: 'RECEIVING',
    PENYIAPAN: 'PENYIAPAN',
    STOCK_OPNAME: 'STOCK_OPNAME',
    ADJUSTMENT: 'ADJUSTMENT'
  },

  // Peran user dari kolom USERS.peran (existing).
  ROLE: {
    OPERATOR: 'operator',
    ADMIN: 'admin'
  },

  AKTIF: 'YA',

  // Sumber data eksternal PENYIAPAN (bukan sheet database WMS utama).
  // PENYIAPAN_SPREADSHEET_ID dikosongkan jika PENYIAPAN berada di
  // spreadsheet yang sama dengan database WMS.
  // Header di bawah adalah kontrak kolom yang dibaca oleh API —
  // sesuaikan nilainya dengan header aktual sheet PENYIAPAN
  // (nama sheet & header di luar 8 sheet database, tidak diubah oleh WMS).
  PENYIAPAN: {
    SPREADSHEET_ID: '',
    SHEET_NAME: 'PENYIAPAN',
    HEADERS: {
      ID: 'penyiapan_id',   // ID transaksi stabil (bukan nomor baris)
      SKU: 'sku',
      QTY: 'qty',
      STATUS: 'status'      // opsional; kolom ini boleh tidak ada
    },
    // Nilai status yang berarti siap diproses (dibandingkan
    // case-insensitive). Hanya dipakai jika kolom status ada.
    STATUS_SIAP: ['SIAP', 'READY', 'MENUNGGU']
  }
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
    throw new Error('Sheet tidak ditemukan: ' + sheetName +
      '. Pastikan sheet ada di spreadsheet database (lihat docs/deployment-guide.md).');
  }
  return sheet;
}

/**
 * Validasi struktur database: memastikan seluruh sheet yang diperlukan
 * ada dan baris header-nya persis sesuai CONFIG.HEADERS.
 * Melempar error berisi daftar masalah jika ada yang tidak sesuai.
 * READ-ONLY — tidak mengubah data. Dipakai oleh action health_check.
 */
function validateDatabaseStructure_() {
  var problems = [];
  var ss = getSpreadsheet_();

  for (var key in CONFIG.SHEETS) {
    var sheetName = CONFIG.SHEETS[key];
    var expected = CONFIG.HEADERS[key];
    var sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      problems.push('Sheet hilang: ' + sheetName);
      continue;
    }
    if (!expected) continue;

    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    for (var c = 0; c < expected.length; c++) {
      if (String(actual[c]).trim() !== expected[c]) {
        problems.push('Header ' + sheetName + ' kolom ' + (c + 1) +
          ': diharapkan "' + expected[c] + '", ditemukan "' +
          String(actual[c]).trim() + '"');
      }
    }
  }

  return problems;
}

function nowDatetime_() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd HH:mm');
}

function todayDate_() {
  return Utilities.formatDate(new Date(), 'Asia/Jakarta', 'yyyy-MM-dd');
}

/**
 * PenyiapanService.gs
 * READ-ONLY reader untuk spreadsheet eksternal PENYIAPAN.
 *
 * Endpoint: GET ?action=penyiapan
 *
 * Fungsi ini HANYA membaca spreadsheet eksternal (openById,
 * getSheetByName, getDataRange, getValues). Tidak ada operasi tulis
 * (appendRow/setValue/setValues/deleteRow/clear) terhadap sheet
 * PENYIAPAN, dan tidak menyentuh STOCK / STOCK_MOVEMENT.
 *
 * Tipe Modul TIDAK di-map ke SKU pada tahap ini (tetap tipe_modul).
 */

/**
 * Normalisasi tanggal dari sheet menjadi string 'YYYY-MM-DD'.
 * - Jika cell adalah Date object, format sesuai waktu spreadsheet/WMS
 *   (Asia/Jakarta) TANPA menggeser tanggal.
 * - Jika cell berupa string, terima bentuk 'd MMMM yyyy' / 'd MMM yyyy'
 *   dan 'YYYY-MM-DD' (dan varian yang bisa diparse dengan aman).
 * Jika tidak dapat dinormalisasi, dikembalikan sebagai string mentah.
 */
function normalizePenyiapanDate_(value) {
  if (value === undefined || value === null) return '';
  // Date object (kompatibel lintas-realm untuk pengujian via VM).
  if (typeof value === 'object' && typeof value.getTime === 'function') {
    return Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  // "2 Juni 2026" / "02 Juni 2026"  (d MMMM yyyy)
  var s = String(value).trim();
  if (s === '') return '';

  // Sudah YYYY-MM-DD
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) {
    var parts = s.split(/[-/]/).map(function (p) { return Number(p); });
    if (parts.length >= 3 && parts[0] >= 1900 && parts[1] >= 1 && parts[1] <= 12 && parts[2] >= 1 && parts[2] <= 31) {
      return ('0000' + parts[0]).slice(-4) + '-' +
             ('0' + parts[1]).slice(-2) + '-' +
             ('0' + parts[2]).slice(-2);
    }
    return s;
  }

  // "2 Juni 2026" / "02 Juni 2026"  (d MMMM yyyy)
  // Mendukung nama bulan penuh (Indonesia/Inggris) + singkatan.
  var bulan = {
    januari: 1, january: 1, jan: 1,
    februari: 2, february: 2, feb: 2,
    maret: 3, march: 3, mar: 3, mac: 3,
    april: 4, apr: 4,
    mei: 5, may: 5,
    juni: 6, june: 6, jun: 6,
    juli: 7, july: 7, jul: 7,
    agustus: 8, august: 8, agu: 8, aug: 8,
    september: 9, sep: 9, sept: 9,
    oktober: 10, october: 10, okt: 10, oct: 10,
    november: 11, nov: 11,
    desember: 12, december: 12, des: 12, dec: 12
  };
  var m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})$/);
  if (m) {
    var day = Number(m[1]);
    var mon = bulan[String(m[2]).toLowerCase()];
    var yr = Number(m[3]);
    if (mon && day >= 1 && day <= 31 && yr >= 1900) {
      return yr + '-' + ('0' + mon).slice(-2) + '-' + ('0' + day).slice(-2);
    }
  }

  // "Juni 2, 2026" (MMMM d, yyyy)
  var m2 = s.match(/^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m2) {
    var day2 = Number(m2[2]);
    var mon2 = bulan[m2[1].toLowerCase()];
    var yr2 = Number(m2[3]);
    if (mon2 && day2 >= 1 && day2 <= 31 && yr2 >= 1900) {
      return yr2 + '-' + ('0' + mon2).slice(-2) + '-' + ('0' + day2).slice(-2);
    }
  }

  return s; // tidak dikenal → kembalikan mentah
}

/**
 * Konversi cell menjadi angka (kuantitas / total_harga).
 * Mengabaikan angka 0 yang berasal dari sel kosong/teks kosong.
 */
function numberCell_(value) {
  if (value === undefined || value === null) return null;
  if (typeof value === 'number') return value;
  var s = String(value).trim().replace(/\./g, '').replace(/,/, '.');
  if (s === '') return null;
  var n = Number(s);
  return isNaN(n) ? null : n;
}

/**
 * Membuka spreadsheet eksternal PENYIAPAN.
 * Error handler di doGet memetakan pengecualian ke error_code.
 */
function openPenyiapanSpreadsheet_() {
  return SpreadsheetApp.openById(CONFIG.EXTERNAL_SPREADSHEET_ID);
}

/**
 * Membaca seluruh data sheet PENYIAPAN eksternal.
 *
 * 1. Buka spreadsheet eksternal (openById).
 * 2. Ambil sheet PENYIAPAN.
 * 3. Validasi header baris pertama (nama header, bukan posisi).
 * 4. Baca data baris setelah header; kolom kosong dilewati.
 * 5. Normalisasi setiap baris menjadi object JSON.
 * 6. Kembalikan { sheet, total_data, items }.
 *
 * READ-ONLY — tidak mengubah spreadsheet maupun database WMS.
 */
function readPenyiapan_() {
  var ss = openPenyiapanSpreadsheet_();
  var sheet = ss.getSheetByName(CONFIG.EXTERNAL_SHEETS.PENYIAPAN);
  if (!sheet) {
    throw validationError_(
      'Sheet PENYIAPAN tidak ditemukan di spreadsheet eksternal: ' +
      CONFIG.EXTERNAL_SHEETS.PENYIAPAN,
      'PENYIAPAN_SHEET_NOT_FOUND');
  }

  var values = sheet.getDataRange().getValues();
  if (values.length === 0) {
    return { sheet: 'PENYIAPAN', total_data: 0, items: [] };
  }

  // Petakan header aktual → indeks kolom (case-insensitive, trim).
  var headerRow = values[0];
  var expected = CONFIG.EXTERNAL_PENYIAPAN_HEADERS;
  var colIndex = {};
  for (var h = 0; h < headerRow.length; h++) {
    colIndex[String(headerRow[h]).trim().toLowerCase()] = h;
  }

  // Validasi header wajib tersedia.
  var missing = [];
  for (var e = 0; e < expected.length; e++) {
    if (colIndex[expected[e].toLowerCase()] === undefined) {
      missing.push(expected[e]);
    }
  }
  if (missing.length > 0) {
    throw validationError_(
      'Struktur header sheet PENYIAPAN tidak valid. Header yang hilang: ' +
      missing.join(', '),
      'PENYIAPAN_HEADER_INVALID');
  }

  // Konfigurasi field → key JSON.
  var FIELDS = {
    'tanggal': 'tanggal',
    'nomor po': 'nomor_po',
    'outlet': 'outlet',
    'tipe modul': 'tipe_modul',
    'kuantitas': 'kuantitas',
    'total harga (rp)': 'total_harga',
    'helper': 'helper',
    'status': 'status',
    'keterangan': 'keterangan',
    'pengambilan': 'pengambilan'
  };

  var items = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];

    // Lewati baris yang seluruh kolomnya kosong.
    var isEmpty = true;
    for (var c = 0; c < row.length; c++) {
      if (row[c] !== undefined && row[c] !== null && String(row[c]).trim() !== '') {
        isEmpty = false;
        break;
      }
    }
    if (isEmpty) continue;

    var obj = {};
    for (var col in FIELDS) {
      var idx = colIndex[col];
      var raw = idx === undefined ? '' : row[idx];
      var key = FIELDS[col];
      if (col === 'kuantitas' || col === 'total harga (rp)') {
        var n = numberCell_(raw);
        obj[key] = (n === null) ? '' : n;
      } else if (col === 'tanggal') {
        obj[key] = normalizePenyiapanDate_(raw);
      } else {
        obj[key] = (raw === undefined || raw === null) ? '' : String(raw).trim();
      }
    }
    items.push(obj);
  }

  return {
    sheet: 'PENYIAPAN',
    total_data: items.length,
    items: items
  };
}
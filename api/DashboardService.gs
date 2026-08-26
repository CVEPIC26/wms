/**
 * DashboardService.gs
 * Data layer READ-ONLY untuk dashboard WMS.
 *
 * Prinsip:
 * - Hanya MEMBACA sheet dan menghitung agregasi di memory.
 * - TIDAK ada setValue/appendRow/deleteRow — tidak mengubah STOCK,
 *   STOCK_MOVEMENT, RECEIVING, OPNAME, ADJUSTMENT, atau sheet lain.
 * - Seluruh pembacaan memakai getDataRange().getValues() satu kali per
 *   sheet (tanpa getRange di dalam loop).
 * - Timezone Asia/Jakarta via helper existing (todayDate_).
 * - Tidak mengarang nilai: stock_value=null (MASTER_SKU belum punya
 *   harga), stock_low=null (belum ada konfigurasi minimum stock).
 */

var DASHBOARD_RECENT_DEFAULT_LIMIT = 20;
var DASHBOARD_RECENT_MAX_LIMIT = 100;

/**
 * Membaca seluruh baris sebuah sheet sebagai array objek berdasarkan
 * daftar nama kolom (satu kali getDataRange). Mengembalikan array.
 */
function dashboardReadSheet_(sheetName, columns) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === '') continue;
    var row = {};
    for (var c = 0; c < columns.length; c++) {
      row[columns[c]] = values[i][c];
    }
    result.push(row);
  }
  return result;
}

/**
 * Agregasi jumlah baris per status untuk sebuah sheet transaksi.
 */
function dashboardCountByStatus_(sheetName, statusColumnIndex) {
  var sheet = getSheet_(sheetName);
  var values = sheet.getDataRange().getValues();
  var counts = {};
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][0]).trim() === '') continue;
    var status = String(values[i][statusColumnIndex]).trim();
    counts[status] = (counts[status] || 0) + 1;
  }
  return counts;
}

/**
 * A. Ringkasan utama dashboard.
 */
function getDashboardSummary_() {
  var today = todayDate_();

  // Master SKU & stok.
  var masterSku = dashboardReadSheet_(CONFIG.SHEETS.MASTER_SKU, ['sku', 'nama_produk', 'status_aktif']);
  var stocks = dashboardReadSheet_(CONFIG.SHEETS.STOCK, ['sku', 'nama_produk', 'qty_stock', 'updated_at']);

  var totalSku = 0;
  var skuAktif = 0;
  var skuNonaktif = 0;
  for (var i = 0; i < masterSku.length; i++) {
    totalSku++;
    if (String(masterSku[i].status_aktif).trim() === CONFIG.AKTIF) skuAktif++;
    else skuNonaktif++;
  }

  var totalStockQty = 0;
  var skuStockZero = 0;
  for (var s = 0; s < stocks.length; s++) {
    var qty = Number(stocks[s].qty_stock) || 0;
    totalStockQty += qty;
    if (qty === 0) skuStockZero++;
  }

  // Pending per modul.
  var receivingCounts = dashboardCountByStatus_(CONFIG.SHEETS.RECEIVING, 5);
  var opnameCounts = dashboardCountByStatus_(CONFIG.SHEETS.STOCK_OPNAME, 4);
  var adjustmentCounts = dashboardCountByStatus_(CONFIG.SHEETS.STOCK_ADJUSTMENT, 7);

  // Movement hari ini.
  var movementToday = getDashboardMovementSummary_(today, today);

  return {
    total_sku: totalSku,
    sku_aktif: skuAktif,
    sku_nonaktif: skuNonaktif,
    total_stock_qty: totalStockQty,
    total_stock_value: null, // MASTER_SKU belum memiliki harga
    sku_stock_zero: skuStockZero,
    sku_stock_low: null,     // belum ada konfigurasi minimum stock
    receiving_pending: (receivingCounts[CONFIG.STATUS.DRAFT] || 0) +
      (receivingCounts[CONFIG.STATUS.MENUNGGU_VERIFIKASI] || 0),
    opname_pending: (opnameCounts[CONFIG.STATUS.DRAFT] || 0) +
      (opnameCounts[CONFIG.STATUS.MENUNGGU_VERIFIKASI] || 0),
    adjustment_pending: (adjustmentCounts[CONFIG.STATUS.DRAFT] || 0) +
      (adjustmentCounts[CONFIG.STATUS.MENUNGGU_VERIFIKASI] || 0),
    stock_in_today: movementToday.stock_in_qty,
    stock_out_today: movementToday.stock_out_qty,
    adjustment_today: movementToday.net_adjustment_qty
  };
}

/**
 * B. Ringkasan stok per SKU.
 * MASTER_SKU belum memiliki kategori/harga, sehingga pengelompokan
 * berdasarkan SKU. stock_low = null (belum ada konfigurasi minimum).
 */
function getDashboardStockSummary_() {
  var stocks = dashboardReadSheet_(CONFIG.SHEETS.STOCK, ['sku', 'nama_produk', 'qty_stock', 'updated_at']);
  var result = [];
  var stockZero = 0;
  for (var i = 0; i < stocks.length; i++) {
    var qty = Number(stocks[i].qty_stock) || 0;
    if (qty === 0) stockZero++;
    result.push({
      sku: String(stocks[i].sku).trim(),
      nama_produk: String(stocks[i].nama_produk).trim(),
      qty_stock: qty
    });
  }
  return {
    items: result,
    stock_zero: stockZero,
    stock_low: null // belum ada konfigurasi minimum stock
  };
}

/**
 * C. Ringkasan movement dalam rentang tanggal (inklusif, YYYY-MM-DD).
 * Adjustment dipisah positif/negatif.
 */
function getDashboardMovementSummary_(tanggalMulai, tanggalAkhir) {
  var start = tanggalMulai || todayDate_();
  var end = tanggalAkhir || start;
  var movements = dashboardReadSheet_(CONFIG.SHEETS.STOCK_MOVEMENT,
    ['movement_id', 'tanggal', 'sku', 'tipe_transaksi', 'qty', 'source', 'source_id', 'keterangan', 'user_email', 'created_at']);

  var stockIn = 0;
  var stockOut = 0;
  var adjIn = 0;
  var adjOut = 0;

  for (var i = 0; i < movements.length; i++) {
    var tanggal = dashboardNormalizeDate_(movements[i].tanggal);
    if (tanggal < start || tanggal > end) continue;
    var tipe = String(movements[i].tipe_transaksi).trim();
    var qty = Number(movements[i].qty) || 0;

    if (tipe === CONFIG.MOVEMENT_TYPE.STOCK_IN) {
      stockIn += qty;
    } else if (tipe === CONFIG.MOVEMENT_TYPE.STOCK_OUT) {
      stockOut += qty;
    } else if (tipe === CONFIG.MOVEMENT_TYPE.STOCK_ADJUSTMENT) {
      if (qty >= 0) adjIn += qty;
      else adjOut += Math.abs(qty);
    }
  }

  return {
    tanggal_mulai: start,
    tanggal_akhir: end,
    stock_in_qty: stockIn,
    stock_out_qty: stockOut,
    adjustment_in_qty: adjIn,
    adjustment_out_qty: adjOut,
    net_adjustment_qty: adjIn - adjOut
  };
}

/**
 * Normalisasi nilai tanggal dari sheet menjadi string YYYY-MM-DD agar
 * dapat dibandingkan secara leksikografis.
 */
function dashboardNormalizeDate_(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, 'Asia/Jakarta', 'yyyy-MM-dd');
  }
  return String(value).trim().substring(0, 10);
}

/**
 * D. Movement terbaru. Default 20, maksimum 100.
 */
function getRecentStockMovements_(limit) {
  var n = Number(limit);
  if (isNaN(n) || !isFinite(n) || n <= 0) n = DASHBOARD_RECENT_DEFAULT_LIMIT;
  if (n > DASHBOARD_RECENT_MAX_LIMIT) n = DASHBOARD_RECENT_MAX_LIMIT;
  n = Math.floor(n);

  var sheet = getSheet_(CONFIG.SHEETS.STOCK_MOVEMENT);
  var values = sheet.getDataRange().getValues();

  // Peta nama produk untuk melengkapi movement.
  var masterSku = dashboardReadSheet_(CONFIG.SHEETS.MASTER_SKU, ['sku', 'nama_produk', 'status_aktif']);
  var namaBySku = {};
  for (var m = 0; m < masterSku.length; m++) {
    namaBySku[String(masterSku[m].sku).trim()] = String(masterSku[m].nama_produk).trim();
  }

  var result = [];
  // Iterasi dari baris paling bawah (terbaru) ke atas, tanpa mengubah data.
  for (var i = values.length - 1; i >= 1 && result.length < n; i--) {
    var sku = String(values[i][2]).trim();
    result.push({
      movement_id: String(values[i][0]).trim(),
      tanggal: dashboardNormalizeDate_(values[i][1]),
      sku: sku,
      nama_produk: namaBySku[sku] || '',
      tipe_transaksi: String(values[i][3]).trim(),
      qty: Number(values[i][4]) || 0,
      source: String(values[i][5]).trim(),
      source_id: String(values[i][6]).trim(),
      keterangan: String(values[i][7]).trim(),
      user_email: String(values[i][8]).trim(),
      created_at: values[i][9]
    });
  }
  return result;
}

/**
 * E. Ringkasan receiving per status.
 */
function getDashboardReceivingSummary_() {
  var counts = dashboardCountByStatus_(CONFIG.SHEETS.RECEIVING, 5);
  return {
    DRAFT: counts[CONFIG.STATUS.DRAFT] || 0,
    MENUNGGU_VERIFIKASI: counts[CONFIG.STATUS.MENUNGGU_VERIFIKASI] || 0,
    TERVERIFIKASI: counts[CONFIG.STATUS.TERVERIFIKASI] || 0
  };
}

/**
 * F. Ringkasan opname per status.
 */
function getDashboardOpnameSummary_() {
  var counts = dashboardCountByStatus_(CONFIG.SHEETS.STOCK_OPNAME, 4);
  return {
    DRAFT: counts[CONFIG.STATUS.DRAFT] || 0,
    MENUNGGU_VERIFIKASI: counts[CONFIG.STATUS.MENUNGGU_VERIFIKASI] || 0,
    DISETUJUI: counts[CONFIG.STATUS.DISETUJUI] || 0
  };
}

/**
 * G. Ringkasan adjustment per status.
 */
function getDashboardAdjustmentSummary_() {
  var counts = dashboardCountByStatus_(CONFIG.SHEETS.STOCK_ADJUSTMENT, 7);
  return {
    DRAFT: counts[CONFIG.STATUS.DRAFT] || 0,
    MENUNGGU_VERIFIKASI: counts[CONFIG.STATUS.MENUNGGU_VERIFIKASI] || 0,
    DISETUJUI: counts[CONFIG.STATUS.DISETUJUI] || 0
  };
}

/**
 * Agregator endpoint dashboard_summary.
 * Jika salah satu bagian gagal, error dilempar agar endpoint mengembalikan
 * errorResponse_ (bukan angka palsu).
 */
function getDashboardData_() {
  return {
    summary: getDashboardSummary_(),
    stock_summary: getDashboardStockSummary_(),
    movement_summary: getDashboardMovementSummary_(null, null),
    recent_movements: getRecentStockMovements_(DASHBOARD_RECENT_DEFAULT_LIMIT),
    receiving_summary: getDashboardReceivingSummary_(),
    opname_summary: getDashboardOpnameSummary_(),
    adjustment_summary: getDashboardAdjustmentSummary_()
  };
}

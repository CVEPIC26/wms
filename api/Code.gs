/**
 * Code.gs
 * Entry point Web App Apps Script.
 * Routing sederhana via parameter ?action=...
 *
 * Endpoint yang tersedia (tahap RECEIVING + QC + STOCK IN + STOCK CORE):
 *   GET  /exec?action=master_sku
 *   GET  /exec?action=users
 *   GET  /exec?action=user_me&user_email=...  (info current user)
 *   GET  /exec?action=stock_get&sku=...    (saldo satu SKU)
 *   GET  /exec?action=stock_list           (seluruh saldo STOCK)
 *   GET  /exec?action=stock_card&sku=...   (kartu stok / histori movement SKU)
 *   GET  /exec?action=preparation_list     (transaksi PENYIAPAN siap diproses)
 *   GET  /exec?action=opname_sku&opname_id=...&sku=...  (lookup SKU untuk scan)
 *   GET  /exec?action=opname_get&opname_id=...          (header + detail opname)
 *   GET  /exec?action=opname_list                       (daftar opname)
 *   GET  /exec?action=receiving_list                    (daftar receiving)
 *   GET  /exec?action=receiving_get&receiving_id=...    (header + detail receiving)
 *   GET  /exec?action=adjustment_get&adjustment_id=...  (satu adjustment + audit)
 *   GET  /exec?action=adjustment_list                   (daftar adjustment)
 *   GET  /exec?action=dashboard_summary&user_email=...  (agregasi dashboard, READ-ONLY)
 *   POST /exec?action=receiving_create  (buat DRAFT)
 *   POST /exec?action=receiving_submit  (DRAFT → MENUNGGU_VERIFIKASI)
 *   POST /exec?action=receiving_verify  (MENUNGGU_VERIFIKASI → TERVERIFIKASI + STOCK_IN)
 *   POST /exec?action=stockout_process  (satu transaksi PENYIAPAN → STOCK_OUT)
 *   POST /exec?action=stockout_batch    (seluruh PENYIAPAN siap → STOCK_OUT)
 *   POST /exec?action=opname_create     (buat opname DRAFT)
 *   POST /exec?action=opname_add_detail (tambah detail, snapshot system_qty)
 *   POST /exec?action=opname_submit     (DRAFT → MENUNGGU_VERIFIKASI)
 *   POST /exec?action=opname_verify     (MENUNGGU_VERIFIKASI → DISETUJUI + ADJUSTMENT)
 *   POST /exec?action=adjustment_create (buat adjustment DRAFT)
 *   POST /exec?action=adjustment_submit (DRAFT → MENUNGGU_VERIFIKASI)
 *   POST /exec?action=adjustment_verify (MENUNGGU_VERIFIKASI → DISETUJUI + ADJUSTMENT)
 */

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  try {
    switch (action) {
      case 'master_sku':
        return successResponse_('Daftar master SKU', { items: getAllMasterSku_() });
      case 'users':
        return successResponse_('Daftar users', { items: getAllUsers_() });
      case 'user_me': {
        var me = requireVerifiedUser_(e.parameter.user_email);
        return successResponse_('User aktif', {
          email: me.email,
          nama: me.nama,
          peran: me.peran,
          status_aktif: me.status_aktif
        });
      }
      case 'stock_get': {
        var skuGet = requireString_(e.parameter.sku, 'sku');
        var stock = getStockBySku_(skuGet);
        if (!stock) {
          return errorResponse_('Stok untuk SKU tidak ditemukan: ' + skuGet, 'STOCK_NOT_FOUND');
        }
        return successResponse_('Saldo stok ' + skuGet, {
          sku: stock.sku,
          nama_produk: stock.nama_produk,
          qty_stock: stock.qty_stock,
          updated_at: stock.updated_at
        });
      }
      case 'stock_list':
        return successResponse_('Daftar saldo stok', { items: getAllStock_() });
      case 'stock_card': {
        var skuCard = requireString_(e.parameter.sku, 'sku');
        return successResponse_('Kartu stok ' + skuCard, {
          sku: skuCard,
          items: getStockCard_(skuCard)
        });
      }
      case 'preparation_list':
        return successResponse_('Transaksi PENYIAPAN siap diproses', {
          items: getPreparationData_()
        });
      case 'opname_sku':
        return successResponse_('Lookup SKU opname',
          opnameSkuLookup_(e.parameter.opname_id, e.parameter.sku));
      case 'opname_get':
        return successResponse_('Detail opname', opnameGet_(e.parameter.opname_id));
      case 'opname_list':
        return successResponse_('Daftar opname', { items: opnameList_() });
      case 'receiving_list':
        return successResponse_('Daftar receiving', { items: receivingList_() });
      case 'receiving_get':
        return successResponse_('Detail receiving', receivingGet_(e.parameter.receiving_id));
      case 'adjustment_get':
        return successResponse_('Detail adjustment', adjustmentGet_(e.parameter.adjustment_id));
      case 'adjustment_list':
        return successResponse_('Daftar adjustment', { items: adjustmentList_() });
      case 'dashboard_summary':
        requireVerifiedUser_(e.parameter.user_email);
        return successResponse_('Ringkasan dashboard', getDashboardData_());
      default:
        return errorResponse_('Action tidak dikenal: ' + action, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    Logger.log('doGet error [' + action + ']: ' + err.message);
    return errorResponse_(err.message, err.code || 'INTERNAL_ERROR');
  }
}

function doPost(e) {
  var action = (e && e.parameter && e.parameter.action) || '';
  try {
    var payload = parsePostBody_(e);
    switch (action) {
      case 'receiving_create':
        return successResponse_('Receiving dibuat (DRAFT)', receivingCreate_(payload));
      case 'receiving_submit':
        return successResponse_('Receiving disubmit, menunggu verifikasi', receivingSubmit_(payload));
      case 'receiving_verify':
        return successResponse_('Receiving terverifikasi, STOCK_IN diproses', receivingVerify_(payload));
      case 'stockout_process':
        return successResponse_('STOCK_OUT penyiapan diproses',
          processPreparationStockOut_(payload.penyiapan_id, payload.user_email));
      case 'stockout_batch':
        return successResponse_('Batch STOCK_OUT penyiapan diproses',
          processPreparationBatch_(payload.user_email));
      case 'opname_create':
        return successResponse_('Opname dibuat (DRAFT)', opnameCreate_(payload));
      case 'opname_add_detail':
        return successResponse_('Detail opname ditambahkan', opnameAddDetail_(payload));
      case 'opname_submit':
        return successResponse_('Opname disubmit, menunggu verifikasi', opnameSubmit_(payload));
      case 'opname_verify':
        return successResponse_('Opname diverifikasi, adjustment diproses', opnameVerify_(payload));
      case 'adjustment_create':
        return successResponse_('Adjustment dibuat (DRAFT)', adjustmentCreate_(payload));
      case 'adjustment_submit':
        return successResponse_('Adjustment disubmit, menunggu verifikasi', adjustmentSubmit_(payload));
      case 'adjustment_verify':
        return successResponse_('Adjustment diverifikasi, stok disesuaikan', adjustmentVerify_(payload));
      default:
        return errorResponse_('Action tidak dikenal: ' + action, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    Logger.log('doPost error [' + action + ']: ' + err.message);
    return errorResponse_(err.message, err.code || 'INTERNAL_ERROR');
  }
}

function parsePostBody_(e) {
  if (!e || !e.postBody || !e.postBody.contents) {
    throw validationError_('Body request kosong', 'VALIDATION_ERROR');
  }
  try {
    return JSON.parse(e.postBody.contents);
  } catch (err) {
    throw validationError_('Body request bukan JSON valid', 'VALIDATION_ERROR');
  }
}

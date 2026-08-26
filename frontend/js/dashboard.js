// Halaman Dashboard: memanggil dashboard_summary SATU kali lalu
// merender seluruh komponen dari response yang sama.

var DashboardPage = (function () {
  'use strict';

  function renderCards(summary) {
    var cards = [
      { label: 'Total SKU', value: summary.total_sku },
      { label: 'Total Stock', value: summary.total_stock_qty },
      { label: 'SKU Stock 0', value: summary.sku_stock_zero },
      { label: 'Receiving Pending', value: summary.receiving_pending },
      { label: 'Opname Pending', value: summary.opname_pending },
      { label: 'Adjustment Pending', value: summary.adjustment_pending }
    ];
    var html = '';
    cards.forEach(function (card) {
      html += '<div class="card">' +
        '<div class="card-label">' + Ui.escapeHtml(card.label) + '</div>' +
        '<div class="card-value">' + Ui.formatNumber(card.value) + '</div>' +
        '</div>';
    });
    document.getElementById('dashboard-cards').innerHTML = html;
  }

  function renderStockSummary(stockSummary) {
    var container = document.getElementById('dashboard-stock');
    Ui.renderTable(container, [
      { key: 'sku', label: 'SKU' },
      { key: 'nama_produk', label: 'Nama Produk' },
      { key: 'qty_stock', label: 'Qty Stock', numeric: true, format: Ui.formatNumber }
    ], stockSummary.items);
  }

  function renderRecentMovements(movements) {
    var container = document.getElementById('dashboard-movements');
    Ui.renderTable(container, [
      { key: 'tanggal', label: 'Tanggal' },
      { key: 'sku', label: 'SKU' },
      { key: 'nama_produk', label: 'Produk' },
      { key: 'tipe_transaksi', label: 'Tipe' },
      { key: 'qty', label: 'Qty', numeric: true, format: Ui.formatNumber },
      { key: 'source', label: 'Source' },
      { key: 'keterangan', label: 'Keterangan' }
    ], movements);
  }

  function setAllState(type, message) {
    ['dashboard-cards', 'dashboard-stock', 'dashboard-movements'].forEach(function (id) {
      var el = document.getElementById(id);
      if (type === 'loading') Ui.showLoading(el, message);
      else if (type === 'error') Ui.showError(el, message);
    });
  }

  function render() {
    var root = document.getElementById('page-dashboard');
    if (!root) return;

    setAllState('loading', 'Memuat dashboard...');

    ApiClient.get('dashboard_summary', { user_email: APP_CONFIG.USER_EMAIL })
      .then(function (data) {
        renderCards(data.summary || {});
        renderStockSummary(data.stock_summary || { items: [] });
        renderRecentMovements(data.recent_movements || []);
      })
      .catch(function (err) {
        console.error('Dashboard error:', err);
        setAllState('error', 'Tidak dapat memuat dashboard. ' + (err.message || ''));
      });
  }

  return { render: render };
})();

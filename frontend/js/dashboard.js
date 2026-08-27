// Halaman Home/Dashboard: memanggil dashboard_summary SATU kali lalu
// merender seluruh komponen dari response yang sama. Tidak ada data palsu —
// setiap angka bersumber dari backend.

var DashboardPage = (function () {
  'use strict';

  function summaryCards(summary) {
    // Hanya menampilkan kartu yang datanya relevan dan berasal dari backend.
    // sku_stock_low tidak dipakai karena backend mengembalikan null
    // (tidak ada threshold) — jangan membuat klaim "stok menipis".
    return [
      { label: 'Total Stock', value: summary.total_stock_qty, sub: summary.total_sku + ' SKU' },
      { label: 'Receiving Menunggu', value: summary.receiving_pending, sub: 'perlu tindakan' },
      { label: 'Opname Menunggu', value: summary.opname_pending, sub: 'perlu tindakan' },
      { label: 'Adjustment Menunggu', value: summary.adjustment_pending, sub: 'perlu tindakan' },
      { label: 'SKU Stock 0', value: summary.sku_stock_zero, sub: 'stok kosong' }
    ];
  }

  function renderCards(summary) {
    var container = document.getElementById('dashboard-cards');
    var cards = summaryCards(summary);
    var html = '';
    cards.forEach(function (card) {
      html += '<div class="card">' +
        '<div class="card-label">' + Ui.escapeHtml(card.label) + '</div>' +
        '<div class="card-value">' + Ui.formatNumber(card.value) + '</div>' +
        (card.sub ? '<div class="card-sub">' + Ui.escapeHtml(card.sub) + '</div>' : '') +
        '</div>';
    });
    container.innerHTML = html;
  }

  var QUICK_ACTIONS = [
    { href: '#/receiving', ico: '\u21b5', label: '+ Receiving', sub: 'Barang masuk' },
    { href: '#/opname', ico: '\u2713', label: 'Stock Opname', sub: 'Hitung stok' },
    { href: '#/loading', ico: '\u27a4', label: 'Penyiapan', sub: 'Stock out' },
    { href: '#/adjustment', ico: '\u21c5', label: 'Adjustment', sub: 'Koreksi stok' }
  ];

  function renderQuickActions() {
    var container = document.getElementById('dashboard-quick');
    var html = '';
    QUICK_ACTIONS.forEach(function (qa) {
      html += '<a class="qa-btn" href="' + Ui.escapeHtml(qa.href) + '">' +
        '<span class="qa-ico">' + qa.ico + '</span>' +
        '<span>' + Ui.escapeHtml(qa.label) + '</span>' +
        '<span class="qa-sub">' + Ui.escapeHtml(qa.sub) + '</span>' +
        '</a>';
    });
    container.innerHTML = html;
  }

  function typeBadge(tipe) {
    var cls = 'badge';
    if (tipe === 'STOCK_IN') cls += ' badge-in';
    else if (tipe === 'STOCK_OUT') cls += ' badge-out';
    else if (tipe === 'STOCK_ADJUSTMENT') cls += ' badge-adj';
    return '<span class="' + cls + '">' + Ui.escapeHtml(tipe) + '</span>';
  }

  function qtyDisplay(m) {
    var qty = Number(m.qty) || 0;
    if (m.tipe_transaksi === 'STOCK_OUT') return '-' + Ui.formatNumber(Math.abs(qty));
    if (m.tipe_transaksi === 'STOCK_IN') return '+' + Ui.formatNumber(Math.abs(qty));
    return Ui.formatNumber(qty);
  }

  function renderRecentActivity(movements) {
    var container = document.getElementById('dashboard-activity');
    if (!movements || movements.length === 0) {
      Ui.showEmpty(container, 'Belum ada aktivitas.');
      return;
    }
    // Tampilkan maks. 8 aktivitas terbaru dalam bentuk list yang mudah dibaca.
    var list = movements.slice(0, 8);
    var html = '<ul class="activity-list">';
    list.forEach(function (m) {
      html += '<li>' +
        '<span class="act-badge">' + typeBadge(m.tipe_transaksi) + '</span>' +
        '<span class="act-main">' +
          '<span class="act-title">' + Ui.escapeHtml(m.sku || m.source_id || '-') + '</span>' +
          '<span class="act-meta">' + Ui.escapeHtml(Ui.displayValue(m.nama_produk)) + ' · ' +
            Ui.escapeHtml(Ui.displayValue(m.tanggal)) + ' · ' +
            Ui.escapeHtml(Ui.displayValue(m.keterangan)) + '</span>' +
        '</span>' +
        '<span class="act-qty">' + qtyDisplay(m) + '</span>' +
        '</li>';
    });
    html += '</ul>';
    container.innerHTML = html;
  }

  function renderDashboardShell() {
    var root = document.getElementById('page-dashboard');
    root.innerHTML =
      '<div class="welcome">' +
      '  <div>' +
      '    <h1>Selamat datang, ' + Ui.escapeHtml(UserService.getDisplayName()) + '</h1>' +
      '    <div class="welcome-date">Ringkasan kondisi gudang Anda hari ini</div>' +
      '  </div>' +
      '</div>' +
      '<div id="dashboard-cards" class="cards"></div>' +
      '<h2 class="section-title">Aksi Cepat</h2>' +
      '<div id="dashboard-quick" class="quick-actions"></div>' +
      '<div class="section"><h2>Perkembangan Stok</h2><div id="dashboard-stock"></div></div>' +
      '<div class="section"><h2>Aktivitas Terbaru</h2><div id="dashboard-activity"></div></div>';
  }

  function render() {
    var root = document.getElementById('page-dashboard');
    if (!root) return;

    renderDashboardShell();
    renderQuickActions();

    // Loading state pada ketiga area data.
    Ui.showLoading(document.getElementById('dashboard-cards'), 'Memuat ringkasan...');
    Ui.showLoading(document.getElementById('dashboard-stock'), 'Memuat stok...');
    Ui.showLoading(document.getElementById('dashboard-activity'), 'Memuat aktivitas...');

    ApiClient.get('dashboard_summary', { user_email: APP_CONFIG.USER_EMAIL })
      .then(function (data) {
        renderCards(data.summary || {});
        renderStockSummary(data.stock_summary || { items: [] });
        renderRecentActivity(data.recent_movements || []);
      })
      .catch(function (err) {
        console.error('Dashboard error:', err);
        Ui.showError(document.getElementById('dashboard-cards'), 'Tidak dapat memuat ringkasan.');
        Ui.showError(document.getElementById('dashboard-stock'), 'Tidak dapat memuat stok.');
        Ui.showError(document.getElementById('dashboard-activity'), 'Tidak dapat memuat aktivitas. ' + (err.message || ''));
      });
  }

  function renderStockSummary(stockSummary) {
    var container = document.getElementById('dashboard-stock');
    var items = stockSummary.items || [];
    if (items.length === 0) {
      Ui.showEmpty(container, 'Belum ada data stok.');
      return;
    }
    Ui.renderTable(container, [
      { key: 'sku', label: 'SKU' },
      { key: 'nama_produk', label: 'Nama Produk' },
      { key: 'qty_stock', label: 'Qty Stock', numeric: true, format: Ui.formatNumber }
    ], items.slice(0, 8));
  }

  return { render: render };
})();

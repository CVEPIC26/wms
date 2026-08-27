// Halaman Stock (READ-ONLY): daftar stok + kartu stok.
// Frontend tidak mengubah stok dan tidak menghitung saldo — seluruh
// perubahan stok hanya melalui modul transaksi backend.

var StockPage = (function () {
  'use strict';

  var allStocks = [];   // dataset lengkap dari stock_list
  var searchText = '';
  var sortKey = 'sku';
  var sortAsc = true;

  /* ---------------- Helpers ---------------- */

  function stockZeroClass(qty) {
    return (Number(qty) === 0) ? ' stock-zero' : '';
  }

  function typeBadge(tipe) {
    var cls = 'badge';
    if (tipe === 'STOCK_IN') cls += ' badge-in';
    else if (tipe === 'STOCK_OUT') cls += ' badge-out';
    else if (tipe === 'STOCK_ADJUSTMENT') cls += ' badge-adj';
    return '<span class="' + cls + '">' + Ui.escapeHtml(tipe) + '</span>';
  }

  // Tampilan qty: pertahankan nilai API. STOCK_IN positif; STOCK_OUT
  // diberi tanda negatif secara visual; ADJUSTMENT memakai tanda API.
  function qtyDisplay(row) {
    var qty = Number(row.qty) || 0;
    if (row.tipe_transaksi === 'STOCK_OUT') return '-' + Ui.formatNumber(Math.abs(qty));
    if (row.tipe_transaksi === 'STOCK_IN') return '+' + Ui.formatNumber(Math.abs(qty));
    return Ui.formatNumber(qty); // STOCK_ADJUSTMENT: tanda dari API
  }

  /* ---------------- LIST ---------------- */

  function renderList() {
    var root = document.getElementById('page-stock');
    root.innerHTML =
      '<h1>Stock</h1>' +
      '<div class="toolbar">' +
      '  <input type="text" id="stock-search" class="search-input" placeholder="Cari SKU / Nama Produk...">' +
      '  <button class="btn btn-secondary" id="btn-refresh-stock">Refresh</button>' +
      '</div>' +
      '<div class="section"><div id="stock-list"></div></div>';

    document.getElementById('btn-refresh-stock').addEventListener('click', loadList);
    document.getElementById('stock-search').addEventListener('input', function (ev) {
      searchText = ev.target.value.toLowerCase();
      renderTableList(); // filter di frontend, tanpa API request
    });

    loadList();
  }

  function loadList() {
    var container = document.getElementById('stock-list');
    Ui.showLoading(container, 'Memuat stok...');

    ApiClient.get('stock_list')
      .then(function (data) {
        allStocks = data.items || [];
        renderTableList();
      })
      .catch(function (err) {
        console.error('stock_list error:', err);
        Ui.showError(container, 'Tidak dapat memuat stok. ' + (err.message || ''));
      });
  }

  function renderTableList() {
    var container = document.getElementById('stock-list');

    var rows = allStocks.filter(function (s) {
      if (!searchText) return true;
      return String(s.sku).toLowerCase().indexOf(searchText) !== -1 ||
        String(s.nama_produk).toLowerCase().indexOf(searchText) !== -1;
    });

    rows.sort(function (a, b) {
      var va = a[sortKey];
      var vb = b[sortKey];
      if (sortKey === 'qty_stock') {
        va = Number(va) || 0;
        vb = Number(vb) || 0;
        return sortAsc ? va - vb : vb - va;
      }
      va = String(va).toLowerCase();
      vb = String(vb).toLowerCase();
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });

    if (rows.length === 0) {
      Ui.showEmpty(container, 'Belum ada data stok.');
      return;
    }

    var sortMark = function (key) {
      if (sortKey !== key) return '';
      return sortAsc ? ' ▲' : ' ▼';
    };

    var html = '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th class="sortable" data-key="sku">SKU' + sortMark('sku') + '</th>' +
      '<th class="sortable" data-key="nama_produk">Nama Produk' + sortMark('nama_produk') + '</th>' +
      '<th class="sortable num" data-key="qty_stock">Qty Stock' + sortMark('qty_stock') + '</th>' +
      '<th>Updated At</th>' +
      '<th>Action</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function (s) {
      html += '<tr class="stock-row' + stockZeroClass(s.qty_stock) + '">' +
        '<td>' + Ui.escapeHtml(s.sku) + '</td>' +
        '<td>' + Ui.escapeHtml(Ui.displayValue(s.nama_produk)) + '</td>' +
        '<td class="num">' + Ui.formatNumber(s.qty_stock) + '</td>' +
        '<td>' + Ui.escapeHtml(Ui.displayValue(s.updated_at)) + '</td>' +
        '<td><a href="#/stock/' + Ui.escapeHtml(encodeURIComponent(s.sku)) + '">Lihat Kartu Stok</a></td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelectorAll('.sortable').forEach(function (th) {
      th.addEventListener('click', function () {
        var key = th.dataset.key;
        if (sortKey === key) sortAsc = !sortAsc;
        else { sortKey = key; sortAsc = true; }
        renderTableList();
      });
    });
  }

  /* ---------------- DETAIL / KARTU STOK ---------------- */

  function renderDetail(skuParam) {
    var sku = decodeURIComponent(skuParam);
    var root = document.getElementById('page-stock');
    root.innerHTML =
      '<h1>Kartu Stok</h1>' +
      '<div class="toolbar">' +
      '  <a href="#/stock">&larr; Kembali ke Stock</a>' +
      '  <button class="btn btn-secondary" id="btn-refresh-detail">Refresh</button>' +
      '</div>' +
      '<div id="stock-detail"><div class="state">Memuat kartu stok...</div></div>';

    document.getElementById('btn-refresh-detail').addEventListener('click', function () {
      renderDetail(skuParam);
    });

    loadDetail(sku);
  }

  function loadDetail(sku) {
    var container = document.getElementById('stock-detail');

    // Maksimal 2 request: stock_get + stock_card.
    var stockReq = ApiClient.get('stock_get', { sku: sku });
    var cardReq = ApiClient.get('stock_card', { sku: sku });

    stockReq.then(function (stock) {
      cardReq.then(function (card) {
        renderDetailContent(container, stock, card.items || []);
      }).catch(function (err) {
        console.error('stock_card error:', err);
        Ui.showError(container, 'Tidak dapat memuat kartu stok. ' + (err.message || ''));
      });
    }).catch(function (err) {
      console.error('stock_get error:', err);
      Ui.showError(container, 'Tidak dapat memuat kartu stok. ' + (err.message || ''));
    });
  }

  function renderDetailContent(container, stock, movements) {
    var html =
      '<div class="section">' +
      '  <div class="detail-grid">' +
      '    <div><span class="detail-label">SKU</span><br><b>' + Ui.escapeHtml(stock.sku) + '</b></div>' +
      '    <div><span class="detail-label">Nama Produk</span><br>' + Ui.escapeHtml(Ui.displayValue(stock.nama_produk)) + '</div>' +
      '    <div><span class="detail-label">Qty Stock</span><br><b>' + Ui.formatNumber(stock.qty_stock) + '</b></div>' +
      '    <div><span class="detail-label">Updated At</span><br>' + Ui.escapeHtml(Ui.displayValue(stock.updated_at)) + '</div>' +
      '  </div>' +
      '</div>' +
      '<div class="section"><h2>Kartu Stok</h2><div id="stock-card"></div></div>';

    container.innerHTML = html;

    var cardContainer = document.getElementById('stock-card');
    if (movements.length === 0) {
      Ui.showEmpty(cardContainer, 'Belum ada movement.');
      return;
    }

    var htmlCard = '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Tanggal</th><th>Movement ID</th><th>Tipe</th><th class="num">Qty</th>' +
      '<th>Source</th><th>Source ID</th><th>Keterangan</th><th>User</th><th>Created At</th>' +
      '</tr></thead><tbody>';

    movements.forEach(function (m) {
      htmlCard += '<tr>' +
        '<td>' + Ui.escapeHtml(Ui.displayValue(m.tanggal)) + '</td>' +
        '<td>' + Ui.escapeHtml(m.movement_id) + '</td>' +
        '<td>' + typeBadge(m.tipe_transaksi) + '</td>' +
        '<td class="num">' + Ui.escapeHtml(qtyDisplay(m)) + '</td>' +
        '<td>' + Ui.escapeHtml(m.source) + '</td>' +
        '<td>' + Ui.escapeHtml(m.source_id) + '</td>' +
        '<td>' + Ui.escapeHtml(Ui.displayValue(m.keterangan)) + '</td>' +
        '<td>' + Ui.escapeHtml(Ui.displayValue(m.user_email)) + '</td>' +
        '<td>' + Ui.escapeHtml(Ui.displayValue(m.created_at)) + '</td>' +
        '</tr>';
    });

    htmlCard += '</tbody></table></div>';
    cardContainer.innerHTML = htmlCard;
  }

  return {
    renderList: renderList,
    renderDetail: renderDetail
  };
})();

// Halaman Loading / PENYIAPAN: daftar transaksi siap diproses, detail,
// dan proses STOCK_OUT (satu transaksi = satu request; backend yang
// menjamin atomic multi-SKU). READ-ONLY terhadap sumber PENYIAPAN.

var LoadingPage = (function () {
  'use strict';

  var allTransactions = []; // dari preparation_list
  var searchText = '';
  var processing = false;   // cegah double-click saat proses

  function userEmail() {
    return APP_CONFIG.USER_EMAIL;
  }

  function countSku(tx) {
    return (tx.items || []).length;
  }

  function totalQty(tx) {
    var sum = 0;
    (tx.items || []).forEach(function (it) { sum += Number(it.qty) || 0; });
    return sum;
  }

  /* ---------------- LIST ---------------- */

  function renderList() {
    processing = false;
    var root = document.getElementById('page-loading');
    root.innerHTML =
      '<h1>Loading / Penyiapan</h1>' +
      '<div class="toolbar">' +
      '  <input type="text" id="loading-search" class="search-input" placeholder="Cari Penyiapan ID / SKU / Nama Produk...">' +
      '  <button class="btn btn-secondary" id="btn-refresh-loading">Refresh</button>' +
      '</div>' +
      '<div class="section"><div id="loading-list"></div></div>';

    document.getElementById('btn-refresh-loading').addEventListener('click', loadList);
    document.getElementById('loading-search').addEventListener('input', function (ev) {
      searchText = ev.target.value.toLowerCase();
      renderTableList(); // filter di frontend
    });

    loadList();
  }

  function loadList() {
    var container = document.getElementById('loading-list');
    Ui.showLoading(container, 'Memuat transaksi PENYIAPAN...');

    ApiClient.get('preparation_list')
      .then(function (data) {
        allTransactions = data.items || [];
        renderTableList();
      })
      .catch(function (err) {
        console.error('preparation_list error:', err);
        Ui.showError(container, 'Tidak dapat memuat PENYIAPAN. ' + (err.message || ''));
      });
  }

  function renderTableList() {
    var container = document.getElementById('loading-list');

    var rows = allTransactions.filter(function (tx) {
      if (!searchText) return true;
      if (String(tx.penyiapan_id).toLowerCase().indexOf(searchText) !== -1) return true;
      return (tx.items || []).some(function (it) {
        return String(it.sku).toLowerCase().indexOf(searchText) !== -1 ||
          String(it.nama_produk || '').toLowerCase().indexOf(searchText) !== -1;
      });
    });

    if (rows.length === 0) {
      Ui.showEmpty(container, 'Tidak ada transaksi PENYIAPAN yang siap diproses.');
      return;
    }

    var html = '<div class="table-wrap"><table class="data"><thead><tr>' +
      '<th>Penyiapan ID</th><th class="num">Jumlah SKU</th><th class="num">Total Qty</th>' +
      '<th>Status</th><th>Action</th>' +
      '</tr></thead><tbody>';

    rows.forEach(function (tx) {
      html += '<tr>' +
        '<td>' + Ui.escapeHtml(tx.penyiapan_id) + '</td>' +
        '<td class="num">' + Ui.formatNumber(countSku(tx)) + '</td>' +
        '<td class="num">' + Ui.formatNumber(totalQty(tx)) + '</td>' +
        '<td><span class="badge">SIAP DIPROSES</span></td>' +
        '<td><a href="#/loading/' + Ui.escapeHtml(encodeURIComponent(tx.penyiapan_id)) + '">Lihat Detail</a></td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  /* ---------------- DETAIL ---------------- */

  function renderDetail(idParam) {
    var penyiapanId = decodeURIComponent(idParam);
    var root = document.getElementById('page-loading');
    root.innerHTML =
      '<h1>Detail Penyiapan</h1>' +
      '<div class="toolbar">' +
      '  <a href="#/loading">&larr; Kembali ke Loading</a>' +
      '  <button class="btn btn-secondary" id="btn-refresh-detail">Refresh</button>' +
      '</div>' +
      '<div id="loading-detail"><div class="state">Memuat transaksi PENYIAPAN...</div></div>';

    document.getElementById('btn-refresh-detail').addEventListener('click', function () {
      renderDetail(idParam);
    });

    loadDetail(penyiapanId);
  }

  function loadDetail(penyiapanId) {
    var container = document.getElementById('loading-detail');
    // Gunakan preparation_list (1 request) untuk mendapatkan transaksi.
    ApiClient.get('preparation_list')
      .then(function (data) {
        var tx = null;
        (data.items || []).forEach(function (t) {
          if (t.penyiapan_id === penyiapanId) tx = t;
        });
        if (!tx) {
          Ui.showEmpty(container, 'Transaksi tidak ditemukan atau sudah tidak tersedia untuk diproses.');
          return;
        }
        renderDetailContent(container, tx);
      })
      .catch(function (err) {
        console.error('preparation_list (detail) error:', err);
        Ui.showError(container, 'Tidak dapat memuat PENYIAPAN. ' + (err.message || ''));
      });
  }

  function renderDetailContent(container, tx) {
    var html =
      '<div class="section">' +
      '  <div class="detail-grid">' +
      '    <div><span class="detail-label">Penyiapan ID</span><br><b>' + Ui.escapeHtml(tx.penyiapan_id) + '</b></div>' +
      '    <div><span class="detail-label">Jumlah SKU</span><br>' + Ui.formatNumber(countSku(tx)) + '</div>' +
      '    <div><span class="detail-label">Total Qty</span><br>' + Ui.formatNumber(totalQty(tx)) + '</div>' +
      '  </div>' +
      '</div>' +
      '<div class="section"><h2>Item</h2><div id="loading-items"></div></div>' +
      '<div id="loading-action"></div>' +
      '<div id="loading-msg" style="margin-top:0.75rem"></div>';

    container.innerHTML = html;

    Ui.renderTable(document.getElementById('loading-items'), [
      { key: 'sku', label: 'SKU' },
      { key: 'nama_produk', label: 'Nama Produk' },
      { key: 'qty', label: 'Qty', numeric: true, format: Ui.formatNumber }
    ], tx.items || []);

    document.getElementById('loading-action').innerHTML =
      '<button class="btn" id="btn-process">Proses Stock Out</button>';
    document.getElementById('btn-process').addEventListener('click', function () {
      confirmProcess(tx);
    });
  }

  function confirmProcess(tx) {
    if (processing) return;
    var ok = window.confirm(
      'Proses transaksi ini sebagai STOCK OUT?\n\n' +
      'Penyiapan ID: ' + tx.penyiapan_id + '\n' +
      'Jumlah SKU: ' + countSku(tx) + '\n' +
      'Total Qty: ' + totalQty(tx));
    if (!ok) return;
    processStockOut(tx.penyiapan_id);
  }

  function processStockOut(penyiapanId) {
    processing = true;
    var btn = document.getElementById('btn-process');
    var msg = document.getElementById('loading-msg');
    if (btn) btn.disabled = true;
    msg.innerHTML = '<div class="state">Memproses Stock Out...</div>';

    // Satu transaksi = satu request; backend menangani atomic multi-SKU.
    ApiClient.post('stockout_process', {
      penyiapan_id: penyiapanId,
      user_email: userEmail()
    })
      .then(function (data) {
        msg.innerHTML =
          '<div class="state">Berhasil. Penyiapan <b>' + Ui.escapeHtml(data.penyiapan_id) + '</b><br>' +
          'Movement dibuat: <b>' + Ui.formatNumber(data.diproses) + '</b> · ' +
          'Movement dilewati: <b>' + Ui.formatNumber(data.dilewati) + '</b></div>';
        if (btn) btn.style.display = 'none';
      })
      .catch(function (err) {
        console.error('stockout_process error:', err);
        var text = err.message || 'Proses Stock Out gagal.';
        if (err.errorCode === 'STOCK_INSUFFICIENT') {
          text = 'Stok tidak mencukupi untuk transaksi ini. ' + text;
        }
        msg.innerHTML = '<div class="state error">' + Ui.escapeHtml(text) + '</div>';
        if (btn) btn.disabled = false;
        processing = false;
      });
  }

  return {
    renderList: renderList,
    renderDetail: renderDetail
  };
})();

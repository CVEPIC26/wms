// Halaman Stock Adjustment: koreksi stok manual dengan audit trail.
// Frontend HANYA UI — tidak mengubah STOCK, tidak membuat MOVEMENT,
// tidak menghitung saldo. Semua transaksi via AdjustmentService backend.

var AdjustmentPage = (function () {
  'use strict';

  var allAdjustments = [];
  var searchText = '';
  var busy = false; // anti double-click

  function userEmail() {
    return APP_CONFIG.USER_EMAIL;
  }

  function statusBadge(status) {
    return Ui.statusBadge(status);
  }

  function qtyLabel(qty) {
    var n = Number(qty) || 0;
    if (n > 0) return '+' + Ui.formatNumber(n);
    return Ui.formatNumber(n); // negatif / nol sesuai nilai API
  }

  function qtyDirection(qty) {
    var n = Number(qty) || 0;
    if (n > 0) return '<span class="badge badge-in">Stok akan bertambah</span>';
    if (n < 0) return '<span class="badge badge-out">Stok akan berkurang</span>';
    return '<span class="badge">Tidak ada perubahan</span>';
  }

  /* ---------------- LIST ---------------- */

  function renderList() {
    busy = false;
    var root = document.getElementById('page-adjustment');
    root.innerHTML =
      '<h1>Stock Adjustment</h1>' +
      '<div class="toolbar">' +
      '  <button class="btn" id="btn-new-adjustment">+ Adjustment Baru</button>' +
      '  <input type="text" id="adjustment-search" class="search-input" placeholder="Cari ID / SKU / Nama Produk / Alasan...">' +
      '  <button class="btn btn-secondary" id="btn-refresh-adjustment">Refresh</button>' +
      '</div>' +
      '<div class="section"><div id="adjustment-list"></div></div>';

    document.getElementById('btn-new-adjustment').addEventListener('click', renderCreate);
    document.getElementById('btn-refresh-adjustment').addEventListener('click', loadList);
    document.getElementById('adjustment-search').addEventListener('input', function (ev) {
      searchText = ev.target.value.toLowerCase();
      renderTableList(); // filter di memory, tanpa API request
    });

    loadList();
  }

  function loadList() {
    var container = document.getElementById('adjustment-list');
    Ui.showLoading(container, 'Memuat daftar adjustment...');

    ApiClient.get('adjustment_list')
      .then(function (data) {
        allAdjustments = data.items || [];
        renderTableList();
      })
      .catch(function (err) {
        console.error('adjustment_list error:', err);
        Ui.showError(container, 'Tidak dapat memuat daftar. ' + (err.message || ''));
      });
  }

  function renderTableList() {
    var container = document.getElementById('adjustment-list');

    var rows = allAdjustments.filter(function (a) {
      if (!searchText) return true;
      return String(a.adjustment_id).toLowerCase().indexOf(searchText) !== -1 ||
        String(a.sku).toLowerCase().indexOf(searchText) !== -1 ||
        String(a.nama_produk || '').toLowerCase().indexOf(searchText) !== -1 ||
        String(a.alasan || '').toLowerCase().indexOf(searchText) !== -1;
    });

    Ui.renderTable(container, [
      { key: 'adjustment_id', label: 'Adjustment ID' },
      { key: 'tanggal', label: 'Tanggal' },
      { key: 'sku', label: 'SKU' },
      { key: 'nama_produk', label: 'Nama Produk' },
      { key: 'qty_adjustment', label: 'Qty Adjustment', numeric: true, format: qtyLabel },
      { key: 'alasan', label: 'Alasan' },
      { key: 'status', label: 'Status', format: function (v) { return statusBadge(v); } },
      { key: 'user_email', label: 'User' },
      { key: 'adjustment_id', label: 'Action', format: function (v) {
          return '<a href="#/adjustment/' + Ui.escapeHtml(encodeURIComponent(v)) + '">Lihat Detail</a>';
        } }
    ], rows);
  }

  /* ---------------- CREATE ---------------- */

  function renderCreate() {
    var root = document.getElementById('page-adjustment');
    root.innerHTML =
      '<h1>Adjustment Baru</h1>' +
      '<div class="section">' +
      '  <div class="form-grid">' +
      '    <label>Tanggal<br><input type="date" id="a-tanggal"></label>' +
      '    <label>SKU<br><input type="text" id="a-sku" placeholder="Scan / ketik SKU"></label>' +
      '    <label>Nama Produk<br><input type="text" id="a-nama" readonly></label>' +
      '    <label>Qty Adjustment<br><input type="number" id="a-qty" placeholder="cth: 10 atau -10"></label>' +
      '    <label>Alasan<br><input type="text" id="a-alasan" placeholder="Alasan koreksi stok"></label>' +
      '  </div>' +
      '  <div id="a-preview" style="margin-top:0.75rem"></div>' +
      '</div>' +
      '<div>' +
      '  <button class="btn" id="btn-save-adjustment">Simpan Adjustment</button>' +
      '  <button class="btn btn-secondary" id="btn-cancel-adjustment">Batal</button>' +
      '  <div id="adjustment-create-msg" style="margin-top:0.75rem"></div>' +
      '</div>';

    document.getElementById('a-tanggal').value = todayIso();

    var skuInput = document.getElementById('a-sku');
    skuInput.addEventListener('change', lookupSku);
    skuInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); lookupSku(); }
    });

    document.getElementById('a-qty').addEventListener('input', function (ev) {
      var preview = document.getElementById('a-preview');
      var val = ev.target.value;
      if (val === '') { preview.innerHTML = ''; return; }
      preview.innerHTML = qtyDirection(Number(val));
    });

    document.getElementById('btn-save-adjustment').addEventListener('click', submitCreate);
    document.getElementById('btn-cancel-adjustment').addEventListener('click', renderList);

    skuInput.focus();
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function lookupSku() {
    var sku = document.getElementById('a-sku').value.trim();
    var namaInput = document.getElementById('a-nama');
    if (!sku) { namaInput.value = ''; return; }

    namaInput.value = '';
    ApiClient.get('master_sku')
      .then(function (data) {
        var found = null;
        (data.items || []).forEach(function (m) {
          if (m.sku === sku) found = m;
        });
        if (!found) {
          namaInput.value = '';
          showCreateMsg('SKU tidak ditemukan.', true);
          return;
        }
        namaInput.value = found.nama_produk;
        clearCreateMsg();
        document.getElementById('a-qty').focus();
      })
      .catch(function (err) {
        console.error('master_sku error:', err);
        showCreateMsg(err.message || 'Gagal lookup SKU.', true);
      });
  }

  function showCreateMsg(message, isError) {
    document.getElementById('adjustment-create-msg').innerHTML =
      '<div class="' + (isError ? 'state error' : 'state') + '">' + Ui.escapeHtml(message) + '</div>';
  }

  function clearCreateMsg() {
    document.getElementById('adjustment-create-msg').innerHTML = '';
  }

  function submitCreate() {
    if (busy) return;

    var tanggal = document.getElementById('a-tanggal').value;
    var sku = document.getElementById('a-sku').value.trim();
    var nama = document.getElementById('a-nama').value.trim();
    var qtyVal = document.getElementById('a-qty').value;
    var alasan = document.getElementById('a-alasan').value.trim();

    if (!tanggal) { showCreateMsg('Tanggal wajib diisi.', true); return; }
    if (!sku) { showCreateMsg('SKU wajib diisi.', true); return; }
    if (!nama) { showCreateMsg('SKU belum tervalidasi. Lakukan lookup SKU.', true); return; }
    if (qtyVal === '' || isNaN(Number(qtyVal)) || Math.floor(Number(qtyVal)) !== Number(qtyVal)) {
      showCreateMsg('Qty adjustment harus berupa integer.', true); return;
    }
    if (!alasan) { showCreateMsg('Alasan wajib diisi.', true); return; }

    busy = true;
    var btn = document.getElementById('btn-save-adjustment');
    btn.disabled = true;
    showCreateMsg('Menyimpan adjustment...');

    ApiClient.post('adjustment_create', {
      tanggal: tanggal,
      sku: sku,
      qty_adjustment: Number(qtyVal),
      alasan: alasan,
      user_email: userEmail()
    })
      .then(function (data) {
        Router.go('/adjustment/' + encodeURIComponent(data.adjustment_id));
      })
      .catch(function (err) {
        console.error('adjustment_create error:', err);
        showCreateMsg(err.message || 'Gagal menyimpan adjustment.', true);
        btn.disabled = false;
        busy = false;
      });
  }

  /* ---------------- DETAIL ---------------- */

  function renderDetail(idParam) {
    busy = false;
    var adjustmentId = decodeURIComponent(idParam);
    var root = document.getElementById('page-adjustment');
    root.innerHTML =
      '<h1>Detail Adjustment</h1>' +
      '<div class="toolbar">' +
      '  <a href="#/adjustment">&larr; Kembali ke daftar</a>' +
      '  <button class="btn btn-secondary" id="btn-refresh-detail">Refresh</button>' +
      '</div>' +
      '<div id="adjustment-detail"><div class="state">Memuat detail adjustment...</div></div>';

    document.getElementById('btn-refresh-detail').addEventListener('click', function () {
      renderDetail(idParam);
    });

    loadDetail(adjustmentId);
  }

  function loadDetail(adjustmentId) {
    ApiClient.get('adjustment_get', { adjustment_id: adjustmentId })
      .then(function (data) { renderDetailContent(adjustmentId, data); })
      .catch(function (err) {
        console.error('adjustment_get error:', err);
        Ui.showError(document.getElementById('adjustment-detail'),
          'Tidak dapat memuat detail. ' + (err.message || ''));
      });
  }

  function renderDetailContent(adjustmentId, data) {
    var container = document.getElementById('adjustment-detail');

    var html =
      '<div class="section">' +
      '  <div class="detail-grid">' +
      '    <div><span class="detail-label">Adjustment ID</span><br><b>' + Ui.escapeHtml(data.adjustment_id) + '</b></div>' +
      '    <div><span class="detail-label">Tanggal</span><br>' + Ui.escapeHtml(Ui.displayValue(data.tanggal)) + '</div>' +
      '    <div><span class="detail-label">SKU</span><br>' + Ui.escapeHtml(data.sku) + '</div>' +
      '    <div><span class="detail-label">Nama Produk</span><br>' + Ui.escapeHtml(Ui.displayValue(data.nama_produk)) + '</div>' +
      '    <div><span class="detail-label">Qty Adjustment</span><br><b>' + qtyLabel(data.qty_adjustment) + '</b> ' + qtyDirection(data.qty_adjustment) + '</div>' +
      '    <div><span class="detail-label">Alasan</span><br>' + Ui.escapeHtml(Ui.displayValue(data.alasan)) + '</div>' +
      '    <div><span class="detail-label">Dibuat Oleh</span><br>' + Ui.escapeHtml(Ui.displayValue(data.user_email)) + '</div>' +
      '    <div><span class="detail-label">Status</span><br>' + statusBadge(data.status) + '</div>' +
      '    <div><span class="detail-label">Verified By</span><br>' + Ui.escapeHtml(Ui.displayValue(data.verified_by)) + '</div>' +
      '    <div><span class="detail-label">Created At</span><br>' + Ui.escapeHtml(Ui.displayValue(data.created_at)) + '</div>' +
      '    <div><span class="detail-label">Verified At</span><br>' + Ui.escapeHtml(Ui.displayValue(data.verified_at)) + '</div>' +
      '  </div>' +
      '</div>' +
      '<div id="adjustment-action"></div>' +
      '<div id="adjustment-msg" style="margin-top:0.75rem"></div>';

    container.innerHTML = html;

    var actionEl = document.getElementById('adjustment-action');
    if (data.status === 'DRAFT') {
      actionEl.innerHTML = '<button class="btn" id="btn-submit-adjustment">Submit Verifikasi</button>';
      document.getElementById('btn-submit-adjustment').addEventListener('click', function () {
        var ok = window.confirm('Submit adjustment untuk verifikasi?');
        if (ok) doAction('adjustment_submit', adjustmentId, 'Mengirim untuk verifikasi...');
      });
    } else if (data.status === 'MENUNGGU_VERIFIKASI') {
      actionEl.innerHTML = '<button class="btn" id="btn-verify-adjustment">Verifikasi Adjustment</button>';
      document.getElementById('btn-verify-adjustment').addEventListener('click', function () {
        var ok = window.confirm('Verifikasi adjustment dan terapkan perubahan stok?');
        if (ok) doAction('adjustment_verify', adjustmentId, 'Memverifikasi...');
      });
    } else if (data.status === 'DISETUJUI') {
      actionEl.innerHTML = '<div class="state">Adjustment Sudah Diverifikasi.</div>';
    }
  }

  function doAction(action, adjustmentId, loadingMsg) {
    if (busy) return;
    busy = true;

    var btn = document.querySelector('#adjustment-action .btn');
    if (btn) btn.disabled = true;
    showDetailMsg(loadingMsg);

    ApiClient.post(action, { adjustment_id: adjustmentId, user_email: userEmail() })
      .then(function (data) {
        var info = '<div class="state">Berhasil. Status: ' + statusBadge(data.status);
        if (data.movement_id) {
          info += ' · Movement: <b>' + Ui.escapeHtml(data.movement_id) + '</b>';
        }
        info += '</div>';
        showDetailMsg(info, false, true);
        setTimeout(function () { renderDetail(encodeURIComponent(adjustmentId)); }, 800);
      })
      .catch(function (err) {
        console.error(action + ' error:', err);
        var text = err.message || 'Aksi gagal.';
        if (err.errorCode === 'STOCK_INSUFFICIENT') {
          text = 'Stok tidak mencukupi untuk adjustment negatif ini. ' + text;
        } else if (err.errorCode === 'VERIFIER_SAME_AS_CREATOR') {
          text = 'Pembuat adjustment tidak boleh menjadi verifier. ' + text;
        }
        showDetailMsg(text, true);
        if (btn) btn.disabled = false;
        busy = false;
      });
  }

  function showDetailMsg(message, isError, isHtml) {
    var msg = document.getElementById('adjustment-msg');
    var cls = isError ? 'state error' : 'state';
    var content = isHtml ? message : Ui.escapeHtml(message);
    msg.innerHTML = '<div class="' + cls + '">' + content + '</div>';
  }

  return {
    renderList: renderList,
    renderDetail: renderDetail
  };
})();

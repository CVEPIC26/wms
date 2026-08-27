// Halaman Stock Opname + scanner: buat opname, scan SKU (1 scan = 1 SKU),
// tambah detail, submit, verify. Frontend hanya input → API → tampilkan;
// snapshot system_qty, difference, atomic adjustment ada di backend.

var OpnamePage = (function () {
  'use strict';

  var currentOpname = null;  // header + items hasil opname_get
  var searchText = '';
  var saving = false;

  function userEmail() {
    return APP_CONFIG.USER_EMAIL;
  }

  function statusBadge(status) {
    return '<span class="badge">' + Ui.escapeHtml(Ui.displayValue(status)) + '</span>';
  }

  function diffLabel(v) {
    var n = Number(v) || 0;
    if (n === 0) return '<span class="badge badge-in">Sesuai</span>';
    if (n < 0) return '<span class="badge badge-out">Kurang</span>';
    return '<span class="badge badge-adj">Lebih</span>';
  }

  /* ---------------- LIST ---------------- */

  function renderList() {
    var root = document.getElementById('page-opname');
    root.innerHTML =
      '<h1>Stock Opname</h1>' +
      '<div class="toolbar">' +
      '  <button class="btn" id="btn-new-opname">+ Opname Baru</button>' +
      '  <button class="btn btn-secondary" id="btn-refresh-opname">Refresh</button>' +
      '</div>' +
      '<div class="section"><div id="opname-list"></div></div>';

    document.getElementById('btn-new-opname').addEventListener('click', renderCreateForm);
    document.getElementById('btn-refresh-opname').addEventListener('click', loadList);

    loadList();
  }

  function loadList() {
    var container = document.getElementById('opname-list');
    Ui.showLoading(container, 'Memuat daftar opname...');

    ApiClient.get('opname_list')
      .then(function (data) { renderTableList(data.items || []); })
      .catch(function (err) {
        console.error('opname_list error:', err);
        Ui.showError(container, 'Tidak dapat memuat daftar. ' + (err.message || ''));
      });
  }

  function renderTableList(rows) {
    var container = document.getElementById('opname-list');
    Ui.renderTable(container, [
      { key: 'opname_id', label: 'Opname ID' },
      { key: 'tanggal', label: 'Tanggal' },
      { key: 'lokasi', label: 'Lokasi' },
      { key: 'user_email', label: 'User' },
      { key: 'status', label: 'Status', format: function (v) { return statusBadge(v); } },
      { key: 'opname_id', label: 'Action', format: function (v) {
          return '<a href="#/opname/' + Ui.escapeHtml(encodeURIComponent(v)) + '">Lihat Detail</a>';
        } }
    ], rows);
  }

  /* ---------------- CREATE ---------------- */

  function renderCreateForm() {
    var root = document.getElementById('page-opname');
    root.innerHTML =
      '<h1>Opname Baru</h1>' +
      '<div class="section">' +
      '  <div class="form-grid">' +
      '    <label>Tanggal<br><input type="date" id="o-tanggal"></label>' +
      '    <label>Lokasi<br><input type="text" id="o-lokasi" placeholder="Lokasi / gudang"></label>' +
      '  </div>' +
      '</div>' +
      '<div>' +
      '  <button class="btn" id="btn-create">Buat Opname</button>' +
      '  <button class="btn btn-secondary" id="btn-cancel">Batal</button>' +
      '  <div id="create-opname-msg" style="margin-top:0.75rem"></div>' +
      '</div>';

    document.getElementById('o-tanggal').value = todayIso();
    document.getElementById('btn-create').addEventListener('click', submitCreate);
    document.getElementById('btn-cancel').addEventListener('click', renderList);
  }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
      ('0' + d.getDate()).slice(-2);
  }

  function submitCreate() {
    var msg = document.getElementById('create-opname-msg');
    var payload = {
      tanggal: document.getElementById('o-tanggal').value || undefined,
      lokasi: document.getElementById('o-lokasi').value.trim(),
      user_email: userEmail()
    };

    msg.innerHTML = '<div class="state">Membuat opname...</div>';
    ApiClient.post('opname_create', payload)
      .then(function (data) {
        Router.go('/opname/' + encodeURIComponent(data.opname_id));
      })
      .catch(function (err) {
        console.error('opname_create error:', err);
        msg.innerHTML = '<div class="state error">' + Ui.escapeHtml(err.message || 'Gagal membuat opname') + '</div>';
      });
  }

  /* ---------------- DETAIL ---------------- */

  function renderDetail(idParam) {
    var opnameId = decodeURIComponent(idParam);
    var root = document.getElementById('page-opname');
    root.innerHTML =
      '<h1>Stock Opname</h1>' +
      '<div class="toolbar">' +
      '  <a href="#/opname">&larr; Kembali ke daftar</a>' +
      '  <button class="btn btn-secondary" id="btn-refresh-detail">Refresh</button>' +
      '</div>' +
      '<div id="opname-detail"><div class="state">Memuat detail opname...</div></div>';

    document.getElementById('btn-refresh-detail').addEventListener('click', function () {
      renderDetail(idParam);
    });

    loadDetail(opnameId);
  }

  function loadDetail(opnameId) {
    ApiClient.get('opname_get', { opname_id: opnameId })
      .then(function (data) {
        currentOpname = data;
        renderDetailContent(opnameId, data);
      })
      .catch(function (err) {
        console.error('opname_get error:', err);
        Ui.showError(document.getElementById('opname-detail'),
          'Tidak dapat memuat detail. ' + (err.message || ''));
      });
  }

  function renderDetailContent(opnameId, data) {
    var container = document.getElementById('opname-detail');
    var isDraft = data.status === 'DRAFT';
    var isWaiting = data.status === 'MENUNGGU_VERIFIKASI';
    var isApproved = data.status === 'DISETUJUI';

    var html =
      '<div class="section">' +
      '  <div class="detail-grid">' +
      '    <div><span class="detail-label">Opname ID</span><br><b>' + Ui.escapeHtml(data.opname_id) + '</b></div>' +
      '    <div><span class="detail-label">Tanggal</span><br>' + Ui.escapeHtml(Ui.displayValue(data.tanggal)) + '</div>' +
      '    <div><span class="detail-label">Lokasi</span><br>' + Ui.escapeHtml(Ui.displayValue(data.lokasi)) + '</div>' +
      '    <div><span class="detail-label">Status</span><br>' + statusBadge(data.status) + '</div>' +
      '  </div>' +
      '</div>';

    // Ringkasan (hanya agregasi nilai yang diberikan backend).
    var items = data.items || [];
    var totalSku = items.length;
    var totalSystem = 0;
    var totalPhysical = 0;
    var totalDiff = 0;
    items.forEach(function (it) {
      totalSystem += Number(it.system_qty) || 0;
      totalPhysical += Number(it.physical_qty) || 0;
      totalDiff += Number(it.difference_qty) || 0;
    });

    html +=
      '<div class="section"><h2>Ringkasan</h2>' +
      '  <div class="detail-grid">' +
      '    <div><span class="detail-label">Total SKU</span><br>' + Ui.formatNumber(totalSku) + '</div>' +
      '    <div><span class="detail-label">Total System Qty</span><br>' + Ui.formatNumber(totalSystem) + '</div>' +
      '    <div><span class="detail-label">Total Physical Qty</span><br>' + Ui.formatNumber(totalPhysical) + '</div>' +
      '    <div><span class="detail-label">Total Difference</span><br>' + Ui.formatNumber(totalDiff) + '</div>' +
      '  </div>' +
      '</div>';

    // Scanner hanya aktif saat DRAFT.
    if (isDraft) {
      html +=
        '<div class="section scanner-box" id="scanner-section">' +
        '  <h2>Scan SKU</h2>' +
        '  <div class="scanner-row">' +
        '    <input type="text" id="scan-sku" class="scan-input" placeholder="Scan / ketik SKU lalu Enter">' +
        '    <button class="btn btn-secondary" id="btn-lookup">Lookup</button>' +
        '  </div>' +
        '  <div id="scan-result"></div>' +
        '</div>';
    }

    html += '<div class="section"><h2>Detail</h2>' +
      '<div class="toolbar"><input type="text" id="detail-search" class="search-input" placeholder="Cari SKU / Nama Produk..."></div>' +
      '<div id="opname-items"></div></div>';

    // Aksi status.
    if (isDraft) {
      html += '<div id="opname-action"><button class="btn" id="btn-submit">Submit Verifikasi</button></div>';
    } else if (isWaiting) {
      html += '<div id="opname-action"><button class="btn" id="btn-verify">Verifikasi Opname</button></div>';
    } else if (isApproved) {
      html += '<div class="state">Opname sudah diverifikasi.</div>';
    }

    html += '<div id="opname-msg" style="margin-top:0.75rem"></div>';

    container.innerHTML = html;

    renderItems(items);

    if (isDraft) {
      setupScanner(opnameId);
      document.getElementById('btn-submit').addEventListener('click', function () {
        var ok = window.confirm('Submit Stock Opname untuk verifikasi?');
        if (ok) doSubmit(opnameId);
      });
      focusScanner();
    } else if (isWaiting) {
      document.getElementById('btn-verify').addEventListener('click', function () {
        var ok = window.confirm('Verifikasi Stock Opname dan terapkan adjustment ke stok?');
        if (ok) doVerify(opnameId);
      });
    }

    var search = document.getElementById('detail-search');
    if (search) {
      search.addEventListener('input', function (ev) {
        searchText = ev.target.value.toLowerCase();
        renderItems(currentOpname.items || []);
      });
    }
  }

  function renderItems(items) {
    var container = document.getElementById('opname-items');
    var rows = (items || []).filter(function (it) {
      if (!searchText) return true;
      return String(it.sku).toLowerCase().indexOf(searchText) !== -1 ||
        String(it.nama_produk || '').toLowerCase().indexOf(searchText) !== -1;
    });

    Ui.renderTable(container, [
      { key: 'sku', label: 'SKU' },
      { key: 'nama_produk', label: 'Nama Produk' },
      { key: 'system_qty', label: 'System Qty', numeric: true, format: Ui.formatNumber },
      { key: 'physical_qty', label: 'Physical Qty', numeric: true, format: Ui.formatNumber },
      { key: 'difference_qty', label: 'Difference', format: function (v) { return diffLabel(v); } },
      { key: 'notes', label: 'Notes' }
    ], rows);
  }

  /* ---------------- SCANNER ---------------- */

  function focusScanner() {
    var input = document.getElementById('scan-sku');
    if (input) input.focus();
  }

  function setupScanner(opnameId) {
    var input = document.getElementById('scan-sku');
    var btn = document.getElementById('btn-lookup');

    input.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        lookupSku(opnameId);
      }
    });
    btn.addEventListener('click', function () { lookupSku(opnameId); });
  }

  function lookupSku(opnameId) {
    var input = document.getElementById('scan-sku');
    var result = document.getElementById('scan-result');
    var sku = input.value.trim();

    if (!sku) {
      result.innerHTML = '<div class="state error">Masukkan SKU.</div>';
      focusScanner();
      return;
    }

    // Cegah duplikat di frontend sebelum memanggil backend.
    var dup = (currentOpname.items || []).some(function (it) { return it.sku === sku; });
    if (dup) {
      result.innerHTML = '<div class="state error">SKU ini sudah dicatat.</div>';
      input.value = '';
      focusScanner();
      return;
    }

    result.innerHTML = '<div class="state">Mencari SKU...</div>';
    ApiClient.get('opname_sku', { opname_id: opnameId, sku: sku })
      .then(function (data) {
        renderScanForm(opnameId, data);
        input.value = '';
      })
      .catch(function (err) {
        console.error('opname_sku error:', err);
        var text = 'SKU tidak ditemukan.';
        if (err.message) text = err.message;
        result.innerHTML = '<div class="state error">' + Ui.escapeHtml(text) + '</div>';
        focusScanner();
      });
  }

  function renderScanForm(opnameId, data) {
    var result = document.getElementById('scan-result');
    result.innerHTML =
      '<div class="scan-form">' +
      '  <div class="detail-grid">' +
      '    <div><span class="detail-label">SKU</span><br><b>' + Ui.escapeHtml(data.sku) + '</b></div>' +
      '    <div><span class="detail-label">Nama Produk</span><br>' + Ui.escapeHtml(data.nama_produk) + '</div>' +
      '    <div><span class="detail-label">System Qty</span><br><b id="sf-system">' + Ui.formatNumber(data.system_qty) + '</b></div>' +
      '  </div>' +
      '  <div class="form-grid" style="margin-top:0.75rem">' +
      '    <label>Physical Qty<br><input type="number" min="0" id="sf-qty"></label>' +
      '    <label>Notes<br><input type="text" id="sf-notes"></label>' +
      '  </div>' +
      '  <button class="btn" id="btn-save-detail" style="margin-top:0.75rem">Simpan Hasil Opname</button>' +
      '</div>';

    document.getElementById('btn-save-detail').addEventListener('click', function () {
      saveDetail(opnameId, data.sku);
    });

    var qtyInput = document.getElementById('sf-qty');
    qtyInput.focus();
    qtyInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') {
        ev.preventDefault();
        saveDetail(opnameId, data.sku);
      }
    });
  }

  function saveDetail(opnameId, sku) {
    if (saving) return;

    // Cegah duplikat sebelum request.
    var dup = (currentOpname.items || []).some(function (it) { return it.sku === sku; });
    if (dup) {
      document.getElementById('scan-result').innerHTML =
        '<div class="state error">SKU ini sudah dicatat.</div>';
      focusScanner();
      return;
    }

    var qtyEl = document.getElementById('sf-qty');
    var notesEl = document.getElementById('sf-notes');
    var qty = qtyEl.value;
    if (qty === '' || isNaN(Number(qty)) || Math.floor(Number(qty)) !== Number(qty) || Number(qty) < 0) {
      document.getElementById('scan-result').querySelector('button').focus();
      showScanError('Physical Qty harus integer >= 0.');
      return;
    }

    saving = true;
    var result = document.getElementById('scan-result');
    var btn = document.getElementById('btn-save-detail');
    if (btn) btn.disabled = true;
    result.querySelector('.scan-form').insertAdjacentHTML('beforeend',
      '<div class="state">Menyimpan...</div>');

    ApiClient.post('opname_add_detail', {
      opname_id: opnameId,
      sku: sku,
      physical_qty: Number(qty),
      notes: notesEl.value || '',
      user_email: userEmail()
    })
      .then(function () {
        saving = false;
        // Reload detail sekali agar UI sinkron, lalu kembalikan fokus scanner.
        ApiClient.get('opname_get', { opname_id: opnameId })
          .then(function (data) {
            currentOpname = data;
            renderDetailContent(opnameId, data);
            focusScanner();
          });
      })
      .catch(function (err) {
        saving = false;
        console.error('opname_add_detail error:', err);
        showScanError(err.message || 'Gagal menyimpan detail.');
        if (err.errorCode === 'OPNAME_DETAIL_DUPLICATE') {
          // Muat ulang agar items sinkron.
          ApiClient.get('opname_get', { opname_id: opnameId })
            .then(function (data) { currentOpname = data; renderDetailContent(opnameId, data); focusScanner(); });
        } else {
          focusScanner();
        }
      });
  }

  function showScanError(message) {
    document.getElementById('scan-result').innerHTML =
      '<div class="state error">' + Ui.escapeHtml(message) + '</div>';
  }

  /* ---------------- SUBMIT / VERIFY ---------------- */

  function doSubmit(opnameId) {
    if (!(currentOpname.items || []).length) {
      showOpnameMsg('Minimal satu detail diperlukan.', true);
      return;
    }
    showOpnameMsg('Mengirim untuk verifikasi...');
    ApiClient.post('opname_submit', { opname_id: opnameId, user_email: userEmail() })
      .then(function () { renderDetail(encodeURIComponent(opnameId)); })
      .catch(function (err) {
        console.error('opname_submit error:', err);
        showOpnameMsg(err.message || 'Submit gagal.', true);
      });
  }

  function doVerify(opnameId) {
    showOpnameMsg('Memverifikasi...');
    ApiClient.post('opname_verify', { opname_id: opnameId, user_email: userEmail() })
      .then(function (data) {
        var info = '<div class="state">Disetujui. Adjustment dibuat: <b>' +
          Ui.formatNumber(data.adjustment_dibuat) + '</b>' +
          (data.tanpa_adjustment !== undefined
            ? ' · tanpa adjustment: <b>' + Ui.formatNumber(data.tanpa_adjustment) + '</b>'
            : '') + '</div>';
        showOpnameMsg(info, false, true);
        setTimeout(function () { renderDetail(encodeURIComponent(opnameId)); }, 800);
      })
      .catch(function (err) {
        console.error('opname_verify error:', err);
        showOpnameMsg(err.message || 'Verifikasi gagal.', true);
      });
  }

  function showOpnameMsg(message, isError, isHtml) {
    var msg = document.getElementById('opname-msg');
    var cls = isError ? 'state error' : 'state';
    var content = isHtml ? message : Ui.escapeHtml(message);
    msg.innerHTML = '<div class="' + cls + '">' + content + '</div>';
  }

  return {
    renderList: renderList,
    renderDetail: renderDetail
  };
})();

// Halaman Receiving: daftar, buat baru (multi-SKU + scan), detail,
// submit, dan verify. Frontend hanya input → API → tampilkan response;
// seluruh validasi final & perhitungan stok ada di backend.

var ReceivingPage = (function () {
  'use strict';

  var items = []; // item form create: { sku, nama_produk, qty_diterima, qty_reject, alasan_reject, catatan }
  var busy = false; // anti double-click pada transaksi

  function userEmail() {
    return APP_CONFIG.USER_EMAIL;
  }

  function statusBadge(status) {
    return Ui.statusBadge(status);
  }

  /* ---------------- LIST ---------------- */

  function renderList() {
    busy = false;
    var root = document.getElementById('page-receiving');
    root.innerHTML =
      '<h1>Receiving</h1>' +
      '<div style="margin-bottom:1rem">' +
      '<button class="btn" id="btn-new-receiving">+ Receiving Baru</button>' +
      '</div>' +
      '<div class="section"><div id="receiving-list"></div></div>';

    document.getElementById('btn-new-receiving').addEventListener('click', renderCreate);

    var container = document.getElementById('receiving-list');
    Ui.showLoading(container, 'Memuat daftar receiving...');

    ApiClient.get('receiving_list')
      .then(function (data) {
        var rows = (data.items || []).map(function (r) {
          return {
            receiving_id: r.receiving_id,
            tanggal: r.tanggal,
            supplier: r.supplier,
            nomor_po: r.nomor_po,
            status: r.status,
            user_email: r.user_email,
            action: r.receiving_id
          };
        });
        Ui.renderTable(container, [
          { key: 'receiving_id', label: 'Receiving ID' },
          { key: 'tanggal', label: 'Tanggal' },
          { key: 'supplier', label: 'Supplier' },
          { key: 'nomor_po', label: 'Nomor PO' },
          { key: 'status', label: 'Status', format: function (v) { return statusBadge(v); } },
          { key: 'user_email', label: 'User' },
          { key: 'action', label: 'Action', format: function (v) {
              return '<a href="#/receiving/' + Ui.escapeHtml(v) + '">Detail</a>';
            } }
        ], rows);
      })
      .catch(function (err) {
        console.error('receiving_list error:', err);
        Ui.showError(container, 'Tidak dapat memuat daftar. ' + (err.message || ''));
      });
  }

  /* ---------------- CREATE ---------------- */

  function renderCreate() {
    busy = false;
    items = [];
    var root = document.getElementById('page-receiving');
    root.innerHTML =
      '<h1>Receiving Baru</h1>' +
      '<div class="section">' +
      '  <div class="form-grid">' +
      '    <label>Tanggal<br><input type="date" id="f-tanggal"></label>' +
      '    <label>Supplier<br><input type="text" id="f-supplier" placeholder="Nama supplier"></label>' +
      '    <label>Nomor PO<br><input type="text" id="f-po" placeholder="Nomor PO"></label>' +
      '  </div>' +
      '</div>' +
      '<div class="section">' +
      '  <h2>Item Produk</h2>' +
      '  <div id="items-body"></div>' +
      '  <button class="btn btn-secondary" id="btn-add-item">+ Tambah Produk</button>' +
      '</div>' +
      '<div style="margin-top:1rem">' +
      '  <button class="btn" id="btn-save">Simpan Receiving</button>' +
      '  <button class="btn btn-secondary" id="btn-cancel">Batal</button>' +
      '  <div id="create-msg" style="margin-top:0.75rem"></div>' +
      '</div>';

    document.getElementById('f-tanggal').value = todayIso();
    document.getElementById('btn-add-item').addEventListener('click', function () { addItemRow(); });
    document.getElementById('btn-save').addEventListener('click', submitCreate);
    document.getElementById('btn-cancel').addEventListener('click', renderList);

    addItemRow(); // satu baris awal
  }

  function todayIso() {
    var d = new Date();
    var m = ('0' + (d.getMonth() + 1)).slice(-2);
    var day = ('0' + d.getDate()).slice(-2);
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function addItemRow() {
    var index = items.length;
    items.push({ sku: '', nama_produk: '', qty_diterima: '', qty_reject: 0, alasan_reject: '', catatan: '' });

    var body = document.getElementById('items-body');
    var row = document.createElement('div');
    row.className = 'item-row';
    row.dataset.index = index;
    row.innerHTML =
      '<div class="form-grid item-grid">' +
      '  <label>SKU<br><input type="text" class="in-sku" data-index="' + index + '" placeholder="Scan / ketik SKU"></label>' +
      '  <label>Nama Produk<br><input type="text" class="in-nama" data-index="' + index + '" readonly></label>' +
      '  <label>Qty Diterima<br><input type="number" min="0" class="in-diterima" data-index="' + index + '"></label>' +
      '  <label>Qty Reject<br><input type="number" min="0" class="in-reject" data-index="' + index + '" value="0"></label>' +
      '  <label>Alasan Reject<br><input type="text" class="in-alasan" data-index="' + index + '"></label>' +
      '  <label>Catatan<br><input type="text" class="in-catatan" data-index="' + index + '"></label>' +
      '</div>' +
      '<div class="item-msg" data-index="' + index + '"></div>';
    body.appendChild(row);

    var skuInput = row.querySelector('.in-sku');
    skuInput.addEventListener('change', function () { lookupSku(index); });
    // Dukung scanner (umumnya mengirim Enter).
    skuInput.addEventListener('keydown', function (ev) {
      if (ev.key === 'Enter') { ev.preventDefault(); lookupSku(index); }
    });

    ['diterima', 'reject', 'alasan', 'catatan'].forEach(function (field) {
      row.querySelector('.in-' + field).addEventListener('input', function (ev) {
        items[index][fieldMap(field)] = ev.target.value;
      });
    });

    skuInput.focus();
  }

  function fieldMap(field) {
    return {
      diterima: 'qty_diterima',
      reject: 'qty_reject',
      alasan: 'alasan_reject',
      catatan: 'catatan'
    }[field];
  }

  function lookupSku(index) {
    var skuInput = document.querySelector('.in-sku[data-index="' + index + '"]');
    var namaInput = document.querySelector('.in-nama[data-index="' + index + '"]');
    var msg = document.querySelector('.item-msg[data-index="' + index + '"]');
    var sku = skuInput.value.trim();
    if (!sku) return;

    // Cegah SKU duplikat di form.
    for (var i = 0; i < items.length; i++) {
      if (i !== index && items[i].sku === sku) {
        msg.innerHTML = '<span class="state error">SKU sudah ditambahkan pada baris lain.</span>';
        namaInput.value = '';
        items[index].sku = '';
        items[index].nama_produk = '';
        var dup = document.querySelector('.in-sku[data-index="' + i + '"]');
        if (dup) dup.focus();
        return;
      }
    }

    msg.innerHTML = '<span class="state">Mencari SKU...</span>';
    ApiClient.get('master_sku')
      .then(function (data) {
        var found = null;
        (data.items || []).forEach(function (m) {
          if (m.sku === sku) found = m;
        });
        if (!found) {
          msg.innerHTML = '<span class="state error">SKU tidak ditemukan.</span>';
          namaInput.value = '';
          items[index].sku = '';
          items[index].nama_produk = '';
          return;
        }
        if (found.status_aktif !== 'YA') {
          msg.innerHTML = '<span class="state error">SKU tidak aktif.</span>';
          namaInput.value = '';
          items[index].sku = '';
          items[index].nama_produk = '';
          return;
        }
        items[index].sku = found.sku;
        items[index].nama_produk = found.nama_produk;
        namaInput.value = found.nama_produk;
        msg.innerHTML = '';
        var next = document.querySelector('.in-diterima[data-index="' + index + '"]');
        if (next) next.focus();
      })
      .catch(function (err) {
        console.error('master_sku error:', err);
        msg.innerHTML = '<span class="state error">' + Ui.escapeHtml(err.message || 'Gagal lookup SKU') + '</span>';
      });
  }

  function validateForm() {
    var supplier = document.getElementById('f-supplier').value.trim();
    var po = document.getElementById('f-po').value.trim();
    if (!supplier) return 'Supplier wajib diisi.';
    if (!po) return 'Nomor PO wajib diisi.';

    var validItems = items.filter(function (it) { return it.sku; });
    if (validItems.length === 0) return 'Minimal satu item produk.';

    for (var i = 0; i < validItems.length; i++) {
      var it = validItems[i];
      var diterima = Number(it.qty_diterima);
      var reject = Number(it.qty_reject);
      if (it.qty_diterima === '' || isNaN(diterima) || Math.floor(diterima) !== diterima || diterima < 0) {
        return 'Qty diterima harus integer >= 0 untuk SKU ' + it.sku;
      }
      if (isNaN(reject) || Math.floor(reject) !== reject || reject < 0) {
        return 'Qty reject harus integer >= 0 untuk SKU ' + it.sku;
      }
      if (reject > diterima) {
        return 'Qty reject tidak boleh melebihi qty diterima untuk SKU ' + it.sku;
      }
      if (reject > 0 && !String(it.alasan_reject).trim()) {
        return 'Alasan reject wajib jika qty reject > 0 untuk SKU ' + it.sku;
      }
    }
    return null;
  }

  function submitCreate() {
    if (busy) return;
    var msg = document.getElementById('create-msg');
    var error = validateForm();
    if (error) {
      msg.innerHTML = '<div class="state error">' + Ui.escapeHtml(error) + '</div>';
      return;
    }

    var payload = {
      tanggal: document.getElementById('f-tanggal').value || undefined,
      supplier: document.getElementById('f-supplier').value.trim(),
      nomor_po: document.getElementById('f-po').value.trim(),
      user_email: userEmail(),
      items: items.filter(function (it) { return it.sku; }).map(function (it) {
        return {
          sku: it.sku,
          qty_diterima: Number(it.qty_diterima),
          qty_reject: Number(it.qty_reject) || 0,
          alasan_reject: it.alasan_reject || '',
          catatan: it.catatan || ''
        };
      })
    };

    busy = true;
    var btn = document.getElementById('btn-save');
    if (btn) btn.disabled = true;
    msg.innerHTML = '<div class="state">Menyimpan receiving...</div>';
    ApiClient.post('receiving_create', payload)
      .then(function (data) {
        msg.innerHTML = '<div class="state">Receiving <b>' + Ui.escapeHtml(data.receiving_id) +
          '</b> dibuat dengan status ' + statusBadge(data.status) + '</div>';
        setTimeout(function () { Router.go('/receiving/' + data.receiving_id); }, 600);
      })
      .catch(function (err) {
        console.error('receiving_create error:', err);
        msg.innerHTML = '<div class="state error">' + Ui.escapeHtml(err.message || 'Gagal menyimpan') + '</div>';
        if (btn) btn.disabled = false;
        busy = false;
      });
  }

  /* ---------------- DETAIL ---------------- */

  function renderDetail(receivingId) {
    busy = false;
    var root = document.getElementById('page-receiving');
    root.innerHTML =
      '<h1>Detail Receiving</h1>' +
      '<div style="margin-bottom:1rem"><a href="#/receiving">&larr; Kembali ke daftar</a></div>' +
      '<div id="receiving-detail"><div class="state">Memuat detail...</div></div>';

    var container = document.getElementById('receiving-detail');
    ApiClient.get('receiving_get', { receiving_id: receivingId })
      .then(function (data) { renderDetailContent(container, data); })
      .catch(function (err) {
        console.error('receiving_get error:', err);
        Ui.showError(container, 'Tidak dapat memuat detail. ' + (err.message || ''));
      });
  }

  function renderDetailContent(container, data) {
    var html =
      '<div class="section">' +
      '  <div class="detail-grid">' +
      '    <div><span class="detail-label">Receiving ID</span><br><b>' + Ui.escapeHtml(data.receiving_id) + '</b></div>' +
      '    <div><span class="detail-label">Tanggal</span><br>' + Ui.escapeHtml(Ui.displayValue(data.tanggal)) + '</div>' +
      '    <div><span class="detail-label">Supplier</span><br>' + Ui.escapeHtml(data.supplier) + '</div>' +
      '    <div><span class="detail-label">Nomor PO</span><br>' + Ui.escapeHtml(data.nomor_po) + '</div>' +
      '    <div><span class="detail-label">Status</span><br>' + statusBadge(data.status) + '</div>' +
      '  </div>' +
      '</div>' +
      '<div class="section"><h2>Detail Item</h2><div id="detail-items"></div></div>' +
      '<div id="detail-action"></div>' +
      '<div id="detail-msg" style="margin-top:0.75rem"></div>';

    container.innerHTML = html;

    Ui.renderTable(document.getElementById('detail-items'), [
      { key: 'sku', label: 'SKU' },
      { key: 'nama_produk', label: 'Nama Produk' },
      { key: 'qty_diterima', label: 'Qty Diterima', numeric: true, format: Ui.formatNumber },
      { key: 'qty_reject', label: 'Qty Reject', numeric: true, format: Ui.formatNumber },
      { key: 'qty_diterima_qc', label: 'Qty QC', numeric: true, format: Ui.formatNumber }
    ], data.items || []);

    renderStatusAction(data);
  }

  function renderStatusAction(data) {
    var actionEl = document.getElementById('detail-action');
    var id = data.receiving_id;

    if (data.status === 'DRAFT') {
      actionEl.innerHTML = '<button class="btn" id="btn-submit">Submit Verifikasi</button>';
      document.getElementById('btn-submit').addEventListener('click', function () {
        doAction('receiving_submit', { receiving_id: id, user_email: userEmail() },
          'Mengirim untuk verifikasi...', id);
      });
    } else if (data.status === 'MENUNGGU_VERIFIKASI') {
      actionEl.innerHTML = '<button class="btn" id="btn-verify">Verifikasi Receiving</button>';
      document.getElementById('btn-verify').addEventListener('click', function () {
        var ok = window.confirm('Verifikasi receiving ini dan masukkan barang yang lolos QC ke stok?');
        if (ok) {
          doAction('receiving_verify', { receiving_id: id, user_email: userEmail() },
            'Memverifikasi...', id);
        }
      });
    } else if (data.status === 'TERVERIFIKASI') {
      actionEl.innerHTML = '<div class="state">Sudah Diverifikasi.</div>';
    } else {
      actionEl.innerHTML = '';
    }
  }

  function doAction(action, payload, loadingMsg, receivingId) {
    if (busy) return;
    busy = true;
    var msg = document.getElementById('detail-msg');
    var btn = document.querySelector('#detail-action .btn');
    if (btn) btn.disabled = true;
    msg.innerHTML = '<div class="state">' + Ui.escapeHtml(loadingMsg) + '</div>';

    ApiClient.post(action, payload)
      .then(function (data) {
        var info = '';
        if (action === 'receiving_verify') {
          info = '<div class="state">Terverifikasi. Movement dibuat: <b>' +
            Ui.formatNumber(data.movement_dibuat) + '</b>, dilewati: <b>' +
            Ui.formatNumber(data.movement_dilewati) + '</b>.</div>';
        } else {
          info = '<div class="state">Status: ' + statusBadge(data.status) + '</div>';
        }
        msg.innerHTML = info;
        setTimeout(function () { renderDetail(receivingId); }, 700);
      })
      .catch(function (err) {
        console.error(action + ' error:', err);
        msg.innerHTML = '<div class="state error">' + Ui.escapeHtml(err.message || 'Aksi gagal') + '</div>';
        if (btn) btn.disabled = false;
        busy = false;
      });
  }

  return {
    renderList: renderList,
    renderDetail: renderDetail
  };
})();

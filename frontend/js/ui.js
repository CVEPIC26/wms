// Helper UI bersama: formatting, state, dan rendering sederhana.
// Tidak ada business logic stok di sini — hanya presentasi.

var Ui = (function () {
  'use strict';

  // Format angka locale Indonesia (1000 -> 1.000). Nilai asli tidak diubah.
  function formatNumber(value) {
    if (value === null || value === undefined || value === '') return '-';
    var num = Number(value);
    if (isNaN(num)) return '-';
    return num.toLocaleString('id-ID');
  }

  // Tampilkan nilai; null/undefined/NaN menjadi "-".
  function displayValue(value) {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'number' && isNaN(value)) return '-';
    if (value === '') return '-';
    return String(value);
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setState(container, type, message) {
    var className = 'state';
    if (type === 'error') className += ' error';
    else if (type === 'success') className += ' success';
    else if (type === 'loading') className += ' loading';
    container.innerHTML = '<div class="' + className + '">' + escapeHtml(message) + '</div>';
  }

  // Badge status terpusat. Mendukung status transaksi WMS dan tipe movement.
  // Mengembalikan string HTML badge yang aman (status di-escape).
  function statusBadge(status) {
    var s = displayValue(status);
    var cls = 'badge';
    if (/^TERVERIFIKASI$/i.test(s) || /^DISETUJUI$/i.test(s)) cls += ' badge-done';
    else if (/^MENUNGGU_VERIFIKASI$/i.test(s)) cls += ' badge-waiting';
    else if (/^DRAFT$/i.test(s)) cls += ' badge-draft';
    return '<span class="' + cls + '">' + escapeHtml(s) + '</span>';
  }

  function showLoading(container, message) {
    setState(container, 'loading', message || 'Memuat...');
  }

  function showError(container, message) {
    setState(container, 'error', message || 'Tidak dapat memuat data.');
  }

  function showEmpty(container, message) {
    setState(container, 'empty', message || 'Belum ada data.');
  }

  // Render tabel generik. columns: [{ key, label, numeric, format }]
  function renderTable(container, columns, rows) {
    if (!rows || rows.length === 0) {
      showEmpty(container);
      return;
    }
    var html = '<div class="table-wrap"><table class="data"><thead><tr>';
    columns.forEach(function (col) {
      html += '<th>' + escapeHtml(col.label) + '</th>';
    });
    html += '</tr></thead><tbody>';
    rows.forEach(function (row) {
      html += '<tr>';
      columns.forEach(function (col) {
        var raw = row[col.key];
        var val = col.format ? col.format(raw, row) : displayValue(raw);
        var cls = col.numeric ? ' class="num"' : '';
        html += '<td' + cls + '>' + escapeHtml(val) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  return {
    formatNumber: formatNumber,
    displayValue: displayValue,
    escapeHtml: escapeHtml,
    statusBadge: statusBadge,
    showLoading: showLoading,
    showError: showError,
    showEmpty: showEmpty,
    renderTable: renderTable
  };
})();

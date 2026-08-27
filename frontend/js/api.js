// API client terpusat untuk backend WMS (Google Apps Script Web App).
// Seluruh pemanggilan backend melewati modul ini — tidak ada fetch
// terpisah di halaman.

var ApiClient = (function () {
  'use strict';

  function buildUrl(action, params) {
    if (!APP_CONFIG.API_BASE_URL) {
      throw new Error('API_BASE_URL belum dikonfigurasi di js/config.js');
    }
    var query = ['action=' + encodeURIComponent(action)];
    params = params || {};
    Object.keys(params).forEach(function (key) {
      if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
        query.push(encodeURIComponent(key) + '=' + encodeURIComponent(params[key]));
      }
    });
    return APP_CONFIG.API_BASE_URL + '?' + query.join('&');
  }

  // Ubah error fetch (mis. "Failed to fetch") menjadi pesan yang lebih
  // informatif agar root cause mudah didiagnosis.
  function wrapNetworkError(err, action) {
    var e = new Error(
      'Gagal terhubung ke server untuk aksi "' + action + '". ' +
      'Periksa koneksi internet dan status deployment Google Apps Script ' +
      '(Deploy → Manage deployments → New version). Detail: ' +
      (err && err.message ? err.message : err)
    );
    e.isHandled = true;
    e.errorCode = 'NETWORK_ERROR';
    e.cause = err;
    return e;
  }

  function parseResponse(action, res) {
    // HTTP error / halaman error (mis. 403, 405, halaman HTML dari backend).
    if (!res.ok) {
      var httpErr = new Error(
        'Server merespons HTTP ' + res.status + ' untuk aksi "' + action + '".'
      );
      httpErr.isHandled = true;
      httpErr.errorCode = 'API_ERROR';
      httpErr.status = res.status;
      throw httpErr;
    }

    return res.text().then(function (text) {
      var json = null;
      try {
        // Apps Script Web App bisa mengikuti redirect; parse JSON pada teks
        // final, bukan mengandalkan content-type response.
        json = JSON.parse(text);
      } catch (e) {
        var badErr = new Error(
          'Respons server bukan JSON untuk aksi "' + action + '". ' +
          'Kemungkinan error page Apps Script. Teks awal: ' +
          String(text).slice(0, 120)
        );
        badErr.isHandled = true;
        badErr.errorCode = 'API_ERROR';
        throw badErr;
      }

      if (!json || json.success !== true) {
        var message = (json && json.message) ? json.message : 'Terjadi kesalahan pada server';
        var err = new Error(message);
        err.isHandled = true;
        err.errorCode = (json && json.error_code) || 'INTERNAL_ERROR';
        throw err;
      }
      return json.data;
    });
  }

  function apiGet(action, params) {
    var url = buildUrl(action, params);
    return fetch(url, { method: 'GET' })
      .catch(function (err) { throw wrapNetworkError(err, action); })
      .then(function (res) { return parseResponse(action, res); });
  }

  function apiPost(action, payload) {
    var url = buildUrl(action);
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload || {})
    })
      .catch(function (err) { throw wrapNetworkError(err, action); })
      .then(function (res) { return parseResponse(action, res); });
  }

  return {
    get: apiGet,
    post: apiPost
  };
})();

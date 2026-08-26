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

  function parseResponse(json) {
    if (!json || json.success !== true) {
      var message = (json && json.message) ? json.message : 'Terjadi kesalahan pada server';
      var err = new Error(message);
      err.errorCode = json && json.error_code;
      throw err;
    }
    return json.data;
  }

  function apiGet(action, params) {
    return fetch(buildUrl(action, params), { method: 'GET' })
      .then(function (res) { return res.json(); })
      .then(parseResponse);
  }

  function apiPost(action, payload) {
    return fetch(buildUrl(action), {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload || {})
    })
      .then(function (res) { return res.json(); })
      .then(parseResponse);
  }

  return {
    get: apiGet,
    post: apiPost
  };
})();

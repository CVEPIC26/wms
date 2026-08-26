// Router frontend sederhana berbasis hash.
// Setiap route memetakan ke sebuah halaman (.page) dan handler render.

var Router = (function () {
  'use strict';

  var routes = {};
  var currentRender = null;

  function register(path, renderFn) {
    routes[path] = renderFn;
  }

  function parseHash() {
    var hash = window.location.hash || '#/dashboard';
    return hash.replace(/^#/, '') || '/dashboard';
  }

  function navigate() {
    var path = parseHash();
    var renderFn = routes[path] || routes['/dashboard'];

    // Tandai link sidebar aktif.
    document.querySelectorAll('.sidebar nav a').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('href') === '#' + path);
    });

    // Tampilkan halaman yang sesuai.
    var pageId = 'page' + path.replace(/\//g, '-');
    document.querySelectorAll('.page').forEach(function (page) {
      page.classList.toggle('active', page.id === pageId);
    });

    // Jalankan handler render halaman.
    if (typeof renderFn === 'function') {
      currentRender = renderFn;
      renderFn();
    }

    // Tutup sidebar mobile setelah navigasi.
    document.querySelector('.sidebar').classList.remove('open');
    document.querySelector('.sidebar-backdrop').classList.remove('show');
  }

  function start() {
    window.addEventListener('hashchange', navigate);
    navigate();
  }

  return {
    register: register,
    start: start,
    reload: function () { if (currentRender) currentRender(); }
  };
})();

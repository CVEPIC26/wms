// Router frontend sederhana berbasis hash dengan dukungan parameter path.
// Route: '#/receiving' dan '#/receiving/RCV-...' (param id).

var Router = (function () {
  'use strict';

  var routes = {};
  var currentRender = null;
  var currentParams = [];

  function register(path, renderFn) {
    routes[path] = renderFn;
  }

  function parseHash() {
    var hash = window.location.hash || '#/dashboard';
    var path = hash.replace(/^#/, '') || '/dashboard';
    return path.split('?')[0];
  }

  // Cocokkan path ke route; dukung segmen dinamis ':param'.
  function match(path) {
    if (routes[path]) return { renderFn: routes[path], params: [] };

    var segments = path.split('/').filter(Boolean);
    for (var routePath in routes) {
      var routeSegments = routePath.split('/').filter(Boolean);
      if (routeSegments.length !== segments.length) continue;
      var params = [];
      var ok = true;
      for (var i = 0; i < routeSegments.length; i++) {
        if (routeSegments[i].charAt(0) === ':') {
          params.push(segments[i]);
        } else if (routeSegments[i] !== segments[i]) {
          ok = false;
          break;
        }
      }
      if (ok) return { renderFn: routes[routePath], params: params };
    }
    return { renderFn: routes['/dashboard'], params: [] };
  }

  function navigate() {
    var path = parseHash();
    var matched = match(path);
    currentParams = matched.params;

    // Tandai link sidebar aktif berdasarkan segmen pertama.
    var base = '/' + (path.split('/').filter(Boolean)[0] || 'dashboard');
    document.querySelectorAll('.sidebar nav a').forEach(function (link) {
      link.classList.toggle('active', link.getAttribute('href') === '#' + base);
    });

    // Tampilkan halaman berdasarkan segmen pertama (detail modul tetap
    // memakai halaman modul yang sama).
    var pageId = 'page-' + base.substring(1);
    document.querySelectorAll('.page').forEach(function (page) {
      page.classList.toggle('active', page.id === pageId);
    });

    if (typeof matched.renderFn === 'function') {
      currentRender = matched.renderFn;
      matched.renderFn.apply(null, matched.params);
    }

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
    reload: function () { if (currentRender) currentRender.apply(null, currentParams); },
    go: function (path) { window.location.hash = '#' + path; }
  };
})();

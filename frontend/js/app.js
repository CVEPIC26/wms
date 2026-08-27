// Bootstrap aplikasi WMS: inisialisasi user, sidebar, dan routing.

(function () {
  'use strict';

  function initCurrentUser() {
    var el = document.getElementById('current-user');
    el.textContent = APP_CONFIG.USER_EMAIL
      ? APP_CONFIG.USER_EMAIL
      : 'User belum dikonfigurasi (js/config.js)';
  }

  function initSidebarToggle() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    document.getElementById('menu-toggle').addEventListener('click', function () {
      sidebar.classList.toggle('open');
      backdrop.classList.toggle('show');
    });
    backdrop.addEventListener('click', function () {
      sidebar.classList.remove('open');
      backdrop.classList.remove('show');
    });
  }

  function registerRoutes() {
    Router.register('/dashboard', DashboardPage.render);
    Router.register('/receiving', ReceivingPage.renderList);
    Router.register('/receiving/:id', ReceivingPage.renderDetail);
    Router.register('/stock', StockPage.renderList);
    Router.register('/stock/:sku', StockPage.renderDetail);
    Router.register('/loading', LoadingPage.renderList);
    Router.register('/loading/:id', LoadingPage.renderDetail);

    // Placeholder untuk modul yang sedang dibangun: halaman statis,
    // tidak ada pemanggilan API maupun data dummy.
    ['/opname', '/adjustment']
      .forEach(function (path) {
        Router.register(path, function () { /* halaman placeholder */ });
      });
  }

  function start() {
    initCurrentUser();
    initSidebarToggle();
    registerRoutes();
    Router.start();
  }

  document.addEventListener('DOMContentLoaded', start);
})();

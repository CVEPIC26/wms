// Bootstrap aplikasi WMS: inisialisasi user, sidebar, dan routing.

(function () {
  'use strict';

  function initCurrentUser() {
    var el = document.getElementById('current-user');
    var u = AppState.currentUser;
    if (u) {
      el.innerHTML =
        '<span class="user-name">' + Ui.escapeHtml(UserService.getDisplayName()) + '</span>' +
        '<span class="user-meta">' + Ui.escapeHtml(u.email || '-') + ' · ' +
        Ui.escapeHtml(UserService.getRole()) + '</span>';
    } else {
      el.textContent = AppState.userError || 'User tidak tersedia';
    }
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
    Router.register('/opname', OpnamePage.renderList);
    Router.register('/opname/:id', OpnamePage.renderDetail);
    Router.register('/adjustment', AdjustmentPage.renderList);
    Router.register('/adjustment/:id', AdjustmentPage.renderDetail);
  }

  function showBootError(message) {
    var content = document.querySelector('.content');
    if (content) {
      content.innerHTML = '<div class="section"><div class="state error">' +
        Ui.escapeHtml(message) + '</div></div>';
    }
  }

  function hideSplash() {
    var splash = document.getElementById('splash');
    if (splash) splash.classList.add('hidden');
  }

  function start() {
    initSidebarToggle();
    registerRoutes();

    // Bootstrap: muat current user SEKALI sebelum merender route,
    // sekaligus pastikan splash tampil minimal beberapa saat (tidak terasa
    // "blink" pada koneksi cepat) tetapi tidak memperlambat loading secara
    // nyata — splash hanya menutup transisi bootstrap.
    var splashStart = Date.now();
    var MIN_SPLASH = 1100; // ms

    UserService.loadCurrentUser()
      .then(function () {
        initCurrentUser();
        if (!UserService.isActive()) {
          showBootError('User tidak aktif.');
          setTimeout(hideSplash, MIN_SPLASH);
          return;
        }
        Router.start();
        // Fade-out splash setelah render pertama selesai, dengan durasi
        // minimum agar tidak berkedip.
        var elapsed = Date.now() - splashStart;
        setTimeout(hideSplash, Math.max(0, MIN_SPLASH - elapsed));
      })
      .catch(function (err) {
        console.error('Bootstrap user error:', err);
        initCurrentUser();
        showBootError(err.message || 'Tidak dapat memverifikasi user.');
        setTimeout(hideSplash, MIN_SPLASH);
      });
  }

  document.addEventListener('DOMContentLoaded', start);
})();

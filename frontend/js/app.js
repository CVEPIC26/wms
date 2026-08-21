// WMS - CV Edukasi Pratama Insan Cemerlang
// Tahap awal: navigasi antar modul saja. Logika bisnis (Receiving+QC,
// Stock Opname, verifikasi email, koneksi API) diimplementasikan nanti.

(function () {
  'use strict';

  var navLinks = document.querySelectorAll('.app-nav a');
  var modules = document.querySelectorAll('.module');

  function showModule(name) {
    modules.forEach(function (module) {
      module.classList.toggle('active', module.id === 'module-' + name);
    });
    navLinks.forEach(function (link) {
      link.classList.toggle('active', link.dataset.module === name);
    });
  }

  navLinks.forEach(function (link) {
    link.addEventListener('click', function (event) {
      event.preventDefault();
      showModule(link.dataset.module);
    });
  });
})();

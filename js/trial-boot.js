// Corre antes que el resto. En /prueba/ separa localStorage y sessionStorage
// de la app de producción (mismo dominio github.io).
(function () {
  var path = '';
  try { path = location.pathname || ''; } catch (e) { return; }
  if (!/\/prueba(\/|$)/.test(path)) return;
  document.documentElement.classList.add('trial');
  function wrap(storage) {
    var get = storage.getItem.bind(storage);
    var set = storage.setItem.bind(storage);
    var rem = storage.removeItem.bind(storage);
    storage.getItem = function (key) { return get('prueba:' + key); };
    storage.setItem = function (key, value) { return set('prueba:' + key, value); };
    storage.removeItem = function (key) { return rem('prueba:' + key); };
  }
  try { wrap(localStorage); wrap(sessionStorage); } catch (e) { /* modo privado */ }
  document.addEventListener('DOMContentLoaded', function () {
    var title = document.querySelector('.brand-title');
    if (title && !title.querySelector('.trial-name')) {
      title.textContent = '';
      var name = document.createElement('span');
      name.className = 'brand-name';
      name.textContent = 'Mis Partidos';
      var mark = document.createElement('span');
      mark.className = 'trial-name';
      mark.textContent = ' (PRUEBA)';
      title.append(name, mark);
    }
    var banner = document.getElementById('trial-banner');
    function fit() {
      if (!banner) return;
      document.documentElement.style.setProperty('--trial-banner-h', banner.offsetHeight + 'px');
    }
    fit();
    window.addEventListener('resize', fit);
  });
})();

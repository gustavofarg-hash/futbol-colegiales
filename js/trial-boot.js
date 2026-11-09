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
})();

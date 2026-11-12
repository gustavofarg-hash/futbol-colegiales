// Corre antes que el resto. El tema (claro/oscuro/sistema) vale en producción
// y en /prueba/. El aislamiento de storage, el cartel rojo y «(PRUEBA)»
// solo en /prueba/.
(function () {
  var path = '';
  try { path = location.pathname || ''; } catch (e) { path = ''; }
  var trial = /\/prueba(\/|$)/.test(path);
  if (trial) {
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
  }
  var theme = 'auto';
  try {
    var saved = localStorage.getItem('f7c-theme');
    if (saved === 'light' || saved === 'dark' || saved === 'auto') theme = saved;
  } catch (e) { /* modo privado */ }
  var dark = theme === 'dark' || (theme !== 'light' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle('dark', dark);
  var bar = dark ? '#071428' : '#1e4fd7';
  var metas = document.querySelectorAll('meta[name="theme-color"]');
  for (var i = 0; i < metas.length; i++) {
    metas[i].setAttribute('content', bar);
    metas[i].removeAttribute('media');
  }
  var font = document.createElement('link');
  font.rel = 'stylesheet';
  font.href = 'https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700;800&display=swap';
  document.head.appendChild(font);
  if (!trial) return;
  document.addEventListener('DOMContentLoaded', function () {
    var banner = document.getElementById('trial-banner');
    function fit() {
      if (!banner) return;
      document.documentElement.style.setProperty('--trial-banner-h', banner.offsetHeight + 'px');
    }
    fit();
    window.addEventListener('resize', fit);
  });
})();

// Service worker: cachea la app para que abra rápido y funcione sin conexión.
// Subí el número de versión cuando publiques cambios.
const VERSION = 'f7c-v63';
const SHELL = [
  './', 'index.html', 'confirmar.html', 'c/index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/app.js', 'js/store.js', 'js/backup.js', 'js/drive.js', 'js/parser.js', 'js/phone.js', 'js/dates.js', 'js/payments.js', 'js/waiting.js', 'js/reminders.js', 'js/confirm.js', 'js/roster.js', 'js/guests.js', 'js/profile.js', 'js/organizers.js', 'js/venues.js', 'js/ledger.js', 'js/auth.js', 'js/text-size.js', 'js/prices.js', 'js/access.js', 'js/teams.js', 'js/privacy.js', 'js/short.js', 'js/shorten.js', 'js/short-go.js', 'js/edit-lock.js',
  'icons/favicon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!sameOrigin && !firebaseSdk) return; // Firestore y demás: siempre a la red

  if (firebaseSdk) {
    // versión fija => cache-first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); return res;
    })));
    return;
  }
  // App propia: red primero (para recibir actualizaciones), cache si no hay conexión
  e.respondWith(
    fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html')))
  );
});

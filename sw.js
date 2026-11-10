// Service worker: cachea la app para que abra rápido y funcione sin conexión.
// Subí el número de versión cuando publiques cambios.
const VERSION = 'f7c-v134';
const TRIAL = self.location.pathname.includes('/prueba/');
const CACHE = (TRIAL ? 'prueba-' : '') + VERSION;
const SHELL = [
  './', 'index.html', 'confirmar.html', 'c/index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/trial-boot.js', 'js/trial.js', 'js/theme.js', 'js/tap.js', 'js/app.js', 'js/store.js', 'js/backup.js', 'js/drive.js', 'js/parser.js', 'js/phone.js', 'js/dates.js', 'js/payments.js', 'js/waiting.js', 'js/reminders.js', 'js/confirm.js', 'js/roster.js', 'js/guests.js', 'js/profile.js', 'js/organizers.js', 'js/venues.js', 'js/ledger.js', 'js/auth.js', 'js/text-size.js', 'js/prices.js', 'js/access.js', 'js/teams.js', 'js/privacy.js', 'js/short.js', 'js/shorten.js', 'js/short-go.js', 'js/edit-lock.js', 'js/credit.js', 'js/compensate.js', 'js/stats.js', 'js/log.js', 'js/notify.js',
  'icons/favicon.svg', 'icons/shield-ball.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];

function ownCache(key) {
  return TRIAL ? key.startsWith('prueba-') : !key.startsWith('prueba-');
}

self.addEventListener('install', (e) => {
  // Pages manda max-age=600. addAll usaría esa caché HTTP y guardaría
  // archivos viejos en la caché nueva. reload pide cada uno al servidor.
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (path) => {
      const url = new URL(path, self.location).href;
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res.ok) throw new Error(path);
      await cache.put(url, res);
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => ownCache(key) && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const open = clients.find((client) => client.url && client.url.includes(self.registration.scope)) || clients[0];
    if (open) return open.focus();
    if (self.clients.openWindow) return self.clients.openWindow('./');
    return undefined;
  }));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (!TRIAL && url.origin === self.location.origin && url.pathname.includes('/prueba/')) return;
  const sameOrigin = url.origin === self.location.origin;
  const firebaseSdk = url.hostname === 'www.gstatic.com' && url.pathname.startsWith('/firebasejs/');
  if (!sameOrigin && !firebaseSdk) return; // Firestore y demás: siempre a la red

  if (firebaseSdk) {
    // versión fija => cache-first
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res;
    })));
    return;
  }
  // App propia: revalida con el servidor (304 si no cambió). Sin red, la caché del SW.
  const offline = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'));
  e.respondWith(
    fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }
      if (res.status === 304) return offline();
      return res;
    }).catch(offline)
  );
});

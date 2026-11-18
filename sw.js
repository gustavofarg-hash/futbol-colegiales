// Service worker: cachea la app para que abra rápido y funcione sin conexión.
// Subí el número de versión cuando publiques cambios.
const VERSION = 'f7c-v217';
// Las pruebas marcan __F7C_TEST y no deben dejar este worker contra el proyecto real.
const TRIAL = self.location.pathname.includes('/prueba/');
const CACHE = (TRIAL ? 'prueba-' : '') + VERSION;
const SHELL = [
  './', 'index.html', 'confirmar.html', 'c/index.html', 'styles.css', 'config.js', 'manifest.webmanifest',
  'js/trial-boot.js', 'js/trial.js', 'js/theme.js', 'js/tap.js', 'js/app.js', 'js/store.js', 'js/backup.js', 'js/drive.js', 'js/parser.js', 'js/phone.js', 'js/dates.js', 'js/payments.js', 'js/waiting.js', 'js/reminders.js', 'js/confirm.js', 'js/roster.js', 'js/behavior.js', 'js/guests.js', 'js/profile.js', 'js/organizers.js', 'js/venues.js', 'js/ledger.js', 'js/auth.js', 'js/text-size.js', 'js/prices.js', 'js/access.js', 'js/teams.js', 'js/privacy.js', 'js/short.js', 'js/shorten.js', 'js/short-go.js', 'js/edit-lock.js', 'js/credit.js', 'js/compensate.js', 'js/stats.js', 'js/log.js', 'js/notify.js', 'js/self-signup.js', 'js/push.js',
  'icons/favicon.png', 'icons/favicon-32.png', 'icons/favicon-48.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/maskable-512.png', 'icons/badge-mono.png',
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

function openNotification(target) {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
    const open = clients.find((client) => client.url && client.url.includes(self.registration.scope));
    if (open) {
      open.postMessage({ type: 'open', url: target });
      return open.focus();
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
    return undefined;
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification?.data || {};
  const action = event.action || '';
  if ((action === 'aceptar' || action === 'rechazar') && data.actionToken && data.decideUrl) {
    event.waitUntil((async () => {
      let ok = false;
      try {
        const res = await fetch(data.decideUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token: data.actionToken, decision: action }),
        });
        ok = res.ok;
      } catch { ok = false; }
      const body = ok
        ? (action === 'aceptar' ? 'Aceptado' : 'Rechazado')
        : 'No se pudo. Abrí Jugadores a confirmar.';
      await self.registration.showNotification('Mis Partidos', {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-mono.png',
        tag: data.tag || 'f7c-push',
        data: { url: data.url || './' },
      });
    })());
    return;
  }
  event.waitUntil(openNotification(data.url || './'));
});

if (TRIAL) {
  try {
    importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-app-compat.js');
    importScripts('https://www.gstatic.com/firebasejs/13.0.0/firebase-messaging-compat.js');
    firebase.initializeApp({
      apiKey: 'AIzaSyCRdic552hOtfmVnR2LIQVNZOi2dub_2DU',
      authDomain: 'mis-partidos-prueba.firebaseapp.com',
      projectId: 'mis-partidos-prueba',
      storageBucket: 'mis-partidos-prueba.firebasestorage.app',
      messagingSenderId: '131662006103',
      appId: '1:131662006103:web:37bdf25201ab3465742012',
    });
    firebase.messaging().onBackgroundMessage((payload) => {
      const data = payload.data || {};
      const title = data.title || payload.notification?.title || 'Mis Partidos';
      const body = data.body || payload.notification?.body || '';
      const note = {
        body,
        icon: 'icons/icon-192.png',
        badge: 'icons/badge-mono.png',
        data: {
          url: data.url || './',
          kind: data.kind || '',
          actionToken: data.actionToken || '',
          decideUrl: data.decideUrl || '',
          playerId: data.playerId || '',
          tag: data.tag || 'f7c-push',
        },
        tag: data.tag || 'f7c-push',
      };
      if (data.kind === 'alta' && data.actionToken && data.decideUrl) {
        note.actions = [
          { action: 'aceptar', title: 'Aceptar' },
          { action: 'rechazar', title: 'Rechazar' },
        ];
      }
      return self.registration.showNotification(title, note);
    });
  } catch (error) {
    // Sin el script de mensajería la app sigue. El aviso con la app cerrada no llega.
  }
}

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
  // App propia: si ya está en la caché, se muestra al toque y se revalida atrás.
  // Sin caché, se espera al servidor. Sin red, queda lo guardado.
  const offline = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'));
  const refresh = () => fetch(new Request(req.url, { cache: 'no-cache', credentials: 'same-origin' })).then((res) => {
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
    }
    return res;
  });
  e.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) {
      refresh().catch(() => {});
      return cached;
    }
    try {
      const res = await refresh();
      if (res.status === 304) return offline();
      return res;
    } catch {
      return offline();
    }
  })());
});

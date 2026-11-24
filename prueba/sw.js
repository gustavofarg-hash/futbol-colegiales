// Toma el lugar del service worker viejo de Mis Partidos en /futbol-colegiales/,
// borra su caché y manda las navegaciones a /partidos/.
const OLD_PREFIX = '/futbol-colegiales';
const NEW_PREFIX = '/partidos';

function redirectPath(pathname, search, hash) {
  const raw = String(pathname || '') || '/';
  let path;
  if (raw === OLD_PREFIX || raw.startsWith(`${OLD_PREFIX}/`)) {
    path = NEW_PREFIX + raw.slice(OLD_PREFIX.length);
  } else if (raw === NEW_PREFIX || raw.startsWith(`${NEW_PREFIX}/`)) {
    path = raw;
  } else if (raw === '/' || raw === '') {
    path = `${NEW_PREFIX}/`;
  } else {
    path = `${NEW_PREFIX}${raw.startsWith('/') ? raw : `/${raw}`}`;
  }
  if (path === NEW_PREFIX) path = `${NEW_PREFIX}/`;
  return path + String(search || '') + String(hash || '');
}

function redirectUrl(url) {
  const u = new URL(url, self.location.origin);
  return u.origin + redirectPath(u.pathname, u.search, u.hash);
}

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((key) => caches.delete(key)));
    await self.clients.claim();
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    await Promise.all(windows.map((client) => {
      const next = redirectUrl(client.url);
      if (next !== client.url && client.navigate) return client.navigate(next);
      return undefined;
    }));
    await self.registration.unregister();
  })());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname === OLD_PREFIX || url.pathname.startsWith(`${OLD_PREFIX}/`)) {
    event.respondWith(Response.redirect(redirectUrl(url), 302));
  }
});

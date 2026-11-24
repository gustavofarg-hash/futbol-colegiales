/** Pure mapping: /futbol-colegiales… → /partidos…, keeps search and hash. */
export const OLD_PREFIX = '/futbol-colegiales';
export const NEW_PREFIX = '/partidos';

export function redirectPath(pathname, search = '', hash = '') {
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

export function redirectUrl(loc) {
  const origin = String(loc?.origin || 'https://gustavofarg-hash.github.io').replace(/\/$/, '');
  return origin + redirectPath(loc?.pathname, loc?.search, loc?.hash);
}

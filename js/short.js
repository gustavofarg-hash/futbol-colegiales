/** Link corto de confirmación. 8 caracteres base62, sin terceros. */

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const SHORT_LEN = 8;
const CONFIRM_ORIGIN = 'https://gustavofarg-hash.github.io/futbol-colegiales';

export function isShortCode(value) {
  return typeof value === 'string' && new RegExp(`^[0-9A-Za-z]{${SHORT_LEN}}$`).test(value);
}

/** 8 caracteres. Se descartan los bytes que sesgarían el módulo. */
export function newShortCode() {
  const out = [];
  const buf = new Uint8Array(16);
  while (out.length < SHORT_LEN) {
    crypto.getRandomValues(buf);
    for (const b of buf) {
      if (b >= 248) continue;
      out.push(ALPHABET[b % 62]);
      if (out.length === SHORT_LEN) break;
    }
  }
  return out.join('');
}

/** https://…/futbol-colegiales/c/?k=Ab3x9Zk2 */
export function shortConfirmUrl(code, origin = CONFIRM_ORIGIN) {
  const base = origin.endsWith('/') ? origin : `${origin}/`;
  const url = new URL('c/', base);
  url.searchParams.set('k', code);
  return url.href;
}

export function confirmTarget({ m, p, t, href = '' } = {}) {
  const url = new URL('confirmar.html', href || `${CONFIRM_ORIGIN}/`);
  url.searchParams.set('m', m || '');
  url.searchParams.set('p', p || '');
  url.searchParams.set('t', t || '');
  return url.href;
}

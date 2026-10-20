// Acorta el link de confirmación al mandarlo. No se llama al abrir la pantalla.
// Primero spoo.me, después da.gd. Si ninguno devuelve un https válido, queda el link propio.

export const SPOO_SHORT_RE = /^https:\/\/spoo\.me\/\w+$/;
export const DAGD_SHORT_RE = /^https:\/\/da\.gd\/\w+$/;
export const SHORTEN_TIMEOUT_MS = 3000;

const SPOO_ENDPOINT = 'https://spoo.me/api/v1/shorten';

/** Cache de links/{id}. El proveedor tiene que coincidir con el host. */
export function acceptedExternalShort(row) {
  const url = typeof row?.shortUrl === 'string' ? row.shortUrl.trim() : '';
  if (row?.shortProvider === 'spoo' && SPOO_SHORT_RE.test(url)) return { shortUrl: url, shortProvider: 'spoo' };
  if (row?.shortProvider === 'dagd' && DAGD_SHORT_RE.test(url)) return { shortUrl: url, shortProvider: 'dagd' };
  return null;
}

async function call(fetchImpl, url, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetchImpl(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function trySpoo(longUrl, fetchImpl, timeoutMs) {
  try {
    const res = await call(fetchImpl, SPOO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ long_url: longUrl }),
      credentials: 'omit',
      mode: 'cors',
    }, timeoutMs);
    const data = await res.json().catch(() => null);
    const url = typeof data?.short_url === 'string' ? data.short_url.trim() : '';
    if (!SPOO_SHORT_RE.test(url)) return null;
    return { shortUrl: url, shortProvider: 'spoo' };
  } catch {
    return null;
  }
}

async function tryDagd(longUrl, fetchImpl, timeoutMs) {
  try {
    const res = await call(fetchImpl, `https://da.gd/s?url=${encodeURIComponent(longUrl)}`, {
      method: 'GET',
      credentials: 'omit',
      mode: 'cors',
    }, timeoutMs);
    const text = (await res.text().catch(() => '')).trim();
    if (!DAGD_SHORT_RE.test(text)) return null;
    return { shortUrl: text, shortProvider: 'dagd' };
  } catch {
    return null;
  }
}

/**
 * Intenta spoo.me y, si no sirve, da.gd.
 * El estado HTTP no alcanza: la URL tiene que matchear el regex del servicio.
 * Devuelve null si los dos fallan, contestan basura o se vencen.
 */
export async function shortenExternal(longUrl, { fetchImpl = globalThis.fetch, timeoutMs = SHORTEN_TIMEOUT_MS } = {}) {
  const target = String(longUrl || '').trim();
  if (!/^https:\/\//.test(target)) return null;
  const spoo = await trySpoo(target, fetchImpl, timeoutMs);
  if (spoo) return spoo;
  return tryDagd(target, fetchImpl, timeoutMs);
}

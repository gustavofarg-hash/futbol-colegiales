// Backup a Google Drive.
//
// 1) Con GOOGLE_DRIVE_CLIENT_ID en config.js: Google Identity Services pide
//    permiso (solo drive.file: la app ve únicamente los archivos que crea) y el
//    archivo se sube con la API de Drive a la carpeta «Mis Partidos - backups».
// 2) Sin eso (o si falla): menú de compartir del teléfono con el archivo.
//    Chrome no comparte .json (no está en su lista de tipos), así que se
//    comparte como .txt con el mismo JSON adentro; «Restaurar» lo acepta.
// 3) Si el teléfono no tiene ese menú, se descarga.

export const GIS_SRC = 'https://accounts.google.com/gsi/client';
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_FOLDER = 'Mis Partidos - backups';
const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export function driveClientId(config) {
  const id = String(config?.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  return /^[\w-]+\.apps\.googleusercontent\.com$/.test(id) ? id : '';
}

/** Nombre que Chrome acepta compartir: .txt + text/plain (el contenido sigue siendo JSON). */
export function shareableBackupName(filename) {
  return String(filename || 'Mis_partidos.json').replace(/\.json$/i, '') + '.txt';
}

export function multipartBody(metadata, text, boundary) {
  return [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    text,
    `--${boundary}--`,
    '',
  ].join('\r\n');
}

let gisLoading = null;
export function loadGis(doc = globalThis.document) {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (gisLoading) return gisLoading;
  gisLoading = new Promise((resolve, reject) => {
    const script = doc.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => { gisLoading = null; reject(Object.assign(new Error('No se pudo cargar el acceso de Google.'), { code: 'drive/gis' })); };
    doc.head.appendChild(script);
  });
  return gisLoading;
}

let cached = null; // { token, until }
export function forgetDriveToken() { cached = null; }

/** Pide el permiso (ventana de Google). Llamar desde el toque del botón. */
export function requestDriveToken(clientId, { now = Date.now, hint = '' } = {}) {
  if (cached && cached.until > now() + 60_000) return Promise.resolve(cached.token);
  return new Promise((resolve, reject) => {
    const oauth2 = globalThis.google?.accounts?.oauth2;
    if (!oauth2) { reject(Object.assign(new Error('El acceso de Google no cargó.'), { code: 'drive/gis' })); return; }
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      hint: hint || undefined,
      callback: (res) => {
        if (!res || res.error || !res.access_token) {
          reject(Object.assign(new Error(res?.error_description || res?.error || 'Google no dio permiso.'), { code: 'drive/denied' }));
          return;
        }
        cached = { token: res.access_token, until: now() + (Number(res.expires_in) || 3600) * 1000 };
        resolve(res.access_token);
      },
      error_callback: (err) => reject(Object.assign(new Error(err?.message || 'Se cerró la ventana de Google.'), { code: err?.type === 'popup_closed' ? 'drive/cancelled' : 'drive/denied' })),
    });
    client.requestAccessToken();
  });
}

async function driveJson(res) {
  if (res.ok) return res.json();
  let detail = '';
  try { detail = (await res.json())?.error?.message || ''; } catch { /* sin cuerpo */ }
  if (res.status === 401) forgetDriveToken();
  throw Object.assign(new Error(detail || `Drive respondió ${res.status}`), { code: `drive/${res.status}` });
}

/** La carpeta de backups que creó la app (drive.file solo ve esas). Si no está, la crea. */
export async function ensureBackupFolder(token, fetchImpl = globalThis.fetch) {
  const headers = { Authorization: `Bearer ${token}` };
  const q = `mimeType='${FOLDER_MIME}' and name='${DRIVE_FOLDER.replace(/'/g, "\\'")}' and trashed=false`;
  const found = await driveJson(await fetchImpl(`${API}?q=${encodeURIComponent(q)}&fields=files(id)&spaces=drive&pageSize=1`, { headers }));
  if (found.files?.[0]?.id) return found.files[0].id;
  const made = await driveJson(await fetchImpl(`${API}?fields=id`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: DRIVE_FOLDER, mimeType: FOLDER_MIME }),
  }));
  return made.id;
}

export async function uploadBackupToDrive({ token, filename, text, fetchImpl = globalThis.fetch, boundary = `f7c${Math.random().toString(36).slice(2)}` }) {
  const folder = await ensureBackupFolder(token, fetchImpl);
  const body = multipartBody({ name: filename, mimeType: 'application/json', parents: folder ? [folder] : undefined }, text, boundary);
  return driveJson(await fetchImpl(UPLOAD, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  }));
}

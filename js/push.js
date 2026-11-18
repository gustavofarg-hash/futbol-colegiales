// Aviso en el teléfono, también con la app cerrada.
// Sin la clave VAPID no pide el token: el interruptor de Ajustes sigue
// prendiendo los avisos de la app. En /prueba/ esa clave queda vacía.
import { FCM_VAPID_KEY, firebaseConfig } from '../config.js';

const FB = 'https://www.gstatic.com/firebasejs/13.0.0';

export function tokenDocId(uid, token) {
  const owner = String(uid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  const tail = String(token || '').replace(/[^A-Za-z0-9]/g, '').slice(-24);
  if (!owner || !tail) return '';
  return `${owner}_${tail}`;
}

export function playerPushAvailable() {
  return String(FCM_VAPID_KEY || '').trim().length > 0;
}

/** En el iPhone el aviso solo llega si la página está en la pantalla de inicio. */
export function iosPushHint() {
  if (typeof navigator === 'undefined') return '';
  const ua = navigator.userAgent || '';
  const ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  if (!ios) return '';
  let standalone = navigator.standalone === true;
  try { standalone = standalone || window.matchMedia('(display-mode: standalone)').matches; } catch { /* sigue el aviso */ }
  if (standalone) return '';
  return 'En el iPhone, agregá la página a la pantalla de inicio para recibir el aviso.';
}

export async function registerOrganizerPush(store) {
  const vapidKey = String(FCM_VAPID_KEY || '').trim();
  if (!vapidKey) return { ok: false, reason: 'no-vapid' };
  if (typeof Notification === 'undefined') return { ok: false, reason: 'no-notification' };
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return { ok: false, reason: 'no-sw' };
  const [{ initializeApp, getApps, getApp }, { getMessaging, getToken }] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-messaging.js`),
  ]);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
  if (!token) return { ok: false, reason: 'no-token' };
  await store.savePushToken(token);
  return { ok: true, token };
}

export async function registerPlayerPush(store, rosterId) {
  const vapidKey = String(FCM_VAPID_KEY || '').trim();
  if (!vapidKey) return { ok: false, reason: 'no-vapid' };
  const owner = String(rosterId || '').trim();
  if (!owner) return { ok: false, reason: 'no-roster' };
  if (typeof Notification === 'undefined') return { ok: false, reason: 'no-notification' };
  let perm = Notification.permission;
  if (perm === 'default') perm = await Notification.requestPermission();
  if (perm !== 'granted') return { ok: false, reason: 'denied' };
  const reg = await navigator.serviceWorker?.ready;
  if (!reg) return { ok: false, reason: 'no-sw' };
  const [{ initializeApp, getApps, getApp }, { getMessaging, getToken }] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-messaging.js`),
  ]);
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: reg });
  if (!token) return { ok: false, reason: 'no-token' };
  await store.savePlayerPushToken(owner, token);
  return { ok: true, token };
}

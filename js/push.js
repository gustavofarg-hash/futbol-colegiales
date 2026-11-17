// Aviso en el teléfono del organizador, también con la app cerrada.
// Solo en /prueba/. Sin la clave VAPID no pide el token: el interruptor
// de Ajustes sigue prendiendo los avisos de la app.
import { FCM_VAPID_KEY, firebaseConfig } from '../config.js';
import { isTrialPage } from './trial.js';

const FB = 'https://www.gstatic.com/firebasejs/13.0.0';

export function tokenDocId(uid, token) {
  const owner = String(uid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
  const tail = String(token || '').replace(/[^A-Za-z0-9]/g, '').slice(-24);
  if (!owner || !tail) return '';
  return `${owner}_${tail}`;
}

export async function registerOrganizerPush(store) {
  if (!isTrialPage()) return { ok: false, reason: 'not-trial' };
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

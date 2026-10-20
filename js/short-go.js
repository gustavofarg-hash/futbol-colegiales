// Abre c/?k=CODE y salta a confirmar.html con el mismo m, p y t.
// No registra service worker. El link largo viejo sigue yendo directo.
import { firebaseConfig } from '../config.js';
import { isFirebaseConfigured, DEMO_STORAGE_KEY } from './store.js';
import { confirmTarget, isShortCode } from './short.js';

const $ = (sel) => document.querySelector(sel);
const code = new URLSearchParams(location.search).get('k') || '';

function invalid() {
  const root = $('#go');
  if (root) root.innerHTML = `<div class="empty"><div class="big">🔗</div><p><b>Este link no es válido.</b></p><p class="small">Pedile a Gustavo o a Martín que te lo reenvíen.</p></div>`;
}

function go(link) {
  if (!link || !link.m || !link.p || !link.t) { invalid(); return; }
  location.replace(confirmTarget({ ...link, href: new URL('../confirmar.html', location.href).href }));
}

async function fromFirebase() {
  const version = '13.0.0';
  const base = `https://www.gstatic.com/firebasejs/${version}`;
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig, 'short-link');
  const db = fs.getFirestore(app);
  const snap = await fs.getDoc(fs.doc(db, 'links', code));
  if (!snap.exists()) { invalid(); return; }
  go(snap.data());
}

if (!isShortCode(code)) {
  invalid();
} else if (!isFirebaseConfigured()) {
  let db = {};
  try { db = JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY) || '{}'); } catch { db = {}; }
  go(db.links?.[code]);
} else {
  fromFirebase().catch(() => invalid());
}

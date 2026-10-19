// Página pública de confirmación. No pide "¿Quién sos?" y no registra
// service worker: tiene que abrir directo desde el link de WhatsApp.
// Solo lee el partido y ESE jugador. No muestra teléfonos ni al resto.
import { VENUE, firebaseConfig } from '../config.js';
import { isFirebaseConfigured, DEMO_STORAGE_KEY } from './store.js';
import { capitalize, labelDate } from './dates.js';
import { confirmationAllowed } from './reminders.js';
import { applyTextSize, readTextSize, stepTextSize, TEXT_SIZES } from './text-size.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
syncConfirmText();
$('#btn-text-smaller')?.addEventListener('click', () => { stepTextSize(-1); syncConfirmText(); });
$('#btn-text-bigger')?.addEventListener('click', () => { stepTextSize(1); syncConfirmText(); });

const params = new URLSearchParams(location.search);
const matchId = params.get('m') || '';
const playerId = params.get('p') || '';
const token = params.get('t') || '';

const FB_VERSION = '13.0.0';
const FB = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

function loadDemo() {
  try { return JSON.parse(localStorage.getItem(DEMO_STORAGE_KEY)) || { matches: {}, players: {} }; }
  catch { return { matches: {}, players: {} }; }
}

function viewOf(dbMatch, dbPlayer) {
  return {
    match: dbMatch ? { ...dbMatch } : null,
    player: dbPlayer ? { id: playerId, ...dbPlayer } : null,
  };
}

function cardView(card) {
  if (!card || card.matchId !== matchId || card.playerId !== playerId) return null;
  return {
    match: { date: card.date, time: card.time, note: card.note || '' },
    player: {
      id: playerId,
      name: card.name,
      matchId: card.matchId,
      confirmToken: token,
      confirmed: card.confirmed || null,
      confirmedAt: card.confirmedAt || null,
    },
  };
}

async function loadFirebase() {
  const [{ initializeApp }, fs] = await Promise.all([
    import(`${FB}/firebase-app.js`),
    import(`${FB}/firebase-firestore.js`),
  ]);
  const app = initializeApp(firebaseConfig, 'confirm');
  const db = fs.getFirestore(app);
  const snap = await fs.getDoc(fs.doc(db, 'confirmations', token));
  const view = snap.exists() ? cardView(snap.data()) : null;
  return { fs, db, match: view?.match || null, player: view?.player || null };
}

async function saveFirebase(fs, db, answer) {
  const { doc, getDoc, updateDoc } = fs;
  const ref = doc(db, 'confirmations', token);
  await updateDoc(ref, {
    confirmed: answer,
    confirmedAt: Date.now(),
  });
  const snap = await getDoc(ref);
  if (!snap.exists() || snap.data().confirmed !== answer) {
    throw new Error('La respuesta no quedó guardada');
  }
}

function syncConfirmText() {
  const i = applyTextSize(readTextSize());
  const smaller = $('#btn-text-smaller');
  const bigger = $('#btn-text-bigger');
  if (smaller) smaller.disabled = i === 0;
  if (bigger) bigger.disabled = i === TEXT_SIZES.length - 1;
}

function saveDemo(answer) {
  const db = loadDemo();
  db.confirmations ||= {};
  const card = db.confirmations[token];
  const player = db.players?.[playerId];
  const allowed = card
    ? card.matchId === matchId && card.playerId === playerId
    : confirmationAllowed(player, matchId, token);
  if (!allowed) return false;
  const now = Date.now();
  if (card) {
    card.confirmed = answer;
    card.confirmedAt = now;
  }
  if (player && player.confirmToken === token) {
    player.confirmed = answer;
    player.confirmedAt = now;
    player.updatedAt = now;
  }
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
  return true;
}

function render(state) {
  const root = $('#confirm');
  const { match, player, error } = state;
  if (error || !confirmationAllowed(player, matchId, token) || !match) {
    root.innerHTML = `<div class="empty"><div class="big">🔗</div><p><b>Este link no es válido.</b></p><p class="small">Pedile a Gustavo o a Martín que te lo reenvíen.</p></div>`;
    return;
  }
  const when = `${capitalize(labelDate(match.date))} · ${match.time || '--:--'} hs`;
  const answered = player.confirmed === 'si' || player.confirmed === 'no';
  const thanks = player.confirmed === 'si'
    ? '¡Gracias! Quedó anotado que jugás.'
    : player.confirmed === 'no'
      ? 'Quedó anotado que no jugás. Si cambiás de idea, tocá de nuevo.'
      : '';
  root.innerHTML = `
    <section class="detail-head confirm-card">
      <h1>${esc(player.name)}</h1>
      <div class="when">${esc(when)}</div>
      <div class="note">${esc(VENUE)}${match.note ? ` · ${esc(match.note)}` : ''}</div>
      <p class="hint">¿Jugás este partido?</p>
      <div class="confirm-actions">
        <button type="button" class="btn primary ${player.confirmed === 'si' ? 'chosen' : ''}" id="btn-si">Sí, juego</button>
        <button type="button" class="btn ${player.confirmed === 'no' ? 'chosen' : ''}" id="btn-no">No juego</button>
      </div>
      <p class="thanks" id="thanks" ${answered ? '' : 'hidden'}>${esc(thanks)}</p>
    </section>`;
  $('#btn-si').onclick = () => choose(state, 'si');
  $('#btn-no').onclick = () => choose(state, 'no');
}

async function choose(state, answer) {
  if (!confirmationAllowed(state.player, matchId, token)) return;
  try {
    if (state.firebase) await saveFirebase(state.fs, state.db, answer);
    else if (!saveDemo(answer)) return;
    state.player.confirmed = answer;
    state.player.confirmedAt = Date.now();
    render(state);
  } catch (e) {
    console.error(e);
    const thanks = $('#thanks');
    if (thanks) { thanks.hidden = false; thanks.textContent = 'No se pudo guardar. Probá de nuevo.'; }
  }
}

async function boot() {
  if (!matchId || !playerId || !token) {
    render({ error: true });
    return;
  }
  try {
    if (isFirebaseConfigured()) {
      const loaded = await loadFirebase();
      render({ ...loaded, firebase: true });
    } else {
      const db = loadDemo();
      const card = db.confirmations?.[token];
      const fromCard = cardView(card);
      const legacy = viewOf(db.matches?.[matchId], db.players?.[playerId]);
      if (legacy.player) delete legacy.player.phone;
      render({ ...(fromCard || legacy), firebase: false });
    }
  } catch (e) {
    console.error(e);
    render({ error: true });
  }
}

boot();

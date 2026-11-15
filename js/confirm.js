// Página pública de confirmación. No pide "¿Quién sos?" y no registra
// service worker: tiene que abrir directo desde el link de WhatsApp.
// Solo lee el partido y ESE jugador. No muestra teléfonos ni al resto.
import { VENUE, firebaseConfig } from '../config.js';
import { isFirebaseConfigured, DEMO_STORAGE_KEY } from './store.js';
import { capitalize, labelDate } from './dates.js';
import { givenName } from './roster.js';
import { confirmationAllowed, confirmSlotText, sharedConfirmAnswer, visibleConfirmSlots } from './reminders.js';

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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
    match: {
      date: card.date,
      time: card.time,
      note: card.note || '',
      notes: card.notes || '',
      cancelled: card.cancelled === true,
      venueName: card.venue || '',
    },
    player: {
      id: playerId,
      name: card.name,
      matchId: card.matchId,
      confirmToken: token,
      confirmed: card.confirmed || null,
      confirmedAt: card.confirmedAt || null,
    },
    slots: visibleConfirmSlots(card.also),
  };
}

function answerOf(value) {
  return value === 'si' || value === 'no' ? value : null;
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
  let slots = view?.slots || [];
  if (slots.length >= 2) {
    const detailed = [];
    for (const slot of slots) {
      if (slot.token === token) {
        if (snap.data()?.cancelled === true) continue;
        detailed.push({ ...slot, confirmed: answerOf(snap.data()?.confirmed) });
        continue;
      }
      const other = await fs.getDoc(fs.doc(db, 'confirmations', slot.token));
      if (!other.exists()) continue;
      const row = other.data() || {};
      if (row.cancelled === true || row.playerId !== slot.playerId) continue;
      detailed.push({
        ...slot,
        date: row.date || slot.date,
        time: row.time || slot.time,
        confirmed: answerOf(row.confirmed),
      });
    }
    slots = visibleConfirmSlots(detailed);
  }
  return { fs, db, match: view?.match || null, player: view?.player || null, slots };
}

async function saveFirebase(fs, db, answer, slots) {
  const { doc, getDoc, updateDoc } = fs;
  const targets = slots?.length >= 2 ? slots : [{ token, playerId }];
  const now = Date.now();
  for (const slot of targets) {
    const ref = doc(db, 'confirmations', slot.token);
    await updateDoc(ref, { confirmed: answer, confirmedAt: now });
    const snap = await getDoc(ref);
    if (!snap.exists() || snap.data().confirmed !== answer) {
      throw new Error('La respuesta no quedó guardada');
    }
  }
}

function saveDemo(answer, slots) {
  const db = loadDemo();
  db.confirmations ||= {};
  const many = slots?.length >= 2 ? slots : null;
  if (!many) {
    const card = db.confirmations[token];
    const player = db.players?.[playerId];
    const allowed = card
      ? card.matchId === matchId && card.playerId === playerId
      : confirmationAllowed(player, matchId, token);
    if (!allowed) return false;
    const match = db.matches?.[matchId];
    if (match?.cancelled === true || card?.cancelled === true) return false;
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
  const openerCard = db.confirmations[token];
  const opener = db.players?.[playerId];
  const allowed = openerCard
    ? openerCard.matchId === matchId && openerCard.playerId === playerId
    : confirmationAllowed(opener, matchId, token);
  if (!allowed) return false;
  const now = Date.now();
  let saved = false;
  for (const slot of many) {
    const player = db.players?.[slot.playerId];
    if (!player || player.confirmToken !== slot.token) continue;
    const card = db.confirmations?.[slot.token];
    const match = db.matches?.[player.matchId];
    if (match?.cancelled === true || card?.cancelled === true) continue;
    if (card) {
      card.confirmed = answer;
      card.confirmedAt = now;
    }
    player.confirmed = answer;
    player.confirmedAt = now;
    player.updatedAt = now;
    saved = true;
  }
  if (!saved) return false;
  localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(db));
  return true;
}

function demoSlots(db, card) {
  const slots = visibleConfirmSlots(card?.also);
  if (slots.length < 2) return slots;
  return visibleConfirmSlots(slots.flatMap((slot) => {
    const player = db.players?.[slot.playerId];
    const row = db.confirmations?.[slot.token];
    if (!player || player.confirmToken !== slot.token || !row) return [];
    const match = db.matches?.[player.matchId];
    if (match?.cancelled === true || row.cancelled === true) return [];
    return [{
      ...slot,
      date: row.date || slot.date,
      time: row.time || slot.time,
      confirmed: answerOf(row.confirmed) || answerOf(player.confirmed),
    }];
  }));
}

function publicName(player) {
  return givenName(player);
}
function render(state) {
  const root = $('#confirm');
  const { match, player, error } = state;
  if (error || !confirmationAllowed(player, matchId, token) || !match) {
    root.innerHTML = `<div class="empty"><p><b>El link ya venció</b></p></div>`;
    return;
  }
  const when = `${capitalize(labelDate(match.date))} · ${match.time || '--:--'} hs`;
  if (match.cancelled === true) {
    const reason = String(match.notes || '').trim();
    root.innerHTML = `
      <section class="detail-head confirm-card">
        <h1>${esc(publicName(player))}</h1>
        <div class="when">${esc(when)}</div>
        <div class="note">${esc(match.venueName || VENUE)}</div>
        <p class="match-cancelled" id="confirm-cancelled">Este partido se canceló.</p>
        ${reason ? `<p class="match-notes-text">${esc(reason)}</p>` : ''}
        <p class="hint">No hace falta confirmar si jugás.</p>
      </section>`;
    return;
  }
  const many = visibleConfirmSlots(state.slots);
  if (many.length >= 2) {
    const answer = sharedConfirmAnswer(many);
    const thanks = answer === 'si'
      ? '¡Gracias! Quedó anotado que jugás.'
      : answer === 'no'
        ? 'Quedó anotado que no jugás.'
        : '';
    const lines = many.map((slot) => `<li>${esc(confirmSlotText(slot))}</li>`).join('');
    const choice = answer
      ? `<p class="confirm-result ${answer}" id="thanks">${esc(thanks)}</p>`
      : `<div class="confirm-actions">
        <button type="button" class="btn primary" id="btn-si">Sí, juego</button>
        <button type="button" class="btn" id="btn-no">No juego</button>
      </div>
      <p class="thanks" id="thanks" hidden></p>`;
    root.innerHTML = `
      <section class="detail-head confirm-card">
        <h1>${esc(publicName(player))}</h1>
        <p class="hint" id="confirm-ask">¿Confirmás que jugás estos partidos?</p>
        <ul class="confirm-slots" id="confirm-slots">${lines}</ul>
        ${choice}
      </section>`;
    const yes = $('#btn-si');
    const no = $('#btn-no');
    if (yes) yes.onclick = () => choose(state, 'si');
    if (no) no.onclick = () => choose(state, 'no');
    return;
  }
  const answered = player.confirmed === 'si' || player.confirmed === 'no';
  const thanks = player.confirmed === 'si'
    ? '¡Gracias! Quedó anotado que jugás.'
    : player.confirmed === 'no'
      ? 'Quedó anotado que no jugás.'
      : '';
  const choice = answered
    ? `<p class="confirm-result ${player.confirmed}" id="thanks">${esc(thanks)}</p>`
    : `<p class="hint">¿Jugás este partido?</p>
      <div class="confirm-actions">
        <button type="button" class="btn primary" id="btn-si">Sí, juego</button>
        <button type="button" class="btn" id="btn-no">No juego</button>
      </div>
      <p class="thanks" id="thanks" hidden></p>`;
  root.innerHTML = `
    <section class="detail-head confirm-card">
      <h1>${esc(publicName(player))}</h1>
      <div class="when">${esc(when)}</div>
      <div class="note">${esc(match.venueName || VENUE)}${match.note ? ` · ${esc(match.note)}` : ''}</div>
      ${choice}
    </section>`;
  const yes = $('#btn-si');
  const no = $('#btn-no');
  if (yes) yes.onclick = () => choose(state, 'si');
  if (no) no.onclick = () => choose(state, 'no');
}

async function choose(state, answer) {
  if (state.match?.cancelled === true) return;
  if (!confirmationAllowed(state.player, matchId, token)) return;
  try {
    const many = visibleConfirmSlots(state.slots);
    if (state.firebase) await saveFirebase(state.fs, state.db, answer, many);
    else if (!saveDemo(answer, many)) return;
    const now = Date.now();
    state.player.confirmed = answer;
    state.player.confirmedAt = now;
    if (many.length >= 2) state.slots = many.map((slot) => ({ ...slot, confirmed: answer, confirmedAt: now }));
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
      const view = fromCard || legacy;
      view.slots = demoSlots(db, card);
      render({ ...view, firebase: false });
    }
  } catch (e) {
    console.error(e);
    render({ error: true });
  }
}

boot();

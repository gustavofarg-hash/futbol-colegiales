import { ACCESS_CODE, ORGANIZERS, CAPACITY, VENUE } from '../config.js';
import { createStore } from './store.js';
import { parseMatchesFromText } from './parser.js';
import { normalizePhone, displayFromWa, waLink } from './phone.js';
import {
  todayISO, addDays, weekdayOf, labelDate, capitalize, relativeLabel, toEpoch,
  DIAS_CORTOS, MESES_CORTOS,
} from './dates.js';
import { collectedLine, parseAmount, paymentStatusText } from './payments.js';
import { moveWaiting, overflowPatches, sortWaiting } from './waiting.js';
import {
  confirmStatus, confirmSummary, matchesCrossingReminderWindow,
  needsReminderBanner, reminderDueAt, reminderLinks, reminderProgress,
} from './reminders.js';
import { ROSTER_DENIED_WRITE, isRosterDenied, rosterByPhone, searchRoster } from './roster.js';

/* ───────── utilidades ───────── */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const WHO_KEY = 'f7c-who';
const CODE_KEY = 'f7c-code';
const ICON = {
  wa: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.7 11.8 11.8 0 0 0 4.5 4c1.7.7 2.3.8 3.2.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.1-1.2l-.4-.2z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  paste: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="3" width="8" height="4" rx="1"/><path d="M16 5h2a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/></svg>',
  share: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M16 6l-4-4-4 4M12 2v14"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
  more: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/></svg>',
};

const app = {
  store: null,
  matches: [],
  players: [],
  roster: [],
  rosterError: null,
  who: localStorage.getItem(WHO_KEY),
  loaded: false,
};
window.__app = app; // útil para depurar / tests

/* ───────── toast ───────── */
let toastTimer;
function toast(msg, ms = 2600) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => (t.hidden = true), ms);
}
function showError(msg) {
  const b = $('#error-banner'); b.textContent = msg; b.hidden = !msg;
}
// Las escrituras a Firestore resuelven cuando el servidor confirma; con caché
// offline la UI no espera: se cierra el formulario y se avisa si falla.
function run(p, okMsg) {
  if (okMsg) toast(okMsg);
  return Promise.resolve(p).catch((e) => { console.error(e); toast('No se pudo guardar: ' + (e.code || e.message || e)); });
}

/* ───────── datos derivados ───────── */
const isWaiting = (p) => p.waiting === true;
const playersOf = (matchId) => app.players
  .filter((p) => p.matchId === matchId && !isWaiting(p))
  .sort((a, b) => (a.rosterAt ?? a.createdAt) - (b.rosterAt ?? b.createdAt));
const waitingOf = (matchId) => sortWaiting(app.players.filter((p) => p.matchId === matchId && isWaiting(p)));
const matchById = (id) => app.matches.find((m) => m.id === id);
const fmtWhen = (m) => `${capitalize(labelDate(m.date))} · ${m.time || '--:--'} hs`;
function sortedMatches() {
  return [...app.matches].sort((a, b) => (a.startsAt ?? toEpoch(a.date, a.time)) - (b.startsAt ?? toEpoch(b.date, b.time)));
}

/* ───────── router ───────── */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  if (name === 'partido' && id) return { name: 'match', id: decodeURIComponent(id) };
  if (name === 'jugadores') return { name: 'roster' };
  return { name: 'home' };
}
window.addEventListener('hashchange', render);

/* ───────── render ───────── */
function render() {
  const r = route();
  $('#btn-back').hidden = r.name === 'home';
  const who = $('#btn-who');
  who.hidden = !app.who; who.textContent = app.who ? `Sos ${app.who}` : '';
  if (!app.loaded) return;
  if (r.name === 'match') renderMatch(r.id);
  else if (r.name === 'roster') renderRoster();
  else renderHome();
}

function matchCard(m) {
  const n = playersOf(m.id).length;
  const cap = m.capacity || CAPACITY;
  const [, mo, d] = m.date.split('-').map(Number);
  const rel = relativeLabel(m.date);
  return `
  <li><a class="match-card" href="#/partido/${encodeURIComponent(m.id)}" data-id="${esc(m.id)}">
    <div class="datebox"><div class="dw">${DIAS_CORTOS[weekdayOf(m.date)]}</div><div class="dd">${d}</div><div class="dm">${MESES_CORTOS[mo - 1]}</div></div>
    <div class="match-info">
      <div class="match-title">${esc(capitalize(labelDate(m.date)))}</div>
      <div class="match-time">${rel ? `<span class="badge">${rel}</span>` : ''}<span>${esc(m.time || '--:--')} hs</span></div>
      ${m.note ? `<div class="match-note">${esc(m.note)}</div>` : ''}
      ${waitingOf(m.id).length ? `<div class="match-note">${waitingOf(m.id).length} en espera</div>` : ''}
    </div>
    <div class="count ${n >= cap ? 'full' : ''}" aria-label="${n} de ${cap} anotados">
      <div class="num">${n}<small>/${cap}</small></div>
      <div class="bar"><i style="width:${Math.min(100, (n / cap) * 100)}%"></i></div>
    </div>
  </a></li>`;
}

function renderHome() {
  const today = todayISO();
  const limit = addDays(today, 6);
  const now = Date.now();
  const all = sortedMatches().filter((m) => m.date >= today && (m.startsAt ?? toEpoch(m.date, m.time)) > now - 2 * 3600e3);
  const next = all.filter((m) => m.date <= limit);
  const later = all.filter((m) => m.date > limit);
  $('#view').innerHTML = `
    ${reminderBanners(next)}
    <a class="btn block roster-nav" id="btn-roster" href="#/jugadores">Jugadores${app.roster.length ? ` · ${app.roster.length}` : ''}</a>
    <h2 class="section">Próximos 7 días</h2>
    ${next.length ? `<ul class="match-list" id="list-next">${next.map(matchCard).join('')}</ul>` : `
      <div class="empty"><div class="big">⚽</div><p><b>No hay partidos en los próximos 7 días.</b></p>
      <p class="small">Agregá uno a mano o pegá un mensaje del grupo de WhatsApp.</p></div>`}
    ${later.length ? `<h2 class="section">Más adelante</h2><ul class="match-list" id="list-later">${later.map(matchCard).join('')}</ul>` : ''}
    <p class="footer-note">${esc(VENUE)} · Fútbol 7 contra 7</p>
    <div class="actionbar"><div class="actionbar-inner">
      <button class="btn" id="btn-import">${ICON.paste}Importar desde texto</button>
      <button class="btn primary" id="btn-add-match">${ICON.plus}Agregar partido</button>
    </div></div>`;
  $('#btn-add-match').onclick = () => openMatchForm();
  $('#btn-import').onclick = () => openImport();
  bindReminderBanners();
}

function renderMatch(id) {
  const m = matchById(id);
  if (!m) {
    $('#view').innerHTML = `<div class="empty"><div class="big">🤷</div><p><b>No encontramos este partido.</b></p><p class="small">Puede que lo hayan borrado.</p><p><a class="btn" href="#/">Volver al inicio</a></p></div>`;
    return;
  }
  const ps = playersOf(id);
  const cap = m.capacity || CAPACITY;
  const slots = [];
  for (let i = 0; i < Math.max(cap, ps.length); i++) {
    const p = ps[i];
    if (!p) {
      slots.push(`<li><button class="slot free" data-free="${i}"><span class="n">${i + 1}</span><span>Lugar libre · tocá para anotar</span></button></li>`);
      continue;
    }
    const tagCls = p.addedBy === ORGANIZERS[0] ? 'g' : p.addedBy === ORGANIZERS[1] ? 'm' : '';
    const payText = paymentStatusText(p);
    const payCls = p.paid === true ? 'ok' : 'no';
    slots.push(`
      <li class="slot ${i >= cap ? 'extra' : ''}" data-player="${esc(p.id)}">
        <span class="n">${i + 1}</span>
        <div class="who">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${p.phone ? `<span>${esc(displayFromWa(p.phone))}</span>` : '<span>Sin número</span>'}
            <span class="tag ${tagCls}">Agregó: ${esc(p.addedBy || '?')}</span>${confirmTag(p)}${i >= cap ? '<span class="tag">Excede el cupo</span>' : ''}</div>
          ${payText ? `<div class="pay-line ${payCls}">${esc(payText)}</div>` : ''}
        </div>
        <button type="button" class="pay-btn ${p.paid === true ? 'on' : ''}" data-pay="${esc(p.id)}" aria-label="Pago de ${esc(p.name)}${payText ? ': ' + esc(payText) : ''}">💵</button>
        ${p.phone ? `<a class="wa-btn" href="${esc(waLink(p.phone, waMessage(m, p)))}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(p.name)}">${ICON.wa}</a>` : ''}
        <button class="more-btn" data-menu="${esc(p.id)}" aria-label="Opciones de ${esc(p.name)}">${ICON.more}</button>
      </li>`);
  }
  const full = ps.length >= cap;
  const collected = collectedLine(ps);
  $('#view').innerHTML = `
    <section class="detail-head">
      <h1>${esc(capitalize(labelDate(m.date)))}</h1>
      <div class="when">${relativeLabel(m.date) ? `<span class="badge">${relativeLabel(m.date)}</span> ` : ''}${esc(m.time || '--:--')} hs · ${esc(VENUE)}</div>
      ${m.note ? `<div class="note">📝 ${esc(m.note)}</div>` : ''}
      <div class="meta"><strong id="slot-count">${ps.length}/${cap}</strong><div class="bar"><i style="width:${Math.min(100, (ps.length / cap) * 100)}%"></i></div><span class="muted small">${full ? '¡Completo!' : `Faltan ${cap - ps.length}`}</span></div>
      ${collected ? `<div class="collected" id="collected">${esc(collected)}</div>` : ''}
      ${(ps.length || waitingOf(id).length) ? `<div class="confirm-sum" id="confirm-sum">${esc(confirmSummary([...ps, ...waitingOf(id)]).text)}</div>` : ''}
      <div class="detail-tools">
        <button class="btn" id="btn-copy">${ICON.copy}Copiar lista</button>
        <button class="btn" id="btn-edit-match">${ICON.edit}Editar</button>
        <button class="btn danger" id="btn-del-match">${ICON.trash}Borrar</button>
      </div>
    </section>
    ${reminderBanners([m])}
    <button type="button" class="btn block remind-open" id="btn-remind">Recordatorio de partido</button>
    <h2 class="section">Jugadores</h2>
    <ul class="slots" id="slots">${slots.join('')}</ul>
    ${waitingSection(m, ps.length >= cap)}
    <div class="actionbar"><div class="actionbar-inner">
      <button class="btn" id="btn-share">${ICON.share}Compartir lista</button>
      <button class="btn primary" id="btn-add-player">${ICON.plus}${full ? 'A la espera' : 'Agregar jugador'}</button>
    </div></div>`;

  $('#btn-remind').onclick = () => openReminders(m);
  bindReminderBanners();
  $('#btn-add-player').onclick = () => openPlayerForm(m);
  $('#btn-add-wait').onclick = () => openPlayerForm(m, null, { waiting: true });
  $('#btn-promote').onclick = () => promoteTop(m);
  $('#wait-list').onclick = (e) => {
    const up = e.target.closest('[data-wait-up]');
    if (up) return moveWait(m.id, up.dataset.waitUp, -1, up.disabled);
    const down = e.target.closest('[data-wait-down]');
    if (down) return moveWait(m.id, down.dataset.waitDown, 1, down.disabled);
    const pay = e.target.closest('[data-pay]');
    if (pay) return openPaymentForm(m, app.players.find((p) => p.id === pay.dataset.pay));
    const menu = e.target.closest('[data-menu]');
    if (menu) return openPlayerMenu(m, app.players.find((p) => p.id === menu.dataset.menu));
  };
  $('#slots').onclick = (e) => {
    const pay = e.target.closest('[data-pay]');
    if (pay) return openPaymentForm(m, app.players.find((p) => p.id === pay.dataset.pay));
    const free = e.target.closest('[data-free]');
    if (free) return openPlayerForm(m);
    const menu = e.target.closest('[data-menu]');
    if (menu) return openPlayerMenu(m, app.players.find((p) => p.id === menu.dataset.menu));
  };
  $('#btn-copy').onclick = () => copyText(listText(m)).then((ok) => toast(ok ? 'Lista copiada' : 'No se pudo copiar'));
  $('#btn-share').onclick = () => shareText(listText(m));
  $('#btn-edit-match').onclick = () => openMatchForm(m);
  $('#btn-del-match').onclick = () => {
    const n = playersOf(m.id).length + waitingOf(m.id).length;
    if (!confirm(`¿Borrar el partido del ${labelDate(m.date)} ${m.time} hs${n ? ` y sus ${n} jugadores` : ''}?`)) return;
    run(app.store.deleteMatch(m.id), 'Partido borrado');
    location.hash = '#/';
  };
}

/* ───────── textos ───────── */
function waMessage(m, p) {
  const first = (p.name || '').trim().split(/\s+/)[0];
  return `¡Hola ${first}! Te anoté para el fútbol 7 en ${VENUE} el ${labelDate(m.date)} a las ${m.time} hs.` +
    (m.note ? ` (${m.note})` : '') + ` ¿Confirmás? ⚽`;
}
function listText(m) {
  const ps = playersOf(m.id);
  const cap = m.capacity || CAPACITY;
  const lines = [`⚽ Fútbol 7 · ${VENUE}`, `📅 ${capitalize(labelDate(m.date))} · ${m.time} hs`];
  if (m.note) lines.push(`📝 ${m.note}`);
  lines.push('');
  for (let i = 0; i < Math.max(cap, ps.length); i++) {
    const p = ps[i];
    const pay = p ? paymentStatusText(p) : '';
    lines.push(`${i + 1}. ${p ? p.name : ''}${pay ? ` — ${pay}` : ''}`);
  }
  lines.push('', ps.length >= cap ? '✅ ¡Completo!' : `Faltan ${cap - ps.length}`);
  const collected = collectedLine(ps);
  if (collected) lines.push(collected);
  const wait = waitingOf(m.id);
  if (wait.length) {
    lines.push('', 'Lista de espera:');
    wait.forEach((p, i) => {
      const pay = paymentStatusText(p);
      lines.push(`${i + 1}. ${p.name}${pay ? ` — ${pay}` : ''}`);
    });
  }
  return lines.join('\n');
}

function waitingSection(m, full) {
  const wait = waitingOf(m.id);
  const top = wait[0];
  const rows = wait.map((p, i) => {
    const tagCls = p.addedBy === ORGANIZERS[0] ? 'g' : p.addedBy === ORGANIZERS[1] ? 'm' : '';
    const payText = paymentStatusText(p);
    const first = i === 0;
    const last = i === wait.length - 1;
    return `
      <li class="slot wait" data-player="${esc(p.id)}">
        <div class="arrows">
          <button type="button" class="arrow-btn" data-wait-up="${esc(p.id)}" ${first ? 'disabled' : ''} aria-label="Subir prioridad de ${esc(p.name)}">↑</button>
          <button type="button" class="arrow-btn" data-wait-down="${esc(p.id)}" ${last ? 'disabled' : ''} aria-label="Bajar prioridad de ${esc(p.name)}">↓</button>
        </div>
        <span class="n">${i + 1}</span>
        <div class="who">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${p.phone ? `<span>${esc(displayFromWa(p.phone))}</span>` : '<span>Sin número</span>'}
            <span class="tag ${tagCls}">Agregó: ${esc(p.addedBy || '?')}</span>${confirmTag(p)}</div>
          ${payText ? `<div class="pay-line ${p.paid === true ? 'ok' : 'no'}">${esc(payText)}</div>` : ''}
        </div>
        <button type="button" class="pay-btn ${p.paid === true ? 'on' : ''}" data-pay="${esc(p.id)}" aria-label="Pago de ${esc(p.name)}">💵</button>
        ${p.phone ? `<a class="wa-btn" href="${esc(waLink(p.phone, waMessage(m, p)))}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(p.name)}">${ICON.wa}</a>` : ''}
        <button type="button" class="more-btn" data-menu="${esc(p.id)}" aria-label="Opciones de ${esc(p.name)}">${ICON.more}</button>
      </li>`;
  }).join('');
  return `
    <h2 class="section">Lista de espera</h2>
    ${wait.length ? `<ul class="slots" id="wait-list">${rows}</ul>` : '<p class="empty-wait" id="wait-list">Nadie en espera. Los que se anotan acá quedan al final, en orden de llegada.</p>'}
    <div class="wait-tools">
      <button type="button" class="btn" id="btn-add-wait">Anotar en lista de espera</button>
      <button type="button" class="btn primary" id="btn-promote" ${top && !full ? '' : 'disabled'}>Subir al partido</button>
    </div>
    ${top ? `<p class="footer-note">Sube el primero: ${esc(top.name)}</p>` : ''}`;
}

function confirmTag(p) {
  const s = confirmStatus(p);
  return `<span class="confirm-tag ${s.cls}">${s.text}</span>`;
}

const REMINDER_BANNER = 'Faltan 2 horas: mandá los recordatorios';

function reminderBanners(matches) {
  const now = Date.now();
  const due = (matches || []).filter((m) => needsReminderBanner(m, app.players.filter((p) => p.matchId === m.id), now));
  if (!due.length) return '';
  return `<div class="remind-banners">${due.map((m) => {
    const prog = reminderProgress(app.players.filter((p) => p.matchId === m.id));
    return `<button type="button" class="remind-banner" data-remind-banner="${esc(m.id)}">
      <strong>${REMINDER_BANNER}</strong>
      <small>${esc(capitalize(labelDate(m.date)))} · ${esc(m.time || '--:--')} hs · ${prog.sent} de ${prog.total} enviados</small>
    </button>`;
  }).join('')}</div>`;
}

function bindReminderBanners() {
  $('#view').querySelectorAll('[data-remind-banner]').forEach((btn) => {
    btn.onclick = () => {
      const match = matchById(btn.dataset.remindBanner);
      if (match) openReminders(match);
    };
  });
}

async function openReminders(m) {
  const people = [...playersOf(m.id), ...waitingOf(m.id)];
  if (!people.length) { toast('No hay jugadores para avisar'); return; }
  openSheet(`<h3>Recordatorio de partido</h3><p class="hint">Armando los links…</p>`);
  const tokens = new Map();
  try {
    for (const p of people) {
      if (!p.phone) continue;
      tokens.set(p.id, p.confirmToken || await app.store.ensureConfirmToken(p.id));
    }
  } catch (e) {
    console.error(e);
    toast('No se pudieron armar los links');
    closeSheet();
    return;
  }
  const fresh = [...playersOf(m.id), ...waitingOf(m.id)].map((p) => ({ ...p, confirmToken: tokens.get(p.id) || p.confirmToken }));
  const linkById = new Map(reminderLinks({ match: m, players: fresh, venue: VENUE }).map((row) => [new URL(row.confirmUrl).searchParams.get('p'), row]));
  const rows = fresh.map((p) => {
    const link = linkById.get(p.id);
    if (!link) {
      return `<li class="remind-row"><div class="who"><div class="name">${esc(p.name)}</div><div class="sub">Sin número de WhatsApp</div></div></li>`;
    }
    const href = link.waUrl;
    const sent = !!p.reminderSentAt;
    return `<li class="remind-row" data-remind="${esc(p.id)}">
      <div class="who"><div class="name">${esc(p.name)}</div><div class="sub">${sent ? '<span class="sent">Enviado</span>' : 'Listo para enviar'}</div></div>
      <a class="btn primary" href="${esc(href)}" target="_blank" rel="noopener" data-send="${esc(p.id)}">${sent ? 'Enviar de nuevo' : 'Enviar'}</a>
    </li>`;
  }).join('');
  openSheet(`
    <h3>Recordatorio de partido</h3>
    <p class="hint">${esc(capitalize(labelDate(m.date)))} · ${esc(m.time)} hs. Cada Enviar abre WhatsApp con el mensaje y el link de esa persona. Hay que tocar enviar en el chat: no se manda solo.</p>
    <ul class="remind-list" id="remind-list">${rows}</ul>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
  $('#remind-list').addEventListener('click', (e) => {
    const link = e.target.closest('[data-send]');
    if (!link) return;
    const id = link.dataset.send;
    const row = link.closest('.remind-row');
    const sub = row?.querySelector('.sub');
    if (sub) sub.innerHTML = '<span class="sent">Enviado</span>';
    link.textContent = 'Enviar de nuevo';
    run(app.store.markReminderSent(id));
  });
}

function moveWait(matchId, id, dir, disabled) {
  if (disabled) return;
  const updates = moveWaiting(waitingOf(matchId), id, dir);
  if (!updates.length) return;
  run(app.store.setWaitOrders(updates));
}

function promoteTop(m) {
  const top = waitingOf(m.id)[0];
  const cap = m.capacity || CAPACITY;
  if (!top || playersOf(m.id).length >= cap) return;
  run(app.store.promoteFromWaiting(top.id), `${top.name} pasó al partido`);
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
  }
}
async function shareText(text) {
  if (navigator.share) {
    try { await navigator.share({ text }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  // Sin Web Share: abrir WhatsApp con la lista lista para mandar
  const ok = await copyText(text);
  toast(ok ? 'Lista copiada. Pegala en el grupo.' : 'No se pudo compartir');
  window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/* ───────── sheet (dialog) ───────── */
const sheet = $('#sheet');
let sheetLocked = false;
function openSheet(html, { locked = false } = {}) {
  sheetLocked = locked;
  sheet.innerHTML = `<div class="sheet-body">${html}</div>`;
  if (!sheet.open) sheet.showModal();
  const first = sheet.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
  return sheet;
}
function closeSheet() { sheetLocked = false; if (sheet.open) sheet.close(); }
sheet.addEventListener('cancel', (e) => { if (sheetLocked) e.preventDefault(); });
sheet.addEventListener('click', (e) => {
  if (e.target === sheet && !sheetLocked) closeSheet();
  if (e.target.closest('[data-close]')) closeSheet();
});

/* ¿Quién sos? */
function openWho(first = false) {
  openSheet(`
    <h3>¿Quién sos?</h3>
    <p class="hint">Así sabemos quién anotó a cada jugador. Se guarda en este teléfono y lo podés cambiar en Ajustes.</p>
    <div class="choice">${ORGANIZERS.map((o) => `<button class="btn ${o === app.who ? 'primary' : ''}" data-who="${esc(o)}">${esc(o)}</button>`).join('')}</div>
    ${first ? '' : '<div class="sheet-actions"><button class="btn ghost" data-close>Cancelar</button></div>'}`, { locked: first });
  sheet.querySelectorAll('[data-who]').forEach((b) => (b.onclick = () => {
    app.who = b.dataset.who; localStorage.setItem(WHO_KEY, app.who);
    closeSheet(); render(); toast(`¡Hola ${app.who}!`);
  }));
}

/* Ajustes */
function openSettings() {
  const demo = app.store?.mode !== 'firebase';
  openSheet(`
    <h3>Ajustes</h3>
    <p class="hint">${demo ? 'Modo demo: los datos se guardan solo en este dispositivo.' : '✅ Conectado a Firebase: los datos se comparten en tiempo real.'}</p>
    <div class="menu">
      <button class="btn" id="set-who">Organizador <small>${esc(app.who || '—')}</small></button>
      <button class="btn" id="set-notify">Aviso 2 horas antes</button>
      ${demo ? '<button class="btn danger" id="set-clear">Borrar datos de demo</button>' : ''}
      ${ACCESS_CODE ? '<button class="btn" id="set-logout">Olvidar código de acceso</button>' : ''}
      <button class="btn ghost" data-close>Cerrar</button>
    </div>
    <p class="footer-note">Fútbol 7 · ${esc(VENUE)} · v1</p>`);
  $('#set-who').onclick = () => openWho(false);
  $('#set-notify').onclick = async () => {
    if (typeof Notification === 'undefined') { toast('Este navegador no muestra avisos'); return; }
    let perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    toast(perm === 'granted'
      ? 'Listo. Si la app está abierta cuando falten 2 horas, te avisa.'
      : 'Sin permiso no hay aviso. El cartel en la app sigue igual.');
  };
  const clr = $('#set-clear');
  if (clr) clr.onclick = () => { if (confirm('¿Borrar todos los partidos y jugadores de demo?')) { app.store.clearAll(); closeSheet(); toast('Datos de demo borrados'); } };
  const lo = $('#set-logout');
  if (lo) lo.onclick = () => { localStorage.removeItem(CODE_KEY); location.reload(); };
}

/* Agregar / editar partido */
function openMatchForm(m) {
  const today = todayISO();
  openSheet(`
    <form id="match-form" novalidate>
      <h3>${m ? 'Editar partido' : 'Agregar partido'}</h3>
      <p class="hint">${esc(VENUE)} · Fútbol 7 contra 7 (${CAPACITY} jugadores)</p>
      <div class="row">
        <label class="field"><span>Fecha</span><input type="date" name="date" required min="${m ? '' : today}" value="${esc(m ? m.date : today)}"></label>
        <label class="field"><span>Hora</span><input type="time" name="time" required value="${esc(m ? m.time : '21:00')}"></label>
      </div>
      <label class="field"><span>Nota (opcional)</span><input type="text" name="note" maxlength="300" placeholder="Ej: cancha 2, traer pechera" value="${esc(m?.note || '')}"></label>
      <div class="field"><div class="err" id="mf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${m ? 'Guardar' : 'Agregar'}</button></div>
    </form>`);
  $('#match-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { date: f.get('date'), time: f.get('time'), note: String(f.get('note') || '').trim() };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !/^\d{2}:\d{2}$/.test(data.time)) { $('#mf-err').textContent = 'Completá fecha y hora.'; return; }
    const dup = app.matches.find((x) => x.date === data.date && x.time === data.time && x.id !== m?.id);
    if (dup && !confirm('Ya hay un partido ese día a esa hora. ¿Agregarlo igual?')) return;
    closeSheet();
    if (m) run(app.store.updateMatch(m.id, data, app.who), 'Partido actualizado');
    else run(app.store.addMatch({ ...data, source: 'manual', capacity: CAPACITY }, app.who), 'Partido agregado');
  };
}

/* Importar desde texto */
function openImport(prevText = '') {
  openSheet(`
    <h3>Importar desde texto</h3>
    <p class="hint">Pegá uno o varios mensajes del grupo de WhatsApp. Detectamos expresiones como “jueves 22/10 21hs”, “miércoles 20:00” o “mañana 19 hs”, y te mostramos una vista previa antes de guardar.</p>
    <label class="field"><span>Mensaje</span><textarea id="imp-text" autofocus placeholder="Ej: Muchachos, se arma el jueves 22/10 21hs ⚽">${esc(prevText)}</textarea></label>
    <label class="field"><span>Fecha del mensaje <small class="muted">(para “hoy”, “mañana”, “jueves”…)</small></span><input type="date" id="imp-ref" value="${todayISO()}"></label>
    <div class="sheet-actions"><button class="btn" data-close>Cancelar</button><button class="btn primary" id="imp-parse">Analizar</button></div>`);
  $('#imp-parse').onclick = () => {
    const text = $('#imp-text').value;
    const found = parseMatchesFromText(text, { refDate: $('#imp-ref').value || todayISO() });
    openImportPreview(text, found);
  };
}
function openImportPreview(text, found) {
  const today = todayISO();
  const items = found.map((f) => {
    const exists = app.matches.some((m) => m.date === f.date && m.time === f.time);
    const past = f.date < today;
    return { ...f, exists, past, on: !exists && !past && !!f.time };
  });
  openSheet(`
    <h3>Vista previa</h3>
    ${items.length ? `<p class="hint">Encontramos ${items.length} partido${items.length > 1 ? 's' : ''}. Revisá fecha y hora, y destildá los que no quieras importar.</p>` :
      '<p class="hint">No encontramos fechas ni horarios en el texto. Probá con algo como “jueves 22/10 21hs”.</p>'}
    <ul class="preview" id="imp-list">${items.map((it, i) => `
      <li class="${it.on ? '' : 'off'}" data-i="${i}">
        <div class="top"><input type="checkbox" ${it.on ? 'checked' : ''} aria-label="Importar"><b class="lbl">${esc(capitalize(labelDate(it.date)))} · ${esc(it.time || '--:--')} hs</b></div>
        <div class="row"><input type="date" value="${it.date}" aria-label="Fecha"><input type="time" value="${it.time}" aria-label="Hora"></div>
        ${it.warning ? `<div class="warn">⚠️ ${esc(it.warning)}</div>` : ''}
        ${it.exists ? '<div class="warn">Ya existe un partido en ese horario</div>' : ''}
        ${it.past ? '<div class="warn">La fecha ya pasó</div>' : ''}
        <div class="src">“${esc(it.source)}”</div>
      </li>`).join('')}</ul>
    <div class="sheet-actions"><button class="btn" id="imp-back">Volver</button>${items.length ? '<button class="btn primary" id="imp-save">Importar</button>' : ''}</div>`);
  $('#imp-back').onclick = () => openImport(text);
  const list = $('#imp-list');
  const sync = (li) => {
    const it = items[li.dataset.i];
    const [cb, d, t] = li.querySelectorAll('input');
    it.on = cb.checked; it.date = d.value; it.time = t.value;
    li.classList.toggle('off', !it.on);
    if (it.date) li.querySelector('.lbl').textContent = `${capitalize(labelDate(it.date))} · ${it.time || '--:--'} hs`;
    updateSave();
  };
  const updateSave = () => {
    const btn = $('#imp-save'); if (!btn) return;
    const n = items.filter((i) => i.on && i.date && i.time).length;
    btn.disabled = n === 0; btn.textContent = n ? `Importar ${n}` : 'Importar';
  };
  list.addEventListener('input', (e) => sync(e.target.closest('li')));
  list.addEventListener('change', (e) => sync(e.target.closest('li')));
  updateSave();
  const save = $('#imp-save');
  if (save) save.onclick = () => {
    const sel = items.filter((i) => i.on && i.date && i.time);
    if (!sel.length) return;
    closeSheet();
    run(app.store.addMatches(sel.map((s) => ({ date: s.date, time: s.time, note: '', source: 'texto', sourceText: s.source, capacity: CAPACITY })), app.who),
      `${sel.length} partido${sel.length > 1 ? 's' : ''} importado${sel.length > 1 ? 's' : ''}`);
  };
}

/* ───────── plantel (Jugadores) ───────── */
function renderRoster() {
  const q = $('#roster-q')?.value || '';
  const people = searchRoster(app.roster, q);
  const rows = people.map((person) => `
    <li class="slot" data-roster="${esc(person.id)}">
      <div class="who">
        <div class="name">${esc(person.name)}</div>
        <div class="sub">${person.phone ? esc(displayFromWa(person.phone)) : 'Sin número'}</div>
      </div>
      ${person.phone ? `<a class="wa-btn" href="${esc(waLink(person.phone))}" target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(person.name)}">${ICON.wa}</a>` : ''}
      <button type="button" class="more-btn" data-roster-edit="${esc(person.id)}" aria-label="Editar ${esc(person.name)}">${ICON.edit}</button>
      <button type="button" class="more-btn" data-roster-del="${esc(person.id)}" aria-label="Borrar ${esc(person.name)}">${ICON.trash}</button>
    </li>`).join('');
  $('#view').innerHTML = `
    <h2 class="section">Jugadores</h2>
    <p class="hint roster-lead">Lista guardada de nombre y WhatsApp. Se comparte entre los dos.</p>
    ${app.rosterError ? `<div class="banner error roster-error" id="roster-error">${esc(app.rosterError)}</div>` : ''}
    <label class="field roster-search"><span>Buscar</span><input id="roster-q" autocomplete="off" placeholder="Nombre o teléfono" value="${esc(q)}"></label>
    ${people.length ? `<ul class="slots" id="roster-list">${rows}</ul>` : `<p class="empty-wait" id="roster-list">${q ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay jugadores guardados. Cuando anotás a alguien en un partido con WhatsApp, se guarda acá.'}</p>`}
    <div class="actionbar"><div class="actionbar-inner">
      <button class="btn primary" id="btn-add-roster">${ICON.plus}Agregar jugador</button>
    </div></div>`;
  const input = $('#roster-q');
  input.addEventListener('input', () => renderRoster());
  if (q) { input.focus(); input.setSelectionRange(q.length, q.length); }
  $('#btn-add-roster').onclick = () => openRosterForm();
  const list = $('#roster-list');
  if (list) list.onclick = (e) => {
    const edit = e.target.closest('[data-roster-edit]');
    if (edit) return openRosterForm(app.roster.find((r) => r.id === edit.dataset.rosterEdit));
    const del = e.target.closest('[data-roster-del]');
    if (del) return deleteRosterPlayer(app.roster.find((r) => r.id === del.dataset.rosterDel));
  };
}

function rosterFormError(error, formId) {
  const el = document.getElementById(formId);
  if (isRosterDenied(error)) {
    const msg = ROSTER_DENIED_WRITE;
    if (el) el.textContent = msg;
    showError(msg);
    return;
  }
  if (error?.code === 'roster-duplicate') {
    if (el) el.textContent = error.message;
    return;
  }
  toast('No se pudo guardar: ' + (error?.code || error?.message || error));
}

function openRosterForm(person) {
  openSheet(`
    <form id="roster-form" novalidate>
      <h3>${person ? 'Editar jugador' : 'Agregar a Jugadores'}</h3>
      <p class="hint">Nombre completo y WhatsApp. Si el número ya está, no se duplica.</p>
      <label class="field"><span>Nombre</span><input name="name" required autofocus autocomplete="off" maxlength="60" placeholder="Ej: Ernesto Pereira" value="${esc(person?.name || '')}"></label>
      <label class="field"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(person ? displayFromWa(person.phone) : '')}">
        <div class="small muted" id="rf-phone">Característica + número. Sin 0 ni 15 también sirve.</div></label>
      <div class="field"><div class="err" id="rf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${person ? 'Guardar' : 'Agregar'}</button></div>
    </form>`);
  const form = $('#roster-form');
  const hint = $('#rf-phone');
  form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = 'Característica + número. Sin 0 ni 15 también sirve.'; return; }
    const r = normalizePhone(v);
    hint.className = r.ok ? 'ok' : 'err';
    hint.textContent = r.ok ? `✓ ${r.display}` : r.error;
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phoneRaw = form.phone.value.trim();
    if (!name) { $('#rf-err').textContent = 'Poné el nombre.'; return; }
    if (!phoneRaw) { $('#rf-err').textContent = 'Poné el WhatsApp.'; return; }
    const r = normalizePhone(phoneRaw);
    if (!r.ok) { $('#rf-err').textContent = r.error; return; }
    const job = person
      ? app.store.updateRoster(person.id, { name, phone: r.wa })
      : app.store.addRoster({ name, phone: r.wa }, app.who);
    Promise.resolve(job).then(() => { closeSheet(); toast(person ? 'Jugador actualizado' : 'Guardado en Jugadores'); }).catch((err) => rosterFormError(err, 'rf-err'));
  };
}

function deleteRosterPlayer(person) {
  if (!person) return;
  if (!confirm(`¿Borrar a ${person.name} de Jugadores? No lo quita de los partidos.`)) return;
  Promise.resolve(app.store.deleteRoster(person.id)).then(() => toast(`${person.name} borrado`)).catch((err) => {
    if (isRosterDenied(err)) showError(ROSTER_DENIED_WRITE);
    else toast('No se pudo borrar: ' + (err?.code || err?.message || err));
  });
}

async function rememberInRoster(name, phone) {
  if (!phone || rosterByPhone(app.roster, phone)) return;
  try { await app.store.addRoster({ name, phone }, app.who); }
  catch (error) {
    if (error?.code === 'roster-duplicate') return;
    if (isRosterDenied(error)) showError(`${ROSTER_DENIED_WRITE} El partido igual quedó anotado.`);
    else console.error(error);
  }
}

function addSignedPlayer(m, { name, phone }, asWait) {
  const willWait = asWait || playersOf(m.id).length >= (m.capacity || CAPACITY);
  closeSheet();
  run((async () => {
    await app.store.addPlayer(m, { name, phone }, app.who, { waiting: asWait });
    await rememberInRoster(name, phone);
  })(), willWait ? `${name} quedó en la lista de espera` : `${name} anotado`);
}

/* Agregar / editar jugador */
function openPlayerForm(m, p, opts = {}) {
  const asWait = !p && opts.waiting === true;
  openSheet(`
    <form id="player-form" novalidate>
      <h3>${p ? 'Editar jugador' : asWait ? 'Anotar en lista de espera' : 'Agregar jugador'}</h3>
      <p class="hint">${esc(fmtWhen(m))}${p ? '' : asWait ? ' · Queda al final de la lista de espera' : ` · Lo anota ${esc(app.who)}`}</p>
      ${p ? '' : `<label class="field"><span>Buscar guardados</span><input id="roster-find" name="find" autocomplete="off" placeholder="ERN, Pereira o parte del teléfono"></label>
      <ul class="roster-hits" id="roster-hits" hidden></ul>`}
      <label class="field"><span>Nombre</span><input name="name" ${p ? 'autofocus' : ''} autocomplete="off" maxlength="60" placeholder="Ej: Juan Pérez" value="${esc(p?.name || '')}"></label>
      <label class="field"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(p ? displayFromWa(p.phone) : '')}">
        <div class="small muted" id="pf-phone">Característica + número. Sin 0 ni 15 también sirve. Si no está guardado, se agrega a Jugadores.</div></label>
      <div class="field"><div class="err" id="pf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${p ? 'Guardar' : 'Agregar'}</button></div>
    </form>`);
  const form = $('#player-form');
  const hint = $('#pf-phone');
  form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = 'Característica + número. Sin 0 ni 15 también sirve. Si no está guardado, se agrega a Jugadores.'; return; }
    const r = normalizePhone(v);
    hint.className = r.ok ? 'ok' : 'err';
    hint.textContent = r.ok ? `✓ ${r.display}` : r.error;
  });
  const find = $('#roster-find');
  if (find) {
    const paint = () => {
      const hits = $('#roster-hits');
      const q = find.value.trim();
      const found = q ? searchRoster(app.roster, q).slice(0, 8) : [];
      hits.hidden = !found.length;
      hits.innerHTML = found.map((person) => `<li><button type="button" class="roster-hit" data-pick="${esc(person.id)}"><b>${esc(person.name)}</b><small>${person.phone ? esc(displayFromWa(person.phone)) : 'Sin número'}</small></button></li>`).join('');
    };
    find.addEventListener('input', paint);
    $('#roster-hits').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (!btn) return;
      const person = app.roster.find((r) => r.id === btn.dataset.pick);
      if (person) addSignedPlayer(m, { name: person.name, phone: person.phone || '' }, asWait);
    });
    setTimeout(() => find.focus(), 50);
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phoneRaw = form.phone.value.trim();
    if (!name) { $('#pf-err').textContent = 'Poné el nombre.'; return; }
    let phone = '';
    if (phoneRaw) {
      const r = normalizePhone(phoneRaw);
      if (!r.ok) { $('#pf-err').textContent = r.error; return; }
      phone = r.wa;
    }
    if (p) {
      closeSheet();
      run((async () => {
        await app.store.updatePlayer(p.id, { name, phone });
        await rememberInRoster(name, phone);
      })(), 'Jugador actualizado');
    } else addSignedPlayer(m, { name, phone }, asWait);
  };
}
/* Pago del jugador */
function openPaymentForm(m, p) {
  if (!p) return;
  let paid = p.paid === true ? true : p.paid === false ? false : null;
  let method = p.method === 'efectivo' || p.method === 'transferencia' ? p.method : null;
  const amountValue = p.paid === true && p.amount != null ? String(p.amount).replace('.', ',') : '';
  openSheet(`
    <form id="pay-form" novalidate>
      <h3>Pago</h3>
      <p class="hint">${esc(p.name)} · ${esc(fmtWhen(m))}</p>
      <div class="field">
        <span>¿Pagó?</span>
        <div class="seg">
          <button type="button" class="btn" data-paid="si">Sí</button>
          <button type="button" class="btn" data-paid="no">No</button>
        </div>
      </div>
      <div id="pay-details">
        <label class="field"><span>Monto (pesos)</span>
          <input name="amount" inputmode="decimal" autocomplete="off" placeholder="Ej: 5000" value="${esc(amountValue)}">
          <div class="small muted">Podés escribir 5000 o 5.000.</div>
        </label>
        <div class="field">
          <span>Medio</span>
          <div class="seg">
            <button type="button" class="btn" data-method="efectivo">Efectivo</button>
            <button type="button" class="btn" data-method="transferencia">Transferencia</button>
          </div>
        </div>
      </div>
      <div class="field"><div class="err" id="pay-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#pay-form');
  const details = $('#pay-details');
  const sync = () => {
    sheet.querySelector('[data-paid="si"]').classList.toggle('primary', paid === true);
    sheet.querySelector('[data-paid="no"]').classList.toggle('primary', paid === false);
    sheet.querySelector('[data-method="efectivo"]').classList.toggle('primary', method === 'efectivo');
    sheet.querySelector('[data-method="transferencia"]').classList.toggle('primary', method === 'transferencia');
    details.hidden = paid !== true;
  };
  sheet.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = () => {
    paid = b.dataset.paid === 'si';
    $('#pay-err').textContent = '';
    sync();
    if (paid) setTimeout(() => form.amount.focus(), 30);
  }));
  sheet.querySelectorAll('[data-method]').forEach((b) => (b.onclick = () => {
    method = b.dataset.method;
    $('#pay-err').textContent = '';
    sync();
  }));
  sync();
  form.onsubmit = (e) => {
    e.preventDefault();
    if (paid !== true && paid !== false) { $('#pay-err').textContent = 'Indicá si pagó.'; return; }
    let amount = null;
    let methodVal = null;
    if (paid) {
      const parsed = parseAmount(form.amount.value);
      if (!parsed.ok) { $('#pay-err').textContent = parsed.error; return; }
      if (method !== 'efectivo' && method !== 'transferencia') { $('#pay-err').textContent = 'Elegí Efectivo o Transferencia.'; return; }
      amount = parsed.amount;
      methodVal = method;
    }
    closeSheet();
    run(app.store.setPayment(p.id, { paid, amount, method: methodVal }, app.who), paid ? 'Pago guardado' : 'Marcado como no pagó');
  };
}

function openPlayerMenu(m, p) {
  if (!p) return;
  openSheet(`
    <h3>${esc(p.name)}</h3>
    <p class="hint">${p.phone ? esc(displayFromWa(p.phone)) + ' · ' : ''}Agregó: ${esc(p.addedBy || '?')}</p>
    <div class="menu">
      ${p.phone ? `<a class="btn" href="${esc(waLink(p.phone, waMessage(m, p)))}" target="_blank" rel="noopener">${ICON.wa}Mandar WhatsApp</a>` : ''}
      <button class="btn" id="pm-edit">${ICON.edit}Editar</button>
      <button class="btn danger" id="pm-del">${ICON.trash}${isWaiting(p) ? 'Quitar de la espera' : 'Quitar del partido'}</button>
      <button class="btn ghost" data-close>Cancelar</button>
    </div>`);
  $('#pm-edit').onclick = () => openPlayerForm(m, p);
  $('#pm-del').onclick = () => {
    const fromMain = !isWaiting(p);
    const top = waitingOf(m.id).find((w) => w.id !== p.id);
    if (!confirm(`¿Quitar a ${p.name}${fromMain ? ' del partido' : ' de la lista de espera'}?`)) return;
    const promote = fromMain && top && playersOf(m.id).length - 1 < (m.capacity || CAPACITY)
      && confirm(`¿Subir a ${top.name}, el primero de la lista de espera?`);
    closeSheet();
    const job = Promise.resolve(app.store.deletePlayer(p.id)).then(() => (promote ? app.store.promoteFromWaiting(top.id) : null));
    run(job, promote ? `${top.name} pasó al partido` : `${p.name} quitado`);
  };
}

/* ───────── código de acceso (opcional) ───────── */
function gate() {
  return new Promise((resolve) => {
    if (!ACCESS_CODE || localStorage.getItem(CODE_KEY) === ACCESS_CODE) return resolve();
    $('#view').innerHTML = `
      <form class="gate" id="gate">
        <div class="ball">⚽</div><h2>Código de acceso</h2>
        <p class="muted">Pedile el código a Gustavo o Martín.</p>
        <label class="field"><input name="code" type="password" autocomplete="off" placeholder="Código" autofocus></label>
        <div class="err small" id="gate-err" style="color:var(--danger)"></div>
        <button class="btn primary block">Entrar</button>
      </form>`;
    $('#gate').onsubmit = (e) => {
      e.preventDefault();
      if (e.target.code.value.trim() === ACCESS_CODE) { localStorage.setItem(CODE_KEY, ACCESS_CODE); resolve(); }
      else $('#gate-err').textContent = 'Código incorrecto';
    };
  });
}

/* ───────── arranque ───────── */
async function boot() {
  $('#venue-name').textContent = VENUE;
  $('#btn-back').onclick = () => { location.hash = '#/'; };
  $('#btn-settings').onclick = openSettings;
  $('#btn-who').onclick = () => openWho(false);
  $('#brand').onclick = () => { location.hash = '#/'; };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }

  await gate();
  app.store = await createStore((e) => {
    showError(e?.code === 'permission-denied'
      ? 'Firebase rechazó el acceso. Revisá las reglas de Firestore (ver README).'
      : e?.code === 'no-server'
        ? 'No hay conexión con la base de datos de Firebase: los cambios quedan solo en este teléfono. ¿Está creada la base Firestore del proyecto? (ver README)'
        : 'Problema de conexión con Firebase: ' + (e?.message || e));
  });
  $('#demo-banner').hidden = app.store.mode === 'firebase';
  app.store.subscribe(({ matches, players, roster, rosterError }) => {
    app.matches = matches || []; app.players = players || [];
    app.roster = roster || [];
    if (rosterError && rosterError !== app.rosterError) showError(rosterError);
    app.rosterError = rosterError || null;
    app.loaded = true;
    // no redibujar debajo de un formulario abierto para no perder lo que se escribe
    if (!sheet.open || !sheet.querySelector('input, textarea')) render(); else pendingRender = true;
    fixOverflow();
    backfillConfirmTokens();
    armReminderTimer();
  });
  if (!app.who) openWho(true);
  render();
  armReminderTimer();
  // refrescar etiquetas "Hoy/Mañana" y ocultar partidos pasados
  setInterval(() => { if (!sheet.open || !sheet.querySelector('input, textarea')) render(); }, 60_000);
}

// El aviso del navegador solo sale si la página está abierta cuando se cumplen
// las 2 horas y el permiso ya estaba concedido. No hay envío en segundo plano.
let reminderSeenAt = Date.now();
let reminderTimer = 0;
let reminderTimerAt = Infinity;
const tokenPending = new Set();

function backfillConfirmTokens() {
  for (const id of tokenPending) {
    if (app.players.some((p) => p.id === id && p.confirmToken)) tokenPending.delete(id);
  }
  for (const p of app.players) {
    if (p.confirmToken || tokenPending.has(p.id)) continue;
    tokenPending.add(p.id);
    Promise.resolve(app.store.ensureConfirmToken(p.id)).catch((e) => {
      tokenPending.delete(p.id);
      console.error(e);
    });
  }
}

function armReminderTimer() {
  const now = Date.now();
  let next = now + 60_000;
  for (const m of app.matches) {
    const due = reminderDueAt(m);
    if (due != null && due > now) next = Math.min(next, due + 250);
  }
  if (reminderTimer && next >= reminderTimerAt - 50) return;
  clearTimeout(reminderTimer);
  reminderTimerAt = next;
  reminderTimer = setTimeout(checkReminderWindow, Math.max(250, next - now));
}

function checkReminderWindow() {
  reminderTimer = 0;
  reminderTimerAt = Infinity;
  const now = Date.now();
  const prev = reminderSeenAt;
  reminderSeenAt = now;
  const crossed = matchesCrossingReminderWindow(app.matches, prev, now);
  for (const m of crossed) {
    const people = app.players.filter((p) => p.matchId === m.id);
    if (needsReminderBanner(m, people, now)) fireReminderNotification(m);
  }
  if (crossed.length && (!sheet.open || !sheet.querySelector('input, textarea'))) render();
  armReminderTimer();
}

function fireReminderNotification(m) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    const n = new Notification(REMINDER_BANNER, {
      body: `${capitalize(labelDate(m.date))} · ${m.time || '--:--'} hs. Este aviso solo aparece si la app está abierta.`,
      tag: `f7c-remind-${m.id}`,
    });
    n.onclick = () => {
      window.focus();
      location.hash = `#/partido/${encodeURIComponent(m.id)}`;
      const fresh = matchById(m.id);
      if (fresh) openReminders(fresh);
    };
  } catch (e) { console.warn(e); }
}
let pendingRender = false;
let fixingOverflow = false;
async function fixOverflow() {
  if (fixingOverflow || !app.store) return;
  const patches = [];
  for (const m of app.matches) {
    const all = app.players.filter((p) => p.matchId === m.id);
    patches.push(...overflowPatches(all, m.capacity || CAPACITY));
  }
  if (!patches.length) return;
  fixingOverflow = true;
  try {
    for (const patch of patches) await app.store.updatePlayer(patch.id, { waiting: true, waitOrder: patch.waitOrder, rosterAt: null });
  } catch (e) { console.error(e); }
  finally { fixingOverflow = false; }
}

sheet.addEventListener('close', () => { pendingRender = false; render(); });

boot().catch((e) => { console.error(e); showError('Error al iniciar la app: ' + e.message); });

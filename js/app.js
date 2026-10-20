import { ACCESS_CODE, VENUE } from '../config.js';
import { createStore } from './store.js';
import { parseMatchesFromText } from './parser.js';
import { normalizePhone, displayFromWa, WA_CHOICE_KEY, waSendUrl } from './phone.js';
import {
  todayISO, weekdayOf, labelDate, capitalize, relativeLabel, toEpoch,
  DIAS_CORTOS, MESES_CORTOS,
} from './dates.js';
import { collectedLine, formatARS, parseAmount, paymentHeadline, paymentParts, paymentShares, paymentStatusText, pendingStatusText, hasPaymentDirection } from './payments.js';
import { moveWaiting, overflowPatches, sortWaiting } from './waiting.js';
import {
  cancelLinks, confirmPageUrl, confirmStatus, confirmSummary, matchesCrossingReminderWindow,
  needsReminderBanner, playersForOrganizer, promotionMessage, reminderDueAt, reminderLinks, reminderProgress,
  reservationClearedByAnswer,
} from './reminders.js';
import { isShortCode, shortConfirmUrl } from './short.js';
import { shortenExternal } from './shorten.js';
import { PRIVATE_WA_TEXT } from './privacy.js';
import { ROSTER_DENIED_WRITE, canonicalPhone, foldText, isRosterDenied, phoneIdentity, playerMatchesPerson, rosterByIdentity, rosterByPhone, searchRoster } from './roster.js';
import { ALREADY_IN_MATCH, alreadyInMatch, firstDuplicate, groupByInviter, isAutoGuestName, normName, placeGroup, resolveFriendNames, waitWarning } from './guests.js';
import { MAX_NOTES, MAX_NOTE_TEXT, POSITIONS, currentMatches, keptSignupIds, matchAlreadyPlayed, matchSignupState, noteWhen, playerRecord, playerStats, sortedNotes, splitNear, upcomingMatches } from './profile.js';
import { UNSPECIFIED, organizerChoices, organizerTagClass, sameOrganizer } from './organizers.js';
import { EDIT_LOCK_TEXT, canEditPlayer, canEditRoster } from './edit-lock.js';
import { hasUnspecified, mineSummary, organizerTotals, paymentLedger, paymentsSummary, pendingTransfers, signupLedger } from './ledger.js';
import { openSession, staffUsers } from './auth.js';
import { addedCount, buildAccess, canAdd, canDelete, canEditAccess, canEditMatch, limitFor, limitMessage, publicAccess } from './access.js';
import { TEXT_SIZES, applyTextSize, readTextSize, saveTextSize, stepTextSize } from './text-size.js';
import { PRICES_DENIED_WRITE, normalizePrices, priceRecord, promoForPlayer, splitPaymentAcross } from './prices.js';
import { cyclePlayer, emptyTeams, normalizeTeams, shuffleTeams, teamsBalance, teamsMessage } from './teams.js';
import {
  VENUES_DENIED_WRITE, capacityFor, defaultVenueId, isVenueDenied, matchCapacity, perTeamOf, perTeamOptions, venueChoices, venueLabel,
} from './venues.js';

/* ───────── utilidades ───────── */
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function phoneHidden(p) {
  return !!(p && !String(p.phone || '').trim() && (p.phonePrivate || p.hasPhone));
}
function phoneSub(p) {
  if (p?.phone) return `<span>${esc(displayFromWa(p.phone))}</span>`;
  if (phoneHidden(p)) return `<span class="private-wa">${esc(PRIVATE_WA_TEXT)}</span>`;
  return '<span>Sin número</span>';
}
function waButton(p, text) {
  if (p?.phone) {
    const code = isShortCode(p?.shortCode) ? p.shortCode : '';
    const shorten = code ? ` data-short-code="${esc(code)}" data-wa-phone="${esc(p.phone)}" data-wa-text="${esc(text || '')}"` : '';
    return `<a class="wa-btn" href="${esc(waHref(p.phone, text || ''))}"${shorten} target="_blank" rel="noopener" aria-label="WhatsApp a ${esc(p.name)}">${ICON.wa}</a>`;
  }
  if (phoneHidden(p)) return `<button type="button" class="wa-btn" disabled aria-label="${esc(PRIVATE_WA_TEXT)}">${ICON.wa}</button>`;
  return '';
}
function rosterIdentity(person) {
  return { phone: person?.phone || '', phoneKey: person?.phoneKey || '', rosterId: person?.id || '', name: person?.name || '' };
}
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
  organizers: [],
  organizersError: null,
  venues: [],
  venuesError: null,
  prices: null,
  pricesError: null,
  users: [],
  role: '',
  mine: false,
  session: null,
  payFilter: '',
  signupDraft: null,
  who: '',
  loaded: false,
  history: [],
  historyFilter: null,
  historyMeta: null,
  historyError: '',
  matchMiss: {},
  showLater: false,
};
window.__app = app; // útil para depurar / tests

function clearWaChoice() {
  try { localStorage.removeItem(WA_CHOICE_KEY); } catch { /* modo privado */ }
}
function waHref(phone, text) {
  return waSendUrl({ phone: phone || '', text: text || '' });
}

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
const PAY_RULES_MSG = 'No se pudo guardar el pago. Hay que volver a publicar firestore.rules para efectivo, transferencia y Transfiere después.';
const RULES_MSG = 'Firebase rechazó el acceso. Hay que actualizar las reglas de Firestore (publicar firestore.rules).';
function isPermissionDenied(error) {
  const code = error?.code || '';
  return code === 'permission-denied' || code === 'permission_denied';
}
function run(p, okMsg, deniedMsg) {
  if (okMsg) toast(okMsg);
  return Promise.resolve(p).catch((e) => {
    console.error(e);
    if (e?.code === 'already-in-match') toast(e.message || ALREADY_IN_MATCH);
    else if (deniedMsg && isPermissionDenied(e)) toast(deniedMsg);
    else toast('No se pudo guardar: ' + (e.code || e.message || e));
  });
}

/* ───────── datos derivados ───────── */
const actor = () => ({ uid: app.session?.user?.uid || '', name: app.who || '' });
const addBlock = (m) => {
  const who = actor();
  if (!canAdd(m, who.uid)) return 'Este partido es de solo lectura.';
  const max = limitFor(m, who.uid);
  if (max == null) return '';
  const n = addedCount(app.players.filter((p) => p.matchId === m.id), who);
  return n >= max ? limitMessage(max) : '';
};
const isWaiting = (p) => p.waiting === true;
const playersOf = (matchId) => groupByInviter(app.players
  .filter((p) => p.matchId === matchId && !isWaiting(p))
  .sort((a, b) => (a.rosterAt ?? a.createdAt) - (b.rosterAt ?? b.createdAt) || String(a.id).localeCompare(String(b.id))));
const waitingOf = (matchId) => sortWaiting(app.players.filter((p) => p.matchId === matchId && isWaiting(p)));
const matchById = (id) => app.matches.find((m) => m.id === id);
const fmtWhen = (m) => `${capitalize(labelDate(m.date))} · ${m.time || '--:--'} hs`;
function minePlayer(p) {
  if (sameOrganizer(p.addedBy, app.who)) return true;
  return paymentShares(p).some((share) => share.kind !== 'pending' && share.amount > 0 && sameOrganizer(share.name, app.who));
}
function payOrganizerNames(extra = []) {
  return organizerChoices(app.organizers, { unreadable: !!app.organizersError, extra });
}
function livePrices() {
  return normalizePrices(app.prices);
}
function priceExample(amount) {
  const n = Number(amount) || 0;
  const pretty = formatARS(n).replace(/^\$/, '');
  return `Podés escribir ${n} o ${pretty}. Vacío es 0.`;
}
function addedTag(player) {
  return `<span class="tag ${organizerTagClass(player.addedBy)}">Agregó: ${esc(player.addedBy || '?')}</span>`;
}
function friendHostName(player) {
  if (!player?.invitedBy) return '';
  const host = app.players.find((item) => item.id === player.invitedBy);
  return host?.name || player.invitedByName || '';
}
function friendTag(player) {
  if (!player?.invitedBy) return '';
  const name = friendHostName(player);
  return `<span class="tag friend-tag">${esc(name ? `amigo de ${name}` : 'amigo')}</span>`;
}
function friendSuffix(player) {
  const name = friendHostName(player);
  return name ? ` (de ${name})` : '';
}
function payMarkup(player) {
  const pending = pendingStatusText(player);
  const headline = paymentHeadline(player);
  const cls = player.paid === true ? 'ok' : 'no';
  const line = headline ? `<div class="pay-line ${cls}">${esc(headline)}</div>` : '';
  const badge = pending ? `<div class="pay-pending">${esc(pending)}</div>` : '';
  return line + badge;
}
function promoOf(player) {
  if (!player || player.waiting === true) return null;
  return promoForPlayer({ player, players: app.players, matches: app.matches, prices: app.prices });
}
function promoBadge(player) {
  const promo = promoOf(player);
  return promo ? `<div class="promo-badge">${esc(promo.label)}</div>` : '';
}
function payFilterChips(person) {
  const names = payOrganizerNames();
  const showBlank = hasUnspecified({
    players: app.players,
    phone: person?.phone || null,
    rosterId: person?.id || null,
    name: person?.name || null,
  });
  const items = [{ value: '', label: 'Todos' }, ...names.map((name) => ({ value: name, label: name }))];
  if (showBlank) items.push({ value: UNSPECIFIED, label: UNSPECIFIED });
  return `<div class="chips" id="pay-filter">${items.map((item) => `<button type="button" class="btn chip ${app.payFilter === item.value ? 'on' : ''}" data-pay-filter="${esc(item.value)}">${esc(item.label)}</button>`).join('')}</div>`;
}
function bindPayFilter(root) {
  const box = $('#pay-filter', root || document);
  if (!box) return;
  box.onclick = (e) => {
    const btn = e.target.closest('[data-pay-filter]');
    if (!btn || btn.dataset.payFilter === app.payFilter) return;
    app.payFilter = btn.dataset.payFilter || '';
    render();
  };
}
function timesLabel(count) {
  return `${count} ${count === 1 ? 'vez' : 'veces'}`;
}
function sortedMatches() {
  return [...app.matches].sort((a, b) => (a.startsAt ?? toEpoch(a.date, a.time)) - (b.startsAt ?? toEpoch(b.date, b.time)));
}

/* ───────── router ───────── */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id, extra] = h.split('/');
  if (name === 'partido' && id && extra === 'equipos') return { name: 'teams', id: decodeURIComponent(id) };
  if (name === 'partido' && id) return { name: 'match', id: decodeURIComponent(id) };
  if (name === 'historial') return { name: 'history' };
  if (name === 'jugadores') return { name: 'roster', pay: id === 'pagos' };
  if (name === 'pagos') return { name: 'roster', pay: true };
  if (name === 'usuarios') return { name: 'users' };
  if (name === 'jugador' && id) return { name: 'profile', id: decodeURIComponent(id) };
  return { name: 'home' };
}
window.addEventListener('hashchange', render);

/* Al abrir la app (sesión nueva) siempre entra Próximos partidos, con “más adelante” cerrado.
   Recargar o volver atrás, en la misma sesión, deja la pestaña y el desplegable como estaban. */
function rememberLater(open) {
  app.showLater = !!open;
  try {
    if (app.showLater) sessionStorage.setItem('f7c-later', '1');
    else sessionStorage.removeItem('f7c-later');
  } catch { /* modo privado */ }
}
function openOnUpcoming() {
  try {
    if (sessionStorage.getItem('f7c-session')) {
      app.showLater = sessionStorage.getItem('f7c-later') === '1';
      return;
    }
    sessionStorage.setItem('f7c-session', '1');
    sessionStorage.removeItem('f7c-tab');
    sessionStorage.removeItem('f7c-later');
    const name = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean)[0] || '';
    const section = name === '' || name === 'jugadores' || name === 'pagos' || name === 'historial';
    if (section && location.hash && location.hash !== '#/' && location.hash !== '#') {
      history.replaceState(null, '', `${location.pathname}${location.search}#/`);
    }
  } catch { /* modo privado */ }
}
openOnUpcoming();

/* ───────── render ───────── */
function savedTab() {
  try {
    const value = sessionStorage.getItem('f7c-tab');
    if (value === 'roster' || value === 'history' || value === 'home') return value;
  } catch {}
  return 'home';
}
function hashForTab(tab) {
  if (tab === 'history') return '#/historial';
  if (tab === 'roster') return '#/jugadores';
  return '#/';
}
function tabFor(r) {
  if (r.name === 'history') return 'history';
  if (r.name === 'roster') return 'roster';
  if (r.name === 'home') return 'home';
  if (r.name === 'match' || r.name === 'teams') {
    const match = matchById(r.id);
    return match?.date && match.date < todayISO() ? 'history' : 'home';
  }
  if (r.name === 'profile') {
    if (app.profileMatchId) {
      const match = matchById(app.profileMatchId);
      return match?.date && match.date < todayISO() ? 'history' : 'home';
    }
    return 'roster';
  }
  return savedTab();
}
function paintTabs(r) {
  const tab = tabFor(r);
  if (r.name === 'home' || r.name === 'roster' || r.name === 'history') {
    try { sessionStorage.setItem('f7c-tab', tab); } catch {}
  }
  document.querySelectorAll('#tabbar a').forEach((link) => {
    const on = link.dataset.tab === tab;
    if (on) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  const root = r.name === 'home' || r.name === 'roster' || r.name === 'history';
  $('#btn-back').hidden = root || !app.loaded;
  requestAnimationFrame(placeBars);
}
function placeBars() {
  const header = document.querySelector('.topbar');
  const bar = document.getElementById('tabbar');
  const slot = document.getElementById('tab-slot');
  const action = document.querySelector('#view .actionbar');
  if (header) document.documentElement.style.setProperty('--header-h', `${header.offsetHeight}px`);
  if (bar) {
    document.documentElement.style.setProperty('--tabbar-h', `${bar.offsetHeight}px`);
    if (slot && bar.parentElement === document.getElementById('sheet')) slot.style.minHeight = `${bar.offsetHeight}px`;
  }
  document.documentElement.style.setProperty('--actionbar-h', `${action ? action.offsetHeight : 0}px`);
}
let renderKey = '';
let viewHtml = '';
// Misma pantalla y mismos datos: no se reemplaza el DOM, así no parpadea ni se pierde el scroll ni lo elegido.
function replaceView(html) {
  if (html === viewHtml) return false;
  viewHtml = html;
  $('#view').innerHTML = html;
  return true;
}
function render() {
  const r = route();
  const shownVenue = (r.name === 'match' || r.name === 'teams') ? placeOf(matchById(r.id) || {}) : VENUE;
  const brand = $('#venue-name');
  if (brand) brand.textContent = shownVenue;
  const key = `${r.name}:${r.id || ''}:${r.pay ? 1 : 0}`;
  const same = key === renderKey;
  renderKey = key;
  const y = same ? (document.scrollingElement?.scrollTop || 0) : 0;
  paintTabs(r);
  if (r.name !== 'profile') app.signupDraft = null;
  if (!app.loaded) return;
  if (r.name === 'match') renderMatch(r.id);
  else if (r.name === 'teams') renderTeams(r.id);
  else if (r.name === 'history') renderHistory();
  else if (r.name === 'roster') {
    if (r.pay) renderPagos();
    else renderRoster();
  }
  else if (r.name === 'profile') renderProfile(r.id);
  else if (r.name === 'users') renderUsers();
  else renderHome();
  requestAnimationFrame(placeBars);
  if (same && y > 0) {
    const top = y;
    requestAnimationFrame(() => {
      if ((document.scrollingElement?.scrollTop || 0) !== top) document.scrollingElement.scrollTop = top;
    });
  }
}

function placeOf(match) {
  return venueLabel(match, app.venues);
}
function capOf(match) {
  return matchCapacity(match);
}
function matchCard(m) {
  const n = playersOf(m.id).length;
  const cap = capOf(m);
  const [, mo, d] = m.date.split('-').map(Number);
  const rel = relativeLabel(m.date);
  return `
  <li><a class="match-card" href="#/partido/${encodeURIComponent(m.id)}" data-id="${esc(m.id)}">
    <div class="datebox"><div class="dw">${DIAS_CORTOS[weekdayOf(m.date)]}</div><div class="dd">${d}</div><div class="dm">${MESES_CORTOS[mo - 1]}</div></div>
    <div class="match-info">
      <div class="match-title">${esc(capitalize(labelDate(m.date)))}</div>
      <div class="match-time">${rel ? `<span class="badge">${rel}</span>` : ''}${m.cancelled ? '<span class="badge bad">Cancelado</span>' : ''}<span>${esc(m.time || '--:--')} hs</span></div>
      <div class="match-note" data-venue>${esc(placeOf(m))}</div>
      ${m.note ? `<div class="match-note">${esc(m.note)}</div>` : ''}
      ${waitingOf(m.id).length ? `<div class="match-note">${waitingOf(m.id).length} en espera</div>` : ''}
    </div>
    <div class="count ${n >= cap ? 'full' : ''}" aria-label="${n} de ${cap} anotados">
      <div class="num">${n}<small>/${cap}</small></div>
      <div class="bar"><i style="width:${Math.min(100, (n / cap) * 100)}%"></i></div>
    </div>
  </a></li>`;
}

function rosterSwitch(pay) {
  return `<div class="chips" id="roster-section">
    <a class="btn chip ${pay ? '' : 'on'}" id="btn-roster-list" href="#/jugadores">Lista</a>
    <a class="btn chip ${pay ? 'on' : ''}" id="btn-pagos" href="#/jugadores/pagos">Pagos</a>
  </div>`;
}

function renderHome() {
  const upcoming = currentMatches(app.matches);
  const all = app.mine ? upcoming.filter((m) => app.players.some((p) => p.matchId === m.id && minePlayer(p))) : upcoming;
  const { next, later } = splitNear(all);
  const open = app.showLater && later.length > 0;
  const emptyHint = later.length
    ? 'Los que vienen después están en el botón de abajo.'
    : 'Agregá uno a mano o pegá un mensaje del grupo de WhatsApp.';
  if (!replaceView(`
    ${reminderBanners(next)}
    ${app.mine ? '<p class="hint" id="mine-filter">Viendo solo lo que anotaste y cobraste.</p>' : ''}
    <h2 class="section">Próximos 7 días</h2>
    ${next.length ? `<ul class="match-list" id="list-next">${next.map(matchCard).join('')}</ul>` : `
      <div class="empty" id="home-empty"><div class="big">⚽</div><p><b>${app.mine ? 'No anotaste ni cobraste en estos partidos.' : 'No hay partidos en los próximos 7 días.'}</b></p>
      <p class="small">${emptyHint}</p></div>`}
    ${later.length ? `<button type="button" class="later-toggle" id="btn-later" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Ocultar más adelante' : `Ver más adelante (${later.length})`}</button>` : ''}
    ${open ? `<h2 class="section">Más adelante</h2><ul class="match-list" id="list-later">${later.map(matchCard).join('')}</ul>` : ''}
    <p class="footer-note">${esc(VENUE)} · Fútbol 7 contra 7</p>
    <div class="actionbar"><div class="actionbar-inner">
      <button class="btn" id="btn-import">${ICON.paste}Importar desde texto</button>
      <button class="btn primary" id="btn-add-match">${ICON.plus}Agregar partido</button>
    </div></div>`)) return;
  $('#btn-add-match').onclick = () => openMatchForm();
  $('#btn-import').onclick = () => openImport();
  const laterBtn = $('#btn-later');
  if (laterBtn) laterBtn.onclick = () => { rememberLater(!app.showLater); renderHome(); };
  bindReminderBanners();
}

function renderTeams(id) {
  const m = matchById(id);
  if (!m) {
    if (!replaceView(`<div class="empty"><div class="big">🤷</div><p><b>No encontramos este partido.</b></p><p><a class="btn" href="#/">Volver al inicio</a></p></div>`)) return;
    return;
  }
  const main = playersOf(id);
  const ids = main.map((p) => p.id);
  const teams = normalizeTeams(m.teams, ids);
  const balance = teamsBalance(teams);
  const taken = new Set([...teams.bib, ...teams.plain]);
  const free = main.filter((p) => !taken.has(p.id));
  const readOnly = !canAdd(m, actor().uid);
  const byId = new Map(main.map((p) => [p.id, p]));
  const row = (player) => {
    if (!player) return '';
    return readOnly
      ? `<li><div class="team-player" data-team-name="${esc(player.id)}">${esc(player.name)}</div></li>`
      : `<li><button type="button" class="team-player" data-team-player="${esc(player.id)}">${esc(player.name)}</button></li>`;
  };
  const group = (title, list, listId) => `
    <section>
      <h2 class="section">${title}</h2>
      ${list.length ? `<ul class="team-list" id="${listId}">${list.map(row).join('')}</ul>` : `<p class="empty-wait" id="${listId}">Nadie</p>`}
    </section>`;
  const when = `${capitalize(labelDate(m.date))} · ${m.time || '--:--'} hs`;
  const share = teamsMessage({ when, venue: placeOf(m), players: main, teams });
  if (!replaceView(`
    <section class="detail-head">
      <h1>Equipos</h1>
      <div class="when">${esc(when)} · ${esc(placeOf(m))}</div>
      <p class="hint">Con los anotados. La lista de espera no entra.</p>
      ${readOnly ? '<p class="hint" id="teams-readonly">Solo lectura. No podés cambiar los equipos.</p>' : '<p class="hint">Tocá un jugador para moverlo: sin asignar, con pechera, sin pechera.</p>'}
    </section>
    <div class="team-board" id="team-board">
      <div class="team-counts">
        <div class="team-count"><strong id="team-bib-count">${balance.bib}</strong><span>Con pechera</span></div>
        <div class="team-count"><strong id="team-plain-count">${balance.plain}</strong><span>Sin pechera</span></div>
      </div>
      ${balance.balanced ? '' : '<p class="team-warn" id="team-balance">Está desbalanceado</p>'}
      ${main.length ? '' : '<p class="empty-wait">No hay jugadores anotados.</p>'}
      ${group('Sin asignar', free, 'team-unassigned')}
      ${group('Con pechera', teams.bib.map((pid) => byId.get(pid)).filter(Boolean), 'team-bib')}
      ${group('Sin pechera', teams.plain.map((pid) => byId.get(pid)).filter(Boolean), 'team-plain')}
      <div class="team-actions">
        ${readOnly ? '' : '<button type="button" class="btn" id="btn-teams-shuffle">Mezclar al azar</button><button type="button" class="btn" id="btn-teams-clear">Limpiar</button>'}
        <a class="btn nav-wide" id="btn-teams-wa" href="${esc(waHref('', share))}" target="_blank" rel="noopener">Compartir por WhatsApp</a>
      </div>
    </div>`)) return;
  const save = (next, msg) => run(app.store.setTeams(m.id, normalizeTeams(next, ids), app.who), msg);
  if (!readOnly) {
    $('#team-board').onclick = (e) => {
      const btn = e.target.closest('[data-team-player]');
      if (!btn) return;
      save(cyclePlayer(teams, btn.dataset.teamPlayer, ids));
    };
    $('#btn-teams-shuffle').onclick = () => save(shuffleTeams(ids), 'Equipos mezclados');
    $('#btn-teams-clear').onclick = () => save(emptyTeams(), 'Equipos limpios');
  }
}

function renderHistory() {
  const past = app.history || [];
  const filter = app.historyFilter || {};
  const caption = app.historyMeta?.caption || 'Partidos pasados, los más recientes primero.';
  const active = !!(filter.day || filter.from || filter.to);
  if (!replaceView(`
    <h2 class="section">Historial de partidos</h2>
    <form id="history-filter" class="history-filter">
      <p class="hint roster-lead">Por defecto, los últimos 30. Una fecha, o un desde y hasta. Si completás la fecha, esa manda.</p>
      <label class="field"><span>Una fecha</span><input type="date" id="hist-day" value="${esc(filter.day || '')}"></label>
      <div class="row">
        <label class="field"><span>Desde</span><input type="date" id="hist-from" value="${esc(filter.from || '')}"></label>
        <label class="field"><span>Hasta</span><input type="date" id="hist-to" value="${esc(filter.to || '')}"></label>
      </div>
      <div class="history-actions">
        <button type="submit" class="btn primary" id="hist-apply">Ver</button>
        <button type="button" class="btn" id="hist-clear"${active ? '' : ' hidden'}>Limpiar</button>
      </div>
    </form>
    <p class="hint" id="hist-caption">${esc(caption)}</p>
    ${app.historyError ? `<div class="banner error" id="hist-error">${esc(app.historyError)}</div>` : ''}
    ${past.length ? `<ul class="match-list" id="list-history">${past.map(matchCard).join('')}</ul>` : `
      <div class="empty" id="list-history"><div class="big">📅</div><p><b>${active ? 'Nada en ese filtro.' : 'Todavía no hay partidos pasados.'}</b></p>
      <p class="small">${active ? 'Limpiar vuelve a los últimos 30.' : 'Cuando pase el día, el partido sale de Próximos partidos y queda acá.'}</p></div>`}
    <p class="footer-note">${esc(VENUE)} · Fútbol 7 contra 7</p>`)) return;
  $('#history-filter').onsubmit = (e) => {
    e.preventDefault();
    const day = $('#hist-day').value;
    const from = $('#hist-from').value;
    const to = $('#hist-to').value;
    const next = day ? { day } : ((from || to) ? { from, to } : null);
    app.historyFilter = next;
    app.store.setHistoryFilter(next);
  };
  const clear = $('#hist-clear');
  if (clear) clear.onclick = () => {
    app.historyFilter = null;
    app.store.setHistoryFilter(null);
  };
}

function renderMatch(id) {
  const m = matchById(id);
  if (!m) {
    if (app.matchMiss[id] === 'denied') {
      replaceView(`<div class="empty" id="match-denied"><div class="big">🔒</div><p><b>No se pudo abrir este partido.</b></p><p class="small">${esc(RULES_MSG)}</p><p><a class="btn" href="#/historial">Volver al historial</a></p></div>`);
      return;
    }
    if (app.matchMiss[id] !== 'done') {
      if (app.matchMiss[id] !== 'loading') {
        app.matchMiss[id] = 'loading';
        Promise.resolve(app.store.ensureMatch?.(id)).then((result) => {
          app.matchMiss[id] = result === 'denied' ? 'denied' : 'done';
          if (result === 'denied') showError(RULES_MSG);
          const current = route();
          if (current.name === 'match' && current.id === id) render();
        });
      }
      replaceView(`<div class="empty" id="match-missing"><div class="big">⚽</div><p><b>Buscando el partido…</b></p></div>`);
      return;
    }
    replaceView(`<div class="empty"><div class="big">🤷</div><p><b>No encontramos este partido.</b></p><p class="small">Puede que lo hayan borrado.</p><p><a class="btn" href="#/">Volver al inicio</a></p></div>`);
    return;
  }
  const everyone = playersOf(id);
  const ps = app.mine ? everyone.filter(minePlayer) : everyone;
  const cap = capOf(m);
  const who = actor();
  const readOnly = !canAdd(m, who.uid);
  const block = addBlock(m);
  const slots = [];
  for (let i = 0; i < (app.mine ? ps.length : Math.max(cap, everyone.length)); i++) {
    const p = ps[i];
    if (!p) {
      slots.push(readOnly || block
        ? `<li><div class="slot free"><span class="n">${i + 1}</span><span>Lugar libre</span></div></li>`
        : `<li><button class="slot free" data-free="${i}"><span class="n">${i + 1}</span><span>Lugar libre · tocá para anotar</span></button></li>`);
      continue;
    }
    const payText = paymentStatusText(p);
    slots.push(`
      <li class="slot ${i >= cap ? 'extra' : ''}" data-player="${esc(p.id)}">
        <span class="n">${i + 1}</span>
        <button type="button" class="who" data-profile="${esc(p.id)}">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${phoneSub(p)}
            ${friendTag(p)}${addedTag(p)}${confirmTag(p)}${i >= cap ? '<span class="tag">Excede el cupo</span>' : ''}</div>
          ${payMarkup(p)}
          ${promoBadge(p)}
        </button>
        ${readOnly ? '' : confirmSpotButton(p)}
        ${readOnly ? '' : `<button type="button" class="pay-btn ${p.paid === true ? 'on' : ''}" data-pay="${esc(p.id)}" aria-label="Pago de ${esc(p.name)}${payText ? ': ' + esc(payText) : ''}">💵</button>`}
        ${waButton(p, waMessage(m, p))}
        ${readOnly ? '' : `<button class="more-btn" data-menu="${esc(p.id)}" aria-label="Opciones de ${esc(p.name)}">${ICON.more}</button>`}
      </li>`);
  }
  const full = everyone.length >= cap;
  const collected = collectedLine(everyone);
  const mineLine = mineSummary(app.players.filter((p) => p.matchId === id), app.who).text;
  const assigned = normalizeTeams(m.teams, everyone.map((p) => p.id));
  const teamCount = assigned.bib.length + assigned.plain.length;
  const signed = everyone.length + waitingOf(id).length;
  const canEdit = canEditMatch(m, who.uid);
  const notesText = String(m.notes || '').trim();
  if (!replaceView(`
    <section class="detail-head">
      <h1>${esc(capitalize(labelDate(m.date)))}</h1>
      <div class="when">${relativeLabel(m.date) ? `<span class="badge">${relativeLabel(m.date)}</span> ` : ''}${m.cancelled ? '<span class="badge bad">Cancelado</span> ' : ''}${esc(m.time || '--:--')} hs · ${esc(placeOf(m))}</div>
      <p class="hint" id="match-size">Fútbol ${perTeamOf(m)} contra ${perTeamOf(m)} · ${cap} jugadores</p>
      ${m.note ? `<div class="note">📝 ${esc(m.note)}</div>` : ''}
      ${m.cancelled ? '<p class="match-cancelled" id="match-cancelled">Partido cancelado. No se mandan recordatorios ni se puede confirmar.</p>' : ''}
      <div class="match-notes" id="match-notes">
        <div class="match-notes-head"><strong>Notas</strong>${canEdit ? '<button type="button" class="btn" id="btn-notes">Editar</button>' : ''}</div>
        ${notesText ? `<p class="match-notes-text">${esc(m.notes)}</p>` : '<p class="hint">Sin notas.</p>'}
      </div>
      <div class="meta"><strong id="slot-count">${everyone.length}/${cap}</strong><div class="bar"><i style="width:${Math.min(100, (everyone.length / cap) * 100)}%"></i></div><span class="muted small">${full ? '¡Completo!' : `Faltan ${cap - everyone.length}`}</span></div>
      ${collected ? `<div class="collected" id="collected">${esc(collected)}</div>` : ''}
      <div class="mine-line" id="mine-stats">${esc(mineLine)}</div>
      ${everyone.length ? `<div class="confirm-sum" id="confirm-sum">${esc(confirmSummary(everyone).text)}</div>` : ''}
      <div class="detail-tools">
        <button class="btn" id="btn-copy">${ICON.copy}Copiar lista</button>
        ${canEdit ? `<button class="btn" id="btn-edit-match">${ICON.edit}Editar</button>` : ''}
        ${canDelete(m, who.uid) && signed === 0 ? `<button class="btn danger" id="btn-del-match">${ICON.trash}Borrar</button>` : ''}
      </div>
      ${canEdit && signed > 0 && !m.cancelled && !matchAlreadyPlayed(m) ? '<button type="button" class="btn danger block" id="btn-cancel-match">Cancelar partido</button>' : ''}
      ${canEdit && m.cancelled ? '<button type="button" class="btn block" id="btn-reactivate-match">Reactivar partido</button>' : ''}
      <button type="button" class="btn block" id="btn-teams">Equipos${teamCount ? ` · ${assigned.bib.length}-${assigned.plain.length}` : ''}</button>
    </section>
    ${readOnly ? '<p class="hint" id="match-readonly">Solo lectura. No podés anotar ni cambiar este partido.</p>' : ''}
    ${reminderBanners([m])}
    ${readOnly || m.cancelled ? '' : '<button type="button" class="btn block remind-open" id="btn-remind">Enviar recordatorios</button>'}
    ${app.mine ? '<p class="hint" id="mine-filter">Viendo solo lo que anotaste y cobraste.</p>' : ''}
    <h2 class="section">Jugadores</h2>
    <ul class="slots" id="slots">${slots.join('')}</ul>
    ${waitingSection(m, everyone.length >= cap, readOnly)}
    <div class="actionbar"><div class="actionbar-inner match-actions">
      <button class="btn share-btn" id="btn-share" aria-label="Compartir lista">${ICON.share}</button>
      ${readOnly ? '' : `<button class="btn add-choice" id="btn-add-wait" ${block ? 'disabled' : ''}>${block ? esc(block) : 'Anotar en lista de espera'}</button>
      <button class="btn primary add-choice" id="btn-add-player" ${block ? 'disabled' : ''}>${block ? esc(block) : `${ICON.plus}Agregar jugador`}</button>`}
    </div></div>`)) return;

  if ($('#btn-remind')) $('#btn-remind').onclick = () => openReminders(m);
  bindReminderBanners();
  if ($('#btn-add-player')) $('#btn-add-player').onclick = () => { if (!block) openPlayerForm(m); };
  if ($('#btn-add-wait')) $('#btn-add-wait').onclick = () => { if (!block) openPlayerForm(m, null, { waiting: true }); };
  const onRow = (e) => {
    const spot = e.target.closest('[data-confirm-spot]');
    if (spot) {
      const player = app.players.find((p) => p.id === spot.dataset.confirmSpot);
      if (player) clearReservedSpot(player);
      return;
    }
    const promote = e.target.closest('[data-promote]');
    if (promote) return promoteToMatch(m, app.players.find((p) => p.id === promote.dataset.promote), promote.disabled);
  };
  $('#wait-list').onclick = (e) => {
    onRow(e);
    const up = e.target.closest('[data-wait-up]');
    if (up) return moveWait(m.id, up.dataset.waitUp, -1, up.disabled);
    const down = e.target.closest('[data-wait-down]');
    if (down) return moveWait(m.id, down.dataset.waitDown, 1, down.disabled);
    const menu = e.target.closest('[data-menu]');
    if (menu) return openPlayerMenu(m, app.players.find((p) => p.id === menu.dataset.menu));
    const who = e.target.closest('[data-profile]');
    if (who) return openPlayerProfile(app.players.find((p) => p.id === who.dataset.profile), m.id);
  };
  $('#slots').onclick = (e) => {
    onRow(e);
    const pay = e.target.closest('[data-pay]');
    if (pay) return openPaymentForm(m, app.players.find((p) => p.id === pay.dataset.pay));
    const free = e.target.closest('[data-free]');
    if (free) return openPlayerForm(m);
    const menu = e.target.closest('[data-menu]');
    if (menu) return openPlayerMenu(m, app.players.find((p) => p.id === menu.dataset.menu));
    const who = e.target.closest('[data-profile]');
    if (who) return openPlayerProfile(app.players.find((p) => p.id === who.dataset.profile), m.id);
  };
  $('#btn-copy').onclick = () => copyText(listText(m)).then((ok) => toast(ok ? 'Lista copiada' : 'No se pudo copiar'));
  $('#btn-share').onclick = () => shareText(listText(m));
  $('#btn-teams').onclick = () => { location.hash = `#/partido/${encodeURIComponent(m.id)}/equipos`; };
  if ($('#btn-edit-match')) $('#btn-edit-match').onclick = () => openMatchForm(m);
  if ($('#btn-notes')) $('#btn-notes').onclick = () => openNotes(m);
  if ($('#btn-cancel-match')) $('#btn-cancel-match').onclick = () => openCancel(m);
  if ($('#btn-reactivate-match')) $('#btn-reactivate-match').onclick = () => reactivateMatch(m);
  if ($('#btn-del-match')) $('#btn-del-match').onclick = () => {
    if (!confirm(`¿Borrar el partido del ${labelDate(m.date)} ${m.time} hs?`)) return;
    run(app.store.deleteMatch(m.id), 'Partido borrado');
    location.hash = '#/';
  };
}

/* ───────── textos ───────── */
function confirmUrlFor(m, p) {
  if (isShortCode(p?.shortCode)) return shortConfirmUrl(p.shortCode);
  if (p?.confirmToken && p?.id) return confirmPageUrl({ matchId: m.id, playerId: p.id, token: p.confirmToken });
  return '';
}
function waMessage(m, p) {
  const first = (p.name || '').trim().split(/\s+/)[0];
  const link = confirmUrlFor(m, p);
  return `¡Hola ${first}! Te anoté para el fútbol 7 en ${placeOf(m)} el ${labelDate(m.date)} a las ${m.time} hs.` +
    (m.note ? ` (${m.note})` : '') + ` ¿Confirmás? ⚽` + (link ? ` ${link}` : '');
}
function listText(m) {
  const ps = playersOf(m.id);
  const cap = capOf(m);
  const lines = [`⚽ Fútbol 7 · ${placeOf(m)}`, `📅 ${capitalize(labelDate(m.date))} · ${m.time} hs`];
  if (m.note) lines.push(`📝 ${m.note}`);
  if (m.cancelled) lines.push('Cancelado');
  if (String(m.notes || '').trim()) lines.push(String(m.notes).trim());
  lines.push('');
  for (let i = 0; i < Math.max(cap, ps.length); i++) {
    const p = ps[i];
    const pay = p ? paymentStatusText(p) : '';
    const hold = p?.tentative === true ? 'a confirmar' : '';
    const bits = [pay, hold].filter(Boolean).join(' · ');
    lines.push(`${i + 1}. ${p ? p.name + friendSuffix(p) : ''}${bits ? ` — ${bits}` : ''}`);
  }
  lines.push('', ps.length >= cap ? '✅ ¡Completo!' : `Faltan ${cap - ps.length}`);
  const collected = collectedLine(ps);
  if (collected) lines.push(collected);
  const summary = confirmSummary(ps);
  if (ps.length) lines.push(summary.text);
  const wait = waitingOf(m.id);
  if (wait.length) {
    lines.push('', 'Lista de espera:');
    wait.forEach((p, i) => {
      const pay = paymentStatusText(p);
      lines.push(`${i + 1}. ${p.name}${friendSuffix(p)}${pay ? ` — ${pay}` : ''}`);
    });
  }
  return lines.join('\n');
}

function waitingSection(m, full, readOnly) {
  const allWait = waitingOf(m.id);
  const wait = app.mine ? allWait.filter(minePlayer) : allWait;
  const rows = wait.map((p, i) => {
    const idx = allWait.findIndex((item) => item.id === p.id);
    const first = idx <= 0;
    const last = idx === allWait.length - 1;
    return `
      <li class="slot wait" data-player="${esc(p.id)}">
        <div class="arrows">
          <button type="button" class="arrow-btn" data-wait-up="${esc(p.id)}" ${first ? 'disabled' : ''} aria-label="Subir prioridad de ${esc(p.name)}">↑</button>
          <button type="button" class="arrow-btn" data-wait-down="${esc(p.id)}" ${last ? 'disabled' : ''} aria-label="Bajar prioridad de ${esc(p.name)}">↓</button>
        </div>
        <span class="n">${i + 1}</span>
        <button type="button" class="who" data-profile="${esc(p.id)}">
          <div class="name">${esc(p.name)}</div>
          <div class="sub">${phoneSub(p)}
            ${friendTag(p)}${addedTag(p)}${confirmTag(p)}</div>
          ${payMarkup(p)}
        </button>
        ${readOnly ? '' : `<button type="button" class="btn promote-btn" data-promote="${esc(p.id)}" ${full ? 'disabled' : ''} aria-label="Subir a ${esc(p.name)} al partido">Subir al partido</button>`}
        ${waButton(p, waMessage(m, p))}
        <button type="button" class="more-btn" data-menu="${esc(p.id)}" aria-label="Opciones de ${esc(p.name)}">${ICON.more}</button>
      </li>`;
  }).join('');
  return `
    <h2 class="section">Lista de espera</h2>
    ${wait.length ? `<ul class="slots" id="wait-list">${rows}</ul>` : '<p class="empty-wait" id="wait-list">Nadie en espera. Los que se anotan acá quedan al final, en orden de llegada.</p>'}`;
}

function confirmTag(p) {
  const s = confirmStatus(p);
  if (!s) return '';
  if (p?.tentative === true) {
    const note = s.note ? `<span class="reserved-free">${esc(s.note)}</span>` : '';
    return `<span class="reserved-badge${s.note ? ' declined' : ''}">${esc(s.text)}</span>${note}`;
  }
  return `<span class="confirm-tag ${s.cls}">${s.text}</span>`;
}
function confirmSpotButton(p) {
  if (p?.tentative !== true) return '';
  return `<button type="button" class="btn confirm-spot" data-confirm-spot="${esc(p.id)}">Confirmar lugar</button>`;
}
function clearReservedSpot(player) {
  if (!player || player.tentative !== true) return;
  run(app.store.clearTentative(player.id), 'Lugar confirmado');
}

const REMINDER_BANNER = 'Faltan 2 horas: mandá los recordatorios';

function myReminderPlayers(matchId) {
  return playersForOrganizer(app.players.filter((p) => p.matchId === matchId), app.who);
}

function reminderBanners(matches) {
  const now = Date.now();
  const due = (matches || []).filter((m) => needsReminderBanner(m, myReminderPlayers(m.id), now));
  if (!due.length) return '';
  return `<div class="remind-banners">${due.map((m) => {
    const prog = reminderProgress(myReminderPlayers(m.id));
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
  if (m?.cancelled === true) { toast('El partido está cancelado. No se mandan recordatorios.'); return; }
  const everyone = [...playersOf(m.id), ...waitingOf(m.id)];
  if (!everyone.length) { toast('No hay jugadores para avisar'); return; }
  let showAll = false;
  openSheet(`<h3>Enviar recordatorios</h3><p class="hint">Armando los links…</p>`);
  const tokens = new Map();
  const codes = new Map();
  try {
    for (const p of everyone) {
      if (!p.phone) continue;
      tokens.set(p.id, await app.store.ensureConfirmToken(p.id));
      const code = await app.store.ensureShortLink(p.id);
      if (code) codes.set(p.id, code);
    }
  } catch (e) {
    console.error(e);
    toast('No se pudieron armar los links');
    closeSheet();
    return;
  }
  const fresh = everyone.map((p) => ({
    ...p,
    confirmToken: tokens.get(p.id) || p.confirmToken,
    shortCode: codes.get(p.id) || p.shortCode,
  }));
  const linkById = new Map(reminderLinks({
    match: m, players: fresh, venue: placeOf(m),
  }).map((row) => [row.id, row]));
  const externalById = new Map();
  const hrefFor = (link) => {
    const external = link ? externalById.get(link.id) : '';
    if (!link || !external) return link?.waUrl || '';
    return waSendUrl({ phone: link.phone, text: link.text.split(link.confirmUrl).join(external) });
  };
  for (const p of fresh) {
    if (!isShortCode(p.shortCode)) continue;
    void resolveExternalShort(p.shortCode).then((url) => {
      if (!url) return;
      externalById.set(p.id, url);
      const link = linkById.get(p.id);
      const a = document.querySelector(`#remind-list a[data-send="${CSS.escape(p.id)}"]`);
      if (a && link) a.href = hrefFor(link);
    });
  }
  const paint = () => {
    const visible = showAll ? fresh : playersForOrganizer(fresh, app.who);
    const prog = reminderProgress(visible);
    const rows = visible.map((p) => {
      const link = linkById.get(p.id);
      if (phoneHidden(p)) {
        return `<li class="remind-row"><div class="who"><div class="name">${esc(p.name)}</div><div class="sub private-wa">${esc(PRIVATE_WA_TEXT)}</div></div></li>`;
      }
      if (!link) {
        return `<li class="remind-row"><div class="who"><div class="name">${esc(p.name)}</div><div class="sub">Sin número de WhatsApp</div></div><button type="button" class="btn" data-remind-phone="${esc(p.id)}">Cargar WhatsApp</button></li>`;
      }
      const sent = !!p.reminderSentAt;
      return `<li class="remind-row" data-remind="${esc(p.id)}">
        <div class="who"><div class="name">${esc(p.name)}</div><div class="sub">${sent ? '<span class="sent">Enviado</span>' : 'Listo para enviar'}</div></div>
        <a class="btn primary" href="${esc(hrefFor(link))}" target="_blank" rel="noopener" data-send="${esc(p.id)}">${sent ? 'Enviar de nuevo' : 'Enviar'}</a>
      </li>`;
    }).join('');
    openSheet(`
      <h3>Enviar recordatorios</h3>
      <p class="hint">${esc(capitalize(labelDate(m.date)))} · ${esc(m.time)} hs. Cada Enviar abre WhatsApp con el mensaje y el link de esa persona. Hay que tocar enviar en el chat: no se manda solo.</p>
      <div class="chips" id="remind-scope">
        <button type="button" class="btn chip ${showAll ? '' : 'on'}" data-remind-scope="mine">Mis jugadores</button>
        <button type="button" class="btn chip ${showAll ? 'on' : ''}" data-remind-scope="all">Todos</button>
      </div>
      <p class="hint" id="remind-prog">${prog.sent} de ${prog.total} enviados${showAll ? ' · todos' : ' · los que anotaste'}</p>
      ${rows ? `<ul class="remind-list" id="remind-list">${rows}</ul>` : '<p class="empty-wait" id="remind-list">No anotaste a nadie en este partido.</p>'}
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
    $('#remind-scope').onclick = (e) => {
      const btn = e.target.closest('[data-remind-scope]');
      if (!btn) return;
      const next = btn.dataset.remindScope === 'all';
      if (next === showAll) return;
      showAll = next;
      paint();
    };
    const list = $('#remind-list');
    if (!list) return;
    list.addEventListener('click', (e) => {
      const addPhone = e.target.closest('[data-remind-phone]');
      if (addPhone) {
        const person = fresh.find((p) => p.id === addPhone.dataset.remindPhone);
        if (!person) return;
        closeSheet();
        app.wantPhoneForm = true;
        openPlayerProfile(person, m.id);
        return;
      }
      const link = e.target.closest('[data-send]');
      if (!link) return;
      const id = link.dataset.send;
      const person = fresh.find((p) => p.id === id);
      if (person) person.reminderSentAt = Date.now();
      const row = link.closest('.remind-row');
      const sub = row?.querySelector('.sub');
      if (sub) sub.innerHTML = '<span class="sent">Enviado</span>';
      link.textContent = 'Enviar de nuevo';
      const line = $('#remind-prog');
      if (line) {
        const nowProg = reminderProgress(showAll ? fresh : playersForOrganizer(fresh, app.who));
        line.textContent = `${nowProg.sent} de ${nowProg.total} enviados${showAll ? ' · todos' : ' · los que anotaste'}`;
      }
      run(app.store.markReminderSent(id));
    });
  };
  paint();
}

function moveWait(matchId, id, dir, disabled) {
  if (disabled) return;
  const updates = moveWaiting(waitingOf(matchId), id, dir);
  if (!updates.length) return;
  run(app.store.setWaitOrders(updates));
}

function promoteToMatch(m, player, disabled) {
  if (disabled || !player || addBlock(m)) return;
  const cap = capOf(m);
  if (playersOf(m.id).length >= cap) return;
  const job = (async () => {
    await app.store.promoteFromWaiting(player.id);
    toast(`${player.name} pasó al partido`);
    await offerPromotionWhatsApp(player, m);
  })();
  run(job);
}

function openNotes(m) {
  openSheet(`
    <form id="notes-form" novalidate>
      <h3>Notas</h3>
      <p class="hint">Motivo de una cancelación, o algo que pasó en el partido. Lo ven quienes pueden ver este partido.</p>
      <label class="field"><span>Notas</span><textarea name="notes" maxlength="2000" autofocus>${esc(m.notes || '')}</textarea></label>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  $('#notes-form').onsubmit = (e) => {
    e.preventDefault();
    const notes = String(new FormData(e.target).get('notes') || '').slice(0, 2000);
    closeSheet();
    run(app.store.updateMatch(m.id, { notes }, app.who), 'Notas guardadas');
  };
}

function openCancel(m) {
  if (!m || matchAlreadyPlayed(m)) return;
  const signed = playersOf(m.id).length + waitingOf(m.id).length;
  openSheet(`
    <form id="cancel-form" novalidate>
      <h3>Cancelar partido</h3>
      <p class="hint">Queda cancelado, con sus ${signed} jugadores. No se borra. No se mandan recordatorios y el link de confirmación deja de pedir sí o no.</p>
      <p class="hint">Si querés, escribí el motivo en las notas.</p>
      <label class="field"><span>Notas</span><textarea id="cancel-notes" name="notes" maxlength="2000">${esc(m.notes || '')}</textarea></label>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Volver</button><button class="btn danger" type="submit">Cancelar partido</button></div>
    </form>`);
  $('#cancel-form').onsubmit = (e) => {
    e.preventDefault();
    const notes = String(new FormData(e.target).get('notes') || '').slice(0, 2000);
    closeSheet();
    const next = { ...m, notes, cancelled: true };
    const job = (async () => {
      await app.store.updateMatch(m.id, {
        cancelled: true,
        cancelledAt: Date.now(),
        cancelledBy: actor().uid,
        notes,
      }, app.who);
      await offerCancelWhatsApp(next);
    })();
    run(job, 'Partido cancelado');
  };
}

function reactivateMatch(m) {
  if (!confirm('¿Volver a activar este partido?')) return;
  run(app.store.updateMatch(m.id, { cancelled: false }, app.who), 'Partido reactivado');
}

async function offerCancelWhatsApp(match) {
  const people = [...playersOf(match.id), ...waitingOf(match.id)];
  const links = cancelLinks({ match, players: people, venue: placeOf(match) });
  if (!links.length) {
    toast(people.some(phoneHidden) ? PRIVATE_WA_TEXT : 'Nadie tiene WhatsApp para avisar la cancelación.');
    return;
  }
  if (!confirm('¿Avisar por WhatsApp a los jugadores que se canceló?')) return;
  const rows = links.map((link) => `
    <li class="remind-row">
      <div class="who"><div class="name">${esc(link.name)}</div></div>
      <a class="btn primary" href="${esc(link.waUrl)}" target="_blank" rel="noopener">Avisar</a>
    </li>`).join('');
  openSheet(`
    <h3>Avisar la cancelación</h3>
    <p class="hint">Cada Avisar abre WhatsApp con el mensaje. No se manda solo y no incluye el link para confirmar.</p>
    <ul class="remind-list" id="cancel-links">${rows}</ul>
    <div class="sheet-actions"><button type="button" class="btn" data-close>Cerrar</button></div>`);
}

async function offerPromotionWhatsApp(player, match) {
  if (phoneHidden(player)) { toast(PRIVATE_WA_TEXT); return; }
  const phone = String(player?.phone || '').trim();
  if (!phone) {
    toast(`${player.name} no tiene WhatsApp para avisarle. Lo podés cargar en el perfil.`);
    return;
  }
  const token = await app.store.ensureConfirmToken(player.id);
  if (!confirm(`¿Avisarle por WhatsApp a ${player.name} que subió al partido?`)) return;
  const pending = window.open('about:blank', '_blank');
  const code = await app.store.ensureShortLink(player.id);
  const external = isShortCode(code) ? await resolveExternalShort(code) : '';
  const confirmUrl = external || (isShortCode(code)
    ? shortConfirmUrl(code)
    : confirmPageUrl({ matchId: match.id, playerId: player.id, token }));
  const text = promotionMessage({ player, match, venue: placeOf(match), confirmUrl });
  placeWa(pending, waSendUrl({ phone, text }));
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
  const ok = await copyText(text);
  toast(ok ? 'Lista copiada. Pegala en el grupo.' : 'No se pudo compartir');
  openWa({ text });
}

/* ───────── sheet (dialog) ───────── */
const sheet = $('#sheet');
const tabbar = $('#tabbar');
const tabSlot = $('#tab-slot');
let sheetLocked = false;
function restoreTabs() {
  if (!tabbar || !tabSlot || tabbar.parentElement === tabSlot) return;
  tabSlot.append(tabbar);
  tabSlot.style.minHeight = '';
}
/* Mientras hay una hoja abierta, las pestañas viven dentro del diálogo
   para seguir tocables. La hoja queda debajo y no las tapa. */
function liftTabs() {
  if (!tabbar || !sheet.open) return;
  placeBars();
  if (tabbar.parentElement === sheet) return;
  if (tabSlot) tabSlot.style.minHeight = `${tabbar.offsetHeight}px`;
  sheet.prepend(tabbar);
  placeBars();
}
function openSheet(html, { locked = false } = {}) {
  sheetLocked = locked;
  restoreTabs();
  sheet.innerHTML = `<div class="sheet-body">${html}</div>`;
  if (!sheet.open) sheet.showModal();
  liftTabs();
  const first = sheet.querySelector('[autofocus]');
  if (first) setTimeout(() => first.focus(), 50);
  return sheet;
}
function closeSheet() { sheetLocked = false; if (sheet.open) sheet.close(); }
if (tabbar) tabbar.addEventListener('click', (e) => {
  const link = e.target.closest('a[href]');
  if (!link || !sheet.open) return;
  e.preventDefault();
  const href = link.getAttribute('href');
  closeSheet();
  if (href && location.hash !== href) location.hash = href;
});
sheet.addEventListener('cancel', (e) => { if (sheetLocked) e.preventDefault(); });
sheet.addEventListener('click', (e) => {
  if (e.target === sheet && !sheetLocked) closeSheet();
  if (e.target.closest('[data-close]')) closeSheet();
});

function openWa({ phone = '', text = '' } = {}) {
  window.open(waSendUrl({ phone, text }), '_blank', 'noopener');
}

const externalShortJobs = new Map();
function resolveExternalShort(code) {
  if (!isShortCode(code)) return Promise.resolve('');
  const pending = externalShortJobs.get(code);
  if (pending) return pending;
  const job = (async () => {
    const cached = await app.store.readExternalShort(code);
    if (cached?.shortUrl) return cached.shortUrl;
    const got = await shortenExternal(shortConfirmUrl(code));
    if (!got?.shortUrl) return '';
    await app.store.saveExternalShort(code, got);
    return got.shortUrl;
  })();
  externalShortJobs.set(code, job);
  job.then((url) => { if (!url) externalShortJobs.delete(code); }, () => externalShortJobs.delete(code));
  return job;
}

function placeWa(win, url) {
  if (win && !win.closed) {
    win.location.replace(url);
    return;
  }
  window.location.href = url;
}

function bindExternalShortClicks() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a.wa-btn[data-short-code]');
    if (!a) return;
    const code = a.dataset.shortCode || '';
    if (!isShortCode(code)) return;
    e.preventDefault();
    const pending = window.open('about:blank', '_blank');
    const phone = a.dataset.waPhone || '';
    const text = a.dataset.waText || '';
    const house = shortConfirmUrl(code);
    void resolveExternalShort(code).then((external) => {
      const next = external ? text.split(house).join(external) : text;
      placeWa(pending, waSendUrl({ phone, text: next }));
    });
  });
}

/* Ajustes */
function openSettings() {
  const demo = app.session?.mode !== 'firebase';
  openSheet(`
    <h3>Ajustes</h3>
    <p class="hint">${demo ? 'Modo demo: los datos se guardan solo en este dispositivo.' : '✅ Conectado a Firebase: los datos se comparten en tiempo real.'}</p>
    <p class="hint" id="set-who">Entraste como ${esc(app.who || '—')} · ${app.role === 'admin' ? 'administrador' : 'organizador'}.</p>
    <label class="checkline" id="set-mine-line"><input type="checkbox" id="set-mine"${app.mine ? ' checked' : ''}><span>Solo lo que anoté y lo que cobré</span></label>
    <p class="hint">Oculta en Próximos partidos, el partido y Pagos lo de los demás organizadores. El cupo del partido no cambia.</p>
    <form id="price-form" novalidate>
      <p class="hint">Precios. Los ven todos al toque.</p>
      ${app.pricesError ? `<p class="hint">${esc(app.pricesError)}</p>` : ''}
      <label class="field"><span>Un partido</span><input name="matchPrice" inputmode="numeric" autocomplete="off" value="${livePrices().matchPrice}"></label>
      <label class="field"><span>Promo 2 partidos</span><input name="promo2Price" inputmode="numeric" autocomplete="off" value="${livePrices().promo2Price}"></label>
      <label class="field"><span>Promo 3 partidos</span><input name="promo3Price" inputmode="numeric" autocomplete="off" value="${livePrices().promo3Price}"></label>
      <div class="err" id="price-err"></div>
      <button class="btn" type="submit">Guardar precios</button>
    </form>
    <p class="hint">Tamaño del texto</p>
    <div class="text-size-choice" role="group" aria-label="Tamaño del texto">
      ${TEXT_SIZES.map((step, i) => `<button type="button" class="btn${i === readTextSize() ? ' primary' : ''}" data-text-size="${i}" aria-pressed="${i === readTextSize() ? 'true' : 'false'}">${esc(step.label)}</button>`).join('')}
    </div>
    <div class="menu" id="set-sections">
      <button type="button" class="btn" id="set-venues">Sedes</button>
      ${app.role === 'admin' ? '<a class="btn" id="set-organizers" href="#/usuarios">Organizadores</a>' : ''}
    </div>
    <div class="menu">
      <button class="btn" id="set-notify">Aviso 2 horas antes</button>
      ${demo ? '<button class="btn danger" id="set-clear">Borrar datos de demo</button>' : ''}
      ${ACCESS_CODE ? '<button class="btn" id="set-forget">Olvidar código de acceso</button>' : ''}
      <button class="btn" id="set-logout">Cerrar sesión</button>
      <button class="btn ghost" data-close>Cerrar</button>
    </div>
    <p class="footer-note">Fútbol 7 · ${esc(VENUE)} · v1</p>`);
  $('#price-form').onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    const rec = priceRecord({ matchPrice: form.matchPrice.value, promo2Price: form.promo2Price.value, promo3Price: form.promo3Price.value });
    if (!rec.ok) { $('#price-err').textContent = rec.error; return; }
    $('#price-err').textContent = '';
    Promise.resolve(app.store.setPrices(rec.patch)).then(() => toast('Precios guardados')).catch((error) => {
      if (isPermissionDenied(error)) toast(PRICES_DENIED_WRITE);
      else $('#price-err').textContent = error?.message || 'No se pudieron guardar los precios.';
    });
  };
  sheet.querySelectorAll('[data-text-size]').forEach((btn) => {
    btn.onclick = () => { saveTextSize(Number(btn.dataset.textSize)); syncTextSize(); };
  });
  const venuesBtn = $('#set-venues');
  if (venuesBtn) venuesBtn.onclick = () => openVenues();
  const users = $('#set-organizers');
  if (users) users.onclick = () => closeSheet();
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
  const forget = $('#set-forget');
  if (forget) forget.onclick = () => { localStorage.removeItem(CODE_KEY); location.reload(); };
  $('#set-logout').onclick = () => { closeSheet(); app.session.logout(); };
  const mine = $('#set-mine');
  if (mine) mine.onchange = () => { app.mine = mine.checked; render(); };
}

function accessEditor(m) {
  const me = actor();
  if (m && !canEditAccess(m, me.uid)) return '';
  const staff = staffUsers(app.users);
  const people = staff.some((user) => user.uid === me.uid) ? staff : [...staff, { uid: me.uid, name: me.name, role: app.role, active: true }];
  const viewers = new Set(Array.isArray(m?.viewers) && m.viewers.length && !m.viewers.includes('*') ? m.viewers : people.map((user) => user.uid));
  const adders = new Set(Array.isArray(m?.adders) && m.adders.length && !m.adders.includes('*') ? m.adders : people.map((user) => user.uid));
  const limits = new Map((m?.limits || []).map((row) => [row.uid, row.max]));
  const solo = m?.solo === true;
  const rows = people.map((user) => {
    const mine = user.uid === me.uid;
    return `<div class="access-person" data-person="${esc(user.uid)}">
      <span class="who">${esc(user.name)}${user.role === 'admin' ? ' · admin' : ''}</span>
      <label><input type="checkbox" data-view="${esc(user.uid)}" ${viewers.has(user.uid) || mine ? 'checked' : ''} ${mine ? 'disabled' : ''}> Ve</label>
      <label><input type="checkbox" data-add="${esc(user.uid)}" ${adders.has(user.uid) || mine ? 'checked' : ''} ${mine ? 'disabled' : ''}> Anota</label>
      <label class="limit">Límite <input data-limit="${esc(user.uid)}" inputmode="numeric" value="${limits.has(user.uid) ? esc(String(limits.get(user.uid))) : ''}" placeholder="—"></label>
    </div>`;
  }).join('');
  return `<fieldset class="access-box" id="match-access">
    <legend>Quién entra</legend>
    <label class="checkline"><input type="checkbox" id="match-solo" ${solo ? 'checked' : ''}> Solo yo: nadie más lo ve, tampoco el admin</label>
    <div id="match-access-fields" ${solo ? 'hidden' : ''}>
      <p class="hint">Quién puede ver este partido y quién puede anotar. El límite cuenta titulares y lista de espera. Vacío = sin límite.</p>
      ${rows || '<p class="hint">Todavía no hay otras cuentas.</p>'}
    </div>
  </fieldset>`;
}

function readAccessForm() {
  const solo = !!$('#match-solo')?.checked;
  const viewerIds = [...document.querySelectorAll('[data-view]')].filter((el) => el.checked).map((el) => el.dataset.view);
  const adderIds = [...document.querySelectorAll('[data-add]')].filter((el) => el.checked).map((el) => el.dataset.add);
  const limits = [...document.querySelectorAll('[data-limit]')].map((el) => ({ uid: el.dataset.limit, max: el.value.trim() === '' ? null : Number(el.value) }));
  return buildAccess({ solo, viewerIds, adderIds, limits, staff: staffUsers(app.users), creator: actor() });
}

function bindAccessForm() {
  const solo = $('#match-solo');
  const fields = $('#match-access-fields');
  if (!solo || !fields) return;
  const sync = () => {
    fields.hidden = solo.checked;
    fields.querySelectorAll('input').forEach((el) => { el.disabled = solo.checked || el.dataset.view === actor().uid || el.dataset.add === actor().uid; });
    fields.querySelectorAll('[data-view]').forEach((view) => {
      const add = fields.querySelector(`[data-add="${view.dataset.view}"]`);
      const limit = fields.querySelector(`[data-limit="${view.dataset.view}"]`);
      if (!view.checked && add && add.dataset.add !== actor().uid) { add.checked = false; add.disabled = true; }
      if (view.checked && add && !solo.checked && add.dataset.add !== actor().uid) add.disabled = false;
      if (limit) limit.disabled = solo.checked || !(add && add.checked);
    });
  };
  solo.addEventListener('change', sync);
  fields.addEventListener('change', sync);
  sync();
}

function venueOptions(match) {
  const choices = venueChoices(app.venues, { unreadable: !!app.venuesError, currentId: match?.venueId || '' });
  const selected = match?.venueId && choices.some((item) => item.id === match.venueId)
    ? match.venueId
    : defaultVenueId(app.venues, { unreadable: !!app.venuesError });
  return { choices, selected };
}

function openVenues() {
  const rows = [...(app.venues || [])].sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0) || String(a.name).localeCompare(String(b.name), 'es'));
  const list = rows.length ? rows : venueChoices([], { unreadable: true });
  openSheet(`
    <h3>Sedes</h3>
    <p class="hint">Aparecen al armar un partido. Desactivar la saca de los partidos nuevos. Los que ya la usan siguen mostrándola. No se borra.</p>
    ${app.venuesError ? `<p class="hint" id="venues-error">${esc(app.venuesError)}</p>` : ''}
    <ul class="slots" id="venue-list">${list.map((venue) => `
      <li class="slot" data-venue="${esc(venue.id)}">
        <div class="who">
          <div class="name">${esc(venue.name)}</div>
          <div class="sub">${venue.active === false ? 'Inactiva' : 'Activa'}</div>
        </div>
        <button type="button" class="btn" data-venue-edit="${esc(venue.id)}">Editar</button>
        <button type="button" class="btn" data-venue-active="${esc(venue.id)}">${venue.active === false ? 'Activar' : 'Desactivar'}</button>
      </li>`).join('')}</ul>
    <form id="venue-form" novalidate>
      <label class="field"><span>Nueva sede</span><input name="name" maxlength="80" autocomplete="off" placeholder="Ej: Club Norte"></label>
      <div class="err" id="venue-err"></div>
      <div class="sheet-actions"><button type="button" class="btn" id="venues-back">Volver</button><button class="btn primary" type="submit">Agregar sede</button></div>
    </form>`);
  $('#venues-back').onclick = () => openSettings();
  $('#venue-form').onsubmit = (e) => {
    e.preventDefault();
    const name = e.target.name.value;
    Promise.resolve(app.store.addVenue(name)).then(() => { toast('Sede agregada'); openVenues(); }).catch((error) => {
      $('#venue-err').textContent = isVenueDenied(error) ? VENUES_DENIED_WRITE : (error?.message || 'No se pudo guardar');
    });
  };
  $('#venue-list').onclick = (e) => {
    const edit = e.target.closest('[data-venue-edit]');
    if (edit) {
      const venue = (app.venues || []).find((item) => item.id === edit.dataset.venueEdit) || list.find((item) => item.id === edit.dataset.venueEdit);
      if (venue) openVenueEdit(venue);
      return;
    }
    const toggle = e.target.closest('[data-venue-active]');
    if (!toggle) return;
    const venue = (app.venues || []).find((item) => item.id === toggle.dataset.venueActive);
    if (!venue) return;
    const next = venue.active === false;
    if (!next && !confirm(`¿Desactivar ${venue.name}? Los partidos que ya la usan la siguen mostrando.`)) return;
    Promise.resolve(app.store.updateVenue(venue.id, { active: next })).then(() => openVenues()).catch((error) => {
      toast(isVenueDenied(error) ? VENUES_DENIED_WRITE : (error?.message || 'No se pudo cambiar'));
    });
  };
}

function openVenueEdit(venue) {
  openSheet(`
    <form id="venue-edit" novalidate>
      <h3>Editar sede</h3>
      <label class="field"><span>Nombre</span><input name="name" maxlength="80" required autocomplete="off" value="${esc(venue.name)}"></label>
      <div class="err" id="venue-err"></div>
      <div class="sheet-actions"><button type="button" class="btn" id="venue-edit-back">Volver</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  $('#venue-edit-back').onclick = () => openVenues();
  $('#venue-edit').onsubmit = (e) => {
    e.preventDefault();
    Promise.resolve(app.store.updateVenue(venue.id, { name: e.target.name.value })).then(() => { toast('Sede actualizada'); openVenues(); }).catch((error) => {
      $('#venue-err').textContent = isVenueDenied(error) ? VENUES_DENIED_WRITE : (error?.message || 'No se pudo guardar');
    });
  };
}

/* Agregar / editar partido */
function openMatchForm(m) {
  const today = todayISO();
  const editingAccess = !m || canEditAccess(m, actor().uid);
  const venues = venueOptions(m);
  const perTeam = perTeamOf(m);
  openSheet(`
    <form id="match-form" novalidate>
      <h3>${m ? 'Editar partido' : 'Agregar partido'}</h3>
      <p class="hint" id="match-size-hint">Fútbol ${perTeam} contra ${perTeam} (${capacityFor(perTeam)} jugadores)</p>
      <label class="field"><span>Sede</span><select name="venue" id="match-venue" required>${venues.choices.map((item) => `<option value="${esc(item.id)}"${item.id === venues.selected ? ' selected' : ''}>${esc(item.name)}${item.active === false ? ' (inactiva)' : ''}</option>`).join('')}</select></label>
      <label class="field"><span>Jugadores por equipo</span><select name="perTeam" id="match-per-team">${perTeamOptions().map((n) => `<option value="${n}"${n === perTeam ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <div class="row">
        <label class="field"><span>Fecha</span><input type="date" name="date" required min="${m ? '' : today}" value="${esc(m ? m.date : today)}"></label>
        <label class="field"><span>Hora</span><input type="time" name="time" required value="${esc(m ? m.time : '21:00')}"></label>
      </div>
      <label class="field"><span>Nota (opcional)</span><input type="text" name="note" maxlength="300" placeholder="Ej: cancha 2, traer pechera" value="${esc(m?.note || '')}"></label>
      ${editingAccess ? accessEditor(m) : ''}
      <div class="field"><div class="err" id="mf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">${m ? 'Guardar' : 'Crear'}</button></div>
    </form>`);
  bindAccessForm();
  const perSelect = $('#match-per-team');
  const paintSize = () => {
    const n = Number(perSelect.value);
    $('#match-size-hint').textContent = `Fútbol ${n} contra ${n} (${capacityFor(n)} jugadores)`;
  };
  perSelect.addEventListener('change', paintSize);
  $('#match-form').onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const data = { date: f.get('date'), time: f.get('time'), note: String(f.get('note') || '').trim() };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !/^\d{2}:\d{2}$/.test(data.time)) { $('#mf-err').textContent = 'Completá fecha y hora.'; return; }
    const picked = venueOptions(m).choices.find((item) => item.id === String(f.get('venue') || ''));
    if (!picked) { $('#mf-err').textContent = 'Elegí una sede.'; return; }
    const team = Number(f.get('perTeam'));
    if (!perTeamOptions().includes(team)) { $('#mf-err').textContent = 'Elegí cuántos jugadores por equipo.'; return; }
    data.venueId = picked.id;
    data.venueName = picked.name;
    data.perTeam = team;
    data.capacity = capacityFor(team);
    const dup = app.matches.find((x) => x.date === data.date && x.time === data.time && x.id !== m?.id);
    if (dup && !confirm('Ya hay un partido ese día a esa hora. ¿Agregarlo igual?')) return;
    if (editingAccess) data.access = readAccessForm();
    closeSheet();
    if (splitNear([{ date: data.date }]).later.length) rememberLater(true);
    if (m) run(app.store.updateMatch(m.id, data, app.who), 'Partido actualizado');
    else run(app.store.addMatch({ ...data, source: 'manual' }, app.who), 'Partido agregado');
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
    if (sel.some((item) => splitNear([{ date: item.date }]).later.length)) rememberLater(true);
    closeSheet();
    run(app.store.addMatches(sel.map((s) => ({ date: s.date, time: s.time, note: '', source: 'texto', sourceText: s.source, perTeam: 7, venueId: defaultVenueId(app.venues, { unreadable: !!app.venuesError }), venueName: venueLabel({ venueId: defaultVenueId(app.venues, { unreadable: !!app.venuesError }) }, app.venues), access: publicAccess(actor()) })), app.who),
      `${sel.length} partido${sel.length > 1 ? 's' : ''} importado${sel.length > 1 ? 's' : ''}`);
  };
}

/* ───────── plantel (Jugadores) ───────── */
function renderRoster() {
  const prevSearch = $('#roster-q');
  const q = prevSearch?.value || '';
  const searchFocused = !!(prevSearch && document.activeElement === prevSearch);
  const selStart = searchFocused ? prevSearch.selectionStart : 0;
  const selEnd = searchFocused ? prevSearch.selectionEnd : 0;
  const people = searchRoster(app.roster, q);
  const rows = people.map((person) => {
    const locked = !canEditRoster(person, actor());
    return `
    <li class="slot" data-roster="${esc(person.id)}">
      <button type="button" class="who" data-roster-open="${esc(person.id)}">
        <div class="name">${esc(person.name)}</div>
        <div class="sub">${person.phone ? esc(displayFromWa(person.phone)) : phoneHidden(person) ? `<span class="private-wa">${esc(PRIVATE_WA_TEXT)}</span>` : 'Sin número'}${locked ? `<span class="edit-lock">${esc(EDIT_LOCK_TEXT)}</span>` : ''}</div>
      </button>
      ${waButton(person)}
      <button type="button" class="more-btn" data-roster-edit="${esc(person.id)}" aria-label="Editar ${esc(person.name)}"${locked ? ' disabled' : ''}>${ICON.edit}</button>
      <button type="button" class="more-btn" data-roster-del="${esc(person.id)}" aria-label="Borrar ${esc(person.name)}">${ICON.trash}</button>
    </li>`;
  }).join('');
  if (!replaceView(`
    <h2 class="section">Jugadores</h2>
    ${rosterSwitch(false)}
    <p class="hint roster-lead">Lista guardada de nombre y WhatsApp. Se comparte entre los dos.</p>
    ${app.rosterError ? `<div class="banner error roster-error" id="roster-error">${esc(app.rosterError)}</div>` : ''}
    <label class="field roster-search"><span>Buscar</span><input id="roster-q" autocomplete="off" placeholder="Nombre o teléfono" value="${esc(q)}"></label>
    ${people.length ? `<ul class="slots" id="roster-list">${rows}</ul>` : `<p class="empty-wait" id="roster-list">${q ? 'Nadie coincide con esa búsqueda.' : 'Todavía no hay jugadores guardados. Cuando anotás a alguien en un partido, se guarda acá. El WhatsApp es opcional.'}</p>`}
    <div class="actionbar"><div class="actionbar-inner">
      <button class="btn primary" id="btn-add-roster">${ICON.plus}Agregar jugador</button>
    </div></div>`)) return;
  const input = $('#roster-q');
  input.addEventListener('input', () => renderRoster());
  if (searchFocused) {
    input.focus({ preventScroll: true });
    try { input.setSelectionRange(selStart, selEnd); } catch { /* el navegador puede rechazar el rango */ }
  }
  $('#btn-add-roster').onclick = () => openRosterForm();
  const list = $('#roster-list');
  if (list) list.onclick = (e) => {
    const edit = e.target.closest('[data-roster-edit]');
    if (edit) {
      const person = app.roster.find((r) => r.id === edit.dataset.rosterEdit);
      if (!person || !canEditRoster(person, actor())) return;
      return openRosterForm(person);
    }
    const del = e.target.closest('[data-roster-del]');
    if (del) return deleteRosterPlayer(app.roster.find((r) => r.id === del.dataset.rosterDel));
    const open = e.target.closest('[data-roster-open]');
    if (open) {
      app.profileMatchId = null;
      app.profilePay = false;
      location.hash = `#/jugador/${encodeURIComponent(open.dataset.rosterOpen)}`;
    }
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
  const lockPhone = phoneHidden(person);
  const locked = person && !canEditRoster(person, actor());
  openSheet(`
    <form id="roster-form" novalidate>
      <h3>${person ? 'Editar jugador' : 'Agregar a Jugadores'}</h3>
      ${locked ? `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>` : ''}
      <p class="hint">Nombre completo. El WhatsApp es opcional. Si el número ya está, no se duplica.</p>
      <label class="field"><span>Nombre</span><input name="name" required autofocus autocomplete="off" maxlength="60" placeholder="Ej: Ernesto Pereira" value="${esc(person?.name || '')}"></label>
      ${lockPhone ? `<p class="hint private-wa">${esc(PRIVATE_WA_TEXT)}</p>` : `<label class="field"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(person ? displayFromWa(person.phone) : '')}">
        <div class="small muted" id="rf-phone">Característica + número. Sin 0 ni 15 también sirve.</div></label>`}
      ${person ? '' : '<label class="checkline" id="wa-share-line"><input type="checkbox" id="wa-share" name="waShare"><span>Mostrar el WhatsApp para todos</span></label>'}
      <div class="field"><div class="err" id="rf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit"${locked ? ' disabled' : ''}>${person ? 'Guardar' : 'Agregar'}</button></div>
    </form>`);
  const form = $('#roster-form');
  if (locked) {
    form.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = true; });
    form.onsubmit = (e) => e.preventDefault();
    return;
  }
  const hint = $('#rf-phone');
  if (form.phone) form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = 'Característica + número. Sin 0 ni 15 también sirve.'; return; }
    const r = normalizePhone(v);
    hint.className = r.ok ? 'ok' : 'err';
    hint.textContent = r.ok ? `✓ ${r.display}` : r.error;
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phoneRaw = form.phone ? form.phone.value.trim() : null;
    if (!name) { $('#rf-err').textContent = 'Poné el nombre.'; return; }
    let phone = '';
    if (phoneRaw) {
      const r = normalizePhone(phoneRaw);
      if (!r.ok) { $('#rf-err').textContent = r.error; return; }
      phone = r.wa;
    }
    const job = person
      ? app.store.updateRoster(person.id, phoneRaw === null ? { name } : { name, phone })
      : app.store.addRoster({ name, phone, phoneShared: $('#wa-share')?.checked === true }, app.who);
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

const noteId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
app.profileMatchId = null;
app.profilePay = false;
app.wantPhoneForm = false;

async function ensureRoster({ name, phone, rosterId, phoneKey: key, phoneShared }) {
  const cleanName = String(name || '').trim();
  if (rosterId && app.roster.some((person) => person.id === rosterId)) return rosterId;
  const wa = canonicalPhone(phone);
  const ident = key || (wa ? phoneIdentity({ phone: wa }) : '');
  if (wa) {
    const found = rosterByPhone(app.roster, wa);
    if (found) return found.id;
  }
  if (ident) {
    const found = rosterByIdentity(app.roster, ident);
    if (found) return found.id;
    if (!wa) return rosterId || '';
  } else if (cleanName) {
    const found = app.roster.find((person) => !phoneIdentity(person) && foldText(person.name) === foldText(cleanName));
    if (found) return found.id;
  }
  if (!cleanName) return '';
  return app.store.addRoster({ name: cleanName, phone: wa, phoneShared: phoneShared === true }, app.who);
}

async function openPlayerProfile(player, matchId) {
  if (!player) return;
  app.profilePay = false;
  app.profileMatchId = matchId || null;
  try {
    let id = player.rosterId && app.roster.some((person) => person.id === player.rosterId) ? player.rosterId : '';
    if (!id) id = await ensureRoster({ name: player.name, phone: player.phone, rosterId: player.rosterId, phoneKey: player.phoneKey });
    if (!id) { toast('No se pudo abrir el perfil'); return; }
    if (player.id && player.rosterId !== id) await app.store.updatePlayer(player.id, { rosterId: id });
    location.hash = `#/jugador/${encodeURIComponent(id)}`;
  } catch (error) {
    if (error?.code === 'roster-duplicate') {
      const person = rosterByPhone(app.roster, player.phone) || rosterByIdentity(app.roster, player.phoneKey);
      if (person) { location.hash = `#/jugador/${encodeURIComponent(person.id)}`; return; }
    }
    if (isRosterDenied(error)) { showError(`${ROSTER_DENIED_WRITE} El perfil no se pudo abrir.`); return; }
    toast('No se pudo abrir el perfil');
  }
}

function saveProfile(id, patch) {
  Promise.resolve(app.store.patchRoster(id, patch)).catch((error) => {
    if (isRosterDenied(error)) showError(`${ROSTER_DENIED_WRITE} El perfil no se guardó.`);
    else toast('No se pudo guardar: ' + (error?.code || error?.message || error));
  });
}

function ledgerSection(person) {
  const organizer = app.payFilter || null;
  const who = rosterIdentity(person);
  const money = paymentLedger({ ...who, players: app.players, matches: app.matches, organizer });
  const signups = signupLedger({ ...who, players: app.players, organizer });
  const parts = { cash: 0, transfer: 0, pending: 0 };
  const shareOk = (name) => {
    const label = String(name || '').trim() || UNSPECIFIED;
    if (!organizer) return true;
    if (organizer === UNSPECIFIED) return label === UNSPECIFIED;
    return sameOrganizer(label, organizer);
  };
  for (const player of app.players) {
    if (!playerMatchesPerson(player, person)) continue;
    for (const share of paymentShares(player)) {
      if (!shareOk(share.name)) continue;
      if (share.kind === 'pending') parts.pending += share.amount;
      else if (share.kind === 'cash') parts.cash += share.amount;
      else if (share.kind === 'transfer') parts.transfer += share.amount;
    }
  }
  const partBits = [];
  if (parts.cash > 0) partBits.push(`Efectivo ${formatARS(parts.cash)}`);
  if (parts.transfer > 0) partBits.push(`Transferencia ${formatARS(parts.transfer)}`);
  const partsLine = partBits.length ? `<p class="hint" id="ledger-parts">${esc(partBits.join(' · '))}</p>` : '';
  const pendingLine = parts.pending > 0
    ? `<p class="pay-pending" id="ledger-pending">Transfiere después ${esc(formatARS(parts.pending))}</p>`
    : '';
  const months = money.months.length
    ? `<ul class="ledger-list" id="ledger-months">${money.months.map((row) => `<li>${esc(row.text)}</li>`).join('')}</ul>`
    : '<p class="hint" id="ledger-months">Sin pagos en este filtro.</p>';
  const by = money.byOrganizer.length
    ? `<ul class="ledger-list" id="ledger-by">${money.byOrganizer.map((row) => `<li>${esc(row.name)}: ${esc(formatARS(row.amount))}</li>`).join('')}</ul>`
    : '<p class="hint" id="ledger-by">Nadie cobró en este filtro.</p>';
  const signed = signups.byOrganizer.length
    ? `<ul class="ledger-list" id="ledger-signups">${signups.byOrganizer.map((row) => `<li>Anotó ${esc(row.name)}: ${timesLabel(row.count)}</li>`).join('')}</ul>`
    : '<p class="hint" id="ledger-signups">Sin anotaciones en este filtro.</p>';
  return `
    <section class="profile-block" id="ledger">
      <h2>Pagos</h2>
      ${payFilterChips(person)}
      <p class="stat-summary" id="ledger-total">${esc(money.totalText)}</p>
      ${partsLine}
      ${pendingLine}
      ${months}
      <h2>Por organizador</h2>
      ${by}
      <h2>Anotado por</h2>
      ${signed}
    </section>`;
}

function renderUsers() {
  if (app.role !== 'admin') {
    replaceView(`<div class="empty"><div class="big">🔒</div><p><b>Solo el administrador puede crear o desactivar organizadores.</b></p><p class="small">Los partidos, los jugadores, los pagos y el plantel los pueden editar los dos.</p></div>`);
    return;
  }
  const rows = (app.users || []).map((user) => `
    <li class="slot" data-user="${esc(user.uid)}">
      <div class="who">
        <div class="name">${esc(user.name)}</div>
        <div class="sub">${esc(user.email)} · ${user.role === 'admin' ? 'Administrador' : 'Organizador'}${user.active ? '' : ' · desactivado'}</div>
      </div>
      ${user.role === 'organizer' ? `<button type="button" class="btn" data-user-active="${esc(user.uid)}">${user.active ? 'Desactivar' : 'Activar'}</button>` : ''}
      ${user.role === 'organizer' ? `<button type="button" class="btn danger" data-user-del="${esc(user.uid)}">Borrar</button>` : ''}
    </li>`).join('');
  if (!replaceView(`
    <h2 class="section">Organizadores</h2>
    <p class="hint roster-lead">Esta es la única diferencia con los organizadores: crear, desactivar o borrar sus cuentas. El rol no se cambia. En los partidos pueden lo mismo.</p>
    <ul class="slots" id="user-list">${rows || '<li class="empty-wait">No hay usuarios.</li>'}</ul>
    <form id="user-form" class="user-form" novalidate>
      <h2 class="section">Nuevo organizador</h2>
      <label class="field"><span>Nombre</span><input name="name" maxlength="40" autocomplete="off" placeholder="Ej: Lucía"></label>
      <label class="field"><span>Mail</span><input name="email" type="email" autocomplete="off" placeholder="lucia@correo.com"></label>
      <label class="field"><span>Contraseña</span><input name="password" type="password" autocomplete="new-password" placeholder="Al menos 6 caracteres"></label>
      <div class="field"><div class="err" id="user-err"></div></div>
      <button class="btn primary" type="submit">Crear organizador</button>
    </form>`)) return;
  $('#user-form').onsubmit = (e) => {
    e.preventDefault();
    const form = e.target;
    Promise.resolve(app.session.createOrganizer({ name: form.name.value, email: form.email.value, password: form.password.value }))
      .then(() => { form.reset(); toast('Organizador creado'); renderUsers(); })
      .catch((error) => { $('#user-err').textContent = error?.message || 'No se pudo crear'; });
  };
  $('#user-list').onclick = (e) => {
    const toggle = e.target.closest('[data-user-active]');
    if (toggle) {
      const user = app.users.find((item) => item.uid === toggle.dataset.userActive);
      if (!user) return;
      Promise.resolve(app.session.setOrganizerActive(user.uid, !user.active)).then(() => renderUsers()).catch((error) => toast(error?.message || 'No se pudo cambiar'));
      return;
    }
    const del = e.target.closest('[data-user-del]');
    if (!del) return;
    const user = app.users.find((item) => item.uid === del.dataset.userDel);
    if (!user || !confirm(`¿Borrar a ${user.name}? La cuenta de acceso queda en Firebase hasta que la borres en la consola.`)) return;
    Promise.resolve(app.session.deleteOrganizer(user.uid)).then(() => renderUsers()).catch((error) => toast(error?.message || 'No se pudo borrar'));
  };
}

function renderPagos() {
  const organizer = app.mine ? app.who : (app.payFilter || null);
  const rows = paymentsSummary({ players: app.players, roster: app.roster, organizer });
  const totals = organizerTotals(app.players);
  const pending = pendingTransfers({ players: app.players, roster: app.roster, organizer });
  const body = rows.length ? `<ul class="slots" id="pay-summary">${rows.map((row) => {
    const personId = row.rosterId || '';
    const paid = row.paid.length
      ? row.paid.map((item) => `<div class="sub">${esc(item.name)}: ${esc(formatARS(item.amount))}</div>`).join('')
      : '<div class="sub">Sin pagos</div>';
    const signed = row.signups.length
      ? row.signups.map((item) => `<div class="sub">Anotó ${esc(item.name)}: ${timesLabel(item.count)}</div>`).join('')
      : '<div class="sub">Sin anotaciones</div>';
    const later = row.pending > 0 ? `<div class="pay-pending">Transfiere después ${esc(formatARS(row.pending))}</div>` : '';
    const open = personId ? ` data-pay-open="${esc(personId)}"` : '';
    return `<li class="slot pay-row"><button type="button" class="who"${open}><div class="name">${esc(row.name)}</div>${paid}${signed}${later}</button></li>`;
  }).join('')}</ul>` : '<p class="empty-wait" id="pay-summary">Nadie en este filtro.</p>';
  const pendingBody = pending.rows.length
    ? `<ul class="slots" id="pending-list">${pending.rows.map((row) => `<li class="slot"><div class="who"><div class="name">${esc(row.name)}</div><div class="pay-pending">Transfiere después ${esc(formatARS(row.amount))}</div><div class="sub">${row.by.map((item) => `${esc(item.name)}: ${esc(formatARS(item.amount))}`).join(' · ')}</div></div></li>`).join('')}</ul>`
    : '<p class="empty-wait" id="pending-list">Nadie tiene una transferencia pendiente.</p>';
  const orgLine = totals.map((item) => {
    const later = item.pending > 0 ? ` · por transferir ${formatARS(item.pending)}` : '';
    return `${esc(item.name)}: ${esc(formatARS(item.collected))} · anotó ${item.added}${later}`;
  }).join(' · ');
  if (!replaceView(`
    <h2 class="section">Jugadores</h2>
    ${rosterSwitch(true)}
    <h2 class="section">Pagos</h2>
    <p class="hint roster-lead">Cuánto le pagó cada jugador a cada organizador, y quién lo anotó. Transfiere después no entra en lo cobrado hasta marcarlo.</p>
    <p class="mine-line" id="mine-stats">${esc(mineSummary(app.players, app.who).text)}</p>
    <p class="hint" id="org-totals">${orgLine}</p>
    <p class="hint" id="pending-total">Transfiere después: ${esc(formatARS(pending.total))}</p>
    ${app.mine ? '<p class="hint" id="mine-filter">Viendo solo lo que anotaste y cobraste.</p>' : payFilterChips(null)}
    ${body}
    <h2 class="section">Transfiere después</h2>
    ${pendingBody}`)) return;
  bindPayFilter();
  const list = $('#pay-summary');
  if (list) list.onclick = (e) => {
    const open = e.target.closest('[data-pay-open]');
    if (!open) return;
    app.profileMatchId = null;
    app.profilePay = true;
    location.hash = `#/jugador/${encodeURIComponent(open.dataset.payOpen)}`;
  };
}

function renderProfile(id) {
  const person = app.roster.find((r) => r.id === id);
  if (!person) {
    app.signupDraft = null;
    replaceView(`<div class="empty"><div class="big">👤</div><p><b>No encontramos este jugador.</b></p><p class="small">${app.rosterError ? esc(app.rosterError) : 'Puede que lo hayan borrado de Jugadores.'}</p><p><a class="btn" href="#/jugadores">Volver a Jugadores</a></p></div>`);
    return;
  }
  const who = rosterIdentity(person);
  const stats = playerStats({ ...who, players: app.players, matches: app.matches });
  const record = playerRecord({ ...who, players: app.players, matches: app.matches });
  const positions = new Set(person.positions || []);
  const level = Number.isInteger(person.level) ? person.level : null;
  const notes = sortedNotes(person.notes);
  const own = canEditRoster(person, actor());
  const lockNote = own ? '' : `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>`;
  const painted = replaceView(`
    <article id="profile">
      <h2 class="section">${esc(person.name)}</h2>
      <p class="profile-phone" id="profile-phone">${person.phone ? esc(displayFromWa(person.phone)) : phoneHidden(person) ? esc(PRIVATE_WA_TEXT) : 'Sin número'}</p>
      ${lockNote}
      ${person.phone
        ? `<a class="btn profile-wa" id="profile-wa" href="${esc(waHref(person.phone))}" target="_blank" rel="noopener">${ICON.wa}WhatsApp</a>`
        : phoneHidden(person)
          ? `<button type="button" class="btn profile-wa" id="profile-wa" disabled>${ICON.wa}${esc(PRIVATE_WA_TEXT)}</button>`
          : `<button type="button" class="btn profile-add-phone" id="profile-add-phone"${own ? '' : ' disabled'}>Cargar WhatsApp</button>`}
      ${person.phone && person.hasPhone && person.phoneOwnerUid === actor().uid
        ? `<label class="checkline" id="phone-share-line"><input type="checkbox" id="phone-share"${person.phoneShared ? ' checked' : ''}><span>Mostrar mi WhatsApp a los demás organizadores</span></label>`
        : ''}
      ${partidosSection(person)}
      <section class="profile-block">
        <h2>Nivel de juego</h2>
        <div class="stepper">
          <button type="button" class="btn" id="level-down" aria-label="Bajar nivel" ${!own || level == null || level <= 1 ? 'disabled' : ''}>−</button>
          <span class="val" id="level-val">${level == null ? '—' : level}</span>
          <button type="button" class="btn" id="level-up" aria-label="Subir nivel" ${!own || (level != null && level >= 10) ? 'disabled' : ''}>+</button>
        </div>
      </section>
      <section class="profile-block">
        <h2>Posiciones</h2>
        <div class="chips" id="positions">${POSITIONS.map((pos) => `<button type="button" class="btn chip ${positions.has(pos) ? 'on' : ''}" data-pos="${esc(pos)}"${own ? '' : ' disabled'}>${esc(pos)}</button>`).join('')}</div>
      </section>
      <section class="profile-block" id="stats">
        <h2>Partidos jugados</h2>
        <p class="stat-summary" id="stat-times">${stats.played ? `Jugó ${stats.played} ${stats.played === 1 ? 'vez' : 'veces'}` : 'Todavía no jugó'}</p>
        ${stats.summary ? `<p class="stat-summary" id="stat-summary">${esc(stats.summary)}</p>` : ''}
        ${stats.dates.length ? `<ul class="stat-dates">${stats.dates.map((d) => `<li>${esc(d.label)}</li>`).join('')}</ul>` : '<p class="hint">Cuenta solo partidos que ya pasaron, en la lista principal.</p>'}
        <p class="hint" id="stat-pay">${esc(record.paidText)}</p>
        ${record.confirmText ? `<p class="hint" id="stat-confirm">${esc(record.confirmText)}</p>` : ''}
      </section>
      ${ledgerSection(person)}
      <section class="profile-block">
        <h2>Notas de partido</h2>
        <div id="notes">${notes.length ? notes.map((note) => `
          <article class="pnote" data-note="${esc(note.id)}">
            <div class="when">${esc(noteWhen(note, app.matches) || 'Partido')}</div>
            <p>${esc(note.text)}</p>
            <div class="row">
              <button type="button" class="btn" data-note-edit="${esc(note.id)}"${own ? '' : ' disabled'}>Editar</button>
              <button type="button" class="btn danger" data-note-del="${esc(note.id)}"${own ? '' : ' disabled'}>Borrar</button>
            </div>
          </article>`).join('') : '<p class="empty-wait">Sin notas.</p>'}</div>
        <button type="button" class="btn block" id="btn-add-note"${own ? '' : ' disabled'}>Agregar nota</button>
      </section>
    </article>`);
  if (app.wantPhoneForm) {
    app.wantPhoneForm = false;
    if (!person.phone && !phoneHidden(person)) openPhoneForm(person);
  }
  if (!painted) return;
  const addPhone = $('#profile-add-phone');
  if (addPhone && own) addPhone.onclick = () => openPhoneForm(person);
  const share = $('#phone-share');
  if (share) share.onchange = () => run(app.store.setPhoneShared({ rosterId: person.id }, share.checked));
  $('#level-down').onclick = () => { if (own && level > 1) saveProfile(person.id, { level: level - 1 }); };
  $('#level-up').onclick = () => { if (own) saveProfile(person.id, { level: level == null ? 1 : Math.min(10, level + 1) }); };
  $('#positions').onclick = (e) => {
    if (!own) return;
    const btn = e.target.closest('[data-pos]');
    if (!btn) return;
    const pos = btn.dataset.pos;
    const next = new Set(person.positions || []);
    if (next.has(pos)) next.delete(pos); else next.add(pos);
    saveProfile(person.id, { positions: POSITIONS.filter((item) => next.has(item)) });
  };
  bindPayFilter($('#profile'));
  bindPartidos(person);
  if (own) $('#btn-add-note').onclick = () => openNoteForm(person);
  $('#notes').onclick = (e) => {
    if (!own) return;
    const edit = e.target.closest('[data-note-edit]');
    if (edit) return openNoteForm(person, (person.notes || []).find((n) => n.id === edit.dataset.noteEdit));
    const del = e.target.closest('[data-note-del]');
    if (!del) return;
    const note = (person.notes || []).find((n) => n.id === del.dataset.noteDel);
    if (!note || !confirm('¿Borrar esta nota?')) return;
    saveProfile(person.id, { notes: (person.notes || []).filter((n) => n.id !== note.id) });
  };
}

function signupDraft(person) {
  if (!app.signupDraft || app.signupDraft.rosterId !== person.id) {
    app.signupDraft = { rosterId: person.id, ids: new Set(), tentative: false };
  }
  return app.signupDraft;
}

function signupRows(person) {
  const draft = signupDraft(person);
  const upcoming = upcomingMatches(app.matches);
  const rows = upcoming.map((match) => {
    const state = matchSignupState({ ...rosterIdentity(person), match, players: app.players });
    return { id: match.id, match, state, existing: state.existing };
  });
  const keep = new Set(keptSignupIds(draft.ids, rows));
  for (const id of [...draft.ids]) if (!keep.has(id)) draft.ids.delete(id);
  return rows;
}

function partidosSection(person) {
  const draft = signupDraft(person);
  const rows = signupRows(person).map(({ match, state }) => {
    const when = `${capitalize(labelDate(match.date))} · ${match.time || '--:--'} hs`;
    const picked = !state.existing && draft.ids.has(match.id);
    const locked = state.existing ? 'checked disabled' : (picked ? 'checked' : '');
    const remove = state.existing && state.playerId
      ? `<button type="button" class="btn" data-signup-remove="${esc(state.playerId)}">Quitar</button>`
      : '';
    return `<li class="slot signup-row" data-match="${esc(match.id)}">
      <label class="signup-check"><input type="checkbox" data-signup="${esc(match.id)}" ${locked} aria-label="${esc(when)}"></label>
      <button type="button" class="who" data-open-match="${esc(match.id)}">
        <div class="name">${esc(capitalize(labelDate(match.date)))}</div>
        <div class="sub"><span>${esc(match.time || '--:--')} hs</span><span class="tag">${esc(state.label)}</span></div>
      </button>
      ${remove}
    </li>`;
  });
  const empty = rows.length ? '' : '<p class="empty-wait" id="signup-empty">No hay partidos próximos.</p>';
  return `<section class="profile-block" id="partidos">
    <h2>Partidos</h2>
    <p class="hint">Elegí los próximos y anotalo de una. Si el partido está completo, va a la lista de espera.</p>
    <ul class="slots" id="signup-list">${rows.join('')}</ul>
    ${empty}
    <label class="checkline"><input type="checkbox" id="signup-tentative" ${draft.tentative ? 'checked' : ''}> Lugar reservado (a confirmar)</label>
    <button type="button" class="btn primary block" id="btn-signup"${draft.ids.size ? '' : ' disabled'}>${esc(signupButtonLabel(draft.ids.size))}</button>
  </section>`;
}

function signupButtonLabel(count) {
  if (count === 1) return 'Anotar en 1 partido';
  return `Anotar en ${count} partidos`;
}

function bindPartidos(person) {
  const list = $('#signup-list');
  const button = $('#btn-signup');
  const draft = signupDraft(person);
  if (!list || !button) return;
  const paint = () => {
    const n = draft.ids.size;
    button.disabled = n === 0;
    button.textContent = signupButtonLabel(n);
  };
  list.addEventListener('change', (event) => {
    const input = event.target.closest('input[data-signup]');
    if (!input || input.disabled) return;
    if (input.checked) draft.ids.add(input.dataset.signup);
    else draft.ids.delete(input.dataset.signup);
    paint();
  });
  const tent = $('#signup-tentative');
  if (tent) tent.addEventListener('change', () => { draft.tentative = tent.checked; });
  list.addEventListener('click', (event) => {
    const open = event.target.closest('[data-open-match]');
    if (open) {
      location.hash = `#/partido/${encodeURIComponent(open.dataset.openMatch)}`;
      return;
    }
    const remove = event.target.closest('[data-signup-remove]');
    if (!remove) return;
    const player = app.players.find((item) => item.id === remove.dataset.signupRemove);
    const match = player ? matchById(player.matchId) : null;
    if (!player || !match) return;
    if (!canAdd(match, actor().uid)) { toast('Este partido es de solo lectura.'); return; }
    if (!confirm(`¿Quitar a ${person.name} de ${labelDate(match.date)} ${match.time || ''} hs?`)) return;
    removeMatchPlayer(match, player, { asked: true });
  });
  button.onclick = () => {
    const chosen = [];
    for (const id of [...draft.ids]) {
      const match = matchById(id);
      const stillUp = match && upcomingMatches(app.matches).some((item) => item.id === id);
      const state = match ? matchSignupState({ ...rosterIdentity(person), match, players: app.players }) : null;
      if (!match || !stillUp || !state || state.existing) {
        draft.ids.delete(id);
        continue;
      }
      chosen.push({ match, state });
    }
    paint();
    if (!chosen.length) return;
    const waits = chosen.filter((row) => row.state.willWait);
    if (waits.length) {
      const which = waits.map((row) => `${labelDate(row.match.date)} ${row.match.time || ''} hs`).join(', ');
      if (!confirm(`En ${which} no hay lugar: va a quedar en la lista de espera. ¿Seguís?`)) return;
    }
    button.disabled = true;
    const tentative = draft.tentative;
    draft.tentative = false;
    const msg = waits.length === chosen.length
      ? (chosen.length === 1 ? `${person.name} quedó en la lista de espera` : `${person.name} quedó en la espera de ${chosen.length} partidos`)
      : waits.length
        ? `${person.name} anotado · ${waits.length} en espera`
        : (chosen.length === 1 ? `${person.name} anotado` : `${person.name} anotado en ${chosen.length} partidos`);
    run((async () => {
      for (const row of chosen) {
        const again = matchSignupState({ ...rosterIdentity(person), match: row.match, players: app.players });
        if (again.existing) { toast(ALREADY_IN_MATCH); continue; }
        const blocked = addBlock(row.match);
        if (blocked) { toast(blocked); continue; }
        try {
          await app.store.addPlayer(row.match, { name: person.name, phone: person.phone || '', rosterId: person.id, phoneKey: person.phoneKey || '', hasPhone: person.hasPhone === true, phoneShared: person.phoneShared === true }, app.who, {
            waiting: again.willWait,
            tentative: tentative && !again.willWait,
          });
        } catch (error) {
          if (error?.code === 'already-in-match') { toast(ALREADY_IN_MATCH); continue; }
          throw error;
        }
      }
    })(), msg);
  };
  paint();
}

function openNoteForm(person, note) {
  const matches = [...app.matches].sort((a, b) => (b.startsAt ?? 0) - (a.startsAt ?? 0));
  const selected = note?.matchId || app.profileMatchId || matches[0]?.id || '';
  openSheet(`
    <form id="note-form" novalidate>
      <h3>${note ? 'Editar nota' : 'Nota de partido'}</h3>
      <label class="field"><span>Partido</span>
        <select name="match" required>${matches.map((m) => `<option value="${esc(m.id)}" ${m.id === selected ? 'selected' : ''}>${esc(capitalize(labelDate(m.date)))} · ${esc(m.time || '--:--')} hs</option>`).join('')}</select>
      </label>
      <label class="field"><span>Qué pasó</span><textarea name="text" maxlength="${MAX_NOTE_TEXT}" required placeholder="Ej: hizo un gol, llegó tarde">${esc(note?.text || '')}</textarea></label>
      <div class="field"><div class="err" id="note-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#note-form');
  if (!matches.length) { $('#note-err').textContent = 'No hay partidos para asociar la nota.'; form.querySelector('[type=submit]').disabled = true; return; }
  form.onsubmit = (e) => {
    e.preventDefault();
    const match = matchById(form.match.value);
    const text = form.text.value.trim();
    if (!match) { $('#note-err').textContent = 'Elegí un partido.'; return; }
    if (!text) { $('#note-err').textContent = 'Escribí la nota.'; return; }
    const notes = [...(person.notes || [])];
    if (note) {
      const i = notes.findIndex((n) => n.id === note.id);
      if (i >= 0) notes[i] = { ...notes[i], matchId: match.id, matchDate: match.date, matchTime: match.time || '', text, updatedAt: Date.now() };
    } else {
      if (notes.length >= MAX_NOTES) { $('#note-err').textContent = `Máximo ${MAX_NOTES} notas.`; return; }
      notes.push({ id: noteId(), matchId: match.id, matchDate: match.date, matchTime: match.time || '', text, createdAt: Date.now(), updatedAt: Date.now() });
    }
    closeSheet();
    saveProfile(person.id, { notes });
  };
}

async function linkedRosterId({ name, phone, rosterId, phoneKey: key, phoneShared }) {
  try { return await ensureRoster({ name, phone, rosterId, phoneKey: key || (phone ? phoneIdentity({ phone }) : ''), phoneShared }); }
  catch (error) {
    if (error?.code === 'roster-duplicate') return rosterByPhone(app.roster, phone)?.id || rosterByIdentity(app.roster, phoneIdentity({ phone }))?.id || rosterId || '';
    if (isRosterDenied(error)) showError(`${ROSTER_DENIED_WRITE} El partido igual quedó anotado.`);
    else console.error(error);
    return rosterId || '';
  }
}

function matesOf(matchId) {
  return app.players.filter((player) => player.matchId === matchId);
}

function friendNamesOf(matchId, hostId) {
  return matesOf(matchId).filter((player) => player.invitedBy === hostId).map((player) => player.name);
}

function signupError(matchId, people) {
  return firstDuplicate(matesOf(matchId), people) ? ALREADY_IN_MATCH : '';
}

function focusField(el) {
  if (!el || el.disabled) return false;
  el.focus();
  return true;
}

/** El grupo entra junto: quien invita primero, después los amigos, en ese orden. */
function addSignedPlayer(m, host, asWait, tentative, friendRows = []) {
  const blocked = addBlock(m);
  if (blocked) { toast(blocked); return false; }
  const taken = host?.id ? friendNamesOf(m.id, host.id) : [];
  const friends = resolveFriendNames(friendRows, taken).map((friend) => ({
    name: friend.name,
    guestAuto: friend.guestAuto,
    invitedBy: host?.id || (friend.guestAuto ? 'nuevo' : ''),
    invitedByName: host?.name || '',
  }));
  const people = host?.id
    ? friends
    : [{ name: host.name, phone: host.phone || '', phoneKey: host.phoneKey || '', rosterId: host.rosterId || '', hasPhone: host.hasPhone === true, phoneShared: host.phoneShared === true }, ...friends];
  if (!people.length) return false;
  const dup = signupError(m.id, people);
  if (dup) return dup;
  const max = limitFor(m, actor().uid);
  if (max != null && addedCount(matesOf(m.id), actor()) + people.length > max) {
    toast(limitMessage(max));
    return false;
  }
  const onWait = asWait === true || host?.waiting === true;
  const place = placeGroup({ mainCount: playersOf(m.id).length, capacity: capOf(m), count: people.length, forceWait: onWait });
  if (tentative && place.main < 1) {
    toast('No hay lugar libre para reservar.');
    return false;
  }
  const warning = friends.length && !onWait ? waitWarning(place.spots, place.wait) : '';
  if (warning && !confirm(warning)) return false;
  const known = host?.rosterId ? app.roster.find((person) => person.id === host.rosterId) : null;
  const share = host?.phoneShared === true || known?.phoneShared === true;
  const lead = host?.name || friends[0]?.name || '';
  const msg = host?.id
    ? (place.wait && place.main ? `Amigos de ${lead} anotados · ${place.wait} en espera` : place.main ? `Amigos de ${lead} anotados` : `Amigos de ${lead} en la lista de espera`)
    : (place.wait && place.main ? `${lead} anotado · ${place.wait} en espera` : place.main ? `${lead} anotado` : `${lead} quedó en la lista de espera`);
  closeSheet();
  run((async () => {
    let hostId = host?.id || '';
    let hostName = host?.name || '';
    let offset = 0;
    if (!host?.id) {
      const id = await linkedRosterId({ name: host.name, phone: host.phone, rosterId: host.rosterId, phoneKey: host.phoneKey, phoneShared: share && !known });
      let saved = id ? app.roster.find((person) => person.id === id) : null;
      if (share && saved && saved.phoneShared !== true && saved.phoneOwnerUid === actor().uid) {
        try { await app.store.setPhoneShared({ rosterId: id }, true); } catch { /* el dueño lo cambia desde el perfil */ }
        saved = app.roster.find((person) => person.id === id) || saved;
      }
      const visible = share || saved?.phoneShared === true;
      const waiting = offset >= place.main;
      hostId = await app.store.addPlayer(m, {
        name: host.name,
        phone: host.phone || '',
        rosterId: id,
        phoneKey: host.phoneKey || saved?.phoneKey || '',
        hasPhone: host.hasPhone === true || saved?.hasPhone === true,
        phoneShared: visible,
      }, app.who, { waiting, tentative: tentative === true && !waiting });
      hostName = host.name;
      offset = 1;
    }
    for (const friend of friends) {
      const waiting = offset >= place.main;
      await app.store.addPlayer(m, {
        name: friend.name,
        phone: '',
        invitedBy: hostId,
        invitedByName: hostName,
        guestAuto: friend.guestAuto === true,
      }, app.who, { waiting });
      offset += 1;
    }
  })(), msg);
  return true;
}

function openPhoneForm(person) {
  if (!canEditRoster(person, actor())) { toast(EDIT_LOCK_TEXT); return; }
  if (phoneHidden(person)) { toast(PRIVATE_WA_TEXT); return; }
  openSheet(`
    <form id="phone-form" novalidate>
      <h3>WhatsApp de ${esc(person.name)}</h3>
      <p class="hint">Es opcional. Con el número se puede escribir y mandar el link de confirmación.</p>
      <label class="field"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" autofocus autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(person.phone ? displayFromWa(person.phone) : '')}">
        <div class="small muted" id="phone-hint">Característica + número. Sin 0 ni 15 también sirve.</div></label>
      <div class="field"><div class="err" id="phone-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#phone-form');
  const hint = $('#phone-hint');
  form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = 'Característica + número. Sin 0 ni 15 también sirve.'; return; }
    const parsed = normalizePhone(v);
    hint.className = parsed.ok ? 'ok' : 'err';
    hint.textContent = parsed.ok ? `✓ ${parsed.display}` : parsed.error;
  });
  form.onsubmit = (e) => {
    e.preventDefault();
    const raw = form.phone.value.trim();
    if (!raw) { $('#phone-err').textContent = 'Poné el WhatsApp, o cancelá.'; return; }
    const parsed = normalizePhone(raw);
    if (!parsed.ok) { $('#phone-err').textContent = parsed.error; return; }
    const dup = app.roster.find((item) => item.id !== person.id && phoneIdentity(item) === phoneIdentity({ phone: parsed.wa }));
    if (dup) { $('#phone-err').textContent = `${dup.name} ya tiene ese WhatsApp`; return; }
    const linked = app.players.filter((player) => playerMatchesPerson(player, person));
    closeSheet();
    run((async () => {
      await app.store.updateRoster(person.id, { name: person.name, phone: parsed.wa });
      for (const player of linked) {
        if (!canEditPlayer(player, actor())) continue;
        if (phoneIdentity(player) === phoneIdentity({ phone: parsed.wa }) && player.rosterId === person.id) continue;
        await app.store.updatePlayer(player.id, { phone: parsed.wa, rosterId: person.id });
      }
    })(), 'WhatsApp guardado');
  };
}

/* Agregar / editar jugador */
function sameGuestLabel(player, name) {
  const wasAuto = player?.guestAuto === true || (player?.guestAuto !== false && !!player?.invitedBy && isAutoGuestName(player?.name));
  return wasAuto && isAutoGuestName(name) && normName(player.name) === normName(name);
}

function rosterAlreadySaved(name, phone) {
  const wa = canonicalPhone(phone);
  if (wa) return rosterByPhone(app.roster, wa) || rosterByIdentity(app.roster, phoneIdentity({ phone: wa }));
  const clean = foldText(name);
  if (!clean) return null;
  return app.roster.find((person) => !phoneIdentity(person) && foldText(person.name) === clean) || null;
}

function openPlayerForm(m, p, opts = {}) {
  if (!p) {
    const blocked = addBlock(m);
    if (blocked) { toast(blocked); return; }
  }
  const asWait = !p && opts.waiting === true;
  const editingFriend = !!p?.invitedBy;
  const offerRoster = editingFriend && !p.rosterId;
  const lockPhone = phoneHidden(p);
  const locked = p && !canEditPlayer(p, actor());
  const emptyPhoneHint = editingFriend
    ? 'Opcional. Con el número se puede escribir. Si no lo marcás, el WhatsApp queda privado.'
    : 'Opcional. Con el número se puede escribir y mandar el link. Igual se guarda en Jugadores.';
  const hostName = editingFriend ? friendHostName(p) : '';
  openSheet(`
    <form id="player-form" novalidate>
      <h3>${editingFriend ? 'Editar amigo' : p ? 'Editar jugador' : asWait ? 'Anotar en lista de espera' : 'Agregar jugador'}</h3>
      ${locked ? `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>` : ''}
      <p class="hint">${esc(fmtWhen(m))}${p ? '' : asWait ? ' · Queda al final de la lista de espera' : ` · Lo anota ${esc(app.who)}`}</p>
      ${editingFriend ? `<p class="hint" id="friend-stays">Sigue siendo amigo de ${esc(hostName || 'quien lo invitó')}.</p>` : ''}
      ${p ? '' : `<label class="field"><span>Buscar guardados</span><div class="find-row"><input id="roster-find" name="find" autocomplete="off" placeholder="ERN, Pereira o parte del teléfono"><button type="button" class="btn find-add" id="roster-add-new" hidden aria-label="Agregar como nuevo">+</button></div></label>
      <ul class="roster-hits" id="roster-hits" hidden></ul>`}
      <label class="field"><span>Nombre</span><input id="player-name" name="name" ${p ? 'autofocus' : ''} autocomplete="off" maxlength="60" placeholder="Ej: Juan Pérez" value="${esc(p?.name || '')}"></label>
      ${lockPhone ? `<p class="hint private-wa">${esc(PRIVATE_WA_TEXT)}</p>` : `<label class="field"><span>WhatsApp</span><input name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="Ej: 11 1234-5678" value="${esc(p ? displayFromWa(p.phone) : '')}">
        <div class="small muted" id="pf-phone">${esc(emptyPhoneHint)}</div></label>`}
      ${(!p || editingFriend) && !lockPhone ? `<label class="checkline" id="wa-share-line"><input type="checkbox" id="wa-share" name="waShare"${p?.phoneShared === true ? ' checked' : ''}><span>Mostrar el WhatsApp para todos</span></label>` : ''}
      ${offerRoster ? '<label class="checkline" id="save-roster-line"><input type="checkbox" id="save-roster" name="saveRoster"><span>Guardar en Jugadores</span></label>' : ''}
      ${!p && !asWait ? '<label class="checkline"><input type="checkbox" id="player-tentative" name="tentative"> Lugar reservado (a confirmar)</label>' : ''}
      ${p ? '' : `<div class="friend-box" id="friend-box">
        <div class="friend-head"><span>Amigos</span><button type="button" class="btn" id="btn-add-friend">Agregar amigo</button></div>
        <div id="friend-rows"></div>
        <p class="hint" id="friend-hint">Si dejás el nombre vacío, queda como Amigo 1, Amigo 2…</p>
      </div>`}
      <div class="field"><div class="err" id="pf-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit"${locked ? ' disabled' : ''}>${p ? 'Guardar' : 'Agregar'}</button></div>
    </form>`);
  const form = $('#player-form');
  if (locked) {
    form.querySelectorAll('input, textarea, select').forEach((el) => { el.disabled = true; });
    form.onsubmit = (e) => e.preventDefault();
    return;
  }
  const hint = $('#pf-phone');
  if (form.phone) form.phone.addEventListener('input', () => {
    const v = form.phone.value.trim();
    if (!v) { hint.className = 'small muted'; hint.textContent = emptyPhoneHint; return; }
    const r = normalizePhone(v);
    hint.className = r.ok ? 'ok' : 'err';
    hint.textContent = r.ok ? `✓ ${r.display}` : r.error;
  });
  const find = $('#roster-find');
  if (find) {
    const paint = () => {
      const hits = $('#roster-hits');
      const addNew = $('#roster-add-new');
      const q = find.value.trim();
      const found = q ? searchRoster(app.roster, q).slice(0, 8) : [];
      if (addNew) addNew.hidden = !q || found.length > 0;
      hits.hidden = !found.length;
      hits.innerHTML = found.map((person) => {
        const taken = signupError(m.id, [{ name: person.name, phone: person.phone || '', rosterId: person.id, phoneKey: person.phoneKey, hasPhone: person.hasPhone === true }]);
        const detail = person.phone ? esc(displayFromWa(person.phone)) : phoneHidden(person) ? esc(PRIVATE_WA_TEXT) : 'Sin número';
        return `<li><button type="button" class="roster-hit${taken ? ' taken' : ''}" data-pick="${esc(person.id)}"${taken ? ' disabled' : ''}><b>${esc(person.name)}</b><small>${detail}</small>${taken ? '<small class="taken">Ya anotado</small>' : ''}</button></li>`;
      }).join('');
    };
    find.addEventListener('input', paint);
    $('#roster-add-new').onclick = () => {
      const text = find.value.trim();
      if (!text) return;
      form.name.value = text;
      if (!focusField(form.name)) {
        const next = [...form.querySelectorAll('input, textarea, select')].find((el) => el !== find && !el.disabled && !String(el.value || '').trim() && el.type !== 'checkbox');
        focusField(next);
      }
    };
    $('#roster-hits').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-pick]');
      if (!btn || btn.disabled) return;
      const person = app.roster.find((r) => r.id === btn.dataset.pick);
      if (!person) return;
      const result = addSignedPlayer(m, { name: person.name, phone: person.phone || '', rosterId: person.id, phoneKey: person.phoneKey, hasPhone: person.hasPhone === true, phoneShared: $('#wa-share')?.checked === true }, asWait, !!$('#player-tentative')?.checked, friendRowValues());
      if (result === ALREADY_IN_MATCH) $('#pf-err').textContent = result;
    });
    setTimeout(() => find.focus(), 50);
  }
  const friendAdd = $('#btn-add-friend');
  if (friendAdd) {
    friendAdd.onclick = () => {
      const row = document.createElement('div');
      row.className = 'friend-row';
      row.innerHTML = '<input type="text" maxlength="60" autocomplete="off" placeholder="Nombre, si lo sabés" aria-label="Nombre del amigo"><button type="button" class="btn friend-remove" aria-label="Quitar amigo">×</button>';
      $('#friend-rows').appendChild(row);
      row.querySelector('input').focus();
    };
    $('#friend-rows').addEventListener('click', (e) => {
      const btn = e.target.closest('.friend-remove');
      if (btn) btn.closest('.friend-row')?.remove();
    });
  }
  form.onsubmit = (e) => {
    e.preventDefault();
    const name = form.name.value.trim();
    const phoneRaw = form.phone ? form.phone.value.trim() : null;
    if (!name) { $('#pf-err').textContent = 'Poné el nombre.'; return; }
    let phone = '';
    if (phoneRaw) {
      const r = normalizePhone(phoneRaw);
      if (!r.ok) { $('#pf-err').textContent = r.error; return; }
      phone = r.wa;
    }
    if (p) {
      const share = $('#wa-share')?.checked === true;
      const saveRoster = !editingFriend || !!p.rosterId || $('#save-roster')?.checked === true;
      const stillAuto = sameGuestLabel(p, name);
      const phoneForCheck = phoneRaw === null ? (p.phone || '') : phone;
      const candidate = {
        name,
        phone: phoneForCheck,
        phoneKey: phoneRaw === null ? (p.phoneKey || '') : '',
        hasPhone: phoneRaw === null ? p.hasPhone === true : !!phone,
        rosterId: p.rosterId || '',
        invitedBy: p.invitedBy || '',
        guestAuto: stillAuto,
      };
      if (alreadyInMatch(matesOf(m.id), candidate, { exceptId: p.id, roster: false })) {
        $('#pf-err').textContent = ALREADY_IN_MATCH;
        return;
      }
      const savingNewRoster = offerRoster && $('#save-roster')?.checked === true;
      if (savingNewRoster) {
        const known = rosterAlreadySaved(name, phoneForCheck);
        if (known && alreadyInMatch(matesOf(m.id), { name: known.name, phone: known.phone || phoneForCheck, phoneKey: known.phoneKey, hasPhone: known.hasPhone === true, rosterId: known.id }, { exceptId: p.id })) {
          $('#pf-err').textContent = ALREADY_IN_MATCH;
          return;
        }
      }
      closeSheet();
      run((async () => {
        const id = saveRoster
          ? await linkedRosterId({ name, phone: phoneRaw === null ? '' : phone, rosterId: p.rosterId, phoneKey: p.phoneKey, phoneShared: share })
          : (p.rosterId || '');
        if (savingNewRoster && id && alreadyInMatch(matesOf(m.id), { ...candidate, rosterId: id }, { exceptId: p.id })) {
          toast(ALREADY_IN_MATCH);
          return;
        }
        const patch = { name, ...(id ? { rosterId: id } : {}) };
        if (phoneRaw !== null) {
          patch.phone = phone;
          if ($('#wa-share')) patch.phoneShared = share;
        }
        if (editingFriend) {
          patch.invitedBy = p.invitedBy;
          const freshHost = friendHostName(p);
          if (freshHost) patch.invitedByName = freshHost;
          patch.guestAuto = stillAuto;
        }
        await app.store.updatePlayer(p.id, patch);
      })(), editingFriend ? 'Amigo actualizado' : 'Jugador actualizado');
      return;
    }
    const result = addSignedPlayer(m, { name, phone, phoneShared: $('#wa-share')?.checked === true }, asWait, !!$('#player-tentative')?.checked, friendRowValues());
    if (result === ALREADY_IN_MATCH) $('#pf-err').textContent = result;
  };
}

function friendRowValues() {
  return [...document.querySelectorAll('#friend-rows input')].map((input) => input.value);
}
/* Pago del jugador */
function moneyText(amount) {
  if (!amount) return '';
  return String(amount).replace('.', ',');
}
function readMoney(raw) {
  if (String(raw ?? '').trim() === '') return { ok: true, amount: 0 };
  return parseAmount(raw);
}
function openPaymentForm(m, p) {
  if (!p || !canAdd(m, actor().uid)) return;
  let paid = p.paid === true ? true : p.paid === false ? false : null;
  const parts = paymentParts(p);
  const known = p.paid === true || p.paid === false || parts.pending > 0 || parts.split;
  const promo = promoOf(p);
  const prices = livePrices();
  const shareSuggest = promo ? promo.share : prices.matchPrice;
  const totalSuggest = promo ? promo.total : prices.matchPrice;
  let suggestion = shareSuggest;
  const directed = hasPaymentDirection(p);
  const initialTo = (kind) => {
    if (kind === 'cash') {
      const saved = directed ? p.cashTo : (p.paid === true ? p.receivedBy : '');
      return String(saved || '').trim() || app.who || '';
    }
    if (kind === 'transfer') {
      if (Array.isArray(p.transferParts) && p.transferParts.length > 1) return String(p.transferParts[0].to || '').trim() || app.who || '';
      const saved = directed ? p.transferTo : (p.paid === true ? p.receivedBy : '');
      return String(saved || '').trim() || app.who || '';
    }
    const saved = directed ? p.pendingTo : (parts.pending > 0 ? p.paidUpdatedBy : '');
    return String(saved || '').trim() || app.who || '';
  };
  const cashStart = known ? moneyText(parts.cash) : moneyText(shareSuggest);
  const transferStart = known ? moneyText(parts.transfer) : '';
  const pendingStart = known ? moneyText(parts.pending) : '';
  const partsHint = Array.isArray(p.transferParts) && p.transferParts.length > 1
    ? `<p class="hint" id="pay-parts">Transferencia repartida: ${p.transferParts.map((part) => `${esc(part.to)} ${esc(formatARS(part.amount))}`).join(' · ')}. Si cambiás el monto, queda en un solo organizador.</p>`
    : '';
  const receivedNote = p.transferReceivedAt
    ? `<p class="hint">La transferencia se marcó como cobrada${p.transferReceivedBy ? ` · ${esc(p.transferReceivedBy)}` : ''}.</p>`
    : '';
  openSheet(`
    <form id="pay-form" novalidate>
      <h3>Pago</h3>
      <p class="hint">${esc(p.name)} · ${esc(fmtWhen(m))}</p>
      <div id="pay-promo">${promo ? `<div class="promo-badge">${esc(promo.label)}</div>` : ''}</div>
      ${parts.pending > 0 ? `<p class="pay-pending" id="pay-pending-now">Transfiere después ${esc(formatARS(parts.pending))}</p>
      <button type="button" class="btn block" id="btn-receive-pending">Marcar transferencia como cobrada</button>` : ''}
      ${receivedNote}
      <div class="field">
        <span>¿Pagó?</span>
        <div class="seg">
          <button type="button" class="btn" data-paid="si">Sí</button>
          <button type="button" class="btn" data-paid="no">No</button>
        </div>
      </div>
      <div id="pay-details">
        <div class="price-picks" id="pay-prices"></div>
        ${promo ? `<label class="pay-apply"><input type="checkbox" id="pay-apply-promo"><span id="pay-apply-label">Aplicar a los ${promo.count} partidos</span></label>` : ''}
        <div class="field"><span>Efectivo</span>
          <div class="pay-money">
            <input name="cash" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(cashStart)}" aria-label="Efectivo">
            <select name="cashTo" aria-label="Quién cobró el efectivo"></select>
          </div>
        </div>
        <div class="field"><span>Transferencia</span>
          <div class="pay-money">
            <input name="transfer" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(transferStart)}" aria-label="Transferencia">
            <select name="transferTo" aria-label="Quién cobró la transferencia"></select>
          </div>
        </div>
        ${partsHint}
        <div class="field"><span>Transfiere después</span>
          <div class="pay-money">
            <input name="pending" inputmode="decimal" autocomplete="off" placeholder="0" value="${esc(pendingStart)}" aria-label="Transfiere después">
            <select name="pendingTo" aria-label="A quién le va a transferir"></select>
          </div>
          <div class="small muted" id="pay-hint"></div>
        </div>
      </div>
      <div class="field"><div class="err" id="pay-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Guardar</button></div>
    </form>`);
  const form = $('#pay-form');
  const details = $('#pay-details');
  const paintSelect = (select, selected) => {
    const names = payOrganizerNames([selected, app.who, ...paymentShares(p).map((share) => share.name)]);
    const current = names.find((name) => sameOrganizer(name, selected)) || names[0] || '';
    select.innerHTML = names.map((name) => `<option value="${esc(name)}"${sameOrganizer(name, current) ? ' selected' : ''}>${esc(name)}</option>`).join('');
    if (current) select.value = names.find((name) => sameOrganizer(name, current)) || names[0];
  };
  const paintPrices = () => {
    const nowPrices = livePrices();
    const box = $('#pay-prices');
    if (box) {
      const picks = [
        ['1 partido', nowPrices.matchPrice],
        ['Promo 2', nowPrices.promo2Price],
        ['Promo 3', nowPrices.promo3Price],
      ];
      box.innerHTML = picks.map(([label, amount]) => `<button type="button" class="btn" data-price="${amount}">${esc(label)} ${esc(formatARS(amount))}</button>`).join('');
      box.querySelectorAll('[data-price]').forEach((btn) => {
        btn.onclick = () => {
          form.cash.value = btn.dataset.price;
          form.transfer.value = '';
          form.pending.value = '';
          $('#pay-err').textContent = '';
        };
      });
    }
    const hint = $('#pay-hint');
    if (hint) hint.textContent = `Lo cobrado es efectivo + transferencia. Transfiere después no entra en Recaudado hasta que lo marques como cobrado. ${priceExample(nowPrices.matchPrice)}`;
    const fresh = promoOf(p);
    const badge = $('#pay-promo');
    if (badge) badge.innerHTML = fresh ? `<div class="promo-badge">${esc(fresh.label)}</div>` : '';
    const applyLabel = $('#pay-apply-label');
    if (applyLabel && fresh) applyLabel.textContent = `Aplicar a los ${fresh.count} partidos`;
  };
  paintSelect(form.cashTo, initialTo('cash'));
  paintSelect(form.transferTo, initialTo('transfer'));
  paintSelect(form.pendingTo, initialTo('pending'));
  paintPrices();
  app.refreshPaySheet = () => {
    if (!$('#pay-form')) return;
    paintSelect(form.cashTo, form.cashTo.value);
    paintSelect(form.transferTo, form.transferTo.value);
    paintSelect(form.pendingTo, form.pendingTo.value);
    paintPrices();
  };
  const applyBox = $('#pay-apply-promo');
  if (applyBox) applyBox.onchange = () => {
    const next = applyBox.checked ? (promoOf(p)?.total ?? totalSuggest) : (promoOf(p)?.share ?? shareSuggest);
    const cashNow = readMoney(form.cash.value);
    const transferNow = readMoney(form.transfer.value);
    const pendingNow = readMoney(form.pending.value);
    const untouched = cashNow.ok && transferNow.ok && pendingNow.ok && transferNow.amount === 0 && pendingNow.amount === 0 && cashNow.amount === suggestion;
    suggestion = next;
    if (untouched) form.cash.value = moneyText(next);
  };
  const sync = () => {
    sheet.querySelector('[data-paid="si"]').classList.toggle('primary', paid === true);
    sheet.querySelector('[data-paid="no"]').classList.toggle('primary', paid === false);
    details.hidden = paid !== true;
  };
  sheet.querySelectorAll('[data-paid]').forEach((b) => (b.onclick = () => {
    paid = b.dataset.paid === 'si';
    $('#pay-err').textContent = '';
    sync();
    if (paid) setTimeout(() => form.cash.focus(), 30);
  }));
  const receive = $('#btn-receive-pending');
  if (receive) receive.onclick = () => {
    closeSheet();
    run(app.store.markTransferReceived(p.id, app.who), 'Transferencia marcada como cobrada', PAY_RULES_MSG);
  };
  sync();
  form.onsubmit = (e) => {
    e.preventDefault();
    if (paid !== true && paid !== false) { $('#pay-err').textContent = 'Indicá si pagó.'; return; }
    if (!paid) {
      closeSheet();
      run(app.store.setPayment(p.id, { paid: false, split: true }, app.who), 'Marcado como no pagó', PAY_RULES_MSG);
      return;
    }
    const cash = readMoney(form.cash.value);
    if (!cash.ok) { $('#pay-err').textContent = cash.error; return; }
    const transfer = readMoney(form.transfer.value);
    if (!transfer.ok) { $('#pay-err').textContent = transfer.error; return; }
    const pending = readMoney(form.pending.value);
    if (!pending.ok) { $('#pay-err').textContent = pending.error; return; }
    if (cash.amount + transfer.amount + pending.amount <= 0) { $('#pay-err').textContent = 'Poné un monto.'; return; }
    const freshPromo = promoOf(p);
    const applyAll = !!applyBox?.checked && freshPromo && freshPromo.rows.length >= 2;
    if (applyAll) {
      const shares = splitPaymentAcross({ cash: cash.amount, transfer: transfer.amount, pending: pending.amount }, freshPromo.rows.length);
      const jobs = freshPromo.rows.map((row, i) => app.store.setPayment(row.player.id, {
        paid: true,
        split: true,
        cash: shares[i].cash,
        transfer: shares[i].transfer,
        pendingTransfer: shares[i].pending,
        cashTo: shares[i].cash > 0 ? form.cashTo.value : null,
        transferTo: shares[i].transfer > 0 ? form.transferTo.value : null,
        pendingTo: shares[i].pending > 0 ? form.pendingTo.value : null,
      }, app.who));
      closeSheet();
      run(Promise.all(jobs), 'Promo aplicada', PAY_RULES_MSG);
      return;
    }
    const keepParts = roundMoney(transfer.amount) === parts.transfer && Array.isArray(p.transferParts) && p.transferParts.length > 1;
    const rec = {
      paid: true,
      split: true,
      cash: cash.amount,
      transfer: transfer.amount,
      pendingTransfer: pending.amount,
      cashTo: cash.amount > 0 ? form.cashTo.value : null,
      transferTo: transfer.amount > 0 ? form.transferTo.value : null,
      pendingTo: pending.amount > 0 ? form.pendingTo.value : null,
      transferParts: keepParts ? p.transferParts : null,
    };
    closeSheet();
    run(app.store.setPayment(p.id, rec, app.who), 'Pago guardado', PAY_RULES_MSG);
  };
}
function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}

function openPlayerMenu(m, p) {
  if (!p) return;
  const own = canEditPlayer(p, actor());
  openSheet(`
    <h3>${esc(p.name)}</h3>
    <p class="hint">${p.phone ? esc(displayFromWa(p.phone)) + ' · ' : phoneHidden(p) ? esc(PRIVATE_WA_TEXT) + ' · ' : ''}Agregó: ${esc(p.addedBy || '?')}</p>
    <div class="menu">
      ${p.phone ? `<a class="btn" href="${esc(waHref(p.phone, waMessage(m, p)))}" target="_blank" rel="noopener">${ICON.wa}Mandar WhatsApp</a>` : phoneHidden(p) ? `<button class="btn" type="button" disabled>${esc(PRIVATE_WA_TEXT)}</button>` : `<button class="btn" id="pm-phone"${own ? '' : ' disabled'}>Cargar WhatsApp</button>`}
      <button class="btn" id="pm-profile">Ver perfil</button>
      ${p.tentative === true ? '<button class="btn" id="pm-confirm-spot">Confirmar lugar</button>' : ''}
      ${p.tentative === true && p.confirmed === 'no' ? '<p class="hint">No juega · se puede liberar el lugar</p>' : ''}
      <button class="btn" id="pm-edit"${own ? '' : ' disabled'}>${ICON.edit}Editar</button>
      ${own ? '' : `<p class="hint edit-lock" id="edit-lock">${esc(EDIT_LOCK_TEXT)}</p>`}
      <button class="btn" id="pm-friend">Agregar amigo</button>
      <button class="btn danger" id="pm-del">${ICON.trash}${isWaiting(p) ? 'Quitar de la espera' : 'Quitar del partido'}</button>
      <button class="btn ghost" data-close>Cancelar</button>
    </div>`);
  $('#pm-profile').onclick = () => { closeSheet(); openPlayerProfile(p, m.id); };
  const loadPhone = $('#pm-phone');
  if (loadPhone && own) loadPhone.onclick = () => { closeSheet(); app.wantPhoneForm = true; openPlayerProfile(p, m.id); };
  const spot = $('#pm-confirm-spot');
  if (spot) spot.onclick = () => { closeSheet(); clearReservedSpot(p); };
  if (own) $('#pm-edit').onclick = () => openPlayerForm(m, p);
  $('#pm-friend').onclick = () => openFriendForm(m, p);
  $('#pm-del').onclick = () => removeMatchPlayer(m, p);
}

function removeMatchPlayer(m, p, { asked = false } = {}) {
  const fromMain = !isWaiting(p);
  const friends = matesOf(m.id).filter((item) => item.invitedBy === p.id);
  if (!asked && !confirm(`¿Quitar a ${p.name}${fromMain ? ' del partido' : ' de la lista de espera'}?`)) return;
  const dropFriends = friends.length > 0 && confirm(`¿Quitar también a sus amigos (${friends.map((item) => item.name).join(', ')})?`);
  const dropping = new Set([p.id, ...(dropFriends ? friends.map((item) => item.id) : [])]);
  const top = waitingOf(m.id).find((item) => !dropping.has(item.id));
  const mainLeft = playersOf(m.id).filter((item) => !dropping.has(item.id)).length;
  const promote = fromMain && top && mainLeft < capOf(m)
    && confirm(`¿Subir a ${top.name}, el primero de la lista de espera?`);
  closeSheet();
  const job = (async () => {
    for (const id of dropping) await app.store.deletePlayer(id);
    if (!promote) return;
    await app.store.promoteFromWaiting(top.id);
    await offerPromotionWhatsApp(top, m);
  })();
  run(job, promote ? `${top.name} pasó al partido` : `${p.name} quitado`);
}

function openFriendForm(m, host) {
  if (!host) return;
  const blocked = addBlock(m);
  if (blocked) { toast(blocked); return; }
  const next = resolveFriendNames([''], friendNamesOf(m.id, host.id))[0]?.name || 'Amigo 1';
  openSheet(`
    <form id="friend-form" novalidate>
      <h3>Amigos de ${esc(host.name)}</h3>
      <p class="hint">Si dejás el nombre vacío, sigue ${esc(next)}. Cuentan para el cupo como cualquier jugador.</p>
      <div class="friend-box">
        <div class="friend-head"><span>Amigos</span><button type="button" class="btn" id="btn-add-friend">Agregar amigo</button></div>
        <div id="friend-rows"></div>
      </div>
      <div class="field"><div class="err" id="friend-err"></div></div>
      <div class="sheet-actions"><button type="button" class="btn" data-close>Cancelar</button><button class="btn primary" type="submit">Agregar</button></div>
    </form>`);
  const form = $('#friend-form');
  const addRow = () => {
    const row = document.createElement('div');
    row.className = 'friend-row';
    row.innerHTML = '<input type="text" maxlength="60" autocomplete="off" placeholder="Nombre, si lo sabés" aria-label="Nombre del amigo"><button type="button" class="btn friend-remove" aria-label="Quitar amigo">×</button>';
    $('#friend-rows').appendChild(row);
    row.querySelector('input').focus();
  };
  $('#btn-add-friend').onclick = () => addRow();
  $('#friend-rows').addEventListener('click', (e) => {
    const btn = e.target.closest('.friend-remove');
    if (btn) btn.closest('.friend-row')?.remove();
  });
  addRow();
  form.onsubmit = (e) => {
    e.preventDefault();
    const rows = friendRowValues();
    if (!rows.length) { $('#friend-err').textContent = 'Agregá al menos un amigo.'; return; }
    const result = addSignedPlayer(m, host, host.waiting === true, false, rows);
    if (result === ALREADY_IN_MATCH) $('#friend-err').textContent = result;
  };
}

/* ───────── código de acceso (opcional) ───────── */
function promptLogin(session) {
  return new Promise((resolve) => {
    if (session.user) return resolve();
    const draw = (message = session.error || '') => {
      if (!replaceView(`
        <form class="gate" id="login-form">
          <div class="ball">⚽</div>
          <h2>Entrar</h2>
          <p class="muted">Solo entran el administrador y los organizadores que él crea.</p>
          <label class="field"><span>Mail</span><input id="login-email" name="email" type="email" autocomplete="username" required></label>
          <label class="field"><span>Contraseña</span><input id="login-password" name="password" type="password" autocomplete="current-password" required></label>
          <label class="field" id="login-name-wrap" hidden><span>Tu nombre</span><input id="login-name" maxlength="40" autocomplete="name" placeholder="Gustavo"></label>
          <div class="err" id="login-err">${esc(message)}</div>
          <button class="btn primary block" type="submit">Entrar</button>
          <button class="btn block" type="button" id="login-forgot">Olvidé mi contraseña</button>
          ${session.mode === 'firebase' ? '<button class="btn block" type="button" id="login-register">Crear cuenta de administrador</button>' : '<p class="footer-note">Demo: gustavo@demo.local · martin@demo.local</p>'}
        </form>`)) return;
      $('#login-form').onsubmit = async (e) => {
        e.preventDefault();
        try {
          await session.login($('#login-email').value, $('#login-password').value);
          if (session.user) resolve();
          else draw(session.error || 'No tenés acceso.');
        } catch (error) { draw(error.message || 'No se pudo entrar.'); }
      };
      $('#login-forgot').onclick = async () => {
        const email = $('#login-email').value.trim();
        if (!email) { $('#login-err').textContent = 'Poné el mail.'; return; }
        try {
          await session.forgot(email);
          draw('Te mandamos un mail para elegir una contraseña nueva.');
        } catch (error) { draw(error.message || 'No se pudo enviar el mail.'); }
      };
      const register = $('#login-register');
      if (register) register.onclick = async () => {
        $('#login-name-wrap').hidden = false;
        const name = $('#login-name').value.trim();
        if (!name) { $('#login-err').textContent = 'Poné tu nombre y tocá de nuevo.'; return; }
        try {
          await session.registerAdmin({ email: $('#login-email').value, password: $('#login-password').value, name });
          if (session.user) resolve();
          else draw(session.error || 'No se pudo crear la cuenta.');
        } catch (error) { draw(error.message || 'No se pudo crear la cuenta.'); }
      };
    };
    draw();
  });
}

function gate() {
  return new Promise((resolve) => {
    if (!ACCESS_CODE || localStorage.getItem(CODE_KEY) === ACCESS_CODE) return resolve();
    if (!replaceView(`
      <form class="gate" id="gate">
        <div class="ball">⚽</div><h2>Código de acceso</h2>
        <p class="muted">Pedile el código a Gustavo o Martín.</p>
        <label class="field"><input name="code" type="password" autocomplete="off" placeholder="Código" autofocus></label>
        <div class="err small" id="gate-err" style="color:var(--danger)"></div>
        <button class="btn primary block">Entrar</button>
      </form>`)) return;
    $('#gate').onsubmit = (e) => {
      e.preventDefault();
      if (e.target.code.value.trim() === ACCESS_CODE) { localStorage.setItem(CODE_KEY, ACCESS_CODE); resolve(); }
      else $('#gate-err').textContent = 'Código incorrecto';
    };
  });
}

/* ───────── arranque ───────── */
function syncTextSize() {
  const i = applyTextSize(readTextSize());
  const minus = $('#btn-text-smaller');
  const plus = $('#btn-text-bigger');
  if (minus) minus.disabled = i === 0;
  if (plus) plus.disabled = i === TEXT_SIZES.length - 1;
  document.querySelectorAll('[data-text-size]').forEach((btn) => {
    const on = Number(btn.dataset.textSize) === i;
    btn.classList.toggle('primary', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  requestAnimationFrame(placeBars);
}

async function boot() {
  clearWaChoice();
  $('#venue-name').textContent = VENUE;
  $('#btn-back').onclick = () => {
    const r = route();
    if (r.name === 'teams') { location.hash = `#/partido/${encodeURIComponent(r.id)}`; return; }
    if (r.name === 'match') {
      const m = matchById(r.id);
      location.hash = m?.date && m.date < todayISO() ? '#/historial' : '#/';
      return;
    }
    if (r.name === 'profile') {
      if (app.profileMatchId) { location.hash = `#/partido/${encodeURIComponent(app.profileMatchId)}`; return; }
      location.hash = app.profilePay ? '#/jugadores/pagos' : '#/jugadores';
      return;
    }
    if (r.name === 'users') { location.hash = hashForTab(savedTab()); return; }
    location.hash = '#/';
  };
  window.addEventListener('resize', placeBars);
  $('#btn-text-smaller').onclick = () => { stepTextSize(-1); syncTextSize(); };
  $('#btn-text-bigger').onclick = () => { stepTextSize(1); syncTextSize(); };
  syncTextSize();
  $('#btn-settings').onclick = openSettings;
  bindExternalShortClicks();
  $('#brand').onclick = () => { location.hash = '#/'; };

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW', e));
  }

  await gate();
  app.session = openSession();
  await app.session.init();
  app.users = app.session.users || [];
  app.session.subscribe(() => {
    const users = app.session.users || [];
    const user = app.session.user;
    const stamp = JSON.stringify([user?.uid || '', user?.name || '', user?.role || '', users.map((item) => [item.uid, item.name, item.role, item.active])]);
    const sameSession = stamp === app.sessionStamp;
    app.sessionStamp = stamp;
    app.users = users;
    if (user) {
      app.who = user.name;
      app.role = user.role;
      app.uid = user.uid;
    }
    if (app.store) app.store.setActor(user);
    if (!sameSession && app.loaded && (!sheet.open || !sheet.querySelector('input, textarea')) && location.hash !== '#/usuarios') render();
  });
  if (!app.session.user) await promptLogin(app.session);
  app.who = app.session.user.name;
  app.role = app.session.user.role;
  app.uid = app.session.user.uid;
  app.users = app.session.users || [];
  app.store = await createStore((e) => {
    showError(isPermissionDenied(e)
      ? RULES_MSG
      : e?.code === 'no-server'
        ? 'No hay conexión con la base de datos de Firebase: los cambios quedan solo en este teléfono. ¿Está creada la base Firestore del proyecto? (ver README)'
        : 'Problema de conexión con Firebase: ' + (e?.message || e));
  });
  $('#demo-banner').hidden = app.store.mode === 'firebase';
  app.store.setActor(app.session.user);
  app.store.subscribe((view) => {
    const { matches, players, roster, rosterError, organizers, organizersError, venues, venuesError, prices, pricesError, history, historyMeta, historyError } = view;
    app.matches = matches || []; app.players = releaseAnsweredReservations(players || []);
    app.history = history || [];
    app.historyMeta = historyMeta || null;
    app.historyError = historyError || '';
    app.roster = roster || [];
    app.organizers = organizers || [];
    app.venues = venues || [];
    app.prices = prices || null;
    if (rosterError && rosterError !== app.rosterError) showError(rosterError);
    app.rosterError = rosterError || null;
    if (organizersError && organizersError !== app.organizersError) showError(organizersError);
    app.organizersError = organizersError || null;
    if (venuesError && venuesError !== app.venuesError) showError(venuesError);
    app.venuesError = venuesError || null;
    if (pricesError && pricesError !== app.pricesError) showError(pricesError);
    app.pricesError = pricesError || null;
    app.loaded = true;
    const stamp = JSON.stringify([app.matches, app.players, app.history, app.historyMeta, app.historyError, app.roster, app.organizers, app.venues, app.prices, app.rosterError, app.organizersError, app.venuesError, app.pricesError]);
    const changed = stamp !== app.viewStamp;
    app.viewStamp = stamp;
    if (!changed) return;
    if (sheet.open && app.refreshPaySheet) app.refreshPaySheet();
    // no redibujar debajo de un formulario abierto para no perder lo que se escribe
    if (!sheet.open || !sheet.querySelector('input, textarea, select')) render(); else pendingRender = true;
    fixOverflow();
    backfillConfirmTokens();
    armReminderTimer();
  });
  render();
  armReminderTimer();
  // Al cambiar el día, Hoy/Mañana y el historial se actualizan. El mismo día no redibuja.
  setInterval(() => { app.store?.syncDay?.(); }, 60_000);
}

// El aviso del navegador solo sale si la página está abierta cuando se cumplen
// las 2 horas y el permiso ya estaba concedido. No hay envío en segundo plano.
let reminderSeenAt = Date.now();
let reminderTimer = 0;
let reminderTimerAt = Infinity;
const tokenPending = new Set();
const clearingReservation = new Set();

function releaseAnsweredReservations(players) {
  return players.map((p) => {
    if (!reservationClearedByAnswer(p)) {
      clearingReservation.delete(p.id);
      return p;
    }
    if (!clearingReservation.has(p.id)) {
      clearingReservation.add(p.id);
      Promise.resolve(app.store.clearTentative(p.id)).catch((e) => {
        clearingReservation.delete(p.id);
        console.error(e);
      });
    }
    return { ...p, tentative: null, tentativeAt: null };
  });
}

function backfillConfirmTokens() {
  for (const p of app.players) {
    if (tokenPending.has(p.id)) continue;
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
    if (needsReminderBanner(m, myReminderPlayers(m.id), now)) fireReminderNotification(m);
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
    patches.push(...overflowPatches(all, capOf(m)));
  }
  if (!patches.length) return;
  fixingOverflow = true;
  try {
    for (const patch of patches) await app.store.updatePlayer(patch.id, { waiting: true, waitOrder: patch.waitOrder, rosterAt: null });
  } catch (e) { console.error(e); }
  finally { fixingOverflow = false; }
}

sheet.addEventListener('close', () => {
  restoreTabs();
  placeBars();
  app.refreshPaySheet = null;
  pendingRender = false;
  render();
});

boot().catch((e) => { console.error(e); showError('Error al iniciar la app: ' + e.message); });

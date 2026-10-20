import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMatchesFromText as p } from '../js/parser.js';
import { isAndroidUa, normalizePhone, normalizeWaChoice, waLink, waSendUrl } from '../js/phone.js';
import { collectedLine, formatARS, parseAmount, paymentParts, paymentRecord, paymentShares, paymentStatusText, pendingStatusText, receivePendingTransfer } from '../js/payments.js';
import { createDemoStore } from '../js/store.js';
import { moveWaiting, nextWaitOrder, overflowPatches, sortWaiting } from '../js/waiting.js';
import { phoneIdentity, playerMatchesPerson, rosterHit, searchRoster } from '../js/roster.js';
import { phoneKey, sha256Hex } from '../js/privacy.js';
import { currentMatches, keptSignupIds, matchSignupState, pastMatches, playerRecord, playerStats, sortedNotes, upcomingMatches } from '../js/profile.js';
import { mineSummary, monthLabel, organizerTotals, paymentLedger, paymentsSummary, pendingTransfers, signupLedger } from '../js/ledger.js';
import { organizerChoices, organizerNames, organizerSlug, sameOrganizer } from '../js/organizers.js';
import { normalizePrices, parsePriceInput, playerPromoKey, promoForPlayer, promoOffer, splitEven, splitPaymentAcross } from '../js/prices.js';
import { toEpoch } from '../js/dates.js';
import {
  cancelLinks, cancelMessage, confirmPageUrl, confirmStatus, confirmSummary, confirmationAllowed, confirmationIdentity, confirmationRecord, matchesCrossingReminderWindow,
  needsReminderBanner, newConfirmToken, overlayConfirmations, playersForOrganizer, promotionMessage, reminderLinks, reminderMessage,
  reservationClearedByAnswer, waReminderUrl, withinReminderWindow,
} from '../js/reminders.js';
import { TEXT_SIZE_DEFAULT, TEXT_SIZES, textSizeIndex } from '../js/text-size.js';
import { addedCount, buildAccess, canAdd, canDelete, canEditAccess, canView, isRestricted, limitFor, limitMessage, publicAccess } from '../js/access.js';
import { cyclePlayer, dropPlayer, normalizeTeams, shuffleTeams, teamsBalance, teamsMessage, teamsRecord } from '../js/teams.js';
import {
  adminEmailConfigured, createOrganizerDemo, deleteOrganizerDemo, emptyAuthDb, loginDemo,
  sameAdminEmail, seedDemoAuth, setOrganizerActiveDemo,
} from '../js/auth.js';

// Referencia: lunes 19/10/2026 13:00 en Buenos Aires
const now = new Date('2026-10-19T13:00:00-03:00');
const dt = (r) => r.map((x) => `${x.date} ${x.time}`);

test('jueves 22/10 21hs', () => assert.deepEqual(dt(p('jueves 22/10 21hs', { now })), ['2026-10-22 21:00']));
test('miércoles 20:00', () => assert.deepEqual(dt(p('Miércoles 20:00', { now })), ['2026-10-21 20:00']));
test('mañana 19 hs', () => assert.deepEqual(dt(p('mañana 19 hs', { now })), ['2026-10-20 19:00']));
test('hoy a las 21', () => assert.deepEqual(dt(p('Hoy a las 21 en cancha 2', { now })), ['2026-10-19 21:00']));
test('pasado mañana 20.30hs', () => assert.deepEqual(dt(p('pasado mañana 20.30hs', { now })), ['2026-10-21 20:30']));
test('sábado 24 de octubre a las 18', () => assert.deepEqual(dt(p('sábado 24 de octubre a las 18', { now })), ['2026-10-24 18:00']));
test('viernes 23 22hs (día del mes sin mes)', () => assert.deepEqual(dt(p('viernes 23 22hs', { now })), ['2026-10-23 22:00']));
test('a las 9 de la noche', () => assert.deepEqual(dt(p('jueves a las 9 de la noche', { now })), ['2026-10-22 21:00']));
test('a las 21 y media', () => assert.deepEqual(dt(p('martes a las 21 y media', { now })), ['2026-10-20 21:30']));
test('varios en un mensaje', () => {
  const t = `Buenas! Partidos de la semana:
- Martes 20/10 21hs
- Jueves 22/10 20 y 21hs
Viernes
22:00 cancha 1`;
  assert.deepEqual(dt(p(t, { now })), ['2026-10-20 21:00', '2026-10-22 20:00', '2026-10-22 21:00', '2026-10-23 22:00']);
});
test('encabezado de WhatsApp como referencia para "mañana"', () => {
  assert.deepEqual(dt(p('[17/10/26, 10:15:02] Martín: mañana 19 hs fútbol', { now })), ['2026-10-18 19:00']);
});
test('no confunde teléfonos con horarios', () => assert.deepEqual(dt(p('jueves 21hs, llamar al 11 1234-5678', { now })), ['2026-10-22 21:00']));
test('día sin horario queda marcado', () => {
  const r = p('el domingo hay partido', { now });
  assert.equal(r.length, 1); assert.equal(r[0].date, '2026-10-25'); assert.equal(r[0].time, ''); assert.ok(r[0].warning);
});
test('día que no coincide genera advertencia', () => {
  const r = p('lunes 22/10 21hs', { now });
  assert.equal(r[0].date, '2026-10-22'); assert.ok(r[0].warning);
});
test('texto sin fechas', () => assert.deepEqual(p('hola, ¿cómo andan?', { now }), []));
test('fecha de enero -> año siguiente', () => assert.deepEqual(dt(p('05/01 21hs', { now })), ['2027-01-05 21:00']));

test('teléfonos argentinos', () => {
  const cases = {
    '11 1234-5678': '5491112345678',
    '1112345678': '5491112345678',
    '011 15 1234-5678': '5491112345678',
    '15 1234-5678': '5491112345678',
    '1234-5678': '5491112345678',
    '+54 9 11 1234-5678': '5491112345678',
    '+54 11 1234 5678': '5491112345678',
    '5491112345678': '5491112345678',
    '0351 15 123-4567': '5493511234567',
    '(0221) 412-3456': '5492214123456',
  };
  for (const [inp, out] of Object.entries(cases)) assert.equal(normalizePhone(inp).wa, out, inp);
  assert.equal(normalizePhone('123').ok, false);
  assert.equal(normalizePhone('+34 612 345 678').wa, '34612345678');
  assert.equal(normalizePhone('11 1234-5678').display, '+54 9 11 1234-5678');
});

test('WhatsApp: wa.me por defecto y package en Android', () => {
  assert.equal(waLink('5491112345678', 'Hola'), 'https://wa.me/5491112345678?text=Hola');
  assert.equal(waSendUrl({ phone: '5491112345678', text: 'Hola', choice: 'business', android: false }), 'https://wa.me/5491112345678?text=Hola');
  assert.equal(waSendUrl({ phone: '5491112345678', text: 'Hola', choice: 'ask', android: true }), 'https://wa.me/5491112345678?text=Hola');
  assert.equal(waSendUrl({ phone: '5491112345678', text: 'Hola', android: true }), 'https://wa.me/5491112345678?text=Hola');
  assert.equal(waSendUrl({ text: 'Lista', choice: 'whatsapp', android: false }), 'https://wa.me/?text=Lista');
  const business = waSendUrl({ phone: '5491112345678', text: 'Hola Juan', choice: 'business', android: true });
  assert.equal(business, `intent://wa.me/5491112345678?text=Hola%20Juan#Intent;scheme=https;package=com.whatsapp.w4b;S.browser_fallback_url=${encodeURIComponent('https://wa.me/5491112345678?text=Hola%20Juan')};end`);
  const plain = waSendUrl({ phone: '5491112345678', text: 'Hola', choice: 'whatsapp', android: true });
  assert.match(plain, /package=com\.whatsapp;/);
  assert.doesNotMatch(plain, /package=com\.whatsapp\.w4b/);
  assert.equal(isAndroidUa('Mozilla/5.0 (Linux; Android 14; Pixel 7)'), true);
  assert.equal(isAndroidUa('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), false);
  assert.equal(normalizeWaChoice('business'), 'business');
  assert.equal(normalizeWaChoice('ask'), 'ask');
  assert.equal(normalizeWaChoice('otro'), null);
});

test('montos en pesos', () => {
  assert.equal(parseAmount('5000').amount, 5000);
  assert.equal(parseAmount('5.000').amount, 5000);
  assert.equal(parseAmount('$5.000').amount, 5000);
  assert.equal(parseAmount('45.000').amount, 45000);
  assert.equal(parseAmount('5.000,50').amount, 5000.5);
  assert.equal(parseAmount('5000,5').amount, 5000.5);
  assert.equal(parseAmount('5000.50').amount, 5000.5);
  assert.equal(parseAmount('').ok, false);
  assert.equal(parseAmount('abc').ok, false);
  assert.equal(parseAmount('-5').ok, false);
  assert.equal(formatARS(5000), '$5.000');
  assert.equal(formatARS(45000), '$45.000');
  assert.equal(formatARS(5000.5), '$5.000,50');
  assert.equal(formatARS(0), '$0');
});

test('texto de pago y total del partido', () => {
  const juan = { name: 'Juan', paid: true, amount: 5000, method: 'transferencia' };
  const pedro = { name: 'Pedro', paid: false, amount: null, method: null };
  const nico = { name: 'Nico' };
  assert.equal(paymentStatusText(juan), 'Pagó $5.000 · Transferencia');
  assert.equal(paymentStatusText({ paid: true, amount: 5000, method: 'transferencia', receivedBy: 'Martín' }), 'Pagó $5.000 · Transferencia · cobró Martín');
  assert.equal(paymentStatusText({ paid: true, amount: 5000, method: 'efectivo' }), 'Pagó $5.000 · Efectivo');
  assert.equal(paymentStatusText(pedro), 'No pagó');
  assert.equal(paymentStatusText(nico), '');
  assert.equal(collectedLine([nico]), '');
  assert.equal(collectedLine([juan, pedro, nico]), 'Recaudado: $5.000 · 1/3 pagaron');
  const many = Array.from({ length: 14 }, (_, i) => (i < 9 ? { paid: true, amount: 5000, method: 'efectivo' } : { name: 'x' }));
  assert.equal(collectedLine(many), 'Recaudado: $45.000 · 9/14 pagaron');
});

test('paymentRecord arma los campos del jugador', () => {
  const now = 1_700_000_000_000;
  const ok = paymentRecord({ paid: true, amount: 5000, method: 'transferencia' }, 'Martín', now);
  assert.deepEqual(ok.patch, {
    paid: true, amount: 5000, method: 'transferencia', receivedBy: null, paidUpdatedBy: 'Martín', paidUpdatedAt: now,
  });
  const cobro = paymentRecord({ paid: true, amount: 5000, method: 'efectivo', receivedBy: ' Martín ' }, 'Gustavo', now);
  assert.equal(cobro.patch.receivedBy, 'Martín');
  assert.equal(paymentRecord({ paid: true, amount: 5000, method: 'efectivo', receivedBy: 'x'.repeat(41) }, 'Gustavo').ok, false);
  const no = paymentRecord({ paid: false }, 'Gustavo', now);
  assert.equal(no.patch.paid, false);
  assert.equal(no.patch.amount, null);
  assert.equal(no.patch.method, null);
  assert.equal(no.patch.receivedBy, null);
  assert.equal(no.patch.paidUpdatedBy, 'Gustavo');
  assert.equal(paymentRecord({ paid: true, amount: 5000 }, 'Gustavo').ok, false);
  assert.equal(paymentRecord({ paid: true, amount: -1, method: 'efectivo' }, 'Gustavo').ok, false);
  assert.equal(paymentRecord({}, 'Gustavo').ok, false);
});

test('pago partido y transfiere después no entran en lo cobrado hasta marcarlo', () => {
  const now = 1_700_000_000_000;
  const both = paymentRecord({ paid: true, cash: 2000, transfer: 3000, pendingTransfer: 1500, receivedBy: 'Martín' }, 'Gustavo', now);
  assert.equal(both.ok, true);
  assert.equal(both.patch.paid, true);
  assert.equal(both.patch.amount, 5000);
  assert.equal(both.patch.method, null);
  assert.equal(both.patch.cash, 2000);
  assert.equal(both.patch.transfer, 3000);
  assert.equal(both.patch.pendingTransfer, 1500);
  assert.equal(both.patch.receivedBy, 'Martín');
  assert.equal(paymentStatusText(both.patch), 'Pagó $5.000 · Efectivo $2.000 · Transferencia $3.000 · cobró Martín · Transfiere después $1.500');
  assert.equal(pendingStatusText(both.patch), 'Transfiere después $1.500');
  const onlyTransfer = paymentRecord({ paid: true, cash: 0, transfer: 5000, pendingTransfer: 0 }, 'Martín', now);
  assert.equal(onlyTransfer.patch.method, 'transferencia');
  assert.equal(onlyTransfer.patch.amount, 5000);
  assert.equal(onlyTransfer.patch.paid, true);
  assert.equal(onlyTransfer.patch.pendingTransfer, null);
  assert.equal(paymentStatusText(onlyTransfer.patch), 'Pagó $5.000 · Transferencia');
  const onlyPending = paymentRecord({ paid: true, cash: 0, transfer: 0, pendingTransfer: 800 }, 'Gustavo', now);
  assert.equal(onlyPending.patch.paid, false);
  assert.equal(onlyPending.patch.amount, null);
  assert.equal(onlyPending.patch.method, null);
  assert.equal(paymentStatusText(onlyPending.patch), 'Transfiere después $800');
  assert.equal(paymentStatusText({ paid: false, cash: null, transfer: null, pendingTransfer: null }), 'No pagó');
  const legacy = { paid: true, amount: 4500, method: 'efectivo' };
  assert.deepEqual(paymentParts(legacy), { cash: 4500, transfer: 0, pending: 0, received: 4500, split: false });
  assert.equal(paymentStatusText(legacy), 'Pagó $4.500 · Efectivo');
  const list = [both.patch, onlyPending.patch, { name: 'Nico' }];
  assert.equal(collectedLine(list), 'Recaudado: $5.000 · 1/3 pagaron · Transfiere después: $2.300');
  const received = receivePendingTransfer(onlyPending.patch, 'Martín', now + 5);
  assert.equal(received.ok, true);
  assert.equal(received.patch.paid, true);
  assert.equal(received.patch.amount, 800);
  assert.equal(received.patch.method, 'transferencia');
  assert.equal(received.patch.transfer, 800);
  assert.equal(received.patch.pendingTransfer, null);
  assert.equal(received.patch.transferReceivedAt, now + 5);
  assert.equal(received.patch.transferReceivedBy, 'Martín');
  assert.equal(received.patch.transferTo, 'Gustavo');
  assert.equal(received.patch.receivedBy, 'Gustavo');
  assert.equal(paymentStatusText(received.patch), 'Pagó $800 · Transferencia · cobró Gustavo');
  const kept = receivePendingTransfer({ ...both.patch }, 'Lucía', now + 9);
  assert.equal(kept.patch.cash, 2000);
  assert.equal(kept.patch.cashTo, 'Martín');
  assert.equal(kept.patch.transfer, 4500);
  assert.equal(kept.patch.amount, 6500);
  assert.equal(kept.patch.receivedBy, null);
  assert.deepEqual(kept.patch.transferParts, [{ to: 'Martín', amount: 3000 }, { to: 'Gustavo', amount: 1500 }]);
  assert.equal(kept.patch.transferReceivedBy, 'Lucía');
  assert.equal(paymentRecord({ paid: true, cash: -1, transfer: 0, pendingTransfer: 0 }, 'Gustavo').ok, false);
  assert.equal(paymentRecord({ paid: true, cash: 0, transfer: 0, pendingTransfer: 0 }, 'Gustavo').error, 'Poné un monto.');
  const cleared = paymentRecord({ paid: false, split: true }, 'Gustavo', now);
  assert.equal(cleared.patch.cash, null);
  assert.equal(cleared.patch.pendingTransfer, null);
  assert.equal(cleared.patch.transferReceivedBy, null);
});

test('lo pendiente no suma en el perfil ni en el total del organizador', () => {
  const players = [
    { phone: '1', name: 'Juan', matchId: 'm', paid: true, amount: 2000, cash: 2000, transfer: 0, pendingTransfer: 1500, method: 'efectivo', receivedBy: 'Martín', paidUpdatedBy: 'Gustavo', addedBy: 'Gustavo' },
    { phone: '1', name: 'Juan', matchId: 'm2', paid: false, amount: null, cash: 0, transfer: 0, pendingTransfer: 500, method: null, receivedBy: null, paidUpdatedBy: 'Gustavo', addedBy: 'Martín' },
  ];
  const matches = [{ id: 'm', date: '2026-10-22' }, { id: 'm2', date: '2026-10-24' }];
  const ledger = paymentLedger({ phone: '1', players, matches });
  assert.equal(ledger.total, 2000);
  assert.equal(ledger.totalText, 'Pagó $2.000');
  const totals = organizerTotals(players);
  assert.equal(totals.find((row) => row.name === 'Martín').collected, 2000);
  assert.equal(totals.find((row) => row.name === 'Gustavo').pending, 2000);
  assert.equal(totals.find((row) => row.name === 'Martín').pending, 0);
  const pending = pendingTransfers({ players, organizer: 'Gustavo' });
  assert.equal(pending.total, 2000);
  assert.equal(pending.rows[0].name, 'Juan');
  assert.equal(pendingTransfers({ players, organizer: 'Martín' }).total, 0);
  const summary = paymentsSummary({ players, roster: [] });
  assert.equal(summary[0].paidTotal, 2000);
  assert.equal(summary[0].pending, 2000);
  const mine = mineSummary(players, 'Gustavo');
  assert.equal(mine.amount, 0);
  assert.equal(mine.pending, 2000);
  assert.match(mine.text, /por transferir \$2\.000/);
  assert.equal(playerRecord({ phone: '1', players, matches }).paidTotal, 2000);
});

test('anotar desde el perfil: ya anotado, libre y completo a la espera', () => {
  const now = Date.parse('2026-10-19T13:00:00-03:00');
  const matches = [
    { id: 'past', date: '2026-10-15', time: '21:00' },
    { id: 'jue', date: '2026-10-22', time: '21:00', capacity: 2 },
    { id: 'sab', date: '2026-10-24', time: '18:00', capacity: 14 },
    { id: 'full', date: '2026-10-26', time: '21:00', capacity: 1 },
  ];
  const upcoming = upcomingMatches(matches, now).map((match) => match.id);
  assert.deepEqual(upcoming, ['jue', 'sab', 'full']);
  const players = [
    { id: 'j', matchId: 'jue', phone: '5491112345678', waiting: false },
    { id: 'w', matchId: 'sab', phone: '5491112345678', waiting: true },
    { id: 'a', matchId: 'full', phone: '5491100000000', waiting: false },
  ];
  const jue = matchSignupState({ phone: '5491112345678', match: matches[1], players });
  assert.equal(jue.state, 'anotado');
  assert.equal(jue.existing, true);
  assert.equal(jue.label, 'Anotado');
  assert.equal(jue.playerId, 'j');
  const sab = matchSignupState({ phone: '5491112345678', match: matches[2], players });
  assert.equal(sab.state, 'espera');
  assert.equal(sab.label, 'En espera');
  assert.equal(sab.playerId, 'w');
  const other = matchSignupState({ phone: '5491199999999', match: matches[2], players });
  assert.equal(other.state, 'libre');
  assert.equal(other.willWait, false);
  assert.equal(other.spots, 14);
  assert.match(other.label, /Quedan 14/);
  const full = matchSignupState({ phone: '5491199999999', match: matches[3], players });
  assert.equal(full.state, 'lleno');
  assert.equal(full.willWait, true);
  assert.equal(full.label, 'Completo · va a la espera');
  assert.equal(full.spots, 0);
});

test('modo demo guarda el pago en el jugador y lo emite', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  const mid = await store.addMatch({ date: '2026-10-22', time: '21:00', note: 'Cancha 2' }, 'Gustavo');
  const pid = await store.addPlayer({ id: mid, date: '2026-10-22' }, { name: 'Juan Pérez', phone: '5491112345678' }, 'Gustavo');
  let seen = null;
  store.subscribe((snap) => { seen = snap; });
  await store.setPayment(pid, { paid: true, amount: 5000, method: 'transferencia' }, 'Martín');
  const row = seen.players.find((p) => p.id === pid);
  assert.equal(row.paid, true);
  assert.equal(row.amount, 5000);
  assert.equal(row.method, 'transferencia');
  assert.equal(row.paidUpdatedBy, 'Martín');
  assert.equal(row.receivedBy, null);
  assert.equal(typeof row.paidUpdatedAt, 'number');
  assert.equal(row.name, 'Juan Pérez');
  assert.equal(row.matchId, mid);
  await store.updatePlayer(pid, { name: 'Juan P.' });
  const kept = JSON.parse(mem.get('f7c-demo-db')).players[pid];
  assert.equal(kept.name, 'Juan P.');
  assert.equal(kept.paid, true);
  assert.equal(kept.method, 'transferencia');
  await assert.rejects(() => store.setPayment(pid, { paid: true, amount: 10, method: 'otro' }, 'Gustavo'), /Elegí/);
  assert.equal(JSON.parse(mem.get('f7c-demo-db')).players[pid].method, 'transferencia');
  await store.setPayment(pid, { paid: true, amount: 5000, method: 'transferencia', receivedBy: 'Martín' }, 'Martín');
  assert.equal(JSON.parse(mem.get('f7c-demo-db')).players[pid].receivedBy, 'Martín');
  await store.setPayment(pid, { paid: false }, 'Gustavo');
  const unpaid = JSON.parse(mem.get('f7c-demo-db')).players[pid];
  assert.equal(unpaid.paid, false);
  assert.equal(unpaid.amount, null);
  assert.equal(unpaid.method, null);
  assert.equal(unpaid.receivedBy, null);
  assert.equal(unpaid.paidUpdatedBy, 'Gustavo');
});

test('lista de espera: al final, flechas y subir al primero', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-wait';
  const mid = await store.addMatch({ date: '2026-10-22', time: '21:00', capacity: 2 }, 'Gustavo');
  const match = { id: mid, date: '2026-10-22', capacity: 2 };
  await store.addPlayer(match, { name: 'Ana', phone: '' }, 'Gustavo');
  const early = await store.addPlayer(match, { name: 'Cero', phone: '' }, 'Martín', { waiting: true });
  await store.addPlayer(match, { name: 'Beto', phone: '' }, 'Gustavo');
  const late = await store.addPlayer(match, { name: 'Dino', phone: '' }, 'Gustavo');
  const db = () => JSON.parse(mem.get('f7c-test-wait'));
  const byName = (n) => Object.values(db().players).find((p) => p.name === n);
  const tokens = Object.values(db().players).map((p) => p.confirmToken);
  assert.equal(tokens.length, 4);
  assert.ok(tokens.every((t) => typeof t === 'string' && /^[A-Za-z0-9_-]{24}$/.test(t)));
  assert.equal(new Set(tokens).size, 4);
  assert.equal(byName('Ana').waiting, false);
  assert.equal(byName('Beto').waiting, false);
  assert.equal(byName('Cero').waiting, true);
  assert.equal(byName('Dino').waiting, true);
  assert.ok(byName('Dino').waitOrder > byName('Cero').waitOrder);
  const waiting = () => sortWaiting(Object.entries(db().players).map(([id, p]) => ({ id, ...p })).filter((p) => p.waiting));
  assert.deepEqual(waiting().map((p) => p.name), ['Cero', 'Dino']);
  await store.setWaitOrders(moveWaiting(waiting(), late, -1));
  assert.deepEqual(waiting().map((p) => p.name), ['Dino', 'Cero']);
  assert.equal(moveWaiting(waiting(), early, 1).length, 0);
  assert.equal(moveWaiting(waiting(), waiting()[0].id, -1).length, 0);
  assert.equal(moveWaiting(waiting(), waiting().at(-1).id, 1).length, 0);
  const top = waiting()[0];
  await store.promoteFromWaiting(top.id);
  assert.equal(byName(top.name === 'Dino' ? 'Dino' : 'Cero').waiting, false);
  assert.equal(byName('Dino').waiting, false);
  assert.equal(byName('Cero').waiting, true);
  const overflow = overflowPatches([
    { id: 'a', waiting: false, createdAt: 1, rosterAt: 1 },
    { id: 'b', waiting: false, createdAt: 2, rosterAt: 2 },
    { id: 'c', waiting: false, createdAt: 3, rosterAt: 3 },
    { id: 'w', waiting: true, waitOrder: 1, createdAt: 4 },
  ], 2);
  assert.deepEqual(overflow, [{ id: 'c', waiting: true, waitOrder: 2, rosterAt: null }]);
  assert.equal(nextWaitOrder([{ waitOrder: 2 }, { waitOrder: 5 }]), 6);
});

test('recordatorio: token, link y mensaje', () => {
  const a = newConfirmToken();
  const b = newConfirmToken();
  assert.notEqual(a, b);
  assert.match(a, /^[A-Za-z0-9_-]{24}$/);
  const url = confirmPageUrl({ matchId: '2026-10-22_2100', playerId: 'abc', token: a });
  assert.equal(url, `https://gustavofarg-hash.github.io/futbol-colegiales/confirmar.html?m=2026-10-22_2100&p=abc&t=${encodeURIComponent(a)}`);
  const msg = reminderMessage({
    player: { name: 'Juan Pérez' },
    match: { date: '2026-10-22', time: '21:00', note: 'Cancha 2' },
    venue: 'Polideportivo Colegiales',
    confirmUrl: url,
  });
  assert.match(msg, /^¡Hola Juan!/);
  assert.match(msg, /jueves 22\/10 a las 21:00 hs/);
  assert.match(msg, /Polideportivo Colegiales/);
  assert.match(msg, /\(Cancha 2\)/);
  assert.ok(msg.includes(url));
  assert.ok(waReminderUrl('5491112345678', msg).startsWith('https://wa.me/5491112345678?text='));
  const forced = waReminderUrl('5491112345678', msg, { choice: 'whatsapp', android: true });
  assert.match(forced, /package=com\.whatsapp;/);
  assert.equal(decodeURIComponent(forced.split('S.browser_fallback_url=')[1].replace(/;end$/, '')).startsWith('https://wa.me/5491112345678?text='), true);
  const player = { matchId: '2026-10-22_2100', confirmToken: a };
  assert.equal(confirmationAllowed(player, '2026-10-22_2100', a), true);
  assert.equal(confirmationAllowed(player, '2026-10-22_2100', 'otro-token-largo-falso'), false);
  assert.equal(confirmationAllowed(player, 'otro-partido', a), false);
  assert.equal(confirmSummary([{ confirmed: 'si' }, { confirmed: 'no' }, { name: 'x' }]).text, 'Confirmados: 1 · No juegan: 1 · Sin respuesta: 1');
});

test('aviso al subir de la espera y lugar reservado', () => {
  const url = 'https://gustavofarg-hash.github.io/futbol-colegiales/confirmar.html?m=2026-10-22_2100&p=p1&t=abc';
  const msg = promotionMessage({
    player: { name: 'Juan Pérez' },
    match: { date: '2026-10-22', time: '21:00' },
    venue: 'Polideportivo Colegiales',
    confirmUrl: url,
  });
  assert.equal(msg, `¡Hola Juan Pérez! Se hizo un lugar en el fútbol 7 en Polideportivo Colegiales el jueves 22/10 a las 21:00 hs. ¿Confirmás tu presencia? ¿Querés que te deje anotado? Respondé en este link: ${url}`);
  assert.equal(reservationClearedByAnswer({ tentative: true, confirmed: 'si' }), true);
  assert.equal(reservationClearedByAnswer({ tentative: true, confirmed: 'no' }), false);
  assert.equal(reservationClearedByAnswer({ confirmed: 'si' }), false);
  const held = confirmStatus({ tentative: true, confirmed: 'si' });
  assert.equal(held.text, 'Reservado · a confirmar');
  assert.equal(held.cls, 'reserved');
  assert.equal(held.note, undefined);
  const declined = confirmStatus({ tentative: true, confirmed: 'no' });
  assert.equal(declined.note, 'No juega · se puede liberar el lugar');
  assert.equal(confirmStatus({ confirmed: 'si' }).text, '✅ Confirmó');
  const sum = confirmSummary([
    { tentative: true },
    { tentative: true, confirmed: 'no' },
    { confirmed: 'si' },
    { name: 'x' },
  ]);
  assert.equal(sum.hold, 2);
  assert.equal(sum.si, 1);
  assert.equal(sum.no, 1);
  assert.equal(sum.pending, 1);
  assert.equal(sum.text, 'Confirmados: 1 · A confirmar: 2 · No juegan: 1 · Sin respuesta: 1');
  assert.equal(confirmStatus({ waiting: true }), null);
  assert.equal(confirmStatus({ waiting: true, confirmed: 'si' }), null);
  assert.equal(confirmStatus({ waiting: true, confirmed: 'no' }), null);
  const waiting = confirmSummary([
    { waiting: true },
    { waiting: true, confirmed: 'si' },
    { waiting: true, confirmed: 'no' },
    { confirmed: 'si' },
  ]);
  assert.equal(waiting.pending, 0);
  assert.equal(waiting.si, 1);
  assert.equal(waiting.no, 0);
  assert.equal(waiting.hold, 0);
  assert.equal(waiting.text, 'Confirmados: 1 · No juegan: 0 · Sin respuesta: 0');
  assert.equal(confirmStatus({ waiting: false }).text, '⏳ Sin respuesta');
  assert.equal(confirmStatus({ confirmed: 'no' }).text, '❌ No juega');
});

test('recordatorio: ventana de 2 horas y links sin abrir el flujo', () => {
  const start = Date.parse('2026-10-19T15:00:00-03:00');
  const match = { id: '2026-10-19_1500', date: '2026-10-19', time: '15:00', startsAt: start, note: 'Cancha 2' };
  const token = 'a'.repeat(24);
  const players = [
    { id: 'p1', name: 'Juan Pérez', phone: '5491112345678', confirmToken: token },
    { id: 'p2', name: 'Sin teléfono', phone: '', confirmToken: 'b'.repeat(24) },
    { id: 'p3', name: 'Sin token', phone: '5491100000000' },
  ];
  const twoH = 2 * 60 * 60 * 1000;
  assert.equal(withinReminderWindow(match, start - twoH), true);
  assert.equal(withinReminderWindow(match, start - twoH - 1), false);
  assert.equal(withinReminderWindow(match, start), true);
  assert.equal(withinReminderWindow(match, start + 1), false);
  assert.equal(needsReminderBanner({ ...match, cancelled: true }, players, start - 60_000), false);
  assert.equal(needsReminderBanner(match, players, start - 60_000), true);
  assert.equal(needsReminderBanner(match, players.map((p) => (p.phone ? { ...p, reminderSentAt: 1 } : p)), start - 60_000), false);
  assert.equal(needsReminderBanner(match, players.map((p) => (p.id === 'p1' ? { ...p, reminderSentAt: 1 } : p)), start - 60_000), true);
  assert.equal(needsReminderBanner(match, [{ name: 'Nadie', phone: '' }], start - 60_000), false);
  const links = reminderLinks({ match, players, venue: 'Polideportivo Colegiales' });
  assert.equal(links.length, 1);
  assert.equal(links[0].name, 'Juan Pérez');
  assert.equal(links[0].confirmUrl, `https://gustavofarg-hash.github.io/futbol-colegiales/confirmar.html?m=2026-10-19_1500&p=p1&t=${token}`);
  assert.ok(links[0].waUrl.startsWith('https://wa.me/5491112345678?text='));
  const businessLinks = reminderLinks({ match, players, venue: 'Polideportivo Colegiales', choice: 'business', android: true });
  assert.match(businessLinks[0].waUrl, /package=com\.whatsapp\.w4b;/);
  assert.equal(businessLinks[0].phone, '5491112345678');
  const text = decodeURIComponent(links[0].waUrl.split('text=')[1]);
  assert.match(text, /^¡Hola Juan!/);
  assert.match(text, /lunes 19\/10 a las 15:00 hs \(Cancha 2\)/);
  assert.ok(text.includes(links[0].confirmUrl));
  assert.deepEqual(matchesCrossingReminderWindow([match], start - twoH - 1000, start - twoH + 1000).map((m) => m.id), ['2026-10-19_1500']);
  assert.equal(matchesCrossingReminderWindow([match], start - 1000, start - 500).length, 0);
  const mixed = [
    { id: 'g', name: 'Juan', phone: '5491111111111', confirmToken: token, addedBy: 'Gustavo' },
    { id: 'm', name: 'Nico', phone: '5491122222222', confirmToken: 'b'.repeat(24), addedBy: 'martín' },
  ];
  assert.deepEqual(playersForOrganizer(mixed, 'gustavo').map((p) => p.id), ['g']);
  assert.deepEqual(playersForOrganizer(mixed, 'Martín').map((p) => p.id), ['m']);
  assert.equal(needsReminderBanner(match, playersForOrganizer(mixed, 'Gustavo'), start - 60_000), true);
  const gustavoSent = mixed.map((p) => (p.id === 'g' ? { ...p, reminderSentAt: 1 } : p));
  assert.equal(needsReminderBanner(match, playersForOrganizer(gustavoSent, 'Gustavo'), start - 60_000), false);
  assert.equal(needsReminderBanner(match, playersForOrganizer(gustavoSent, 'Martín'), start - 60_000), true);
});

test('búsqueda del plantel: nombre, apellido y teléfono', () => {
  const roster = [
    { id: '1', name: 'Ernesto Pereira', phone: '5491122223333' },
    { id: '2', name: 'José Pérez', phone: '5491144445555' },
    { id: '3', name: 'Ana Gómez', phone: '5491199990000' },
  ];
  const names = (q) => searchRoster(roster, q).map((p) => p.name);
  assert.deepEqual(names('ERN'), ['Ernesto Pereira']);
  assert.deepEqual(names('ern'), ['Ernesto Pereira']);
  assert.deepEqual(names('Pereira'), ['Ernesto Pereira']);
  assert.deepEqual(names('pereir'), ['Ernesto Pereira']);
  assert.deepEqual(names('perez'), ['José Pérez']);
  assert.deepEqual(names('JOSE'), ['José Pérez']);
  assert.deepEqual(names('NES'), []);
  assert.equal(rosterHit(roster[0], 'eira'), false);
  assert.deepEqual(names('2222-3333'), ['Ernesto Pereira']);
  assert.deepEqual(names('+54 9 11 4444'), ['José Pérez']);
  assert.deepEqual(names('11 9999 0000'), ['Ana Gómez']);
  assert.deepEqual(names(''), ['Ana Gómez', 'Ernesto Pereira', 'José Pérez']);
});

test('perfil: partidos pasados, día y horario más frecuentes', () => {
  const now = Date.parse('2026-10-19T13:00:00-03:00');
  const match = (id, date, time) => ({ id, date, time, startsAt: toEpoch(date, time) });
  const matches = [
    match('j1', '2026-10-15', '21:00'),
    match('j2', '2026-10-08', '21:00'),
    match('m1', '2026-10-13', '19:00'),
    match('fut', '2026-10-22', '21:00'),
    match('esp', '2026-10-01', '21:00'),
  ];
  const phone = '5491122223333';
  const on = (matchId, extra = {}) => ({ matchId, phone, waiting: false, ...extra });
  const players = [
    on('j1', { paid: true, amount: 5000, method: 'transferencia', confirmed: 'si' }),
    on('j2', { confirmed: 'no' }),
    on('m1'),
    on('fut', { paid: true, amount: 5000, confirmed: 'si' }),
    { matchId: 'esp', phone, waiting: true, paid: true, amount: 9000 },
    on('j1', { phone: '5491100000000' }),
  ];
  const stats = playerStats({ phone, players, matches, now });
  assert.equal(stats.played, 3);
  assert.equal(stats.summary, 'Mayormente jueves · 21:00');
  assert.deepEqual(stats.dates.map((d) => d.date), ['2026-10-15', '2026-10-13', '2026-10-08']);
  assert.equal(playerStats({ phone, players: [], matches, now }).played, 0);
  assert.equal(playerStats({ phone, players, matches, now }).summary.includes('22/10'), false);
  const record = playerRecord({ phone, players, matches });
  assert.equal(record.paidText, 'Pagó $10.000 en 2 partidos');
  assert.equal(record.confirmText, 'Confirmó 2 de 3');
  assert.equal(playerRecord({
    phone: '5491100001111',
    players: [{ matchId: 'esp', phone: '5491100001111', waiting: true }],
    matches,
  }).confirmText, '');
  assert.deepEqual(keptSignupIds(['libre', 'lleno', 'ya', 'fuera'], [
    { id: 'libre', existing: false },
    { id: 'lleno', existing: false },
    { id: 'ya', existing: true },
  ]), ['libre', 'lleno']);
  const ledger = paymentLedger({ phone, players, matches });
  assert.equal(ledger.totalText, 'Pagó $19.000');
  assert.equal(ledger.months[0].text, 'Oct 2026: $19.000');
  assert.deepEqual(ledger.byOrganizer.map((row) => row.name), ['Sin especificar']);
  assert.equal(monthLabel('2026-10'), 'Oct 2026');
  const notes = sortedNotes([
    { id: 'a', createdAt: 1, text: 'vieja' },
    { id: 'b', createdAt: 5, text: 'nueva' },
  ]);
  assert.deepEqual(notes.map((n) => n.text), ['nueva', 'vieja']);
});

test('plantel demo: no duplica por teléfono', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-roster';
  const id = await store.addRoster({ name: 'Ernesto Pereira', phone: '5491122223333' }, 'Gustavo');
  await assert.rejects(() => store.addRoster({ name: 'Otro', phone: '5491122223333' }, 'Martín'), /WhatsApp/);
  assert.equal(Object.keys(JSON.parse(mem.get('f7c-test-roster')).roster).length, 1);
  await store.updateRoster(id, { name: 'Ernesto P.', phone: '5491122223333' });
  assert.equal(JSON.parse(mem.get('f7c-test-roster')).roster[id].name, 'Ernesto P.');
  await store.deleteRoster(id);
  assert.equal(Object.keys(JSON.parse(mem.get('f7c-test-roster')).roster).length, 0);
});

test('pagos por organizador: mes, cobrador y veces anotado', () => {
  const matches = [
    { id: 'oct', date: '2026-10-22', time: '21:00' },
    { id: 'nov', date: '2026-11-05', time: '21:00' },
  ];
  const phone = '5491112345678';
  const players = [
    { matchId: 'oct', phone, waiting: false, paid: true, amount: 5000, receivedBy: 'Martín', addedBy: 'Gustavo' },
    { matchId: 'oct', phone, waiting: true, paid: true, amount: 5000, receivedBy: 'Gustavo', addedBy: 'Gustavo' },
    { matchId: 'nov', phone, waiting: false, paid: true, amount: 4000, addedBy: 'Martín' },
    { matchId: 'oct', phone: '5491100000000', paid: true, amount: 9000, receivedBy: 'Martín', addedBy: 'Lucía' },
  ];
  const all = paymentLedger({ phone, players, matches });
  assert.equal(all.total, 14000);
  assert.deepEqual(all.months.map((row) => row.text), ['Nov 2026: $4.000', 'Oct 2026: $10.000']);
  assert.deepEqual(all.byOrganizer.map((row) => [row.name, row.amount]), [['Gustavo', 5000], ['Martín', 5000], ['Sin especificar', 4000]]);
  const martin = paymentLedger({ phone, players, matches, organizer: 'martín' });
  assert.equal(martin.totalText, 'Pagó $5.000');
  assert.equal(martin.months.length, 1);
  const blank = paymentLedger({ phone, players, matches, organizer: 'Sin especificar' });
  assert.equal(blank.total, 4000);
  const signups = signupLedger({ phone, players });
  assert.deepEqual(signups.byOrganizer.map((row) => [row.name, row.count]), [['Gustavo', 2], ['Martín', 1]]);
  assert.equal(signupLedger({ phone, players, organizer: 'Gustavo' }).total, 2);
  const summary = paymentsSummary({
    players,
    roster: [{ name: 'Juan Pérez', phone }],
    organizer: 'Martín',
  });
  const juan = summary.find((row) => row.name === 'Juan Pérez');
  const otro = summary.find((row) => row.key === `p:${phoneKey('5491100000000')}`);
  assert.equal(juan.paidTotal, 5000);
  assert.equal(juan.signupTotal, 1);
  assert.equal(otro.paid[0].amount, 9000);
  assert.equal(otro.signups.length, 0);
  assert.equal(organizerSlug('Lucía'), 'lucia');
  assert.equal(sameOrganizer('Martín', 'martin'), true);
  assert.deepEqual(organizerNames([]), ['Gustavo', 'Martín']);
  assert.deepEqual(organizerNames([{ name: 'Lucía', createdAt: 2 }, { name: 'lucia', createdAt: 1 }]), ['lucia']);
});

test('organizadores demo: siembra Gustavo y Martín y no duplica', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-org';
  await store.init();
  const seeded = JSON.parse(mem.get('f7c-test-org')).organizers;
  assert.equal(seeded.gustavo.name, 'Gustavo');
  assert.equal(seeded.martin.name, 'Martín');
  const id = await store.addOrganizer(' Lucía ');
  assert.equal(id, 'lucia');
  await assert.rejects(() => store.addOrganizer('lucia'), /lista/);
  await assert.rejects(() => store.addOrganizer('LUCÍA'), /lista/);
  assert.equal(JSON.parse(mem.get('f7c-test-org')).organizers.lucia.name, 'Lucía');
});

test('la ficha de confirmación no lleva teléfono', () => {
  const rec = confirmationRecord({
    playerId: 'p1',
    player: { matchId: '2026-10-22_2100', name: 'Juan Pérez', phone: '5491112345678', confirmed: 'si', confirmedAt: 5 },
    match: { id: '2026-10-22_2100', date: '2026-10-22', time: '21:00', note: 'Cancha 2' },
  });
  assert.equal('phone' in rec, false);
  assert.equal(JSON.stringify(rec).includes('549'), false);
  assert.equal(rec.playerId, 'p1');
  assert.equal(rec.name, 'Juan Pérez');
  assert.equal(rec.confirmed, 'si');
  assert.equal(rec.date, '2026-10-22');
});

test('en demo, cobrar no borra el sí de la ficha', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-confirm';
  await store.init();
  const mid = await store.addMatch({ date: '2026-10-20', time: '20:00', note: '' }, 'Gustavo');
  const pid = await store.addPlayer({ id: mid, date: '2026-10-20', capacity: 14 }, { name: 'Juan Pérez', phone: '5491112345678' }, 'Gustavo');
  const db = JSON.parse(mem.get('f7c-test-confirm'));
  const token = db.players[pid].confirmToken;
  db.confirmations[token].confirmed = 'si';
  db.confirmations[token].confirmedAt = 9;
  db.players[pid].confirmed = null;
  mem.set('f7c-test-confirm', JSON.stringify(db));
  let seen = null;
  store.subscribe((snap) => { seen = snap; });
  await store.setPayment(pid, { paid: true, amount: 5000, method: 'efectivo', receivedBy: 'Gustavo' }, 'Gustavo');
  const after = JSON.parse(mem.get('f7c-test-confirm'));
  assert.equal(after.confirmations[token].confirmed, 'si');
  assert.equal(after.confirmations[token].confirmedAt, 9);
  assert.equal(seen.players.find((p) => p.id === pid).confirmed, 'si');
});

test('el organizador no reescribe la respuesta al actualizar la ficha', () => {
  const idn = confirmationIdentity({
    playerId: 'p1',
    player: { matchId: '2026-10-20_2000', name: 'Juan Pérez', confirmed: null, confirmedAt: null, phone: '5491112345678' },
    match: { id: '2026-10-20_2000', date: '2026-10-20', time: '20:00', note: '' },
  });
  assert.equal('confirmed' in idn, false);
  assert.equal('confirmedAt' in idn, false);
  assert.equal('phone' in idn, false);
  assert.equal(idn.name, 'Juan Pérez');
  assert.equal(idn.date, '2026-10-20');
  assert.equal(idn.note, '');
  assert.equal(idn.cancelled, false);
  assert.equal(idn.notes, '');
  const cancelled = confirmationIdentity({
    playerId: 'p1',
    player: { matchId: 'm', name: 'Juan Pérez' },
    match: { id: 'm', date: '2026-10-20', time: '20:00', cancelled: true, notes: 'Lluvia' },
  });
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.notes, 'Lluvia');
  assert.equal('confirmed' in cancelled, false);
});

test('el sí de la ficha gana y un sí viejo no se borra si la ficha no contestó', () => {
  const players = [
    { id: 'a', confirmToken: 't-a', confirmed: null },
    { id: 'b', confirmToken: 't-b', confirmed: 'si' },
    { id: 'c', confirmToken: 't-c', confirmed: null },
  ];
  const cards = [
    { id: 't-a', playerId: 'a', confirmed: 'si', confirmedAt: 3 },
    { id: 'stale', playerId: 'b', confirmed: 'no' },
    { id: 't-b', playerId: 'b', confirmed: null },
    { id: 't-c', playerId: 'other', confirmed: 'no', confirmedAt: 4 },
  ];
  const out = overlayConfirmations(players, cards);
  assert.equal(out[0].confirmed, 'si');
  assert.equal(out[0].confirmedAt, 3);
  assert.equal(out[1].confirmed, 'si');
  assert.equal(out[2].confirmed, 'no');
  assert.equal(out[2].confirmedAt, 4);
});

test('tamaño de texto: Normal es el default y hay cinco pasos', () => {
  assert.deepEqual(TEXT_SIZES.map((s) => s.label), ['Chica', 'Normal', 'Grande', 'Muy grande', 'Enorme']);
  assert.equal(TEXT_SIZES[TEXT_SIZE_DEFAULT].label, 'Normal');
  assert.equal(TEXT_SIZES[TEXT_SIZE_DEFAULT].px, 18);
  assert.equal(TEXT_SIZES[0].px, 16);
  assert.equal(TEXT_SIZES[4].px, 24);
  assert.equal(textSizeIndex(null), TEXT_SIZE_DEFAULT);
  assert.equal(textSizeIndex('4'), 4);
  assert.equal(textSizeIndex('9'), TEXT_SIZE_DEFAULT);
  assert.equal(textSizeIndex('-1'), TEXT_SIZE_DEFAULT);
});

test('el placeholder no habilita al admin y el mail se compara sin mayúsculas', () => {
  assert.equal(adminEmailConfigured('TU_EMAIL_ADMIN'), false);
  assert.equal(adminEmailConfigured(''), false);
  assert.equal(sameAdminEmail('gustavo@ejemplo.com', 'TU_EMAIL_ADMIN'), false);
  assert.equal(sameAdminEmail('Gustavo@Ejemplo.com', 'gustavo@ejemplo.com'), true);
  assert.equal(sameAdminEmail('otro@ejemplo.com', 'gustavo@ejemplo.com'), false);
  assert.equal(sameAdminEmail('Gustavof.Arg@gmail.com'), true);
  assert.equal(sameAdminEmail('otro@gmail.com'), false);
});

test('demo: login, alta de organizador, desactivar y borrar', () => {
  const db = seedDemoAuth(emptyAuthDb());
  assert.equal(loginDemo(db, 'gustavo@demo.local', 'no-es').ok, false);
  const admin = loginDemo(db, 'Gustavo@demo.local', 'demo-gustavo');
  assert.equal(admin.ok, true);
  assert.equal(admin.session.role, 'admin');
  assert.equal(admin.session.name, 'Gustavo');
  assert.equal(admin.session.password, undefined);
  const created = createOrganizerDemo(db, admin.session, { name: 'Lucía', email: 'Lucia@demo.local', password: 'secreto', role: 'admin' });
  assert.equal(created.ok, true);
  assert.equal(db.users[created.uid].role, 'organizer');
  assert.equal(createOrganizerDemo(db, admin.session, { name: 'Otra', email: 'lucia@demo.local', password: 'secreto2' }).ok, false);
  const martin = loginDemo(db, 'martin@demo.local', 'demo-martin').session;
  assert.match(createOrganizerDemo(db, martin, { name: 'X', email: 'x@demo.local', password: 'secreto' }).error, /administrador/);
  assert.equal(setOrganizerActiveDemo(db, admin.session, created.uid, false).ok, true);
  assert.equal(loginDemo(db, 'lucia@demo.local', 'secreto').error, 'Esta cuenta está desactivada.');
  assert.equal(deleteOrganizerDemo(db, martin, created.uid).ok, false);
  assert.equal(deleteOrganizerDemo(db, admin.session, 'gustavo').ok, false);
  assert.equal(deleteOrganizerDemo(db, admin.session, created.uid).ok, true);
  assert.equal(loginDemo(db, 'lucia@demo.local', 'secreto').ok, false);
  assert.equal(loginDemo(db, 'martin@demo.local', 'demo-martin').session.role, 'organizer');
});

test('Mis y totales por organizador', () => {
  const players = [
    { addedBy: 'Gustavo', paid: true, amount: 5000, receivedBy: 'Martín' },
    { addedBy: 'Martín', paid: false, amount: null, receivedBy: null },
    { addedBy: 'Gustavo', paid: true, amount: 1000, receivedBy: '' },
  ];
  const mine = mineSummary(players, 'martín');
  assert.equal(mine.added, 1);
  assert.equal(mine.amount, 5000);
  assert.equal(mine.text, 'Anotaste 1 · Cobraste $5.000');
  const totals = organizerTotals(players);
  assert.equal(totals.find((row) => row.name === 'Martín').collected, 5000);
  assert.equal(totals.find((row) => row.name === 'Martín').added, 1);
  assert.equal(totals.find((row) => row.name === 'Gustavo').added, 2);
  assert.equal(totals.find((row) => row.name === 'Sin especificar').collected, 1000);
});

test('cada parte del pago va a su organizador', () => {
  const now = 1_700_000_000_000;
  const legacy = { paid: true, amount: 5000, method: 'transferencia', receivedBy: 'Martín' };
  assert.deepEqual(paymentShares(legacy).map((share) => [share.kind, share.name, share.amount]), [['transfer', 'Martín', 5000]]);
  const directed = paymentRecord({
    paid: true, cash: 2000, transfer: 3000, pendingTransfer: 800,
    cashTo: 'Gustavo', transferTo: 'Martín', pendingTo: 'Lucía',
  }, 'Gustavo', now);
  assert.equal(directed.ok, true);
  assert.equal(directed.patch.receivedBy, null);
  assert.equal(directed.patch.cashTo, 'Gustavo');
  assert.equal(directed.patch.transferTo, 'Martín');
  assert.equal(directed.patch.pendingTo, 'Lucía');
  assert.match(paymentStatusText(directed.patch), /Efectivo \$2\.000 · cobró Gustavo/);
  assert.match(paymentStatusText(directed.patch), /Transferencia \$3\.000 · cobró Martín/);
  assert.match(pendingStatusText(directed.patch), /Transfiere después \$800 · a Lucía/);
  const players = [directed.patch];
  assert.equal(organizerTotals(players).find((row) => row.name === 'Gustavo').collected, 2000);
  assert.equal(organizerTotals(players).find((row) => row.name === 'Martín').collected, 3000);
  assert.equal(organizerTotals(players).find((row) => row.name === 'Lucía').pending, 800);
  assert.equal(mineSummary(players, 'Martín').amount, 3000);
  assert.equal(mineSummary(players, 'Lucía').pending, 800);
  const same = receivePendingTransfer({ ...directed.patch, pendingTo: 'Martín' }, 'Rita', now + 3);
  assert.equal(same.patch.transfer, 3800);
  assert.equal(same.patch.transferTo, 'Martín');
  assert.equal(same.patch.transferParts, null);
  assert.equal(same.patch.pendingTransfer, null);
  assert.equal(same.patch.cashTo, 'Gustavo');
  assert.equal(same.patch.receivedBy, null);
  assert.equal(same.patch.transferReceivedBy, 'Rita');
  const split = receivePendingTransfer(directed.patch, 'Rita', now + 4);
  assert.equal(split.patch.transfer, 3800);
  assert.equal(split.patch.transferTo, null);
  assert.deepEqual(split.patch.transferParts, [{ to: 'Martín', amount: 3000 }, { to: 'Lucía', amount: 800 }]);
  assert.equal(split.patch.cash, 2000);
  assert.equal(split.patch.receivedBy, null);
});

test('los desplegables salen de la colección y solo caen al config si está vacía o no se lee', () => {
  assert.deepEqual(organizerChoices([]), ['Gustavo', 'Martín']);
  assert.deepEqual(organizerChoices([{ name: 'Lucía', createdAt: 1 }], { unreadable: true }), ['Gustavo', 'Martín']);
  assert.deepEqual(organizerChoices([{ name: 'Lucía', createdAt: 1 }]), ['Lucía']);
  assert.deepEqual(organizerChoices([{ name: 'Lucía', createdAt: 1 }], { extra: ['Rita', 'Lucía'] }), ['Lucía', 'Rita']);
  assert.deepEqual(organizerChoices([], { extra: ['Viejo'] }), ['Gustavo', 'Martín', 'Viejo']);
});

test('precios: defaults, enteros y promos del mismo día', () => {
  assert.deepEqual(normalizePrices(null), { matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 });
  assert.deepEqual(normalizePrices({ matchPrice: 1.5, promo2Price: -4, promo3Price: 7000 }), { matchPrice: 5000, promo2Price: 9000, promo3Price: 7000 });
  assert.equal(parsePriceInput('5.000').amount, 5000);
  assert.equal(parsePriceInput('5000').amount, 5000);
  assert.equal(parsePriceInput('5.000,50').ok, false);
  assert.equal(parsePriceInput('-1').ok, false);
  assert.deepEqual(splitEven(9000, 2), [4500, 4500]);
  assert.deepEqual(splitEven(9001, 2), [4501, 4500]);
  assert.deepEqual(splitPaymentAcross({ cash: 9001, transfer: 100, pending: 0 }, 2), [
    { cash: 4501, transfer: 50, pending: 0 },
    { cash: 4500, transfer: 50, pending: 0 },
  ]);
  const matches = [
    { id: 'a', date: '2026-10-22', time: '19:00', startsAt: 1 },
    { id: 'b', date: '2026-10-22', time: '21:00', startsAt: 2 },
    { id: 'c', date: '2026-10-22', time: '22:00', startsAt: 3 },
    { id: 'd', date: '2026-10-23', time: '19:00', startsAt: 4 },
    { id: 'e', date: '2026-10-22', time: '18:00', startsAt: 0 },
  ];
  const phone = '5491111111111';
  const players = [
    { id: 'p1', matchId: 'a', phone, waiting: false },
    { id: 'p2', matchId: 'b', phone, waiting: false },
    { id: 'wait', matchId: 'c', phone, waiting: true },
    { id: 'other', matchId: 'e', phone: '5491122222222', waiting: false },
    { id: 'next', matchId: 'd', phone, waiting: false },
  ];
  const two = promoForPlayer({ player: players[0], players, matches, prices: null });
  assert.equal(two.count, 2);
  assert.equal(two.total, 9000);
  assert.equal(two.share, 4500);
  assert.equal(two.label, 'Promo 2 partidos por $9.000');
  assert.equal(promoForPlayer({ player: players[2], players, matches, prices: null }), null);
  assert.equal(promoForPlayer({ player: players[4], players, matches, prices: null }), null);
  const rosterPlayers = [
    { id: 'r1', matchId: 'a', phone: '', rosterId: 'ros1', waiting: false },
    { id: 'r2', matchId: 'b', phone: '', rosterId: 'ros1', waiting: false },
  ];
  assert.equal(playerPromoKey(rosterPlayers[0]), 'r:ros1');
  assert.equal(promoForPlayer({ player: rosterPlayers[0], players: rosterPlayers, matches, prices: null }).label, 'Promo 2 partidos por $9.000');
  assert.equal(playerPromoKey({ phone: '', name: 'Solo' }), 'n:solo');
  const named = [
    { id: 'n1', matchId: 'a', phone: '', name: 'Ciro Díaz', waiting: false },
    { id: 'n2', matchId: 'b', phone: '', name: 'Ciro Díaz', waiting: false },
  ];
  assert.equal(promoForPlayer({ player: named[0], players: named, matches, prices: null }).label, 'Promo 2 partidos por $9.000');
  assert.equal(promoForPlayer({ player: { id: 'x', matchId: 'a', phone: '' }, players: [{ id: 'x', matchId: 'a', phone: '' }, { id: 'y', matchId: 'b', phone: '' }], matches, prices: null }), null);
  const fourPlayers = ['e', 'a', 'b', 'c'].map((id, i) => ({ id: `f${i}`, matchId: id, phone, waiting: false }));
  const four = promoForPlayer({ player: fourPlayers[0], players: fourPlayers, matches, prices: null });
  assert.equal(four.count, 4);
  assert.equal(four.total, 17000);
  assert.equal(four.label, 'Promo 3 partidos por $12.000');
  assert.equal(four.shares.reduce((sum, n) => sum + n, 0), 17000);
  assert.equal(promoOffer(3, { matchPrice: 4000, promo2Price: 7000, promo3Price: 10000 }).label, 'Promo 3 partidos por $10.000');
  assert.equal(promoOffer(3, { matchPrice: 4000, promo2Price: 7000, promo3Price: 10000 }).total, 10000);
});

test('permisos del partido: todos, solo yo, límite y sin excepción de admin', () => {
  const staff = [
    { uid: 'gustavo', name: 'Gustavo', role: 'admin' },
    { uid: 'martin', name: 'Martín', role: 'organizer' },
  ];
  const open = publicAccess({ uid: 'gustavo', name: 'Gustavo' });
  assert.deepEqual(open.viewers, ['*']);
  assert.equal(isRestricted({ viewers: open.viewers }), false);
  assert.equal(canView({ viewers: ['*'] }, 'martin'), true);
  assert.equal(canView({}, 'martin'), true);
  const solo = buildAccess({
    solo: true,
    viewerIds: ['gustavo', 'martin'],
    adderIds: ['gustavo', 'martin'],
    staff,
    creator: { uid: 'gustavo', name: 'Gustavo' },
  });
  assert.deepEqual(solo.viewers, ['gustavo']);
  assert.deepEqual(solo.adders, ['gustavo']);
  assert.equal(canView(solo, 'gustavo'), true);
  assert.equal(canView(solo, 'admin-uid'), false);
  assert.equal(canAdd(solo, 'martin'), false);
  assert.equal(canDelete(solo, 'admin-uid'), false);
  assert.equal(canDelete(solo, 'gustavo'), true);
  assert.equal(canEditAccess(solo, 'gustavo'), true);
  assert.equal(canEditAccess(solo, 'admin-uid'), false);
  const picked = buildAccess({
    solo: false,
    viewerIds: ['gustavo', 'martin'],
    adderIds: ['gustavo'],
    limits: [{ uid: 'gustavo', max: 2 }, { uid: 'martin', max: 4 }],
    staff,
    creator: { uid: 'gustavo', name: 'Gustavo' },
  });
  assert.deepEqual(picked.viewers, ['*']);
  assert.deepEqual(picked.adders, ['gustavo']);
  assert.equal(canView(picked, 'martin'), true);
  assert.equal(canAdd(picked, 'martin'), false);
  assert.equal(limitFor(picked, 'gustavo'), 2);
  assert.equal(limitFor(picked, 'martin'), null);
  const players = [
    { addedBy: 'Gustavo', addedByUid: 'gustavo', waiting: false },
    { addedBy: 'Gustavo', waiting: true },
  ];
  assert.equal(addedCount(players, { uid: 'gustavo', name: 'Gustavo' }), 2);
  assert.equal(limitMessage(2), 'Llegaste a tu límite de 2 jugadores en este partido');
  const openLimits = buildAccess({
    solo: false,
    viewerIds: ['gustavo', 'martin'],
    adderIds: ['gustavo', 'martin'],
    limits: [{ uid: 'gustavo', max: null }, { uid: 'martin', max: '' }],
    staff,
    creator: { uid: 'gustavo', name: 'Gustavo' },
  });
  assert.deepEqual(openLimits.limits, []);
  assert.equal(limitFor(openLimits, 'gustavo'), null);
});

test('sin WhatsApp el perfil agrupa por plantel o por nombre', () => {
  const matches = [
    { id: 'viejo', date: '2026-10-15', time: '21:00', startsAt: Date.parse('2026-10-15T21:00:00-03:00') },
    { id: 'nuevo', date: '2026-10-22', time: '21:00', startsAt: Date.parse('2026-10-22T21:00:00-03:00') },
  ];
  const players = [
    { id: 'a', matchId: 'viejo', name: 'Ciro Díaz', phone: '', rosterId: 'ros-ciro', waiting: false, paid: true, amount: 5000, receivedBy: 'Gustavo', addedBy: 'Martín' },
    { id: 'b', matchId: 'nuevo', name: 'Ciro Díaz', phone: '', rosterId: 'ros-ciro', waiting: false, addedBy: 'Martín' },
    { id: 'c', matchId: 'nuevo', name: 'Ciro Díaz', phone: '', waiting: false, addedBy: 'Gustavo' },
    { id: 'd', matchId: 'nuevo', name: 'Otro', phone: '', waiting: false, paid: true, amount: 1000, receivedBy: 'Martín', addedBy: 'Martín' },
  ];
  const person = { id: 'ros-ciro', phone: '', name: 'Ciro Díaz' };
  assert.equal(playerMatchesPerson(players[0], person), true);
  assert.equal(playerMatchesPerson(players[2], person), true);
  assert.equal(playerMatchesPerson({ name: 'Ciro Díaz', phone: '', rosterId: 'otro' }, person), false);
  assert.equal(playerMatchesPerson(players[3], person), false);
  assert.equal(playerMatchesPerson({ name: 'Ciro Díaz', phone: '' }, { id: '', phone: '', name: 'Ciro Díaz' }), true);
  assert.equal(playerMatchesPerson({ name: 'Ciro Díaz', phone: '5491111111111' }, { id: '', phone: '', name: 'Ciro Díaz' }), false);
  const stats = playerStats({ rosterId: 'ros-ciro', name: 'Ciro Díaz', players, matches, now: Date.parse('2026-10-19T13:00:00-03:00') });
  assert.equal(stats.played, 1);
  assert.equal(playerRecord({ rosterId: 'ros-ciro', players, matches }).paidTotal, 5000);
  const ledger = paymentLedger({ rosterId: 'ros-ciro', name: 'Ciro Díaz', players, matches });
  assert.equal(ledger.total, 5000);
  assert.equal(signupLedger({ name: 'Otro', players }).total, 1);
  const signup = matchSignupState({ rosterId: 'ros-ciro', name: 'Ciro Díaz', match: matches[1], players });
  assert.equal(signup.state, 'anotado');
  const other = matchSignupState({ name: 'Libre', match: matches[1], players });
  assert.equal(other.existing, false);
  const summary = paymentsSummary({ players, roster: [{ id: 'ros-ciro', name: 'Ciro Díaz', phone: '' }] });
  const ciro = summary.find((row) => row.name === 'Ciro Díaz');
  assert.equal(ciro.rosterId, 'ros-ciro');
  assert.equal(ciro.paidTotal, 5000);
});

test('hoy sigue en la lista todo el día y lo anterior va al historial', () => {
  const now = Date.parse('2026-10-19T13:00:00-03:00');
  const matches = [
    { id: 'viejo', date: '2026-10-12', time: '19:00' },
    { id: 'ayer', date: '2026-10-18', time: '21:00' },
    { id: 'hoy-temprano', date: '2026-10-19', time: '10:00' },
    { id: 'hoy-noche', date: '2026-10-19', time: '21:00' },
    { id: 'cancelado', date: '2026-10-20', time: '18:00', cancelled: true },
    { id: 'manana', date: '2026-10-20', time: '19:00' },
  ];
  assert.deepEqual(currentMatches(matches, now).map((match) => match.id), ['hoy-temprano', 'hoy-noche', 'cancelado', 'manana']);
  assert.deepEqual(pastMatches(matches, now).map((match) => match.id), ['ayer', 'viejo']);
  assert.deepEqual(upcomingMatches(matches, now).map((match) => match.id), ['hoy-noche', 'manana']);
});

test('equipos: toque, azar, baja y mensaje', () => {
  const main = ['ana', 'beto'];
  let teams = cyclePlayer({ bib: [], plain: [] }, 'ana', main);
  assert.deepEqual(teams, { bib: ['ana'], plain: [] });
  teams = cyclePlayer(teams, 'ana', main);
  assert.deepEqual(teams, { bib: [], plain: ['ana'] });
  teams = cyclePlayer(teams, 'ana', main);
  assert.deepEqual(teams, { bib: [], plain: [] });
  assert.deepEqual(cyclePlayer(teams, 'espera', main), { bib: [], plain: [] });
  assert.deepEqual(normalizeTeams({ bib: ['ana', 'espera', 'ana'], plain: ['ana', 'beto'] }, main), { bib: ['ana'], plain: ['beto'] });
  assert.equal(teamsBalance({ bib: ['a'], plain: ['b'] }).balanced, true);
  assert.equal(teamsBalance({ bib: ['a', 'b'], plain: ['c'] }).balanced, false);
  assert.deepEqual(shuffleTeams(['a', 'b', 'c'], () => 0.999), { bib: ['a', 'b'], plain: ['c'] });
  const dropped = dropPlayer({ bib: ['ana', 'beto'], plain: [] }, 'beto');
  assert.equal(dropped.changed, true);
  assert.deepEqual(dropped.teams, { bib: ['ana'], plain: [] });
  assert.equal(dropPlayer({ bib: ['ana'], plain: [] }, 'otro').changed, false);
  const msg = teamsMessage({
    when: 'Martes 20/10 · 21:00 hs',
    venue: 'Polideportivo Colegiales',
    players: [{ id: 'ana', name: 'Ana' }, { id: 'beto', name: 'Beto' }],
    teams: { bib: ['ana'], plain: ['beto'] },
  });
  assert.match(msg, /Con pechera \(1\)/);
  assert.match(msg, /1\. Ana/);
  assert.match(msg, /Sin pechera \(1\)/);
  assert.match(msg, /1\. Beto/);
  assert.deepEqual(teamsRecord({ bib: ['ana'], plain: ['ana'] }).teams, { bib: ['ana'], plain: [] });
});

test('cancelar no arma recordatorio y el mensaje no lleva link', () => {
  const match = { id: 'm', date: '2026-10-26', time: '21:00', cancelled: true, notes: 'Lluvia' };
  const start = toEpoch(match.date, match.time);
  const players = [{ id: 'p1', name: 'Teo', phone: '5491166662222' }];
  assert.equal(needsReminderBanner(match, players, start - 60_000), false);
  assert.deepEqual(matchesCrossingReminderWindow([match], start - 3 * 3600e3, start - 60_000), []);
  const text = cancelMessage({ player: players[0], match, venue: 'Polideportivo Colegiales' });
  assert.match(text, /Hola Teo, se canceló/);
  assert.match(text, /Motivo: Lluvia/);
  assert.equal(text.includes('confirmar.html'), false);
  const links = cancelLinks({ match, players: [...players, { id: 'p2', name: 'Sin', phone: '' }], venue: 'Polideportivo Colegiales' });
  assert.equal(links.length, 1);
  assert.match(links[0].waUrl, /^https:\/\/wa\.me\/5491166662222\?text=/);
  assert.equal(decodeURIComponent(links[0].waUrl).includes('confirmar.html'), false);
});

test('con jugadores no se borra, el contador sigue y las notas quedan en la ficha', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-cancel';
  await store.init();
  const empty = await store.addMatch({ date: '2026-11-02', time: '18:00', note: '' }, 'Gustavo');
  assert.equal(JSON.parse(mem.get('f7c-test-cancel')).matches[empty].playerCount, 0);
  await store.deleteMatch(empty);
  assert.equal(JSON.parse(mem.get('f7c-test-cancel')).matches[empty], undefined);
  const mid = await store.addMatch({ date: '2026-10-26', time: '21:00', note: '' }, 'Gustavo');
  const main = await store.addPlayer({ id: mid, date: '2026-10-26', capacity: 14 }, { name: 'Teo', phone: '5491166662222' }, 'Gustavo');
  await store.addPlayer({ id: mid, date: '2026-10-26', capacity: 14 }, { name: 'Espera', phone: '' }, 'Gustavo', { waiting: true });
  let db = JSON.parse(mem.get('f7c-test-cancel'));
  assert.equal(db.matches[mid].playerCount, 2);
  await assert.rejects(() => store.deleteMatch(mid), (err) => err.code === 'has-players');
  await store.deletePlayer(main);
  assert.equal(JSON.parse(mem.get('f7c-test-cancel')).matches[mid].playerCount, 1);
  const long = 'x'.repeat(2500);
  await store.updateMatch(mid, { cancelled: true, cancelledAt: 5, cancelledBy: 'gustavo', notes: long }, 'Gustavo');
  db = JSON.parse(mem.get('f7c-test-cancel'));
  assert.equal(db.matches[mid].cancelled, true);
  assert.equal(db.matches[mid].notes.length, 2000);
  assert.equal(db.matches[mid].playerCount, 1);
  const card = Object.values(db.confirmations).find((item) => item.matchId === mid);
  assert.equal(card.cancelled, true);
  assert.equal(card.notes.length, 2000);
  assert.equal('phone' in card, false);
  await store.updateMatch(mid, { cancelled: false }, 'Gustavo');
  db = JSON.parse(mem.get('f7c-test-cancel'));
  assert.equal(db.matches[mid].cancelled, false);
  assert.equal(db.matches[mid].cancelledAt, null);
  assert.equal(db.matches[mid].notes.length, 2000);
  assert.equal(Object.values(db.confirmations).find((item) => item.matchId === mid).cancelled, false);
});

test('sha256 y privacidad del WhatsApp: el otro organizador no ve el número', async () => {
  assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  assert.equal(phoneKey(''), '');
  assert.equal(phoneKey('11 1234-5678'), phoneKey('5491112345678'));
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-privacy';
  store.setActor({ uid: 'gustavo', name: 'Gustavo' });
  const mid = await store.addMatch({ date: '2026-10-22', time: '21:00', note: '' }, 'Gustavo');
  const pid = await store.addPlayer({ id: mid, date: '2026-10-22', capacity: 14 }, { name: 'Juan Pérez', phone: '5491112345678' }, 'Gustavo');
  const raw = JSON.parse(mem.get('f7c-test-privacy'));
  assert.equal(raw.players[pid].phone, undefined);
  assert.equal(raw.players[pid].hasPhone, true);
  assert.equal(raw.contacts.players[pid].phone, '5491112345678');
  assert.equal(raw.contacts.players[pid].ownerUid, 'gustavo');
  assert.equal(raw.contacts.players[pid].visibleToAll, false);
  assert.equal(raw.players[pid].phoneKey, phoneKey('5491112345678'));
  let seen = null;
  store.subscribe((snap) => { seen = snap; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(seen.players.find((p) => p.id === pid).phone, '5491112345678');
  store.setActor({ uid: 'martin', name: 'Martín' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const hidden = seen.players.find((p) => p.id === pid);
  assert.equal(hidden.phone, '');
  assert.equal(hidden.phonePrivate, true);
  assert.equal(hidden.hasPhone, true);
  store.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  const rosterId = await store.addRoster({ name: 'Juan Pérez', phone: '5491112345678' }, 'Gustavo');
  await store.setPhoneShared({ rosterId }, true);
  store.setActor({ uid: 'martin', name: 'Martín' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(seen.players.find((p) => p.id === pid).phone, '5491112345678');
  assert.equal(seen.roster.find((r) => r.id === rosterId).phone, '5491112345678');
  const withKey = { phoneKey: phoneKey('5491112345678'), phone: '' };
  const withPhone = { phone: '5491112345678' };
  assert.equal(playerMatchesPerson(withKey, { id: 'ros', phone: '11 1234-5678', name: 'Juan' }), true);
  assert.equal(playerPromoKey(withKey), playerPromoKey(withPhone));
  assert.equal(playerPromoKey({ phone: '', rosterId: 'ros1' }), 'r:ros1');
  assert.equal(playerPromoKey({ phone: '', name: 'Solo' }), 'n:solo');
  assert.equal(phoneIdentity(withKey), phoneIdentity(withPhone));
  assert.equal(rosterHit({ name: 'Juan', phone: '', phoneKey: phoneKey('5491112345678') }, '1234'), false);
});

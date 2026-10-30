import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseMatchesFromText as p, parsePlayedMatchesFromText } from '../js/parser.js';
import { normalizePhone, waLink, waSendUrl } from '../js/phone.js';
import { allocateAcrossDebts, collectedLine, formatARS, parseAmount, paymentFailureText, paymentParts, paymentRecord, paymentShares, paymentStatusText, pendingStatusText, receivePendingTransfer, settleOldestDebts, settlementSummary, splitLeftoverCredit, writePaymentsInOrder } from '../js/payments.js';
import { FirebaseStore, createDemoStore, listenDeniedPlan, mergeDocsById } from '../js/store.js';
import { moveWaiting, nextWaitOrder, overflowPatches, rosterSplit, sortWaiting } from '../js/waiting.js';
import { cleanShortName, displayName, fullNameBehind, nickOf, personKey, phoneIdentity, playerMatchesPerson, rosterForOrganizer, rosterHit, rosterInMatchMessage, rosterMatchCount, searchRoster } from '../js/roster.js';
import { GUEST_CANNOT_INVITE, alreadyInMatch, firstDuplicate, groupByInviter, inviteBlock, isAutoGuestName, placeGroup, resolveFriendNames, rootInviterId, sameDayPromoGuestRenames, waitWarning } from '../js/guests.js';
import { phoneKey, sha256Hex } from '../js/privacy.js';
import { HISTORY_PAGE, currentMatches, filterLevelTyping, formatLevel, historyBounds, historyWindow, keptSignupIds, matchAlreadyPlayed, matchQueryPlan, matchSignupState, parseLevel, pastMatches, playerRecord, playerStats, sortedNotes, splitNear, stepLevel, storedLevel, upcomingMatches } from '../js/profile.js';
import { addedByOrganizer, amountOwed, mineSummary, monthLabel, organizerMatchDebt, organizerTotals, owesOrganizer, paymentLedger, paymentsSummary, pendingTransfers, playerDebt, signupLedger } from '../js/ledger.js';
import { canOfferCredit, creditAgainstDebts, creditBalance, creditBalances, creditDocId, creditLine, creditLoadSummary, creditPanelRows, nextCredit } from '../js/credit.js';
import { organizerChoices, organizerNames, organizerSlug, sameOrganizer } from '../js/organizers.js';
import { EDIT_LOCK_TEXT, canEditPlayer, canEditRoster } from '../js/edit-lock.js';
import { normalizePrices, parsePriceInput, playerPromoKey, priceOfMatch, promoForPlayer, promoOffer, splitEven, splitPaymentAcross } from '../js/prices.js';
import { addDays, numericDate, shortHour, toEpoch } from '../js/dates.js';
import { capacityFor, cleanCourt, courtLabel, defaultVenueId, filterHistoryByVenues, footballLabel, footballPhrase, historyVenueOptions, matchCapacity, matchSize, matchVenueId, perTeamOf, venueChoices, venueLabel } from '../js/venues.js';
import {
  cancelLinks, cancelMessage, confirmPageUrl, confirmStatus, confirmSummary, confirmationAllowed, confirmationIdentity, confirmationRecord, matchesCrossingReminderWindow,
  needsReminderBanner, newConfirmToken, overlayConfirmations, playersForOrganizer, promotionMessage, reminderLinks, reminderMessage,
  reservationClearedByAnswer, waReminderUrl, withinReminderWindow,
} from '../js/reminders.js';
import { confirmTarget, isShortCode, newShortCode, shortConfirmUrl } from '../js/short.js';
import { acceptedExternalShort, shortenExternal } from '../js/shorten.js';
import { TEXT_SIZE_DEFAULT, TEXT_SIZES, indexFromStored, readTextSize, stepTextSize, textSizeIndex } from '../js/text-size.js';
import { addedCount, buildAccess, canAdd, canDelete, canEditAccess, canView, isRestricted, limitFor, limitMessage, publicAccess } from '../js/access.js';
import { balanceTeams, bumpGoals, bumpScore, cyclePlayer, dropPlayer, dropPlayerOn, goaliesLeft, movePlayer, nextInGoalAt, normalizeScore, normalizeTeams, orderByGoal, orderTeamsByGoal, scoreLine, shuffleTeams, teamsBalance, teamsMessage, teamsRecord } from '../js/teams.js';
import { APP_INSTALL_URL, appShareMessage } from '../js/share.js';
import {
  adminEmailConfigured, createOrganizerDemo, deleteOrganizerDemo, emptyAuthDb, loginDemo,
  sameAdminEmail, seedDemoAuth, setOrganizerActiveDemo,
} from '../js/auth.js';
import { BACKUP_LOADED_OK, BACKUP_WRITE_BATCH, backupFilename, backupProgressText, backupReadError, backupSurfaceMessage, backupWriteError, buildBackup, parseBackup } from '../js/backup.js';
import { DRIVE_FOLDER, DRIVE_SCOPE, driveClientId, ensureBackupFolder, forgetDriveToken, multipartBody, requestDriveToken, shareableBackupName, uploadBackupToDrive } from '../js/drive.js';

// Referencia: lunes 19/10/2026 13:00 en Buenos Aires
const now = new Date('2026-10-19T13:00:00-03:00');
const dt = (r) => r.map((x) => `${x.date} ${x.time}`);

test('fecha numérica dd/mm/aaaa', () => {
  assert.equal(numericDate('2023-12-12'), '12/12/2023');
  assert.equal(numericDate('2026-10-08'), '08/10/2026');
  assert.equal(numericDate(''), '');
});

test('hora corta de la lista', () => {
  assert.equal(shortHour('20:00'), '20hs');
  assert.equal(shortHour('09:00'), '9hs');
  assert.equal(shortHour('19:30'), '19:30hs');
  assert.equal(shortHour(''), '');
  assert.equal(shortHour('25:00'), '');
});

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

test('WhatsApp: siempre wa.me, sin package', () => {
  assert.equal(waLink('5491112345678', 'Hola'), 'https://wa.me/5491112345678?text=Hola');
  assert.equal(waSendUrl({ phone: '5491112345678', text: 'Hola', choice: 'business', android: true }), 'https://wa.me/5491112345678?text=Hola');
  assert.equal(waSendUrl({ phone: '5491112345678', text: 'Hola Juan', choice: 'whatsapp', android: true }), 'https://wa.me/5491112345678?text=Hola%20Juan');
  assert.equal(waSendUrl({ text: 'Lista', choice: 'ask', android: true }), 'https://wa.me/?text=Lista');
  const url = waSendUrl({ phone: '5491112345678', text: 'Hola', choice: 'business', android: true });
  assert.equal(url.includes('package='), false);
  assert.equal(url.startsWith('intent://'), false);
});

test('un pago partido se escribe de a un jugador y el error nombra el documento', async () => {
  const seen = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const pending = writePaymentsInOrder([{ id: 'host' }, { id: 'guest' }], async (entry) => {
    seen.push('start:' + entry.id);
    if (entry.id === 'host') await gate;
    seen.push('end:' + entry.id);
    if (entry.id === 'guest') throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  });
  assert.deepEqual(seen, ['start:host']);
  release();
  await assert.rejects(pending, (error) => {
    assert.equal(error.playerId, 'guest');
    assert.equal(error.paymentWrite, true);
    assert.equal(error.code, 'permission-denied');
    assert.equal(paymentFailureText(error, error.playerId), 'No se pudo guardar el pago en players/guest (permission-denied).');
    assert.equal(/volver a publicar firestore\.rules/i.test(paymentFailureText(error, error.playerId)), false);
    return true;
  });
  assert.deepEqual(seen, ['start:host', 'end:host', 'start:guest', 'end:guest']);
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const store = readFileSync(new URL('../js/store.js', import.meta.url), 'utf8');
  assert.equal(app.includes('Promise.all(jobs)'), false);
  assert.match(app, /Pago dividido/);
  assert.match(app, /writePaymentsInOrder\(entries, \(entry\) => app\.store\.setPayment/);
  assert.match(store, /async _writePayment\(id, patch\)/);
  assert.equal(paymentFailureText(Object.assign(new Error('Poné un monto.'), { code: 'invalid-payment' })), 'Poné un monto.');
});

test('renombrar un invitado de la promo no toca al invitado de otro anfitrión', async () => {
  const phone = (hex) => hex.repeat(32);
  const vinicio = { id: 'v1', name: 'Vinicio', phoneKey: phone('ab'), hasPhone: true, matchId: 'a' };
  const vinicio2 = { id: 'v2', name: 'Vinicio', phoneKey: phone('ab'), hasPhone: true, matchId: 'b' };
  const ernesto = { id: 'e1', name: 'Ernesto', phoneKey: phone('cd'), hasPhone: true, matchId: 'a' };
  const ernesto2 = { id: 'e2', name: 'Ernesto', phoneKey: phone('cd'), hasPhone: true, matchId: 'b' };
  const guestA = { id: 'g1', name: 'Invitado 1', invitedBy: 'v1', matchId: 'a', guestAuto: true };
  const guestB = { id: 'g2', name: 'Invitado 1', invitedBy: 'v2', matchId: 'b', guestAuto: true };
  const otherA = { id: 'o1', name: 'Invitado 1', invitedBy: 'e1', matchId: 'a', guestAuto: true };
  const otherB = { id: 'o2', name: 'Invitado 1', invitedBy: 'e2', matchId: 'b', guestAuto: true };
  const alone = { id: 'g3', name: 'Invitado 1', invitedBy: 'v1', matchId: 'c', guestAuto: true };
  const players = [vinicio, vinicio2, ernesto, ernesto2, guestA, guestB, otherA, otherB, alone];
  const matches = [
    { id: 'a', date: '2026-10-30', time: '19:00' },
    { id: 'b', date: '2026-10-30', time: '21:00' },
    { id: 'c', date: '2026-10-31', time: '19:00' },
  ];
  const targets = sameDayPromoGuestRenames({ player: guestA, newName: 'Pedro', players, matches });
  assert.deepEqual(targets.map((row) => row.id), ['g2']);
  assert.equal(sameDayPromoGuestRenames({ player: otherA, newName: 'Pedro', players, matches }).some((row) => row.id === 'g2'), false);
  assert.deepEqual(sameDayPromoGuestRenames({ player: otherA, newName: 'Luis', players, matches }).map((row) => row.id), ['o2']);
  assert.equal(sameDayPromoGuestRenames({ player: alone, newName: 'Pedro', players, matches }).length, 0);
  assert.equal(promoForPlayer({ player: { ...guestA, name: 'Pedro' }, players: players.map((row) => (row.id === 'g1' || row.id === 'g2' ? { ...row, name: 'Pedro' } : row)), matches, prices: null }).label, 'Promo 2 partidos por $9.000');
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  const oldKey = personKey(guestA, players);
  const newKey = personKey({ ...guestA, name: 'Pedro' }, players.map((row) => (row.id === 'g1' || row.id === 'g2' ? { ...row, name: 'Pedro' } : row)));
  await store.adjustCredit({ personKey: oldKey, organizerUid: 'gustavo', organizerName: 'Gustavo', name: 'Invitado 1', delta: 800 }, 'Gustavo');
  await store.moveCredit(oldKey, newKey, 'Pedro');
  const credits = JSON.parse(mem.get(store.key)).credits;
  assert.equal(Object.values(credits).some((row) => row.personKey === oldKey), false);
  assert.equal(Object.values(credits).find((row) => row.personKey === newKey).amount, 800);
});

test('lo que sobra de un pago dividido queda como saldo de quien paga', () => {
  const one = splitLeftoverCredit({ playerName: 'Juan', cashLeft: 10000, cashTo: 'Gustavo', transferLeft: 0, transferTo: 'Martín' });
  assert.equal(one.length, 1);
  assert.equal(one[0].amount, 10000);
  assert.equal(one[0].name, 'Gustavo');
  assert.equal(one[0].text, 'Sobra $10.000: queda como saldo a favor de Juan con Gustavo.');
  const both = splitLeftoverCredit({ playerName: 'Juan', cashLeft: 3000, cashTo: 'Gustavo', transferLeft: 2000, transferTo: 'Martín' });
  assert.deepEqual(both.map((item) => item.name), ['Gustavo', 'Martín']);
  const same = splitLeftoverCredit({ playerName: 'Ana', cashLeft: 1000, cashTo: 'Gustavo', transferLeft: 500, transferTo: 'gustavo' });
  assert.equal(same.length, 1);
  assert.equal(same[0].amount, 1500);
  assert.equal(splitLeftoverCredit({ playerName: 'Ana', cashLeft: 0, transferLeft: 0 }).length, 0);
});

test('un pago de deudas viejas cancela primero el partido más viejo', () => {
  const debts = [
    { id: 'viejo', label: '01/10 21:00', owed: 5000 },
    { id: 'medio', label: '08/10 21:00', owed: 5000 },
    { id: 'nuevo', label: '15/10 21:00', owed: 5000 },
  ];
  const plan = settleOldestDebts({ cash: 8000, transfer: 4000, debts });
  assert.deepEqual(plan.rows.map((row) => [row.id, row.applied, row.cash, row.transfer]), [
    ['viejo', 5000, 5000, 0],
    ['medio', 5000, 3000, 2000],
    ['nuevo', 2000, 0, 2000],
  ]);
  assert.equal(plan.left, 0);
  assert.equal(settlementSummary(plan.rows), 'Se aplicó $5.000 a 01/10 21:00, $5.000 a 08/10 21:00 y $2.000 a 15/10 21:00');
  const short = settleOldestDebts({ cash: 3000, debts });
  assert.deepEqual(short.rows.map((row) => row.id), ['viejo']);
  assert.equal(short.rows[0].applied, 3000);
});

test('el pago se reparte hasta lo que debe cada uno', () => {
  assert.deepEqual(allocateAcrossDebts(12000, [5000, 5000, 5000]), { parts: [5000, 5000, 2000], left: 0 });
  assert.deepEqual(allocateAcrossDebts(4000, [5000, 5000, 5000]), { parts: [4000, 0, 0], left: 0 });
  assert.deepEqual(allocateAcrossDebts(16000, [4500, 4500]), { parts: [4500, 4500], left: 7000 });
  assert.deepEqual(allocateAcrossDebts(3000, [0, 5000]), { parts: [0, 3000], left: 0 });
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
  assert.equal(collectedLine([{ freePlay: true, paid: true, name: 'Libre' }, juan]), 'Recaudado: $5.000 · 1/1 pagaron · 1 juega gratis');
  assert.equal(paymentStatusText({ freePlay: true, paid: true, amount: 5000 }), 'Juega gratis');
  assert.deepEqual(paymentParts({ freePlay: true, paid: true, cash: 5000 }), { cash: 0, transfer: 0, pending: 0, credit: 0, received: 0, split: false });
  const gratis = paymentRecord({ freePlay: true, paid: true, split: true }, 'Gustavo', 10);
  assert.equal(gratis.ok, true);
  assert.equal(gratis.patch.freePlay, true);
  assert.equal(gratis.patch.paid, true);
  assert.equal(gratis.patch.amount, null);
  assert.equal(gratis.patch.cash, null);
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
  assert.deepEqual(paymentParts(legacy), { cash: 4500, transfer: 0, pending: 0, credit: 0, received: 4500, split: false });
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
  const byName = matchSignupState({
    name: 'Juan Pérez',
    match: matches[1],
    players: [{ id: 'j', matchId: 'jue', name: 'Juan Pérez', phone: '5491112345678', waiting: false }],
  });
  assert.equal(byName.existing, true);
  assert.equal(byName.state, 'anotado');
  const otherPhone = matchSignupState({
    name: 'Juan Pérez',
    phone: '5491100001111',
    match: matches[1],
    players: [{ id: 'j', matchId: 'jue', name: 'Juan Pérez', phone: '5491112345678', waiting: false }],
  });
  assert.equal(otherPhone.existing, false);
});

test('el nivel acepta un solo decimal y lo muestra con coma', () => {
  assert.equal(filterLevelTyping('6,85'), '6,8');
  assert.equal(filterLevelTyping('6.84'), '6.8');
  assert.equal(filterLevelTyping('5,45'), '5,4');
  assert.equal(filterLevelTyping('10,55'), '10,5');
  assert.equal(filterLevelTyping('abc'), '');
  assert.deepEqual(parseLevel('6,8'), { ok: true, level: 6.8 });
  assert.deepEqual(parseLevel('6.7'), { ok: true, level: 6.7 });
  assert.equal(parseLevel('6,85').ok, false);
  assert.equal(parseLevel('0,5').ok, false);
  assert.equal(parseLevel('11').ok, false);
  assert.equal(parseLevel('10').level, 10);
  assert.equal(parseLevel('10,0').level, 10);
  assert.equal(storedLevel(6.85), null);
  assert.equal(storedLevel(6.8), 6.8);
  assert.equal(formatLevel(6.8), '6,8');
  assert.equal(formatLevel(8), '8,0');
  assert.equal(formatLevel(6.85), '');
  assert.equal(stepLevel(null, 1), 1);
  assert.equal(stepLevel(6.8, 1), 7.8);
  assert.equal(stepLevel(10, 1), null);
  assert.equal(stepLevel(1, -1), null);
});

test('no se anota dos veces y Amigo N es de quien invita', () => {
  const mates = [
    { id: 'juan', name: 'Juan Pérez', phone: '5491112345678', rosterId: 'r-juan' },
    { id: 'nico', name: 'Nico', phone: '5491112345678', rosterId: 'r-nico' },
    { id: 'a1', name: 'Amigo 1', invitedBy: 'juan', invitedByName: 'Juan Pérez' },
  ];
  assert.equal(alreadyInMatch(mates, { name: 'juan perez' })?.id, 'juan');
  assert.equal(alreadyInMatch(mates, { name: 'Juan Pérez', phone: '5491199990000' }), null);
  assert.equal(alreadyInMatch(mates, { name: 'Nico', phone: '5491112345678', rosterId: 'r-nico' })?.id, 'nico');
  assert.equal(alreadyInMatch(mates, { name: 'Otra', phone: '5491112345678', rosterId: 'r-otra' }), null);
  assert.equal(alreadyInMatch(mates, { name: 'Amigo 1', guestAuto: true, invitedBy: 'nuevo' }), null);
  assert.equal(alreadyInMatch(mates, { name: 'Amigo 1' })?.id, 'a1');
  assert.equal(alreadyInMatch(mates, { name: 'Pedro', phone: '5491155550181' }, { exceptId: 'a1' }), null);
  assert.equal(alreadyInMatch(mates, { name: 'Juan Pérez' }, { exceptId: 'a1' })?.id, 'juan');
  assert.deepEqual(resolveFriendNames([''], ['Pedro', 'Amigo 2']), [{ name: 'Invitado 3', guestAuto: true }]);
  assert.deepEqual(resolveFriendNames(['', '', ''], []), [
    { name: 'Invitado 1', guestAuto: true },
    { name: 'Invitado 2', guestAuto: true },
    { name: 'Invitado 3', guestAuto: true },
  ]);
  assert.equal(isAutoGuestName('Amigo 2'), true);
  assert.equal(isAutoGuestName('Invitado 1'), true);
  assert.equal(isAutoGuestName('Pedro'), false);
  assert.deepEqual(resolveFriendNames(['Pedro', '', ''], ['Amigo 1']), [
    { name: 'Pedro', guestAuto: false },
    { name: 'Invitado 2', guestAuto: true },
    { name: 'Invitado 3', guestAuto: true },
  ]);
  assert.equal(firstDuplicate(mates, [{ name: 'Pedro' }, { name: 'pedro' }])?.person.name, 'pedro');
  assert.deepEqual(placeGroup({ mainCount: 9, capacity: 10, count: 3 }), { main: 1, wait: 2, spots: 1 });
  assert.equal(waitWarning(1, 2), 'Queda 1 lugar: 2 van a quedar en lista de espera');
  assert.equal(waitWarning(0, 1), 'Quedan 0 lugares: 1 va a quedar en lista de espera');
  assert.equal(waitWarning(4, 0), '');
  const grouped = groupByInviter([
    { id: 'juan', createdAt: 1 },
    { id: 'despues', createdAt: 2 },
    { id: 'a1', invitedBy: 'juan', createdAt: 3 },
  ]);
  assert.deepEqual(grouped.map((player) => player.id), ['juan', 'a1', 'despues']);
  const nested = [
    { id: 'juan', name: 'Juan' },
    { id: 'otro', name: 'Otro' },
    { id: 'b', name: 'Invitado 1', invitedBy: 'juan' },
    { id: 'c', name: 'Nieto', invitedBy: 'b' },
  ];
  assert.deepEqual(groupByInviter(nested).map((player) => player.id), ['juan', 'b', 'c', 'otro']);
  const byId = new Map(nested.map((player) => [player.id, player]));
  assert.equal(rootInviterId(byId.get('c'), byId), 'juan');
  assert.equal(rootInviterId(byId.get('b'), byId), 'juan');
  assert.equal(inviteBlock(nested, 'b'), GUEST_CANNOT_INVITE);
  assert.equal(inviteBlock(nested, 'juan'), '');
  const main = groupByInviter(
    [{ id: 'juan', name: 'Juan' }, { id: 'c', name: 'Nieto', invitedBy: 'b' }],
    [{ id: 'juan', name: 'Juan' }, { id: 'b', name: 'Invitado 1', invitedBy: 'juan', waiting: true }, { id: 'c', name: 'Nieto', invitedBy: 'b' }],
  );
  assert.deepEqual(main.map((player) => player.id), ['juan', 'c']);
  const cycle = groupByInviter([
    { id: 'a', invitedBy: 'b' },
    { id: 'b', invitedBy: 'a' },
  ]);
  assert.deepEqual(cycle.map((player) => player.id), ['a', 'b']);
});

test('el partido rechaza al mismo jugador y guarda al amigo', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  const mid = await store.addMatch({ date: '2026-10-25', time: '19:00', capacity: 10 }, 'Gustavo');
  const match = { id: mid, date: '2026-10-25', capacity: 10 };
  const juan = await store.addPlayer(match, { name: 'Juan Pérez', phone: '' }, 'Gustavo');
  await assert.rejects(() => store.addPlayer(match, { name: 'juan pérez' }, 'Gustavo'), (error) => error.code === 'already-in-match');
  const amigo = await store.addPlayer(match, { name: 'Amigo 1', invitedBy: juan, invitedByName: 'Juan Pérez', guestAuto: true }, 'Gustavo');
  const otro = await store.addPlayer(match, { name: 'Amigo 1', invitedBy: 'otro', invitedByName: 'Pedro', guestAuto: true }, 'Gustavo', { waiting: true });
  await store.setPayment(amigo, { paid: true, amount: 5000, method: 'efectivo' }, 'Gustavo');
  const db = JSON.parse(mem.get('f7c-demo-db'));
  assert.equal(Object.values(db.players).filter((player) => player.matchId === mid && player.name === 'Juan Pérez').length, 1);
  assert.equal(db.players[amigo].invitedBy, juan);
  assert.equal(db.players[amigo].invitedByName, 'Juan Pérez');
  assert.equal(db.players[amigo].paid, true);
  assert.equal(db.players[otro].waiting, true);
  assert.equal(db.players[otro].invitedBy, 'otro');
  await assert.rejects(
    () => store.addPlayer(match, { name: 'Nieto', invitedBy: amigo, invitedByName: 'Amigo 1', guestAuto: true }, 'Gustavo'),
    (error) => error.code === 'guest-cannot-invite' && error.message === GUEST_CANNOT_INVITE,
  );
  const raw = JSON.parse(mem.get('f7c-demo-db'));
  raw.players.nieto = {
    ...raw.players[amigo],
    name: 'Nieto',
    invitedBy: amigo,
    invitedByName: 'Amigo 1',
    guestAuto: true,
    confirmToken: 'tok-nieto',
  };
  delete raw.players.nieto.shortCode;
  mem.set('f7c-demo-db', JSON.stringify(raw));
  store.setActor({ uid: 'gustavo', name: 'Gustavo' });
  await store.updatePlayer('nieto', { name: 'Nieto Real', invitedBy: amigo, invitedByName: 'Amigo 1', guestAuto: true });
  const kept = JSON.parse(mem.get('f7c-demo-db'));
  assert.equal(kept.players.nieto.name, 'Nieto Real');
  assert.equal(kept.players.nieto.invitedBy, amigo);
});

test('editar un amigo guarda nombre y WhatsApp sin soltar a quien invita', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-edit-friend';
  const gustavo = { uid: 'gustavo', name: 'Gustavo' };
  store.setActor(gustavo);
  const mid = await store.addMatch({ date: '2026-10-25', time: '19:00', capacity: 10 }, 'Gustavo');
  const match = { id: mid, date: '2026-10-25', capacity: 10 };
  const juan = await store.addPlayer(match, { name: 'Juan Pérez', phone: '' }, 'Gustavo');
  const amigo = await store.addPlayer(match, { name: 'Amigo 1', invitedBy: juan, invitedByName: 'Juan Pérez', guestAuto: true }, 'Gustavo');
  const sigue = await store.addPlayer(match, { name: 'Amigo 2', invitedBy: juan, invitedByName: 'Juan Pérez', guestAuto: true }, 'Gustavo');
  await store.updatePlayer(juan, { name: 'Juan P.' });
  await store.updatePlayer(amigo, {
    name: 'Pedro',
    phone: '5491155550181',
    phoneShared: false,
    invitedBy: juan,
    invitedByName: 'Juan P.',
    guestAuto: false,
  });
  const db = JSON.parse(mem.get('f7c-test-edit-friend'));
  assert.equal(db.players[amigo].name, 'Pedro');
  assert.equal(db.players[amigo].invitedBy, juan);
  assert.equal(db.players[amigo].invitedByName, 'Juan P.');
  assert.equal(db.players[amigo].guestAuto, false);
  assert.equal(db.players[amigo].addedBy, 'Gustavo');
  assert.equal(db.players[amigo].addedByUid, 'gustavo');
  assert.equal(db.contacts.players[amigo].visibleToAll, false);
  assert.equal(db.contacts.players[amigo].ownerUid, 'gustavo');
  assert.equal(db.contacts.players[amigo].phone, '5491155550181');
  assert.equal(db.players[sigue].name, 'Amigo 2');
  assert.equal(db.players[sigue].guestAuto, true);
  await assert.rejects(
    () => store.updatePlayer(sigue, { name: 'Pedro', guestAuto: false, invitedBy: juan, invitedByName: 'Juan P.' }),
    (error) => error.code === 'already-in-match',
  );
  store.setActor({ uid: 'martin', name: 'Martín' });
  await assert.rejects(() => store.updatePlayer(amigo, { name: 'Otro', phone: '5491155550181' }), /Solo lo puede editar/);
  const after = JSON.parse(mem.get('f7c-test-edit-friend'));
  assert.equal(after.players[amigo].name, 'Pedro');
  assert.equal(after.players[sigue].name, 'Amigo 2');
});

test('renombrar en Jugadores cambia el partido y no reescribe al otro invitado', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-roster-rename';
  const gustavo = { uid: 'gustavo', name: 'Gustavo' };
  const martin = { uid: 'martin', name: 'Martín' };
  store.setActor(gustavo);
  const mid = await store.addMatch({ date: '2026-10-25', time: '19:00', capacity: 10 }, 'Gustavo');
  const match = { id: mid, date: '2026-10-25', capacity: 10 };
  const juan = await store.addPlayer(match, { name: 'Juan Pérez', phone: '' }, 'Gustavo');
  const rosterId = await store.addRoster({ name: 'Amigo 1', phone: '' }, 'Gustavo');
  const amigo = await store.addPlayer(match, { name: 'Amigo 1', rosterId, invitedBy: juan, invitedByName: 'Juan Pérez', guestAuto: true }, 'Gustavo');
  const sigue = await store.addPlayer(match, { name: 'Amigo 2', invitedBy: juan, invitedByName: 'Juan Pérez', guestAuto: true }, 'Gustavo');
  store.setActor(martin);
  const ajeno = await store.addPlayer(match, { name: 'Amigo 1', rosterId, invitedBy: juan, invitedByName: 'Juan Pérez', guestAuto: true }, 'Martín');
  store.setActor(gustavo);
  await store.addPlayer(match, { name: 'Pedro Real', phone: '' }, 'Gustavo');
  await assert.rejects(() => store.updateRoster(rosterId, { name: 'Pedro Real' }), (error) => error.code === 'already-in-match');
  assert.equal(JSON.parse(mem.get('f7c-test-roster-rename')).players[amigo].name, 'Amigo 1');
  await store.updateRoster(rosterId, { name: 'Pedro Invitado' });
  const db = JSON.parse(mem.get('f7c-test-roster-rename'));
  assert.equal(db.roster[rosterId].name, 'Pedro Invitado');
  assert.equal(db.players[amigo].name, 'Pedro Invitado');
  assert.equal(db.players[amigo].invitedBy, juan);
  assert.equal(db.players[amigo].guestAuto, false);
  assert.equal(db.players[sigue].name, 'Amigo 2');
  assert.equal(db.players[ajeno].name, 'Amigo 1');
  await store.setPayment(amigo, { paid: true, amount: 1000, method: 'efectivo' }, 'Gustavo');
  await store.updatePlayer(amigo, { waiting: true, waitOrder: 1, rosterAt: null });
  const waited = JSON.parse(mem.get('f7c-test-roster-rename')).players[amigo];
  assert.equal(waited.waiting, true);
  assert.equal(waited.paid, true);
  assert.equal(waited.name, 'Pedro Invitado');
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
  store.setActor({ uid: 'gustavo', name: 'Gustavo' });
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

test('14 confirmados se ven igual aunque la hora llegue como Timestamp', () => {
  const rows = [];
  for (let i = 0; i < 14; i++) {
    rows.push({
      id: `p${String(i).padStart(2, '0')}`,
      waiting: false,
      createdAt: 1_000 + i,
      rosterAt: 1_000 + i,
      phone: i % 2 ? '5491100000000' : '',
    });
  }
  const gustavo = rows.map((player) => ({ ...player }));
  const martin = rows.map((player) => ({
    ...player,
    phone: '',
    createdAt: { seconds: Math.floor(player.createdAt / 1000), nanoseconds: (player.createdAt % 1000) * 1e6 },
    rosterAt: { toMillis() { return player.rosterAt; } },
  }));
  const seenBy = (list) => rosterSplit(list);
  const left = seenBy(gustavo);
  const right = seenBy(martin);
  assert.equal(left.waiting.length, 0);
  assert.equal(right.waiting.length, 0);
  assert.deepEqual(left.main.map((player) => player.id), right.main.map((player) => player.id));
  assert.deepEqual(overflowPatches(gustavo.slice(0, 12), 14, { expectedCount: 14 }), []);
  assert.deepEqual(overflowPatches(martin.slice(0, 12), 14, { expectedCount: 14 }), []);
  assert.deepEqual(overflowPatches(gustavo, 12).map((player) => player.id), ['p12', 'p13']);
  assert.deepEqual(overflowPatches(martin, 12).map((player) => player.id), ['p12', 'p13']);
  const narrow = gustavo.map((player) => ({ ...player, waiting: false }));
  const broad = gustavo.map((player, index) => ({ ...player, waiting: index >= 12 }));
  const merged = mergeDocsById({ narrow, broad }, ['broad', 'narrow']);
  assert.equal(merged.filter((player) => player.waiting === true).length, 0);
});

test('acortar: spoo.me, da.gd, basura y tiempo', async () => {
  const longUrl = 'https://gustavofarg-hash.github.io/futbol-colegiales/c/?k=Ab3x9Zk2';
  const spooOnly = async (url, init) => {
    assert.equal(String(url), 'https://spoo.me/api/v1/shorten');
    assert.equal(init.method, 'POST');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body), { long_url: longUrl });
    return { json: async () => ({ short_url: 'https://spoo.me/ZXwB0uF' }), text: async () => '' };
  };
  assert.deepEqual(await shortenExternal(longUrl, { fetchImpl: spooOnly, timeoutMs: 40 }), {
    shortUrl: 'https://spoo.me/ZXwB0uF', shortProvider: 'spoo',
  });

  const garbageThenDagd = async (url) => {
    if (String(url).includes('spoo.me')) {
      return { status: 201, json: async () => ({ short_url: 'https://evil.example/phish' }), text: async () => '' };
    }
    assert.match(String(url), /^https:\/\/da\.gd\/s\?url=/);
    return { status: 200, json: async () => ({}), text: async () => 'https://da.gd/jjXrP\n' };
  };
  assert.deepEqual(await shortenExternal(longUrl, { fetchImpl: garbageThenDagd, timeoutMs: 40 }), {
    shortUrl: 'https://da.gd/jjXrP', shortProvider: 'dagd',
  });

  const bothBad = async (url) => {
    if (String(url).includes('spoo.me')) return { json: async () => ({ short_url: 'http://spoo.me/Abc' }), text: async () => '' };
    return { json: async () => ({}), text: async () => 'hola no es un link' };
  };
  assert.equal(await shortenExternal(longUrl, { fetchImpl: bothBad, timeoutMs: 40 }), null);

  const timeoutThenDagd = async (url, init) => {
    if (String(url).includes('spoo.me')) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, 500);
        init.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new DOMException('Aborted', 'AbortError'));
        });
      });
    }
    return { text: async () => 'https://da.gd/jjXrP', json: async () => ({}) };
  };
  const timed = await shortenExternal(longUrl, { fetchImpl: timeoutThenDagd, timeoutMs: 30 });
  assert.equal(timed.shortProvider, 'dagd');
  assert.equal(timed.shortUrl, 'https://da.gd/jjXrP');
  assert.equal(acceptedExternalShort({ shortUrl: 'https://spoo.me/ZXwB0uF', shortProvider: 'dagd' }), null);
  assert.equal(acceptedExternalShort({ shortUrl: 'https://spoo.me/ZXwB0uF/extra', shortProvider: 'spoo' }), null);
  assert.deepEqual(acceptedExternalShort({ shortUrl: 'https://da.gd/jjXrP', shortProvider: 'dagd' }), {
    shortUrl: 'https://da.gd/jjXrP', shortProvider: 'dagd',
  });
});

test('el acortador queda en el link y sobrevive a un guardado', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  const mid = await store.addMatch({ date: '2026-10-23', time: '18:00', note: 'Acortar' }, 'Gustavo');
  const pid = await store.addPlayer({ id: mid, date: '2026-10-23' }, { name: 'Corto Uno', phone: '5491199990001' }, 'Gustavo');
  await store.ensureConfirmToken(pid);
  const code = await store.ensureShortLink(pid);
  assert.equal(isShortCode(code), true);
  assert.equal(await store.readExternalShort(code), null);
  await store.saveExternalShort(code, { shortUrl: 'https://evil.example/x', shortProvider: 'spoo' });
  assert.equal(await store.readExternalShort(code), null);
  await store.saveExternalShort(code, { shortUrl: 'https://spoo.me/ZXwB0uF', shortProvider: 'spoo' });
  const saved = await store.readExternalShort(code);
  assert.equal(saved.shortUrl, 'https://spoo.me/ZXwB0uF');
  assert.equal(saved.shortProvider, 'spoo');
  assert.equal(typeof saved.shortAt, 'number');
  await store.updateMatch(mid, { note: 'otra' }, 'Gustavo');
  assert.equal((await store.readExternalShort(code)).shortUrl, 'https://spoo.me/ZXwB0uF');
  assert.equal(shortConfirmUrl(code).includes(`/c/?k=${code}`), true);
});

test('link corto: código, url y el mismo destino', () => {
  const code = newShortCode();
  assert.equal(code.length, 8);
  assert.equal(isShortCode(code), true);
  assert.equal(isShortCode('corto'), false);
  assert.equal(isShortCode(`${code}x`), false);
  assert.equal(shortConfirmUrl(code), `https://gustavofarg-hash.github.io/futbol-colegiales/c/?k=${code}`);
  const token = 't'.repeat(24);
  const landing = confirmTarget({
    m: '2026-10-22_2100',
    p: 'abc',
    t: token,
    href: 'http://127.0.0.1:18431/confirmar.html',
  });
  assert.equal(landing, `http://127.0.0.1:18431/confirmar.html?m=2026-10-22_2100&p=abc&t=${token}`);
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
  assert.equal(forced.startsWith('https://wa.me/5491112345678?text='), true);
  assert.equal(forced.includes('package='), false);
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
  const cinco = promotionMessage({
    player: { name: 'Juan Pérez' },
    match: { date: '2026-10-22', time: '21:00', perTeam: 5 },
    venue: 'Polideportivo Colegiales',
    confirmUrl: url,
  });
  assert.match(cinco, /en el fútbol 5 en Polideportivo Colegiales/);
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
  assert.equal(links[0].id, 'p1');
  assert.ok(links[0].waUrl.startsWith('https://wa.me/5491112345678?text='));
  const short = 'Ab3x9Zk2';
  const shortLinks = reminderLinks({
    match,
    players: [{ ...players[0], shortCode: short }],
    venue: 'Polideportivo Colegiales',
  });
  assert.equal(shortLinks[0].confirmUrl, `https://gustavofarg-hash.github.io/futbol-colegiales/c/?k=${short}`);
  assert.equal(decodeURIComponent(shortLinks[0].waUrl).includes(token), false);
  assert.equal(decodeURIComponent(shortLinks[0].waUrl).includes(`/c/?k=${short}`), true);
  const businessLinks = reminderLinks({ match, players, venue: 'Polideportivo Colegiales', choice: 'business', android: true });
  assert.equal(businessLinks[0].waUrl.startsWith('https://wa.me/5491112345678?text='), true);
  assert.equal(businessLinks[0].waUrl.includes('package='), false);
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
  assert.deepEqual(searchRoster([{ id: '9', name: 'Ernesto Pereira', shortName: 'Tito' }], 'tito').map((p) => p.name), ['Ernesto Pereira']);
  const owned = [
    { id: 'g', name: 'De Gustavo', createdBy: 'Gustavo', createdByUid: 'gustavo' },
    { id: 'm', name: 'De Martín', createdBy: 'Martín', createdByUid: 'martin' },
    { id: 'old', name: 'Sin dueño' },
  ];
  const gustavo = rosterForOrganizer(owned, { uid: 'gustavo', name: 'Gustavo' }).map((person) => person.name);
  const martin = rosterForOrganizer(owned, { uid: 'martin', name: 'Martín' }).map((person) => person.name);
  assert.deepEqual(gustavo, ['De Gustavo', 'Sin dueño']);
  assert.deepEqual(martin, ['De Martín', 'Sin dueño']);
  assert.deepEqual(searchRoster(rosterForOrganizer(owned, { uid: 'martin', name: 'Martín' }), 'gustavo'), []);
  assert.equal(displayName({ name: 'Ernesto Pereira', rosterId: '9' }, [{ id: '9', name: 'Ernesto Pereira', shortName: 'Tito' }]), 'Tito');
  // El apodo cargado en el jugador del partido manda sobre el de la ficha (Editar jugador).
  assert.equal(displayName({ name: 'Ernesto Pereira', rosterId: '9', shortName: 'Viejo' }, [{ id: '9', name: 'Ernesto Pereira' }]), 'Viejo');
  assert.equal(displayName({ name: 'Ernesto Pereira', rosterId: '9', shortName: 'Ernes' }, [{ id: '9', name: 'Ernesto Pereira', shortName: 'Tito' }]), 'Ernes');
  assert.equal(displayName({ name: 'Ernesto Pereira', rosterId: '9', shortName: '' }, [{ id: '9', name: 'Ernesto Pereira', shortName: 'Tito' }]), 'Tito');
  assert.equal(nickOf({ name: 'Ernesto Pereira', rosterId: '9' }, [{ id: '9', name: 'Ernesto Pereira' }]), '');
  assert.equal(displayName({ name: 'Ernesto Pereira', shortName: 'Tito' }, []), 'Tito');
  // Sin rosterId, el apodo llega por el WhatsApp que coincide con la ficha.
  assert.equal(displayName({ name: 'Facundo Aguirre', phone: '5491127993830' }, [{ id: '7', name: 'Facundo Aguirre', phone: '5491127993830', shortName: 'Facu' }]), 'Facu');
  assert.equal(displayName({ name: 'Facundo Aguirre', rosterId: 'borrado', phone: '5491127993830' }, [{ id: '7', name: 'Facundo A.', phone: '5491127993830', shortName: 'Facu' }]), 'Facu');
  assert.equal(displayName({ name: 'Otro', phone: '5491100000000' }, [{ id: '7', name: 'Facundo Aguirre', phone: '5491127993830', shortName: 'Facu' }]), 'Otro');
  // El nombre completo se muestra al lado solo si en la fila se ve el apodo.
  assert.equal(fullNameBehind({ name: 'Ernesto Pereira', rosterId: '9' }, [{ id: '9', name: 'Ernesto Pereira', shortName: 'Tito' }]), 'Ernesto Pereira');
  assert.equal(fullNameBehind({ name: 'Ernesto Pereira', rosterId: '9' }, [{ id: '9', name: 'Ernesto Pereira' }]), '');
  assert.equal(fullNameBehind({ name: 'Tito', rosterId: '9' }, [{ id: '9', name: 'Tito', shortName: 'tito' }]), '');
  assert.equal(cleanShortName('  Tito   '), 'Tito');
  assert.equal(rosterMatchCount([
    { matchId: 'a', rosterId: '1' },
    { matchId: 'a', rosterId: '1', waiting: true },
    { matchId: 'b', name: 'Luis Gómez', phone: '5491166667777' },
  ], { id: '1', name: 'Luis Gómez', phone: '5491166667777' }), 2);
  assert.equal(rosterMatchCount([], { id: '1', name: 'Luis' }), 0);
  assert.equal(rosterInMatchMessage('Luis Gómez', 1), 'Luis Gómez está anotado en 1 partido. Quitalo de esos partidos antes de borrarlo de Jugadores.');
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
  store.setActor({ uid: 'gustavo', name: 'Gustavo' });
  await store.updateRoster(id, { name: 'Ernesto P.', phone: '5491122223333' });
  assert.equal(JSON.parse(mem.get('f7c-test-roster')).roster[id].name, 'Ernesto P.');
  const matchId = await store.addMatch({ date: '2026-10-27', time: '21:00', capacity: 14 }, 'Gustavo');
  const match = JSON.parse(mem.get('f7c-test-roster')).matches[matchId];
  const playerId = await store.addPlayer({ ...match, id: matchId }, { name: 'Ernesto P.', rosterId: id, phone: '' }, 'Gustavo');
  await store.updateRoster(id, { name: 'Ernesto P.', shortName: 'Tito' });
  const saved = JSON.parse(mem.get('f7c-test-roster'));
  assert.equal(saved.roster[id].shortName, 'Tito');
  assert.equal(saved.players[playerId].shortName, 'Tito');
  await store.updateRoster(id, { shortName: '' });
  const cleared = JSON.parse(mem.get('f7c-test-roster'));
  assert.equal(cleared.roster[id].shortName, undefined);
  assert.equal(cleared.players[playerId].shortName, '');
  // Otro organizador: la ficha no es suya, pero el apodo del jugador en el partido sí.
  store.setActor({ uid: 'martin', name: 'Martín', role: 'organizer' });
  await assert.rejects(() => store.setRosterNick(id, 'Nope'), (error) => error.code === 'edit-locked');
  await store.setPlayerShortName(playerId, '  Ernes ');
  assert.equal(JSON.parse(mem.get('f7c-test-roster')).players[playerId].shortName, 'Ernes');
  // El admin cambia el apodo de una ficha ajena y se copia al partido.
  store.setActor({ uid: 'jefe', name: 'Jefe', role: 'admin' });
  await store.setRosterNick(id, 'Vini');
  const byAdmin = JSON.parse(mem.get('f7c-test-roster'));
  assert.equal(byAdmin.roster[id].shortName, 'Vini');
  assert.equal(byAdmin.players[playerId].shortName, 'Vini');
  await store.setPlayerShortName(playerId, '');
  assert.equal(JSON.parse(mem.get('f7c-test-roster')).players[playerId].shortName, undefined);
  store.setActor({ uid: 'gustavo', name: 'Gustavo' });
  await assert.rejects(() => store.deleteRoster(id), (error) => error.code === 'roster-in-match');
  await store.deletePlayer(playerId);
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

test('tamaño de texto: cuatro pasos menos que 16px, y lo viejo sigue', () => {
  assert.deepEqual(TEXT_SIZES.map((s) => s.label), ['8 px', '10 px', '12 px', '14 px', '16 px', '18 px (normal)', '20 px', '22 px', '24 px']);
  assert.deepEqual(TEXT_SIZES.map((s) => s.px), [8, 10, 12, 14, 16, 18, 20, 22, 24]);
  assert.equal(TEXT_SIZES[TEXT_SIZE_DEFAULT].label, '18 px (normal)');
  assert.equal(TEXT_SIZES[TEXT_SIZE_DEFAULT].px, 18);
  assert.equal(TEXT_SIZES[0].px, 8);
  assert.equal(TEXT_SIZES[4].px, 16);
  for (let i = 1; i < TEXT_SIZES.length; i += 1) assert.equal(TEXT_SIZES[i].px - TEXT_SIZES[i - 1].px, 2);
  assert.equal(textSizeIndex(null), TEXT_SIZE_DEFAULT);
  assert.equal(textSizeIndex('0'), 0);
  assert.equal(textSizeIndex('8'), 8);
  assert.equal(textSizeIndex('9'), TEXT_SIZE_DEFAULT);
  assert.equal(textSizeIndex('-1'), TEXT_SIZE_DEFAULT);
  assert.equal(indexFromStored('0'), 4);
  assert.equal(indexFromStored('1'), TEXT_SIZE_DEFAULT);
  assert.equal(indexFromStored('4'), 8);
  assert.equal(indexFromStored('8'), 0);
  assert.equal(indexFromStored('16'), 4);
  assert.equal(indexFromStored('24'), 8);
  assert.equal(indexFromStored('9'), TEXT_SIZE_DEFAULT);
  assert.equal(indexFromStored(null), TEXT_SIZE_DEFAULT);
  const box = new Map();
  const storage = {
    getItem: (key) => (box.has(key) ? box.get(key) : null),
    setItem: (key, value) => box.set(key, String(value)),
  };
  storage.setItem('f7c-text-size', '1');
  assert.equal(TEXT_SIZES[readTextSize(storage)].px, 18);
  assert.equal(stepTextSize(-1, storage), 4);
  assert.equal(storage.getItem('f7c-text-size'), '16');
  assert.equal(stepTextSize(-4, storage), 0);
  assert.equal(TEXT_SIZES[readTextSize(storage)].px, 8);
  assert.equal(storage.getItem('f7c-text-size'), '8');
  assert.equal(stepTextSize(-1, storage), 0);
  assert.equal(stepTextSize(1, storage), 1);
  assert.equal(storage.getItem('f7c-text-size'), '10');
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

test('la deuda es el precio menos lo cobrado, sin gratis ni cancelados', () => {
  const prices = { matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 };
  const person = { id: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111' };
  const matches = [
    { id: 'corto', date: '2026-10-18', time: '20:00', price: 5000 },
    { id: 'pend', date: '2026-11-02', time: '21:00', price: 8000 },
    { id: 'saldado', date: '2026-10-20', time: '19:30', price: 5000 },
    { id: 'gratis', date: '2026-11-04', time: '21:00', price: 5000 },
    { id: 'cancel', date: '2026-11-05', time: '19:00', price: 5000, cancelled: true },
    { id: 'espera', date: '2026-11-06', time: '18:00', price: 5000 },
    { id: 'viejo', date: '2026-09-01', time: '21:00' },
    { id: 'otro', date: '2026-10-22', time: '21:00', price: 5000 },
  ];
  const players = [
    { matchId: 'corto', rosterId: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111', paid: true, amount: 2000, cash: 2000, transfer: 0, pendingTransfer: 1500 },
    { matchId: 'pend', rosterId: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111', paid: false, cash: 0, transfer: 0, pendingTransfer: 8000 },
    { matchId: 'saldado', rosterId: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111', paid: true, amount: 5000, method: 'efectivo' },
    { matchId: 'gratis', rosterId: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111', freePlay: true, paid: true },
    { matchId: 'cancel', rosterId: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111' },
    { matchId: 'espera', rosterId: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111', waiting: true },
    { matchId: 'viejo', rosterId: 'ros-deuda', name: 'Deuda Díaz', phone: '5491100001111', paid: true, amount: 2000, method: 'transferencia' },
    { matchId: 'otro', name: 'Otro', phone: '5491199999999' },
  ];
  const debt = playerDebt({ person, players, matches, prices });
  assert.equal(debt.total, 14000);
  assert.equal(debt.text, 'Debe en total: $14.000');
  assert.deepEqual(debt.rows.map((row) => row.text), [
    '01/09/2026 · 21hs · $3.000',
    '18/10/2026 · 20hs · $3.000',
    '02/11/2026 · 21hs · $8.000',
  ]);
  assert.equal(playerDebt({ person, players: players.filter((p) => p.matchId === 'saldado'), matches, prices }).text, '');
  const promoMatches = [
    { id: 'p-a', date: '2026-10-22', time: '19:00' },
    { id: 'p-b', date: '2026-10-22', time: '21:00' },
  ];
  const promoPlayers = [
    { id: 'pa', matchId: 'p-a', name: 'Promo Ana', phone: '5491111111111', addedBy: 'Gustavo', addedByUid: 'g' },
    { id: 'pb', matchId: 'p-b', name: 'Promo Ana', phone: '5491111111111', addedBy: 'Gustavo', addedByUid: 'g' },
  ];
  const promoDebt = playerDebt({ person: { name: 'Promo Ana', phone: '5491111111111' }, players: promoPlayers, matches: promoMatches, prices });
  assert.equal(promoDebt.total, 9000);
  assert.deepEqual(promoDebt.rows.map((row) => row.owed), [4500, 4500]);
  const day = [
    { id: 'a', date: '2026-10-18', time: '21:00', price: 5000 },
    { id: 'b', date: '2026-10-18', time: '19:00', price: 5000 },
    { id: 'c', date: '2026-10-18', time: '18:00', price: 5000, cancelled: true },
  ];
  const rows = [
    { id: 'ana', matchId: 'a', name: 'Ana Debe', addedBy: 'Gustavo', addedByUid: 'g' },
    { id: 'beto', matchId: 'a', name: 'Beto Mitad', addedBy: 'Gustavo', addedByUid: 'g', paid: true, amount: 2000, cash: 2000, transfer: 0 },
    { id: 'ajeno', matchId: 'a', name: 'De Martín', addedBy: 'Martín', addedByUid: 'm' },
    { id: 'espera', matchId: 'a', name: 'Espera Fuera', addedBy: 'Gustavo', waiting: true },
    { id: 'gratis', matchId: 'a', name: 'Gratis', addedBy: 'Gustavo', freePlay: true, paid: true },
    { id: 'promo-a', matchId: 'a', name: 'Promo', phone: '5491100009999', addedBy: 'Gustavo', addedByUid: 'g' },
    { id: 'promo-b', matchId: 'b', name: 'Promo', phone: '5491100009999', addedBy: 'Gustavo', addedByUid: 'g', paid: true, amount: 2000, cash: 2000, transfer: 0 },
    { id: 'cancelado', matchId: 'c', name: 'Cancelado', addedBy: 'Gustavo' },
  ];
  const mine = organizerMatchDebt({ match: day[0], players: rows, matches: day, prices, organizer: { uid: 'g', name: 'Gustavo' } });
  assert.equal(mine.total, 12500);
  assert.deepEqual(mine.rows.map((row) => [row.name, row.owed]), [['Ana Debe', 5000], ['Promo', 4500], ['Beto Mitad', 3000]]);
  assert.equal(addedByOrganizer(rows[2], { uid: 'g', name: 'Gustavo' }), false);
  const other = organizerMatchDebt({ match: day[1], players: rows, matches: day, prices, organizer: 'Gustavo' });
  assert.equal(other.total, 2500);
  assert.equal(other.rows[0].owed, 2500);
  assert.equal(organizerMatchDebt({ match: day[2], players: rows, matches: day, prices, organizer: 'Gustavo' }).total, 0);
  assert.equal(amountOwed(rows[1], { players: rows, matches: day, prices }), 3000);
  const switched = [
    { id: 'mio', matchId: 'a', name: 'Anotó Martín', addedBy: 'Martín', addedByUid: 'm', signedUpWith: 'g', signedUpWithName: 'Gustavo' },
    { id: 'suyo', matchId: 'a', name: 'Anotó Gustavo', addedBy: 'Gustavo', addedByUid: 'g', signedUpWith: 'm', signedUpWithName: 'Martín' },
    { id: 'viejo', matchId: 'a', name: 'Sin se anotó', addedBy: 'Gustavo', addedByUid: 'g' },
  ];
  const gustavo = { uid: 'g', name: 'Gustavo' };
  assert.equal(owesOrganizer(switched[0], gustavo), true);
  assert.equal(owesOrganizer(switched[1], gustavo), false);
  assert.equal(owesOrganizer(switched[2], gustavo), true);
  const owned = organizerMatchDebt({ match: day[0], players: switched, matches: day, prices, organizer: gustavo });
  assert.deepEqual(owned.rows.map((row) => row.name), ['Anotó Martín', 'Sin se anotó']);
  assert.equal(owned.total, 10000);
  const mineDebt = playerDebt({
    person: { name: 'Anotó Martín' },
    players: switched,
    matches: day,
    prices,
    organizer: gustavo,
  });
  assert.equal(mineDebt.total, 5000);
  assert.equal(playerDebt({ person: { name: 'Anotó Gustavo' }, players: switched, matches: day, prices, organizer: gustavo }).total, 0);
});

test('el saldo a favor es del jugador con ese organizador', async () => {
  assert.equal(creditDocId('', 'gustavo'), '');
  assert.equal(creditDocId('p:abc', 'gustavo'), 'gustavo__p:abc');
  assert.equal(nextCredit(0, 0).ok, false);
  assert.equal(nextCredit(1000, -1500).error, 'No alcanza el saldo a favor.');
  assert.equal(nextCredit(1000, 500).amount, 1500);
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  await store.adjustCredit({ personKey: 'p:ana', organizerUid: 'gustavo', organizerName: 'Gustavo', name: 'Ana', delta: 2000 }, 'Gustavo');
  await store.adjustCredit({ personKey: 'p:ana', organizerUid: 'martin', organizerName: 'Martín', name: 'Ana', delta: 700 }, 'Martín');
  await store.adjustCredit({ personKey: 'n:otro', organizerUid: 'gustavo', organizerName: 'Gustavo', name: 'Otro', delta: 300 }, 'Gustavo');
  let seen = [];
  store.subscribe((view) => { seen = view.credits; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(creditBalance(seen, 'p:ana', 'gustavo'), 2000);
  assert.equal(creditBalance(seen, 'p:ana', 'martin'), 700);
  assert.equal(creditBalance(seen, 'n:otro', 'gustavo'), 300);
  assert.deepEqual(creditBalances(seen, 'p:ana').map((row) => row.organizerName), ['Gustavo', 'Martín']);
  assert.equal(creditLine({ organizerName: 'Gustavo', amount: 2000 }), 'Saldo a favor con Gustavo: $2.000');
  const realMatch = { viewers: ['*'], adders: ['OLD_FIREBASE_UID'], createdByUid: 'OLD_FIREBASE_UID' };
  const gus = { uid: 'k7xQ2mN9pL4sT8vW1aB3', name: 'Gus', role: 'admin' };
  const martin = { uid: 'martin', name: 'Martín', role: 'organizer' };
  assert.equal(canAdd(realMatch, gus.uid), false);
  assert.equal(canAdd(realMatch, martin.uid), false);
  assert.equal(canOfferCredit(gus), true);
  assert.equal(canOfferCredit(martin), true);
  assert.equal(canOfferCredit({ uid: '', name: '', role: '' }), false);
  assert.equal(creditPanelRows([], 'p:ana', gus)[0].amount, 0);
  assert.equal(creditPanelRows([], 'p:ana', gus)[0].organizerName, 'Gus');
  const summed = creditPanelRows([
    { personKey: 'p:ana', organizerUid: 'martin', organizerName: 'Martín', amount: 700 },
    { personKey: 'r:ana', organizerUid: 'martin', organizerName: 'Martín', amount: 300 },
    { personKey: 'p:ana', organizerUid: gus.uid, organizerName: 'Gus', amount: 2000 },
  ], ['p:ana', 'r:ana'], gus);
  assert.equal(summed[0].organizerUid, gus.uid);
  assert.equal(summed[0].amount, 2000);
  assert.equal(summed.find((row) => row.organizerUid === 'martin').amount, 1000);
  await store.adjustCredit({ personKey: 'p:ana', organizerUid: 'gustavo', organizerName: 'Gustavo', name: 'Ana', delta: -2000 }, 'Gustavo');
  const left = JSON.parse(mem.get(store.key)).credits;
  assert.equal(Object.values(left).some((row) => row.personKey === 'p:ana' && row.organizerUid === 'gustavo'), false);
  const host = { id: 'h', name: 'Vinicio', phoneKey: 'aa'.repeat(32), hasPhone: true };
  const guest = { id: 'g', name: 'Invitado 1', invitedBy: 'h', matchId: 'a' };
  const otherHost = { id: 'e', name: 'Ernesto', phoneKey: 'bb'.repeat(32), hasPhone: true };
  const otherGuest = { id: 'g2', name: 'Invitado 1', invitedBy: 'e', matchId: 'a' };
  const players = [host, guest, otherHost, otherGuest];
  const matches = [{ id: 'a', date: '2026-10-30', time: '21:00' }];
  const debt = playerDebt({
    players, matches, prices: null, key: personKey(guest, players),
  });
  assert.equal(debt.total, 5000);
  assert.equal(playerDebt({ players, matches, prices: null, key: personKey(otherGuest, players) }).rows.length, 1);
  assert.notEqual(personKey(guest, players), personKey(otherGuest, players));
});

test('cargar crédito cancela primero la deuda más vieja y el sobrante queda de saldo', () => {
  const debts = [
    { id: 'a', date: '2026-10-01', owed: 5000, label: '01/10/2026 21hs' },
    { id: 'b', date: '2026-10-08', owed: 5000, label: '08/10/2026 20hs' },
  ];
  const partial = creditAgainstDebts(8000, debts);
  assert.equal(partial.ok, true);
  assert.deepEqual(partial.rows.map((row) => row.credit), [5000, 3000]);
  assert.equal(partial.leftover, 0);
  assert.equal(creditLoadSummary(partial), 'Se aplicó $5.000 a 01/10/2026 21hs y $3.000 a 08/10/2026 20hs.');
  const extra = creditAgainstDebts(12000, debts);
  assert.deepEqual(extra.rows.map((row) => row.credit), [5000, 5000]);
  assert.equal(extra.leftover, 2000);
  assert.match(creditLoadSummary(extra), /Queda como saldo a favor \$2\.000\./);
  const none = creditAgainstDebts(4000, []);
  assert.equal(none.rows.length, 0);
  assert.equal(none.leftover, 4000);
  assert.equal(creditLoadSummary(none), 'Quedó como saldo a favor $4.000.');
  assert.equal(creditAgainstDebts(0, debts).ok, false);
  // Una deuda de otro organizador no entra en la lista: el llamador la filtra.
  const onlyMine = creditAgainstDebts(5000, [debts[1]]);
  assert.equal(onlyMine.rows.length, 1);
  assert.equal(onlyMine.rows[0].id, 'b');
  assert.equal(onlyMine.leftover, 0);
});

test('descontar del crédito paga al organizador logueado y baja la deuda', () => {
  const rec = paymentRecord({
    paid: true, split: true, cash: 0, transfer: 0, pendingTransfer: 0, fromCredit: 2000, creditTo: 'Gustavo',
  }, 'Gustavo', 5);
  assert.equal(rec.ok, true);
  assert.equal(rec.patch.method, 'credito');
  assert.equal(rec.patch.amount, 2000);
  assert.equal(rec.patch.fromCredit, 2000);
  assert.equal(rec.patch.creditTo, 'Gustavo');
  assert.equal(rec.patch.cashTo, null);
  const player = { ...rec.patch, matchId: 'a', waiting: false };
  const owed = amountOwed(player, {
    players: [player],
    matches: [{ id: 'a', date: '2026-10-01', time: '21:00' }],
    prices: { matchPrice: 5000 },
  });
  assert.equal(owed, 3000);
  assert.match(paymentStatusText(player), /Pagó \$2\.000 · Crédito/);
  assert.match(paymentStatusText(player), /cobró Gustavo/);
  const short = paymentRecord({ paid: true, split: true, fromCredit: 5000, creditTo: 'Gustavo' }, 'Martín', 6);
  assert.equal(short.patch.creditTo, 'Gustavo');
  assert.equal(paymentRecord({ paid: true, split: true, fromCredit: -1 }, 'Gustavo', 7).ok, false);
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
  assert.equal(priceOfMatch({ price: 7500 }, { matchPrice: 5000 }), 7500);
  assert.equal(priceOfMatch({}, { matchPrice: 6000 }), 6000);
  assert.equal(priceOfMatch({ price: 1.5 }, null), 5000);
  assert.equal(priceOfMatch({ price: 0 }, { matchPrice: 5000 }), 0);
  assert.deepEqual(splitEven(9000, 2), [4500, 4500]);
  assert.deepEqual(splitEven(9001, 2), [4501, 4500]);
  assert.deepEqual(splitPaymentAcross({ cash: 9001, transfer: 100, pending: 0 }, 2), [
    { cash: 4501, transfer: 50, pending: 0, credit: 0 },
    { cash: 4500, transfer: 50, pending: 0, credit: 0 },
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

test('promo de invitados: es quien invita + el nombre del invitado', () => {
  const matches = [
    { id: 'A', date: '2026-10-22', time: '19:00', startsAt: 1 },
    { id: 'B', date: '2026-10-22', time: '21:00', startsAt: 2 },
  ];
  const base = { phone: '', waiting: false };
  // Invitado 1 de Vinicio en A y de Ernesto en B: dos personas distintas, sin promo.
  const distintos = [
    { ...base, id: 'vA', matchId: 'A', name: 'Vinicio' },
    { ...base, id: 'eB', matchId: 'B', name: 'Ernesto' },
    { ...base, id: 'gA', matchId: 'A', name: 'Invitado 1', invitedBy: 'vA', guestAuto: true },
    { ...base, id: 'gB', matchId: 'B', name: 'Invitado 1', invitedBy: 'eB', guestAuto: true },
  ];
  assert.equal(promoForPlayer({ player: distintos[2], players: distintos, matches, prices: null }), null);
  assert.equal(promoForPlayer({ player: distintos[3], players: distintos, matches, prices: null }), null);
  assert.notEqual(playerPromoKey(distintos[2], distintos), playerPromoKey(distintos[3], distintos));
  assert.equal(playerPromoKey(distintos[2], distintos), 'g:n:vinicio|invitado 1');
  // El mismo Vinicio lleva a su Invitado 1 a los dos partidos del día: promo 2.
  const mismo = [
    { ...base, id: 'vA', matchId: 'A', name: 'Vinicio' },
    { ...base, id: 'vB', matchId: 'B', name: 'Vinicio' },
    { ...base, id: 'gA', matchId: 'A', name: 'Invitado 1', invitedBy: 'vA', guestAuto: true },
    { ...base, id: 'gB', matchId: 'B', name: 'Invitado 1', invitedBy: 'vB', guestAuto: true },
  ];
  const promo = promoForPlayer({ player: mismo[2], players: mismo, matches, prices: { matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 } });
  assert.equal(promo?.label, 'Promo 2 partidos por $9.000');
  assert.equal(promo.share, 4500);
  assert.deepEqual(promo.rows.map((row) => row.player.id), ['gA', 'gB']);
  // Con el teléfono del anfitrión también: lo identifica igual en los dos partidos.
  const conTel = mismo.map((p) => (p.invitedBy ? p : { ...p, phone: '5491122223333', name: p.id === 'vA' ? 'Vini' : 'Vinicio R.' }));
  assert.equal(promoForPlayer({ player: conTel[3], players: conTel, matches, prices: null })?.count, 2);
  // Si no está el anfitrión en la lista, el invitado queda solo en su partido.
  assert.equal(personKey({ name: 'Invitado 1', invitedBy: 'borrado' }, []), 'g:id:borrado|invitado 1');
  // Un invitado con teléfono o ficha es esa persona, lo invite quien lo invite.
  assert.equal(personKey({ name: 'Juan', invitedBy: 'vA', rosterId: 'r9' }, mismo), 'r:r9');
  // amountOwed usa la parte de la promo solo para el invitado del mismo anfitrión.
  assert.equal(amountOwed(mismo[2], { players: mismo, matches, prices: null }), 4500);
  assert.equal(amountOwed(distintos[2], { players: distintos, matches, prices: null }), 5000);
});

test('invitados con el mismo nombre no se mezclan en resúmenes ni en Jugadores', () => {
  const players = [
    { id: 'vA', matchId: 'A', name: 'Vinicio', phone: '' },
    { id: 'eB', matchId: 'B', name: 'Ernesto', phone: '' },
    { id: 'gA', matchId: 'A', name: 'Invitado 1', invitedBy: 'vA', phone: '', paid: true, cash: 5000, cashTo: 'Gus', pendingTransfer: 1000, pendingTo: 'Gus' },
    { id: 'gB', matchId: 'B', name: 'Invitado 1', invitedBy: 'eB', phone: '', paid: true, cash: 5000, cashTo: 'Gus', pendingTransfer: 1000, pendingTo: 'Gus' },
  ];
  const summary = paymentsSummary({ players, roster: [] });
  assert.equal(summary.filter((row) => row.name === 'Invitado 1').length, 2);
  const pending = pendingTransfers({ players, roster: [] });
  assert.equal(pending.rows.filter((row) => row.name === 'Invitado 1').length, 2);
  // Una ficha de Jugadores que se llama igual no se lleva a los invitados.
  assert.equal(playerMatchesPerson(players[2], { id: 'r1', name: 'Invitado 1', phone: '' }), false);
  assert.equal(playerMatchesPerson(players[0], { id: 'r2', name: 'Vinicio', phone: '' }), true);
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
  const horizon = [
    { id: 'hoy', date: '2026-10-19', time: '21:00' },
    { id: 'mas7', date: '2026-10-26', time: '21:00' },
    { id: 'mas8', date: '2026-10-27', time: '21:00' },
    { id: 'ayer', date: '2026-10-18', time: '21:00' },
  ];
  const split = splitNear(horizon, now);
  assert.deepEqual(split.next.map((match) => match.id), ['hoy', 'mas7']);
  assert.deepEqual(split.later.map((match) => match.id), ['mas8']);
  assert.equal(split.limit, '2026-10-26');
  assert.deepEqual(pastMatches(matches, now).map((match) => match.id), ['ayer', 'viejo']);
  assert.equal(matchAlreadyPlayed({ date: '2026-10-18', time: '21:00' }, now), true);
  assert.equal(matchAlreadyPlayed({ date: '2026-10-19', time: '10:00' }, now), false);
  assert.equal(matchAlreadyPlayed({ date: '2026-10-22', time: '21:00' }, now), false);
  assert.deepEqual(upcomingMatches(matches, now).map((match) => match.id), ['hoy-noche', 'manana']);
  const many = [];
  for (let i = 0; i < 40; i++) {
    const date = addDays('2026-10-18', -i);
    many.push({ id: date, date, time: '21:00', startsAt: toEpoch(date, '21:00') });
  }
  many.push({ id: 'hoy', date: '2026-10-19', time: '10:00', startsAt: toEpoch('2026-10-19', '10:00') });
  many.push({ id: 'despues', date: '2026-10-22', time: '21:00', startsAt: toEpoch('2026-10-22', '21:00') });
  const recent = historyWindow(many, null, now);
  assert.equal(recent.matches.length, HISTORY_PAGE);
  assert.equal(recent.matches[0].id, '2026-10-18');
  assert.equal(recent.matches.at(-1).id, addDays('2026-10-18', -(HISTORY_PAGE - 1)));
  assert.equal(recent.matches.some((match) => match.date >= '2026-10-19'), false);
  const outside = historyWindow(many, { day: '2026-09-09' }, now);
  assert.equal(outside.matches.length, 1);
  assert.equal(outside.matches[0].date, '2026-09-09');
  assert.equal(historyWindow(many, { day: '2026-10-19' }, now).matches.length, 0);
  const range = historyWindow(many, { from: '2026-10-15', to: '2026-10-12' }, now);
  assert.deepEqual(range.matches.map((match) => match.date), ['2026-10-15', '2026-10-14', '2026-10-13', '2026-10-12']);
  const visible = [
    { id: 'solo', date: '2026-10-18', time: '21:00', viewers: ['gustavo'], createdByUid: 'gustavo' },
    { id: 'abierto', date: '2026-10-18', time: '19:00', viewers: ['*'] },
  ].filter((match) => canView(match, 'martin'));
  assert.deepEqual(historyWindow(visible, { day: '2026-10-18' }, now).matches.map((match) => match.id), ['abierto']);
  const bounds = historyBounds(null, now);
  const plan = matchQueryPlan('history', bounds, '2026-10-19');
  assert.equal(plan.limit, 30);
  assert.deepEqual(plan.orderBy, ['date', 'desc']);
  assert.ok(plan.filters.some((filter) => filter.op === 'array-contains-any' && filter.field === 'viewers'));
  assert.ok(plan.filters.some((filter) => filter.field === 'date' && filter.op === '<' && filter.value === '2026-10-19'));
  const ranged = matchQueryPlan('history', historyBounds({ from: '2026-10-01', to: '2026-10-10' }, now), '2026-10-19');
  assert.equal(ranged.limit, null);
  assert.ok(ranged.filters.some((filter) => filter.op === '>=' && filter.value === '2026-10-01'));
  assert.ok(ranged.filters.some((filter) => filter.op === '<=' && filter.value === '2026-10-10'));
  const upcoming = matchQueryPlan('upcoming', null, '2026-10-19');
  assert.equal(upcoming.limit, null);
  assert.deepEqual(upcoming.orderBy, ['date', 'asc']);
  assert.ok(upcoming.filters.some((filter) => filter.op === '>=' && filter.value === '2026-10-19'));
  const byDate = playerStats({
    phone: '5491100002222',
    players: [{ matchId: 'fuera', matchDate: '2026-10-15', phone: '5491100002222', waiting: false }],
    matches: [],
    now,
  });
  assert.equal(byDate.played, 1);
  assert.equal(byDate.summary, 'Mayormente jueves');
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
  const moved = movePlayer({ bib: [], plain: [] }, 'ana', 'bib', ['ana', 'beto'], 1);
  assert.deepEqual(moved.teams, { bib: ['ana'], plain: [] });
  const full = movePlayer(moved.teams, 'beto', 'bib', ['ana', 'beto'], 1);
  assert.equal(full.ok, false);
  assert.equal(full.side, 'bib');
  assert.deepEqual(movePlayer(moved.teams, 'ana', 'none', ['ana', 'beto'], 1).teams, { bib: [], plain: [] });
  assert.deepEqual(normalizeScore(undefined), { bib: 0, plain: 0 });
  assert.deepEqual(bumpScore({ bib: 0, plain: 2 }, 'bib', 1), { bib: 1, plain: 2 });
  assert.deepEqual(bumpScore({ bib: 0, plain: 2 }, 'plain', -1), { bib: 0, plain: 1 });
  assert.deepEqual(bumpScore({ bib: 0, plain: 0 }, 'bib', -1), { bib: 0, plain: 0 });
  assert.deepEqual(bumpScore({ bib: 999, plain: 0 }, 'bib', 1), { bib: 999, plain: 0 });
  assert.equal(bumpGoals(0, 1), 1);
  assert.equal(bumpGoals(0, -1), 0);
  assert.equal(bumpGoals(99, 1), 99);
  assert.equal(bumpGoals(undefined, 2), 2);
  assert.equal(scoreLine(undefined), '');
  assert.equal(scoreLine({ bib: 2, plain: 0 }), 'Con pechera 2 – 0 Sin pechera');
  assert.equal(goaliesLeft(['a', 'b'], ['b']), 1);
  assert.match(teamsMessage({ when: 'Martes', venue: 'Sede', players: [], teams: { bib: [], plain: [] }, score: { bib: 2, plain: 1 } }), /Marcador: Con pechera 2 – Sin pechera 1/);
});

test('equipos equilibrados por nivel y cambio de lugar', () => {
  const even = balanceTeams([
    { id: 'a', level: 10 },
    { id: 'b', level: 1 },
    { id: 'c', level: 9 },
    { id: 'd', level: 2 },
  ], { cap: 2, rng: () => 0 });
  const sum = (ids) => ids.reduce((total, id) => total + ({ a: 10, b: 1, c: 9, d: 2 }[id]), 0);
  assert.equal(even.bib.length, 2);
  assert.equal(even.plain.length, 2);
  assert.equal(sum(even.bib), sum(even.plain));
  const capped = balanceTeams([
    { id: 'a', level: 10 },
    { id: 'b', level: 9 },
    { id: 'c', level: 1 },
  ], { cap: 1, rng: () => 0 });
  assert.deepEqual([...capped.bib, ...capped.plain].sort(), ['a', 'b']);
  const defaults = balanceTeams([{ id: 'a' }, { id: 'b', level: 10 }, { id: 'c' }, { id: 'd', level: 10 }], { cap: 2, rng: () => 0 });
  const side = (id) => (defaults.bib.includes(id) ? 'bib' : 'plain');
  assert.notEqual(side('b'), side('d'));
  assert.deepEqual(dropPlayerOn({ bib: ['a', 'b'], plain: ['c'] }, 'a', { targetId: 'c', allowedIds: ['a', 'b', 'c'] }).teams, { bib: ['c', 'b'], plain: ['a'] });
  assert.deepEqual(dropPlayerOn({ bib: ['a', 'b', 'c'], plain: [] }, 'a', { targetId: 'c', allowedIds: ['a', 'b', 'c'] }).teams.bib, ['c', 'b', 'a']);
  assert.deepEqual(dropPlayerOn({ bib: ['a'], plain: [] }, 'x', { side: 'plain', allowedIds: ['a', 'x'], cap: 2 }).teams, { bib: ['a'], plain: ['x'] });
  assert.equal(dropPlayerOn({ bib: ['a'], plain: [] }, 'x', { side: 'bib', allowedIds: ['a', 'x'], cap: 1 }).ok, false);
});

test('fue al arco sube arriba en el orden en que se marcó y el cambio de lugar sigue', async () => {
  assert.deepEqual(orderByGoal(['a', 'b', 'c', 'd'], [
    { id: 'a' },
    { id: 'b', inGoal: true, inGoalAt: 200 },
    { id: 'c', inGoal: true, inGoalAt: 100 },
    { id: 'd' },
  ]), ['c', 'b', 'a', 'd']);
  assert.deepEqual(orderByGoal(['c', 'b', 'a'], [
    { id: 'a', inGoal: true },
    { id: 'b', inGoal: true, inGoalAt: 50 },
    { id: 'c' },
  ]), ['a', 'b', 'c']);
  assert.deepEqual(orderByGoal(['a', 'b', 'c', 'd'], [
    { id: 'a' },
    { id: 'b' },
    { id: 'c', inGoal: true, inGoalAt: 100 },
    { id: 'd' },
  ]), ['c', 'a', 'b', 'd']);
  assert.deepEqual(orderByGoal(['b', 'a'], [
    { id: 'a', inGoal: true, inGoalAt: 5 },
    { id: 'b', inGoal: true, inGoalAt: 5 },
  ]), ['b', 'a']);
  assert.equal(nextInGoalAt([{ inGoal: true, inGoalAt: 10 }, { inGoal: false, inGoalAt: 99 }], 12), 12);
  assert.equal(nextInGoalAt([{ inGoal: true, inGoalAt: 12 }], 12), 13);
  const marked = [
    { id: 'c', inGoal: true, inGoalAt: 100 },
    { id: 'b', inGoal: true, inGoalAt: 200 },
    { id: 'a' },
    { id: 'd' },
  ];
  const shown = orderTeamsByGoal({ bib: ['a', 'b', 'c', 'd'], plain: [] }, marked);
  assert.deepEqual(shown.bib, ['c', 'b', 'a', 'd']);
  const swapped = dropPlayerOn(shown, 'a', { targetId: 'd', allowedIds: ['a', 'b', 'c', 'd'] });
  assert.deepEqual(orderTeamsByGoal(swapped.teams, marked).bib, ['c', 'b', 'd', 'a']);
  const across = dropPlayerOn(
    orderTeamsByGoal({ bib: ['c', 'a'], plain: ['d'] }, marked),
    'a',
    { targetId: 'd', allowedIds: ['a', 'c', 'd'] },
  );
  assert.deepEqual(orderTeamsByGoal(across.teams, marked), { bib: ['c', 'd'], plain: ['a'] });

  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-arco';
  const mid = await store.addMatch({ date: '2026-11-20', time: '21:00' }, 'Gustavo');
  const match = { id: mid, date: '2026-11-20', capacity: 14 };
  const ana = await store.addPlayer(match, { name: 'Ana', phone: '' }, 'Gustavo');
  const beto = await store.addPlayer(match, { name: 'Beto', phone: '' }, 'Gustavo');
  const ciro = await store.addPlayer(match, { name: 'Ciro', phone: '' }, 'Gustavo');
  await store.setTeams(mid, { bib: [ana, beto, ciro], plain: [] }, 'Gustavo');
  await store.setInGoal(ciro, true);
  await store.setInGoal(ana, true);
  let db = JSON.parse(mem.get('f7c-test-arco'));
  const anaAt = db.players[ana].inGoalAt;
  assert.equal(db.players[ciro].inGoal, true);
  assert.equal(db.players[ana].inGoal, true);
  assert.equal(db.players[beto].inGoal, undefined);
  assert.ok(db.players[ciro].inGoalAt < anaAt);
  await store.setInGoal(ana, true);
  db = JSON.parse(mem.get('f7c-test-arco'));
  assert.equal(db.players[ana].inGoalAt, anaAt);
  const players = [ana, beto, ciro].map((id) => ({ id, ...db.players[id] }));
  assert.deepEqual(orderByGoal([ana, beto, ciro], players), [ciro, ana, beto]);
  await store.setInGoal(ana, false);
  db = JSON.parse(mem.get('f7c-test-arco'));
  assert.equal(db.players[ana].inGoal, false);
  assert.equal('inGoalAt' in db.players[ana], false);
  const after = [ana, beto, ciro].map((id) => ({ id, ...db.players[id] }));
  assert.deepEqual(orderByGoal(db.matches[mid].teams.bib, after), [ciro, ana, beto]);
});

test('importar historial lee fecha, hora y jugadores de varios partidos', () => {
  const text = `Jueves 16/10 21hs
1. Juan Pérez
2. Ana Gómez 11 5555-6666

[17/10/26, 19:30] Gustavo:
1. Pedro
2. Pedro
1. Luis`;
  const blocks = parsePlayedMatchesFromText(text, { now: new Date('2026-10-19T13:00:00-03:00') });
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].date, '2026-10-16');
  assert.equal(blocks[0].time, '21:00');
  assert.deepEqual(blocks[0].players.map((player) => player.name), ['Juan Pérez', 'Ana Gómez']);
  assert.match(blocks[0].players[1].phone, /5555/);
  assert.equal(blocks[1].date, '2026-10-17');
  assert.equal(blocks[1].time, '19:30');
  assert.deepEqual(blocks[1].players.map((player) => player.name), ['Pedro', 'Luis']);
  assert.equal(p('jueves 22/10 21hs', { now: new Date('2026-10-19T13:00:00-03:00') })[0].date, '2026-10-22');
});

test('importar historial: rango de hora y fecha con año', () => {
  const now = new Date('2026-10-19T13:00:00-03:00');
  const rows = parsePlayedMatchesFromText('Martes 20 a 21 12/12/2023\n1. Juan Pérez\n2. Ana', { now });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].date, '2023-12-12');
  assert.equal(rows[0].time, '20:00');
  assert.deepEqual(rows[0].players.map((player) => player.name), ['Juan Pérez', 'Ana']);
  const withHs = parsePlayedMatchesFromText('Martes 20hs a 21hs 12/12/23\n1. Ana', { now });
  assert.equal(withHs[0].date, '2023-12-12');
  assert.equal(withHs[0].time, '20:00');
  const minutes = parsePlayedMatchesFromText('12/12/2023 20:30 a 21:15\n1. Ana', { now });
  assert.equal(minutes[0].date, '2023-12-12');
  assert.equal(minutes[0].time, '20:30');
  const mismatch = p('Lunes 20 a 21 12/12/2023', { now });
  assert.equal(mismatch[0].date, '2023-12-12');
  assert.equal(mismatch[0].time, '20:00');
  assert.ok(mismatch[0].warning);
});

test('compartir la app nombra el link de instalación', () => {
  const text = appShareMessage();
  assert.match(text, /Anotate con Mis Partidos/);
  assert.match(text, /Instalá la app desde acá/);
  assert.ok(text.includes(APP_INSTALL_URL));
  assert.equal(APP_INSTALL_URL, 'https://gustavofarg-hash.github.io/futbol-colegiales/');
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
  const mid = await store.addMatch({ date: '2026-11-20', time: '21:00', note: '' }, 'Gustavo');
  const main = await store.addPlayer({ id: mid, date: '2026-11-20', capacity: 14 }, { name: 'Teo', phone: '5491166662222' }, 'Gustavo');
  await store.addPlayer({ id: mid, date: '2026-11-20', capacity: 14 }, { name: 'Espera', phone: '' }, 'Gustavo', { waiting: true });
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
  store.setActor({ uid: 'gustavo', name: 'Gustavo' });
  const visibleRoster = await store.addRoster({ name: 'Vero Visible', phone: '5491188887777', phoneShared: true }, 'Gustavo');
  const visibleMatch = await store.addPlayer({ id: mid, date: '2026-10-22', capacity: 14 }, { name: 'Vero Visible', phone: '5491188887777', rosterId: visibleRoster, phoneShared: true }, 'Gustavo');
  const hiddenRoster = await store.addRoster({ name: 'Nico Privado', phone: '5491177776666' }, 'Gustavo');
  const hiddenMatch = await store.addPlayer({ id: mid, date: '2026-10-22', capacity: 14 }, { name: 'Nico Privado', phone: '5491177776666', rosterId: hiddenRoster, phoneShared: false }, 'Gustavo');
  const fresh = JSON.parse(mem.get('f7c-test-privacy'));
  assert.equal(fresh.contacts.roster[visibleRoster].visibleToAll, true);
  assert.equal(fresh.contacts.players[visibleMatch].visibleToAll, true);
  assert.equal(fresh.contacts.roster[hiddenRoster].visibleToAll, false);
  assert.equal(fresh.contacts.players[hiddenMatch].visibleToAll, false);
  store.setActor({ uid: 'martin', name: 'Martín' });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(seen.roster.find((r) => r.id === visibleRoster).phone, '5491188887777');
  assert.equal(seen.players.find((p) => p.id === visibleMatch).phone, '5491188887777');
  assert.equal(seen.roster.find((r) => r.id === hiddenRoster).phone, '');
  assert.equal(seen.players.find((p) => p.id === hiddenMatch).phonePrivate, true);
});

test('solo edita el jugador quien lo agregó', async () => {
  const gustavo = { uid: 'gustavo', name: 'Gustavo', role: 'admin' };
  const martin = { uid: 'martin', name: 'Martín' };
  const player = { name: 'Juan', addedBy: 'Gustavo', addedByUid: 'gustavo' };
  assert.equal(canEditPlayer(player, gustavo), true);
  assert.equal(canEditPlayer(player, martin), false);
  assert.equal(canEditPlayer(player, { uid: 'admin', name: 'Gustavo', role: 'admin' }), false);
  const legacy = { name: 'Viejo', addedBy: 'Martín' };
  assert.equal(canEditPlayer(legacy, martin), true);
  assert.equal(canEditPlayer(legacy, gustavo), false);
  assert.equal(canEditPlayer({ name: 'Sin dueño' }, gustavo), false);
  assert.equal(canEditPlayer({ addedBy: 'Martín', addedByUid: 'martin' }, { uid: 'gustavo', name: 'Martín' }), false);
  assert.equal(canEditPlayer({ addedBy: 'Martín' }, { uid: '', name: 'martin' }), true);
  assert.equal(canEditRoster({ createdBy: 'Gustavo', createdByUid: 'gustavo' }, martin), false);
  assert.equal(EDIT_LOCK_TEXT, 'Solo lo puede editar el organizador que lo agregó');

  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-edit-lock';
  store.setActor(gustavo);
  const mid = await store.addMatch({ date: '2026-10-22', time: '21:00', note: '' }, 'Gustavo');
  const pid = await store.addPlayer({ id: mid, date: '2026-10-22', capacity: 14 }, { name: 'Juan Pérez', phone: '5491112345678' }, 'Gustavo');
  const rid = await store.addRoster({ name: 'Juan Pérez', phone: '5491199990000' }, 'Gustavo');
  const waitId = await store.addPlayer({ id: mid, date: '2026-10-22', capacity: 14 }, { name: 'En Espera', phone: '' }, 'Gustavo', { waiting: true });
  store.setActor(martin);
  await assert.rejects(() => store.updatePlayer(pid, { name: 'Juan X' }), /Solo lo puede editar/);
  await assert.rejects(() => store.updatePlayer(pid, { phone: '5491188880000' }), /Solo lo puede editar/);
  await assert.rejects(() => store.updateRoster(rid, { name: 'Otro' }), /Solo lo puede editar/);
  await assert.rejects(() => store.patchRoster(rid, { level: 4 }), /Solo lo puede editar/);
  await store.updatePlayer(pid, { rosterId: rid });
  await store.setPayment(pid, { paid: true, amount: 5000, method: 'efectivo', receivedBy: 'Martín' }, 'Martín');
  await store.promoteFromWaiting(waitId);
  await store.clearTentative(pid);
  const db = JSON.parse(mem.get('f7c-test-edit-lock'));
  assert.equal(db.players[pid].name, 'Juan Pérez');
  assert.equal(db.players[pid].paid, true);
  assert.equal(db.players[pid].rosterId, rid);
  assert.equal(db.players[waitId].waiting, false);
  assert.equal(db.roster[rid].name, 'Juan Pérez');
  assert.equal(db.roster[rid].level, undefined);
  store.setActor(gustavo);
  await store.updatePlayer(pid, { name: 'Juan P.' });
  await store.patchRoster(rid, { level: 6, positions: ['Arquero'] });
  const after = JSON.parse(mem.get('f7c-test-edit-lock'));
  assert.equal(after.players[pid].name, 'Juan P.');
  assert.equal(after.roster[rid].level, 6);
  const orphan = await store.addRoster({ name: 'Sin sello', phone: '' }, 'Gustavo');
  const raw = JSON.parse(mem.get('f7c-test-edit-lock'));
  delete raw.roster[orphan].createdByUid;
  delete raw.roster[orphan].createdBy;
  mem.set('f7c-test-edit-lock', JSON.stringify(raw));
  await assert.rejects(() => store.updateRoster(orphan, { name: 'Con sello' }), /Solo lo puede editar/);
});

test('permission-denied de una consulta vieja no reinicia el resto', () => {
  assert.equal(listenDeniedPlan({ code: 'permission-denied', hasHandler: true, retrying: false, deniedRetries: 0 }), 'handler');
  assert.equal(listenDeniedPlan({ code: 'permission_denied', hasHandler: true, retrying: false, deniedRetries: 4 }), 'handler');
  assert.equal(listenDeniedPlan({ code: 'permission-denied', hasHandler: false, retrying: false, deniedRetries: 0 }), 'retry');
  assert.equal(listenDeniedPlan({ code: 'permission-denied', hasHandler: false, retrying: true, deniedRetries: 0 }), 'fail');
  assert.equal(listenDeniedPlan({ code: 'permission-denied', hasHandler: false, retrying: false, deniedRetries: 1 }), 'fail');
  assert.equal(listenDeniedPlan({ code: 'unavailable', hasHandler: true, retrying: false, deniedRetries: 0 }), 'fail');
});

test('el mismo día no vuelve a emitir y repetir el actor tampoco', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  let n = 0;
  store.subscribe(() => { n += 1; });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(n, 1);
  store._queryDay = '2026-10-20';
  store.syncDay(new Date('2026-10-20T23:00:00-03:00').getTime());
  assert.equal(n, 1);
  store.syncDay(new Date('2026-10-21T01:00:00-03:00').getTime());
  assert.equal(n, 2);
  store.setActor({ uid: 'u1', name: 'Gustavo' });
  store.setActor({ uid: 'u1', name: 'Gustavo' });
  assert.equal(n, 3);
});

test('sede y jugadores por equipo: 7 es 14, y lo viejo sin datos sigue en Colegiales', async () => {
  assert.deepEqual(matchSize({}), { perTeam: 7, capacity: 14 });
  assert.deepEqual(matchSize({ perTeam: 6 }), { perTeam: 6, capacity: 12 });
  assert.deepEqual(matchSize({ capacity: 1 }), { perTeam: null, capacity: 1 });
  assert.equal(perTeamOf({}), 7);
  assert.equal(perTeamOf({ capacity: 14 }), 7);
  assert.equal(footballLabel({}), 'Fútbol 7');
  assert.equal(footballLabel({ perTeam: 8 }), 'Fútbol 8');
  assert.equal(footballLabel({ capacity: 12 }), 'Fútbol 6');
  assert.equal(footballPhrase({ perTeam: 5 }), 'fútbol 5');
  assert.equal(courtLabel({}), '');
  assert.equal(courtLabel({ court: '3' }), 'Cancha 3');
  assert.equal(courtLabel({ court: 'Cancha 2' }), 'Cancha 2');
  assert.equal(courtLabel({ court: 'cancha' }), 'Cancha');
  assert.equal(cleanCourt('  12   norte  extra extra extra'), '12 norte extra extra');
  assert.equal(matchCapacity({ capacity: 1 }), 1);
  assert.equal(capacityFor(11), 22);
  assert.equal(venueLabel({}, []), 'Polideportivo Colegiales');
  assert.equal(matchVenueId({}), 'colegiales');
  assert.equal(matchVenueId({ venueId: 'norte' }), 'norte');
  const venues = [
    { id: 'colegiales', name: 'Polideportivo Colegiales', active: true, order: 0 },
    { id: 'norte', name: 'Club Norte', active: false, order: 2 },
  ];
  assert.deepEqual(historyVenueOptions(venues).map((item) => item.id), ['colegiales', 'norte']);
  assert.deepEqual(historyVenueOptions([]).map((item) => item.id), ['colegiales']);
  const past = [{ id: 'a' }, { id: 'b', venueId: 'norte' }, { id: 'c', venueId: 'colegiales' }];
  assert.deepEqual(filterHistoryByVenues(past, null).map((item) => item.id), ['a', 'b', 'c']);
  assert.deepEqual(filterHistoryByVenues(past, ['colegiales']).map((item) => item.id), ['a', 'c']);
  assert.deepEqual(filterHistoryByVenues(past, []).map((item) => item.id), []);
  assert.equal(venueLabel({ venueId: 'norte', venueName: 'Nombre viejo' }, [{ id: 'norte', name: 'Club Norte', active: true, order: 1 }]), 'Club Norte');
  assert.equal(defaultVenueId([], { unreadable: true }), 'colegiales');
  const choices = venueChoices([{ id: 'norte', name: 'Club Norte', active: false, order: 2 }, { id: 'colegiales', name: 'Polideportivo Colegiales', active: true, order: 0 }], { currentId: 'norte' });
  assert.deepEqual(choices.map((item) => item.id), ['colegiales', 'norte']);
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  await store.init();
  const id = await store.addMatch({ date: '2026-10-22', time: '21:00' }, 'Gustavo');
  const db = JSON.parse(mem.get(store.key));
  assert.equal(db.matches[id].venueId, 'colegiales');
  assert.equal(db.matches[id].venueName, 'Polideportivo Colegiales');
  assert.equal(db.matches[id].perTeam, 7);
  assert.equal(db.matches[id].capacity, 14);
  assert.equal(db.matches[id].court, undefined);
  const conCancha = await store.addMatch({ date: '2026-10-23', time: '20:00', court: ' Cancha 4 ' }, 'Gustavo');
  assert.equal(JSON.parse(mem.get(store.key)).matches[conCancha].court, 'Cancha 4');
  await store.updateMatch(conCancha, { court: '' }, 'Gustavo');
  assert.equal(JSON.parse(mem.get(store.key)).matches[conCancha].court, '');
  assert.equal(JSON.parse(mem.get(store.key)).matches[conCancha].price, undefined);
  await store.updateMatch(conCancha, { price: 7500 }, 'Gustavo');
  assert.equal(JSON.parse(mem.get(store.key)).matches[conCancha].price, 7500);
  await store.updateMatch(conCancha, { price: 1.5 }, 'Gustavo');
  assert.equal(JSON.parse(mem.get(store.key)).matches[conCancha].price, 7500);
  assert.equal(db.venues.colegiales.name, 'Polideportivo Colegiales');
  const norte = await store.addVenue('Club Norte');
  await store.updateVenue(norte, { name: 'Club Norte Sur' });
  await assert.rejects(() => store.addVenue('club norte sur'), /sedes/);
  await store.updateVenue(norte, { active: false });
  assert.equal(JSON.parse(mem.get(store.key)).venues[norte].active, false);
  const tight = await store.addMatch({ date: '2026-10-30', time: '19:00', capacity: 1 }, 'Gustavo');
  assert.equal(JSON.parse(mem.get(store.key)).matches[tight].capacity, 1);
  assert.equal(JSON.parse(mem.get(store.key)).matches[tight].perTeam, undefined);
});

test('no se cancela un partido que ya entró al historial', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  const played = await store.addMatch({ date: '2026-10-11', time: '19:00', note: 'Viejo' }, 'Gustavo');
  const ahead = await store.addMatch({ date: '2026-11-20', time: '21:00', note: 'Futuro' }, 'Gustavo');
  await assert.rejects(() => store.updateMatch(played, { cancelled: true, notes: 'Se suspendió' }, 'Gustavo'), /ya se jugó/);
  await store.updateMatch(played, { notes: 'Se puede anotar' }, 'Gustavo');
  await store.updateMatch(ahead, { cancelled: true, notes: 'Lluvia' }, 'Gustavo');
  const db = JSON.parse(mem.get(store.key));
  assert.equal(db.matches[played].cancelled, undefined);
  assert.equal(db.matches[played].notes, 'Se puede anotar');
  assert.equal(db.matches[ahead].cancelled, true);
});

test('se anotó con queda en el jugador y se puede cambiar sin tocar el nombre', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.setActor({ uid: 'gustavo', name: 'Gustavo' });
  const id = await store.addMatch({ date: '2026-10-22', time: '21:00' }, 'Gustavo');
  const pid = await store.addPlayer({ id, date: '2026-10-22', capacity: 14 }, { name: 'Juan Pérez', phone: '' }, 'Gustavo');
  let player = JSON.parse(mem.get(store.key)).players[pid];
  assert.equal(player.signedUpWith, 'gustavo');
  assert.equal(player.signedUpWithName, 'Gustavo');
  store.setActor({ uid: 'martin', name: 'Martín' });
  await store.updatePlayer(pid, { signedUpWith: 'martin', signedUpWithName: 'Martín' });
  player = JSON.parse(mem.get(store.key)).players[pid];
  assert.equal(player.name, 'Juan Pérez');
  assert.equal(player.signedUpWith, 'martin');
  assert.equal(player.signedUpWithName, 'Martín');
  const amigo = await store.addPlayer({ id, date: '2026-10-22', capacity: 14 }, {
    name: 'Invitado 1', phone: '', invitedBy: pid, signedUpWith: 'gustavo', signedUpWithName: 'Gustavo',
  }, 'Martín');
  const guest = JSON.parse(mem.get(store.key)).players[amigo];
  assert.equal(guest.signedUpWith, 'gustavo');
  assert.equal(guest.signedUpWithName, 'Gustavo');
});

test('el error del backup nombra la colección y el documento', () => {
  assert.equal(BACKUP_WRITE_BATCH, 1);
  const denied = Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
  const write = backupWriteError({ kind: 'set', segments: ['players', 'ana'] }, denied);
  assert.match(write.message, /guardar players\/ana/);
  assert.match(write.message, /Firebase rechazó el permiso/);
  assert.equal(/missing or insufficient permissions/i.test(write.message), false);
  const read = backupReadError('links', denied);
  assert.match(read.message, /leer Links \(links\)/);
  const del = backupWriteError({ kind: 'delete', segments: ['matches', 'x'] }, denied);
  assert.match(del.message, /borrar matches\/x/);
  const bare = backupSurfaceMessage(denied, 'No se pudo cargar el backup.');
  assert.equal(/missing or insufficient permissions/i.test(bare), false);
  assert.match(bare, /Firebase rechazó el permiso/);
  assert.equal(backupSurfaceMessage(write, 'fallback'), write.message);
  const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  const version = sw.match(/const VERSION = '([^']+)'/)[1];
  assert.equal(version, 'f7c-v66');
  assert.match(app, /class="slot-actions">\$\{wa\}\$\{pay\}/);
  assert.match(css, /#slots \.slot-actions \{ display: flex; flex-direction: column/);
  assert.match(app, new RegExp(`const APP_VERSION = '${version}'`));
  assert.match(app, /id="app-version">Versión \$\{APP_VERSION\}/);
});

test('la carga muestra el avance y deja el aviso de éxito hasta cerrarlo', async () => {
  assert.equal(BACKUP_LOADED_OK, 'Todos los datos fueron cargados con éxito');
  assert.equal(backupProgressText(120, 950), 'Cargando… 120/950');
  assert.equal(backupProgressText(0, 0), 'Cargando…');
  assert.equal(backupProgressText(5, 3), 'Cargando… 3/3');
  const app = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../styles.css', import.meta.url), 'utf8');
  assert.match(app, /status\.textContent = BACKUP_LOADED_OK/);
  assert.match(app, /toast\(BACKUP_LOADED_OK, 0\)/);
  assert.doesNotMatch(app, /importDatabase\(payload\)\.then\(\(\) => \{\s*closeSheet\(\)/);
  assert.match(css, /\.backup-ok[\s\S]*color:\s*var\(--green\)/);
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const demo = createDemoStore();
  demo.key = 'f7c-test-progress';
  demo.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  const backup = buildBackup({
    matches: { a: { date: '2026-11-02', time: '21:00' }, b: { date: '2026-11-03', time: '21:00' } },
    players: { p1: { name: 'Ana', matchId: 'a' } },
  }, new Date('2026-10-27T18:05:30Z'));
  const steps = [];
  await demo.importDatabase(backup, (progress) => steps.push(`${progress.done}/${progress.total}`));
  assert.deepEqual(steps, ['0/3', '3/3']);

  const store = new FirebaseStore();
  store.actor = { uid: 'admin-uid', name: 'Gustavo', role: 'admin' };
  store.db = {};
  const commits = [];
  store.fs = {
    Timestamp: class Timestamp { constructor(seconds, nanoseconds) { this.seconds = seconds; this.nanoseconds = nanoseconds; } },
    writeBatch() {
      const batch = [];
      return {
        set(ref) { batch.push(`set ${ref.path}`); },
        delete(ref) { batch.push(`delete ${ref.path}`); },
        async commit() { commits.push(batch.join(',')); },
      };
    },
    doc(_db, ...segments) { return { path: segments.join('/') }; },
  };
  store._readCollection = async (name) => (name === 'matches' ? { viejo: { date: '2026-01-01' }, a: { date: '2026-11-02' } } : {});
  const live = [];
  const file = buildBackup({
    matches: { a: { date: '2026-11-02', time: '21:00' }, b: { date: '2026-11-03', time: '21:00' } },
    users: { 'admin-uid': { role: 'admin', active: true }, 'por-mail': { role: 'admin', active: true } },
  }, new Date('2026-10-27T18:05:30Z'));
  await store.importDatabase(file, (progress) => live.push(`${progress.done}/${progress.total}`));
  assert.equal(live[0], '0/0');
  assert.equal(live.at(-1), '4/4');
  assert.deepEqual(live.filter((step) => step.endsWith('/4')), ['0/4', '1/4', '2/4', '3/4', '4/4']);
  assert.deepEqual(commits, ['delete matches/viejo', 'set matches/a', 'set matches/b', 'set users/por-mail']);
  assert.equal(commits.some((line) => line.includes('users/admin-uid')), false);
});

test('sin uid no se carga el backup y un organizador tampoco', async () => {
  const store = new FirebaseStore();
  const backup = buildBackup({ matches: { a: { date: '2026-11-02', time: '21:00' } } }, new Date('2026-10-27T18:05:30Z'));
  store.actor = { uid: 'martin', name: 'Martín', role: 'organizer' };
  await assert.rejects(() => store.importDatabase(backup), (error) => error.code === 'admin-only');
  store.actor = { uid: '', name: 'Gustavo', role: 'admin' };
  await assert.rejects(() => store.importDatabase(backup), (error) => error.code === 'admin-only' && /sesión/.test(error.message));
});

test('el backup se nombra con la hora de Buenos Aires y solo lo exporta el admin', async () => {
  const when = new Date('2026-10-27T18:05:30Z');
  assert.equal(backupFilename(when), 'Mis_partidos_2026-10-27_15-05.json');
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-backup';
  store.setActor({ uid: 'martin', name: 'Martín', role: 'organizer' });
  await assert.rejects(() => store.exportDatabase(), (error) => error.code === 'admin-only');
  store.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  const id = await store.addMatch({ date: '2026-11-02', time: '21:00', note: 'Backup' }, 'Gustavo');
  const backup = await store.exportDatabase({ when });
  assert.equal(backup.format, 'mis-partidos-backup');
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, '2026-10-27T15:05:30-03:00');
  assert.equal(backup.collections.matches[id].note, 'Backup');
  assert.equal(backup.collections.users && typeof backup.collections.users, 'object');
  const parsed = parseBackup(JSON.stringify(backup));
  assert.equal(parsed.ok, true);
  assert.equal(parsed.summary.counts.matches, 1);
  const built = buildBackup({ matches: { a: { date: '2026-11-02' } } }, when);
  assert.deepEqual(parseBackup(built).backup.collections.matches, built.collections.matches);
});

test('cargar un backup reemplaza los datos y un organizador no puede', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-restore';
  const when = new Date('2026-10-27T18:05:30Z');
  store.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  const id = await store.addMatch({ date: '2026-11-02', time: '21:00', note: 'Original' }, 'Gustavo');
  const match = { id, date: '2026-11-02', capacity: 14 };
  const pid = await store.addPlayer(match, { name: 'Ana Backup', phone: '11 5555-0101' }, 'Gustavo');
  await store.setPrices({ matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 });
  const backup = await store.exportDatabase({ when });
  await store.addMatch({ date: '2026-12-01', time: '10:00', note: 'Extra' }, 'Gustavo');
  store.setActor({ uid: 'martin', name: 'Martín', role: 'organizer' });
  await assert.rejects(() => store.importDatabase(backup), (error) => error.code === 'admin-only');
  store.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  assert.equal(parseBackup('{').ok, false);
  assert.equal(parseBackup('{"format":"otro"}').ok, false);
  const summary = await store.importDatabase(JSON.stringify(backup));
  assert.equal(summary.counts.matches, 1);
  assert.equal(summary.counts.players, 1);
  const again = await store.exportDatabase({ when });
  assert.deepEqual(again.collections, backup.collections);
  const db = JSON.parse(mem.get(store.key));
  assert.equal(db.matches[id].note, 'Original');
  assert.equal(db.players[pid].name, 'Ana Backup');
  assert.equal(db.contacts.players[pid].phone, '5491155550101');
  assert.equal(Object.values(db.matches).some((match) => match.note === 'Extra'), false);
  assert.equal(db.settings.prices.matchPrice, 5000);
});

test('resetear la base la deja vacía y un organizador no puede', async () => {
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  const store = createDemoStore();
  store.key = 'f7c-test-reset';
  store.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  const id = await store.addMatch({ date: '2026-11-02', time: '21:00', note: 'Se borra' }, 'Gustavo');
  await store.addPlayer({ id, date: '2026-11-02', capacity: 14 }, { name: 'Ana Reset', phone: '11 5555-0199' }, 'Gustavo');
  await store.addRoster({ name: 'Plantel Reset', phone: '11 5555-0188' }, 'Gustavo');
  store.setActor({ uid: 'martin', name: 'Martín', role: 'organizer' });
  await assert.rejects(() => store.resetDatabase(), (error) => error.code === 'admin-only');
  store.setActor({ uid: 'gustavo', name: 'Gustavo', role: 'admin' });
  await store.resetDatabase();
  const db = JSON.parse(mem.get(store.key));
  assert.deepEqual(db.matches, {});
  assert.deepEqual(db.players, {});
  assert.deepEqual(db.roster, {});
  assert.deepEqual(db.venues, {});
  assert.deepEqual(db.organizers, {});
  assert.deepEqual(db.settings, {});
  assert.deepEqual(db.contacts.players, {});
  assert.deepEqual(db.contacts.roster, {});
  const again = await store.exportDatabase();
  assert.equal(again.collections.matches && Object.keys(again.collections.matches).length, 0);
  assert.equal(Object.keys(again.collections.players).length, 0);
});

test('Drive: ID de config, nombre para compartir y cuerpo multipart', () => {
  assert.equal(driveClientId({}), '');
  assert.equal(driveClientId({ GOOGLE_DRIVE_CLIENT_ID: 'TU_ID' }), '');
  assert.equal(driveClientId({ GOOGLE_DRIVE_CLIENT_ID: ' 123-abc.apps.googleusercontent.com ' }), '123-abc.apps.googleusercontent.com');
  // Chrome no comparte .json: va como .txt con el mismo contenido.
  assert.equal(shareableBackupName('Mis_partidos_2026-10-30_09-00.json'), 'Mis_partidos_2026-10-30_09-00.txt');
  const body = multipartBody({ name: 'a.json', parents: ['f'] }, '{"x":1}', 'B');
  assert.equal(body, '--B\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n{"name":"a.json","parents":["f"]}\r\n--B\r\nContent-Type: application/json\r\n\r\n{"x":1}\r\n--B--\r\n');
});

test('Drive: permiso drive.file y subida a la carpeta de backups', async () => {
  forgetDriveToken();
  const asked = [];
  globalThis.google = { accounts: { oauth2: { initTokenClient(cfg) {
    return { requestAccessToken() { asked.push(cfg); cfg.callback({ access_token: 'tok', expires_in: 3600 }); } };
  } } } };
  try {
    assert.equal(await requestDriveToken('id.apps.googleusercontent.com', { now: () => 0 }), 'tok');
    assert.equal(await requestDriveToken('id.apps.googleusercontent.com', { now: () => 1000 }), 'tok');
    assert.equal(asked.length, 1, 'el permiso vigente no se vuelve a pedir');
    assert.equal(asked[0].scope, DRIVE_SCOPE);
    assert.equal(DRIVE_SCOPE, 'https://www.googleapis.com/auth/drive.file');

    forgetDriveToken();
    globalThis.google.accounts.oauth2.initTokenClient = (cfg) => ({ requestAccessToken() { cfg.error_callback({ type: 'popup_closed' }); } });
    await assert.rejects(requestDriveToken('id.apps.googleusercontent.com'), (e) => e.code === 'drive/cancelled');
  } finally {
    delete globalThis.google;
    forgetDriveToken();
  }

  const calls = [];
  const reply = (status, json) => ({ ok: status < 300, status, json: async () => json });
  const fakeFetch = (existing) => async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body || '' });
    if (!init.method) return reply(200, { files: existing ? [{ id: 'old-folder' }] : [] });
    if (/upload/.test(url)) return reply(200, { id: 'file-9' });
    return reply(200, { id: 'new-folder' });
  };
  assert.equal(await ensureBackupFolder('tok', fakeFetch(true)), 'old-folder');
  assert.equal(calls.length, 1);
  assert.match(decodeURIComponent(calls[0].url), new RegExp(`name='${DRIVE_FOLDER}'`));
  calls.length = 0;
  const saved = await uploadBackupToDrive({ token: 'tok', filename: 'b.json', text: '{"format":"mis-partidos-backup"}', fetchImpl: fakeFetch(false), boundary: 'Z' });
  assert.equal(saved.id, 'file-9');
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'POST', 'POST']);
  assert.equal(JSON.parse(calls[1].body).mimeType, 'application/vnd.google-apps.folder');
  assert.equal(calls[2].headers['Content-Type'], 'multipart/related; boundary=Z');
  assert.equal(calls[2].headers.Authorization, 'Bearer tok');
  assert.ok(calls[2].body.includes('"parents":["new-folder"]') && calls[2].body.includes('{"format":"mis-partidos-backup"}'));

  const denied = async () => ({ ok: false, status: 403, json: async () => ({ error: { message: 'Drive API has not been used in project' } }) });
  await assert.rejects(ensureBackupFolder('tok', denied), (e) => e.code === 'drive/403' && /Drive API/.test(e.message));
});

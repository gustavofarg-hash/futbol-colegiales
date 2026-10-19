import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMatchesFromText as p } from '../js/parser.js';
import { normalizePhone } from '../js/phone.js';
import { collectedLine, formatARS, parseAmount, paymentRecord, paymentStatusText } from '../js/payments.js';
import { createDemoStore } from '../js/store.js';
import { moveWaiting, nextWaitOrder, overflowPatches, sortWaiting } from '../js/waiting.js';
import { rosterHit, searchRoster } from '../js/roster.js';
import {
  confirmPageUrl, confirmSummary, confirmationAllowed, matchesCrossingReminderWindow,
  needsReminderBanner, newConfirmToken, reminderLinks, reminderMessage, waReminderUrl, withinReminderWindow,
} from '../js/reminders.js';

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
    paid: true, amount: 5000, method: 'transferencia', paidUpdatedBy: 'Martín', paidUpdatedAt: now,
  });
  const no = paymentRecord({ paid: false }, 'Gustavo', now);
  assert.equal(no.patch.paid, false);
  assert.equal(no.patch.amount, null);
  assert.equal(no.patch.method, null);
  assert.equal(no.patch.paidUpdatedBy, 'Gustavo');
  assert.equal(paymentRecord({ paid: true, amount: 5000 }, 'Gustavo').ok, false);
  assert.equal(paymentRecord({ paid: true, amount: -1, method: 'efectivo' }, 'Gustavo').ok, false);
  assert.equal(paymentRecord({}, 'Gustavo').ok, false);
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
  await store.setPayment(pid, { paid: false }, 'Gustavo');
  const unpaid = JSON.parse(mem.get('f7c-demo-db')).players[pid];
  assert.equal(unpaid.paid, false);
  assert.equal(unpaid.amount, null);
  assert.equal(unpaid.method, null);
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
  const player = { matchId: '2026-10-22_2100', confirmToken: a };
  assert.equal(confirmationAllowed(player, '2026-10-22_2100', a), true);
  assert.equal(confirmationAllowed(player, '2026-10-22_2100', 'otro-token-largo-falso'), false);
  assert.equal(confirmationAllowed(player, 'otro-partido', a), false);
  assert.equal(confirmSummary([{ confirmed: 'si' }, { confirmed: 'no' }, { name: 'x' }]).text, 'Confirmados: 1 · No juegan: 1 · Sin respuesta: 1');
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
  assert.equal(needsReminderBanner(match, players, start - 60_000), true);
  assert.equal(needsReminderBanner(match, players.map((p) => (p.phone ? { ...p, reminderSentAt: 1 } : p)), start - 60_000), false);
  assert.equal(needsReminderBanner(match, players.map((p) => (p.id === 'p1' ? { ...p, reminderSentAt: 1 } : p)), start - 60_000), true);
  assert.equal(needsReminderBanner(match, [{ name: 'Nadie', phone: '' }], start - 60_000), false);
  const links = reminderLinks({ match, players, venue: 'Polideportivo Colegiales' });
  assert.equal(links.length, 1);
  assert.equal(links[0].name, 'Juan Pérez');
  assert.equal(links[0].confirmUrl, `https://gustavofarg-hash.github.io/futbol-colegiales/confirmar.html?m=2026-10-19_1500&p=p1&t=${token}`);
  assert.ok(links[0].waUrl.startsWith('https://wa.me/5491112345678?text='));
  const text = decodeURIComponent(links[0].waUrl.split('text=')[1]);
  assert.match(text, /^¡Hola Juan!/);
  assert.match(text, /lunes 19\/10 a las 15:00 hs \(Cancha 2\)/);
  assert.ok(text.includes(links[0].confirmUrl));
  assert.deepEqual(matchesCrossingReminderWindow([match], start - twoH - 1000, start - twoH + 1000).map((m) => m.id), ['2026-10-19_1500']);
  assert.equal(matchesCrossingReminderWindow([match], start - 1000, start - 500).length, 0);
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

import test from 'node:test';
import assert from 'node:assert/strict';
import { firestoreRestFields, hostsBeforeGuests, remapTrialBackup, trialBackupResultText, trialLinkStages, trialPlayerPlan, trialShouldReplace } from '../js/backup.js';
import { isTrialPage } from '../js/trial.js';

const TRIAL = 'BeHA5u1OoNXj13uMQaEjcxauZdo2';
const GUSTAVO = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MARTIN = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbb';

test('fuera de /prueba/ no hay página de prueba', () => {
  assert.equal(isTrialPage(), false);
});

test('el backup de prueba pasa los uid al admin y conserva * y el anfitrión', () => {
  const backup = {
    format: 'mis-partidos-backup',
    collections: {
      matches: {
        solo: {
          note: 'Solo yo',
          viewers: [GUSTAVO],
          adders: [GUSTAVO, MARTIN],
          viewerNames: [{ uid: GUSTAVO, name: 'Gustavo' }],
          createdByUid: GUSTAVO,
          limits: [{ uid: MARTIN, max: 3 }],
        },
        abierto: { viewers: ['*'], adders: ['*'], createdByUid: GUSTAVO },
      },
      players: {
        zzz: { name: 'Ana', matchId: 'solo', invitedBy: 'host', invitedByName: 'Luis', addedByUid: MARTIN, viewers: [GUSTAVO], adders: [MARTIN], phone: '' },
        host: { name: 'Luis', matchId: 'solo', addedByUid: GUSTAVO, signedUpWith: MARTIN, viewers: ['*'], adders: [GUSTAVO], phone: '11 5555-6666' },
      },
      users: {
        [GUSTAVO]: { role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true },
        [MARTIN]: { role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true },
        'gustavof.arg@gmail.com': { role: 'admin', name: 'Por mail', email: 'gustavof.arg@gmail.com', active: true },
      },
      credits: {
        [`${GUSTAVO}__ana`]: { organizerUid: GUSTAVO, organizerName: 'Gustavo', personKey: 'ana', amount: 100, name: 'Ana' },
      },
      rosterNotes: {
        [`ficha_${GUSTAVO}`]: { ownerUid: GUSTAVO, rosterId: 'ficha', notes: [{ id: 'n1', authorUid: MARTIN, text: 'nota' }] },
      },
      log: {
        e1: { actorUid: GUSTAVO, actorName: 'Gustavo', editors: [GUSTAVO, '*'], detail: 'anotó' },
      },
      organizers: {},
    },
    subcollections: {},
  };
  const out = remapTrialBackup(backup, TRIAL);
  assert.deepEqual(out.collections.matches.solo.viewers, [TRIAL]);
  assert.deepEqual(out.collections.matches.solo.adders, [TRIAL]);
  assert.equal(out.collections.matches.solo.viewerNames[0].name, 'Gustavo');
  assert.equal(out.collections.matches.solo.viewerNames[0].uid, TRIAL);
  assert.equal(out.collections.matches.solo.limits[0].uid, TRIAL);
  assert.equal(out.collections.matches.solo.limits[0].max, 3);
  assert.deepEqual(out.collections.matches.abierto.viewers, ['*']);
  assert.deepEqual(out.collections.matches.abierto.adders, ['*']);
  assert.equal(out.collections.matches.abierto.createdByUid, TRIAL);
  assert.equal(out.collections.players.host.name, 'Luis');
  assert.equal(out.collections.players.host.phone, '');
  assert.equal(out.collections.players.host.hasPhone, true);
  assert.equal(out.collections.playerContacts.host.phone, '5491155556666');
  assert.equal(out.collections.playerContacts.host.ownerUid, TRIAL);
  assert.deepEqual(out.collections.players.zzz.viewers, [TRIAL]);
  assert.equal(out.collections.players.host.signedUpWith, TRIAL);
  assert.equal(out.collections.players.zzz.invitedBy, 'host');
  assert.equal(out.collections.players.zzz.invitedByName, 'Luis');
  assert.equal(out.collections.players.zzz.addedByUid, TRIAL);
  assert.deepEqual(Object.keys(out.collections.users).sort(), [TRIAL, 'gustavof.arg@gmail.com'].sort());
  assert.equal(out.collections.credits[`${TRIAL}__ana`].organizerUid, TRIAL);
  assert.equal(out.collections.credits[`${TRIAL}__ana`].organizerName, 'Gustavo');
  assert.equal(out.collections.rosterNotes[`ficha_${TRIAL}`].ownerUid, TRIAL);
  assert.equal(out.collections.rosterNotes[`ficha_${TRIAL}`].notes[0].authorUid, TRIAL);
  assert.equal(out.collections.rosterNotes[`ficha_${TRIAL}`].notes[0].text, 'nota');
  assert.deepEqual(out.collections.log.e1.editors, [TRIAL, '*']);
  assert.equal(out.collections.log.e1.actorName, 'Gustavo');
  assert.equal(backup.collections.matches.solo.createdByUid, GUSTAVO);
});

test('el link corto de la prueba se escribe en dos pasos', () => {
  assert.deepEqual(trialLinkStages({ m: 'solo', p: 'host', t: 'token-anfitrion-prueba' }), [
    { m: 'solo', p: 'host', t: 'token-anfitrion-prueba' },
  ]);
  const staged = trialLinkStages({
    m: 'solo', p: 'host', t: 'token-anfitrion-prueba',
    shortAt: 5, shortProvider: 'spoo', shortUrl: 'https://spoo.me/Abcd123',
  });
  assert.equal(staged.length, 2);
  assert.deepEqual(Object.keys(staged[0]).sort(), ['m', 'p', 't']);
  assert.equal(staged[1].shortUrl, 'https://spoo.me/Abcd123');
});

test('un jugador de la prueba se parte y el que no tiene partido no se escribe', () => {
  const plan = trialPlayerPlan({
    '0qRNjwQQVZRJzjmQVSyu': {
      matchId: 'solo', name: 'Pesado', phone: '11 4444-5555', invitedBy: 'host', invitedByName: 'Luis',
      paid: true, cash: 5000, method: 'mp', goals: 2, confirmToken: 'x', viewers: ['*'],
    },
    nieto: { matchId: 'solo', name: 'Nieto', invitedBy: 'guest', phone: '' },
    guest: { matchId: 'solo', name: 'Invitado', invitedBy: 'host', phone: '' },
    host: { matchId: 'solo', name: 'Luis', phone: '' },
    huerfano: { matchId: 'borrado', name: 'Sin partido', phone: null },
  }, {
    solo: { viewers: ['admin'], adders: ['admin'] },
  });
  const heavy = plan.creates.find((row) => row.id === '0qRNjwQQVZRJzjmQVSyu');
  assert.equal(heavy.data.phone, '');
  assert.equal(heavy.data.invitedBy, undefined);
  assert.equal(heavy.data.paid, undefined);
  assert.equal(heavy.data.confirmToken, undefined);
  assert.deepEqual(heavy.data.viewers, ['admin']);
  assert.equal(plan.invitePatches.find((row) => row.id === '0qRNjwQQVZRJzjmQVSyu').data.invitedBy, 'host');
  assert.equal(plan.invitePatches.some((row) => row.id === 'nieto'), false);
  assert.equal(plan.moneyPatches.find((row) => row.id === '0qRNjwQQVZRJzjmQVSyu').data.paid, true);
  assert.equal(plan.moneyPatches.find((row) => row.id === '0qRNjwQQVZRJzjmQVSyu').data.method, undefined);
  assert.equal(plan.goalPatches.find((row) => row.id === '0qRNjwQQVZRJzjmQVSyu').data.goals, 2);
  assert.deepEqual(plan.skipped, [{ path: 'players/huerfano', reason: 'el partido no está en el backup' }]);
  assert.match(trialBackupResultText(plan.skipped), /No se pudieron guardar 1/);
  assert.match(trialBackupResultText(plan.skipped), /el partido no está en el backup/);
});

test('los anfitriones se escriben antes que el invitado', () => {
  const ops = [
    { kind: 'set', segments: ['matches', 'm'], data: { note: 'm' } },
    { kind: 'set', segments: ['players', 'guest'], data: { name: 'Invitado', invitedBy: 'host' } },
    { kind: 'set', segments: ['players', 'host'], data: { name: 'Luis' } },
    { kind: 'set', segments: ['players', 'otro'], data: { name: 'Ana', invitedBy: 'nadie' } },
  ];
  const ordered = hostsBeforeGuests(ops).map((op) => op.segments.join('/'));
  assert.deepEqual(ordered, ['matches/m', 'players/host', 'players/otro', 'players/guest']);
});

test('el pedido a Firebase manda los enteros como enteros', () => {
  const fields = firestoreRestFields({
    goals: 2,
    paid: true,
    name: 'Luis',
    cash: 4500,
    viewers: ['admin'],
    note: null,
  });
  assert.equal(fields.goals.integerValue, '2');
  assert.equal(fields.cash.integerValue, '4500');
  assert.equal(fields.paid.booleanValue, true);
  assert.equal(fields.name.stringValue, 'Luis');
  assert.equal(fields.viewers.arrayValue.values[0].stringValue, 'admin');
  assert.equal(fields.note.nullValue, null);
});

test('una regla que no se puede evaluar no se reintenta', () => {
  const tooLong = Object.assign(new Error("Unable to evaluate the expression as the maximum of 1000 expressions to evaluate has been reached. for 'update' @ L600"), { code: 'permission-denied' });
  const hidden = Object.assign(new Error("false for 'update' @ L600"), { code: 'permission-denied' });
  const fresh = Object.assign(new Error("false for 'create' @ L600"), { code: 'permission-denied' });
  assert.equal(trialShouldReplace(tooLong), false);
  assert.equal(trialShouldReplace(hidden), true);
  assert.equal(trialShouldReplace(fresh), false);
});

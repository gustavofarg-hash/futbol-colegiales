// El organizador anota en un lugar libre, en la espera, edita el partido
// y completa createdByUid vacío. No toca mis-partidos-prueba.
// firebase emulators:exec --project demo-anotar --only firestore "node --test tests/rules-anotar.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ORG = 'BeHA5u1OoNXj13uMQaEjcxauZdo2';
const MATCH = '2026-11-17_1700';

function matchBody(extra = {}) {
  const body = {
    date: '2026-11-17',
    time: '17:00',
    startsAt: 1794945600000,
    note: '',
    venueId: 'colegiales',
    venueName: 'Polideportivo Colegiales',
    capacity: 14,
    perTeam: 7,
    court: '3',
    price: 5000,
    splitMode: 'equal',
    playerVisible: true,
    source: 'texto',
    createdBy: 'Gus',
    updatedBy: 'Gus',
    createdAt: 1,
    updatedAt: 1,
    playerCount: 0,
    solo: false,
    viewers: ['*'],
    adders: ['*'],
    viewerNames: [],
    adderNames: [],
    limits: [],
    createdByUid: ORG,
    ...extra,
  };
  for (const key of Object.keys(body)) if (body[key] === undefined) delete body[key];
  return body;
}

function playerBody(extra = {}) {
  const now = Date.now();
  return {
    matchId: MATCH,
    matchDate: '2026-11-17',
    name: 'Eduardo Quinteros',
    phone: '',
    addedBy: 'Gus',
    addedByUid: ORG,
    createdAt: now,
    updatedAt: now,
    waiting: false,
    waitOrder: null,
    rosterAt: now,
    confirmToken: 'confirmTokenValue1234',
    hasPhone: false,
    phoneKey: '',
    phoneOwnerUid: '',
    phoneShared: false,
    viewers: ['*'],
    adders: ['*'],
    signedUpWith: ORG,
    signedUpWithName: 'Gusta',
    ...extra,
  };
}

async function denied(promise) {
  try {
    await promise;
    return '';
  } catch (error) {
    return `${error.code || ''} ${error.message || error}`;
  }
}

test('el organizador anota, manda a la espera, edita y completa el uid', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, setDoc, updateDoc, getDocs, query, collection, where } = await import('firebase/firestore');
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-anotar',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: hostname,
      port: Number(portRaw),
    },
  });
  try {
    await testEnv.clearFirestore();
    const admin = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' });
    const adb = admin.firestore();
    await assertSucceeds(setDoc(doc(adb, 'users', 'admin-uid'), {
      role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(adb, 'users', ORG), {
      role: 'organizer', name: 'Gusta', email: 'gustavo@demo.local', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(adb, 'matches', MATCH), matchBody()));
    await assertSucceeds(setDoc(doc(adb, 'matches', 'sin-uid'), matchBody({
      createdByUid: undefined,
      playerVisible: undefined,
      time: '18:00',
    })));
    const org = testEnv.authenticatedContext(ORG, { email: 'gustavo@demo.local' }).firestore();
    const slot = await denied(setDoc(doc(org, 'players', 'alta-lugar'), playerBody()));
    assert.equal(slot, '', slot);
    const counted = await denied(updateDoc(doc(org, 'matches', MATCH), { playerCount: 1, updatedAt: Date.now() }));
    assert.equal(counted, '', counted);
    const waiting = await denied(setDoc(doc(org, 'players', 'alta-espera'), playerBody({
      name: 'En espera',
      waiting: true,
      waitOrder: 1,
      rosterAt: null,
      confirmToken: 'confirmTokenEspera1234',
    })));
    assert.equal(waiting, '', waiting);
    const friend = await denied(setDoc(doc(org, 'players', 'alta-amigo'), playerBody({
      name: 'Amigo',
      invitedBy: 'alta-lugar',
      invitedByName: 'Eduardo Quinteros',
      confirmToken: 'confirmTokenAmigo12345',
    })));
    assert.equal(friend, '', friend);
    const edited = await denied(updateDoc(doc(org, 'matches', MATCH), { note: 'cancha 3', updatedAt: Date.now() }));
    assert.equal(edited, '', edited);
    const filled = await denied(updateDoc(doc(org, 'matches', 'sin-uid'), {
      createdByUid: ORG,
      playerVisible: true,
    }));
    assert.equal(filled, '', filled);
    const logged = await denied(setDoc(doc(org, 'log', 'alta1'), {
      at: Date.now(),
      actorUid: ORG,
      actorName: 'Gusta',
      section: 'partidos',
      type: 'alta',
      matchId: MATCH,
      matchDate: '2026-11-17',
      matchTime: '17:00',
      matchLabel: 'Martes 17/11 17:00',
      editors: ['*'],
      playerName: 'Eduardo Quinteros',
      hostName: '',
      detail: '',
      amount: 0,
      method: '',
    }));
    assert.equal(logged, '', logged);
    const paid = await denied(setDoc(doc(org, 'players', 'con-pago'), playerBody({
      name: 'Con pago',
      paid: true,
      amount: 5000,
      confirmToken: 'confirmTokenPago123456',
    })));
    assert.notEqual(paid, '');

    const anon = testEnv.unauthenticatedContext().firestore();
    const listed = await getDocs(query(
      collection(anon, 'matches'),
      where('viewers', 'array-contains', '*'),
      where('date', '>=', '2026-11-17'),
    ));
    assert.equal(listed.docs.some((item) => item.id === MATCH), true);
    assert.equal(listed.docs.find((item) => item.id === 'sin-uid').data().createdByUid, ORG);
  } finally {
    await testEnv.cleanup();
  }
});

// Carga de un backup de producción en la versión de prueba, con las reglas reales.
// El admin es una cuenta nueva: sus uid no están en el archivo.
//
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-trial-backup.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FirebaseStore } from '../js/store.js';
import { buildBackup } from '../js/backup.js';

const TRIAL = 'BeHA5u1OoNXj13uMQaEjcxauZdo2';
const GUSTAVO = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const MARTIN = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const WHEN = new Date('2026-11-09T15:00:00Z');

function hex(char) {
  return char.repeat(64);
}

function productionBackup() {
  return buildBackup({
    matches: {
      solo: {
        date: '2026-11-12',
        time: '21:00',
        note: 'Solo Gustavo',
        capacity: 14,
        perTeam: 7,
        playerCount: 2,
        viewers: [GUSTAVO],
        adders: [GUSTAVO],
        solo: true,
        createdBy: 'Gustavo',
        createdByUid: GUSTAVO,
        updatedBy: 'Gustavo',
        createdAt: 1,
        updatedAt: 1,
        startsAt: 1,
        source: 'manual',
        venueId: 'polideportivo-colegiales',
        venueName: 'Polideportivo Colegiales',
        viewerNames: [{ uid: GUSTAVO, name: 'Gustavo' }],
        adderNames: [{ uid: GUSTAVO, name: 'Gustavo' }],
      },
      '2026-11-01_0630': {
        date: '2026-11-01',
        time: '06:30',
        note: 'Madrugada',
        capacity: 14,
        perTeam: 7,
        playerCount: 0,
        viewers: [GUSTAVO],
        adders: [GUSTAVO],
        solo: true,
        createdBy: 'Gustavo',
        createdByUid: GUSTAVO,
        createdAt: 1,
        updatedAt: 1,
        startsAt: 1,
        source: 'manual',
      },
      abierto: {
        date: '2026-11-13',
        time: '19:00',
        note: 'Abierto',
        capacity: 14,
        perTeam: 7,
        playerCount: 1,
        viewers: ['*'],
        adders: ['*'],
        solo: false,
        createdBy: 'Martín',
        createdByUid: MARTIN,
        createdAt: 1,
        updatedAt: 1,
        startsAt: 2,
        source: 'manual',
      },
    },
    players: {
      '0qRNjwQQVZRJzjmQVSyu': {
        matchId: 'solo',
        matchDate: '2026-11-12',
        name: 'Pesado',
        phone: '11 4444-5555',
        invitedBy: 'host',
        invitedByName: 'Luis',
        addedBy: 'Gustavo',
        addedByUid: GUSTAVO,
        createdAt: 3,
        updatedAt: 3,
        viewers: ['*'],
        adders: ['*'],
        confirmToken: 'x',
        paid: true,
        cash: 5000,
        method: 'mp',
        goals: 2,
        waiting: false,
      },
      nieto: {
        matchId: 'solo',
        matchDate: '2026-11-12',
        name: 'Nieto',
        phone: '',
        invitedBy: 'guest',
        invitedByName: 'Invitado',
        addedByUid: GUSTAVO,
        createdAt: 4,
        updatedAt: 4,
        viewers: [GUSTAVO],
        adders: [GUSTAVO],
      },
      huerfano: {
        matchId: 'partido-borrado',
        name: 'Sin partido',
        phone: null,
        addedByUid: GUSTAVO,
        viewers: [GUSTAVO],
        adders: [GUSTAVO],
      },
      guest: {
        matchId: 'solo',
        matchDate: '2026-11-12',
        name: 'Invitado',
        phone: '',
        invitedBy: 'host',
        invitedByName: 'Luis',
        addedBy: 'Gustavo',
        addedByUid: GUSTAVO,
        signedUpWith: MARTIN,
        signedUpWithName: 'Martín',
        createdAt: 2,
        updatedAt: 2,
        viewers: [GUSTAVO],
        adders: [GUSTAVO],
        confirmToken: 'token-invitado-prueba-1',
        hasPhone: false,
        waiting: false,
      },
      host: {
        matchId: 'solo',
        matchDate: '2026-11-12',
        name: 'Luis',
        phone: '',
        addedBy: 'Gustavo',
        addedByUid: GUSTAVO,
        signedUpWith: GUSTAVO,
        signedUpWithName: 'Gustavo',
        createdAt: 1,
        updatedAt: 1,
        viewers: [GUSTAVO],
        adders: [GUSTAVO],
        confirmToken: 'token-anfitrion-prueba',
        hasPhone: true,
        phoneKey: hex('a'),
        phoneOwnerUid: GUSTAVO,
        phoneShared: false,
        waiting: false,
        paid: true,
        amount: 5000,
        cash: 5000,
        method: 'efectivo',
      },
      publico: {
        matchId: 'abierto',
        matchDate: '2026-11-13',
        name: 'Ana',
        phone: '5491111111111',
        addedBy: 'Martín',
        addedByUid: MARTIN,
        createdAt: 1,
        updatedAt: 1,
        viewers: ['*'],
        adders: ['*'],
        confirmToken: 'token-publico-prueba-ok',
      },
    },
    playerContacts: {
      host: {
        phone: '5491112223333',
        ownerUid: GUSTAVO,
        visibleToAll: false,
        phoneKey: hex('a'),
        viewers: [GUSTAVO],
      },
    },
    confirmations: {
      'token-anfitrion-prueba': {
        playerId: 'host', matchId: 'solo', name: 'Luis', date: '2026-11-12', time: '21:00', note: '', viewers: [GUSTAVO],
      },
    },
    roster: {
      ficha: {
        name: 'Luis',
        phone: '',
        level: 7,
        createdBy: 'Gustavo',
        createdByUid: GUSTAVO,
        holders: [GUSTAVO, MARTIN],
        createdAt: 1,
      },
    },
    rosterContacts: {
      ficha: {
        phone: '5491112223333',
        ownerUid: GUSTAVO,
        visibleToAll: false,
        phoneKey: hex('a'),
        readers: [MARTIN],
      },
    },
    venues: {
      'polideportivo-colegiales': { name: 'Polideportivo Colegiales', active: true, order: 1, createdAt: 1 },
    },
    organizers: {},
    settings: { prices: { matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 } },
    links: {
      Abcd1234: { m: 'solo', p: 'host', t: 'token-anfitrion-prueba' },
      Wxyz9876: {
        m: 'solo', p: 'host', t: 'token-anfitrion-prueba',
        shortAt: 5, shortProvider: 'spoo', shortUrl: 'https://spoo.me/Abcd123',
      },
      corto: { m: 'solo', p: 'host', t: 'token-anfitrion-prueba' },
    },
    users: {
      [GUSTAVO]: { role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1 },
      [MARTIN]: { role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 2 },
    },
    credits: {
      [`${GUSTAVO}__luis`]: {
        personKey: 'luis', organizerUid: GUSTAVO, organizerName: 'Gustavo', amount: 1500, name: 'Luis', updatedAt: 1, updatedBy: 'Gustavo',
      },
    },
    log: {
      linea1: {
        at: 10,
        actorUid: GUSTAVO,
        actorName: 'Gustavo',
        section: 'partidos',
        type: 'anoto',
        matchId: 'solo',
        matchDate: '2026-11-12',
        matchTime: '21:00',
        matchLabel: 'Jueves',
        editors: [GUSTAVO],
        playerName: 'Luis',
        hostName: '',
        detail: 'anotó',
        amount: 0,
        method: '',
      },
    },
    compensations: {
      '2026-11-12': {
        date: '2026-11-12',
        fingerprint: 'fp',
        changed: false,
        computedAt: 1,
        rows: [{ uid: GUSTAVO, name: 'Gustavo', collected: 5000, entitled: 5000 }],
        transfers: [],
      },
    },
    rosterNotes: {
      [`ficha_${GUSTAVO}`]: {
        ownerUid: GUSTAVO,
        rosterId: 'ficha',
        notes: [{ id: 'n1', matchId: 'solo', text: 'llega tarde', createdAt: 1, authorUid: MARTIN }],
      },
    },
  }, WHEN);
}

function watchOneByOne(store) {
  const fs = store.fs;
  const orig = fs.writeBatch.bind(fs);
  store.fs = new Proxy(fs, {
    get(target, prop) {
      if (prop !== 'writeBatch') return target[prop];
      return (db) => {
        const batch = orig(db);
        const paths = [];
        const origSet = batch.set.bind(batch);
        const origDelete = batch.delete.bind(batch);
        batch.set = (ref, data, ...rest) => { paths.push(ref.path); return origSet(ref, data, ...rest); };
        batch.delete = (ref, ...rest) => { paths.push(ref.path); return origDelete(ref, ...rest); };
        const origCommit = batch.commit.bind(batch);
        batch.commit = async () => {
          if (paths.length > 1) throw Object.assign(new Error('lote grande'), { code: 'permission-denied' });
          return origCommit();
        };
        return batch;
      };
    },
  });
}

test('en /prueba/ un admin nuevo carga el backup de producción y lo ve', { timeout: 120000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const prev = globalThis.location;
  globalThis.location = { pathname: '/futbol-colegiales/prueba/', origin: 'https://gustavofarg-hash.github.io' };
  const fs = await import('firebase/firestore');
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const [hostname, portRaw] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-f7c-trial-backup',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: hostname,
      port: Number(portRaw),
    },
  });
  try {
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext(TRIAL, { email: 'gustavof.arg@gmail.com' }).firestore();
    await fs.setDoc(fs.doc(db, 'users', TRIAL), {
      role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 5, marker: 'vivo',
    });
    // La carga anterior ya dejó este partido, con el uid de producción.
    await fs.setDoc(fs.doc(db, 'matches', '2026-11-01_0630'), {
      date: '2026-11-01', time: '06:30', note: 'viejo', capacity: 14, perTeam: 7, playerCount: 0,
      viewers: [GUSTAVO], adders: [GUSTAVO], solo: true, createdByUid: GUSTAVO, createdAt: 1, updatedAt: 1, startsAt: 1, source: 'manual',
    });
    const store = new FirebaseStore();
    store.actor = { uid: TRIAL, name: 'Gustavo', role: 'admin' };
    store.fs = fs;
    store.db = db;
    watchOneByOne(store);
    const summary = await store.importDatabase(productionBackup());
    assert.ok(summary.failures.some((item) => item.path === 'players/huerfano' && /partido no está/.test(item.reason)));
    assert.ok(summary.failures.some((item) => item.path === 'links/corto'));

    const admin = (await fs.getDoc(fs.doc(db, 'users', TRIAL))).data();
    assert.equal(admin.marker, 'vivo');
    assert.equal(admin.role, 'admin');
    assert.equal((await fs.getDoc(fs.doc(db, 'users', GUSTAVO))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'users', MARTIN))).exists(), false);

    const access = [TRIAL, '*'];
    const matches = await fs.getDocs(fs.query(fs.collection(db, 'matches'), fs.where('viewers', 'array-contains-any', access)));
    const players = await fs.getDocs(fs.query(fs.collection(db, 'players'), fs.where('viewers', 'array-contains-any', access)));
    assert.deepEqual(matches.docs.map((item) => item.id).sort(), ['2026-11-01_0630', 'abierto', 'solo']);
    const early = (await fs.getDoc(fs.doc(db, 'matches', '2026-11-01_0630'))).data();
    assert.equal(early.time, '06:30');
    assert.equal(early.createdByUid, TRIAL);
    assert.deepEqual(early.viewers, [TRIAL]);
    assert.equal((await fs.getDoc(fs.doc(db, 'links', 'Wxyz9876'))).data().shortUrl, 'https://spoo.me/Abcd123');
    assert.deepEqual(players.docs.map((item) => item.id).sort(), ['0qRNjwQQVZRJzjmQVSyu', 'guest', 'host', 'nieto', 'publico']);
    const heavy = (await fs.getDoc(fs.doc(db, 'players', '0qRNjwQQVZRJzjmQVSyu'))).data();
    assert.equal(heavy.phone, '');
    assert.equal(heavy.invitedBy, 'host');
    assert.equal(heavy.paid, true);
    assert.equal(heavy.goals, 2);
    assert.equal(heavy.method, undefined);
    assert.equal((await fs.getDoc(fs.doc(db, 'players', 'nieto'))).data().invitedBy, undefined);
    assert.equal((await fs.getDoc(fs.doc(db, 'players', 'huerfano'))).exists(), false);

    const solo = (await fs.getDoc(fs.doc(db, 'matches', 'solo'))).data();
    assert.deepEqual(solo.viewers, [TRIAL]);
    assert.deepEqual(solo.adders, [TRIAL]);
    assert.equal(solo.createdByUid, TRIAL);
    assert.equal(solo.note, 'Solo Gustavo');
    const guest = (await fs.getDoc(fs.doc(db, 'players', 'guest'))).data();
    assert.equal(guest.invitedBy, 'host');
    assert.equal(guest.invitedByName, 'Luis');
    assert.equal(guest.addedByUid, TRIAL);
    assert.equal(guest.signedUpWith, TRIAL);
    assert.equal(guest.signedUpWithName, 'Martín');
    const host = (await fs.getDoc(fs.doc(db, 'players', 'host'))).data();
    assert.equal(host.phoneOwnerUid, TRIAL);
    assert.equal(host.name, 'Luis');
    assert.equal((await fs.getDoc(fs.doc(db, 'playerContacts', 'host'))).data().ownerUid, TRIAL);
    assert.equal((await fs.getDoc(fs.doc(db, 'credits', `${TRIAL}__luis`))).data().amount, 1500);
    assert.equal((await fs.getDoc(fs.doc(db, 'rosterNotes', `ficha_${TRIAL}`))).data().notes[0].text, 'llega tarde');
    assert.deepEqual((await fs.getDoc(fs.doc(db, 'log', 'linea1'))).data().editors, [TRIAL]);
    assert.equal((await fs.getDoc(fs.doc(db, 'roster', 'ficha'))).data().holders[0], TRIAL);
    const listed = await fs.getDocs(fs.query(
      fs.collection(db, 'log'),
      fs.where('editors', 'array-contains-any', access),
    ));
    assert.equal(listed.size, 1);
    await store.importDatabase(productionBackup());
    assert.equal((await fs.getDoc(fs.doc(db, 'matches', '2026-11-01_0630'))).data().note, 'Madrugada');
    assert.equal((await fs.getDoc(fs.doc(db, 'users', TRIAL))).data().marker, 'vivo');
  } finally {
    if (prev === undefined) delete globalThis.location;
    else globalThis.location = prev;
    await testEnv.cleanup();
  }
});

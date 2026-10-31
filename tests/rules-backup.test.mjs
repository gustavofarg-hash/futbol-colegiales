// Carga de backup contra las reglas reales. El emulador no aplica el tope de
// 20 get() ni el de 1000 expresiones: un lote de 400 allá pasa y en producción
// Firebase responde "Missing or insufficient permissions". Este test imita ese
// tope (un commit con más de 20 escrituras se niega) y usa datos realistas,
// incluida la colección users con el propio documento del admin.
//
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-backup.test.mjs"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FirebaseStore } from '../js/store.js';
import { BACKUP_COLLECTIONS, buildBackup } from '../js/backup.js';

const WHEN = new Date('2026-10-27T18:05:30Z');
const ADMIN = {
  role: 'admin',
  name: 'Gustavo',
  email: 'gustavof.arg@gmail.com',
  active: true,
  createdAt: 111,
  marker: 'vivo',
};

function hex(char) {
  return char.repeat(64);
}

function matchDoc(i) {
  const day = String((i % 27) + 1).padStart(2, '0');
  return {
    date: `2026-08-${day}`,
    time: '21:00',
    note: `Partido ${i}`,
    capacity: 14,
    perTeam: 7,
    playerCount: 1,
    viewers: ['*'],
    adders: ['*'],
    solo: false,
    createdBy: 'Gustavo',
    createdByUid: 'admin-uid',
    updatedBy: 'Gustavo',
    createdAt: 1,
    updatedAt: 1,
    startsAt: 1,
    source: 'manual',
    venueId: 'polideportivo-colegiales',
    venueName: 'Polideportivo Colegiales',
  };
}

function realisticBackup() {
  const matches = {};
  const players = {};
  const playerContacts = {};
  const confirmations = {};
  for (let i = 0; i < 30; i++) {
    const id = `m${String(i).padStart(2, '0')}`;
    const pid = `p${String(i).padStart(2, '0')}`;
    const token = `token-jugador-${String(i).padStart(2, '0')}-ok`;
    matches[id] = matchDoc(i);
    players[pid] = {
      matchId: id,
      matchDate: matches[id].date,
      name: `Jugador ${i}`,
      phone: '',
      addedBy: 'Gustavo',
      addedByUid: 'admin-uid',
      createdAt: 1,
      updatedAt: 1,
      viewers: ['*'],
      adders: ['*'],
      confirmToken: token,
      hasPhone: true,
      phoneKey: hex('c'),
      phoneOwnerUid: 'admin-uid',
      phoneShared: false,
      waiting: false,
    };
    playerContacts[pid] = {
      phone: '5491111112222',
      ownerUid: 'admin-uid',
      visibleToAll: true,
      phoneKey: hex('c'),
      viewers: ['*'],
    };
    confirmations[token] = {
      playerId: pid,
      matchId: id,
      name: `Jugador ${i}`,
      date: matches[id].date,
      time: '21:00',
      note: '',
      viewers: ['*'],
    };
  }
  players.legado = {
    matchId: 'm00',
    matchDate: '2026-08-01',
    name: 'Con teléfono viejo',
    phone: '5491111111111',
    addedBy: 'Gustavo',
    addedByUid: 'admin-uid',
    createdAt: 1,
    updatedAt: 1,
    viewers: ['*'],
    adders: ['*'],
  };
  const backup = buildBackup({
    matches,
    players,
    playerContacts,
    confirmations,
    roster: {
      ana: { name: 'Ana', phone: '', level: 6.5, createdBy: 'Gustavo', createdByUid: 'admin-uid', createdAt: 1 },
    },
    venues: {
      'polideportivo-colegiales': { name: 'Polideportivo Colegiales', active: true, order: 1, createdAt: 1 },
    },
    organizers: { gustavo: { name: 'Gustavo', createdAt: 1 } },
    settings: { prices: { matchPrice: 5000, promo2Price: 9000, promo3Price: 12000 } },
    links: { Abcd1234: { m: 'm00', p: 'p00', t: 'token-jugador-00-ok' } },
    users: {
      'admin-uid': { role: 'organizer', name: 'PISADO', email: 'gustavof.arg@gmail.com', active: false, createdAt: 1 },
      'org-uid': { role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 2 },
    },
  }, WHEN);
  return backup;
}

function attachStore(db, fs, uid = 'admin-uid') {
  const store = new FirebaseStore();
  store.actor = { uid, name: 'Gustavo', role: uid === 'admin-uid' ? 'admin' : 'organizer' };
  store.fs = fs;
  store.db = db;
  return store;
}

// El emulador deja pasar lotes que producción niega. Si el commit trae más de
// 20 operaciones, se imita ese rechazo.
function watchCommits(store, { failPath = '' } = {}) {
  const sizes = [];
  const fs = store.fs;
  const orig = fs.writeBatch.bind(fs);
  const writeBatch = (db) => {
    const batch = orig(db);
    const paths = [];
    const origSet = batch.set.bind(batch);
    const origDelete = batch.delete.bind(batch);
    batch.set = (ref, data, ...rest) => {
      paths.push(ref.path);
      return origSet(ref, data, ...rest);
    };
    batch.delete = (ref, ...rest) => {
      paths.push(ref.path);
      return origDelete(ref, ...rest);
    };
    const origCommit = batch.commit.bind(batch);
    batch.commit = async () => {
      sizes.push(paths.length);
      if (paths.length > 20 || (failPath && paths.some((path) => path.endsWith(failPath)))) {
        throw Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' });
      }
      return origCommit();
    };
    return batch;
  };
  store.fs = new Proxy(fs, {
    get(target, prop) {
      if (prop === 'writeBatch') return writeBatch;
      return target[prop];
    },
  });
  return sizes;
}

async function openEnv(projectId = 'demo-f7c-backup') {
  const { initializeTestEnvironment } = await import('@firebase/rules-unit-testing');
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  return initializeTestEnvironment({
    projectId,
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: hostname,
      port: Number(portRaw),
    },
  });
}

test('cargar un backup realista no pisa al admin y no manda lotes que producción niega', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const fs = await import('firebase/firestore');
  const testEnv = await openEnv();
  try {
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' }).firestore();
    await fs.setDoc(fs.doc(db, 'users', 'admin-uid'), ADMIN);
    await fs.setDoc(fs.doc(db, 'users', 'viejo'), {
      role: 'organizer', name: 'Viejo', email: 'viejo@demo.local', active: true, createdAt: 1,
    });
    await fs.setDoc(fs.doc(db, 'matches', 'sin-viewers'), { date: '2026-07-01', time: '21:00', note: 'viejo' });
    await fs.setDoc(fs.doc(db, 'venues', 'borrar-sede'), { name: 'Otra', active: true, order: 2, createdAt: 1 });

    const store = attachStore(db, fs);
    const sizes = watchCommits(store);
    const backup = realisticBackup();
    const summary = await store.importDatabase(backup);
    assert.equal(summary.counts.matches, 30);
    assert.equal(summary.counts.players, 31);
    assert.ok(sizes.length > 20);
    assert.ok(sizes.every((n) => n === 1), `lotes: ${sizes.join(',')}`);

    const admin = await fs.getDoc(fs.doc(db, 'users', 'admin-uid'));
    assert.deepEqual(admin.data(), ADMIN);
    assert.equal((await fs.getDoc(fs.doc(db, 'users', 'viejo'))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'users', 'org-uid'))).data().name, 'Martín');
    assert.equal((await fs.getDoc(fs.doc(db, 'matches', 'sin-viewers'))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'matches', 'm00'))).data().note, 'Partido 0');
    assert.equal((await fs.getDoc(fs.doc(db, 'players', 'legado'))).data().phone, '5491111111111');
    assert.equal((await fs.getDoc(fs.doc(db, 'playerContacts', 'p00'))).data().phone, '5491111112222');
    assert.equal((await fs.getDoc(fs.doc(db, 'venues', 'borrar-sede'))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'settings', 'prices'))).data().matchPrice, 5000);
    await fs.setDoc(fs.doc(db, 'matches', 'despues'), matchDoc(3));

    const again = await store.exportDatabase({ when: WHEN });
    assert.equal(again.collections.users['admin-uid'].name, 'Gustavo');
    assert.equal(again.collections.users['admin-uid'].role, 'admin');
    assert.equal(again.collections.users['admin-uid'].active, true);
    assert.equal(again.collections.users['admin-uid'].marker, 'vivo');
    assert.equal(again.collections.users.viejo, undefined);
    assert.equal(Object.keys(again.collections.matches).length, 31);

    const org = attachStore(db, fs, 'org-uid');
    await assert.rejects(() => org.importDatabase(backup), (error) => error.code === 'admin-only');
    await assert.rejects(() => org.resetDatabase(), (error) => error.code === 'admin-only');

    await store.resetDatabase();
    assert.equal((await fs.getDoc(fs.doc(db, 'matches', 'm00'))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'players', 'p00'))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'playerContacts', 'p00'))).exists(), false);
    assert.deepEqual((await fs.getDoc(fs.doc(db, 'users', 'admin-uid'))).data(), ADMIN);
    assert.equal((await fs.getDoc(fs.doc(db, 'users', 'org-uid'))).data().role, 'organizer');
    await fs.setDoc(fs.doc(db, 'matches', 'tras-reset'), matchDoc(4));
  } finally {
    await testEnv.cleanup();
  }
});

test('si una escritura del backup falla, el error nombra el documento y no deshace lo ya cargado', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const fs = await import('firebase/firestore');
  const testEnv = await openEnv();
  try {
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' }).firestore();
    await fs.setDoc(fs.doc(db, 'users', 'admin-uid'), ADMIN);
    const store = attachStore(db, fs);
    watchCommits(store, { failPath: 'players/falla' });
    const backup = buildBackup({
      matches: { m00: matchDoc(0) },
      players: { falla: { ...realisticPlayer(), name: 'Falla' }, zzz: { ...realisticPlayer(), name: 'Después' } },
      users: {
        'admin-uid': { role: 'organizer', name: 'PISADO', email: 'gustavof.arg@gmail.com', active: false, createdAt: 1 },
      },
    }, WHEN);
    await assert.rejects(() => store.importDatabase(backup), (error) => {
      assert.match(error.message, /No se pudo guardar players\/falla/);
      assert.match(error.message, /Firebase rechazó el permiso/);
      return true;
    });
    assert.equal((await fs.getDoc(fs.doc(db, 'matches', 'm00'))).exists(), true);
    assert.equal((await fs.getDoc(fs.doc(db, 'players', 'falla'))).exists(), false);
    assert.deepEqual((await fs.getDoc(fs.doc(db, 'users', 'admin-uid'))).data(), ADMIN);
  } finally {
    await testEnv.cleanup();
  }
});

function linkCode(i) {
  return `L${i.toString(36).padStart(7, '0')}`.slice(0, 8);
}

function confirmToken(i) {
  return `confirm-${String(i).padStart(4, '0')}-token`;
}

/** Los mismos tamaños que el backup con el que Gustavo vio el error. */
function gustavoSizedBackup() {
  const matches = {};
  const players = {};
  const roster = {};
  const playerContacts = {};
  const rosterContacts = {};
  const confirmations = {};
  const links = {};
  for (let i = 0; i < 28; i++) matches[`m${String(i).padStart(2, '0')}`] = matchDoc(i);
  for (let i = 0; i < 122; i++) {
    const id = `pl${String(i).padStart(3, '0')}`;
    const doc = {
      matchId: 'm00',
      matchDate: '2026-08-01',
      name: `Jugador ${i}`,
      phone: '',
      addedBy: 'Gustavo',
      addedByUid: 'admin-uid',
      createdAt: 1,
      updatedAt: 1,
      viewers: ['*'],
      adders: ['*'],
      confirmToken: confirmToken(i),
    };
    if (i === 5) doc.phone = '5491111111111';
    if (i === 6) {
      doc.paid = true;
      doc.amount = 5000;
      doc.method = 'transferencia';
      doc.goals = 1;
      doc.inGoal = true;
      doc.inGoalAt = 10;
    }
    if (i > 0 && i % 17 === 0) doc.invitedBy = `pl${String(i - 1).padStart(3, '0')}`;
    if (i === 0) doc.invitedBy = 'pl121';
    players[id] = doc;
  }
  for (let i = 0; i < 61; i++) {
    roster[`r${String(i).padStart(2, '0')}`] = {
      name: `Plantel ${i}`,
      phone: '',
      level: 6.5,
      createdBy: 'Gustavo',
      createdByUid: 'admin-uid',
      createdAt: 1,
    };
  }
  for (let i = 0; i < 42; i++) {
    const id = `pl${String(i).padStart(3, '0')}`;
    playerContacts[id] = {
      phone: '5491111112222',
      ownerUid: i % 2 === 0 ? 'admin-uid' : 'org-uid',
      visibleToAll: i % 2 === 0,
      phoneKey: hex('c'),
      viewers: i % 2 === 0 ? ['*'] : ['org-uid'],
    };
  }
  for (let i = 0; i < 18; i++) {
    rosterContacts[`r${String(i).padStart(2, '0')}`] = {
      phone: '5491111113333',
      ownerUid: 'admin-uid',
      visibleToAll: false,
      phoneKey: hex('d'),
    };
  }
  for (let i = 0; i < 144; i++) {
    const card = {
      playerId: `pl${String(i % 122).padStart(3, '0')}`,
      matchId: 'm00',
      name: `Jugador ${i % 122}`,
      date: '2026-08-01',
      time: '21:00',
      note: '',
    };
    if (i % 5 !== 0) card.viewers = ['*'];
    confirmations[confirmToken(i)] = card;
  }
  for (let i = 0; i < 478; i++) {
    const id = i === 7 ? 'corto' : linkCode(i);
    const doc = { m: 'm00', p: 'pl000', t: confirmToken(0) };
    if (i % 10 === 0) {
      doc.shortAt = 1;
      doc.shortProvider = 'spoo';
      doc.shortUrl = 'https://spoo.me/Abcd123';
    }
    links[id] = doc;
  }
  return buildBackup({
    matches,
    players,
    roster,
    venues: {
      'polideportivo-colegiales': { name: 'Polideportivo Colegiales', active: true, order: 1, createdAt: 1 },
      norte: { name: 'Club Norte', active: true, order: 2, createdAt: 1 },
      sur: { name: 'Club Sur', active: false, order: 3, createdAt: 1 },
    },
    organizers: {},
    settings: {},
    confirmations,
    playerContacts,
    rosterContacts,
    links,
    users: {
      'admin-uid': { role: 'organizer', name: 'PISADO', email: 'gustavof.arg@gmail.com', active: false, createdAt: 1 },
      'gustavof.arg@gmail.com': { role: 'admin', name: 'Por mail', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1 },
      'org-uid': { role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 2 },
    },
  }, WHEN);
}

async function listOrThrow(fs, db, name) {
  try {
    return await fs.getDocs(fs.collection(db, name));
  } catch (error) {
    throw new Error(`No se pudo listar ${name}: ${error?.code || ''} ${error?.message || error}`);
  }
}

test('el backup del tamaño real se carga, el admin sigue por uid y el error no es el texto crudo', { timeout: 180000 }, async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { assertFails } = await import('@firebase/rules-unit-testing');
  const fs = await import('firebase/firestore');
  const testEnv = await openEnv('demo-f7c-size');
  try {
    await testEnv.clearFirestore();
    const db = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' }).firestore();
    await fs.setDoc(fs.doc(db, 'users', 'admin-uid'), ADMIN);
    await fs.setDoc(fs.doc(db, 'users', 'gustavof.arg@gmail.com'), {
      role: 'admin', name: 'Por mail', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1,
    });
    await fs.setDoc(fs.doc(db, 'users', 'viejo'), {
      role: 'organizer', name: 'Viejo', email: 'viejo@demo.local', active: true, createdAt: 1,
    });
    await fs.setDoc(fs.doc(db, 'organizers', 'viejo'), { name: 'Viejo', createdAt: 1 });
    await fs.setDoc(fs.doc(db, 'settings', 'prices'), { matchPrice: 1, promo2Price: 2, promo3Price: 3 });
    await fs.setDoc(fs.doc(db, 'settings', 'otro'), { extra: true });
    await fs.setDoc(fs.doc(db, 'matches', 'sin-viewers'), { date: '2026-07-01', time: '21:00', note: 'viejo' });
    await fs.setDoc(fs.doc(db, 'venues', 'borrar-sede'), { name: 'Otra', active: true, order: 9, createdAt: 1 });
    await fs.setDoc(fs.doc(db, 'links', 'zzzzzzzz'), { m: 'm00', p: 'pl000', t: confirmToken(0) });
    await fs.setDoc(fs.doc(db, 'confirmations', confirmToken(200)), {
      playerId: 'pl000', matchId: 'm00', name: 'Jugador 0', date: '2026-08-01', time: '21:00', note: '',
    });
    await fs.setDoc(fs.doc(db, 'playerContacts', 'ajeno'), {
      phone: '5491111114444', ownerUid: 'org-uid', visibleToAll: false, phoneKey: hex('e'), viewers: ['org-uid'],
    });

    for (const name of BACKUP_COLLECTIONS) await listOrThrow(fs, db, name);

    const byEmail = testEnv.authenticatedContext('otro-uid', { email: 'gustavof.arg@gmail.com' }).firestore();
    await assertFails(fs.getDocs(fs.collection(byEmail, 'links')));

    const store = attachStore(db, fs);
    const sizes = watchCommits(store);
    const backup = gustavoSizedBackup();
    assert.deepEqual(backup.collections && Object.fromEntries(BACKUP_COLLECTIONS.map((name) => [name, Object.keys(backup.collections[name]).length])), {
      matches: 28,
      players: 122,
      roster: 61,
      venues: 3,
      organizers: 0,
      settings: 0,
      confirmations: 144,
      playerContacts: 42,
      rosterContacts: 18,
      links: 478,
      users: 3,
      credits: 0,
      log: 0,
      compensations: 0,
    });
    const summary = await store.importDatabase(backup);
    assert.deepEqual(summary.counts, {
      matches: 28, players: 122, roster: 61, venues: 3, organizers: 0, settings: 0,
      confirmations: 144, playerContacts: 42, rosterContacts: 18, links: 478, users: 3, credits: 0, log: 0, compensations: 0,
    });
    assert.ok(sizes.length > 20);
    assert.ok(sizes.every((n) => n === 1), `lotes: ${sizes.slice(0, 8).join(',')}… (${sizes.length})`);

    assert.deepEqual((await fs.getDoc(fs.doc(db, 'users', 'admin-uid'))).data(), ADMIN);
    assert.equal((await fs.getDoc(fs.doc(db, 'users', 'viejo'))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'users', 'gustavof.arg@gmail.com'))).data().name, 'Por mail');
    assert.equal((await fs.getDoc(fs.doc(db, 'users', 'org-uid'))).data().role, 'organizer');
    assert.equal((await listOrThrow(fs, db, 'matches')).size, 28);
    assert.equal((await listOrThrow(fs, db, 'players')).size, 122);
    assert.equal((await listOrThrow(fs, db, 'links')).size, 478);
    assert.equal((await fs.getDoc(fs.doc(db, 'links', 'corto'))).exists(), true);
    assert.equal((await fs.getDoc(fs.doc(db, 'players', 'pl005'))).data().phone, '5491111111111');
    assert.equal((await listOrThrow(fs, db, 'organizers')).size, 0);
    assert.equal((await listOrThrow(fs, db, 'settings')).size, 0);
    assert.equal((await fs.getDoc(fs.doc(db, 'matches', 'sin-viewers'))).exists(), false);
    assert.equal((await fs.getDoc(fs.doc(db, 'links', 'zzzzzzzz'))).exists(), false);
    await fs.setDoc(fs.doc(db, 'matches', 'despues'), matchDoc(1));
    await assertFails(fs.getDocs(fs.collection(byEmail, 'links')));
  } finally {
    await testEnv.cleanup();
  }
});

function realisticPlayer() {
  return {
    matchId: 'm00',
    matchDate: '2026-08-01',
    name: 'Alguien',
    phone: '',
    addedBy: 'Gustavo',
    addedByUid: 'admin-uid',
    createdAt: 1,
    updatedAt: 1,
    viewers: ['*'],
    adders: ['*'],
  };
}

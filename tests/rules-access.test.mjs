// Permisos por partido. No toca el proyecto futbol-partidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MATCH = '2026-11-04_1800';

test('backup: el admin lee un Solo yo ajeno y otro organizador no', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, getDocs, query, collection, where } = await import('firebase/firestore');

  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const [hostname, portRaw] = host.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-f7c',
    firestore: {
      rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'),
      host: hostname,
      port: Number(portRaw),
    },
  });

  const solo = {
    date: '2026-11-04', time: '18:00', note: '', capacity: 14,
    solo: true, viewers: ['org-uid'], adders: ['org-uid'],
    viewerNames: [{ uid: 'org-uid', name: 'Martín' }],
    adderNames: [{ uid: 'org-uid', name: 'Martín' }],
    limits: [], createdByUid: 'org-uid', createdBy: 'Martín',
  };

  try {
    await testEnv.clearFirestore();
    const admin = testEnv.authenticatedContext('admin-uid', { email: 'gustavof.arg@gmail.com' });
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'admin-uid'), {
      role: 'admin', name: 'Gustavo', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'org-uid'), {
      role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 1,
    }));
    const org = testEnv.authenticatedContext('org-uid', { email: 'martin@demo.local' });
    await assertSucceeds(setDoc(doc(org.firestore(), 'matches', MATCH), solo));
    await assertSucceeds(setDoc(doc(org.firestore(), 'players', 'privado'), {
      matchId: MATCH, matchDate: '2026-11-04', name: 'Privado', phone: '',
      addedBy: 'Martín', addedByUid: 'org-uid', createdAt: 1, updatedAt: 1,
      viewers: ['org-uid'], adders: ['org-uid'],
    }));
    await assertSucceeds(setDoc(doc(org.firestore(), 'confirmations', 'token-privado-1234567890'), {
      playerId: 'privado', matchId: MATCH, name: 'Privado', date: '2026-11-04', time: '18:00', note: '',
      viewers: ['org-uid'],
    }));

    await assertSucceeds(setDoc(doc(admin.firestore(), 'users', 'other-uid'), {
      role: 'organizer', name: 'Otro', email: 'otro@demo.local', active: true, createdAt: 1,
    }));
    await assertSucceeds(setDoc(doc(org.firestore(), 'playerContacts', 'privado'), {
      phone: '5491111111111', ownerUid: 'org-uid', visibleToAll: false,
      phoneKey: 'a'.repeat(64), viewers: ['org-uid'],
    }));
    const stranger = testEnv.authenticatedContext('other-uid', { email: 'otro@demo.local' });
    const adminDb = admin.firestore();
    await assertSucceeds(getDoc(doc(adminDb, 'matches', MATCH)));
    await assertSucceeds(getDoc(doc(adminDb, 'players', 'privado')));
    await assertSucceeds(getDoc(doc(adminDb, 'playerContacts', 'privado')));
    await assertFails(getDoc(doc(stranger.firestore(), 'matches', MATCH)));
    await assertFails(getDoc(doc(stranger.firestore(), 'players', 'privado')));
    await assertFails(getDoc(doc(stranger.firestore(), 'playerContacts', 'privado')));
    const all = await getDocs(collection(adminDb, 'matches'));
    assert.equal(all.docs.some((item) => item.id === MATCH), true);
    await assertFails(getDocs(collection(stranger.firestore(), 'matches')));
    const listed = await getDocs(query(collection(org.firestore(), 'matches'), where('viewers', 'array-contains-any', ['org-uid', '*'])));
    assert.equal(listed.docs.some((item) => item.id === MATCH), true);
    const adminCards = await getDocs(collection(adminDb, 'confirmations'));
    assert.equal(adminCards.docs.some((item) => item.id === 'token-privado-1234567890'), true);

    await assertSucceeds(setDoc(doc(org.firestore(), 'matches', 'viejo'), {
      date: '2026-11-05', time: '19:00', note: '',
    }));
    await assertSucceeds(getDoc(doc(adminDb, 'matches', 'viejo')));
    await assertSucceeds(getDoc(doc(org.firestore(), 'matches', 'viejo')));
  } finally {
    await testEnv.cleanup();
  }
});

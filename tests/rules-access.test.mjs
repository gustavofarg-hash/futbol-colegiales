// Permisos por partido. No toca el proyecto futbol-partidos.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const MATCH = '2026-11-04_1800';

test('solo yo: el admin no ve el partido de otro ni anota', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, getDoc, setDoc, updateDoc, getDocs, query, collection, where } = await import('firebase/firestore');

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

    const adminDb = admin.firestore();
    await assertFails(getDoc(doc(adminDb, 'matches', MATCH)));
    await assertFails(getDoc(doc(adminDb, 'players', 'privado')));
    await assertFails(setDoc(doc(adminDb, 'players', 'intruso'), {
      matchId: MATCH, matchDate: '2026-11-04', name: 'Intruso', phone: '',
      addedBy: 'Gustavo', addedByUid: 'admin-uid', createdAt: 2, updatedAt: 2,
      viewers: ['org-uid'], adders: ['org-uid'],
    }));
    await assertFails(updateDoc(doc(adminDb, 'matches', MATCH), { note: 'no' }));
    const hidden = await getDocs(query(collection(adminDb, 'matches'), where('viewers', 'array-contains-any', ['admin-uid', '*'])));
    assert.equal(hidden.docs.some((item) => item.id === MATCH), false);
    const listed = await getDocs(query(collection(org.firestore(), 'matches'), where('viewers', 'array-contains-any', ['org-uid', '*'])));
    assert.equal(listed.docs.some((item) => item.id === MATCH), true);
    const adminList = await getDocs(query(collection(adminDb, 'confirmations'), where('viewers', 'array-contains-any', ['admin-uid', '*'])));
    assert.equal(adminList.docs.some((item) => item.id === 'token-privado-1234567890'), false);

    await assertSucceeds(setDoc(doc(org.firestore(), 'matches', 'viejo'), {
      date: '2026-11-05', time: '19:00', note: '',
    }));
    await assertSucceeds(getDoc(doc(adminDb, 'matches', 'viejo')));
    await assertSucceeds(getDoc(doc(org.firestore(), 'matches', 'viejo')));
  } finally {
    await testEnv.cleanup();
  }
});

// Apodo editable desde Editar jugador (f7c-v62). El admin cambia el apodo de
// una ficha de Jugadores ajena, el organizador que puede anotar en el partido
// cambia el apodo del jugador aunque lo haya agregado otro, y nadie más.
// Se salta si no hay emulador:
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-apodo.test.mjs"
import test from 'node:test';
import { readFileSync } from 'node:fs';

const MATCH = '2026-10-22_2100';

test('apodo: admin en ficha ajena, organizador en jugador ajeno', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, setDoc, updateDoc, deleteField, setLogLevel } = await import('firebase/firestore');
  setLogLevel('silent');
  const [hostname, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-f7c-apodo',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: hostname, port: Number(port) },
  });
  try {
    await testEnv.clearFirestore();
    const admin = testEnv.authenticatedContext('gus-uid', { email: 'gustavof.arg@gmail.com' }).firestore();
    await assertSucceeds(setDoc(doc(admin, 'users', 'gus-uid'), { role: 'admin', name: 'Gus', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1 }));
    await assertSucceeds(setDoc(doc(admin, 'users', 'org-uid'), { role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 1 }));
    await assertSucceeds(setDoc(doc(admin, 'users', 'otro-uid'), { role: 'organizer', name: 'Otro', email: 'otro@demo.local', active: true, createdAt: 1 }));
    const org = testEnv.authenticatedContext('org-uid', { email: 'martin@demo.local' }).firestore();
    const otro = testEnv.authenticatedContext('otro-uid', { email: 'otro@demo.local' }).firestore();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, 'matches', MATCH), {
        date: '2026-10-22', time: '21:00', note: '', viewers: ['*'], adders: ['org-uid'], viewerNames: [], adderNames: [], limits: [], solo: false, createdByUid: 'gus-uid',
      });
      // Ficha de Martín, con apodo.
      await setDoc(doc(db, 'roster', 'vini'), {
        name: 'Vinicio Ron Cruz Jefferson', shortName: 'Vini', phone: '', createdBy: 'Martín', createdByUid: 'org-uid', createdAt: 1, updatedAt: 1,
      });
      const base = (n) => ({
        matchId: MATCH, matchDate: '2026-10-22', phone: '', createdAt: n, updatedAt: n,
        waiting: false, waitOrder: null, rosterAt: n, confirmToken: `tokentokentoken${n}`.padEnd(24, 'x'),
        hasPhone: false, phoneKey: '', phoneOwnerUid: '', phoneShared: false, viewers: ['*'], adders: ['org-uid'],
        signedUpWith: 'gus-uid', signedUpWithName: 'Gus', shortCode: `abcdefg${n}`,
      });
      // Lo agregó Gus (admin), con ficha de Martín.
      await setDoc(doc(db, 'players', 'p-vini'), { ...base(1), name: 'Vinicio Ron Cruz Jefferson', rosterId: 'vini', shortName: 'Vini', addedBy: 'Gus', addedByUid: 'gus-uid' });
      // Lo agregó Gus, sin ficha.
      await setDoc(doc(db, 'players', 'p-rami'), { ...base(2), name: 'Ramiro Maffioli', addedBy: 'Gus', addedByUid: 'gus-uid' });
    });

    // Admin: apodo de la ficha de Martín, y la copia en el jugador.
    await assertSucceeds(updateDoc(doc(admin, 'roster', 'vini'), { shortName: 'Vinny', updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(admin, 'players', 'p-vini'), { shortName: 'Vinny', updatedAt: 2 }));
    await assertSucceeds(updateDoc(doc(admin, 'roster', 'vini'), { shortName: deleteField(), updatedAt: 3 }));
    // Admin: jugador sin ficha.
    await assertSucceeds(updateDoc(doc(admin, 'players', 'p-rami'), { shortName: 'Rami', updatedAt: 3 }));

    // Martín puede anotar en el partido: cambia el apodo del jugador que agregó Gus...
    await assertSucceeds(updateDoc(doc(org, 'players', 'p-rami'), { shortName: 'Ramita', updatedAt: 4 }));
    await assertSucceeds(updateDoc(doc(org, 'players', 'p-vini'), { shortName: deleteField(), updatedAt: 4 }));
    // ...pero no el nombre.
    await assertFails(updateDoc(doc(org, 'players', 'p-rami'), { name: 'Otro nombre', updatedAt: 5 }));
    // Martín sí cambia el apodo de su propia ficha.
    await assertSucceeds(updateDoc(doc(org, 'roster', 'vini'), { shortName: 'Vini', updatedAt: 5 }));

    // Otro organizador, que no puede anotar en este partido, no toca nada.
    await assertFails(updateDoc(doc(otro, 'players', 'p-rami'), { shortName: 'X', updatedAt: 6 }));
    await assertFails(updateDoc(doc(otro, 'roster', 'vini'), { shortName: 'X', updatedAt: 6 }));
    // Apodo largo o raro: lo sigue frenando validPlayer.
    await assertFails(updateDoc(doc(org, 'players', 'p-rami'), { shortName: 'x'.repeat(200), updatedAt: 7 }));
  } finally {
    await testEnv.cleanup();
  }
});

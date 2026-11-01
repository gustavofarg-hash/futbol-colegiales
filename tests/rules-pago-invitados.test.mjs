// Pago dividido entre él y sus invitados. Con las reglas viejas, el update de
// un invitado pasaba el tope de 1000 expresiones por request de Firestore y se
// negaba, también al admin (la regla larga de players se evalúa antes que el
// cierre del admin y gasta todo el tope). Se salta si no hay emulador:
//   firebase emulators:exec --project demo-f7c --only firestore "node --test tests/rules-pago-invitados.test.mjs"
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { paymentRecord, receivePendingTransfer } from '../js/payments.js';

const MATCH = '2026-10-30_2100';

test('pago dividido: él y sus 3 invitados se guardan (admin y organizador)', async (t) => {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    t.skip('sin emulador de Firestore');
    return;
  }
  const { initializeTestEnvironment, assertFails, assertSucceeds } = await import('@firebase/rules-unit-testing');
  const { doc, setDoc, updateDoc, setLogLevel } = await import('firebase/firestore');
  setLogLevel('silent');
  const [hostname, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  const testEnv = await initializeTestEnvironment({
    projectId: 'demo-f7c-invitados',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8'), host: hostname, port: Number(port) },
  });
  try {
    await testEnv.clearFirestore();
    const adminCtx = testEnv.authenticatedContext('gus-uid', { email: 'gustavof.arg@gmail.com' });
    const admin = adminCtx.firestore();
    await assertSucceeds(setDoc(doc(admin, 'users', 'gus-uid'), { role: 'admin', name: 'Gus', email: 'gustavof.arg@gmail.com', active: true, createdAt: 1 }));
    await assertSucceeds(setDoc(doc(admin, 'users', 'org-uid'), { role: 'organizer', name: 'Martín', email: 'martin@demo.local', active: true, createdAt: 1 }));
    await assertSucceeds(setDoc(doc(admin, 'users', 'otro-uid'), { role: 'organizer', name: 'Otro', email: 'otro@demo.local', active: true, createdAt: 1 }));
    const org = testEnv.authenticatedContext('org-uid', { email: 'martin@demo.local' }).firestore();
    const otro = testEnv.authenticatedContext('otro-uid', { email: 'otro@demo.local' }).firestore();
    await assertSucceeds(setDoc(doc(admin, 'matches', MATCH), {
      date: '2026-10-30', time: '21:00', note: '', viewers: ['*'], adders: ['*'], viewerNames: [], adderNames: [], limits: [], solo: false, createdByUid: 'gus-uid',
    }));
    // Como los crea addPlayer: mismo partido, acceso copiado, token y código corto.
    const base = (n) => ({
      matchId: MATCH, matchDate: '2026-10-30', phone: '', addedBy: 'Gus', addedByUid: 'gus-uid', createdAt: n, updatedAt: n,
      waiting: false, waitOrder: null, rosterAt: n, confirmToken: `tokentokentoken${n}`.padEnd(24, 'x'),
      hasPhone: false, phoneKey: '', phoneOwnerUid: '', phoneShared: false, viewers: ['*'], adders: ['*'],
      signedUpWith: 'gus-uid', signedUpWithName: 'Gus', shortCode: `abcdefg${n}`,
    });
    await assertSucceeds(setDoc(doc(admin, 'players', 'host'), { ...base(1), name: 'Ramiro Maffioli' }));
    const guests = ['g1', 'g2', 'g3'];
    for (const [i, id] of guests.entries()) {
      await assertSucceeds(setDoc(doc(admin, 'players', id), {
        ...base(i + 2), name: `Invitado ${i + 1}`, invitedBy: 'host', invitedByName: 'Ramiro Maffioli', guestAuto: true,
      }));
    }
    const write = (db, id, input, who) => {
      const rec = paymentRecord(input, who, 100);
      if (!rec.ok) throw new Error(rec.error);
      return updateDoc(doc(db, 'players', id), { ...rec.patch, updatedAt: 101 });
    };
    // Lo que manda el formulario con "Dividir el pago entre él y sus invitados".
    const share = { paid: true, split: true, freePlay: false, cash: 5000, transfer: 0, pendingTransfer: 0, cashTo: 'Gus', transferTo: null, pendingTo: null };
    for (const id of ['host', ...guests]) await assertSucceeds(write(admin, id, share, 'Gus'));

    // Otra vez, ya pagos, con efectivo, transferencia y transfiere después. Admin y organizador.
    const mixed = { paid: true, split: true, freePlay: false, cash: 2000, transfer: 2000, pendingTransfer: 1000, cashTo: 'Gus', transferTo: 'Martín', pendingTo: 'Gus' };
    for (const id of ['host', ...guests]) await assertSucceeds(write(admin, id, mixed, 'Gus'));
    for (const id of ['host', ...guests]) await assertSucceeds(write(org, id, { ...mixed, cashTo: 'Martín' }, 'Martín'));

    // Cobrar la transferencia pendiente de un invitado (seis cobros es el máximo).
    const parts = Array.from({ length: 6 }, (_, i) => ({ to: `Org${i}`, amount: 500 }));
    await assertSucceeds(updateDoc(doc(admin, 'players', 'g1'), { transfer: 3000, transferTo: null, transferParts: parts, amount: 5000, updatedAt: 102 }));
    const g2 = { ...base(3), name: 'Invitado 2', invitedBy: 'host', paid: true, cash: 2000, transfer: 2000, pendingTransfer: 1000, cashTo: 'Martín', transferTo: 'Martín', pendingTo: 'Gus' };
    const received = receivePendingTransfer(g2, 'Gus', 103);
    await assertSucceeds(updateDoc(doc(org, 'players', 'g2'), { ...received.patch, updatedAt: 103 }));

    // Lo demás sobre un invitado ya pago sigue andando.
    await assertSucceeds(updateDoc(doc(org, 'players', 'g1'), { goals: 2, updatedAt: 104 }));
    await assertSucceeds(updateDoc(doc(org, 'players', 'g1'), { inGoal: true, inGoalAt: 105, updatedAt: 105 }));
    await assertSucceeds(updateDoc(doc(org, 'players', 'g1'), { confirmed: 'si', confirmedAt: 106, updatedAt: 106 }));
    await assertSucceeds(updateDoc(doc(org, 'players', 'g3'), { waiting: true, waitOrder: 1, rosterAt: null, updatedAt: 107 }));
    await assertSucceeds(updateDoc(doc(admin, 'players', 'g3'), { name: 'Pepe', guestAuto: false, updatedAt: 108 }));

    // La regla corta del pago no afloja nada (el admin igual puede todo por el cierre del final).
    await assertFails(updateDoc(doc(org, 'players', 'g1'), { method: 'tarjeta', updatedAt: 109 }));
    await assertFails(updateDoc(doc(org, 'players', 'g1'), { cash: -1, updatedAt: 109 }));
    await assertFails(updateDoc(doc(org, 'players', 'g1'), { cashTo: 'x'.repeat(41), updatedAt: 109 }));
    await assertFails(updateDoc(doc(org, 'players', 'g1'), { transferParts: [{ to: 'Gus', amount: -1 }], updatedAt: 109 }));
    await assertFails(updateDoc(doc(org, 'players', 'g1'), { goals: 'tres', updatedAt: 109 }));
    await assertFails(updateDoc(doc(org, 'players', 'g1'), { confirmed: 'quizas', updatedAt: 109 }));
    // El pago junto con el nombre: solo quien lo agregó.
    await assertFails(updateDoc(doc(org, 'players', 'g2'), { paid: true, cash: 1, name: 'Otro nombre', updatedAt: 109 }));
    // El pago junto con cambiar de anfitrión a alguien que no existe.
    await assertFails(updateDoc(doc(org, 'players', 'g2'), { paid: true, cash: 1, invitedBy: 'nadie', updatedAt: 109 }));
    // Sin permiso de anotar en ese jugador, tampoco el pago.
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'players', 'cerrado'), { ...base(9), name: 'Cerrado', viewers: ['*'], adders: ['org-uid'] });
      await setDoc(doc(ctx.firestore(), 'players', 'viejo'), { ...base(10), name: 'Viejo', phone: '5491155550101' });
    });
    await assertFails(write(otro, 'cerrado', share, 'Otro'));
    await assertSucceeds(write(org, 'cerrado', share, 'Martín'));
    // Un jugador viejo con el teléfono en el documento sigue igual que antes: sin migrar, no.
    await assertFails(write(org, 'viejo', share, 'Martín'));
  } finally {
    await testEnv.cleanup();
  }
});

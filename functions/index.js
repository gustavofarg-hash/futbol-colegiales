// Avisos del proyecto mis-partidos-prueba. No desplegar en futbol-partidos.
// Se dispara al crear signupPings/{id}. Manda un push a los organizadores
// del partido y borra el aviso. Si no hay tokens, igual lo borra.
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');
const { pushCopy, organizerUids } = require('./logic');

initializeApp();

exports.notifySelfSignup = onDocumentCreated(
  { document: 'signupPings/{pingId}', region: 'southamerica-east1' },
  async (event) => {
    const ping = event.data?.data() || null;
    const db = getFirestore();
    const ref = event.data?.ref;
    if (!ping || !ping.kind || !ping.matchId) {
      if (ref) await ref.delete().catch(() => {});
      return;
    }
    const matchSnap = await db.doc(`matches/${ping.matchId}`).get();
    const match = matchSnap.exists ? { id: ping.matchId, ...matchSnap.data() } : {
      id: ping.matchId,
      date: ping.date || '',
      time: ping.time || '',
      venueName: ping.venueName || '',
    };
    let holders = [];
    if (ping.rosterId) {
      const roster = await db.doc(`roster/${ping.rosterId}`).get();
      holders = roster.exists ? roster.data()?.holders || [] : [];
    }
    const uids = organizerUids(match, holders);
    const tokens = [];
    for (let i = 0; i < uids.length; i += 10) {
      const slice = uids.slice(i, i + 10);
      if (!slice.length) continue;
      const found = await db.collection('organizerTokens').where('uid', 'in', slice).get();
      found.forEach((doc) => {
        const token = String(doc.data()?.token || '');
        if (token) tokens.push({ token, ref: doc.ref });
      });
    }
    const copy = pushCopy(ping.kind, { name: ping.name }, match);
    if (tokens.length) {
      const res = await getMessaging().sendEachForMulticast({
        tokens: tokens.map((row) => row.token),
        data: { title: copy.title, body: copy.body, url: copy.url, tag: `signup-${event.params.pingId}` },
      });
      const dead = [];
      res.responses.forEach((row, index) => {
        const code = row.error?.code || '';
        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
          dead.push(tokens[index].ref.delete().catch(() => {}));
        }
      });
      await Promise.all(dead);
    }
    if (ref) await ref.delete().catch(() => {});
  },
);

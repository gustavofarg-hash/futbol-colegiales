// Capa de datos. Dos implementaciones con la misma interfaz:
//  - FirebaseStore: Firestore con listeners en tiempo real (onSnapshot)
//  - LocalStore: localStorage ("modo demo"), sincroniza entre pestañas
//
// Modelo de datos (pensado para que un importador automático escriba después):
//  matches/{matchId}
//    date: "YYYY-MM-DD"        (fecha local Buenos Aires)
//    time: "HH:MM"             (hora local Buenos Aires, 24 h)
//    startsAt: number          (epoch ms, calculado con offset -03:00)
//    note: string
//    capacity: 14
//    source: "manual" | "texto" | "whatsapp"
//    sourceRef: string|null    (id del mensaje de origen, para deduplicar)
//    sourceText: string|null   (texto original del que se importó)
//    createdBy, updatedBy: "Gustavo" | "Martín" | "bot"
//    createdAt, updatedAt: number (epoch ms)
//  players/{playerId}
//    matchId, matchDate ("YYYY-MM-DD", copia para consultar por fecha)
//    name, phone (solo dígitos, formato wa.me, ej 5491112345678)
//    addedBy: "Gustavo" | "Martín"
//    createdAt, updatedAt
//    paid: bool                         (opcional)
//    amount: number|null                (pesos; solo si paid)
//    method: "efectivo"|"transferencia"|null
//    paidUpdatedBy, paidUpdatedAt
//    waiting: bool                      (true = lista de espera)
//    waitOrder: number|null             (menor = más prioridad; null si es titular)
//    rosterAt: number|null              (cuándo entró a la lista principal)
//    confirmToken: string               (link de confirmar.html; se crea al anotar al jugador)
//    confirmed: "si"|"no"               (respuesta del jugador)
//    confirmedAt, reminderSentAt: number
//  El pago y la espera viven en el mismo documento del jugador. Las reglas
//  publicadas (validPlayer) permiten campos extra, así que no hace falta republicarlas.
//
// matchId determinístico: "YYYY-MM-DD_HHMM" (si ya existe se agrega un sufijo),
// así un importador puede hacer upsert sin duplicar.
import { firebaseConfig } from '../config.js';
import { addDays, todayISO, toEpoch } from './dates.js';
import { paymentRecord } from './payments.js';
import { nextWaitOrder } from './waiting.js';
import { newConfirmToken } from './reminders.js';

export const DEMO_STORAGE_KEY = 'f7c-demo-db';

const FB_VERSION = '13.0.0';
const FB = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

export function isFirebaseConfigured(cfg = firebaseConfig) {
  if (!cfg || !cfg.apiKey || !cfg.projectId || !cfg.appId) return false;
  return !Object.values(cfg).some((v) => typeof v === 'string' && /^TU_|TU_PROYECTO|^$/.test(v));
}

export function matchIdFor(date, time, existingIds = new Set()) {
  const base = `${date}_${(time || '0000').replace(':', '')}`;
  if (!existingIds.has(base)) return base;
  for (let i = 2; ; i++) if (!existingIds.has(`${base}-${i}`)) return `${base}-${i}`;
}

const rid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function matchDoc(data, who) {
  const now = Date.now();
  return {
    date: data.date,
    time: data.time,
    startsAt: toEpoch(data.date, data.time),
    note: (data.note || '').trim(),
    capacity: data.capacity || 14,
    source: data.source || 'manual',
    sourceRef: data.sourceRef || null,
    sourceText: data.sourceText || null,
    createdBy: who, updatedBy: who,
    createdAt: now, updatedAt: now,
  };
}

/* ───────────── Modo demo (localStorage) ───────────── */
class LocalStore {
  constructor() { this.key = DEMO_STORAGE_KEY; this.mode = 'demo'; this.listeners = new Set(); }
  _load() {
    try { return JSON.parse(localStorage.getItem(this.key)) || { matches: {}, players: {} }; }
    catch { return { matches: {}, players: {} }; }
  }
  _save(db) { localStorage.setItem(this.key, JSON.stringify(db)); this._emit(); }
  _emit() {
    const db = this._load();
    const matches = Object.entries(db.matches).map(([id, m]) => ({ id, ...m }));
    const players = Object.entries(db.players).map(([id, p]) => ({ id, ...p }));
    this.listeners.forEach((fn) => fn({ matches, players }));
  }
  async init() {
    window.addEventListener('storage', (e) => { if (e.key === this.key) this._emit(); });
  }
  subscribe(fn) { this.listeners.add(fn); setTimeout(() => this._emit()); return () => this.listeners.delete(fn); }
  async addMatch(data, who) {
    const db = this._load();
    const id = matchIdFor(data.date, data.time, new Set(Object.keys(db.matches)));
    db.matches[id] = matchDoc(data, who); this._save(db); return id;
  }
  async addMatches(list, who) {
    const db = this._load(); const ids = [];
    for (const data of list) {
      const id = matchIdFor(data.date, data.time, new Set(Object.keys(db.matches)));
      db.matches[id] = matchDoc(data, who); ids.push(id);
    }
    this._save(db); return ids;
  }
  async updateMatch(id, data, who) {
    const db = this._load(); const m = db.matches[id]; if (!m) return;
    Object.assign(m, data, { startsAt: toEpoch(data.date ?? m.date, data.time ?? m.time), updatedBy: who, updatedAt: Date.now() });
    if (data.date) for (const p of Object.values(db.players)) if (p.matchId === id) p.matchDate = data.date;
    this._save(db);
  }
  async deleteMatch(id) {
    const db = this._load(); delete db.matches[id];
    for (const [pid, p] of Object.entries(db.players)) if (p.matchId === id) delete db.players[pid];
    this._save(db);
  }
  async addPlayer(match, data, who, opts = {}) {
    const db = this._load(); const id = rid(); const now = Date.now();
    const mates = Object.values(db.players).filter((p) => p.matchId === match.id);
    const cap = match.capacity || 14;
    const mainCount = mates.filter((p) => p.waiting !== true).length;
    const waiting = opts.waiting === true || mainCount >= cap;
    db.players[id] = {
      matchId: match.id, matchDate: match.date, name: data.name.trim(), phone: data.phone || '',
      addedBy: who, createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: newConfirmToken(),
    };
    this._save(db); return id;
  }
  async updatePlayer(id, data) {
    const db = this._load(); if (!db.players[id]) return;
    Object.assign(db.players[id], data, { updatedAt: Date.now() }); this._save(db);
  }
  async setPayment(id, input, who) {
    const rec = paymentRecord(input, who);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-payment' });
    await this.updatePlayer(id, rec.patch);
  }
  async setWaitOrders(updates) {
    const db = this._load(); const now = Date.now();
    for (const u of updates || []) {
      if (!db.players[u.id]) continue;
      db.players[u.id].waitOrder = u.waitOrder;
      db.players[u.id].updatedAt = now;
    }
    this._save(db);
  }
  async promoteFromWaiting(id) {
    await this.updatePlayer(id, { waiting: false, waitOrder: null, rosterAt: Date.now() });
  }
  async ensureConfirmToken(id) {
    const p = this._load().players[id];
    if (!p) throw new Error('Jugador inexistente');
    if (p.confirmToken) return p.confirmToken;
    const token = newConfirmToken();
    await this.updatePlayer(id, { confirmToken: token });
    return token;
  }
  async markReminderSent(id) {
    await this.updatePlayer(id, { reminderSentAt: Date.now() });
  }
  async deletePlayer(id) { const db = this._load(); delete db.players[id]; this._save(db); }
  async clearAll() { localStorage.removeItem(this.key); this._emit(); }
}

/* ───────────── Firebase / Firestore ───────────── */
class FirebaseStore {
  constructor() { this.mode = 'firebase'; this.listeners = new Set(); this.state = { matches: [], players: [] }; }
  async init(onError) {
    const [{ initializeApp }, fs] = await Promise.all([
      import(`${FB}/firebase-app.js`),
      import(`${FB}/firebase-firestore.js`),
    ]);
    this.fs = fs;
    const app = initializeApp(firebaseConfig);
    try {
      this.db = fs.initializeFirestore(app, { localCache: fs.persistentLocalCache({ tabManager: fs.persistentMultipleTabManager() }) });
    } catch {
      this.db = fs.getFirestore(app);
    }
    // Escuchar desde ayer en adelante (los listeners se actualizan en tiempo real)
    const from = addDays(todayISO(), -1);
    const { collection, query, where, onSnapshot } = fs;
    const err = (e) => { console.error(e); onError && onError(e); };
    this.serverOk = false;
    onSnapshot(query(collection(this.db, 'matches'), where('date', '>=', from)), { includeMetadataChanges: true }, (snap) => {
      if (!snap.metadata.fromCache) this.serverOk = true;
      this.state.matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this.state.pending = snap.metadata.hasPendingWrites;
      this._emit();
    }, err);
    // Si Firestore no existe o la API está deshabilitada, el SDK reintenta en silencio:
    // avisamos si en 15 s no llegó ninguna respuesta del servidor.
    setTimeout(() => {
      if (!this.serverOk && navigator.onLine !== false) err({ code: 'no-server', message: 'sin respuesta del servidor' });
    }, 15000);
    onSnapshot(query(collection(this.db, 'players'), where('matchDate', '>=', from)), (snap) => {
      this.state.players = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      this._emit();
    }, err);
  }
  _emit() { this.listeners.forEach((fn) => fn({ ...this.state })); }
  subscribe(fn) { this.listeners.add(fn); fn({ ...this.state }); return () => this.listeners.delete(fn); }
  _ids() { return new Set(this.state.matches.map((m) => m.id)); }
  async addMatch(data, who) {
    const { doc, setDoc } = this.fs;
    const id = matchIdFor(data.date, data.time, this._ids());
    await setDoc(doc(this.db, 'matches', id), matchDoc(data, who)); return id;
  }
  async addMatches(list, who) {
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db); const ids = this._ids(); const out = [];
    for (const data of list) {
      const id = matchIdFor(data.date, data.time, ids); ids.add(id); out.push(id);
      batch.set(doc(this.db, 'matches', id), matchDoc(data, who));
    }
    await batch.commit(); return out;
  }
  async updateMatch(id, data, who) {
    const { doc, writeBatch } = this.fs;
    const cur = this.state.matches.find((m) => m.id === id) || {};
    const batch = writeBatch(this.db);
    batch.update(doc(this.db, 'matches', id), { ...data, startsAt: toEpoch(data.date ?? cur.date, data.time ?? cur.time), updatedBy: who, updatedAt: Date.now() });
    if (data.date && data.date !== cur.date) {
      this.state.players.filter((p) => p.matchId === id).forEach((p) => batch.update(doc(this.db, 'players', p.id), { matchDate: data.date }));
    }
    await batch.commit();
  }
  async deleteMatch(id) {
    const { doc, writeBatch, collection, query, where, getDocs } = this.fs;
    const batch = writeBatch(this.db);
    const ps = await getDocs(query(collection(this.db, 'players'), where('matchId', '==', id)));
    ps.forEach((d) => batch.delete(d.ref));
    batch.delete(doc(this.db, 'matches', id));
    await batch.commit();
  }
  async addPlayer(match, data, who, opts = {}) {
    const { collection, addDoc } = this.fs; const now = Date.now();
    const mates = this.state.players.filter((p) => p.matchId === match.id);
    const cap = match.capacity || 14;
    const mainCount = mates.filter((p) => p.waiting !== true).length;
    const waiting = opts.waiting === true || mainCount >= cap;
    const ref = await addDoc(collection(this.db, 'players'), {
      matchId: match.id, matchDate: match.date, name: data.name.trim(), phone: data.phone || '',
      addedBy: who, createdAt: now, updatedAt: now,
      waiting, waitOrder: waiting ? nextWaitOrder(mates.filter((p) => p.waiting === true)) : null,
      rosterAt: waiting ? null : now,
      confirmToken: newConfirmToken(),
    });
    return ref.id;
  }
  async updatePlayer(id, data) { const { doc, updateDoc } = this.fs; await updateDoc(doc(this.db, 'players', id), { ...data, updatedAt: Date.now() }); }
  async setPayment(id, input, who) {
    const rec = paymentRecord(input, who);
    if (!rec.ok) throw Object.assign(new Error(rec.error), { code: 'invalid-payment' });
    await this.updatePlayer(id, rec.patch);
  }
  async setWaitOrders(updates) {
    const { doc, writeBatch } = this.fs;
    const batch = writeBatch(this.db); const now = Date.now();
    for (const u of updates || []) batch.update(doc(this.db, 'players', u.id), { waitOrder: u.waitOrder, updatedAt: now });
    await batch.commit();
  }
  async promoteFromWaiting(id) {
    await this.updatePlayer(id, { waiting: false, waitOrder: null, rosterAt: Date.now() });
  }
  async ensureConfirmToken(id) {
    const p = this.state.players.find((x) => x.id === id);
    if (!p) throw new Error('Jugador inexistente');
    if (p.confirmToken) return p.confirmToken;
    const token = newConfirmToken();
    await this.updatePlayer(id, { confirmToken: token });
    return token;
  }
  async markReminderSent(id) {
    await this.updatePlayer(id, { reminderSentAt: Date.now() });
  }
  async deletePlayer(id) { const { doc, deleteDoc } = this.fs; await deleteDoc(doc(this.db, 'players', id)); }
}

/** Store de localStorage, sin Firebase. Lo usa el modo demo y las pruebas. */
export function createDemoStore() {
  return new LocalStore();
}

export async function createStore(onError) {
  if (isFirebaseConfigured()) {
    const s = new FirebaseStore();
    try { await s.init(onError); return s; }
    catch (e) { console.error('No se pudo iniciar Firebase, usando modo demo', e); onError && onError(e); }
  }
  const s = new LocalStore(); await s.init(); return s;
}

// Sesión de organizadores. Demo: usuarios en localStorage, sin Firebase.
// Firebase: Email/Password. El admin crea organizadores con una app secundaria
// para no pisar su propia sesión. No hay Cloud Functions.
import { ADMIN_EMAIL, firebaseConfig } from '../config.js';
import { initFirebase, isFirebaseConfigured } from './store.js';

export const DEMO_AUTH_KEY = 'f7c-demo-auth';
export const DEMO_ACCOUNTS = [
  { email: 'gustavo@demo.local', password: 'demo-gustavo', name: 'Gustavo', role: 'admin' },
  { email: 'martin@demo.local', password: 'demo-martin', name: 'Martín', role: 'organizer' },
];

const FB_VERSION = '13.0.0';
const FB = `https://www.gstatic.com/firebasejs/${FB_VERSION}`;

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/** El placeholder no habilita el alta del admin. */
export function adminEmailConfigured(adminEmail = ADMIN_EMAIL) {
  const email = normalizeEmail(adminEmail);
  return email.includes('@') && !email.startsWith('tu_');
}

export function sameAdminEmail(email, adminEmail = ADMIN_EMAIL) {
  return adminEmailConfigured(adminEmail) && normalizeEmail(email) === normalizeEmail(adminEmail);
}

export function publicUser(uid, user) {
  if (!user) return null;
  return {
    uid,
    email: user.email || '',
    name: user.name || '',
    role: user.role === 'admin' ? 'admin' : 'organizer',
    active: user.active !== false,
  };
}

export function staffUsers(users) {
  return (users || []).filter((user) => user.active !== false && (user.role === 'admin' || user.role === 'organizer'));
}

export function emptyAuthDb() {
  return { session: null, users: {} };
}

export function seedDemoAuth(db) {
  db.users ||= {};
  db.session = db.session || null;
  if (Object.keys(db.users).length) return db;
  db.users.gustavo = { ...DEMO_ACCOUNTS[0], active: true };
  db.users.martin = { ...DEMO_ACCOUNTS[1], active: true };
  return db;
}

export function loginDemo(db, email, password) {
  const found = Object.entries(db.users || {}).find(([, user]) => normalizeEmail(user.email) === normalizeEmail(email));
  if (!found || found[1].password !== String(password || '')) return { ok: false, error: 'Mail o contraseña incorrectos.' };
  if (found[1].active === false) return { ok: false, error: 'Esta cuenta está desactivada.' };
  return { ok: true, session: publicUser(found[0], found[1]) };
}

export function createOrganizerDemo(db, actor, input) {
  if (!actor || actor.role !== 'admin' || actor.active === false) return { ok: false, error: 'Solo el administrador puede crear usuarios.' };
  const email = normalizeEmail(input?.email);
  const name = String(input?.name || '').trim().replace(/\s+/g, ' ');
  const password = String(input?.password || '');
  if (!name || name.length > 40) return { ok: false, error: 'Poné el nombre.' };
  if (!email.includes('@') || email.length > 80) return { ok: false, error: 'El mail no es válido.' };
  if (password.length < 6) return { ok: false, error: 'La contraseña tiene que tener al menos 6 caracteres.' };
  if (Object.values(db.users).some((user) => normalizeEmail(user.email) === email)) return { ok: false, error: 'Ese mail ya tiene cuenta.' };
  let uid = email.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'usuario';
  let n = 2;
  while (db.users[uid]) uid = `${uid}-${n++}`;
  db.users[uid] = { email, password, name, role: 'organizer', active: true };
  return { ok: true, uid };
}

export function setOrganizerActiveDemo(db, actor, uid, active) {
  if (!actor || actor.role !== 'admin') return { ok: false, error: 'Solo el administrador puede hacer eso.' };
  const user = db.users?.[uid];
  if (!user || user.role === 'admin' || uid === actor.uid) return { ok: false, error: 'Esa cuenta no se puede cambiar.' };
  user.active = active === true;
  if (db.session?.uid === uid) db.session = null;
  return { ok: true };
}

export function deleteOrganizerDemo(db, actor, uid) {
  if (!actor || actor.role !== 'admin') return { ok: false, error: 'Solo el administrador puede hacer eso.' };
  const user = db.users?.[uid];
  if (!user || user.role === 'admin' || uid === actor.uid) return { ok: false, error: 'Esa cuenta no se puede borrar.' };
  delete db.users[uid];
  if (db.session?.uid === uid) db.session = null;
  return { ok: true };
}

function authError(error) {
  const code = error?.code || '';
  if (code === 'auth/invalid-email') return 'El mail no es válido.';
  if (code === 'auth/email-already-in-use') return 'Ese mail ya tiene cuenta.';
  if (code === 'auth/weak-password') return 'La contraseña tiene que tener al menos 6 caracteres.';
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Mail o contraseña incorrectos.';
  if (code === 'auth/too-many-requests') return 'Demasiados intentos. Probá más tarde.';
  return 'No se pudo entrar: ' + (code || error?.message || 'error');
}

class DemoSession {
  constructor() { this.mode = 'demo'; this.user = null; this.users = []; this.listeners = new Set(); }
  _load() {
    try { return seedDemoAuth(JSON.parse(localStorage.getItem(DEMO_AUTH_KEY)) || emptyAuthDb()); }
    catch { return seedDemoAuth(emptyAuthDb()); }
  }
  _save(db) { localStorage.setItem(DEMO_AUTH_KEY, JSON.stringify(db)); this._emit(db); }
  _emit(db = this._load()) {
    this.user = db.session;
    this.users = Object.entries(db.users).map(([uid, user]) => publicUser(uid, user));
    this.listeners.forEach((fn) => fn(this));
  }
  async init() { this._emit(); }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async login(email, password) {
    const db = this._load();
    const result = loginDemo(db, email, password);
    if (!result.ok) throw Object.assign(new Error(result.error), { code: 'auth' });
    db.session = result.session;
    this._save(db);
  }
  async logout() { const db = this._load(); db.session = null; this._save(db); location.reload(); }
  async forgot() { throw Object.assign(new Error('En la demo no se envían mails.'), { code: 'auth' }); }
  async registerAdmin() { throw Object.assign(new Error('En la demo las cuentas ya están creadas.'), { code: 'auth' }); }
  async createOrganizer(input) {
    const db = this._load();
    const result = createOrganizerDemo(db, db.session, input);
    if (!result.ok) throw Object.assign(new Error(result.error), { code: 'auth' });
    this._save(db);
    return result.uid;
  }
  async setOrganizerActive(uid, active) {
    const db = this._load();
    const result = setOrganizerActiveDemo(db, db.session, uid, active);
    if (!result.ok) throw Object.assign(new Error(result.error), { code: 'auth' });
    this._save(db);
  }
  async deleteOrganizer(uid) {
    const db = this._load();
    const result = deleteOrganizerDemo(db, db.session, uid);
    if (!result.ok) throw Object.assign(new Error(result.error), { code: 'auth' });
    this._save(db);
  }
}

class FirebaseSession {
  constructor() { this.mode = 'firebase'; this.user = null; this.users = []; this.listeners = new Set(); this.error = ''; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  _emit() { this.listeners.forEach((fn) => fn(this)); }
  async init() {
    this.fb = await initFirebase();
    const { getAuth } = await import(`${FB}/firebase-auth.js`);
    this.auth = getAuth(this.fb.app);
    await this.auth.authStateReady();
    if (this.auth.currentUser) await this._adopt(this.auth.currentUser);
  }
  async _adopt(account, preferredName) {
    const { doc, getDoc, setDoc } = this.fb.fs;
    const ref = doc(this.fb.db, 'users', account.uid);
    let snap = await getDoc(ref);
    if (!snap.exists()) {
      if (!sameAdminEmail(account.email)) {
        const { signOut } = await import(`${FB}/firebase-auth.js`);
        await signOut(this.auth);
        this.user = null;
        this.error = adminEmailConfigured()
          ? 'Esa cuenta no está habilitada. Pedile al administrador que te cree un usuario.'
          : 'Falta el mail del administrador en config.js y en firestore.rules.';
        return;
      }
      const name = String(preferredName || account.displayName || 'Gustavo').trim() || 'Gustavo';
      await setDoc(ref, {
        role: 'admin', name, email: normalizeEmail(account.email), active: true, createdAt: Date.now(),
      });
      snap = await getDoc(ref);
    }
    const data = snap.data() || {};
    if (data.active === false || (data.role !== 'admin' && data.role !== 'organizer')) {
      const { signOut } = await import(`${FB}/firebase-auth.js`);
      await signOut(this.auth);
      this.user = null;
      this.error = 'Esta cuenta está desactivada.';
      return;
    }
    this.user = publicUser(account.uid, data);
    this.error = '';
    this._watch();
    this._emit();
  }
  _watch() {
    if (this._unwatch) return;
    const { collection, onSnapshot } = this.fb.fs;
    this._unwatch = onSnapshot(collection(this.fb.db, 'users'), (snap) => {
      this.users = snap.docs.map((item) => publicUser(item.id, item.data()));
      this._emit();
    }, (error) => console.error(error));
  }
  async login(email, password) {
    const { signInWithEmailAndPassword } = await import(`${FB}/firebase-auth.js`);
    try {
      const cred = await signInWithEmailAndPassword(this.auth, normalizeEmail(email), password);
      await this._adopt(cred.user);
      if (!this.user) throw Object.assign(new Error(this.error || 'No tenés acceso.'), { code: 'auth' });
    } catch (error) {
      if (error?.code === 'auth') throw error;
      throw Object.assign(new Error(authError(error)), { code: 'auth' });
    }
  }
  async registerAdmin({ email, password, name }) {
    if (!sameAdminEmail(email)) throw Object.assign(new Error('Ese mail no es el del administrador configurado.'), { code: 'auth' });
    const cleanName = String(name || '').trim();
    if (!cleanName) throw Object.assign(new Error('Poné tu nombre.'), { code: 'auth' });
    const { createUserWithEmailAndPassword, updateProfile } = await import(`${FB}/firebase-auth.js`);
    try {
      const cred = await createUserWithEmailAndPassword(this.auth, normalizeEmail(email), password);
      await updateProfile(cred.user, { displayName: cleanName });
      await this._adopt(cred.user, cleanName);
    } catch (error) {
      if (error?.code === 'auth') throw error;
      throw Object.assign(new Error(authError(error)), { code: 'auth' });
    }
  }
  async logout() {
    const { signOut } = await import(`${FB}/firebase-auth.js`);
    await signOut(this.auth);
    location.reload();
  }
  async forgot(email) {
    const { sendPasswordResetEmail } = await import(`${FB}/firebase-auth.js`);
    try { await sendPasswordResetEmail(this.auth, normalizeEmail(email)); }
    catch (error) { throw Object.assign(new Error(authError(error)), { code: 'auth' }); }
  }
  async _secondaryAuth() {
    const { initializeApp, getApps } = await import(`${FB}/firebase-app.js`);
    const { getAuth } = await import(`${FB}/firebase-auth.js`);
    const existing = getApps().find((app) => app.name === 'staff-create');
    const app = existing || initializeApp(firebaseConfig, 'staff-create');
    return getAuth(app);
  }
  async createOrganizer({ email, password, name }) {
    if (this.user?.role !== 'admin') throw Object.assign(new Error('Solo el administrador puede crear usuarios.'), { code: 'auth' });
    const cleanName = String(name || '').trim().replace(/\s+/g, ' ');
    const cleanEmail = normalizeEmail(email);
    if (!cleanName || cleanName.length > 40) throw Object.assign(new Error('Poné el nombre.'), { code: 'auth' });
    if (!cleanEmail.includes('@')) throw Object.assign(new Error('El mail no es válido.'), { code: 'auth' });
    if (String(password || '').length < 6) throw Object.assign(new Error('La contraseña tiene que tener al menos 6 caracteres.'), { code: 'auth' });
    const auth2 = await this._secondaryAuth();
    const { createUserWithEmailAndPassword, signOut } = await import(`${FB}/firebase-auth.js`);
    try {
      const cred = await createUserWithEmailAndPassword(auth2, cleanEmail, password);
      const { doc, setDoc } = this.fb.fs;
      await setDoc(doc(this.fb.db, 'users', cred.user.uid), {
        role: 'organizer', name: cleanName, email: cleanEmail, active: true, createdAt: Date.now(),
      });
      return cred.user.uid;
    } catch (error) {
      throw Object.assign(new Error(authError(error)), { code: 'auth' });
    } finally {
      await signOut(auth2);
    }
  }
  async setOrganizerActive(uid, active) {
    if (this.user?.role !== 'admin' || uid === this.user.uid) throw Object.assign(new Error('Esa cuenta no se puede cambiar.'), { code: 'auth' });
    const { doc, updateDoc } = this.fb.fs;
    await updateDoc(doc(this.fb.db, 'users', uid), { active: active === true });
  }
  async deleteOrganizer(uid) {
    if (this.user?.role !== 'admin' || uid === this.user.uid) throw Object.assign(new Error('Esa cuenta no se puede borrar.'), { code: 'auth' });
    const { doc, deleteDoc } = this.fb.fs;
    await deleteDoc(doc(this.fb.db, 'users', uid));
  }
}

export function openSession() {
  if (isFirebaseConfigured()) return new FirebaseSession();
  return new DemoSession();
}

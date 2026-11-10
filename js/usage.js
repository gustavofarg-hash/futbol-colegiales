import { addDays } from './dates.js';

/** Tope diario de Spark. El día cambia a la medianoche del Pacífico: en noviembre, las 05:00 de Buenos Aires. */
export const QUOTA_READS = 50000;
export const QUOTA_WRITES = 20000;
export const QUOTA_DELETES = 20000;
export const USAGE_FLUSH_MS = 3 * 60 * 1000;
export const USAGE_MAX_STEP = 100000;

/**
 * Cuántos días hacia atrás se escuchan junto con Próximos.
 * Alcanza para el historial reciente. Un partido más viejo, al abrirlo,
 * ensancha esta ventana una sola vez.
 */
export const RECENT_LISTEN_DAYS = 120;

export function recentCutoff(today, days = RECENT_LISTEN_DAYS) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || '')) return '';
  return addDays(today, -Math.abs(Number(days) || 0));
}

/**
 * No hay barrido de playerCount al abrir la app.
 * El contador se escribe solo en el partido que se anota o se quita.
 * El barrido, cuando los partidos llegaban antes que los jugadores,
 * ponía 0 y enseguida el total: dos escrituras por partido en cada apertura.
 * Dos teléfonos se las devolvían. Por eso se gastaron las 20.000 escrituras.
 */
export function playerCountSweep() {
  return [];
}

export function quotaDay(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const pick = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${pick('year')}-${pick('month')}-${pick('day')}`;
}

export function usageLevel(used, limit) {
  const ratio = limit ? Number(used) / Number(limit) : 0;
  if (ratio >= 0.9) return 'hot';
  if (ratio >= 0.7) return 'warn';
  return 'ok';
}

export function formatUsageCount(value) {
  return new Intl.NumberFormat('es-AR').format(Math.max(0, Math.round(Number(value) || 0)));
}

export function usageTotals(doc) {
  return {
    reads: Math.max(0, Number(doc?.reads) || 0),
    writes: Math.max(0, Number(doc?.writes) || 0),
    deletes: Math.max(0, Number(doc?.deletes) || 0),
  };
}

export function usageSummary(doc) {
  const totals = usageTotals(doc);
  return `Hoy (se renueva a las 05:00): ${formatUsageCount(totals.reads)} lecturas de 50.000 · ${formatUsageCount(totals.writes)} escrituras de 20.000 · ${formatUsageCount(totals.deletes)} borrados de 20.000`;
}

export class UsageMeter {
  constructor() {
    this.pending = { reads: 0, writes: 0, deletes: 0 };
  }
  noteRead(n) { this._add('reads', n); }
  noteWrite(n) { this._add('writes', n); }
  noteDelete(n) { this._add('deletes', n); }
  _add(key, n) {
    const count = Math.floor(Number(n) || 0);
    if (count > 0) this.pending[key] += count;
  }
  takePending() {
    const batch = { ...this.pending };
    if (!batch.reads && !batch.writes && !batch.deletes) return null;
    this.pending = { reads: 0, writes: 0, deletes: 0 };
    return batch;
  }
  restore(batch) {
    if (!batch) return;
    this.pending.reads += batch.reads || 0;
    this.pending.writes += batch.writes || 0;
    this.pending.deletes += batch.deletes || 0;
  }
}

function isUsagePath(ref) {
  return String(ref?.path || '').split('/').includes('usage');
}

function countServerSnap(snap, meter, onCount) {
  if (!snap || snap.metadata?.fromCache === true) return;
  const changes = typeof snap.docChanges === 'function' ? snap.docChanges() : null;
  const count = changes ? changes.length : (Number(snap.size) || (typeof snap.exists === 'function' && snap.exists() ? 1 : 0));
  if (count > 0) {
    meter.noteRead(count);
    onCount();
  }
}

/** Envuelve el SDK para contar lecturas del servidor, escrituras y borrados. El doc usage no se cuenta: si no, el medidor se escribe solo. */
export function meterFirestore(fs, meter, onCount = () => {}) {
  const note = (kind, count) => {
    if (kind === 'reads') meter.noteRead(count);
    else if (kind === 'writes') meter.noteWrite(count);
    else meter.noteDelete(count);
    if (count) onCount();
  };
  const wrapNext = (fn) => (snap) => {
    countServerSnap(snap, meter, onCount);
    return fn(snap);
  };
  return {
    ...fs,
    onSnapshot: (ref, ...args) => {
      if (typeof args[0] === 'function') args[0] = wrapNext(args[0]);
      else if (args[0] && typeof args[0] === 'object' && typeof args[0].next === 'function') args[0] = { ...args[0], next: wrapNext(args[0].next) };
      else if (typeof args[1] === 'function') args[1] = wrapNext(args[1]);
      return fs.onSnapshot(ref, ...args);
    },
    getDocs: async (queryRef) => {
      const snap = await fs.getDocs(queryRef);
      countServerSnap(snap, meter, onCount);
      return snap;
    },
    getDoc: async (ref) => {
      const snap = await fs.getDoc(ref);
      if (snap?.metadata?.fromCache !== true && typeof snap?.exists === 'function' && snap.exists()) note('reads', 1);
      return snap;
    },
    setDoc: async (ref, data, ...rest) => {
      const result = await fs.setDoc(ref, data, ...rest);
      if (!isUsagePath(ref)) note('writes', 1);
      return result;
    },
    updateDoc: async (ref, data, ...rest) => {
      const result = await fs.updateDoc(ref, data, ...rest);
      if (!isUsagePath(ref)) note('writes', 1);
      return result;
    },
    addDoc: async (ref, data, ...rest) => {
      const result = await fs.addDoc(ref, data, ...rest);
      if (!isUsagePath(ref)) note('writes', 1);
      return result;
    },
    deleteDoc: async (ref, ...rest) => {
      const result = await fs.deleteDoc(ref, ...rest);
      if (!isUsagePath(ref)) note('deletes', 1);
      return result;
    },
    writeBatch: (db) => {
      const batch = fs.writeBatch(db);
      let writes = 0;
      let deletes = 0;
      let usageOnly = true;
      const see = (ref, kind) => {
        if (!isUsagePath(ref)) usageOnly = false;
        if (kind === 'delete') deletes += 1;
        else writes += 1;
      };
      return {
        set: (ref, ...args) => { see(ref, 'set'); return batch.set(ref, ...args); },
        update: (ref, ...args) => { see(ref, 'update'); return batch.update(ref, ...args); },
        delete: (ref, ...args) => { see(ref, 'delete'); return batch.delete(ref, ...args); },
        commit: async () => {
          const result = await batch.commit();
          if (!usageOnly) {
            if (writes) note('writes', writes);
            if (deletes) note('deletes', deletes);
          }
          return result;
        },
      };
    },
  };
}

export function writeFailureText(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === 'resource-exhausted' || code === 'resource_exhausted' || /resource.exhausted/i.test(message)) {
    return 'No se pudo guardar: se alcanzó el límite diario de Firebase';
  }
  if (code === 'permission-denied' || code === 'permission_denied') {
    return 'No se pudo guardar: Firebase rechazó el permiso';
  }
  return 'No se pudo guardar: ' + (code || message || error);
}

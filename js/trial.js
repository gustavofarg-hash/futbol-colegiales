// Versión de prueba en /prueba/. No toca la app de producción.
// En Node (pruebas) no hay location: se usa el sitio publicado.

export const PRODUCTION_ORIGIN = 'https://gustavofarg-hash.github.io/futbol-colegiales';
export const PRODUCTION_PROJECT_ID = 'futbol-partidos';
export const TRIAL_STORAGE_PREFIX = 'prueba:';

export function isTrialPath(pathname) {
  return /\/prueba(\/|$)/.test(String(pathname || ''));
}

/** Origen público de los links. En /prueba/ apunta a /prueba/. */
export function publicAppOriginFrom(pathname, pageOrigin) {
  const path = String(pathname || '');
  if (!isTrialPath(path)) return PRODUCTION_ORIGIN;
  const root = path.split(/\/prueba(\/|$)/)[0];
  const host = String(pageOrigin || 'https://gustavofarg-hash.github.io').replace(/\/$/, '');
  return `${host}${root}/prueba`;
}

export function publicAppOrigin() {
  try {
    if (typeof location === 'undefined') return PRODUCTION_ORIGIN;
    return publicAppOriginFrom(location.pathname, location.origin);
  } catch {
    return PRODUCTION_ORIGIN;
  }
}

export function isTrialPage() {
  try {
    return typeof location !== 'undefined' && isTrialPath(location.pathname);
  } catch {
    return false;
  }
}

/** En /prueba/ no se puede abrir el proyecto de producción, aunque config.js lo tenga. */
export function blocksProductionFirebase(pathname, projectId) {
  return isTrialPath(pathname) && String(projectId || '') === PRODUCTION_PROJECT_ID;
}

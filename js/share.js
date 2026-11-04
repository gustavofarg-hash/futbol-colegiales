export const APP_INSTALL_URL = 'https://gustavofarg-hash.github.io/futbol-colegiales/';

/** Enlace directo a la ficha de un jugador. El id es el de la ficha (la misma si está compartida). */
export function playerLink(rosterId) {
  const id = String(rosterId || '').trim();
  if (!id) return '';
  return `${APP_INSTALL_URL}#/jugador/${encodeURIComponent(id)}`;
}

/** Hash de una ficha: #/jugador/{id}. Sin id no cuenta. */
export function isPlayerDeepLink(hash) {
  const parts = String(hash || '').replace(/^#\/?/, '').split('/');
  return parts[0] === 'jugador' && !!parts[1];
}

export function appShareMessage() {
  return `Anotate con Mis Partidos. Instalá la app desde acá.\n${APP_INSTALL_URL}`;
}

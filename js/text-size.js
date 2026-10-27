// Tamaño de texto de toda la app. El valor se guarda en este dispositivo.
// Normal (18px) es el default. El mínimo bajó cuatro pasos de 2px desde los 16px.
// Lo guardado antes era el índice 0..4 (16, 18, 20, 22, 24). Ahora se guarda el px,
// así ese índice viejo sigue siendo el mismo tamaño.
export const TEXT_SIZE_KEY = 'f7c-text-size';

export const TEXT_SIZES = [
  { id: 'minima', label: 'Mínima', px: 8 },
  { id: 'muy-chica', label: 'Muy chica', px: 10 },
  { id: 'mas-chica', label: 'Más chica', px: 12 },
  { id: 'chiquita', label: 'Chiquita', px: 14 },
  { id: 'chica', label: 'Chica', px: 16 },
  { id: 'normal', label: 'Normal', px: 18 },
  { id: 'grande', label: 'Grande', px: 20 },
  { id: 'muy-grande', label: 'Muy grande', px: 22 },
  { id: 'enorme', label: 'Enorme', px: 24 },
];

const LEGACY_PX = [16, 18, 20, 22, 24];

export const TEXT_SIZE_DEFAULT = TEXT_SIZES.findIndex((step) => step.px === 18);

export function textSizeIndex(raw) {
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n >= TEXT_SIZES.length) return TEXT_SIZE_DEFAULT;
  return n;
}

/** Índice a partir de lo guardado: px (8..24) o el índice viejo 0..4. */
export function indexFromStored(raw) {
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  if (!Number.isInteger(n)) return TEXT_SIZE_DEFAULT;
  const byPx = TEXT_SIZES.findIndex((step) => step.px === n);
  if (byPx >= 0) return byPx;
  if (n >= 0 && n < LEGACY_PX.length) {
    const legacy = TEXT_SIZES.findIndex((step) => step.px === LEGACY_PX[n]);
    if (legacy >= 0) return legacy;
  }
  return TEXT_SIZE_DEFAULT;
}

export function readTextSize(storage = globalThis.localStorage) {
  try { return indexFromStored(storage?.getItem(TEXT_SIZE_KEY)); }
  catch { return TEXT_SIZE_DEFAULT; }
}

export function applyTextSize(index, root = globalThis.document?.documentElement) {
  const i = textSizeIndex(index);
  if (root) {
    root.style.fontSize = `${TEXT_SIZES[i].px}px`;
    root.dataset.textSize = TEXT_SIZES[i].id;
  }
  return i;
}

export function saveTextSize(index, storage = globalThis.localStorage) {
  const i = textSizeIndex(index);
  try { storage?.setItem(TEXT_SIZE_KEY, String(TEXT_SIZES[i].px)); } catch { /* modo privado */ }
  return applyTextSize(i);
}

export function stepTextSize(delta, storage = globalThis.localStorage) {
  const next = Math.min(TEXT_SIZES.length - 1, Math.max(0, readTextSize(storage) + delta));
  return saveTextSize(next, storage);
}

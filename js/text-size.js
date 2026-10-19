// Tamaño de texto de toda la app. El índice se guarda en este dispositivo.
// Normal (18px) es el default: un poco más grande que los 16px de antes.
export const TEXT_SIZE_KEY = 'f7c-text-size';

export const TEXT_SIZES = [
  { id: 'chica', label: 'Chica', px: 16 },
  { id: 'normal', label: 'Normal', px: 18 },
  { id: 'grande', label: 'Grande', px: 20 },
  { id: 'muy-grande', label: 'Muy grande', px: 22 },
  { id: 'enorme', label: 'Enorme', px: 24 },
];

export const TEXT_SIZE_DEFAULT = 1;

export function textSizeIndex(raw) {
  const n = typeof raw === 'number' ? raw : parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0 || n >= TEXT_SIZES.length) return TEXT_SIZE_DEFAULT;
  return n;
}

export function readTextSize(storage = globalThis.localStorage) {
  try { return textSizeIndex(storage?.getItem(TEXT_SIZE_KEY)); }
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
  try { storage?.setItem(TEXT_SIZE_KEY, String(i)); } catch { /* modo privado */ }
  return applyTextSize(i);
}

export function stepTextSize(delta, storage = globalThis.localStorage) {
  const next = Math.min(TEXT_SIZES.length - 1, Math.max(0, readTextSize(storage) + delta));
  return saveTextSize(next, storage);
}

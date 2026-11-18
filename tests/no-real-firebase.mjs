// Las pruebas no abren el sitio publicado ni un proyecto real.
const REAL = /mis-partidos-prueba|futbol-partidos/i;

export function refuseRealTarget(base) {
  const url = String(base || '');
  if (/github\.io/i.test(url) || REAL.test(url)) {
    throw new Error('Las pruebas no abren el sitio publicado ni un proyecto real. Usá 127.0.0.1 en modo demo, o el emulador.');
  }
}

export function refuseUnlessEmulator() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error('Este script solo corre con FIRESTORE_EMULATOR_HOST. No usa mis-partidos-prueba ni producción.');
  }
}

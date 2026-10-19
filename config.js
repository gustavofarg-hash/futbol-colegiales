// ─────────────────────────────────────────────────────────────
//  Configuración de la app
//  1) Pegá acá la configuración web de tu proyecto de Firebase
//     (Consola de Firebase → Configuración del proyecto → Tus apps → SDK config).
//  2) Mientras queden los valores "TU_..." la app funciona en MODO DEMO
//     (datos guardados solo en este teléfono/navegador).
// ─────────────────────────────────────────────────────────────
export const firebaseConfig = {
  apiKey: "AIzaSyBNtUZP4wxNmzCKtJPYUZPKoP9vV4CM_UY",
  authDomain: "futbol-partidos.firebaseapp.com",
  projectId: "futbol-partidos",
  storageBucket: "futbol-partidos.firebasestorage.app",
  messagingSenderId: "187855618137",
  appId: "1:187855618137:web:71bb2d7b77e6ca886b3148",
};

// Código de acceso compartido (opcional). Si lo completás, la app lo pide la
// primera vez que se abre en cada teléfono. Ej: "colegiales2026".
// OJO: es solo una barrera de la interfaz, no protege la base de datos.
export const ACCESS_CODE = "";

// Organizadores que pueden anotar jugadores.
export const ORGANIZERS = ["Gustavo", "Martín"];

// Cupo por partido (7 contra 7).
export const CAPACITY = 14;

// Nombre del lugar (aparece en la app y en los mensajes de WhatsApp).
export const VENUE = "Polideportivo Colegiales";

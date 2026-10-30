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

// Mail del administrador. El mismo texto, en minúsculas, que adminEmail() en
// firestore.rules. La comparación no distingue mayúsculas.
export const ADMIN_EMAIL = "gustavof.arg@gmail.com";

// Nombres viejos. Las cuentas nuevas salen de la colección users.
export const ORGANIZERS = ["Gustavo", "Martín"];

// Cupo por partido (7 contra 7).
export const CAPACITY = 14;

// Nombre del lugar (aparece en la app y en los mensajes de WhatsApp).
export const VENUE = "Polideportivo Colegiales";

// Backup directo a Google Drive (opcional). Vacío: «Guardar en Google Drive»
// abre el menú de compartir del teléfono (elegís Drive) o descarga el archivo.
// Para que suba solo a tu Drive (carpeta «Mis Partidos - backups»):
//  1) console.cloud.google.com → proyecto futbol-partidos → APIs y servicios →
//     Biblioteca → «Google Drive API» → Habilitar.
//  2) Pantalla de consentimiento de OAuth: tipo Externo, nombre «Mis Partidos»,
//     tu mail; permiso (scope) .../auth/drive.file. Publicala («En producción»)
//     o agregá como usuarios de prueba los mails que van a hacer backups.
//  3) Credenciales → Crear credenciales → ID de cliente de OAuth → Aplicación web.
//     Orígenes de JavaScript autorizados: la dirección donde está publicada la
//     app: https://gustavofarg-hash.github.io (sin barra ni carpeta al final).
//  4) Pegá acá el ID de cliente (termina en .apps.googleusercontent.com).
export const GOOGLE_DRIVE_CLIENT_ID = "";

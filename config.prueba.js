// Configuración de la VERSIÓN DE PRUEBA (/prueba/).
// Proyecto mis-partidos-prueba. Nunca pegar acá futbol-partidos: esa es producción.
// La raíz de GitHub Pages sigue importando config.js, no este archivo.
// El workflow copia este archivo encima de config.js solo dentro de /prueba/.
export const firebaseConfig = {
  apiKey: "AIzaSyCRdic552hOtfmVnR2LIQVNZOi2dub_2DU",
  authDomain: "mis-partidos-prueba.firebaseapp.com",
  projectId: "mis-partidos-prueba",
  storageBucket: "mis-partidos-prueba.firebasestorage.app",
  messagingSenderId: "131662006103",
  appId: "1:131662006103:web:37bdf25201ab3465742012",
};

export const ACCESS_CODE = "";

export const ADMIN_EMAIL = "gustavof.arg@gmail.com";

export const ORGANIZERS = ["Gustavo", "Martín"];

export const CAPACITY = 14;

export const VENUE = "Polideportivo Colegiales";

// Sin el ID de Drive de producción. En la prueba, «Guardar en Google Drive»
// descarga el archivo o abre el menú de compartir.
export const GOOGLE_DRIVE_CLIENT_ID = "";

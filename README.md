# ⚽ Fútbol 7 · Polideportivo Colegiales

App web (PWA, se instala en el celular) para organizar los partidos de **fútbol 7 contra 7 (14 jugadores)** del Polideportivo Colegiales. Es un sitio **estático** (HTML + CSS + JavaScript, sin compilación), listo para publicar en GitHub Pages.

## Qué hace (v1)

- **Inicio:** partidos de hoy y de los próximos 7 días (hoy se queda en esta lista todo el día), con día, fecha, hora y anotados (ej. `9/14`). Los que están más lejos aparecen en “Más adelante”.
- **Historial de partidos:** cuando la fecha ya pasó, el partido sale del inicio y queda en Historial (menú del inicio y de Ajustes). El más reciente primero, con fecha, hora y cantidad de jugadores. Abrirlo es la misma pantalla del partido: se pueden anotar pagos tarde, editar jugadores y ver la espera. No se borra solo. Quién lo ve sigue siendo el permiso del partido (Solo yo incluido).
- **Equipos:** en cada partido, Equipos reparte a los anotados (no a la lista de espera) entre Con pechera y Sin pechera. Un toque los mueve. Se ve el conteo (por ejemplo 7 y 7) y un aviso si quedó desbalanceado. Mezclar al azar y Limpiar. Se guarda en el partido (`teams.bib` y `teams.plain`) y lo ven al toque los que pueden ver ese partido; lo cambian los que pueden anotar. Si alguien se baja, sale del equipo. Compartir por WhatsApp arma el mensaje con el mismo link de siempre. También se consulta desde el Historial.
- **Cancelar partido:** si hay jugadores (titulares o lista de espera), no se puede borrar. En ese lugar está **Cancelar partido**: queda `cancelled`, se ve el badge Cancelado en el inicio, en el detalle y en el Historial, y se puede reactivar. Sin jugadores, Borrar sigue igual. Al cancelar se puede escribir el motivo en Notas y la app pregunta si avisar por WhatsApp (un link por jugador, sin el link de confirmación). No salen recordatorios y la página de confirmación no pide sí o no.
- **Notas:** texto libre del partido (`notes`, hasta 2000 caracteres), distinto de la nota corta de la tarjeta. Se edita al abrir el partido, también desde el Historial, y se guarda al toque. Lo cambian quienes pueden anotar.
- **Agregar partido:** fecha, hora y nota opcional.
- **Importar desde texto:** pegás un mensaje del grupo de WhatsApp y la app detecta expresiones como `jueves 22/10 21hs`, `miércoles 20:00`, `mañana 19 hs`, `sábado 24 de octubre a las 18`, `hoy a las 21 y media`, `jueves 20 y 21hs`. Muestra una **vista previa** para corregir y confirmar. Si pegás el mensaje con encabezado de WhatsApp (`[19/10/26, 12:40] Martín: …`), usa esa fecha como referencia para “mañana”, “jueves”, etc.
- **Detalle del partido:** 14 lugares. Agregás jugador con nombre y WhatsApp (el número se normaliza: `11 1234-5678` → `5491112345678`; acepta `011 15…`, `15…`, `+54 9…`, otras características como `0351 15…`). Botón de **WhatsApp** por jugador que abre `https://wa.me/<número>?text=…` con un mensaje con día, fecha y hora. Editar y quitar jugadores. **Copiar / compartir** la lista como texto.
- **Pagos:** en cada jugador, el botón 💵 abre un formulario para marcar si pagó, cuánto en **efectivo**, cuánto por **transferencia** (cualquiera puede ser 0) y si **transfiere después**. Al lado de cada monto hay un desplegable con quién lo cobró (`cashTo`, `transferTo`, `pendingTo`). Las opciones salen de la colección `organizers` (la misma de Ajustes) y se actualizan al momento. Si la colección está vacía o no se puede leer, quedan Gustavo y Martín. Un nombre que ya estaba en un pago y se borró de la lista sigue seleccionado. Cada desplegable arranca en quien está usando el teléfono y solo cuenta si ese monto es mayor a 0. Si al marcar cobrada una transferencia pendiente el destino no es el mismo de la transferencia ya cobrada, los montos quedan separados. Lo cobrado es la suma de efectivo y transferencia. Transfiere después es una promesa: no entra en Recaudado, ni en el perfil, ni en el total por organizador, hasta que se toca **Marcar transferencia como cobrada** (pasa a transferencia, con quién y la fecha). En la fila se ve en verde lo cobrado y un cartel `Transfiere después $X`. Arriba del partido: `Recaudado: $45.000 · 9/14 pagaron · Transfiere después: $1.500`. Eso también entra en el texto de copiar/compartir. Un pago viejo, de un solo monto y un medio, se lee entero como efectivo o como transferencia, y `receivedBy` vale para las dos partes. Un pago viejo sin cobrador cuenta como **Sin especificar**. En **Pagos** hay una lista de quienes todavía deben transferir, también por organizador.
- **Precios y promos:** en Ajustes, cualquier organizador o admin edita el precio de un partido (5000), la promo de 2 (9000) y la de 3 (12000). Se guardan en `settings/prices` y se ven al toque. Si el documento no existe, se usan esos valores. El pago arranca en el precio de un partido. Si la misma persona (teléfono, o id del plantel si no hay teléfono) está como titular en 2 o 3 partidos del mismo día, la fila y la hoja muestran `Promo 2 partidos por $9.000` o `Promo 3 partidos por $12.000`. **Aplicar a los N partidos** cobra la promo en todos, repartida en partes iguales (el resto queda en el primero). Del cuarto partido en adelante se suma el precio de uno. La lista de espera no entra.
- Cada jugador muestra **quién lo anotó** y, si pagó, **quién cobró**. Eso sale del nombre de la cuenta con la que entraste. El perfil y la pantalla **Pagos** muestran el total, el monto por mes (`Oct 2026: $10.000`), cuánto cobró cada organizador y cuántas veces anotó a alguien. El botón **Mis** (al lado del nombre) deja solo lo que anotaste y lo que cobraste; el cupo del partido sigue siendo el de todos.
- **Tiempo real** con Firebase Firestore: lo que carga uno lo ve el otro al instante. Funciona también sin conexión (se sincroniza al volver).
- **Modo demo:** si `config.js` no tiene la configuración de Firebase, la app guarda todo solo en el teléfono y muestra el aviso *“Modo demo: los datos no se comparten todavía”*.
- Interfaz en castellano rioplatense, tema verde, modo oscuro automático según el teléfono. Zona horaria: America/Buenos_Aires.

> **WhatsApp automático:** en v1 no es posible leer el grupo “Polideportivo Colegiales” automáticamente (WhatsApp no da acceso a grupos personales). Por eso existe “Importar desde texto”. Los datos ya están pensados para que un importador automático escriba después (ver *Modelo de datos*).

## Archivos

```
index.html            Pantalla principal
styles.css            Estilos (claro/oscuro)
config.js             ← ACÁ va la configuración de Firebase (y código de acceso opcional)
js/app.js             Interfaz
js/auth.js            Entrada: Email/Password o cuentas de demo
js/store.js           Datos: Firestore en tiempo real o localStorage (modo demo)
js/parser.js          Lector de fechas/horas en español
js/phone.js           Normalización de números argentinos y links wa.me
js/dates.js           Fechas en hora de Buenos Aires
js/payments.js        Pagos: monto, medio, quién cobró y textos
js/prices.js          Precios y promo del mismo día
js/organizers.js      Lista de organizadores
js/ledger.js          Totales por mes, por jugador y por organizador
js/waiting.js         Orden de la lista de espera
manifest.webmanifest  PWA (nombre, íconos, colores)
sw.js                 Service worker (funciona offline)
icons/                Íconos de la app
firestore.rules       Reglas de seguridad de Firestore (v1)
tests/                Pruebas (unitarias + Playwright)
screenshots/          Capturas con datos de ejemplo
```

---

## Paso 1 · Crear el proyecto gratis en Firebase

Necesitás una cuenta de Google. El plan gratuito (**Spark**) alcanza de sobra; no hace falta tarjeta.

1. Entrá a <https://console.firebase.google.com> y tocá **“Crear un proyecto”** (o “Agregar proyecto”).
2. Nombre: por ejemplo `futbol-colegiales`. Podés **desactivar Google Analytics** (no hace falta). Tocá **Crear proyecto**.
3. **Crear la base de datos Firestore:**
   1. En el menú de la izquierda: **Compilación (Build) → Firestore Database → Crear base de datos**.
   2. Edición **Standard**. Ubicación: `southamerica-east1 (São Paulo)` es la más cercana (no se puede cambiar después).
   3. Elegí **“Iniciar en modo de producción”** (después pegamos nuestras reglas). Tocá **Crear**.
4. **Las reglas se publican al final**, después de crear la cuenta de administrador. El orden está en [Cuentas y reglas](#cuentas-y-reglas-hacer-en-este-orden). El mail del admin ya está en los dos archivos: `gustavof.arg@gmail.com`.
5. **Registrar la app web:**
   1. Volvé a la página principal del proyecto (ícono de engranaje ⚙️ → **Configuración del proyecto**).
   2. En **“Tus apps”** tocá el ícono **`</>`** (Web).
   3. Apodo: `futbol-colegiales-web`. **No** hace falta tildar Firebase Hosting. Tocá **Registrar app**.
   4. Te muestra un bloque `const firebaseConfig = { apiKey: "...", authDomain: "...", ... }`. Copiá esos valores.
6. **Pegarlos en `config.js`:** reemplazá cada `"TU_..."` por el valor correspondiente:

   ```js
   export const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "futbol-colegiales.firebaseapp.com",
     projectId: "futbol-colegiales",
     storageBucket: "futbol-colegiales.firebasestorage.app",
     messagingSenderId: "1234567890",
     appId: "1:1234567890:web:abcdef123456",
   };
   ```

   > Si la app muestra *“No hay conexión con la base de datos de Firebase”*, la base Firestore no está creada (paso 3) o la API está deshabilitada.

   Listo: al recargar la app desaparece el aviso de modo demo y los datos se comparten en tiempo real.

> Estos valores **no son secretos** (cualquier web con Firebase los expone). Lo que protege los datos son las **reglas** de Firestore; ver *Seguridad* abajo.

7. **Authentication y reglas:** seguí [Cuentas y reglas](#cuentas-y-reglas-hacer-en-este-orden). Recién después de eso la app deja de estar abierta.
8. (Opcional) En Google Cloud podés restringir la API key a tu dominio: Configuración del proyecto → *General* → link a la consola de Google Cloud → **APIs y servicios → Credenciales** → la clave “Browser key” → *Restricciones de aplicaciones: Sitios web* → agregá `https://TU_USUARIO.github.io/*`.

## Paso 2 · Publicar en GitHub Pages (gratis)

1. Creá una cuenta en <https://github.com> si no tenés.
2. Arriba a la derecha **+ → New repository**. Nombre: `futbol-colegiales`. Visibilidad **Public** (GitHub Pages gratis requiere repositorio público). **Create repository**.
3. Subí los archivos de esta carpeta (todo el contenido de `futbol-colegiales/`, incluida la carpeta `icons/`, `js/` y el archivo `.nojekyll`):
   - **Desde la web:** en el repositorio vacío, *“uploading an existing file”*, arrastrá todos los archivos y carpetas → **Commit changes**.
   - **O desde la terminal:**
     ```bash
     cd futbol-colegiales
     git init && git add . && git commit -m "Fútbol 7 Colegiales v1"
     git branch -M main
     git remote add origin https://github.com/TU_USUARIO/futbol-colegiales.git
     git push -u origin main
     ```
4. En el repositorio: **Settings → Pages**. En *Build and deployment*: Source **“Deploy from a branch”**, Branch **`main`** y carpeta **`/ (root)`** → **Save**.
5. En uno o dos minutos la app queda en `https://TU_USUARIO.github.io/futbol-colegiales/`.
6. Mandale el link a Martín **después** de crearle la cuenta desde Usuarios (ver abajo). Entra con su mail y la contraseña. Si la olvida, en la pantalla de entrada toca **Olvidé mi contraseña**.

### Instalarla en el celular

- **Android (Chrome):** abrí el link → menú ⋮ → **Instalar app** (o “Agregar a pantalla principal”).
- **iPhone (Safari):** abrí el link → botón Compartir → **Agregar a inicio**.

### Publicar cambios

Cada vez que cambies archivos, subilos de nuevo al repositorio. Para que los teléfonos tomen la versión nueva enseguida, subí el número de `VERSION` en `sw.js` (ej. `f7c-v2`).

---

## Cuentas y reglas (hacer en este orden)

La app usa **Firebase Authentication → Correo electrónico y contraseña**. No hay Cloud Functions (el plan Spark no las incluye). Quién puede escribir lo deciden las reglas de Firestore, no solo la pantalla.

Hay un administrador. Su contraseña la elige él en «Crear cuenta de administrador» y no queda guardada en el código. Desde **Usuarios** crea a los otros organizadores (nombre, mail y contraseña inicial). Puede desactivarlos o borrar el documento `users/{uid}`. Borrar no elimina la cuenta de Authentication: eso se hace a mano en la consola, en Authentication → Users. La contraseña de un organizador se cambia con **Olvidé mi contraseña** (`sendPasswordResetEmail`). El admin no la redefine después.

`ADMIN_EMAIL` en `config.js` y `adminEmail()` en `firestore.rules` ya son el mismo mail, en minúsculas: `gustavof.arg@gmail.com`. La regla lo compara sin distinguir mayúsculas (`Gustavof.Arg@gmail.com` también entra). Si ese texto volviera a ser `TU_EMAIL_ADMIN`, el alta del admin queda rechazada.

### Orden seguro en este proyecto

Hoy las reglas **publicadas** siguen abiertas. Las de este repo las cierran. Publicar no borra partidos ni jugadores.

1. Consola de Firebase → **Compilación → Authentication → Sign-in method** → **Correo electrónico/contraseña** → **Habilitar** → Guardar. No publiques reglas todavía.
2. El mail ya está cargado, en minúsculas, en los dos archivos: `gustavof.arg@gmail.com`. No hace falta reemplazar un placeholder. Tiene que seguir igual en `config.js` (`ADMIN_EMAIL`) y en `firestore.rules` (`adminEmail()`).
3. Abrí la app con ese `config.js` (el sitio publicado, o `python3 -m http.server` en esta carpeta). Con las reglas **viejas** todavía publicadas, tocá **Crear cuenta de administrador** y usá `gustavof.arg@gmail.com` (da igual si lo escribís con mayúsculas), una contraseña que solo vos sepas, y tu nombre. Eso escribe `users/{uid}` con `role: "admin"`.
4. Recién ahí: Firestore Database → **Reglas** → pegá [`firestore.rules`](firestore.rules) → **Publicar**.
5. Entrá con la cuenta de admin → ⚙️ → **Usuarios** → creá al otro organizador. Pasale el mail y la contraseña por otro canal.

Si publicás las reglas nuevas **antes** de crear la cuenta, no quedás afuera: la regla de alta deja que `gustavof.arg@gmail.com` cree su propio `users/{uid}` con rol admin. Hasta que ese documento exista (unos segundos) no puede editar partidos. Publicar no borra datos.

Después de publicar, abrí la app una vez con la sesión iniciada. Así los jugadores que ya estaban reciben su documento en `confirmations`. Hasta entonces, los links viejos de `confirmar.html` no abren: un visitante ya no puede leer la colección `players`.

### Qué puede hacer cada uno

- **La única diferencia** es la colección `users`. El admin crea organizadores, los desactiva (`active: false`) y borra el documento. Un organizador no puede crear ni borrar cuentas, ni cambiar roles. El alta deja el rol en `organizer`; la regla de update solo deja tocar `active`.
- **En todo lo demás son iguales:** partidos, altas y bajas de jugadores, pagos, lista de espera, plantel, perfiles y las fichas de confirmación. Los dos ven todos los datos. **Mis** es solo un filtro de la pantalla.
- **Sin cuenta:** no se modifica nada, salvo `confirmar.html`. Con el token del link puede leer solo la ficha `confirmations/{token}` (nombre, fecha, hora, nota, su respuesta; sin teléfonos) y escribir únicamente `confirmed` y `confirmedAt` de esa ficha.

## Modelo de datos (Firestore)

Pensado para que más adelante un importador automático (bot de WhatsApp, script, etc.) pueda escribir partidos sin duplicar.

**Colección `matches`** — id del documento: `AAAA-MM-DD_HHMM` (ej. `2026-10-22_2100`; si ya existe se agrega `-2`, `-3`…)

| campo | tipo | ejemplo |
|---|---|---|
| `date` | string `AAAA-MM-DD` (hora de Buenos Aires) | `"2026-10-22"` |
| `time` | string `HH:MM` 24 h | `"21:00"` |
| `startsAt` | número (epoch ms, calculado con `-03:00`) | `1792713600000` |
| `note` | string | `"Cancha 2"` |
| `capacity` | número | `14` |
| `source` | `"manual"` \| `"texto"` \| `"whatsapp"` | `"whatsapp"` |
| `sourceRef` | string o null — id del mensaje de origen, para deduplicar | `"wamid.HBg..."` |
| `sourceText` | string o null — texto original | `"jueves 22/10 21hs"` |
| `createdBy`, `updatedBy` | `"Gustavo"` \| `"Martín"` \| `"bot"` | |
| `createdAt`, `updatedAt` | número (epoch ms) | |
| `notes` | string, hasta 2000. Texto libre (motivo de cancelación u otra cosa). Distinto de `note` | |
| `cancelled` | bool. Si es true, el partido sigue en la lista con badge y no se borra | |
| `cancelledAt`, `cancelledBy` | número o null, y uid o null | |
| `playerCount` | int ≥ 0. Lo escribe el cliente al anotar o quitar. El borrado exige 0 | |

Hay que **volver a publicar** `firestore.rules` para que el borrado falle cuando `playerCount` es mayor a 0, y para que `notes`, `cancelled` y el `cancelled` de la ficha de confirmación queden validados. Sin republicar, la app igual guarda esos campos (las reglas viejas no cierran la lista), pero un partido con jugadores se podría borrar directo en Firestore. Si `playerCount` no está, la regla nueva lo toma como 0. Quien puede editar el partido podría poner el contador en 0 y después borrarlo: la regla no cuenta los documentos de `players`.

**Colección `players`** — id automático

| campo | tipo |
|---|---|
| `matchId` | id del partido |
| `matchDate` | copia de `date` (para consultar por fecha) |
| `name` | string |
| `phone` | solo dígitos, formato wa.me (ej. `5491112345678`) o vacío |
| `addedBy` | quién lo anotó (Gustavo, Martín u otro de la lista) |
| `createdAt`, `updatedAt` | número (epoch ms) |
| `paid` | bool, opcional — si ya se cobró algo (efectivo + transferencia). Solo pendiente queda en false |
| `amount` | número o null — pesos cobrados (efectivo + transferencia). No incluye lo pendiente |
| `method` | `"efectivo"` si solo hay efectivo, `"transferencia"` si solo hay transferencia, null si hay de los dos o solo pendiente |
| `cash` | número o null — efectivo cobrado. En un pago nuevo, 0 si no hubo efectivo |
| `transfer` | número o null — transferencia cobrada |
| `pendingTransfer` | número o null — prometió transferir y todavía no llegó. No suma en los totales |
| `transferReceivedAt` | número o null — cuándo se marcó la transferencia pendiente como cobrada |
| `transferReceivedBy` | string o null — quién la marcó |
| `paidUpdatedBy` | quién cargó el pago |
| `paidUpdatedAt` | número (epoch ms) |
| `receivedBy` | quién cobró, o null / ausente = `Sin especificar`. Si efectivo y transferencia fueron a la misma persona, queda ese nombre. Si fueron a dos, queda null y manda cada parte |
| `cashTo` | string o null — quién cobró el efectivo. Si no está, vale `receivedBy` |
| `transferTo` | string o null — quién cobró la transferencia cuando es una sola persona |
| `transferParts` | lista o null — `{ to, amount }` si la transferencia se reparte entre organizadores (hasta 6) |
| `pendingTo` | string o null — a quién le va a transferir. Si no está, lo pendiente queda en `paidUpdatedBy` |
| `rosterId` | string opcional — id del plantel, para la promo cuando no hay teléfono |
| `waiting` | bool — `true` si está en la lista de espera |
| `waitOrder` | número o null — menor = más arriba en la espera. Los nuevos van al final |
| `rosterAt` | número o null — cuándo pasó a la lista principal |
| `confirmToken` | string — token del link de confirmación. Se crea al anotar al jugador. Si un jugador viejo no lo tiene, la app lo escribe la primera vez que lo ve (sin abrir el flujo de envío) |
| `confirmed` | `"si"` \| `"no"` — respuesta del jugador |
| `confirmedAt` | número (epoch ms) |
| `reminderSentAt` | número (epoch ms) — cuándo se abrió el WhatsApp del recordatorio |
| `tentative` | bool o null — lugar reservado, a confirmar. Ocupa un cupo y no es un sí |
| `tentativeAt` | número (epoch ms) o null — cuándo se reservó |

Hay que **volver a publicar** `firestore.rules` para que `tentative` (bool o null) y `tentativeAt` (número o null) queden validados. Las reglas ya publicadas igual dejan escribir esos campos, porque `validPayment` no cierra la lista. Republicar rechaza un texto en lugar de bool o número. `settings/prices` ya es una colección aparte: el cierre `match /{document=**}` la niega hasta republicar. Mientras tanto la app usa 5000, 9000 y 12000 y avisa en castellano. Después de publicar, un precio negativo o con centavos queda rechazado, y cualquier organizador activo puede leer y guardar los tres precios.

**Recordatorio:** un partido cancelado no muestra el cartel ni arma recordatorios. En el partido, **Enviar recordatorios** arma un mensaje por jugador con WhatsApp y un link único `confirmar.html?m=<partido>&p=<jugador>&t=<token>`. Arranca en **Mis jugadores** (los que anotó quien está logueado; «Gustavo» y «Martín» viejos cuentan para esas cuentas). **Todos** muestra el partido entero. La página de confirmación no pide cuenta. Lee la ficha pública `confirmations/{token}` (sin teléfono) y, si el token coincide, guarda solo `confirmed` y `confirmedAt`.

La lista del organizador muestra esa ficha, no el campo `confirmed` del jugador. Al anotar, al cobrar o al abrir la app, el organizador actualiza nombre, fecha y hora de la ficha y **no vuelve a escribir** `confirmed` ni `confirmedAt`. Así un «Sí, juego» no se borra. Si el jugador ya tenía token pero no ficha, **Enviar recordatorios** (y la primera carga) crea la ficha igual.

**Tamaño del texto:** el encabezado tiene **A−** y **A+**. En Ajustes están Chica, Normal, Grande, Muy grande y Enorme. Normal es el tamaño de la app (18px en la raíz, un poco más grande que los 16px de antes). Se guarda en ese teléfono (`f7c-text-size`) y vale también en `confirmar.html`, antes de pintar.

WhatsApp **no se manda solo**. `wa.me` abre el chat y hay que tocar enviar. No hay API de WhatsApp Business ni Cloud Functions (el plan Spark no las incluye).

Si el partido empieza en **2 horas o menos** y a quien está logueado todavía le falta avisar a alguien **que él anotó** y tiene teléfono, la app muestra el cartel **Faltan 2 horas: mandá los recordatorios** en el inicio y en el partido. Gustavo lo ve por sus jugadores y Martín por los suyos. Tocarlo abre el mismo envío, también en Mis jugadores. `reminderSentAt` es compartido: en **Todos**, los dos ven a quién ya se le abrió el chat. El cartel de cada uno se va cuando sus propios jugadores quedaron enviados. El aviso del navegador (Notification) solo sale si la app **está abierta** justo cuando se cumplen esas 2 horas, el permiso ya estaba concedido (Ajustes → «Aviso 2 horas antes») y a ese organizador le falta avisar a los suyos. Si el teléfono tiene la app cerrada, no hay aviso.

### Armar los links desde afuera (sin abrir la app)

`js/reminders.js` exporta `reminderLinks({ match, players, venue })`. Devuelve `[{ name, waUrl, confirmUrl }]` para cada jugador que tenga `phone` y `confirmToken`. El lugar por defecto es `Polideportivo Colegiales`. El origen del link es `https://gustavofarg-hash.github.io/futbol-colegiales/confirmar.html`.

Con las reglas de este repo, `players` y `matches` **no** se leen sin una cuenta de organizador. Un script anónimo ya no puede armar los links por REST: el teléfono vive solo en `players`. La ficha pública es `confirmations/{token}` y no trae teléfonos. La app, con la sesión iniciada, crea esa ficha al anotar y también la primera vez que ve un jugador viejo.

Estas lecturas, después de publicar las reglas, necesitan además el token de un organizador (`Authorization: Bearer`). La API key sola ya no alcanza.

Partido:

```
GET https://firestore.googleapis.com/v1/projects/futbol-partidos/databases/(default)/documents/matches/AAAA-MM-DD_HHMM?key=LA_API_KEY
```

Jugadores de ese partido (`runQuery`):

```
POST https://firestore.googleapis.com/v1/projects/futbol-partidos/databases/(default)/documents:runQuery?key=LA_API_KEY
{ "structuredQuery": { "from": [{ "collectionId": "players" }], "where": { "fieldFilter": { "field": { "fieldPath": "matchId" }, "op": "EQUAL", "value": { "stringValue": "AAAA-MM-DD_HHMM" } } } } }
```

En la respuesta REST, el id del jugador es el último segmento de `document.name`. Los campos vienen envueltos: `stringValue` para textos y `integerValue` (a veces `doubleValue`) para los epoch en ms. Campos que usa el link:

| campo | uso |
|---|---|
| `name` | saludo, primera palabra |
| `phone` | solo dígitos, va en `https://wa.me/<phone>` |
| `confirmToken` | query `t`. Si falta, no armar el link (la app lo completa cuando alguien la abre) |
| `matchId` | query `m` |
| id del documento | query `p` |
| `reminderSentAt` | si está, ese jugador ya tuvo el chat abierto |

Del partido: `date` (`AAAA-MM-DD`), `time` (`HH:MM`), `note` (string, puede faltar).

El mensaje, igual que en la app:

```
¡Hola {primer nombre}! Te escribo por el fútbol 7 en Polideportivo Colegiales el {día} {dd}/{mm} a las {HH:MM} hs{ (nota)}. ¿Confirmás que jugás? Respondé en este link: {confirmUrl}
```

`{día}` es el día de la semana en español y minúsculas (domingo … sábado) de esa fecha de calendario. La nota, si hay, se agrega entre paréntesis justo antes del punto, con un espacio: ` hs (Cancha 2).`. El link:

```
https://gustavofarg-hash.github.io/futbol-colegiales/confirmar.html?m={matchId}&p={playerId}&t={confirmToken}
```

`waUrl` es `https://wa.me/{phone}?text={mensaje}` con el mensaje en `encodeURIComponent`. Un script puede copiar esa fórmula o importar `reminderLinks`.

**Lista de espera:** se puede anotar a alguien aunque el partido no esté lleno. Si ya hay 14, el alta normal también cae en la espera (al final). Las flechas ↑ ↓ cambian `waitOrder` y los dos organizadores ven el mismo orden al toque. En cada fila, **Subir al partido** sube a esa persona (queda deshabilitado si ya hay 14). Al quitar un titular, se ofrece subir al primero. Después de cualquier subida, si tiene WhatsApp pregunta si avisarle: **Sí** abre `wa.me` con el mensaje y su link de confirmación; hay que tocar enviar. Sin número, solo un cartel.

**Lugar reservado:** al anotar en el partido (formulario, búsqueda o varios partidos desde el perfil) se puede marcar **Lugar reservado (a confirmar)**. Ocupa cupo, no va a la espera, y el badge dice **Reservado · a confirmar**. **Confirmar lugar** lo suelta. Si responde **Sí** en el link, también se suelta. Si responde **No**, el badge sigue y dice que se puede liberar el lugar.

La barra del partido, de izquierda a derecha: ícono **Compartir lista**, **Anotar en lista de espera** y **Agregar jugador**. El botón de agregar no cambia de nombre cuando el partido está lleno: si no hay lugar, esa persona va a la espera.

**Quién ve el partido:** al crearlo (botón **Crear**) se elige quién lo ve y quién anota. Por defecto son todos (`viewers` y `adders` con `*`), también los que se sumen después. **Solo yo: nadie más lo ve, tampoco el admin** deja las dos listas en el creador y apaga el resto. Si sacás a alguien de la lista, esa persona no lo ve: ni organizador ni admin. No hay cartel de las 2 horas. Quien lo ve pero no anota lo tiene en solo lectura. El límite, si tiene un número, cuenta titulares y espera (`addedBy` / `addedByUid`); vacío = sin límite. Lo aplica la app: las reglas no pueden contar jugadores. Después solo el creador cambia esos permisos. En un partido restringido, solo el creador lo borra. Un partido viejo, sin estos campos, sigue visible para todo el personal activo.

Hay que **volver a publicar** `firestore.rules` después de abrir esta versión una vez: la app marca los partidos, jugadores y fichas viejos con `viewers: ['*']` mientras las reglas de antes sigan publicadas. Si publicás primero, esos partidos dejan de aparecer en la lista hasta ese marcado. El admin no entra a un partido Solo yo ni a sus jugadores ni al listado de fichas. El link de confirmación (con el token) sigue abriendo esa ficha.

El pago va en el documento del jugador (no en una colección nueva). Hasta que se publiquen las reglas nuevas, las que están en la consola dejan pasar campos extra. Después de publicarlas, solo un admin o un organizador activo puede escribir, y el tipo de cada campo queda validado.

**Colección `roster`** — jugadores guardados (pantalla Jugadores). Id automático.

| campo | tipo |
|---|---|
| `name` | string, 1 a 60 |
| `phone` | solo dígitos, formato wa.me, o vacío |
| `createdBy` | quién lo guardó |
| `createdAt`, `updatedAt` | número (epoch ms) |
| `level` | número 1 a 10, el nivel de juego |
| `positions` | lista: `Arquero`, `Defensa`, `Mediocampo`, `Ataque` |
| `notes` | lista de notas `{ id, matchId, matchDate, matchTime, text, createdAt, updatedAt }`, la más nueva primero |

Misma persona = mismo `phone`. Al anotar en un partido (o en la espera) con WhatsApp, si ese número no está, se guarda solo. En el formulario de alta, «Buscar guardados» encuentra por las primeras letras del nombre o del apellido (sin importar mayúsculas ni acentos: `ERN` → Ernesto Pereira, `perez` → José Pérez) o por cualquier tramo del teléfono (solo dígitos, se ignoran espacios, guiones y `+54 9`). Tocar un resultado lo anota en ese partido; si ya hay 14, va a la espera. También se puede escribir uno nuevo.

Tocá un jugador en un partido o en Jugadores para abrir el perfil (el mismo teléfono). Ahí se editan el nivel, las posiciones y las notas de un partido. «Jugó N veces» y «Mayormente jueves · 21:00» salen solos de los partidos ya pasados en la lista principal (la espera y los que todavía no se jugaron no cuentan).

**Partidos**, en el perfil: lista los próximos (fecha, día, hora y lugares libres). Cada uno tiene un casillero y un botón **Anotar en N partidos**. Si ya está, el casillero queda marcado y dice **Anotado** o **En espera**; no se duplica el teléfono en ese partido. Si está completo, antes de confirmar se ve **Completo · va a la espera** y entra a la lista de espera con las mismas reglas que anotar desde el partido (`addedBy` del organizador actual, ficha de confirmación y link). Tocá el partido para abrirlo, o **Quitar** para sacarlo de ese solo.

**Colección `users`** — una cuenta por documento. El id es el `uid` de Authentication.

| campo | tipo |
|---|---|
| `role` | `"admin"` o `"organizer"` |
| `name` | string, 1 a 40. Es el nombre de «Agregó» y de «cobró» |
| `email` | el mail de la cuenta |
| `active` | bool. `false` entra a Authentication pero la app lo saca |
| `createdAt` | número (epoch ms) |

El primer admin se crea solo si el mail de la sesión es `ADMIN_EMAIL`. Los demás los crea el admin. Los nombres viejos Gustavo y Martín siguen valiendo en los partidos que ya están cargados.

**Colección `confirmations`** — id = token del link. Sin teléfono.

| campo | tipo |
|---|---|
| `playerId`, `matchId`, `name` | a quién corresponde |
| `date`, `time`, `note` | lo mínimo para mostrar el partido |
| `confirmed` | `null`, `"si"` o `"no"` |
| `confirmedAt` | número (epoch ms) o null |

Cualquiera puede leer **un** documento si conoce el id. No se puede listar la colección sin ser organizador. Un anónimo solo puede cambiar `confirmed` y `confirmedAt`.

**Colección `organizers`** — queda para los nombres que se cargaron antes (Gustavo, Martín, y los que se hayan agregado). La identidad de ahora sale de `users`, no de un selector.

**Hay que publicar estas reglas una sola vez, en el orden de arriba.** Reemplazan a las abiertas. Cubren `roster` (nivel, posiciones, notas), `organizers`, `users`, `confirmations` y el cierre del resto. En modo demo no hace falta publicarlas.

Un importador automático solo tiene que hacer `set` en `matches/<AAAA-MM-DD_HHMM>` con `source: "whatsapp"` y `sourceRef`; la app lo muestra al instante. El parser de texto (`js/parser.js`, función `parseMatchesFromText`) es JavaScript puro y se puede reutilizar desde Node.

## Probar en la computadora

```bash
cd futbol-colegiales
python3 -m http.server 8080        # y abrí http://localhost:8080
```

(No funciona abriendo `index.html` con doble clic: los módulos de JavaScript necesitan un servidor.)

Pruebas:

```bash
npm install                        # instala Playwright (solo para pruebas)
npx playwright install chromium
npm test                           # pruebas del parser y de los teléfonos
npm run test:e2e                   # prueba completa en Chromium 390x844 (modo demo, con el servidor corriendo)
node tests/firebase-realtime.mjs http://localhost:8080/   # prueba contra Firebase real: 2 navegadores (Gustavo y Martín), tiempo real, edición, borrado y limpieza
```

Los datos del modo demo quedan solo en ese navegador. Para empezar de cero: ⚙️ Ajustes → *Borrar datos de demo*.

En demo las cuentas ya existen (no se manda el mail de «olvidé mi contraseña»):

| mail | contraseña | nombre | rol |
|---|---|---|---|
| `gustavo@demo.local` | `demo-gustavo` | Gustavo | admin |
| `martin@demo.local` | `demo-martin` | Martín | organizador |

Esas contraseñas viven en `localStorage` (`f7c-demo-auth`), no en Firestore.

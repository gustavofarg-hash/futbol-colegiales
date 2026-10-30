# Mis Partidos: lista de pedidos y control de regresiones

> **Antes de cada cambio, revisar esta lista y no quitar nada sin pedido explícito de Gustavo. Al terminar, actualizarla.**

Auditoría de solo lectura sobre `main` en `/workspace/fc-audit`, con la versión **f7c-v61** (`js/app.js:37`, `sw.js:3`). Hecha el 30/10/2026.
**Actualizada para f7c-v65** (rama `cursor/ficha-credito-apodo-c20d`, 30/10/2026): en la ficha del jugador y en el menú, el mismo bloque con el apodo editable, el saldo a favor en verde, la deuda en rojo y «Cargar crédito». En Firebase el botón no aparecía si el uid de la sesión no estaba en `adders` (`canAdd`); ahora lo ve cualquier organizador o el admin. `firestore.rules` no cambió.
**Actualizada para f7c-v64** (rama `cursor/saldo-credito-deudas-253c`, 30/10/2026): saldo a favor, descontar del crédito, deudas viejas, sobrante del pago dividido y renombre del invitado en la promo del día. Los números de línea son de la versión en que se revisó cada punto y pueden correrse.
Fuentes: los títulos y textos de los PR #1–#46, `git log` y `README.md`.
**Nota:** no pude leer las conversaciones del bot «Creador de apps». El acceso a ese otro agente me devolvió la sesión propia, así que puede faltar algún pedido que se hizo en el chat y nunca llegó a un PR.
Las fechas son de cuando se mergeó el PR, en hora de Buenos Aires.

Pruebas sobre esta copia: **e2e 527/527 OK** (`node tests/e2e.mjs`, modo demo, 390×844) y **unit 92/92 OK** (`node --test tests/unit.test.mjs`). El e2e de v65 arma un uid con forma de Firebase que no está en `adders` y revisa el bloque en la lista del partido, la espera, Jugadores, Faltan pagar, Historial y Equipos.

Estados: ✅ está · ⚠️ parcial · ❌ falta o se perdió · ↩️ reemplazado a pedido (no es regresión)

---

## Partidos (Próximos, detalle, anotar)

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Lista de espera, lugar reservado, confirmación por link | ✅ | `js/waiting.js`, `confirmar.html`, «Confirmar lugar» |
| 19/10 (#7) | «Subir al partido» en cada fila de espera y aviso por WhatsApp al subir | ✅ | `app.js`: «Subir al partido». Desde v63 el aviso pregunta con Sí/No (`offerPromotionWhatsApp`, `app.js:1397`) |
| 19/10 (#5) | Anotar en varios partidos desde el perfil | ✅ | «Anotar en …» en el perfil, «Aplicar a los» |
| 19/10 (#10) | La selección del perfil persiste y los de la espera no figuran como «sin respuesta» | ✅ | PR #10, e2e OK |
| 20/10 (#12) | Hoy queda todo el día en el inicio | ✅ | `matchCard`: `rel==='Hoy'` |
| 20/10 (#14) | Cancelar partido (con jugadores) y notas | ✅ | «Cancelar partido» y «Reactivar partido» |
| 20/10 (#16, #22) | Link corto de confirmación `/c/?k=`, acortado con spoo.me o da.gd | ✅ | `js/short.js`, `js/shorten.js`, `js/short-go.js`, `c/index.html` |
| 20/10 (#17) | Tres pestañas fijas; Próximos 7 días y «Ver más adelante» | ✅ | «Ver más adelante» en `app.js` |
| 20/10 (#20) | La pantalla no se refresca sola; «Cancelar» solo en partidos no pasados | ✅ | `app.js:3725`: no re-renderiza con una hoja abierta |
| 20/10 (#21) | Sede del partido y jugadores por equipo (5–11) | ✅ | «Jugadores por equipo», `js/venues.js` |
| 20/10 (#23) | Botón «+» para agregar nuevo, sin duplicados, amigos del jugador | ✅ | «Agregar como nuevo», «Ya anotado» |
| 20/10 (#24) | Completar el nombre y el WhatsApp de un amigo | ✅ | «Editar invitado» en el formulario del jugador |
| 20/10 (#25) | «Invitado de», colores, «Bajar a lista de espera» | ✅ | «invitado de», «Bajar a lista de espera» |
| 20/10 (#26) | Un invitado no puede agregar invitados | ✅ | «Un invitado no puede agregar invitados» |
| 26/10 (#27 A1–A5, D1) | «Fútbol N», cancha, precio por partido, «Se anotó con», «Juega gratis», cupo coherente | ✅ | `signupFields` «Se anotó con:» (`app.js:237`), «Juega gratis», «Cancha» |
| 26/10 (#28 E1–E2) | La lista muestra «21hs ($5.000)»; el detalle muestra dd/mm/aaaa y «Cancelar» rojo abajo con confirmación | ✅ | `matchCard` (`app.js:514`) |
| 26/10 (#29 F3) | «Anotar como pendiente de confirmación» | ✅ | Está en `app.js` |
| 27/10 (#31) | La lista no muestra la sede ni el formato al pie | ✅ | PR #31 |
| 27/10 (#33, #34) | Las filas de pendiente y de espera no se aplastan en vertical | ✅ | `styles.css` |
| 27/10 (#42) | WhatsApp arriba del botón de pago y nombres sin cortar | ✅ | En `#slots` (`slotSide`, `app.js:48`; `.slot-actions` en columna). **v63:** la lista de espera (`#wait-list`) tampoco corta: muestra el apodo (o el nombre) entero, baja de línea entre palabras y las etiquetas se ven completas (`styles.css`, reglas `#wait-list`). e2e «La lista de espera muestra nombres y etiquetas enteros, sin partir palabras» |
| 29/10 (#43 R1) | Agregar N invitados de una vez | ✅ | `#friend-count` (`app.js:2754`) |
| 29/10 (#43 R5) | Pregunta Sí/No para la lista de espera | ✅ | **v63:** `askYesNo` (`app.js:3527`) en «¿Subir a X…?», en el aviso por WhatsApp al subir, en «¿Quitar también a sus invitados…?» y en «¿Bajar también a sus invitados…?». e2e «… pregunta con Sí y No». Quedan otras preguntas con `confirm()` (ver «Otros puntos») |
| — | Interfaz compacta y moderna | ✅ | Cambios de estilo en #30–#42; no hay una lista de puntos para comparar |

## Jugadores / agenda

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Agenda de jugadores con perfil | ✅ | «Mis jugadores», `js/roster.js` |
| 19/10 (#9) | El perfil abre sin WhatsApp y el número es opcional | ✅ | PR #9 |
| 20/10 (#19) | Solo edita un jugador quien lo agregó | ✅ | `canEditRoster` y «Solo lo puede editar el organizador que lo agregó» |
| 20/10 (#25) | Nivel con un decimal | ✅ | e2e OK |
| 26/10 (#27 C2) | «Nombre corto (o apodo)» | ✅ | **v62 (#47):** en la lista del partido y en la de espera se ve **solo** el apodo (sin apodo, el nombre completo), sin cortarse. El campo se llama «Nombre corto (o apodo)» en Jugadores (`app.js`) y en Editar jugador (`nickField`), y está en **cualquier** jugador ya creado: sin ficha, o con ficha de otro organizador (queda en el jugador del partido). Se ve en Equipos (`shownName`). El nombre completo sigue en el menú del jugador y en Jugadores. **v65:** el mismo campo está en la ficha (`#profile-nick`) y arriba del menú (`#menu-nick`). Lo guarda quien ya podía: en la ficha, quien la creó o el admin (`canEditRosterNick`); en el menú, quien puede escribir el jugador (`canWritePlayer`, `saveNick`). La lista del partido no cambia de forma: sigue mostrando solo el apodo |
| 26/10 (#27 C3) | No se puede borrar de Jugadores a alguien que está anotado | ✅ | «está anotado en»; e2e «No se borra de Jugadores si está anotado» |
| 26/10 (#28 E5) | Jugadores es solo la lista; se saca la pestaña Pagos | ↩️ | Se sacó a pedido. El resumen de pagos quedó en el perfil (`#ledger`, «Por organizador», `app.js:2363`) |
| 27/10 (#35) | El buscador de Jugadores funciona | ✅ | e2e OK |
| 29/10 (#43 R4) | Cada organizador ve en Jugadores solo a los que agregó él | ⚠️ | `rosterForOrganizer` (`roster.js:67`) se usa en Jugadores (`app.js:2132`) y en la búsqueda del partido (3021). e2e «Martín no ve en Jugadores a quien anotó Gustavo». **Las fichas viejas que no tienen dueño las ven todos** |

## Pagos y deudas

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Pagos y cobradores | ✅ | `js/payments.js`, `js/ledger.js` |
| 19/10 (#5) | Partir el pago en efectivo y transferencia; «Transfiere después» | ✅ | «Transfiere después», «Marcar transferencia como cobrada» |
| 19/10 (#6) | Quién cobró cada parte, precios en Ajustes, promo 2 y 3 del mismo día | ✅ | `price-form` en Ajustes, `js/prices.js` |
| 20/10 (#25) | Al tocar un campo de pago vacío, se completa con el precio | ✅ | PR #25, e2e OK |
| 26/10 (#29 F1) | El formulario de pago abre directo | ✅ | `openPaymentForm` (`app.js:3134`) |
| 26/10 (#29 F2) | «Debe en total» en rojo en el perfil | ✅ | «Debe en total» |
| 29/10 (#43 R2) y 30/10 (#44, #46) | Dividir un pago entre el jugador y sus invitados | ✅ | «Dividir entre él y sus invitados», `allocateAcrossDebts` (`payments.js:41`); se guarda de a un jugador |
| 30/10 (v63) | **Invitados en la promo del día: son «quien invita + su nombre»** | ✅ | `personKey` (`js/roster.js`) y `playerPromoKey` (`js/prices.js`): un invitado sin teléfono ni ficha se identifica por la identidad de su anfitrión (`invitedBy` → ese jugador) más su nombre. El Invitado 1 de Vinicio y el de Ernesto no juntan promo; el Invitado 1 del mismo Vinicio en dos partidos del día sí. Lo mismo en los resúmenes de pagos y transferencias (`summaryKey`, `ledger.js`) y en Jugadores (`playerMatchesPerson` no junta invitados por nombre). Unit «promo de invitados…» |
| 30/10 (v63) | **«Guardar backup en Google Drive» descargaba el archivo en vez de guardarlo en Drive** | ✅ | Causa: el botón compartía el archivo con `navigator.share`, pero Chrome solo comparte ciertos tipos y `.json` / `application/json` no está; `canShare` daba falso y caía en la descarga. Además el archivo se armaba después del toque y el permiso del toque podía vencer. Ahora (`js/drive.js`, `openBackup` en `app.js`): el archivo se arma al abrir la hoja. **Con `GOOGLE_DRIVE_CLIENT_ID` en `config.js`**, Google Identity Services pide permiso `drive.file` (solo los archivos que crea la app) y se sube con la API de Drive a la carpeta «Mis Partidos - backups». **Sin ese ID** (o si Drive falla), se abre el menú de compartir con el archivo como `.txt` (mismo JSON adentro), donde se elige Drive; si no hay menú, se descarga. «Restaurar» acepta `.json` y `.txt`. Para activar la subida directa, ver los pasos en `config.js`. Unit «Drive: …» y e2e «Guardar en Drive…», «Drive: …». Capturas `shots-v63/antes|despues-backup-drive.png` |
| 30/10 (v63) | **Agregar invitados en todos sus partidos del mismo día** | ✅ | En «Agregar invitados» (menú del jugador), si esa persona (misma `personKey`) está anotada en otros partidos del mismo día, aparece «También en sus partidos del día» con cada partido marcado (hora, sede si es otra y lugar libre). Al agregar, se crean los mismos invitados (mismo nombre; `invitedBy` = su fila en ese partido) de a uno, así les toca la promo del día. Si el partido está lleno o él está en espera, van a la lista de espera; lo que ya estaba no se repite y lo que no se puede (solo lectura, tope de anotados) se avisa (`sameDayHostMatches`, `addGuestsToSameDay`, `app.js`). e2e «Agregar invitados ofrece sus otros partidos del mismo día…» y siguientes. Captura `shots-v63/despues-invitados-mismo-dia.png` |
| 29/10 (#45 S1) | **La deuda es siempre del organizador de «Se anotó con»** | ✅ | `owesOrganizer` (`ledger.js`). `organizerMatchDebt` y el cuadro «Faltan pagar (que anoté yo)» filtran por «Se anotó con». Si ese dato no está, siguen con «Agregó». Unit «la deuda es el precio…» y e2e «Faltan pagar cuenta a quien se anotó con Gustavo…» |
| 29/10 (#45 S2) | **Cargar crédito (saldo a favor), por jugador y por organizador** | ✅ | `js/credit.js`, colección `credits`. En el menú del jugador, arriba: saldo en verde (`#menu-credit`) y deuda en rojo (`#menu-debt`). Botón «Cargar crédito». e2e «El saldo a favor del menú está en verde…». **v65:** el mismo bloque (`playerPanelPieces`) está en la ficha (`#profile-credit`, `#debt-total`, `#profile-credit-btn`) y en el menú desde la lista, la espera, Faltan pagar, Historial y Equipos. El botón ya no depende de `canAdd`: en Firebase un admin cuyo uid no está en `adders` no lo veía. `canOfferCredit` lo muestra a cualquier organizador o admin. El crédito se suma al del organizador logueado. `firestore.rules` no cambió |
| 30/10 (v65) | **La ficha del jugador deja editar el apodo y cargar crédito** | ✅ | Reemplaza el texto fijo «En los partidos se ve como…». Apodo, saldo verde, deuda roja y «Cargar crédito» junto a «Debe en total». e2e «Jugadores: el perfil tiene apodo…» y «Guardar el apodo en el perfil cambia la lista del partido» |
| 29/10 (#45 S3) | **Descontar del crédito, sin cobrador, siempre paga al organizador logueado** | ✅ | Campo «Descontar del crédito» en el pago, sin desplegable. `fromCredit` / `creditTo`. e2e «Descontar del crédito no tiene desplegable…» y «Pagar con crédito figura como Crédito…» |
| 29/10 (#45 S4) | **Sacar del pago los botones 1 partido / Promo 2 / Promo 3 y la ayuda larga** | ✅ | No está `#pay-prices` ni el texto «Lo cobrado es efectivo…». Sigue el cartel de la promo del día y completar el precio al tocar un monto vacío. e2e «El pago no muestra los botones de promo…» |
| 29/10 (#45 S5) | **Los pagos de deudas viejas cancelan primero los partidos más viejos** | ✅ | `settleOldestDebts` (`payments.js`). El pago muestra a qué partido fue cada monto. e2e «La deuda vieja se reparte primero…» |
| 29/10 (#45 S6) | **Lo que sobra de un pago dividido queda como saldo de quien paga** | ✅ | `splitLeftoverCredit`. El texto dice «queda como saldo a favor de {jugador} con {organizador}». e2e «Lo que sobra del pago dividido…» |
| 30/10 (#45 S7) | **Renombrar un invitado de la promo del día lo renombra en los otros partidos de ese anfitrión** | ✅ | `sameDayPromoGuestRenames` (`guests.js`). Misma identidad anfitrión + nombre. No toca al invitado de otro anfitrión. La promo sigue. No cambia el apodo. e2e «El otro partido del día también se llama Pedro…» |

## Historial

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 20/10 (#12) | Historial: lo pasado no se borra | ✅ | Pestaña Historial |
| 20/10 (#17) | Últimos 30 por defecto y filtros por fecha | ✅ | «Por defecto muestra los últimos 30» |
| 20/10 (#25) | Chips de sede en Historial | ✅ | PR #25, e2e OK |
| 26/10 (#27 C4, #28 E3) | Importar el historial desde un texto, incluidas las fechas en formato viejo | ✅ | «Importar partidos desde texto», `js/parser.js` |
| 27/10 (#41) y 29/10 (#43 R3) | Cuadro rojo «Faltan pagar (que anoté yo)» en Historial y en las tarjetas de HOY, con la lista que se despliega | ✅ | `oweBox` (`app.js`), `data-owe-toggle`. Desde v64 cuenta por «Se anotó con» (`owesOrganizer`). Si ese dato no está, sigue con «Agregó» |
| 27/10 (#41) | Filtro «Partidos con deudores» | ✅ | `#hist-debtors` (`app.js:804–866`) |

## Equipos

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 20/10 (#13) | Equipos por partido, pechera, azar y WhatsApp | ✅ | `js/teams.js`, «Mezclar al azar», «Compartir lista» |
| 26/10 (#27 B1–B4) | Dos columnas, marcador, goles y «Fue al arco» | ✅ | `normalizeScore`, «Fue al arco», «Faltan ir al arco» |
| 26/10 (#28 E4) | Equipos parejos por nivel; cambiar arrastrando | ✅ | `balanceTeams`, `dropPlayerOn`, «Está desbalanceado» |
| 27/10 (#32) | Los arqueros quedan arriba, en el orden en que se marcaron | ✅ | `orderTeamsByGoal` |
| 27/10 (#35, #36, #39) | La pechera es una musculosa naranja, el ícono de arco en la fila, el nombre abre el menú | ✅ | `team-name`, `data-team-name` (`app.js:613`) |
| 26/10 (#27 C2) | El apodo se ve en Equipos | ✅ | `shownName` (`app.js:611–628`) |

## Ajustes / menú

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Aviso 2 horas antes y recordatorios | ✅ | «Aviso 2 horas antes», «Enviar recordatorios», `js/reminders.js` |
| 19/10 (#4), 27/10 (#30, #40) | Tamaño del texto: A−/A+, achicar hasta 8px, elegirlo de una lista en Ajustes | ✅ | `index.html:49–51`, `#set-text-size` (`app.js:1526`) |
| 20/10 (#15) | El filtro «Mis» pasó a Ajustes: «Solo lo que anoté y lo que cobré» | ✅ | `#set-mine` (`app.js:1515`) |
| 20/10 (#11) | Elegir desde qué app de WhatsApp salen los mensajes | ↩️ | Se sacó a propósito en #15 |
| 20/10 (#25) | La app se llama «Mis Partidos» | ✅ | `index.html`, manifest |
| 26/10 (#27 C1) | «Compartir app» | ✅ | `#set-share-app`, `js/share.js` |
| 27/10 (#35, #37, #38) | Backup, carga y reseteo de la base por el admin (BORRAR), con errores claros | ✅ | `#set-backup`, `#set-restore`, `#set-reset-db` (`app.js:1536–1541`) |
| 27/10 (#38) y 29/10 (#43 R6) | El pie del menú muestra solo la versión | ✅ | `<p class="footer-note" id="app-version">Versión ${APP_VERSION}</p>` (`app.js:1549`) |

## Permisos y privacidad

| Fecha | Pedido | Estado | Evidencia |
|---|---|---|---|
| 19/10 (#3) | Cuentas: el admin crea organizadores | ✅ | `#/usuarios`, «Organizadores» (`app.js:2391`) |
| 19/10 (#8) | Quién ve y quién anota cada partido, «Solo yo» y un límite por organizador | ✅ | «Solo yo», «Llegaste a tu límite» |
| 20/10 (#15, #18) | El WhatsApp del jugador es privado, con el casillero «Mostrar el WhatsApp para todos» | ✅ | `js/privacy.js`, «Mostrar mi WhatsApp a los demás organizadores» |
| 20/10 (#19) | Solo edita la ficha quien la creó | ✅ | `canEditRoster`, `js/edit-lock.js` |

## Otros puntos (no son pedidos)

- ⚠️ Siguen con `confirm()` del navegador (Aceptar/Cancelar) preguntas que no son de la lista de espera: «¿Quitar a X del partido?», cancelar, borrar o reactivar un partido, avisar que se canceló, rearmar o resetear equipos, partido duplicado, borrar de Jugadores, notas, organizadores, sedes y datos de demo. Si Gustavo quiere Sí/No en todas, pasarlas a `askYesNo`.
- ⚠️ `README.md` quedó viejo: todavía nombra el botón «Mis», la pestaña Pagos de Jugadores y los tamaños «Chica…Enorme».
- ⚠️ `js/share.js` no está en la lista de precache de `sw.js`. Se guarda en caché igual en la primera visita con conexión, pero en una instalación nueva sin conexión podría fallar la carga.

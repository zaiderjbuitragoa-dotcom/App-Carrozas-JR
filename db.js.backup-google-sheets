/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v12.23
 *
 *  🆕 CAMBIOS v12.23 — CACHÉ PERSISTENTE DE 6 HORAS +
 *  CONEXIONES PRECALENTADAS (fix: con 20 o más usuarios
 *  simultáneos, Apps Script saturaba su límite de concurrencia
 *  y devolvía errores HTTP 404 en cascada; el caché de 60s
 *  en memoria se destruía en cada recarga, forzando de nuevo
 *  10 peticiones simultáneas al backend):
 *
 *  Diagnóstico: el caché anterior (`_cache = {}`) residía solo
 *  en memoria JS — se destruía al cambiar de página, cerrar
 *  sesión o recargar la app. Al abrirla, 20 usuarios disparaban
 *  ~200 peticiones simultáneas contra Apps Script, superando
 *  sus cuotas de concurrencia y produciendo HTTP 404 y
 *  timeouts en cascada.
 *
 *  + Motor de Caché Persistente en localStorage (TTL 6 horas):
 *    - _obtenerCachePersistente(key): lee desde localStorage y
 *      valida TTL de 6h. Devuelve null si expirado o ausente.
 *    - _guardarCachePersistente(key, data, ts): serializa a
 *      JSON en localStorage con clave "JR_CACHE_<key>".
 *    - _borrarCachePersistente(key): elimina la entrada de
 *      localStorage.
 *    - CACHE_TTL sube de 60s a 6 horas (21.600.000 ms).
 *
 *  + gasGet() mejorado:
 *    1. Primero lee la caché en memoria (0 ms, como antes).
 *    2. Si no está en memoria, lee localStorage (0 ms, sin red).
 *       Los datos se sirven AL INSTANTE, sin importar si el
 *       usuario cambió de página o cerró sesión — la caché no
 *       se destruye entre pantallas.
 *    3. Solo va a la red si los datos tienen más de 6 horas.
 *    4. Si la red falla (HTTP 404, timeout por saturación de
 *       Apps Script), responde con los datos del caché
 *       persistente aunque estén "expirados" — evita pantallas
 *       vacías tipo "Sin vehículos en esta regional" causadas
 *       por congestión momentánea del backend.
 *
 *  + gasGetEstricto() mejorado:
 *    - Misma cadena: memoria → localStorage → red.
 *    - En modo login, si el backend falla pero hay datos en
 *      caché, los usa como fallback y reporta el error real.
 *
 *  + DB.invalidarCache(sheetName): ahora también elimina la
 *    entrada de localStorage (antes solo borraba la memoria).
 *  + DB.limpiarCacheCompleto(): borra todas las entradas del
 *    caché persistente de todas las hojas registradas en
 *    SHEET_MAP, útil para forzar recarga total.
 *
 *  + Warm-up inteligente: ahora solo lanza peticiones de red
 *    para las hojas cuya caché local tiene más de 6 horas de
 *    antigüedad o no existe. Si 20 usuarios abren la app a la
 *    vez, solo el primero (o quien tenga datos viejos) realiza
 *    peticiones al backend; los demás sirven datos locales
 *    al instante.
 *
 *  (Se conserva íntegro todo lo demás de v12.22 — nada de lo
 *   que ya funcionaba fue tocado.)
 *
 *  ── Historial v12.22
 *
 *  🆕 CAMBIOS v12.22 (fix: la Fecha se veía como "2026-07-28 02:00:00"
 *  en vez de "28/07/2026" al editar una Inspección — el PDF generado
 *  mostraba ese mismo texto sin formatear):
 *
 *  Diagnóstico: _fmtFechaHoraGAS() / _looksLikeISOFechaHora() solo
 *  reconocían el formato ISO con "T" como separador entre fecha y
 *  hora ("AAAA-MM-DDTHH:MM:SS"), que es como Google Sheets serializa
 *  la mayoría de celdas con formato de Fecha/Hora. Pero algunas
 *  celdas de "Inspeccion_Vehiculo" llegaban con un ESPACIO en vez de
 *  "T" ("AAAA-MM-DD HH:MM:SS") — un formato igual de válido que
 *  Sheets también produce según la configuración regional de la
 *  hoja — y ese caso no hacía match con la expresión regular, así
 *  que el valor pasaba crudo sin convertir a DD/MM/AAAA.
 *
 *  + RE_ISO_FECHA_HORA ahora acepta tanto "T" como espacio como
 *    separador (antes solo aceptaba "T"). El resto de la lógica de
 *    _fmtFechaHoraGAS() no cambió: sigue distinguiendo "solo hora"
 *    (ancla en 1899-12-30) de "fecha real" exactamente igual que
 *    antes, solo que ahora también detecta el caso con espacio.
 *
 *  (Se conserva íntegro todo lo demás de v12.21 — ver historial
 *   completo más abajo, nada de lo que ya funcionaba fue tocado.)
 *
 *  ── Historial v12.21 (fix: inspeccion_vehicular.html ya llamaba a
 *  DB.obtenerInspeccion(id) y DB.actualizarInspeccion(id, datos) para
 *  poder abrir una inspección existente con ?id=... y guardarla de
 *  nuevo, pero esas dos funciones nunca se agregaron a db.js — el
 *  propio formulario lo detectaba en pantalla con un alert
 *  ("DB.obtenerInspeccion no existe en db.js todavía") y no dejaba
 *  editar nada):
 *
 *  + Nuevo DB.obtenerInspeccion(id): busca en "Inspeccion_Vehiculo"
 *    la fila cuyo ID coincide y la devuelve completa, para que el
 *    formulario pueda precargarla en modo edición.
 *  + Nuevo DB.obtenerInspecciones(limite): lista las inspecciones más
 *    recientes primero (orden real por FECHA+HORA, no alfabético),
 *    pensada para alimentar una pantalla de listado/consulta.
 *  + Nuevo DB.actualizarInspeccion(id, datos): actualiza por ID la
 *    fila ya existente en "Inspeccion_Vehiculo" en vez de insertar
 *    una nueva, e invalida el caché de esa hoja para que el listado
 *    y el propio formulario reflejen el cambio al instante.
 *  + Nueva claveOrdenInspeccion(), misma idea que claveOrdenTanqueo/
 *    claveOrdenChecklist pero para las columnas FECHA/HORA (en
 *    mayúscula) de "Inspeccion_Vehiculo".
 *
 *  (Se conserva íntegro todo lo demás de v12.20 — ver historial
 *   completo más abajo, nada de lo que ya funcionaba fue tocado.)
 *
 *  ── Historial v12.20 (fix: seguían viendo timeouts de 40s y 404 en
 *  cascada al abrir Registro de Salida — "carrozas"/"usuarios"/
 *  "Traslado" fallando de una en la consola, selector de placas
 *  mostrando "Sin vehículos en esta regional" con regionales que sí
 *  tenían carrozas):
 *
 *  Diagnóstico: el limitador de concurrencia de v12.18 funcionaba,
 *  pero (a) el número real quedó en 3 peticiones simultáneas en vez
 *  de las 2 que decía el propio comentario de esa versión, y (b)
 *  gasGet() se rendía a la PRIMERA falla de cada hoja y devolvía []
 *  en silencio — así que cualquier timeout o 404 puntual (frecuentes
 *  contra Apps Script bajo carga) dejaba la pantalla creyendo que la
 *  hoja estaba vacía, cuando en realidad los datos sí existían y solo
 *  tardaron un poco más.
 *
 *  + MAX_PETICIONES_SIMULTANEAS baja de 3 a 2.
 *  + gasGet() ahora reintenta UNA vez (con 1.5s de espera) antes de
 *    rendirse y devolver [] — mismo patrón que ya usaba gasWrite()
 *    para las escrituras. La lectura de una sola hoja se factorizó en
 *    _gasGetIntento(key, ms), que SÍ lanza el error (no lo atrapa),
 *    para que gasGet() decida si reintentar.
 *
 *  (Se conserva íntegro todo lo demás de v12.18/12.19 — el warm-up
 *   por fases con retraso de 5s y el limitador de concurrencia no se
 *   tocaron más que el número de cupos.)
 *
 *  ── Historial v12.18 (fix RAÍZ del 404 instantáneo / lentitud extrema
 *  al cargar placas — "Cargando flota..." eterno y regionales que
 *  aparecían vacías sin estarlo):
 *
 *  Diagnóstico real (visto en consola del usuario): justo después de
 *  un ping exitoso ("🟢 API J.R. conectada"), varias lecturas
 *  seguidas fallaban con "gasGet Traslado: HTTP 404",
 *  "gasGet mantenimientos: HTTP 404", "gasGet carrozas: HTTP 404" —
 *  todas contra la URL de redirect de Apps Script
 *  (script.googleusercontent.com/macros/echo?user_content_key=...).
 *
 *  Causa raíz: el warm-up de v12.17 lanzaba, TODO DE UNA VEZ con
 *  Promise.allSettled, el ping + 9 lecturas de hoja en paralelo — 10
 *  peticiones simultáneas contra el MISMO Web App de Apps Script.
 *  Google Apps Script no ejecuta un número ilimitado de doGet() en
 *  paralelo para un mismo script (especialmente uno ligado a
 *  Sheets, donde las lecturas compiten por los mismos bloqueos
 *  internos de SpreadsheetApp) — al llegar 10 de golpe, varias
 *  quedaban en cola, tardaban demasiado, o competían por el token de
 *  redirección de un solo uso, resultando en 404 instantáneos o
 *  timeouts en cascada. Esto explica ambos síntomas reportados:
 *    - El selector de placas se quedaba "Cargando..." mucho tiempo.
 *    - Una regional con vehículos reales terminaba mostrando
 *      "Sin vehículos en esta regional" — los datos nunca llegaron
 *      a tiempo, no es que no existieran.
 *
 *  Esto no era exclusivo del warm-up: CUALQUIER pantalla que dispare
 *  varias lecturas casi al tiempo (p.ej. alSeleccionarPlaca(), que
 *  antes ya lanzaba 2-3 consultas en paralelo) sufre el mismo
 *  problema si el warm-up sigue en curso al mismo tiempo.
 *
 *  + Se agrega un LIMITADOR DE CONCURRENCIA GLOBAL
 *    (_conLimiteConcurrencia): como máximo 2 peticiones al backend de
 *    Apps Script corren al mismo tiempo (lecturas Y escrituras); el
 *    resto espera su turno en una cola en memoria y se dispara
 *    automáticamente en cuanto se libera un cupo. Se aplica dentro de
 *    gasGet(), gasGetEstricto(), gasWriteIntento(), testConexion() y
 *    verificarInspeccionHoy() — es decir, TODA comunicación con el
 *    backend pasa por el mismo límite, sin tener que tocar cada
 *    pantalla una por una.
 *  + Se baja el timeout base de lectura de 45s (v12.15/17) a 25s: ya
 *    no hace falta un margen tan grande porque el backend deja de
 *    saturarse por congestión propia; 25s sigue siendo generoso para
 *    un cold-start real de Apps Script. testConexion() y el login
 *    (gasGetEstricto) conservan 45s, por ser los casos donde SÍ
 *    interesa aguantar un cold-start completo sin fallar.
 *  + Nuevo método público DB.obtenerHoja(sheetName): lectura genérica
 *    de cualquier hoja del SHEET_MAP, pensada para pantallas que
 *    necesiten leer una hoja sin un método dedicado (p.ej. el
 *    checklist de Registro de Salida — ver v12.18 en
 *    registro_salida.html). Pasa por gasGet(), así que hereda el
 *    mismo caché, el mismo límite de concurrencia y el mismo
 *    saneamiento de fechas/horas que ya usa el resto de la app, en
 *    vez de hacer un fetch() suelto y sin ninguna de esas
 *    protecciones (que es justo lo que hacía antes
 *    registro_salida.html para leer/guardar el checklist).
 *
 *  (Se conserva íntegro todo lo demás de v12.17 — nada de lo que ya
 *   funcionaba fue tocado.)
 *
 *  ── Historial v12.17 ──
 *  Warm-up paralelo al iniciar (ping + hojas con Promise.allSettled,
 *  fire-and-forget) y timeout de lectura subido de 20s a 45s para dar
 *  margen a cold-starts de Apps Script. (El propio paralelismo sin
 *  límite fue la causa del bug corregido arriba en v12.18.)
 *
 *  ── Historial v12.16 (fix 404 instantáneo por caché de Service
 *  Worker / navegador) ──
 *  Toda petición GET a Apps Script agrega "_=<timestamp>" único a la
 *  URL y usa { cache: 'no-store' } en fetch(), para que ninguna caché
 *  sirva una respuesta vieja de un token de un solo uso ya "gastado".
 *
 *  ── Historial v12.15 (fix: login mostraba "Credenciales
 *  incorrectas" cuando en realidad era un timeout/fallo de red) ──
 *  gasGetEstricto(): igual que gasGet(), pero LANZA el error real en
 *  vez de devolver [] en silencio. DB.login() la usa con reintento
 *  automático, para distinguir "no hay ese usuario" de "no se pudo
 *  conectar".
 *
 *  ── Historial v12.14 (corrección global de fechas/horas
 *  "1899-12-30") ──
 *  _limpiarFilaGAS(), aplicada dentro de gasGet(), corrige
 *  automáticamente en TODA la app los valores de fecha/hora que
 *  Google Sheets serializa mal cuando una celda queda con formato de
 *  Hora o Fecha en vez de Texto plano.
 *
 *  ── Historial v12.13 (Tanqueo — nivel observado + alerta de
 *  innecesario) ──
 *  NIVEL_OBSERVADO / POSIBLE_INNECESARIO / MOTIVO_INNECESARIO se
 *  guardan en la hoja "Tanqueo" y generan notificación a la regional
 *  cuando POSIBLE_INNECESARIO = "SI".
 *
 *  ── Historial v12.12 (reparación de Traslados "abiertos" con
 *  Llegada ya guardada) + v12.11 (notificaciones por regional) +
 *  v12.10 (Averías Recientes desde "carrozas") + v12.8 (enlace con
 *  Checklist_Salida) + v12.7 (anti-duplicados en Salida/Llegada) +
 *  v12.6-v12.4 (Tanqueo, medidor de combustible, capa de
 *  compatibilidad Supabase, anti-duplicados genérico, bloqueo doble
 *  click, caché con TTL, timeouts largos en escritura) — todo se
 *  conserva íntegro, ver versiones anteriores del archivo para el
 *  detalle completo de cada una.
 * ══════════════════════════════════════════════════════════
 */

const URL_GAS = "https://script.google.com/macros/s/AKfycby3-BtZUU8OrRr9eU3cneGdF4fTvsPOtXshrQn0zmxUtLP5AjgF_qSnulTiQD_eFznZUg/exec";

const SHEET_MAP = {
  'carrozas':             'carrozas',
  'Traslado':             'Traslado',
  'Averias':              'Averias',
  'usuarios':             'usuarios',
  'Llegadas':             'Llegadas',
  'mantenimientos':       'mantenimientos',
  'solicitud_apoyo':      'solicitud_apoyo',
  'notificaciones_apoyo': 'notificaciones_apoyo',
  'config':               'config',
  'Tanqueo':              'Tanqueo',
  'Inspeccion_Vehiculo':  'Inspeccion_Vehiculo',
  'Checklist_Salida':     'Checklist_Salida',
};

function resolveSheet(name) { return SHEET_MAP[name] || name; }

function fechaHoy() {
  const h = new Date();
  return h.getDate().toString().padStart(2,'0') + '/' +
         (h.getMonth()+1).toString().padStart(2,'0') + '/' +
         h.getFullYear();
}

// ── NORMALIZADOR DE TEXTO GENÉRICO (usado para comparar placas y
//    nombres de columna sin depender de mayúsculas, tildes o
//    guiones/espacios) ──────────────────────────────────────────
function normTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}
function normClave(s) {
  return normTexto(s).replace(/[^a-z0-9]/g, '');
}

// ── CLAVE DE ORDEN CRONOLÓGICO REAL ───────────────────────
// Convierte fecha "DD/MM/AAAA" (+ hora opcional "HH:MM") en un
// número AAAAMMDDHHMM comparable. Antes se ordenaba con
// localeCompare sobre el texto tal cual, lo cual es incorrecto
// para fechas en formato DD/MM (p.ej. "12/01/2026" ordenaba
// como más reciente que "05/07/2026" por comparación de texto).
function claveOrden(registro) {
  const f = String((registro && registro.fecha) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && (registro.hora_de_salida || registro.hora_ingreso || '')) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// ── MISMA IDEA, PERO PARA LA HOJA "Tanqueo" (encabezados en MAYÚSCULA) ──
function claveOrdenTanqueo(registro) {
  const f = String((registro && registro.FECHA) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && registro.HORA) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// 🆕 v12.8 — MISMA IDEA, PERO PARA LA HOJA "Checklist_Salida"
// (encabezados en MAYÚSCULA, y la columna de hora de salida se llama
// HORA_SALIDA en vez de HORA como en Tanqueo).
function claveOrdenChecklist(registro) {
  const f = String((registro && registro.FECHA) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && registro.HORA_SALIDA) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// 🆕 v12.21 — MISMA IDEA, PERO PARA LA HOJA "Inspeccion_Vehiculo"
// (encabezados en MAYÚSCULA: FECHA + HORA, igual patrón que Tanqueo).
// Necesaria para que DB.obtenerInspecciones() liste lo más reciente
// primero por fecha/hora REAL, en vez de orden alfabético de texto.
function claveOrdenInspeccion(registro) {
  const f = String((registro && registro.FECHA) || '').trim();
  const partes = f.split('/');
  let aaaammdd = '00000000';
  if (partes.length === 3) {
    const dd = partes[0].padStart(2, '0');
    const mm = partes[1].padStart(2, '0');
    const aaaa = partes[2].length === 4 ? partes[2] : ('20' + partes[2]).slice(-4);
    aaaammdd = aaaa + mm + dd;
  }
  const hora = String((registro && registro.HORA) || '').replace(':', '').padStart(4, '0');
  return parseInt(aaaammdd + hora, 10) || 0;
}

// ══════════════════════════════════════════════════════════
// 🆕 v12.14 — SANEAMIENTO CENTRAL DE FECHAS/HORAS (bug "1899-12-30")
// 🆕 v12.22 — ahora también reconoce el separador con ESPACIO
// ("AAAA-MM-DD HH:MM:SS"), no solo con "T" ("AAAA-MM-DDTHH:MM:SS").
// Ver nota de la versión al inicio del archivo.
// ══════════════════════════════════════════════════════════
const _CAMPOS_ISO_SIN_TOCAR = { created_at: true };

const RE_ISO_FECHA_HORA = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/;
const OFFSET_COLOMBIA_MS = 5 * 60 * 60 * 1000; // Colombia = UTC-5 fijo, sin horario de verano

function _looksLikeISOFechaHora(v) {
  return typeof v === 'string' && RE_ISO_FECHA_HORA.test(v);
}

function _fmtFechaHoraGAS(valorISO) {
  const m = valorISO.match(RE_ISO_FECHA_HORA);
  if (!m) return valorISO;
  const utcMs = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  const local = new Date(utcMs - OFFSET_COLOMBIA_MS);
  // Celda que solo tenía HORA → Sheets la ancló al día cero (30/12/1899).
  if (m[1] === '1899' && m[2] === '12' && m[3] === '30') {
    return local.getUTCHours().toString().padStart(2, '0') + ':' + local.getUTCMinutes().toString().padStart(2, '0');
  }
  // Celda con FECHA real → mismo formato DD/MM/AAAA que usa toda la app.
  return local.getUTCDate().toString().padStart(2, '0') + '/' +
         (local.getUTCMonth() + 1).toString().padStart(2, '0') + '/' +
         local.getUTCFullYear();
}

function _limpiarFilaGAS(fila) {
  if (!fila || typeof fila !== 'object') return fila;
  Object.keys(fila).forEach(function(k) {
    if (_CAMPOS_ISO_SIN_TOCAR[k]) return;
    const v = fila[k];
    if (_looksLikeISOFechaHora(v)) fila[k] = _fmtFechaHoraGAS(v);

    // 🆕 Alias de compatibilidad: si la propiedad viene en MAYÚSCULAS (ej. PLACA, FECHA),
    // crea el alias en minúsculas (placa, fecha) para prevenir undefined en cualquier pantalla.
    const lower = k.toLowerCase();
    if (lower !== k && !(lower in fila)) {
      fila[lower] = fila[k];
    }
  });
  return fila;
}

// ── TIMEOUT HELPER ─────────────────────────────────────────
function fetchConTimeout(url, opciones, ms) {
  if (ms === undefined) ms = 15000;
  if (opciones === undefined) opciones = {};
  const controller = new AbortController();
  const timer = setTimeout(function() {
    controller.abort(new Error('TIMEOUT_' + ms + 'ms'));
  }, ms);
  return fetch(url, Object.assign({}, opciones, { signal: controller.signal }))
    .catch(function(err) {
      if (err.name === 'AbortError' || controller.signal.aborted) {
        const e = new Error('El servidor tardó demasiado en responder (más de ' + Math.round(ms/1000) + 's). Verifica tu conexión e intenta nuevamente.');
        e.isTimeout = true;
        throw e;
      }
      throw err;
    })
    .finally(function() { clearTimeout(timer); });
}

// ══════════════════════════════════════════════════════════
// 🆕 v12.18 — LIMITADOR DE CONCURRENCIA GLOBAL HACIA APPS SCRIPT
// ══════════════════════════════════════════════════════════
// Ver explicación completa en el encabezado del archivo. En corto:
// Apps Script no soporta bien un aluvión de peticiones simultáneas al
// mismo Web App — eso causaba los 404 instantáneos y la lentitud
// extrema reportada al cargar placas. Aquí se limita a 2 peticiones
// en vuelo al mismo tiempo; el resto espera en una cola FIFO en
// memoria y arranca automáticamente en cuanto se libera un cupo.
// 🆕 v12.20 — bajado de 3 a 2: con 3 en vuelo seguían viéndose timeouts
// de 40s y 404 en cascada contra hojas como "carrozas"/"usuarios"
// (ver captura reportada: 4 de 5 lecturas de la fase 1 fallando de
// una). El propio comentario de v12.18 ya decía "máximo 2" — el
// número real quedó en 3 por un descuido. Se deja en 2, que es lo que
// se documentó originalmente.
const MAX_PETICIONES_SIMULTANEAS = 2;
let _peticionesActivas = 0;
const _colaPeticiones = [];

function _conLimiteConcurrencia(fn) {
  return new Promise(function(resolve, reject) {
    function ejecutar() {
      _peticionesActivas++;
      fn().then(resolve, reject).finally(function() {
        _peticionesActivas--;
        if (_colaPeticiones.length) {
          const siguiente = _colaPeticiones.shift();
          siguiente();
        }
      });
    }
    if (_peticionesActivas < MAX_PETICIONES_SIMULTANEAS) {
      ejecutar();
    } else {
      _colaPeticiones.push(ejecutar);
    }
  });
}

// ══════════════════════════════════════════════════════════
// 🆕 v12.23 — CACHÉ EN MEMORIA + CACHÉ PERSISTENTE (localStorage)
// ══════════════════════════════════════════════════════════
// Dos niveles de caché:
//   L1 — memoria JS (_cache):    inmediato, se pierde al recargar.
//   L2 — localStorage:           persiste entre páginas, cierres de
//         sesión y recargas. Clave: "JR_CACHE_<sheetName>".
// TTL = 6 horas. Al expirar se refresca en segundo plano; si el
// backend falla, se sirven los datos "viejos" antes que devolver [].
const _cache    = {};                           // L1: { key: { data, ts } }
const _inflight = {};                           // peticiones en vuelo
const CACHE_TTL = 6 * 60 * 60 * 1000;          // 6 horas en ms
const _LS_PREFIX = 'JR_CACHE_';                // prefijo en localStorage

function _obtenerCachePersistente(key) {
  try {
    const raw = localStorage.getItem(_LS_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !entry.ts || !entry.data) return null;
    // Devuelve aunque haya expirado (el llamador decide si usar o no)
    return entry;
  } catch (e) {
    return null;
  }
}

function _guardarCachePersistente(key, data, ts) {
  try {
    localStorage.setItem(_LS_PREFIX + key, JSON.stringify({ data, ts }));
  } catch (e) {
    // localStorage lleno o no disponible (modo privado sin cuota)
    console.warn('_guardarCachePersistente: no se pudo guardar en localStorage:', e.message);
  }
}

function _borrarCachePersistente(key) {
  try { localStorage.removeItem(_LS_PREFIX + key); } catch (e) {}
}

// 🆕 v12.20 — UN SOLO INTENTO de lectura, factorizado aparte para que
// gasGet() (abajo) pueda reintentarlo automáticamente. Antes gasGet
// se rendía a la primera falla (timeout de 40s o 404 del token de
// redirección) y devolvía [] en silencio — eso es justo lo que
// causaba pantallas como "Sin vehículos en esta regional" con
// regionales que SÍ tenían carrozas: los datos no llegaron a tiempo,
// no es que no existieran. Lanza el error (no lo atrapa) para que
// quien lo llama decida si reintentar.
async function _gasGetIntento(key, ms) {
  // v12.16 — "_" con timestamp único + cache:'no-store': evita caché
  // de Service Worker / navegador sirviendo una respuesta vieja de
  // un token de un solo uso. v12.18 — pasa por el limitador de
  // concurrencia para no saturar Apps Script con lecturas simultáneas.
  const url = `${URL_GAS}?sheetName=${encodeURIComponent(key)}&_=${Date.now()}`;
  const resp = await _conLimiteConcurrencia(() =>
    fetchConTimeout(url, { method: 'GET', redirect: 'follow', cache: 'no-store' }, ms)
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (json && json.error) throw new Error(json.error);
  return Array.isArray(json) ? json : [];
}

// 🆕 v12.23 — gasGet CON CACHÉ PERSISTENTE Y FALLBACK ANTE SATURACIÓN
async function gasGet(sheetName) {
  const key = resolveSheet(sheetName);
  const ahora = Date.now();

  // ── L1: caché en memoria (más rápido, sin parseo) ──
  const memoryCached = _cache[key];
  if (memoryCached && (ahora - memoryCached.ts) < CACHE_TTL) {
    return memoryCached.data;
  }

  // ── L2: caché persistente en localStorage ──
  // Carga a L1 si está vigente, sirve inmediatamente sin red.
  const lsEntry = _obtenerCachePersistente(key);
  if (lsEntry && (ahora - lsEntry.ts) < CACHE_TTL) {
    _cache[key] = { data: lsEntry.data, ts: lsEntry.ts }; // promover a L1
    return lsEntry.data;
  }

  // ── Si ya hay una petición en vuelo para esta hoja, esperar ──
  if (_inflight[key]) return _inflight[key];

  _inflight[key] = (async () => {
    try {
      let data;
      try {
        data = await _gasGetIntento(key, 40000);
      } catch (err1) {
        // Reintento automático (v12.20): pausa 1.5s y reintenta
        console.warn(`gasGet ${key}: 1er intento falló (${err1.message}), reintentando en 1.5s…`);
        await new Promise(r => setTimeout(r, 1500));
        try {
          data = await _gasGetIntento(key, 40000);
        } catch (err2) {
          // 🆕 v12.23 — FALLBACK ANTE SATURACIÓN: en vez de devolver []
          // y romper la pantalla, si hay datos en caché persistente
          // (aunque estén expirados) se usan como respaldo.
          // Esto ocurre cuando Apps Script devuelve 404 / timeout por
          // alta concurrencia (20+ usuarios). Datos viejos son
          // infinitamente mejor que pantalla vacía o error.
          if (lsEntry && lsEntry.data) {
            console.warn(`gasGet ${key}: 2do intento falló (${err2.message}) — usando caché persistente como fallback.`);
            _cache[key] = { data: lsEntry.data, ts: lsEntry.ts };
            return lsEntry.data;
          }
          console.warn(`gasGet ${key}: 2do intento también falló (${err2.message}) — sin caché disponible, se devuelve [].`);
          return [];
        }
      }
      // Éxito: sanear, guardar en ambos niveles de caché
      data.forEach(_limpiarFilaGAS); // v12.14 — corrige fechas/horas mal serializadas
      const ts = Date.now();
      _cache[key] = { data, ts };
      _guardarCachePersistente(key, data, ts); // 🆕 v12.23 — persistir en localStorage
      return data;
    } finally {
      delete _inflight[key];
    }
  })();

  return _inflight[key];
}

// ══════════════════════════════════════════════════════════
// v12.15 — LECTURA "ESTRICTA" (no traga errores en silencio)
// 🆕 v12.23 — ahora también usa caché persistente como L2
// ══════════════════════════════════════════════════════════
async function gasGetEstricto(sheetName, ms) {
  const key = resolveSheet(sheetName);
  const ahora = Date.now();

  // L1: caché en memoria
  const memoryCached = _cache[key];
  if (memoryCached && (ahora - memoryCached.ts) < CACHE_TTL) {
    return memoryCached.data;
  }

  // 🆕 v12.23 — L2: caché persistente en localStorage
  const lsEntry = _obtenerCachePersistente(key);
  if (lsEntry && (ahora - lsEntry.ts) < CACHE_TTL) {
    _cache[key] = { data: lsEntry.data, ts: lsEntry.ts };
    return lsEntry.data;
  }

  // v12.16 — mismo cache-busting que gasGet(). v12.18 — mismo límite
  // de concurrencia (el login no debe competir de más contra otras
  // lecturas que estén en curso, ni saturar por su cuenta).
  const url = `${URL_GAS}?sheetName=${encodeURIComponent(key)}&_=${Date.now()}`;
  const resp = await _conLimiteConcurrencia(() =>
    fetchConTimeout(url, { method: 'GET', redirect: 'follow', cache: 'no-store' }, ms || 45000)
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const json = await resp.json();
  if (json && json.error) throw new Error(json.error);
  const data = Array.isArray(json) ? json : [];
  data.forEach(_limpiarFilaGAS);
  const ts = Date.now();
  _cache[key] = { data, ts };
  _guardarCachePersistente(key, data, ts); // 🆕 v12.23 — persistir en localStorage
  return data;
}

// ── VERIFICAR SI UNA FILA YA QUEDÓ GUARDADA ───────────────
async function existeFila(sheetName, col, val) {
  if (!col || val === undefined || val === null || val === '') return false;
  try {
    const key = resolveSheet(sheetName);
    delete _cache[key];
    delete _inflight[key];
    const rows = await gasGet(sheetName);
    return rows.some(function(r) { return String(r[col] || '') === String(val); });
  } catch (e) {
    return false;
  }
}

// ── ESCRITURA con timeout largo ───────────────────────────
async function gasWriteIntento(sheetName, payload, action, idCol, idValue, ms) {
  const cleanSheet = resolveSheet(sheetName);
  const cleanIdVal = String(idValue || '').trim();

  // Se incluyen los parámetros en la URL y en el cuerpo POST para evitar fallos HTTP 404 por redirección en Google Apps Script
  const urlParams = new URLSearchParams({ sheetName: cleanSheet, action });
  if (idCol)      urlParams.set('idCol',   idCol);
  if (cleanIdVal) urlParams.set('idValue', cleanIdVal);
  const url = `${URL_GAS}?${urlParams}`;

  const bodyData = Object.assign({}, payload);
  if (action)     bodyData._action    = action;
  if (idCol)      bodyData._idCol     = idCol;
  if (cleanIdVal) bodyData._idValue   = cleanIdVal;
  if (cleanSheet) bodyData._sheetName = cleanSheet;

  const resp = await _conLimiteConcurrencia(() => fetchConTimeout(url, {
    method:  'POST',
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain' },
    body:    JSON.stringify(bodyData),
  }, ms));

  if (!resp.ok) { return { ok: false, error: `HTTP ${resp.status}` }; }
  const text = await resp.text();
  let json;
  try { json = JSON.parse(text); }
  catch(e) { return { ok: false, error: 'Respuesta no JSON: ' + text.substring(0, 200) }; }
  if (json.ok === false) { return { ok: false, error: json.error || 'Error desconocido' }; }
  return { ok: true, data: json };
}

// ── ESCRITURA con anti-duplicado + 1 reintento automático ─
async function gasWrite(sheetName, payload, action, idCol, idValue) {
  if (action   === undefined) action   = 'insert';
  if (idCol    === undefined) idCol    = '';
  if (idValue  === undefined) idValue  = '';

  // 🆕 Sincronización automática de estado_parque_automotor en carrozas
  if (sheetName === 'carrozas' && payload && payload.estado !== undefined) {
    const estNorm = String(payload.estado).toLowerCase().trim();
    if (['en servicio', 'disponible', 'operativo', 'operativa', 'ok', 'activo', 'activa'].includes(estNorm)) {
      if (payload.estado_parque_automotor === undefined) {
        payload.estado_parque_automotor = '';
      }
    } else if (['en taller', 'taller'].includes(estNorm)) {
      if (payload.estado_parque_automotor === undefined) {
        payload.estado_parque_automotor = 'TALLER';
      }
    }
  }

  const checkCol = (action === 'insert')
    ? (payload.id_salida !== undefined ? 'id_salida' : (payload.id !== undefined ? 'id' : (payload.ID !== undefined ? 'ID' : null)))
    : null;
  const checkVal = checkCol ? payload[checkCol] : null;

  function invalidarLocal() {
    const key = resolveSheet(sheetName);
    delete _cache[key];
    _borrarCachePersistente(key);
  }

  try {
    const res1 = await gasWriteIntento(sheetName, payload, action, idCol, idValue, 60000);
    if (res1 && res1.ok) { invalidarLocal(); return res1; }

    // Reintento en caso de 404 o falla temporal de red
    if (res1 && !res1.ok && String(res1.error).includes('404')) {
      console.warn(`gasWrite ${sheetName}: 1er intento dio ${res1.error}, reintentando...`);
      await new Promise(r => setTimeout(r, 1000));
      const resRetry = await gasWriteIntento(sheetName, payload, action, idCol, idValue, 60000);
      if (resRetry && resRetry.ok) { invalidarLocal(); return resRetry; }
      return resRetry;
    }

    return res1;
  } catch (err) {
    if (!err.isTimeout) {
      console.error('gasWrite excepción:', err);
      return { ok: false, error: err.message };
    }

    console.warn(`gasWrite ${sheetName}: timeout en intento 1.`);

    if (checkCol) {
      const yaExiste = await existeFila(sheetName, checkCol, checkVal);
      if (yaExiste) {
        console.log(`gasWrite ${sheetName}: la fila ya se había guardado, no se reinserta.`);
        invalidarLocal();
        return { ok: true, data: { yaGuardado: true } };
      }
    }

    console.warn(`gasWrite ${sheetName}: reintentando con más tiempo…`);
    try {
      const res2 = await gasWriteIntento(sheetName, payload, action, idCol, idValue, 90000);
      if (res2 && res2.ok) invalidarLocal();
      return res2;
    } catch (err2) {
      if (err2.isTimeout && checkCol) {
        const yaExiste2 = await existeFila(sheetName, checkCol, checkVal);
        if (yaExiste2) {
          console.log(`gasWrite ${sheetName}: la fila ya se había guardado (2do intento), no se reinserta.`);
          invalidarLocal();
          return { ok: true, data: { yaGuardado: true } };
        }
      }
      console.error('gasWrite excepción (reintento):', err2);
      return { ok: false, error: err2.message };
    }
  }
}

// ── ACTUALIZACIÓN SECUNDARIA EN SEGUNDO PLANO ─────────────
function actualizarEnSegundoPlano(promesa, etiqueta) {
  promesa
    .then(function(res) {
      if (!res.ok) console.warn(`(${etiqueta}) falló en segundo plano:`, res.error);
    })
    .catch(function(err) {
      console.warn(`(${etiqueta}) excepción en segundo plano:`, err.message);
    });
}

// ── BLOQUEO CONTRA DOBLE CLICK ────────────────────────────
const _locks = {};
async function conLock(nombre, fn) {
  if (_locks[nombre]) {
    return { ok: false, error: 'Ya hay un guardado en curso, espera a que termine.' };
  }
  _locks[nombre] = true;
  try {
    return await fn();
  } finally {
    delete _locks[nombre];
  }
}

// ══════════════════════════════════════════════════════════
// v12.7 — GUARDAS ANTI-DUPLICADO (SALIDA Y LLEGADA)
// ══════════════════════════════════════════════════════════
async function buscarTrasladoAbiertoPorPlaca(placa) {
  const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!pSel) return null;
  DB.invalidarCache('Traslado');
  DB.invalidarCache('Llegadas');
  const [rows, llegadas] = await Promise.all([gasGet('Traslado'), gasGet('Llegadas')]);

  const idsConLlegada = new Set(
    llegadas.map(function(l) { return String(l.id_salida || '').trim(); }).filter(Boolean)
  );

  const abiertos = rows.filter(function(r) {
    const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sinRegresoEnTraslado = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
    const yaTieneLlegada = r.id_salida && idsConLlegada.has(String(r.id_salida).trim());
    return pBase === pSel && sinRegresoEnTraslado && !yaTieneLlegada;
  });
  if (!abiertos.length) return null;
  abiertos.sort(function(a, b) { return claveOrden(b) - claveOrden(a); });
  return abiertos[0];
}

async function buscarTrasladoDuplicadoPorContenido(d) {
  DB.invalidarCache('Traslado');
  const rows = await gasGet('Traslado');
  const pSel = String(d.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const norm = function(s) { return String(s || '').trim().toLowerCase(); };
  return rows.find(function(r) {
    return String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel &&
           norm(r.conductor)        === norm(d.conductor) &&
           norm(r.fecha)            === norm(fechaHoy()) &&
           norm(r.hora_de_salida)   === norm(d.hora_salida) &&
           norm(r.motivo_de_salida) === norm(d.motivo);
  }) || null;
}

async function buscarLlegadaPorIdSalida(idSalida) {
  if (!idSalida) return null;
  DB.invalidarCache('Llegadas');
  const rows = await gasGet('Llegadas');
  return rows.find(function(r) { return String(r.id_salida || '').trim() === String(idSalida).trim(); }) || null;
}

// ══════════════════════════════════════════════════════════
// v12.8 — ENLACE CON Checklist_Salida
// ══════════════════════════════════════════════════════════
async function buscarChecklistAbiertoPorPlaca(placa) {
  const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!pSel) return null;
  DB.invalidarCache('Checklist_Salida');
  const rows = await gasGet('Checklist_Salida');
  const abiertos = rows.filter(function(r) {
    const pBase = String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sinEntrada = (r.HORA_ENTRADA === undefined || r.HORA_ENTRADA === null || String(r.HORA_ENTRADA).trim() === '');
    return pBase === pSel && sinEntrada;
  });
  if (!abiertos.length) return null;
  abiertos.sort(function(a, b) { return claveOrdenChecklist(b) - claveOrdenChecklist(a); });
  return abiertos[0];
}

// ══════════════════════════════════════════════════════════
// v12.10 — AVERÍAS RECIENTES DESDE "carrozas"
// ══════════════════════════════════════════════════════════
const ESTADOS_SIN_NOVEDAD = ['disponible', 'operativo', 'operativa', 'ok', 'activo', 'activa', 'bien', ''];

// ══════════════════════════════════════════════════════════
//  COMBUSTIBLE Y RENDIMIENTO
// ══════════════════════════════════════════════════════════

const CAPACIDAD_TANQUE_DEFAULT = 55;

const CAPACIDAD_POR_MODELO = [
  { patron: /ssangyong|rodius|stavic/i,              galones: 21.1, fuente: 'SsangYong Rodius/Stavic — tanque 80 L (Wikipedia/ficha oficial)' },
  { patron: /chevrolet\s*hhr|\bhhr\b/i,               galones: 16.1, fuente: 'Chevrolet HHR — tanque 61 L (fichas técnicas oficiales)' },
  { patron: /chevrolet\s*(van\s*)?n[34]00|^\s*n400\b/i, galones: 13.2, fuente: 'Chevrolet N300/N400 — tanque 50 L' },
  { patron: /\bdfsk\b/i,                              galones: 10.6, fuente: 'DFSK C35/C37 — tanque 10.6 gal (ficha DFSK Colombia)' },
  { patron: /chery/i,                                 galones: 9.2,  fuente: 'Chery QQ/Yoya — tanque 35 L' },
  { patron: /suzuki\s*ertiga|ertiga/i,                galones: 11.9, fuente: 'Suzuki Ertiga — tanque 45 L (ficha oficial)' },
  { patron: /volkswagen|saveiro/i,                    galones: 14.5, fuente: 'Volkswagen Saveiro — tanque 55 L (ficha oficial VW)' },
  { patron: /peugeot\s*partner|partner/i,             galones: 15.9, fuente: 'Peugeot Partner — tanque ~60 L (estimado)' },
  { patron: /chevrolet\s*luv|\bluv\b/i,               galones: 15.3, fuente: 'Chevrolet LUV (pickup) — tanque ~58 L (estimado)' },
  { patron: /toyota\s*hilux|hilux/i,                  galones: 18.5, fuente: 'Toyota Hilux — tanque ~70 L (estimado, gen. 1997-2005)' },
  { patron: /nissan\s*np ?300|np ?300/i,               galones: 21.1, fuente: 'Nissan NP300 — tanque 80 L (ficha oficial)' },
  { patron: /nissan\s*frontier|frontier/i,            galones: 21.1, fuente: 'Nissan Frontier — tanque ~80 L (estimado, mismo chasis que NP300)' },
  { patron: /mazda\s*5\b/i,                           galones: 15.9, fuente: 'Mazda 5 — tanque ~60 L (estimado)' },
  { patron: /mazda\s*b\b|b22cs7/i,                    galones: 15.9, fuente: 'Mazda B (pickup) — tanque ~60 L (estimado)' },
  { patron: /\brodeo\b/i,                             galones: 18.5, fuente: 'Isuzu Rodeo — tanque ~70 L (estimado)' },
];

function capacidadPorModelo(modelo) {
  const m = String(modelo || '');
  for (const regla of CAPACIDAD_POR_MODELO) {
    if (regla.patron.test(m)) return { galones: regla.galones, fuente: regla.fuente };
  }
  return null;
}

const RENDIMIENTO_DEFAULT = 25;

function nivelRendimiento(kmPorGalon) {
  const v = Number(kmPorGalon) || 0;
  if (v <= 0) return { nivel: 'sin_datos', emoji: '⚪', texto: 'Sin datos suficientes todavía' };
  if (v > 25)  return { nivel: 'verde',    emoji: '🟢', texto: 'Rendimiento normal' };
  if (v >= 20) return { nivel: 'amarillo', emoji: '🟡', texto: 'Consumo medio — vigilar' };
  return          { nivel: 'rojo',     emoji: '🔴', texto: 'Consumo alto — posible fuga, mala conducción, falla mecánica o robo de combustible' };
}

function nivelTanque(porcentaje) {
  const p = Number(porcentaje) || 0;
  if (p > 50) return '🟢';
  if (p > 20) return '🟡';
  return '🔴';
}

// ══════════════════════════════════════════════════════════
//  CAPA DE COMPATIBILIDAD ESTILO SUPABASE
// ══════════════════════════════════════════════════════════
class GASQueryBuilder {
  constructor(t) {
    this._table         = t;
    this._filters       = [];
    this._isNullFilters = [];
    this._ilikes        = [];
    this._orders        = [];
    this._limitN        = null;
    this._single        = false;
    this._updatePayload = null;
    this._insertPayload = null;
  }

  select()            { return this; }
  eq(col, val)        { this._filters.push({ col, val: String(val) }); return this; }
  is(col, val) {
    if (val === null || val === undefined || val === '') {
      this._isNullFilters.push({ col });
    }
    return this;
  }
  ilike(col, pattern) { this._ilikes.push({ col, val: pattern.replace(/%/g,'').toLowerCase() }); return this; }
  order(col, opts)    { if (!opts) opts = {}; this._orders.push({ col, asc: opts.ascending !== false }); return this; }
  limit(n)            { this._limitN = n; return this; }
  single()            { this._single = true; return this; }
  update(payload)     { this._updatePayload = payload; return this; }
  insert(payload) {
    this._insertPayload = Array.isArray(payload) ? payload[0] : payload;
    return this;
  }

  then(resolve, reject) {
    if (this._insertPayload !== null) {
      gasWrite(this._table, this._insertPayload, 'insert')
        .then(function(res) { resolve({ data: null, error: res.ok ? null : { message: res.error } }); })
        .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
      return;
    }
    if (this._updatePayload !== null) {
      const f = this._filters[0];
      if (!f) { resolve({ data: null, error: { message: 'update requiere .eq()' } }); return; }
      gasWrite(this._table, this._updatePayload, 'update', f.col, f.val)
        .then(function(res) { resolve({ data: null, error: res.ok ? null : { message: res.error } }); })
        .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
      return;
    }
    const self = this;
    gasGet(this._table)
      .then(function(rows) {
        for (const f of self._filters)
          rows = rows.filter(function(r) { return String(r[f.col]||'').trim().toLowerCase() === f.val.trim().toLowerCase(); });
        for (const f of self._isNullFilters)
          rows = rows.filter(function(r) { return r[f.col] === null || r[f.col] === undefined || String(r[f.col]).trim() === ''; });
        for (const f of self._ilikes)
          rows = rows.filter(function(r) { return String(r[f.col]||'').toLowerCase().includes(f.val); });
        for (const o of self._orders)
          rows.sort(function(a,b) { const va=String(a[o.col]||''), vb=String(b[o.col]||''); return o.asc ? va.localeCompare(vb) : vb.localeCompare(va); });
        if (self._limitN) rows = rows.slice(0, self._limitN);
        resolve(self._single
          ? { data: rows[0]||null, error: rows.length ? null : { message: 'No rows' } }
          : { data: rows, error: null });
      })
      .catch(function(err) { resolve({ data: null, error: { message: err.message } }); });
  }
}

class ChannelStub { on() { return this; } subscribe() { return this; } }

const DB = {

  supabase: {
    from(t)   { return new GASQueryBuilder(t); },
    channel() { return new ChannelStub(); },
  },

  // ── CACHÉ: INVALIDAR UNA HOJA ──────────────────────────────
  // 🆕 v12.23 — también elimina la entrada de localStorage
  invalidarCache(sheetName) {
    const key = resolveSheet(sheetName);
    delete _cache[key];
    _borrarCachePersistente(key); // 🆕 v12.23
  },

  // 🆕 v12.23 — LIMPIAR TODO EL CACHÉ PERSISTENTE
  // Borra todas las hojas del SHEET_MAP en memoria y localStorage.
  // Útil para que un administrador fuerce recarga total si algo
  // está desactualizado.
  limpiarCacheCompleto() {
    Object.keys(SHEET_MAP).forEach(function(nombre) {
      const key = resolveSheet(nombre);
      delete _cache[key];
      _borrarCachePersistente(key);
    });
    delete _inflight[Object.keys(_inflight)[0]]; // limpiar cualquier inflight residual
    console.log('🧹 DB.limpiarCacheCompleto(): caché en memoria y localStorage eliminado.');
  },

  // ── CACHÉ: PRECARGAR HOJAS ────────────────────────────────
  async prefetch() {
    const hojas = Array.from(arguments);
    await Promise.all(hojas.map(function(h) { return gasGet(h); }));
  },

  // ══════════════════════════════════════════════════════════
  // 🆕 v12.18 — LECTURA PÚBLICA GENÉRICA DE CUALQUIER HOJA
  // ══════════════════════════════════════════════════════════
  // Para pantallas que necesiten leer una hoja del SHEET_MAP sin un
  // método dedicado propio (p.ej. el checklist de Registro de
  // Salida). A diferencia de un fetch() suelto, esto hereda caché,
  // límite de concurrencia, timeout y saneamiento de fechas/horas.
  async obtenerHoja(sheetName) {
    try { return { ok: true, data: await gasGet(sheetName) }; }
    catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  // ══════════════════════════════════════════════════════════
  // 🆕 v12.23 — ESCRITURA PÚBLICA GENÉRICA EN GOOGLE SHEETS
  // ══════════════════════════════════════════════════════════
  // DB.guardar(sheetName, datos) — inserta una fila en la hoja.
  // DB.guardar(sheetName, datos, 'update', 'id', '123') — actualiza.
  // Internamente llama a gasWrite() con la cola de concurrencia,
  // el anti-duplicado y los reintentos automáticos ya incorporados.
  // Todo va a Google Sheets; el nombre "supabase" no aparece aquí.
  async guardar(sheetName, datos, accion, idCol, idValue) {
    if (accion   === undefined) accion   = 'insert';
    if (idCol    === undefined) idCol    = '';
    if (idValue  === undefined) idValue  = '';
    return await gasWrite(sheetName, datos, accion, idCol, idValue);
  },

  // ── LOGIN ──────────────────────────────────────────────────
  async login(usuario, clave) {
    let rows;
    try {
      rows = await gasGetEstricto('usuarios', 45000);
    } catch (eIntento1) {
      console.warn('login: 1er intento de leer "usuarios" falló, reintentando con más tiempo…', eIntento1.message);
      try {
        rows = await gasGetEstricto('usuarios', 60000);
      } catch (eIntento2) {
        console.error('login: no se pudo leer "usuarios" tras 2 intentos:', eIntento2.message);
        return {
          ok: false,
          esErrorConexion: true,
          error: 'No se pudo conectar con el servidor. Verifica tu conexión a internet e intenta nuevamente.'
        };
      }
    }

    try {
      const match = rows.filter(function(r) {
        return String(r.usuario ||'').trim().toLowerCase() === usuario.trim().toLowerCase() &&
               String(r.password||'').trim()               === clave.trim();
      });
      return match.length > 0
        ? { ok: true,  data: match[0] }
        : { ok: false, error: 'Usuario o contraseña incorrectos' };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async registrarUsuario(datos) {
    return await gasWrite('usuarios', Object.assign({}, datos, { created_at: new Date().toISOString() }), 'insert');
  },

  async obtenerFlota() {
    try { return { ok: true, data: await gasGet('carrozas') }; }
    catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladosRecientes(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Traslado');
      data.sort(function(a,b) { return claveOrden(b) - claveOrden(a); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladoActivoPorPlaca(placa) {
    try {
      if (!placa) return { ok: true, data: null };
      const activo = await buscarTrasladoAbiertoPorPlaca(placa);
      return { ok: true, data: activo };
    } catch (e) {
      return { ok: false, data: null, error: e.message };
    }
  },

  async obtenerPlacasConTrasladoActivo() {
    try {
      const [traslados, llegadas, flota] = await Promise.all([
        gasGet('Traslado'), gasGet('Llegadas'), gasGet('carrozas')
      ]);

      const idsConLlegada = new Set(
        llegadas.map(function(l) { return String(l.id_salida || '').trim(); }).filter(Boolean)
      );

      const abiertos = traslados.filter(function(r) {
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        const yaTieneLlegada = r.id_salida && idsConLlegada.has(String(r.id_salida).trim());
        return sinRegreso && !yaTieneLlegada;
      });

      const porPlaca = {};
      abiertos.forEach(function(r) {
        const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (!pBase) return;
        if (!porPlaca[pBase] || claveOrden(r) > claveOrden(porPlaca[pBase])) {
          porPlaca[pBase] = r;
        }
      });

      const resultado = Object.keys(porPlaca).map(function(pBase) {
        const t = porPlaca[pBase];
        const carroza = flota.find(function(c) {
          return String(c.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pBase;
        });
        return {
          placa:            t.placa || '',
          modelo:           carroza ? (carroza.modelo || '') : '',
          id_salida:        t.id_salida || '',
          km_salida:        t.km__salida || t.km_salida || '',
          fecha:            t.fecha || '',
          hora_de_salida:   t.hora_de_salida || '',
          conductor:        t.conductor || '',
          motivo_de_salida: t.motivo_de_salida || '',
          regional:         t.regional || '',
        };
      });

      resultado.sort(function(a, b) { return String(a.placa).localeCompare(String(b.placa)); });
      return { ok: true, data: resultado };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  async obtenerTodasAverias(limite) {
    if (limite === undefined) limite = 20;
    try {
      let data = await gasGet('Averias');
      data.sort(function(a,b) { return String(b.created_at||b.fecha||'').localeCompare(String(a.created_at||a.fecha||'')); });
      return { ok: true, data: data.slice(0, limite) };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerAveriasDesdeFlota(limite) {
    if (limite === undefined) limite = 20;
    try {
      const flota = await gasGet('carrozas');

      const conNovedad = flota.filter(function(c) {
        const estado = normClave(c.estado_parque_automotor);
        return estado && !ESTADOS_SIN_NOVEDAD.includes(estado);
      });

      const resultado = conNovedad.map(function(c) {
        return {
          placa_vehiculo:   c.placa || '',
          modelo:           c.modelo || '',
          tipo_falla:       c.estado_parque_automotor || '---',
          regional:         c.sede_parque_automotor || c.sede_asignada || '',
          reportado_por:    c.historial_taller_nombre || '',
          observaciones:    c.historial_novedad_completa || '',
          fecha:            c.historial_fecha || '',
          dias_en_taller:   c.dias_en_taller_parque || '',
        };
      });

      resultado.sort(function(a, b) { return String(b.fecha || '').localeCompare(String(a.fecha || '')); });

      return { ok: true, data: resultado.slice(0, limite) };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  async obtenerMantenimientos(limite) {
    try {
      let data = await gasGet('mantenimientos');
      data.sort(function(a,b) { return String(b.fecha||b.FECHA||'').localeCompare(String(a.fecha||a.FECHA||'')); });
      if (limite) return { ok: true, data: data.slice(0, limite) };
      return { ok: true, data: data };
    } catch(e) { return { ok: false, data: [], error: e.message }; }
  },

  // ══════════════════════════════════════════════════════════
  // TANQUEO
  // ══════════════════════════════════════════════════════════
  async guardarTanqueo(d) {
    return conLock('guardarTanqueo', async () => {
      try {
        const pSel = String(d.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();

        const historico = await gasGet('Tanqueo');
        const anteriores = historico
          .filter(r => String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel)
          .sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
        const anterior = anteriores[0] || null;

        const kmActual = parseFloat(d.kilometraje) || 0;
        const galones  = parseFloat(d.galones) || 0;
        let kmRecorridos = '';
        let rendimiento  = '';
        let alertaTexto  = '';

        if (anterior && parseFloat(anterior.KILOMETRAJE) > 0 && kmActual > parseFloat(anterior.KILOMETRAJE)) {
          kmRecorridos = kmActual - parseFloat(anterior.KILOMETRAJE);
          if (galones > 0) {
            rendimiento = Math.round((kmRecorridos / galones) * 10) / 10;
            alertaTexto = nivelRendimiento(rendimiento).texto;
          }
        }

        const fila = {
          ID:                   '',
          FECHA:                fechaHoy(),
          HORA:                 d.hora || new Date().toTimeString().slice(0, 5),
          CARROZA:              d.carroza || '',
          PLACA:                d.placa || '',
          CONDUCTOR:            d.conductor || '',
          NIVEL_OBSERVADO:      d.nivel_observado || '',
          ESTACION_SERVICIO:    d.estacion_servicio || '',
          CIUDAD:               d.ciudad || '',
          KILOMETRAJE:          kmActual,
          GALONES:              galones,
          VALOR_GALON:          d.valor_galon || '',
          VALOR_TOTAL:          d.valor_total || '',
          NUMERO_FACTURA:       d.numero_factura || '',
          FOTO_TIRILLA:         d.foto_tirilla || '',
          OBSERVACIONES:        d.observaciones || '',
          KM_RECORRIDOS:        kmRecorridos,
          RENDIMIENTO_KM_GALON: rendimiento,
          ALERTA_RENDIMIENTO:   alertaTexto,
          FORMA_PAGO:           d.forma_pago || '',
          TIPO_COMBUSTIBLE:     d.tipo_combustible || '',
          REGIONAL:             d.regional || '',
          POSIBLE_INNECESARIO:  d.posible_innecesario || 'NO',
          MOTIVO_INNECESARIO:   d.motivo_innecesario  || '',
        };

        const res = await gasWrite('Tanqueo', fila, 'insert');

        if (res.ok) {
          DB.invalidarCache('Tanqueo');

          if (d.posible_innecesario === 'SI') {
            actualizarEnSegundoPlano(
              DB.crearNotificacion({
                tipo: 'tanqueo_innecesario',
                titulo: '⛽ Posible tanqueo innecesario — ' + (d.placa || ''),
                cuerpo: (d.motivo_innecesario || 'El tanqueo se registró con el tanque todavía en buen nivel.') +
                        ' Conductor: ' + (d.conductor || 's/d') + '.',
                regional: d.regional || '',
                remitente: d.conductor || '',
                placa: d.placa || '',
              }),
              'crearNotificacion tras guardarTanqueo (posible innecesario)'
            );
          }

          actualizarEnSegundoPlano((async () => {
            const estado = await DB.obtenerEstadoCarroza(d.placa);
            const capacidad = (estado.ok && estado.capacidad_galones) || CAPACIDAD_TANQUE_DEFAULT;
            const r = await DB.actualizarCarroza(d.placa, {
              kilometraje_actual:        kmActual,
              combustible_galones:       capacidad,
              ultimo_rendimiento_km_gal: rendimiento || '',
            });
            DB.invalidarCache('carrozas');
            return r;
          })(), 'actualizarCarroza tras guardarTanqueo');
        }

        return Object.assign({}, res, {
          km_recorridos: kmRecorridos,
          rendimiento_km_galon: rendimiento,
          alerta_rendimiento: rendimiento ? nivelRendimiento(rendimiento) : null,
        });
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  },

  async obtenerTanqueos(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Tanqueo');
      data.sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTanqueosInnecesarios(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Tanqueo');
      data = data.filter(r => String(r.POSIBLE_INNECESARIO || '').trim().toUpperCase() === 'SI');
      data.sort((a, b) => claveOrdenTanqueo(b) - claveOrdenTanqueo(a));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerEstadoCarroza(placa) {
    try {
      const [flota, mants] = await Promise.all([gasGet('carrozas'), gasGet('mantenimientos')]);
      const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const carroza = flota.find(r => String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel);
      if (!carroza) return { ok: false, error: 'Carroza no encontrada' };

      const capacidadFila = parseFloat(carroza.capacidad_galones) || 0;
      const matchModelo = capacidadFila > 0 ? null : capacidadPorModelo(carroza.modelo);
      const capacidad = capacidadFila > 0 ? capacidadFila
        : (matchModelo ? matchModelo.galones : CAPACIDAD_TANQUE_DEFAULT);
      const combustible = (carroza.combustible_galones !== undefined && String(carroza.combustible_galones).trim() !== '')
        ? parseFloat(carroza.combustible_galones)
        : capacidad;
      const porcentaje = Math.max(0, Math.min(100, Math.round((combustible / capacidad) * 100)));

      const rendimientoUltimo = parseFloat(carroza.ultimo_rendimiento_km_gal) || 0;
      const alertaRendimiento = nivelRendimiento(rendimientoUltimo);

      const ordenesAceite = mants
        .filter(m => String(m.placa || '').toUpperCase() === String(carroza.placa || '').toUpperCase()
                  && /aceite/i.test(m.tipo_servicio || '')
                  && Number(m.km_proximo_cambio) > 0)
        .sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));

      const kmActual = Number(carroza.kilometraje_actual) || 0;
      let estadoAceite = { texto: 'Sin registro de cambio de aceite', emoji: '⚪', faltan: null };
      if (ordenesAceite.length) {
        const proximoCambioKm = Number(ordenesAceite[0].km_proximo_cambio);
        const faltan = proximoCambioKm - kmActual;
        if (faltan <= 0)        estadoAceite = { texto: `Cambio de aceite VENCIDO (hace ${Math.abs(faltan)} km)`, emoji: '🔴', faltan };
        else if (faltan <= 500) estadoAceite = { texto: `Próximo cambio de aceite en ${faltan} km`, emoji: '🟡', faltan };
        else                    estadoAceite = { texto: `Aceite al día (${faltan} km restantes)`, emoji: '🟢', faltan };
      }

      return {
        ok: true,
        placa: carroza.placa,
        combustible_galones: Math.round(combustible * 10) / 10,
        capacidad_galones: capacidad,
        capacidad_origen: capacidadFila > 0 ? 'registrada en carrozas' : (matchModelo ? matchModelo.fuente : 'default genérico (55 gal) — modelo no identificado'),
        porcentaje_combustible: porcentaje,
        nivel_combustible: nivelTanque(porcentaje),
        rendimiento_ultimo_km_gal: rendimientoUltimo || null,
        alerta_rendimiento: alertaRendimiento,
        kilometraje_actual: kmActual,
        estado_aceite: estadoAceite,
      };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ── GUARDAR TRASLADO (SALIDA) ──────────────────────────────
  async guardarTraslado(d) {
    return conLock('guardarTraslado', async () => {

      try {
        const abierto = await buscarTrasladoAbiertoPorPlaca(d.placa);
        if (abierto) {
          return {
            ok: false,
            duplicado: true,
            tipo: 'salida_activa',
            existente: abierto,
            error: `La carroza ${d.placa} ya tiene una salida activa sin cerrar ` +
                   `(${abierto.id_salida}, del ${abierto.fecha} a las ${abierto.hora_de_salida}, ` +
                   `conductor ${abierto.conductor || 's/d'}). Registra su Llegada antes de abrir una nueva salida.`
          };
        }
      } catch (e) {
        console.warn('No se pudo verificar si había una salida activa previa (se continúa igual):', e.message);
      }

      try {
        const duplicado = await buscarTrasladoDuplicadoPorContenido(d);
        if (duplicado) {
          console.warn('Salida duplicada detectada por contenido — se reutiliza el id_salida existente:', duplicado.id_salida);
          return { ok: true, data: { yaGuardado: true }, id_salida: duplicado.id_salida, duplicado: true };
        }
      } catch (e) {
        console.warn('No se pudo verificar duplicado de salida por contenido (se continúa igual):', e.message);
      }

      const fila = {
        id_salida:              'S-' + Date.now(),
        fecha:                  fechaHoy(),
        regional:               d.regional              || '',
        conductor:              d.conductor             || '',
        nnum_telefono:          d.nnum_telefono         || '',
        placa:                  d.placa                 || '',
        motivo_de_salida:       d.motivo                || '',
        nombre_del_fallecido:   d.fallecido             || '',
        clinica_hospital_o_rsd: d.clinica               || '',
        numero_prestacion:      d.prestacion            || '',
        origen:                 d.origen                || '',
        destino:                d.destino               || '',
        hora_de_salida:         d.hora_salida           || '',
        hora_de_ingreso:        '',
        km__salida:             d.km_salida             || '',
        km__ingreso:            '',
        total_km:               '',
        coordinador_en_turno:   d.coordinador           || '',
        observaciones:          d.observaciones         || '',
        imagen1:                d.imagen1               || '',
        firma:                  d.firma                 || '',
        imagen2:                d.imagen2               || '',
        imagen3:                d.imagen3               || '',
        imagen4:                d.imagen4               || '',
        kit_carretera:          d.kit_carretera         || '',
      };
      const res = await gasWrite('Traslado', fila, 'insert');
      if (res.ok) {
        DB.invalidarCache('Traslado');
        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa, {
            estado: 'En Servicio',
            kilometraje_actual: parseInt(d.km_salida) || 0
          }).then((r) => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarTraslado'
        );
      }
      return res.ok ? Object.assign({}, res, { id_salida: fila.id_salida }) : res;
    });
  },

  // ── ACTUALIZAR TRASLADO ────────────────────────────────────
  async actualizarTraslado(idSalida, d) {
    return conLock('actualizarTraslado', async () => {
      try {
        const campos = {
          regional:               d.regional      || '',
          conductor:              d.conductor     || '',
          nnum_telefono:          d.nnum_telefono || '',
          placa:                  d.placa         || '',
          motivo_de_salida:       d.motivo        || '',
          nombre_del_fallecido:   d.fallecido     || '',
          clinica_hospital_o_rsd: d.clinica       || '',
          numero_prestacion:      d.prestacion    || '',
          origen:                 d.origen        || '',
          destino:                d.destino       || '',
          hora_de_salida:         d.hora_salida   || '',
          km__salida:             d.km_salida     || '',
          coordinador_en_turno:   d.coordinador   || '',
          observaciones:          d.observaciones || '',
          imagen1:                d.imagen1       || '',
          imagen2:                d.imagen2       || '',
          imagen3:                d.imagen3       || '',
          imagen4:                d.imagen4       || '',
          firma:                  d.firma         || '',
          kit_carretera:          d.kit_carretera || '',
        };
        const res = await gasWrite('Traslado', campos, 'update', 'id_salida', idSalida);
        if (res.ok) {
          DB.invalidarCache('Traslado');
          actualizarEnSegundoPlano(
            DB.actualizarCarroza(d.placa, {
              kilometraje_actual: parseInt(d.km_salida) || 0
            }).then((r) => { DB.invalidarCache('carrozas'); return r; }),
            'actualizarCarroza tras actualizarTraslado'
          );
        }
        return res;
      } catch(e) {
        return { ok: false, error: e.message };
      }
    });
  },

  // ── VERIFICAR DUPLICADO ────────────────────────────────────
  async verificarDuplicadoSalida(placa) {
    try {
      const hoy  = fechaHoy();
      const rows = await gasGet('Traslado');
      const activos = rows.filter(function(r) {
        return String(r.placa||'').trim().toUpperCase() === placa.trim().toUpperCase() &&
               String(r.fecha||'').trim()               === hoy &&
               (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
      });
      if (activos.length === 0) return { existe: false, id_salida: null, detalle: null };
      activos.sort(function(a,b) { return String(b.hora_de_salida||'').localeCompare(String(a.hora_de_salida||'')); });
      const reg = activos[0];
      return { existe: true, id_salida: reg.id_salida || null, detalle: reg };
    } catch(e) {
      return { existe: false, id_salida: null, detalle: null };
    }
  },

  // ── GUARDAR LLEGADA ────────────────────────────────────────
  async guardarLlegada(d) {
    return conLock('guardarLlegada', async () => {

      if (d.id_salida) {
        try {
          const existente = await buscarLlegadaPorIdSalida(d.id_salida);
          if (existente) {
            console.warn('Llegada duplicada detectada — ya existe un registro para este id_salida:', existente.id);
            return {
              ok: true,
              data: { yaGuardado: true },
              duplicado: true,
              existente: existente,
              estado_carroza_despues: { ok: false },
              estado_carroza_antes: { ok: false },
              combustible_guardado_en_registro: false,
              checklist_actualizado: false,
            };
          }
        } catch (e) {
          console.warn('No se pudo verificar Llegada duplicada (se continúa igual):', e.message);
        }
      }

      const fila = {
        id:             'L-' + Date.now(),
        id_salida:      d.id_salida      || '',
        fecha:          fechaHoy(),
        hora_ingreso:   d.hora_ingreso   || '',
        placa:          d.placa          || '',
        km_ingreso:     d.km_ingreso     || '',
        total_km:       d.total_km       || '',
        estado_entrega: d.estado_entrega || '',
        observaciones:  d.observaciones  || '',
        recibido_por:   d.recibido_por   || '',
        created_at:     new Date().toISOString(),
      };
      const res = await gasWrite('Llegadas', fila, 'insert');
      if (!res.ok) return res;

      DB.invalidarCache('Llegadas');

      let estadoDespues              = { ok: false };
      let estadoPrevio               = { ok: false };
      let rendimientoUsado           = RENDIMIENTO_DEFAULT;
      let carrozaActualizadaOk       = false;
      let combustibleGuardadoEnRegistro = false;

      try {
        estadoPrevio = await DB.obtenerEstadoCarroza(d.placa);
        rendimientoUsado = (estadoPrevio.ok && estadoPrevio.rendimiento_ultimo_km_gal) || RENDIMIENTO_DEFAULT;
        const combustiblePrevio = estadoPrevio.ok ? estadoPrevio.combustible_galones : CAPACIDAD_TANQUE_DEFAULT;
        const totalKm           = parseFloat(d.total_km) || 0;
        const consumoEstimado   = totalKm / rendimientoUsado;
        const nuevoCombustible  = Math.max(0, Math.round((combustiblePrevio - consumoEstimado) * 10) / 10);
        const kmLlegadaNum      = parseInt(d.km_ingreso) || 0;

        const upd = await DB.actualizarCarroza(d.placa, {
          estado:               'Disponible',
          kilometraje_actual:   kmLlegadaNum,
          combustible_galones:  nuevoCombustible,
        });

        carrozaActualizadaOk = !!upd.ok;

        if (upd.ok) {
          DB.invalidarCache('carrozas');
          estadoDespues = await DB.obtenerEstadoCarroza(d.placa);
        } else {
          console.error(
            `❌ La carroza ${d.placa} NO quedó actualizada (km_ingreso=${kmLlegadaNum}) tras guardar la Llegada. ` +
            `El próximo Traslado de esta placa puede arrancar con un KM de salida incorrecto. Revisar manualmente. Error: ${upd.error}`
          );
        }
      } catch (e) {
        console.error('Error actualizando carroza tras guardarLlegada:', e.message);
      }

      try {
        const consumidoGal = (estadoPrevio.ok && estadoDespues && estadoDespues.ok)
          ? Math.round((estadoPrevio.combustible_galones - estadoDespues.combustible_galones) * 10) / 10
          : '';

        const camposCombustible = {
          combustible_antes_porcentaje:    estadoPrevio.ok ? estadoPrevio.porcentaje_combustible : '',
          combustible_antes_galones:       estadoPrevio.ok ? estadoPrevio.combustible_galones     : '',
          combustible_despues_porcentaje:  (estadoDespues && estadoDespues.ok) ? estadoDespues.porcentaje_combustible : '',
          combustible_despues_galones:     (estadoDespues && estadoDespues.ok) ? estadoDespues.combustible_galones   : '',
          combustible_consumido_galones:   consumidoGal,
          capacidad_galones_carroza:       estadoPrevio.ok ? estadoPrevio.capacidad_galones : '',
          rendimiento_usado_km_gal:        rendimientoUsado,
          carroza_actualizada:             carrozaActualizadaOk ? 'SI' : 'NO — revisar manualmente',
        };

        const resCombustible = await gasWrite('Llegadas', camposCombustible, 'update', 'id', fila.id);
        combustibleGuardadoEnRegistro = !!resCombustible.ok;
        if (!resCombustible.ok) {
          console.warn('⚠️ No se pudo anexar el estado de combustible al registro de Llegada ' + fila.id + ':', resCombustible.error);
        } else {
          DB.invalidarCache('Llegadas');
        }
      } catch (e) {
        console.warn('⚠️ Error anexando combustible al registro de Llegada:', e.message);
      }

      let trasladoActualizado = false;
      if (d.id_salida) {
        try {
          const resTraslado = await gasWrite('Traslado', {
            hora_de_ingreso: d.hora_ingreso || '',
            km__ingreso:     d.km_ingreso   || '',
            total_km:        d.total_km     || '',
          }, 'update', 'id_salida', d.id_salida);
          trasladoActualizado = !!resTraslado.ok;
          if (resTraslado.ok) {
            DB.invalidarCache('Traslado');
          } else {
            console.warn('⚠️ No se pudo actualizar hora_de_ingreso en Traslado (' + d.id_salida + '):', resTraslado.error);
          }
        } catch (e) {
          console.warn('⚠️ Error actualizando Traslado tras guardarLlegada:', e.message);
        }
      }

      let checklistActualizado = false;
      try {
        const checklistAbierto = await buscarChecklistAbiertoPorPlaca(d.placa);
        if (checklistAbierto && checklistAbierto.ID) {
          const resChk = await gasWrite('Checklist_Salida', {
            HORA_ENTRADA:  d.hora_ingreso || '',
            KM_ENTRADA:    d.km_ingreso   || '',
            KM_RECORRIDOS: d.total_km     || '',
          }, 'update', 'ID', checklistAbierto.ID);
          checklistActualizado = !!resChk.ok;
          if (resChk.ok) {
            DB.invalidarCache('Checklist_Salida');
          } else {
            console.warn('⚠️ No se pudo actualizar Checklist_Salida (' + checklistAbierto.ID + ') de la placa ' + d.placa + ':', resChk.error);
          }
        } else {
          console.warn('⚠️ No se encontró un Checklist_Salida pendiente para la placa ' + d.placa + ' — no se actualizó HORA_ENTRADA/KM_ENTRADA/KM_RECORRIDOS.');
        }
      } catch (e) {
        console.warn('⚠️ Error actualizando Checklist_Salida tras guardarLlegada:', e.message);
      }

      try {
        if (d.id_salida) {
          const notis = await gasGet('notificaciones_apoyo');
          const pendientes = notis.filter(function(n) {
            return String(n.tipo || '') === 'cierre_pendiente' &&
                   String(n.id_salida_ref || '').trim() === String(d.id_salida).trim() &&
                   !(n.leido === true || n.leido === 'TRUE' || n.leido === 'true');
          });
          for (const n of pendientes) {
            await DB.marcarNotificacionLeida(n.id);
          }
        }
      } catch (e) {
        console.warn('⚠️ No se pudieron marcar como leídas las notificaciones de cierre para', d.id_salida, ':', e.message);
      }

      return Object.assign({}, res, {
        estado_carroza_despues: estadoDespues,
        estado_carroza_antes: estadoPrevio,
        combustible_guardado_en_registro: combustibleGuardadoEnRegistro,
        checklist_actualizado: checklistActualizado,
        traslado_actualizado: trasladoActualizado,
      });
    });
  },

  // ── GUARDAR AVERÍA ─────────────────────────────────────────
  async guardarAveria(d) {
    return conLock('guardarAveria', async () => {
      const fila = {
        id:                   'AV-' + Date.now(),
        reportado_por:        d.reportado_por       || '',
        regional:             d.regional            || '',
        placa_vehiculo:       d.placa_vehiculo      || '',
        tipo_vehiculo:        d.tipo_vehiculo       || '',
        tipo_falla:           d.tipo_falla          || '',
        descripcion_sintomas: d.descripcion_sintomas|| '',
        observaciones:        d.observaciones       || '',
        imagen1:              d.imagen1             || '',
        imagen2:              d.imagen2             || '',
        imagen3:              d.imagen3             || '',
        imagen4:              d.imagen4             || '',
        created_at:           new Date().toISOString(),
      };
      const res = await gasWrite('Averias', fila, 'insert');
      if (res.ok) {
        DB.invalidarCache('Averias');
        const h        = new Date();
        const fechaISO = h.getFullYear() + '-' +
                         (h.getMonth()+1).toString().padStart(2,'0') + '-' +
                         h.getDate().toString().padStart(2,'0');
        const filaMant = {
          id:                   'M-' + Date.now(),
          fecha:                fechaISO,
          placa:                d.placa_vehiculo,
          tipo_servicio:        'Avería — ' + (d.tipo_falla || 'Falla mecánica'),
          kilometraje_servicio: 0,
          costo:                0,
          taller:               'Por asignar',
          responsable:          d.reportado_por,
          observaciones:        '🚨 ORDEN POR AVERÍA\nSíntomas: ' + d.descripcion_sintomas + '\nReportado por: ' + d.reportado_por,
          km_proximo_cambio:    0,
          estado_orden:         'pendiente',
        };

        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa_vehiculo, { estado: 'En Taller' })
            .then((r) => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarAveria'
        );
        actualizarEnSegundoPlano(
          gasWrite('mantenimientos', filaMant, 'insert')
            .then((r) => { DB.invalidarCache('mantenimientos'); return r; }),
          'crear orden de mantenimiento tras guardarAveria'
        );

        actualizarEnSegundoPlano(
          DB.crearNotificacion({
            tipo: 'averia_reportada',
            titulo: '⚠️ Avería reportada — ' + (d.placa_vehiculo || ''),
            cuerpo: (d.tipo_falla || 'Falla mecánica') + ' reportada por ' + (d.reportado_por || 'un conductor') + '.',
            regional: d.regional || '',
            remitente: d.reportado_por || '',
            placa: d.placa_vehiculo || '',
          }),
          'crearNotificacion tras guardarAveria'
        );
      }
      return res;
    });
  },

  async actualizarCarroza(placa, campos) {
    return await gasWrite('carrozas', campos, 'update', 'placa', placa);
  },

  async inicializarCapacidadesTanque() {
    try {
      const flota = await gasGet('carrozas');
      const resumen = { actualizadas: [], yaTenian: [], sinModeloIdentificado: [], errores: [] };

      for (const carroza of flota) {
        const placa = carroza.placa;
        if (!placa) continue;

        const yaTiene = parseFloat(carroza.capacidad_galones) > 0;
        if (yaTiene) {
          resumen.yaTenian.push(placa);
          continue;
        }

        const match = capacidadPorModelo(carroza.modelo);
        const galones = match ? match.galones : CAPACIDAD_TANQUE_DEFAULT;

        try {
          const res = await DB.actualizarCarroza(placa, { capacidad_galones: galones });
          if (res.ok) {
            resumen.actualizadas.push({ placa, modelo: carroza.modelo, galones, fuente: match ? match.fuente : 'default genérico' });
            if (!match) resumen.sinModeloIdentificado.push({ placa, modelo: carroza.modelo });
          } else {
            resumen.errores.push({ placa, error: res.error });
          }
        } catch (e) {
          resumen.errores.push({ placa, error: e.message });
        }
      }

      DB.invalidarCache('carrozas');
      console.log(
        `✅ Capacidad de tanque inicializada: ${resumen.actualizadas.length} carrozas actualizadas, ` +
        `${resumen.yaTenian.length} ya tenían valor, ${resumen.errores.length} con error.`
      );
      if (resumen.sinModeloIdentificado.length) {
        console.warn('⚠️ Estas placas quedaron con el default genérico (55 gal) por no reconocer el modelo — revisar si se quiere ajustar a mano:', resumen.sinModeloIdentificado);
      }
      return { ok: true, resumen };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async repararTrasladosCerrados() {
    try {
      DB.invalidarCache('Traslado');
      DB.invalidarCache('Llegadas');
      const [traslados, llegadas] = await Promise.all([gasGet('Traslado'), gasGet('Llegadas')]);

      const llegadaPorIdSalida = {};
      llegadas.forEach(function(l) {
        const id = String(l.id_salida || '').trim();
        if (id) llegadaPorIdSalida[id] = l;
      });

      const huerfanos = traslados.filter(function(r) {
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        const idSalida = String(r.id_salida || '').trim();
        return sinRegreso && idSalida && llegadaPorIdSalida[idSalida];
      });

      const resumen = { reparados: [], errores: [] };

      for (const traslado of huerfanos) {
        const idSalida = String(traslado.id_salida).trim();
        const llegada = llegadaPorIdSalida[idSalida];
        try {
          const res = await gasWrite('Traslado', {
            hora_de_ingreso: llegada.hora_ingreso || '',
            km__ingreso:     llegada.km_ingreso   || '',
            total_km:        llegada.total_km     || '',
          }, 'update', 'id_salida', idSalida);
          if (res.ok) {
            resumen.reparados.push({ id_salida: idSalida, placa: traslado.placa });
          } else {
            resumen.errores.push({ id_salida: idSalida, placa: traslado.placa, error: res.error });
          }
        } catch (e) {
          resumen.errores.push({ id_salida: idSalida, placa: traslado.placa, error: e.message });
        }
      }

      DB.invalidarCache('Traslado');
      console.log(
        `✅ Reparación de Traslados completada: ${resumen.reparados.length} filas reparadas, ` +
        `${resumen.errores.length} con error.`
      );
      if (resumen.errores.length) {
        console.warn('⚠️ Estas no se pudieron reparar automáticamente — revisar a mano:', resumen.errores);
      }
      return { ok: true, resumen };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async insertar(hoja, datos) {
    const res = await gasWrite(hoja, datos, 'insert');
    if (res.ok) this.invalidarCache(hoja);
    return res;
  },

  async actualizar(hoja, datos, idCol, idValue) {
    const res = await gasWrite(hoja, datos, 'update', idCol, idValue);
    if (res.ok) this.invalidarCache(hoja);
    return res;
  },

  async testConexion() {
    try {
      // v12.18 — pasa por el limitador de concurrencia igual que el
      // resto; conserva 45s de margen por ser, junto con el login, el
      // caso donde de verdad interesa aguantar un cold-start completo.
      const url = `${URL_GAS}?_=${Date.now()}`;
      const resp = await _conLimiteConcurrencia(() =>
        fetchConTimeout(url, { method: 'GET', redirect: 'follow', cache: 'no-store' }, 45000)
      );
      const json = await resp.json();
      return { ok: true, mensaje: json.mensaje || JSON.stringify(json) };
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async obtenerLogo() {
    try {
      const rows = await gasGet('config');
      const fila = rows.find(function(r) { return String(r.clave||'').trim() === 'logo_app'; });
      return { ok: true, logo: (fila && fila.valor && fila.valor.length > 10) ? fila.valor : null };
    } catch(e) { return { ok: false, logo: null, error: e.message }; }
  },

  async guardarLogo(base64) {
    try {
      const rows   = await gasGet('config');
      const existe = rows.find(function(r) { return String(r.clave||'').trim() === 'logo_app'; });
      let res;
      if (existe) res = await gasWrite('config', { valor: base64 }, 'update', 'clave', 'logo_app');
      else        res = await gasWrite('config', { clave: 'logo_app', valor: base64 }, 'insert');
      if (res.ok) this.invalidarCache('config');
      return res;
    } catch(e) { return { ok: false, error: e.message }; }
  },

  async eliminarLogo() {
    const res = await gasWrite('config', { valor: '' }, 'update', 'clave', 'logo_app');
    if (res.ok) this.invalidarCache('config');
    return res;
  },

  // ── GUARDAR INSPECCIÓN VEHICULAR ───────────────────────────
  async guardarInspeccion(datos) {
    return conLock('guardarInspeccion', async () => {
      try {
        const payload = Object.assign({}, datos);
        if (payload.ID && String(payload.ID).length > 8) {
          payload.ID = '';
        }
        const res = await gasWrite('Inspeccion_Vehiculo', payload, 'insert');
        if (res.ok) {
          this.invalidarCache('Inspeccion_Vehiculo');
          if (datos.ESTADO_INSPECCION === 'NO OPERATIVO') {
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, { estado: 'En Taller' })
                .then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza tras inspeccion NO OPERATIVO'
            );
          } else if (datos.KILOMETRAJE) {
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, {
                kilometraje_actual: parseInt(datos.KILOMETRAJE) || 0
              }).then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza km tras inspeccion'
            );
          }
        }
        return res;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  },

  // ══════════════════════════════════════════════════════════
  // v12.21 — LECTURA DE UNA INSPECCIÓN EXISTENTE (POR ID)
  // ══════════════════════════════════════════════════════════
  // inspeccion_vehicular.html la usa en modo edición (?id=...) para
  // precargar todo el formulario con lo que ya se guardó.
  async obtenerInspeccion(id) {
    try {
      if (!id) return { ok: false, error: 'obtenerInspeccion requiere un id' };
      const rows = await gasGet('Inspeccion_Vehiculo');
      const fila = rows.find(function(r) { return String(r.ID || '').trim() === String(id).trim(); });
      if (!fila) return { ok: false, error: 'No se encontró la inspección con ID ' + id };
      return { ok: true, data: fila };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ══════════════════════════════════════════════════════════
  // v12.21 — LISTADO DE INSPECCIONES (para la pantalla de consulta)
  // ══════════════════════════════════════════════════════════
  // Devuelve las inspecciones más recientes primero (orden real por
  // FECHA+HORA, no alfabético). filtros es opcional:
  //   { placa, regional, estado, desde, hasta }  (desde/hasta en DD/MM/AAAA)
  async obtenerInspecciones(limite, filtros) {
    if (limite === undefined) limite = 200;
    filtros = filtros || {};
    try {
      let data = await gasGet('Inspeccion_Vehiculo');

      if (filtros.placa) {
        const pSel = String(filtros.placa).replace(/[^A-Z0-9]/gi, '').toUpperCase();
        data = data.filter(function(r) { return String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel; });
      }
      if (filtros.regional) {
        const rNorm = normTexto(filtros.regional);
        data = data.filter(function(r) { return normTexto(r.REGIONAL) === rNorm; });
      }
      if (filtros.estado) {
        const eNorm = normTexto(filtros.estado);
        data = data.filter(function(r) { return normTexto(r.ESTADO_INSPECCION) === eNorm; });
      }

      data.sort(function(a, b) { return claveOrdenInspeccion(b) - claveOrdenInspeccion(a); });
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  // ══════════════════════════════════════════════════════════
  // v12.21 — ACTUALIZAR UNA INSPECCIÓN EXISTENTE (POR ID)
  // ══════════════════════════════════════════════════════════
  async actualizarInspeccion(id, datos) {
    return conLock('actualizarInspeccion:' + id, async () => {
      try {
        if (!id) return { ok: false, error: 'actualizarInspeccion requiere un id' };
        const payload = Object.assign({}, datos);
        delete payload.ID; // el ID va como idValue, no como campo a sobreescribir

        const res = await gasWrite('Inspeccion_Vehiculo', payload, 'update', 'ID', id);
        if (res.ok) {
          this.invalidarCache('Inspeccion_Vehiculo');
          if (datos.ESTADO_INSPECCION === 'NO OPERATIVO') {
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, { estado: 'En Taller' })
                .then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza tras editar inspeccion (NO OPERATIVO)'
            );
          } else if (datos.KILOMETRAJE) {
            actualizarEnSegundoPlano(
              this.actualizarCarroza(datos.PLACA, {
                kilometraje_actual: parseInt(datos.KILOMETRAJE) || 0
              }).then(r => { this.invalidarCache('carrozas'); return r; }),
              'actualizarCarroza km tras editar inspeccion'
            );
          }
        }
        return res;
      } catch (e) {
        return { ok: false, error: e.message };
      }
    });
  },

  // ── VERIFICAR SI YA EXISTE UNA INSPECCIÓN HECHA HOY ────────
  async verificarInspeccionHoy(placa) {
    try {
      // v12.16 — cache-busting. v12.18 — límite de concurrencia.
      const url = `${URL_GAS}?action=checkInspeccionHoy&placa=${encodeURIComponent(placa)}&_=${Date.now()}`;
      const resp = await _conLimiteConcurrencia(() =>
        fetchConTimeout(url, { method: 'GET', redirect: 'follow', cache: 'no-store' }, 12000)
      );
      if (!resp.ok) return { existe: false };
      const json = await resp.json();
      return json;
    } catch (e) {
      console.warn('verificarInspeccionHoy error:', e.message);
      return { existe: false };
    }
  },

  // ══════════════════════════════════════════════════════════
  // v12.11 — NOTIFICACIONES POR REGIONAL (multi-tenant real)
  // ══════════════════════════════════════════════════════════
  async obtenerNotificaciones(regional, opts) {
    opts = opts || {};
    try {
      const regionalNorm = normTexto(regional);
      if (!regionalNorm) return { ok: true, data: [] };

      const rows = await gasGet('notificaciones_apoyo');

      let filtradas = rows.filter(function(r) {
        const alcanceNorm  = normTexto(r.alcance);
        const regCampoNorm = normTexto(r.regional);

        const esGlobal = alcanceNorm === 'global' || alcanceNorm === 'todas' || alcanceNorm === 'nacional' || alcanceNorm === 'general';
        const formatoNuevo = alcanceNorm === 'regional' && regCampoNorm === regionalNorm;
        const formatoViejo = alcanceNorm === regionalNorm;
        const porCampoRegional = !alcanceNorm && regCampoNorm === regionalNorm;

        return esGlobal || formatoNuevo || formatoViejo || porCampoRegional;
      });

      if (opts.tipo) {
        const tipoNorm = normTexto(opts.tipo);
        filtradas = filtradas.filter(function(r) { return normTexto(r.tipo) === tipoNorm; });
      }

      if (opts.soloNoLeidas) {
        filtradas = filtradas.filter(function(r) {
          const leido = r.leido;
          return !(leido === true || leido === 'TRUE' || leido === 'true' || leido === 1 || leido === '1');
        });
      }

      filtradas.sort(function(a, b) {
        return String(b.created_at || '').localeCompare(String(a.created_at || ''));
      });

      return { ok: true, data: filtradas };
    } catch (e) {
      return { ok: false, data: [], error: e.message };
    }
  },

  async crearNotificacion(d) {
    if (!d || !d.regional) {
      return { ok: false, error: 'crearNotificacion requiere el campo "regional" del destinatario' };
    }
    const fila = {
      id:             (d.tipo || 'NOT') + '-' + (d.placa ? String(d.placa).replace(/\s+/g, '') + '-' : '') + Date.now(),
      tipo:           d.tipo || '',
      titulo:         d.titulo || '',
      cuerpo:         d.cuerpo || '',
      regional:       d.regional,
      alcance:        'regional',
      leido:          false,
      solicitud_id:   d.solicitud_id || '',
      remitente:      d.remitente || '',
      created_at:     new Date().toISOString(),
      placa:          d.placa || '',
      id_salida_ref:  d.id_salida_ref || '',
      conductor:      d.conductor || '',
      hora_salida:    d.hora_salida || '',
      fecha_salida:   d.fecha_salida || '',
    };
    const res = await gasWrite('notificaciones_apoyo', fila, 'insert');
    if (res.ok) DB.invalidarCache('notificaciones_apoyo');
    return res;
  },

  async marcarNotificacionLeida(id) {
    if (!id) return { ok: false, error: 'marcarNotificacionLeida requiere un id' };
    const res = await gasWrite('notificaciones_apoyo', { leido: true }, 'update', 'id', id);
    if (res.ok) DB.invalidarCache('notificaciones_apoyo');
    return res;
  },

};

window.DB = DB;
window.URL_GAS = URL_GAS;

// ── WARM-UP AL INICIAR (no bloquea la UI) ─────────────────────────
// 🆕 v12.23 — Warm-up INTELIGENTE: solo refresca las hojas cuya
// caché local tiene más de 6 horas de antigüedad o no existe.
// Con 20+ usuarios simultáneos, si todos tienen los datos frescos en
// localStorage, NINGUNO lanza peticiones al backend — eliminando
// por completo la tormenta de peticiones que causaba los 404 en cascada.
//
// v12.19 — Se lanza con 5 segundos de retraso para NO competir con la
// carga inicial de la UI (login, selector de placas, etc.).
// Fase 1 (t+5s):  ping + hojas críticas para el primer uso.
// Fase 2 (t+20s): hojas secundarias (averías, mantenimientos, tanqueo).
(function() {
  function _necesitanRefrescar(hojas) {
    var ahora = Date.now();
    return hojas.filter(function(h) {
      var key = resolveSheet(h);
      if (_cache[key] && (ahora - _cache[key].ts) < CACHE_TTL) return false;
      var ls = _obtenerCachePersistente(key);
      if (ls && (ahora - ls.ts) < CACHE_TTL) return false;
      return true;
    });
  }

  setTimeout(async function() {
    var fase1 = ['config', 'usuarios', 'carrozas', 'Traslado', 'Llegadas'];
    var fase1Refrescar = _necesitanRefrescar(fase1);

    if (fase1Refrescar.length > 0) {
      try {
        var ping = await DB.testConexion();
        if (ping.ok) console.log('🟢 API J.R. conectada:', ping.mensaje);
      } catch(e) {}

      // 🆕 Descargar hojas críticas secuencialmente (una a una) para evitar saturación de Apps Script
      for (var i = 0; i < fase1Refrescar.length; i++) {
        try {
          await gasGet(fase1Refrescar[i]);
          await new Promise(function(r) { setTimeout(r, 250); });
        } catch(e) {}
      }
      console.log('✅ Caché fase 1 actualizado (carrozas, traslados, llegadas, usuarios)');
    } else {
      console.log('✅ Warm-up fase 1: todas las hojas ya en caché local fresco, sin peticiones de red.');
    }

    // Fase 2 — secundarias, descargadas también secuencialmente
    setTimeout(async function() {
      var fase2 = ['notificaciones_apoyo', 'Averias', 'mantenimientos', 'Tanqueo'];
      var fase2Refrescar = _necesitanRefrescar(fase2);
      if (fase2Refrescar.length === 0) {
        console.log('✅ Warm-up fase 2: todas las hojas ya en caché local fresco, sin peticiones de red.');
        return;
      }
      for (var j = 0; j < fase2Refrescar.length; j++) {
        try {
          await gasGet(fase2Refrescar[j]);
          await new Promise(function(r) { setTimeout(r, 250); });
        } catch(e) {}
      }
      console.log('✅ Caché fase 2 actualizado (averias, mantenimientos, tanqueo)');
    }, 10000);
  }, 3000);
})();

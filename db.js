/**
 * ══════════════════════════════════════════════════════════
 *  CONECTOR J.R. CARROZAS — db.js  v13.2 (SUPABASE)
 *
 *  🆕 MIGRACIÓN A SUPABASE (Postgres real) — reemplaza a
 *  Google Apps Script + Google Sheets como backend.
 *
 *  Por qué se hizo así:
 *  - Todas las pantallas (.html) llaman al mismo objeto global
 *    `DB` (DB.login, DB.guardarAveria, DB.obtenerFlota, etc.) y
 *    también, en varias pantallas, a `DB.supabase.from(...)`
 *    directamente. Ninguno de los 20 archivos .html se tocó:
 *    este archivo conserva exactamente el mismo contrato
 *    público, solo cambia el motor de abajo.
 *  - Las hojas de Sheets usaban distintas convenciones de
 *    mayúsculas (Tanqueo, Checklist_Salida e
 *    Inspeccion_Vehiculo en MAYÚSCULAS; el resto en
 *    minúsculas/snake_case). Postgres normaliza los nombres de
 *    columna a minúsculas, así que aquí hay una capa de
 *    "traducción" (arriba MAYÚSCULA app ⇄ abajo minúscula
 *    Postgres) para que ninguna pantalla note el cambio.
 *  - Los ~85 ítems del checklist de Inspeccion_Vehiculo
 *    (LUCES_ESTACIONAMIENTO_ESTADO, LUCES_ESTACIONAMIENTO_OBS,
 *    …) ya no son ~180 columnas sueltas: en Postgres viven
 *    dentro de una sola columna jsonb `checklist`. La capa de
 *    traducción los "aplana" de vuelta a campos sueltos al
 *    leer, así el formulario (que lee/escribe por
 *    document.getElementById(ID_DEL_ITEM)) sigue funcionando
 *    exactamente igual.
 *  - "usuarios" quedó con el mismo nivel de acceso que tenía en
 *    Sheets (contraseña en texto plano, editable desde
 *    configuracion.html) para no romper esa pantalla. Es una
 *    mejora pendiente para más adelante, no un cambio de este
 *    paso.
 *
 *  🆕 v13.1 — FOTOS Y FIRMAS A SUPABASE STORAGE:
 *  - Cualquier foto o firma que llegue en base64 (averías,
 *    firma de traslado, tirilla de tanqueo, firmas de
 *    inspección y checklist) se sube sola al bucket "fotos" de
 *    Supabase Storage antes de guardar la fila, y en la base
 *    de datos solo queda el link. Si la subida falla, se deja
 *    el dato original (nunca se pierde información).
 *
 *  🆕 v13.2 — NOTIFICACIONES CRUZADAS ENTRE REGIONALES:
 *  - Cuando un traslado sale con destino a una ciudad que
 *    pertenece a OTRA regional activa, se crea automáticamente
 *    una notificación en "notificaciones_apoyo" para esa
 *    regional destino (tipo "vehiculo_en_transito"), avisando
 *    que hay un vehículo llegando a su zona por si lo requieren.
 *  - Esa notificación se marca como leída sola cuando se
 *    registra la Llegada de ese mismo id_salida (igual que ya
 *    pasaba con "cierre_pendiente").
 *  - No se tocó ninguna tabla ni columna en Supabase. Usa
 *    "notificaciones_apoyo" tal cual ya existía.
 * ══════════════════════════════════════════════════════════
 */

// ── Carga síncrona de supabase-js ANTES de seguir parseando
// este archivo (document.write durante el parseo del <script
// src="db.js"> bloquea hasta que termine de cargar, igual que
// si hubiéramos puesto el <script> del CDN antes en el HTML —
// sin tener que tocar los 20 archivos .html). ──────────────
document.write('<scri' + 'pt src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></scri' + 'pt>');

const SUPABASE_URL = 'https://dciegjhrhfvzesvdgkbl.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWVnamhyaGZ2emVzdmRna2JsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODk0OTMzNjMsImV4cCI6MjEwNTA2OTM2M30.XJbA1-NXGLD28hgg0NnsEEn4AE_MPrhaSNDDGIqzsIE';

// _sb se crea de forma perezosa la primera vez que se usa,
// para darle tiempo al document.write() de arriba a terminar.
let _sbInstance = null;
function _sb() {
  if (!_sbInstance) {
    if (!window.supabase) throw new Error('Supabase aún no ha cargado. Revisa tu conexión a internet.');
    _sbInstance = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  }
  return _sbInstance;
}

function fechaHoy() {
  const h = new Date();
  return h.getDate().toString().padStart(2,'0') + '/' +
         (h.getMonth()+1).toString().padStart(2,'0') + '/' +
         h.getFullYear();
}

function normTexto(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .trim();
}
function normClave(s) {
  return normTexto(s).replace(/[^a-z0-9]/g, '');
}

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
//  CAPA DE TRADUCCIÓN DE NOMBRES (app ⇄ Postgres)
// ══════════════════════════════════════════════════════════
const TABLE_MAP = {
  usuarios:              'usuarios',
  carrozas:               'carrozas',
  Traslado:               'traslado',
  Averias:                'averias',
  Llegadas:               'llegadas',
  mantenimientos:         'mantenimientos',
  solicitud_apoyo:        'solicitud_apoyo',
  notificaciones_apoyo:   'notificaciones_apoyo',
  config:                 'config',
  Tanqueo:                'tanqueo',
  Inspeccion_Vehiculo:    'inspeccion_vehiculo',
  Checklist_Salida:       'checklist_salida',
};
function resolveSheet(name) { return TABLE_MAP[name] ? name : name; } // compat con código viejo que la llamaba
function tablaReal(logico) { return TABLE_MAP[logico] || String(logico).toLowerCase(); }

const TABLAS_MAYUSCULAS = new Set(['Tanqueo', 'Checklist_Salida']);

const INSPECCION_CORE_MAP = {
  TIPO_INSPECCION:          'tipo_inspeccion',
  PLACA:                    'placa',
  MODELO:                   'modelo',
  TIPO_VEHICULO:            'tipo_vehiculo',
  CONDUCTOR_ASIGNADO:       'conductor_asignado',
  FECHA:                    'fecha',
  HORA:                     'hora',
  KILOMETRAJE:              'kilometraje',
  REGIONAL:                 'regional',
  SEDE:                     'sede',
  NIVEL_COMBUSTIBLE:        'nivel_combustible',
  ULTIMO_TANQUEO:           'ultimo_tanqueo',
  OBSERVACIONES_GENERALES:  'observaciones_generales',
  CONDUCTOR:                'conductor',
  INSPECTOR:                'inspector',
  ESTADO_INSPECCION:        'estado_inspeccion',
  FIRMA_CONDUCTOR:          'firma_conductor',
  FIRMA_INSPECTOR:          'firma_inspector',
};

function colToDb(logico, col) {
  if (logico === 'Inspeccion_Vehiculo') {
    if (col === 'ID') return 'id';
    return INSPECCION_CORE_MAP[String(col).toUpperCase()] || String(col).toLowerCase();
  }
  if (TABLAS_MAYUSCULAS.has(logico)) return String(col).toLowerCase();
  if (logico === 'Traslado') {
    if (col === 'km__salida')  return 'km_salida';
    if (col === 'km__ingreso') return 'km_ingreso';
    return col;
  }
  if (logico === 'solicitud_apoyo') {
    if (col === 'conductor_aceptó') return 'conductor_acepto';
    return col;
  }
  return col;
}

// objeto app -> fila Postgres (para insert/update)
function toDbRow(logico, obj) {
  if (!obj) return obj;
  if (logico === 'Inspeccion_Vehiculo') {
    const core = {};
    const chk  = {};
    for (const k in obj) {
      if (k === 'ID') { core.id = obj[k]; continue; }
      const mapped = INSPECCION_CORE_MAP[String(k).toUpperCase()];
      if (mapped) core[mapped] = obj[k];
      else chk[k] = obj[k]; // ítem dinámico del checklist -> jsonb, conserva mayúsculas
    }
    if (Object.keys(chk).length) core.checklist = chk;
    return core;
  }
  if (TABLAS_MAYUSCULAS.has(logico)) {
    const r = {};
    for (const k in obj) r[String(k).toLowerCase()] = obj[k];
    return r;
  }
  if (logico === 'Traslado') {
    const r = {};
    for (const k in obj) r[colToDb(logico, k)] = obj[k];
    return r;
  }
  if (logico === 'solicitud_apoyo') {
    const r = {};
    for (const k in obj) r[colToDb(logico, k)] = obj[k];
    return r;
  }
  return obj;
}

// fila Postgres -> objeto app (para lecturas)
function fromDbRow(logico, row) {
  if (!row) return row;
  if (logico === 'Inspeccion_Vehiculo') {
    const out = { ID: row.id };
    for (const upper in INSPECCION_CORE_MAP) {
      const lower = INSPECCION_CORE_MAP[upper];
      if (row[lower] !== undefined) out[upper] = row[lower];
    }
    if (row.checklist && typeof row.checklist === 'object') Object.assign(out, row.checklist);
    if (row.created_at !== undefined) out.created_at = row.created_at;
    return out;
  }
  if (TABLAS_MAYUSCULAS.has(logico)) {
    const r = {};
    for (const k in row) r[String(k).toUpperCase()] = row[k];
    return r;
  }
  if (logico === 'Traslado') {
    const r = Object.assign({}, row);
    if ('km_salida'  in r) { r.km__salida  = r.km_salida;  delete r.km_salida; }
    if ('km_ingreso' in r) { r.km__ingreso = r.km_ingreso; delete r.km_ingreso; }
    return r;
  }
  if (logico === 'solicitud_apoyo') {
    const r = Object.assign({}, row);
    if ('conductor_acepto' in r) { r['conductor_aceptó'] = r.conductor_acepto; delete r.conductor_acepto; }
    return r;
  }
  return row;
}
function fromDbRows(logico, rows) { return (rows || []).map(r => fromDbRow(logico, r)); }

// En Sheets, una celda vacía siempre se leía como '' (nunca null/undefined).
// Postgres sí distingue null, y varias pantallas hacen `${r.campo}` sin
// guardas — para que no aparezca literalmente "null" en pantalla, se
// normaliza cualquier null de vuelta a '' al leer (igual que antes).
function limpiarNulos(row) {
  if (!row || typeof row !== 'object') return row;
  const r = Object.assign({}, row);
  for (const k in r) {
    if (r[k] === null && k !== 'checklist' && k !== 'documentos' && k !== 'leido') r[k] = '';
  }
  return r;
}
const _fromDbRowSinLimpiar = fromDbRow;
fromDbRow = function(logico, row) { return limpiarNulos(_fromDbRowSinLimpiar(logico, row)); };

// A la inversa: los formularios mandan '' en campos numéricos que
// quedaron en blanco (igual que siempre hacían contra Sheets), pero
// las columnas de Postgres ahora son integer/numeric de verdad, así
// que un '' ahí sería rechazado. Se convierte a null antes de escribir.
const COLUMNAS_NUMERICAS = {
  carrozas:             ['kilometraje_actual','combustible_galones','capacidad_galones','ultimo_rendimiento_km_gal','dias_en_taller_parque','doc_dias_para_vencer'],
  traslado:             ['km_salida','km_ingreso','total_km'],
  llegadas:             ['km_ingreso','total_km','combustible_antes_porcentaje','combustible_antes_galones','combustible_despues_porcentaje','combustible_despues_galones','combustible_consumido_galones','capacidad_galones_carroza','rendimiento_usado_km_gal'],
  mantenimientos:       ['kilometraje_servicio','costo','km_proximo_cambio'],
  tanqueo:              ['kilometraje','galones','valor_galon','valor_total','km_recorridos','rendimiento_km_galon'],
  inspeccion_vehiculo:  ['kilometraje'],
  checklist_salida:     ['km_salida','km_entrada','km_recorridos'],
};
function saneaNumericos(real, row) {
  const cols = COLUMNAS_NUMERICAS[real];
  if (!cols || !row) return row;
  const r = Object.assign({}, row);
  cols.forEach(c => {
    if (!(c in r)) return;
    if (r[c] === '' || r[c] === undefined) r[c] = null;
    else if (r[c] !== null) { const n = Number(r[c]); if (!Number.isNaN(n)) r[c] = n; }
  });
  return r;
}

// ══════════════════════════════════════════════════════════
//  PRIMITIVAS GENÉRICAS DE LECTURA/ESCRITURA
// ══════════════════════════════════════════════════════════
const _cache = {};       // { logico: { ts, data } }
const CACHE_TTL = 15000; // 15s — Postgres ya no necesita horas de caché como Apps Script

async function gasGet(logico) {
  const c = _cache[logico];
  if (c && (Date.now() - c.ts) < CACHE_TTL) return c.data;
  const real = tablaReal(logico);
  const { data, error } = await _sb().from(real).select('*');
  if (error) throw new Error(error.message);
  const out = fromDbRows(logico, data || []);
  _cache[logico] = { ts: Date.now(), data: out };
  return out;
}

// ══════════════════════════════════════════════════════════
//  FOTOS Y FIRMAS -> SUPABASE STORAGE (bucket "fotos")
//  Antes cada foto/firma se guardaba como texto base64 DENTRO
//  de la fila (pesando cientos de KB cada una y llenando la
//  cuota de 500 MB de la base de datos). Ahora, antes de
//  guardar cualquier fila, se detecta el campo que trae una
//  imagen en base64 (data:image/...), se sube como archivo al
//  Storage (que tiene su propia cuota de 1 GB, aparte) y en la
//  fila solo queda guardado el link corto a esa foto — igual
//  de accesible para la app, mucho más liviano.
// ══════════════════════════════════════════════════════════
const FOTOS_POR_TABLA = {
  Traslado:              ['imagen1', 'imagen2', 'imagen3', 'imagen4', 'firma'],
  Averias:               ['imagen1', 'imagen2', 'imagen3', 'imagen4'],
  Tanqueo:               ['FOTO_TIRILLA'],
  Inspeccion_Vehiculo:   ['FIRMA_CONDUCTOR', 'FIRMA_INSPECTOR'],
  Checklist_Salida:      ['FIRMA_CONDUCTOR'],
};

function dataUrlABlob(dataUrl) {
  const partes = dataUrl.split(',');
  const mimeMatch = partes[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream';
  const binario = atob(partes[1]);
  let n = binario.length;
  const bytes = new Uint8Array(n);
  while (n--) bytes[n] = binario.charCodeAt(n);
  return new Blob([bytes], { type: mime });
}

async function subirFoto(campo, dataUrl) {
  try {
    const blob = dataUrlABlob(dataUrl);
    const ext = (blob.type.split('/')[1] || 'jpg').split('+')[0];
    const nombreArchivo = `${campo}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await _sb().storage.from('fotos').upload(nombreArchivo, blob, { contentType: blob.type, upsert: false });
    if (error) { console.warn(`No se pudo subir "${campo}" a Storage, se deja el dato original:`, error.message); return null; }
    const { data } = _sb().storage.from('fotos').getPublicUrl(nombreArchivo);
    return (data && data.publicUrl) || null;
  } catch (e) {
    console.warn(`Error subiendo "${campo}" a Storage, se deja el dato original:`, e.message);
    return null;
  }
}

// Reemplaza, dentro de una fila a guardar, cualquier campo de foto/firma
// que venga en base64 por el link ya subido a Storage. Si algo falla, esa
// foto en particular se queda tal cual (nunca se pierde el dato).
async function subirFotosDelPayload(logico, payload) {
  const campos = FOTOS_POR_TABLA[logico];
  if (!campos || !payload) return payload;
  const out = Object.assign({}, payload);
  await Promise.all(campos.map(async (campo) => {
    const v = out[campo];
    if (typeof v === 'string' && v.indexOf('data:') === 0 && v.length > 200) {
      const url = await subirFoto(campo, v);
      if (url) out[campo] = url;
    }
  }));
  return out;
}

async function gasWrite(logico, payload, accion, idCol, idValue) {
  accion = accion || 'insert';
  try {
    const real = tablaReal(logico);
    payload    = await subirFotosDelPayload(logico, payload);
    const row  = saneaNumericos(real, toDbRow(logico, payload));
    let res;
    if (accion === 'insert') {
      res = await _sb().from(real).insert(row).select().maybeSingle();
    } else {
      const col = colToDb(logico, idCol);
      res = await _sb().from(real).update(row).eq(col, idValue).select().maybeSingle();
    }
    delete _cache[logico];
    if (res.error) return { ok: false, error: res.error.message };
    return { ok: true, data: fromDbRow(logico, res.data) };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

// ── ACTUALIZACIÓN SECUNDARIA EN SEGUNDO PLANO ─────────────
function actualizarEnSegundoPlano(promesa, etiqueta) {
  promesa
    .then(function(res) { if (!res.ok) console.warn(`(${etiqueta}) falló en segundo plano:`, res.error); })
    .catch(function(err) { console.warn(`(${etiqueta}) excepción en segundo plano:`, err.message); });
}

// ── BLOQUEO CONTRA DOBLE CLICK ────────────────────────────
const _locks = {};
async function conLock(nombre, fn) {
  if (_locks[nombre]) return { ok: false, error: 'Ya hay un guardado en curso, espera a que termine.' };
  _locks[nombre] = true;
  try { return await fn(); } finally { delete _locks[nombre]; }
}

// ══════════════════════════════════════════════════════════
//  GUARDAS ANTI-DUPLICADO (SALIDA Y LLEGADA)
// ══════════════════════════════════════════════════════════
async function buscarTrasladoAbiertoPorPlaca(placa) {
  const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!pSel) return null;
  delete _cache['Traslado']; delete _cache['Llegadas'];
  const [rows, llegadas] = await Promise.all([gasGet('Traslado'), gasGet('Llegadas')]);
  const idsConLlegada = new Set(llegadas.map(l => String(l.id_salida || '').trim()).filter(Boolean));
  const abiertos = rows.filter(r => {
    const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sinRegresoEnTraslado = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
    const yaTieneLlegada = r.id_salida && idsConLlegada.has(String(r.id_salida).trim());
    return pBase === pSel && sinRegresoEnTraslado && !yaTieneLlegada;
  });
  if (!abiertos.length) return null;
  abiertos.sort((a, b) => claveOrden(b) - claveOrden(a));
  return abiertos[0];
}

async function buscarTrasladoDuplicadoPorContenido(d) {
  delete _cache['Traslado'];
  const rows = await gasGet('Traslado');
  const pSel = String(d.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  const norm = s => String(s || '').trim().toLowerCase();
  return rows.find(r =>
    String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel &&
    norm(r.conductor)        === norm(d.conductor) &&
    norm(r.fecha)            === norm(fechaHoy()) &&
    norm(r.hora_de_salida)   === norm(d.hora_salida) &&
    norm(r.motivo_de_salida) === norm(d.motivo)
  ) || null;
}

async function buscarLlegadaPorIdSalida(idSalida) {
  if (!idSalida) return null;
  delete _cache['Llegadas'];
  const rows = await gasGet('Llegadas');
  return rows.find(r => String(r.id_salida || '').trim() === String(idSalida).trim()) || null;
}

async function buscarChecklistAbiertoPorPlaca(placa) {
  const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
  if (!pSel) return null;
  delete _cache['Checklist_Salida'];
  const rows = await gasGet('Checklist_Salida');
  const abiertos = rows.filter(r => {
    const pBase = String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
    const sinEntrada = (r.HORA_ENTRADA === undefined || r.HORA_ENTRADA === null || String(r.HORA_ENTRADA).trim() === '');
    return pBase === pSel && sinEntrada;
  });
  if (!abiertos.length) return null;
  abiertos.sort((a, b) => claveOrdenChecklist(b) - claveOrdenChecklist(a));
  return abiertos[0];
}

const ESTADOS_SIN_NOVEDAD = ['disponible', 'operativo', 'operativa', 'ok', 'activo', 'activa', 'bien', ''];

// ══════════════════════════════════════════════════════════
//  COMBUSTIBLE Y RENDIMIENTO (sin cambios de negocio)
// ══════════════════════════════════════════════════════════
const CAPACIDAD_TANQUE_DEFAULT = 55;
const CAPACIDAD_POR_MODELO = [
  { patron: /ssangyong|rodius|stavic/i,              galones: 21.1, fuente: 'SsangYong Rodius/Stavic — tanque 80 L' },
  { patron: /chevrolet\s*hhr|\bhhr\b/i,               galones: 16.1, fuente: 'Chevrolet HHR — tanque 61 L' },
  { patron: /chevrolet\s*(van\s*)?n[34]00|^\s*n400\b/i, galones: 13.2, fuente: 'Chevrolet N300/N400 — tanque 50 L' },
  { patron: /\bdfsk\b/i,                              galones: 10.6, fuente: 'DFSK C35/C37 — tanque 10.6 gal' },
  { patron: /chery/i,                                 galones: 9.2,  fuente: 'Chery QQ/Yoya — tanque 35 L' },
  { patron: /suzuki\s*ertiga|ertiga/i,                galones: 11.9, fuente: 'Suzuki Ertiga — tanque 45 L' },
  { patron: /volkswagen|saveiro/i,                    galones: 14.5, fuente: 'Volkswagen Saveiro — tanque 55 L' },
  { patron: /peugeot\s*partner|partner/i,             galones: 15.9, fuente: 'Peugeot Partner — tanque ~60 L' },
  { patron: /chevrolet\s*luv|\bluv\b/i,               galones: 15.3, fuente: 'Chevrolet LUV — tanque ~58 L' },
  { patron: /toyota\s*hilux|hilux/i,                  galones: 18.5, fuente: 'Toyota Hilux — tanque ~70 L' },
  { patron: /nissan\s*np ?300|np ?300/i,               galones: 21.1, fuente: 'Nissan NP300 — tanque 80 L' },
  { patron: /nissan\s*frontier|frontier/i,            galones: 21.1, fuente: 'Nissan Frontier — tanque ~80 L' },
  { patron: /mazda\s*5\b/i,                           galones: 15.9, fuente: 'Mazda 5 — tanque ~60 L' },
  { patron: /mazda\s*b\b|b22cs7/i,                    galones: 15.9, fuente: 'Mazda B — tanque ~60 L' },
  { patron: /\brodeo\b/i,                             galones: 18.5, fuente: 'Isuzu Rodeo — tanque ~70 L' },
];
function capacidadPorModelo(modelo) {
  const m = String(modelo || '');
  for (const regla of CAPACIDAD_POR_MODELO) if (regla.patron.test(m)) return { galones: regla.galones, fuente: regla.fuente };
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
//  🆕 NOTIFICACIONES CRUZADAS ENTRE REGIONALES
//  Mapa de ciudad de destino (texto libre que escribe el
//  conductor, ej. "Armenia", "Pereira") -> regional operativa
//  que debe enterarse de que un vehículo va hacia su zona.
//
//  "Tolima Norte" (Ibagué y Magdalena Medio) aún NO es una
//  regional activa en el sistema (no hay usuarios con esa
//  regional todavía) — si un traslado va hacia esas ciudades,
//  regionalPorDestino() sí devuelve 'Tolima Norte', pero
//  guardarTraslado() la descarta explícitamente para no crear
//  notificaciones "al aire" sin nadie que las reciba. El día
//  que exista esa regional, basta con quitarla de la lista de
//  exclusión más abajo.
// ══════════════════════════════════════════════════════════
const REGIONALES_INACTIVAS = new Set(['Tolima Norte']);

const CIUDAD_A_REGIONAL = {
  // ── Quindío (departamento completo) ──
  armenia:'Quindío', buenavista:'Quindío', calarca:'Quindío', circasia:'Quindío',
  cordoba:'Quindío', filandia:'Quindío', genova:'Quindío', latebaida:'Quindío',
  montenegro:'Quindío', pijao:'Quindío', quimbaya:'Quindío', salento:'Quindío',

  // ── Risaralda (departamento completo) ──
  apia:'Risaralda', balboa:'Risaralda', belendeumbria:'Risaralda', dosquebradas:'Risaralda',
  guatica:'Risaralda', lacelia:'Risaralda', lavirginia:'Risaralda', marsella:'Risaralda',
  mistrato:'Risaralda', pereira:'Risaralda', pueblorico:'Risaralda', quinchia:'Risaralda',
  santarosadecabal:'Risaralda', santuario:'Risaralda',

  // ── Tolima Sur (activa) ──
  alpujarra:'Tolima Sur', ataco:'Tolima Sur', cajamarca:'Tolima Sur', carmendeapicala:'Tolima Sur',
  chaparral:'Tolima Sur', coello:'Tolima Sur', coyaima:'Tolima Sur', cunday:'Tolima Sur',
  dolores:'Tolima Sur', espinal:'Tolima Sur', guamo:'Tolima Sur', icononzo:'Tolima Sur',
  melgar:'Tolima Sur', natagaima:'Tolima Sur', ortega:'Tolima Sur', planadas:'Tolima Sur',
  prado:'Tolima Sur', purificacion:'Tolima Sur', rioblanco:'Tolima Sur', roncesvalles:'Tolima Sur',
  rovira:'Tolima Sur', saldana:'Tolima Sur', sanantonio:'Tolima Sur', sanluis:'Tolima Sur',
  suarez:'Tolima Sur', valledesanjuan:'Tolima Sur', villarrica:'Tolima Sur',

  // ── Tolima Norte (Ibagué + Magdalena Medio) — sin regional activa aún ──
  ibague:'Tolima Norte', honda:'Tolima Norte', mariquita:'Tolima Norte', armeroguayabal:'Tolima Norte',
  falan:'Tolima Norte', palocabildo:'Tolima Norte', casabianca:'Tolima Norte', villahermosa:'Tolima Norte',
  herveo:'Tolima Norte', fresno:'Tolima Norte', libano:'Tolima Norte', murillo:'Tolima Norte',
  santaisabel:'Tolima Norte', anzoategui:'Tolima Norte', venadillo:'Tolima Norte', lerida:'Tolima Norte',
  ambalema:'Tolima Norte', alvarado:'Tolima Norte', piedras:'Tolima Norte',

  // ── Valle Centro (Cali/Palmira/Buga y alrededores) ──
  cali:'Valle Centro', palmira:'Valle Centro', guadalajaradebuga:'Valle Centro', candelaria:'Valle Centro',
  jamundi:'Valle Centro', yumbo:'Valle Centro', vijes:'Valle Centro', dagua:'Valle Centro',
  lacumbre:'Valle Centro', elcerrito:'Valle Centro', ginebra:'Valle Centro', guacari:'Valle Centro',
  florida:'Valle Centro', pradera:'Valle Centro', buenaventura:'Valle Centro', restrepo:'Valle Centro',
  yotoco:'Valle Centro', sanpedro:'Valle Centro', calimaeldarien:'Valle Centro',

  // ── Valle Norte (Tuluá/Cartago/Zarzal hacia arriba) ──
  tulua:'Valle Norte', cartago:'Valle Norte', zarzal:'Valle Norte', bugalagrande:'Valle Norte',
  andalucia:'Valle Norte', riofrio:'Valle Norte', trujillo:'Valle Norte', roldanillo:'Valle Norte',
  launion:'Valle Norte', toro:'Valle Norte', lavictoria:'Valle Norte', obando:'Valle Norte',
  ansermanuevo:'Valle Norte', elaguila:'Valle Norte', elcairo:'Valle Norte', eldovio:'Valle Norte',
  argelia:'Valle Norte', bolivar:'Valle Norte', caicedonia:'Valle Norte', sevilla:'Valle Norte',
  ulloa:'Valle Norte', versalles:'Valle Norte', alcala:'Valle Norte',
};

// Busca la regional a partir del texto libre de destino
// (ej. "Armenia", "Pereira - Risaralda", "via Cartago").
function regionalPorDestino(destinoTexto) {
  const clave = normClave(destinoTexto);
  if (!clave) return null;
  if (CIUDAD_A_REGIONAL[clave]) return CIUDAD_A_REGIONAL[clave];
  // fallback: coincidencia parcial si el texto trae más palabras
  const encontrada = Object.keys(CIUDAD_A_REGIONAL).find(c => clave.includes(c));
  return encontrada ? CIUDAD_A_REGIONAL[encontrada] : null;
}

// ══════════════════════════════════════════════════════════
//  CAPA DE COMPATIBILIDAD — DB.supabase.from(...)
//  (usada directo por varias pantallas: configuracion.html,
//  taller.html, registro_salida.html, etc.)
// ══════════════════════════════════════════════════════════
class SupaCompat {
  constructor(logico) {
    this._logico = logico;
    this._real   = tablaReal(logico);
    this._q      = _sb().from(this._real).select('*');
    this._modoAsync = null;        // null | 'insert' | 'update' | 'delete'
    this._payload = null;          // payload pendiente para insert/update
    this._filtrosPendientes = [];  // [ [metodo, col, val], ... ] aplicados tras subir fotos
  }
  select(cols) {
    if (cols) {
      const mapeada = String(cols).split(',').map(c => colToDb(this._logico, c.trim())).join(',');
      this._q = _sb().from(this._real).select(mapeada);
    }
    return this;
  }
  eq(col, val) {
    if (this._modoAsync) this._filtrosPendientes.push(['eq', col, val]);
    else this._q = this._q.eq(colToDb(this._logico, col), val);
    return this;
  }
  is(col, val) {
    if (this._modoAsync) this._filtrosPendientes.push(['is', col, val]);
    else this._q = this._q.is(colToDb(this._logico, col), val);
    return this;
  }
  ilike(col, pattern) {
    if (this._modoAsync) this._filtrosPendientes.push(['ilike', col, pattern]);
    else this._q = this._q.ilike(colToDb(this._logico, col), pattern);
    return this;
  }
  order(col, opts) {
    if (this._modoAsync) this._filtrosPendientes.push(['order', col, opts]);
    else this._q = this._q.order(colToDb(this._logico, col), opts);
    return this;
  }
  limit(n) {
    if (this._modoAsync) this._filtrosPendientes.push(['limit', null, n]);
    else this._q = this._q.limit(n);
    return this;
  }
  single() {
    if (this._modoAsync) this._filtrosPendientes.push(['single', null, null]);
    else this._q = this._q.single();
    return this;
  }
  insert(payload) {
    this._modoAsync = 'insert';
    this._payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  update(payload) {
    this._modoAsync = 'update';
    this._payload = payload;
    return this;
  }
  delete() { this._modoAsync = 'delete'; return this; }
  then(resolve, reject) {
    delete _cache[this._logico];
    (async () => {
      try {
        let q;
        if (this._modoAsync === 'insert') {
          const filas = await Promise.all(this._payload.map(p => subirFotosDelPayload(this._logico, p)));
          const mapeado = filas.map(p => saneaNumericos(this._real, toDbRow(this._logico, p)));
          q = _sb().from(this._real).insert(mapeado).select();
        } else if (this._modoAsync === 'update') {
          const p = await subirFotosDelPayload(this._logico, this._payload);
          q = _sb().from(this._real).update(saneaNumericos(this._real, toDbRow(this._logico, p)));
        } else if (this._modoAsync === 'delete') {
          q = _sb().from(this._real).delete();
        } else {
          q = this._q; // select puro, sin cambios
        }
        for (const [metodo, col, val] of this._filtrosPendientes) {
          if (metodo === 'limit')       q = q.limit(val);
          else if (metodo === 'single') q = q.single();
          else                          q = q[metodo](colToDb(this._logico, col), val);
        }
        const res = await q;
        let data = res.data;
        if (Array.isArray(data)) data = fromDbRows(this._logico, data);
        else if (data) data = fromDbRow(this._logico, data);
        resolve({ data, error: res.error ? { message: res.error.message } : null });
      } catch (err) {
        resolve({ data: null, error: { message: err.message } });
      }
    })();
  }
}
class ChannelStub { on() { return this; } subscribe() { return this; } }

const DB = {

  supabase: {
    from(t)   { return new SupaCompat(t); },
    channel() { return new ChannelStub(); },
  },

  invalidarCache(sheetName) { delete _cache[sheetName]; },
  limpiarCacheCompleto() { Object.keys(TABLE_MAP).forEach(n => delete _cache[n]); console.log('🧹 DB.limpiarCacheCompleto(): caché en memoria eliminado.'); },

  async prefetch() {
    const hojas = Array.from(arguments);
    await Promise.all(hojas.map(h => gasGet(h).catch(() => null)));
  },

  async obtenerHoja(sheetName) {
    try { return { ok: true, data: await gasGet(sheetName) }; }
    catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async guardar(sheetName, datos, accion, idCol, idValue) {
    if (accion  === undefined) accion  = 'insert';
    if (idCol   === undefined) idCol   = '';
    if (idValue === undefined) idValue = '';
    return await gasWrite(sheetName, datos, accion, idCol, idValue);
  },

  // ── LOGIN ──────────────────────────────────────────────────
  async login(usuario, clave) {
    let rows;
    try {
      rows = await gasGet('usuarios');
    } catch (e) {
      console.error('login: no se pudo leer "usuarios":', e.message);
      return { ok: false, esErrorConexion: true, error: 'No se pudo conectar con el servidor. Verifica tu conexión a internet e intenta nuevamente.' };
    }
    try {
      const match = rows.filter(r =>
        String(r.usuario || '').trim().toLowerCase() === String(usuario).trim().toLowerCase() &&
        String(r.password || '').trim()               === String(clave).trim()
      );
      return match.length > 0 ? { ok: true, data: match[0] } : { ok: false, error: 'Usuario o contraseña incorrectos' };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async registrarUsuario(datos) {
    return await gasWrite('usuarios', Object.assign({}, datos, { created_at: new Date().toISOString() }), 'insert');
  },

  async obtenerFlota() {
    try { return { ok: true, data: await gasGet('carrozas') }; }
    catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladosRecientes(limite) {
    if (limite === undefined) limite = 50;
    try {
      let data = await gasGet('Traslado');
      data.sort((a, b) => claveOrden(b) - claveOrden(a));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTrasladoActivoPorPlaca(placa) {
    try {
      if (!placa) return { ok: true, data: null };
      const activo = await buscarTrasladoAbiertoPorPlaca(placa);
      return { ok: true, data: activo };
    } catch (e) { return { ok: false, data: null, error: e.message }; }
  },

  async obtenerPlacasConTrasladoActivo() {
    try {
      const [traslados, llegadas, flota] = await Promise.all([gasGet('Traslado'), gasGet('Llegadas'), gasGet('carrozas')]);
      const idsConLlegada = new Set(llegadas.map(l => String(l.id_salida || '').trim()).filter(Boolean));
      const abiertos = traslados.filter(r => {
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        const yaTieneLlegada = r.id_salida && idsConLlegada.has(String(r.id_salida).trim());
        return sinRegreso && !yaTieneLlegada;
      });
      const porPlaca = {};
      abiertos.forEach(r => {
        const pBase = String(r.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
        if (!pBase) return;
        if (!porPlaca[pBase] || claveOrden(r) > claveOrden(porPlaca[pBase])) porPlaca[pBase] = r;
      });
      const resultado = Object.keys(porPlaca).map(pBase => {
        const t = porPlaca[pBase];
        const carroza = flota.find(c => String(c.placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pBase);
        return {
          placa: t.placa || '', modelo: carroza ? (carroza.modelo || '') : '', id_salida: t.id_salida || '',
          km_salida: t.km__salida || t.km_salida || '', fecha: t.fecha || '', hora_de_salida: t.hora_de_salida || '',
          conductor: t.conductor || '', motivo_de_salida: t.motivo_de_salida || '', regional: t.regional || '',
        };
      });
      resultado.sort((a, b) => String(a.placa).localeCompare(String(b.placa)));
      return { ok: true, data: resultado };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerTodasAverias(limite) {
    if (limite === undefined) limite = 20;
    try {
      let data = await gasGet('Averias');
      data.sort((a, b) => String(b.created_at || b.fecha || '').localeCompare(String(a.created_at || a.fecha || '')));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerAveriasDesdeFlota(limite) {
    if (limite === undefined) limite = 20;
    try {
      const flota = await gasGet('carrozas');
      const conNovedad = flota.filter(c => {
        const estado = normClave(c.estado_parque_automotor);
        return estado && !ESTADOS_SIN_NOVEDAD.includes(estado);
      });
      const resultado = conNovedad.map(c => ({
        placa_vehiculo: c.placa || '', modelo: c.modelo || '', tipo_falla: c.estado_parque_automotor || '---',
        regional: c.sede_parque_automotor || c.sede_asignada || '', reportado_por: c.historial_taller_nombre || '',
        observaciones: c.historial_novedad_completa || '', fecha: c.historial_fecha || '', dias_en_taller: c.dias_en_taller_parque || '',
      }));
      resultado.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
      return { ok: true, data: resultado.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async obtenerMantenimientos(limite) {
    try {
      let data = await gasGet('mantenimientos');
      data.sort((a, b) => String(b.fecha || b.FECHA || '').localeCompare(String(a.fecha || a.FECHA || '')));
      if (limite) return { ok: true, data: data.slice(0, limite) };
      return { ok: true, data: data };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
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
        let kmRecorridos = '', rendimiento = '', alertaTexto = '';

        if (anterior && parseFloat(anterior.KILOMETRAJE) > 0 && kmActual > parseFloat(anterior.KILOMETRAJE)) {
          kmRecorridos = kmActual - parseFloat(anterior.KILOMETRAJE);
          if (galones > 0) {
            rendimiento = Math.round((kmRecorridos / galones) * 10) / 10;
            alertaTexto = nivelRendimiento(rendimiento).texto;
          }
        }

        const fila = {
          ID: '', FECHA: fechaHoy(), HORA: d.hora || new Date().toTimeString().slice(0, 5),
          CARROZA: d.carroza || '', PLACA: d.placa || '', CONDUCTOR: d.conductor || '',
          NIVEL_OBSERVADO: d.nivel_observado || '', ESTACION_SERVICIO: d.estacion_servicio || '', CIUDAD: d.ciudad || '',
          KILOMETRAJE: kmActual, GALONES: galones, VALOR_GALON: d.valor_galon || '', VALOR_TOTAL: d.valor_total || '',
          NUMERO_FACTURA: d.numero_factura || '', FOTO_TIRILLA: d.foto_tirilla || '', OBSERVACIONES: d.observaciones || '',
          KM_RECORRIDOS: kmRecorridos, RENDIMIENTO_KM_GALON: rendimiento, ALERTA_RENDIMIENTO: alertaTexto,
          FORMA_PAGO: d.forma_pago || '', TIPO_COMBUSTIBLE: d.tipo_combustible || '', REGIONAL: d.regional || '',
          POSIBLE_INNECESARIO: d.posible_innecesario || 'NO', MOTIVO_INNECESARIO: d.motivo_innecesario || '',
        };
        delete fila.ID; // deja que Postgres/el generador de abajo no reciba un ID vacío como texto

        const res = await gasWrite('Tanqueo', fila, 'insert');

        if (res.ok) {
          DB.invalidarCache('Tanqueo');
          if (d.posible_innecesario === 'SI') {
            actualizarEnSegundoPlano(
              DB.crearNotificacion({
                tipo: 'tanqueo_innecesario', titulo: '⛽ Posible tanqueo innecesario — ' + (d.placa || ''),
                cuerpo: (d.motivo_innecesario || 'El tanqueo se registró con el tanque todavía en buen nivel.') + ' Conductor: ' + (d.conductor || 's/d') + '.',
                regional: d.regional || '', remitente: d.conductor || '', placa: d.placa || '',
              }), 'crearNotificacion tras guardarTanqueo (posible innecesario)'
            );
          }
          actualizarEnSegundoPlano((async () => {
            const estado = await DB.obtenerEstadoCarroza(d.placa);
            const capacidad = (estado.ok && estado.capacidad_galones) || CAPACIDAD_TANQUE_DEFAULT;
            const r = await DB.actualizarCarroza(d.placa, {
              kilometraje_actual: kmActual, combustible_galones: capacidad, ultimo_rendimiento_km_gal: rendimiento || '',
            });
            DB.invalidarCache('carrozas');
            return r;
          })(), 'actualizarCarroza tras guardarTanqueo');
        }

        return Object.assign({}, res, {
          km_recorridos: kmRecorridos, rendimiento_km_galon: rendimiento,
          alerta_rendimiento: rendimiento ? nivelRendimiento(rendimiento) : null,
        });
      } catch (e) { return { ok: false, error: e.message }; }
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
      const capacidad = capacidadFila > 0 ? capacidadFila : (matchModelo ? matchModelo.galones : CAPACIDAD_TANQUE_DEFAULT);
      const combustible = (carroza.combustible_galones !== undefined && String(carroza.combustible_galones).trim() !== '')
        ? parseFloat(carroza.combustible_galones) : capacidad;
      const porcentaje = Math.max(0, Math.min(100, Math.round((combustible / capacidad) * 100)));

      const rendimientoUltimo = parseFloat(carroza.ultimo_rendimiento_km_gal) || 0;
      const alertaRendimiento = nivelRendimiento(rendimientoUltimo);

      const ordenesAceite = mants
        .filter(m => String(m.placa || '').toUpperCase() === String(carroza.placa || '').toUpperCase()
          && /aceite/i.test(m.tipo_servicio || '') && Number(m.km_proximo_cambio) > 0)
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
        ok: true, placa: carroza.placa, combustible_galones: Math.round(combustible * 10) / 10,
        capacidad_galones: capacidad,
        capacidad_origen: capacidadFila > 0 ? 'registrada en carrozas' : (matchModelo ? matchModelo.fuente : 'default genérico (55 gal) — modelo no identificado'),
        porcentaje_combustible: porcentaje, nivel_combustible: nivelTanque(porcentaje),
        rendimiento_ultimo_km_gal: rendimientoUltimo || null, alerta_rendimiento: alertaRendimiento,
        kilometraje_actual: kmActual, estado_aceite: estadoAceite,
      };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  // ── GUARDAR TRASLADO (SALIDA) ──────────────────────────────
  async guardarTraslado(d) {
    return conLock('guardarTraslado', async () => {
      try {
        const abierto = await buscarTrasladoAbiertoPorPlaca(d.placa);
        if (abierto) {
          return {
            ok: false, duplicado: true, tipo: 'salida_activa', existente: abierto,
            error: `La carroza ${d.placa} ya tiene una salida activa sin cerrar ` +
                   `(${abierto.id_salida}, del ${abierto.fecha} a las ${abierto.hora_de_salida}, ` +
                   `conductor ${abierto.conductor || 's/d'}). Registra su Llegada antes de abrir una nueva salida.`
          };
        }
      } catch (e) { console.warn('No se pudo verificar si había una salida activa previa (se continúa igual):', e.message); }

      try {
        const duplicado = await buscarTrasladoDuplicadoPorContenido(d);
        if (duplicado) {
          console.warn('Salida duplicada detectada por contenido — se reutiliza el id_salida existente:', duplicado.id_salida);
          return { ok: true, data: { yaGuardado: true }, id_salida: duplicado.id_salida, duplicado: true };
        }
      } catch (e) { console.warn('No se pudo verificar duplicado de salida por contenido (se continúa igual):', e.message); }

      const fila = {
        id_salida: 'S-' + Date.now(), fecha: fechaHoy(), regional: d.regional || '', conductor: d.conductor || '',
        nnum_telefono: d.nnum_telefono || '', placa: d.placa || '', motivo_de_salida: d.motivo || '',
        nombre_del_fallecido: d.fallecido || '', clinica_hospital_o_rsd: d.clinica || '', numero_prestacion: d.prestacion || '',
        origen: d.origen || '', destino: d.destino || '', hora_de_salida: d.hora_salida || '', hora_de_ingreso: '',
        km__salida: d.km_salida || '', km__ingreso: '', total_km: '', coordinador_en_turno: d.coordinador || '',
        observaciones: d.observaciones || '', imagen1: d.imagen1 || '', firma: d.firma || '', imagen2: d.imagen2 || '',
        imagen3: d.imagen3 || '', imagen4: d.imagen4 || '', kit_carretera: d.kit_carretera || '',
      };
      const res = await gasWrite('Traslado', fila, 'insert');
      if (res.ok) {
        DB.invalidarCache('Traslado');
        actualizarEnSegundoPlano(
          DB.actualizarCarroza(d.placa, { estado: 'En Servicio', kilometraje_actual: parseInt(d.km_salida) || 0 })
            .then(r => { DB.invalidarCache('carrozas'); return r; }),
          'actualizarCarroza tras guardarTraslado'
        );

        // 🆕 Notificación cruzada de regional si el destino cae en otra
        // regional ACTIVA (distinta a la de origen). Si no se reconoce
        // la ciudad, o es la misma regional, o mapea a una regional que
        // todavía no tiene usuarios (ver REGIONALES_INACTIVAS), no se
        // crea nada — nunca bloquea ni afecta el guardado del traslado.
        try {
          const regionalDestino = regionalPorDestino(d.destino);
          const regionalOrigen  = String(d.regional || '').trim();
          if (regionalDestino && regionalDestino !== regionalOrigen && !REGIONALES_INACTIVAS.has(regionalDestino)) {
            actualizarEnSegundoPlano(
              DB.crearNotificacion({
                tipo: 'vehiculo_en_transito',
                titulo: `🚐 Vehículo en tránsito hacia tu regional — ${d.placa || ''}`,
                cuerpo: `Carroza ${d.placa || 's/d'} salió de ${regionalOrigen || 'otra regional'} con destino ${d.destino || 's/d'}. ` +
                        `Conductor: ${d.conductor || 's/d'} (${d.nnum_telefono || 's/n'}). Motivo: ${d.motivo || 's/d'}. ` +
                        `Por si el vehículo se requiere en tu zona.`,
                regional: regionalDestino,
                remitente: d.conductor || '',
                placa: d.placa || '',
                id_salida_ref: fila.id_salida,
                conductor: d.conductor || '',
                hora_salida: d.hora_salida || '',
                fecha_salida: fechaHoy(),
              }),
              'crearNotificacion vehiculo_en_transito tras guardarTraslado'
            );
          }
        } catch (e) {
          console.warn('⚠️ No se pudo evaluar/crear la notificación cruzada de regional:', e.message);
        }
      }
      return res.ok ? Object.assign({}, res, { id_salida: fila.id_salida }) : res;
    });
  },

  // ── ACTUALIZAR TRASLADO ────────────────────────────────────
  async actualizarTraslado(idSalida, d) {
    return conLock('actualizarTraslado', async () => {
      try {
        const campos = {
          regional: d.regional || '', conductor: d.conductor || '', nnum_telefono: d.nnum_telefono || '',
          placa: d.placa || '', motivo_de_salida: d.motivo || '', nombre_del_fallecido: d.fallecido || '',
          clinica_hospital_o_rsd: d.clinica || '', numero_prestacion: d.prestacion || '', origen: d.origen || '',
          destino: d.destino || '', hora_de_salida: d.hora_salida || '', km__salida: d.km_salida || '',
          coordinador_en_turno: d.coordinador || '', observaciones: d.observaciones || '', imagen1: d.imagen1 || '',
          imagen2: d.imagen2 || '', imagen3: d.imagen3 || '', imagen4: d.imagen4 || '', firma: d.firma || '',
          kit_carretera: d.kit_carretera || '',
        };
        const res = await gasWrite('Traslado', campos, 'update', 'id_salida', idSalida);
        if (res.ok) {
          DB.invalidarCache('Traslado');
          actualizarEnSegundoPlano(
            DB.actualizarCarroza(d.placa, { kilometraje_actual: parseInt(d.km_salida) || 0 }).then(r => { DB.invalidarCache('carrozas'); return r; }),
            'actualizarCarroza tras actualizarTraslado'
          );
        }
        return res;
      } catch (e) { return { ok: false, error: e.message }; }
    });
  },

  async verificarDuplicadoSalida(placa) {
    try {
      const hoy  = fechaHoy();
      const rows = await gasGet('Traslado');
      const activos = rows.filter(r =>
        String(r.placa || '').trim().toUpperCase() === placa.trim().toUpperCase() &&
        String(r.fecha || '').trim()               === hoy &&
        (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '')
      );
      if (activos.length === 0) return { existe: false, id_salida: null, detalle: null };
      activos.sort((a, b) => String(b.hora_de_salida || '').localeCompare(String(a.hora_de_salida || '')));
      const reg = activos[0];
      return { existe: true, id_salida: reg.id_salida || null, detalle: reg };
    } catch (e) { return { existe: false, id_salida: null, detalle: null }; }
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
              ok: true, data: { yaGuardado: true }, duplicado: true, existente,
              estado_carroza_despues: { ok: false }, estado_carroza_antes: { ok: false },
              combustible_guardado_en_registro: false, checklist_actualizado: false,
            };
          }
        } catch (e) { console.warn('No se pudo verificar Llegada duplicada (se continúa igual):', e.message); }
      }

      const fila = {
        id: 'L-' + Date.now(), id_salida: d.id_salida || '', fecha: fechaHoy(), hora_ingreso: d.hora_ingreso || '',
        placa: d.placa || '', km_ingreso: d.km_ingreso || '', total_km: d.total_km || '',
        estado_entrega: d.estado_entrega || '', observaciones: d.observaciones || '', recibido_por: d.recibido_por || '',
      };
      const res = await gasWrite('Llegadas', fila, 'insert');
      if (!res.ok) return res;
      DB.invalidarCache('Llegadas');

      let estadoDespues = { ok: false }, estadoPrevio = { ok: false }, rendimientoUsado = RENDIMIENTO_DEFAULT;
      let carrozaActualizadaOk = false, combustibleGuardadoEnRegistro = false;

      try {
        estadoPrevio = await DB.obtenerEstadoCarroza(d.placa);
        rendimientoUsado = (estadoPrevio.ok && estadoPrevio.rendimiento_ultimo_km_gal) || RENDIMIENTO_DEFAULT;
        const combustiblePrevio = estadoPrevio.ok ? estadoPrevio.combustible_galones : CAPACIDAD_TANQUE_DEFAULT;
        const totalKm = parseFloat(d.total_km) || 0;
        const consumoEstimado = totalKm / rendimientoUsado;
        const nuevoCombustible = Math.max(0, Math.round((combustiblePrevio - consumoEstimado) * 10) / 10);
        const kmLlegadaNum = parseInt(d.km_ingreso) || 0;

        const upd = await DB.actualizarCarroza(d.placa, { estado: 'Disponible', kilometraje_actual: kmLlegadaNum, combustible_galones: nuevoCombustible });
        carrozaActualizadaOk = !!upd.ok;
        if (upd.ok) { DB.invalidarCache('carrozas'); estadoDespues = await DB.obtenerEstadoCarroza(d.placa); }
        else console.error(`❌ La carroza ${d.placa} NO quedó actualizada (km_ingreso=${kmLlegadaNum}) tras guardar la Llegada. Revisar manualmente. Error: ${upd.error}`);
      } catch (e) { console.error('Error actualizando carroza tras guardarLlegada:', e.message); }

      try {
        const consumidoGal = (estadoPrevio.ok && estadoDespues && estadoDespues.ok)
          ? Math.round((estadoPrevio.combustible_galones - estadoDespues.combustible_galones) * 10) / 10 : '';
        const camposCombustible = {
          combustible_antes_porcentaje: estadoPrevio.ok ? estadoPrevio.porcentaje_combustible : '',
          combustible_antes_galones: estadoPrevio.ok ? estadoPrevio.combustible_galones : '',
          combustible_despues_porcentaje: (estadoDespues && estadoDespues.ok) ? estadoDespues.porcentaje_combustible : '',
          combustible_despues_galones: (estadoDespues && estadoDespues.ok) ? estadoDespues.combustible_galones : '',
          combustible_consumido_galones: consumidoGal, capacidad_galones_carroza: estadoPrevio.ok ? estadoPrevio.capacidad_galones : '',
          rendimiento_usado_km_gal: rendimientoUsado, carroza_actualizada: carrozaActualizadaOk ? 'SI' : 'NO — revisar manualmente',
        };
        const resCombustible = await gasWrite('Llegadas', camposCombustible, 'update', 'id', fila.id);
        combustibleGuardadoEnRegistro = !!resCombustible.ok;
        if (resCombustible.ok) DB.invalidarCache('Llegadas');
        else console.warn('⚠️ No se pudo anexar el estado de combustible al registro de Llegada ' + fila.id + ':', resCombustible.error);
      } catch (e) { console.warn('⚠️ Error anexando combustible al registro de Llegada:', e.message); }

      let trasladoActualizado = false;
      if (d.id_salida) {
        try {
          const resTraslado = await gasWrite('Traslado', { hora_de_ingreso: d.hora_ingreso || '', km__ingreso: d.km_ingreso || '', total_km: d.total_km || '' }, 'update', 'id_salida', d.id_salida);
          trasladoActualizado = !!resTraslado.ok;
          if (resTraslado.ok) DB.invalidarCache('Traslado');
          else console.warn('⚠️ No se pudo actualizar hora_de_ingreso en Traslado (' + d.id_salida + '):', resTraslado.error);
        } catch (e) { console.warn('⚠️ Error actualizando Traslado tras guardarLlegada:', e.message); }
      }

      let checklistActualizado = false;
      try {
        const checklistAbierto = await buscarChecklistAbiertoPorPlaca(d.placa);
        if (checklistAbierto && checklistAbierto.ID) {
          const resChk = await gasWrite('Checklist_Salida', { HORA_ENTRADA: d.hora_ingreso || '', KM_ENTRADA: d.km_ingreso || '', KM_RECORRIDOS: d.total_km || '' }, 'update', 'ID', checklistAbierto.ID);
          checklistActualizado = !!resChk.ok;
          if (resChk.ok) DB.invalidarCache('Checklist_Salida');
          else console.warn('⚠️ No se pudo actualizar Checklist_Salida (' + checklistAbierto.ID + ') de la placa ' + d.placa + ':', resChk.error);
        } else {
          console.warn('⚠️ No se encontró un Checklist_Salida pendiente para la placa ' + d.placa + ' — no se actualizó HORA_ENTRADA/KM_ENTRADA/KM_RECORRIDOS.');
        }
      } catch (e) { console.warn('⚠️ Error actualizando Checklist_Salida tras guardarLlegada:', e.message); }

      // 🆕 Al cerrar el traslado con su Llegada, se marcan como leídas
      // tanto las notificaciones de "cierre_pendiente" (ya existía)
      // como las de "vehiculo_en_transito" (nuevo) asociadas a ese
      // mismo id_salida — la regional destino ya no necesita seguir
      // viendo el aviso de "vehículo en camino".
      try {
        if (d.id_salida) {
          const notis = await gasGet('notificaciones_apoyo');
          const pendientes = notis.filter(n =>
            (String(n.tipo || '') === 'cierre_pendiente' || String(n.tipo || '') === 'vehiculo_en_transito') &&
            String(n.id_salida_ref || '').trim() === String(d.id_salida).trim() &&
            !(n.leido === true || n.leido === 'TRUE' || n.leido === 'true')
          );
          for (const n of pendientes) await DB.marcarNotificacionLeida(n.id);
        }
      } catch (e) { console.warn('⚠️ No se pudieron marcar como leídas las notificaciones de cierre para', d.id_salida, ':', e.message); }

      return Object.assign({}, res, {
        estado_carroza_despues: estadoDespues, estado_carroza_antes: estadoPrevio,
        combustible_guardado_en_registro: combustibleGuardadoEnRegistro, checklist_actualizado: checklistActualizado,
        traslado_actualizado: trasladoActualizado,
      });
    });
  },

  // ── GUARDAR AVERÍA ─────────────────────────────────────────
  async guardarAveria(d) {
    return conLock('guardarAveria', async () => {
      const fila = {
        id: 'AV-' + Date.now(), reportado_por: d.reportado_por || '', regional: d.regional || '',
        placa_vehiculo: d.placa_vehiculo || '', tipo_vehiculo: d.tipo_vehiculo || '', tipo_falla: d.tipo_falla || '',
        descripcion_sintomas: d.descripcion_sintomas || '', observaciones: d.observaciones || '',
        imagen1: d.imagen1 || '', imagen2: d.imagen2 || '', imagen3: d.imagen3 || '', imagen4: d.imagen4 || '',
      };
      const res = await gasWrite('Averias', fila, 'insert');
      if (res.ok) {
        DB.invalidarCache('Averias');
        const h = new Date();
        const fechaISO = h.getFullYear() + '-' + (h.getMonth() + 1).toString().padStart(2, '0') + '-' + h.getDate().toString().padStart(2, '0');
        const filaMant = {
          id: 'M-' + Date.now(), fecha: fechaISO, placa: d.placa_vehiculo, tipo_servicio: 'Avería — ' + (d.tipo_falla || 'Falla mecánica'),
          kilometraje_servicio: 0, costo: 0, taller: 'Por asignar', responsable: d.reportado_por,
          observaciones: '🚨 ORDEN POR AVERÍA\nSíntomas: ' + d.descripcion_sintomas + '\nReportado por: ' + d.reportado_por,
          km_proximo_cambio: 0, estado_orden: 'pendiente',
        };
        actualizarEnSegundoPlano(DB.actualizarCarroza(d.placa_vehiculo, { estado: 'En Taller' }).then(r => { DB.invalidarCache('carrozas'); return r; }), 'actualizarCarroza tras guardarAveria');
        actualizarEnSegundoPlano(gasWrite('mantenimientos', filaMant, 'insert').then(r => { DB.invalidarCache('mantenimientos'); return r; }), 'crear orden de mantenimiento tras guardarAveria');
        actualizarEnSegundoPlano(DB.crearNotificacion({
          tipo: 'averia_reportada', titulo: '⚠️ Avería reportada — ' + (d.placa_vehiculo || ''),
          cuerpo: (d.tipo_falla || 'Falla mecánica') + ' reportada por ' + (d.reportado_por || 'un conductor') + '.',
          regional: d.regional || '', remitente: d.reportado_por || '', placa: d.placa_vehiculo || '',
        }), 'crearNotificacion tras guardarAveria');
      }
      return res;
    });
  },

  async actualizarCarroza(placa, campos) { return await gasWrite('carrozas', campos, 'update', 'placa', placa); },

  async inicializarCapacidadesTanque() {
    try {
      const flota = await gasGet('carrozas');
      const resumen = { actualizadas: [], yaTenian: [], sinModeloIdentificado: [], errores: [] };
      for (const carroza of flota) {
        const placa = carroza.placa;
        if (!placa) continue;
        const yaTiene = parseFloat(carroza.capacidad_galones) > 0;
        if (yaTiene) { resumen.yaTenian.push(placa); continue; }
        const match = capacidadPorModelo(carroza.modelo);
        const galones = match ? match.galones : CAPACIDAD_TANQUE_DEFAULT;
        try {
          const res = await DB.actualizarCarroza(placa, { capacidad_galones: galones });
          if (res.ok) {
            resumen.actualizadas.push({ placa, modelo: carroza.modelo, galones, fuente: match ? match.fuente : 'default genérico' });
            if (!match) resumen.sinModeloIdentificado.push({ placa, modelo: carroza.modelo });
          } else resumen.errores.push({ placa, error: res.error });
        } catch (e) { resumen.errores.push({ placa, error: e.message }); }
      }
      DB.invalidarCache('carrozas');
      return { ok: true, resumen };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async repararTrasladosCerrados() {
    try {
      DB.invalidarCache('Traslado'); DB.invalidarCache('Llegadas');
      const [traslados, llegadas] = await Promise.all([gasGet('Traslado'), gasGet('Llegadas')]);
      const llegadaPorIdSalida = {};
      llegadas.forEach(l => { const id = String(l.id_salida || '').trim(); if (id) llegadaPorIdSalida[id] = l; });
      const huerfanos = traslados.filter(r => {
        const sinRegreso = (r.hora_de_ingreso === undefined || r.hora_de_ingreso === null || String(r.hora_de_ingreso).trim() === '');
        const idSalida = String(r.id_salida || '').trim();
        return sinRegreso && idSalida && llegadaPorIdSalida[idSalida];
      });
      const resumen = { reparados: [], errores: [] };
      for (const traslado of huerfanos) {
        const idSalida = String(traslado.id_salida).trim();
        const llegada = llegadaPorIdSalida[idSalida];
        try {
          const res = await gasWrite('Traslado', { hora_de_ingreso: llegada.hora_ingreso || '', km__ingreso: llegada.km_ingreso || '', total_km: llegada.total_km || '' }, 'update', 'id_salida', idSalida);
          if (res.ok) resumen.reparados.push({ id_salida: idSalida, placa: traslado.placa });
          else resumen.errores.push({ id_salida: idSalida, placa: traslado.placa, error: res.error });
        } catch (e) { resumen.errores.push({ id_salida: idSalida, placa: traslado.placa, error: e.message }); }
      }
      DB.invalidarCache('Traslado');
      return { ok: true, resumen };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async insertar(hoja, datos) { const res = await gasWrite(hoja, datos, 'insert'); if (res.ok) this.invalidarCache(hoja); return res; },
  async actualizar(hoja, datos, idCol, idValue) { const res = await gasWrite(hoja, datos, 'update', idCol, idValue); if (res.ok) this.invalidarCache(hoja); return res; },

  async testConexion() {
    try {
      const { error } = await _sb().from('config').select('clave').limit(1);
      if (error) throw new Error(error.message);
      return { ok: true, mensaje: 'Conectado a Supabase' };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async obtenerLogo() {
    try {
      const rows = await gasGet('config');
      const fila = rows.find(r => String(r.clave || '').trim() === 'logo_app');
      return { ok: true, logo: (fila && fila.valor && fila.valor.length > 10) ? fila.valor : null };
    } catch (e) { return { ok: false, logo: null, error: e.message }; }
  },

  async guardarLogo(base64) {
    try {
      const rows = await gasGet('config');
      const existe = rows.find(r => String(r.clave || '').trim() === 'logo_app');
      let res;
      if (existe) res = await gasWrite('config', { valor: base64 }, 'update', 'clave', 'logo_app');
      else        res = await gasWrite('config', { clave: 'logo_app', valor: base64 }, 'insert');
      if (res.ok) this.invalidarCache('config');
      return res;
    } catch (e) { return { ok: false, error: e.message }; }
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
        if (payload.ID && String(payload.ID).length > 8) payload.ID = '';
        if (!payload.ID) payload.ID = String(Date.now());
        const res = await gasWrite('Inspeccion_Vehiculo', payload, 'insert');
        if (res.ok) {
          this.invalidarCache('Inspeccion_Vehiculo');
          if (datos.ESTADO_INSPECCION === 'NO OPERATIVO') {
            actualizarEnSegundoPlano(this.actualizarCarroza(datos.PLACA, { estado: 'En Taller' }).then(r => { this.invalidarCache('carrozas'); return r; }), 'actualizarCarroza tras inspeccion NO OPERATIVO');
          } else if (datos.KILOMETRAJE) {
            actualizarEnSegundoPlano(this.actualizarCarroza(datos.PLACA, { kilometraje_actual: parseInt(datos.KILOMETRAJE) || 0 }).then(r => { this.invalidarCache('carrozas'); return r; }), 'actualizarCarroza km tras inspeccion');
          }
        }
        return res;
      } catch (e) { return { ok: false, error: e.message }; }
    });
  },

  async obtenerInspeccion(id) {
    try {
      if (!id) return { ok: false, error: 'obtenerInspeccion requiere un id' };
      const rows = await gasGet('Inspeccion_Vehiculo');
      const fila = rows.find(r => String(r.ID || '').trim() === String(id).trim());
      if (!fila) return { ok: false, error: 'No se encontró la inspección con ID ' + id };
      return { ok: true, data: fila };
    } catch (e) { return { ok: false, error: e.message }; }
  },

  async obtenerInspecciones(limite, filtros) {
    if (limite === undefined) limite = 200;
    filtros = filtros || {};
    try {
      let data = await gasGet('Inspeccion_Vehiculo');
      if (filtros.placa) {
        const pSel = String(filtros.placa).replace(/[^A-Z0-9]/gi, '').toUpperCase();
        data = data.filter(r => String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel);
      }
      if (filtros.regional) { const rNorm = normTexto(filtros.regional); data = data.filter(r => normTexto(r.REGIONAL) === rNorm); }
      if (filtros.estado)   { const eNorm = normTexto(filtros.estado);   data = data.filter(r => normTexto(r.ESTADO_INSPECCION) === eNorm); }
      data.sort((a, b) => claveOrdenInspeccion(b) - claveOrdenInspeccion(a));
      return { ok: true, data: data.slice(0, limite) };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async actualizarInspeccion(id, datos) {
    return conLock('actualizarInspeccion:' + id, async () => {
      try {
        if (!id) return { ok: false, error: 'actualizarInspeccion requiere un id' };
        const payload = Object.assign({}, datos);
        delete payload.ID;
        const res = await gasWrite('Inspeccion_Vehiculo', payload, 'update', 'ID', id);
        if (res.ok) {
          this.invalidarCache('Inspeccion_Vehiculo');
          if (datos.ESTADO_INSPECCION === 'NO OPERATIVO') {
            actualizarEnSegundoPlano(this.actualizarCarroza(datos.PLACA, { estado: 'En Taller' }).then(r => { this.invalidarCache('carrozas'); return r; }), 'actualizarCarroza tras editar inspeccion (NO OPERATIVO)');
          } else if (datos.KILOMETRAJE) {
            actualizarEnSegundoPlano(this.actualizarCarroza(datos.PLACA, { kilometraje_actual: parseInt(datos.KILOMETRAJE) || 0 }).then(r => { this.invalidarCache('carrozas'); return r; }), 'actualizarCarroza km tras editar inspeccion');
          }
        }
        return res;
      } catch (e) { return { ok: false, error: e.message }; }
    });
  },

  async verificarInspeccionHoy(placa) {
    try {
      const hoy = fechaHoy();
      const rows = await gasGet('Inspeccion_Vehiculo');
      const pSel = String(placa || '').replace(/[^A-Z0-9]/gi, '').toUpperCase();
      const existe = rows.some(r => String(r.PLACA || '').replace(/[^A-Z0-9]/gi, '').toUpperCase() === pSel && String(r.FECHA || '').trim() === hoy);
      return { existe };
    } catch (e) { console.warn('verificarInspeccionHoy error:', e.message); return { existe: false }; }
  },

  // ══════════════════════════════════════════════════════════
  // NOTIFICACIONES POR REGIONAL
  // ══════════════════════════════════════════════════════════
  async obtenerNotificaciones(regional, opts) {
    opts = opts || {};
    try {
      const regionalNorm = normTexto(regional);
      if (!regionalNorm) return { ok: true, data: [] };
      const rows = await gasGet('notificaciones_apoyo');
      let filtradas = rows.filter(r => {
        const alcanceNorm = normTexto(r.alcance), regCampoNorm = normTexto(r.regional);
        const esGlobal = alcanceNorm === 'global' || alcanceNorm === 'todas' || alcanceNorm === 'nacional' || alcanceNorm === 'general';
        const formatoNuevo = alcanceNorm === 'regional' && regCampoNorm === regionalNorm;
        const formatoViejo = alcanceNorm === regionalNorm;
        const porCampoRegional = !alcanceNorm && regCampoNorm === regionalNorm;
        return esGlobal || formatoNuevo || formatoViejo || porCampoRegional;
      });
      if (opts.tipo) { const tipoNorm = normTexto(opts.tipo); filtradas = filtradas.filter(r => normTexto(r.tipo) === tipoNorm); }
      if (opts.soloNoLeidas) filtradas = filtradas.filter(r => { const leido = r.leido; return !(leido === true || leido === 'TRUE' || leido === 'true' || leido === 1 || leido === '1'); });
      filtradas.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      return { ok: true, data: filtradas };
    } catch (e) { return { ok: false, data: [], error: e.message }; }
  },

  async crearNotificacion(d) {
    if (!d || !d.regional) return { ok: false, error: 'crearNotificacion requiere el campo "regional" del destinatario' };
    const fila = {
      id: (d.tipo || 'NOT') + '-' + (d.placa ? String(d.placa).replace(/\s+/g, '') + '-' : '') + Date.now(),
      tipo: d.tipo || '', titulo: d.titulo || '', cuerpo: d.cuerpo || '', regional: d.regional, alcance: 'regional',
      leido: false, solicitud_id: d.solicitud_id || '', remitente: d.remitente || '', placa: d.placa || '',
      id_salida_ref: d.id_salida_ref || '', conductor: d.conductor || '', hora_salida: d.hora_salida || '', fecha_salida: d.fecha_salida || '',
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

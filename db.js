/**
 * db.js — CARGADOR DE BACKEND  v13.6
 *
 * Las pantallas hacen <script src="db.js">. Este archivo decide qué conector real cargar:
 *    'sheets'   -> db_sheets.js   (Google Sheets / Apps Script)
 *    'supabase' -> db_supabase.js (Supabase)
 *
 * El servidor activo es UN ajuste GLOBAL guardado en la hoja "ajustes_app" del Apps Script
 * (fila clave="backend"). Solo el admin lo cambia (Configuración → Sistema). Cada celular:
 *   1) arranca al instante con el último valor que recordó (o DEFAULT_BACKEND la 1.ª vez);
 *   2) en segundo plano consulta el Apps Script (no depende de Supabase) y, si el valor cambió,
 *      lo guarda y se actualiza solo. Los conductores no tienen que hacer nada.
 * Rescate (solo para quien conoce el truco): abrir la app con ?backend=sheets o ?backend=supabase
 * fuerza ese servidor SOLO en esa pestaña (no cambia nada para los demás).
 */
(function () {
  var DEFAULT_BACKEND = 'sheets';   // valor inicial en un dispositivo que aún no ha consultado el ajuste global
  var GAS = "https://script.google.com/macros/s/AKfycby3-BtZUU8OrRr9eU3cneGdF4fTvsPOtXshrQn0zmxUtLP5AjgF_qSnulTiQD_eFznZUg/exec";              // mismo Apps Script que db_sheets.js
  var VALIDOS = { sheets: 1, supabase: 1 };
  var K_VAL = 'jr_backend_global', K_TS = 'jr_backend_global_ts';
  var backend = DEFAULT_BACKEND, forzado = false, cacheado = null;

  try {
    localStorage.removeItem('jr_backend'); // override por dispositivo de la versión anterior
    var q = new URLSearchParams(location.search).get('backend');
    if (VALIDOS[q]) { sessionStorage.setItem('jr_backend_sesion', q); }
    var ses = sessionStorage.getItem('jr_backend_sesion');
    cacheado = localStorage.getItem(K_VAL);
    if (VALIDOS[ses]) { backend = ses; forzado = true; }
    else if (VALIDOS[cacheado]) backend = cacheado;
  } catch (e) {}

  window.JR_BACKEND = backend;
  window.JR_BACKEND_DEFAULT = DEFAULT_BACKEND;
  window.JR_BACKEND_FORZADO = forzado;
  document.write('<scr' + 'ipt src="db_' + backend + '.js?v=13.6"></scr' + 'ipt>');

  // ── Consulta del ajuste global (no se hace en pestañas forzadas) ──
  function hayTrabajoEnCurso() {
    try {
      var els = document.querySelectorAll('input:not([type=hidden]):not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=file]), textarea');
      for (var i = 0; i < els.length; i++) if (String(els[i].value || '').trim() !== '') return true;
    } catch (e) {}
    return false;
  }
  function aviso() {
    if (document.getElementById('jr-aviso-servidor') || !document.body) return;
    var d = document.createElement('div');
    d.id = 'jr-aviso-servidor';
    d.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;background:#1e3a8a;color:#fff;padding:12px 14px;border-radius:12px;font:600 14px/1.3 sans-serif;box-shadow:0 6px 20px rgba(0,0,0,.3);text-align:center;cursor:pointer;';
    d.textContent = '🔄 Se actualizó el servidor de datos. Termina lo que estás haciendo y toca aquí para actualizar.';
    d.onclick = function () { location.reload(); };
    document.body.appendChild(d);
  }
  function cambioDetectado() {
    try { Object.keys(localStorage).filter(function (k) { return k.indexOf('JR_CACHE_') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {}
    var n = 0; try { n = +sessionStorage.getItem('jr_reload_n') || 0; } catch (e) {}
    if (n >= 3) return;                         // freno anti-bucle
    if (hayTrabajoEnCurso()) { var t = setInterval(function () { if (document.body) { clearInterval(t); aviso(); } }, 300); return; }
    try { sessionStorage.setItem('jr_reload_n', n + 1); } catch (e) {}
    location.reload();
  }
  function consultar() {
    var ctl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var to = ctl ? setTimeout(function () { ctl.abort(); }, 20000) : null;
    fetch(GAS + '?sheetName=ajustes_app&_=' + Date.now(), { cache: 'no-store', redirect: 'follow', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { return r.json(); })
      .then(function (rows) {
        if (to) clearTimeout(to);
        if (!Array.isArray(rows)) return;
        var f = rows.filter(function (r) { return String(r.clave || '').trim() === 'backend'; })[0];
        var v = f ? String(f.valor || '').trim().toLowerCase() : '';
        try { localStorage.setItem(K_TS, String(Date.now())); } catch (e) {}
        if (VALIDOS[v]) {
          try { localStorage.setItem(K_VAL, v); } catch (e) {}
          window.JR_BACKEND_GLOBAL = v;
          if (v !== backend) cambioDetectado();
          else { try { sessionStorage.removeItem('jr_reload_n'); } catch (e) {} }
        }
      })
      .catch(function () { if (to) clearTimeout(to); }); // sin red / Apps Script caído: se queda como está
  }
  if (!forzado && typeof fetch === 'function') {
    var ult = 0; try { ult = +localStorage.getItem(K_TS) || 0; } catch (e) {}
    if (!cacheado || Date.now() - ult > 60000) consultar();
    document.addEventListener('visibilitychange', function () {
      var u = 0; try { u = +localStorage.getItem(K_TS) || 0; } catch (e) {}
      if (!document.hidden && Date.now() - u > 120000) consultar();
    });
  }
})();

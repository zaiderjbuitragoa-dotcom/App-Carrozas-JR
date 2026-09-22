// sw.js - Service Worker Oficial J.R. v9.0
//
// 🆕 v9.0 — SOPORTE DE PUSH NOTIFICATIONS REALES:
// Se agregan los listeners 'push' y 'notificationclick' al final del
// archivo. Todo lo demás (install, activate, message, fetch) queda
// EXACTAMENTE igual que en v8.0 — no se tocó ni una línea de esa
// lógica, solo se subió CACHE_NAME (ver más abajo) para que los
// dispositivos que ya tenían la PWA instalada recojan este archivo
// nuevo, y se agregó push-subscribe.js a la lista de caché offline.
//
// 🆕 v8.0 — FIX BUG "hay que dar muchos clics al acceso directo para
// que cargue":
//
// 1) Antes, install() y activate() NO llamaban a self.skipWaiting() ni
//    self.clients.claim(). Eso significa que cuando se publicaba una
//    versión nueva del Service Worker, el navegador la dejaba en estado
//    "waiting" y NO la activaba hasta que el usuario cerrara TODAS las
//    pestañas/instancias de la app. En la práctica, cada vez que se
//    tocaba el ícono del acceso directo se abría una instancia más
//    controlada por el SW viejo, y el usuario tenía que tocar el ícono
//    varias veces / cerrar la app varias veces hasta que por fin
//    quedara controlada por la versión nueva.
//    -> Ahora el SW nuevo se activa de inmediato (skipWaiting) y toma
//       control de todas las pestañas abiertas al instante (clients.claim).
//
// 2) La estrategia de red era "solo red, si falla usa caché"
//    (network-only con fallback). Si el celular tenía señal débil o
//    inestable (típico en campo/carretera), el navegador podía tardar
//    mucho tiempo en darse por vencido con la red antes de recurrir a
//    la caché, dando la sensación de que la app "no cargaba" y
//    obligando a cerrar y volver a abrir el acceso directo repetidas
//    veces.
//    -> Ahora se usa "carrera red vs. caché con tiempo límite corto":
//       si la red no responde en NETWORK_TIMEOUT_MS, se usa
//       inmediatamente la versión en caché (y la red sigue en segundo
//       plano por si acaso). Así la app abre rápido siempre, con o sin
//       buena señal.

const CACHE_NAME = 'jr-carrozas-v13';
// 🆕 v9 — se sube la versión de caché a propósito: index.html tenía un
// bug de redirección para el rol "coordinador nacional" (apuntaba a
// "panel_coordinador_nacional.html" pero el archivo real se llamaba
// "panel _coordinador _nacional.html", CON ESPACIOS — se renombró el
// archivo para que coincida). Subir CACHE_NAME fuerza a que TODOS los
// dispositivos, incluidos los que ya tenían la app instalada como PWA,
// descarten su caché vieja y traigan estos archivos corregidos en el
// próximo acceso, en vez de seguir sirviendo el index.html anterior.
const NETWORK_TIMEOUT_MS = 3000; // si la red no responde en 3s, usar caché

// Lista de archivos para funcionar offline
const urlsToCache = [
  './',
  './index.html',
  './panel_coordinador.html',
  './panel_coordinador_nacional.html',
  './panel_conductor.html',
  './panel_automotor.html',
  './solicitud_apoyo.html',
  './crear_apoyo.html',
  './registro_salida.html',
  './registro_llegada.html',
  './tanqueo.html',
  './reporte_averia.html',
  './inspeccion.html',
  './configuracion.html',
  './mis_salidas.html',
  './mis_averias.html',
  './flota.html',
  './taller.html',
  './dashboard.html',
  './db.js',
  './push-subscribe.js',

  './config-aplicar.js',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;800&display=swap',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2',
  'https://cdn.jsdelivr.net/npm/sweetalert2@11'
];

// Dominios que NUNCA deben pasar por el Service Worker (API en vivo).
const DOMINIOS_EXCLUIDOS = [
  'script.google.com',
  'script.googleusercontent.com',
];

// ── INSTALACIÓN ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('📦 Registrando caché...');
        return Promise.all(
          urlsToCache.map(url => cache.add(url).catch(err => console.warn(`⚠️ No se pudo cachear: ${url}`, err)))
        );
      })
      // 🆕 Activa esta versión del SW de inmediato, sin esperar a que se
      // cierren las demás pestañas.
      .then(() => self.skipWaiting())
  );
});

// ── ACTIVACIÓN ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('🧹 Borrando caché antigua:', cacheName);
            return caches.delete(cacheName);
          }
        })
      ))
      // 🆕 Toma control inmediato de todas las pestañas/instancias ya
      // abiertas, sin necesidad de recargarlas manualmente.
      .then(() => self.clients.claim())
  );
});

// 🆕 Permite que la página fuerce la activación inmediata del SW en
// espera (usado desde index.html cuando detecta una versión nueva).
self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// ── FETCH: red con tiempo límite, si tarda o falla usa caché ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  const esDominioExcluido = DOMINIOS_EXCLUIDOS.some(d => url.hostname === d || url.hostname.endsWith('.' + d));
  if (esDominioExcluido) {
    return; // No se intercepta: viaja igual que sin Service Worker.
  }

  // Solo interceptamos GET; otros métodos (si los hubiera) pasan directo.
  if (event.request.method !== 'GET') return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      const cachedResponse = await cache.match(event.request);

      // Petición de red que, si tiene éxito, además actualiza la caché
      // en segundo plano para la próxima vez.
      const fetchPromise = fetch(event.request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.ok) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        })
        .catch(() => null);

      if (!cachedResponse) {
        // No hay nada en caché todavía: hay que esperar a la red sí o sí.
        const networkResponse = await fetchPromise;
        if (networkResponse) return networkResponse;
        // Sin red y sin caché: dejamos que el navegador muestre su error
        // estándar de offline (no hay nada mejor que ofrecer).
        return new Response('Sin conexión y sin datos en caché para esta página.', {
          status: 503,
          statusText: 'Offline',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      // 🆕 Ya hay algo en caché: carrera entre red y un temporizador corto.
      // Si la red no contesta rápido, se usa la caché de inmediato y la
      // app no se queda "colgada" esperando.
      const timeoutPromise = new Promise(resolve => {
        setTimeout(() => resolve(null), NETWORK_TIMEOUT_MS);
      });

      const ganador = await Promise.race([fetchPromise, timeoutPromise]);
      return ganador || cachedResponse;
    })()
  );
});

// ══════════════════════════════════════════════════════════
// 🆕 PUSH — muestra la notificación aunque la app esté cerrada
// o el celular bloqueado. La Edge Function "enviar-push" (en
// Supabase) es quien manda estos mensajes vía Web Push cuando
// se inserta una fila en "notificaciones_apoyo".
// ══════════════════════════════════════════════════════════
self.addEventListener('push', event => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch (e) {
    datos = { title: 'J.R. Carrozas', body: event.data ? event.data.text() : '' };
  }

  const titulo = datos.title || 'J.R. Carrozas';
  const opciones = {
    body: datos.body || '',
    tag: (datos.data && datos.data.id) || undefined, // evita duplicar si llega dos veces
    data: datos.data || {},
    vibrate: [300, 150, 300],
    // Si tu manifest.json tiene un ícono propio, puedes descomentar y
    // ajustar esta ruta para que la notificación lo use:
    // icon: './icono-192.png',
    // badge: './icono-96.png',
  };

  event.waitUntil(self.registration.showNotification(titulo, opciones));
});

// ── CLIC EN LA NOTIFICACIÓN: abre o enfoca la app en la pantalla útil ──
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const datos = event.notification.data || {};
  const urlDestino = datos.url || './index.html';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
      const archivoDestino = urlDestino.split('/').pop();
      for (const client of clientList) {
        if (client.url.includes(archivoDestino) && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow(urlDestino);
    })
  );
});

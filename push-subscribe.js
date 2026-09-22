/**
 * ══════════════════════════════════════════════════════════
 *  push-subscribe.js — J.R. Carrozas
 *
 *  Pide permiso de notificaciones al usuario ya logueado y guarda su
 *  suscripción push en Supabase (tabla push_subscriptions), asociada
 *  a su usuario/regional/rol. Así, la Edge Function "enviar-push"
 *  (que se dispara sola cada vez que se crea una fila en
 *  "notificaciones_apoyo") puede mandarle un push real — llega aunque
 *  el celular esté bloqueado o la app cerrada.
 *
 *  CÓMO SE USA: agregar una sola línea, DESPUÉS de <script src="db.js">,
 *  en cualquier pantalla donde el usuario ya esté logueado:
 *
 *      <script src="db.js"></script>
 *      <script src="push-subscribe.js"></script>
 *
 *  No hace nada (no rompe nada) si:
 *  - el navegador no soporta push (ej. algunos navegadores in-app),
 *  - el usuario ya le dijo "No" al permiso antes,
 *  - no hay sesión iniciada (localStorage.usuario_sesion vacío).
 * ══════════════════════════════════════════════════════════
 */
(function () {
  // Debe ser EXACTAMENTE la misma llave pública guardada en
  // config.vapid_public_key (tabla "config" en Supabase). Si algún día
  // se rotan las llaves VAPID, hay que actualizar este valor también.
  const VAPID_PUBLIC_KEY = 'BBTfjx2ePnaTvCT2XKBW54vD0pSnQaguG9vcJi32yJPuVRUT5PdZsmG-EvJehattUqTKcwcCQv7MV6QyFd1CRz8';

  function base64UrlToUint8Array(base64Url) {
    const padding = '='.repeat((4 - (base64Url.length % 4)) % 4);
    const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  }

  async function guardarSuscripcion(subscription, sesion) {
    const sub = subscription.toJSON();
    const fila = {
      usuario: sesion.usuario || '',
      regional: sesion.regional || '',
      rol: String(sesion.rol || '').toLowerCase(),
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: navigator.userAgent,
      activo: true,
    };

    // "endpoint" es UNIQUE en la tabla — si ya existía esta suscripción
    // (mismo navegador/dispositivo), se actualiza en vez de duplicarla.
    const resInsert = await DB.supabase.from('push_subscriptions').insert(fila);
    if (resInsert.error) {
      const msg = String(resInsert.error.message || '').toLowerCase();
      if (msg.includes('duplicate') || msg.includes('unique')) {
        await DB.supabase.from('push_subscriptions').update(fila).eq('endpoint', fila.endpoint);
      } else {
        console.warn('⚠️ No se pudo guardar la suscripción push:', resInsert.error.message);
      }
    }
  }

  async function suscribirPush() {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      if (typeof DB === 'undefined' || !DB.supabase) return; // db.js debe cargar primero

      const sesionRaw = localStorage.getItem('usuario_sesion');
      if (!sesionRaw) return; // sin sesión, no hay a quién asociar la suscripción
      const sesion = JSON.parse(sesionRaw);

      if (Notification.permission === 'denied') return; // el usuario ya dijo que no antes

      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        if (Notification.permission !== 'granted') {
          const permiso = await Notification.requestPermission();
          if (permiso !== 'granted') return;
        }
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64UrlToUint8Array(VAPID_PUBLIC_KEY),
        });
      }

      await guardarSuscripcion(subscription, sesion);
    } catch (e) {
      console.warn('⚠️ No se pudo suscribir a notificaciones push:', e.message);
    }
  }

  // Se intenta poco después de que cargue la página (dando tiempo a que
  // db.js ya haya definido window.DB) y también si el usuario cambia de
  // pestaña/vuelve a esta pantalla más tarde.
  function iniciar() { setTimeout(suscribirPush, 800); }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    iniciar();
  } else {
    window.addEventListener('load', iniciar);
  }
})();

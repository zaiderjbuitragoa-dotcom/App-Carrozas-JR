// ── SISTEMA DE CONFIGURACIÓN GLOBAL J.R. ──────────────
// Incluir este script en TODAS las páginas: <script src="config-aplicar.js"></script>
// Debe ir ANTES de cerrar </body>

(function aplicarConfigGlobal() {
    const cfg = JSON.parse(localStorage.getItem('jr_config_apariencia') || '{}');

    // ── 1. COLORES ──
    if (cfg.color_primario) {
        document.documentElement.style.setProperty('--azul',            cfg.color_primario);
        document.documentElement.style.setProperty('--azul-principal',  cfg.color_primario);
        document.documentElement.style.setProperty('--azul-corporativo',cfg.color_primario);
        document.documentElement.style.setProperty('--color-primario',  cfg.color_primario);
    }
    if (cfg.color_acento) {
        document.documentElement.style.setProperty('--verde-wa',        cfg.color_acento);
        document.documentElement.style.setProperty('--verde',           cfg.color_acento);
        document.documentElement.style.setProperty('--color-acento',    cfg.color_acento);
    }

    // ── 2. LOGO en headers ──
    const logo = localStorage.getItem('jr_logo');
    const nombre = cfg.nombre_empresa || 'J.R. CARROZAS';
    const slogan = cfg.slogan || '';

    // Buscar elementos de logo/nombre en el header
    const logoTextos = document.querySelectorAll(
        '.logo-text, .logo-small, .sidebar-logo span, [id="user-name"]'
    );

    // Insertar logo imagen si existe
    if (logo) {
        const headers = document.querySelectorAll('header, .header, .sidebar-logo');
        headers.forEach(h => {
            // Solo si no ya tiene img de logo
            if (!h.querySelector('.jr-logo-img')) {
                const img = document.createElement('img');
                img.src = logo;
                img.className = 'jr-logo-img';
                img.style.cssText = 'height:36px; width:auto; border-radius:6px; vertical-align:middle; margin-right:8px;';
                const firstChild = h.firstElementChild;
                if (firstChild) h.insertBefore(img, firstChild);
            }
        });
    }

    // Actualizar nombre empresa en logo-text
    document.querySelectorAll('.logo-text, .logo-small').forEach(el => {
        if (!el.querySelector('.jr-logo-img')) {
            el.textContent = nombre;
        }
    });

    // ── 3. TÍTULO de pestaña ──
    if (nombre && document.title) {
        document.title = document.title.replace('J.R.', nombre.split(' ')[0]);
    }
})();

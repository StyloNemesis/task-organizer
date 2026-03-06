// external-links.js - Manejo de enlaces externos
(function() {
  'use strict';

  // Interceptar clics en enlaces para abrirlos en el navegador externo
  // Usando un solo listener global que funciona para todos los enlaces,
  // incluso los añadidos dinámicamente
  document.addEventListener('click', function(event) {
    const target = event.target.closest('a');
    
    if (target && target.href) {
      const url = target.href;
      
      // Si es un enlace externo (http o https)
      if (url.startsWith('http://') || url.startsWith('https://')) {
        event.preventDefault();
        event.stopPropagation();
        window.api.openExternal(url);
      }
    }
  }, true);
})();

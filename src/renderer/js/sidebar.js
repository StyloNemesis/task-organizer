// sidebar.js - Componente común de navegación
(function() {
  'use strict';

  const currentPage = window.location.pathname.split('/').pop() || 'index.html';

  const sidebarHTML = `
    <aside class="sidebar">
      <div class="sidebar-header">
        <h1>${ICONS.clipboard} Task Organizer</h1>
      </div>
      
      <nav class="sidebar-nav">
        <a href="index.html" class="nav-link ${currentPage === 'index.html' ? 'active' : ''}">
          <span class="icon">${ICONS.dashboard}</span>
          Dashboard
        </a>
        <a href="kanban.html" class="nav-link ${currentPage === 'kanban.html' ? 'active' : ''}">
          <span class="icon">${ICONS.kanban}</span>
          Kanban
        </a>
        <a href="projects.html" class="nav-link ${currentPage === 'projects.html' ? 'active' : ''}">
          <span class="icon">${ICONS.folder}</span>
          Proyectos
        </a>
      </nav>

      <div class="sidebar-footer" id="sidebarFooter">
        <!-- Se llenará dinámicamente según la página -->
      </div>
    </aside>
  `;

  // Insertar el sidebar al inicio del app-container
  document.addEventListener('DOMContentLoaded', function() {
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.insertAdjacentHTML('afterbegin', sidebarHTML);
      
      // Cargar el footer específico de cada página
      loadSidebarFooter();
      
      // Emitir evento personalizado para notificar que el sidebar está listo
      window.dispatchEvent(new Event('sidebarLoaded'));
    }
  });

  function loadSidebarFooter() {
    const footer = document.getElementById('sidebarFooter');
    
    // Footer vacío - los botones de acción están en el header
    footer.innerHTML = '';
  }
})();

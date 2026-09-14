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
        <a href="calendar.html" class="nav-link ${currentPage === 'calendar.html' ? 'active' : ''}">
          <span class="icon">${ICONS.calendar}</span>
          Calendario
          <span class="nav-badge" id="sidebarTodayBadge"></span>
        </a>
        <a href="projects.html" class="nav-link ${currentPage === 'projects.html' ? 'active' : ''}">
          <span class="icon">${ICONS.folder}</span>
          Proyectos
        </a>
        <a href="integrations.html" class="nav-link ${currentPage === 'integrations.html' ? 'active' : ''}">
          <span class="icon">${ICONS.code}</span>
          Issues
        </a>
        <a href="pull-requests.html" class="nav-link nav-link--pr ${currentPage === 'pull-requests.html' ? 'active' : ''}">
          <span class="nav-badge nav-badge--left" id="sidebarPrBadge"></span>
          <span class="icon">${ICONS.gitPullRequest}</span>
          PRs / MRs
        </a>
      </nav>

      <div class="sidebar-footer" id="sidebarFooter">
        <!-- Se llenará dinámicamente según la página -->
      </div>

      <div class="sidebar-bottom">
        <a href="themes.html" class="nav-link nav-link-bottom ${currentPage === 'themes.html' ? 'active' : ''}">
          <span class="icon">${ICONS.palette}</span>
          Configuración
        </a>
      </div>
    </aside>
  `;

  // Insertar el sidebar al inicio del app-container
  document.addEventListener('DOMContentLoaded', function() {
    const appContainer = document.querySelector('.app-container');
    if (appContainer) {
      appContainer.insertAdjacentHTML('afterbegin', sidebarHTML);
      loadSidebarFooter();
      loadTodayTasksBadge();
      loadPrBadge();
      window.dispatchEvent(new Event('sidebarLoaded'));
    }
  });

  function loadSidebarFooter() {
    const footer = document.getElementById('sidebarFooter');
    footer.innerHTML = '';
  }

  async function loadTodayTasksBadge() {
    try {
      if (!window.api) return;
      const tasks = await window.api.getAllTasks();
      const today = new Date();
      const pad = n => String(n).padStart(2, '0');
      const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const count = tasks.filter(t =>
        t.due_date &&
        t.due_date.substring(0, 10) === todayStr &&
        t.status !== 'completed'
      ).length;
      const badge = document.getElementById('sidebarTodayBadge');
      if (badge && count > 0) {
        badge.textContent = count > 99 ? '99+' : count;
        badge.classList.add('nav-badge--visible');
      }
    } catch (e) { /* silencioso */ }
  }

  function updatePrBadgeUI(count, animate = false) {
    const badge = document.getElementById('sidebarPrBadge');
    if (!badge) return;
    if (typeof count === 'number' && count > 0) {
      const prevCount = parseInt(badge.textContent, 10) || 0;
      badge.textContent = count > 99 ? '99+' : count;
      badge.classList.add('nav-badge--visible');
      badge.setAttribute('title', `${count} PRs/MRs abiertas listas (excluyendo borradores)`);
      if (animate && count > prevCount) {
        badge.classList.remove('nav-badge--pulse');
        void badge.offsetWidth;
        badge.classList.add('nav-badge--pulse');
      }
    } else {
      badge.textContent = '';
      badge.classList.remove('nav-badge--visible', 'nav-badge--pulse');
      badge.removeAttribute('title');
    }
  }

  async function loadPrBadge() {
    try {
      if (!window.api || !window.api.getPullRequestsCount) return;
      const count = await window.api.getPullRequestsCount();
      updatePrBadgeUI(count, false);
    } catch (e) { /* silencioso */ }
  }

  // Escuchar eventos en tiempo real desde el proceso principal (segundo plano)
  if (window.api && window.api.onPullRequestsUpdated) {
    window.api.onPullRequestsUpdated(data => {
      const count = typeof data?.count === 'number'
        ? data.count
        : (Array.isArray(data?.results) ? data.results.filter(r => !r.draft).length : 0);
      updatePrBadgeUI(count, true);
    });
  }

  // Escuchar evento local si el usuario actualiza manualmente desde la pestaña de PRs
  window.addEventListener('pullRequestsUpdated', function(event) {
    const count = event.detail?.count;
    if (typeof count === 'number') {
      updatePrBadgeUI(count, false);
    } else {
      loadPrBadge();
    }
  });

  // Chequeo periódico de respaldo en el frontend cada 3 minutos
  setInterval(() => {
    loadPrBadge();
  }, 180000);
})();

(function () {
  'use strict';

  const refreshBtn = document.getElementById('refreshPrsBtn');
  const roleButtons = document.querySelectorAll('.pr-role-btn');
  const searchInput = document.getElementById('prSearchInput');
  const providerSelect = document.getElementById('prProviderSelect');
  const projectSelect = document.getElementById('prProjectSelect');
  const feedback = document.getElementById('prFeedback');
  const prList = document.getElementById('prList');
  const emptyState = document.getElementById('prEmptyState');

  const countAll = document.getElementById('countAll');
  const countReviewer = document.getElementById('countReviewer');
  const countAuthor = document.getElementById('countAuthor');
  const countAssignee = document.getElementById('countAssignee');

  let allPrs = [];
  let currentRole = 'all';

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

  const formatDate = value => {
    if (!value) return '—';
    try {
      const date = new Date(value);
      const now = new Date();
      const diffMs = now - date;
      const diffMins = Math.floor(diffMs / (1000 * 60));
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffMins < 60) return `hace ${Math.max(1, diffMins)}m`;
      if (diffHours < 24) return `hace ${diffHours}h`;
      if (diffDays < 7) return `hace ${diffDays}d`;
      return new Intl.DateTimeFormat('es-ES', { dateStyle: 'short' }).format(date);
    } catch (_) {
      return '—';
    }
  };

  const providerIcon = provider => provider === 'gitlab'
    ? `<svg class="issue-provider-icon issue-provider-icon--gitlab" viewBox="0 0 36 36" width="16" height="16" aria-label="GitLab"><path d="M18 32.2 30.5 18 25.6 4.7H10.4L5.5 18 18 32.2Z" fill="currentColor"/><path d="m10.4 4.7 3.2 13.1L18 32.2l4.4-14.4 3.2-13.1" fill="none" stroke="var(--bg-secondary)" stroke-width="1.8" stroke-linejoin="round"/></svg>`
    : `<svg class="issue-provider-icon issue-provider-icon--github" viewBox="0 0 16 16" width="16" height="16" aria-label="GitHub"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.49c-2.01.44-2.43-.85-2.43-.85-.33-.84-.81-1.06-.81-1.06-.66-.46.05-.45.05-.45.73.05 1.12.75 1.12.75.65 1.11 1.7.79 2.11.6.07-.47.25-.79.46-.97-1.61-.18-3.3-.8-3.3-3.59 0-.79.28-1.44.75-1.95-.08-.18-.33-.92.07-1.93 0 0 .61-.2 2 .75A6.9 6.9 0 0 1 8 4.8c.61 0 1.22.08 1.79.24 1.39-.95 2-.75 2-.75.4 1.01.15 1.75.07 1.93.47.51.75 1.16.75 1.95 0 2.8-1.7 3.41-3.31 3.59.26.22.49.65.49 1.31v1.94c0 .21.14.45.55.38A8 8 0 0 0 8 0Z"/></svg>`;

  const avatarMarkup = (url, name = '', size = 18, className = '') => {
    const initial = (name || '?').trim().charAt(0).toUpperCase();
    const titleAttr = name ? ` title="${escapeHtml(name)}"` : '';
    const classAttr = className ? ` ${className}` : '';
    if (url) {
      return `<span class="issue-avatar-wrapper${classAttr}" style="--avatar-size: ${size}px;"${titleAttr}><img class="issue-user-avatar" src="${escapeHtml(url)}" alt="${escapeHtml(name)}" width="${size}" height="${size}" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex';"><span class="issue-user-avatar-fallback" style="display:none;width:${size}px;height:${size}px;font-size:${Math.max(10, Math.floor(size * 0.55))}px;">${escapeHtml(initial)}</span></span>`;
    }
    if (name) {
      return `<span class="issue-avatar-wrapper${classAttr}" style="--avatar-size: ${size}px;"${titleAttr}><span class="issue-user-avatar-fallback" style="width:${size}px;height:${size}px;font-size:${Math.max(10, Math.floor(size * 0.55))}px;">${escapeHtml(initial)}</span></span>`;
    }
    return '';
  };

  function updateRoleCounts() {
    const revCount = allPrs.filter(p => p.isReviewer).length;
    const authCount = allPrs.filter(p => p.isAuthor).length;
    const assCount = allPrs.filter(p => p.isAssignee).length;

    if (countAll) countAll.textContent = allPrs.length;
    if (countReviewer) countReviewer.textContent = revCount;
    if (countAuthor) countAuthor.textContent = authCount;
    if (countAssignee) countAssignee.textContent = assCount;
  }

  function populateProjectsFilter() {
    const current = projectSelect.value;
    const projects = [...new Set(allPrs.map(p => p.project).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
    projectSelect.innerHTML = '<option value="all">Todos los proyectos</option>' +
      projects.map(proj => `<option value="${escapeHtml(proj)}">${escapeHtml(proj)}</option>`).join('');
    if (projects.includes(current)) {
      projectSelect.value = current;
    }
  }

  function getVisiblePrs() {
    const needle = (searchInput?.value || '').trim().toLowerCase();
    const selectedProvider = providerSelect?.value || 'all';
    const selectedProject = projectSelect?.value || 'all';

    return allPrs.filter(pr => {
      if (selectedProvider !== 'all' && pr.provider !== selectedProvider) return false;
      if (selectedProject !== 'all' && pr.project !== selectedProject) return false;

      if (currentRole === 'reviewer' && !pr.isReviewer) return false;
      if (currentRole === 'author' && !pr.isAuthor) return false;
      if (currentRole === 'assignee' && !pr.isAssignee) return false;

      if (needle) {
        const haystack = [
          String(pr.id),
          pr.title,
          pr.project,
          pr.author,
          pr.assignees,
          pr.reviewers,
          pr.sourceBranch,
          pr.targetBranch
        ].join(' ').toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      return true;
    });
  }

  function renderPrs() {
    const visible = getVisiblePrs();

    if (!allPrs.length) {
      prList.innerHTML = '';
      emptyState.style.display = 'flex';
      feedback.textContent = 'No hay Pull Requests o Merge Requests abiertas con tus cuentas conectadas.';
      feedback.className = 'issues-feedback';
      return;
    }

    emptyState.style.display = 'none';
    feedback.textContent = `${visible.length} de ${allPrs.length} PRs / MRs abiertas.`;
    feedback.className = 'issues-feedback';

    if (!visible.length) {
      prList.innerHTML = '<div class="issues-feedback" style="text-align:center; padding: 2rem;">No hay PRs/MRs que coincidan con los filtros seleccionados.</div>';
      return;
    }

    prList.innerHTML = visible.map(pr => {
      const isGitLab = pr.provider === 'gitlab';
      const idPrefix = isGitLab ? '!' : '#';

      // Role badges (indicadores de participación del usuario conectado con SVG)
      const roleBadges = [];
      if (pr.isReviewer) roleBadges.push(`<span class="pr-role-badge pr-role-badge--reviewer" title="Eres revisor solicitado">${ICONS.reviewer} Reviewer</span>`);
      if (pr.isAuthor) roleBadges.push(`<span class="pr-role-badge pr-role-badge--author" title="Creada por ti">${ICONS.user} Autor</span>`);
      if (pr.isAssignee) roleBadges.push(`<span class="pr-role-badge pr-role-badge--assignee" title="Asignada a ti">${ICONS.assignee} Asignado</span>`);

      // Extra status badges con SVG
      const extraBadges = [];
      if (pr.draft) extraBadges.push(`<span class="pr-draft-badge" title="Borrador / Trabajo en curso">${ICONS.draft} Draft</span>`);
      if (pr.hasConflicts) extraBadges.push(`<span class="pr-conflict-badge" title="Tiene conflictos de merge">${ICONS.alert} Conflictos</span>`);

      // Branches markup (siempre visible en todas las PR/MR)
      let branchInner = '';
      if (pr.sourceBranch && pr.targetBranch) {
        branchInner = `
          <span class="pr-branch-name" title="Origen: ${escapeHtml(pr.sourceBranch)}">${escapeHtml(pr.sourceBranch)}</span>
          <span class="pr-branch-arrow">→</span>
          <span class="pr-branch-name" title="Destino: ${escapeHtml(pr.targetBranch)}">${escapeHtml(pr.targetBranch)}</span>
        `;
      } else if (pr.sourceBranch) {
        branchInner = `<span class="pr-branch-name" title="Rama: ${escapeHtml(pr.sourceBranch)}">${escapeHtml(pr.sourceBranch)}</span>`;
      } else if (pr.targetBranch) {
        branchInner = `<span class="pr-branch-arrow">→</span> <span class="pr-branch-name" title="Destino: ${escapeHtml(pr.targetBranch)}">${escapeHtml(pr.targetBranch)}</span>`;
      } else {
        branchInner = `<span class="pr-branch-name pr-branch-name--unknown">rama no disponible</span>`;
      }

      const branchHtml = `
        <span class="pr-branch-pill" title="Rama origen: ${escapeHtml(pr.sourceBranch || '—')} ➔ destino: ${escapeHtml(pr.targetBranch || '—')}">
          ${ICONS.gitBranch}
          ${branchInner}
        </span>
      `;

      // Comments markup con SVG
      const commentsHtml = pr.comments > 0 ? `
        <span class="pr-comments-pill" title="${pr.comments} comentarios">
          ${ICONS.comment}
          <span>${pr.comments}</span>
        </span>` : '';

      // People markup (formato idéntico a las tarjetas del Kanban: Autor, Reviewer y Asignado)
      const authorPill = pr.author ? `
        <div class="issue-card-person-pill" title="Autor: ${escapeHtml(pr.author)}">
          ${avatarMarkup(pr.authorAvatar, pr.author, 16, 'issue-card-avatar')}
          <span class="issue-card-person-name">${escapeHtml(pr.author)}</span>
        </div>` : `<span class="issue-card-unassigned">Desconocido</span>`;

      const authorRow = `
        <div class="issue-card-person-row">
          <span class="issue-card-role-badge issue-card-role-badge--reporter" title="Autor de la PR/MR">Autor</span>
          ${authorPill}
        </div>`;

      const reviewerList = (pr.reviewerDetails && pr.reviewerDetails.length)
        ? pr.reviewerDetails
        : (pr.reviewers ? pr.reviewers.split(', ').filter(Boolean).map(name => ({ name, avatar: '' })) : []);

      const reviewersRow = `
        <div class="issue-card-person-row">
          <span class="issue-card-role-badge issue-card-role-badge--reviewer" title="Revisores solicitados">${reviewerList.length > 1 ? 'Reviewers' : 'Reviewer'}</span>
          ${reviewerList.length ? `
            <div class="issue-card-assignees-group">
              ${reviewerList.map(r => `
                <div class="issue-card-person-pill" title="Reviewer: ${escapeHtml(r.name)}">
                  ${avatarMarkup(r.avatar, r.name, 16, 'issue-card-avatar')}
                  <span class="issue-card-person-name">${escapeHtml(r.name)}</span>
                </div>
              `).join('')}
            </div>
          ` : `<span class="issue-card-unassigned">Sin reviewers</span>`}
        </div>`;

      const assigneeList = (pr.assigneeDetails && pr.assigneeDetails.length)
        ? pr.assigneeDetails
        : (pr.assignees ? pr.assignees.split(', ').filter(Boolean).map(name => ({ name, avatar: '' })) : []);

      const assigneesRow = `
        <div class="issue-card-person-row">
          <span class="issue-card-role-badge issue-card-role-badge--assignee" title="Asignados">${assigneeList.length > 1 ? 'Asignados' : 'Asignado'}</span>
          ${assigneeList.length ? `
            <div class="issue-card-assignees-group">
              ${assigneeList.map(a => `
                <div class="issue-card-person-pill" title="Asignado: ${escapeHtml(a.name)}">
                  ${avatarMarkup(a.avatar, a.name, 16, 'issue-card-avatar')}
                  <span class="issue-card-person-name">${escapeHtml(a.name)}</span>
                </div>
              `).join('')}
            </div>
          ` : `<span class="issue-card-unassigned">Sin asignar</span>`}
        </div>`;

      const peopleHtml = `<div class="issue-card-people">${authorRow}${reviewersRow}${assigneesRow}</div>`;

      return `
        <article class="pr-card">
          <div class="pr-card-header">
            <div class="pr-card-header-left">
              <span class="issue-provider issue-provider-with-icon ${isGitLab ? 'issue-provider--gitlab' : ''}" style="margin: 0;">
                ${providerIcon(pr.provider)}
                <span>${isGitLab ? 'GitLab' : 'GitHub'}</span>
              </span>
              ${pr.project ? `<span class="pr-project-pill" title="${escapeHtml(pr.project)}">${escapeHtml(pr.project)}</span>` : ''}
              <div class="pr-role-badges">
                ${roleBadges.join('')}
                ${extraBadges.join('')}
              </div>
            </div>
            <div class="pr-card-header-right">
              <span title="Última actualización: ${escapeHtml(new Date(pr.updatedAt).toLocaleString('es-ES'))}">
                Actualizada ${formatDate(pr.updatedAt)}
              </span>
            </div>
          </div>

          <div class="pr-card-title-row">
            <span class="pr-number">${idPrefix}${escapeHtml(pr.id)}</span>
            <a class="pr-card-title external-link" href="${escapeHtml(pr.url)}" target="_blank" rel="noopener noreferrer">
              ${escapeHtml(pr.title)}
            </a>
          </div>

          <div class="pr-card-meta">
            ${branchHtml}
            ${commentsHtml}
          </div>

          ${peopleHtml}
        </article>
      `;
    }).join('');
  }

  async function loadPullRequests() {
    refreshBtn.disabled = true;
    refreshBtn.textContent = 'Consultando…';
    feedback.textContent = 'Consultando Pull Requests y Merge Requests abiertas…';
    feedback.className = 'issues-feedback';

    try {
      allPrs = await window.api.getExternalPullRequests();
      updateRoleCounts();
      populateProjectsFilter();
      renderPrs();

      // Notificar al sidebar para actualizar el badge de inmediato
      window.dispatchEvent(new CustomEvent('pullRequestsUpdated', { detail: { count: allPrs.length } }));
    } catch (err) {
      console.error('Error loading PRs:', err);
      feedback.textContent = err.message || 'No se pudieron consultar las Pull Requests.';
      feedback.className = 'issues-feedback issues-feedback--error';
    } finally {
      refreshBtn.disabled = false;
      refreshBtn.textContent = 'Actualizar PRs';
    }
  }

  // Event listeners
  refreshBtn.addEventListener('click', loadPullRequests);

  roleButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      roleButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentRole = btn.dataset.role || 'all';
      renderPrs();
    });
  });

  if (searchInput) searchInput.addEventListener('input', renderPrs);
  if (providerSelect) providerSelect.addEventListener('change', renderPrs);
  if (projectSelect) projectSelect.addEventListener('change', renderPrs);

  // Escuchar actualizaciones en segundo plano desde el proceso principal
  if (window.api && window.api.onPullRequestsUpdated) {
    window.api.onPullRequestsUpdated(data => {
      if (Array.isArray(data?.results)) {
        allPrs = data.results;
        updateRoleCounts();
        populateProjectsFilter();
        renderPrs();
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadPullRequests();
  });
})();


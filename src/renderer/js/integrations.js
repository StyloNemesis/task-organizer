(function () {
  'use strict';
  const providerSelect = document.getElementById('issueProvider');
  const refreshButton = document.getElementById('refreshIssues');
  const feedback = document.getElementById('issuesFeedback');
  const issuesList = document.getElementById('issuesList');
  const kanbanView = document.getElementById('issuesKanbanView');
  const tableView = document.getElementById('issuesTableView');
  const settingsModal = document.getElementById('issueSettingsModal');
  const filters = {
    search: document.getElementById('issueSearch'), project: document.getElementById('issueProjectFilter'),
    assignee: document.getElementById('issueAssigneeFilter'), label: document.getElementById('issueLabelFilter')
  };
  let connections = [];
  let allIssues = [];
  let labelRules = [];
  let availableIssueLabels = [];
  let currentView = 'table';
  let tableSort = { column: 'updatedAt', direction: 'desc' };
  const STATUS_COLUMNS = [
    { id: 'pending', label: 'Pendiente' }, { id: 'in_progress', label: 'En Curso' },
    { id: 'blocked', label: 'Bloqueado' }, { id: 'testing', label: 'Testing' }, { id: 'completed', label: 'Completada' }
  ];

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const formatDate = value => value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
  const unique = values => [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const labelName = label => typeof label === 'string' ? label : label.name;
  const labelColor = label => {
    const color = typeof label === 'string' ? '' : label.color;
    return /^#?[0-9a-f]{6}$/i.test(color || '') ? `#${String(color).replace('#', '')}` : '';
  };
  const labelMarkup = label => {
    const color = labelColor(label);
    return `<span${color ? ` style="--issue-label-color: ${color}" class="issue-label--colored"` : ''}>${escapeHtml(labelName(label))}</span>`;
  };
  const providerIcon = provider => provider === 'gitlab'
    ? `<svg class="issue-provider-icon issue-provider-icon--gitlab" viewBox="0 0 36 36" aria-label="GitLab"><path d="M18 32.2 30.5 18 25.6 4.7H10.4L5.5 18 18 32.2Z" fill="currentColor"/><path d="m10.4 4.7 3.2 13.1L18 32.2l4.4-14.4 3.2-13.1" fill="none" stroke="var(--bg-secondary)" stroke-width="1.8" stroke-linejoin="round"/></svg>`
    : `<svg class="issue-provider-icon issue-provider-icon--github" viewBox="0 0 16 16" aria-label="GitHub"><path fill="currentColor" d="M8 0a8 8 0 0 0-2.53 15.59c.4.07.55-.17.55-.38v-1.49c-2.01.44-2.43-.85-2.43-.85-.33-.84-.81-1.06-.81-1.06-.66-.46.05-.45.05-.45.73.05 1.12.75 1.12.75.65 1.11 1.7.79 2.11.6.07-.47.25-.79.46-.97-1.61-.18-3.3-.8-3.3-3.59 0-.79.28-1.44.75-1.95-.08-.18-.33-.92.07-1.93 0 0 .61-.2 2 .75A6.9 6.9 0 0 1 8 4.8c.61 0 1.22.08 1.79.24 1.39-.95 2-.75 2-.75.4 1.01.15 1.75.07 1.93.47.51.75 1.16.75 1.95 0 2.8-1.7 3.41-3.31 3.59.26.22.49.65.49 1.31v1.94c0 .21.14.45.55.38A8 8 0 0 0 8 0Z"/></svg>`;
  const avatarMarkup = (url, name = '', size = 20, className = '') => {
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
  const assigneesMarkup = issue => {
    if (issue.assigneeDetails && issue.assigneeDetails.length) {
      return `<div class="issue-assignees-cell">${issue.assigneeDetails.map(assignee => `
        <span class="issue-assignee-badge" title="${escapeHtml(assignee.name)}">
          ${avatarMarkup(assignee.avatar, assignee.name, 18, 'issue-assignee-avatar')}
          <span class="issue-assignee-name">${escapeHtml(assignee.name)}</span>
        </span>
      `).join('')}</div>`;
    }
    if (issue.assignees) {
      return `<span class="issue-assignee-text">${escapeHtml(issue.assignees)}</span>`;
    }
    return `<span class="issue-unassigned">Sin asignar</span>`;
  };
  const statusOptions = status => STATUS_COLUMNS.map(column => `<option value="${column.id}" ${status === column.id ? 'selected' : ''}>${column.label}</option>`).join('');

  function openSettings() { settingsModal.classList.add('active'); settingsModal.setAttribute('aria-hidden', 'false'); }
  function closeSettings() { settingsModal.classList.remove('active'); settingsModal.setAttribute('aria-hidden', 'true'); }

  async function loadConnections() {
    connections = await window.api.getIssueConnections();
    document.querySelectorAll('.integration-card').forEach(card => {
      const provider = card.dataset.provider;
      const connection = connections.find(item => item.provider === provider);
      const form = card.querySelector('form');
      form.projects.value = connection?.projects || '';
      form.scope.value = connection?.scope || 'assigned';
      if (provider === 'gitlab') form.baseUrl.value = connection?.base_url || '';
      form.token.value = ''; form.token.required = !connection;
      const status = card.querySelector('.connection-status');
      status.textContent = connection ? 'Conectado' : 'Sin conectar';
      status.classList.toggle('connection-status--active', Boolean(connection));
      card.querySelector('.disconnect-btn').hidden = !connection;
    });
    refreshProviderOptions();
  }

  function refreshProviderOptions() {
    const available = new Set(connections.map(item => item.provider));
    [...providerSelect.options].forEach(option => option.disabled = option.value === 'all' ? !available.size : !available.has(option.value));
    if (available.size) providerSelect.value = 'all';
  }

  function populateFilters() {
    const setOptions = (element, values, label) => {
      const selected = element.value;
      element.innerHTML = `<option value="">${label}</option>` + unique(values).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      element.value = [...element.options].some(option => option.value === selected) ? selected : '';
    };
    setOptions(filters.project, allIssues.map(issue => issue.project), 'Todos los proyectos');
    setOptions(filters.assignee, allIssues.flatMap(issue => issue.assignees ? issue.assignees.split(', ') : []), 'Cualquier responsable');
    setOptions(filters.label, [...availableIssueLabels.map(label => label.name), ...allIssues.flatMap(issue => issue.labels.map(labelName))], 'Todas las etiquetas');
  }

  async function loadLabelRules() {
    labelRules = await window.api.getExternalIssueLabelRules();
  }

  async function loadAvailableLabels() {
    if (!connections.length) { availableIssueLabels = []; return; }
    availableIssueLabels = await window.api.getExternalIssueLabels('all');
  }

  function getVisibleIssues() {
    const needle = filters.search.value.trim().toLocaleLowerCase('es');
    const selectedProvider = providerSelect?.value;
    return allIssues.filter(issue => {
      if (selectedProvider && selectedProvider !== 'all' && issue.provider !== selectedProvider) {
        return false;
      }
      const haystack = [issue.id, issue.title, issue.author, issue.assignees, issue.project, issue.milestone, ...issue.labels.map(labelName)].join(' ').toLocaleLowerCase('es');
      return (!needle || haystack.includes(needle)) && (!filters.project.value || issue.project === filters.project.value) &&
        (!filters.assignee.value || issue.assignees.split(', ').includes(filters.assignee.value)) && (!filters.label.value || issue.labels.some(label => labelName(label) === filters.label.value));
    });
  }

  function renderKanban(visible) {
    const labelsFromIssues = allIssues.flatMap(issue => issue.labels.map(label => ({ provider: issue.provider, name: labelName(label), color: labelColor(label) })));
    const labels = [...new Map([...availableIssueLabels, ...labelsFromIssues].map(label => [`${label.provider}:${label.name}`, label])).values()];
    kanbanView.innerHTML = STATUS_COLUMNS.map(column => {
      const cards = visible.filter(issue => issue.status === column.id);
      const selectors = labels.map(label => {
        const selected = labelRules.some(rule => rule.provider === label.provider && rule.label === label.name && rule.status === column.id);
        return `<label class="kanban-label-option"><input class="column-label-checkbox" type="checkbox" data-provider="${escapeHtml(label.provider)}" data-label="${escapeHtml(label.name)}" data-status="${column.id}" ${selected ? 'checked' : ''}><span class="issue-provider ${label.provider === 'gitlab' ? 'issue-provider--gitlab' : ''}">${label.provider === 'github' ? 'GitHub' : 'GitLab'}</span>${labelMarkup({ name: label.name, color: label.color })}</label>`;
      }).join('') || '<span class="field-hint">Actualiza las issues para ver etiquetas.</span>';
      return `<section class="issue-kanban-column" data-status="${column.id}"><header><h4>${column.label}</h4><div><span>${cards.length}</span><button class="kanban-column-settings" type="button" title="Configurar etiquetas" data-status="${column.id}">⚙</button></div></header><div class="kanban-column-rule-panel" hidden><p>Etiquetas que irán a esta columna:</p>${selectors}</div><div class="issue-kanban-cards" data-status="${column.id}">${cards.map(issue => {
        const reporterHtml = issue.author ? `
          <div class="issue-card-person-row">
            <span class="issue-card-role-badge issue-card-role-badge--reporter" title="Creador / Reporter de la issue">Reporter</span>
            <div class="issue-card-person-pill" title="Reporter: ${escapeHtml(issue.author)}">
              ${avatarMarkup(issue.authorAvatar, issue.author, 16, 'issue-card-avatar')}
              <span class="issue-card-person-name">${escapeHtml(issue.author)}</span>
            </div>
          </div>` : '';
        const assigneeList = (issue.assigneeDetails && issue.assigneeDetails.length)
          ? issue.assigneeDetails
          : (issue.assignees ? issue.assignees.split(', ').filter(Boolean).map(name => ({ name, avatar: '' })) : []);
        const assigneesHtml = `
          <div class="issue-card-person-row">
            <span class="issue-card-role-badge issue-card-role-badge--assignee" title="Asignados / Participantes de la issue">${assigneeList.length > 1 ? 'Asignados' : 'Asignado'}</span>
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
        const peopleHtml = `<div class="issue-card-people">${reporterHtml}${assigneesHtml}</div>`;
        return `<article class="issue-kanban-card"><a class="external-link" href="${escapeHtml(issue.url)}">#${escapeHtml(issue.id)} · ${escapeHtml(issue.title)}</a><small class="issue-card-project">${providerIcon(issue.provider)}${escapeHtml(issue.project)}</small><div class="issue-labels">${issue.labels.map(labelMarkup).join('')}</div>${peopleHtml}</article>`;
      }).join('')}</div></section>`;
    }).join('');
  }

  function sortIssues(issues, column, direction) {
    if (!column || !direction) return issues;
    const modifier = direction === 'desc' ? -1 : 1;

    return [...issues].sort((a, b) => {
      let valA, valB;
      switch (column) {
        case 'provider':
          valA = a.provider || '';
          valB = b.provider || '';
          return valA.localeCompare(valB, 'es') * modifier;

        case 'title':
          valA = a.title || '';
          valB = b.title || '';
          return valA.localeCompare(valB, 'es', { numeric: true, sensitivity: 'base' }) * modifier;

        case 'project':
          valA = a.project || '';
          valB = b.project || '';
          return valA.localeCompare(valB, 'es') * modifier;

        case 'assignees':
          valA = (a.assignees || '').trim();
          valB = (b.assignees || '').trim();
          if (!valA && valB) return 1;
          if (valA && !valB) return -1;
          if (!valA && !valB) return 0;
          return valA.localeCompare(valB, 'es') * modifier;

        case 'labels':
          valA = (a.labels || []).map(labelName).join(', ').trim();
          valB = (b.labels || []).map(labelName).join(', ').trim();
          if (!valA && valB) return 1;
          if (valA && !valB) return -1;
          if (!valA && !valB) return 0;
          return valA.localeCompare(valB, 'es') * modifier;

        case 'milestone':
          valA = (a.milestone || '').trim();
          valB = (b.milestone || '').trim();
          if (!valA && valB) return 1;
          if (valA && !valB) return -1;
          if (!valA && !valB) return 0;
          return valA.localeCompare(valB, 'es') * modifier;

        case 'comments':
          valA = Number(a.comments) || 0;
          valB = Number(b.comments) || 0;
          return (valA - valB) * modifier;

        case 'createdAt':
          valA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          valB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return (valA - valB) * modifier;

        case 'updatedAt':
        default:
          valA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          valB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return (valA - valB) * modifier;
      }
    });
  }

  function updateSortHeadersUI() {
    const table = document.querySelector('.issues-table');
    if (!table) return;
    table.querySelectorAll('th.sortable').forEach(th => {
      const col = th.dataset.sort;
      const icon = th.querySelector('.sort-icon');
      if (col === tableSort.column) {
        th.classList.add('sort-active');
        th.classList.toggle('sort-asc', tableSort.direction === 'asc');
        th.classList.toggle('sort-desc', tableSort.direction === 'desc');
        th.setAttribute('aria-sort', tableSort.direction === 'asc' ? 'ascending' : 'descending');
        if (icon) icon.textContent = tableSort.direction === 'asc' ? '↑' : '↓';
      } else {
        th.classList.remove('sort-active', 'sort-asc', 'sort-desc');
        th.setAttribute('aria-sort', 'none');
        if (icon) icon.textContent = '↕';
      }
    });
  }

  function handleTableSort(column) {
    if (tableSort.column === column) {
      if (tableSort.direction === 'asc') {
        tableSort.direction = 'desc';
      } else if (tableSort.direction === 'desc') {
        if (column !== 'updatedAt') {
          tableSort.column = 'updatedAt';
          tableSort.direction = 'desc';
        } else {
          tableSort.direction = 'asc';
        }
      }
    } else {
      tableSort.column = column;
      const defaultDesc = ['updatedAt', 'createdAt', 'comments'];
      tableSort.direction = defaultDesc.includes(column) ? 'desc' : 'asc';
    }
    updateSortHeadersUI();
    renderIssues();
  }

  function renderIssues() {
    const visible = getVisibleIssues();
    feedback.textContent = allIssues.length ? `${visible.length} de ${allIssues.length} issues abiertas.` : 'No hay issues abiertas para los filtros indicados.';
    const sortedForTable = sortIssues(visible, tableSort.column, tableSort.direction);
    issuesList.innerHTML = sortedForTable.map(issue => `<tr><td><span class="issue-provider issue-provider-with-icon ${issue.provider === 'gitlab' ? 'issue-provider--gitlab' : ''}">${providerIcon(issue.provider)}${issue.provider === 'github' ? 'GitHub' : 'GitLab'}</span></td><td><a class="issue-title external-link" href="${escapeHtml(issue.url)}">#${escapeHtml(issue.id)} · ${escapeHtml(issue.title)}</a><span class="issue-author">${avatarMarkup(issue.authorAvatar, issue.author, 18, 'issue-author-avatar')}<span class="issue-table-reporter-label">Reporter:</span> <span>${escapeHtml(issue.author || '—')}</span></span></td><td>${escapeHtml(issue.project)}</td><td>${assigneesMarkup(issue)}</td><td><div class="issue-labels">${issue.labels.length ? issue.labels.map(labelMarkup).join('') : '—'}</div></td><td>${escapeHtml(issue.milestone || '—')}</td><td>${escapeHtml(issue.comments)}</td><td>${escapeHtml(formatDate(issue.createdAt))}</td><td>${escapeHtml(formatDate(issue.updatedAt))}</td></tr>`).join('');
    renderKanban(visible);
  }

  async function changeIssueStatus({ provider, project, id }, status) {
    const issue = allIssues.find(item => item.provider === provider && item.project === project && String(item.id) === String(id));
    if (!issue || issue.status === status) return;
    const previousStatus = issue.status;
    issue.status = status;
    renderIssues();
    try { await window.api.saveExternalIssueStatus({ provider, project, id, status }); }
    catch (error) { issue.status = previousStatus; renderIssues(); feedback.textContent = error.message || 'No se pudo guardar el estado.'; feedback.className = 'issues-feedback issues-feedback--error'; }
  }

  async function loadAllIssues() {
    if (!connections.length) return;
    refreshButton.disabled = true; refreshButton.textContent = 'Consultando…'; feedback.textContent = 'Consultando issues abiertas…'; feedback.className = 'issues-feedback';
    try { const [issues] = await Promise.all([window.api.getExternalIssues(providerSelect?.value || 'all'), loadAvailableLabels()]); allIssues = issues; populateFilters(); renderIssues(); }
    catch (error) { feedback.textContent = error.message || 'No se pudieron cargar las issues.'; feedback.className = 'issues-feedback issues-feedback--error'; }
    finally { refreshButton.disabled = false; refreshButton.textContent = 'Actualizar issues'; }
  }

  document.getElementById('openIssueSettings').addEventListener('click', openSettings);
  document.getElementById('closeIssueSettings').addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', event => { if (event.target === settingsModal) closeSettings(); });
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeSettings(); });
  Object.values(filters).forEach(filter => filter.addEventListener(filter === filters.search ? 'input' : 'change', renderIssues));
  if (providerSelect) providerSelect.addEventListener('change', renderIssues);
  document.querySelectorAll('.issue-view-btn').forEach(button => button.addEventListener('click', () => {
    currentView = button.dataset.view;
    tableView.hidden = currentView !== 'table';
    kanbanView.hidden = currentView !== 'kanban';
    document.querySelectorAll('.issue-view-btn').forEach(item => item.classList.toggle('active', item === button));
  }));
  kanbanView.addEventListener('click', event => {
    const button = event.target.closest('.kanban-column-settings');
    if (!button) return;
    const panel = button.closest('.issue-kanban-column').querySelector('.kanban-column-rule-panel');
    panel.hidden = !panel.hidden;
  });
  kanbanView.addEventListener('change', async event => {
    const checkbox = event.target.closest('.column-label-checkbox');
    if (!checkbox) return;
    try {
      if (checkbox.checked) await window.api.saveExternalIssueLabelRule({ provider: checkbox.dataset.provider, label: checkbox.dataset.label, status: checkbox.dataset.status });
      else await window.api.deleteExternalIssueLabelRule(checkbox.dataset.provider, checkbox.dataset.label);
      await loadLabelRules();
      await loadAllIssues();
    } catch (error) { feedback.textContent = error.message || 'No se pudo guardar la etiqueta.'; feedback.className = 'issues-feedback issues-feedback--error'; }
  });

  document.querySelectorAll('.integration-form').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const provider = form.closest('.integration-card').dataset.provider;
    const existing = connections.find(item => item.provider === provider);
    const token = form.token.value.trim();
    if (!token && !existing) return;
    const submit = form.querySelector('[type="submit"]'); submit.disabled = true; submit.textContent = 'Guardando…';
    try {
      await window.api.saveIssueConnection({ provider, token, projects: form.projects.value, scope: form.scope.value, baseUrl: form.baseUrl?.value });
      feedback.textContent = `${provider === 'github' ? 'GitHub' : 'GitLab'} conectado correctamente.`; feedback.className = 'issues-feedback issues-feedback--success';
      await loadConnections();
      await loadAvailableLabels();
    } catch (error) { feedback.textContent = error.message || 'No se pudo guardar la conexión.'; feedback.className = 'issues-feedback issues-feedback--error'; }
    finally { submit.disabled = false; submit.textContent = 'Guardar conexión'; }
  }));

  const webSessionBtn = document.getElementById('openGitLabWebSession');
  if (webSessionBtn) {
    webSessionBtn.addEventListener('click', async () => {
      const form = webSessionBtn.closest('form');
      const baseUrl = form?.baseUrl?.value?.trim() || '';
      webSessionBtn.disabled = true;
      webSessionBtn.textContent = 'Abriendo…';
      try {
        const result = await window.api.openGitLabWebLogin(baseUrl);
        if (result?.success) {
          feedback.textContent = 'Sesión web vinculada con éxito. Actualizando avatares…';
          feedback.className = 'issues-feedback issues-feedback--success';
        } else {
          feedback.textContent = 'Ventana de sesión cerrada. Comprobando avatares…';
          feedback.className = 'issues-feedback';
        }
        await loadAllIssues();
      } catch (error) {
        feedback.textContent = error.message || 'No se pudo abrir la sesión web de GitLab.';
        feedback.className = 'issues-feedback issues-feedback--error';
      } finally {
        webSessionBtn.disabled = false;
        webSessionBtn.textContent = 'Sesión web (Avatares)';
      }
    });
  }

  document.querySelectorAll('.disconnect-btn').forEach(button => button.addEventListener('click', async () => {
    const provider = button.closest('.integration-card').dataset.provider;
    if (!confirm(`¿Desconectar ${provider === 'github' ? 'GitHub' : 'GitLab'}? Se eliminará el token guardado.`)) return;
    await window.api.deleteIssueConnection(provider); allIssues = []; issuesList.innerHTML = '';
    feedback.textContent = 'Conexión eliminada.'; feedback.className = 'issues-feedback'; await loadConnections();
  }));

  refreshButton.addEventListener('click', async () => {
    const provider = providerSelect.value;
    refreshButton.disabled = true; refreshButton.textContent = 'Consultando…'; feedback.textContent = 'Consultando issues abiertas…'; feedback.className = 'issues-feedback';
    try { const [issues] = await Promise.all([window.api.getExternalIssues(provider), loadAvailableLabels()]); allIssues = issues; populateFilters(); renderIssues(); }
    catch (error) { feedback.textContent = error.message || 'No se pudieron cargar las issues.'; feedback.className = 'issues-feedback issues-feedback--error'; }
    finally { refreshButton.disabled = false; refreshButton.textContent = 'Actualizar issues'; }
  });

  document.querySelectorAll('.issues-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (col) handleTableSort(col);
    });
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      updateSortHeadersUI();
      await loadConnections();
      await loadLabelRules();
      await loadAllIssues();
    } catch (error) { feedback.textContent = error.message || 'No se pudieron cargar las conexiones.'; feedback.className = 'issues-feedback issues-feedback--error'; }
  });
})();

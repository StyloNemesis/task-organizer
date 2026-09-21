(function () {
  'use strict';
  const providerSelect = document.getElementById('issueProvider');
  const refreshButton = document.getElementById('refreshIssues');
  const feedback = document.getElementById('issuesFeedback');
  const issuesList = document.getElementById('issuesList');
  const kanbanView = document.getElementById('issuesKanbanView');
  const tableView = document.getElementById('issuesTableView');
  const myIssuesBtn = document.getElementById('filterMyIssuesBtn');
  const settingsModal = document.getElementById('issueSettingsModal');
  const exportModal = document.getElementById('exportIssuesModal');
  const openExportBtn = document.getElementById('openExportIssuesModal');
  const closeExportBtn = document.getElementById('closeExportIssues');
  const cancelExportBtn = document.getElementById('cancelExportIssues');
  const exportForm = document.getElementById('exportIssuesForm');
  const exportSvgLayoutGroup = document.getElementById('exportSvgLayoutGroup');
  const exportScopeVisibleLabel = document.getElementById('exportScopeVisibleLabel');
  const exportScopeAllLabel = document.getElementById('exportScopeAllLabel');
  const filters = {
    search: document.getElementById('issueSearch'),
    project: document.getElementById('issueProjectFilter'),
    milestone: document.getElementById('issueMilestoneFilter'),
    label: document.getElementById('issueLabelFilter')
  };
  const assigneeMultiSelect = document.getElementById('issueAssigneeMultiSelect');
  const assigneeToggle = document.getElementById('issueAssigneeToggle');
  const assigneeLabel = document.getElementById('issueAssigneeLabel');
  const assigneeBadge = document.getElementById('issueAssigneeBadge');
  const assigneeClearBtn = document.getElementById('issueAssigneeClearBtn');
  const assigneeDropdown = document.getElementById('issueAssigneeDropdown');
  const assigneeSearch = document.getElementById('issueAssigneeSearch');
  const assigneeSelectAllBtn = document.getElementById('issueAssigneeSelectAll');
  const assigneeClearAllBtn = document.getElementById('issueAssigneeClearAll');
  const assigneeOptions = document.getElementById('issueAssigneeOptions');
  const selectedAssignees = new Set();
  const issueContextMenu = document.getElementById('issueContextMenu');
  const contextCopyIssueLink = document.getElementById('contextCopyIssueLink');
  const contextOpenIssueBrowser = document.getElementById('contextOpenIssueBrowser');
  const issueToast = document.getElementById('issueToast');
  const issueToastText = document.getElementById('issueToastText');
  let activeContextIssue = null;
  let toastTimeout = null;
  let connections = [];
  let allIssues = [];
  let labelRules = [];
  let availableIssueLabels = [];
  let currentView = 'table';
  let filterOnlyMyIssues = false;
  let tableSort = { column: 'updatedAt', direction: 'desc' };
  const STATUS_COLUMNS = [
    { id: 'pending', label: 'Pendiente' }, { id: 'in_progress', label: 'En Curso' },
    { id: 'blocked', label: 'Bloqueado' }, { id: 'pending_deployment', label: 'Pendiente despliegue' },
    { id: 'testing', label: 'Testing' }, { id: 'completed', label: 'Completada' }
  ];

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
  const formatDate = value => value ? new Intl.DateTimeFormat('es-ES', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
  const formatDueDate = value => {
    if (!value) return '';
    try {
      const d = new Date(value);
      return isNaN(d.getTime()) ? '' : new Intl.DateTimeFormat('es-ES', { dateStyle: 'medium' }).format(d);
    } catch (_) {
      return '';
    }
  };
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

  function showToast(message) {
    if (!issueToast || !issueToastText) return;
    issueToastText.textContent = message;
    issueToast.hidden = false;
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
      issueToast.hidden = true;
    }, 2500);
  }

  function hideIssueContextMenu() {
    if (!issueContextMenu || issueContextMenu.hidden) return;
    issueContextMenu.hidden = true;
    activeContextIssue = null;
  }

  function showIssueContextMenu(x, y, issueData) {
    if (!issueContextMenu) return;
    activeContextIssue = issueData;
    issueContextMenu.hidden = false;

    const menuWidth = 210;
    const menuHeight = 85;
    const padding = 10;
    let posX = x;
    let posY = y;

    if (posX + menuWidth > window.innerWidth - padding) {
      posX = Math.max(padding, x - menuWidth);
    }
    if (posY + menuHeight > window.innerHeight - padding) {
      posY = Math.max(padding, y - menuHeight);
    }

    issueContextMenu.style.left = `${posX}px`;
    issueContextMenu.style.top = `${posY}px`;

    setTimeout(() => contextCopyIssueLink?.focus(), 20);
  }

  async function copyActiveIssueLink() {
    if (!activeContextIssue || !activeContextIssue.url) {
      hideIssueContextMenu();
      return;
    }
    const { url, id } = activeContextIssue;
    hideIssueContextMenu();

    let copied = false;
    try {
      if (window.api && window.api.copyToClipboard) {
        await window.api.copyToClipboard(url);
        copied = true;
      }
    } catch (e) {
      console.warn('Error with window.api.copyToClipboard:', e);
    }

    if (!copied && navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch (e) {
        console.warn('Error with navigator.clipboard:', e);
      }
    }

    if (!copied) {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      copied = document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    if (copied) {
      showToast(id ? `Enlace de la issue #${id} copiado al portapapeles` : 'Enlace copiado al portapapeles');
    }
  }

  function openActiveIssueInBrowser() {
    if (!activeContextIssue || !activeContextIssue.url) {
      hideIssueContextMenu();
      return;
    }
    const url = activeContextIssue.url;
    hideIssueContextMenu();
    if (window.api && window.api.openExternal) {
      window.api.openExternal(url);
    } else {
      window.open(url, '_blank');
    }
  }

  function handleIssueContextMenu(event) {
    const target = event.target.closest('[data-issue-url]');
    if (!target) return;
    const url = target.dataset.issueUrl;
    if (!url) return;

    event.preventDefault();
    event.stopPropagation();
    showIssueContextMenu(event.clientX, event.clientY, {
      url,
      id: target.dataset.issueId || '',
      title: target.dataset.issueTitle || ''
    });
  }

  function updateExportFormatUI() {
    if (!exportForm) return;
    const selectedFormat = exportForm.exportFormat?.value || 'xlsx';
    if (exportSvgLayoutGroup) {
      exportSvgLayoutGroup.style.display = selectedFormat === 'svg' ? 'block' : 'none';
    }
    exportForm.querySelectorAll('.export-format-card').forEach(card => {
      const radio = card.querySelector('input[name="exportFormat"]');
      card.classList.toggle('active', Boolean(radio && radio.checked));
    });
  }

  function openExportModal() {
    if (!exportModal) return;
    const visible = getVisibleIssues();
    if (exportScopeVisibleLabel) {
      exportScopeVisibleLabel.textContent = `Issues visibles según filtros actuales (${visible.length})`;
    }
    if (exportScopeAllLabel) {
      exportScopeAllLabel.textContent = `Todas las issues abiertas cargadas (${allIssues.length})`;
    }

    const kanbanRadio = exportForm?.querySelector('input[name="exportSvgLayout"][value="kanban"]');
    const tableRadio = exportForm?.querySelector('input[name="exportSvgLayout"][value="table"]');
    if (currentView === 'kanban') {
      if (kanbanRadio) kanbanRadio.checked = true;
    } else {
      if (tableRadio) tableRadio.checked = true;
    }

    updateExportFormatUI();
    exportModal.classList.add('active');
    exportModal.setAttribute('aria-hidden', 'false');
  }

  function closeExportModal() {
    if (!exportModal) return;
    exportModal.classList.remove('active');
    exportModal.setAttribute('aria-hidden', 'true');
  }

  async function loadConnections() {
    connections = await window.api.getIssueConnections();
    document.querySelectorAll('.integration-card').forEach(card => {
      const provider = card.dataset.provider;
      const connection = connections.find(item => item.provider === provider);
      const form = card.querySelector('form');
      form.projects.value = connection?.projects || '';
      form.scope.value = connection?.scope || 'assigned';
      if (form.username) form.username.value = connection?.username || '';
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

  function getAssigneeData() {
    const map = new Map();
    let unassignedCount = 0;

    for (const issue of allIssues) {
      let hasAssignee = false;
      if (issue.assigneeDetails && issue.assigneeDetails.length > 0) {
        hasAssignee = true;
        for (const a of issue.assigneeDetails) {
          const name = (a.name || '').trim();
          if (!name) continue;
          const entry = map.get(name) || { name, avatar: a.avatar || '', count: 0 };
          if (!entry.avatar && a.avatar) entry.avatar = a.avatar;
          entry.count += 1;
          map.set(name, entry);
        }
      } else if (issue.assignees && issue.assignees.trim()) {
        hasAssignee = true;
        const names = issue.assignees.split(',').map(s => s.trim()).filter(Boolean);
        for (const name of names) {
          const entry = map.get(name) || { name, avatar: '', count: 0 };
          entry.count += 1;
          map.set(name, entry);
        }
      }

      if (!hasAssignee) {
        unassignedCount += 1;
      }
    }

    const list = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    return { list, unassignedCount };
  }

  function updateAssigneeToggleUI() {
    if (!assigneeLabel) return;
    const count = selectedAssignees.size;
    if (count === 0) {
      assigneeLabel.textContent = 'Cualquier responsable';
      if (assigneeBadge) assigneeBadge.hidden = true;
      if (assigneeClearBtn) assigneeClearBtn.hidden = true;
      if (assigneeToggle) assigneeToggle.title = 'Filtrar por responsable';
    } else if (count === 1) {
      const single = [...selectedAssignees][0];
      const displayName = single === '__unassigned__' ? 'Sin asignar' : single;
      assigneeLabel.textContent = displayName;
      if (assigneeBadge) assigneeBadge.hidden = true;
      if (assigneeClearBtn) assigneeClearBtn.hidden = false;
      if (assigneeToggle) assigneeToggle.title = `Responsable: ${displayName}`;
    } else {
      assigneeLabel.textContent = `${count} responsables`;
      if (assigneeBadge) {
        assigneeBadge.textContent = String(count);
        assigneeBadge.hidden = false;
      }
      if (assigneeClearBtn) assigneeClearBtn.hidden = false;
      const namesList = [...selectedAssignees].map(n => n === '__unassigned__' ? 'Sin asignar' : n).join(', ');
      if (assigneeToggle) assigneeToggle.title = `Responsables: ${namesList}`;
    }
  }

  function populateAssigneeFilter() {
    if (!assigneeOptions) return;
    const { list, unassignedCount } = getAssigneeData();

    // Prune selections that no longer exist
    const validNames = new Set(list.map(item => item.name));
    if (unassignedCount > 0) validNames.add('__unassigned__');
    for (const name of selectedAssignees) {
      if (!validNames.has(name)) {
        selectedAssignees.delete(name);
      }
    }

    if (!list.length && !unassignedCount) {
      assigneeOptions.innerHTML = '<div class="custom-multiselect-empty">No hay responsables</div>';
      updateAssigneeToggleUI();
      return;
    }

    let html = '';
    if (unassignedCount > 0) {
      const isSelected = selectedAssignees.has('__unassigned__');
      html += `
        <label class="custom-multiselect-item ${isSelected ? 'is-selected' : ''}" data-name="sin asignar">
          <input type="checkbox" class="custom-multiselect-checkbox" value="__unassigned__" ${isSelected ? 'checked' : ''}>
          <span class="issue-avatar-wrapper" style="--avatar-size: 18px;">
            <span class="issue-user-avatar-fallback" style="width:18px;height:18px;font-size:10px;">—</span>
          </span>
          <span class="custom-multiselect-name">Sin asignar</span>
          <span class="custom-multiselect-count">${unassignedCount}</span>
        </label>
      `;
    }

    for (const item of list) {
      const isSelected = selectedAssignees.has(item.name);
      html += `
        <label class="custom-multiselect-item ${isSelected ? 'is-selected' : ''}" data-name="${escapeHtml(item.name)}">
          <input type="checkbox" class="custom-multiselect-checkbox" value="${escapeHtml(item.name)}" ${isSelected ? 'checked' : ''}>
          ${avatarMarkup(item.avatar, item.name, 18, 'issue-assignee-avatar')}
          <span class="custom-multiselect-name">${escapeHtml(item.name)}</span>
          <span class="custom-multiselect-count">${item.count}</span>
        </label>
      `;
    }

    assigneeOptions.innerHTML = html;
    updateAssigneeToggleUI();
  }

  function openAssigneeDropdown() {
    if (!assigneeDropdown) return;
    assigneeDropdown.hidden = false;
    assigneeToggle?.setAttribute('aria-expanded', 'true');
    if (assigneeSearch) {
      assigneeSearch.value = '';
      filterAssigneeOptions('');
      setTimeout(() => assigneeSearch.focus(), 40);
    }
  }

  function closeAssigneeDropdown() {
    if (!assigneeDropdown || assigneeDropdown.hidden) return;
    assigneeDropdown.hidden = true;
    assigneeToggle?.setAttribute('aria-expanded', 'false');
  }

  function toggleAssigneeDropdown() {
    if (!assigneeDropdown) return;
    if (assigneeDropdown.hidden) {
      openAssigneeDropdown();
    } else {
      closeAssigneeDropdown();
    }
  }

  function clearAllAssignees() {
    selectedAssignees.clear();
    const items = assigneeOptions?.querySelectorAll('.custom-multiselect-item') || [];
    items.forEach(item => {
      item.classList.remove('is-selected');
      const cb = item.querySelector('.custom-multiselect-checkbox');
      if (cb) cb.checked = false;
    });
    updateAssigneeToggleUI();
    renderIssues();
  }

  function filterAssigneeOptions(query) {
    if (!assigneeOptions) return;
    const q = query.trim().toLocaleLowerCase('es');
    const items = assigneeOptions.querySelectorAll('.custom-multiselect-item');
    let visibleCount = 0;
    items.forEach(item => {
      const name = (item.dataset.name || '').toLocaleLowerCase('es');
      const matches = !q || name.includes(q);
      item.style.display = matches ? 'flex' : 'none';
      if (matches) visibleCount++;
    });
    let emptyMsg = assigneeOptions.querySelector('.custom-multiselect-search-empty');
    if (visibleCount === 0) {
      if (!emptyMsg) {
        emptyMsg = document.createElement('div');
        emptyMsg.className = 'custom-multiselect-empty custom-multiselect-search-empty';
        emptyMsg.textContent = 'No se encontraron responsables';
        assigneeOptions.appendChild(emptyMsg);
      }
      emptyMsg.style.display = 'block';
    } else if (emptyMsg) {
      emptyMsg.style.display = 'none';
    }
  }

  function populateFilters() {
    const setOptions = (element, values, label) => {
      const selected = element.value;
      element.innerHTML = `<option value="">${label}</option>` + unique(values).map(value => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('');
      element.value = [...element.options].some(option => option.value === selected) ? selected : '';
    };
    setOptions(filters.project, allIssues.map(issue => issue.project), 'Todos los proyectos');
    populateAssigneeFilter();

    if (filters.milestone) {
      const selectedMilestone = filters.milestone.value;
      const milestones = unique(allIssues.map(issue => (issue.milestone || '').trim()).filter(Boolean));
      const hasUnassignedMilestone = allIssues.some(issue => !(issue.milestone || '').trim());
      let optionsHtml = '<option value="">Todos los milestones</option>';
      if (hasUnassignedMilestone) {
        optionsHtml += '<option value="__none__">Sin milestone</option>';
      }
      optionsHtml += milestones.map(m => `<option value="${escapeHtml(m)}">${escapeHtml(m)}</option>`).join('');
      filters.milestone.innerHTML = optionsHtml;
      filters.milestone.value = [...filters.milestone.options].some(opt => opt.value === selectedMilestone) ? selectedMilestone : '';
    }

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
    const myUserNames = [...new Set([
      ...allIssues.map(i => i.currentUser).filter(Boolean),
      ...connections.map(c => c.username).filter(Boolean)
    ])].map(u => u.toLowerCase().trim()).filter(Boolean);

    return allIssues.filter(issue => {
      if (selectedProvider && selectedProvider !== 'all' && issue.provider !== selectedProvider) {
        return false;
      }
      if (filterOnlyMyIssues) {
        const isAssigned = Boolean(
          issue.isAssignedToMe ||
          (issue.assigneeDetails && issue.assigneeDetails.some(a => myUserNames.some(u => (a.name || '').toLowerCase().trim() === u))) ||
          (issue.assignees && issue.assignees.split(', ').some(a => myUserNames.some(u => a.toLowerCase().trim() === u)))
        );

        const isAuthorUnassigned = Boolean(
          !issue.assignees && (
            issue.isAuthorMe ||
            myUserNames.some(u => (issue.author || '').toLowerCase().trim() === u)
          )
        );

        if (!isAssigned && !isAuthorUnassigned) return false;
      }

      if (selectedAssignees.size > 0) {
        const issueAssigneeList = (issue.assigneeDetails && issue.assigneeDetails.length)
          ? issue.assigneeDetails.map(a => (a.name || '').trim()).filter(Boolean)
          : (issue.assignees ? issue.assignees.split(',').map(s => s.trim()).filter(Boolean) : []);

        const matchesSelected = issueAssigneeList.some(name => selectedAssignees.has(name));
        const matchesUnassigned = selectedAssignees.has('__unassigned__') && issueAssigneeList.length === 0;
        if (!matchesSelected && !matchesUnassigned) return false;
      }

      const issueMilestone = (issue.milestone || '').trim();
      if (filters.milestone?.value) {
        if (filters.milestone.value === '__none__') {
          if (issueMilestone) return false;
        } else if (issueMilestone !== filters.milestone.value) {
          return false;
        }
      }

      const haystack = [issue.id, issue.title, issue.author, issue.assignees, issue.project, issue.milestone, ...issue.labels.map(labelName)].join(' ').toLocaleLowerCase('es');
      return (!needle || haystack.includes(needle)) && (!filters.project.value || issue.project === filters.project.value) &&
        (!filters.label.value || issue.labels.some(label => labelName(label) === filters.label.value));
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
        const milestoneText = (typeof issue.milestone === 'string' ? issue.milestone : (issue.milestone?.title || '')).trim();
        const dueDateStr = formatDueDate(issue.dueDate);
        const milestoneHtml = milestoneText ? `
          <span class="issue-card-milestone" title="Milestone: ${escapeHtml(milestoneText)}${dueDateStr ? ` (Vence: ${escapeHtml(dueDateStr)})` : ''}">
            <svg class="issue-card-milestone-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M7.75 0a.75.75 0 0 1 .75.75V3h3.634a1.75 1.75 0 0 1 1.516.876l2.124 3.67a1.75 1.75 0 0 1 0 1.758l-2.124 3.67A1.75 1.75 0 0 1 12.134 14H8.5v1.25a.75.75 0 0 1-1.5 0V14H2.75A1.75 1.75 0 0 1 1 12.25v-8.5C1 2.784 1.784 2 2.75 2H7V.75A.75.75 0 0 1 7.75 0zm.75 4.5v8h3.634a.25.25 0 0 0 .216-.125l2.124-3.67a.25.25 0 0 0 0-.251l-2.124-3.67a.25.25 0 0 0-.216-.125H8.5zM7 3.5H2.75a.25.25 0 0 0-.25.25v8.5c0 .138.112.25.25.25H7V3.5z"/></svg>
            <span class="issue-card-milestone-text">${escapeHtml(milestoneText)}</span>
          </span>` : '';
        return `<article class="issue-kanban-card" data-issue-url="${escapeHtml(issue.url)}" data-issue-id="${escapeHtml(issue.id)}" data-issue-title="${escapeHtml(issue.title)}"><a class="external-link" href="${escapeHtml(issue.url)}">#${escapeHtml(issue.id)} · ${escapeHtml(issue.title)}</a><div class="issue-card-meta"><small class="issue-card-project">${providerIcon(issue.provider)}${escapeHtml(issue.project)}</small>${milestoneHtml}</div><div class="issue-labels">${issue.labels.map(labelMarkup).join('')}</div>${peopleHtml}</article>`;
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

  function updateMyIssuesButtonUI() {
    if (!myIssuesBtn) return;
    myIssuesBtn.classList.toggle('active', filterOnlyMyIssues);
    myIssuesBtn.classList.toggle('btn-primary', filterOnlyMyIssues);
    myIssuesBtn.classList.toggle('btn-secondary', !filterOnlyMyIssues);
    myIssuesBtn.setAttribute('aria-pressed', filterOnlyMyIssues ? 'true' : 'false');

    const detectedUsers = [...new Set([
      ...allIssues.map(i => i.currentUser).filter(Boolean),
      ...connections.map(c => c.username).filter(Boolean)
    ])];
    if (detectedUsers.length) {
      const userList = detectedUsers.join(', ');
      myIssuesBtn.title = filterOnlyMyIssues
        ? `Mostrando solo tareas de ${userList}. Haz clic para mostrar todas.`
        : `Filtrar por tareas de mis usuarios (${userList})`;
    } else {
      myIssuesBtn.title = filterOnlyMyIssues
        ? 'Mostrando solo mis tareas. Haz clic para mostrar todas.'
        : 'Filtrar por mis tareas';
    }
  }

  function renderIssues() {
    const visible = getVisibleIssues();
    const myUserNames = [...new Set([
      ...allIssues.map(i => i.currentUser).filter(Boolean),
      ...connections.map(c => c.username).filter(Boolean)
    ])];

    if (filterOnlyMyIssues && allIssues.length && !visible.length && !myUserNames.length && !allIssues.some(i => i.isAssignedToMe)) {
      feedback.textContent = 'No se ha podido auto-detectar tu usuario con los tokens actuales. Por favor, escribe tu nombre de usuario en Configuración ⚙ para usar «Mis tareas».';
      feedback.className = 'issues-feedback issues-feedback--error';
    } else {
      feedback.textContent = allIssues.length ? `${visible.length} de ${allIssues.length} issues abiertas.` : 'No hay issues abiertas para los filtros indicados.';
      feedback.className = 'issues-feedback';
    }
    const sortedForTable = sortIssues(visible, tableSort.column, tableSort.direction);
    issuesList.innerHTML = sortedForTable.map(issue => `<tr data-issue-url="${escapeHtml(issue.url)}" data-issue-id="${escapeHtml(issue.id)}" data-issue-title="${escapeHtml(issue.title)}"><td><span class="issue-provider issue-provider-with-icon ${issue.provider === 'gitlab' ? 'issue-provider--gitlab' : ''}">${providerIcon(issue.provider)}${issue.provider === 'github' ? 'GitHub' : 'GitLab'}</span></td><td><a class="issue-title external-link" href="${escapeHtml(issue.url)}">#${escapeHtml(issue.id)} · ${escapeHtml(issue.title)}</a><span class="issue-author">${avatarMarkup(issue.authorAvatar, issue.author, 18, 'issue-author-avatar')}<span class="issue-table-reporter-label">Reporter:</span> <span>${escapeHtml(issue.author || '—')}</span></span></td><td>${escapeHtml(issue.project)}</td><td>${assigneesMarkup(issue)}</td><td><div class="issue-labels">${issue.labels.length ? issue.labels.map(labelMarkup).join('') : '—'}</div></td><td>${escapeHtml(issue.milestone || '—')}</td><td>${escapeHtml(issue.comments)}</td><td>${escapeHtml(formatDate(issue.createdAt))}</td><td>${escapeHtml(formatDate(issue.updatedAt))}</td></tr>`).join('');
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
    try {
      const [issues] = await Promise.all([window.api.getExternalIssues(providerSelect?.value || 'all'), loadAvailableLabels()]);
      allIssues = issues;
      populateFilters();
      updateMyIssuesButtonUI();
      renderIssues();
    }
    catch (error) { feedback.textContent = error.message || 'No se pudieron cargar las issues.'; feedback.className = 'issues-feedback issues-feedback--error'; }
    finally { refreshButton.disabled = false; refreshButton.textContent = 'Actualizar issues'; }
  }

  document.getElementById('openIssueSettings').addEventListener('click', openSettings);
  document.getElementById('closeIssueSettings').addEventListener('click', closeSettings);
  settingsModal.addEventListener('click', event => { if (event.target === settingsModal) closeSettings(); });

  if (openExportBtn) openExportBtn.addEventListener('click', openExportModal);
  if (closeExportBtn) closeExportBtn.addEventListener('click', closeExportModal);
  if (cancelExportBtn) cancelExportBtn.addEventListener('click', closeExportModal);
  if (exportModal) exportModal.addEventListener('click', event => { if (event.target === exportModal) closeExportModal(); });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeSettings();
      closeExportModal();
    }
  });

  if (exportForm) {
    exportForm.querySelectorAll('input[name="exportFormat"]').forEach(radio => {
      radio.addEventListener('change', updateExportFormatUI);
    });

    exportForm.addEventListener('submit', async event => {
      event.preventDefault();
      const format = exportForm.exportFormat.value;
      const scope = exportForm.exportScope.value;
      const rawIssues = scope === 'all' ? allIssues : getVisibleIssues();
      const issues = sortIssues(rawIssues, tableSort.column, tableSort.direction);

      if (!issues.length) {
        feedback.textContent = 'No hay issues para exportar con el alcance seleccionado.';
        feedback.className = 'issues-feedback issues-feedback--error';
        return;
      }

      const svgLayout = exportForm.exportSvgLayout?.value || 'table';
      const submitBtn = exportForm.querySelector('[type="submit"]');
      const prevText = submitBtn ? submitBtn.textContent : 'Exportar archivo';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Exportando…';
      }

      try {
        const res = await window.api.exportIssues({
          format,
          issues,
          options: {
            layout: svgLayout
          }
        });

        if (res?.canceled) {
          return;
        }

        if (res?.success) {
          closeExportModal();
          feedback.textContent = `Archivo exportado correctamente (${res.count} issues): ${res.filePath}`;
          feedback.className = 'issues-feedback issues-feedback--success';
        } else {
          feedback.textContent = res?.error || 'No se pudo completar la exportación.';
          feedback.className = 'issues-feedback issues-feedback--error';
        }
      } catch (err) {
        feedback.textContent = err.message || 'Error inesperado al exportar issues.';
        feedback.className = 'issues-feedback issues-feedback--error';
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = prevText;
        }
      }
    });
  }
  Object.values(filters).forEach(filter => filter.addEventListener(filter === filters.search ? 'input' : 'change', renderIssues));

  if (assigneeToggle) {
    assigneeToggle.addEventListener('click', event => {
      if (event.target.closest('#issueAssigneeClearBtn')) return;
      toggleAssigneeDropdown();
    });
  }

  if (assigneeClearBtn) {
    assigneeClearBtn.addEventListener('click', event => {
      event.stopPropagation();
      clearAllAssignees();
    });
    assigneeClearBtn.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        clearAllAssignees();
      }
    });
  }

  if (assigneeOptions) {
    assigneeOptions.addEventListener('change', event => {
      const cb = event.target.closest('.custom-multiselect-checkbox');
      if (!cb) return;
      const value = cb.value;
      const itemRow = cb.closest('.custom-multiselect-item');
      if (cb.checked) {
        selectedAssignees.add(value);
        itemRow?.classList.add('is-selected');
      } else {
        selectedAssignees.delete(value);
        itemRow?.classList.remove('is-selected');
      }
      updateAssigneeToggleUI();
      renderIssues();
    });
  }

  if (assigneeSelectAllBtn) {
    assigneeSelectAllBtn.addEventListener('click', () => {
      const items = assigneeOptions?.querySelectorAll('.custom-multiselect-item') || [];
      items.forEach(item => {
        if (item.style.display !== 'none') {
          const cb = item.querySelector('.custom-multiselect-checkbox');
          if (cb) {
            cb.checked = true;
            selectedAssignees.add(cb.value);
            item.classList.add('is-selected');
          }
        }
      });
      updateAssigneeToggleUI();
      renderIssues();
    });
  }

  if (assigneeClearAllBtn) {
    assigneeClearAllBtn.addEventListener('click', clearAllAssignees);
  }

  if (assigneeSearch) {
    assigneeSearch.addEventListener('input', () => {
      filterAssigneeOptions(assigneeSearch.value);
    });
    assigneeSearch.addEventListener('keydown', event => {
      if (event.key === 'Escape') {
        closeAssigneeDropdown();
        assigneeToggle?.focus();
      }
    });
  }

  document.addEventListener('click', event => {
    if (assigneeMultiSelect && !assigneeMultiSelect.contains(event.target)) {
      closeAssigneeDropdown();
    }
    if (issueContextMenu && !issueContextMenu.contains(event.target)) {
      hideIssueContextMenu();
    }
  });

  document.addEventListener('contextmenu', event => {
    if (!event.target.closest('[data-issue-url]')) {
      hideIssueContextMenu();
    }
  });

  window.addEventListener('resize', hideIssueContextMenu);
  window.addEventListener('scroll', hideIssueContextMenu, true);

  if (tableView) tableView.addEventListener('contextmenu', handleIssueContextMenu);
  if (kanbanView) kanbanView.addEventListener('contextmenu', handleIssueContextMenu);

  if (contextCopyIssueLink) {
    contextCopyIssueLink.addEventListener('click', copyActiveIssueLink);
  }

  if (contextOpenIssueBrowser) {
    contextOpenIssueBrowser.addEventListener('click', openActiveIssueInBrowser);
  }

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      if (issueContextMenu && !issueContextMenu.hidden) {
        hideIssueContextMenu();
      }
      if (assigneeDropdown && !assigneeDropdown.hidden) {
        closeAssigneeDropdown();
        assigneeToggle?.focus();
      }
    }
  });
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
      await window.api.saveIssueConnection({
        provider,
        token,
        projects: form.projects.value,
        scope: form.scope.value,
        baseUrl: form.baseUrl?.value,
        username: form.username?.value?.trim()
      });
      feedback.textContent = `${provider === 'github' ? 'GitHub' : 'GitLab'} conectado correctamente.`; feedback.className = 'issues-feedback issues-feedback--success';
      await loadConnections();
      await loadAvailableLabels();
      await loadAllIssues();
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
    filterOnlyMyIssues = false;
    updateMyIssuesButtonUI();
    feedback.textContent = 'Conexión eliminada.'; feedback.className = 'issues-feedback'; await loadConnections();
  }));

  refreshButton.addEventListener('click', loadAllIssues);

  if (myIssuesBtn) {
    myIssuesBtn.addEventListener('click', () => {
      filterOnlyMyIssues = !filterOnlyMyIssues;
      updateMyIssuesButtonUI();
      renderIssues();
    });
  }

  document.querySelectorAll('.issues-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (col) handleTableSort(col);
    });
  });

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      updateSortHeadersUI();
      updateMyIssuesButtonUI();
      await loadConnections();
      await loadLabelRules();
      await loadAllIssues();
    } catch (error) { feedback.textContent = error.message || 'No se pudieron cargar las conexiones.'; feedback.className = 'issues-feedback issues-feedback--error'; }
  });
})();

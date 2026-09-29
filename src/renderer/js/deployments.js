// deployments.js - Lógica para la pestaña de Despliegues y Comparador Git Diff
(function() {
  'use strict';

  // Estado global de la vista
  const state = {
    deployments: [],
    currentDeployment: null,
    comparison: null,
    activeFile: null,
    activeDiff: null,
    sourceText: '',
    targetOriginalText: '',
    hasUnsavedChanges: false,
    viewMode: 'unified', // 'split' (Editor Doble) o 'unified' (Diff Clásico)
    currentModalTags: [],
    activeTagFilters: [],
    currentFilter: 'all',
    stagedContent: {},
    stagedStatus: {},
    stagedContent: {},
    stagedStatus: {},
    currentSearch: '',
    deploymentSearchQuery: '',
    gitSource: null,
    gitTarget: null,
    isComparing: false
  };

  // Elementos del DOM
  const dom = {};

  document.addEventListener('DOMContentLoaded', () => {
    cacheDomElements();
    initIcons();
    attachEventListeners();
    loadDeployments();
  });

  function cacheDomElements() {
    // Cabeceras de vista
    dom.deploymentsListHeader = document.getElementById('deploymentsListHeader');
    dom.deploymentDetailHeader = document.getElementById('deploymentDetailHeader');
    dom.backToListBtn = document.getElementById('backToListBtn');
    dom.activeDeploymentTitle = document.getElementById('activeDeploymentTitle');
    dom.activeDeploymentSubtitle = document.getElementById('activeDeploymentSubtitle');

    // Vistas principales
    dom.deploymentsListView = document.getElementById('deploymentsListView');
    dom.deploymentSearchInput = document.getElementById('deploymentSearchInput');
    dom.deploymentsCountBadge = document.getElementById('deploymentsCountBadge');
    dom.deploymentsGrid = document.getElementById('deploymentsGrid');

    dom.deploymentSelect = document.getElementById('deploymentSelect');
    dom.refreshBtn = document.getElementById('refreshBtn');
    dom.editDeploymentBtn = document.getElementById('editDeploymentBtn');
    dom.deleteDeploymentBtn = document.getElementById('deleteDeploymentBtn');
    dom.newDeploymentBtn = document.getElementById('newDeploymentBtn');
    dom.createFirstDeploymentBtn = document.getElementById('createFirstDeploymentBtn');

    dom.alert = document.getElementById('deploymentAlert');
    dom.noDeploymentsView = document.getElementById('noDeploymentsView');
    dom.activeDeploymentView = document.getElementById('activeDeploymentView');

    // Tarjetas de entorno
    dom.sourcePathDisplay = document.getElementById('sourcePathDisplay');
    dom.targetPathDisplay = document.getElementById('targetPathDisplay');
    dom.openSourceFolderBtn = document.getElementById('openSourceFolderBtn');
    dom.openTargetFolderBtn = document.getElementById('openTargetFolderBtn');

    // Git controles
    dom.sourceGitBadge = document.getElementById('sourceGitBadge');
    dom.sourceGitCommit = document.getElementById('sourceGitCommit');
    dom.sourceGitActions = document.getElementById('sourceGitActions');
    dom.sourceBranchSelect = document.getElementById('sourceBranchSelect');
    dom.sourcePullBtn = document.getElementById('sourcePullBtn');

    dom.targetGitBadge = document.getElementById('targetGitBadge');
    dom.targetGitCommit = document.getElementById('targetGitCommit');
    dom.targetGitActions = document.getElementById('targetGitActions');
    dom.targetBranchSelect = document.getElementById('targetBranchSelect');
    dom.targetPullBtn = document.getElementById('targetPullBtn');

    // Filtros y toolbar
    dom.filterTabs = document.querySelectorAll('.diff-tab-btn');
    dom.fileSearchInput = document.getElementById('fileSearchInput');
    dom.syncAllBtn = document.getElementById('syncAllBtn');
    dom.badgeAll = document.getElementById('badgeAll');
    dom.badgeModified = document.getElementById('badgeModified');
    dom.badgeAdded = document.getElementById('badgeAdded');
    dom.badgeDeleted = document.getElementById('badgeDeleted');
    dom.diffFilesCount = document.getElementById('diffFilesCount');

    // Lista de ficheros y visor
    dom.diffLoadingFiles = document.getElementById('diffLoadingFiles');
    dom.unstagedFileList = document.getElementById('unstagedFileList');
    dom.stagedFileList = document.getElementById('stagedFileList');
    dom.unstagedCount = document.getElementById('unstagedCount');
    dom.stagedCount = document.getElementById('stagedCount');
    dom.stageAllBtn = document.getElementById('stageAllBtn');
    dom.unstageAllBtn = document.getElementById('unstageAllBtn');
    dom.commitDeployBtn = document.getElementById('commitDeployBtn');
    dom.unstagedFileList = document.getElementById('unstagedFileList');
    dom.stagedFileList = document.getElementById('stagedFileList');
    dom.unstagedCount = document.getElementById('unstagedCount');
    dom.stagedCount = document.getElementById('stagedCount');
    dom.stageAllBtn = document.getElementById('stageAllBtn');
    dom.unstageAllBtn = document.getElementById('unstageAllBtn');
    dom.commitDeployBtn = document.getElementById('commitDeployBtn');
    dom.diffEmptySelection = document.getElementById('diffEmptySelection');
    dom.diffViewerContent = document.getElementById('diffViewerContent');
    dom.diffLoadingContent = document.getElementById('diffLoadingContent');

    // Header del fichero activo
    dom.activeFileStatusBadge = document.getElementById('activeFileStatusBadge');
    dom.activeFilePath = document.getElementById('activeFilePath');
    dom.statAdditions = document.getElementById('statAdditions');
    dom.statDeletions = document.getElementById('statDeletions');
    dom.saveStatusIndicator = document.getElementById('saveStatusIndicator');

    // Botones de acción principales de la cabecera
    dom.viewSplitEditorBtn = document.getElementById('viewSplitEditorBtn');
    dom.viewUnifiedDiffBtn = document.getElementById('viewUnifiedDiffBtn');
    dom.passAllBtn = document.getElementById('passAllBtn');
    dom.revertBtn = document.getElementById('revertBtn');
    dom.saveToTargetBtn = document.getElementById('saveToTargetBtn');

    // Contenedores de vistas
    dom.diffBinaryNotice = document.getElementById('diffBinaryNotice');
    dom.binaryDetails = document.getElementById('binaryDetails');
    dom.imagePreviewContainer = document.getElementById('imagePreviewContainer');
    dom.imgSourcePreview = document.getElementById('imgSourcePreview');
    dom.imgTargetPreview = document.getElementById('imgTargetPreview');

    dom.splitEditorView = document.getElementById('splitEditorView');
    dom.sourceCodeView = document.getElementById('sourceCodeView');
    dom.editorGutter = document.getElementById('editorGutter');
    dom.targetEditorTextarea = document.getElementById('targetEditorTextarea');
    dom.targetEditorStats = document.getElementById('targetEditorStats');

    dom.unifiedDiffContainer = document.getElementById('unifiedDiffContainer');

    // Modales
    dom.deploymentModal = document.getElementById('deploymentModal');
    dom.deploymentModalTitle = document.getElementById('deploymentModalTitle');
    dom.closeDeploymentModalBtn = document.getElementById('closeDeploymentModalBtn');
    dom.cancelDeploymentBtn = document.getElementById('cancelDeploymentBtn');
    dom.deploymentForm = document.getElementById('deploymentForm');
    dom.deploymentId = document.getElementById('deploymentId');
    dom.deploymentName = document.getElementById('deploymentName');
    dom.deploymentSourcePath = document.getElementById('deploymentSourcePath');
    dom.deploymentTargetPath = document.getElementById('deploymentTargetPath');
    dom.deploymentIgnorePatterns = document.getElementById('deploymentIgnorePatterns');
    dom.deploymentTagsInput = document.getElementById('deploymentTagsInput');
    dom.deploymentTagsWrapper = document.getElementById('deploymentTagsWrapper');
    dom.existingTagsDatalist = document.getElementById('existingTagsDatalist');
    dom.tagFilterDropdownBtn = document.getElementById('tagFilterDropdownBtn');
    dom.tagFilterDropdownText = document.getElementById('tagFilterDropdownText');
    dom.tagFilterDropdownList = document.getElementById('tagFilterDropdownList');
    dom.browseSourceBtn = document.getElementById('browseSourceBtn');
    dom.browseTargetBtn = document.getElementById('browseTargetBtn');

    dom.confirmSyncModal = document.getElementById('confirmSyncModal');
    dom.closeConfirmSyncModalBtn = document.getElementById('closeConfirmSyncModalBtn');
    dom.cancelSyncBtn = document.getElementById('cancelSyncBtn');
    dom.executeSyncBtn = document.getElementById('executeSyncBtn');
    dom.confirmSyncCount = document.getElementById('confirmSyncCount');
    dom.confirmSyncList = document.getElementById('confirmSyncList');
  }

  function initIcons() {
    if (typeof ICONS === 'undefined') return;
    setBtnIcon('refreshIcon', ICONS.refresh);
    setBtnIcon('editIcon', ICONS.edit);
    setBtnIcon('deleteIcon', ICONS.delete);
    setBtnIcon('emptyStateIcon', ICONS.rocket);
    setBtnIcon('openSourceIcon', ICONS.folder);
    setBtnIcon('openTargetIcon', ICONS.folder);
    setBtnIcon('sourceBranchIcon', ICONS.gitBranch);
    setBtnIcon('targetBranchIcon', ICONS.gitBranch);
    setBtnIcon('sourcePullIcon', ICONS.gitPullRequest);
    setBtnIcon('targetPullIcon', ICONS.gitPullRequest);
    setBtnIcon('syncAllIcon', ICONS.sync);
    setBtnIcon('diffEmptyIcon', ICONS.diff);
  }

  function setBtnIcon(elemId, svg) {
    const el = document.getElementById(elemId);
    if (el && svg) el.innerHTML = svg;
  }

  function attachEventListeners() {
    setupTagInputListeners();
    // Volver al listado
    if (dom.backToListBtn) {
      if (dom.backToListBtn) dom.backToListBtn.addEventListener('click', showDeploymentsList);
    }

    // Buscador del listado
    if (dom.deploymentSearchInput) {
      if (dom.tagFilterDropdownBtn) {
      dom.tagFilterDropdownBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isVisible = dom.tagFilterDropdownList.style.display === 'block';
        dom.tagFilterDropdownList.style.display = isVisible ? 'none' : 'block';
      });
      document.addEventListener('click', (e) => {
        if (dom.tagFilterDropdownList && !dom.tagFilterDropdownList.contains(e.target) && !dom.tagFilterDropdownBtn.contains(e.target)) {
          dom.tagFilterDropdownList.style.display = 'none';
        }
      });
    }
    if (dom.deploymentSearchInput) dom.deploymentSearchInput.addEventListener('input', (e) => {
        state.deploymentSearchQuery = e.target.value;
        renderDeploymentsList();
      });
    }

    // Selector de despliegue en barra de detalle
    if (dom.deploymentSelect) dom.deploymentSelect.addEventListener('change', (e) => {
      const id = parseInt(e.target.value, 10);
      if (id) {
        selectDeployment(id);
      } else {
        showDeploymentsList();
      }
    });

    // Botones de cabecera principal
    if (dom.refreshBtn) dom.refreshBtn.addEventListener('click', () => {
      if (state.currentDeployment) refreshCurrentDeployment();
    });

    if (dom.newDeploymentBtn) dom.newDeploymentBtn.addEventListener('click', openCreateModal);
    if (dom.createFirstDeploymentBtn) {
      if (dom.createFirstDeploymentBtn) dom.createFirstDeploymentBtn.addEventListener('click', openCreateModal);
    }

    if (dom.editDeploymentBtn) dom.editDeploymentBtn.addEventListener('click', () => {
      if (state.currentDeployment) openEditModal(state.currentDeployment);
    });

    if (dom.deleteDeploymentBtn) dom.deleteDeploymentBtn.addEventListener('click', () => {
      if (state.currentDeployment) handleDeleteDeployment(state.currentDeployment);
    });

    // Abrir carpetas en explorador
    if (dom.openSourceFolderBtn) dom.openSourceFolderBtn.addEventListener('click', () => {
      if (state.currentDeployment?.source_path) {
        window.api.openExternal(state.currentDeployment.source_path);
      }
    });

    if (dom.openTargetFolderBtn) dom.openTargetFolderBtn.addEventListener('click', () => {
      if (state.currentDeployment?.target_path) {
        window.api.openExternal(state.currentDeployment.target_path);
      }
    });

    // Git pull
    if (dom.sourcePullBtn) dom.sourcePullBtn.addEventListener('click', () => handleGitPull('source'));
    if (dom.targetPullBtn) dom.targetPullBtn.addEventListener('click', () => handleGitPull('target'));

    // Cambio de rama en selector
    if (dom.sourceBranchSelect) dom.sourceBranchSelect.addEventListener('change', (e) => handleBranchChange('source', e.target.value));
    if (dom.targetBranchSelect) dom.targetBranchSelect.addEventListener('change', (e) => handleBranchChange('target', e.target.value));

    // Filtros de fichero
    dom.filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        dom.filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.currentFilter = tab.getAttribute('data-filter') || 'all';
        renderFileList();
      });
    });

    // Búsqueda de fichero
    if (dom.fileSearchInput) dom.fileSearchInput.addEventListener('input', (e) => {
      state.currentSearch = e.target.value.trim().toLowerCase();
      renderFileList();
    });

    // Botones de acción del fichero
    if (dom.viewSplitEditorBtn) dom.viewSplitEditorBtn.addEventListener('click', () => switchViewMode('split'));
    if (dom.viewUnifiedDiffBtn) dom.viewUnifiedDiffBtn.addEventListener('click', () => switchViewMode('unified'));
    if (dom.passAllBtn) dom.passAllBtn.addEventListener('click', passAllToTarget);
    if (dom.revertBtn) dom.revertBtn.addEventListener('click', revertToTargetOriginal);
    if (dom.saveToTargetBtn) dom.saveToTargetBtn.addEventListener('click', saveToTargetFile);

    // Entrada y scroll en el editor de salida
    if (dom.targetEditorTextarea) dom.targetEditorTextarea.addEventListener('input', handleEditorInput);
    if (dom.targetEditorTextarea) dom.targetEditorTextarea.addEventListener('scroll', () => {
      dom.editorGutter.scrollTop = dom.targetEditorTextarea.scrollTop;
    });

    if (dom.syncAllBtn) dom.syncAllBtn.addEventListener('click', () => {
      openConfirmSyncModal();
    });

    if (dom.stageAllBtn) {
      if (dom.stageAllBtn) dom.stageAllBtn.addEventListener('click', stageAllFiles);
      if (dom.unstageAllBtn) dom.unstageAllBtn.addEventListener('click', unstageAllFiles);
      if (dom.commitDeployBtn) dom.commitDeployBtn.addEventListener('click', commitDeploy);
    }

    // Modales
    if (dom.closeDeploymentModalBtn) dom.closeDeploymentModalBtn.addEventListener('click', closeDeploymentModal);
    if (dom.cancelDeploymentBtn) dom.cancelDeploymentBtn.addEventListener('click', closeDeploymentModal);
    if (dom.deploymentForm) dom.deploymentForm.addEventListener('submit', handleSaveDeployment);

    if (dom.browseSourceBtn) dom.browseSourceBtn.addEventListener('click', async () => {
      const selected = await window.api.selectDirectory(dom.deploymentSourcePath.value);
      if (selected) dom.deploymentSourcePath.value = selected;
    });

    if (dom.browseTargetBtn) dom.browseTargetBtn.addEventListener('click', async () => {
      const selected = await window.api.selectDirectory(dom.deploymentTargetPath.value);
      if (selected) dom.deploymentTargetPath.value = selected;
    });

    if (dom.closeConfirmSyncModalBtn) dom.closeConfirmSyncModalBtn.addEventListener('click', closeConfirmSyncModal);
    if (dom.cancelSyncBtn) dom.cancelSyncBtn.addEventListener('click', closeConfirmSyncModal);
    if (dom.executeSyncBtn) dom.executeSyncBtn.addEventListener('click', executeBatchSync);
  }

  /**
   * Carga la lista de despliegues desde la base de datos
   */
  
  
  function updateTagFilterText() {
    if (!dom.tagFilterDropdownText) return;
    if (state.activeTagFilters.length === 0) {
      dom.tagFilterDropdownText.textContent = 'Todas las etiquetas';
    } else if (state.activeTagFilters.length === 1) {
      dom.tagFilterDropdownText.textContent = state.activeTagFilters[0];
    } else {
      dom.tagFilterDropdownText.textContent = `${state.activeTagFilters.length} etiquetas`;
    }
  }

  function updateTagsDropdowns() {
    const allTags = new Set();
    state.deployments.forEach(d => {
       if (d.tags && Array.isArray(d.tags)) {
           d.tags.forEach(t => allTags.add(t));
       }
    });
    
    let dlHtml = '';
    allTags.forEach(t => dlHtml += `<option value="${t}">`);
    if(dom.existingTagsDatalist) dom.existingTagsDatalist.innerHTML = dlHtml;
    
    if (dom.tagFilterDropdownList) {
       let listHtml = '';
       allTags.forEach(t => {
         const isChecked = state.activeTagFilters.includes(t) ? 'checked' : '';
         listHtml += `<label style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; cursor: pointer; color: var(--text-primary);"><input type="checkbox" class="tag-filter-checkbox" value="${escapeHTML(t)}" ${isChecked}>${escapeHTML(t)}</label>`;
       });
       if (allTags.size === 0) listHtml = '<div style="color:var(--text-secondary);font-size:0.9em;text-align:center;">No hay etiquetas</div>';
       dom.tagFilterDropdownList.innerHTML = listHtml;
       
       dom.tagFilterDropdownList.querySelectorAll('.tag-filter-checkbox').forEach(chk => {
          chk.addEventListener('change', (e) => {
             const val = e.target.value;
             if (e.target.checked) {
               if (!state.activeTagFilters.includes(val)) state.activeTagFilters.push(val);
             } else {
               state.activeTagFilters = state.activeTagFilters.filter(x => x !== val);
             }
             updateTagFilterText();
             renderDeploymentsList();
          });
       });
    }
  }


  async function loadDeployments(selectId) {
    try {
      state.deployments = await window.api.getDeployments();
      updateTagsDropdowns();
      renderDeploymentSelectDropdown();

      if (selectId) {
        selectDeployment(selectId);
      } else if (state.currentDeployment) {
        const stillExists = state.deployments.find(d => d.id === state.currentDeployment.id);
        if (stillExists) {
          state.currentDeployment = stillExists;
          updateViewVisibility();
        } else {
          showDeploymentsList();
        }
      } else {
        // Por defecto al entrar: vista de listado
        showDeploymentsList();
      }
    } catch (err) {
      showAlert(`Error cargando despliegues: ${err.message}`, 'danger');
    }
  }

  function renderDeploymentSelectDropdown() {
    const select = dom.deploymentSelect;
    if (!select) return;
    select.innerHTML = '<option value="">-- Cambiar despliegue --</option>';

    state.deployments.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d.id;
      opt.textContent = d.name;
      if (state.currentDeployment && state.currentDeployment.id === d.id) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
  }

  /**
   * Cambia a la vista de Listado de Despliegues
   */
  function showDeploymentsList() {
    state.currentDeployment = null;
    state.activeFile = null;
    state.activeDiff = null;

    if (dom.deploymentSelect) {
      dom.deploymentSelect.value = '';
    }

    updateViewVisibility();
    renderDeploymentsList();
  }

  function updateViewVisibility() {
    const hasDeployments = state.deployments.length > 0;
    const hasActive = Boolean(state.currentDeployment);

    if (hasActive) {
      if (dom.deploymentsListHeader) dom.deploymentsListHeader.style.display = 'none';
      if (dom.deploymentDetailHeader) dom.deploymentDetailHeader.style.display = 'flex';
      if (dom.noDeploymentsView) dom.noDeploymentsView.style.display = 'none';
      if (dom.deploymentsListView) dom.deploymentsListView.style.display = 'none';
      if (dom.activeDeploymentView) dom.activeDeploymentView.style.display = 'flex';

      dom.editDeploymentBtn.disabled = false;
      dom.deleteDeploymentBtn.disabled = false;
      dom.refreshBtn.disabled = false;
    } else {
      if (dom.deploymentsListHeader) dom.deploymentsListHeader.style.display = 'flex';
      if (dom.deploymentDetailHeader) dom.deploymentDetailHeader.style.display = 'none';
      if (dom.activeDeploymentView) dom.activeDeploymentView.style.display = 'none';

      if (!hasDeployments) {
        if (dom.noDeploymentsView) dom.noDeploymentsView.style.display = 'flex';
        if (dom.deploymentsListView) dom.deploymentsListView.style.display = 'none';
      } else {
        if (dom.noDeploymentsView) dom.noDeploymentsView.style.display = 'none';
        if (dom.deploymentsListView) dom.deploymentsListView.style.display = 'flex';
      }
    }
  }

  /**
   * Renderiza las tarjetas del listado de despliegues
   */
  function renderDeploymentsList() {
    const container = dom.deploymentsGrid;
    if (!container) return;
    container.innerHTML = '';

    const query = (state.deploymentSearchQuery || '').toLowerCase().trim();
    
    const filtered = state.deployments.filter(d => {
      let matchQuery = true;
      if (query) {
        matchQuery = d.name.toLowerCase().includes(query) ||
          d.source_path.toLowerCase().includes(query) ||
          d.target_path.toLowerCase().includes(query) ||
          (d.ignore_patterns && d.ignore_patterns.toLowerCase().includes(query));
      }
      let matchTag = true;
      if (state.activeTagFilters && state.activeTagFilters.length > 0) {
        matchTag = state.activeTagFilters.some(t => d.tags && d.tags.includes(t));
      }
      return matchQuery && matchTag;
    });

    if (dom.deploymentsCountBadge) {
      dom.deploymentsCountBadge.textContent = `${filtered.length} ${filtered.length === 1 ? 'despliegue' : 'despliegues'}`;
    }

    if (filtered.length === 0) {
      container.innerHTML = `
        <div class="deployments-empty-search" style="grid-column: 1 / -1; padding: 3rem 1.5rem; text-align: center; color: var(--text-secondary);">
          <p>No se encontraron despliegues con el filtro actual.</p>
        </div>
      `;
      return;
    }

    filtered.forEach(d => {
      const card = document.createElement('div');
      card.className = 'deployment-card-item';
      card.setAttribute('data-id', d.id);

      const rocketSvg = typeof ICONS !== 'undefined' && ICONS.rocket ? ICONS.rocket : '🚀';
      const editSvg = typeof ICONS !== 'undefined' && ICONS.edit ? ICONS.edit : '✏️';
      const deleteSvg = typeof ICONS !== 'undefined' && ICONS.delete ? ICONS.delete : '🗑️';

      card.innerHTML = `
        <div class="deployment-card-header">
          <div class="deployment-card-title-group">
            <span class="deployment-card-icon">${rocketSvg}</span>
            <h3 class="deployment-card-name" title="${escapeHTML(d.name)}">${escapeHTML(d.name)}</h3>
          </div>
          ${(d.tags && d.tags.length > 0) ? `<div class="deployment-card-tags" style="margin-top: 4px;">${d.tags.map(t => `<span class="badge badge-outline" style="margin-right: 4px; font-size: 0.75em;">${escapeHTML(t)}</span>`).join('')}</div>` : ''}
          <div class="deployment-card-actions">
            <button class="btn-icon-subtle edit-card-btn" title="Editar despliegue" type="button">
              ${editSvg}
            </button>
            <button class="btn-icon-subtle delete-card-btn" title="Eliminar despliegue" type="button">
              ${deleteSvg}
            </button>
          </div>
        </div>

        <div class="deployment-card-body">
          <div class="card-path-row">
            <span class="path-badge path-badge--source">📥 Entrada</span>
            <span class="card-path-text" title="${escapeHTML(d.source_path)}">${escapeHTML(d.source_path)}</span>
          </div>
          <div class="card-arrow-row">&#10142;</div>
          <div class="card-path-row">
            <span class="path-badge path-badge--target">📤 Salida</span>
            <span class="card-path-text" title="${escapeHTML(d.target_path)}">${escapeHTML(d.target_path)}</span>
          </div>
          ${d.ignore_patterns ? `
            <div class="card-meta-row">
              <span class="card-meta-label">Ignora:</span>
              <span class="card-meta-value" title="${escapeHTML(d.ignore_patterns)}">${escapeHTML(d.ignore_patterns)}</span>
            </div>
          ` : ''}
        </div>

        <div class="deployment-card-footer">
          <button class="btn btn-primary btn-sm open-deployment-btn" type="button">
            <span class="btn-icon">${rocketSvg}</span>
            Abrir Despliegue
          </button>
        </div>
      `;

      card.addEventListener('click', (e) => {
        if (e.target.closest('.edit-card-btn') || e.target.closest('.delete-card-btn')) return;
        selectDeployment(d.id);
      });

      const editBtn = card.querySelector('.edit-card-btn');
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openEditModal(d);
      });

      const deleteBtn = card.querySelector('.delete-card-btn');
      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        handleDeleteDeployment(d);
      });

      container.appendChild(card);
    });
  }

  /**
   * Selecciona y activa un despliegue
   */
  async function selectDeployment(id) {
    const deployment = state.deployments.find(d => d.id === id);
    if (!deployment) return;

    state.currentDeployment = deployment;
    state.activeFile = null;
    state.activeDiff = null;

    if (dom.deploymentSelect) {
      dom.deploymentSelect.value = id;
    }

    if (dom.activeDeploymentTitle) {
      dom.activeDeploymentTitle.textContent = deployment.name;
    }
    if (dom.activeDeploymentSubtitle) {
      dom.activeDeploymentSubtitle.textContent = `${deployment.source_path} ➔ ${deployment.target_path}`;
      dom.activeDeploymentSubtitle.setAttribute('title', `${deployment.source_path} ➔ ${deployment.target_path}`);
    }

    dom.sourcePathDisplay.textContent = deployment.source_path;
    dom.sourcePathDisplay.setAttribute('title', deployment.source_path);
    dom.targetPathDisplay.textContent = deployment.target_path;
    dom.targetPathDisplay.setAttribute('title', deployment.target_path);

    updateViewVisibility();

    await Promise.all([
      loadGitInfo(),
      runFolderComparison()
    ]);
  }

  async function refreshCurrentDeployment() {
    if (!state.currentDeployment) return;
    showAlert('Actualizando estado Git y diferencias...', 'info', 2000);
    await Promise.all([
      loadGitInfo(),
      runFolderComparison()
    ]);
  }

  /**
   * Carga la información de Git de las carpetas de Entrada y Salida
   */
  async function loadGitInfo() {
    if (!state.currentDeployment) return;

    renderGitLoading('source');
    renderGitLoading('target');

    const [sourceGit, targetGit] = await Promise.all([
      window.api.getGitRepoInfo(state.currentDeployment.source_path),
      window.api.getGitRepoInfo(state.currentDeployment.target_path)
    ]);

    state.gitSource = sourceGit;
    state.gitTarget = targetGit;

    renderGitCard('source', sourceGit);
    renderGitCard('target', targetGit);
  }

  function renderGitLoading(type) {
    const badge = type === 'source' ? dom.sourceGitBadge : dom.targetGitBadge;
    const actions = type === 'source' ? dom.sourceGitActions : dom.targetGitActions;
    const commit = type === 'source' ? dom.sourceGitCommit : dom.targetGitCommit;

    badge.className = 'git-badge git-badge--checking';
    badge.textContent = 'Comprobando repositorio Git…';
    actions.style.display = 'none';
    commit.textContent = '';
  }

  function renderGitCard(type, gitInfo) {
    const badge = type === 'source' ? dom.sourceGitBadge : dom.targetGitBadge;
    const actions = type === 'source' ? dom.sourceGitActions : dom.targetGitActions;
    const commit = type === 'source' ? dom.sourceGitCommit : dom.targetGitCommit;
    const select = type === 'source' ? dom.sourceBranchSelect : dom.targetBranchSelect;

    if (!gitInfo || !gitInfo.isGit) {
      badge.className = 'git-badge git-badge--not-git';
      badge.textContent = 'Carpeta local (no es Git)';
      actions.style.display = 'none';
      commit.textContent = '';
      return;
    }

    badge.className = 'git-badge git-badge--is-git';
    badge.textContent = `Rama: ${gitInfo.currentBranch || 'HEAD'}`;

    if (gitInfo.lastCommit) {
      commit.textContent = `• ${gitInfo.lastCommit}`;
      commit.setAttribute('title', gitInfo.lastCommit);
    } else {
      commit.textContent = '';
    }

    select.innerHTML = '';
    const branches = gitInfo.branches || [gitInfo.currentBranch];
    branches.forEach(b => {
      const opt = document.createElement('option');
      opt.value = b;
      opt.textContent = b;
      if (b === gitInfo.currentBranch) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });

    actions.style.display = 'flex';
  }

  /**
   * Ejecuta Git Pull en el entorno indicado
   */
  async function handleGitPull(type) {
    if (!state.currentDeployment) return;
    const isSource = type === 'source';
    const folderPath = isSource ? state.currentDeployment.source_path : state.currentDeployment.target_path;
    const select = isSource ? dom.sourceBranchSelect : dom.targetBranchSelect;
    const btn = isSource ? dom.sourcePullBtn : dom.targetPullBtn;
    const branch = select.value;

    const originalBtnText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-sm"></span> Haciendo pull…`;

    try {
      const res = await window.api.gitPull({ folderPath, branch });
      if (res.success) {
        showAlert(`Git pull completado con éxito en ${isSource ? 'Entrada' : 'Salida'} (${branch || 'HEAD'}):\n${res.output || 'Al día'}`, 'success', 6000);
        await loadGitInfo();
        await runFolderComparison();
      } else {
        showAlert(`Error en git pull (${branch}): ${res.error}`, 'danger', 8000);
      }
    } catch (err) {
      showAlert(`Fallo ejecutando git pull: ${err.message}`, 'danger', 8000);
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalBtnText;
    }
  }

  /**
   * Cambia de rama en el repositorio indicado
   */
  async function handleBranchChange(type, newBranch) {
    if (!state.currentDeployment || !newBranch) return;
    const isSource = type === 'source';
    const folderPath = isSource ? state.currentDeployment.source_path : state.currentDeployment.target_path;

    showAlert(`Cambiando a la rama "${newBranch}" en ${isSource ? 'Entrada' : 'Salida'}...`, 'info', 3000);
    try {
      const res = await window.api.gitCheckoutBranch({ folderPath, branch: newBranch });
      if (res.success) {
        showAlert(`Cambiado exitosamente a la rama "${newBranch}"`, 'success', 3000);
        await loadGitInfo();
        await runFolderComparison();
      } else {
        showAlert(`Error cambiando de rama: ${res.error}`, 'danger', 6000);
        await loadGitInfo();
      }
    } catch (err) {
      showAlert(`Error cambiando de rama: ${err.message}`, 'danger', 6000);
      await loadGitInfo();
    }
  }

  /**
   * Ejecuta la comparación de carpetas entre Entrada y Salida
   */
  async function runFolderComparison() {
    if (!state.currentDeployment || state.isComparing) return;
    state.isComparing = true;
    state.stagedContent = {};
    state.stagedStatus = {};

    dom.diffLoadingFiles.style.display = 'flex';
    if(dom.unstagedFileList) dom.unstagedFileList.innerHTML = ''; if(dom.stagedFileList) dom.stagedFileList.innerHTML = '';
    dom.syncAllBtn.disabled = true;

    try {
      const res = await window.api.compareDeploymentFolders({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        ignorePatterns: state.currentDeployment.ignore_patterns
      });

      if (!res.success) {
        showAlert(`Error comparando carpetas: ${res.error}`, 'danger', 8000);
        state.comparison = null;
        return;
      }

      state.comparison = res;
      updateToolbarBadges(res.stats);
      renderFileList();

      const changedFiles = res.files.filter(f => f.status !== 'identical');
      if (changedFiles.length > 0) {
        dom.syncAllBtn.disabled = false;
        if (state.activeFile) {
          const match = changedFiles.find(f => f.relativePath === state.activeFile.relativePath);
          if (match) {
            selectFileForDiff(match);
          } else {
            selectFileForDiff(changedFiles[0]);
          }
        } else {
          selectFileForDiff(changedFiles[0]);
        }
      } else {
        dom.syncAllBtn.disabled = true;
        state.activeFile = null;
        state.activeDiff = null;
        dom.diffEmptySelection.style.display = 'flex';
        dom.diffViewerContent.style.display = 'none';
      }
    } catch (err) {
      showAlert(`Error inesperado en comparación: ${err.message}`, 'danger', 8000);
    } finally {
      state.isComparing = false;
      dom.diffLoadingFiles.style.display = 'none';
    }
  }

  function updateToolbarBadges(stats) {
    if (!stats) return;
    dom.badgeAll.textContent = stats.changed;
    dom.badgeModified.textContent = stats.modified;
    dom.badgeAdded.textContent = stats.added;
    dom.badgeDeleted.textContent = stats.deleted;
  }

  /**
   * Renderiza la lista de ficheros modificados según el filtro actual y la búsqueda
   */
  
  async function stageSingleFile(f) {
    try {
      const rawContents = await window.api.getFileRawContents({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        relativePath: f.relativePath
      });
      state.stagedContent[f.relativePath] = rawContents.sourceText;
      state.stagedStatus[f.relativePath] = 'full';
      renderFileList();
      
      if (state.activeFile && state.activeFile.relativePath === f.relativePath) {
        selectFileForDiff(f, 'staged');
      }
    } catch (e) { console.error(e); }
  }

  function unstageSingleFile(f) {
    delete state.stagedContent[f.relativePath];
    delete state.stagedStatus[f.relativePath];
    renderFileList();
    
    if (state.activeFile && state.activeFile.relativePath === f.relativePath) {
      selectFileForDiff(f, 'unstaged');
    }
  }

  function renderFileList() {
    if (!state.comparison) return;

    let files = state.comparison.files.filter(f => f.status !== 'identical');

    if (state.currentFilter !== 'all') {
      files = files.filter(f => f.status === state.currentFilter);
    }
    if (state.currentSearch) {
      files = files.filter(f => f.relativePath.toLowerCase().includes(state.currentSearch));
    }

    if (dom.unstagedFileList) dom.unstagedFileList.innerHTML = '';
    if (dom.stagedFileList) dom.stagedFileList.innerHTML = '';

    const unstagedFiles = [];
    const stagedFiles = [];

    files.forEach(file => {
      const sStatus = state.stagedStatus[file.relativePath];
      if (sStatus === 'full') {
        stagedFiles.push(file);
      } else if (sStatus === 'partial') {
        unstagedFiles.push(file);
        stagedFiles.push(file);
      } else {
        unstagedFiles.push(file);
      }
    });

    if (dom.unstagedCount) dom.unstagedCount.textContent = unstagedFiles.length;
    if (dom.stagedCount) dom.stagedCount.textContent = stagedFiles.length;
    if (dom.commitDeployBtn) dom.commitDeployBtn.disabled = stagedFiles.length === 0;

    const createItem = (file, context) => {
      const item = document.createElement('div');
      item.className = 'diff-file-item';
      if (state.activeFile && state.activeFile.relativePath === file.relativePath && state.activeViewContext === context) {
        item.classList.add('active');
      }

      const statusBadge = getStatusBadgeHTML(file.status);
      const filename = file.relativePath.split('/').pop() || file.relativePath;
      const dirname = file.relativePath.includes('/') ? file.relativePath.substring(0, file.relativePath.lastIndexOf('/')) : '';
      
      const actionText = context === 'unstaged' ? 'Stage' : 'Unstage';

      item.innerHTML = `
        <div class="file-item-main" title="${file.relativePath}">
          ${statusBadge}
          <div class="file-item-names">
            <span class="file-item-title">${escapeHTML(filename)}</span>
            ${dirname ? `<span class="file-item-dir">${escapeHTML(dirname)}</span>` : ''}
          </div>
        </div>
        <button class="file-quick-action-btn" type="button" title="${actionText} file">${actionText}</button>
      `;

      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('file-quick-action-btn')) {
          e.stopPropagation();
          if (context === 'unstaged') {
            stageSingleFile(file);
          } else {
            unstageSingleFile(file);
          }
          return;
        }
        selectFileForDiff(file, context);
      });
      return item;
    };

    if (unstagedFiles.length === 0 && dom.unstagedFileList) {
      dom.unstagedFileList.innerHTML = '<div class="diff-empty-files-hint"><span>No unstaged changes</span></div>';
    } else if (dom.unstagedFileList) {
      unstagedFiles.forEach(f => dom.unstagedFileList.appendChild(createItem(f, 'unstaged')));
    }

    if (stagedFiles.length === 0 && dom.stagedFileList) {
      dom.stagedFileList.innerHTML = '<div class="diff-empty-files-hint"><span>No staged changes</span></div>';
    } else if (dom.stagedFileList) {
      stagedFiles.forEach(f => dom.stagedFileList.appendChild(createItem(f, 'staged')));
    }
  }

  function getStatusBadgeHTML(status) {
    if (status === 'modified') {
      return `<span class="file-badge file-badge--modified" title="Modificado">M</span>`;
    } else if (status === 'added') {
      return `<span class="file-badge file-badge--added" title="Añadido en entrada / nuevo">+</span>`;
    } else if (status === 'deleted') {
      return `<span class="file-badge file-badge--deleted" title="Eliminado / solo en salida">&minus;</span>`;
    }
    return '';
  }

  /**
   * Selecciona un archivo y carga el editor doble y diff
   */
  async function selectFileForDiff(file, context = 'unstaged') {
    state.activeFile = file;
    state.activeViewContext = context;
    renderFileList();

    dom.diffEmptySelection.style.display = 'none';
    dom.diffViewerContent.style.display = 'flex';
    dom.diffLoadingContent.style.display = 'flex';
    dom.diffBinaryNotice.style.display = 'none';
    dom.splitEditorView.style.display = 'none';
    dom.unifiedDiffContainer.style.display = 'none';

    dom.activeFilePath.textContent = file.relativePath;
    dom.activeFilePath.setAttribute('title', file.relativePath);
    dom.activeFileStatusBadge.className = `file-status-badge file-status-badge--${file.status}`;
    dom.activeFileStatusBadge.textContent = file.status === 'modified' ? 'Modificado' : (file.status === 'added' ? 'Nuevo en Entrada' : 'Solo en Salida');
    dom.statAdditions.textContent = '+0';
    dom.statDeletions.textContent = '-0';

    try {
      const rawContents = await window.api.getFileRawContents({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        relativePath: file.relativePath
      });

      if (!rawContents || rawContents.error) {
        showAlert(`Error leyendo fichero: ${rawContents?.error || 'Desconocido'}`, 'danger');
        return;
      }

      let customSourceText = undefined;
      let customTargetText = undefined;

      if (context === 'unstaged') {
        customSourceText = rawContents.sourceText;
        customTargetText = state.stagedContent.hasOwnProperty(file.relativePath)
          ? state.stagedContent[file.relativePath]
          : rawContents.targetText;
      } else {
        customSourceText = state.stagedContent.hasOwnProperty(file.relativePath)
          ? state.stagedContent[file.relativePath]
          : rawContents.targetText;
        customTargetText = rawContents.targetText;
      }

      const diffResult = await window.api.getFileDiff({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        relativePath: file.relativePath,
        options: { customSourceText, customTargetText }
      });

      if (!diffResult || diffResult.error) {
        showAlert(`Error calculando diff: ${diffResult?.error || 'Desconocido'}`, 'danger');
        return;
      }

      state.activeDiff = diffResult;
      state.sourceText = customSourceText;
      state.targetOriginalText = customTargetText;
      state.hasUnsavedChanges = false;

      if (diffResult.isBinary) {
        dom.passAllBtn.style.display = 'none';
        dom.revertBtn.style.display = 'none';
        dom.saveToTargetBtn.style.display = 'none';
        dom.viewSplitEditorBtn.parentElement.style.display = 'none';
        renderBinaryDiff(diffResult);
      } else {
        dom.passAllBtn.style.display = 'inline-flex';
        dom.revertBtn.style.display = 'inline-flex';
        dom.saveToTargetBtn.style.display = 'inline-flex';
        dom.viewSplitEditorBtn.parentElement.style.display = 'inline-flex';

        dom.statAdditions.textContent = `+${diffResult.stats.additions}`;
        dom.statDeletions.textContent = `-${diffResult.stats.deletions}`;

        dom.targetEditorTextarea.value = customTargetText;
        setSaveStatus('synced', '● Archivo listo para preparar');
        
        dom.saveToTargetBtn.innerHTML = context === 'unstaged' ? '💾 Stage Changes (Preparar)' : '💾 Update Stage (Actualizar)';

        dom.diffLoadingContent.style.display = 'none';
        switchViewMode(state.viewMode);
      }
    } catch (err) {
      showAlert(`Error de red/sistema: ${err.message}`, 'danger');
    }
  }

  function switchViewMode(mode) {
    state.viewMode = mode;
    dom.viewSplitEditorBtn.classList.toggle('active', mode === 'split');
    dom.viewUnifiedDiffBtn.classList.toggle('active', mode === 'unified');

    if (mode === 'split') {
      dom.splitEditorView.style.display = 'grid';
      dom.unifiedDiffContainer.style.display = 'none';
      renderSplitEditor();
    } else {
      dom.splitEditorView.style.display = 'none';
      dom.unifiedDiffContainer.style.display = 'block';
      renderUnifiedDiffTable();
    }
  }

  /**
   * Actualiza el badge indicador de estado de guardado
   */
  function setSaveStatus(status, text) {
    if (!dom.saveStatusIndicator) return;
    if (status === 'synced') {
      dom.saveStatusIndicator.className = 'save-status-pill save-status-pill--synced';
      dom.saveStatusIndicator.textContent = text || '● Guardado en Salida';
      dom.saveToTargetBtn.classList.remove('btn-pulse');
    } else {
      dom.saveStatusIndicator.className = 'save-status-pill save-status-pill--unsaved';
      dom.saveStatusIndicator.textContent = text || '● ⚠️ Cambios sin guardar en disco - Pulsa "Guardar en Salida (OK)"';
      dom.saveToTargetBtn.classList.add('btn-pulse');
    }
  }

  /**
   * Renderiza el panel izquierdo de Entrada con botones interactivos [➔ Pasar]
   */
  function renderSplitEditor() {
    const container = dom.sourceCodeView;
    container.innerHTML = '';

    const diffLines = state.activeDiff?.diffLines || [];
    if (diffLines.length === 0) {
      container.innerHTML = '<div class="panel-empty-hint">El archivo no tiene líneas o está vacío.</div>';
      return;
    }

    // Filtrar solo líneas que pertenecen a Entrada (unchanged ' ' y added '+')
    diffLines.forEach((line) => {
      // Líneas borradas en Entrada (existen solo en Salida)
      if (line.type === '-') {
        return;
      }

      const row = document.createElement('div');
      const isAdd = line.type === '+';
      row.className = `source-line-row ${isAdd ? 'source-line-row--added' : ''}`;

      if (isAdd) {
        row.innerHTML = `
          <span class="source-line-num">${line.newLineNo || ''}</span>
          <button class="line-pass-btn" type="button" title="Copiar esta línea al editor de Salida">➔ Pasar</button>
          <code class="source-line-code">${escapeHTML(line.content)}</code>
        `;

        const passBtn = row.querySelector('.line-pass-btn');
        passBtn.addEventListener('click', () => {
          passLineToTargetEditor(line.content, line.newLineNo);
        });
      } else {
        row.innerHTML = `
          <span class="source-line-num">${line.newLineNo || ''}</span>
          <span class="source-line-spacer"></span>
          <code class="source-line-code">${escapeHTML(line.content)}</code>
        `;
      }

      container.appendChild(row);
    });
  }

  /**
   * Pasa una línea o texto al editor de Salida
   */
  function passLineToTargetEditor(lineContent, approxLineNo) {
    const editor = dom.targetEditorTextarea;
    const lines = editor.value.split('\n');

    // Si la línea aproximada existe, la reemplazamos o añadimos
    const targetIdx = Math.max(0, Math.min(lines.length, (approxLineNo || 1) - 1));

    if (targetIdx < lines.length) {
      lines[targetIdx] = lineContent;
    } else {
      lines.push(lineContent);
    }

    editor.value = lines.join('\n');
    state.hasUnsavedChanges = true;
    updateTargetEditorGutter();
    setSaveStatus('unsaved', '● ⚠️ Línea transferida - Pulsa "Guardar en Salida (OK)"');

    // Posicionar cursor y seleccionar la línea en el editor de salida para dar visibilidad total
    let charOffset = 0;
    for (let i = 0; i < targetIdx; i++) {
      charOffset += lines[i].length + 1;
    }
    const lineEnd = charOffset + lineContent.length;
    editor.focus();
    editor.setSelectionRange(charOffset, lineEnd);

    showAlert('Línea transferida al editor de Salida. Puedes modificarla si lo deseas y pulsar "💾 Guardar en Salida (OK)".', 'info', 3000);
  }

  /**
   * Copia todo el contenido de Entrada en el editor de Salida
   */
  function passAllToTarget() {
    dom.targetEditorTextarea.value = state.sourceText;
    state.hasUnsavedChanges = true;
    updateTargetEditorGutter();
    setSaveStatus('unsaved', '● ⚠️ Todo copiado de Entrada - Pulsa "Guardar en Salida (OK)"');
    showAlert('Todo el contenido de Entrada se ha copiado al editor de Salida. Pulsa "💾 Guardar en Salida (OK)" para aplicar a disco.', 'info', 4000);
  }

  /**
   * Restaura el editor de Salida al estado original de disco
   */
  function revertToTargetOriginal() {
    dom.targetEditorTextarea.value = state.targetOriginalText;
    state.hasUnsavedChanges = false;
    updateTargetEditorGutter();
    setSaveStatus('synced', '● Guardado en Salida');
    showAlert('Editor restaurado al estado actual del fichero en disco.', 'info', 2500);
  }

  /**
   * Guarda y aplica el contenido del editor en el archivo de destino en disco (DAR EL OK)
   */
  async function saveToTargetFile() {
    if (!state.currentDeployment || !state.activeFile) return;

    const content = dom.targetEditorTextarea.value;
    state.stagedContent[state.activeFile.relativePath] = content;

    try {
      const rawContents = await window.api.getFileRawContents({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        relativePath: state.activeFile.relativePath
      });
      
      if (content === rawContents.sourceText) {
        state.stagedStatus[state.activeFile.relativePath] = 'full';
      } else if (content === rawContents.targetText) {
        delete state.stagedContent[state.activeFile.relativePath];
        delete state.stagedStatus[state.activeFile.relativePath];
      } else {
        state.stagedStatus[state.activeFile.relativePath] = 'partial';
      }

      state.hasUnsavedChanges = false;
      setSaveStatus('synced', '● Staged (Preparado en memoria)');
      showAlert(`✓ Archivo "${state.activeFile.relativePath}" preparado en staging.`, 'success', 3000);
      
      renderFileList(); 
    } catch (err) {
      showAlert(`Error al preparar: ${err.message}`, 'danger');
    }
  }

  async function stageAllFiles() {
    if (!state.comparison) return;
    const files = state.comparison.files.filter(f => f.status !== 'identical');
    for (const f of files) {
       const rawContents = await window.api.getFileRawContents({
          sourcePath: state.currentDeployment.source_path,
          targetPath: state.currentDeployment.target_path,
          relativePath: f.relativePath
       });
       state.stagedContent[f.relativePath] = rawContents.sourceText;
       state.stagedStatus[f.relativePath] = 'full';
    }
    renderFileList();
    showAlert(`Todos los archivos preparados.`, 'success');
  }

  function unstageAllFiles() {
    state.stagedContent = {};
    state.stagedStatus = {};
    renderFileList();
    showAlert(`Se han revertido todos los archivos del staging.`, 'info');
  }

  async function commitDeploy() {
    const stagedKeys = Object.keys(state.stagedContent);
    if (stagedKeys.length === 0) return;

    const confirmCommit = window.confirm(`¿Desplegar ${stagedKeys.length} ficheros a la carpeta de salida permanentemente?`);
    if (!confirmCommit) return;

    dom.commitDeployBtn.disabled = true;
    dom.commitDeployBtn.innerHTML = 'Desplegando...';

    let successCount = 0;
    for (const relPath of stagedKeys) {
       const res = await window.api.saveCustomDeploymentFile({
          targetPath: state.currentDeployment.target_path,
          relativePath: relPath,
          content: state.stagedContent[relPath]
       });
       if (res.success) successCount++;
    }

    state.stagedContent = {};
    state.stagedStatus = {};
    dom.commitDeployBtn.innerHTML = 'Desplegar Cambios';
    dom.commitDeployBtn.disabled = false;
    
    showAlert(`🚀 ${successCount} archivos desplegados en Salida.`, 'success');
    await runFolderComparison();
  }

  /**
   * Actualiza el contador de líneas y el gutter numérico del editor
   */
  
  function computeLineLCS(oldLines, newLines) {
    const m = oldLines.length;
    const n = newLines.length;
    if (m * n > 100000) return []; // Fallback para no bloquear
    
    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldLines[i - 1] === newLines[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }
    
    let i = m;
    let j = n;
    const addedIndices = new Set();
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        addedIndices.add(j - 1);
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        i--;
      }
    }
    return addedIndices;
  }

  function updateTargetEditorGutter() {
    const text = dom.targetEditorTextarea.value || '';
    const oldText = state.targetOriginalText || '';
    
    const newLines = text.split('\n');
    const oldLines = oldText.split('\n');
    
    const addedIndices = computeLineLCS(oldLines, newLines);
    const linesCount = newLines.length;
    
    let gutterHTML = '';
    for (let i = 0; i < linesCount; i++) {
      const isAdded = addedIndices instanceof Set ? addedIndices.has(i) : false;
      const className = isAdded ? 'gutter-added' : '';
      gutterHTML += `<div class="${className}">${i + 1}</div>`;
    }
    
    dom.editorGutter.innerHTML = gutterHTML;
    dom.targetEditorStats.textContent = `Líneas: ${linesCount} | Caracteres: ${text.length}`;
  }


  function handleEditorInput() {
    state.hasUnsavedChanges = true;
    setSaveStatus('unsaved', '● ⚠️ Editando - Pulsa "Guardar en Salida (OK)" para aplicar a disco');
    updateTargetEditorGutter();
  }

  /**
   * Computa las diferencias en línea a nivel de carácter usando LCS
   */
  function computeInlineDiff(oldStr, newStr) {
    if (oldStr === newStr) return { oldStr: escapeHTML(oldStr), newStr: escapeHTML(newStr) };
    const m = oldStr.length;
    const n = newStr.length;
    // Fallback para líneas muy largas para no bloquear el UI (ej. 1000x1000 chars = 1M)
    if (m * n > 1000000) return { oldStr: escapeHTML(oldStr), newStr: escapeHTML(newStr) };

    const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        if (oldStr[i - 1] === newStr[j - 1]) {
          dp[i][j] = dp[i - 1][j - 1] + 1;
        } else {
          dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
        }
      }
    }

    let i = m;
    let j = n;
    const diff = [];
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && oldStr[i - 1] === newStr[j - 1]) {
        diff.push({ type: ' ', char: oldStr[i - 1] });
        i--;
        j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        diff.push({ type: '+', char: newStr[j - 1] });
        j--;
      } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
        diff.push({ type: '-', char: oldStr[i - 1] });
        i--;
      }
    }
    diff.reverse();

    let oldRes = '';
    let newRes = '';
    let currentOldType = null;
    let currentNewType = null;
    let oldAcc = '';
    let newAcc = '';

    const closeSpan = () => '</span>';
    const openSpan = (type) => `<span class="inline-diff-${type}">`;

    for (const item of diff) {
      if (item.type === ' ') {
        if (currentOldType === '-') { oldRes += openSpan('del') + escapeHTML(oldAcc) + closeSpan(); oldAcc = ''; currentOldType = null; }
        if (currentNewType === '+') { newRes += openSpan('add') + escapeHTML(newAcc) + closeSpan(); newAcc = ''; currentNewType = null; }
        oldRes += escapeHTML(item.char);
        newRes += escapeHTML(item.char);
      } else if (item.type === '-') {
        if (currentOldType !== '-') { currentOldType = '-'; }
        oldAcc += item.char;
      } else if (item.type === '+') {
        if (currentNewType !== '+') { currentNewType = '+'; }
        newAcc += item.char;
      }
    }
    if (currentOldType === '-') { oldRes += openSpan('del') + escapeHTML(oldAcc) + closeSpan(); }
    if (currentNewType === '+') { newRes += openSpan('add') + escapeHTML(newAcc) + closeSpan(); }

    return { oldStr: oldRes, newStr: newRes };
  }

  /**
   * Renderiza el visor tradicional de diff unificado
   */
  
  
  async function performLineStage(hunkIdx, lineIdxWithinHunk, isStaging) {
    if (!state.currentDeployment || !state.activeFile || !state.activeDiff) return;
    
    const hunk = state.activeDiff.hunks[hunkIdx];
    if (!hunk) return;

    let baseText = state.stagedContent[state.activeFile.relativePath] || state.targetOriginalText;
    const lines = baseText.split(/\r?\n/);
    
    let linesBefore, linesAfter, replacementLines = [];
    
    if (isStaging) {
      linesBefore = lines.slice(0, hunk.oldStart - 1);
      linesAfter = lines.slice(hunk.oldStart - 1 + hunk.oldLinesCount);
      
      hunk.lines.forEach((l, idx) => {
        if (l.type === ' ') {
          replacementLines.push(l.content);
        } else if (l.type === '-') {
          if (idx === lineIdxWithinHunk) {
             // Stage this deletion -> do NOT include it
          } else {
             // Do not stage this deletion yet -> INCLUDE the original base line
             replacementLines.push(l.content);
          }
        } else if (l.type === '+') {
          if (idx === lineIdxWithinHunk) {
             // Stage this addition -> INCLUDE it
             replacementLines.push(l.content);
          } else {
             // Do not stage this addition yet -> do NOT include it
          }
        }
      });
    } else {
      linesBefore = lines.slice(0, hunk.newStart - 1);
      linesAfter = lines.slice(hunk.newStart - 1 + hunk.newLinesCount);
      
      hunk.lines.forEach((l, idx) => {
        if (l.type === ' ') {
          replacementLines.push(l.content);
        } else if (l.type === '+') {
          if (idx === lineIdxWithinHunk) {
             // Unstage this addition -> do NOT include it (revert)
          } else {
             // Do not unstage yet -> INCLUDE the original staged line
             replacementLines.push(l.content);
          }
        } else if (l.type === '-') {
          if (idx === lineIdxWithinHunk) {
             // Unstage this deletion -> INCLUDE it (revert deletion)
             replacementLines.push(l.content);
          } else {
             // Do not unstage yet -> do NOT include it
          }
        }
      });
    }
    
    const newContent = [...linesBefore, ...replacementLines, ...linesAfter].join('\n');
    state.stagedContent[state.activeFile.relativePath] = newContent;
    
    try {
      const rawContents = await window.api.getFileRawContents({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        relativePath: state.activeFile.relativePath
      });
      if (newContent === rawContents.sourceText) {
        state.stagedStatus[state.activeFile.relativePath] = 'full';
      } else if (newContent === rawContents.targetText) {
        delete state.stagedContent[state.activeFile.relativePath];
        delete state.stagedStatus[state.activeFile.relativePath];
      } else {
        state.stagedStatus[state.activeFile.relativePath] = 'partial';
      }
    } catch (e) { console.error(e); }
    
    selectFileForDiff(state.activeFile, state.activeViewContext);
  }

  async function performHunkStage(hunkIdx, isStaging) {
    if (!state.currentDeployment || !state.activeFile || !state.activeDiff) return;
    
    const hunk = state.activeDiff.hunks[hunkIdx];
    if (!hunk) return;

    let baseText = state.sourceText;
    if (isStaging) {
      // In unstaged context, base is stagedContent or targetOriginalText
      baseText = state.stagedContent[state.activeFile.relativePath] || state.targetOriginalText;
    } else {
      // In staged context, base is stagedContent
      baseText = state.stagedContent[state.activeFile.relativePath] || state.targetOriginalText;
    }

    const lines = baseText.split(/\r?\n/);
    
    // Si isStaging, quitamos las lineas viejas (-) y metemos las nuevas (+)
    // Wait, hunk.oldStart is based on baseText!
    let linesBefore, linesAfter, replacementLines;
    
    if (isStaging) {
      linesBefore = lines.slice(0, hunk.oldStart - 1);
      linesAfter = lines.slice(hunk.oldStart - 1 + hunk.oldLinesCount);
      replacementLines = hunk.lines.filter(l => l.type !== '-').map(l => l.content);
    } else {
      linesBefore = lines.slice(0, hunk.newStart - 1);
      linesAfter = lines.slice(hunk.newStart - 1 + hunk.newLinesCount);
      replacementLines = hunk.lines.filter(l => l.type !== '+').map(l => l.content);
    }
    
    const newContent = [...linesBefore, ...replacementLines, ...linesAfter].join('\n');
    state.stagedContent[state.activeFile.relativePath] = newContent;
    
    // Update staged status based on if it matches source text
    try {
      const rawContents = await window.api.getFileRawContents({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        relativePath: state.activeFile.relativePath
      });
      
      if (newContent === rawContents.sourceText) {
        state.stagedStatus[state.activeFile.relativePath] = 'full';
      } else if (newContent === rawContents.targetText) {
        delete state.stagedContent[state.activeFile.relativePath];
        delete state.stagedStatus[state.activeFile.relativePath];
      } else {
        state.stagedStatus[state.activeFile.relativePath] = 'partial';
      }
    } catch (e) {
      console.error(e);
      state.stagedStatus[state.activeFile.relativePath] = 'partial';
    }
    
    // Re-select the file to trigger re-diff
    selectFileForDiff(state.activeFile, state.activeViewContext);
  }

  function renderUnifiedDiffTable() {
    const container = dom.unifiedDiffContainer;
    const diffLines = state.activeDiff?.diffLines || [];
    const hunks = state.activeDiff?.hunks || [];
    const isUnstagedContext = state.activeViewContext === 'unstaged';

    if (diffLines.length === 0 || hunks.length === 0) {
      container.innerHTML = '<div class="diff-no-changes">Los archivos son idénticos o están vacíos.</div>';
      return;
    }

    let html = '<table class="diff-table diff-table--unified"><tbody>';

    for (const hunk of hunks) {
      html += `
        <tr class="diff-row diff-row--hunk-header">
          <td class="diff-line-num"></td>
          <td class="diff-line-num"></td>
          <td class="diff-line-sign"></td>
          <td class="diff-line-code">
            <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; padding-right: 16px;">
              <span>@@ -${hunk.oldStart},${hunk.oldLinesCount} +${hunk.newStart},${hunk.newLinesCount} @@</span>
              <button class="btn-stage-hunk" data-hunk-idx="${hunks.indexOf(hunk)}">${isUnstagedContext ? 'Stage Bulk' : 'Unstage Bulk'}</button>
            </div>
          </td>
        </tr>
      `;
      
      const lines = hunk.lines;
      const processedLines = lines.map(l => ({ ...l, htmlContent: escapeHTML(l.content) }));
      
      let i = 0;
      while (i < processedLines.length) {
        if (processedLines[i].type === '-') {
          let delCount = 0;
          while (i + delCount < processedLines.length && processedLines[i + delCount].type === '-') delCount++;
          let addCount = 0;
          while (i + delCount + addCount < processedLines.length && processedLines[i + delCount + addCount].type === '+') addCount++;
          
          if (delCount > 0 && addCount > 0 && delCount === addCount) {
            for (let k = 0; k < delCount; k++) {
              const oldLine = processedLines[i + k];
              const newLine = processedLines[i + delCount + k];
              const inlineDiff = computeInlineDiff(oldLine.content, newLine.content);
              oldLine.htmlContent = inlineDiff.oldStr;
              newLine.htmlContent = inlineDiff.newStr;
            }
          }
          i += delCount + addCount;
        } else {
          i++;
        }
      }

      for (const l of processedLines) {
        let rowClass = 'diff-row';
        let sign = ' ';

        if (l.type === '+') {
          rowClass += ' diff-row--add';
          sign = '+';
        } else if (l.type === '-') {
          rowClass += ' diff-row--del';
          sign = '-';
        }

        const oldNum = l.oldLineNo !== null ? l.oldLineNo : '';
        const newNum = l.newLineNo !== null ? l.newLineNo : '';

        html += `
          <tr class="${rowClass}">
            <td class="diff-line-num diff-line-num--old">${oldNum}</td>
            <td class="diff-line-num diff-line-num--new">${newNum}</td>
            <td class="diff-line-sign">${sign}</td>
            <td class="diff-line-code">${l.htmlContent}</td>
          </tr>
        `;
      }
    }

    html += '</tbody></table>';
    container.innerHTML = html;
    container.querySelectorAll('.btn-stage-line').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const hIdx = parseInt(btn.getAttribute('data-hunk-idx'), 10);
        const lIdx = parseInt(btn.getAttribute('data-line-idx'), 10);
        performLineStage(hIdx, lIdx, isUnstagedContext);
      });
    });
    
    container.querySelectorAll('.btn-stage-hunk').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.getAttribute('data-hunk-idx'), 10);
        performHunkStage(idx, isUnstagedContext);
      });
    });
  }

  function renderBinaryDiff(diffResult) {
    dom.splitEditorView.style.display = 'none';
    dom.unifiedDiffContainer.style.display = 'none';
    dom.diffBinaryNotice.style.display = 'block';

    const ext = diffResult.relativePath.split('.').pop()?.toLowerCase();
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico'].includes(ext);

    dom.binaryDetails.textContent = `Archivo binario (${ext ? ext.toUpperCase() : 'desconocido'}). Tamaño entrada: ${formatBytes(diffResult.sourceSize)} | Tamaño salida: ${formatBytes(diffResult.targetSize)}`;

    if (isImage) {
      dom.imagePreviewContainer.style.display = 'flex';
      const srcUrl = state.currentDeployment.source_path + '/' + diffResult.relativePath;
      const tgtUrl = state.currentDeployment.target_path + '/' + diffResult.relativePath;
      dom.imgSourcePreview.src = diffResult.sourceExists ? `file://${srcUrl}` : '';
      dom.imgTargetPreview.src = diffResult.targetExists ? `file://${tgtUrl}` : '';
    } else {
      dom.imagePreviewContainer.style.display = 'none';
    }
  }

  /**
   * Modal de confirmación para sincronizar todos los ficheros modificados/nuevos
   */
  function openConfirmSyncModal() {
    if (!state.comparison) return;
    const changed = state.comparison.files.filter(f => f.status !== 'identical');
    if (changed.length === 0) return;

    dom.confirmSyncCount.textContent = changed.length;
    dom.confirmSyncList.innerHTML = '';

    changed.slice(0, 30).forEach(f => {
      const li = document.createElement('li');
      li.textContent = `[${f.status === 'added' ? '+' : (f.status === 'deleted' ? '-' : 'M')}] ${f.relativePath}`;
      dom.confirmSyncList.appendChild(li);
    });

    if (changed.length > 30) {
      const li = document.createElement('li');
      li.innerHTML = `<em>... y otros ${changed.length - 30} ficheros más.</em>`;
      dom.confirmSyncList.appendChild(li);
    }

    dom.confirmSyncModal.classList.add('active');
  }

  function closeConfirmSyncModal() {
    dom.confirmSyncModal.classList.remove('active');
  }

  async function executeBatchSync() {
    if (!state.currentDeployment || !state.comparison) return;
    const changed = state.comparison.files.filter(f => f.status !== 'identical');
    if (changed.length === 0) return;

    dom.executeSyncBtn.disabled = true;
    dom.executeSyncBtn.textContent = 'Desplegando...';

    try {
      const res = await window.api.syncAllDeploymentFiles({
        sourcePath: state.currentDeployment.source_path,
        targetPath: state.currentDeployment.target_path,
        files: changed
      });

      closeConfirmSyncModal();

      if (res.success) {
        showAlert(`¡Despliegue completado! ${res.syncedCount} ficheros sincronizados a la carpeta de salida.`, 'success', 6000);
      } else {
        showAlert(`Despliegue parcial: ${res.syncedCount} ficheros sincronizados, ${res.errors.length} errores.`, 'warning', 8000);
      }

      await runFolderComparison();
    } catch (err) {
      showAlert(`Error en despliegue por lotes: ${err.message}`, 'danger');
    } finally {
      dom.executeSyncBtn.disabled = false;
      dom.executeSyncBtn.textContent = '✓ Dar OK y Desplegar';
    }
  }

  /**
   * Gestión de CRUD del Modal de Despliegue
   */
  
  function renderModalTags() {
    if (!dom.deploymentTagsWrapper) return;
    dom.deploymentTagsWrapper.innerHTML = '';
    state.currentModalTags.forEach((t, i) => {
      const badge = document.createElement('span');
      badge.className = 'badge badge-outline';
      badge.style.display = 'flex';
      badge.style.alignItems = 'center';
      badge.style.gap = '4px';
      badge.innerHTML = `
        ${escapeHTML(t)}
        <span class="tag-remove-btn" data-index="${i}" style="cursor:pointer; font-weight:bold; margin-left:2px;">&times;</span>
      `;
      dom.deploymentTagsWrapper.appendChild(badge);
    });
    
    dom.deploymentTagsWrapper.querySelectorAll('.tag-remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const i = parseInt(e.target.getAttribute('data-index'), 10);
        state.currentModalTags.splice(i, 1);
        renderModalTags();
      });
    });
  }

  function setupTagInputListeners() {
    if (dom.deploymentTagsInput) {
      dom.deploymentTagsInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          const val = dom.deploymentTagsInput.value.trim().replace(/^,+|,+$/g, '');
          if (val && !state.currentModalTags.includes(val)) {
            state.currentModalTags.push(val);
            renderModalTags();
          }
          dom.deploymentTagsInput.value = '';
        }
      });
      dom.deploymentTagsInput.addEventListener('blur', (e) => {
        const val = dom.deploymentTagsInput.value.trim().replace(/^,+|,+$/g, '');
        if (val && !state.currentModalTags.includes(val)) {
          state.currentModalTags.push(val);
          renderModalTags();
        }
        dom.deploymentTagsInput.value = '';
      });
    }
  }

  function openCreateModal() {
    dom.deploymentModalTitle.textContent = 'Nuevo Despliegue';
    dom.deploymentId.value = '';
    dom.deploymentName.value = '';
    dom.deploymentSourcePath.value = '';
    dom.deploymentTargetPath.value = '';
    dom.deploymentIgnorePatterns.value = '.git,.github,node_modules,dist,build,target,.DS_Store';
    state.currentModalTags = [];
    if (dom.deploymentTagsInput) dom.deploymentTagsInput.value = '';
    renderModalTags();
    dom.deploymentModal.classList.add('active');
    dom.deploymentName.focus();
  }

  function openEditModal(d) {
    dom.deploymentModalTitle.textContent = 'Editar Despliegue';
    dom.deploymentId.value = d.id;
    dom.deploymentName.value = d.name;
    dom.deploymentSourcePath.value = d.source_path;
    dom.deploymentTargetPath.value = d.target_path;
    dom.deploymentIgnorePatterns.value = d.ignore_patterns || '.git,.github,node_modules,dist,build,target,.DS_Store';
    state.currentModalTags = Array.isArray(d.tags) ? [...d.tags] : [];
    if (dom.deploymentTagsInput) dom.deploymentTagsInput.value = '';
    renderModalTags();
    dom.deploymentModal.classList.add('active');
    dom.deploymentName.focus();
  }

  function closeDeploymentModal() {
    dom.deploymentModal.classList.remove('active');
  }

  async function handleSaveDeployment(e) {
    e.preventDefault();
    const id = dom.deploymentId.value ? parseInt(dom.deploymentId.value, 10) : null;
    const name = dom.deploymentName.value.trim();
    const source_path = dom.deploymentSourcePath.value.trim();
    const target_path = dom.deploymentTargetPath.value.trim();
    const ignore_patterns = dom.deploymentIgnorePatterns.value.trim();
    // Flush any pending input text in case they didn't press Enter
    const pendingTag = dom.deploymentTagsInput ? dom.deploymentTagsInput.value.trim().replace(/^,+|,+$/g, '') : '';
    if (pendingTag && !state.currentModalTags.includes(pendingTag)) {
      state.currentModalTags.push(pendingTag);
    }
    const tags = [...state.currentModalTags];

    if (!name || !source_path || !target_path) {
      showAlert('Por favor, completa todos los campos requeridos (*)', 'warning');
      return;
    }

    try {
      if (id) {
        await window.api.updateDeployment(id, { name, source_path, target_path, ignore_patterns, tags });
        showAlert(`Despliegue "${name}" actualizado.`, 'success');
        closeDeploymentModal();
        if (state.currentDeployment && state.currentDeployment.id === id) {
          await loadDeployments(id);
        } else {
          await loadDeployments();
        }
      } else {
        const created = await window.api.createDeployment({ name, source_path, target_path, ignore_patterns, tags });
        showAlert(`Despliegue "${name}" creado con éxito.`, 'success');
        closeDeploymentModal();
        await loadDeployments(created.id);
      }
    } catch (err) {
      showAlert(`Error guardando despliegue: ${err.message}`, 'danger');
    }
  }

  async function handleDeleteDeployment(d) {
    const confirmDelete = window.confirm(`¿Estás seguro de que deseas eliminar el despliegue "${d.name}"?\n(Esta acción no borrará los archivos de tu disco)`);
    if (!confirmDelete) return;

    try {
      await window.api.deleteDeployment(d.id);
      showAlert(`Despliegue "${d.name}" eliminado.`, 'info');
      state.currentDeployment = null;
      await loadDeployments();
    } catch (err) {
      showAlert(`Error eliminando despliegue: ${err.message}`, 'danger');
    }
  }

  /**
   * Utilidades de UI
   */
  let alertTimeout = null;
  function showAlert(message, type = 'info', duration = 4000) {
    if (alertTimeout) clearTimeout(alertTimeout);
    dom.alert.className = `deployment-alert deployment-alert--${type}`;
    dom.alert.textContent = message;
    dom.alert.style.display = 'block';

    if (duration > 0) {
      alertTimeout = setTimeout(() => {
        dom.alert.style.display = 'none';
      }, duration);
    }
  }

  function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
})();

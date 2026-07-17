// dashboard.js - Dashboard con todas las tareas
let allTasks = [];
let filteredTasks = [];
let sortColumn = 'created_at';
let sortDirection = 'desc';
let editingTaskId = null;
let taskImages = [];

// Elementos del DOM
const tasksTableBody = document.getElementById('tasksTableBody');
const filterMainProject = document.getElementById('filterMainProject');
const filterSubProject = document.getElementById('filterSubProject');
const filterStatus = document.getElementById('filterStatus');
const filterCriticality = document.getElementById('filterCriticality');
const searchTasks = document.getElementById('searchTasks');
const sortableHeaders = document.querySelectorAll('.sortable');

// Variable para almacenar proyectos
let allProjects = [];

// Configurar marked para syntax highlighting
marked.setOptions({
  highlight: function(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(code, { language: lang }).value;
      } catch (e) {
        console.error('Error highlighting code:', e);
      }
    }
    return hljs.highlightAuto(code).value;
  },
  breaks: true,
  gfm: true
});

// Modal de edición
const taskModal = document.getElementById('taskModal');
const taskViewModal = document.getElementById('taskViewModal');
const taskForm = document.getElementById('taskForm');
const addImageBtn = document.getElementById('addImageBtn');
const taskImagesInput = document.getElementById('taskImages');
const imagesPreview = document.getElementById('imagesPreview');
const editFromViewBtn = document.getElementById('editFromViewBtn');
const goToProjectBtn = document.getElementById('goToProjectBtn');
const newTaskBtn = document.getElementById('newTaskBtn');

// Elementos de selectores de proyecto en el modal
const taskProjectSelector = document.getElementById('taskProjectSelector');
const taskSubProjectSelector = document.getElementById('taskSubProjectSelector');
const taskMainProject = document.getElementById('taskMainProject');
const taskSubProject = document.getElementById('taskSubProject');

// Elementos de estadísticas
const totalTasksEl = document.getElementById('totalTasks');
const completedTasksEl = document.getElementById('completedTasks');
const pendingTasksEl = document.getElementById('pendingTasks');
const criticalTasksEl = document.getElementById('criticalTasks');

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  initTags();
  init();
  initMarkdownPreview();
  
  // Configurar iconos de botones
  if (editFromViewBtn) {
    editFromViewBtn.innerHTML = `${ICONS.edit} Editar`;
  }
  if (goToProjectBtn) {
    goToProjectBtn.innerHTML = `${ICONS.arrow} Ir al Proyecto`;
  }
  
  // Event listeners para botones del modal de visualización
  if (editFromViewBtn) {
    editFromViewBtn.addEventListener('click', function() {
      taskViewModal.classList.remove('active');
      if (editingTaskId) {
        editTask(editingTaskId);
      }
    });
  }
  
  if (goToProjectBtn) {
    goToProjectBtn.addEventListener('click', function() {
      const task = allTasks.find(t => t.id === editingTaskId);
      if (task) {
        window.location.href = `project.html?id=${task.project_id}`;
      }
    });
  }
});
filterMainProject.addEventListener('change', function() {
  loadSubProjects();
  applyFilters();
});
filterSubProject.addEventListener('change', applyFilters);
filterStatus.addEventListener('change', applyFilters);
filterCriticality.addEventListener('change', applyFilters);
searchTasks.addEventListener('input', applyFilters);

// Event listeners del modal
if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);
if (addImageBtn) addImageBtn.addEventListener('click', () => taskImagesInput.click());
if (taskImagesInput) taskImagesInput.addEventListener('change', handleImageSelect);
if (newTaskBtn) newTaskBtn.addEventListener('click', openNewTaskModal);

// Event listener para cambio de proyecto principal en el modal
if (taskMainProject) {
  taskMainProject.addEventListener('change', loadTaskSubProjects);
}

document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    this.closest('.modal').classList.remove('active');
  });
});

if (taskModal) {
  taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal && !window.shouldPreventModalClose?.()) {
      taskModal.classList.remove('active');
    }
  });
}

if (taskViewModal) {
  taskViewModal.addEventListener('click', (e) => {
    if (e.target === taskViewModal && !window.shouldPreventModalClose?.()) {
      taskViewModal.classList.remove('active');
    }
  });
}

// Image viewer modal close on background click
const imageViewerModal = document.getElementById('imageViewerModal');
if (imageViewerModal) {
  imageViewerModal.addEventListener('click', (e) => {
    if (e.target === imageViewerModal && !window.shouldPreventModalClose?.()) {
      imageViewerModal.classList.remove('active');
    }
  });
}

sortableHeaders.forEach(header => {
  header.addEventListener('click', () => {
    const column = header.dataset.column;
    if (sortColumn === column) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortColumn = column;
      sortDirection = 'asc';
    }
    sortAndRenderTasks();
  });
});

async function init() {
  await loadProjects();
  await loadTasks();
}

// Markdown preview toggle
function initMarkdownPreview() {
  const toggleBtn = document.getElementById('toggleTaskPreview');
  const textarea = document.getElementById('taskDescription');
  const preview = document.getElementById('taskDescriptionPreview');
  
  if (toggleBtn && textarea && preview) {
    // Establecer icono inicial
    toggleBtn.innerHTML = `${ICONS.view} Vista previa`;
    
    let isPreview = false;
    
    toggleBtn.addEventListener('click', function() {
      isPreview = !isPreview;
      
      if (isPreview) {
        preview.innerHTML = marked.parse(textarea.value || '*Sin descripción*');
        // Aplicar syntax highlighting a bloques de código
        preview.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
        textarea.style.display = 'none';
        preview.style.display = 'block';
        toggleBtn.innerHTML = `${ICONS.edit} Editar`;
      } else {
        textarea.style.display = 'block';
        preview.style.display = 'none';
        toggleBtn.innerHTML = `${ICONS.view} Vista previa`;
      }
    });
  }
}

function resetMarkdownPreview() {
  const toggleBtn = document.getElementById('toggleTaskPreview');
  const textarea = document.getElementById('taskDescription');
  const preview = document.getElementById('taskDescriptionPreview');
  
  if (toggleBtn && textarea && preview) {
    textarea.style.display = 'block';
    preview.style.display = 'none';
    toggleBtn.innerHTML = `${ICONS.view} Vista previa`;
  }
}

async function loadProjects() {
  allProjects = await window.api.getProjects();
  
  // Filtrar solo proyectos principales (sin parent_id)
  const mainProjects = allProjects.filter(p => !p.parent_id);
  
  filterMainProject.innerHTML = '<option value="">Todos los proyectos</option>' +
    mainProjects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
  
  // Inicializar filtro de subcategorías vacío
  filterSubProject.innerHTML = '<option value="">Todas las subcategorías</option>';
  filterSubProject.disabled = true;
}

function loadSubProjects() {
  const mainProjectId = filterMainProject.value;
  
  if (!mainProjectId) {
    filterSubProject.innerHTML = '<option value="">Todas las subcategorías</option>';
    filterSubProject.disabled = true;
    return;
  }
  
  // Filtrar subcategorías del proyecto principal seleccionado
  const subProjects = allProjects.filter(p => p.parent_id == mainProjectId);
  
  if (subProjects.length === 0) {
    filterSubProject.innerHTML = '<option value="">Sin subcategorías</option>';
    filterSubProject.disabled = true;
  } else {
    filterSubProject.innerHTML = '<option value="">Todas las subcategorías</option>' +
      subProjects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
    filterSubProject.disabled = false;
  }
}

async function loadTasks() {
  allTasks = await window.api.getAllTasks();
  filteredTasks = [...allTasks];
  updateStats();
  renderTodayAlert();
  sortAndRenderTasks();
}

function renderTodayAlert() {
  const container = document.getElementById('todayAlert');
  if (!container) return;

  const today = new Date();
  const pad = n => String(n).padStart(2, '0');
  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

  const todayTasks = allTasks.filter(t =>
    t.due_date &&
    t.due_date.substring(0, 10) === todayStr &&
    t.status !== 'completed'
  );

  if (todayTasks.length === 0) {
    container.style.display = 'none';
    return;
  }

  const critOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  todayTasks.sort((a, b) => (critOrder[a.criticality] ?? 2) - (critOrder[b.criticality] ?? 2));

  container.innerHTML = `
    <div class="today-alert">
      <div class="today-alert-header">
        <span class="today-alert-icon">${ICONS.calendar}</span>
        <strong>Tienes ${todayTasks.length} tarea${todayTasks.length !== 1 ? 's' : ''} para hoy</strong>
        <a href="calendar.html" class="btn btn-sm btn-primary" style="margin-left:auto;">Ver Calendario</a>
      </div>
      <div class="today-alert-tasks">
        ${todayTasks.map(task => `
          <div class="today-alert-task" onclick="viewTask(${task.id})">
            <span class="badge badge-${task.criticality || 'medium'}">${getCriticalityText(task.criticality)}</span>
            <span class="badge ${getStatusBadgeClass(task.status || 'pending')}">${getStatusText(task.status || 'pending')}</span>
            <span class="today-alert-task-title">${escapeHtml(task.title)}</span>
            <span class="today-alert-task-project" style="color:${task.parent_project_color || task.project_color || '#3b82f6'}">
              &#9679; ${escapeHtml(task.parent_project_name || task.project_name || '')}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  container.style.display = 'block';
}

function updateStats() {
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.status === 'completed').length;
  const pending = allTasks.filter(t => t.status === 'pending').length;
  const critical = allTasks.filter(t => t.criticality === 'critical' && t.status !== 'completed').length;

  totalTasksEl.textContent = total;
  completedTasksEl.textContent = completed;
  pendingTasksEl.textContent = pending;
  criticalTasksEl.textContent = critical;
}

function applyFilters() {
  const mainProjectId = filterMainProject.value;
  const subProjectId = filterSubProject.value;
  const statusFilter = filterStatus.value;
  const criticalityFilter = filterCriticality.value;
  const searchTerm = searchTasks.value.toLowerCase();

  filteredTasks = allTasks.filter(task => {
    let matchesProject = true;
    
    // Si hay subcategoría seleccionada, solo mostrar esa
    if (subProjectId) {
      matchesProject = task.project_id == subProjectId;
    } 
    // Si solo hay proyecto principal, mostrar sus tareas y las de sus subcategorías
    else if (mainProjectId) {
      const subProjectIds = allProjects
        .filter(p => p.parent_id == mainProjectId)
        .map(p => p.id);
      
      matchesProject = task.project_id == mainProjectId || subProjectIds.includes(task.project_id);
    }
    
    const matchesStatus = !statusFilter || (task.status || 'pending') === statusFilter;
    const matchesCriticality = !criticalityFilter || task.criticality === criticalityFilter;
    const matchesSearch = !searchTerm || 
      task.title.toLowerCase().includes(searchTerm) ||
      (task.description && task.description.toLowerCase().includes(searchTerm));
    
    return matchesProject && matchesStatus && matchesCriticality && matchesSearch;
  });

  sortAndRenderTasks();
}

function sortAndRenderTasks() {
  filteredTasks.sort((a, b) => {
    let aVal = a[sortColumn];
    let bVal = b[sortColumn];

    // Manejo especial para valores null/undefined
    if (aVal == null) aVal = '';
    if (bVal == null) bVal = '';

    // Para booleanos (completed)
    if (typeof aVal === 'boolean') {
      aVal = aVal ? 1 : 0;
      bVal = bVal ? 1 : 0;
    }

    // Para criticidad
    if (sortColumn === 'criticality') {
      const criticalityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
      aVal = criticalityOrder[aVal] || 0;
      bVal = criticalityOrder[bVal] || 0;
    }

    // Para estado (status)
    if (sortColumn === 'completed') {
      const statusOrder = { pending: 1, in_progress: 2, testing: 3, completed: 4 };
      aVal = statusOrder[a.status || 'pending'] || 0;
      bVal = statusOrder[b.status || 'pending'] || 0;
    }

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  renderTasks();
}

function renderTasks() {
  if (filteredTasks.length === 0) {
    tasksTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No hay tareas que mostrar
        </td>
      </tr>
    `;
    return;
  }

  tasksTableBody.innerHTML = filteredTasks.map(task => {
    const tags = task.tags ? JSON.parse(task.tags) : [];
    
    return `
    <tr onclick="handleRowClick(event, ${task.id})" style="cursor: pointer;">
      <td>
        <span class="badge ${getStatusBadgeClass(task.status || 'pending')}">
          ${getStatusText(task.status || 'pending')}
        </span>
      </td>
      <td>
        <strong>${escapeHtml(task.title)}</strong>
        ${task.description ? `<br><small class="markdown-content" style="color: var(--text-secondary); display: block; max-height: 3em; overflow: hidden;">${marked.parse(task.description.substring(0, 100))}${task.description.length > 100 ? '...' : ''}</small>` : ''}
        ${tags.length > 0 ? `<br><div style="display: flex; gap: 0.25rem; margin-top: 0.25rem; flex-wrap: wrap;">${tags.map(tag => `<span class="badge tag-badge">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      </td>
      <td>
        ${task.parent_project_name ? `
          <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${task.parent_project_color || '#3b82f6'};"></span>
            ${escapeHtml(task.parent_project_name)}
          </span>
        ` : `
          <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${task.project_color || '#3b82f6'};"></span>
            ${escapeHtml(task.project_name || 'Sin proyecto')}
          </span>
        `}
      </td>
      <td>
        ${task.parent_project_name ? `
          <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
            <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${task.project_color || '#3b82f6'};"></span>
            ${escapeHtml(task.project_name || 'Sin proyecto')}
          </span>
        ` : '-'}
      </td>
      <td>
        <span class="badge badge-${task.criticality || 'medium'}">
          ${getCriticalityText(task.criticality)}
        </span>
      </td>
      <td>${task.created_at ? formatDateTime(task.created_at) : '-'}</td>
      <td>${task.due_date ? formatDate(task.due_date) : '-'}</td>
      <td>
        <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
          ${getStatusButtons(task.id, task.status || 'pending')}
          <button class="btn btn-sm btn-secondary" onclick="editTask(${task.id})" title="Editar">${ICONS.edit}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})" title="Eliminar">${ICONS.delete}</button>
        </div>
      </td>
    </tr>
  `}).join('');
  
  // Aplicar syntax highlighting a bloques de código
  tasksTableBody.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
}

function getStatusBadgeClass(status) {
  const classes = {
    'pending': 'badge-pending',
    'in_progress': 'badge-info',
    'testing': 'badge-warning',
    'blocked': 'badge-blocked',
    'completed': 'badge-completed'
  };
  return classes[status] || 'badge-pending';
}

function getStatusText(status) {
  const texts = {
    'pending': `${ICONS.pending} Pendiente`,
    'in_progress': `${ICONS.inProgress} En Curso`,
    'testing': `${ICONS.testing} Testing`,
    'blocked': `${ICONS.blocked} Bloqueado`,
    'completed': `${ICONS.completed} Completada`
  };
  return texts[status] || `${ICONS.pending} Pendiente`;
}

function getStatusButtons(taskId, currentStatus) {
  const statuses = ['pending', 'in_progress', 'blocked', 'testing', 'completed'];
  const icons = {
    'pending': ICONS.pending,
    'in_progress': ICONS.inProgress,
    'blocked': ICONS.blocked,
    'testing': ICONS.testing,
    'completed': ICONS.completed
  };
  const titles = {
    'pending': 'Marcar como Pendiente',
    'in_progress': 'Marcar En Curso',
    'blocked': 'Marcar como Bloqueado',
    'testing': 'Marcar en Testing',
    'completed': 'Marcar Completada'
  };
  const btnClasses = {
    'pending': 'btn-status-pending',
    'in_progress': 'btn-status-in-progress',
    'blocked': 'btn-status-blocked',
    'testing': 'btn-status-testing',
    'completed': 'btn-status-completed'
  };
  
  return statuses
    .filter(status => status !== currentStatus)
    .map(status => `
      <button 
        class="btn btn-sm ${btnClasses[status]}" 
        onclick="updateTaskStatus(${taskId}, '${status}')" 
        title="${titles[status]}"
      >
        ${icons[status]}
      </button>
    `).join('');
}

async function updateTaskStatus(id, status) {
  try {
    await window.api.updateTaskStatus(id, status);
    await loadTasks();
  } catch (error) {
    console.error('Error al cambiar estado de tarea:', error);
  }
}

function handleRowClick(event, taskId) {
  // No abrir modal si se hizo clic en un botón o dentro de un botón
  if (event.target.closest('button')) {
    return;
  }
  viewTask(taskId);
}

function viewTask(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;
  
  editingTaskId = taskId;  // Guardar para los botones de editar e ir al proyecto
  
  // Título
  document.getElementById('viewTaskTitle').textContent = task.title;
  
  // Descripción
  const descContainer = document.getElementById('viewTaskDescriptionContainer');
  const descContent = document.getElementById('viewTaskDescription');
  if (task.description) {
    descContent.innerHTML = marked.parse(task.description);
    descContent.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    descContainer.style.display = 'block';
  } else {
    descContainer.style.display = 'none';
  }
  
  // Estado
  const statusBadge = `<span class="badge ${getStatusBadgeClass(task.status || 'pending')}">${getStatusText(task.status || 'pending')}</span>`;
  document.getElementById('viewTaskStatus').innerHTML = statusBadge;
  
  // Criticidad
  const criticalityBadge = `<span class="badge badge-${task.criticality || 'medium'}">${getCriticalityText(task.criticality)}</span>`;
  document.getElementById('viewTaskCriticality').innerHTML = criticalityBadge;
  
  // Proyecto principal
  const projectColor = task.parent_project_color || task.project_color || '#3b82f6';
  const projectName = task.parent_project_name || task.project_name || 'Sin proyecto';
  document.getElementById('viewTaskProject').innerHTML = `
    <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
      <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${projectColor};"></span>
      ${escapeHtml(projectName)}
    </span>
  `;
  
  // Subcategoría
  const subprojectContainer = document.getElementById('viewTaskSubprojectContainer');
  if (task.parent_project_name) {
    const subprojectColor = task.project_color || '#3b82f6';
    const subprojectName = task.project_name || 'Sin subcategoría';
    document.getElementById('viewTaskSubproject').innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
        <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${subprojectColor};"></span>
        ${escapeHtml(subprojectName)}
      </span>
    `;
    subprojectContainer.style.display = 'block';
  } else {
    subprojectContainer.style.display = 'none';
  }
  
  // Fecha de creación
  if (task.created_at) {
    document.getElementById('viewTaskCreated').textContent = formatDateTime(task.created_at);
  }
  
  // Fecha de ejecución
  const dueDateContainer = document.getElementById('viewTaskDueDateContainer');
  if (task.due_date) {
    document.getElementById('viewTaskDueDate').innerHTML = `${ICONS.calendar} ${formatDate(task.due_date)}`;
    dueDateContainer.style.display = 'block';
  } else {
    dueDateContainer.style.display = 'none';
  }
  
  // Tags
  const tagsContainer = document.getElementById('viewTaskTagsContainer');
  const tags = task.tags ? JSON.parse(task.tags) : [];
  if (tags.length > 0) {
    document.getElementById('viewTaskTags').innerHTML = tags.map(tag => 
      `<span class="badge tag-badge">${escapeHtml(tag)}</span>`
    ).join('');
    tagsContainer.style.display = 'block';
  } else {
    tagsContainer.style.display = 'none';
  }
  
  // Imágenes
  const imagesContainer = document.getElementById('viewTaskImagesContainer');
  const images = task.images ? JSON.parse(task.images) : [];
  if (images.length > 0) {
    document.getElementById('viewTaskImages').innerHTML = images.map(img => 
      `<img src="${img}" alt="Task image" class="task-image" style="max-width: 200px; max-height: 200px; object-fit: cover; border-radius: 0.5rem; cursor: pointer;" onclick="viewImage('${img}')">`
    ).join('');
    imagesContainer.style.display = 'block';
  } else {
    imagesContainer.style.display = 'none';
  }
  
  // Abrir modal
  taskViewModal.classList.add('active');
}

function viewImage(src) {
  const modal = document.getElementById('imageViewerModal');
  const img = document.getElementById('imageViewerImg');
  img.src = src;
  modal.classList.add('active');
}

async function deleteTask(id) {
  if (!confirm('¿Estás seguro de eliminar esta tarea?')) return;

  try {
    await window.api.deleteTask(id);
    await loadTasks();
  } catch (error) {
    console.error('Error al eliminar tarea:', error);
    alert('Error al eliminar la tarea');
  }
}

function getCriticalityText(criticality) {
  const texts = {
    low: 'Baja',
    medium: 'Media',
    high: 'Alta',
    critical: 'Crítica'
  };
  return texts[criticality] || 'Media';
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Inicializar tags dinámicamente
function initTags() {
  const tagsContainer = document.getElementById('tagsSelector');
  if (tagsContainer && typeof AVAILABLE_TAGS !== 'undefined') {
    tagsContainer.innerHTML = AVAILABLE_TAGS.map(tag => `
      <label class="tag-checkbox">
        <input type="checkbox" name="taskTag" value="${tag}">
        <span class="tag-label">${tag}</span>
      </label>
    `).join('');
  }
}

// Editar tarea
async function editTask(id) {
  const task = allTasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id;
  taskImages = task.images ? JSON.parse(task.images) : [];
  const taskTags = task.tags ? JSON.parse(task.tags) : [];
  
  document.getElementById('taskModalTitle').textContent = 'Editar Tarea';
  document.getElementById('taskId').value = task.id;
  document.getElementById('taskProjectId').value = task.project_id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDescription').value = task.description || '';
  document.getElementById('taskDueDate').value = task.due_date || '';
  document.getElementById('taskCriticality').value = task.criticality || 'medium';
  document.getElementById('taskStatus').value = task.status || 'pending';
  
  // Marcar los tags que tiene la tarea
  document.querySelectorAll('input[name="taskTag"]').forEach(cb => {
    cb.checked = taskTags.includes(cb.value);
  });
  
  // Ocultar selectores de proyecto (modo edición)
  if (taskProjectSelector) taskProjectSelector.style.display = 'none';
  if (taskSubProjectSelector) taskSubProjectSelector.style.display = 'none';
  
  // Remover el atributo required del select cuando está oculto
  if (taskMainProject) {
    taskMainProject.removeAttribute('required');
  }
  
  renderImagePreviews();
  resetMarkdownPreview();
  taskModal.classList.add('active');
}

// Abrir modal para crear nueva tarea
function openNewTaskModal() {
  editingTaskId = null;
  taskImages = [];
  
  document.getElementById('taskModalTitle').textContent = 'Nueva Tarea';
  document.getElementById('taskId').value = '';
  document.getElementById('taskProjectId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskDueDate').value = '';
  document.getElementById('taskCriticality').value = 'medium';
  document.getElementById('taskStatus').value = 'pending';
  
  // Desmarcar todos los tags
  document.querySelectorAll('input[name="taskTag"]').forEach(cb => {
    cb.checked = false;
  });
  
  // Mostrar y cargar selectores de proyecto
  if (taskProjectSelector) taskProjectSelector.style.display = 'block';
  if (taskSubProjectSelector) taskSubProjectSelector.style.display = 'block';
  
  // Restaurar el atributo required del select cuando está visible
  if (taskMainProject) {
    taskMainProject.setAttribute('required', 'required');
  }
  
  loadTaskModalProjects();
  
  renderImagePreviews();
  resetMarkdownPreview();
  taskModal.classList.add('active');
  taskModal.classList.add('active');
}

// Cargar proyectos principales en el select del modal
function loadTaskModalProjects() {
  if (!taskMainProject) return;
  
  const mainProjects = allProjects.filter(p => !p.parent_id);
  taskMainProject.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';
  mainProjects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    taskMainProject.appendChild(option);
  });
  
  // Limpiar subcategorías
  if (taskSubProject) {
    taskSubProject.innerHTML = '<option value="">-- Sin Subcategoría --</option>';
  }
}

// Cargar subcategorías según el proyecto seleccionado en el modal
function loadTaskSubProjects() {
  if (!taskMainProject || !taskSubProject) return;
  
  const mainProjectId = parseInt(taskMainProject.value);
  taskSubProject.innerHTML = '<option value="">-- Sin Subcategoría --</option>';
  
  if (mainProjectId) {
    const subProjects = allProjects.filter(p => p.parent_id === mainProjectId);
    subProjects.forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      taskSubProject.appendChild(option);
    });
  }
}

// Guardar cambios de tarea
async function handleTaskSubmit(e) {
  e.preventDefault();

  // Obtener tags seleccionados
  const selectedTags = Array.from(document.querySelectorAll('input[name="taskTag"]:checked'))
    .map(cb => cb.value);

  // Determinar el project_id
  let projectId;
  if (editingTaskId) {
    // Modo edición: usar el proyecto existente
    projectId = document.getElementById('taskProjectId').value;
  } else {
    // Modo creación: obtener del selector
    const subProjectId = taskSubProject?.value;
    const mainProjectId = taskMainProject?.value;
    projectId = subProjectId || mainProjectId;
    
    if (!projectId) {
      alert('Por favor selecciona un proyecto');
      return;
    }
  }

  const taskData = {
    project_id: projectId,
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    due_date: document.getElementById('taskDueDate').value || null,
    criticality: document.getElementById('taskCriticality').value,
    status: document.getElementById('taskStatus').value,
    tags: selectedTags,
    images: taskImages
  };

  try {
    if (editingTaskId) {
      // Actualizar tarea existente
      await window.api.updateTask(editingTaskId, taskData);
    } else {
      // Crear nueva tarea
      await window.api.createTask(taskData);
    }
    taskModal.classList.remove('active');
    await loadTasks();
  } catch (error) {
    console.error('Error al guardar tarea:', error);
    alert('Error al guardar la tarea');
  }
}

// Manejar selección de imágenes
function handleImageSelect(e) {
  const files = Array.from(e.target.files);
  
  files.forEach(file => {
    const reader = new FileReader();
    reader.onload = (event) => {
      taskImages.push(event.target.result);
      renderImagePreviews();
    };
    reader.readAsDataURL(file);
  });
  
  // Reset input
  e.target.value = '';
}

// Renderizar previsualizaciones de imágenes
function renderImagePreviews() {
  if (!imagesPreview) return;
  
  imagesPreview.innerHTML = taskImages.map((img, index) => `
    <div class="image-preview-item">
      <img src="${img}" alt="Preview">
      <button type="button" class="image-preview-remove" onclick="removeImage(${index})">&times;</button>
    </div>
  `).join('');
}

// Eliminar imagen
function removeImage(index) {
  taskImages.splice(index, 1);
  renderImagePreviews();
}

// kanban.js - Tablero Kanban de tareas
let allTasks = [];
let filteredTasks = [];
let editingTaskId = null;
let taskImages = [];

// Elementos del DOM
const filterMainProject = document.getElementById('filterMainProject');
const filterSubProject = document.getElementById('filterSubProject');
const searchTasks = document.getElementById('searchTasks');
const kanbanBoard = document.getElementById('kanbanBoard');

// Variable para almacenar proyectos
let allProjects = [];

// Modal de edición
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const addImageBtn = document.getElementById('addImageBtn');
const taskImagesInput = document.getElementById('taskImages');
const imagesPreview = document.getElementById('imagesPreview');

// Modal de visualización
const taskViewModal = document.getElementById('taskViewModal');
const editFromViewBtn = document.getElementById('editFromViewBtn');
const goToProjectBtn = document.getElementById('goToProjectBtn');

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

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  // Inicializar iconos de las columnas
  initColumnIcons();
  
  // Inicializar tags y markdown preview
  initTags();
  initMarkdownPreview();
  
  init();
  
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

// Inicializar iconos de las columnas
function initColumnIcons() {
  document.querySelectorAll('.kanban-column-icon').forEach(iconEl => {
    const iconName = iconEl.getAttribute('data-icon');
    if (iconName && ICONS[iconName]) {
      iconEl.innerHTML = ICONS[iconName];
    }
  });
}

filterMainProject.addEventListener('change', function() {
  loadSubProjects();
  applyFilters();
});
filterSubProject.addEventListener('change', applyFilters);
searchTasks.addEventListener('input', applyFilters);

// Event listeners del modal de edición
if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);
if (addImageBtn) addImageBtn.addEventListener('click', () => taskImagesInput.click());
if (taskImagesInput) taskImagesInput.addEventListener('change', handleImageSelect);

// Event listeners del modal de visualización
document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    taskModal.classList.remove('active');
    taskViewModal.classList.remove('active');
  });
});

// Cerrar modal al hacer clic fuera de él
taskModal.addEventListener('click', function(e) {
  if (e.target === taskModal) {
    taskModal.classList.remove('active');
  }
});

taskViewModal.addEventListener('click', function(e) {
  if (e.target === taskViewModal) {
    taskViewModal.classList.remove('active');
  }
});

// Cerrar modal con la tecla Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    taskModal.classList.remove('active');
    taskViewModal.classList.remove('active');
  }
});

// Inicializar la aplicación
async function init() {
  await loadProjects();
  await loadTasks();
}

// Cargar proyectos
async function loadProjects() {
  try {
    allProjects = await window.api.getProjects();
    loadMainProjects();
    loadSubProjects();
  } catch (error) {
    console.error('Error al cargar proyectos:', error);
  }
}

function loadMainProjects() {
  const mainProjects = allProjects.filter(p => !p.parent_id);
  filterMainProject.innerHTML = '<option value="">Todos los proyectos</option>' +
    mainProjects.map(p => `
      <option value="${p.id}">${escapeHtml(p.name)}</option>
    `).join('');
}

function loadSubProjects() {
  const mainProjectId = filterMainProject.value;
  const subProjects = mainProjectId 
    ? allProjects.filter(p => p.parent_id === parseInt(mainProjectId))
    : allProjects.filter(p => p.parent_id);
  
  filterSubProject.innerHTML = '<option value="">Todas las subcategorías</option>' +
    subProjects.map(p => `
      <option value="${p.id}">${escapeHtml(p.name)}</option>
    `).join('');
}

// Cargar tareas
async function loadTasks() {
  try {
    allTasks = await window.api.getAllTasks();
    applyFilters();
  } catch (error) {
    console.error('Error al cargar tareas:', error);
  }
}

// Aplicar filtros
function applyFilters() {
  const mainProjectId = filterMainProject.value;
  const subProjectId = filterSubProject.value;
  const searchQuery = searchTasks.value.toLowerCase();

  filteredTasks = allTasks.filter(task => {
    // Filtro de proyecto principal
    const matchesMainProject = !mainProjectId || 
      (task.parent_id ? String(task.parent_id) === mainProjectId : String(task.project_id) === mainProjectId);
    
    // Filtro de subcategoría
    const matchesSubProject = !subProjectId || String(task.project_id) === subProjectId;
    
    // Filtro de búsqueda
    const matchesSearch = !searchQuery || 
      task.title.toLowerCase().includes(searchQuery) ||
      (task.description && task.description.toLowerCase().includes(searchQuery)) ||
      (task.project_name && task.project_name.toLowerCase().includes(searchQuery)) ||
      (task.parent_project_name && task.parent_project_name.toLowerCase().includes(searchQuery));

    return matchesMainProject && matchesSubProject && matchesSearch;
  });

  renderKanbanBoard();
}

// Renderizar tablero Kanban
function renderKanbanBoard() {
  const statuses = ['pending', 'in_progress', 'testing', 'completed'];
  
  statuses.forEach(status => {
    const column = document.getElementById(`column-${status}`);
    const count = document.getElementById(`count-${status}`);
    
    const tasksInColumn = filteredTasks.filter(t => (t.status || 'pending') === status);
    count.textContent = tasksInColumn.length;
    
    column.innerHTML = tasksInColumn.map(task => renderKanbanCard(task)).join('');
  });
  
  // Configurar drag & drop
  setupDragAndDrop();
}

// Renderizar tarjeta de Kanban
function renderKanbanCard(task) {
  const projectColor = task.parent_project_color || task.project_color || '#3b82f6';
  const projectName = task.parent_project_name || task.project_name || 'Sin proyecto';
  const subprojectName = task.parent_project_name ? task.project_name : '';
  const tags = task.tags ? JSON.parse(task.tags) : [];
  const criticalityClass = getCriticalityClass(task.criticality);
  
  return `
    <div 
      class="kanban-card ${criticalityClass}" 
      draggable="true" 
      data-task-id="${task.id}"
      onclick="viewTask(${task.id})"
    >
      <div class="kanban-card-header">
        <div class="kanban-card-project">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${projectColor}; display: inline-block;"></span>
          <span class="kanban-card-project-name">${escapeHtml(projectName)}</span>
        </div>
        ${task.criticality === 'critical' ? '<span class="kanban-card-critical">⚠️</span>' : ''}
      </div>
      
      <h4 class="kanban-card-title">${escapeHtml(task.title)}</h4>
      
      ${subprojectName ? `
        <div class="kanban-card-subproject">
          <span style="width: 6px; height: 6px; border-radius: 50%; background-color: ${task.project_color}; display: inline-block;"></span>
          <span>${escapeHtml(subprojectName)}</span>
        </div>
      ` : ''}
      
      ${task.due_date ? `
        <div class="kanban-card-date">
          <span class="kanban-card-icon">${ICONS.calendar}</span>
          ${formatDate(task.due_date)}
        </div>
      ` : ''}
      
      ${tags.length > 0 ? `
        <div class="kanban-card-tags">
          ${tags.slice(0, 3).map(tag => `<span class="kanban-card-tag">${escapeHtml(tag)}</span>`).join('')}
          ${tags.length > 3 ? `<span class="kanban-card-tag">+${tags.length - 3}</span>` : ''}
        </div>
      ` : ''}
    </div>
  `;
}

// Configurar drag & drop
function setupDragAndDrop() {
  const cards = document.querySelectorAll('.kanban-card');
  const columns = document.querySelectorAll('.kanban-column-body');
  
  // Configurar eventos para las tarjetas
  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  });
  
  // Configurar eventos para las columnas
  columns.forEach(column => {
    column.addEventListener('dragover', handleDragOver);
    column.addEventListener('drop', handleDrop);
    column.addEventListener('dragenter', handleDragEnter);
    column.addEventListener('dragleave', handleDragLeave);
  });
}

let draggedElement = null;

function handleDragStart(e) {
  e.stopPropagation(); // Evitar que el evento se propague al onclick
  draggedElement = this;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragEnd(e) {
  this.classList.remove('dragging');
  
  // Remover clases de todas las columnas
  document.querySelectorAll('.kanban-column-body').forEach(column => {
    column.classList.remove('drag-over');
  });
}

function handleDragOver(e) {
  if (e.preventDefault) {
    e.preventDefault();
  }
  e.dataTransfer.dropEffect = 'move';
  return false;
}

function handleDragEnter(e) {
  this.classList.add('drag-over');
}

function handleDragLeave(e) {
  // Solo remover la clase si realmente salimos de la columna
  if (e.target === this) {
    this.classList.remove('drag-over');
  }
}

async function handleDrop(e) {
  e.stopPropagation();
  e.preventDefault();
  
  this.classList.remove('drag-over');
  
  if (draggedElement) {
    const taskId = parseInt(draggedElement.getAttribute('data-task-id'));
    const newStatus = this.parentElement.getAttribute('data-status');
    
    // Actualizar el estado de la tarea
    try {
      await window.api.updateTaskStatus(taskId, newStatus);
      await loadTasks();
    } catch (error) {
      console.error('Error al actualizar estado de tarea:', error);
      alert('Error al actualizar el estado de la tarea');
    }
  }
  
  return false;
}

// Ver tarea (modal)
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
      `<img src="${img}" alt="Task image" class="task-image" style="max-width: 200px; max-height: 200px; object-fit: cover; border-radius: 0.5rem; cursor: pointer;" onclick="window.open('${img}', '_blank')">`
    ).join('');
    imagesContainer.style.display = 'block';
  } else {
    imagesContainer.style.display = 'none';
  }
  
  // Abrir modal
  taskViewModal.classList.add('active');
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
  
  renderImagePreviews();
  resetMarkdownPreview();
  taskModal.classList.add('active');
}

// Guardar cambios de tarea
async function handleTaskSubmit(e) {
  e.preventDefault();

  // Obtener tags seleccionados
  const selectedTags = Array.from(document.querySelectorAll('input[name="taskTag"]:checked'))
    .map(cb => cb.value);

  const taskData = {
    project_id: document.getElementById('taskProjectId').value,
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    due_date: document.getElementById('taskDueDate').value || null,
    criticality: document.getElementById('taskCriticality').value,
    status: document.getElementById('taskStatus').value,
    tags: selectedTags,
    images: taskImages
  };

  try {
    await window.api.updateTask(editingTaskId, taskData);
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

// Funciones auxiliares
function getStatusBadgeClass(status) {
  const classes = {
    'pending': 'badge-pending',
    'in_progress': 'badge-info',
    'testing': 'badge-warning',
    'completed': 'badge-completed'
  };
  return classes[status] || 'badge-pending';
}

function getStatusText(status) {
  const texts = {
    'pending': `${ICONS.pending} Pendiente`,
    'in_progress': `${ICONS.inProgress} En Curso`,
    'testing': `${ICONS.testing} Testing`,
    'completed': `${ICONS.completed} Completada`
  };
  return texts[status] || `${ICONS.pending} Pendiente`;
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

function getCriticalityClass(criticality) {
  if (criticality === 'critical' || criticality === 'high') {
    return 'kanban-card-high-priority';
  }
  return '';
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

// Markdown Preview
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

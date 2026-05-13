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
const newTaskBtn = document.getElementById('newTaskBtn');
const deleteCompletedBtn = document.getElementById('deleteCompletedBtn');

// Elementos de selectores de proyecto en el modal
const taskProjectSelector = document.getElementById('taskProjectSelector');
const taskSubProjectSelector = document.getElementById('taskSubProjectSelector');
const taskMainProject = document.getElementById('taskMainProject');
const taskSubProject = document.getElementById('taskSubProject');

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
  if (deleteCompletedBtn) {
    deleteCompletedBtn.innerHTML = `${ICONS.delete} Limpiar Completadas`;
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

  // Icono de estrella en la sección de favoritos
  const favSectionIcon = document.getElementById('favSectionIcon');
  if (favSectionIcon) {
    favSectionIcon.innerHTML = ICONS.starFilled;
  }
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
if (newTaskBtn) newTaskBtn.addEventListener('click', openNewTaskModal);
if (deleteCompletedBtn) deleteCompletedBtn.addEventListener('click', deleteCompletedTasks);

// Event listener para cambio de proyecto principal en el modal
if (taskMainProject) {
  taskMainProject.addEventListener('change', loadTaskSubProjects);
}

// Event listeners del modal de visualización
document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    taskModal.classList.remove('active');
    taskViewModal.classList.remove('active');
  });
});

// Cerrar modal al hacer clic fuera de él
taskModal.addEventListener('click', function(e) {
  if (e.target === taskModal && !window.shouldPreventModalClose?.()) {
    taskModal.classList.remove('active');
  }
});

taskViewModal.addEventListener('click', function(e) {
  if (e.target === taskViewModal && !window.shouldPreventModalClose?.()) {
    taskViewModal.classList.remove('active');
  }
});

// Image viewer modal close on background click
const imageViewerModal = document.getElementById('imageViewerModal');
if (imageViewerModal) {
  imageViewerModal.addEventListener('click', (e) => {
    if (e.target === imageViewerModal && !window.shouldPreventModalClose?.()) {
      imageViewerModal.classList.remove('active');
    }
  });
}

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

// Eliminar todas las tareas completadas
async function deleteCompletedTasks() {
  const completedTasks = allTasks.filter(t => t.status === 'completed');
  
  if (completedTasks.length === 0) {
    alert('No hay tareas completadas para eliminar.');
    return;
  }
  
  const confirmed = confirm(`¿Estás seguro de que deseas eliminar ${completedTasks.length} tarea(s) completada(s)? Esta acción no se puede deshacer.`);
  
  if (!confirmed) return;
  
  try {
    const result = await window.api.deleteCompletedTasks();
    await loadTasks();
    alert(`Se eliminaron ${result.deletedCount} tarea(s) completada(s) exitosamente.`);
  } catch (error) {
    console.error('Error al eliminar tareas completadas:', error);
    alert('Hubo un error al eliminar las tareas completadas.');
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
  const statuses = ['pending', 'in_progress', 'blocked', 'testing', 'completed'];
  const favoriteTasks = filteredTasks.filter(t => t.favorite === 1);

  statuses.forEach(status => {
    // Tablero de favoritos
    const favColumn = document.getElementById(`column-fav-${status}`);
    const favCount = document.getElementById(`count-fav-${status}`);
    if (favColumn && favCount) {
      const favTasksInColumn = favoriteTasks.filter(t => (t.status || 'pending') === status);
      favCount.textContent = favTasksInColumn.length;
      favColumn.innerHTML = favTasksInColumn.map(task => renderKanbanCard(task)).join('');
    }

    // Tablero de todas las tareas
    const column = document.getElementById(`column-${status}`);
    const count = document.getElementById(`count-${status}`);
    if (column && count) {
      const tasksInColumn = filteredTasks.filter(t => (t.status || 'pending') === status);
      count.textContent = tasksInColumn.length;
      column.innerHTML = tasksInColumn.map(task => renderKanbanCard(task)).join('');
    }
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
  const criticality = task.criticality || 'medium';
  const isFavorite = task.favorite === 1;
  
  return `
    <div 
      class="kanban-card" 
      draggable="true" 
      data-task-id="${task.id}"
      onclick="viewTask(${task.id})"
      style="border-left: 3px solid ${projectColor};"
    >
      <div class="kanban-card-header">
        <div class="kanban-card-project">
          <span style="width: 8px; height: 8px; border-radius: 50%; background-color: ${projectColor}; display: inline-block;"></span>
          <span class="kanban-card-project-name">${escapeHtml(projectName)}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.25rem;">
          <button
            class="kanban-favorite-btn ${isFavorite ? 'active' : ''}"
            onclick="toggleFavorite(event, ${task.id})"
            title="${isFavorite ? 'Quitar de destacadas' : 'Añadir a destacadas'}"
          >${isFavorite ? ICONS.starFilled : ICONS.star}</button>
          <span class="badge badge-${criticality}">${getCriticalityText(criticality)}</span>
        </div>
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
  // Las tarjetas se re-crean con innerHTML en cada render, siempre tienen listeners frescos
  document.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend', handleDragEnd);
  });

  // Ambos tableros aceptan drops. data-drag-ready evita acumular listeners en cada render.
  document.querySelectorAll('.kanban-column-body').forEach(column => {
    if (!column.dataset.dragReady) {
      column.dataset.dragReady = 'true';
      column.addEventListener('dragover', handleDragOver);
      column.addEventListener('drop', handleDrop);
      column.addEventListener('dragenter', handleDragEnter);
      column.addEventListener('dragleave', handleDragLeave);
    }
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
  draggedElement = null;
  
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

  // Guardar referencias locales ANTES de cualquier await
  const columnBody = e.currentTarget;
  const currentDragged = draggedElement;

  columnBody.classList.remove('drag-over');

  if (!currentDragged) return false;

  const taskId = parseInt(currentDragged.getAttribute('data-task-id'));

  // Subir por el DOM hasta encontrar el elemento con data-status
  let statusEl = columnBody.parentElement;
  while (statusEl && !statusEl.hasAttribute('data-status')) {
    statusEl = statusEl.parentElement;
  }
  const newStatus = statusEl ? statusEl.getAttribute('data-status') : null;

  if (isNaN(taskId) || !newStatus) {
    console.error('Drop inválido - taskId:', taskId, 'newStatus:', newStatus);
    return false;
  }

  draggedElement = null;

  try {
    await window.api.updateTaskStatus(taskId, newStatus);
    await loadTasks();
  } catch (error) {
    console.error('Error al actualizar estado de tarea:', error);
    alert('Error al actualizar el estado de la tarea');
  }

  return false;
}

// Alternar favorito de una tarea
async function toggleFavorite(event, taskId) {
  event.stopPropagation();
  try {
    await window.api.toggleFavorite(taskId);
    await loadTasks();
  } catch (error) {
    console.error('Error al cambiar favorito:', error);
  }
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

  let projectId;
  
  // Modo creación: obtener proyecto de los selectores
  if (!editingTaskId) {
    const mainProjectId = taskMainProject?.value;
    const subProjectId = taskSubProject?.value;
    
    if (!mainProjectId) {
      alert('Por favor selecciona un proyecto');
      return;
    }
    
    projectId = subProjectId || mainProjectId;
  } else {
    // Modo edición: usar el project_id existente
    projectId = document.getElementById('taskProjectId').value;
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
      // Modo edición
      await window.api.updateTask(editingTaskId, taskData);
    } else {
      // Modo creación
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

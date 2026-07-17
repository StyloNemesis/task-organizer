// tasks.js - Manejo de tareas en vista de proyecto
let tasks = [];
let currentProjectId = null;
let editingTaskId = null;
let taskImages = [];

// Elementos del DOM
const tasksList = document.getElementById('tasksList');
const newTaskBtn = document.getElementById('newTaskBtn');
const taskModal = document.getElementById('taskModal');
const taskViewModal = document.getElementById('taskViewModal');
const taskForm = document.getElementById('taskForm');
const addImageBtn = document.getElementById('addImageBtn');
const taskImagesInput = document.getElementById('taskImages');
const imagesPreview = document.getElementById('imagesPreview');
const projectTitleEl = document.getElementById('projectTitle');
const editFromViewBtn = document.getElementById('editFromViewBtn');

// Elementos de selectores de proyecto en el modal
const taskProjectSelector = document.getElementById('taskProjectSelector');
const taskSubProjectSelector = document.getElementById('taskSubProjectSelector');
const taskMainProject = document.getElementById('taskMainProject');
const taskSubProject = document.getElementById('taskSubProject');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

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
  initTags();
  initTasks();
  initMarkdownPreview();
  
  // Configurar icono del botón de editar desde vista
  if (editFromViewBtn) {
    editFromViewBtn.innerHTML = `${ICONS.edit} Editar`;
  }
});
newTaskBtn.addEventListener('click', openNewTaskModal);
taskForm.addEventListener('submit', handleTaskSubmit);
addImageBtn.addEventListener('click', () => taskImagesInput.click());
taskImagesInput.addEventListener('change', handleImageSelect);
if (editFromViewBtn) {
  editFromViewBtn.addEventListener('click', function() {
    taskViewModal.classList.remove('active');
    if (editingTaskId) {
      editTask(editingTaskId);
    }
  });
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

// Inicializar tags dinámicamente
function initTags() {
  const tagsContainer = document.querySelector('.tags-selector');
  if (tagsContainer && typeof AVAILABLE_TAGS !== 'undefined') {
    tagsContainer.innerHTML = AVAILABLE_TAGS.map(tag => `
      <label class="tag-checkbox" style="--tag-color:${tag.color};">
        <input type="checkbox" name="taskTag" value="${tag.name}">
        <span class="tag-color-dot" style="background:${tag.color};"></span>
        ${tag.name}
      </label>
    `).join('');
  }
}

// Tab switching
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    
    tabButtons.forEach(b => b.classList.remove('active'));
    tabContents.forEach(c => c.classList.remove('active'));
    
    btn.classList.add('active');
    document.getElementById(tabName + 'Tab').classList.add('active');
  });
});

// Modal close handlers
document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', function() {
    this.closest('.modal').classList.remove('active');
  });
});

document.querySelectorAll('.modal-close-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    this.closest('.modal').classList.remove('active');
  });
});

taskModal.addEventListener('click', (e) => {
  if (e.target === taskModal && !window.shouldPreventModalClose?.()) {
    taskModal.classList.remove('active');
  }
});

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

async function initTasks() {
  const urlParams = new URLSearchParams(window.location.search);
  currentProjectId = urlParams.get('id');
  
  if (!currentProjectId) {
    window.location.href = 'index.html';
    return;
  }

  await loadProject();
  await loadTasks();
}

async function loadProject() {
  const projects = await window.api.getProjects();
  const project = projects.find(p => p.id == currentProjectId);
  
  if (project) {
    projectTitleEl.textContent = project.name;
    projectTitleEl.style.color = project.color;
  }
}

async function loadTasks() {
  tasks = await window.api.getTasks(currentProjectId);
  renderTasks();
}

function renderTasks() {
  if (tasks.length === 0) {
    tasksList.innerHTML = `
      <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
        <p>No hay tareas en este proyecto. ¡Crea la primera!</p>
      </div>
    `;
    return;
  }

  tasksList.innerHTML = tasks.map(task => {
    const images = task.images ? JSON.parse(task.images) : [];
    const tags = task.tags ? JSON.parse(task.tags) : [];
    const status = task.status || 'pending';
    
    return `
      <div class="task-item ${status === 'completed' ? 'completed' : ''}">
        <div class="task-status">
          <span class="badge ${getStatusBadgeClass(status)}">
            ${getStatusText(status)}
          </span>
        </div>
        <div class="task-content" onclick="viewTaskDetails(${task.id})" style="cursor: pointer;">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-description markdown-content">${marked.parse(task.description)}</div>` : ''}
          
          <div class="task-meta">
            ${task.due_date ? `<span>${ICONS.calendar} ${formatDate(task.due_date)}</span>` : ''}
            ${task.version ? `<span class="version-badge">${ICONS.version} ${escapeHtml(task.version)}</span>` : ''}
            <span class="badge badge-${task.criticality || 'medium'}">
              ${getCriticalityText(task.criticality)}
            </span>
          </div>
          
          ${tags.length > 0 ? `
            <div class="task-tags">
              ${tags.map(tag => `<span class="tag-badge" style="background:${getTagColor(tag)}22;color:${getTagColor(tag)};border:1px solid ${getTagColor(tag)}44;">${escapeHtml(tag)}</span>`).join('')}
            </div>
          ` : ''}
          
          ${images.length > 0 ? `
            <div class="task-images">
              ${images.map(img => `
                <img src="${img}" alt="Task image" class="task-image" onclick="viewImage('${img}')">
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <div class="task-actions">
          <div class="status-buttons">
            ${getStatusButtons(task.id, status)}
          </div>
          <button class="btn btn-sm btn-secondary" onclick="editTask(${task.id})">${ICONS.edit}</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})">${ICONS.delete}</button>
        </div>
      </div>
    `;
  }).join('');
  
  // Aplicar syntax highlighting a bloques de código
  tasksList.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
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
        style="min-width: 28px;"
      >
        ${icons[status]}
      </button>
    `).join('');
}

async function viewTaskDetails(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;
  
  editingTaskId = id;  // Guardar para el botón de editar
  
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

  // Versión
  const versionContainer = document.getElementById('viewTaskVersionContainer');
  if (versionContainer) {
    if (task.version) {
      document.getElementById('viewTaskVersion').innerHTML = `${ICONS.version} ${escapeHtml(task.version)}`;
      versionContainer.style.display = 'block';
    } else {
      versionContainer.style.display = 'none';
    }
  }
  
  // Tags
  const tagsContainer = document.getElementById('viewTaskTagsContainer');
  const tags = task.tags ? JSON.parse(task.tags) : [];
  if (tags.length > 0) {
    document.getElementById('viewTaskTags').innerHTML = tags.map(tag => 
      `<span class="tag-badge" style="background:${getTagColor(tag)}22;color:${getTagColor(tag)};border:1px solid ${getTagColor(tag)}44;">${escapeHtml(tag)}</span>`
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
      `<img src="${img}" alt="Task image" class="task-image" onclick="viewImage('${img}')">`
    ).join('');
    imagesContainer.style.display = 'block';
  } else {
    imagesContainer.style.display = 'none';
  }
  
  // Abrir modal
  taskViewModal.classList.add('active');
}

function openNewTaskModal() {
  editingTaskId = null;
  taskImages = [];
  document.getElementById('taskModalTitle').textContent = 'Nueva Tarea';
  document.getElementById('taskId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskDueDate').value = '';
  document.getElementById('taskCriticality').value = 'medium';
  document.getElementById('taskStatus').value = 'pending';
  document.getElementById('taskVersion').value = '';
  
  // Establecer el proyecto actual en el campo oculto
  document.getElementById('taskProjectId').value = currentProjectId;
  
  // Ocultar selectores de proyecto ya que estamos en un proyecto específico
  if (taskProjectSelector) {
    taskProjectSelector.style.display = 'none';
  }
  if (taskSubProjectSelector) {
    taskSubProjectSelector.style.display = 'none';
  }
  
  // Remover el atributo required del select cuando está oculto
  if (taskMainProject) {
    taskMainProject.removeAttribute('required');
  }
  
  // Desmarcar todos los tags
  document.querySelectorAll('input[name="taskTag"]').forEach(cb => cb.checked = false);
  
  imagesPreview.innerHTML = '';
  resetMarkdownPreview();
  taskModal.classList.add('active');
}

async function editTask(id) {
  const task = tasks.find(t => t.id === id);
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
  document.getElementById('taskVersion').value = task.version || '';
  
  // Marcar los tags que tiene la tarea
  document.querySelectorAll('input[name="taskTag"]').forEach(cb => {
    cb.checked = taskTags.includes(cb.value);
  });
  
  // Ocultar selectores de proyecto (modo edición)
  if (taskProjectSelector) {
    taskProjectSelector.style.display = 'none';
  }
  if (taskSubProjectSelector) {
    taskSubProjectSelector.style.display = 'none';
  }
  
  // Remover el atributo required del select cuando está oculto
  if (taskMainProject) {
    taskMainProject.removeAttribute('required');
  }
  
  renderImagePreviews();
  resetMarkdownPreview();
  taskModal.classList.add('active');
}

async function handleTaskSubmit(e) {
  e.preventDefault();

  // Obtener tags seleccionados
  const selectedTags = Array.from(document.querySelectorAll('input[name="taskTag"]:checked'))
    .map(cb => cb.value);

  // Obtener el project_id del campo oculto (establecido al abrir el modal)
  const projectId = document.getElementById('taskProjectId').value || currentProjectId;

  const taskData = {
    project_id: projectId,
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    due_date: document.getElementById('taskDueDate').value || null,
    criticality: document.getElementById('taskCriticality').value,
    status: document.getElementById('taskStatus').value,
    version: document.getElementById('taskVersion').value || null,
    tags: selectedTags,
    images: taskImages
  };

  try {
    if (editingTaskId) {
      await window.api.updateTask(editingTaskId, taskData);
    } else {
      await window.api.createTask(taskData);
    }
    
    taskModal.classList.remove('active');
    await loadTasks();
  } catch (error) {
    console.error('Error al guardar tarea:', error);
    alert('Error al guardar la tarea');
  }
}

async function updateTaskStatus(id, status) {
  try {
    await window.api.updateTaskStatus(id, status);
    await loadTasks();
  } catch (error) {
    console.error('Error al cambiar estado:', error);
  }
}

async function toggleTask(id) {
  try {
    await window.api.toggleTask(id);
    await loadTasks();
  } catch (error) {
    console.error('Error al cambiar estado:', error);
  }
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

function renderImagePreviews() {
  imagesPreview.innerHTML = taskImages.map((img, index) => `
    <div class="image-preview-item">
      <img src="${img}" alt="Preview">
      <button type="button" class="image-preview-remove" onclick="removeImage(${index})">&times;</button>
    </div>
  `).join('');
}

function removeImage(index) {
  taskImages.splice(index, 1);
  renderImagePreviews();
}

function viewImage(src) {
  const imageViewerModal = document.getElementById('imageViewerModal');
  const imageViewerImg = document.getElementById('imageViewerImg');
  
  if (imageViewerModal && imageViewerImg) {
    imageViewerImg.src = src;
    imageViewerModal.classList.add('active');
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

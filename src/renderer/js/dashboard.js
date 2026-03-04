// dashboard.js - Dashboard con todas las tareas
let allTasks = [];
let filteredTasks = [];
let sortColumn = 'due_date';
let sortDirection = 'asc';
let editingTaskId = null;
let taskImages = [];

// Elementos del DOM
const tasksTableBody = document.getElementById('tasksTableBody');
const filterProject = document.getElementById('filterProject');
const searchTasks = document.getElementById('searchTasks');
const sortableHeaders = document.querySelectorAll('.sortable');

// Modal de edición
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const addImageBtn = document.getElementById('addImageBtn');
const taskImagesInput = document.getElementById('taskImages');
const imagesPreview = document.getElementById('imagesPreview');

// Elementos de estadísticas
const totalTasksEl = document.getElementById('totalTasks');
const completedTasksEl = document.getElementById('completedTasks');
const pendingTasksEl = document.getElementById('pendingTasks');
const criticalTasksEl = document.getElementById('criticalTasks');

// Event Listeners
document.addEventListener('DOMContentLoaded', function() {
  initTags();
  init();
});
filterProject.addEventListener('change', applyFilters);
searchTasks.addEventListener('input', applyFilters);

// Event listeners del modal
if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);
if (addImageBtn) addImageBtn.addEventListener('click', () => taskImagesInput.click());
if (taskImagesInput) taskImagesInput.addEventListener('change', handleImageSelect);

document.querySelectorAll('.modal-close').forEach(btn => {
  btn.addEventListener('click', function() {
    this.closest('.modal').classList.remove('active');
  });
});

if (taskModal) {
  taskModal.addEventListener('click', (e) => {
    if (e.target === taskModal) taskModal.classList.remove('active');
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

async function loadProjects() {
  const projects = await window.api.getProjects();
  filterProject.innerHTML = '<option value="">Todos los proyectos</option>' +
    projects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

async function loadTasks() {
  allTasks = await window.api.getAllTasks();
  filteredTasks = [...allTasks];
  updateStats();
  sortAndRenderTasks();
}

function updateStats() {
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.completed).length;
  const pending = total - completed;
  const critical = allTasks.filter(t => t.criticality === 'critical' && !t.completed).length;

  totalTasksEl.textContent = total;
  completedTasksEl.textContent = completed;
  pendingTasksEl.textContent = pending;
  criticalTasksEl.textContent = critical;
}

function applyFilters() {
  const projectFilter = filterProject.value;
  const searchTerm = searchTasks.value.toLowerCase();

  filteredTasks = allTasks.filter(task => {
    const matchesProject = !projectFilter || task.project_id == projectFilter;
    const matchesSearch = !searchTerm || 
      task.title.toLowerCase().includes(searchTerm) ||
      (task.description && task.description.toLowerCase().includes(searchTerm));
    
    return matchesProject && matchesSearch;
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
        <td colspan="6" style="text-align: center; padding: 2rem; color: var(--text-secondary);">
          No hay tareas que mostrar
        </td>
      </tr>
    `;
    return;
  }

  tasksTableBody.innerHTML = filteredTasks.map(task => {
    const tags = task.tags ? JSON.parse(task.tags) : [];
    
    return `
    <tr>
      <td>
        <span class="badge ${task.completed ? 'badge-completed' : 'badge-pending'}">
          ${task.completed ? '✓ Completada' : '○ Pendiente'}
        </span>
      </td>
      <td>
        <strong>${escapeHtml(task.title)}</strong>
        ${task.description ? `<br><small style="color: var(--text-secondary);">${escapeHtml(task.description.substring(0, 60))}${task.description.length > 60 ? '...' : ''}</small>` : ''}
        ${tags.length > 0 ? `<br><div style="display: flex; gap: 0.25rem; margin-top: 0.25rem; flex-wrap: wrap;">${tags.map(tag => `<span class="badge tag-badge">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
      </td>
      <td>
        <span style="display: inline-flex; align-items: center; gap: 0.5rem;">
          <span style="width: 12px; height: 12px; border-radius: 50%; background-color: ${task.project_color || '#3b82f6'};"></span>
          ${escapeHtml(task.project_name || 'Sin proyecto')}
        </span>
      </td>
      <td>
        <span class="badge badge-${task.criticality || 'medium'}">
          ${getCriticalityText(task.criticality)}
        </span>
      </td>
      <td>${task.due_date ? formatDate(task.due_date) : '-'}</td>
      <td>
        <div style="display: flex; gap: 0.5rem;">
          <button class="btn btn-sm btn-secondary" onclick="toggleTask(${task.id})">
            ${task.completed ? '↺' : '✓'}
          </button>
          <button class="btn btn-sm btn-secondary" onclick="editTask(${task.id})" title="Editar">✏️</button>
          <button class="btn btn-sm btn-primary" onclick="viewTask(${task.id})" title="Ver proyecto">👁️</button>
        </div>
      </td>
    </tr>
  `}).join('');
}

async function toggleTask(id) {
  try {
    await window.api.toggleTask(id);
    await loadTasks();
  } catch (error) {
    console.error('Error al cambiar estado de tarea:', error);
  }
}

function viewTask(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (task) {
    window.location.href = `project.html?id=${task.project_id}`;
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
  
  // Marcar los tags que tiene la tarea
  document.querySelectorAll('input[name="taskTag"]').forEach(cb => {
    cb.checked = taskTags.includes(cb.value);
  });
  
  renderImagePreviews();
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

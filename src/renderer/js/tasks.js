// tasks.js - Manejo de tareas en vista de proyecto
let tasks = [];
let currentProjectId = null;
let editingTaskId = null;
let taskImages = [];

// Elementos del DOM
const tasksList = document.getElementById('tasksList');
const newTaskBtn = document.getElementById('newTaskBtn');
const taskModal = document.getElementById('taskModal');
const taskForm = document.getElementById('taskForm');
const addImageBtn = document.getElementById('addImageBtn');
const taskImagesInput = document.getElementById('taskImages');
const imagesPreview = document.getElementById('imagesPreview');
const projectTitleEl = document.getElementById('projectTitle');

// Tabs
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

// Event Listeners
document.addEventListener('DOMContentLoaded', initTasks);
newTaskBtn.addEventListener('click', openNewTaskModal);
taskForm.addEventListener('submit', handleTaskSubmit);
addImageBtn.addEventListener('click', () => taskImagesInput.click());
taskImagesInput.addEventListener('change', handleImageSelect);

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

taskModal.addEventListener('click', (e) => {
  if (e.target === taskModal) taskModal.classList.remove('active');
});

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
    
    return `
      <div class="task-item ${task.completed ? 'completed' : ''}">
        <input 
          type="checkbox" 
          class="task-checkbox" 
          ${task.completed ? 'checked' : ''}
          onchange="toggleTask(${task.id})"
        >
        <div class="task-content">
          <div class="task-title">${escapeHtml(task.title)}</div>
          ${task.description ? `<div class="task-description">${escapeHtml(task.description)}</div>` : ''}
          
          <div class="task-meta">
            ${task.due_date ? `<span>📅 ${formatDate(task.due_date)}</span>` : ''}
            <span class="badge badge-${task.criticality || 'medium'}">
              ${getCriticalityText(task.criticality)}
            </span>
          </div>
          
          ${images.length > 0 ? `
            <div class="task-images">
              ${images.map(img => `
                <img src="${img}" alt="Task image" class="task-image" onclick="viewImage('${img}')">
              `).join('')}
            </div>
          ` : ''}
        </div>
        
        <div class="task-actions">
          <button class="btn btn-sm btn-secondary" onclick="editTask(${task.id})">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="deleteTask(${task.id})">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
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
  imagesPreview.innerHTML = '';
  taskModal.classList.add('active');
}

async function editTask(id) {
  const task = tasks.find(t => t.id === id);
  if (!task) return;

  editingTaskId = id;
  taskImages = task.images ? JSON.parse(task.images) : [];
  
  document.getElementById('taskModalTitle').textContent = 'Editar Tarea';
  document.getElementById('taskId').value = task.id;
  document.getElementById('taskTitle').value = task.title;
  document.getElementById('taskDescription').value = task.description || '';
  document.getElementById('taskDueDate').value = task.due_date || '';
  document.getElementById('taskCriticality').value = task.criticality || 'medium';
  
  renderImagePreviews();
  taskModal.classList.add('active');
}

async function handleTaskSubmit(e) {
  e.preventDefault();

  const taskData = {
    project_id: currentProjectId,
    title: document.getElementById('taskTitle').value,
    description: document.getElementById('taskDescription').value,
    due_date: document.getElementById('taskDueDate').value || null,
    criticality: document.getElementById('taskCriticality').value,
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
  // Simple image viewer - podría mejorarse con un modal
  window.open(src, '_blank');
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

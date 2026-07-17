// calendar.js - Vista de calendario mensual con tareas
let allTasks = [];
let allProjects = [];
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth(); // 0-indexed
let editingTaskId = null;
let taskImages = [];

const MONTHS_ES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

// ===================== INIT =====================

document.addEventListener('DOMContentLoaded', function () {
  initTags();
  initMarkdownPreview();
  setupModalListeners();
  setupNavListeners();

  // Botones del modal de visualización
  const editFromViewBtn = document.getElementById('editFromViewBtn');
  const goToProjectBtn = document.getElementById('goToProjectBtn');

  if (editFromViewBtn) {
    editFromViewBtn.innerHTML = `${ICONS.edit} Editar`;
    editFromViewBtn.addEventListener('click', function () {
      document.getElementById('taskViewModal').classList.remove('active');
      if (editingTaskId) editTask(editingTaskId);
    });
  }

  if (goToProjectBtn) {
    goToProjectBtn.innerHTML = `${ICONS.arrow} Ir al Proyecto`;
    goToProjectBtn.addEventListener('click', function () {
      const task = allTasks.find(t => t.id === editingTaskId);
      if (task) window.location.href = `project.html?id=${task.project_id}`;
    });
  }

  // Botón nueva tarea
  const newTaskBtn = document.getElementById('newTaskBtn');
  if (newTaskBtn) newTaskBtn.addEventListener('click', openNewTaskModal);

  // Formulario de edición
  const taskForm = document.getElementById('taskForm');
  if (taskForm) taskForm.addEventListener('submit', handleTaskSubmit);

  const addImageBtn = document.getElementById('addImageBtn');
  const taskImagesInput = document.getElementById('taskImages');
  if (addImageBtn) addImageBtn.addEventListener('click', () => taskImagesInput && taskImagesInput.click());
  if (taskImagesInput) taskImagesInput.addEventListener('change', handleImageSelect);

  const taskMainProject = document.getElementById('taskMainProject');
  if (taskMainProject) taskMainProject.addEventListener('change', loadTaskSubProjects);

  // Toggle preview markdown en modal de edición
  const toggleBtn = document.getElementById('toggleTaskPreview');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleMarkdownPreview);

  init();
});

async function init() {
  await Promise.all([loadProjects(), loadTasks()]);
  renderCalendar();
}

// ===================== DATA =====================

async function loadTasks() {
  allTasks = await window.api.getAllTasks();
}

async function loadProjects() {
  allProjects = await window.api.getProjects();
}

// ===================== NAVIGATION =====================

function setupNavListeners() {
  document.getElementById('prevMonthBtn').addEventListener('click', () => {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
  });

  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
  });

  document.getElementById('todayBtn').addEventListener('click', () => {
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    renderCalendar();
  });
}

// ===================== CALENDAR RENDER =====================

function renderCalendar() {
  document.getElementById('calendarMonthTitle').textContent =
    `${MONTHS_ES[currentMonth]} ${currentYear}`;

  const grid = document.getElementById('calendarGrid');
  grid.innerHTML = '';

  const today = new Date();
  const todayStr = toISODateLocal(today);

  // Primer día del mes (0=Dom … 6=Sáb → ajustar a Lun=0)
  const firstDay = new Date(currentYear, currentMonth, 1);
  let startDow = firstDay.getDay(); // 0 Dom
  startDow = (startDow + 6) % 7;   // Lun=0 … Dom=6

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const daysInPrevMonth = new Date(currentYear, currentMonth, 0).getDate();

  // Indexar tareas por due_date para acceso rápido
  const tasksByDate = buildTasksByDate();

  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;

  for (let i = 0; i < totalCells; i++) {
    let dayNum, dateStr, isOtherMonth;

    if (i < startDow) {
      // Días del mes anterior
      dayNum = daysInPrevMonth - startDow + 1 + i;
      const d = new Date(currentYear, currentMonth - 1, dayNum);
      dateStr = toISODateLocal(d);
      isOtherMonth = true;
    } else if (i < startDow + daysInMonth) {
      dayNum = i - startDow + 1;
      dateStr = `${currentYear}-${pad(currentMonth + 1)}-${pad(dayNum)}`;
      isOtherMonth = false;
    } else {
      // Días del mes siguiente
      dayNum = i - startDow - daysInMonth + 1;
      const d = new Date(currentYear, currentMonth + 1, dayNum);
      dateStr = toISODateLocal(d);
      isOtherMonth = true;
    }

    const isToday = dateStr === todayStr;
    const dayTasks = tasksByDate[dateStr] || [];

    const cell = buildDayCell(dayNum, dateStr, isOtherMonth, isToday, dayTasks);
    grid.appendChild(cell);
  }
}

function buildDayCell(dayNum, dateStr, isOtherMonth, isToday, tasks) {
  const cell = document.createElement('div');
  cell.className = 'calendar-day' +
    (isOtherMonth ? ' calendar-day--other-month' : '') +
    (isToday ? ' calendar-day--today' : '');

  // Click en área vacía del día → nueva tarea con esa fecha
  cell.addEventListener('click', () => openNewTaskModal(dateStr));

  const header = document.createElement('div');
  header.className = 'calendar-day-number';
  header.textContent = dayNum;
  cell.appendChild(header);

  const tasksList = document.createElement('div');
  tasksList.className = 'calendar-day-tasks';

  tasks.forEach(task => {
    const critColor = getCriticalityColor(task.criticality || 'medium');
    const tags = task.tags ? JSON.parse(task.tags) : [];
    const tagsHtml = tags.length > 0 ? `
      <div class="calendar-task-tags-row">
        ${tags.slice(0, 2).map(tag => `<span class="calendar-task-tag-chip" style="background:${getTagColor(tag)}22;color:${getTagColor(tag)};">${escapeHtml(tag)}</span>`).join('')}
        ${tags.length > 2 ? `<span class="calendar-task-tag-chip" style="background:var(--bg-secondary);color:var(--text-secondary);">+${tags.length - 2}</span>` : ''}
      </div>` : '';
    const versionHtml = task.version ? `<div class="calendar-task-version-row"><span class="version-badge">${ICONS.version} ${escapeHtml(task.version)}</span></div>` : '';
    const pill = document.createElement('div');
    pill.className = `calendar-task calendar-task--${task.status || 'pending'}`;
    pill.title = `${task.title} [• ${getCriticalityText(task.criticality || 'medium')}]`;
    pill.style.borderLeft = `3px solid ${critColor}`;
    pill.innerHTML = `
      <div class="calendar-task-main">
        <span class="calendar-task-dot" style="background-color:${task.project_color || task.parent_project_color || '#3b82f6'};"></span>
        <span class="calendar-task-title">${escapeHtml(task.title)}</span>
      </div>
      ${versionHtml}
      ${tagsHtml}
    `;
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      viewTask(task.id);
    });
    tasksList.appendChild(pill);
  });

  cell.appendChild(tasksList);
  return cell;
}

function buildTasksByDate() {
  const map = {};
  allTasks.forEach(task => {
    if (task.due_date) {
      // due_date puede ser "YYYY-MM-DD" o con timestamp; normalizamos
      const key = task.due_date.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(task);
    }
  });
  return map;
}

// ===================== TASK VIEW MODAL =====================

function viewTask(taskId) {
  const task = allTasks.find(t => t.id === taskId);
  if (!task) return;

  editingTaskId = taskId;

  document.getElementById('viewTaskTitle').textContent = task.title;

  const descContainer = document.getElementById('viewTaskDescriptionContainer');
  const descContent = document.getElementById('viewTaskDescription');
  if (task.description) {
    descContent.innerHTML = marked.parse(task.description);
    descContent.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    descContainer.style.display = 'block';
  } else {
    descContainer.style.display = 'none';
  }

  document.getElementById('viewTaskStatus').innerHTML =
    `<span class="badge ${getStatusBadgeClass(task.status || 'pending')}">${getStatusText(task.status || 'pending')}</span>`;

  document.getElementById('viewTaskCriticality').innerHTML =
    `<span class="badge badge-${task.criticality || 'medium'}">${getCriticalityText(task.criticality)}</span>`;

  const projectColor = task.parent_project_color || task.project_color || '#3b82f6';
  const projectName = task.parent_project_name || task.project_name || 'Sin proyecto';
  document.getElementById('viewTaskProject').innerHTML = `
    <span style="display:inline-flex;align-items:center;gap:0.5rem;">
      <span style="width:12px;height:12px;border-radius:50%;background-color:${projectColor};"></span>
      ${escapeHtml(projectName)}
    </span>`;

  const subprojectContainer = document.getElementById('viewTaskSubprojectContainer');
  if (task.parent_project_name) {
    document.getElementById('viewTaskSubproject').innerHTML = `
      <span style="display:inline-flex;align-items:center;gap:0.5rem;">
        <span style="width:12px;height:12px;border-radius:50%;background-color:${task.project_color || '#3b82f6'};"></span>
        ${escapeHtml(task.project_name || 'Sin subcategoría')}
      </span>`;
    subprojectContainer.style.display = 'block';
  } else {
    subprojectContainer.style.display = 'none';
  }

  if (task.created_at) {
    document.getElementById('viewTaskCreated').textContent = formatDateTime(task.created_at);
  }

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

  const tagsContainer = document.getElementById('viewTaskTagsContainer');
  const tags = task.tags ? JSON.parse(task.tags) : [];
  if (tags.length > 0) {
    document.getElementById('viewTaskTags').innerHTML =
      tags.map(tag => `<span class="tag-badge" style="background:${getTagColor(tag)}22;color:${getTagColor(tag)};border:1px solid ${getTagColor(tag)}44;">${escapeHtml(tag)}</span>`).join('');
    tagsContainer.style.display = 'block';
  } else {
    tagsContainer.style.display = 'none';
  }

  const imagesContainer = document.getElementById('viewTaskImagesContainer');
  const images = task.images ? JSON.parse(task.images) : [];
  if (images.length > 0) {
    document.getElementById('viewTaskImages').innerHTML = images.map(img =>
      `<img src="${img}" alt="Task image" class="task-image"
        style="max-width:200px;max-height:200px;object-fit:cover;border-radius:0.5rem;cursor:pointer;"
        onclick="viewImage('${img}')">`
    ).join('');
    imagesContainer.style.display = 'block';
  } else {
    imagesContainer.style.display = 'none';
  }

  document.getElementById('taskViewModal').classList.add('active');
}

function viewImage(src) {
  const modal = document.getElementById('imageViewerModal');
  const img = document.getElementById('imageViewerImg');
  if (img) img.src = src;
  if (modal) modal.classList.add('active');
}

// ===================== TASK EDIT MODAL =====================

function openNewTaskModal(defaultDate = '') {
  editingTaskId = null;
  taskImages = [];

  document.getElementById('taskModalTitle').textContent = 'Nueva Tarea';
  document.getElementById('taskId').value = '';
  document.getElementById('taskProjectId').value = '';
  document.getElementById('taskTitle').value = '';
  document.getElementById('taskDescription').value = '';
  document.getElementById('taskDueDate').value = defaultDate;
  document.getElementById('taskCriticality').value = 'medium';
  document.getElementById('taskStatus').value = 'pending';
  document.getElementById('taskVersion').value = '';

  document.querySelectorAll('input[name="taskTag"]').forEach(cb => { cb.checked = false; });

  const taskProjectSelector = document.getElementById('taskProjectSelector');
  const taskSubProjectSelector = document.getElementById('taskSubProjectSelector');
  const taskMainProject = document.getElementById('taskMainProject');
  if (taskProjectSelector) taskProjectSelector.style.display = 'block';
  if (taskSubProjectSelector) taskSubProjectSelector.style.display = 'block';
  if (taskMainProject) taskMainProject.setAttribute('required', 'required');

  loadTaskModalProjects();
  renderImagePreviews();
  resetMarkdownPreview();
  document.getElementById('taskModal').classList.add('active');
}

function loadTaskModalProjects() {
  const taskMainProject = document.getElementById('taskMainProject');
  if (!taskMainProject) return;

  const mainProjects = allProjects.filter(p => !p.parent_id);
  taskMainProject.innerHTML = '<option value="">-- Seleccionar Proyecto --</option>';
  mainProjects.forEach(project => {
    const option = document.createElement('option');
    option.value = project.id;
    option.textContent = project.name;
    taskMainProject.appendChild(option);
  });

  const taskSubProject = document.getElementById('taskSubProject');
  if (taskSubProject) taskSubProject.innerHTML = '<option value="">-- Sin Subcategoría --</option>';
}

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
  document.getElementById('taskVersion').value = task.version || '';

  document.querySelectorAll('input[name="taskTag"]').forEach(cb => {
    cb.checked = taskTags.includes(cb.value);
  });

  const taskProjectSelector = document.getElementById('taskProjectSelector');
  const taskSubProjectSelector = document.getElementById('taskSubProjectSelector');
  const taskMainProject = document.getElementById('taskMainProject');
  if (taskProjectSelector) taskProjectSelector.style.display = 'none';
  if (taskSubProjectSelector) taskSubProjectSelector.style.display = 'none';
  if (taskMainProject) taskMainProject.removeAttribute('required');

  renderImagePreviews();
  resetMarkdownPreview();
  document.getElementById('taskModal').classList.add('active');
}

function loadTaskSubProjects() {
  const taskMainProject = document.getElementById('taskMainProject');
  const taskSubProject = document.getElementById('taskSubProject');
  if (!taskMainProject || !taskSubProject) return;

  const mainProjectId = parseInt(taskMainProject.value);
  taskSubProject.innerHTML = '<option value="">-- Sin Subcategoría --</option>';

  if (mainProjectId) {
    allProjects.filter(p => p.parent_id === mainProjectId).forEach(project => {
      const option = document.createElement('option');
      option.value = project.id;
      option.textContent = project.name;
      taskSubProject.appendChild(option);
    });
  }
}

async function handleTaskSubmit(e) {
  e.preventDefault();

  const selectedTags = Array.from(document.querySelectorAll('input[name="taskTag"]:checked'))
    .map(cb => cb.value);

  // Determinar project_id
  let projectId;
  if (editingTaskId) {
    projectId = document.getElementById('taskProjectId').value;
  } else {
    const taskSubProject = document.getElementById('taskSubProject');
    const taskMainProject = document.getElementById('taskMainProject');
    projectId = taskSubProject?.value || taskMainProject?.value;
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
    document.getElementById('taskModal').classList.remove('active');
    await loadTasks();
    renderCalendar();
  } catch (error) {
    console.error('Error al guardar tarea:', error);
    alert('Error al guardar la tarea');
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
  e.target.value = '';
}

function renderImagePreviews() {
  const imagesPreview = document.getElementById('imagesPreview');
  if (!imagesPreview) return;
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

// ===================== MARKDOWN PREVIEW =====================

function initMarkdownPreview() {
  marked.setOptions({ breaks: true, gfm: true });
}

function resetMarkdownPreview() {
  const textarea = document.getElementById('taskDescription');
  const preview = document.getElementById('taskDescriptionPreview');
  const toggleBtn = document.getElementById('toggleTaskPreview');
  if (!textarea || !preview || !toggleBtn) return;
  textarea.style.display = 'block';
  preview.style.display = 'none';
  toggleBtn.innerHTML = `${ICONS.view} Vista previa`;
}

function toggleMarkdownPreview() {
  const textarea = document.getElementById('taskDescription');
  const preview = document.getElementById('taskDescriptionPreview');
  const toggleBtn = document.getElementById('toggleTaskPreview');
  if (!textarea || !preview || !toggleBtn) return;

  if (preview.style.display === 'none') {
    preview.innerHTML = marked.parse(textarea.value || '');
    preview.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
    textarea.style.display = 'none';
    preview.style.display = 'block';
    toggleBtn.innerHTML = `${ICONS.edit} Editar`;
  } else {
    textarea.style.display = 'block';
    preview.style.display = 'none';
    toggleBtn.innerHTML = `${ICONS.view} Vista previa`;
  }
}

// ===================== TAGS =====================

function initTags() {
  const tagsContainer = document.getElementById('tagsSelector');
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

// ===================== MODAL LISTENERS =====================

function setupModalListeners() {
  document.querySelectorAll('.modal-close, .modal-close-btn').forEach(btn => {
    btn.addEventListener('click', function () {
      this.closest('.modal').classList.remove('active');
    });
  });

  ['taskModal', 'taskViewModal', 'imageViewerModal'].forEach(id => {
    const modal = document.getElementById(id);
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal && !window.shouldPreventModalClose?.()) {
          modal.classList.remove('active');
        }
      });
    }
  });
}

// ===================== HELPERS =====================

function getStatusBadgeClass(status) {
  const classes = {
    pending: 'badge-pending',
    in_progress: 'badge-info',
    testing: 'badge-warning',
    blocked: 'badge-blocked',
    completed: 'badge-completed'
  };
  return classes[status] || 'badge-pending';
}

function getStatusText(status) {
  const texts = {
    pending: `${ICONS.pending} Pendiente`,
    in_progress: `${ICONS.inProgress} En Curso`,
    testing: `${ICONS.testing} Testing`,
    blocked: `${ICONS.blocked} Bloqueado`,
    completed: `${ICONS.completed} Completada`
  };
  return texts[status] || `${ICONS.pending} Pendiente`;
}

function getCriticalityText(criticality) {
  const texts = { low: 'Baja', medium: 'Media', high: 'Alta', critical: 'Crítica' };
  return texts[criticality] || 'Media';
}

function getCriticalityColor(criticality) {
  const colors = { low: '#10b981', medium: '#f59e0b', high: '#f97316', critical: '#ef4444' };
  return colors[criticality] || '#f59e0b';
}

function formatDate(dateString) {
  const date = new Date(dateString + 'T00:00:00');
  return date.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function toISODateLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

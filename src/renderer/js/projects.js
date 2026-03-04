// projects.js - Manejo de proyectos
let projects = [];
let editingProjectId = null;

// Elementos del DOM
const projectsGrid = document.getElementById('projectsGrid');
const projectModal = document.getElementById('projectModal');
const projectForm = document.getElementById('projectForm');
const searchProjects = document.getElementById('searchProjects');
const modalCloses = document.querySelectorAll('.modal-close');

// Event Listeners
document.addEventListener('DOMContentLoaded', loadProjects);

// Esperar a que el sidebar esté cargado para el botón
window.addEventListener('sidebarLoaded', function() {
  const newProjectBtn = document.getElementById('newProjectBtn');
  if (newProjectBtn) {
    newProjectBtn.addEventListener('click', openNewProjectModal);
  }
});

projectForm.addEventListener('submit', handleProjectSubmit);
searchProjects.addEventListener('input', filterProjects);

modalCloses.forEach(btn => {
  btn.addEventListener('click', closeModals);
});

projectModal.addEventListener('click', (e) => {
  if (e.target === projectModal) closeModals();
});

// Funciones
async function loadProjects() {
  projects = await window.api.getProjects();
  renderProjects(projects);
  updateParentProjectSelect();
}

function renderProjects(projectsToRender) {
  const mainProjects = projectsToRender.filter(p => !p.parent_id);
  
  if (mainProjects.length === 0) {
    projectsGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
        <p>No hay proyectos aún. ¡Crea tu primer proyecto!</p>
      </div>
    `;
    return;
  }

  projectsGrid.innerHTML = mainProjects.map(project => {
    const subProjects = projectsToRender.filter(p => p.parent_id === project.id);
    
    return `
      <div class="project-card" style="border-left-color: ${project.color}">
        <div class="project-card-header">
          <div>
            <h3>${escapeHtml(project.name)}</h3>
            ${subProjects.length > 0 ? `<span class="project-badge">${subProjects.length} subcategorías</span>` : ''}
          </div>
          <div class="project-card-actions">
            <button class="btn btn-sm btn-secondary" onclick="editProject(${project.id})">✏️</button>
            <button class="btn btn-sm btn-danger" onclick="deleteProject(${project.id})">🗑️</button>
          </div>
        </div>
        <button class="btn btn-primary btn-block" onclick="openProject(${project.id})">
          Ver Proyecto
        </button>
        ${subProjects.length > 0 ? `
          <div style="margin-top: 1rem; display: flex; flex-direction: column; gap: 0.5rem;">
            ${subProjects.map(sub => `
              <div style="padding: 0.5rem; background: var(--bg-primary); border-radius: 0.375rem; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 0.875rem;">${escapeHtml(sub.name)}</span>
                <div style="display: flex; gap: 0.25rem;">
                  <button class="btn btn-sm btn-secondary" onclick="openProject(${sub.id})">→</button>
                  <button class="btn btn-sm btn-danger" onclick="deleteProject(${sub.id})">🗑️</button>
                </div>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
}

function openNewProjectModal() {
  editingProjectId = null;
  document.getElementById('modalTitle').textContent = 'Nuevo Proyecto';
  document.getElementById('projectId').value = '';
  document.getElementById('projectName').value = '';
  document.getElementById('parentProject').value = '';
  document.getElementById('projectColor').value = '#3b82f6';
  projectModal.classList.add('active');
}

async function editProject(id) {
  const project = projects.find(p => p.id === id);
  if (!project) return;

  editingProjectId = id;
  document.getElementById('modalTitle').textContent = 'Editar Proyecto';
  document.getElementById('projectId').value = project.id;
  document.getElementById('projectName').value = project.name;
  document.getElementById('parentProject').value = project.parent_id || '';
  document.getElementById('projectColor').value = project.color || '#3b82f6';
  projectModal.classList.add('active');
}

async function handleProjectSubmit(e) {
  e.preventDefault();

  const projectData = {
    name: document.getElementById('projectName').value,
    parent_id: document.getElementById('parentProject').value || null,
    color: document.getElementById('projectColor').value
  };

  try {
    if (editingProjectId) {
      await window.api.updateProject(editingProjectId, projectData);
    } else {
      await window.api.createProject(projectData);
    }
    
    closeModals();
    await loadProjects();
  } catch (error) {
    console.error('Error al guardar proyecto:', error);
    alert('Error al guardar el proyecto');
  }
}

async function deleteProject(id) {
  if (!confirm('¿Estás seguro de eliminar este proyecto? Se eliminarán todas sus tareas y notas.')) {
    return;
  }

  try {
    await window.api.deleteProject(id);
    await loadProjects();
  } catch (error) {
    console.error('Error al eliminar proyecto:', error);
    alert('Error al eliminar el proyecto');
  }
}

function openProject(id) {
  window.location.href = `project.html?id=${id}`;
}

function updateParentProjectSelect() {
  const select = document.getElementById('parentProject');
  const mainProjects = projects.filter(p => !p.parent_id);
  
  select.innerHTML = '<option value="">-- Ninguno --</option>' +
    mainProjects.map(p => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join('');
}

function filterProjects() {
  const search = searchProjects.value.toLowerCase();
  const filtered = projects.filter(p => 
    p.name.toLowerCase().includes(search)
  );
  renderProjects(filtered);
}

function closeModals() {
  projectModal.classList.remove('active');
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// notes.js - Manejo de notas en vista de proyecto
let notes = [];
let editingNoteId = null;

// Elementos del DOM
const notesList = document.getElementById('notesList');
const newNoteBtn = document.getElementById('newNoteBtn');
const noteModal = document.getElementById('noteModal');
const noteForm = document.getElementById('noteForm');

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
document.addEventListener('DOMContentLoaded', () => {
  // Esperar un momento para que tasks.js establezca currentProjectId
  setTimeout(loadNotes, 100);
  initMarkdownPreview();
});

newNoteBtn.addEventListener('click', openNewNoteModal);
noteForm.addEventListener('submit', handleNoteSubmit);

noteModal.addEventListener('click', (e) => {
  if (e.target === noteModal) noteModal.classList.remove('active');
});

// Markdown preview toggle
function initMarkdownPreview() {
  const toggleBtn = document.getElementById('toggleNotePreview');
  const textarea = document.getElementById('noteContent');
  const preview = document.getElementById('noteContentPreview');
  
  if (toggleBtn && textarea && preview) {
    // Establecer icono inicial
    toggleBtn.innerHTML = `${ICONS.view} Vista previa`;
    
    let isPreview = false;
    
    toggleBtn.addEventListener('click', function() {
      isPreview = !isPreview;
      
      if (isPreview) {
        preview.innerHTML = marked.parse(textarea.value || '*Sin contenido*');
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
  const toggleBtn = document.getElementById('toggleNotePreview');
  const textarea = document.getElementById('noteContent');
  const preview = document.getElementById('noteContentPreview');
  
  if (toggleBtn && textarea && preview) {
    textarea.style.display = 'block';
    preview.style.display = 'none';
    toggleBtn.innerHTML = `${ICONS.view} Vista previa`;
  }
}

async function loadNotes() {
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');
  
  if (!projectId) return;
  
  notes = await window.api.getNotes(projectId);
  renderNotes();
}

function renderNotes() {
  if (notes.length === 0) {
    notesList.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-secondary);">
        <p>No hay notas en este proyecto. ¡Crea la primera!</p>
      </div>
    `;
    return;
  }

  notesList.innerHTML = notes.map(note => `
    <div class="note-card" onclick="editNote(${note.id})">
      <h4>${escapeHtml(note.title)}</h4>
      <div class="note-content markdown-content">
        ${marked.parse(note.content || '*Sin contenido*')}
      </div>
      <div class="note-footer">
        <span>${formatDateTime(note.updated_at)}</span>
        <button class="btn btn-sm btn-danger" onclick="event.stopPropagation(); deleteNote(${note.id})">${ICONS.delete}</button>
      </div>
    </div>
  `).join('');
  
  // Aplicar syntax highlighting a bloques de código
  notesList.querySelectorAll('pre code').forEach(block => hljs.highlightElement(block));
}

function openNewNoteModal() {
  editingNoteId = null;
  document.getElementById('noteModalTitle').textContent = 'Nueva Nota';
  document.getElementById('noteId').value = '';
  document.getElementById('noteTitle').value = '';
  document.getElementById('noteContent').value = '';
  resetMarkdownPreview();
  noteModal.classList.add('active');
}

async function editNote(id) {
  const note = notes.find(n => n.id === id);
  if (!note) return;

  editingNoteId = id;
  document.getElementById('noteModalTitle').textContent = 'Editar Nota';
  document.getElementById('noteId').value = note.id;
  document.getElementById('noteTitle').value = note.title;
  document.getElementById('noteContent').value = note.content || '';
  resetMarkdownPreview();
  noteModal.classList.add('active');
}

async function handleNoteSubmit(e) {
  e.preventDefault();

  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('id');

  const noteData = {
    project_id: projectId,
    title: document.getElementById('noteTitle').value,
    content: document.getElementById('noteContent').value
  };

  try {
    if (editingNoteId) {
      await window.api.updateNote(editingNoteId, noteData);
    } else {
      await window.api.createNote(noteData);
    }
    
    noteModal.classList.remove('active');
    await loadNotes();
  } catch (error) {
    console.error('Error al guardar nota:', error);
    alert('Error al guardar la nota');
  }
}

async function deleteNote(id) {
  if (!confirm('¿Estás seguro de eliminar esta nota?')) return;

  try {
    await window.api.deleteNote(id);
    await loadNotes();
  } catch (error) {
    console.error('Error al eliminar nota:', error);
    alert('Error al eliminar la nota');
  }
}

function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('es-ES', { 
    day: '2-digit', 
    month: 'short', 
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

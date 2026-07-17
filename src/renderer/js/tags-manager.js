// tags-manager.js - Gestión de tags personalizados (página de Configuración)
(function () {
  'use strict';

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function renderList() {
    const container = document.getElementById('tagsManagerList');
    if (!container) return;

    const tags = getAvailableTags();

    container.innerHTML = tags.map((tag, idx) => `
      <div class="tag-manager-item">
        <span class="tag-manager-dot" style="background:${tag.color};"></span>
        <span class="tag-manager-name">${escapeHtml(tag.name)}</span>
        <button
          class="tag-manager-delete"
          onclick="window._deleteTag(${idx})"
          title="Eliminar tag"
          ${tags.length <= 1 ? 'disabled' : ''}
        >&times;</button>
      </div>
    `).join('') || '<p style="color:var(--text-secondary);font-size:0.85rem;">No hay tags. Añade el primero.</p>';
  }

  window._deleteTag = function (idx) {
    const tags = getAvailableTags();
    if (tags.length <= 1) return;
    tags.splice(idx, 1);
    saveTagsToStorage(tags);
    renderList();
  };

  window._addTag = function () {
    const nameInput  = document.getElementById('newTagName');
    const colorInput = document.getElementById('newTagColor');
    if (!nameInput || !colorInput) return;

    const name = nameInput.value.trim();
    if (!name) { nameInput.focus(); return; }

    const tags = getAvailableTags();
    if (tags.find(t => t.name.toLowerCase() === name.toLowerCase())) {
      nameInput.style.borderColor = 'var(--danger-color)';
      nameInput.title = 'Ya existe un tag con ese nombre';
      setTimeout(() => { nameInput.style.borderColor = ''; nameInput.title = ''; }, 1800);
      return;
    }

    tags.push({ name, color: colorInput.value });
    saveTagsToStorage(tags);
    nameInput.value = '';
    renderList();
    nameInput.focus();
  };

  window._resetTags = function () {
    if (!confirm('¿Restaurar los tags por defecto? Se eliminarán los tags personalizados.')) return;
    localStorage.removeItem('app-custom-tags');
    renderList();
  };

  document.addEventListener('DOMContentLoaded', function () {
    renderList();

    const nameInput = document.getElementById('newTagName');
    if (nameInput) {
      nameInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); window._addTag(); }
      });
    }
  });
})();

// config.js - Configuración global de la aplicación

// Tags por defecto (se usan si no hay tags personalizados guardados)
const DEFAULT_TAGS = [
  { name: 'Desarrollo',    color: '#3b82f6' },
  { name: 'Instalacion',   color: '#8b5cf6' },
  { name: 'Pruebas',       color: '#f59e0b' },
  { name: 'Documentación', color: '#14b8a6' },
  { name: 'Despliegue',    color: '#10b981' },
  { name: 'Info',          color: '#0ea5e9' },
  { name: 'Bug',           color: '#ef4444' }
];

function getAvailableTags() {
  try {
    const stored = localStorage.getItem('app-custom-tags');
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch (e) {}
  return DEFAULT_TAGS;
}

function saveTagsToStorage(tags) {
  localStorage.setItem('app-custom-tags', JSON.stringify(tags));
}

// AVAILABLE_TAGS se carga desde localStorage (o defaults si no hay datos guardados)
const AVAILABLE_TAGS = getAvailableTags();

function getTagColor(tagName) {
  const tag = AVAILABLE_TAGS.find(t => t.name === tagName);
  return tag ? tag.color : '#6b7280';
}

// Exportar para uso en otros archivos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AVAILABLE_TAGS, DEFAULT_TAGS, getAvailableTags, getTagColor, saveTagsToStorage };
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AVAILABLE_TAGS, getTagColor };
}

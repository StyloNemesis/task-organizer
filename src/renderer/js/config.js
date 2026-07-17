// config.js - Configuración global de la aplicación

// Tags disponibles para las tareas
// Para añadir más tags, simplemente agrega más elementos a este array
const AVAILABLE_TAGS = [
  { name: 'Desarrollo',    color: '#3b82f6' },
  { name: 'Instalacion',   color: '#8b5cf6' },
  { name: 'Pruebas',       color: '#f59e0b' },
  { name: 'Documentación', color: '#14b8a6' },
  { name: 'Despliegue',    color: '#10b981' },
  { name: 'Info',          color: '#0ea5e9' },
  { name: 'Bug',           color: '#ef4444' }
];

function getTagColor(tagName) {
  const tag = AVAILABLE_TAGS.find(t => t.name === tagName);
  return tag ? tag.color : '#6b7280';
}

// Exportar para uso en otros archivos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AVAILABLE_TAGS, getTagColor };
}

// config.js - Configuración global de la aplicación

// Tags disponibles para las tareas
// Para añadir más tags, simplemente agrega más elementos a este array
const AVAILABLE_TAGS = [
  'Desarrollo',
  'Instalacion',
  'Pruebas',
  'Documentación',
  'Despliegue',
  'Info',
  'Bug'
];

// Exportar para uso en otros archivos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { AVAILABLE_TAGS };
}

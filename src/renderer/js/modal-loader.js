// modal-loader.js - Carga dinámica de modales compartidos

/**
 * Configuración de modales disponibles
 * Cada modal tiene un nombre único y su archivo correspondiente
 */
const MODALS_CONFIG = {
  'taskEdit': 'modals/task-edit-modal.html',
  'taskView': 'modals/task-view-modal.html',
  'imageViewer': 'modals/image-viewer-modal.html',
  'note': 'modals/note-modal.html',
  'project': 'modals/project-modal.html'
};

/**
 * Carga un modal HTML desde su archivo de forma SÍNCRONA
 * @param {string} modalPath - Ruta relativa al archivo del modal
 * @returns {string} - HTML del modal
 */
function fetchModalSync(modalPath) {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open('GET', modalPath, false); // false = síncrono
    xhr.send(null);
    
    if (xhr.status === 200) {
      return xhr.responseText;
    } else {
      console.error(`Error al cargar modal (${xhr.status}): ${modalPath}`);
      return '';
    }
  } catch (error) {
    console.error('Error cargando modal:', error);
    return '';
  }
}

/**
 * Inyecta un modal en el DOM
 * @param {string} html - HTML del modal
 */
function injectModal(html) {
  if (!html) return;
  
  const container = document.body;
  if (container) {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    while (temp.firstChild) {
      container.appendChild(temp.firstChild);
    }
  }
}

/**
 * Carga múltiples modales de forma SÍNCRONA
 * @param {string[]} modalNames - Array de nombres de modales a cargar
 */
function loadModalsSync(modalNames) {
  modalNames.forEach((modalName) => {
    const modalPath = MODALS_CONFIG[modalName];
    if (modalPath) {
      const html = fetchModalSync(modalPath);
      injectModal(html);
    } else {
      console.warn(`Modal no encontrado en configuración: ${modalName}`);
    }
  });
}

/**
 * Inicializa la carga de modales de forma SÍNCRONA
 * Esta función debe ser llamada desde cada página especificando qué modales necesita
 * @param {string[]} modalNames - Array de nombres de modales a cargar
 */
window.initModals = function(modalNames) {
  loadModalsSync(modalNames);
  console.log('Modales cargados:', modalNames);
};

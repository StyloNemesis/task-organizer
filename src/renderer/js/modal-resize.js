// modal-resize.js - Manejo de redimensionamiento simétrico de modales

// Flag global para indicar si se está redimensionando
let isAnyModalResizing = false;
let justFinishedResizing = false;

// Función para verificar si se debe bloquear el cierre del modal
window.shouldPreventModalClose = function() {
  return isAnyModalResizing || justFinishedResizing;
};

document.addEventListener('DOMContentLoaded', function() {
  const modalContents = document.querySelectorAll('.modal-content');
  
  modalContents.forEach(modalContent => {
    // Guardar el ancho inicial
    let isResizing = false;
    let startX = 0;
    let startWidth = 0;
    let handleSide = null;
    const parentModal = modalContent.closest('.modal');
    
    // Crear handles de redimensionamiento en ambos lados
    const leftHandle = document.createElement('div');
    const rightHandle = document.createElement('div');
    
    leftHandle.className = 'modal-resize-handle modal-resize-handle-left';
    rightHandle.className = 'modal-resize-handle modal-resize-handle-right';
    
    leftHandle.style.cssText = 'position: absolute; left: 0; top: 0; width: 5px; height: 100%; cursor: ew-resize; z-index: 10;';
    rightHandle.style.cssText = 'position: absolute; right: 0; top: 0; width: 5px; height: 100%; cursor: ew-resize; z-index: 10;';
    
    modalContent.style.position = 'relative';
    modalContent.appendChild(leftHandle);
    modalContent.appendChild(rightHandle);
    
    // Función para iniciar redimensionamiento
    function startResize(e, side) {
      isResizing = true;
      isAnyModalResizing = true;
      handleSide = side;
      startX = e.clientX;
      startWidth = modalContent.offsetWidth;
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Función para redimensionar
    function doResize(e) {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startX;
      let newWidth;
      
      // Redimensionar simétricamente desde ambos lados
      if (handleSide === 'right') {
        newWidth = startWidth + (deltaX * 2);
      } else {
        newWidth = startWidth - (deltaX * 2);
      }
      
      // Aplicar límites: mínimo 400px, máximo 90% del viewport o 1800px
      const maxWidth = Math.min(window.innerWidth * 0.9, 1800);
      if (newWidth >= 400 && newWidth <= maxWidth) {
        modalContent.style.width = newWidth + 'px';
        modalContent.style.maxWidth = 'none';
      }
      
      e.preventDefault();
      e.stopPropagation();
    }
    
    // Función para terminar redimensionamiento
    function stopResize(e) {
      if (isResizing) {
        const wasResizing = Math.abs(startX - (e?.clientX || startX)) > 5; // Detectar si hubo movimiento real
        
        isResizing = false;
        isAnyModalResizing = false;
        handleSide = null;
        
        // Si hubo un resize real, marcar el flag temporal
        if (wasResizing) {
          justFinishedResizing = true;
          setTimeout(() => {
            justFinishedResizing = false;
          }, 150); // Timeout corto para evitar cierre accidental
        }
        
        if (e) {
          e.preventDefault();
          e.stopPropagation();
        }
      }
    }
    
    // Event listeners
    leftHandle.addEventListener('mousedown', (e) => startResize(e, 'left'));
    rightHandle.addEventListener('mousedown', (e) => startResize(e, 'right'));
    
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
  });
  
  // Añadir estilos CSS para los handles
  const style = document.createElement('style');
  style.textContent = `
    .modal-resize-handle {
      opacity: 0;
      transition: opacity 0.2s;
    }
    
    .modal-content:hover .modal-resize-handle {
      opacity: 0.3;
    }
    
    .modal-resize-handle:hover {
      opacity: 0.6 !important;
      background-color: var(--primary-color);
    }
  `;
  document.head.appendChild(style);

  // ── Auto-resize para textareas con clase .auto-resize ─────────────────
  function fitTextarea(el) {
    if (!el || !el.classList.contains('auto-resize')) return;
    el.style.height = 'auto';
    const max = Math.floor(window.innerHeight * 0.5);
    el.style.height = Math.min(el.scrollHeight, max) + 'px';
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }

  // Redimensiona al escribir
  document.addEventListener('input', function (e) {
    if (e.target.tagName === 'TEXTAREA') fitTextarea(e.target);
  });

  // Redimensiona cuando el modal de edición se abre (detecta clase 'active')
  const observer = new MutationObserver(function (mutations) {
    mutations.forEach(function (m) {
      if (m.attributeName === 'class' && m.target.classList.contains('active')) {
        const ta = m.target.querySelector('textarea.auto-resize');
        if (ta) setTimeout(() => fitTextarea(ta), 0);
      }
    });
  });

  function observeModal(id) {
    const modal = document.getElementById(id);
    if (modal) observer.observe(modal, { attributes: true });
  }

  // Espera a que los modales estén en el DOM
  const waitForModals = setInterval(function () {
    if (document.getElementById('taskModal')) {
      clearInterval(waitForModals);
      observeModal('taskModal');
    }
  }, 30);
});

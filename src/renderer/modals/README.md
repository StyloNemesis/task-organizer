# Sistema de Modales Compartidos

Este directorio contiene las definiciones HTML de los modales reutilizables de la aplicación.

## Modales Disponibles

### 1. **task-edit-modal.html** (ID: `taskModal`)
Modal para crear y editar tareas.
- Formulario completo con campos: título, descripción (Markdown), fecha, criticidad, estado, tags, imágenes
- Vista previa de Markdown
- Usado en: Dashboard, Kanban, Vista de Proyecto

### 2. **task-view-modal.html** (ID: `taskViewModal`)
Modal de solo lectura para visualizar detalles de una tarea.
- Muestra todos los campos de la tarea formateados
- Renderiza Markdown en la descripción
- Botones: Cerrar, Ir al Proyecto, Editar
- Usado en: Dashboard, Kanban, Vista de Proyecto

### 3. **image-viewer-modal.html** (ID: `imageViewerModal`)  
Modal para visualizar imágenes en tamaño completo.
- Imagen responsive y centrada
- Cierre con botón o clic fuera del modal
- Usado en: Dashboard, Kanban, Vista de Proyecto

### 4. **note-modal.html** (ID: `noteModal`)
Modal para crear y editar notas de proyecto.
- Campos: título, contenido (Markdown)
- Vista previa de Markdown
- Usado en: Vista de Proyecto

### 5. **project-modal.html** (ID: `projectModal`)
Modal para crear y editar proyectos.
- Campos: nombre, proyecto padre (opcional), color
- Usado en: Página de Proyectos

## Uso

### Cargar Modales en una Página

1. Incluir el script `modal-loader.js` antes de otros scripts
2. Llamar a `initModals()` con un array de nombres de modales:

```html
<script src="js/modal-loader.js"></script>
<script>
  // Cargar modales necesarios para esta página
  (async function() {
    await window.initModals(['taskEdit', 'taskView', 'imageViewer']);
  })();
</script>
```

### Nombres de Modales Disponibles

- `'taskEdit'` → task-edit-modal.html
- `'taskView'` → task-view-modal.html  
- `'imageViewer'` → image-viewer-modal.html
- `'note'` → note-modal.html
- `'project'` → project-modal.html

## Páginas y sus Modales

| Página | Modales Cargados |
|--------|------------------|
| index.html (Dashboard) | taskEdit, taskView, imageViewer |
| kanban.html | taskEdit, taskView, imageViewer |
| project.html | taskEdit, taskView, imageViewer, note |
| projects.html | project |

## Ventajas

- ✅ **DRY (Don't Repeat Yourself)**: Un solo archivo por modal
- ✅ **Mantenibilidad**: Cambios en un solo lugar se aplican a todas las páginas
- ✅ **Consistencia**: Todos los modales tienen la misma estructura y comportamiento
- ✅ **Carga Asíncrona**: Los modales se cargan solo cuando se necesitan
- ✅ **Modular**: Cada página carga solo los modales que requiere

## Modificar un Modal

Para cambiar cualquier modal:

1. Editar el archivo HTML correspondiente en `src/renderer/modals/`
2. Los cambios se aplicarán automáticamente en todas las páginas que usen ese modal
3. No es necesario modificar código en múltiples archivos HTML

## Agregar un Nuevo Modal

1. Crear archivo HTML en `src/renderer/modals/` (ej: `mi-modal.html`)
2. Agregar entrada en `MODALS_CONFIG` en `modal-loader.js`:
   ```javascript
   const MODALS_CONFIG = {
     // ... existentes
     'miModal': 'modals/mi-modal.html'
   };
   ```
3. Cargar en páginas que lo necesiten:
   ```javascript
   await window.initModals(['miModal']);
   ```

<img width="2089" height="620" alt="image" src="https://github.com/user-attachments/assets/03a6bf70-54d4-4633-a9e8-ecce17a52ac5" /># Task Organizer

Aplicación de escritorio para organización personal desarrollada con Electron + Node.js.

## Funcionalidades

### 📁 Gestión de Proyectos
- Crear proyectos principales y subcategorías
- Asignar colores personalizados a cada proyecto
- Organización jerárquica de proyectos

### ✅ Gestión de Tareas
- Crear tareas asociadas a proyectos
- Marcar tareas como completadas
- Adjuntar imágenes a las tareas
- Asignar tags personalizables (Desarrollo, Instalación, Pruebas, etc.)
- Establecer fecha de ejecución
- Asignar nivel de criticidad (Baja, Media, Alta, Crítica)

### 📝 Notas por Proyecto
- Crear y editar notas asociadas a cada proyecto
- Búsqueda y organización de notas

### 📊 Dashboard General
- Vista unificada de todas las tareas
- Tabla ordenable por cualquier columna
- Filtrado por proyecto
- Estadísticas rápidas (Total, Completadas, Pendientes, Críticas)

## Instalación

### Requisitos Previos
- Node.js (versión 14 o superior)
- npm o yarn

### Pasos de Instalación

1. **Instalar dependencias:**
   ```bash
   npm install
   ```

2. **Iniciar la aplicación en modo desarrollo:**
   ```bash
   npm run dev
   ```

3. **Iniciar la aplicación normalmente:**
   ```bash
   npm start
   ```

## Estructura del Proyecto

```
task-organizer/
├── main.js                 # Proceso principal de Electron
├── preload.js             # Script de preload para seguridad
├── package.json           # Configuración del proyecto
├── src/
│   ├── database/
│   │   └── db.js         # Gestión de base de datos SQLite
│   └── renderer/
│       ├── index.html    # Página principal (Proyectos)
│       ├── dashboard.html # Dashboard de tareas
│       ├── project.html  # Vista de proyecto individual
│       ├── css/
│       │   └── styles.css # Estilos de la aplicación
│       └── js/
│           ├── projects.js  # Lógica de proyectos
│           ├── dashboard.js # Lógica del dashboard
│           ├── tasks.js    # Lógica de tareas
│           └── notes.js    # Lógica de notas
└── assets/
    └── icons/            # Iconos de la aplicación
```

## Base de Datos

La aplicación utiliza **SQLite** mediante la librería `better-sqlite3`. La base de datos se crea automáticamente en la carpeta de datos de usuario de Electron.

### Tablas:
- **projects**: Almacena proyectos y subcategorías
- **tasks**: Almacena tareas con toda su información
- **notes**: Almacena notas asociadas a proyectos

## Tecnologías Utilizadas

- **Electron**: Framework para aplicaciones de escritorio
- **Node.js**: Entorno de ejecución
- **SQLite (better-sqlite3)**: Base de datos local
- **HTML/CSS/JavaScript**: Frontend vanilla

## Desarrollo

### Modo Desarrollo
El modo desarrollo abre las DevTools automáticamente:
```bash
npm run dev
```

### Base de Datos
La base de datos se encuentra en:
- Linux: `~/.config/task-organizer/tasks.db`
- Windows: `%APPDATA%/task-organizer/tasks.db`
- macOS: `~/Library/Application Support/task-organizer/tasks.db`

### Personalización de Tags

Para añadir o modificar los tags disponibles para las tareas, edita el archivo:
```
src/renderer/js/config.js
```

Modifica el array `AVAILABLE_TAGS`:
```javascript
const AVAILABLE_TAGS = [
  'Desarrollo',
  'Instalacion',
  'Pruebas',
  'Documentación',
  'Despliegue',
  'Info',
  // Añade más tags aquí
  'Tu Nuevo Tag'
];
```

Los cambios se aplicarán automáticamente al recargar la aplicación.

## Próximas Mejoras

- [ ] Empaquetar la aplicación para distribución
- [ ] Soporte Markdown para la descripción de las tareas
- [ ] Tablero Kanban
- [ ] Vista tareas de ejecución del día actual
- [ ] Temas personalizables (modo oscuro/claro)
- [ ] Adjuntar archivos además de imágenes
- [x] Etiquetas personalizadas (Tags)

## Licencia

MIT

---

Desarrollado para organización personal con Electron + Node.js 

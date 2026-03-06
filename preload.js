const { contextBridge, ipcRenderer } = require('electron');

// Exponer API segura al renderer process
contextBridge.exposeInMainWorld('api', {
  // Proyectos
  getProjects: () => ipcRenderer.invoke('get-projects'),
  createProject: (project) => ipcRenderer.invoke('create-project', project),
  updateProject: (id, project) => ipcRenderer.invoke('update-project', id, project),
  deleteProject: (id) => ipcRenderer.invoke('delete-project', id),
  
  // Tareas
  getTasks: (projectId) => ipcRenderer.invoke('get-tasks', projectId),
  getAllTasks: () => ipcRenderer.invoke('get-all-tasks'),
  createTask: (task) => ipcRenderer.invoke('create-task', task),
  updateTask: (id, task) => ipcRenderer.invoke('update-task', id, task),
  deleteTask: (id) => ipcRenderer.invoke('delete-task', id),
  toggleTask: (id) => ipcRenderer.invoke('toggle-task', id),
  updateTaskStatus: (id, status) => ipcRenderer.invoke('update-task-status', id, status),
  
  // Notas
  getNotes: (projectId) => ipcRenderer.invoke('get-notes', projectId),
  createNote: (note) => ipcRenderer.invoke('create-note', note),
  updateNote: (id, note) => ipcRenderer.invoke('update-note', id, note),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  
  // Abrir enlaces externos
  openExternal: (url) => ipcRenderer.invoke('open-external', url)
});

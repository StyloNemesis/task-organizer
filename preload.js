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
  deleteCompletedTasks: () => ipcRenderer.invoke('delete-completed-tasks'),
  toggleTask: (id) => ipcRenderer.invoke('toggle-task', id),
  updateTaskStatus: (id, status) => ipcRenderer.invoke('update-task-status', id, status),
  toggleFavorite: (id) => ipcRenderer.invoke('toggle-favorite', id),
  
  // Notas
  getNotes: (projectId) => ipcRenderer.invoke('get-notes', projectId),
  createNote: (note) => ipcRenderer.invoke('create-note', note),
  updateNote: (id, note) => ipcRenderer.invoke('update-note', id, note),
  deleteNote: (id) => ipcRenderer.invoke('delete-note', id),
  
  // Abrir enlaces externos
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // Issues de GitHub y GitLab
  getIssueConnections: () => ipcRenderer.invoke('get-issue-connections'),
  saveIssueConnection: (connection) => ipcRenderer.invoke('save-issue-connection', connection),
  deleteIssueConnection: (provider) => ipcRenderer.invoke('delete-issue-connection', provider),
  getExternalIssues: (provider) => ipcRenderer.invoke('get-external-issues', provider),
  getExternalIssueLabels: (provider) => ipcRenderer.invoke('get-external-issue-labels', provider),
  saveExternalIssueStatus: (issue) => ipcRenderer.invoke('save-external-issue-status', issue),
  getExternalIssueLabelRules: () => ipcRenderer.invoke('get-external-issue-label-rules'),
  saveExternalIssueLabelRule: (rule) => ipcRenderer.invoke('save-external-issue-label-rule', rule),
  deleteExternalIssueLabelRule: (provider, label) => ipcRenderer.invoke('delete-external-issue-label-rule', provider, label),
  openGitLabWebLogin: (baseUrl) => ipcRenderer.invoke('open-gitlab-web-login', baseUrl),
  exportIssues: (payload) => ipcRenderer.invoke('export-issues', payload),
  getExternalPullRequests: () => ipcRenderer.invoke('get-external-pull-requests'),
  getPullRequestsCount: () => ipcRenderer.invoke('get-pull-requests-count'),
  onPullRequestsUpdated: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on('pull-requests-updated', listener);
    return () => ipcRenderer.removeListener('pull-requests-updated', listener);
  },

  // Controles de ventana
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close')
});

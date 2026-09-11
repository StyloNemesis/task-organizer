const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const Database = require('./src/database/db');

// Habilitar recarga automática en modo desarrollo
if (process.argv.includes('--dev')) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

let mainWindow;
let db;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets/icons/icon.png')
  });

  mainWindow.loadFile('src/renderer/index.html');

  // Abrir DevTools en modo desarrollo
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // Interceptar navegación y abrir enlaces externos en el navegador
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Controles de zoom: Ctrl+=/+/Shift+= para ampliar, Ctrl+- para reducir, Ctrl+0 para restablecer
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (!input.control) return;
    const key = input.key;
    // Ctrl++ (Shift+=) o Ctrl+= → zoom in
    if ((key === '+' || key === '=') && input.type === 'keyDown') {
      const current = mainWindow.webContents.getZoomLevel();
      mainWindow.webContents.setZoomLevel(current + 0.5);
      event.preventDefault();
    // Ctrl+- → zoom out
    } else if (key === '-' && input.type === 'keyDown') {
      const current = mainWindow.webContents.getZoomLevel();
      mainWindow.webContents.setZoomLevel(current - 0.5);
      event.preventDefault();
    // Ctrl+0 → restablecer zoom
    } else if (key === '0' && input.type === 'keyDown') {
      mainWindow.webContents.setZoomLevel(0);
      event.preventDefault();
    }
  });
}

app.whenReady().then(() => {
  // Inicializar base de datos
  db = new Database();
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers para proyectos
ipcMain.handle('get-projects', async () => {
  return db.getProjects();
});

ipcMain.handle('create-project', async (event, project) => {
  return db.createProject(project);
});

ipcMain.handle('update-project', async (event, id, project) => {
  return db.updateProject(id, project);
});

ipcMain.handle('delete-project', async (event, id) => {
  return db.deleteProject(id);
});

// IPC Handlers para tareas
ipcMain.handle('get-tasks', async (event, projectId) => {
  return db.getTasks(projectId);
});

ipcMain.handle('get-all-tasks', async () => {
  return db.getAllTasks();
});

ipcMain.handle('create-task', async (event, task) => {
  return db.createTask(task);
});

ipcMain.handle('update-task', async (event, id, task) => {
  return db.updateTask(id, task);
});

ipcMain.handle('delete-task', async (event, id) => {
  return db.deleteTask(id);
});

ipcMain.handle('delete-completed-tasks', async () => {
  return db.deleteCompletedTasks();
});

ipcMain.handle('toggle-task', async (event, id) => {
  return db.toggleTask(id);
});

ipcMain.handle('update-task-status', async (event, id, status) => {
  return db.updateTaskStatus(id, status);
});

ipcMain.handle('toggle-favorite', async (event, id) => {
  return db.toggleFavorite(id);
});

// IPC Handlers para notas
ipcMain.handle('get-notes', async (event, projectId) => {
  return db.getNotes(projectId);
});

ipcMain.handle('create-note', async (event, note) => {
  return db.createNote(note);
});

ipcMain.handle('update-note', async (event, id, note) => {
  return db.updateNote(id, note);
});

ipcMain.handle('delete-note', async (event, id) => {
  return db.deleteNote(id);
});

// IPC Handler para abrir enlaces externos
ipcMain.handle('open-external', async (event, url) => {
  shell.openExternal(url);
});

function encryptToken(token) {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('El almacenamiento cifrado del sistema no está disponible.');
  }
  return safeStorage.encryptString(token).toString('base64');
}

function decryptToken(token) {
  return safeStorage.decryptString(Buffer.from(token, 'base64'));
}

function getProjectsList(value) {
  return (value || '').split(/[\n,]+/).map(item => item.trim()).filter(Boolean);
}

async function issueRequestError(response, provider, project) {
  let detail = '';
  try {
    const body = await response.json();
    detail = body.message || '';
  } catch (_) { /* la respuesta puede no ser JSON */ }

  if (provider === 'github') {
    const sso = response.headers.get('x-github-sso');
    if (sso?.includes('required')) {
      const url = sso.match(/url=([^;]+)/)?.[1];
      return `GitHub requiere autorizar este token mediante SSO para ${project}.${url ? ` Abre: ${url}` : ''}`;
    }
    if (response.status === 404) {
      return `GitHub no puede ver ${project}. En un token fine-grained, selecciona como propietario “${project.split('/')[0]}”, concede acceso a este repositorio y permiso “Issues: Read”; puede requerir aprobación de la organización.`;
    }
    if (response.status === 403) {
      return `GitHub ha rechazado el acceso a ${project}.${detail ? ` ${detail}` : ''} Comprueba que el token clásico tenga scope “repo” y que la organización permita o autorice tokens personales/SSO.`;
    }
  }
  return `${provider === 'github' ? 'GitHub' : 'GitLab'} (${project}): ${response.status} ${detail || response.statusText}`;
}

async function fetchAllLabelPages(url, headers, provider, project) {
  const labels = [];
  let page = 1;
  while (page) {
    const separator = url.includes('?') ? '&' : '?';
    const response = await fetch(`${url}${separator}per_page=100&page=${page}`, { headers });
    if (!response.ok) throw new Error(await issueRequestError(response, provider, project));
    labels.push(...await response.json());
    const nextPage = provider === 'gitlab' ? response.headers.get('x-next-page') : (response.headers.get('link')?.includes('rel="next"') ? String(page + 1) : '');
    page = nextPage ? Number(nextPage) : 0;
  }
  return labels;
}

async function getProjectLabels(connection, project) {
  const token = decryptToken(connection.token);
  const headers = { Accept: 'application/json' };
  if (connection.provider === 'github') {
    headers.Authorization = `Bearer ${token}`;
    const path = encodeURIComponent(project).replace(/%2F/g, '/');
    const labels = await fetchAllLabelPages(`https://api.github.com/repos/${path}/labels`, headers, 'github', project);
    return labels.map(label => ({ provider: 'github', name: label.name, color: label.color || '' }));
  }
  headers['PRIVATE-TOKEN'] = token;
  const baseUrl = (connection.base_url || 'https://gitlab.com').replace(/\/$/, '');
  const labels = await fetchAllLabelPages(`${baseUrl}/api/v4/projects/${encodeURIComponent(project)}/labels`, headers, 'gitlab', project);
  return labels.map(label => ({ provider: 'gitlab', name: label.name, color: label.color || '' }));
}

async function requestIssues(connection) {
  const token = decryptToken(connection.token);
  const projects = getProjectsList(connection.projects);
  if (!projects.length) throw new Error('Indica al menos un proyecto o repositorio.');

  const headers = { Accept: 'application/json' };
  let requests;
  if (connection.provider === 'github') {
    headers.Authorization = `Bearer ${token}`;
    requests = projects.map(async project => {
      const query = new URLSearchParams({ state: 'open', per_page: '100' });
      if (connection.scope === 'assigned') query.set('assignee', '@me');
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(project).replace(/%2F/g, '/')}/issues?${query}`, { headers });
      if (!response.ok) throw new Error(await issueRequestError(response, 'github', project));
      const issues = await response.json();
      return issues.filter(issue => !issue.pull_request).map(issue => ({
        provider: 'github', project, id: issue.number, title: issue.title,
        url: issue.html_url, state: issue.state, author: issue.user?.login || '',
        assignees: (issue.assignees || []).map(user => user.login).join(', '),
        updatedAt: issue.updated_at, createdAt: issue.created_at, comments: issue.comments || 0,
        milestone: issue.milestone?.title || '', dueDate: issue.milestone?.due_on || '',
        labels: (issue.labels || []).map(label => ({ name: label.name || label, color: label.color || '' }))
      }));
    });
  } else {
    const baseUrl = (connection.base_url || 'https://gitlab.com').replace(/\/$/, '');
    headers['PRIVATE-TOKEN'] = token;
    requests = projects.map(async project => {
      const query = new URLSearchParams({ state: 'opened', per_page: '100', scope: connection.scope === 'assigned' ? 'assigned_to_me' : 'all' });
      const response = await fetch(`${baseUrl}/api/v4/projects/${encodeURIComponent(project)}/issues?${query}`, { headers });
      if (!response.ok) throw new Error(await issueRequestError(response, 'gitlab', project));
      const issues = await response.json();
      let labelsByName = new Map();
      try {
        labelsByName = new Map((await getProjectLabels(connection, project)).map(label => [label.name, label.color]));
      } catch (_) { /* Las issues siguen siendo útiles si no se pueden consultar las etiquetas. */ }
      return issues.map(issue => ({
        provider: 'gitlab', project, id: issue.iid, title: issue.title,
        url: issue.web_url, state: issue.state, author: issue.author?.username || '',
        assignees: (issue.assignees || []).map(user => user.username).join(', '),
        updatedAt: issue.updated_at, createdAt: issue.created_at, comments: issue.user_notes_count || 0,
        milestone: issue.milestone?.title || '', dueDate: issue.due_date || '',
        labels: (issue.labels || []).map(name => ({ name, color: labelsByName.get(name) || '' }))
      }));
    });
  }
  return (await Promise.all(requests)).flat().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
}

function applyLocalIssueStatuses(issues) {
  const statuses = new Map(db.getExternalIssueStatuses().map(item => [`${item.provider}:${item.project}:${item.issue_id}`, item.status]));
  const rules = new Map(db.getExternalIssueLabelRules().map(rule => [`${rule.provider}:${rule.label}`, rule.status]));
  return issues.map(issue => {
    const key = `${issue.provider}:${issue.project}:${issue.id}`;
    const fromLabel = (issue.labels || []).map(label => typeof label === 'string' ? label : label.name).map(label => rules.get(`${issue.provider}:${label}`)).find(Boolean);
    return { ...issue, status: statuses.get(key) || fromLabel || 'pending' };
  });
}

ipcMain.handle('get-issue-connections', async () => db.getIssueConnections());

ipcMain.handle('save-issue-connection', async (event, payload) => {
  const provider = payload?.provider;
  if (!['github', 'gitlab'].includes(provider)) throw new Error('Proveedor no válido.');
  const current = db.getIssueConnection(provider);
  const providedToken = payload.token?.trim();
  if (!providedToken && !current) throw new Error('El token es obligatorio.');
  db.saveIssueConnection({
    provider,
    token: providedToken ? encryptToken(providedToken) : current.token,
    projects: payload.projects,
    scope: payload.scope,
    base_url: provider === 'gitlab' ? payload.baseUrl?.trim() : null
  });
  return { success: true };
});

ipcMain.handle('delete-issue-connection', async (event, provider) => db.deleteIssueConnection(provider));

ipcMain.handle('get-external-issues', async (event, provider) => {
  if (provider === 'all') {
    const connections = db.getIssueConnections().map(connection => db.getIssueConnection(connection.provider));
    if (!connections.length) throw new Error('Primero conecta una cuenta.');
    return applyLocalIssueStatuses((await Promise.all(connections.map(requestIssues))).flat().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)));
  }
  const connection = db.getIssueConnection(provider);
  if (!connection) throw new Error('Primero conecta tu cuenta.');
  return applyLocalIssueStatuses(await requestIssues(connection));
});

ipcMain.handle('get-external-issue-labels', async (event, provider = 'all') => {
  const connections = provider === 'all'
    ? db.getIssueConnections().map(connection => db.getIssueConnection(connection.provider))
    : [db.getIssueConnection(provider)].filter(Boolean);
  if (!connections.length) throw new Error('Primero conecta una cuenta.');
  const labels = (await Promise.all(connections.flatMap(connection => getProjectsList(connection.projects).map(project => getProjectLabels(connection, project))))).flat();
  return [...new Map(labels.map(label => [`${label.provider}:${label.name}`, label])).values()].sort((a, b) => a.name.localeCompare(b.name, 'es'));
});

ipcMain.handle('save-external-issue-status', async (event, issue) => {
  if (!issue || !['github', 'gitlab'].includes(issue.provider) || !issue.project || !issue.id || !['pending', 'in_progress', 'blocked', 'testing', 'completed'].includes(issue.status)) {
    throw new Error('Estado de issue no válido.');
  }
  return db.saveExternalIssueStatus(issue);
});

ipcMain.handle('get-external-issue-label-rules', async () => db.getExternalIssueLabelRules());
ipcMain.handle('save-external-issue-label-rule', async (event, rule) => {
  if (!rule || !['github', 'gitlab'].includes(rule.provider) || !rule.label?.trim() || !['pending', 'in_progress', 'blocked', 'testing', 'completed'].includes(rule.status)) {
    throw new Error('Regla de etiqueta no válida.');
  }
  return db.saveExternalIssueLabelRule({ ...rule, label: rule.label.trim() });
});
ipcMain.handle('delete-external-issue-label-rule', async (event, provider, label) => db.deleteExternalIssueLabelRule(provider, label));

// IPC Handlers para controles de ventana
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());

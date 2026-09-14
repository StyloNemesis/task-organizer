const { app, BrowserWindow, ipcMain, shell, safeStorage, session } = require('electron');
const path = require('path');
const https = require('https');
const http = require('http');
const Database = require('./src/database/db');

// Permitir certificados internos o corporativos para instancias privadas de GitLab
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

// Habilitar recarga automática en modo desarrollo
if (process.argv.includes('--dev')) {
  require('electron-reload')(__dirname, {
    electron: path.join(__dirname, 'node_modules', '.bin', 'electron'),
    hardResetMethod: 'exit'
  });
}

let mainWindow;
let db;

function getGitLabBaseUrl(connection) {
  let baseUrl = (connection?.base_url || 'https://gitlab.com').trim().replace(/\/$/, '');
  if (!baseUrl) baseUrl = 'https://gitlab.com';
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = `https://${baseUrl}`;
  }
  return baseUrl;
}

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

  // Interceptar peticiones a GitLab para adjuntar token si fuera necesario
  session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    try {
      // No inyectar PRIVATE-TOKEN en navegaciones de página (login, OAuth, etc.)
      if (details.resourceType !== 'mainFrame' && details.resourceType !== 'subFrame') {
        const connection = db?.getIssueConnection?.('gitlab');
        if (connection && connection.token) {
          const baseUrl = getGitLabBaseUrl(connection);
          const parsedReq = new URL(details.url);
          const parsedBase = new URL(baseUrl);
          if (parsedReq.hostname === parsedBase.hostname || (parsedReq.hostname === 'gitlab.com' && details.url.includes('/uploads/'))) {
            const token = decryptToken(connection.token);
            if (token) {
              requestHeaders['PRIVATE-TOKEN'] = token;
              delete requestHeaders['Authorization'];
            }
          }
        }
      }
    } catch (_) {}
    callback({ requestHeaders });
  });

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
  const baseUrl = getGitLabBaseUrl(connection);
  const labels = await fetchAllLabelPages(`${baseUrl}/api/v4/projects/${encodeURIComponent(project)}/labels`, headers, 'gitlab', project);
  return labels.map(label => ({ provider: 'gitlab', name: label.name, color: label.color || '' }));
}

function resolveGitLabAvatar(rawUrl, baseUrl) {
  if (!rawUrl) return '';
  let cleanUrl = String(rawUrl).trim();
  if (!cleanUrl) return '';

  const normalizedBase = getGitLabBaseUrl({ base_url: baseUrl });
  const isUploadPath = cleanUrl.includes('/uploads/') || cleanUrl.includes('/avatar/') || cleanUrl.includes('/system/user/');

  // Si es una ruta relativa o protocol-relative
  if (cleanUrl.startsWith('//')) {
    cleanUrl = `https:${cleanUrl}`;
  } else if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
    return `${normalizedBase}${cleanUrl.startsWith('/') ? '' : '/'}${cleanUrl}`;
  }

  try {
    const parsedUrl = new URL(cleanUrl);
    const parsedBase = new URL(normalizedBase);

    // Si es un servicio externo como Gravatar o Libravatar (y no es una ruta de uploads)
    const isExternalGravatar = (parsedUrl.hostname.includes('gravatar.com') || parsedUrl.hostname.includes('libravatar.org')) && !cleanUrl.includes('/uploads/');
    if (isExternalGravatar) {
      return cleanUrl;
    }

    // Para cualquier avatar de GitLab (subido, assets o devuelto con localhost, gitlab.com, etc.),
    // redirigirlo obligatoriamente a la URL del servidor GitLab configurado por el usuario
    if (isUploadPath || parsedUrl.hostname !== 'gitlab.com' || parsedBase.hostname !== 'gitlab.com') {
      parsedUrl.protocol = parsedBase.protocol;
      parsedUrl.hostname = parsedBase.hostname;
      parsedUrl.port = parsedBase.port;
      return parsedUrl.toString();
    }
  } catch (_) {}

  return cleanUrl;
}

function isGitLabUploadUrl(url, baseUrl) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes('gravatar.com') || parsed.hostname.includes('libravatar.org')) {
      return false;
    }
    const parsedBase = new URL(baseUrl);
    if (parsed.hostname === parsedBase.hostname) {
      return true;
    }
  } catch (_) {
    if (url.startsWith('/')) return true;
  }
  return url.includes('/uploads/') || url.includes('/system/user/avatar/');
}

async function getCookiesForUrl(targetUrl) {
  try {
    if (session?.defaultSession?.cookies) {
      const cookies = await session.defaultSession.cookies.get({ url: targetUrl });
      if (cookies && cookies.length) {
        return cookies.map(c => `${c.name}=${c.value}`).join('; ');
      }
    }
  } catch (_) {}
  return '';
}

async function downloadGitLabImage(url, token, maxRedirects = 5, attempt = 'header', customCookies = null) {
  let cookieHeader = customCookies;
  if (cookieHeader === null) {
    cookieHeader = await getCookiesForUrl(url);
  }

  return new Promise((resolve, reject) => {
    if (maxRedirects <= 0) return reject(new Error('Demasiadas redirecciones'));
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const reqHeaders = {
      Accept: 'image/*, */*',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    };

    if (cookieHeader) {
      reqHeaders['Cookie'] = cookieHeader;
    }

    // Usar exclusivamente PRIVATE-TOKEN (NUNCA Authorization: Bearer para Personal Access Tokens)
    if (token && attempt === 'header') {
      reqHeaders['PRIVATE-TOKEN'] = token;
    }

    const req = lib.get(url, { headers: reqHeaders, rejectUnauthorized: false }, res => {
      // Seguir redirecciones
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        let nextUrl = res.headers.location;
        if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
          nextUrl = new URL(nextUrl, url).toString();
        }
        res.resume();
        return downloadGitLabImage(nextUrl, token, maxRedirects - 1, attempt, cookieHeader).then(resolve).catch(reject);
      }

      // Si devuelve 401 o 403:
      if (res.statusCode === 401 || res.statusCode === 403) {
        res.resume();
        // Fallback 1: Si falló con cabecera PRIVATE-TOKEN, probar con parámetro URL ?private_token=
        if (token && attempt === 'header' && !url.includes('private_token=')) {
          const sep = url.includes('?') ? '&' : '?';
          const paramUrl = `${url}${sep}private_token=${encodeURIComponent(token)}`;
          return downloadGitLabImage(paramUrl, null, maxRedirects - 1, 'param', cookieHeader).then(resolve).catch(reject);
        }
        // Fallback 2: Probar petición anónima si el recurso es público
        if (attempt !== 'anonymous') {
          const cleanUrl = url.replace(/([?&])private_token=[^&]+(&|$)/, '$1').replace(/[?&]$/, '');
          return downloadGitLabImage(cleanUrl, null, maxRedirects - 1, 'anonymous', cookieHeader).then(resolve).catch(reject);
        }
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const contentType = res.headers['content-type'] || 'image/png';
      // Si la respuesta es HTML (ej. redirigido a formulario de login)
      if (!contentType.startsWith('image/')) {
        res.resume();
        if (token && attempt === 'header' && !url.includes('private_token=')) {
          const sep = url.includes('?') ? '&' : '?';
          const paramUrl = `${url}${sep}private_token=${encodeURIComponent(token)}`;
          return downloadGitLabImage(paramUrl, null, maxRedirects - 1, 'param', cookieHeader).then(resolve).catch(reject);
        }
        return reject(new Error(`No es imagen: ${contentType}`));
      }

      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ buffer, contentType });
      });
      res.on('error', reject);
    });

    req.on('error', reject);
    req.setTimeout(8000, () => {
      req.destroy();
      reject(new Error('Timeout al descargar imagen'));
    });
  });
}

const gitlabAvatarCache = new Map();

async function fetchGitLabAvatarAsDataUrl(url, token, baseUrl) {
  if (!url) return '';
  if (gitlabAvatarCache.has(url)) return gitlabAvatarCache.get(url);
  if (!isGitLabUploadUrl(url, baseUrl)) return url;

  // Probar primero con la versión escalada (?width=48) que usa GitLab web, y después la URL original
  const urlsToTry = [];
  if (!url.includes('width=') && (url.includes('/uploads/') || url.includes('/system/user/avatar/'))) {
    const sep = url.includes('?') ? '&' : '?';
    urlsToTry.push(`${url}${sep}width=48`);
  }
  urlsToTry.push(url);

  for (const targetUrl of urlsToTry) {
    try {
      const { buffer, contentType } = await downloadGitLabImage(targetUrl, token);
      const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
      gitlabAvatarCache.set(url, dataUrl);
      return dataUrl;
    } catch (_) {}
  }

  // Fallback con fetch estándar usando exclusivamente PRIVATE-TOKEN y cookies
  for (const targetUrl of urlsToTry) {
    try {
      const headers = { Accept: 'image/*, */*' };
      if (token) {
        headers['PRIVATE-TOKEN'] = token;
      }
      const cookieStr = await getCookiesForUrl(targetUrl);
      if (cookieStr) {
        headers['Cookie'] = cookieStr;
      }
      let res = await fetch(targetUrl, { headers });
      if (!res.ok && (res.status === 401 || res.status === 403) && token) {
        const sep = targetUrl.includes('?') ? '&' : '?';
        res = await fetch(`${targetUrl}${sep}private_token=${encodeURIComponent(token)}`, { headers: { Accept: 'image/*, */*' } });
      }
      if (res.ok) {
        const contentType = res.headers.get('content-type') || 'image/png';
        if (contentType.startsWith('image/')) {
          const buffer = Buffer.from(await res.arrayBuffer());
          const dataUrl = `data:${contentType};base64,${buffer.toString('base64')}`;
          gitlabAvatarCache.set(url, dataUrl);
          return dataUrl;
        }
      }
    } catch (_) {}
  }

  // Si no se puede descargar (ej. GitLab 401 por requerir sesión web para avatares subidos),
  // guardar cadena vacía para que el frontend dibuje el avatar inicial estilizado sin producir errores 401 en consola
  gitlabAvatarCache.set(url, '');
  return '';
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
      return issues.filter(issue => !issue.pull_request).map(issue => {
        const assigneesList = (issue.assignees && issue.assignees.length) ? issue.assignees : (issue.assignee ? [issue.assignee] : []);
        return {
          provider: 'github', project, id: issue.number, title: issue.title,
          url: issue.html_url, state: issue.state, author: issue.user?.login || '',
          authorAvatar: issue.user?.avatar_url || '',
          assignees: assigneesList.map(user => user.login).filter(Boolean).join(', '),
          assigneeDetails: assigneesList.map(user => ({
            name: user.login || '',
            avatar: user.avatar_url || ''
          })).filter(u => u.name || u.avatar),
          updatedAt: issue.updated_at, createdAt: issue.created_at, comments: issue.comments || 0,
          milestone: issue.milestone?.title || '', dueDate: issue.milestone?.due_on || '',
          labels: (issue.labels || []).map(label => ({ name: label.name || label, color: label.color || '' }))
        };
      });
    });
  } else {
    const baseUrl = getGitLabBaseUrl(connection);
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
      return issues.map(issue => {
        const assigneesList = (issue.assignees && issue.assignees.length) ? issue.assignees : (issue.assignee ? [issue.assignee] : []);
        const authorRawAvatar = issue.author?.avatar_url || issue.author?.avatar_path || issue.author?.avatarPath || '';
        return {
          provider: 'gitlab', project, id: issue.iid, title: issue.title,
          url: issue.web_url, state: issue.state,
          author: issue.author?.username || issue.author?.name || '',
          authorAvatar: resolveGitLabAvatar(authorRawAvatar, baseUrl),
          assignees: assigneesList.map(user => user.username || user.name || '').filter(Boolean).join(', '),
          assigneeDetails: assigneesList.map(user => {
            const userRawAvatar = user.avatar_url || user.avatar_path || user.avatarPath || '';
            return {
              name: user.username || user.name || '',
              avatar: resolveGitLabAvatar(userRawAvatar, baseUrl)
            };
          }).filter(u => u.name || u.avatar),
          updatedAt: issue.updated_at, createdAt: issue.created_at, comments: issue.user_notes_count || 0,
          milestone: issue.milestone?.title || '', dueDate: issue.due_date || '',
          labels: (issue.labels || []).map(name => ({ name, color: labelsByName.get(name) || '' }))
        };
      });
    });

    const allGitLabIssues = (await Promise.all(requests)).flat();
    const uniqueAvatarUrls = new Set();
    allGitLabIssues.forEach(issue => {
      if (issue.authorAvatar) uniqueAvatarUrls.add(issue.authorAvatar);
      (issue.assigneeDetails || []).forEach(a => {
        if (a.avatar) uniqueAvatarUrls.add(a.avatar);
      });
    });

    const avatarDataMap = new Map();
    await Promise.all([...uniqueAvatarUrls].map(async url => {
      const dataUrl = await fetchGitLabAvatarAsDataUrl(url, token, baseUrl);
      avatarDataMap.set(url, dataUrl);
    }));

    allGitLabIssues.forEach(issue => {
      if (issue.authorAvatar && avatarDataMap.has(issue.authorAvatar)) {
        issue.authorAvatar = avatarDataMap.get(issue.authorAvatar);
      }
      (issue.assigneeDetails || []).forEach(a => {
        if (a.avatar && avatarDataMap.has(a.avatar)) {
          a.avatar = avatarDataMap.get(a.avatar);
        }
      });
    });

    return allGitLabIssues.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
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

ipcMain.handle('open-gitlab-web-login', async (event, customBaseUrl) => {
  const connection = db?.getIssueConnection?.('gitlab');
  const baseUrl = customBaseUrl || getGitLabBaseUrl(connection);
  const loginUrl = `${baseUrl}/users/sign_in`;

  return new Promise(resolve => {
    let authWindow = new BrowserWindow({
      width: 900,
      height: 750,
      parent: mainWindow || undefined,
      modal: false,
      title: 'Iniciar sesión en GitLab',
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        session: session.defaultSession
      }
    });

    let detectedLogin = false;

    const checkLogin = async () => {
      if (!authWindow || authWindow.isDestroyed()) return;
      try {
        const currentUrl = authWindow.webContents.getURL();
        const parsedCurrent = new URL(currentUrl);
        const parsedBase = new URL(baseUrl);
        if (parsedCurrent.hostname === parsedBase.hostname) {
          const isSignInPage = parsedCurrent.pathname.includes('/users/sign_in') || parsedCurrent.pathname.includes('/users/password');
          if (!isSignInPage) {
            const loggedIn = await authWindow.webContents.executeJavaScript(`
              Boolean(
                window.gon?.current_username ||
                window.gon?.current_user_id ||
                document.querySelector('.header-user') ||
                document.querySelector('[data-user]') ||
                document.querySelector('.user-avatar-link') ||
                document.querySelector('.current-user')
              )
            `);
            if (loggedIn) {
              detectedLogin = true;
              gitlabAvatarCache.clear();
              setTimeout(() => {
                if (authWindow && !authWindow.isDestroyed()) {
                  authWindow.close();
                }
              }, 800);
            }
          }
        }
      } catch (_) {}
    };

    authWindow.webContents.on('did-finish-load', checkLogin);
    authWindow.webContents.on('did-navigate-in-page', checkLogin);

    authWindow.on('closed', () => {
      authWindow = null;
      gitlabAvatarCache.clear();
      resolve({ success: detectedLogin });
    });

    authWindow.loadURL(loginUrl);
  });
});

// IPC Handlers para controles de ventana
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());

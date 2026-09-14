const { app, BrowserWindow, ipcMain, shell, safeStorage, session, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const zlib = require('zlib');
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

  mainWindow.on('focus', () => {
    const now = Date.now();
    if (now - (pullRequestsCache.timestamp || 0) > 60000) {
      checkPullRequestsInBackground();
    }
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
  startPullRequestsPolling();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  if (prPollingInterval) clearInterval(prPollingInterval);
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

function httpGetJson(url, headers = {}, maxRedirects = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      return reject(e);
    }
    const lib = parsed.protocol === 'http:' ? http : https;
    const reqHeaders = {
      Accept: 'application/json',
      'User-Agent': 'Task-Organizer/1.3.0',
      ...headers
    };
    const req = lib.get(url, { headers: reqHeaders, rejectUnauthorized: false }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        if (maxRedirects <= 0) return reject(new Error('Demasiadas redirecciones'));
        let nextUrl = res.headers.location;
        if (!nextUrl.startsWith('http://') && !nextUrl.startsWith('https://')) {
          nextUrl = new URL(nextUrl, url).toString();
        }
        res.resume();
        return httpGetJson(nextUrl, headers, maxRedirects - 1).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
          resolve(json);
        } catch (err) {
          reject(err);
        }
      });
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
  });
}

const authenticatedUserCache = new Map();

async function getAuthenticatedUser(provider, token, baseUrl) {
  if (!token) return { username: '', name: '' };
  const cacheKey = `${provider}:${token.slice(-8)}`;
  if (authenticatedUserCache.has(cacheKey)) return authenticatedUserCache.get(cacheKey);

  try {
    if (provider === 'github') {
      let data;
      try {
        data = await httpGetJson('https://api.github.com/user', { Authorization: `Bearer ${token}` });
      } catch (_) {
        data = await httpGetJson('https://api.github.com/user', { Authorization: `token ${token}` });
      }
      if (data && (data.login || data.name)) {
        const res = { username: data.login || '', name: data.name || '' };
        authenticatedUserCache.set(cacheKey, res);
        return res;
      }
    } else if (provider === 'gitlab') {
      let data;
      try {
        data = await httpGetJson(`${baseUrl}/api/v4/user`, { 'PRIVATE-TOKEN': token });
      } catch (_) {
        try {
          data = await httpGetJson(`${baseUrl}/api/v4/personal_access_tokens/self`, { 'PRIVATE-TOKEN': token });
        } catch (_) {}
      }
      if (data && (data.username || data.name)) {
        const res = { username: data.username || '', name: data.name || '' };
        authenticatedUserCache.set(cacheKey, res);
        return res;
      }
    }
  } catch (_) {}

  return { username: '', name: '' };
}

async function requestIssues(connection) {
  const token = decryptToken(connection.token);
  const projects = getProjectsList(connection.projects);
  if (!projects.length) throw new Error('Indica al menos un proyecto o repositorio.');

  const headers = { Accept: 'application/json', 'User-Agent': 'Task-Organizer/1.3.0' };
  let requests;
  if (connection.provider === 'github') {
    const detected = await getAuthenticatedUser('github', token);
    const configuredUser = (connection.username || '').trim();
    const userIdentifiers = [configuredUser, detected.username, detected.name].filter(Boolean);
    const currentUsername = configuredUser || detected.username || detected.name || '';

    headers.Authorization = `Bearer ${token}`;
    requests = projects.map(async project => {
      const query = new URLSearchParams({ state: 'open', per_page: '100' });
      if (connection.scope === 'assigned') query.set('assignee', '@me');
      const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(project).replace(/%2F/g, '/')}/issues?${query}`, { headers });
      if (!response.ok) throw new Error(await issueRequestError(response, 'github', project));
      const issues = await response.json();
      return issues.filter(issue => !issue.pull_request).map(issue => {
        const assigneesList = (issue.assignees && issue.assignees.length) ? issue.assignees : (issue.assignee ? [issue.assignee] : []);
        const authorLogin = issue.user?.login || '';
        const authorName = issue.user?.name || '';
        const isAssignedToMe = Boolean(
          assigneesList.some(u => {
            const candidateNames = [u.login, u.name].filter(Boolean);
            return candidateNames.some(c => userIdentifiers.some(id => id.toLowerCase() === c.toLowerCase()));
          }) ||
          (!userIdentifiers.length && connection.scope === 'assigned')
        );
        const isAuthorMe = Boolean(
          [authorLogin, authorName].filter(Boolean).some(c => userIdentifiers.some(id => id.toLowerCase() === c.toLowerCase()))
        );
        return {
          provider: 'github', project, id: issue.number, title: issue.title,
          url: issue.html_url, state: issue.state, author: authorLogin,
          authorAvatar: issue.user?.avatar_url || '',
          assignees: assigneesList.map(user => user.login).filter(Boolean).join(', '),
          assigneeDetails: assigneesList.map(user => ({
            name: user.login || '',
            avatar: user.avatar_url || ''
          })).filter(u => u.name || u.avatar),
          currentUser: currentUsername,
          isAssignedToMe,
          isAuthorMe,
          updatedAt: issue.updated_at, createdAt: issue.created_at, comments: issue.comments || 0,
          milestone: issue.milestone?.title || '', dueDate: issue.milestone?.due_on || '',
          labels: (issue.labels || []).map(label => ({ name: label.name || label, color: label.color || '' }))
        };
      });
    });
  } else {
    const baseUrl = getGitLabBaseUrl(connection);
    const detected = await getAuthenticatedUser('gitlab', token, baseUrl);
    const configuredUser = (connection.username || '').trim();
    const userIdentifiers = [configuredUser, detected.username, detected.name].filter(Boolean);
    const currentUsername = configuredUser || detected.username || detected.name || '';

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
        const authorUsername = issue.author?.username || '';
        const authorName = issue.author?.name || '';
        const isAssignedToMe = Boolean(
          assigneesList.some(u => {
            const candidateNames = [u.username, u.name].filter(Boolean);
            return candidateNames.some(c => userIdentifiers.some(id => id.toLowerCase() === c.toLowerCase()));
          }) ||
          (!userIdentifiers.length && connection.scope === 'assigned')
        );
        const isAuthorMe = Boolean(
          [authorUsername, authorName].filter(Boolean).some(c => userIdentifiers.some(id => id.toLowerCase() === c.toLowerCase()))
        );
        return {
          provider: 'gitlab', project, id: issue.iid, title: issue.title,
          url: issue.web_url, state: issue.state,
          author: authorName || authorUsername,
          authorAvatar: resolveGitLabAvatar(authorRawAvatar, baseUrl),
          assignees: assigneesList.map(user => user.username || user.name || '').filter(Boolean).join(', '),
          assigneeDetails: assigneesList.map(user => {
            const userRawAvatar = user.avatar_url || user.avatar_path || user.avatarPath || '';
            return {
              name: user.username || user.name || '',
              avatar: resolveGitLabAvatar(userRawAvatar, baseUrl)
            };
          }).filter(u => u.name || u.avatar),
          currentUser: currentUsername,
          isAssignedToMe,
          isAuthorMe,
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
  authenticatedUserCache.clear();

  const finalToken = providedToken ? encryptToken(providedToken) : current.token;
  let username = payload.username?.trim() || null;
  if (!username) {
    const rawToken = providedToken || decryptToken(current?.token);
    const baseUrl = provider === 'gitlab' ? (payload.baseUrl?.trim() || current?.base_url) : null;
    const detected = await getAuthenticatedUser(provider, rawToken, baseUrl);
    username = detected?.username || detected?.name || null;
  }

  db.saveIssueConnection({
    provider,
    token: finalToken,
    projects: payload.projects,
    scope: payload.scope,
    base_url: provider === 'gitlab' ? payload.baseUrl?.trim() : null,
    username
  });
  return { success: true };
});

ipcMain.handle('delete-issue-connection', async (event, provider) => {
  authenticatedUserCache.clear();
  return db.deleteIssueConnection(provider);
});

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

// ========== PULL REQUESTS & MERGE REQUESTS (GITHUB & GITLAB) ==========

let pullRequestsCache = {
  timestamp: 0,
  data: []
};

async function safeHttpGetJson(url, headers = {}) {
  try {
    const data = await httpGetJson(url, headers);
    return { ok: true, status: 200, data };
  } catch (err) {
    const match = String(err.message || '').match(/HTTP (\d+)/);
    const status = match ? parseInt(match[1], 10) : 500;
    return { ok: false, status, error: err.message };
  }
}

function parseAndInsertGitLabMr(mr, defaultRole, mrMap, baseUrl, userIdentifiers, fallbackProject = '') {
  const key = mr.web_url || `gitlab:${mr.id}`;
  const authorRawAvatar = mr.author?.avatar_url || mr.author?.avatar_path || mr.author?.avatarPath || '';
  const assigneesList = mr.assignees || (mr.assignee ? [mr.assignee] : []);
  const reviewersList = mr.reviewers || [];

  let project = fallbackProject || '';
  if (!project) {
    if (mr.references?.full) {
      project = mr.references.full.split('!')[0];
    } else if (mr.web_url) {
      const cleanUrl = mr.web_url.replace(baseUrl, '').replace(/^\//, '');
      project = cleanUrl.split('/-/merge_requests/')[0];
    }
  }

  const matchUser = (nameOrUser) => {
    if (!nameOrUser) return false;
    const n = nameOrUser.toLowerCase();
    return userIdentifiers.some(id => id.toLowerCase() === n);
  };

  const isAuthor = Boolean(matchUser(mr.author?.username) || matchUser(mr.author?.name));
  const isAssignee = Boolean(assigneesList.some(a => matchUser(a.username) || matchUser(a.name)));
  const isReviewer = Boolean(reviewersList.some(r => matchUser(r.username) || matchUser(r.name)));

  if (userIdentifiers.length && !isAuthor && !isAssignee && !isReviewer && !defaultRole) {
    return;
  }

  if (!mrMap.has(key)) {
    const roles = new Set();
    if (defaultRole) roles.add(defaultRole);
    if (isAuthor) roles.add('author');
    if (isAssignee) roles.add('assignee');
    if (isReviewer) roles.add('reviewer');
    if (!roles.size) roles.add('author');

    mrMap.set(key, {
      provider: 'gitlab',
      id: mr.iid || mr.id,
      title: mr.title,
      url: mr.web_url,
      project,
      state: mr.state,
      draft: Boolean(mr.draft || mr.work_in_progress || String(mr.title || '').trim().toLowerCase().startsWith('draft:') || String(mr.title || '').trim().toLowerCase().startsWith('wip:')),
      hasConflicts: Boolean(mr.has_conflicts),
      sourceBranch: mr.source_branch || '',
      targetBranch: mr.target_branch || '',
      author: mr.author?.name || mr.author?.username || '',
      authorAvatar: resolveGitLabAvatar(authorRawAvatar, baseUrl),
      assignees: assigneesList.map(a => a.name || a.username || '').filter(Boolean).join(', '),
      assigneeDetails: assigneesList.map(a => ({
        name: a.name || a.username || '',
        avatar: resolveGitLabAvatar(a.avatar_url || a.avatar_path || '', baseUrl)
      })),
      reviewers: reviewersList.map(r => r.name || r.username || '').filter(Boolean).join(', '),
      reviewerDetails: reviewersList.map(r => ({
        name: r.name || r.username || '',
        avatar: resolveGitLabAvatar(r.avatar_url || r.avatar_path || '', baseUrl)
      })),
      labels: (mr.labels || []).map(name => ({ name: typeof name === 'string' ? name : name.name, color: name.color || '' })),
      comments: mr.user_notes_count || 0,
      createdAt: mr.created_at,
      updatedAt: mr.updated_at,
      roles
    });
  } else {
    if (defaultRole) mrMap.get(key).roles.add(defaultRole);
    if (isAuthor) mrMap.get(key).roles.add('author');
    if (isAssignee) mrMap.get(key).roles.add('assignee');
    if (isReviewer) mrMap.get(key).roles.add('reviewer');
  }
}

async function fetchPullRequestsForConnection(connection) {
  const token = decryptToken(connection.token);
  if (!token) return [];

  if (connection.provider === 'github') {
    const detected = await getAuthenticatedUser('github', token);
    const configuredUser = (connection.username || '').trim();
    const userIdentifiers = [configuredUser, detected.username, detected.name].filter(Boolean);
    const username = configuredUser || detected.username || detected.name || '';

    const authHeaders = {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `Bearer ${token}`
    };

    const prMap = new Map();

    // 1. Probar primero búsqueda global
    const searchQueries = [
      { q: `is:pr state:open author:${username || '@me'}`, role: 'author' },
      { q: `is:pr state:open assignee:${username || '@me'}`, role: 'assignee' },
      { q: `is:pr state:open review-requested:${username || '@me'}`, role: 'reviewer' }
    ];

    let searchFailed403 = false;

    await Promise.all(
      searchQueries.map(async ({ q, role }) => {
        const url = `https://api.github.com/search/issues?q=${encodeURIComponent(q)}&per_page=100`;
        const res = await safeHttpGetJson(url, authHeaders);
        if (res.status === 403) {
          searchFailed403 = true;
          return;
        }
        if (res.ok && res.data?.items) {
          for (const item of res.data.items) {
            const key = item.html_url || `github:${item.id}`;
            if (!prMap.has(key)) {
              const project = item.repository_url ? item.repository_url.replace(/^https:\/\/api\.github\.com\/repos\//, '') : '';
              const assigneesList = (item.assignees && item.assignees.length) ? item.assignees : (item.assignee ? [item.assignee] : []);
              prMap.set(key, {
                provider: 'github',
                id: item.number,
                title: item.title,
                url: item.html_url,
                pullApiUrl: item.pull_request?.url || '',
                project,
                state: item.state,
                draft: Boolean(item.draft),
                hasConflicts: false,
                author: item.user?.login || '',
                authorAvatar: item.user?.avatar_url || '',
                assignees: assigneesList.map(a => a.login).filter(Boolean).join(', '),
                assigneeDetails: assigneesList.map(a => ({ name: a.login || '', avatar: a.avatar_url || '' })),
                reviewers: '',
                reviewerDetails: [],
                labels: (item.labels || []).map(l => ({ name: l.name || l, color: l.color ? (l.color.startsWith('#') ? l.color : `#${l.color}`) : '' })),
                comments: item.comments || 0,
                createdAt: item.created_at,
                updatedAt: item.updated_at,
                roles: new Set([role]),
                sourceBranch: '',
                targetBranch: ''
              });
            } else {
              prMap.get(key).roles.add(role);
            }
          }
        }
      })
    );

    // Enriquecer PRs de la búsqueda con información detallada (ramas head/base, reviewers y conflictos)
    if (prMap.size > 0) {
      await Promise.all(
        Array.from(prMap.values()).map(async pr => {
          if (!pr.sourceBranch || !pr.targetBranch) {
            const pullUrl = pr.pullApiUrl || (pr.project ? `https://api.github.com/repos/${encodeURIComponent(pr.project).replace(/%2F/g, '/')}/pulls/${pr.id}` : '');
            if (!pullUrl) return;

            let pullRes = await safeHttpGetJson(pullUrl, authHeaders);
            if (!pullRes.ok && (pullRes.status === 401 || pullRes.status === 403)) {
              pullRes = await safeHttpGetJson(pullUrl, { ...authHeaders, Authorization: `token ${token}` });
            }

            if (pullRes.ok && pullRes.data) {
              const p = pullRes.data;
              pr.sourceBranch = p.head?.ref || pr.sourceBranch || '';
              pr.targetBranch = p.base?.ref || pr.targetBranch || '';
              pr.draft = Boolean(p.draft);
              if (p.mergeable === false) pr.hasConflicts = true;
              const revs = p.requested_reviewers || [];
              if (revs.length) {
                pr.reviewers = revs.map(r => r.login).filter(Boolean).join(', ');
                pr.reviewerDetails = revs.map(r => ({ name: r.login || '', avatar: r.avatar_url || '' }));
              }
              if (p.comments !== undefined) {
                pr.comments = (p.comments || 0) + (p.review_comments || 0);
              }
            }
          }
        })
      );
    }

    // 2. Si la búsqueda global dio 403 (típico de tokens Fine-Grained o SSO de organización), fallback a nivel repositorio
    if (searchFailed403 || prMap.size === 0) {
      const configuredProjects = getProjectsList(connection.projects);
      const allRepos = new Set(configuredProjects);

      // Intentar descubrir repositorios accesibles por el token
      const userReposRes = await safeHttpGetJson('https://api.github.com/user/repos?per_page=100&affiliation=owner,collaborator,organization_member', authHeaders);
      if (userReposRes.ok && Array.isArray(userReposRes.data)) {
        userReposRes.data.forEach(r => { if (r.full_name) allRepos.add(r.full_name); });
      }

      await Promise.all(
        Array.from(allRepos).map(async repo => {
          const pullsUrl = `https://api.github.com/repos/${encodeURIComponent(repo).replace(/%2F/g, '/')}/pulls?state=open&per_page=100`;
          let pullsRes = await safeHttpGetJson(pullsUrl, authHeaders);
          if (!pullsRes.ok && (pullsRes.status === 401 || pullsRes.status === 403)) {
            pullsRes = await safeHttpGetJson(pullsUrl, { ...authHeaders, Authorization: `token ${token}` });
          }
          if (pullsRes.ok && Array.isArray(pullsRes.data)) {
            for (const pull of pullsRes.data) {
              const key = pull.html_url || `github:${pull.id}`;
              const authorLogin = pull.user?.login || '';
              const assigneesList = pull.assignees || (pull.assignee ? [pull.assignee] : []);
              const reviewersList = pull.requested_reviewers || [];

              const isAuthor = Boolean(userIdentifiers.some(u => u.toLowerCase() === authorLogin.toLowerCase()));
              const isAssignee = Boolean(assigneesList.some(a => userIdentifiers.some(u => u.toLowerCase() === (a.login || '').toLowerCase())));
              const isReviewer = Boolean(reviewersList.some(r => userIdentifiers.some(u => u.toLowerCase() === (r.login || '').toLowerCase())));

              if (!userIdentifiers.length || isAuthor || isAssignee || isReviewer) {
                const roles = new Set();
                if (isAuthor) roles.add('author');
                if (isAssignee) roles.add('assignee');
                if (isReviewer) roles.add('reviewer');
                if (!roles.size) roles.add('author');

                prMap.set(key, {
                  provider: 'github',
                  id: pull.number,
                  title: pull.title,
                  url: pull.html_url,
                  project: repo,
                  state: pull.state,
                  draft: Boolean(pull.draft),
                  hasConflicts: false,
                  sourceBranch: pull.head?.ref || '',
                  targetBranch: pull.base?.ref || '',
                  author: authorLogin,
                  authorAvatar: pull.user?.avatar_url || '',
                  assignees: assigneesList.map(a => a.login).filter(Boolean).join(', '),
                  assigneeDetails: assigneesList.map(a => ({ name: a.login || '', avatar: a.avatar_url || '' })),
                  reviewers: reviewersList.map(r => r.login).filter(Boolean).join(', '),
                  reviewerDetails: reviewersList.map(r => ({ name: r.login || '', avatar: r.avatar_url || '' })),
                  labels: (pull.labels || []).map(l => ({ name: l.name || l, color: l.color ? (l.color.startsWith('#') ? l.color : `#${l.color}`) : '' })),
                  comments: (pull.comments || 0) + (pull.review_comments || 0),
                  createdAt: pull.created_at,
                  updatedAt: pull.updated_at,
                  roles
                });
              }
            }
          }
        })
      );
    }

    return Array.from(prMap.values()).map(pr => {
      const rolesArr = Array.from(pr.roles);
      return {
        ...pr,
        roles: rolesArr,
        isAuthor: rolesArr.includes('author'),
        isAssignee: rolesArr.includes('assignee'),
        isReviewer: rolesArr.includes('reviewer')
      };
    });
  } else if (connection.provider === 'gitlab') {
    const baseUrl = getGitLabBaseUrl(connection);
    const detected = await getAuthenticatedUser('gitlab', token, baseUrl);
    const configuredUser = (connection.username || '').trim();
    const userIdentifiers = [configuredUser, detected.username, detected.name].filter(Boolean);
    const username = configuredUser || detected.username || detected.name || '';

    const glHeaders = { 'PRIVATE-TOKEN': token };
    const mrMap = new Map();

    // 1. Probar endpoints globales de GitLab
    const globalEndpoints = [
      { url: `${baseUrl}/api/v4/merge_requests?state=opened&scope=created_by_me&per_page=100`, defaultRole: 'author' },
      { url: `${baseUrl}/api/v4/merge_requests?state=opened&scope=assigned_to_me&per_page=100`, defaultRole: 'assignee' }
    ];
    if (username) {
      globalEndpoints.push({
        url: `${baseUrl}/api/v4/merge_requests?state=opened&reviewer_username=${encodeURIComponent(username)}&per_page=100`,
        defaultRole: 'reviewer'
      });
    }

    let globalFailed403 = false;

    await Promise.all(
      globalEndpoints.map(async ({ url, defaultRole }) => {
        const res = await safeHttpGetJson(url, glHeaders);
        if (res.status === 403) {
          globalFailed403 = true;
          return;
        }
        if (res.ok && Array.isArray(res.data)) {
          for (const mr of res.data) {
            parseAndInsertGitLabMr(mr, defaultRole, mrMap, baseUrl, userIdentifiers);
          }
        }
      })
    );

    // 2. Si el endpoint global dio 403 (habitual en instancias empresariales con visibilidad restringida), fallback a proyectos
    if (globalFailed403 || mrMap.size === 0) {
      const configuredProjects = getProjectsList(connection.projects);
      const allProjects = new Set(configuredProjects);

      // Intentar descubrir proyectos en los que el usuario es miembro
      const memberProjectsRes = await safeHttpGetJson(`${baseUrl}/api/v4/projects?membership=true&per_page=100&min_access_level=10`, glHeaders);
      if (memberProjectsRes.ok && Array.isArray(memberProjectsRes.data)) {
        memberProjectsRes.data.forEach(p => {
          if (p.path_with_namespace) allProjects.add(p.path_with_namespace);
        });
      }

      await Promise.all(
        Array.from(allProjects).map(async project => {
          const url = `${baseUrl}/api/v4/projects/${encodeURIComponent(project)}/merge_requests?state=opened&per_page=100`;
          const res = await safeHttpGetJson(url, glHeaders);
          if (res.ok && Array.isArray(res.data)) {
            for (const mr of res.data) {
              parseAndInsertGitLabMr(mr, null, mrMap, baseUrl, userIdentifiers, project);
            }
          }
        })
      );
    }

    const allGitLabPRs = Array.from(mrMap.values()).map(pr => {
      const rolesArr = Array.from(pr.roles);
      return {
        ...pr,
        roles: rolesArr,
        isAuthor: rolesArr.includes('author'),
        isAssignee: rolesArr.includes('assignee'),
        isReviewer: rolesArr.includes('reviewer')
      };
    });

    // Enriquecer avatares con base64 para GitLab
    const uniqueAvatarUrls = new Set();
    allGitLabPRs.forEach(pr => {
      if (pr.authorAvatar) uniqueAvatarUrls.add(pr.authorAvatar);
      (pr.assigneeDetails || []).forEach(a => { if (a.avatar) uniqueAvatarUrls.add(a.avatar); });
      (pr.reviewerDetails || []).forEach(r => { if (r.avatar) uniqueAvatarUrls.add(r.avatar); });
    });

    const avatarDataMap = new Map();
    await Promise.all([...uniqueAvatarUrls].map(async url => {
      const dataUrl = await fetchGitLabAvatarAsDataUrl(url, token, baseUrl);
      avatarDataMap.set(url, dataUrl);
    }));

    allGitLabPRs.forEach(pr => {
      if (pr.authorAvatar && avatarDataMap.has(pr.authorAvatar)) {
        pr.authorAvatar = avatarDataMap.get(pr.authorAvatar);
      }
      (pr.assigneeDetails || []).forEach(a => {
        if (a.avatar && avatarDataMap.has(a.avatar)) {
          a.avatar = avatarDataMap.get(a.avatar);
        }
      });
      (pr.reviewerDetails || []).forEach(r => {
        if (r.avatar && avatarDataMap.has(r.avatar)) {
          r.avatar = avatarDataMap.get(r.avatar);
        }
      });
    });

    return allGitLabPRs;
  }

  return [];
}

async function getAllExternalPullRequests(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && pullRequestsCache.timestamp && (now - pullRequestsCache.timestamp < 60000)) {
    return pullRequestsCache.data;
  }

  const connections = db.getIssueConnections().map(c => db.getIssueConnection(c.provider)).filter(Boolean);
  if (!connections.length) {
    pullRequestsCache = { timestamp: now, data: [] };
    return [];
  }

  const results = (await Promise.all(connections.map(fetchPullRequestsForConnection))).flat();
  results.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

  pullRequestsCache = { timestamp: now, data: results };
  return results;
}

let previousPrIds = new Set();
let prPollingInterval = null;

async function checkPullRequestsInBackground() {
  try {
    const connections = db?.getIssueConnections ? db.getIssueConnections().map(c => db.getIssueConnection(c.provider)).filter(Boolean) : [];
    if (!connections.length) return;

    const results = await getAllExternalPullRequests(true);
    // Excluir borradores (draft) del contador del menú lateral
    const count = results.filter(r => !r.draft).length;

    const currentIds = new Set(results.map(r => r.url || `${r.provider}:${r.id}`));

    // Si ya teníamos PRs rastreadas previamente y detectamos alguna nueva lista (no draft), notificar
    if (previousPrIds.size > 0) {
      const brandNew = results.filter(r => !previousPrIds.has(r.url || `${r.provider}:${r.id}`) && !r.draft);
      if (brandNew.length > 0 && Notification.isSupported()) {
        try {
          const first = brandNew[0];
          const notifTitle = brandNew.length === 1
            ? `Nueva PR/MR: ${truncateText(first.title, 35)}`
            : `${brandNew.length} nuevas PRs / MRs`;
          const notifBody = brandNew.length === 1
            ? `${first.project || first.provider} · Autor: ${first.author || 'desconocido'}`
            : `Tienes ${brandNew.length} nuevas Pull Requests o Merge Requests pendientes.`;

          const notif = new Notification({
            title: notifTitle,
            body: notifBody,
            icon: path.join(__dirname, 'assets', 'icons', 'icon.png')
          });
          notif.on('click', () => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              if (mainWindow.isMinimized()) mainWindow.restore();
              mainWindow.focus();
              mainWindow.loadFile('src/renderer/pull-requests.html');
            }
          });
          notif.show();
        } catch (_) {}
      }
    }

    previousPrIds = currentIds;

    // Enviar evento a la ventana principal para actualizar badge y listas en vivo
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
      mainWindow.webContents.send('pull-requests-updated', { count, results });
    }
  } catch (err) {
    // Silencioso en segundo plano
  }
}

function startPullRequestsPolling() {
  if (prPollingInterval) clearInterval(prPollingInterval);
  // Primera comprobación a los 12 segundos para poblar previousPrIds y actualizar badge
  setTimeout(() => {
    checkPullRequestsInBackground();
  }, 12000);
  // Intervalo periódico cada 3 minutos (180.000 ms)
  prPollingInterval = setInterval(() => {
    checkPullRequestsInBackground();
  }, 180000);
}

ipcMain.handle('get-external-pull-requests', async () => {
  const results = await getAllExternalPullRequests(true);
  const count = results.filter(r => !r.draft).length;
  previousPrIds = new Set(results.map(r => r.url || `${r.provider}:${r.id}`));
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send('pull-requests-updated', { count, results });
  }
  return results;
});

ipcMain.handle('get-pull-requests-count', async () => {
  const prs = await getAllExternalPullRequests(false);
  if (previousPrIds.size === 0 && prs.length > 0) {
    previousPrIds = new Set(prs.map(r => r.url || `${r.provider}:${r.id}`));
  }
  // Excluir borradores (draft) del contador
  return prs.filter(r => !r.draft).length;
});

// ========== EXPORTACIÓN DE ISSUES (XLSX Y SVG) ==========

function escapeXml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function truncateText(str, maxLength = 40) {
  const s = String(str ?? '').trim();
  if (s.length <= maxLength) return s;
  return s.slice(0, maxLength - 1) + '…';
}

function createZip(files) {
  const localHeaders = [];
  const centralHeaders = [];
  let offset = 0;

  const crcTable = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
  }
  function crc32(buf) {
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ (-1)) >>> 0;
  }

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, 'utf-8');
    const contentBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf-8');
    const uncompressedSize = contentBuf.length;
    const crc = crc32(contentBuf);
    const compressedData = zlib.deflateRawSync(contentBuf);
    const compressedSize = compressedData.length;

    const localHeader = Buffer.alloc(30 + nameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedSize, 18);
    localHeader.writeUInt32LE(uncompressedSize, 22);
    localHeader.writeUInt16LE(nameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    nameBuf.copy(localHeader, 30);

    localHeaders.push(localHeader, compressedData);

    const centralHeader = Buffer.alloc(46 + nameBuf.length);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(0, 12);
    centralHeader.writeUInt16LE(0, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedSize, 20);
    centralHeader.writeUInt32LE(uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuf.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);
    nameBuf.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    offset += localHeader.length + compressedData.length;
  }

  const centralDirSize = centralHeaders.reduce((sum, b) => sum + b.length, 0);
  const centralDirOffset = offset;

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(centralDirOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

function generateXlsx(columns, rows, sheetName = 'Issues') {
  function colName(colIndex) {
    let name = '';
    let num = colIndex + 1;
    while (num > 0) {
      const rem = (num - 1) % 26;
      name = String.fromCharCode(65 + rem) + name;
      num = Math.floor((num - 1) / 26);
    }
    return name;
  }

  let sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheetData>`;

  sheetXml += `<row r="1">`;
  columns.forEach((col, idx) => {
    const ref = `${colName(idx)}1`;
    sheetXml += `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(col.header || col.id)}</t></is></c>`;
  });
  sheetXml += `</row>`;

  rows.forEach((row, rowIdx) => {
    const rNum = rowIdx + 2;
    sheetXml += `<row r="${rNum}">`;
    columns.forEach((col, colIdx) => {
      const val = row[col.id];
      const ref = `${colName(colIdx)}${rNum}`;
      if (val !== undefined && val !== null && val !== '') {
        if (typeof val === 'number') {
          sheetXml += `<c r="${ref}"><v>${val}</v></c>`;
        } else {
          sheetXml += `<c r="${ref}" t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`;
        }
      }
    });
    sheetXml += `</row>`;
  });

  sheetXml += `</sheetData></worksheet>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>
  <fills count="1"><fill><patternFill patternType="none"/></fill></fills>
  <borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>
</styleSheet>`;

  return createZip([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: rootRelsXml },
    { name: 'xl/workbook.xml', content: workbookXml },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml },
    { name: 'xl/worksheets/sheet1.xml', content: sheetXml },
    { name: 'xl/styles.xml', content: stylesXml }
  ]);
}

const SVG_STATUS_CONFIG = {
  pending: { label: 'Pendiente', color: '#64748b', bg: '#f1f5f9' },
  in_progress: { label: 'En Curso', color: '#2563eb', bg: '#dbeafe' },
  blocked: { label: 'Bloqueado', color: '#dc2626', bg: '#fee2e2' },
  testing: { label: 'Testing', color: '#d97706', bg: '#fef3c7' },
  completed: { label: 'Completada', color: '#16a34a', bg: '#dcfce7' }
};

function generateIssuesTableSvg(issues, options = {}) {
  const title = options.title || 'Reporte de Issues';
  const subtitle = `${issues.length} issues · Generado el ${new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}`;
  
  const width = 1260;
  const headerHeight = 90;
  const thHeight = 36;
  const rowHeight = 44;
  const totalHeight = headerHeight + thHeight + (issues.length * rowHeight) + 40;

  const cols = [
    { name: 'Proveedor', x: 25, width: 85 },
    { name: 'Issue', x: 120, width: 380 },
    { name: 'Proyecto', x: 510, width: 170 },
    { name: 'Responsable', x: 690, width: 170 },
    { name: 'Estado', x: 870, width: 110 },
    { name: 'Etiquetas', x: 990, width: 140 },
    { name: 'Actualizada', x: 1140, width: 95 }
  ];

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${totalHeight}" width="${width}" height="${totalHeight}">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <filter id="shadow" x="-2%" y="-2%" width="104%" height="104%">
      <feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.08"/>
    </filter>
  </defs>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .header-title { font-size: 20px; font-weight: 700; fill: #ffffff; }
    .header-sub { font-size: 13px; font-weight: 400; fill: #94a3b8; }
    .th-text { font-size: 11px; font-weight: 700; fill: #475569; text-transform: uppercase; letter-spacing: 0.05em; }
    .cell-title-id { font-size: 13px; font-weight: 700; fill: #0f172a; }
    .cell-title-text { font-size: 13px; font-weight: 500; fill: #1e293b; }
    .cell-text { font-size: 12px; font-weight: 400; fill: #334155; }
    .badge-text { font-size: 11px; font-weight: 600; }
  </style>

  <rect width="${width}" height="${totalHeight}" fill="#f8fafc"/>

  <rect x="20" y="15" width="${width - 40}" height="65" rx="8" fill="url(#headerGrad)"/>
  <text x="40" y="42" class="header-title">${escapeXml(title)}</text>
  <text x="40" y="63" class="header-sub">${escapeXml(subtitle)}</text>

  <g transform="translate(20, 95)" filter="url(#shadow)">
    <rect x="0" y="0" width="${width - 40}" height="${thHeight}" rx="6" fill="#e2e8f0"/>
`;

  cols.forEach(col => {
    svg += `    <text x="${col.x}" y="23" class="th-text">${escapeXml(col.name)}</text>\n`;
  });

  issues.forEach((issue, idx) => {
    const y = thHeight + (idx * rowHeight);
    const bg = idx % 2 === 0 ? '#ffffff' : '#f8fafc';
    const isGitLab = issue.provider === 'gitlab';
    const provBg = isGitLab ? '#ea580c' : '#24292f';
    const provLabel = isGitLab ? 'GitLab' : 'GitHub';

    const statusConf = SVG_STATUS_CONFIG[issue.status] || SVG_STATUS_CONFIG.pending;
    const assigneesText = issue.assignees || (issue.assigneeDetails || []).map(a => a.name).join(', ') || 'Sin asignar';
    const dateText = issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';

    svg += `
    <rect x="0" y="${y}" width="${width - 40}" height="${rowHeight}" fill="${bg}"/>
    <line x1="0" y1="${y + rowHeight}" x2="${width - 40}" y2="${y + rowHeight}" stroke="#e2e8f0" stroke-width="1"/>

    <rect x="25" y="${y + 11}" width="65" height="22" rx="4" fill="${provBg}"/>
    <text x="57" y="${y + 26}" class="badge-text" fill="#ffffff" text-anchor="middle">${provLabel}</text>

    <text x="120" y="${y + 27}" class="cell-title-text">
      <tspan class="cell-title-id">#${escapeXml(issue.id)}</tspan> ${escapeXml(truncateText(issue.title, 45))}
    </text>

    <text x="510" y="${y + 27}" class="cell-text">${escapeXml(truncateText(issue.project, 22))}</text>
    <text x="690" y="${y + 27}" class="cell-text">${escapeXml(truncateText(assigneesText, 20))}</text>

    <rect x="870" y="${y + 11}" width="95" height="22" rx="11" fill="${statusConf.bg}"/>
    <text x="917" y="${y + 26}" class="badge-text" fill="${statusConf.color}" text-anchor="middle">${statusConf.label}</text>

    <g transform="translate(990, ${y + 11})">
`;
    const labels = (issue.labels || []).slice(0, 2);
    let lx = 0;
    labels.forEach(lbl => {
      const name = typeof lbl === 'string' ? lbl : lbl.name;
      const color = (typeof lbl === 'object' && lbl.color) ? (lbl.color.startsWith('#') ? lbl.color : `#${lbl.color}`) : '#64748b';
      const w = Math.min(65, Math.max(35, name.length * 7 + 10));
      svg += `      <rect x="${lx}" y="0" width="${w}" height="22" rx="4" fill="${color}" opacity="0.9"/>
      <text x="${lx + w / 2}" y="15" class="badge-text" fill="#ffffff" text-anchor="middle">${escapeXml(truncateText(name, 8))}</text>\n`;
      lx += w + 5;
    });

    svg += `    </g>
    <text x="1140" y="${y + 27}" class="cell-text">${escapeXml(dateText)}</text>
`;
  });

  svg += `  </g>
</svg>`;

  return svg;
}

function generateIssuesKanbanSvg(issues, options = {}) {
  const title = options.title || 'Tablero Kanban de Issues';
  const subtitle = `${issues.length} issues · Generado el ${new Date().toLocaleString('es-ES', { dateStyle: 'long', timeStyle: 'short' })}`;

  const COLUMNS = [
    { id: 'pending', label: 'Pendiente', color: '#64748b', bg: '#f1f5f9' },
    { id: 'in_progress', label: 'En Curso', color: '#2563eb', bg: '#dbeafe' },
    { id: 'blocked', label: 'Bloqueado', color: '#dc2626', bg: '#fee2e2' },
    { id: 'testing', label: 'Testing', color: '#d97706', bg: '#fef3c7' },
    { id: 'completed', label: 'Completada', color: '#16a34a', bg: '#dcfce7' }
  ];

  const colWidth = 255;
  const colGap = 15;
  const margin = 25;
  const headerHeight = 90;
  const colHeaderHeight = 40;
  const cardHeight = 96;
  const cardGap = 10;

  const grouped = COLUMNS.map(col => ({
    ...col,
    cards: issues.filter(i => i.status === col.id)
  }));

  const maxCards = Math.max(...grouped.map(g => g.cards.length), 1);
  const totalWidth = margin * 2 + (colWidth * COLUMNS.length) + (colGap * (COLUMNS.length - 1));
  const boardHeight = colHeaderHeight + (maxCards * (cardHeight + cardGap)) + 20;
  const totalHeight = headerHeight + boardHeight + 30;

  let svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <defs>
    <linearGradient id="headerGradKanban" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b"/>
      <stop offset="100%" stop-color="#0f172a"/>
    </linearGradient>
    <filter id="cardShadow" x="-2%" y="-2%" width="104%" height="106%">
      <feDropShadow dx="0" dy="1" stdDeviation="2" flood-opacity="0.06"/>
    </filter>
  </defs>
  <style>
    text { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
    .header-title { font-size: 20px; font-weight: 700; fill: #ffffff; }
    .header-sub { font-size: 13px; font-weight: 400; fill: #94a3b8; }
    .col-title { font-size: 13px; font-weight: 700; fill: #334155; }
    .col-count { font-size: 11px; font-weight: 700; fill: #64748b; }
    .card-title-id { font-size: 12px; font-weight: 700; fill: #0f172a; }
    .card-title-text { font-size: 12px; font-weight: 500; fill: #1e293b; }
    .card-subtext { font-size: 11px; font-weight: 400; fill: #64748b; }
    .badge-text { font-size: 10px; font-weight: 600; }
  </style>

  <rect width="${totalWidth}" height="${totalHeight}" fill="#f1f5f9"/>

  <rect x="${margin}" y="15" width="${totalWidth - margin * 2}" height="65" rx="8" fill="url(#headerGradKanban)"/>
  <text x="${margin + 20}" y="42" class="header-title">${escapeXml(title)}</text>
  <text x="${margin + 20}" y="63" class="header-sub">${escapeXml(subtitle)}</text>

  <g transform="translate(${margin}, ${headerHeight + 15})">
`;

  grouped.forEach((col, colIdx) => {
    const colX = colIdx * (colWidth + colGap);
    svg += `
    <g transform="translate(${colX}, 0)">
      <rect x="0" y="0" width="${colWidth}" height="${boardHeight}" rx="8" fill="#f8fafc" stroke="#e2e8f0" stroke-width="1"/>

      <rect x="0" y="0" width="${colWidth}" height="${colHeaderHeight}" rx="8" fill="#e2e8f0"/>
      <circle cx="16" cy="20" r="5" fill="${col.color}"/>
      <text x="28" y="24" class="col-title">${escapeXml(col.label)}</text>
      <rect x="${colWidth - 36}" y="10" width="24" height="20" rx="10" fill="#cbd5e1"/>
      <text x="${colWidth - 24}" y="24" class="col-count" text-anchor="middle">${col.cards.length}</text>

      <g transform="translate(10, ${colHeaderHeight + 10})">
`;

    col.cards.forEach((card, cardIdx) => {
      const cardY = cardIdx * (cardHeight + cardGap);
      const isGitLab = card.provider === 'gitlab';
      const provBg = isGitLab ? '#ea580c' : '#24292f';
      const provLabel = isGitLab ? 'GitLab' : 'GitHub';
      const personText = card.assignees ? `Asignado: ${card.assignees}` : (card.author ? `Por: ${card.author}` : 'Sin asignar');

      svg += `
        <g transform="translate(0, ${cardY})" filter="url(#cardShadow)">
          <rect x="0" y="0" width="${colWidth - 20}" height="${cardHeight}" rx="6" fill="#ffffff" stroke="#e2e8f0" stroke-width="1"/>

          <rect x="10" y="9" width="46" height="16" rx="3" fill="${provBg}"/>
          <text x="33" y="21" class="badge-text" fill="#ffffff" text-anchor="middle">${provLabel}</text>
          <text x="62" y="21" class="card-subtext">${escapeXml(truncateText(card.project, 22))}</text>

          <text x="10" y="44" class="card-title-text">
            <tspan class="card-title-id">#${escapeXml(card.id)}</tspan> ${escapeXml(truncateText(card.title, 26))}
          </text>
`;
      const firstLabel = (card.labels || [])[0];
      if (firstLabel) {
        const lname = typeof firstLabel === 'string' ? firstLabel : firstLabel.name;
        const lcolor = (typeof firstLabel === 'object' && firstLabel.color) ? (firstLabel.color.startsWith('#') ? firstLabel.color : `#${firstLabel.color}`) : '#64748b';
        svg += `          <rect x="10" y="66" width="${Math.min(70, lname.length * 7 + 10)}" height="18" rx="3" fill="${lcolor}" opacity="0.9"/>
          <text x="15" y="79" class="badge-text" fill="#ffffff">${escapeXml(truncateText(lname, 8))}</text>\n`;
      }

      svg += `          <text x="${colWidth - 30}" y="79" class="card-subtext" text-anchor="end">${escapeXml(truncateText(personText, 18))}</text>
        </g>
`;
    });

    svg += `      </g>
    </g>
`;
  });

  svg += `  </g>
</svg>`;

  return svg;
}

ipcMain.handle('export-issues', async (event, { format, issues, options = {} }) => {
  if (!issues || !Array.isArray(issues) || !issues.length) {
    throw new Error('No hay issues para exportar.');
  }

  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const win = BrowserWindow.getFocusedWindow() || mainWindow;

  if (format === 'xlsx') {
    const defaultPath = path.join(app.getPath('documents'), `issues-${dateStr}.xlsx`);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exportar issues a Excel',
      defaultPath,
      filters: [{ name: 'Excel Spreadsheet (*.xlsx)', extensions: ['xlsx'] }]
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    const STATUS_MAP = {
      pending: 'Pendiente',
      in_progress: 'En Curso',
      blocked: 'Bloqueado',
      testing: 'Testing',
      completed: 'Completada'
    };

    const columns = [
      { id: 'provider', header: 'Proveedor' },
      { id: 'id', header: 'ID' },
      { id: 'title', header: 'Título' },
      { id: 'url', header: 'URL' },
      { id: 'project', header: 'Proyecto' },
      { id: 'status', header: 'Estado' },
      { id: 'assignees', header: 'Responsables' },
      { id: 'author', header: 'Reporter' },
      { id: 'labels', header: 'Etiquetas' },
      { id: 'milestone', header: 'Milestone' },
      { id: 'comments', header: 'Comentarios' },
      { id: 'createdAt', header: 'Fecha Creación' },
      { id: 'updatedAt', header: 'Fecha Actualización' }
    ];

    const rows = issues.map(i => ({
      provider: i.provider === 'github' ? 'GitHub' : 'GitLab',
      id: i.id,
      title: i.title,
      url: i.url,
      project: i.project,
      status: STATUS_MAP[i.status] || i.status || 'Pendiente',
      assignees: i.assignees || (i.assigneeDetails || []).map(a => a.name).join(', ') || 'Sin asignar',
      author: i.author || '',
      labels: (i.labels || []).map(l => typeof l === 'string' ? l : l.name).join(', '),
      milestone: i.milestone || '',
      comments: i.comments || 0,
      createdAt: i.createdAt ? new Date(i.createdAt).toLocaleString('es-ES') : '',
      updatedAt: i.updatedAt ? new Date(i.updatedAt).toLocaleString('es-ES') : ''
    }));

    const buffer = generateXlsx(columns, rows, 'Issues');
    await fs.promises.writeFile(filePath, buffer);
    return { success: true, filePath, count: issues.length, format: 'xlsx' };
  } else if (format === 'svg') {
    const layout = options.layout === 'kanban' ? 'kanban' : 'table';
    const defaultPath = path.join(app.getPath('documents'), `issues-${layout}-${dateStr}.svg`);
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Exportar issues a SVG',
      defaultPath,
      filters: [{ name: 'Vector Graphic (*.svg)', extensions: ['svg'] }]
    });

    if (canceled || !filePath) return { success: false, canceled: true };

    const svgContent = layout === 'kanban'
      ? generateIssuesKanbanSvg(issues, options)
      : generateIssuesTableSvg(issues, options);

    await fs.promises.writeFile(filePath, svgContent, 'utf-8');
    return { success: true, filePath, count: issues.length, format: 'svg' };
  }

  throw new Error(`Formato no soportado: ${format}`);
});

// IPC Handlers para controles de ventana
ipcMain.on('window-minimize', () => mainWindow && mainWindow.minimize());
ipcMain.on('window-maximize', () => {
  if (!mainWindow) return;
  mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize();
});
ipcMain.on('window-close', () => mainWindow && mainWindow.close());

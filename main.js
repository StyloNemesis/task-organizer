const { app, BrowserWindow, ipcMain, shell } = require('electron');
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

ipcMain.handle('toggle-task', async (event, id) => {
  return db.toggleTask(id);
});

ipcMain.handle('update-task-status', async (event, id, status) => {
  return db.updateTaskStatus(id, status);
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

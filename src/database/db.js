const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class TaskDatabase {
  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'tasks.db');
    this.db = new Database(dbPath);
    this.init();
  }

  init() {
    // Tabla de proyectos
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        parent_id INTEGER,
        color TEXT DEFAULT '#3b82f6',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (parent_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Tabla de tareas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        images TEXT,
        tags TEXT,
        due_date DATE,
        criticality TEXT CHECK(criticality IN ('low', 'medium', 'high', 'critical')),
        completed BOOLEAN DEFAULT 0,
        status TEXT CHECK(status IN ('pending', 'in_progress', 'testing', 'blocked', 'completed')) DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Añadir columna tags si no existe (migración)
    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN tags TEXT`);
    } catch (e) {
      // La columna ya existe
    }

    // Añadir columna status si no existe (migración)
    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN status TEXT CHECK(status IN ('pending', 'in_progress', 'testing', 'blocked', 'completed')) DEFAULT 'pending'`);
      // Migrar datos de completed a status
      this.db.exec(`UPDATE tasks SET status = CASE WHEN completed = 1 THEN 'completed' ELSE 'pending' END WHERE status IS NULL`);
    } catch (e) {
      // La columna ya existe
    }

    // Migración: reconstruir tabla si el CHECK constraint no incluye 'blocked' o falta la columna favorite
    try {
      const tableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'").get();
      const needsRebuild = tableInfo && (
        !tableInfo.sql.includes("'blocked'") ||
        !tableInfo.sql.includes('favorite')
      );
      if (needsRebuild) {
        const columns = this.db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name);
        const hasFavorite = columns.includes('favorite');
        const hasStatus = columns.includes('status');
        const migrate = this.db.transaction(() => {
          this.db.exec(`
            CREATE TABLE tasks_v2 (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              project_id INTEGER NOT NULL,
              title TEXT NOT NULL,
              description TEXT,
              images TEXT,
              tags TEXT,
              due_date DATE,
              criticality TEXT CHECK(criticality IN ('low', 'medium', 'high', 'critical')),
              completed BOOLEAN DEFAULT 0,
              status TEXT CHECK(status IN ('pending', 'in_progress', 'testing', 'blocked', 'completed')) DEFAULT 'pending',
              favorite INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
            )
          `);
          this.db.exec(`
            INSERT INTO tasks_v2 (id, project_id, title, description, images, tags, due_date, criticality, completed, status, favorite, created_at, updated_at)
            SELECT id, project_id, title, description, images, tags, due_date, criticality, completed,
                   ${hasStatus ? "CASE WHEN status IN ('pending', 'in_progress', 'testing', 'blocked', 'completed') THEN status ELSE 'pending' END" : "'pending'"},
                   ${hasFavorite ? 'COALESCE(favorite, 0)' : '0'},
                   created_at, updated_at
            FROM tasks
          `);
          this.db.exec(`DROP TABLE tasks`);
          this.db.exec(`ALTER TABLE tasks_v2 RENAME TO tasks`);
        });
        migrate();
      }
    } catch (e) {
      console.error('Error en migración de tasks:', e);
    }

    // Añadir columna favorite si no existe (migración, para DBs ya reconstruidas sin ella)
    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN favorite INTEGER DEFAULT 0`);
    } catch (e) {
      // La columna ya existe
    }

    // Tabla de notas
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS notes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        content TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
  }

  // ========== PROYECTOS ==========
  getProjects() {
    return this.db.prepare('SELECT * FROM projects ORDER BY parent_id, name').all();
  }

  createProject(project) {
    const stmt = this.db.prepare(`
      INSERT INTO projects (name, parent_id, color)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(project.name, project.parent_id || null, project.color || '#3b82f6');
    return { id: result.lastInsertRowid, ...project };
  }

  updateProject(id, project) {
    const stmt = this.db.prepare(`
      UPDATE projects
      SET name = ?, parent_id = ?, color = ?
      WHERE id = ?
    `);
    stmt.run(project.name, project.parent_id || null, project.color, id);
    return { id, ...project };
  }

  deleteProject(id) {
    const stmt = this.db.prepare('DELETE FROM projects WHERE id = ?');
    stmt.run(id);
    return { success: true };
  }

  // ========== TAREAS ==========
  getTasks(projectId) {
    if (projectId) {
      return this.db.prepare('SELECT * FROM tasks WHERE project_id = ? ORDER BY due_date, criticality').all(projectId);
    }
    return this.db.prepare('SELECT * FROM tasks ORDER BY due_date, criticality').all();
  }

  getAllTasks() {
    return this.db.prepare(`
      SELECT tasks.*, 
             projects.name as project_name, 
             projects.color as project_color,
             projects.parent_id,
             parent.name as parent_project_name,
             parent.color as parent_project_color
      FROM tasks
      LEFT JOIN projects ON tasks.project_id = projects.id
      LEFT JOIN projects as parent ON projects.parent_id = parent.id
      ORDER BY tasks.due_date, tasks.criticality
    `).all();
  }

  createTask(task) {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (project_id, title, description, images, tags, due_date, criticality, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const images = task.images ? JSON.stringify(task.images) : null;
    const tags = task.tags ? JSON.stringify(task.tags) : null;
    const result = stmt.run(
      task.project_id,
      task.title,
      task.description || '',
      images,
      tags,
      task.due_date || null,
      task.criticality || 'medium',
      task.status || 'pending'
    );
    return { id: result.lastInsertRowid, ...task };
  }

  updateTask(id, task) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, images = ?, tags = ?, due_date = ?, criticality = ?, status = ?, completed = CASE WHEN ? = 'completed' THEN 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const images = task.images ? JSON.stringify(task.images) : null;
    const tags = task.tags ? JSON.stringify(task.tags) : null;
    const status = task.status || 'pending';
    stmt.run(task.title, task.description, images, tags, task.due_date, task.criticality, status, status, id);
    return { id, ...task };
  }

  updateTaskStatus(id, status) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET status = ?, completed = CASE WHEN ? = 'completed' THEN 1 ELSE 0 END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(status, status, id);
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return task;
  }

  toggleTask(id) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET completed = NOT completed, status = CASE WHEN completed = 0 THEN 'completed' ELSE 'pending' END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return task;
  }

  toggleFavorite(id) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET favorite = CASE WHEN favorite = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(id);
    const task = this.db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
    return task;
  }

  deleteTask(id) {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE id = ?');
    stmt.run(id);
    return { success: true };
  }

  deleteCompletedTasks() {
    const stmt = this.db.prepare('DELETE FROM tasks WHERE status = ?');
    const result = stmt.run('completed');
    return { success: true, deletedCount: result.changes };
  }

  // ========== NOTAS ==========
  getNotes(projectId) {
    return this.db.prepare('SELECT * FROM notes WHERE project_id = ? ORDER BY updated_at DESC').all(projectId);
  }

  createNote(note) {
    const stmt = this.db.prepare(`
      INSERT INTO notes (project_id, title, content)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(note.project_id, note.title, note.content || '');
    return { id: result.lastInsertRowid, ...note };
  }

  updateNote(id, note) {
    const stmt = this.db.prepare(`
      UPDATE notes
      SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(note.title, note.content, id);
    return { id, ...note };
  }

  deleteNote(id) {
    const stmt = this.db.prepare('DELETE FROM notes WHERE id = ?');
    stmt.run(id);
    return { success: true };
  }
}

module.exports = TaskDatabase;

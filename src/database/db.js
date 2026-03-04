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
        due_date DATE,
        criticality TEXT CHECK(criticality IN ('low', 'medium', 'high', 'critical')),
        completed BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

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
      SELECT tasks.*, projects.name as project_name, projects.color as project_color
      FROM tasks
      LEFT JOIN projects ON tasks.project_id = projects.id
      ORDER BY tasks.due_date, tasks.criticality
    `).all();
  }

  createTask(task) {
    const stmt = this.db.prepare(`
      INSERT INTO tasks (project_id, title, description, images, due_date, criticality)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const images = task.images ? JSON.stringify(task.images) : null;
    const result = stmt.run(
      task.project_id,
      task.title,
      task.description || '',
      images,
      task.due_date || null,
      task.criticality || 'medium'
    );
    return { id: result.lastInsertRowid, ...task };
  }

  updateTask(id, task) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, images = ?, due_date = ?, criticality = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const images = task.images ? JSON.stringify(task.images) : null;
    stmt.run(task.title, task.description, images, task.due_date, task.criticality, id);
    return { id, ...task };
  }

  toggleTask(id) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET completed = NOT completed, updated_at = CURRENT_TIMESTAMP
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

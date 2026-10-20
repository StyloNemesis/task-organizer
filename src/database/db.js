const Database = require('better-sqlite3');
const path = require('path');
const { app } = require('electron');

class TaskDatabase {
  constructor(customPath = null) {
    const dbPath = customPath || (app ? path.join(app.getPath('userData'), 'tasks.db') : ':memory:');
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

    // Añadir columna version si no existe (migración)
    try {
      this.db.exec(`ALTER TABLE tasks ADD COLUMN version TEXT`);
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

    // Conexiones externas. El token se cifra antes de llegar a esta tabla.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS issue_connections (
        provider TEXT PRIMARY KEY CHECK(provider IN ('github', 'gitlab')),
        token TEXT NOT NULL,
        projects TEXT NOT NULL DEFAULT '',
        scope TEXT NOT NULL DEFAULT 'assigned' CHECK(scope IN ('assigned', 'all')),
        base_url TEXT,
        username TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      this.db.exec(`ALTER TABLE issue_connections ADD COLUMN username TEXT`);
    } catch (e) {
      // La columna ya existe
    }

    // Estado local de flujo para issues externas; no altera la issue en GitHub/GitLab.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS external_issue_statuses (
        provider TEXT NOT NULL,
        project TEXT NOT NULL,
        issue_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'blocked', 'pending_deployment', 'testing', 'completed')),
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (provider, project, issue_id)
      )
    `);

    // Reglas persistentes: una etiqueta remota puede colocar automáticamente una issue en una columna.
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS external_issue_label_rules (
        provider TEXT NOT NULL CHECK(provider IN ('github', 'gitlab')),
        label TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'blocked', 'pending_deployment', 'testing', 'completed')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (provider, label)
      )
    `);

    // Migración: actualizar CHECK constraint de external_issue_statuses para incluir 'pending_deployment'
    try {
      const statusTableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='external_issue_statuses'").get();
      if (statusTableInfo && !statusTableInfo.sql.includes("'pending_deployment'")) {
        const migrateStatuses = this.db.transaction(() => {
          this.db.exec(`
            CREATE TABLE external_issue_statuses_v2 (
              provider TEXT NOT NULL,
              project TEXT NOT NULL,
              issue_id TEXT NOT NULL,
              status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'blocked', 'pending_deployment', 'testing', 'completed')),
              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (provider, project, issue_id)
            )
          `);
          this.db.exec(`
            INSERT INTO external_issue_statuses_v2 (provider, project, issue_id, status, updated_at)
            SELECT provider, project, issue_id, status, updated_at
            FROM external_issue_statuses
          `);
          this.db.exec(`DROP TABLE external_issue_statuses`);
          this.db.exec(`ALTER TABLE external_issue_statuses_v2 RENAME TO external_issue_statuses`);
        });
        migrateStatuses();
      }
    } catch (e) {
      console.error('Error en migración de external_issue_statuses:', e);
    }

    // Migración: actualizar CHECK constraint de external_issue_label_rules para incluir 'pending_deployment'
    try {
      const rulesTableInfo = this.db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='external_issue_label_rules'").get();
      if (rulesTableInfo && !rulesTableInfo.sql.includes("'pending_deployment'")) {
        const migrateRules = this.db.transaction(() => {
          this.db.exec(`
            CREATE TABLE external_issue_label_rules_v2 (
              provider TEXT NOT NULL CHECK(provider IN ('github', 'gitlab')),
              label TEXT NOT NULL,
              status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'blocked', 'pending_deployment', 'testing', 'completed')),
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (provider, label)
            )
          `);
          this.db.exec(`
            INSERT INTO external_issue_label_rules_v2 (provider, label, status, created_at)
            SELECT provider, label, status, created_at
            FROM external_issue_label_rules
          `);
          this.db.exec(`DROP TABLE external_issue_label_rules`);
          this.db.exec(`ALTER TABLE external_issue_label_rules_v2 RENAME TO external_issue_label_rules`);
        });
        migrateRules();
      }
    } catch (e) {
      console.error('Error en migración de external_issue_label_rules:', e);
    }

    // Tabla de despliegues (entornos y comparación de carpetas)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS deployments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        source_path TEXT NOT NULL,
        target_path TEXT NOT NULL,
        ignore_patterns TEXT DEFAULT '.git,.github,node_modules,dist,build,target,.DS_Store',
        tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    try {
      this.db.exec("ALTER TABLE deployments ADD COLUMN tags TEXT");
    } catch (e) {
      // Ignore if already exists
    }

    // Tabla de códigos de imputación asociados a proyectos
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS imputation_codes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        description TEXT,
        color TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Tabla de imputaciones diarias por proyecto
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS imputations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        date DATE NOT NULL,
        hours REAL NOT NULL DEFAULT 0,
        is_overtime INTEGER DEFAULT 0,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);

    // Tabla de reparto de horas de proyecto entre sus códigos de imputación
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS imputation_code_allocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        code_id INTEGER NOT NULL,
        period TEXT NOT NULL,
        hours REAL NOT NULL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(code_id, period),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (code_id) REFERENCES imputation_codes(id) ON DELETE CASCADE
      )
    `);

    // Añadir columna code_id a imputations si no existe
    try {
      this.db.exec("ALTER TABLE imputations ADD COLUMN code_id INTEGER REFERENCES imputation_codes(id) ON DELETE SET NULL");
    } catch (e) {
      // Ya existe
    }

    // Tabla de días festivos
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS holidays (
        date DATE PRIMARY KEY,
        name TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Tabla de cuotas anuales de vacaciones y libre disposición
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS annual_leave_quotas (
        year INTEGER PRIMARY KEY,
        vacation_days_current REAL DEFAULT 22,
        vacation_days_previous REAL DEFAULT 0,
        personal_hours REAL DEFAULT 14,
        vacation_current_code_id INTEGER,
        vacation_previous_code_id INTEGER,
        personal_hours_code_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Columnas de vinculación para leave_type y códigos de cuotas
    try {
      this.db.exec("ALTER TABLE imputation_codes ADD COLUMN leave_type TEXT");
    } catch (e) {}

    try {
      this.db.exec("ALTER TABLE annual_leave_quotas ADD COLUMN vacation_current_code_id INTEGER");
    } catch (e) {}
    try {
      this.db.exec("ALTER TABLE annual_leave_quotas ADD COLUMN vacation_previous_code_id INTEGER");
    } catch (e) {}
    try {
      this.db.exec("ALTER TABLE annual_leave_quotas ADD COLUMN personal_hours_code_id INTEGER");
    } catch (e) {}

    // Asegurar que exista el proyecto y códigos del sistema para Vacaciones y Ausencias
    try {
      this.ensureLeaveProjectAndCodes();
    } catch (e) {
      console.error('Error al inicializar proyecto de vacaciones:', e);
    }
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
      INSERT INTO tasks (project_id, title, description, images, tags, due_date, criticality, status, version)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      task.status || 'pending',
      task.version || null
    );
    return { id: result.lastInsertRowid, ...task };
  }

  updateTask(id, task) {
    const stmt = this.db.prepare(`
      UPDATE tasks
      SET title = ?, description = ?, images = ?, tags = ?, due_date = ?, criticality = ?, status = ?, completed = CASE WHEN ? = 'completed' THEN 1 ELSE 0 END, version = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const images = task.images ? JSON.stringify(task.images) : null;
    const tags = task.tags ? JSON.stringify(task.tags) : null;
    const status = task.status || 'pending';
    stmt.run(task.title, task.description, images, tags, task.due_date, task.criticality, status, status, task.version || null, id);
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

  // ========== INTEGRACIONES DE ISSUES ==========
  getIssueConnections() {
    return this.db.prepare(`
      SELECT provider, projects, scope, base_url, username, updated_at
      FROM issue_connections ORDER BY provider
    `).all();
  }

  getIssueConnection(provider) {
    return this.db.prepare('SELECT * FROM issue_connections WHERE provider = ?').get(provider);
  }

  saveIssueConnection(connection) {
    this.db.prepare(`
      INSERT INTO issue_connections (provider, token, projects, scope, base_url, username, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider) DO UPDATE SET
        token = excluded.token,
        projects = excluded.projects,
        scope = excluded.scope,
        base_url = excluded.base_url,
        username = excluded.username,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      connection.provider,
      connection.token,
      connection.projects || '',
      connection.scope || 'assigned',
      connection.base_url || null,
      connection.username || null
    );
    return { success: true };
  }

  deleteIssueConnection(provider) {
    this.db.prepare('DELETE FROM issue_connections WHERE provider = ?').run(provider);
    return { success: true };
  }

  getExternalIssueStatuses() {
    return this.db.prepare('SELECT provider, project, issue_id, status FROM external_issue_statuses').all();
  }

  saveExternalIssueStatus(issue) {
    this.db.prepare(`
      INSERT INTO external_issue_statuses (provider, project, issue_id, status, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(provider, project, issue_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP
    `).run(issue.provider, issue.project, String(issue.id), issue.status);
    return { success: true };
  }

  getExternalIssueLabelRules() {
    return this.db.prepare('SELECT provider, label, status FROM external_issue_label_rules ORDER BY provider, label').all();
  }

  saveExternalIssueLabelRule(rule) {
    this.db.prepare(`
      INSERT INTO external_issue_label_rules (provider, label, status)
      VALUES (?, ?, ?)
      ON CONFLICT(provider, label) DO UPDATE SET status = excluded.status
    `).run(rule.provider, rule.label, rule.status);
    return { success: true };
  }

  deleteExternalIssueLabelRule(provider, label) {
    this.db.prepare('DELETE FROM external_issue_label_rules WHERE provider = ? AND label = ?').run(provider, label);
    return { success: true };
  }

  // ========== DESPLIEGUES (COMPARADOR Y ENSTORNOS) ==========
  getDeployments() {
    const deps = this.db.prepare('SELECT * FROM deployments ORDER BY updated_at DESC, name ASC').all();
    deps.forEach(d => {
      d.tags = d.tags ? JSON.parse(d.tags) : [];
    });
    return deps;
  }

  getDeployment(id) {
    const d = this.db.prepare('SELECT * FROM deployments WHERE id = ?').get(id);
    if (d) {
      d.tags = d.tags ? JSON.parse(d.tags) : [];
    }
    return d;
  }

  createDeployment(deployment) {
    const stmt = this.db.prepare(`
      INSERT INTO deployments (name, source_path, target_path, ignore_patterns, tags, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const tagsStr = deployment.tags ? JSON.stringify(deployment.tags) : null;
    const info = stmt.run(
      deployment.name,
      deployment.source_path,
      deployment.target_path,
      deployment.ignore_patterns || '.git,.github,node_modules,dist,build,target,.DS_Store',
      tagsStr
    );
    return {
      id: info.lastInsertRowid,
      ...deployment,
      ignore_patterns: deployment.ignore_patterns || '.git,.github,node_modules,dist,build,target,.DS_Store'
    };
  }

  updateDeployment(id, deployment) {
    const stmt = this.db.prepare(`
      UPDATE deployments
      SET name = ?, source_path = ?, target_path = ?, ignore_patterns = ?, tags = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    const tagsStr = deployment.tags ? JSON.stringify(deployment.tags) : null;
    stmt.run(
      deployment.name,
      deployment.source_path,
      deployment.target_path,
      deployment.ignore_patterns || '.git,.github,node_modules,dist,build,target,.DS_Store',
      tagsStr,
      id
    );
    return { id, ...deployment };
  }

  deleteDeployment(id) {
    const stmt = this.db.prepare('DELETE FROM deployments WHERE id = ?');
    stmt.run(id);
    return { success: true };
  }

  // ========== IMPUTACIONES Y CÓDIGOS ==========
  getImputationCodes(projectId = null) {
    if (projectId) {
      return this.db.prepare(`
        SELECT ic.*, p.name as project_name, p.color as project_color
        FROM imputation_codes ic
        JOIN projects p ON ic.project_id = p.id
        WHERE ic.project_id = ?
        ORDER BY ic.code ASC
      `).all(projectId);
    }
    return this.db.prepare(`
      SELECT ic.*, p.name as project_name, p.color as project_color, p.parent_id
      FROM imputation_codes ic
      JOIN projects p ON ic.project_id = p.id
      ORDER BY p.name ASC, ic.code ASC
    `).all();
  }

  createImputationCode(codeData) {
    const stmt = this.db.prepare(`
      INSERT INTO imputation_codes (project_id, code, description, color, leave_type, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(
      codeData.project_id,
      codeData.code.trim(),
      codeData.description || '',
      codeData.color || null,
      codeData.leave_type || null
    );
    return { id: result.lastInsertRowid, ...codeData };
  }

  updateImputationCode(id, codeData) {
    const existing = this.db.prepare('SELECT * FROM imputation_codes WHERE id = ?').get(id);
    const leaveType = codeData.leave_type !== undefined ? codeData.leave_type : (existing?.leave_type || null);
    const stmt = this.db.prepare(`
      UPDATE imputation_codes
      SET project_id = COALESCE(?, project_id),
          code = ?,
          description = ?,
          color = ?,
          leave_type = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    stmt.run(
      codeData.project_id || null,
      codeData.code.trim(),
      codeData.description || '',
      codeData.color || null,
      leaveType,
      id
    );
    return { id, ...codeData, leave_type: leaveType };
  }

  deleteImputationCode(id) {
    const deleteTx = this.db.transaction(() => {
      this.db.prepare('DELETE FROM imputation_code_allocations WHERE code_id = ?').run(id);
      this.db.prepare('DELETE FROM imputation_codes WHERE id = ?').run(id);
    });
    deleteTx();
    return { success: true };
  }

  // Asegurar que exista el proyecto y códigos del sistema para Vacaciones y Ausencias
  ensureLeaveProjectAndCodes() {
    let project = this.db.prepare("SELECT * FROM projects WHERE name = 'Vacaciones y Ausencias' LIMIT 1").get();
    if (!project) {
      const res = this.db.prepare("INSERT INTO projects (name, color) VALUES ('Vacaciones y Ausencias', '#10b981')").run();
      project = { id: res.lastInsertRowid, name: 'Vacaciones y Ausencias', color: '#10b981' };
    }

    // Auto-marcar códigos existentes que no tengan leave_type según su código o descripción
    try {
      this.db.prepare(`
        UPDATE imputation_codes SET leave_type = 'vacation_current'
        WHERE (leave_type IS NULL OR leave_type = '') AND (code = 'VAC-ACT' OR description LIKE '%Año actual%' OR description LIKE '%actual%')
      `).run();
      this.db.prepare(`
        UPDATE imputation_codes SET leave_type = 'vacation_previous'
        WHERE (leave_type IS NULL OR leave_type = '') AND (code = 'VAC-ANT' OR description LIKE '%Año anterior%' OR description LIKE '%anterior%')
      `).run();
      this.db.prepare(`
        UPDATE imputation_codes SET leave_type = 'personal_hours'
        WHERE (leave_type IS NULL OR leave_type = '') AND (code = 'LIBRE-DISP' OR description LIKE '%Libre Disposición%' OR description LIKE '%Disposición%')
      `).run();
    } catch (e) {}

    const defaultCodes = [
      { code: 'VAC-ACT', description: 'Vacaciones (Año actual)', leave_type: 'vacation_current' },
      { code: 'VAC-ANT', description: 'Vacaciones (Año anterior - Caducan 31 Mar)', leave_type: 'vacation_previous' },
      { code: 'LIBRE-DISP', description: 'Horas Libre Disposición (Caducan 31 Dic)', leave_type: 'personal_hours' }
    ];

    for (const def of defaultCodes) {
      const existing = this.db.prepare(`
        SELECT * FROM imputation_codes
        WHERE leave_type = ? OR (project_id = ? AND code = ?)
        LIMIT 1
      `).get(def.leave_type, project.id, def.code);

      if (!existing) {
        this.db.prepare("INSERT INTO imputation_codes (project_id, code, description, leave_type) VALUES (?, ?, ?, ?)").run(
          project.id,
          def.code,
          def.description,
          def.leave_type
        );
      }
    }
  }

  getImputations(startDate, endDate) {
    return this.db.prepare(`
      SELECT i.*, p.name as project_name, p.color as project_color, p.parent_id,
             ic.code as code_name, ic.description as code_description, ic.leave_type as code_leave_type
      FROM imputations i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN imputation_codes ic ON i.code_id = ic.id
      WHERE i.date >= ? AND i.date <= ?
      ORDER BY i.date ASC, p.name ASC
    `).all(startDate, endDate);
  }

  getImputationsByMonth(year, month) {
    const padMonth = String(month).padStart(2, '0');
    const prefix = `${year}-${padMonth}`;
    return this.db.prepare(`
      SELECT i.*, p.name as project_name, p.color as project_color, p.parent_id,
             ic.code as code_name, ic.description as code_description, ic.leave_type as code_leave_type
      FROM imputations i
      JOIN projects p ON i.project_id = p.id
      LEFT JOIN imputation_codes ic ON i.code_id = ic.id
      WHERE i.date LIKE ?
      ORDER BY i.date ASC, p.name ASC
    `).all(`${prefix}%`);
  }

  saveImputation(data) {
    const stmt = this.db.prepare(`
      INSERT INTO imputations (project_id, code_id, date, hours, is_overtime, notes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `);
    const result = stmt.run(data.project_id, data.code_id || null, data.date, Number(data.hours || 0), data.is_overtime ? 1 : 0, data.notes || '');
    return { id: result.lastInsertRowid, ...data };
  }

  batchSaveDayImputations(date, entries) {
    const period = date.substring(0, 7);
    const saveTx = this.db.transaction(() => {
      // Códigos afectados antes de borrar
      const previousCodes = this.db.prepare(`
        SELECT DISTINCT project_id, code_id
        FROM imputations
        WHERE date = ? AND code_id IS NOT NULL
      `).all(date);

      this.db.prepare('DELETE FROM imputations WHERE date = ?').run(date);
      const insertStmt = this.db.prepare(`
        INSERT INTO imputations (project_id, code_id, date, hours, is_overtime, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);
      for (const entry of entries) {
        if (entry.hours && Number(entry.hours) > 0) {
          insertStmt.run(
            entry.project_id,
            entry.code_id || null,
            date,
            Number(entry.hours),
            entry.is_overtime ? 1 : 0,
            entry.notes || ''
          );
        }
      }

      // Sincronizar automáticamente imputation_code_allocations para los códigos afectados
      const affectedMap = new Map();
      previousCodes.forEach(c => affectedMap.set(c.code_id, c.project_id));
      entries.forEach(e => {
        if (e.code_id) affectedMap.set(e.code_id, e.project_id);
      });

      const upsertAllocStmt = this.db.prepare(`
        INSERT INTO imputation_code_allocations (project_id, code_id, period, hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(code_id, period) DO UPDATE SET
          hours = excluded.hours,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const [codeId, projectId] of affectedMap.entries()) {
        const res = this.db.prepare(`
          SELECT COALESCE(SUM(hours), 0) as total_hours
          FROM imputations
          WHERE date LIKE ? AND code_id = ?
        `).get(`${period}%`, codeId);
        const totalHours = res ? res.total_hours : 0;
        upsertAllocStmt.run(projectId, codeId, period, totalHours);
      }
    });
    saveTx();
    return { success: true, count: entries.length };
  }

  // ========== FESTIVOS ==========
  getHolidays(year = null) {
    if (year) {
      return this.db.prepare('SELECT date, name FROM holidays WHERE date LIKE ? ORDER BY date ASC').all(`${year}-%`);
    }
    return this.db.prepare('SELECT date, name FROM holidays ORDER BY date ASC').all();
  }

  setHoliday(date, name = '') {
    this.db.prepare(`
      INSERT INTO holidays (date, name, created_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(date) DO UPDATE SET name = excluded.name
    `).run(date, name || 'Festivo');
    return { success: true, date, name: name || 'Festivo' };
  }

  removeHoliday(date) {
    this.db.prepare('DELETE FROM holidays WHERE date = ?').run(date);
    return { success: true, date };
  }

  // ========== VACACIONES Y LIBRE DISPOSICIÓN ==========
  getLeaveCodes(year = null) {
    let quota = null;
    if (year) {
      quota = this.db.prepare('SELECT * FROM annual_leave_quotas WHERE year = ?').get(year);
    }

    // 1. Vacaciones año actual
    let vacAct = null;
    try {
      if (quota?.vacation_current_code_id) {
        vacAct = this.db.prepare('SELECT * FROM imputation_codes WHERE id = ?').get(quota.vacation_current_code_id);
      }
      if (!vacAct) {
        vacAct = this.db.prepare("SELECT * FROM imputation_codes WHERE leave_type = 'vacation_current' LIMIT 1").get();
      }
    } catch (e) {}
    if (!vacAct) {
      vacAct = this.db.prepare("SELECT * FROM imputation_codes WHERE code = 'VAC-ACT' OR description LIKE '%Año actual%' OR description LIKE '%actual%' LIMIT 1").get();
    }

    // 2. Vacaciones año anterior
    let vacAnt = null;
    try {
      if (quota?.vacation_previous_code_id) {
        vacAnt = this.db.prepare('SELECT * FROM imputation_codes WHERE id = ?').get(quota.vacation_previous_code_id);
      }
      if (!vacAnt) {
        vacAnt = this.db.prepare("SELECT * FROM imputation_codes WHERE leave_type = 'vacation_previous' LIMIT 1").get();
      }
    } catch (e) {}
    if (!vacAnt) {
      vacAnt = this.db.prepare("SELECT * FROM imputation_codes WHERE code = 'VAC-ANT' OR description LIKE '%Año anterior%' OR description LIKE '%anterior%' LIMIT 1").get();
    }

    // 3. Horas libre disposición
    let ld = null;
    try {
      if (quota?.personal_hours_code_id) {
        ld = this.db.prepare('SELECT * FROM imputation_codes WHERE id = ?').get(quota.personal_hours_code_id);
      }
      if (!ld) {
        ld = this.db.prepare("SELECT * FROM imputation_codes WHERE leave_type = 'personal_hours' LIMIT 1").get();
      }
    } catch (e) {}
    if (!ld) {
      ld = this.db.prepare("SELECT * FROM imputation_codes WHERE code = 'LIBRE-DISP' OR description LIKE '%Libre Disposición%' OR description LIKE '%Disposición%' LIMIT 1").get();
    }

    return {
      vacation_current: vacAct || null,
      vacation_previous: vacAnt || null,
      personal_hours: ld || null
    };
  }

  getAnnualLeaveQuota(year) {
    let row = this.db.prepare('SELECT * FROM annual_leave_quotas WHERE year = ?').get(year);
    if (!row) {
      // Auto-calcular si hubo vacaciones sobrantes del año anterior
      let carryover = 0;
      const prevRow = this.db.prepare('SELECT * FROM annual_leave_quotas WHERE year = ?').get(year - 1);
      if (prevRow) {
        const prevCodes = this.getLeaveCodes(year - 1);
        let prevConsumed = 0;
        if (prevCodes.vacation_current) {
          const prevImps = this.db.prepare(`
            SELECT hours, date FROM imputations
            WHERE code_id = ? AND date >= ? AND date <= ?
          `).all(prevCodes.vacation_current.id, `${year - 1}-01-01`, `${year - 1}-12-31`);
          for (const imp of prevImps) {
            const [y, m, d] = imp.date.split('-').map(Number);
            const dow = new Date(y, m - 1, d).getDay();
            const cap = (m === 7 || m === 8 || dow === 5) ? 7.0 : 9.0;
            prevConsumed += Math.min(1.0, imp.hours / cap);
          }
        }
        carryover = Math.max(0, Math.round((prevRow.vacation_days_current - prevConsumed) * 10) / 10);
      }
      this.db.prepare(`
        INSERT INTO annual_leave_quotas (year, vacation_days_current, vacation_days_previous, personal_hours, created_at, updated_at)
        VALUES (?, 22, ?, 14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(year, carryover);
      row = { year, vacation_days_current: 22, vacation_days_previous: carryover, personal_hours: 14 };
    }
    return row;
  }

  saveAnnualLeaveQuota(quota) {
    const stmt = this.db.prepare(`
      INSERT INTO annual_leave_quotas (
        year,
        vacation_days_current,
        vacation_days_previous,
        personal_hours,
        vacation_current_code_id,
        vacation_previous_code_id,
        personal_hours_code_id,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(year) DO UPDATE SET
        vacation_days_current = excluded.vacation_days_current,
        vacation_days_previous = excluded.vacation_days_previous,
        personal_hours = excluded.personal_hours,
        vacation_current_code_id = excluded.vacation_current_code_id,
        vacation_previous_code_id = excluded.vacation_previous_code_id,
        personal_hours_code_id = excluded.personal_hours_code_id,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(
      quota.year,
      Number(quota.vacation_days_current || 0),
      Number(quota.vacation_days_previous || 0),
      Number(quota.personal_hours || 0),
      quota.vacation_current_code_id ? Number(quota.vacation_current_code_id) : null,
      quota.vacation_previous_code_id ? Number(quota.vacation_previous_code_id) : null,
      quota.personal_hours_code_id ? Number(quota.personal_hours_code_id) : null
    );

    // Sincronizar leave_type en imputation_codes
    if (quota.vacation_current_code_id) {
      this.db.prepare("UPDATE imputation_codes SET leave_type = 'vacation_current' WHERE id = ?").run(quota.vacation_current_code_id);
    }
    if (quota.vacation_previous_code_id) {
      this.db.prepare("UPDATE imputation_codes SET leave_type = 'vacation_previous' WHERE id = ?").run(quota.vacation_previous_code_id);
    }
    if (quota.personal_hours_code_id) {
      this.db.prepare("UPDATE imputation_codes SET leave_type = 'personal_hours' WHERE id = ?").run(quota.personal_hours_code_id);
    }

    return { success: true };
  }

  getAnnualLeaveBalance(year) {
    const quota = this.getAnnualLeaveQuota(year);
    const leaveCodes = this.getLeaveCodes(year);

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const mar31 = `${year}-03-31`;

    // 1. Vacaciones año anterior consumidas en año year (caducan el 31 de marzo)
    let vacPrevConsumed = 0;
    if (leaveCodes.vacation_previous) {
      const imps = this.db.prepare(`
        SELECT hours, date FROM imputations
        WHERE code_id = ? AND date >= ? AND date <= ?
      `).all(leaveCodes.vacation_previous.id, yearStart, yearEnd);
      for (const imp of imps) {
        const [y, m, d] = imp.date.split('-').map(Number);
        const dow = new Date(y, m - 1, d).getDay();
        const cap = (m === 7 || m === 8 || dow === 5) ? 7.0 : 9.0;
        vacPrevConsumed += Math.min(1.0, imp.hours / cap);
      }
    }

    // 2. Vacaciones año actual consumidas en año year
    let vacCurrConsumed = 0;
    if (leaveCodes.vacation_current) {
      const imps = this.db.prepare(`
        SELECT hours, date FROM imputations
        WHERE code_id = ? AND date >= ? AND date <= ?
      `).all(leaveCodes.vacation_current.id, yearStart, yearEnd);
      for (const imp of imps) {
        const [y, m, d] = imp.date.split('-').map(Number);
        const dow = new Date(y, m - 1, d).getDay();
        const cap = (m === 7 || m === 8 || dow === 5) ? 7.0 : 9.0;
        vacCurrConsumed += Math.min(1.0, imp.hours / cap);
      }
    }

    // 3. Horas de Libre disposición consumidas en año year
    let personalConsumedHours = 0;
    if (leaveCodes.personal_hours) {
      const imps = this.db.prepare(`
        SELECT SUM(hours) as total FROM imputations
        WHERE code_id = ? AND date >= ? AND date <= ?
      `).get(leaveCodes.personal_hours.id, yearStart, yearEnd);
      personalConsumedHours = imps?.total || 0;
    }

    const todayStr = new Date().toISOString().substring(0, 10);
    const isPrevExpired = todayStr > mar31;
    const isPersonalExpired = todayStr > yearEnd;

    const vacPrevRemaining = Math.max(0, Math.round((quota.vacation_days_previous - vacPrevConsumed) * 10) / 10);
    const vacCurrRemaining = Math.max(0, Math.round((quota.vacation_days_current - vacCurrConsumed) * 10) / 10);
    const personalRemaining = Math.max(0, Math.round((quota.personal_hours - personalConsumedHours) * 10) / 10);

    return {
      year,
      quota,
      codes: {
        vacation_previous: leaveCodes.vacation_previous ? { id: leaveCodes.vacation_previous.id, code: leaveCodes.vacation_previous.code, description: leaveCodes.vacation_previous.description } : null,
        vacation_current: leaveCodes.vacation_current ? { id: leaveCodes.vacation_current.id, code: leaveCodes.vacation_current.code, description: leaveCodes.vacation_current.description } : null,
        personal_hours: leaveCodes.personal_hours ? { id: leaveCodes.personal_hours.id, code: leaveCodes.personal_hours.code, description: leaveCodes.personal_hours.description } : null
      },
      consumed: {
        vacation_previous: Math.round(vacPrevConsumed * 10) / 10,
        vacation_current: Math.round(vacCurrConsumed * 10) / 10,
        personal_hours: Math.round(personalConsumedHours * 10) / 10
      },
      remaining: {
        vacation_previous: vacPrevRemaining,
        vacation_current: vacCurrRemaining,
        personal_hours: personalRemaining
      },
      is_previous_expired: isPrevExpired,
      is_personal_expired: isPersonalExpired
    };
  }

  deleteDayImputations(date) {
    const period = date.substring(0, 7);
    const deleteTx = this.db.transaction(() => {
      const affectedCodes = this.db.prepare(`
        SELECT DISTINCT project_id, code_id
        FROM imputations
        WHERE date = ? AND code_id IS NOT NULL
      `).all(date);

      this.db.prepare('DELETE FROM imputations WHERE date = ?').run(date);

      const updateAllocStmt = this.db.prepare(`
        INSERT INTO imputation_code_allocations (project_id, code_id, period, hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(code_id, period) DO UPDATE SET
          hours = excluded.hours,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const c of affectedCodes) {
        const res = this.db.prepare(`
          SELECT COALESCE(SUM(hours), 0) as total_hours
          FROM imputations
          WHERE date LIKE ? AND code_id = ?
        `).get(`${period}%`, c.code_id);
        const totalHours = res ? res.total_hours : 0;
        updateAllocStmt.run(c.project_id, c.code_id, period, totalHours);
      }
    });
    deleteTx();
    return { success: true };
  }

  getCodeAllocations(period, projectId = null) {
    if (projectId) {
      return this.db.prepare(`
        SELECT ica.*, ic.code as code_name, ic.description as code_description
        FROM imputation_code_allocations ica
        JOIN imputation_codes ic ON ica.code_id = ic.id
        WHERE ica.period = ? AND ica.project_id = ?
        ORDER BY ic.code ASC
      `).all(period, projectId);
    }
    return this.db.prepare(`
      SELECT ica.*, ic.code as code_name, ic.description as code_description, p.name as project_name, p.color as project_color
      FROM imputation_code_allocations ica
      JOIN imputation_codes ic ON ica.code_id = ic.id
      JOIN projects p ON ica.project_id = p.id
      WHERE ica.period = ?
      ORDER BY p.name ASC, ic.code ASC
    `).all(period);
  }

  saveCodeAllocation(data) {
    const stmt = this.db.prepare(`
      INSERT INTO imputation_code_allocations (project_id, code_id, period, hours, created_at, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(code_id, period) DO UPDATE SET
        hours = excluded.hours,
        updated_at = CURRENT_TIMESTAMP
    `);
    stmt.run(data.project_id, data.code_id, data.period, Number(data.hours || 0));
    return { success: true };
  }

  batchSaveCodeAllocations(period, allocations) {
    const saveTx = this.db.transaction(() => {
      const upsertStmt = this.db.prepare(`
        INSERT INTO imputation_code_allocations (project_id, code_id, period, hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(code_id, period) DO UPDATE SET
          hours = excluded.hours,
          updated_at = CURRENT_TIMESTAMP
      `);
      for (const item of allocations) {
        const h = Number(item.hours || 0);
        upsertStmt.run(item.project_id, item.code_id, period, h);
      }
    });
    saveTx();
    return { success: true };
  }

  clearProjectMonthImputations(projectId, period) {
    const clearTx = this.db.transaction(() => {
      this.db.prepare(`
        DELETE FROM imputations
        WHERE project_id = ? AND date LIKE ?
      `).run(projectId, `${period}%`);

      this.db.prepare(`
        DELETE FROM imputation_code_allocations
        WHERE project_id = ? AND period = ?
      `).run(projectId, period);
    });
    clearTx();
    return { success: true };
  }

  autoAdjustToCalendar({ year, month, items, mode = 'fill_gaps' }) {
    const padMonth = String(month).padStart(2, '0');
    const period = `${year}-${padMonth}`;
    const daysInMonth = new Date(year, month, 0).getDate();

    // 1. Obtener festivos del mes
    const holidays = this.db.prepare('SELECT date FROM holidays WHERE date LIKE ?').all(`${period}%`);
    const holidaySet = new Set(holidays.map(h => h.date));

    const isSummerMonth = (Number(month) === 7 || Number(month) === 8);

    const adjustTx = this.db.transaction(() => {
      // Si el modo es 'replace', eliminar imputaciones existentes de estos códigos en este mes
      if (mode === 'replace') {
        const codeIds = items.map(i => i.code_id).filter(Boolean);
        if (codeIds.length > 0) {
          const placeholders = codeIds.map(() => '?').join(',');
          this.db.prepare(`
            DELETE FROM imputations
            WHERE date LIKE ? AND code_id IN (${placeholders})
          `).run(`${period}%`, ...codeIds);
        }
      }

      // Obtener todas las imputaciones actuales del mes
      const monthImputations = this.db.prepare(`
        SELECT * FROM imputations
        WHERE date LIKE ?
        ORDER BY date ASC
      `).all(`${period}%`);

      const dayRegularHoursMap = {};
      const dayEntriesMap = {};

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = `${period}-${String(day).padStart(2, '0')}`;
        dayRegularHoursMap[dayStr] = 0;
        dayEntriesMap[dayStr] = [];
      }

      monthImputations.forEach(imp => {
        if (dayRegularHoursMap[imp.date] !== undefined) {
          if (!imp.is_overtime) {
            dayRegularHoursMap[imp.date] += Number(imp.hours || 0);
          }
          dayEntriesMap[imp.date].push(imp);
        }
      });

      // Mapear horas actuales en calendario por código
      const codeCalendarHoursMap = {};
      monthImputations.forEach(imp => {
        if (imp.code_id) {
          codeCalendarHoursMap[imp.code_id] = (codeCalendarHoursMap[imp.code_id] || 0) + Number(imp.hours || 0);
        }
      });

      const insertStmt = this.db.prepare(`
        INSERT INTO imputations (project_id, code_id, date, hours, is_overtime, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const updateStmt = this.db.prepare(`
        UPDATE imputations
        SET hours = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      const upsertAllocStmt = this.db.prepare(`
        INSERT INTO imputation_code_allocations (project_id, code_id, period, hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(code_id, period) DO UPDATE SET
          hours = excluded.hours,
          updated_at = CURRENT_TIMESTAMP
      `);

      let totalAddedHours = 0;
      const daysModified = new Set();

      for (const item of items) {
        const targetHours = Number(item.target_hours || 0);
        if (targetHours <= 0) continue;

        const currentHours = codeCalendarHoursMap[item.code_id] || 0;
        let needed = Math.max(0, Math.round((targetHours - currentHours) * 100) / 100);

        if (needed <= 0) {
          // Ya están cubiertas en el calendario, solo asegurar que la cuota esté guardada
          upsertAllocStmt.run(item.project_id, item.code_id, period, targetHours);
          continue;
        }

        // Paso 1: Si hay imputaciones del mismo proyecto sin código asignado en días laborables, asignarles este código
        for (let day = 1; day <= daysInMonth; day++) {
          if (needed <= 0) break;
          const dayStr = `${period}-${String(day).padStart(2, '0')}`;
          const unassignedEntries = dayEntriesMap[dayStr].filter(e => e.project_id === item.project_id && !e.code_id && !e.is_overtime);
          for (const entry of unassignedEntries) {
            if (needed <= 0) break;
            const canAssign = Math.min(entry.hours, needed);
            if (canAssign >= entry.hours) {
              this.db.prepare('UPDATE imputations SET code_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(item.code_id, entry.id);
              entry.code_id = item.code_id;
              needed = Math.round((needed - canAssign) * 100) / 100;
              codeCalendarHoursMap[item.code_id] = (codeCalendarHoursMap[item.code_id] || 0) + canAssign;
              daysModified.add(dayStr);
            } else {
              const remainHours = Math.round((entry.hours - canAssign) * 100) / 100;
              this.db.prepare('UPDATE imputations SET hours = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(remainHours, entry.id);
              entry.hours = remainHours;
              const res = insertStmt.run(item.project_id, item.code_id, dayStr, canAssign, 'Autoajustado');
              dayEntriesMap[dayStr].push({
                id: res.lastInsertRowid,
                project_id: item.project_id,
                code_id: item.code_id,
                date: dayStr,
                hours: canAssign,
                is_overtime: 0
              });
              needed = Math.round((needed - canAssign) * 100) / 100;
              codeCalendarHoursMap[item.code_id] = (codeCalendarHoursMap[item.code_id] || 0) + canAssign;
              daysModified.add(dayStr);
            }
          }
        }

        // Paso 2: Recorrer los días laborables del mes y llenar los huecos disponibles
        for (let day = 1; day <= daysInMonth; day++) {
          if (needed <= 0) break;

          const dayStr = `${period}-${String(day).padStart(2, '0')}`;
          const dow = new Date(year, month - 1, day).getDay(); // 0 Dom, 6 Sab

          // Saltar fines de semana y festivos
          if (dow === 0 || dow === 6 || holidaySet.has(dayStr)) {
            continue;
          }

          // Capacidad máxima de la jornada ordinaria (7h en verano o viernes, 9h L-J)
          const maxCapacity = (isSummerMonth || dow === 5) ? 7.0 : 9.0;
          const currentOccupied = dayRegularHoursMap[dayStr] || 0;
          const availableGap = Math.max(0, Math.round((maxCapacity - currentOccupied) * 100) / 100);

          if (availableGap > 0) {
            const toAdd = Math.min(availableGap, needed);

            // Verificar si ya existe una imputación para este código en este día
            const existingEntry = dayEntriesMap[dayStr].find(e => e.code_id === item.code_id && !e.is_overtime);
            if (existingEntry) {
              const newHours = Math.round((existingEntry.hours + toAdd) * 100) / 100;
              updateStmt.run(newHours, existingEntry.id);
              existingEntry.hours = newHours;
            } else {
              const res = insertStmt.run(item.project_id, item.code_id, dayStr, toAdd, 'Autoajustado');
              dayEntriesMap[dayStr].push({
                id: res.lastInsertRowid,
                project_id: item.project_id,
                code_id: item.code_id,
                date: dayStr,
                hours: toAdd,
                is_overtime: 0
              });
            }

            dayRegularHoursMap[dayStr] = Math.round((currentOccupied + toAdd) * 100) / 100;
            needed = Math.round((needed - toAdd) * 100) / 100;
            totalAddedHours += toAdd;
            daysModified.add(dayStr);
          }
        }

        upsertAllocStmt.run(item.project_id, item.code_id, period, targetHours);
      }

      return {
        success: true,
        totalAddedHours: Math.round(totalAddedHours * 100) / 100,
        daysModifiedCount: daysModified.size
      };
    });

    return adjustTx();
  }

  fillMonthRemainingGaps({ year, month, projectId, codeId, fromDay = 1 }) {
    const padMonth = String(month).padStart(2, '0');
    const period = `${year}-${padMonth}`;
    const daysInMonth = new Date(year, month, 0).getDate();

    // 1. Festivos del mes
    const holidays = this.db.prepare('SELECT date FROM holidays WHERE date LIKE ?').all(`${period}%`);
    const holidaySet = new Set(holidays.map(h => h.date));
    const isSummerMonth = (Number(month) === 7 || Number(month) === 8);

    const fillTx = this.db.transaction(() => {
      // Imputaciones actuales del mes
      const monthImputations = this.db.prepare(`
        SELECT * FROM imputations
        WHERE date LIKE ?
        ORDER BY date ASC
      `).all(`${period}%`);

      const dayRegularHoursMap = {};
      const dayEntriesMap = {};

      for (let day = 1; day <= daysInMonth; day++) {
        const dayStr = `${period}-${String(day).padStart(2, '0')}`;
        dayRegularHoursMap[dayStr] = 0;
        dayEntriesMap[dayStr] = [];
      }

      monthImputations.forEach(imp => {
        if (dayRegularHoursMap[imp.date] !== undefined) {
          if (!imp.is_overtime) {
            dayRegularHoursMap[imp.date] += Number(imp.hours || 0);
          }
          dayEntriesMap[imp.date].push(imp);
        }
      });

      const insertStmt = this.db.prepare(`
        INSERT INTO imputations (project_id, code_id, date, hours, is_overtime, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, 'Carga mes restante', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `);

      const updateStmt = this.db.prepare(`
        UPDATE imputations
        SET hours = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `);

      let totalAddedHours = 0;
      let daysFilledCount = 0;

      const startDay = Math.max(1, Math.min(daysInMonth, parseInt(fromDay, 10) || 1));

      for (let day = startDay; day <= daysInMonth; day++) {
        const dayStr = `${period}-${String(day).padStart(2, '0')}`;
        const dow = new Date(year, month - 1, day).getDay(); // 0 Dom, 6 Sab

        // Saltar fines de semana y festivos
        if (dow === 0 || dow === 6 || holidaySet.has(dayStr)) {
          continue;
        }

        // Capacidad máxima de la jornada ordinaria (7h en verano o viernes, 9h L-J)
        const maxCapacity = (isSummerMonth || dow === 5) ? 7.0 : 9.0;
        const currentOccupied = dayRegularHoursMap[dayStr] || 0;
        const availableGap = Math.max(0, Math.round((maxCapacity - currentOccupied) * 100) / 100);

        if (availableGap > 0) {
          const existingEntry = dayEntriesMap[dayStr].find(e => e.code_id === codeId && !e.is_overtime);
          if (existingEntry) {
            const newHours = Math.round((existingEntry.hours + availableGap) * 100) / 100;
            updateStmt.run(newHours, existingEntry.id);
            existingEntry.hours = newHours;
          } else {
            const res = insertStmt.run(projectId, codeId, dayStr, availableGap);
            dayEntriesMap[dayStr].push({
              id: res.lastInsertRowid,
              project_id: projectId,
              code_id: codeId,
              date: dayStr,
              hours: availableGap,
              is_overtime: 0
            });
          }

          dayRegularHoursMap[dayStr] = Math.round((currentOccupied + availableGap) * 100) / 100;
          totalAddedHours += availableGap;
          daysFilledCount++;
        }
      }

      // Sincronizar automáticamente imputation_code_allocations para este periodo
      const codeSums = this.db.prepare(`
        SELECT project_id, code_id, SUM(hours) as total_hours
        FROM imputations
        WHERE date LIKE ? AND code_id IS NOT NULL
        GROUP BY project_id, code_id
      `).all(`${period}%`);

      const upsertAllocStmt = this.db.prepare(`
        INSERT INTO imputation_code_allocations (project_id, code_id, period, hours, created_at, updated_at)
        VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(code_id, period) DO UPDATE SET
          hours = excluded.hours,
          updated_at = CURRENT_TIMESTAMP
      `);

      for (const cs of codeSums) {
        upsertAllocStmt.run(cs.project_id, cs.code_id, period, cs.total_hours);
      }

      return {
        success: true,
        totalAddedHours: Math.round(totalAddedHours * 100) / 100,
        daysFilledCount
      };
    });

    return fillTx();
  }
}

module.exports = TaskDatabase;

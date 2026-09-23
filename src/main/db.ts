import { DatabaseSync } from 'node:sqlite'
import { basename } from 'node:path'
import type { LogEvent, Project, Settings, Task } from '@shared/types'

const MIGRATIONS = [
  `CREATE TABLE projects (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     path TEXT NOT NULL UNIQUE,
     name TEXT NOT NULL,
     last_opened INTEGER NOT NULL
   );
   CREATE TABLE tasks (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
     status TEXT NOT NULL,
     data TEXT NOT NULL
   );
   CREATE INDEX tasks_project ON tasks(project_id);
   CREATE TABLE events (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
     data TEXT NOT NULL
   );
   CREATE INDEX events_task ON events(task_id);
   CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`
]

export const DEFAULT_SETTINGS: Settings = {
  lang: 'ru',
  theme: 'system',
  maxIterations: 3,
  defaultModel: '',
  autoResume: true,
  waitForReview: true,
  claudePath: '',
  tourSeen: { welcome: false, board: false },
  autoCheckUpdates: true
}

export class Db {
  private db: DatabaseSync

  constructor(file: string) {
    this.db = new DatabaseSync(file)
    this.db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;')
    this.migrate()
  }

  private migrate(): void {
    const row = this.db.prepare('PRAGMA user_version').get() as { user_version: number }
    for (let v = row.user_version; v < MIGRATIONS.length; v++) {
      this.db.exec('BEGIN')
      this.db.exec(MIGRATIONS[v])
      this.db.exec(`PRAGMA user_version = ${v + 1}`)
      this.db.exec('COMMIT')
    }
  }

  close(): void {
    this.db.close()
  }

  // ---- projects ----
  listProjects(): Project[] {
    return (this.db.prepare('SELECT * FROM projects ORDER BY last_opened DESC').all() as any[]).map(rowToProject)
  }

  getProject(id: number): Project | undefined {
    const r = this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id)
    return r ? rowToProject(r) : undefined
  }

  upsertProject(path: string): Project {
    const now = Date.now()
    this.db
      .prepare(
        `INSERT INTO projects (path, name, last_opened) VALUES (?, ?, ?)
         ON CONFLICT(path) DO UPDATE SET last_opened = excluded.last_opened`
      )
      .run(path, basename(path), now)
    return rowToProject(this.db.prepare('SELECT * FROM projects WHERE path = ?').get(path))
  }

  removeProject(id: number): void {
    this.db.prepare('DELETE FROM projects WHERE id = ?').run(id)
  }

  // ---- tasks ----
  listTasks(projectId?: number): Task[] {
    const rows =
      projectId === undefined
        ? this.db.prepare('SELECT data FROM tasks').all()
        : this.db.prepare('SELECT data FROM tasks WHERE project_id = ?').all(projectId)
    return (rows as { data: string }[]).map((r) => normalizeTask(JSON.parse(r.data)))
  }

  getTask(id: number): Task | undefined {
    const r = this.db.prepare('SELECT data FROM tasks WHERE id = ?').get(id) as { data: string } | undefined
    return r ? (normalizeTask(JSON.parse(r.data))) : undefined
  }

  insertTask(t: Omit<Task, 'id'>): Task {
    const res = this.db
      .prepare('INSERT INTO tasks (project_id, status, data) VALUES (?, ?, ?)')
      .run(t.projectId, t.status, '{}')
    const task = { ...t, id: Number(res.lastInsertRowid) } as Task
    this.saveTask(task)
    return task
  }

  saveTask(t: Task): void {
    t.updatedAt = Date.now()
    this.db.prepare('UPDATE tasks SET status = ?, data = ? WHERE id = ?').run(t.status, JSON.stringify(t), t.id)
  }

  deleteTask(id: number): void {
    this.db.prepare('DELETE FROM tasks WHERE id = ?').run(id)
  }

  nextSeq(projectId: number): number {
    const tasks = this.listTasks(projectId)
    return tasks.reduce((m, t) => Math.max(m, t.seq), 0) + 1
  }

  // ---- events ----
  addEvent(e: LogEvent): LogEvent {
    const res = this.db.prepare('INSERT INTO events (task_id, data) VALUES (?, ?)').run(e.taskId, JSON.stringify(e))
    return { ...e, id: Number(res.lastInsertRowid) }
  }

  listEvents(taskId: number, limit = 2000): LogEvent[] {
    const rows = this.db
      .prepare('SELECT id, data FROM (SELECT id, data FROM events WHERE task_id = ? ORDER BY id DESC LIMIT ?) ORDER BY id')
      .all(taskId, limit) as { id: number; data: string }[]
    return rows.map((r) => ({ ...(JSON.parse(r.data) as LogEvent), id: r.id }))
  }

  // ---- settings ----
  getSettings(): Settings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const s: Record<string, unknown> = { ...DEFAULT_SETTINGS }
    for (const r of rows) s[r.key] = JSON.parse(r.value)
    return s as unknown as Settings
  }

  setSettings(patch: Partial<Settings>): Settings {
    const stmt = this.db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    )
    for (const [k, v] of Object.entries(patch)) stmt.run(k, JSON.stringify(v))
    return this.getSettings()
  }
}

/** Fills fields added after a task was stored. */
function normalizeTask(t: Task): Task {
  t.discuss ??= false
  t.discussion ??= []
  return t
}

function rowToProject(r: any): Project {
  return { id: r.id, path: r.path, name: r.name, lastOpened: r.last_opened }
}

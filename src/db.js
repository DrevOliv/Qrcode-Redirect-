import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || path.resolve('data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'qrcodes.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    target_url TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS daily_scans (
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    day        TEXT NOT NULL,
    count      INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (project_id, day)
  );
`);

const stmts = {
  list: db.prepare(`
    SELECT p.*, COALESCE(SUM(s.count), 0) AS total_scans
    FROM projects p
    LEFT JOIN daily_scans s ON s.project_id = p.id
    GROUP BY p.id
    ORDER BY p.created_at DESC
  `),
  get: db.prepare('SELECT * FROM projects WHERE id = ?'),
  create: db.prepare('INSERT INTO projects (id, name, target_url) VALUES (?, ?, ?)'),
  update: db.prepare(`UPDATE projects SET name = ?, target_url = ?, updated_at = datetime('now') WHERE id = ?`),
  remove: db.prepare('DELETE FROM projects WHERE id = ?'),
  recordScan: db.prepare(`
    INSERT INTO daily_scans (project_id, day, count) VALUES (?, ?, 1)
    ON CONFLICT (project_id, day) DO UPDATE SET count = count + 1
  `),
  total: db.prepare('SELECT COALESCE(SUM(count), 0) AS total FROM daily_scans WHERE project_id = ?'),
  daily: db.prepare('SELECT day, count FROM daily_scans WHERE project_id = ? AND day >= ? ORDER BY day'),
};

export const listProjects = () => stmts.list.all();
export const getProject = (id) => stmts.get.get(id);
export const createProject = (id, name, targetUrl) => stmts.create.run(id, name, targetUrl);
export const updateProject = (id, name, targetUrl) => stmts.update.run(name, targetUrl, id);
export const deleteProject = (id) => stmts.remove.run(id);

export const today = () => new Date().toISOString().slice(0, 10);
export const recordScan = (id) => stmts.recordScan.run(id, today());

export function getStats(id, days = 30) {
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - (days - 1));
  const rows = stmts.daily.all(id, start.toISOString().slice(0, 10));
  const byDay = new Map(rows.map((r) => [r.day, r.count]));

  const daily = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    const day = d.toISOString().slice(0, 10);
    daily.push({ day, count: byDay.get(day) || 0 });
  }
  return { total: stmts.total.get(id).total, today: byDay.get(today()) || 0, daily };
}

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'ledger.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Migration: add remote_url column to existing databases
try { db.exec(`ALTER TABLE projects ADD COLUMN remote_url TEXT DEFAULT ''`); } catch (_) {}

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    path TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS commits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    commit_date DATETIME,
    branch TEXT,
    commit_hash TEXT,
    raw_output TEXT,
    description TEXT,
    notes TEXT DEFAULT '',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

module.exports = db;

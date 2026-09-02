// =============================================================================
//  db.js — SQLite database (better-sqlite3), schema + small helpers
// =============================================================================
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const config = require('./config');

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(path.join(config.dataDir, 'uploads'), { recursive: true });

const db = new Database(path.join(config.dataDir, 'dashboard.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin','user')),
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Reoon API accounts (one row per account, same as the Google Sheet tab names)
CREATE TABLE IF NOT EXISTS api_accounts (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL UNIQUE,
  api_key    TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Key/value settings (OpenAI key, model, ...)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Cached credit balances per account (replaces CacheService/PropertiesService)
CREATE TABLE IF NOT EXISTS credit_cache (
  account_id INTEGER PRIMARY KEY REFERENCES api_accounts(id) ON DELETE CASCADE,
  daily      INTEGER,
  instant    INTEGER,
  ok         INTEGER NOT NULL DEFAULT 1,
  fetched_at TEXT NOT NULL
);

-- Uploaded lead lists (each list = one "sheet tab")
CREATE TABLE IF NOT EXISTS lists (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name           TEXT NOT NULL,
  original_name  TEXT,
  kind           TEXT NOT NULL DEFAULT 'upload',
  source_list_id INTEGER,
  columns        TEXT NOT NULL,            -- JSON array of header names
  row_count      INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_lists_user ON lists(user_id);

CREATE TABLE IF NOT EXISTS list_rows (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  list_id   INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  row_index INTEGER NOT NULL,
  data      TEXT NOT NULL                  -- JSON array of cell values (same order as columns)
);
CREATE INDEX IF NOT EXISTS idx_rows_list ON list_rows(list_id, row_index);

-- Activity log (= the "info" tab) — every automation run by every user
CREATE TABLE IF NOT EXISTS activity (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  user_email  TEXT NOT NULL,
  fn          TEXT NOT NULL,
  list_id     INTEGER,
  list_name   TEXT,
  task_id     TEXT,
  api_account TEXT,
  task_name   TEXT,
  status      TEXT NOT NULL DEFAULT 'submitted',
  total       INTEGER,
  progress    TEXT NOT NULL DEFAULT '0%',
  action      TEXT NOT NULL DEFAULT 'pending',
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_task ON activity(task_id);

-- Pending Reoon bulk tasks (lightweight metadata only, like LLC_PENDING_TASKS)
CREATE TABLE IF NOT EXISTS pending_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  list_id     INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  account_id  INTEGER REFERENCES api_accounts(id) ON DELETE SET NULL,
  account     TEXT NOT NULL,
  task_id     TEXT NOT NULL UNIQUE,
  fn          TEXT NOT NULL,
  email_col   INTEGER NOT NULL,
  status_col  INTEGER NOT NULL,
  date_col    INTEGER,
  total       INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_status TEXT,
  last_check  TEXT
);

-- Company name cleaning jobs (background, batch of 100 rows)
CREATE TABLE IF NOT EXISTS clean_jobs (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  list_id            INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  source_list_id     INTEGER,
  company_col        INTEGER NOT NULL,
  clean_col          INTEGER NOT NULL,
  website_col        INTEGER,
  last_processed_row INTEGER NOT NULL DEFAULT -1,
  status             TEXT NOT NULL DEFAULT 'running',  -- running | completed | stopped | error
  processed          INTEGER NOT NULL DEFAULT 0,
  error              TEXT,
  activity_id        INTEGER,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
`);

// ── Settings helpers ─────────────────────────────────────────────────────────
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');

function getSetting(key, def) {
  const row = getSettingStmt.get(key);
  return row && row.value !== null && row.value !== undefined ? row.value : def;
}
function setSetting(key, value) {
  setSettingStmt.run(key, value === undefined || value === null ? '' : String(value));
}

// ── Seed: first admin + API keys from .env ───────────────────────────────────
function seed() {
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    if (config.admin.email && config.admin.password) {
      db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)')
        .run(config.admin.email, config.admin.name, bcrypt.hashSync(config.admin.password, 10), 'admin');
      console.log('👤 First admin created: ' + config.admin.email);
    } else {
      console.warn('⚠️  No users exist and ADMIN_EMAIL / ADMIN_PASSWORD are not set in .env.');
      console.warn('    Set them and restart, or run: npm run create-admin');
    }
  }

  const insertAcc = db.prepare('INSERT OR IGNORE INTO api_accounts (name, api_key, sort_order) VALUES (?, ?, ?)');
  config.seedAccounts.forEach((a, i) => insertAcc.run(a.name, a.apiKey, i));

  if (config.openai.defaultKey && !getSetting('openai_api_key', '')) setSetting('openai_api_key', config.openai.defaultKey);
  if (!getSetting('openai_model', '')) setSetting('openai_model', config.openai.defaultModel);
}
seed();

module.exports = { db, getSetting, setSetting };

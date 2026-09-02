// =============================================================================
//  lists.js — Lead lists ("sheet tabs") stored in SQLite
// =============================================================================
const { db } = require('../db');

const EMAIL_HEADERS   = ['email'];
const STATUS_HEADERS  = ['verification status', 'status'];
const DATE_HEADERS    = ['verification date'];
const PENDING_STATUS  = 'Pending...';

function norm(h) { return h === null || h === undefined ? '' : String(h).toLowerCase().trim(); }

/** Case-insensitive header lookup. Returns 0-based index or -1. (Last match wins, like the Apps Script loops.) */
function findHeader(columns, candidates) {
  const cands = candidates.map(norm);
  let idx = -1;
  columns.forEach((c, i) => { if (cands.indexOf(norm(c)) !== -1) idx = i; });
  return idx;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
}

// ── CRUD ─────────────────────────────────────────────────────────────────────
const insertList = db.prepare(`INSERT INTO lists (user_id, name, original_name, kind, source_list_id, columns, row_count)
                               VALUES (?, ?, ?, ?, ?, ?, ?)`);
const insertRow  = db.prepare('INSERT INTO list_rows (list_id, row_index, data) VALUES (?, ?, ?)');

const createList = db.transaction(({ userId, name, originalName, kind, sourceListId, columns, rows }) => {
  const info = insertList.run(userId, name, originalName || null, kind || 'upload', sourceListId || null,
    JSON.stringify(columns), rows.length);
  const listId = info.lastInsertRowid;
  rows.forEach((r, i) => {
    const padded = columns.map((_, c) => (r[c] === undefined || r[c] === null ? '' : r[c]));
    insertRow.run(listId, i, JSON.stringify(padded));
  });
  return Number(listId);
});

function getList(id) {
  const l = db.prepare('SELECT l.*, u.email AS owner_email FROM lists l LEFT JOIN users u ON u.id = l.user_id WHERE l.id = ?').get(id);
  if (!l) return null;
  l.columns = JSON.parse(l.columns);
  return l;
}

function getListByName(userId, name) {
  const l = db.prepare('SELECT * FROM lists WHERE user_id = ? AND name = ?').get(userId, name);
  if (l) l.columns = JSON.parse(l.columns);
  return l;
}

function listsForUser(user) {
  const sql = `SELECT l.id, l.name, l.original_name, l.kind, l.source_list_id, l.columns, l.row_count, l.created_at, l.updated_at,
                      l.user_id, u.email AS owner_email
               FROM lists l LEFT JOIN users u ON u.id = l.user_id
               ${user.role === 'admin' ? '' : 'WHERE l.user_id = ?'}
               ORDER BY l.updated_at DESC, l.id DESC`;
  const rows = user.role === 'admin' ? db.prepare(sql).all() : db.prepare(sql).all(user.id);
  return rows.map((l) => Object.assign(l, { columns: JSON.parse(l.columns) }));
}

/** Rows as [{ id, row_index, data:[...] }] ordered by row_index. */
function getRows(listId) {
  return db.prepare('SELECT id, row_index, data FROM list_rows WHERE list_id = ? ORDER BY row_index').all(listId)
    .map((r) => ({ id: r.id, row_index: r.row_index, data: JSON.parse(r.data) }));
}

function getRowsPage(listId, offset, limit) {
  return db.prepare('SELECT id, row_index, data FROM list_rows WHERE list_id = ? ORDER BY row_index LIMIT ? OFFSET ?')
    .all(listId, limit, offset).map((r) => ({ id: r.id, row_index: r.row_index, data: JSON.parse(r.data) }));
}

const touch = db.prepare("UPDATE lists SET updated_at = datetime('now') WHERE id = ?");

/** Inserts a new column after `afterIndex` (0-based). Returns new column index. Pads every row. */
const addColumn = db.transaction((listId, afterIndex, header) => {
  const list = getList(listId);
  const newIdx = afterIndex + 1;
  const columns = list.columns.slice();
  columns.splice(newIdx, 0, header);
  db.prepare('UPDATE lists SET columns = ? WHERE id = ?').run(JSON.stringify(columns), listId);
  const upd = db.prepare('UPDATE list_rows SET data = ? WHERE id = ?');
  for (const r of getRows(listId)) {
    const d = r.data.slice();
    d.splice(newIdx, 0, '');
    upd.run(JSON.stringify(d), r.id);
  }
  touch.run(listId);
  return newIdx;
});

/** updates: [{ rowId, cells: { [colIndex]: value } }] */
const setCells = db.transaction((listId, updates) => {
  const sel = db.prepare('SELECT data FROM list_rows WHERE id = ? AND list_id = ?');
  const upd = db.prepare('UPDATE list_rows SET data = ? WHERE id = ?');
  let n = 0;
  for (const u of updates) {
    const row = sel.get(u.rowId, listId);
    if (!row) continue;
    const d = JSON.parse(row.data);
    Object.keys(u.cells).forEach((c) => { d[Number(c)] = u.cells[c]; });
    upd.run(JSON.stringify(d), u.rowId);
    n++;
  }
  if (n) touch.run(listId);
  return n;
});

function deleteList(id) {
  db.prepare('DELETE FROM lists WHERE id = ?').run(id);
}

function renameList(id, name) {
  db.prepare("UPDATE lists SET name = ?, updated_at = datetime('now') WHERE id = ?").run(name, id);
}

/** Ensures "Verification Status" and "Verification Date" columns exist (inserted right after Email). */
function ensureVerificationColumns(listId) {
  let list = getList(listId);
  const emailCol = findHeader(list.columns, EMAIL_HEADERS);
  if (emailCol === -1) throw new Error('"Email" column not found.');

  let statusCol = findHeader(list.columns, STATUS_HEADERS);
  if (statusCol === -1) {
    statusCol = addColumn(listId, emailCol, 'Verification Status');
    list = getList(listId);
  }
  let dateCol = findHeader(list.columns, DATE_HEADERS);
  if (dateCol === -1) {
    dateCol = addColumn(listId, statusCol, 'Verification Date');
    list = getList(listId);
  }
  // Re-read final positions (inserting date may have shifted nothing before it, but be safe)
  return {
    list,
    emailCol: findHeader(list.columns, EMAIL_HEADERS),
    statusCol: findHeader(list.columns, STATUS_HEADERS),
    dateCol: findHeader(list.columns, DATE_HEADERS)
  };
}

/** Rows whose status cell is exactly "Pending..." */
function countPendingRows(listId) {
  const list = getList(listId);
  const statusCol = findHeader(list.columns, STATUS_HEADERS);
  if (statusCol === -1) return 0;
  return getRows(listId).filter((r) => String(r.data[statusCol] || '').trim() === PENDING_STATUS).length;
}

function clearPendingRows(listId) {
  const list = getList(listId);
  const statusCol = findHeader(list.columns, STATUS_HEADERS);
  if (statusCol === -1) return 0;
  const updates = getRows(listId)
    .filter((r) => String(r.data[statusCol] || '').trim() === PENDING_STATUS)
    .map((r) => ({ rowId: r.id, cells: { [statusCol]: '' } }));
  return setCells(listId, updates);
}

function canAccess(user, list) {
  return !!list && (user.role === 'admin' || list.user_id === user.id);
}

module.exports = {
  EMAIL_HEADERS, STATUS_HEADERS, DATE_HEADERS, PENDING_STATUS,
  findHeader, isValidEmail, norm,
  createList, getList, getListByName, listsForUser, getRows, getRowsPage,
  addColumn, setCells, deleteList, renameList, ensureVerificationColumns,
  countPendingRows, clearPendingRows, canAccess
};

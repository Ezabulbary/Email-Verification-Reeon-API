// =============================================================================
//  activityLog.js — the "info" tab: every automation run by every user
//  Columns: User Email | Function | Sheet(List) | Task ID | API Account | Date |
//           Task Name | Status | Total | Progress | Action
// =============================================================================
const { db } = require('../db');

const insert = db.prepare(`INSERT INTO activity
  (user_id, user_email, fn, list_id, list_name, task_id, api_account, task_name, status, total, progress, action)
  VALUES (@user_id, @user_email, @fn, @list_id, @list_name, @task_id, @api_account, @task_name, @status, @total, @progress, @action)`);

/** logTask({ user, fn, list, taskId, apiAccount, taskName, status, total, progress, action }) */
function logTask(p) {
  const info = insert.run({
    user_id: p.user ? p.user.id : null,
    user_email: p.user ? p.user.email : (p.userEmail || '—'),
    fn: p.fn || '—',
    list_id: p.list ? p.list.id : (p.listId || null),
    list_name: p.list ? p.list.name : (p.listName || '—'),
    task_id: p.taskId || '—',
    api_account: p.apiAccount || '—',
    task_name: p.taskName || p.fn || '—',
    status: p.status || 'submitted',
    total: p.total === undefined || p.total === null ? null : Number(p.total),
    progress: p.progress || '0%',
    action: p.action || 'pending'
  });
  return Number(info.lastInsertRowid);
}

/** One-off activity (no task id) — Decision Maker Filter, Company Name Cleaner */
function logActivity(p) {
  return logTask(Object.assign({}, p, {
    taskId: '—',
    status: p.status || 'completed',
    progress: p.progress || '100%',
    action: p.action || 'done'
  }));
}

/** Update a row found by Reoon task id. updates: { status, progress, action, total } */
function updateByTaskId(taskId, updates) {
  const sets = [];
  const vals = [];
  ['status', 'progress', 'action', 'total'].forEach((k) => {
    if (updates[k] !== undefined) { sets.push(k + ' = ?'); vals.push(updates[k]); }
  });
  if (!sets.length) return;
  vals.push(String(taskId));
  db.prepare(`UPDATE activity SET ${sets.join(', ')}, updated_at = datetime('now') WHERE task_id = ?`).run(...vals);
}

function updateById(id, updates) {
  const sets = [];
  const vals = [];
  ['status', 'progress', 'action', 'total'].forEach((k) => {
    if (updates[k] !== undefined) { sets.push(k + ' = ?'); vals.push(updates[k]); }
  });
  if (!sets.length) return;
  vals.push(id);
  db.prepare(`UPDATE activity SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...vals);
}

function list(user, { limit = 200, offset = 0, fn, q } = {}) {
  const where = [];
  const vals = [];
  if (user.role !== 'admin') { where.push('user_id = ?'); vals.push(user.id); }
  if (fn) { where.push('fn = ?'); vals.push(fn); }
  if (q) {
    where.push('(user_email LIKE ? OR list_name LIKE ? OR task_id LIKE ? OR task_name LIKE ? OR api_account LIKE ?)');
    for (let i = 0; i < 5; i++) vals.push('%' + q + '%');
  }
  const w = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const rows = db.prepare(`SELECT * FROM activity ${w} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...vals, limit, offset);
  const total = db.prepare(`SELECT COUNT(*) AS c FROM activity ${w}`).get(...vals).c;
  return { rows, total };
}

module.exports = { logTask, logActivity, updateByTaskId, updateById, list };

// =============================================================================
//  sheetCleaner.js - keep / delete selected columns, drop rows with a blank Email
// =============================================================================
const { db } = require('../db');
const lists = require('./lists');
const activity = require('./activityLog');

/** Normalise the request and work out which column indexes survive. */
function plan(list, opts) {
  const total = list.columns.length;
  const selected = Array.isArray(opts.columns) ? opts.columns.map(Number).filter((i) => Number.isInteger(i) && i >= 0 && i < total) : [];
  const mode = opts.mode === 'delete' ? 'delete' : 'keep';
  let keep;
  if (!selected.length) keep = list.columns.map((_, i) => i);           // nothing selected: keep every column
  else if (mode === 'keep') keep = selected.slice().sort((a, b) => a - b);
  else keep = list.columns.map((_, i) => i).filter((i) => selected.indexOf(i) === -1);
  const emailCol = lists.findHeader(list.columns, lists.EMAIL_HEADERS);
  return { keep, mode, selected, emailCol, dropBlankEmail: !!opts.dropBlankEmail && emailCol !== -1 };
}

function preview(listId, opts) {
  const list = lists.getList(listId);
  const p = plan(list, opts);
  let blankEmailRows = 0;
  if (p.emailCol !== -1) {
    for (const r of lists.getRows(listId)) {
      if (String(r.data[p.emailCol] || '').trim() === '') blankEmailRows++;
    }
  }
  return {
    totalColumns: list.columns.length, keptColumns: p.keep.length, removedColumns: list.columns.length - p.keep.length,
    keptHeaders: p.keep.map((i) => list.columns[i]),
    totalRows: list.row_count, hasEmail: p.emailCol !== -1, blankEmailRows,
    rowsAfter: list.row_count - (p.dropBlankEmail ? blankEmailRows : 0)
  };
}

function run(user, listId, opts) {
  const list = lists.getList(listId);
  const p = plan(list, opts);
  if (!p.keep.length) throw new Error('At least one column must remain.');
  if (p.keep.length === list.columns.length && !p.dropBlankEmail) throw new Error('Nothing to do: no columns selected for removal and blank-email rows are not being deleted.');

  const columns = p.keep.map((i) => list.columns[i]);
  let dropped = 0;
  const rows = [];
  for (const r of lists.getRows(listId)) {
    if (p.dropBlankEmail && String(r.data[p.emailCol] || '').trim() === '') { dropped++; continue; }
    rows.push(p.keep.map((i) => (r.data[i] === undefined || r.data[i] === null ? '' : r.data[i])));
  }

  let targetId;
  let targetName;
  if (opts.output === 'replace') {
    const pending = db.prepare('SELECT COUNT(*) AS c FROM pending_tasks WHERE list_id = ?').get(listId).c;
    if (pending > 0) throw new Error(`${pending} verification task(s) are still running on this sheet. Wait for them (Check Pending Results) or create a new sheet instead.`);
    lists.replaceContents(listId, columns, rows);
    targetId = listId; targetName = list.name;
  } else {
    targetName = String(opts.name || '').trim() || (list.name + ' (cleaned)');
    const existing = lists.getListByName(user.id, targetName);
    if (existing) lists.deleteList(existing.id);
    targetId = lists.createList({ userId: user.id, name: targetName, originalName: list.original_name, kind: 'sheet_cleaner', sourceListId: list.id, columns, rows });
  }

  activity.logActivity({
    user, fn: 'Sheet Cleaner', list, taskName: 'Sheet Cleaner - ' + list.name, status: 'completed', total: rows.length
  });

  const removed = list.columns.length - columns.length;
  return {
    ok: true, listId: targetId, listName: targetName,
    message: [
      'Sheet Cleaner - Completed',
      '=================================',
      `Source sheet     : ${list.name}`,
      `Columns kept     : ${columns.length} of ${list.columns.length}` + (removed ? ` (${removed} removed)` : ''),
      `Rows kept        : ${rows.length} of ${list.row_count}` + (dropped ? ` (${dropped} blank-email row(s) deleted)` : ''),
      `Output           : ${opts.output === 'replace' ? 'this sheet (replaced)' : '"' + targetName + '"'}`
    ].join('\n'),
    columnsKept: columns.length, columnsRemoved: removed, rowsKept: rows.length, rowsDropped: dropped
  };
}

module.exports = { preview, run };

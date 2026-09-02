const express = require('express');
const multer = require('multer');
const auth = require('../auth');
const lists = require('../services/lists');
const fileParser = require('../services/fileParser');
const { db } = require('../db');

const router = express.Router();
router.use(auth.requireAuth);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

function loadList(req, res, next) {
  const list = lists.getList(Number(req.params.id));
  if (!lists.canAccess(req.user, list)) return res.status(404).json({ error: 'List not found.' });
  req.list = list;
  next();
}

router.get('/', (req, res) => {
  const pendingByList = {};
  db.prepare('SELECT list_id, COUNT(*) AS c FROM pending_tasks GROUP BY list_id').all().forEach((r) => { pendingByList[r.list_id] = r.c; });
  const rows = lists.listsForUser(req.user).map((l) => Object.assign(l, { pending_tasks: pendingByList[l.id] || 0 }));
  res.json({ lists: rows });
});

router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const { columns, rows } = await fileParser.parseUpload(req.file.buffer, req.file.originalname);
    if (!rows.length) return res.status(400).json({ error: 'The file has a header row but no data rows.' });
    let name = String(req.body.name || '').trim() || req.file.originalname.replace(/\.[^.]+$/, '');
    // Unique name per user
    const base = name; let n = 2;
    while (lists.getListByName(req.user.id, name)) name = `${base} (${n++})`;
    const id = lists.createList({ userId: req.user.id, name, originalName: req.file.originalname, kind: 'upload', columns, rows });
    res.json({ ok: true, list: lists.getList(id) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.get('/:id', loadList, (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 100, 1), 1000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  const rows = lists.getRowsPage(req.list.id, offset, limit);
  const stats = computeStats(req.list);
  res.json({ list: req.list, rows, offset, limit, stats, pending_tasks: db.prepare('SELECT COUNT(*) AS c FROM pending_tasks WHERE list_id = ?').get(req.list.id).c });
});

function computeStats(list) {
  const emailCol = lists.findHeader(list.columns, lists.EMAIL_HEADERS);
  const statusCol = lists.findHeader(list.columns, lists.STATUS_HEADERS);
  const stats = { emailCol, statusCol, total: list.row_count, unverified: 0, pending: 0, byStatus: {} };
  if (emailCol === -1) return stats;
  for (const r of lists.getRows(list.id)) {
    const em = String(r.data[emailCol] || '').trim();
    const st = statusCol === -1 ? '' : String(r.data[statusCol] || '').trim();
    if (!st) { if (em && lists.isValidEmail(em)) stats.unverified++; continue; }
    if (st === lists.PENDING_STATUS) { stats.pending++; continue; }
    stats.byStatus[st] = (stats.byStatus[st] || 0) + 1;
  }
  return stats;
}

router.get('/:id/download', loadList, async (req, res) => {
  const rows = lists.getRows(req.list.id).map((r) => r.data);
  const safe = req.list.name.replace(/[^\w.\- ]+/g, '_').trim() || 'list';
  if (req.query.format === 'xlsx') {
    const buf = await fileParser.toXlsxBuffer(req.list.columns, rows, req.list.name);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safe}.xlsx"`);
    return res.send(buf);
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${safe}.csv"`);
  res.send('﻿' + fileParser.toCsv(req.list.columns, rows));
});

router.patch('/:id', loadList, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required.' });
  const dup = lists.getListByName(req.list.user_id, name);
  if (dup && dup.id !== req.list.id) return res.status(409).json({ error: 'Another list already has this name.' });
  lists.renameList(req.list.id, name);
  res.json({ ok: true });
});

router.delete('/:id', loadList, (req, res) => {
  lists.deleteList(req.list.id);
  res.json({ ok: true });
});

/** Orphan "Pending..." rows (no active task) → clear so they can be processed again */
router.get('/:id/pending-rows', loadList, (req, res) => {
  res.json({
    pendingRows: lists.countPendingRows(req.list.id),
    activeTasks: db.prepare('SELECT COUNT(*) AS c FROM pending_tasks WHERE list_id = ?').get(req.list.id).c
  });
});
router.post('/:id/clear-pending-rows', loadList, (req, res) => {
  const active = db.prepare('SELECT COUNT(*) AS c FROM pending_tasks WHERE list_id = ?').get(req.list.id).c;
  if (active > 0 && !req.body.force) {
    return res.status(400).json({ error: `${active} task(s) are still active for this list. Use "Check Pending Results" first, or force clear.` });
  }
  const n = lists.clearPendingRows(req.list.id);
  res.json({ ok: true, cleared: n, message: `✅ ${n} row(s) cleared.\nRun "Lead List Clean" now.` });
});

module.exports = router;

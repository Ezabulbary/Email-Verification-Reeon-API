const express = require('express');
const auth = require('../auth');
const lists = require('../services/lists');
const reoon = require('../services/reoon');
const llc = require('../services/leadListCleaner');

const router = express.Router();
router.use(auth.requireAuth);

function ownedList(req, res) {
  const list = lists.getList(Number(req.body.listId));
  if (!lists.canAccess(req.user, list)) { res.status(404).json({ error: 'List not found.' }); return null; }
  return list;
}

// Credits — visible to everyone (like the menu labels); keys never exposed
router.get('/credits', async (req, res) => {
  try {
    res.json(await reoon.getAllCredits(req.query.refresh === '1'));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/lead-list-clean', async (req, res) => {
  const list = ownedList(req, res); if (!list) return;
  try { res.json(await llc.cleanLeadList(req.user, list.id)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ✉️ Verify Account Emails — admin only (locked for everyone else)
router.post('/account', auth.requireAdmin, async (req, res) => {
  const list = ownedList(req, res); if (!list) return;
  try { res.json(await llc.verifyWithAccount(req.user, list.id, String(req.body.account || ''))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

router.get('/pending', (req, res) => {
  res.json({ tasks: llc.getPendingTasks(req.user).map((t) => ({
    id: t.id, task_id: t.task_id, account: t.account, fn: t.fn, list_id: t.list_id, list_name: t.list_name,
    total: t.total, created_at: t.created_at, last_status: t.last_status, last_check: t.last_check
  })) });
});

router.post('/check-pending', async (req, res) => {
  try { res.json(await llc.checkPendingTaskResults(req.user, { force: true })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/clear-pending-tasks', (req, res) => {
  res.json(llc.clearAllPendingTasks(req.user));
});

module.exports = router;

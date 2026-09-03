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

// ✉️ Verify Account Emails — admin only (locked for everyone else, same alert text as the sheet)
router.post('/account', (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: '🔒 Access Denied\n\nReachoutly has prohibited everyone from using this option, so it is locked.\nYour email: ' + req.user.email });
  }
  next();
}, async (req, res) => {
  const list = ownedList(req, res); if (!list) return;
  try { res.json(await llc.verifyWithAccount(req.user, list.id, String(req.body.account || ''))); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// 🔍 debugCreditBalance — raw Reoon API responses (admin, manual run)
router.get('/debug-credits', auth.requireAdmin, async (req, res) => {
  const lines = ['🔍 Reoon API Raw Response', '══════════════════════════════'];
  for (const acc of reoon.getAccounts(false)) {
    if (!acc.api_key) { lines.push(acc.name + ': ❌ API Key not found'); continue; }
    try {
      const r = await fetch(`${require('../config').reoon.apiBase}/check-account-balance/?key=${encodeURIComponent(acc.api_key)}`);
      const text = await r.text();
      lines.push(acc.name + ' [' + r.status + ']:\n  ' + text.slice(0, 400));
    } catch (e) { lines.push(acc.name + ': ❌ Error: ' + e.message); }
  }
  res.json({ message: lines.join('\n\n') });
});

router.get('/pending', (req, res) => {
  res.json({ tasks: llc.getPendingTasks(req.user).map((t) => ({
    id: t.id, task_id: t.task_id, account: t.account, fn: t.fn, list_id: t.list_id, list_name: t.list_name,
    total: t.total, created_at: t.created_at, last_status: t.last_status, last_check: t.last_check
  })) });
});

router.post('/check-pending', async (req, res) => {
  try { res.json(await llc.checkPendingTaskResults(req.user, { force: true, listId: req.body && req.body.listId ? Number(req.body.listId) : null })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/clear-pending-tasks', (req, res) => {
  res.json(llc.clearAllPendingTasks(req.user));
});

module.exports = router;

// Decision Maker filter + Company Name Cleaner + Activity log
const express = require('express');
const auth = require('../auth');
const lists = require('../services/lists');
const decisionMaker = require('../services/decisionMaker');
const companyCleaner = require('../services/companyCleaner');
const activity = require('../services/activityLog');

const router = express.Router();
router.use(auth.requireAuth);

function ownedList(req, res) {
  const list = lists.getList(Number(req.body.listId));
  if (!lists.canAccess(req.user, list)) { res.status(404).json({ error: 'List not found.' }); return null; }
  return list;
}

// ── Decision makers ──
router.post('/decision-makers/count', (req, res) => {
  const list = ownedList(req, res); if (!list) return;
  try { res.json({ count: decisionMaker.countLeads(list.id, req.body.filters) }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.post('/decision-makers/run', (req, res) => {
  const list = ownedList(req, res); if (!list) return;
  try { res.json(decisionMaker.runFilter(req.user, list.id, req.body.filters)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// ── Company name cleaner ──
router.post('/company-cleaner/start', (req, res) => {
  const list = ownedList(req, res); if (!list) return;
  try { res.json(companyCleaner.startCleaning(req.user, list.id, !!req.body.overwrite)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});
router.get('/company-cleaner/progress', (req, res) => {
  res.json(companyCleaner.getProgress(req.user));
});
router.post('/company-cleaner/reset', (req, res) => {
  res.json(companyCleaner.reset(req.user));
});

// ── Activity log ("info" tab) — admin sees everyone, users see their own ──
router.get('/activity', (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
  const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
  res.json(activity.list(req.user, { limit, offset, fn: req.query.fn || undefined, q: req.query.q || undefined }));
});

module.exports = router;

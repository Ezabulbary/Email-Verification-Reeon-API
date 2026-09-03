// =============================================================================
//  gas.js — google.script.run bridge for the original Apps Script dialogs
//  POST /api/gas/:fn  { listId, args:[...] }  →  { result }
// =============================================================================
const express = require('express');
const fs = require('fs');
const path = require('path');
const auth = require('../auth');
const lists = require('../services/lists');
const decisionMaker = require('../services/decisionMaker');

const router = express.Router();

const FUNCTIONS = {
  // countDecisionMakerLeads(filters) → number
  countDecisionMakerLeads(req, list, args) {
    return decisionMaker.countLeads(list.id, args[0] || {});
  },
  // runDecisionMakerFilter(filters) → summary string (shown by the dialog via alert)
  runDecisionMakerFilter(req, list, args) {
    return decisionMaker.runFilter(req.user, list.id, args[0] || {}).message;
  }
};

router.post('/api/gas/:fn', auth.requireAuth, express.json(), (req, res) => {
  const fn = FUNCTIONS[req.params.fn];
  if (!fn) return res.status(404).json({ error: 'Unknown server function: ' + req.params.fn });
  const list = lists.getList(Number(req.body.listId));
  if (!lists.canAccess(req.user, list)) return res.status(400).json({ error: 'No active sheet selected. Open a lead list tab first.' });
  try {
    res.json({ result: fn(req, list, Array.isArray(req.body.args) ? req.body.args : []) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Serves the ORIGINAL dialog HTML files (verbatim copies in public/dialogs/) with the shim injected.
const DIALOG_DIR = path.join(__dirname, '..', '..', 'public', 'dialogs');
router.get('/dialogs/:name', auth.requireAuth, (req, res) => {
  const name = String(req.params.name).replace(/[^A-Za-z0-9_.-]/g, '');
  const file = path.join(DIALOG_DIR, name.endsWith('.html') ? name : name + '.html');
  if (!fs.existsSync(file)) return res.status(404).send('Dialog not found');
  let html = fs.readFileSync(file, 'utf8');
  html = html.replace(/<head>/i, '<head>\n<script src="/gas-shim.js"></script>');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
});

module.exports = router;

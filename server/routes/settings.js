// Admin only — Reoon API accounts + OpenAI settings
const express = require('express');
const { db, getSetting, setSetting } = require('../db');
const auth = require('../auth');
const reoon = require('../services/reoon');
const config = require('../config');

const router = express.Router();
router.use(auth.requireAdmin);

function mask(key) {
  if (!key) return '';
  if (key.length <= 8) return '••••';
  return key.slice(0, 4) + '••••••••' + key.slice(-4);
}

router.get('/', (req, res) => {
  const accounts = db.prepare('SELECT * FROM api_accounts ORDER BY sort_order, id').all()
    .map((a) => ({ id: a.id, name: a.name, enabled: !!a.enabled, keyMasked: mask(a.api_key), created_at: a.created_at }));
  const openaiKey = getSetting('openai_api_key', '');
  res.json({
    accounts,
    openai: { keyMasked: mask(openaiKey), hasKey: !!openaiKey, model: getSetting('openai_model', config.openai.defaultModel) },
    reoonApiBase: config.reoon.apiBase,
    pollIntervalSeconds: config.pollIntervalSeconds
  });
});

router.post('/accounts', async (req, res) => {
  const name = String(req.body.name || '').trim();
  const apiKey = String(req.body.apiKey || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,60}$/.test(name)) return res.status(400).json({ error: 'Account name: letters, numbers, _ . - only.' });
  if (!apiKey) return res.status(400).json({ error: 'API key is required.' });
  if (db.prepare('SELECT id FROM api_accounts WHERE name = ?').get(name)) return res.status(409).json({ error: 'An account with this name already exists.' });
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), -1) + 1 AS o FROM api_accounts').get().o;
  const info = db.prepare('INSERT INTO api_accounts (name, api_key, sort_order) VALUES (?, ?, ?)').run(name, apiKey, order);
  const acc = db.prepare('SELECT * FROM api_accounts WHERE id = ?').get(info.lastInsertRowid);
  const bal = await reoon.getCreditBalance(acc, true);
  res.json({ ok: true, id: acc.id, balance: bal, warning: bal ? null : 'Account saved, but the balance check failed — verify the key.' });
});

router.patch('/accounts/:id', async (req, res) => {
  const id = Number(req.params.id);
  const acc = db.prepare('SELECT * FROM api_accounts WHERE id = ?').get(id);
  if (!acc) return res.status(404).json({ error: 'Account not found.' });
  const b = req.body || {};
  if (b.apiKey !== undefined && String(b.apiKey).trim()) db.prepare('UPDATE api_accounts SET api_key = ? WHERE id = ?').run(String(b.apiKey).trim(), id);
  if (b.enabled !== undefined) db.prepare('UPDATE api_accounts SET enabled = ? WHERE id = ?').run(b.enabled ? 1 : 0, id);
  if (b.name !== undefined) {
    const name = String(b.name).trim();
    if (!/^[A-Za-z0-9_.-]{1,60}$/.test(name)) return res.status(400).json({ error: 'Invalid account name.' });
    const dup = db.prepare('SELECT id FROM api_accounts WHERE name = ? AND id != ?').get(name, id);
    if (dup) return res.status(409).json({ error: 'Another account already uses this name.' });
    db.prepare('UPDATE api_accounts SET name = ? WHERE id = ?').run(name, id);
  }
  const updated = db.prepare('SELECT * FROM api_accounts WHERE id = ?').get(id);
  let balance = null;
  if (b.apiKey !== undefined) balance = await reoon.getCreditBalance(updated, true);
  res.json({ ok: true, balance });
});

router.delete('/accounts/:id', (req, res) => {
  db.prepare('DELETE FROM api_accounts WHERE id = ?').run(Number(req.params.id));
  res.json({ ok: true });
});

router.post('/openai', (req, res) => {
  const b = req.body || {};
  if (b.apiKey !== undefined && String(b.apiKey).trim()) setSetting('openai_api_key', String(b.apiKey).trim());
  if (b.clearKey) setSetting('openai_api_key', '');
  if (b.model !== undefined && String(b.model).trim()) setSetting('openai_model', String(b.model).trim());
  res.json({ ok: true });
});

module.exports = router;

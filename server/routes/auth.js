const express = require('express');
const { db } = require('../db');
const auth = require('../auth');

const router = express.Router();

router.post('/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const key = email; // per account, so a spoofed X-Forwarded-For cannot reset the counter
  if (!auth.loginAllowed(key)) return res.status(429).json({ error: 'Too many login attempts. Try again in 15 minutes.' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !auth.verifyPassword(user, password)) return res.status(401).json({ error: 'Invalid email or password.' });
  if (!user.active) return res.status(403).json({ error: 'This account is deactivated. Contact your admin.' });

  auth.loginSucceeded(key);
  auth.startSession(req, user);
  db.prepare("UPDATE users SET last_login_at = datetime('now') WHERE id = ?").run(user.id);
  res.json({ user: { id: user.id, email: user.email, name: user.name, role: user.role } });
});

router.post('/logout', (req, res) => {
  req.session = null;
  res.json({ ok: true });
});

router.get('/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not logged in' });
  res.json({ user: req.user });
});

router.post('/password', auth.requireAuth, (req, res) => {
  const current = String(req.body.currentPassword || '');
  const next = String(req.body.newPassword || '');
  if (next.length < 6) return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!auth.verifyPassword(user, current)) return res.status(400).json({ error: 'Current password is incorrect.' });
  db.prepare('UPDATE users SET password_hash = ?, session_version = COALESCE(session_version, 0) + 1 WHERE id = ?').run(auth.hashPassword(next), user.id);
  auth.startSession(req, db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)); // keep this session, drop all others
  res.json({ ok: true });
});

module.exports = router;

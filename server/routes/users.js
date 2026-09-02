// Admin only — user management
const express = require('express');
const { db } = require('../db');
const auth = require('../auth');

const router = express.Router();
router.use(auth.requireAdmin);

const cols = 'id, email, name, role, active, created_at, last_login_at';

router.get('/', (req, res) => {
  const users = db.prepare(`SELECT ${cols},
      (SELECT COUNT(*) FROM lists WHERE user_id = users.id) AS list_count,
      (SELECT COUNT(*) FROM activity WHERE user_id = users.id) AS activity_count
    FROM users ORDER BY role, email`).all();
  res.json({ users });
});

router.post('/', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  const password = String(req.body.password || '');
  const role = req.body.role === 'admin' ? 'admin' : 'user';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'Valid email is required.' });
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) return res.status(409).json({ error: 'A user with this email already exists.' });
  const info = db.prepare('INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, ?)').run(email, name, auth.hashPassword(password), role);
  res.json({ user: db.prepare(`SELECT ${cols} FROM users WHERE id = ?`).get(info.lastInsertRowid) });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const b = req.body || {};
  if (b.role !== undefined || b.active !== undefined) {
    // Never lock out the last active admin
    const isDemote = (b.role !== undefined && b.role !== 'admin') || (b.active !== undefined && !b.active);
    if (user.role === 'admin' && isDemote) {
      const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get().c;
      if (admins <= 1) return res.status(400).json({ error: 'Cannot demote/deactivate the last active admin.' });
    }
    if (id === req.user.id && isDemote) return res.status(400).json({ error: 'You cannot demote or deactivate yourself.' });
  }
  if (b.name !== undefined) db.prepare('UPDATE users SET name = ? WHERE id = ?').run(String(b.name).trim(), id);
  if (b.role !== undefined) db.prepare('UPDATE users SET role = ? WHERE id = ?').run(b.role === 'admin' ? 'admin' : 'user', id);
  if (b.active !== undefined) db.prepare('UPDATE users SET active = ? WHERE id = ?').run(b.active ? 1 : 0, id);
  if (b.password !== undefined) {
    if (String(b.password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(String(b.password)), id);
  }
  res.json({ user: db.prepare(`SELECT ${cols} FROM users WHERE id = ?`).get(id) });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'You cannot delete yourself.' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.role === 'admin') {
    const admins = db.prepare("SELECT COUNT(*) AS c FROM users WHERE role = 'admin' AND active = 1").get().c;
    if (admins <= 1) return res.status(400).json({ error: 'Cannot delete the last admin.' });
  }
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});

module.exports = router;

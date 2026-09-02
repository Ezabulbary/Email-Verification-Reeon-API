// Usage: npm run create-admin -- <email> <password> [name]
// Creates (or promotes + resets password of) an admin user.
const bcrypt = require('bcryptjs');
const { db } = require('../db');

const [email, password, name] = process.argv.slice(2);
if (!email || !password) {
  console.log('Usage: npm run create-admin -- <email> <password> [name]');
  process.exit(1);
}
const em = email.trim().toLowerCase();
const hash = bcrypt.hashSync(password, 10);
const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(em);
if (existing) {
  db.prepare("UPDATE users SET password_hash = ?, role = 'admin', active = 1 WHERE id = ?").run(hash, existing.id);
  console.log('✅ Existing user promoted to admin and password reset: ' + em);
} else {
  db.prepare("INSERT INTO users (email, name, password_hash, role) VALUES (?, ?, ?, 'admin')").run(em, name || 'Admin', hash);
  console.log('✅ Admin created: ' + em);
}

// =============================================================================
//  Email Verification Dashboard — Express server
// =============================================================================
const path = require('path');
const express = require('express');
const config = require('./config');
require('./db'); // opens DB + runs schema/seed
const auth = require('./auth');
const workers = require('./services/workers');

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(express.json({ limit: '5mb' }));
app.use(auth.session);
app.use(auth.loadUser);

// ── API ──
app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/lists', require('./routes/lists'));
app.use('/api/verify', require('./routes/verify'));
app.use('/api', require('./routes/tools'));
app.use(require('./routes/gas'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// ── Static frontend ──
app.use('/dialogs', (req, res) => res.status(404).end());
app.use(express.static(path.join(__dirname, '..', 'public'), { index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// ── Error handler ──
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File too large (max 50 MB).' });
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

app.listen(config.port, () => {
  console.log(`\n📧 Email Verification Dashboard running at http://localhost:${config.port}\n`);
  workers.start();
});

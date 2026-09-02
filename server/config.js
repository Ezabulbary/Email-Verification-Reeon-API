// =============================================================================
//  config.js — Environment configuration
// =============================================================================
require('dotenv').config();
const path = require('path');

const root = path.resolve(__dirname, '..');

function num(v, def) {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
}

const config = {
  port: num(process.env.PORT, 3000),
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret-change-me',
  dataDir: path.resolve(root, process.env.DATA_DIR || './data'),

  admin: {
    email: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
    password: process.env.ADMIN_PASSWORD || '',
    name: process.env.ADMIN_NAME || 'Admin'
  },

  reoon: {
    apiBase: (process.env.REOON_API_BASE || 'https://emailverifier.reoon.com/api/v1').replace(/\/+$/, ''),
    creditCacheSeconds: num(process.env.CREDIT_CACHE_SECONDS, 600)
  },

  openai: {
    apiBase: (process.env.OPENAI_API_BASE || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    defaultKey: process.env.CHATGPT_API_KEY || '',
    defaultModel: process.env.OPENAI_MODEL || 'gpt-4o-mini'
  },

  pollIntervalSeconds: Math.max(10, num(process.env.POLL_INTERVAL_SECONDS, 60)),

  // Same account names as the Google Sheet tabs — pre-loaded from .env on first start.
  seedAccounts: ['emailastrallc', 'emranhossain', 'alimranshourov', 'aminsohel', 'amin', 'support', 'tool']
    .map((name) => ({ name, apiKey: (process.env['API_KEY_' + name] || '').trim() }))
    .filter((a) => a.apiKey)
};

if (config.sessionSecret === 'dev-insecure-secret-change-me') {
  console.warn('⚠️  SESSION_SECRET is not set. Set a long random value in .env before using this in production.');
}

module.exports = config;

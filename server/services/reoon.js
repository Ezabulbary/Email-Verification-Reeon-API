// =============================================================================
//  reoon.js — Reoon Email Verifier API client + credit balance cache
//  (port of getCreditBalance / llcGetDailyCredits / llcCreateBulkTask /
//   llcFetchTaskResult / refreshCreditBalances from the Apps Script code)
// =============================================================================
const config = require('../config');
const { db } = require('../db');

const API_BASE = config.reoon.apiBase;

async function fetchJson(url, options) {
  const res = await fetch(url, options);
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { json = { raw: text }; }
  return { code: res.status, json };
}

// ── Raw API calls ────────────────────────────────────────────────────────────
async function checkBalance(apiKey) {
  const url = `${API_BASE}/check-account-balance/?key=${encodeURIComponent(apiKey)}`;
  try {
    const { code, json } = await fetchJson(url);
    if (code === 200) {
      return {
        daily: Number(json.remaining_daily_credits) || 0,
        instant: Number(json.remaining_instant_credits) || 0
      };
    }
    console.log('Reoon balance failed [' + code + ']: ' + JSON.stringify(json));
    return null;
  } catch (e) {
    console.log('Reoon balance error: ' + e.message);
    return null;
  }
}

async function createBulkTask(apiKey, taskName, emails) {
  const url = `${API_BASE}/create-bulk-verification-task/`;
  try {
    const { code, json } = await fetchJson(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: taskName, emails, key: apiKey })
    });
    if (code === 201 && json.task_id) return { ok: true, taskId: String(json.task_id) };
    return { ok: false, code, error: json.reason || json.message || json.raw || 'Unknown error' };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

async function fetchTaskResult(apiKey, taskId) {
  const url = `${API_BASE}/get-result-bulk-verification-task/?key=${encodeURIComponent(apiKey)}&task_id=${encodeURIComponent(taskId)}`;
  try {
    const { code, json } = await fetchJson(url);
    return code === 200 ? json : null;
  } catch (e) {
    console.log('Reoon fetchResult error: ' + e.message);
    return null;
  }
}

// ── Accounts ─────────────────────────────────────────────────────────────────
function getAccounts(enabledOnly) {
  return db.prepare(`SELECT * FROM api_accounts ${enabledOnly ? 'WHERE enabled = 1' : ''} ORDER BY sort_order, id`).all();
}
function getAccountByName(name) {
  return db.prepare('SELECT * FROM api_accounts WHERE name = ?').get(name);
}

// ── Credit cache (replaces CacheService + PropertiesService) ─────────────────
const upsertCache = db.prepare(`
  INSERT INTO credit_cache (account_id, daily, instant, ok, fetched_at) VALUES (?, ?, ?, ?, datetime('now'))
  ON CONFLICT(account_id) DO UPDATE SET daily = excluded.daily, instant = excluded.instant, ok = excluded.ok, fetched_at = excluded.fetched_at
`);
const readCache = db.prepare(`SELECT *, (strftime('%s','now') - strftime('%s', fetched_at)) AS age FROM credit_cache WHERE account_id = ?`);

/** Returns { daily, instant } (cached up to CREDIT_CACHE_SECONDS) or null. */
async function getCreditBalance(account, forceRefresh) {
  if (!account || !account.api_key) return null;
  if (!forceRefresh) {
    const c = readCache.get(account.id);
    if (c && c.ok && c.age < config.reoon.creditCacheSeconds) return { daily: c.daily, instant: c.instant, cached: true, age: c.age };
  }
  const bal = await checkBalance(account.api_key);
  if (bal) {
    upsertCache.run(account.id, bal.daily, bal.instant, 1);
    return { daily: bal.daily, instant: bal.instant, cached: false, age: 0 };
  }
  upsertCache.run(account.id, null, null, 0);
  return null;
}

/** All accounts with their balances. Used by the Credits page and the menu-style header. */
async function getAllCredits(forceRefresh) {
  const accounts = getAccounts(false);
  const rows = [];
  let totalDaily = 0, totalInstant = 0;
  for (const acc of accounts) {
    let bal = null;
    if (acc.enabled) bal = await getCreditBalance(acc, forceRefresh);
    if (bal) { totalDaily += bal.daily; totalInstant += bal.instant; }
    const c = readCache.get(acc.id);
    rows.push({
      id: acc.id,
      name: acc.name,
      enabled: !!acc.enabled,
      daily: bal ? bal.daily : null,
      instant: bal ? bal.instant : null,
      ok: !!bal,
      fetchedAt: c ? c.fetched_at : null
    });
  }
  return { accounts: rows, totalDaily, totalInstant };
}

async function refreshCreditBalances() {
  for (const acc of getAccounts(true)) {
    await getCreditBalance(acc, true);
  }
}

module.exports = {
  checkBalance, createBulkTask, fetchTaskResult,
  getAccounts, getAccountByName, getCreditBalance, getAllCredits, refreshCreditBalances
};

// =============================================================================
//  workers.js — background intervals (replaces Apps Script time-based triggers)
//   • poll pending Reoon tasks every POLL_INTERVAL_SECONDS
//   • refresh credit balances every 10 minutes
//   • resume company-cleaning jobs on start
// =============================================================================
const config = require('../config');
const reoon = require('./reoon');
const leadListCleaner = require('./leadListCleaner');
const companyCleaner = require('./companyCleaner');
const { db } = require('../db');

function start() {
  setInterval(async () => {
    try {
      const n = db.prepare('SELECT COUNT(*) AS c FROM pending_tasks').get().c;
      if (n > 0) {
        const r = await leadListCleaner.checkPendingTaskResults(null);
        if (r.written) console.log(`⏱ Poll: ${r.written} result(s) written, ${r.remaining} task(s) pending.`);
      }
    } catch (e) { console.log('Poll error: ' + e.message); }
  }, config.pollIntervalSeconds * 1000).unref();

  setInterval(() => reoon.refreshCreditBalances().catch((e) => console.log('Credit refresh error: ' + e.message)),
    10 * 60 * 1000).unref();

  // Warm the credit cache shortly after boot, resume unfinished cleaning jobs
  setTimeout(() => reoon.refreshCreditBalances().catch(() => {}), 2000).unref();
  companyCleaner.resumeJobs();
}

module.exports = { start };

// =============================================================================
//  leadListCleaner.js — port of LeadListCleaner.gs + verifyEmails (Code.gs)
//
//  • cleanLeadList   → "🚀 Lead List Clean": splits unverified emails across all
//                       enabled Reoon accounts using DAILY credits only
//  • verifyWithAccount → "✉️ Verify Account Emails" (admin only): one account,
//                       daily + instant credits
//  • checkPendingTaskResults → background / manual poll, writes results
//  • clearAllPendingTasks
// =============================================================================
const { db } = require('../db');
const reoon = require('./reoon');
const lists = require('./lists');
const activity = require('./activityLog');

const PENDING = lists.PENDING_STATUS;

// ── Pending task storage (replaces LLC_PENDING_TASKS in PropertiesService) ───
const insertPending = db.prepare(`INSERT INTO pending_tasks
  (user_id, list_id, account_id, account, task_id, fn, email_col, status_col, date_col, total)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);

function getPendingTasks(user) {
  const sql = `SELECT p.*, l.name AS list_name, a.api_key FROM pending_tasks p
               LEFT JOIN lists l ON l.id = p.list_id
               LEFT JOIN api_accounts a ON a.id = p.account_id
               ${user && user.role !== 'admin' ? 'WHERE p.user_id = ?' : ''} ORDER BY p.id`;
  return user && user.role !== 'admin' ? db.prepare(sql).all(user.id) : db.prepare(sql).all();
}

function pendingStatusTotalForList(listId) {
  return db.prepare('SELECT COUNT(*) AS c FROM pending_tasks WHERE list_id = ?').get(listId).c;
}

/** Marks rows as "Pending..." */
function markPending(listId, rows, statusCol) {
  lists.setCells(listId, rows.map((r) => ({ rowId: r.id, cells: { [statusCol]: PENDING } })));
}

function todayStr() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Collect rows with a valid email and an empty status cell. */
function collectUnverified(listId, emailCol, statusCol) {
  return lists.getRows(listId).filter((r) => {
    const em = String(r.data[emailCol] || '').trim();
    const st = String(r.data[statusCol] || '').trim();
    return em && lists.isValidEmail(em) && st === '';
  });
}

// =============================================================================
//  🚀 LEAD LIST CLEAN
// =============================================================================
async function cleanLeadList(user, listId) {
  const SCRIPT_START = Date.now();
  const { list, emailCol, statusCol, dateCol } = lists.ensureVerificationColumns(listId);

  const pendingRows = collectUnverified(listId, emailCol, statusCol);
  const totalUnprocessed = pendingRows.length;
  if (totalUnprocessed === 0) {
    const running = pendingStatusTotalForList(listId);
    let msg = '✅ All emails are already processed!';
    if (running > 0) msg += `\n\n⏳ ${running} task(s) running in background.`;
    return { ok: true, nothingToDo: true, message: msg };
  }

  // ── Check DAILY credits for each enabled account (fresh) ──
  const accountCredits = [];
  let totalCredits = 0;
  for (const acc of reoon.getAccounts(true)) {
    const bal = await reoon.getCreditBalance(acc, true);
    if (bal && bal.daily > 0) {
      accountCredits.push({ account: acc, dailyCredits: bal.daily });
      totalCredits += bal.daily;
    }
  }
  if (totalCredits === 0) {
    return { ok: false, message: '❌ All accounts have exhausted their Daily Credits.\nPlease try again tomorrow.' };
  }

  // ── Split emails among accounts ──
  const emailsToProcess = pendingRows.slice(0, totalCredits);
  const remaining = totalUnprocessed - emailsToProcess.length;
  const batches = [];
  let cursor = 0;
  for (const ac of accountCredits) {
    if (cursor >= emailsToProcess.length) break;
    const slice = emailsToProcess.slice(cursor, cursor + ac.dailyCredits);
    cursor += slice.length;
    if (slice.length) batches.push({ account: ac.account, rows: slice });
  }

  // ── Create bulk tasks ──
  const successTasks = [];
  const failBatches = [];
  for (const batch of batches) {
    const emailList = batch.rows.map((r) => String(r.data[emailCol]).toLowerCase().trim());
    const taskName = batch.account.name + '_' + list.name;
    const result = await reoon.createBulkTask(batch.account.api_key, 'Lead Clean: ' + taskName, emailList);

    if (result.ok) {
      markPending(listId, batch.rows, statusCol);
      insertPending.run(user.id, listId, batch.account.id, batch.account.name, result.taskId, 'Lead List Clean',
        emailCol, statusCol, dateCol, emailList.length);
      successTasks.push({ account: batch.account.name, taskId: result.taskId, leads: emailList.length });
      activity.logTask({
        user, fn: 'Lead List Clean', list, taskId: result.taskId, taskName,
        apiAccount: batch.account.name, status: 'submitted', total: emailList.length, progress: '0%', action: 'polling'
      });
    } else {
      failBatches.push(batch.account.name + (result.error ? ' (' + result.error + ')' : ''));
    }
  }

  if (!successTasks.length) {
    return { ok: false, message: '❌ No tasks could be created.\nFailed accounts: ' + failBatches.join(', ') };
  }

  // ── Aggressive in-script polling (every 10s, up to 100s) — same as the sheet ──
  const stillPending = await aggressivePoll(successTasks.map((t) => t.taskId), SCRIPT_START);

  // Refresh cached balances for the used accounts (best effort, in background)
  accountCredits.forEach((ac) => reoon.getCreditBalance(ac.account, true).catch(() => {}));

  const completedCount = successTasks.length - stillPending.length;
  const lines = [
    '📊 Lead List Clean — Summary',
    '══════════════════════════════════',
    `📤 Total Submitted : ${emailsToProcess.length} emails (Daily Credits Only)`,
    `✅ Completed Tasks : ${completedCount} task(s) (Sheet updated)`,
    `⏳ In Progress Tasks: ${stillPending.length} task(s) (In trigger)`,
    `🔁 Remaining Leads : ${remaining} email(s) (Will process in next run)`,
    '',
    '📋 Detailed Accounts Usage:',
    '──────────────────────────────────'
  ];
  successTasks.forEach((t) => {
    const isDone = stillPending.indexOf(t.taskId) === -1;
    lines.push(`  • ${t.account}: ${t.leads} leads | Status: ${isDone ? '✅ Completed' : '⏳ In Progress'} | Task ID: ${t.taskId}`);
  });
  if (failBatches.length) { lines.push(''); lines.push('  ❌ Failed Accounts: ' + failBatches.join(', ')); }
  if (stillPending.length) { lines.push(''); lines.push('⚡ Background trigger is checking progress every 1 minute.'); }
  if (remaining > 0) lines.push(`▶ Remaining ${remaining} leads will be cleaned in the next run.`);

  return { ok: true, message: lines.join('\n'), submitted: emailsToProcess.length, tasks: successTasks, completed: completedCount, inProgress: stillPending.length, remaining, failed: failBatches };
}

const LLC_POLL_INTERVAL_MS = 10 * 1000;
const LLC_SCRIPT_DEADLINE_MS = 100 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Polls every 10 s until all given tasks are done or the 100 s deadline passes. Returns task ids still pending. */
async function aggressivePoll(taskIds, scriptStart) {
  const deadline = scriptStart + LLC_SCRIPT_DEADLINE_MS;
  const remainingIds = () => {
    if (!taskIds.length) return [];
    return db.prepare(`SELECT task_id FROM pending_tasks WHERE task_id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds).map((r) => r.task_id);
  };
  let pending = remainingIds();
  while (pending.length) {
    const left = deadline - Date.now();
    if (left <= 0 || left < LLC_POLL_INTERVAL_MS + 5000) break;
    await sleep(LLC_POLL_INTERVAL_MS);
    try { await checkPendingTaskResults(null, { force: true }); } catch (e) { console.log('poll error: ' + e.message); }
    pending = remainingIds();
  }
  return pending;
}

// =============================================================================
//  ✉️ VERIFY ACCOUNT EMAILS (admin) — one account, daily + instant credits
// =============================================================================
async function verifyWithAccount(user, listId, accountName) {
  const account = reoon.getAccountByName(accountName);
  if (!account) return { ok: false, message: `Error: API account '${accountName}' not found.` };
  if (!account.enabled) return { ok: false, message: `Error: API account '${accountName}' is disabled.` };

  const { list, emailCol, statusCol, dateCol } = lists.ensureVerificationColumns(listId);
  const rows = collectUnverified(listId, emailCol, statusCol);
  if (!rows.length) return { ok: false, message: 'Error: No valid emails to verify found.' };

  const bal = await reoon.getCreditBalance(account, true);
  if (!bal) return { ok: false, message: 'Error: Unable to check credit balance.' };
  const required = rows.length;
  if (bal.daily + bal.instant < required) {
    return { ok: false, message: `Error: Insufficient credits. Available Instant: ${bal.instant}, Daily: ${bal.daily}, Required: ${required}` };
  }

  const emailList = rows.map((r) => String(r.data[emailCol]).trim());
  const result = await reoon.createBulkTask(account.api_key, `Bulk Email Verification Task - ${list.name}`, emailList);
  if (!result.ok) return { ok: false, message: `Error: Task creation failed${result.code ? ' with status ' + result.code : ''} - ${result.error}` };

  markPending(listId, rows, statusCol);
  insertPending.run(user.id, listId, account.id, account.name, result.taskId, 'Verify Emails', emailCol, statusCol, dateCol, emailList.length);
  activity.logTask({
    user, fn: 'Verify Emails', list, taskId: result.taskId, apiAccount: account.name,
    taskName: 'Individual Verify — ' + account.name, status: 'submitted', total: emailList.length, progress: '0%', action: 'polling'
  });
  fastPoll([result.taskId]);
  reoon.getCreditBalance(account, true).catch(() => {});

  return {
    ok: true,
    message: `✅ Verification task submitted!\n\n📧 Emails: ${emailList.length}\n🔑 Task ID: ${result.taskId}\n🏦 Account: ${account.name}\n\n⏳ Results will appear automatically within 1–5 minutes.`,
    taskId: result.taskId, total: emailList.length
  };
}

// =============================================================================
//  RESULT WRITER — scan "Pending..." rows and write status + date
// =============================================================================
function writeResultsToList(task, resultObj) {
  const list = lists.getList(task.list_id);
  if (!list) return 0;
  const resultsLower = {};
  Object.keys(resultObj || {}).forEach((k) => { resultsLower[k.toLowerCase()] = resultObj[k]; });

  const now = todayStr();
  const updates = [];
  for (const r of lists.getRows(task.list_id)) {
    if (String(r.data[task.status_col] || '') !== PENDING) continue;
    const email = String(r.data[task.email_col] || '').trim().toLowerCase();
    if (!email) continue;
    const res = resultsLower[email];
    if (res) {
      const cells = { [task.status_col]: res.status || 'unknown' };
      if (task.date_col !== null && task.date_col !== undefined) cells[task.date_col] = now;
      updates.push({ rowId: r.id, cells });
    }
  }
  return updates.length ? lists.setCells(task.list_id, updates) : 0;
}

// =============================================================================
//  POLL — background trigger equivalent (checkPendingTaskResults)
// =============================================================================
let polling = false;
async function checkPendingTaskResults(user, opts = {}) {
  if (polling && !opts.force) return { ok: true, message: '⏳ A poll is already running.', written: 0, remaining: getPendingTasks(user).length };
  polling = true;
  let totalWritten = 0;
  let remaining = 0;
  const details = [];
  try {
    const tasks = getPendingTasks(user);
    if (tasks.length === 0) {
      // Recovery: no stored tasks — does the active sheet have orphan "Pending..." rows?
      let orphanCount = 0;
      if (opts.listId) { try { orphanCount = lists.countPendingRows(opts.listId); } catch (e) { /* ignore */ } }
      return {
        ok: true, noTasks: true, orphanCount, written: 0, remaining: 0,
        message: orphanCount > 0
          ? orphanCount + ' row(s) have "Pending..." status but no active Task ID.\n\nClearing them will allow them to be processed again in the next run.\nDo you want to clear them?'
          : '✅ No Pending Tasks found.'
      };
    }
    for (const task of tasks) {
      if (!task.api_key) {
        details.push(`${task.task_id}: account "${task.account}" no longer exists — skipped`);
        remaining++;
        continue;
      }
      const result = await reoon.fetchTaskResult(task.api_key, task.task_id);
      const status = result ? result.status : 'fetch failed';
      db.prepare("UPDATE pending_tasks SET last_status = ?, last_check = datetime('now') WHERE id = ?").run(String(status), task.id);

      if (!result || result.status !== 'completed' || !result.results) {
        remaining++;
        if (result && result.status && result.status !== 'completed') {
          const pct = result.progress !== undefined ? result.progress : null;
          activity.updateByTaskId(task.task_id, { status: result.status, progress: pct !== null ? String(pct).replace(/%?$/, '%') : undefined });
        }
        details.push(`${task.task_id} (${task.account}): ${status}`);
        continue;
      }

      const written = writeResultsToList(task, result.results);
      totalWritten += written;
      activity.updateByTaskId(task.task_id, { status: 'completed', progress: '100%', action: 'done' });
      db.prepare('DELETE FROM pending_tasks WHERE id = ?').run(task.id);
      details.push(`${task.task_id} (${task.account}): ✅ completed, ${written} row(s) written`);
    }
  } finally {
    polling = false;
  }

  let msg = `✅ ${totalWritten} Email Result(s) written.`;
  msg += remaining > 0 ? `\n⏳ ${remaining} task(s) still running.` : '\n🎉 All tasks completed!';
  if (details.length) msg += '\n\n' + details.join('\n');
  return { ok: true, message: msg, written: totalWritten, remaining, details };
}

/** Short aggressive poll after a submission: every 10s for up to ~100s. Non-blocking. */
function fastPoll(taskIds) {
  const deadline = Date.now() + 100 * 1000;
  const tick = async () => {
    if (Date.now() > deadline) return;
    const still = db.prepare(`SELECT COUNT(*) AS c FROM pending_tasks WHERE task_id IN (${taskIds.map(() => '?').join(',')})`).get(...taskIds).c;
    if (!still) return;
    try { await checkPendingTaskResults(null); } catch (e) { console.log('fastPoll error: ' + e.message); }
    setTimeout(tick, 10 * 1000);
  };
  setTimeout(tick, 10 * 1000);
}

function clearAllPendingTasks(user) {
  const res = user.role === 'admin'
    ? db.prepare('DELETE FROM pending_tasks').run()
    : db.prepare('DELETE FROM pending_tasks WHERE user_id = ?').run(user.id);
  return { ok: true, deleted: res.changes, message: `✅ ${res.changes} pending task(s) deleted successfully.` };
}

module.exports = { cleanLeadList, verifyWithAccount, checkPendingTaskResults, clearAllPendingTasks, getPendingTasks, aggressivePoll };

// =============================================================================
//  companyCleaner.js — port of CompanyNameCleaner.gs (OpenAI GPT batch cleaning)
//
//  startCleaning  → copies the list to "[user email], the company name cleaning",
//                   adds "Clean Company Name" column, starts a background job
//  runJob         → batches of 100 rows → GPT → postClean → write (background)
//  getProgress    → "🧐 Check Cleaning Progress"
//  reset          → "🗑️ Reset Cleaning Progress"
// =============================================================================
const config = require('../config');
const { db, getSetting } = require('../db');
const lists = require('./lists');
const activity = require('./activityLog');

const BATCH_SIZE = 100;
const running = new Set(); // job ids currently executing in this process

function postCleanCompanyName(name) {
  if (!name) return name;
  name = String(name);
  name = name.replace(/\b(inc\.?|llc|ltd\.?|corp\.?|gmbh|group|holdings|company|co\.?)\b/gi, '');
  name = name.replace(/\b(www\.|https?:\/\/)?[a-z0-9\-]+\.(com|io|net|org|biz|info|co|us|ca|uk|de|fr|au|nl|ru|jp)\b/gi, '');
  name = name.replace(/\/[\w\-\.\?=&%]*/g, '');
  name = name.replace(/\s{2,}/g, ' ').trim();
  return name;
}

function buildPrompt(promptLines) {
  return `
Clean the following company names by:
- Remove all legal suffixes (Inc, LLC, Ltd, Corp, GmbH, Pvt, Plc, etc.).
- Remove location names (city, state, country).
- Remove generic business terms (Group, Holdings, Company, Enterprises, Solutions, Services, International, Global, Technologies, Systems, Partners, etc.).
- Remove all website/domain references (.com, .io, .net, www, etc.).
- Keep the name as short as possible, only the unique core brand name.
- example: Nightmare Graphics Screen Printing & Embroidery	randelman@nightmaregraphics.com = Nightmare Graphics,
Red Lime Creative Studio	serena@red-lime.com = Red Lime,
WetchCo Signs	brian@wetchco.com = WetchCo.
Return ONLY the cleaned company name with line numbers, in this exact format:
1) Cleaned Name
2) Cleaned Name
...
No extra words, no explanation, no punctuation except numbering.
${promptLines.join('\n')}
`;
}

async function callChatGptBatch(prompt, apiKey, model) {
  const res = await fetch(`${config.openai.apiBase}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are an assistant that strictly cleans company names as per instructions.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (json.error && json.error.message) || `HTTP ${res.status}`;
    throw new Error('GPT API Error: ' + msg);
  }
  return (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content || '').trim();
}

// ── Job helpers ──────────────────────────────────────────────────────────────
function getJob(id) { return db.prepare('SELECT * FROM clean_jobs WHERE id = ?').get(id); }
function activeJobForUser(userId) {
  return db.prepare("SELECT * FROM clean_jobs WHERE user_id = ? AND status = 'running' ORDER BY id DESC LIMIT 1").get(userId);
}
function latestJobForUser(userId) {
  return db.prepare('SELECT * FROM clean_jobs WHERE user_id = ? ORDER BY id DESC LIMIT 1').get(userId);
}
function updateJob(id, fields) {
  const keys = Object.keys(fields);
  db.prepare(`UPDATE clean_jobs SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`)
    .run(...keys.map((k) => fields[k]), id);
}

// =============================================================================
//  START
// =============================================================================
function startCleaning(user, listId, overwrite) {
  const active = activeJobForUser(user.id);
  if (active) updateJob(active.id, { status: 'stopped' }); // deleteTriggersByName('cleanCompanyNames')

  const source = lists.getList(listId);
  const newName = user.email + ', the company name cleaning';
  const existing = lists.getListByName(user.id, newName);
  if (existing && !overwrite) {
    return { ok: false, needsConfirm: true, message: `The tab '${newName}' already exists.\n\nDo you want to overwrite it and start cleaning fresh?` };
  }

  const companyCol = source.columns.findIndex((h) => /^(company|company name)$/i.test(String(h).trim()));
  if (companyCol === -1) return { ok: false, message: '❌ "Company" or "Company Name" column not found.' };

  if (existing) lists.deleteList(existing.id);

  // Duplicate the list
  const rows = lists.getRows(source.id).map((r) => r.data);
  const newId = lists.createList({
    userId: user.id, name: newName, originalName: source.original_name, kind: 'company_clean',
    sourceListId: source.id, columns: source.columns, rows
  });

  let target = lists.getList(newId);
  let cleanCol = target.columns.findIndex((h) => /clean company name/i.test(String(h)));
  if (cleanCol === -1) {
    cleanCol = lists.addColumn(newId, companyCol, 'Clean Company Name');
    target = lists.getList(newId);
  }
  const websiteCol = target.columns.findIndex((h) => /website/i.test(String(h)));

  const activityId = activity.logActivity({
    user, fn: 'Company Name Cleaner', list: source, taskName: 'Company Clean — ' + source.name,
    status: 'started', total: Math.max(rows.length, 0), progress: '0%', action: 'running'
  });

  const info = db.prepare(`INSERT INTO clean_jobs (user_id, list_id, source_list_id, company_col, clean_col, website_col, activity_id)
                           VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(user.id, newId, source.id, companyCol, cleanCol, websiteCol === -1 ? null : websiteCol, activityId);
  const jobId = Number(info.lastInsertRowid);

  runJob(jobId); // background

  return { ok: true, jobId, listId: newId, message: `🚀 Created target tab: "${newName}"\n\nStarting high-speed cleaning process...` };
}

// =============================================================================
//  RUN (background) — like cleanCompanyNames(), but no 6-minute limit
// =============================================================================
async function runJob(jobId) {
  if (running.has(jobId)) return;
  running.add(jobId);
  try {
    const apiKey = getSetting('openai_api_key', '') || config.openai.defaultKey;
    const model = getSetting('openai_model', '') || config.openai.defaultModel;
    if (!apiKey) {
      updateJob(jobId, { status: 'error', error: 'API key not found. Please set CHATGPT_API_KEY in Admin → API Keys & Settings.' });
      finishActivity(jobId, 'error');
      return;
    }

    for (;;) {
      const job = getJob(jobId);
      if (!job || job.status !== 'running') return;

      const rows = lists.getRows(job.list_id);
      const totalRows = rows.length;

      const prompts = [];
      const targets = []; // { rowId, index }
      let i = job.last_processed_row + 1;
      while (i < totalRows && prompts.length < BATCH_SIZE) {
        const r = rows[i];
        const companyName = r.data[job.company_col];
        const cleanVal = r.data[job.clean_col];
        const website = job.website_col !== null && job.website_col !== undefined ? r.data[job.website_col] : '';
        if (companyName && (!cleanVal || String(cleanVal).trim() === '')) {
          let line = `${prompts.length + 1}) Company Name: ${companyName}`;
          if (website) line += ` | Website: ${website}`;
          prompts.push(line);
          targets.push({ rowId: r.id, index: i, companyName });
        }
        i++;
      }

      if (!prompts.length) { complete(jobId); return; }

      let response;
      try {
        response = await callChatGptBatch(buildPrompt(prompts), apiKey, model);
      } catch (e) {
        updateJob(jobId, { status: 'error', error: e.message });
        finishActivity(jobId, 'error');
        return;
      }
      if (!response) {
        updateJob(jobId, { status: 'error', error: 'Empty response from GPT API.' });
        finishActivity(jobId, 'error');
        return;
      }

      const cleanedMap = {};
      response.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
        const m = line.match(/^(\d+)\)\s*(.+)$/);
        if (m) cleanedMap[parseInt(m[1], 10) - 1] = m[2].trim();
      });

      const updates = targets.map((t, k) => ({
        rowId: t.rowId,
        cells: { [job.clean_col]: postCleanCompanyName(cleanedMap[k] || t.companyName) }
      }));
      lists.setCells(job.list_id, updates);

      const lastRow = Math.max(...targets.map((t) => t.index));
      const processed = job.processed + targets.length;
      updateJob(jobId, { last_processed_row: lastRow, processed });
      const pct = totalRows ? Math.round(((lastRow + 1) / totalRows) * 100) : 100;
      if (job.activity_id) activity.updateById(job.activity_id, { progress: pct + '%', status: 'running' });
      console.log(`🤖 Company clean job #${jobId}: processed batch, last row ${lastRow + 1}/${totalRows}`);
    }
  } finally {
    running.delete(jobId);
  }
}

function complete(jobId) {
  updateJob(jobId, { status: 'completed' });
  finishActivity(jobId, 'completed');
}
function finishActivity(jobId, status) {
  const job = getJob(jobId);
  if (job && job.activity_id) {
    activity.updateById(job.activity_id, { status, progress: status === 'completed' ? '100%' : undefined, action: status === 'completed' ? 'done' : status });
  }
}

/** Resume jobs left "running" after a restart. */
function resumeJobs() {
  db.prepare("SELECT id FROM clean_jobs WHERE status = 'running'").all().forEach((j) => runJob(j.id));
}

// =============================================================================
//  PROGRESS / RESET
// =============================================================================
function getProgress(user) {
  const job = latestJobForUser(user.id);
  if (!job) return { ok: true, active: false, message: 'ℹ️ No active cleaning process found.\nClick "Start Cleaning Company Names" to begin.' };
  const list = lists.getList(job.list_id);
  if (!list) return { ok: true, active: false, message: 'ℹ️ The cleaning tab was deleted.' };

  const rows = lists.getRows(job.list_id);
  let emptyCount = 0;
  rows.forEach((r) => {
    const c = r.data[job.company_col];
    const v = r.data[job.clean_col];
    if (c && (!v || String(v).trim() === '')) emptyCount++;
  });
  const total = rows.length;
  const processed = total - emptyCount;
  const pct = total ? Math.round((processed / total) * 100) : 100;
  const statusLine = {
    running: '⚡ Background batch job is active.',
    completed: '🎉 All company names have been cleaned successfully!',
    stopped: '⏹ Cleaning was reset/stopped.',
    error: '❌ Error: ' + (job.error || 'unknown')
  }[job.status] || job.status;

  // Same final alerts as cleanCompanyNames() in the sheet
  const doneMessage = job.status === 'completed'
    ? '🎉 Success!\n\nAll company names have been cleaned successfully in the new tab!'
    : job.status === 'error' ? '❌ ' + (job.error || 'Cleaning stopped with an error.')
    : job.status === 'stopped' ? '♻️ Cleaning was reset.' : null;
  return {
    ok: true, active: job.status === 'running', status: job.status, listId: job.list_id, listName: list.name,
    processed, total, remaining: emptyCount, percent: pct, error: job.error, doneMessage,
    message: [
      '📊 Company Names Cleaning Progress',
      '══════════════════════════════════',
      `📁 Cleaning Sheet     : ${list.name}`,
      `📈 Last Processed Row : Row ${job.last_processed_row + 2}`,
      `✅ Cleaned Rows       : ${processed} / ${total} (${pct}%)`,
      `⏳ Remaining Rows     : ${emptyCount}`,
      '',
      statusLine
    ].join('\n')
  };
}

function reset(user) {
  const res = db.prepare("UPDATE clean_jobs SET status = 'stopped', updated_at = datetime('now') WHERE user_id = ? AND status = 'running'").run(user.id);
  return { ok: true, stopped: res.changes, message: '♻️ Cleaning progress reset. You can start the process fresh again.' };
}

module.exports = { startCleaning, runJob, resumeJobs, getProgress, reset, postCleanCompanyName };

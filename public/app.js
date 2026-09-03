/* =============================================================================
   Email Verifier Dashboard — frontend (sidebar layout)
   The "📧 EMAIL VERIFIER" section of the sidebar is the Google Sheet menu 1:1:
   same items, order, labels, alerts and dialogs. Every menu action runs on the
   ACTIVE SHEET (the list open on screen, or the one chosen in the top bar).
   ========================================================================== */
(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtDate = (s) => (s ? String(s).replace('T', ' ').slice(0, 19) : '—');
  const num = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const colLetter = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: {} };
    if (opts.body instanceof FormData) o.body = opts.body;
    else if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
    const res = await fetch('/api' + path, o);
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    if (res.status === 401 && !path.startsWith('/auth/')) { state.user = null; render(); throw new Error('Session expired — please log in again.'); }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }
  function toast(msg, type) {
    const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.remove(), type === 'err' ? 7000 : 4000);
  }

  // ── Modals = SpreadsheetApp.getUi().alert / showModalDialog ────────────────
  const modalRoot = () => $('#modal-root');
  function closeModal() { modalRoot().innerHTML = ''; }
  function shell(title, bodyHtml, footHtml, cls) {
    modalRoot().innerHTML = `<div class="modal-bg"><div class="modal ${cls || ''}">
      <div class="mh"><span>${esc(title)}</span><button class="x" id="m-x">×</button></div>
      <div class="mb">${bodyHtml}</div>${footHtml ? `<div class="foot">${footHtml}</div>` : ''}</div></div>`;
    $('#m-x').onclick = closeModal;
  }
  function uiAlert(text, title) {
    return new Promise((resolve) => {
      shell(title || '📧 Email Verifier', `<pre>${esc(text)}</pre>`, '<button class="btn primary" id="m-ok">OK</button>');
      $('#m-ok').onclick = () => { closeModal(); resolve(); };
      $('#m-x').onclick = () => { closeModal(); resolve(); };
      $('#m-ok').focus();
    });
  }
  function uiConfirm(title, text, yesLabel, noLabel) {
    return new Promise((resolve) => {
      shell(title, `<pre>${esc(text)}</pre>`, `<button class="btn" id="m-no">${esc(noLabel || 'NO')}</button><button class="btn primary" id="m-yes">${esc(yesLabel || 'YES')}</button>`);
      $('#m-no').onclick = () => { closeModal(); resolve(false); };
      $('#m-x').onclick = () => { closeModal(); resolve(false); };
      $('#m-yes').onclick = () => { closeModal(); resolve(true); };
    });
  }
  function uiBusy(title, text) {
    shell(title, `<div id="busy-text" style="white-space:pre-wrap;line-height:1.6"><span class="spin"></span>${esc(text)}</div>`);
    $('#m-x').onclick = () => {};
    return (t) => { const el = $('#busy-text'); if (el) el.innerHTML = `<span class="spin"></span>${esc(t)}`; };
  }
  /** The ORIGINAL Apps Script HTML dialogs (decision_maker / GuidelineDialog), unchanged */
  function uiHtmlDialog(name, title, w, h, listId, onClose) {
    shell(title, '', '', 'iframe-modal');
    const mb = $('.mb', modalRoot()); mb.style.padding = '0';
    mb.innerHTML = `<iframe src="/dialogs/${name}?listId=${listId || ''}&_=${Date.now()}" style="width:${w}px;height:${h}px;max-width:92vw;max-height:80vh"></iframe>`;
    const handler = (ev) => { if (ev.data && ev.data.type === 'gas-close') { window.removeEventListener('message', handler); closeModal(); if (onClose) onClose(); } };
    window.addEventListener('message', handler);
    $('#m-x').onclick = () => { window.removeEventListener('message', handler); closeModal(); if (onClose) onClose(); };
  }
  function uiForm(title, fields, okLabel) {
    return new Promise((resolve) => {
      shell(title, `<form id="m-form">${fields.map((f) => `<div class="field"><label class="f">${esc(f.label)}</label>${
        f.type === 'select'
          ? `<select name="${esc(f.name)}">${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === f.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
          : f.type === 'file'
            ? `<input type="file" name="${esc(f.name)}" accept="${esc(f.accept || '')}" ${f.required ? 'required' : ''}>`
            : `<input type="${esc(f.type || 'text')}" name="${esc(f.name)}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} autocomplete="off">`
      }${f.help ? `<div class="hint" style="margin-top:4px">${f.help}</div>` : ''}</div>`).join('')}<button type="submit" hidden></button></form>`,
        `<button class="btn" id="m-no">Cancel</button><button class="btn primary" id="m-ok">${esc(okLabel || 'Save')}</button>`);
      const done = () => {
        const form = $('#m-form'); if (!form.reportValidity()) return;
        const out = {}; fields.forEach((f) => { const el = $(`[name="${f.name}"]`, form); out[f.name] = f.type === 'file' ? el.files[0] : el.value; });
        closeModal(); resolve(out);
      };
      $('#m-no').onclick = () => { closeModal(); resolve(null); };
      $('#m-x').onclick = () => { closeModal(); resolve(null); };
      $('#m-ok').onclick = done;
      $('#m-form').onsubmit = (e) => { e.preventDefault(); done(); };
      const first = $('input, select', modalRoot()); if (first) first.focus();
    });
  }

  // ── State / routing ────────────────────────────────────────────────────────
  const state = { user: null, credits: null, lists: [], activeId: null, verifyOpen: false };
  const PAGE = 200;
  const routes = { '': 'overview', overview: 'overview', lists: 'lists', list: 'listDetail', credits: 'credits', activity: 'activity', users: 'users', settings: 'settings', account: 'account' };
  const parseHash = () => { const [name, ...args] = location.hash.replace(/^#\/?/, '').split('/'); return { name: name || '', args }; };
  window.addEventListener('hashchange', render);
  const isAdmin = () => state.user && state.user.role === 'admin';

  async function boot() {
    try { state.user = (await api('/auth/me')).user; } catch (e) { state.user = null; }
    if (state.user) await afterLogin();
    render();
  }
  async function afterLogin() {
    state.verifyOpen = false;
    try { state.activeId = Number(localStorage.getItem('evd.active.' + state.user.id)) || null; } catch (e) { /* ignore */ }
    await Promise.all([loadLists(), loadCredits(false)]);
  }
  async function loadLists() {
    state.lists = (await api('/lists')).lists;
    if (state.activeId && !state.lists.find((l) => l.id === state.activeId)) state.activeId = null;
    if (!state.activeId && state.lists.length) state.activeId = state.lists[0].id;
  }
  async function loadCredits(force) {
    try { state.credits = await api('/verify/credits' + (force ? '?refresh=1' : '')); } catch (e) { state.credits = null; }
    const pill = $('#credits-pill'); if (pill) pill.innerHTML = creditsPill();
    renderNav();
  }
  const creditsPill = () => (state.credits ? `Total Daily: <b>${num(state.credits.totalDaily)}</b> &nbsp;|&nbsp; Instant: <b>${num(state.credits.totalInstant)}</b>` : '⏳ credits…');

  /** = SpreadsheetApp.getActiveSheet(): the list on screen, else the one chosen in the top bar */
  function activeList() {
    const { name, args } = parseHash();
    if (name === 'list' && args[0]) { const l = state.lists.find((x) => x.id === Number(args[0])); if (l) return l; }
    return state.lists.find((x) => x.id === state.activeId) || null;
  }
  function setActive(id) {
    state.activeId = Number(id) || null;
    try { localStorage.setItem('evd.active.' + state.user.id, String(state.activeId || '')); } catch (e) { /* ignore */ }
    const sel = $('#active-sel'); if (sel) sel.value = String(state.activeId || '');
  }
  async function requireActiveList() {
    const l = activeList();
    if (!l) { await uiAlert('❌ No lead list is selected.\n\nUpload a lead list (Lead Lists → Upload) or pick the active sheet in the top bar, then run this again.'); return null; }
    return l;
  }

  // ── Shell ──────────────────────────────────────────────────────────────────
  function render() {
    const app = $('#app');
    if (!state.user) { app.innerHTML = loginView(); bindLogin(); return; }
    const view = routes[parseHash().name] || 'overview';
    app.innerHTML = `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="brand"><span class="ic">📧</span><span>Email Verifier<small>Reoon API Dashboard</small></span></div>
          <nav class="nav" id="nav"></nav>
          <div class="me"><b>${esc(state.user.email)}</b><span class="badge ${isAdmin() ? '' : 'gray'}">${isAdmin() ? 'ADMIN' : 'USER'}</span><button class="btn ghost sm" id="logout" style="margin-left:auto">Logout</button></div>
        </aside>
        <div class="main">
          <div class="topbar">
            <div style="display:flex;align-items:center;gap:10px;min-width:0"><button class="btn sm menu-btn" id="menu-btn">☰</button><h2 id="page-title"></h2></div>
            <div class="tr">
              <div class="active-sheet">📄 Active sheet: <select id="active-sel">${activeOptions()}</select></div>
              <div class="credits-pill" id="credits-pill">${creditsPill()}</div>
            </div>
          </div>
          <div class="content" id="content"></div>
        </div>
      </div>`;
    renderNav();
    $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); state.user = null; location.hash = ''; render(); };
    $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
    $('#active-sel').onchange = (e) => setActive(e.target.value);
    views[view](parseHash().args).catch((e) => { $('#content').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; });
  }
  function activeOptions() {
    if (!state.lists.length) return '<option value="">— no lead lists yet —</option>';
    const cur = activeList();
    return state.lists.map((l) => `<option value="${l.id}" ${cur && cur.id === l.id ? 'selected' : ''}>${esc(l.name)}</option>`).join('');
  }
  function refreshActiveSelect() { const s = $('#active-sel'); if (s) s.innerHTML = activeOptions(); }
  function setTitle(t) { $('#page-title').textContent = t; document.title = t + ' — Email Verifier'; }

  // Sidebar: pages + the Sheet menu (1:1) + admin
  function renderNav() {
    const nav = $('#nav'); if (!nav) return;
    const { name } = parseHash();
    const cr = state.credits || { accounts: [], totalDaily: 0 };
    const accounts = cr.accounts.filter((a) => a.enabled);
    const page = (id, icon, label) => `<a href="#/${id}" class="${name === id || (id === 'overview' && !name) || (id === 'lists' && name === 'list') ? 'active' : ''}">${icon} ${label}</a>`;
    const mi = (action, label, cls) => `<div class="mi ${cls || ''}" data-action="${action}">${label}</div>`;
    nav.innerHTML = `
      <div class="nav-sec">Main</div>
      ${page('overview', '🏠', 'Overview')}
      ${page('lists', '📂', 'Lead Lists (sheets)')}
      ${page('credits', '📊', 'Credits')}
      ${page('activity', '📋', isAdmin() ? 'info — Activity Log (all users)' : 'info — My Activity')}
      <div class="nav-sec menu">📧 Email Verifier menu</div>
      <div class="mi ${isAdmin() ? '' : 'locked'}" data-action="toggle-verify">${isAdmin() ? '✉️ Verify Account Emails' : '✉️ Verify Account Emails (Locked by Reachoutly 🔒)'}<span class="chev">${state.verifyOpen ? '▼' : '▶'}</span></div>
      <div class="sub ${state.verifyOpen ? 'open' : ''}">${accounts.length ? accounts.map((a) => mi('verify:' + a.name, `Verify ${esc(cap(a.name))}<small>${a.ok ? 'D: ' + num(a.daily) + ' | I: ' + num(a.instant) : 'N/A'}</small>`)).join('') : '<div class="mi locked">No API accounts configured</div>'}</div>
      <div class="sep"></div>
      ${mi('llc', `🚀 Lead List Clean <small style="color:var(--dim)">(Total D: ${num(cr.totalDaily)})</small>`)}
      ${mi('check-pending', '🔄 Check Pending Results')}
      ${mi('clear-pending', '🗑️ Clear All Pending Tasks')}
      <div class="sep"></div>
      ${mi('decision-makers', '🧹 Clean Decision Makers')}
      <div class="sep"></div>
      ${mi('cc-start', '🔄 Start Cleaning Company Names')}
      ${mi('cc-progress', '🧐 Check Cleaning Progress')}
      ${mi('cc-reset', '🗑️ Reset Cleaning Progress')}
      <div class="sep"></div>
      ${mi('show-credits', '🔃 Refresh & Show All Credits')}
      ${mi('help', '📖 Guideline / Help')}
      ${isAdmin() ? `<div class="nav-sec">Admin</div>${page('users', '👥', 'Users')}${page('settings', '🔑', 'API Keys & Settings')}${mi('debug-credits', '🔍 Debug Credit Balance')}` : ''}
      <div class="nav-sec">More</div>
      ${page('account', '👤', 'My Account')}`;
    $$('.mi', nav).forEach((el) => el.onclick = () => {
      if (el.dataset.action === 'toggle-verify') { state.verifyOpen = !state.verifyOpen; renderNav(); return; }
      if (!el.dataset.action) return;
      $('#sidebar').classList.remove('open');
      runAction(el.dataset.action).catch((err) => uiAlert('❌ ' + err.message));
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => { $('#sidebar').classList.remove('open'); closeModal(); }));
  }

  // ── Menu actions (= the sheet's menu functions) ────────────────────────────
  async function runAction(action) {
    const [name, arg] = action.split(':');
    switch (name) {
      case 'verify': return verifyAccount(arg);
      case 'llc': return leadListClean();
      case 'check-pending': return checkPendingResults();
      case 'clear-pending': return clearAllPendingTasks();
      case 'decision-makers': return cleanDecisionMakers();
      case 'cc-start': return startCleaningProcess();
      case 'cc-progress': { const p = await api('/company-cleaner/progress'); return uiAlert(p.message, '🧐 Check Cleaning Progress'); }
      case 'cc-reset': { const r = await api('/company-cleaner/reset', { method: 'POST' }); await loadLists(); return uiAlert(r.message, '🗑️ Reset Cleaning Progress'); }
      case 'show-credits': return showAllCredits();
      case 'help': return uiHtmlDialog('GuidelineDialog', '📖 Guideline & Help', 600, 500);
      case 'debug-credits': { uiBusy('🔍 Debug Credit Balance', 'Calling the Reoon API for every account…'); const r = await api('/verify/debug-credits'); return uiAlert(r.message, '🔍 Reoon API Raw Response'); }
      case 'upload': return uploadList();
      default: return;
    }
  }
  const refreshCurrentView = async () => { await loadLists(); refreshActiveSelect(); const v = routes[parseHash().name] || 'overview'; if (v === 'listDetail' || v === 'overview' || v === 'lists' || v === 'activity') views[v](parseHash().args).catch(() => {}); };

  // ✉️ Verify Account Emails → verifyEmails(tabName)
  async function verifyAccount(account) {
    if (!isAdmin()) return uiAlert('🔒 Access Denied\n\nReachoutly has prohibited everyone from using this option, so it is locked.\nYour email: ' + state.user.email);
    const l = await requireActiveList(); if (!l) return;
    uiBusy('✉️ Verify ' + cap(account), `Checking credits of "${account}" and submitting unverified emails from "${l.name}"…`);
    try {
      const r = await api('/verify/account', { method: 'POST', body: { listId: l.id, account } });
      await loadCredits(true); await refreshCurrentView();
      await uiAlert(r.message, '✉️ Verify ' + cap(account));
    } catch (e) { await uiAlert(e.message); }
  }
  // 🚀 Lead List Clean → cleanLeadList()
  async function leadListClean() {
    const l = await requireActiveList(); if (!l) return;
    const started = Date.now();
    const upd = uiBusy('🚀 Lead List Clean', `Checking Daily Credits of all accounts and submitting unverified emails from "${l.name}"…`);
    const timer = setInterval(() => upd(`Tasks submitted — polling Reoon every 10 s (up to 100 s), exactly like the sheet.\nElapsed: ${Math.round((Date.now() - started) / 1000)} s.\nResults are also written in the background every minute.`), 10000);
    try {
      const r = await api('/verify/lead-list-clean', { method: 'POST', body: { listId: l.id } });
      clearInterval(timer); await loadCredits(true); await refreshCurrentView();
      await uiAlert(r.message, '🚀 Lead List Clean');
    } catch (e) { clearInterval(timer); await uiAlert('❌ ' + e.message, '🚀 Lead List Clean'); }
  }
  // 🔄 Check Pending Results → checkPendingTaskResults()
  async function checkPendingResults() {
    const l = activeList();
    uiBusy('🔄 Check Pending Results', 'Fetching task results from Reoon…');
    let r; try { r = await api('/verify/check-pending', { method: 'POST', body: { listId: l ? l.id : null } }); } catch (e) { return uiAlert('❌ ' + e.message); }
    closeModal();
    if (r.noTasks) {
      if (r.orphanCount > 0 && l) {
        if (await uiConfirm('⚠️ Pending Rows Found', r.message)) {
          const c = await api(`/lists/${l.id}/clear-pending-rows`, { method: 'POST', body: { force: true } });
          await refreshCurrentView();
          return uiAlert(`✅ ${c.cleared} row(s) cleared.\nRun "Lead List Clean" now.`);
        }
        return;
      }
      return uiAlert(r.message);
    }
    await refreshCurrentView(); loadCredits(false);
    return uiAlert(r.message, '🔄 Check Pending Results');
  }
  // 🗑️ Clear All Pending Tasks
  async function clearAllPendingTasks() {
    if (!(await uiConfirm('⚠️ Warning', 'All pending tasks will be deleted.\nAre you sure?'))) return;
    const r = await api('/verify/clear-pending-tasks', { method: 'POST' });
    await refreshCurrentView();
    return uiAlert('✅ All pending tasks deleted successfully.' + (r.deleted ? `\n(${r.deleted} task(s))` : ''));
  }
  // 🧹 Clean Decision Makers — the ORIGINAL dialog
  async function cleanDecisionMakers() {
    const l = await requireActiveList(); if (!l) return;
    uiHtmlDialog('decision_maker', '🧹 Clean Decision Makers', 600, 580, l.id, async () => {
      await loadLists(); refreshActiveSelect();
      const cleaned = state.lists.find((x) => x.name === 'Cleaned — ' + l.name);
      if (cleaned && new Date(cleaned.updated_at.replace(' ', 'T') + 'Z').getTime() > Date.now() - 5 * 60 * 1000) { setActive(cleaned.id); location.hash = '#/list/' + cleaned.id; }
      else refreshCurrentView();
    });
  }
  // 🔄 Start Cleaning Company Names → startCleaningProcess() + cleanCompanyNames()
  async function startCleaningProcess() {
    const l = await requireActiveList(); if (!l) return;
    let r = await api('/company-cleaner/start', { method: 'POST', body: { listId: l.id } });
    if (r.needsConfirm) {
      if (!(await uiConfirm('⚠️ Tab Already Exists', r.message))) return;
      r = await api('/company-cleaner/start', { method: 'POST', body: { listId: l.id, overwrite: true } });
    }
    if (!r.ok) return uiAlert(r.message);
    await loadLists(); refreshActiveSelect(); setActive(r.listId); location.hash = '#/list/' + r.listId;
    await uiAlert(r.message, '🔄 Start Cleaning Company Names');
    const upd = uiBusy('🤖 Cleaning Company Names', 'Starting…');
    $('#m-x').onclick = closeModal;
    for (;;) {
      await new Promise((res) => setTimeout(res, 3000));
      if (!$('#busy-text')) return;
      let p; try { p = await api('/company-cleaner/progress'); } catch (e) { break; }
      if (!p.active) { closeModal(); await refreshCurrentView(); return uiAlert(p.doneMessage || p.message, '🤖 Company Names Cleaner'); }
      upd(`Cleaned ${num(p.processed)} / ${num(p.total)} rows (${p.percent}%) — batches of 100 via GPT.\nRemaining: ${num(p.remaining)}.\nYou can close this; cleaning continues in the background (🧐 Check Cleaning Progress).`);
    }
  }
  // 🔃 Refresh & Show All Credits → showAllCredits()
  async function showAllCredits() {
    uiBusy('🔃 Refresh & Show All Credits', 'Fetching fresh balances from Reoon for every account…');
    await loadCredits(true);
    const cr = state.credits || { accounts: [], totalDaily: 0, totalInstant: 0 };
    const lines = ['📊 All Account Credits', '══════════════════════════════════'];
    cr.accounts.forEach((a) => {
      let row = '  ' + a.name;
      if (!a.enabled) row += '  ⏸ disabled'; else if (a.ok) row += '  →  Daily: ' + a.daily + '  |  Instant: ' + a.instant; else row += '  ⚠️ Unable to fetch credits';
      lines.push(row);
    });
    if (!cr.accounts.length) lines.push('  ❌ No API accounts configured' + (isAdmin() ? ' — add them in Admin → API Keys & Settings' : ''));
    lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', '🔢 Total Daily Credits   : ' + cr.totalDaily, '⚡ Total Instant Credits : ' + cr.totalInstant);
    return uiAlert(lines.join('\n'), '🔃 Refresh & Show All Credits');
  }
  async function uploadList() {
    const r = await uiForm('📤 Upload lead list (new sheet)', [
      { name: 'file', label: 'CSV / XLSX file (first row = header)', type: 'file', accept: '.csv,.tsv,.txt,.xlsx,.xlsm', required: true },
      { name: 'name', label: 'Sheet name (optional — defaults to the file name)', help: 'Needs an <b>Email</b> column for verification; <b>Title/Job Title</b> + <b>Company</b> for Decision Makers; <b>Company</b> (+ <b>Website</b>) for Company Name Cleaner.' }
    ], 'Upload');
    if (!r || !r.file) return;
    const fd = new FormData(); fd.append('file', r.file); fd.append('name', r.name || '');
    uiBusy('📤 Uploading', 'Reading file…');
    try {
      const res = await api('/lists/upload', { method: 'POST', body: fd });
      closeModal(); await loadLists(); refreshActiveSelect(); setActive(res.list.id);
      toast(`✅ Sheet "${res.list.name}" created — ${num(res.list.row_count)} rows`, 'ok');
      location.hash = '#/list/' + res.list.id;
    } catch (e) { closeModal(); await uiAlert('❌ ' + e.message); }
  }

  // ── Views ──────────────────────────────────────────────────────────────────
  const views = {};
  const statusCls = (v) => {
    const s = String(v || '').toLowerCase().trim();
    if (!s) return ''; if (s === 'pending...') return 'c-pending'; if (s.startsWith('error')) return 'c-err';
    return 'c-' + s.replace(/[^a-z_]/g, '');
  };
  const kindBadge = (k) => ({ upload: '<span class="badge gray">upload</span>', decision_makers: '<span class="badge blue">decision makers</span>', company_clean: '<span class="badge">company clean</span>' }[k] || esc(k));

  views.overview = async () => {
    setTitle('Overview');
    const c = $('#content'); c.innerHTML = '<div class="empty">Loading…</div>';
    const [pending, act] = await Promise.all([api('/verify/pending'), api('/activity?limit=8')]);
    const cr = state.credits || { accounts: [], totalDaily: 0, totalInstant: 0 };
    const totalRows = state.lists.reduce((s, l) => s + l.row_count, 0);
    c.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><div class="lbl">Total Daily Credits</div><div class="val green">${num(cr.totalDaily)}</div><div class="sub">${cr.accounts.filter((a) => a.enabled).length} active account(s)</div></div>
        <div class="stat"><div class="lbl">Total Instant Credits</div><div class="val blue">${num(cr.totalInstant)}</div><div class="sub">protected — Lead List Clean uses daily only</div></div>
        <div class="stat"><div class="lbl">Lead Lists (sheets)</div><div class="val">${num(state.lists.length)}</div><div class="sub">${num(totalRows)} rows total</div></div>
        <div class="stat"><div class="lbl">Pending Tasks</div><div class="val ${pending.tasks.length ? 'amber' : ''}">${num(pending.tasks.length)}</div><div class="sub">checked every minute in background</div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h3>⚡ Quick actions</h3>
          <div class="actions">
            <button class="btn primary" data-run="upload">📤 Upload a lead list</button>
            <button class="btn" data-run="llc">🚀 Lead List Clean</button>
            <button class="btn" data-run="check-pending">🔄 Check Pending Results</button>
            <button class="btn" data-run="decision-makers">🧹 Clean Decision Makers</button>
            <button class="btn" data-run="cc-start">🔄 Start Cleaning Company Names</button>
            <button class="btn" data-run="show-credits">🔃 Refresh & Show All Credits</button>
          </div>
          <div class="hint" style="margin-top:10px">All tools run on the <b>active sheet</b> shown in the top bar. The full 📧 Email Verifier menu is in the sidebar, same as in the Google Sheet.</div>
          <div style="margin-top:14px">${pendingTable(pending.tasks)}</div>
        </div>
        <div class="card"><h3>📋 Recent activity <span class="right"><a class="btn sm ghost" href="#/activity">View all →</a></span></h3>${activityTable(act.rows, true)}</div>
      </div>`;
    $$('[data-run]', c).forEach((b) => b.onclick = () => runAction(b.dataset.run).catch((e) => uiAlert('❌ ' + e.message)));
  };
  function pendingTable(tasks) {
    if (!tasks.length) return '<div class="empty" style="padding:10px">✅ No pending verification tasks.</div>';
    return `<div class="tbl-wrap"><table class="t"><thead><tr><th>Task ID</th><th>Account</th><th>Sheet</th><th>Emails</th><th>Last status</th><th>Submitted</th></tr></thead><tbody>
      ${tasks.map((t) => `<tr><td>${esc(t.task_id)}</td><td>${esc(t.account)}</td><td><a href="#/list/${t.list_id}">${esc(t.list_name || '—')}</a></td><td>${num(t.total)}</td><td>${esc(t.last_status || 'submitted')}</td><td>${fmtDate(t.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  views.lists = async () => {
    setTitle('Lead Lists (sheets)');
    const c = $('#content');
    const draw = async () => {
      await loadLists(); refreshActiveSelect();
      c.innerHTML = `<div class="card"><h3>📂 Your sheets <span class="right"><button class="btn sm primary" id="up">📤 Upload CSV / XLSX</button><button class="btn sm" id="reload">↻ Refresh</button></span></h3>
        ${!state.lists.length ? '<div class="empty">No lead lists yet — upload a CSV or XLSX. Each upload becomes a sheet.</div>' : `
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Sheet</th><th>Type</th><th>Rows</th><th>Cols</th><th>Pending tasks</th>${isAdmin() ? '<th>Owner</th>' : ''}<th>Updated</th><th>Actions</th></tr></thead><tbody>
        ${state.lists.map((l) => `<tr><td><a href="#/list/${l.id}"><b>${esc(l.name)}</b></a>${l.id === state.activeId ? ' <span class="badge blue">active</span>' : ''}</td><td>${kindBadge(l.kind)}</td><td>${num(l.row_count)}</td><td title="${esc(l.columns.join(', '))}">${l.columns.length}</td>
          <td>${l.pending_tasks ? `<span class="badge amber">${l.pending_tasks} running</span>` : '—'}</td>${isAdmin() ? `<td>${esc(l.owner_email)}</td>` : ''}<td>${fmtDate(l.updated_at)}</td>
          <td><a class="btn sm" href="#/list/${l.id}">Open</a><a class="btn sm" href="/api/lists/${l.id}/download?format=csv">CSV</a><a class="btn sm" href="/api/lists/${l.id}/download?format=xlsx">XLSX</a><button class="btn sm ghost" data-rename="${l.id}">Rename</button><button class="btn sm danger" data-del="${l.id}">Delete</button></td></tr>`).join('')}
        </tbody></table></div>`}
        <div class="hint" style="margin-top:10px">First row must be the header. <b>Email</b> column → verification · <b>Title/Job Title</b> + <b>Company</b> → Decision Makers · <b>Company</b> (+ <b>Website</b>) → Company Name Cleaner.</div></div>`;
      $('#up').onclick = () => uploadList();
      $('#reload').onclick = draw;
      $$('[data-del]').forEach((b) => b.onclick = async () => {
        const l = state.lists.find((x) => x.id === Number(b.dataset.del));
        if (!(await uiConfirm('🗑️ Delete sheet', `Delete "${l.name}" (${num(l.row_count)} rows)?\nThis cannot be undone.`, 'Delete', 'Cancel'))) return;
        try { await api('/lists/' + l.id, { method: 'DELETE' }); toast('Deleted', 'ok'); } catch (e) { toast(e.message, 'err'); }
        draw();
      });
      $$('[data-rename]').forEach((b) => b.onclick = async () => {
        const l = state.lists.find((x) => x.id === Number(b.dataset.rename));
        const r = await uiForm('✏️ Rename sheet', [{ name: 'name', label: 'New name', value: l.name, required: true }], 'Rename');
        if (r) { try { await api('/lists/' + l.id, { method: 'PATCH', body: { name: r.name } }); } catch (e) { toast(e.message, 'err'); } }
        draw();
      });
    };
    await draw();
  };

  views.listDetail = async (args) => {
    const id = Number(args[0]);
    const c = $('#content'); c.innerHTML = '<div class="empty">Loading…</div>';
    let page = 0;
    const draw = async () => {
      const r = await api(`/lists/${id}?limit=${PAGE}&offset=${page * PAGE}`);
      const { list, rows, stats: st } = r;
      setActive(list.id); setTitle(list.name);
      const verifiedTotal = Object.values(st.byStatus).reduce((a, b) => a + b, 0);
      const byStatus = Object.keys(st.byStatus).sort().map((k) => `<span class="badge gray" style="margin:1px"><span class="${statusCls(k)}">${esc(k)}</span> ${num(st.byStatus[k])}</span>`).join(' ');
      const pages = Math.max(1, Math.ceil(list.row_count / PAGE));
      c.innerHTML = `
        <div class="grid grid-4" style="margin-bottom:14px">
          <div class="stat"><div class="lbl">Rows</div><div class="val">${num(list.row_count)}</div><div class="sub">${list.columns.length} columns · ${kindBadge(list.kind)}${isAdmin() && list.owner_email !== state.user.email ? ' · ' + esc(list.owner_email) : ''}</div></div>
          <div class="stat"><div class="lbl">Unverified emails</div><div class="val ${st.unverified ? 'amber' : ''}">${st.emailCol === -1 ? '—' : num(st.unverified)}</div><div class="sub">${st.emailCol === -1 ? 'no "Email" column' : 'valid emails with empty status'}</div></div>
          <div class="stat"><div class="lbl">Pending…</div><div class="val ${st.pending ? 'amber' : ''}">${num(st.pending)}</div><div class="sub">${r.pending_tasks} active task(s)</div></div>
          <div class="stat"><div class="lbl">Verified</div><div class="val green">${num(verifiedTotal)}</div><div class="sub" style="white-space:normal">${byStatus || '—'}</div></div>
        </div>
        <div class="card"><h3>📧 Email Verifier — run on this sheet <span class="right"><a class="btn sm" href="/api/lists/${list.id}/download?format=csv">⬇ CSV</a><a class="btn sm" href="/api/lists/${list.id}/download?format=xlsx">⬇ XLSX</a><button class="btn sm ghost" id="a-refresh">↻ Refresh</button></span></h3>
          <div class="actions">
            <button class="btn primary" data-run="llc">🚀 Lead List Clean (Total D: ${num(state.credits ? state.credits.totalDaily : 0)})</button>
            <button class="btn" data-run="check-pending">🔄 Check Pending Results</button>
            <button class="btn" data-run="decision-makers">🧹 Clean Decision Makers</button>
            <button class="btn" data-run="cc-start">🔄 Start Cleaning Company Names</button>
            ${isAdmin() ? `<span style="display:inline-flex;gap:6px;align-items:center"><select id="a-acc" style="width:auto;padding:6px 28px 6px 10px">${(state.credits ? state.credits.accounts : []).filter((a) => a.enabled).map((a) => `<option value="${esc(a.name)}">Verify ${esc(cap(a.name))} (${a.ok ? 'D: ' + num(a.daily) + ' | I: ' + num(a.instant) : 'N/A'})</option>`).join('') || '<option value="">no accounts</option>'}</select><button class="btn success" id="a-verify">✉️ Verify</button></span>`
              : '<button class="btn ghost" data-run="verify:locked">✉️ Verify Account Emails (Locked by Reachoutly 🔒)</button>'}
          </div>
        </div>
        <div class="card"><h3>📄 Sheet data <span class="right">rows ${num(page * PAGE + 1)}–${num(Math.min((page + 1) * PAGE, list.row_count))} of ${num(list.row_count)}</span></h3>
          <div class="sheet"><table><thead>
            <tr class="letters"><th class="rn"></th>${list.columns.map((_, i) => `<th>${colLetter(i)}</th>`).join('')}</tr>
            <tr class="header"><th class="rn">1</th>${list.columns.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
            ${rows.length ? rows.map((row) => `<tr><td class="rn">${row.row_index + 2}</td>${row.data.map((v, i) => `<td class="${i === st.statusCol ? statusCls(v) : ''}" title="${esc(v)}">${esc(v)}</td>`).join('')}</tr>`).join('') : '<tr><td class="rn">2</td><td colspan="99" class="empty">No rows</td></tr>'}
          </tbody></table></div>
          ${pages > 1 ? `<div class="pager"><button class="btn sm" id="pg-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button><span>page ${page + 1} / ${pages}</span><button class="btn sm" id="pg-next" ${page + 1 >= pages ? 'disabled' : ''}>Next →</button></div>` : ''}
        </div>`;
      $$('[data-run]', c).forEach((b) => b.onclick = () => runAction(b.dataset.run).catch((e) => uiAlert('❌ ' + e.message)));
      $('#a-refresh').onclick = draw;
      if ($('#pg-prev')) { $('#pg-prev').onclick = () => { page--; draw(); }; $('#pg-next').onclick = () => { page++; draw(); }; }
      if ($('#a-verify')) $('#a-verify').onclick = () => verifyAccount($('#a-acc').value);
    };
    await draw();
  };

  function activityTable(rows, compact) {
    if (!rows.length) return '<div class="empty">No activity yet — every automation run is logged here.</div>';
    const st = (s) => `<span class="badge ${{ completed: 'green', error: 'red', submitted: 'amber', started: 'amber', running: 'amber' }[String(s).toLowerCase()] || 'gray'}">${esc(s)}</span>`;
    if (compact) return `<div class="tbl-wrap"><table class="t"><thead><tr><th>User</th><th>Function</th><th>Sheet</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.user_email)}</td><td>${esc(r.fn)}</td><td>${r.list_id ? `<a href="#/list/${r.list_id}">${esc(r.list_name)}</a>` : esc(r.list_name)}</td><td>${st(r.status)} ${esc(r.progress)}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    const H = ['User Email', 'Function', 'Sheet', 'Task ID', 'API Account', 'Date', 'Task Name', 'Status', 'Total', 'Progress', 'Action'];
    return `<div class="sheet" style="max-height:70vh"><table><thead>
      <tr class="letters"><th class="rn"></th>${H.map((_, i) => `<th>${colLetter(i)}</th>`).join('')}</tr>
      <tr class="header"><th class="rn">1</th>${H.map((h) => `<th class="info-h">${h}</th>`).join('')}</tr></thead><tbody>
      ${rows.map((a, i) => `<tr><td class="rn">${i + 2}</td><td>${esc(a.user_email)}</td><td>${esc(a.fn)}</td><td>${a.list_id ? `<a href="#/list/${a.list_id}">${esc(a.list_name)}</a>` : esc(a.list_name)}</td><td>${esc(a.task_id)}</td><td>${esc(a.api_account)}</td><td>${fmtDate(a.created_at)}</td><td>${esc(a.task_name)}</td><td class="${statusCls(a.status)}">${esc(a.status)}</td><td>${esc(a.total === null ? '' : a.total)}</td><td>${esc(a.progress)}</td><td>${esc(a.action)}</td></tr>`).join('')}
      </tbody></table></div>`;
  }
  views.activity = async () => {
    setTitle(isAdmin() ? 'info — Activity Log (all users)' : 'info — My Activity');
    const c = $('#content');
    c.innerHTML = `<div class="card"><h3>📊 info tab — activity log ${isAdmin() ? '(misuse monitoring)' : ''} <span class="right">🔒 read-only</span></h3>
      <div class="row" style="margin-bottom:12px"><div><input type="search" id="act-q" placeholder="Search user, sheet, task id…"></div>
        <div style="max-width:240px"><select id="act-fn"><option value="">All functions</option>${['Lead List Clean', 'Verify Emails', 'Decision Maker Filter', 'Company Name Cleaner'].map((f) => `<option>${f}</option>`).join('')}</select></div>
        <div class="auto"><button class="btn" id="act-go">Filter</button></div></div>
      <div id="act-tbl"></div><div class="pager" id="act-pg"></div></div>`;
    let offset = 0; const limit = 200;
    const draw = async () => {
      const r = await api(`/activity?limit=${limit}&offset=${offset}&q=${encodeURIComponent($('#act-q').value.trim())}&fn=${encodeURIComponent($('#act-fn').value)}`);
      $('#act-tbl').innerHTML = activityTable(r.rows);
      $('#act-pg').innerHTML = `<button class="btn sm" id="ap-prev" ${offset === 0 ? 'disabled' : ''}>← Prev</button><span>${num(Math.min(offset + 1, r.total))}–${num(Math.min(offset + limit, r.total))} of ${num(r.total)}</span><button class="btn sm" id="ap-next" ${offset + limit >= r.total ? 'disabled' : ''}>Next →</button>`;
      $('#ap-prev').onclick = () => { offset = Math.max(0, offset - limit); draw(); };
      $('#ap-next').onclick = () => { offset += limit; draw(); };
    };
    $('#act-go').onclick = () => { offset = 0; draw(); };
    $('#act-q').onkeydown = (e) => { if (e.key === 'Enter') { offset = 0; draw(); } };
    $('#act-fn').onchange = () => { offset = 0; draw(); };
    await draw();
  };

  views.credits = async () => {
    setTitle('📊 Account Credits');
    const c = $('#content');
    const draw = async (force) => {
      c.innerHTML = '<div class="empty">⏳ Fetching balances…</div>';
      await loadCredits(force);
      const cr = state.credits || { accounts: [], totalDaily: 0, totalInstant: 0 };
      c.innerHTML = `
        <div class="grid grid-3" style="margin-bottom:14px">
          <div class="stat"><div class="lbl">🔢 Total Daily Credits</div><div class="val green">${num(cr.totalDaily)}</div></div>
          <div class="stat"><div class="lbl">⚡ Total Instant Credits</div><div class="val blue">${num(cr.totalInstant)}</div></div>
          <div class="stat"><div class="lbl">Accounts</div><div class="val">${cr.accounts.filter((a) => a.enabled).length} <span style="font-size:13px;color:var(--dim)">/ ${cr.accounts.length}</span></div></div>
        </div>
        <div class="card"><h3>All account credits <span class="right"><button class="btn sm" id="cr-refresh">🔃 Refresh & Show All Credits</button>${isAdmin() ? '<a class="btn sm" href="#/settings">🔑 Manage keys</a>' : ''}</span></h3>
          <div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th>Daily</th><th>Instant</th><th>Status</th><th>Fetched</th></tr></thead><tbody>
            ${cr.accounts.length ? cr.accounts.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td style="color:var(--green)">${num(a.daily)}</td><td>${num(a.instant)}</td><td>${!a.enabled ? '<span class="badge gray">disabled</span>' : a.ok ? '<span class="badge green">ok</span>' : '<span class="badge red">⚠️ unable to fetch</span>'}</td><td>${fmtDate(a.fetchedAt)}</td></tr>`).join('') : `<tr><td colspan="5" class="empty">No API accounts configured${isAdmin() ? ' — add them in API Keys & Settings.' : '. Ask your admin.'}</td></tr>`}
          </tbody></table></div></div>`;
      $('#cr-refresh').onclick = () => showAllCredits().then(() => draw(false));
    };
    await draw(false);
  };

  views.users = async () => {
    if (!isAdmin()) { location.hash = '#/'; return; }
    setTitle('👥 Users');
    const c = $('#content');
    const draw = async () => {
      const { users } = await api('/users');
      c.innerHTML = `<div class="card"><h3>👥 Users <span class="right"><button class="btn primary sm" id="u-add">+ Add user</button></span></h3>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Sheets</th><th>Runs</th><th>Last login</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td><b>${esc(u.email)}</b>${u.id === state.user.id ? ' <span class="badge blue">you</span>' : ''}</td><td>${esc(u.name)}</td><td><span class="badge ${u.role === 'admin' ? '' : 'gray'}">${u.role.toUpperCase()}</span></td>
          <td>${u.active ? '<span class="badge green">active</span>' : '<span class="badge red">deactivated</span>'}</td><td>${num(u.list_count)}</td><td>${num(u.activity_count)}</td><td>${fmtDate(u.last_login_at)}</td><td>${fmtDate(u.created_at)}</td>
          <td><button class="btn sm" data-edit="${u.id}">Edit</button><button class="btn sm" data-pw="${u.id}">Reset password</button><button class="btn sm ${u.active ? 'ghost' : 'success'}" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'Deactivate' : 'Activate'}</button><button class="btn sm danger" data-del="${u.id}">Delete</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="hint" style="margin-top:10px"><b>Admin</b>: everything, incl. ✉️ Verify Account Emails, API keys, all users' sheets and activity. <b>User</b>: own sheets, Lead List Clean, Decision Makers, Company Name Cleaner, own activity.</div></div>`;
      $('#u-add').onclick = async () => {
        const r = await uiForm('Add user', [
          { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'name', label: 'Name' },
          { name: 'password', label: 'Password (min 6 chars)', required: true },
          { name: 'role', label: 'Role', type: 'select', value: 'user', options: [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }] }
        ], 'Create');
        if (r) { try { await api('/users', { method: 'POST', body: r }); toast('User created', 'ok'); } catch (e) { toast(e.message, 'err'); } }
        draw();
      };
      $$('[data-edit]').forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.edit));
        const r = await uiForm('Edit ' + u.email, [{ name: 'name', label: 'Name', value: u.name }, { name: 'role', label: 'Role', type: 'select', value: u.role, options: [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }] }]);
        if (r) { try { await api('/users/' + u.id, { method: 'PATCH', body: r }); } catch (e) { toast(e.message, 'err'); } }
        draw();
      });
      $$('[data-pw]').forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.pw));
        const r = await uiForm('Reset password — ' + u.email, [{ name: 'password', label: 'New password (min 6 chars)', required: true }], 'Reset');
        if (r) { try { await api('/users/' + u.id, { method: 'PATCH', body: { password: r.password } }); toast('Password reset', 'ok'); } catch (e) { toast(e.message, 'err'); } }
        draw();
      });
      $$('[data-toggle]').forEach((b) => b.onclick = async () => { try { await api('/users/' + b.dataset.toggle, { method: 'PATCH', body: { active: b.dataset.active !== '1' } }); } catch (e) { toast(e.message, 'err'); } draw(); });
      $$('[data-del]').forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.del));
        if (await uiConfirm('Delete user', `Delete ${u.email}?\nTheir sheets (${u.list_count}) will be deleted too. Activity log entries are kept.`, 'Delete', 'Cancel')) {
          try { await api('/users/' + u.id, { method: 'DELETE' }); await loadLists(); refreshActiveSelect(); } catch (e) { toast(e.message, 'err'); }
        }
        draw();
      });
    };
    await draw();
  };

  views.settings = async () => {
    if (!isAdmin()) { location.hash = '#/'; return; }
    setTitle('🔑 API Keys & Settings');
    const c = $('#content');
    const draw = async () => {
      const s = await api('/settings');
      c.innerHTML = `
        <div class="card"><h3>🏦 Reoon API accounts (Script Properties: API_KEY_&lt;name&gt;) <span class="right"><button class="btn primary sm" id="k-add">+ Add account</button></span></h3>
          <div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th>API key</th><th>Enabled</th><th>Added</th><th>Actions</th></tr></thead><tbody>
          ${s.accounts.length ? s.accounts.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td><code>${esc(a.keyMasked)}</code></td><td>${a.enabled ? '<span class="badge green">enabled</span>' : '<span class="badge gray">disabled</span>'}</td><td>${fmtDate(a.created_at)}</td>
            <td><button class="btn sm" data-key="${a.id}">Change key</button><button class="btn sm" data-rename="${a.id}">Rename</button><button class="btn sm ${a.enabled ? 'ghost' : 'success'}" data-toggle="${a.id}" data-en="${a.enabled ? 1 : 0}">${a.enabled ? 'Disable' : 'Enable'}</button><button class="btn sm danger" data-del="${a.id}">Delete</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty">No accounts yet — add the Reoon accounts here (same names as the sheet tabs).</td></tr>'}
          </tbody></table></div>
          <div class="hint" style="margin-top:8px">Lead List Clean splits emails across all <b>enabled</b> accounts using Daily credits only. Keys are stored locally and never shown in full.</div></div>
        <div class="card"><h3>🤖 OpenAI (CHATGPT_API_KEY) — Company Names Cleaner</h3>
          <form id="oa-form" class="row">
            <div><label class="f">API key ${s.openai.hasKey ? `<span class="badge green">set: ${esc(s.openai.keyMasked)}</span>` : '<span class="badge red">not set</span>'}</label><input type="password" name="apiKey" placeholder="sk-… (blank = keep current)" autocomplete="new-password"></div>
            <div style="max-width:220px"><label class="f">Model</label><input type="text" name="model" value="${esc(s.openai.model)}"></div>
            <div class="auto"><button class="btn primary" type="submit">Save</button></div>
            <div class="auto"><button class="btn danger" type="button" id="oa-clear" ${s.openai.hasKey ? '' : 'disabled'}>Clear key</button></div>
          </form></div>
        <div class="card"><h3>ℹ️ Runtime</h3><div class="hint">Reoon API base: <code>${esc(s.reoonApiBase)}</code> · background result poll every <b>${s.pollIntervalSeconds}s</b> (the 1-minute trigger) · credits refresh every 10 min · change in <code>.env</code> and restart.</div></div>`;
      $('#k-add').onclick = async () => {
        const r = await uiForm('Add Reoon account', [{ name: 'name', label: 'Account name (e.g. emailastrallc)', required: true }, { name: 'apiKey', label: 'Reoon API key', required: true }], 'Add');
        if (r) { try { const res = await api('/settings/accounts', { method: 'POST', body: r }); toast(res.warning || `Added — Daily: ${res.balance.daily} | Instant: ${res.balance.instant}`, res.warning ? 'err' : 'ok'); loadCredits(false); } catch (e) { toast(e.message, 'err'); } }
        draw();
      };
      $$('[data-key]').forEach((b) => b.onclick = async () => {
        const a = s.accounts.find((x) => x.id === Number(b.dataset.key));
        const r = await uiForm('Change key — ' + a.name, [{ name: 'apiKey', label: 'New Reoon API key', required: true }]);
        if (r) { try { const res = await api('/settings/accounts/' + a.id, { method: 'PATCH', body: r }); toast(res.balance ? `Saved — Daily: ${res.balance.daily} | Instant: ${res.balance.instant}` : 'Saved, but balance check failed — verify the key.', res.balance ? 'ok' : 'err'); loadCredits(false); } catch (e) { toast(e.message, 'err'); } }
        draw();
      });
      $$('[data-rename]').forEach((b) => b.onclick = async () => {
        const a = s.accounts.find((x) => x.id === Number(b.dataset.rename));
        const r = await uiForm('Rename account', [{ name: 'name', label: 'Name', value: a.name, required: true }]);
        if (r) { try { await api('/settings/accounts/' + a.id, { method: 'PATCH', body: r }); loadCredits(false); } catch (e) { toast(e.message, 'err'); } }
        draw();
      });
      $$('[data-toggle]').forEach((b) => b.onclick = async () => { try { await api('/settings/accounts/' + b.dataset.toggle, { method: 'PATCH', body: { enabled: b.dataset.en !== '1' } }); loadCredits(false); } catch (e) { toast(e.message, 'err'); } draw(); });
      $$('[data-del]').forEach((b) => b.onclick = async () => {
        const a = s.accounts.find((x) => x.id === Number(b.dataset.del));
        if (await uiConfirm('Delete account', `Remove Reoon account "${a.name}"?`, 'Delete', 'Cancel')) { try { await api('/settings/accounts/' + a.id, { method: 'DELETE' }); loadCredits(false); } catch (e) { toast(e.message, 'err'); } }
        draw();
      });
      $('#oa-form').onsubmit = async (e) => { e.preventDefault(); try { await api('/settings/openai', { method: 'POST', body: { apiKey: e.target.apiKey.value, model: e.target.model.value } }); toast('Saved', 'ok'); } catch (err) { toast(err.message, 'err'); } draw(); };
      $('#oa-clear').onclick = async () => { if (await uiConfirm('Clear OpenAI key', 'Remove the stored OpenAI API key?', 'Clear', 'Cancel')) await api('/settings/openai', { method: 'POST', body: { clearKey: true } }); draw(); };
    };
    await draw();
  };

  views.account = async () => {
    setTitle('👤 My Account');
    $('#content').innerHTML = `<div class="grid grid-2">
      <div class="card"><h3>Profile</h3><p style="color:var(--muted);line-height:1.8">Email: <b style="color:var(--text)">${esc(state.user.email)}</b><br>Name: ${esc(state.user.name || '—')}<br>Role: <span class="badge ${isAdmin() ? '' : 'gray'}">${state.user.role.toUpperCase()}</span></p>
        <div class="hint" style="margin-top:8px">${isAdmin() ? 'Admins can manage users and API keys, see every user\'s activity and sheets, and run ✉️ Verify Account Emails.' : 'Users can upload their own sheets and run Lead List Clean, Clean Decision Makers and Company Name Cleaner. ✉️ Verify Account Emails and admin pages are locked.'}</div></div>
      <div class="card"><h3>🔒 Change password</h3><form id="pw-form">
        <div class="field"><label class="f">Current password</label><input type="password" name="currentPassword" required autocomplete="current-password"></div>
        <div class="field"><label class="f">New password (min 6 chars)</label><input type="password" name="newPassword" required autocomplete="new-password"></div>
        <button class="btn primary" type="submit">Update password</button></form></div></div>`;
    $('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/auth/password', { method: 'POST', body: { currentPassword: e.target.currentPassword.value, newPassword: e.target.newPassword.value } }); toast('✅ Password updated', 'ok'); e.target.reset(); } catch (err) { toast(err.message, 'err'); }
    };
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  function loginView() {
    return `<div class="login-wrap"><div class="login-card">
      <h1>📧 Email Verifier</h1><div class="sub">Reoon API Dashboard — sign in to continue</div>
      <form id="login-form">
        <div class="field"><label class="f">Email</label><input type="email" name="email" required autofocus autocomplete="username"></div>
        <div class="field"><label class="f">Password</label><input type="password" name="password" required autocomplete="current-password"></div>
        <div id="login-err"></div>
        <button class="btn primary" style="width:100%;justify-content:center" type="submit">Sign in</button>
      </form></div></div>`;
  }
  function bindLogin() {
    $('#login-form').onsubmit = async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        state.user = (await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } })).user;
        await afterLogin(); render();
      } catch (err) { console.error(err); const el = $('#login-err'); if (el) el.innerHTML = `<div class="alert err">${esc(err.message)}</div>`; else toast('❌ ' + err.message, 'err'); }
    };
  }

  // Auto-refresh the open sheet while its tasks are running (results are written in the background)
  setInterval(() => {
    if (!state.user || modalRoot().children.length) return;
    const { name, args } = parseHash();
    if (name !== 'list') return;
    const l = state.lists.find((x) => x.id === Number(args[0]));
    if (l && l.pending_tasks) loadLists().then(() => views.listDetail(args));
  }, 30000);

  boot();
})();

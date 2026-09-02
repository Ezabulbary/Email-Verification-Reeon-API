/* =============================================================================
   Email Verification Dashboard — frontend (vanilla JS, hash router)
   ========================================================================== */
(function () {
  'use strict';

  // ── Helpers ────────────────────────────────────────────────────────────────
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtDate = (s) => (s ? String(s).replace('T', ' ').slice(0, 16) : '—');
  const num = (n) => (n === null || n === undefined ? '—' : Number(n).toLocaleString());

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: {} };
    if (opts.body instanceof FormData) o.body = opts.body;
    else if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
    const res = await fetch('/api' + path, o);
    let data = null;
    try { data = await res.json(); } catch (e) { data = {}; }
    if (res.status === 401 && !path.startsWith('/auth/')) { state.user = null; render(); throw new Error('Session expired — please log in again.'); }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }

  function toast(msg, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    $('#toasts').appendChild(t);
    setTimeout(() => t.remove(), type === 'err' ? 7000 : 4500);
  }

  /** Modal with pre-formatted text (like SpreadsheetApp.getUi().alert) */
  function alertBox(title, text) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-bg"><div class="modal"><h3>${esc(title)}</h3><pre>${esc(text)}</pre>
        <div class="foot"><button class="btn primary" id="m-ok">OK</button></div></div></div>`;
      $('#m-ok').onclick = () => { root.innerHTML = ''; resolve(); };
      $('#m-ok').focus();
    });
  }
  function confirmBox(title, text, okLabel) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-bg"><div class="modal"><h3>${esc(title)}</h3><pre>${esc(text)}</pre>
        <div class="foot"><button class="btn" id="m-no">Cancel</button><button class="btn danger" id="m-yes">${esc(okLabel || 'Yes')}</button></div></div></div>`;
      $('#m-no').onclick = () => { root.innerHTML = ''; resolve(false); };
      $('#m-yes').onclick = () => { root.innerHTML = ''; resolve(true); };
    });
  }
  /** Generic form modal. fields: [{name,label,type,value,options,placeholder}] → resolves object or null */
  function formBox(title, fields, okLabel) {
    return new Promise((resolve) => {
      const root = $('#modal-root');
      root.innerHTML = `<div class="modal-bg"><div class="modal"><h3>${esc(title)}</h3><form id="m-form">
        ${fields.map((f) => `<div class="field"><label class="f">${esc(f.label)}</label>${
          f.type === 'select'
            ? `<select name="${esc(f.name)}">${f.options.map((o) => `<option value="${esc(o.value)}" ${o.value === f.value ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`
            : f.type === 'checkbox'
              ? `<label class="check"><input type="checkbox" name="${esc(f.name)}" ${f.value ? 'checked' : ''}> ${esc(f.hint || '')}</label>`
              : `<input type="${esc(f.type || 'text')}" name="${esc(f.name)}" value="${esc(f.value || '')}" placeholder="${esc(f.placeholder || '')}" ${f.required ? 'required' : ''} autocomplete="off">`
        }${f.help ? `<div style="font-size:11px;color:var(--dim);margin-top:3px">${esc(f.help)}</div>` : ''}</div>`).join('')}
        <div class="foot"><button type="button" class="btn" id="m-no">Cancel</button><button type="submit" class="btn primary">${esc(okLabel || 'Save')}</button></div>
      </form></div></div>`;
      $('#m-no').onclick = () => { root.innerHTML = ''; resolve(null); };
      $('#m-form').onsubmit = (e) => {
        e.preventDefault();
        const out = {};
        fields.forEach((f) => {
          const el = $(`[name="${f.name}"]`, root);
          out[f.name] = f.type === 'checkbox' ? el.checked : el.value;
        });
        root.innerHTML = '';
        resolve(out);
      };
      const first = $('input, select', root); if (first) first.focus();
    });
  }

  function statusClass(s) {
    const v = String(s || '').toLowerCase().trim();
    if (!v) return '';
    if (v === 'pending...') return 'status-pending';
    return 'status-' + v.replace(/[^a-z_]/g, '');
  }

  // ── State / routing ────────────────────────────────────────────────────────
  const state = { user: null, credits: null, listsCache: null };

  const routes = {
    '': 'overview', overview: 'overview', lists: 'lists', list: 'listDetail', 'decision-makers': 'decisionMakers',
    'company-cleaner': 'companyCleaner', activity: 'activity', credits: 'credits', users: 'users', settings: 'settings',
    help: 'help', account: 'account'
  };
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const [name, ...rest] = h.split('/');
    return { name: name || '', args: rest };
  }
  window.addEventListener('hashchange', render);

  async function boot() {
    try { const r = await api('/auth/me'); state.user = r.user; } catch (e) { state.user = null; }
    render();
    if (state.user) refreshCredits();
  }

  async function refreshCredits(force) {
    try {
      state.credits = await api('/verify/credits' + (force ? '?refresh=1' : ''));
      const pill = $('#credits-pill');
      if (pill) pill.innerHTML = creditsPill();
    } catch (e) { /* ignore */ }
  }
  function creditsPill() {
    if (!state.credits) return '⏳ credits…';
    return `Total Daily: <b>${num(state.credits.totalDaily)}</b> &nbsp;|&nbsp; Instant: <b>${num(state.credits.totalInstant)}</b>`;
  }

  // ── Render shell ───────────────────────────────────────────────────────────
  function render() {
    const app = $('#app');
    $('#modal-root').innerHTML = ''; // close any open modal on navigation
    if (!state.user) { app.innerHTML = loginView(); bindLogin(); return; }
    const { name, args } = parseHash();
    const view = routes[name] || 'overview';
    const isAdmin = state.user.role === 'admin';
    const nav = (id, icon, label, extra) => `<a href="#/${id}" class="${name === id || (id === 'overview' && !name) || (id === 'lists' && name === 'list') ? 'active' : ''}">${icon} ${label}${extra || ''}</a>`;

    app.innerHTML = `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="brand">📧 <span>Email Verifier<small>Reoon API Dashboard</small></span></div>
          <nav class="nav">
            <div class="nav-sec">Main</div>
            ${nav('overview', '🏠', 'Overview')}
            ${nav('lists', '📂', 'Lead Lists')}
            ${nav('credits', '📊', 'Credits')}
            <div class="nav-sec">Tools</div>
            ${nav('decision-makers', '🧹', 'Clean Decision Makers')}
            ${nav('company-cleaner', '🤖', 'Company Name Cleaner')}
            ${nav('activity', '📋', isAdmin ? 'Activity Log (all users)' : 'My Activity')}
            ${isAdmin ? `<div class="nav-sec">Admin</div>${nav('users', '👥', 'Users')}${nav('settings', '🔑', 'API Keys & Settings')}` : ''}
            <div class="nav-sec">More</div>
            ${nav('help', '📖', 'Guideline / Help')}
            ${nav('account', '👤', 'My Account')}
          </nav>
          <div class="me"><b>${esc(state.user.email)}</b><span class="badge ${isAdmin ? '' : 'gray'}">${isAdmin ? 'ADMIN' : 'USER'}</span>
            <button class="btn ghost sm" id="logout" style="float:right">Logout</button></div>
        </aside>
        <div class="main">
          <div class="topbar">
            <div style="display:flex;align-items:center;gap:10px"><button class="btn sm menu-btn" id="menu-btn">☰</button><h2 id="page-title"></h2></div>
            <div class="credits-pill" id="credits-pill">${creditsPill()}</div>
          </div>
          <div class="content" id="content"></div>
        </div>
      </div>`;
    $('#logout').onclick = async () => { await api('/auth/logout', { method: 'POST' }); state.user = null; location.hash = ''; render(); };
    $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
    $$('.nav a').forEach((a) => a.addEventListener('click', () => $('#sidebar').classList.remove('open')));
    views[view](args).catch((e) => { $('#content').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; });
  }
  function setTitle(t) { $('#page-title').textContent = t; document.title = t + ' — Email Verifier'; }

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
        const r = await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } });
        state.user = r.user; render(); refreshCredits();
      } catch (err) { $('#login-err').innerHTML = `<div class="alert err">${esc(err.message)}</div>`; }
    };
  }

  // ── Shared: list selector ──────────────────────────────────────────────────
  async function loadLists(force) {
    if (!state.listsCache || force) state.listsCache = (await api('/lists')).lists;
    return state.listsCache;
  }
  function listOptions(lists, selectedId) {
    if (!lists.length) return '<option value="">— no lists uploaded yet —</option>';
    return '<option value="">— select a list —</option>' + lists.map((l) =>
      `<option value="${l.id}" ${Number(selectedId) === l.id ? 'selected' : ''}>${esc(l.name)} (${num(l.row_count)} rows${state.user.role === 'admin' && l.owner_email !== state.user.email ? ', ' + esc(l.owner_email) : ''})</option>`).join('');
  }

  const views = {};

  // ── Overview ───────────────────────────────────────────────────────────────
  views.overview = async () => {
    setTitle('Overview');
    const c = $('#content');
    c.innerHTML = '<div class="empty">Loading…</div>';
    const [lists, pending, act] = await Promise.all([loadLists(true), api('/verify/pending'), api('/activity?limit=8')]);
    if (!state.credits) await refreshCredits();
    const cr = state.credits || { accounts: [], totalDaily: 0, totalInstant: 0 };
    const totalRows = lists.reduce((s, l) => s + l.row_count, 0);
    c.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><div class="lbl">Total Daily Credits</div><div class="val green">${num(cr.totalDaily)}</div><div class="sub">${cr.accounts.filter((a) => a.enabled).length} active account(s)</div></div>
        <div class="stat"><div class="lbl">Total Instant Credits</div><div class="val blue">${num(cr.totalInstant)}</div><div class="sub">protected — Lead List Clean uses daily only</div></div>
        <div class="stat"><div class="lbl">Lead Lists</div><div class="val">${num(lists.length)}</div><div class="sub">${num(totalRows)} rows total</div></div>
        <div class="stat"><div class="lbl">Pending Tasks</div><div class="val ${pending.tasks.length ? 'amber' : ''}">${num(pending.tasks.length)}</div><div class="sub">checked every minute in background</div></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h3>⚡ Quick actions</h3>
          <div class="actions">
            <a class="btn primary" href="#/lists">📤 Upload a lead list</a>
            <a class="btn" href="#/decision-makers">🧹 Clean Decision Makers</a>
            <a class="btn" href="#/company-cleaner">🤖 Company Name Cleaner</a>
            <button class="btn" id="ov-check">🔄 Check Pending Results</button>
          </div>
          <div id="ov-pending" style="margin-top:12px">${pendingTable(pending.tasks)}</div>
        </div>
        <div class="card"><h3>📋 Recent activity <span class="right"><a class="btn sm ghost" href="#/activity">View all →</a></span></h3>${activityTable(act.rows, true)}</div>
      </div>`;
    $('#ov-check').onclick = () => checkPending();
  };

  function pendingTable(tasks) {
    if (!tasks.length) return '<div class="empty" style="padding:10px">✅ No pending verification tasks.</div>';
    return `<div class="tbl-wrap"><table><thead><tr><th>Task ID</th><th>Account</th><th>List</th><th>Emails</th><th>Last status</th><th>Submitted</th></tr></thead><tbody>
      ${tasks.map((t) => `<tr><td>${esc(t.task_id)}</td><td>${esc(t.account)}</td><td><a href="#/list/${t.list_id}">${esc(t.list_name || '—')}</a></td><td>${num(t.total)}</td><td>${esc(t.last_status || 'submitted')}</td><td>${fmtDate(t.created_at)}</td></tr>`).join('')}
    </tbody></table></div>`;
  }

  async function checkPending() {
    toast('🔄 Checking pending tasks…');
    try { const r = await api('/verify/check-pending', { method: 'POST' }); await alertBox('🔄 Check Pending Results', r.message); state.listsCache = null; render(); refreshCredits(); }
    catch (e) { toast(e.message, 'err'); }
  }

  // ── Lists ──────────────────────────────────────────────────────────────────
  views.lists = async () => {
    setTitle('Lead Lists');
    const c = $('#content');
    c.innerHTML = `
      <div class="card"><h3>📤 Upload a lead list (CSV / XLSX)</h3>
        <form id="up-form" class="row">
          <div><label class="f">File</label><input type="file" name="file" accept=".csv,.tsv,.txt,.xlsx,.xlsm" required></div>
          <div><label class="f">List name (optional)</label><input type="text" name="name" placeholder="defaults to file name"></div>
          <div class="auto"><button class="btn primary" type="submit">Upload</button></div>
        </form>
        <div style="font-size:11.5px;color:var(--dim);margin-top:8px">First row must be the header. Needs an <b>Email</b> column for verification; <b>Title/Job Title</b> + <b>Company</b> for Decision Makers; <b>Company</b> (+ optional <b>Website</b>) for Company Name Cleaner.</div>
        <div id="up-msg"></div>
      </div>
      <div class="card"><h3>📂 Your lists <span class="right"><button class="btn sm" id="reload">↻ Refresh</button></span></h3><div id="lists-tbl"><div class="empty">Loading…</div></div></div>`;
    $('#up-form').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const btn = $('button[type=submit]', e.target); btn.disabled = true; btn.textContent = 'Uploading…';
      try {
        const r = await api('/lists/upload', { method: 'POST', body: fd });
        toast(`✅ Uploaded "${r.list.name}" — ${num(r.list.row_count)} rows`, 'ok');
        e.target.reset(); state.listsCache = null; location.hash = '#/list/' + r.list.id;
      } catch (err) { $('#up-msg').innerHTML = `<div class="alert err" style="margin-top:10px">${esc(err.message)}</div>`; }
      finally { btn.disabled = false; btn.textContent = 'Upload'; }
    };
    $('#reload').onclick = () => renderListsTable(true);
    await renderListsTable(true);
  };

  async function renderListsTable(force) {
    const lists = await loadLists(force);
    const isAdmin = state.user.role === 'admin';
    const kindBadge = (k) => ({ upload: '<span class="badge gray">upload</span>', decision_makers: '<span class="badge blue">decision makers</span>', company_clean: '<span class="badge">company clean</span>' }[k] || esc(k));
    $('#lists-tbl').innerHTML = !lists.length ? '<div class="empty">No lists yet — upload a CSV or XLSX above.</div>' : `
      <div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Type</th><th>Rows</th><th>Columns</th><th>Pending tasks</th>${isAdmin ? '<th>Owner</th>' : ''}<th>Updated</th><th>Actions</th></tr></thead><tbody>
      ${lists.map((l) => `<tr>
        <td><a href="#/list/${l.id}"><b>${esc(l.name)}</b></a></td><td>${kindBadge(l.kind)}</td><td>${num(l.row_count)}</td><td title="${esc(l.columns.join(', '))}">${l.columns.length}</td>
        <td>${l.pending_tasks ? `<span class="badge amber">${l.pending_tasks} running</span>` : '—'}</td>${isAdmin ? `<td>${esc(l.owner_email)}</td>` : ''}<td>${fmtDate(l.updated_at)}</td>
        <td><a class="btn sm" href="#/list/${l.id}">Open</a><a class="btn sm" href="/api/lists/${l.id}/download?format=csv">CSV</a><a class="btn sm" href="/api/lists/${l.id}/download?format=xlsx">XLSX</a>
            <button class="btn sm ghost" data-rename="${l.id}">Rename</button><button class="btn sm danger" data-del="${l.id}">Delete</button></td></tr>`).join('')}
      </tbody></table></div>`;
    $$('[data-del]').forEach((b) => b.onclick = async () => {
      const l = lists.find((x) => x.id === Number(b.dataset.del));
      if (!(await confirmBox('🗑️ Delete list', `Delete "${l.name}" (${num(l.row_count)} rows)?\nThis cannot be undone.`, 'Delete'))) return;
      try { await api('/lists/' + l.id, { method: 'DELETE' }); toast('Deleted', 'ok'); renderListsTable(true); } catch (e) { toast(e.message, 'err'); }
    });
    $$('[data-rename]').forEach((b) => b.onclick = async () => {
      const l = lists.find((x) => x.id === Number(b.dataset.rename));
      const r = await formBox('Rename list', [{ name: 'name', label: 'New name', value: l.name, required: true }]);
      if (!r) return;
      try { await api('/lists/' + l.id, { method: 'PATCH', body: { name: r.name } }); renderListsTable(true); } catch (e) { toast(e.message, 'err'); }
    });
  }

  // ── List detail ────────────────────────────────────────────────────────────
  views.listDetail = async (args) => {
    const id = Number(args[0]);
    const c = $('#content');
    c.innerHTML = '<div class="empty">Loading…</div>';
    let page = 0; const limit = 100;
    const isAdmin = state.user.role === 'admin';

    async function draw() {
      const r = await api(`/lists/${id}?limit=${limit}&offset=${page * limit}`);
      const { list, rows, stats } = r;
      setTitle(list.name);
      const accounts = (state.credits ? state.credits.accounts : []).filter((a) => a.enabled);
      const byStatus = Object.keys(stats.byStatus).sort().map((k) => `<span class="badge gray" style="margin:2px"><span class="${statusClass(k)}">${esc(k)}</span>: ${num(stats.byStatus[k])}</span>`).join(' ');
      c.innerHTML = `
        <div class="grid grid-4" style="margin-bottom:14px">
          <div class="stat"><div class="lbl">Rows</div><div class="val">${num(list.row_count)}</div><div class="sub">${list.columns.length} columns · ${esc(list.kind)}</div></div>
          <div class="stat"><div class="lbl">Unverified emails</div><div class="val ${stats.unverified ? 'amber' : ''}">${stats.emailCol === -1 ? '—' : num(stats.unverified)}</div><div class="sub">${stats.emailCol === -1 ? 'no Email column' : 'valid emails with empty status'}</div></div>
          <div class="stat"><div class="lbl">Pending…</div><div class="val ${stats.pending ? 'amber' : ''}">${num(stats.pending)}</div><div class="sub">${r.pending_tasks} active task(s)</div></div>
          <div class="stat"><div class="lbl">Verified</div><div class="val green">${num(Object.values(stats.byStatus).reduce((a, b) => a + b, 0))}</div><div class="sub" style="white-space:normal">${byStatus || '—'}</div></div>
        </div>
        <div class="card"><h3>⚡ Actions${isAdmin && list.owner_email !== state.user.email ? ` <span class="badge gray">owner: ${esc(list.owner_email)}</span>` : ''}</h3>
          <div class="actions">
            <button class="btn primary" id="a-llc" ${stats.emailCol === -1 ? 'disabled title="No Email column"' : ''}>🚀 Lead List Clean (Total D: ${num(state.credits ? state.credits.totalDaily : 0)})</button>
            <button class="btn" id="a-check">🔄 Check Pending Results</button>
            <button class="btn" id="a-clear-rows" ${stats.pending ? '' : 'disabled'}>🧽 Clear "Pending…" rows (${num(stats.pending)})</button>
            <a class="btn" href="#/decision-makers/${list.id}">🧹 Clean Decision Makers</a>
            <a class="btn" href="#/company-cleaner/${list.id}">🤖 Clean Company Names</a>
            <a class="btn" href="/api/lists/${list.id}/download?format=csv">⬇ CSV</a>
            <a class="btn" href="/api/lists/${list.id}/download?format=xlsx">⬇ XLSX</a>
            <button class="btn ghost" id="a-refresh">↻ Refresh</button>
          </div>
          ${isAdmin ? `<div class="row" style="margin-top:12px;align-items:center">
              <div class="auto" style="font-weight:600;color:var(--muted)">✉️ Verify Account Emails (admin):</div>
              <div style="max-width:320px"><select id="a-acc">${accounts.length ? accounts.map((a) => `<option value="${esc(a.name)}">Verify ${esc(a.name)} (D: ${num(a.daily)} | I: ${num(a.instant)})</option>`).join('') : '<option value="">no enabled accounts</option>'}</select></div>
              <div class="auto"><button class="btn success" id="a-verify" ${!accounts.length || stats.emailCol === -1 ? 'disabled' : ''}>Verify with this account</button></div>
            </div>` : '<div style="font-size:11.5px;color:var(--dim);margin-top:10px">✉️ Verify Account Emails (per-account) is 🔒 locked — admin only.</div>'}
        </div>
        <div class="card"><h3>📄 Data <span class="right"><span style="color:var(--dim);font-weight:500;text-transform:none;letter-spacing:0">rows ${num(page * limit + 1)}–${num(Math.min((page + 1) * limit, list.row_count))} of ${num(list.row_count)}</span></span></h3>
          <div class="tbl-wrap" style="max-height:65vh;overflow:auto"><table><thead><tr><th>#</th>${list.columns.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
            ${rows.length ? rows.map((row) => `<tr><td style="color:var(--faint)">${row.row_index + 1}</td>${row.data.map((v, i) => `<td class="${i === stats.statusCol ? statusClass(v) : ''}" title="${esc(v)}">${esc(v)}</td>`).join('')}</tr>`).join('') : '<tr><td colspan="99" class="empty">No rows</td></tr>'}
          </tbody></table></div>
          <div class="pager"><button class="btn sm" id="pg-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button><span>page ${page + 1} / ${Math.max(1, Math.ceil(list.row_count / limit))}</span><button class="btn sm" id="pg-next" ${(page + 1) * limit >= list.row_count ? 'disabled' : ''}>Next →</button></div>
        </div>`;

      $('#pg-prev').onclick = () => { page--; draw(); };
      $('#pg-next').onclick = () => { page++; draw(); };
      $('#a-refresh').onclick = () => draw();
      $('#a-check').onclick = async () => { await checkPending(); draw(); };
      $('#a-llc').onclick = async () => {
        if (!(await confirmBox('🚀 Lead List Clean', `Submit ${num(stats.unverified)} unverified email(s) from "${list.name}" for verification?\n\nEmails are split across all enabled Reoon accounts using DAILY credits only.`, 'Start'))) return;
        const b = $('#a-llc'); b.disabled = true; b.textContent = '⏳ Submitting…';
        try { const res = await api('/verify/lead-list-clean', { method: 'POST', body: { listId: id } }); await alertBox('📊 Lead List Clean', res.message); refreshCredits(true); }
        catch (e) { await alertBox('❌ Lead List Clean', e.message); }
        draw();
      };
      $('#a-clear-rows').onclick = async () => {
        const info = await api(`/lists/${id}/pending-rows`);
        const force = info.activeTasks > 0;
        const ok = await confirmBox('⚠️ Pending Rows Found', `${info.pendingRows} row(s) have "Pending..." status${force ? ` but ${info.activeTasks} task(s) are still active for this list` : ' and no active Task ID'}.\n\nClearing them will allow them to be processed again in the next run.${force ? '\n\n⚠️ Active tasks will no longer be able to write results to these rows.' : ''}\nDo you want to clear them?`, 'Clear');
        if (!ok) return;
        try { const res = await api(`/lists/${id}/clear-pending-rows`, { method: 'POST', body: { force } }); toast(res.message, 'ok'); } catch (e) { toast(e.message, 'err'); }
        draw();
      };
      if ($('#a-verify')) $('#a-verify').onclick = async () => {
        const account = $('#a-acc').value;
        if (!(await confirmBox('✉️ Verify Account Emails', `Verify ${num(stats.unverified)} email(s) from "${list.name}" using account "${account}"?\n\nThis may use daily AND instant credits of that account.`, 'Verify'))) return;
        try { const res = await api('/verify/account', { method: 'POST', body: { listId: id, account } }); await alertBox('✉️ Verify Account Emails', res.message); refreshCredits(true); }
        catch (e) { await alertBox('❌ Verify Account Emails', e.message); }
        draw();
      };
    }
    await draw();
  };

  // ── Decision makers ────────────────────────────────────────────────────────
  views.decisionMakers = async (args) => {
    setTitle('🧹 Clean Decision Makers');
    const c = $('#content');
    const lists = await loadLists();
    const preselect = args[0] || '';

    c.innerHTML = `
      <div class="card"><h3>📂 Source list</h3><div class="row"><div><select id="dm-list">${listOptions(lists, preselect)}</select></div></div>
        <div style="font-size:11.5px;color:var(--dim);margin-top:6px">Requires <b>Title / Job Title</b> and <b>Company / Company Name</b> columns. Output goes to a new list <b>"Cleaned — [name]"</b>.</div></div>
      <div class="grid" style="grid-template-columns: minmax(0, 1.4fr) minmax(280px, 1fr)">
        <div>
          <div class="tags-bar" id="tagsBar"></div>
          <div class="fcard open" id="fc-kw"><div class="fcard-h"><div class="fcard-t">🔑 Title Keywords <span class="badge" id="badge-kw" style="display:none">0</span></div><svg class="chev" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>
            <div class="fcard-b"><div class="kw-box" id="kwBox"><input class="kw-input" id="kwInput" placeholder="Type a keyword and press Enter…"></div>
              <div class="suggest-label">Suggestions (empty = 29 default decision-maker titles)</div><div class="suggest-wrap" id="suggestWrap"></div></div></div>
          ${['seniority', 'industry', 'departments', 'country'].map((cat) => `
          <div class="fcard" id="fc-${cat}"><div class="fcard-h"><div class="fcard-t">${{ seniority: '🎖 Seniority', industry: '🏭 Industry', departments: '🏢 Departments', country: '🌍 Country' }[cat]} <span class="badge" id="badge-${cat}" style="display:none">0</span></div><svg class="chev" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg></div>
            <div class="fcard-b">
              <div class="search-wrap"><svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input type="search" placeholder="Search ${cat}…" data-search="${cat}"></div>
              ${cat !== 'departments' ? `<div class="add-row"><input type="text" id="input-${cat}" placeholder="Add custom ${cat}…"><button class="btn sm" data-add="${cat}">+ Add</button></div><div class="opt-list" id="list-${cat}"></div>` : `<div class="dept-list" id="dept-container"></div>`}
              <div class="no-res" id="nr-${cat}">No results</div>
            </div></div>`).join('')}
        </div>
        <div>
          <div class="card" style="position:sticky;top:70px">
            <h3>⚙️ Run</h3>
            <div class="count-box"><span>Matching leads</span><b id="dm-count">—</b></div>
            <div class="field"><label class="f">Max leads per company</label><input type="number" id="dm-per" value="1" min="1" max="100"></div>
            <button class="btn primary" id="dm-run" style="width:100%;justify-content:center">🧹 Clean Decision Makers</button>
            <div id="dm-result" style="margin-top:12px"></div>
          </div>
        </div>
      </div>`;

    // ── Filter state (ported from decision_maker.html) ──
    const keywords = [];
    const selected = { seniority: new Set(), industry: new Set(), departments: new Set(), country: new Set() };
    const optEls = { seniority: [], industry: [], departments: [], country: [] };
    const deptGroupEls = [];
    const DATA_LOCAL = { seniority: DATA.seniority.slice(), industry: DATA.industry.slice(), country: DATA.country.slice() };

    $$('.fcard-h').forEach((h) => h.onclick = () => h.parentElement.classList.toggle('open'));

    function makeOpt(cat, val) {
      const d = document.createElement('div');
      d.className = 'opt' + (selected[cat].has(val) ? ' on' : '');
      d.innerHTML = '<div class="cb"><svg width="10" height="10" fill="none" stroke="#fff" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div><span class="opt-lbl">' + esc(val) + '</span>';
      d.onclick = () => toggleOpt(cat, val, d);
      return d;
    }
    function toggleOpt(cat, val, el) {
      if (selected[cat].has(val)) { selected[cat].delete(val); el.classList.remove('on'); }
      else { selected[cat].add(val); el.classList.add('on'); }
      if (cat === 'departments') { const p = SUB_TO_DEPT[val]; const entry = deptGroupEls.find((g) => g.dept === p); if (entry) updateParentState(entry); }
      updateBadge(cat); updateTagsBar();
    }
    function buildList(cat) {
      const list = $('#list-' + cat); list.innerHTML = ''; optEls[cat] = [];
      DATA_LOCAL[cat].forEach((val) => { const el = makeOpt(cat, val); list.appendChild(el); optEls[cat].push({ el, v: val.toLowerCase() }); });
    }
    function buildDeptList() {
      const container = $('#dept-container'); container.innerHTML = '';
      DEPT_TREE.forEach((group) => {
        const dg = document.createElement('div'); dg.className = 'dg';
        const dp = document.createElement('div'); dp.className = 'dp';
        dp.innerHTML = `<svg class="dp-arrow" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
          <div class="dp-cb"><svg width="10" height="10" fill="none" stroke="#fff" stroke-width="3" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg></div>
          <span class="dp-name">${esc(group.d)}</span><span class="dp-cnt"></span>`;
        const dc = document.createElement('div'); dc.className = 'dc';
        const subs = group.s.map((sub) => { const el = makeOpt('departments', sub); dc.appendChild(el); optEls.departments.push({ el, v: sub.toLowerCase() }); return { sub, el }; });
        dg.appendChild(dp); dg.appendChild(dc); container.appendChild(dg);
        const entry = { dg, dp, cbDiv: $('.dp-cb', dp), cntSpan: $('.dp-cnt', dp), subs, dept: group.d };
        deptGroupEls.push(entry);
        $('.dp-cb', dp).onclick = (e) => { e.stopPropagation(); toggleParent(entry); };
        dp.onclick = () => dg.classList.toggle('open');
      });
    }
    function toggleParent(entry) {
      const all = entry.subs.every((o) => selected.departments.has(o.sub));
      entry.subs.forEach((o) => { if (all) { selected.departments.delete(o.sub); o.el.classList.remove('on'); } else { selected.departments.add(o.sub); o.el.classList.add('on'); } });
      updateParentState(entry); updateBadge('departments'); updateTagsBar();
    }
    function updateParentState(entry) {
      const total = entry.subs.length, sel = entry.subs.filter((o) => selected.departments.has(o.sub)).length;
      entry.dp.classList.toggle('has-sel', sel > 0); entry.dp.classList.toggle('all-sel', sel === total && total > 0);
      entry.cbDiv.classList.toggle('partial', sel > 0 && sel < total);
      entry.cntSpan.textContent = sel > 0 ? sel + '/' + total : '';
    }
    function buildSuggestions() {
      const wrap = $('#suggestWrap');
      SUGGESTIONS.forEach((s) => { const el = document.createElement('span'); el.className = 'chip'; el.textContent = s; el.onclick = () => { if (keywords.indexOf(s) === -1) addKw(s); }; wrap.appendChild(el); });
    }
    function refreshChips() { $$('.chip').forEach((c) => c.classList.toggle('used', keywords.indexOf(c.textContent) !== -1)); }
    function addKw(val) { if (!val || keywords.indexOf(val) !== -1) return; keywords.push(val); renderKwBox(); refreshChips(); updateBadge('kw'); updateTagsBar(); }
    function removeKw(val) { const i = keywords.indexOf(val); if (i !== -1) keywords.splice(i, 1); renderKwBox(); refreshChips(); updateBadge('kw'); updateTagsBar(); }
    function renderKwBox() {
      const box = $('#kwBox'); $$('.kw-tag', box).forEach((t) => t.remove()); const inp = $('#kwInput');
      keywords.forEach((kw) => { const tag = document.createElement('span'); tag.className = 'kw-tag'; tag.innerHTML = esc(kw) + ' <span class="x">×</span>'; $('.x', tag).onclick = () => removeKw(kw); box.insertBefore(tag, inp); });
    }
    function addCustom(cat) {
      const inp = $('#input-' + cat); const val = inp.value.trim(); if (!val) return;
      if (DATA_LOCAL[cat].indexOf(val) === -1) { DATA_LOCAL[cat].unshift(val); const list = $('#list-' + cat); const el = makeOpt(cat, val); list.insertBefore(el, list.firstChild); optEls[cat].unshift({ el, v: val.toLowerCase() }); }
      if (!selected[cat].has(val)) { const item = optEls[cat].find((o) => o.v === val.toLowerCase()); if (item) { selected[cat].add(val); item.el.classList.add('on'); } }
      inp.value = ''; updateBadge(cat); updateTagsBar();
    }
    function filterList(cat, q) {
      q = q.toLowerCase().trim();
      if (cat === 'departments') {
        let totalShown = 0;
        deptGroupEls.forEach((entry) => {
          const deptMatch = !q || entry.dept.toLowerCase().includes(q); let childShown = 0;
          entry.subs.forEach((o) => { const m = !q || deptMatch || o.sub.toLowerCase().includes(q); o.el.style.display = m ? '' : 'none'; if (m) childShown++; });
          const vis = deptMatch || childShown > 0; entry.dg.style.display = vis ? '' : 'none'; if (vis) { totalShown++; if (q) entry.dg.classList.add('open'); }
        });
        $('#nr-departments').style.display = totalShown ? 'none' : 'block'; return;
      }
      let shown = 0; optEls[cat].forEach((o) => { const m = !q || o.v.includes(q); o.el.style.display = m ? '' : 'none'; if (m) shown++; });
      $('#nr-' + cat).style.display = shown ? 'none' : 'block';
    }
    function updateBadge(cat) { const b = $('#badge-' + cat); const n = cat === 'kw' ? keywords.length : selected[cat].size; b.textContent = n; b.style.display = n ? 'inline-block' : 'none'; }
    function makeATag(label, onRemove) { const t = document.createElement('span'); t.className = 'atag'; t.innerHTML = esc(label) + ' <span class="x">×</span>'; $('.x', t).onclick = onRemove; return t; }
    function updateTagsBar() {
      const bar = $('#tagsBar'); bar.innerHTML = '';
      keywords.forEach((kw) => bar.appendChild(makeATag(kw, () => removeKw(kw))));
      Object.keys(selected).forEach((cat) => selected[cat].forEach((val) => bar.appendChild(makeATag(val, () => {
        selected[cat].delete(val); const item = optEls[cat].find((o) => o.v === val.toLowerCase()); if (item) item.el.classList.remove('on');
        if (cat === 'departments') { const entry = deptGroupEls.find((g) => g.dept === SUB_TO_DEPT[val]); if (entry) updateParentState(entry); }
        updateBadge(cat); updateTagsBar();
      }))));
      refreshLeadCount();
    }
    function getFilters() {
      return { keywords: keywords.slice(), seniority: [...selected.seniority], industry: [...selected.industry], departments: [...selected.departments], country: [...selected.country], perCompany: parseInt($('#dm-per').value, 10) || 1 };
    }
    let countTimer = null;
    function refreshLeadCount() {
      clearTimeout(countTimer);
      countTimer = setTimeout(async () => {
        const listId = $('#dm-list').value; const el = $('#dm-count');
        if (!listId) { el.textContent = '—'; return; }
        el.textContent = '…';
        try { const r = await api('/decision-makers/count', { method: 'POST', body: { listId, filters: getFilters() } }); el.textContent = num(r.count); }
        catch (e) { el.textContent = '0'; }
      }, 250);
    }

    buildSuggestions(); ['seniority', 'industry', 'country'].forEach(buildList); buildDeptList();
    const kwInp = $('#kwInput');
    kwInp.onkeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addKw(kwInp.value.trim()); kwInp.value = ''; $$('.chip.highlight').forEach((c) => c.classList.remove('highlight')); }
      if (e.key === 'Backspace' && !kwInp.value && keywords.length) removeKw(keywords[keywords.length - 1]);
    };
    kwInp.oninput = () => { const v = kwInp.value.trim().toLowerCase(); $$('.chip').forEach((c) => c.classList.toggle('highlight', !!v && c.textContent.toLowerCase().indexOf(v) !== -1)); };
    $('#kwBox').onclick = () => kwInp.focus();
    $$('[data-search]').forEach((i) => i.oninput = () => filterList(i.dataset.search, i.value));
    $$('[data-add]').forEach((b) => b.onclick = () => addCustom(b.dataset.add));
    $$('[id^=input-]').forEach((i) => i.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(i.id.replace('input-', '')); } });
    $('#dm-list').onchange = refreshLeadCount;
    $('#dm-per').onchange = refreshLeadCount;
    refreshLeadCount();

    $('#dm-run').onclick = async () => {
      const listId = $('#dm-list').value;
      if (!listId) return toast('Select a source list first.', 'err');
      const b = $('#dm-run'); b.disabled = true; b.textContent = '⏳ Cleaning…';
      try {
        const r = await api('/decision-makers/run', { method: 'POST', body: { listId, filters: getFilters() } });
        state.listsCache = null;
        $('#dm-result').innerHTML = `<pre class="summary">${esc(r.message)}</pre><div class="actions" style="margin-top:8px"><a class="btn success" href="#/list/${r.listId}">Open "${esc(r.listName)}"</a><a class="btn" href="/api/lists/${r.listId}/download?format=csv">⬇ CSV</a><a class="btn" href="/api/lists/${r.listId}/download?format=xlsx">⬇ XLSX</a></div>`;
      } catch (e) { $('#dm-result').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
      finally { b.disabled = false; b.textContent = '🧹 Clean Decision Makers'; }
    };
  };

  // ── Company name cleaner ───────────────────────────────────────────────────
  let progressTimer = null;
  views.companyCleaner = async (args) => {
    setTitle('🤖 Company Name Cleaner (GPT)');
    clearInterval(progressTimer);
    const c = $('#content');
    const lists = await loadLists();
    c.innerHTML = `
      <div class="grid grid-2">
        <div class="card"><h3>🔄 Start cleaning</h3>
          <div class="field"><label class="f">Source list</label><select id="cc-list">${listOptions(lists, args[0] || '')}</select></div>
          <div style="font-size:11.5px;color:var(--dim);margin-bottom:12px">Copies the list to <b>"${esc(state.user.email)}, the company name cleaning"</b>, adds a <b>Clean Company Name</b> column and cleans in batches of 100 rows via OpenAI GPT in the background. Rows that already have a cleaned name are skipped.</div>
          <div class="actions"><button class="btn primary" id="cc-start">🔄 Start Cleaning Company Names</button><button class="btn" id="cc-check">🧐 Check Progress</button><button class="btn danger" id="cc-reset">🗑️ Reset Cleaning Progress</button></div>
          <div id="cc-msg" style="margin-top:12px"></div>
        </div>
        <div class="card"><h3>📊 Progress</h3><div id="cc-prog"><div class="empty">Loading…</div></div></div>
      </div>`;

    async function drawProgress() {
      try {
        const p = await api('/company-cleaner/progress');
        const el = $('#cc-prog'); if (!el) { clearInterval(progressTimer); return; }
        if (!p.listId) { el.innerHTML = `<pre class="summary">${esc(p.message)}</pre>`; return; }
        el.innerHTML = `
          <div style="display:flex;justify-content:space-between;margin-bottom:6px"><span><b>${esc(p.listName)}</b> <span class="badge ${p.status === 'running' ? 'amber' : p.status === 'completed' ? 'green' : p.status === 'error' ? 'red' : 'gray'}">${esc(p.status)}</span></span><span>${num(p.processed)} / ${num(p.total)} (${p.percent}%)</span></div>
          <div class="prog"><div style="width:${p.percent}%"></div></div>
          <pre class="summary" style="margin-top:10px">${esc(p.message)}</pre>
          <div class="actions" style="margin-top:8px"><a class="btn success" href="#/list/${p.listId}">Open list</a><a class="btn" href="/api/lists/${p.listId}/download?format=csv">⬇ CSV</a><a class="btn" href="/api/lists/${p.listId}/download?format=xlsx">⬇ XLSX</a></div>`;
        if (p.status !== 'running') clearInterval(progressTimer);
      } catch (e) { clearInterval(progressTimer); }
    }
    function watch() { clearInterval(progressTimer); drawProgress(); progressTimer = setInterval(drawProgress, 5000); }

    $('#cc-start').onclick = async () => {
      const listId = $('#cc-list').value;
      if (!listId) return toast('Select a source list first.', 'err');
      try {
        let r = await api('/company-cleaner/start', { method: 'POST', body: { listId } });
        if (r.needsConfirm) {
          if (!(await confirmBox('⚠️ List Already Exists', r.message, 'Overwrite'))) return;
          r = await api('/company-cleaner/start', { method: 'POST', body: { listId, overwrite: true } });
        }
        if (!r.ok) { $('#cc-msg').innerHTML = `<div class="alert err">${esc(r.message)}</div>`; return; }
        $('#cc-msg').innerHTML = `<div class="alert ok">${esc(r.message)}</div>`;
        state.listsCache = null; watch();
      } catch (e) { $('#cc-msg').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; }
    };
    $('#cc-check').onclick = async () => { const p = await api('/company-cleaner/progress'); await alertBox('🧐 Cleaning Progress', p.message); watch(); };
    $('#cc-reset').onclick = async () => {
      if (!(await confirmBox('🗑️ Reset Cleaning Progress', 'Stop the running cleaning job and reset progress markers?', 'Reset'))) return;
      const r = await api('/company-cleaner/reset', { method: 'POST' }); toast(r.message, 'ok'); watch();
    };
    watch();
  };

  // ── Activity log ───────────────────────────────────────────────────────────
  function activityTable(rows, compact) {
    if (!rows.length) return '<div class="empty">No activity yet.</div>';
    const st = (s) => { const v = String(s).toLowerCase(); const cls = v === 'completed' ? 'green' : v === 'error' ? 'red' : v === 'submitted' || v === 'started' || v === 'running' ? 'amber' : 'gray'; return `<span class="badge ${cls}">${esc(s)}</span>`; };
    if (compact) return `<div class="tbl-wrap"><table><thead><tr><th>User</th><th>Function</th><th>List</th><th>Status</th><th>Date</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.user_email)}</td><td>${esc(r.fn)}</td><td>${r.list_id ? `<a href="#/list/${r.list_id}">${esc(r.list_name)}</a>` : esc(r.list_name)}</td><td>${st(r.status)} ${esc(r.progress)}</td><td>${fmtDate(r.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
    return `<div class="tbl-wrap"><table><thead><tr><th>User Email</th><th>Function</th><th>List</th><th>Task ID</th><th>API Account</th><th>Date</th><th>Task Name</th><th>Status</th><th>Total</th><th>Progress</th><th>Action</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.user_email)}</td><td>${esc(r.fn)}</td><td>${r.list_id ? `<a href="#/list/${r.list_id}">${esc(r.list_name)}</a>` : esc(r.list_name)}</td><td>${esc(r.task_id)}</td><td>${esc(r.api_account)}</td><td>${fmtDate(r.created_at)}</td><td>${esc(r.task_name)}</td><td>${st(r.status)}</td><td>${num(r.total)}</td><td>${esc(r.progress)}</td><td>${esc(r.action)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  views.activity = async () => {
    const isAdmin = state.user.role === 'admin';
    setTitle(isAdmin ? '📋 Activity Log — all users' : '📋 My Activity');
    const c = $('#content');
    c.innerHTML = `<div class="card"><h3>📊 Info — activity log ${isAdmin ? '(misuse monitoring)' : ''}</h3>
      <div class="row" style="margin-bottom:12px"><div><input type="search" id="act-q" placeholder="Search user, list, task id…"></div>
        <div style="max-width:240px"><select id="act-fn"><option value="">All functions</option>${['Lead List Clean', 'Verify Emails', 'Decision Maker Filter', 'Company Name Cleaner'].map((f) => `<option>${f}</option>`).join('')}</select></div>
        <div class="auto"><button class="btn" id="act-go">Filter</button></div></div>
      <div id="act-tbl"></div><div class="pager" id="act-pg"></div></div>`;
    let offset = 0; const limit = 100;
    async function draw() {
      const q = encodeURIComponent($('#act-q').value.trim()); const fn = encodeURIComponent($('#act-fn').value);
      const r = await api(`/activity?limit=${limit}&offset=${offset}&q=${q}&fn=${fn}`);
      $('#act-tbl').innerHTML = activityTable(r.rows);
      $('#act-pg').innerHTML = `<button class="btn sm" id="ap-prev" ${offset === 0 ? 'disabled' : ''}>← Prev</button><span>${num(offset + 1)}–${num(Math.min(offset + limit, r.total))} of ${num(r.total)}</span><button class="btn sm" id="ap-next" ${offset + limit >= r.total ? 'disabled' : ''}>Next →</button>`;
      $('#ap-prev').onclick = () => { offset = Math.max(0, offset - limit); draw(); };
      $('#ap-next').onclick = () => { offset += limit; draw(); };
    }
    $('#act-go').onclick = () => { offset = 0; draw(); };
    $('#act-q').onkeydown = (e) => { if (e.key === 'Enter') { offset = 0; draw(); } };
    $('#act-fn').onchange = () => { offset = 0; draw(); };
    await draw();
  };

  // ── Credits ────────────────────────────────────────────────────────────────
  views.credits = async () => {
    setTitle('📊 Account Credits');
    const c = $('#content');
    async function draw(force) {
      c.innerHTML = '<div class="empty">⏳ Fetching balances…</div>';
      await refreshCredits(force);
      const cr = state.credits || { accounts: [], totalDaily: 0, totalInstant: 0 };
      c.innerHTML = `
        <div class="grid grid-3" style="margin-bottom:14px">
          <div class="stat"><div class="lbl">🔢 Total Daily Credits</div><div class="val green">${num(cr.totalDaily)}</div></div>
          <div class="stat"><div class="lbl">⚡ Total Instant Credits</div><div class="val blue">${num(cr.totalInstant)}</div></div>
          <div class="stat"><div class="lbl">Accounts</div><div class="val">${cr.accounts.filter((a) => a.enabled).length} <span style="font-size:13px;color:var(--dim)">/ ${cr.accounts.length}</span></div></div>
        </div>
        <div class="card"><h3>🔃 All account credits <span class="right"><button class="btn sm" id="cr-refresh">🔃 Refresh & Show All Credits</button>${state.user.role === 'admin' ? '<a class="btn sm" href="#/settings">🔑 Manage keys</a>' : ''}</span></h3>
          <div class="tbl-wrap"><table><thead><tr><th>Account</th><th>Daily</th><th>Instant</th><th>Status</th><th>Fetched</th></tr></thead><tbody>
            ${cr.accounts.length ? cr.accounts.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td class="${a.daily ? 'status-safe' : ''}">${num(a.daily)}</td><td>${num(a.instant)}</td>
              <td>${!a.enabled ? '<span class="badge gray">disabled</span>' : a.ok ? '<span class="badge green">ok</span>' : '<span class="badge red">⚠️ unable to fetch</span>'}</td><td>${fmtDate(a.fetchedAt)}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">No API accounts configured' + (state.user.role === 'admin' ? ' — add them in API Keys & Settings.' : '. Ask your admin.') + '</td></tr>'}
          </tbody></table></div></div>`;
      $('#cr-refresh').onclick = () => draw(true);
    }
    await draw(false);
  };

  // ── Admin: users ───────────────────────────────────────────────────────────
  views.users = async () => {
    if (state.user.role !== 'admin') { location.hash = '#/'; return; }
    setTitle('👥 Users');
    const c = $('#content');
    async function draw() {
      const { users } = await api('/users');
      c.innerHTML = `<div class="card"><h3>👥 Users <span class="right"><button class="btn primary sm" id="u-add">+ Add user</button></span></h3>
        <div class="tbl-wrap"><table><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Lists</th><th>Runs</th><th>Last login</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td><b>${esc(u.email)}</b>${u.id === state.user.id ? ' <span class="badge blue">you</span>' : ''}</td><td>${esc(u.name)}</td><td><span class="badge ${u.role === 'admin' ? '' : 'gray'}">${u.role.toUpperCase()}</span></td>
          <td>${u.active ? '<span class="badge green">active</span>' : '<span class="badge red">deactivated</span>'}</td><td>${num(u.list_count)}</td><td>${num(u.activity_count)}</td><td>${fmtDate(u.last_login_at)}</td><td>${fmtDate(u.created_at)}</td>
          <td><button class="btn sm" data-edit="${u.id}">Edit</button><button class="btn sm" data-pw="${u.id}">Reset password</button>
              <button class="btn sm ${u.active ? 'ghost' : 'success'}" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'Deactivate' : 'Activate'}</button><button class="btn sm danger" data-del="${u.id}">Delete</button></td></tr>`).join('')}
        </tbody></table></div></div>`;
      $('#u-add').onclick = async () => {
        const r = await formBox('Add user', [
          { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'name', label: 'Name' },
          { name: 'password', label: 'Password (min 6 chars)', type: 'text', required: true },
          { name: 'role', label: 'Role', type: 'select', value: 'user', options: [{ value: 'user', label: 'User — run tools on own lists' }, { value: 'admin', label: 'Admin — full access' }] }
        ], 'Create');
        if (!r) return;
        try { await api('/users', { method: 'POST', body: r }); toast('User created', 'ok'); draw(); } catch (e) { toast(e.message, 'err'); }
      };
      $$('[data-edit]').forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.edit));
        const r = await formBox('Edit ' + u.email, [{ name: 'name', label: 'Name', value: u.name }, { name: 'role', label: 'Role', type: 'select', value: u.role, options: [{ value: 'user', label: 'User' }, { value: 'admin', label: 'Admin' }] }]);
        if (!r) return;
        try { await api('/users/' + u.id, { method: 'PATCH', body: r }); toast('Saved', 'ok'); draw(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-pw]').forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.pw));
        const r = await formBox('Reset password — ' + u.email, [{ name: 'password', label: 'New password (min 6 chars)', type: 'text', required: true }], 'Reset');
        if (!r) return;
        try { await api('/users/' + u.id, { method: 'PATCH', body: { password: r.password } }); toast('Password reset', 'ok'); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-toggle]').forEach((b) => b.onclick = async () => {
        try { await api('/users/' + b.dataset.toggle, { method: 'PATCH', body: { active: b.dataset.active !== '1' } }); draw(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-del]').forEach((b) => b.onclick = async () => {
        const u = users.find((x) => x.id === Number(b.dataset.del));
        if (!(await confirmBox('Delete user', `Delete ${u.email}?\nTheir lists (${u.list_count}) will be deleted too. Activity log entries are kept.`, 'Delete'))) return;
        try { await api('/users/' + u.id, { method: 'DELETE' }); toast('Deleted', 'ok'); draw(); } catch (e) { toast(e.message, 'err'); }
      });
    }
    await draw();
  };

  // ── Admin: settings / API keys ─────────────────────────────────────────────
  views.settings = async () => {
    if (state.user.role !== 'admin') { location.hash = '#/'; return; }
    setTitle('🔑 API Keys & Settings');
    const c = $('#content');
    async function draw() {
      const s = await api('/settings');
      c.innerHTML = `
        <div class="card"><h3>🏦 Reoon API accounts <span class="right"><button class="btn primary sm" id="k-add">+ Add account</button></span></h3>
          <div style="font-size:11.5px;color:var(--dim);margin-bottom:10px">Same accounts as the Google Sheet tabs (API_KEY_&lt;name&gt;). Lead List Clean splits emails across all <b>enabled</b> accounts. Keys are stored in the local database and never shown in full.</div>
          <div class="tbl-wrap"><table><thead><tr><th>Account</th><th>API key</th><th>Enabled</th><th>Added</th><th>Actions</th></tr></thead><tbody>
            ${s.accounts.length ? s.accounts.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td><code>${esc(a.keyMasked)}</code></td><td>${a.enabled ? '<span class="badge green">enabled</span>' : '<span class="badge gray">disabled</span>'}</td><td>${fmtDate(a.created_at)}</td>
              <td><button class="btn sm" data-key="${a.id}">Change key</button><button class="btn sm" data-rename="${a.id}">Rename</button><button class="btn sm ${a.enabled ? 'ghost' : 'success'}" data-toggle="${a.id}" data-en="${a.enabled ? 1 : 0}">${a.enabled ? 'Disable' : 'Enable'}</button><button class="btn sm danger" data-del="${a.id}">Delete</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty">No accounts yet.</td></tr>'}
          </tbody></table></div></div>
        <div class="card"><h3>🤖 OpenAI (Company Name Cleaner)</h3>
          <form id="oa-form" class="row">
            <div><label class="f">API key ${s.openai.hasKey ? `<span class="badge green">set: ${esc(s.openai.keyMasked)}</span>` : '<span class="badge red">not set</span>'}</label><input type="password" name="apiKey" placeholder="sk-… (leave blank to keep current)" autocomplete="new-password"></div>
            <div style="max-width:220px"><label class="f">Model</label><input type="text" name="model" value="${esc(s.openai.model)}"></div>
            <div class="auto"><button class="btn primary" type="submit">Save</button></div>
            <div class="auto"><button class="btn danger" type="button" id="oa-clear" ${s.openai.hasKey ? '' : 'disabled'}>Clear key</button></div>
          </form></div>
        <div class="card"><h3>ℹ️ Runtime</h3><div style="color:var(--muted)">Reoon API base: <code>${esc(s.reoonApiBase)}</code> · Background poll every <b>${s.pollIntervalSeconds}s</b> · Change these in <code>.env</code> and restart.</div></div>`;

      $('#k-add').onclick = async () => {
        const r = await formBox('Add Reoon account', [{ name: 'name', label: 'Account name (e.g. emailastrallc)', required: true }, { name: 'apiKey', label: 'Reoon API key', required: true }], 'Add');
        if (!r) return;
        try { const res = await api('/settings/accounts', { method: 'POST', body: r }); toast(res.warning || `Added — Daily: ${res.balance.daily}, Instant: ${res.balance.instant}`, res.warning ? 'err' : 'ok'); refreshCredits(); draw(); } catch (e) { toast(e.message, 'err'); }
      };
      $$('[data-key]').forEach((b) => b.onclick = async () => {
        const a = s.accounts.find((x) => x.id === Number(b.dataset.key));
        const r = await formBox('Change key — ' + a.name, [{ name: 'apiKey', label: 'New Reoon API key', required: true }]);
        if (!r) return;
        try { const res = await api('/settings/accounts/' + a.id, { method: 'PATCH', body: r }); toast(res.balance ? `Saved — Daily: ${res.balance.daily}, Instant: ${res.balance.instant}` : 'Saved, but balance check failed — verify the key.', res.balance ? 'ok' : 'err'); refreshCredits(); draw(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-rename]').forEach((b) => b.onclick = async () => {
        const a = s.accounts.find((x) => x.id === Number(b.dataset.rename));
        const r = await formBox('Rename account', [{ name: 'name', label: 'Name', value: a.name, required: true }]);
        if (!r) return;
        try { await api('/settings/accounts/' + a.id, { method: 'PATCH', body: r }); refreshCredits(); draw(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-toggle]').forEach((b) => b.onclick = async () => {
        try { await api('/settings/accounts/' + b.dataset.toggle, { method: 'PATCH', body: { enabled: b.dataset.en !== '1' } }); refreshCredits(); draw(); } catch (e) { toast(e.message, 'err'); }
      });
      $$('[data-del]').forEach((b) => b.onclick = async () => {
        const a = s.accounts.find((x) => x.id === Number(b.dataset.del));
        if (!(await confirmBox('Delete account', `Remove Reoon account "${a.name}"?`, 'Delete'))) return;
        try { await api('/settings/accounts/' + a.id, { method: 'DELETE' }); refreshCredits(); draw(); } catch (e) { toast(e.message, 'err'); }
      });
      $('#oa-form').onsubmit = async (e) => {
        e.preventDefault();
        try { await api('/settings/openai', { method: 'POST', body: { apiKey: e.target.apiKey.value, model: e.target.model.value } }); toast('Saved', 'ok'); draw(); } catch (err) { toast(err.message, 'err'); }
      };
      $('#oa-clear').onclick = async () => { if (await confirmBox('Clear OpenAI key', 'Remove the stored OpenAI API key?', 'Clear')) { await api('/settings/openai', { method: 'POST', body: { clearKey: true } }); draw(); } };
    }
    await draw();
  };

  // ── Account ────────────────────────────────────────────────────────────────
  views.account = async () => {
    setTitle('👤 My Account');
    $('#content').innerHTML = `<div class="grid grid-2">
      <div class="card"><h3>Profile</h3><p style="color:var(--muted)">Email: <b style="color:var(--text)">${esc(state.user.email)}</b><br>Name: ${esc(state.user.name || '—')}<br>Role: <span class="badge ${state.user.role === 'admin' ? '' : 'gray'}">${state.user.role.toUpperCase()}</span></p>
        <p style="color:var(--dim);font-size:11.5px;margin-top:8px">${state.user.role === 'admin' ? 'Admins can manage users, API keys, see every user\'s activity and lists, and run Verify Account Emails.' : 'Users can upload their own lists and run Lead List Clean, Decision Makers and Company Name Cleaner. Per-account verification and admin pages are locked.'}</p></div>
      <div class="card"><h3>🔒 Change password</h3><form id="pw-form">
        <div class="field"><label class="f">Current password</label><input type="password" name="currentPassword" required autocomplete="current-password"></div>
        <div class="field"><label class="f">New password (min 6 chars)</label><input type="password" name="newPassword" required autocomplete="new-password"></div>
        <button class="btn primary" type="submit">Update password</button></form></div></div>`;
    $('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/auth/password', { method: 'POST', body: { currentPassword: e.target.currentPassword.value, newPassword: e.target.newPassword.value } }); toast('Password updated', 'ok'); e.target.reset(); } catch (err) { toast(err.message, 'err'); }
    };
  };

  // ── Help (ported from GuidelineDialog.html) ────────────────────────────────
  views.help = async () => {
    setTitle('📖 Guideline & Help');
    $('#content').innerHTML = `<div class="help">
      <div class="section"><div class="section-title">📂 Lead Lists (instead of Sheet tabs)</div>
        <ul><li>Upload a <span class="highlight">CSV or XLSX</span> — the first row is the header. Each upload becomes a list (like a spreadsheet tab).</li>
        <li>Open a list to see its data, verification stats and all tool buttons. Download the result any time as CSV or XLSX.</li>
        <li>Users only see their own lists. <span class="highlight">Admins see everyone's lists.</span></li></ul></div>
      <div class="section"><div class="section-title">⚡ Bulk Lead List Clean</div>
        <p>Automatically verifies large email lists using all enabled Reoon accounts in parallel:</p>
        <ul><li>Divides all unverified emails across available Reoon accounts to maximize daily verification speed.</li>
        <li><span class="highlight">Uses Daily Credits Only:</span> Consumes free daily balances first to protect paid instant credits.</li>
        <li><span class="highlight">Non-Blocking:</span> Safe to leave the page once started. The server polls and writes results every minute automatically.</li>
        <li>Adds <span class="highlight">Verification Status</span> and <span class="highlight">Verification Date</span> columns right after <span class="highlight">Email</span> if missing.</li>
        <li><span class="highlight">Activity Logging:</span> Every run is logged to the Activity Log with User Email, Function, List, Task ID, API Account, Date, Total emails, and Status.</li>
        <li><span class="highlight">Check Pending Results:</span> manually poll all active tasks and write results immediately.</li>
        <li><span class="highlight">Clear "Pending…" rows:</span> if rows are stuck as <span class="warning">"Pending..."</span> with no active task, clear them so they are processed again in the next run.</li></ul></div>
      <div class="section"><div class="section-title">✉️ Verify Account Emails</div>
        <ul><li><span class="warning">Access Restricted:</span> only <b>admins</b> can run per-account verification (locked for users).</li>
        <li>Submits a bulk verification task for the selected account and returns immediately — <span class="success">no waiting required</span>. May use daily <b>and</b> instant credits of that account.</li>
        <li>Results appear <span class="highlight">automatically within 1–5 minutes</span> via the background poller.</li></ul></div>
      <div class="section"><div class="section-title">🧹 Clean Decision Makers</div>
        <p>Filters list rows to keep only target decision makers per company:</p>
        <ul><li>Requires <span class="highlight">Title / Job Title</span> and <span class="highlight">Company / Company Name</span> columns (case-insensitive).</li>
        <li><span class="highlight">Verification Priority:</span> if a status column exists, deliverable emails (Safe → Role Account → Catch All) are prioritized automatically.</li>
        <li><span class="highlight">Title Keyword Fallback:</span> if the keywords box is empty, 29 pre-defined default titles (CEO, VP, Director, Owner, Founder, etc.) are used. Custom keywords replace defaults entirely.</li>
        <li>Supports filtering by Industry, Country, Seniority, and Department. The matching count updates live.</li>
        <li>Outputs results to a new <span class="highlight">"Cleaned — [List Name]"</span> list, keeping original data untouched.</li></ul></div>
      <div class="section"><div class="section-title">🤖 Company Names Cleaner (GPT-Powered)</div>
        <ul><li>Uses the OpenAI API to remove locations, legal suffixes (LLC, Inc, GmbH), URLs, and generic business terms.</li>
        <li><span class="highlight">Start Cleaning:</span> duplicates the list to <span class="highlight">"[your email], the company name cleaning"</span>, adds a <span class="highlight">"Clean Company Name"</span> column, and processes <span class="highlight">100 rows per batch</span> in the background.</li>
        <li><span class="highlight">Check Progress:</span> shows percentage done, last processed row and remaining empty cells. <span class="highlight">Reset Progress:</span> stops the job.</li>
        <li><span class="highlight">Safe Writes:</span> rows that already have a cleaned name are skipped.</li>
        <li>The OpenAI key and model are set by an admin in <span class="highlight">API Keys &amp; Settings</span>.</li></ul></div>
      <div class="section"><div class="section-title">📊 Activity Log (the "info" tab)</div>
        <ul><li><span class="highlight">Columns tracked:</span> User Email · Function · List · Task ID · API Account · Date · Task Name · Status · Total · Progress · Action</li>
        <li><span class="highlight">Misuse Monitoring:</span> admins can review who ran which tool, on which list, how many rows, and when. Users see only their own runs.</li></ul></div>
      <div class="section"><div class="section-title">👥 Roles</div>
        <ul><li><b>Admin:</b> manage users, Reoon/OpenAI API keys, view all activity and all lists, run every tool including Verify Account Emails.</li>
        <li><b>User:</b> upload own lists, run Lead List Clean, Clean Decision Makers, Company Name Cleaner; view own activity and credit totals.</li></ul></div>
    </div>`;
  };

  boot();
})();

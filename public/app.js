/* =============================================================================
   Email Verifier Dashboard - frontend (sidebar layout)
   The "EMAIL VERIFIER" section of the sidebar is the Google Sheet menu 1:1:
   same items, order, labels, alerts and dialogs. Every menu action runs on the
   ACTIVE SHEET (the list open on screen, or the one chosen in the top bar).
   ========================================================================== */
(function () {
  'use strict';

  // ── Icons (inline SVG, stroke style) ───────────────────────────────────────
  const ICONS = {
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    mail: '<path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>',
    filter: '<polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>',
    briefcase: '<rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    settings: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
    user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    help: '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>',
    eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    chevron: '<polyline points="6 9 12 15 18 9"/>',
    lock: '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    check: '<polyline points="20 6 9 17 4 12"/>',
    grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'
  };
  const icon = (name, size) => `<svg class="ic" width="${size || 16}" height="${size || 16}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  /** Server messages: strip pictograms / em dashes so the UI stays plain */
  const clean = (t) => String(t === null || t === undefined ? '' : t).replace(/[\p{Extended_Pictographic}]\uFE0F? ?/gu, '').replace(/\u2014/g, '-');

  // ── Helpers ────────────────────────────────────────────────────────────────
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = (s) => String(s === null || s === undefined ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const fmtDate = (s) => (s ? String(s).replace('T', ' ').slice(0, 19) : '-');
  const num = (n) => (n === null || n === undefined ? '-' : Number(n).toLocaleString());
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const colLetter = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };

  // Thin progress bar at the top while any request is in flight
  let inflight = 0;
  function setLoading(delta) {
    inflight = Math.max(0, inflight + delta);
    const bar = $('#topload'); if (bar) bar.classList.toggle('on', inflight > 0);
    document.body.classList.toggle('loading', inflight > 0);
  }
  const loadingBlock = (text) => `<div class="loading-block"><span class="spin"></span>${esc(text || 'Loading')}</div>`;

  async function api(path, opts = {}) {
    const o = { method: opts.method || 'GET', headers: {} };
    if (opts.body instanceof FormData) o.body = opts.body;
    else if (opts.body !== undefined) { o.headers['Content-Type'] = 'application/json'; o.body = JSON.stringify(opts.body); }
    setLoading(1);
    let res;
    try { res = await fetch('/api' + path, o); }
    catch (e) { setLoading(-1); throw new Error('Cannot reach the server. Check your connection and try again.'); }
    let data = {};
    try { data = await res.json(); } catch (e) { /* ignore */ }
    setLoading(-1);
    if (res.status === 401 && !path.startsWith('/auth/')) { state.user = null; render(); throw new Error('Session expired - please log in again.'); }
    if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
    return data;
  }
  function toast(msg, type) {
    const t = document.createElement('div'); t.className = 'toast ' + (type || ''); t.textContent = clean(msg);
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
      shell(clean(title || 'Email Verifier'), `<pre>${esc(clean(text))}</pre>`, '<button class="btn primary" id="m-ok">OK</button>');
      $('#m-ok').onclick = () => { closeModal(); resolve(); };
      $('#m-x').onclick = () => { closeModal(); resolve(); };
      $('#m-ok').focus();
    });
  }
  function uiConfirm(title, text, yesLabel, noLabel) {
    return new Promise((resolve) => {
      shell(clean(title), `<pre>${esc(clean(text))}</pre>`, `<button class="btn" id="m-no">${esc(noLabel || 'NO')}</button><button class="btn primary" id="m-yes">${esc(yesLabel || 'YES')}</button>`);
      $('#m-no').onclick = () => { closeModal(); resolve(false); };
      $('#m-x').onclick = () => { closeModal(); resolve(false); };
      $('#m-yes').onclick = () => { closeModal(); resolve(true); };
    });
  }
  function uiBusy(title, text) {
    shell(clean(title), `<div id="busy-text" style="white-space:pre-wrap;line-height:1.6"><span class="spin"></span>${esc(clean(text))}</div>`);
    $('#m-x').onclick = () => {};
    return (t) => { const el = $('#busy-text'); if (el) el.innerHTML = `<span class="spin"></span>${esc(clean(t))}`; };
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

  // ── Password show / hide toggle (applies to every input[type=password]) ───
  function enhancePasswordInputs(root) {
    $$('input[type=password]', root || document).forEach((inp) => {
      if (inp.dataset.pw) return;
      inp.dataset.pw = '1';
      const wrap = document.createElement('div'); wrap.className = 'pw-wrap';
      inp.parentNode.insertBefore(wrap, inp); wrap.appendChild(inp);
      const btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'pw-toggle'; btn.title = 'Show / hide'; btn.setAttribute('aria-label', 'Show or hide password');
      btn.innerHTML = icon('eye');
      btn.onclick = () => { const show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; btn.innerHTML = icon(show ? 'eyeOff' : 'eye'); btn.classList.toggle('on', show); inp.focus(); };
      wrap.appendChild(btn);
    });
  }
  new MutationObserver(() => enhancePasswordInputs(document)).observe(document.documentElement, { childList: true, subtree: true });

  // ── State / routing ────────────────────────────────────────────────────────
  const state = { user: null, credits: null, lists: [], activeId: null, groups: { sheets: true, cleaner: true, verify: true, dm: true, cc: true, admin: true, account: false } };
  const PAGE = 200;
  const routes = { '': 'overview', overview: 'overview', sheets: 'sheets', list: 'sheet', activity: 'activity', users: 'users', settings: 'settings', account: 'account', help: 'help', cleaner: 'cleaner' };
  const parseHash = () => { const [name, ...args] = location.hash.replace(/^#\/?/, '').split('/'); return { name: name || '', args }; };
  window.addEventListener('hashchange', render);
  document.addEventListener('click', (e) => { if (!e.target.closest('#me')) { const m = $('#me-menu'); if (m) { m.hidden = true; $('#me').classList.remove('open'); } } });
  const isAdmin = () => state.user && state.user.role === 'admin';

  async function boot() {
    try { state.user = (await api('/auth/me')).user; } catch (e) { state.user = null; }
    if (state.user) await afterLogin();
    render();
  }
  async function afterLogin() {
    try { Object.assign(state.groups, JSON.parse(localStorage.getItem('evd.groups') || '{}')); } catch (e) { /* ignore */ }
    try { state.activeId = Number(localStorage.getItem('evd.active.' + state.user.id)) || null; } catch (e) { /* ignore */ }
    await Promise.all([loadLists(), loadCredits(false)]);
  }
  async function loadLists() {
    state.lists = (await api('/lists')).lists;
    if (state.activeId && !state.lists.find((l) => l.id === state.activeId)) state.activeId = null;
    if (!state.activeId && state.lists.length) state.activeId = state.lists[0].id;
  }
  async function loadCredits(force) {
    const pill0 = $('#credits-pill'); if (pill0) pill0.innerHTML = '<span class="spin"></span>Credits';
    try { state.credits = await api('/verify/credits' + (force ? '?refresh=1' : '')); } catch (e) { state.credits = null; }
    const pill = $('#credits-pill'); if (pill) pill.innerHTML = creditsPill();
    renderNav();
  }
  const creditsPill = () => (state.credits ? `Total Daily: <b>${num(state.credits.totalDaily)}</b> &nbsp;|&nbsp; Instant: <b>${num(state.credits.totalInstant)}</b>` : 'Credits unavailable');

  /** = SpreadsheetApp.getActiveSheet(): the list on screen, else the one chosen in the top bar */
  function activeList() {
    const { name, args } = parseHash();
    if (name === 'list' && args[0]) { const l = state.lists.find((x) => x.id === Number(args[0])); if (l) return l; }
    return state.lists.find((x) => x.id === state.activeId) || null;
  }
  function setActive(id) {
    state.activeId = Number(id) || null;
    try { localStorage.setItem('evd.active.' + state.user.id, String(state.activeId || '')); } catch (e) { /* ignore */ }
    renderNav(); updateSheetBadge();
  }
  function updateSheetBadge() {
    const el = $('#sheet-badge'); if (!el) return;
    const l = activeList();
    el.innerHTML = l ? `Selected sheet: <b>${esc(l.name)}</b>` : 'No sheet selected - open one from the sidebar';
  }
  async function requireActiveList() {
    const l = activeList();
    if (!l) { await uiAlert('No sheet is selected.\n\nOpen a sheet from the sidebar (or add one from All sheets), then run this again.'); return null; }
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
          <div class="brand"><span class="logo">${icon('mail', 18)}</span><span>Email Verifier<small>Reoon API Dashboard</small></span></div>
          <nav class="nav" id="nav"></nav>
          <div class="me" id="me">
            <button class="me-btn" id="me-btn" type="button"><span class="avatar">${esc(state.user.email.charAt(0).toUpperCase())}</span><span class="me-txt"><b>${esc(state.user.email)}</b><small>${isAdmin() ? 'Admin' : 'User'}</small></span><span class="chev">${icon('chevron', 14)}</span></button>
            <div class="me-menu" id="me-menu" hidden><button class="me-item" id="me-logout" type="button">${icon('logout', 15)} Logout</button></div>
          </div>
        </aside>
        <div class="sidebar-bg" id="sidebar-bg"></div>
        <div class="main">
          <div class="topbar">
            <div style="display:flex;align-items:center;gap:10px;min-width:0"><button class="btn sm menu-btn" id="menu-btn"></button><h2 id="page-title"></h2></div>
            <div class="tr">
              <div class="active-sheet" id="sheet-badge"></div>
              <div class="credits-pill" id="credits-pill">${creditsPill()}</div>
            </div>
          </div>
          <div class="content" id="content"></div>
        </div>
      </div>`;
    renderNav();
    $('#menu-btn').onclick = () => $('#sidebar').classList.toggle('open');
    $('#me-btn').onclick = () => { const m = $('#me-menu'); m.hidden = !m.hidden; $('#me').classList.toggle('open', !m.hidden); };
    $('#me-logout').onclick = () => runAction('logout');
    $('#sidebar-bg').onclick = () => $('#sidebar').classList.remove('open');
    updateSheetBadge();
    views[view](parseHash().args).catch((e) => { $('#content').innerHTML = `<div class="alert err">${esc(e.message)}</div>`; });
  }
  function refreshActiveSelect() { renderNav(); updateSheetBadge(); }
  function setTitle(t) { $('#page-title').textContent = t; document.title = t + ' - Email Verifier'; }

  // Sidebar: Overview on top, then collapsible sections. Every action lives here exactly once.
  function renderNav() {
    const nav = $('#nav'); if (!nav) return;
    const { name, args } = parseHash();
    const cr = state.credits || { accounts: [], totalDaily: 0 };
    const cur = activeList();
    const isPage = (id) => name === id || (id === 'overview' && !name);
    const page = (id, ic, label, cls) => `<a href="#/${id}" class="${cls || ''} ${isPage(id) ? 'active' : ''}">${ic ? icon(ic) : ''}<span>${label}</span></a>`;
    const mi = (action, label, cls) => `<div class="mi ${cls || ''}" data-action="${action}">${label}</div>`;
    const group = (key, ic, label, body, extra) => `
      <div class="grp ${state.groups[key] ? 'open' : ''}" data-grp="${key}">
        <div class="grp-h">${icon(ic)}<span>${label}</span>${extra || ''}<span class="chev">${icon('chevron', 14)}</span></div>
        <div class="grp-b">${body}</div>
      </div>`;
    const sheetsBody = page('sheets', '', 'All sheets');
    nav.innerHTML = `
      ${page('overview', 'home', 'Overview', 'top')}
      ${group('sheets', 'file', 'Sheets', sheetsBody, `<small>${state.lists.length}</small>`)}
      ${group('cleaner', 'grid', 'Sheet Cleaner', page('cleaner', '', 'Clean columns and rows'))}
      ${group('verify', 'mail', 'Email Verification', `
        ${mi('llc', `Lead List Clean <small>(Total D: ${num(cr.totalDaily)})</small>`)}
        ${mi('check-pending', 'Check Pending Results')}
        ${mi('clear-pending', 'Clear All Pending Tasks')}`)}
      ${group('dm', 'filter', 'Decision Makers', mi('decision-makers', 'Clean Decision Makers'))}
      ${group('cc', 'briefcase', 'Company Names', `
        ${mi('cc-start', 'Start Cleaning Company Names')}
        ${mi('cc-progress', 'Check Cleaning Progress')}
        ${mi('cc-reset', 'Reset Cleaning Progress')}`)}
      ${page('activity', 'list', isAdmin() ? 'Activity Log (info)' : 'My Activity (info)', 'top')}
      ${isAdmin() ? group('admin', 'settings', 'Admin', `
        ${page('users', '', 'Users')}
        ${page('settings', '', 'API Keys & Settings')}
        ${mi('debug-credits', 'Debug Credit Balance')}`) : ''}
      ${group('account', 'user', 'Account', `
        ${page('account', '', 'My Account')}
        ${page('help', '', 'Guideline / Help')}`)}`;
    $$('.grp-h', nav).forEach((h) => h.onclick = () => {
      const key = h.parentElement.dataset.grp;
      state.groups[key] = !state.groups[key];
      try { localStorage.setItem('evd.groups', JSON.stringify(state.groups)); } catch (e) { /* ignore */ }
      h.parentElement.classList.toggle('open', state.groups[key]);
    });
    $$('.mi', nav).forEach((el) => el.onclick = () => {
      if (!el.dataset.action) return;
      $('#sidebar').classList.remove('open');
      runAction(el.dataset.action).catch((err) => uiAlert(err.message));
    });
    $$('a', nav).forEach((a) => a.addEventListener('click', () => { $('#sidebar').classList.remove('open'); closeModal(); }));
  }

  // ── Menu actions (= the sheet's menu functions) ────────────────────────────
  let actionRunning = null;
  async function runAction(action) {
    if (actionRunning) { toast('Another action is still running. Please wait for it to finish.', 'err'); return; }
    actionRunning = action.split(':')[0];
    const el = $(`.nav .mi[data-action="${action}"]`); if (el) el.classList.add('running');
    document.body.classList.add('busy');
    try { return await runActionInner(action); }
    finally { actionRunning = null; document.body.classList.remove('busy'); $$('.nav .mi.running').forEach((m) => m.classList.remove('running')); }
  }
  async function runActionInner(action) {
    const [name, arg] = action.split(':');
    switch (name) {
      case 'verify': return verifyAccount(arg);
      case 'llc': return leadListClean();
      case 'check-pending': return checkPendingResults();
      case 'clear-pending': return clearAllPendingTasks();
      case 'decision-makers': return cleanDecisionMakers();
      case 'cc-start': return startCleaningProcess();
      case 'cc-progress': { const p = await api('/company-cleaner/progress'); return uiAlert(p.message, 'Check Cleaning Progress'); }
      case 'cc-reset': { const r = await api('/company-cleaner/reset', { method: 'POST' }); await loadLists(); return uiAlert(r.message, 'Reset Cleaning Progress'); }
      case 'show-credits': return showAllCredits();
      case 'help': location.hash = '#/help'; return;
      case 'debug-credits': { uiBusy('Debug Credit Balance', 'Calling the Reoon API for every account…'); const r = await api('/verify/debug-credits'); return uiAlert(r.message, 'Reoon API Raw Response'); }
      case 'upload': return uploadList();
      case 'logout': await api('/auth/logout', { method: 'POST' }); state.user = null; location.hash = ''; render(); return;
      default: return;
    }
  }
  const refreshCurrentView = async () => { await loadLists(); refreshActiveSelect(); const v = routes[parseHash().name] || 'overview'; if (v === 'sheet' || v === 'sheets' || v === 'activity' || v === 'overview' || v === 'cleaner') views[v](parseHash().args).catch(() => {}); };

  // Verify Account Emails → verifyEmails(tabName)
  async function verifyAccount(account) {
    if (!isAdmin()) return uiAlert('Access Denied\n\nReachoutly has prohibited everyone from using this option, so it is locked.\nYour email: ' + state.user.email);
    const l = await requireActiveList(); if (!l) return;
    uiBusy('Verify ' + cap(account), `Checking credits of "${account}" and submitting unverified emails from "${l.name}"…`);
    try {
      const r = await api('/verify/account', { method: 'POST', body: { listId: l.id, account } });
      await loadCredits(true); await refreshCurrentView();
      await uiAlert(r.message, 'Verify ' + cap(account));
    } catch (e) { await uiAlert(e.message); }
  }
  // Lead List Clean → cleanLeadList()
  async function leadListClean() {
    const l = await requireActiveList(); if (!l) return;
    const started = Date.now();
    const upd = uiBusy('Lead List Clean', `Checking Daily Credits of all accounts and submitting unverified emails from "${l.name}"…`);
    const timer = setInterval(() => upd(`Tasks submitted - polling Reoon every 10 s (up to 100 s), exactly like the sheet.\nElapsed: ${Math.round((Date.now() - started) / 1000)} s.\nResults are also written in the background every minute.`), 10000);
    try {
      const r = await api('/verify/lead-list-clean', { method: 'POST', body: { listId: l.id } });
      clearInterval(timer); await loadCredits(true); await refreshCurrentView();
      await uiAlert(r.message, 'Lead List Clean');
    } catch (e) { clearInterval(timer); await uiAlert(e.message, 'Lead List Clean'); }
  }
  // Check Pending Results → checkPendingTaskResults()
  async function checkPendingResults() {
    const l = activeList();
    uiBusy('Check Pending Results', 'Fetching task results from Reoon…');
    let r; try { r = await api('/verify/check-pending', { method: 'POST', body: { listId: l ? l.id : null } }); } catch (e) { return uiAlert(e.message); }
    closeModal();
    if (r.noTasks) {
      if (r.orphanCount > 0 && l) {
        if (await uiConfirm('Pending Rows Found', r.message)) {
          const c = await api(`/lists/${l.id}/clear-pending-rows`, { method: 'POST', body: { force: true } });
          await refreshCurrentView();
          return uiAlert(`${c.cleared} row(s) cleared.\nRun "Lead List Clean" now.`);
        }
        return;
      }
      return uiAlert(r.message);
    }
    await refreshCurrentView(); loadCredits(false);
    return uiAlert(r.message, 'Check Pending Results');
  }
  // Clear All Pending Tasks
  async function clearAllPendingTasks() {
    if (!(await uiConfirm('Warning', 'All pending tasks will be deleted.\nAre you sure?'))) return;
    const r = await api('/verify/clear-pending-tasks', { method: 'POST' });
    await refreshCurrentView();
    return uiAlert('All pending tasks deleted successfully.' + (r.deleted ? `\n(${r.deleted} task(s))` : ''));
  }
  // Clean Decision Makers - the ORIGINAL dialog
  async function cleanDecisionMakers() {
    const l = await requireActiveList(); if (!l) return;
    uiHtmlDialog('decision_maker', 'Clean Decision Makers', 600, 580, l.id, async () => {
      await loadLists(); refreshActiveSelect();
      const cleaned = state.lists.find((x) => x.name === 'Cleaned - ' + l.name);
      if (cleaned && new Date(cleaned.updated_at.replace(' ', 'T') + 'Z').getTime() > Date.now() - 5 * 60 * 1000) { setActive(cleaned.id); location.hash = '#/list/' + cleaned.id; }
      else refreshCurrentView();
    });
  }
  // Start Cleaning Company Names → startCleaningProcess() + cleanCompanyNames()
  async function startCleaningProcess() {
    const l = await requireActiveList(); if (!l) return;
    let r = await api('/company-cleaner/start', { method: 'POST', body: { listId: l.id } });
    if (r.needsConfirm) {
      if (!(await uiConfirm('Tab Already Exists', r.message))) return;
      r = await api('/company-cleaner/start', { method: 'POST', body: { listId: l.id, overwrite: true } });
    }
    if (!r.ok) return uiAlert(r.message);
    await loadLists(); refreshActiveSelect(); setActive(r.listId); location.hash = '#/list/' + r.listId;
    await uiAlert(r.message, 'Start Cleaning Company Names');
    const upd = uiBusy('Cleaning Company Names', 'Starting…');
    $('#m-x').onclick = closeModal;
    for (;;) {
      await new Promise((res) => setTimeout(res, 3000));
      if (!$('#busy-text')) return;
      let p; try { p = await api('/company-cleaner/progress'); } catch (e) { break; }
      if (!p.active) { closeModal(); await refreshCurrentView(); return uiAlert(p.doneMessage || p.message, 'Company Names Cleaner'); }
      upd(`Cleaned ${num(p.processed)} / ${num(p.total)} rows (${p.percent}%) - batches of 100 via GPT.\nRemaining: ${num(p.remaining)}.\nYou can close this; cleaning continues in the background (Check Cleaning Progress).`);
    }
  }
  // Refresh & Show All Credits → showAllCredits()
  async function showAllCredits() {
    uiBusy('Refresh & Show All Credits', 'Fetching fresh balances from Reoon for every account…');
    await loadCredits(true);
    const cr = state.credits || { accounts: [], totalDaily: 0, totalInstant: 0 };
    const lines = ['All Account Credits', '══════════════════════════════════'];
    cr.accounts.forEach((a) => {
      let row = '  ' + a.name;
      if (!a.enabled) row += '  disabled'; else if (a.ok) row += '  →  Daily: ' + a.daily + '  |  Instant: ' + a.instant; else row += '  Unable to fetch credits';
      lines.push(row);
    });
    if (!cr.accounts.length) lines.push('  No API accounts configured' + (isAdmin() ? ' - add them in Admin → API Keys & Settings' : ''));
    lines.push('', '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━', 'Total Daily Credits   : ' + cr.totalDaily, 'Total Instant Credits : ' + cr.totalInstant);
    return uiAlert(lines.join('\n'), 'Refresh & Show All Credits');
  }
  async function uploadList() {
    const fmt = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : b > 1024 ? Math.round(b / 1024) + ' KB' : b + ' B');
    shell('Add a sheet', `
      <div class="tabs" id="up-tabs"><button type="button" class="tab on" data-tab="file">Upload a file</button><button type="button" class="tab" data-tab="google">Google Sheet link</button></div>
      <div id="tab-google" hidden>
        <div class="field"><label class="f">Google Sheet link</label><input type="text" id="gs-url" placeholder="https://docs.google.com/spreadsheets/d/.../edit#gid=0" autocomplete="off"></div>
        <div class="req" style="margin-bottom:12px"><div class="req-t">Before importing</div>
          <ul><li>In Google Sheets click <b>Share</b> and set <b>Anyone with the link</b> to <b>Viewer</b>.</li>
          <li>The tab that is open in the link (gid) is imported; otherwise the first tab.</li>
          <li>A copy is saved here as a sheet, so the history stays in this dashboard. The Google Sheet itself is not changed.</li></ul></div>
      </div>
      <div id="tab-file">
      <div class="dropzone" id="dz" tabindex="0">
        <input type="file" id="dz-file" accept=".csv,.tsv,.txt,.xlsx,.xlsm" hidden>
        <div class="dz-icon">${icon('upload', 26)}</div>
        <div class="dz-title">Drag & drop your file here</div>
        <div class="dz-sub">or <b>click to browse</b> · CSV, TSV or XLSX · up to 50 MB</div>
        <div class="dz-file" id="dz-name" hidden></div>
      </div>
      </div>
      <div class="field" style="margin-top:14px"><label class="f">Sheet name <span class="hint" id="dz-sheet-hint">(optional, defaults to the file name)</span></label><input type="text" id="dz-sheet" placeholder="e.g. Leads May 2026"></div>
      <div class="req">
        <div class="req-t">Column requirements (first row must be the header)</div>
        <ul>
          <li><b>Email</b> for email verification (Lead List Clean, Verify Account Emails)</li>
          <li><b>Title</b> or <b>Job Title</b> + <b>Company</b> or <b>Company Name</b> for Clean Decision Makers</li>
          <li><b>Company</b>, optionally <b>Website</b>, for the Company Names Cleaner</li>
        </ul>
      </div>`,
      '<button class="btn" id="m-no">Cancel</button><button class="btn primary" id="m-ok" disabled>Upload</button>');
    const dz = $('#dz'), inp = $('#dz-file'), nameEl = $('#dz-name'), ok = $('#m-ok');
    let file = null;
    let mode = 'file';
    const gsUrl = $('#gs-url');
    const setMode = (m) => {
      mode = m;
      $$('#up-tabs .tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === m));
      $('#tab-file').hidden = m !== 'file'; $('#tab-google').hidden = m !== 'google';
      ok.textContent = m === 'file' ? 'Upload' : 'Import';
      $('#dz-sheet-hint').textContent = m === 'file' ? '(optional, defaults to the file name)' : '(optional, defaults to the Google Sheet title)';
      ok.disabled = m === 'file' ? !file : !gsUrl.value.trim();
      if (m === 'google') gsUrl.focus();
    };
    $$('#up-tabs .tab').forEach((t) => t.onclick = () => setMode(t.dataset.tab));
    gsUrl.oninput = () => { if (mode === 'google') ok.disabled = !gsUrl.value.trim(); };
    gsUrl.onkeydown = (e) => { if (e.key === 'Enter' && !ok.disabled) ok.click(); };
    const setFile = (f) => {
      if (!f) return;
      if (!/\.(csv|tsv|txt|xlsx|xlsm)$/i.test(f.name)) { toast('Please choose a CSV, TSV or XLSX file.', 'err'); return; }
      file = f; nameEl.hidden = false; nameEl.innerHTML = `${icon('file', 15)} <b>${esc(f.name)}</b> <span class="hint">${fmt(f.size)}</span>`;
      dz.classList.add('has-file'); ok.disabled = false;
      if (!$('#dz-sheet').value) $('#dz-sheet').placeholder = f.name.replace(/\.[^.]+$/, '');
    };
    dz.onclick = () => inp.click();
    dz.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } };
    inp.onchange = () => setFile(inp.files[0]);
    ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
    ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
    dz.addEventListener('drop', (e) => setFile(e.dataTransfer.files[0]));
    $('#m-no').onclick = closeModal;
    ok.onclick = async () => {
      if (mode === 'google') {
        const url = gsUrl.value.trim(); if (!url) return;
        ok.disabled = true; ok.innerHTML = '<span class="spin"></span>Importing';
        try {
          const res = await api('/lists/import-google', { method: 'POST', body: { url, name: $('#dz-sheet').value.trim() } });
          closeModal(); await loadLists(); refreshActiveSelect(); setActive(res.list.id);
          toast(`Sheet "${res.list.name}" imported from Google Sheets with ${num(res.list.row_count)} rows`, 'ok');
          location.hash = '#/list/' + res.list.id;
        } catch (e) { ok.disabled = false; ok.textContent = 'Import'; toast(e.message, 'err'); }
        return;
      }
      if (!file) return;
      const fd = new FormData(); fd.append('file', file); fd.append('name', $('#dz-sheet').value.trim());
      ok.disabled = true; ok.innerHTML = '<span class="spin"></span>Uploading';
      try {
        const res = await api('/lists/upload', { method: 'POST', body: fd });
        closeModal(); await loadLists(); refreshActiveSelect(); setActive(res.list.id);
        toast(`Sheet "${res.list.name}" created with ${num(res.list.row_count)} rows`, 'ok');
        location.hash = '#/list/' + res.list.id;
      } catch (e) { ok.disabled = false; ok.textContent = 'Upload'; toast(e.message, 'err'); }
    };
  }


  // ── Views ──────────────────────────────────────────────────────────────────
  const views = {};
  const statusCls = (v) => {
    const s = String(v || '').toLowerCase().trim();
    if (!s) return ''; if (s === 'pending...') return 'c-pending'; if (s.startsWith('error')) return 'c-err';
    return 'c-' + s.replace(/[^a-z_]/g, '');
  };
  const kindBadge = (k) => ({ upload: '<span class="badge gray">upload</span>', decision_makers: '<span class="badge blue">decision makers</span>', company_clean: '<span class="badge">company clean</span>', sheet_cleaner: '<span class="badge blue">sheet cleaner</span>', google: '<span class="badge green">google sheet</span>' }[k] || esc(k));

  views.overview = async () => {
    setTitle('Overview');
    const c = $('#content'); c.innerHTML = loadingBlock();
    const [pending, act] = await Promise.all([api('/verify/pending'), api('/activity?limit=8')]);
    if (!state.credits) await loadCredits(false);
    const cr = state.credits || { accounts: [], totalDaily: 0, totalInstant: 0 };
    const cur = activeList();
    const totalRows = state.lists.reduce((a, l) => a + l.row_count, 0);
    c.innerHTML = `
      <div class="grid grid-4" style="margin-bottom:16px">
        <div class="stat"><div class="lbl">Total Daily Credits</div><div class="val green">${num(cr.totalDaily)}</div><div class="sub">${cr.accounts.filter((a) => a.enabled).length} active account(s)</div></div>
        <div class="stat"><div class="lbl">Total Instant Credits</div><div class="val blue">${num(cr.totalInstant)}</div><div class="sub">Lead List Clean uses daily only</div></div>
        <div class="stat"><div class="lbl">Sheets</div><div class="val">${num(state.lists.length)}</div><div class="sub">${num(totalRows)} rows total</div></div>
        <div class="stat"><div class="lbl">Pending Tasks</div><div class="val ${pending.tasks.length ? 'amber' : ''}">${num(pending.tasks.length)}</div><div class="sub">checked every minute</div></div>
      </div>
      <div class="card"><h3>Verify Account Emails ${isAdmin() ? '' : '<span class="badge gray">Locked by Reachoutly </span>'}
        <span class="right"><button class="btn sm" data-run="show-credits">Refresh & Show All Credits</button></span></h3>
        <div class="hint" style="margin-bottom:10px">${cur ? `Selected sheet: <b>${esc(cur.name)}</b>` : 'No sheet selected - open one under <b>Sheets</b> first.'} · Verifies every unverified email of the selected sheet with ONE account (may use its instant credits too).</div>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th>Daily</th><th>Instant</th><th>Status</th><th></th></tr></thead><tbody>
          ${cr.accounts.length ? cr.accounts.map((a) => `<tr><td><b>${esc(cap(a.name))}</b></td><td style="color:var(--green);font-weight:600">${num(a.daily)}</td><td>${num(a.instant)}</td>
            <td>${!a.enabled ? '<span class="badge gray">disabled</span>' : a.ok ? '<span class="badge green">ok</span>' : '<span class="badge red">unable to fetch</span>'}</td>
            <td style="text-align:right">${a.enabled ? `<button class="btn sm ${isAdmin() ? 'success' : 'ghost'}" data-run="verify:${esc(a.name)}">${isAdmin() ? 'Verify ' + esc(cap(a.name)) : 'Verify ' + esc(cap(a.name))}</button>` : ''}</td></tr>`).join('')
          : `<tr><td colspan="5" class="empty">No API accounts configured${isAdmin() ? ' - add them in Admin → API Keys & Settings.' : '. Ask your admin.'}</td></tr>`}
        </tbody></table></div>
      </div>
      <div class="grid grid-2">
        <div class="card"><h3>Pending verification tasks <span class="right"><button class="btn sm" data-run="check-pending">Check Pending Results</button></span></h3>${pendingTable(pending.tasks)}</div>
        <div class="card"><h3>Recent activity <span class="right"><a class="btn sm ghost" href="#/activity">View all →</a></span></h3>${activityTable(act.rows, true)}</div>
      </div>`;
    $$('[data-run]', c).forEach((b) => b.onclick = async () => { const html = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin"></span>' + b.textContent.trim(); try { await runAction(b.dataset.run); } catch (e) { uiAlert(e.message); } finally { if (document.body.contains(b)) { b.disabled = false; b.innerHTML = html; } } });
  };

  function pendingTable(tasks) {
    if (!tasks.length) return '<div class="empty" style="padding:10px">No pending verification tasks.</div>';
    return `<div class="tbl-wrap"><table class="t"><thead><tr><th>Task ID</th><th>Account</th><th>Sheet</th><th>Emails</th><th>Last status</th><th>Submitted</th></tr></thead><tbody>
      ${tasks.map((t) => `<tr><td>${esc(t.task_id)}</td><td>${esc(t.account)}</td><td><a href="#/list/${t.list_id}">${esc(t.list_name || '-')}</a></td><td>${num(t.total)}</td><td>${esc(t.last_status || 'submitted')}</td><td>${fmtDate(t.created_at)}</td></tr>`).join('')}</tbody></table></div>`;
  }

  views.sheets = async () => {
    setTitle('All sheets');
    const c = $('#content');
    const draw = async () => {
      await loadLists(); refreshActiveSelect();
      const pending = await api('/verify/pending');
      c.innerHTML = `<div class="card"><h3>Sheets <span class="right"><button class="btn sm primary" id="up">${icon('plus', 14)} Add sheet (file or Google Sheet link)</button><button class="btn sm" id="reload">↻ Refresh</button></span></h3>
        ${!state.lists.length ? '<div class="empty">No sheets yet - upload a CSV or XLSX. Each upload becomes a sheet, then use the Email Verifier menu on the left.</div>' : `
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Sheet</th><th>Type</th><th>Rows</th><th>Cols</th><th>Pending tasks</th>${isAdmin() ? '<th>Owner</th>' : ''}<th>Updated</th><th>Actions</th></tr></thead><tbody>
        ${state.lists.map((l) => `<tr><td><a href="#/list/${l.id}"><b>${esc(l.name)}</b></a>${l.id === state.activeId ? ' <span class="badge blue">selected</span>' : ''}${l.source_url ? ` <a class="hint" href="${esc(l.source_url)}" target="_blank" rel="noopener" title="Open the source Google Sheet">source</a>` : ''}</td><td>${kindBadge(l.kind)}</td><td>${num(l.row_count)}</td><td title="${esc(l.columns.join(', '))}">${l.columns.length}</td>
          <td>${l.pending_tasks ? `<span class="badge amber">${l.pending_tasks} running</span>` : '-'}</td>${isAdmin() ? `<td>${esc(l.owner_email)}</td>` : ''}<td>${fmtDate(l.updated_at)}</td>
          <td><a class="btn sm" href="#/list/${l.id}">Open</a><a class="btn sm" href="/api/lists/${l.id}/download?format=csv">CSV</a><a class="btn sm" href="/api/lists/${l.id}/download?format=xlsx">XLSX</a><button class="btn sm ghost" data-rename="${l.id}">Rename</button><button class="btn sm danger" data-del="${l.id}">Delete</button></td></tr>`).join('')}
        </tbody></table></div>`}
        <div class="hint" style="margin-top:10px">First row must be the header. <b>Email</b> column → verification · <b>Title/Job Title</b> + <b>Company</b> → Decision Makers · <b>Company</b> (+ <b>Website</b>) → Company Name Cleaner.</div></div>
        <div class="card"><h3>Pending verification tasks</h3>${pendingTable(pending.tasks)}</div>`;
      $('#up').onclick = () => uploadList();
      $('#reload').onclick = draw;
      $$('[data-del]').forEach((b) => b.onclick = async () => {
        const l = state.lists.find((x) => x.id === Number(b.dataset.del));
        if (!(await uiConfirm('Delete sheet', `Delete "${l.name}" (${num(l.row_count)} rows)?\nThis cannot be undone.`, 'Delete', 'Cancel'))) return;
        try { await api('/lists/' + l.id, { method: 'DELETE' }); toast('Deleted', 'ok'); } catch (e) { toast(e.message, 'err'); }
        draw();
      });
      $$('[data-rename]').forEach((b) => b.onclick = async () => {
        const l = state.lists.find((x) => x.id === Number(b.dataset.rename));
        const r = await uiForm('Rename sheet', [{ name: 'name', label: 'New name', value: l.name, required: true }], 'Rename');
        if (r) { try { await api('/lists/' + l.id, { method: 'PATCH', body: { name: r.name } }); } catch (e) { toast(e.message, 'err'); } }
        draw();
      });
    };
    await draw();
  };

  views.sheet = async (args) => {
    const id = Number(args[0]);
    const c = $('#content'); c.innerHTML = loadingBlock();
    state.pages = state.pages || {};
    let page = state.pages[id] || 0;
    const draw = async () => {
      state.pages[id] = page;
      const r = await api(`/lists/${id}?limit=${PAGE}&offset=${page * PAGE}`);
      const { list, rows, stats: st } = r;
      setActive(list.id); setTitle(list.name);
      const verifiedTotal = Object.values(st.byStatus).reduce((a, b) => a + b, 0);
      const byStatus = Object.keys(st.byStatus).sort().map((k) => `<span class="badge gray" style="margin:1px"><span class="${statusCls(k)}">${esc(k)}</span> ${num(st.byStatus[k])}</span>`).join(' ');
      const pages = Math.max(1, Math.ceil(list.row_count / PAGE));
      c.innerHTML = `
        <div class="grid grid-4" style="margin-bottom:14px">
          <div class="stat"><div class="lbl">Rows</div><div class="val">${num(list.row_count)}</div><div class="sub">${list.columns.length} columns · ${kindBadge(list.kind)}${isAdmin() && list.owner_email !== state.user.email ? ' · ' + esc(list.owner_email) : ''}</div></div>
          <div class="stat"><div class="lbl">Unverified emails</div><div class="val ${st.unverified ? 'amber' : ''}">${st.emailCol === -1 ? '-' : num(st.unverified)}</div><div class="sub">${st.emailCol === -1 ? 'no "Email" column' : 'valid emails with empty status'}</div></div>
          <div class="stat"><div class="lbl">Pending…</div><div class="val ${st.pending ? 'amber' : ''}">${num(st.pending)}</div><div class="sub">${r.pending_tasks} active task(s)</div></div>
          <div class="stat"><div class="lbl">Verified</div><div class="val green">${num(verifiedTotal)}</div><div class="sub" style="white-space:normal">${byStatus || '-'}</div></div>
        </div>
        <div class="card"><h3>Sheet data <span class="right">rows ${num(page * PAGE + 1)}–${num(Math.min((page + 1) * PAGE, list.row_count))} of ${num(list.row_count)} &nbsp;<a class="btn sm" href="/api/lists/${list.id}/download?format=csv">CSV</a><a class="btn sm" href="/api/lists/${list.id}/download?format=xlsx">XLSX</a><button class="btn sm ghost" id="a-rename">Rename</button><button class="btn sm ghost" id="a-refresh">↻</button></span></h3>
          <div class="hint" style="margin-bottom:10px">Use the sections on the left to run the tools on this sheet.${list.source_url ? ` Imported from <a href="${esc(list.source_url)}" target="_blank" rel="noopener">this Google Sheet</a> on ${fmtDate(list.created_at)}. <button class="btn sm ghost" id="a-reimport">Import again as a new sheet</button>` : ''}</div>
          <div class="sheet"><table><thead>
            <tr class="letters"><th class="rn"></th>${list.columns.map((_, i) => `<th>${colLetter(i)}</th>`).join('')}</tr>
            <tr class="header"><th class="rn">1</th>${list.columns.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>
            ${rows.length ? rows.map((row) => `<tr><td class="rn">${row.row_index + 2}</td>${row.data.map((v, i) => `<td class="${i === st.statusCol ? statusCls(v) : ''}" title="${esc(v)}">${esc(v)}</td>`).join('')}</tr>`).join('') : '<tr><td class="rn">2</td><td colspan="99" class="empty">No rows</td></tr>'}
          </tbody></table></div>
          ${pages > 1 ? `<div class="pager"><button class="btn sm" id="pg-prev" ${page === 0 ? 'disabled' : ''}>← Prev</button><span>page ${page + 1} / ${pages}</span><button class="btn sm" id="pg-next" ${page + 1 >= pages ? 'disabled' : ''}>Next →</button></div>` : ''}
        </div>`;
      $('#a-refresh').onclick = draw;
      if ($('#a-reimport')) $('#a-reimport').onclick = async () => {
        uiBusy('Import from Google Sheets', 'Fetching the latest data from the Google Sheet');
        try {
          const res = await api('/lists/import-google', { method: 'POST', body: { url: list.source_url, name: list.name } });
          closeModal(); await loadLists(); refreshActiveSelect(); setActive(res.list.id);
          toast(`Sheet "${res.list.name}" imported with ${num(res.list.row_count)} rows`, 'ok');
          location.hash = '#/list/' + res.list.id;
        } catch (e) { closeModal(); uiAlert(e.message, 'Import from Google Sheets'); }
      };
      $('#a-rename').onclick = async () => {
        const r = await uiForm('Rename sheet', [{ name: 'name', label: 'New name', value: list.name, required: true }], 'Rename');
        if (r) { try { await api('/lists/' + list.id, { method: 'PATCH', body: { name: r.name } }); await loadLists(); refreshActiveSelect(); } catch (e) { toast(e.message, 'err'); } draw(); }
      };
      if ($('#pg-prev')) { $('#pg-prev').onclick = () => { page--; draw(); }; $('#pg-next').onclick = () => { page++; draw(); }; }
    };
    await draw();
  };

  function activityTable(rows, compact) {
    if (!rows.length) return '<div class="empty">No activity yet - every automation run is logged here.</div>';
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
    setTitle(isAdmin() ? 'info - Activity Log (all users)' : 'info - My Activity');
    const c = $('#content');
    c.innerHTML = `<div class="card"><h3>info tab - activity log ${isAdmin() ? '(misuse monitoring)' : ''} <span class="right">read-only</span></h3>
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

  views.users = async () => {
    if (!isAdmin()) { location.hash = '#/'; return; }
    setTitle('Users');
    const c = $('#content');
    const draw = async () => {
      const { users } = await api('/users');
      c.innerHTML = `<div class="card"><h3>Users <span class="right"><button class="btn primary sm" id="u-add">+ Add user</button></span></h3>
        <div class="tbl-wrap"><table class="t"><thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Status</th><th>Sheets</th><th>Runs</th><th>Last login</th><th>Created</th><th>Actions</th></tr></thead><tbody>
        ${users.map((u) => `<tr><td><b>${esc(u.email)}</b>${u.id === state.user.id ? ' <span class="badge blue">you</span>' : ''}</td><td>${esc(u.name)}</td><td><span class="badge ${u.role === 'admin' ? '' : 'gray'}">${u.role.toUpperCase()}</span></td>
          <td>${u.active ? '<span class="badge green">active</span>' : '<span class="badge red">deactivated</span>'}</td><td>${num(u.list_count)}</td><td>${num(u.activity_count)}</td><td>${fmtDate(u.last_login_at)}</td><td>${fmtDate(u.created_at)}</td>
          <td><button class="btn sm" data-edit="${u.id}">Edit</button><button class="btn sm" data-pw="${u.id}">Reset password</button><button class="btn sm ${u.active ? 'ghost' : 'success'}" data-toggle="${u.id}" data-active="${u.active}">${u.active ? 'Deactivate' : 'Activate'}</button><button class="btn sm danger" data-del="${u.id}">Delete</button></td></tr>`).join('')}
        </tbody></table></div>
        <div class="hint" style="margin-top:10px"><b>Admin</b>: everything, incl. Verify Account Emails, API keys, all users' sheets and activity. <b>User</b>: own sheets, Lead List Clean, Decision Makers, Company Name Cleaner, own activity.</div></div>`;
      $('#u-add').onclick = async () => {
        const r = await uiForm('Add user', [
          { name: 'email', label: 'Email', type: 'email', required: true }, { name: 'name', label: 'Name' },
          { name: 'password', label: 'Password (min 6 chars)', type: 'password', required: true },
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
        const r = await uiForm('Reset password - ' + u.email, [{ name: 'password', label: 'New password (min 6 chars)', type: 'password', required: true }], 'Reset');
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
    setTitle('API Keys & Settings');
    const c = $('#content');
    const draw = async () => {
      const s = await api('/settings');
      c.innerHTML = `
        <div class="card"><h3>Reoon API accounts (Script Properties: API_KEY_&lt;name&gt;) <span class="right"><button class="btn primary sm" id="k-add">+ Add account</button></span></h3>
          <div class="tbl-wrap"><table class="t"><thead><tr><th>Account</th><th>API key</th><th>Enabled</th><th>Added</th><th>Actions</th></tr></thead><tbody>
          ${s.accounts.length ? s.accounts.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td><code>${esc(a.keyMasked)}</code></td><td>${a.enabled ? '<span class="badge green">enabled</span>' : '<span class="badge gray">disabled</span>'}</td><td>${fmtDate(a.created_at)}</td>
            <td><button class="btn sm" data-key="${a.id}">Change key</button><button class="btn sm" data-rename="${a.id}">Rename</button><button class="btn sm ${a.enabled ? 'ghost' : 'success'}" data-toggle="${a.id}" data-en="${a.enabled ? 1 : 0}">${a.enabled ? 'Disable' : 'Enable'}</button><button class="btn sm danger" data-del="${a.id}">Delete</button></td></tr>`).join('') : '<tr><td colspan="5" class="empty">No accounts yet - add the Reoon accounts here (same names as the sheet tabs).</td></tr>'}
          </tbody></table></div>
          <div class="hint" style="margin-top:8px">Lead List Clean splits emails across all <b>enabled</b> accounts using Daily credits only. Keys are stored locally and never shown in full.</div></div>
        <div class="card"><h3>OpenAI (CHATGPT_API_KEY) - Company Names Cleaner</h3>
          <form id="oa-form" class="row">
            <div><label class="f">API key ${s.openai.hasKey ? `<span class="badge green">set: ${esc(s.openai.keyMasked)}</span>` : '<span class="badge red">not set</span>'}</label><input type="password" name="apiKey" placeholder="sk-… (blank = keep current)" autocomplete="new-password"></div>
            <div style="max-width:220px"><label class="f">Model</label><input type="text" name="model" value="${esc(s.openai.model)}"></div>
            <div class="auto"><button class="btn primary" type="submit">Save</button></div>
            <div class="auto"><button class="btn danger" type="button" id="oa-clear" ${s.openai.hasKey ? '' : 'disabled'}>Clear key</button></div>
          </form></div>
        <div class="card"><h3>Runtime</h3><div class="hint">Reoon API base: <code>${esc(s.reoonApiBase)}</code> · background result poll every <b>${s.pollIntervalSeconds}s</b> (the 1-minute trigger) · credits refresh every 10 min · change in <code>.env</code> and restart.</div></div>`;
      $('#k-add').onclick = async () => {
        const r = await uiForm('Add Reoon account', [{ name: 'name', label: 'Account name (e.g. emailastrallc)', required: true }, { name: 'apiKey', label: 'Reoon API key', type: 'password', required: true }], 'Add');
        if (r) { try { const res = await api('/settings/accounts', { method: 'POST', body: r }); toast(res.warning || `Added - Daily: ${res.balance.daily} | Instant: ${res.balance.instant}`, res.warning ? 'err' : 'ok'); loadCredits(false); } catch (e) { toast(e.message, 'err'); } }
        draw();
      };
      $$('[data-key]').forEach((b) => b.onclick = async () => {
        const a = s.accounts.find((x) => x.id === Number(b.dataset.key));
        const r = await uiForm('Change key - ' + a.name, [{ name: 'apiKey', label: 'New Reoon API key', type: 'password', required: true }]);
        if (r) { try { const res = await api('/settings/accounts/' + a.id, { method: 'PATCH', body: r }); toast(res.balance ? `Saved - Daily: ${res.balance.daily} | Instant: ${res.balance.instant}` : 'Saved, but balance check failed - verify the key.', res.balance ? 'ok' : 'err'); loadCredits(false); } catch (e) { toast(e.message, 'err'); } }
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

  views.cleaner = async () => {
    setTitle('Sheet Cleaner');
    const c = $('#content');
    await loadLists();
    const cur = activeList();
    const st = { listId: cur ? cur.id : (state.lists[0] ? state.lists[0].id : null), selected: new Set(), mode: 'keep', dropBlank: false, output: 'new' };
    let list = null;
    let countTimer = null;

    const draw = () => {
      c.innerHTML = `
        <div class="card"><h3>Source sheet <span class="right"><button class="btn sm" id="sc-upload">${icon('upload', 14)} Upload a new sheet</button></span></h3>
          <div class="row"><div><select id="sc-list">${state.lists.length ? state.lists.map((l) => `<option value="${l.id}" ${l.id === st.listId ? 'selected' : ''}>${esc(l.name)} (${num(l.row_count)} rows, ${l.columns.length} columns)</option>`).join('') : '<option value="">No sheets yet. Upload one first.</option>'}</select></div></div>
        </div>
        <div class="card" id="sc-cols"></div>
        <div class="card"><h3>Options</h3>
          <label class="check big"><input type="checkbox" id="sc-blank" ${st.dropBlank ? 'checked' : ''}> <span>Delete rows where the <b>Email</b> cell is blank <span class="hint" id="sc-blank-count"></span></span></label>
          <div class="seg" style="margin-top:12px">
            <label class="seg-opt ${st.output === 'new' ? 'on' : ''}"><input type="radio" name="sc-out" value="new" ${st.output === 'new' ? 'checked' : ''}> Save as a new sheet</label>
            <label class="seg-opt ${st.output === 'replace' ? 'on' : ''}"><input type="radio" name="sc-out" value="replace" ${st.output === 'replace' ? 'checked' : ''}> Apply to this sheet</label>
          </div>
          <div class="field" id="sc-name-wrap" style="margin-top:10px" ${st.output === 'new' ? '' : 'hidden'}><label class="f">New sheet name <span class="hint">(optional)</span></label><input type="text" id="sc-name" placeholder="${list ? esc(list.name) + ' (cleaned)' : ''}"></div>
        </div>
        <div class="card"><div class="row" style="align-items:center"><div id="sc-summary" class="hint"></div><div class="auto"><button class="btn primary" id="sc-run" disabled>Clean sheet</button></div></div></div>`;
      $('#sc-list').onchange = (e) => { st.listId = Number(e.target.value); st.selected.clear(); loadSheet(); };
      $('#sc-upload').onclick = () => uploadList();
      $('#sc-blank').onchange = (e) => { st.dropBlank = e.target.checked; refresh(); };
      $$('input[name=sc-out]').forEach((r) => r.onchange = () => { st.output = r.value; $$('.seg-opt').forEach((o) => o.classList.toggle('on', o.querySelector('input').checked)); $('#sc-name-wrap').hidden = st.output !== 'new'; refresh(); });
      $('#sc-run').onclick = run;
      drawColumns();
    };

    const drawColumns = () => {
      const box = $('#sc-cols'); if (!box) return;
      if (!list) { box.innerHTML = '<h3>Columns</h3><div class="empty">Select a sheet to see its columns.</div>'; return; }
      box.innerHTML = `<h3>Columns <span class="hint" style="text-transform:none;letter-spacing:0;font-weight:500">Click a column to select it</span>
          <span class="right"><button class="btn sm ghost" id="sc-all">Select all</button><button class="btn sm ghost" id="sc-none">Clear</button></span></h3>
        <div class="seg" style="margin-bottom:12px">
          <label class="seg-opt ${st.mode === 'keep' ? 'on' : ''}"><input type="radio" name="sc-mode" value="keep" ${st.mode === 'keep' ? 'checked' : ''}> Keep only the selected columns</label>
          <label class="seg-opt ${st.mode === 'delete' ? 'on' : ''}"><input type="radio" name="sc-mode" value="delete" ${st.mode === 'delete' ? 'checked' : ''}> Delete the selected columns</label>
        </div>
        <div class="colchips">${list.columns.map((h, i) => `<button type="button" class="colchip ${st.selected.has(i) ? 'on' : ''}" data-i="${i}"><span class="colchip-letter">${colLetter(i)}</span>${esc(h)}</button>`).join('')}</div>`;
      $$('.colchip', box).forEach((b) => b.onclick = () => { const i = Number(b.dataset.i); if (st.selected.has(i)) st.selected.delete(i); else st.selected.add(i); b.classList.toggle('on', st.selected.has(i)); refresh(); });
      $('#sc-all').onclick = () => { list.columns.forEach((_, i) => st.selected.add(i)); $$('.colchip', box).forEach((b) => b.classList.add('on')); refresh(); };
      $('#sc-none').onclick = () => { st.selected.clear(); $$('.colchip', box).forEach((b) => b.classList.remove('on')); refresh(); };
      $$('input[name=sc-mode]', box).forEach((r) => r.onchange = () => { st.mode = r.value; $$('.seg-opt', box).forEach((o) => o.classList.toggle('on', o.querySelector('input').checked)); refresh(); });
    };

    const loadSheet = async () => {
      list = st.listId ? state.lists.find((l) => l.id === st.listId) || null : null;
      if (list) setActive(list.id);
      draw(); refresh();
    };

    const refresh = () => {
      clearTimeout(countTimer);
      const run = $('#sc-run'), sum = $('#sc-summary'); if (!run) return;
      if (!list) { run.disabled = true; sum.textContent = ''; return; }
      sum.innerHTML = '<span class="spin"></span>Calculating';
      countTimer = setTimeout(async () => {
        try {
          const p = await api('/sheet-cleaner/preview', { method: 'POST', body: { listId: list.id, columns: [...st.selected], mode: st.mode, dropBlankEmail: st.dropBlank } });
          const parts = [];
          parts.push(st.selected.size ? `${num(p.keptColumns)} of ${num(p.totalColumns)} columns will remain` : 'No columns selected: all columns stay');
          if (st.dropBlank) parts.push(p.hasEmail ? `${num(p.blankEmailRows)} row(s) with a blank Email will be deleted` : 'this sheet has no Email column');
          parts.push(`result: ${num(p.rowsAfter)} rows x ${num(p.keptColumns)} columns`);
          sum.textContent = parts.join(' | ');
          const bc = $('#sc-blank-count'); if (bc) bc.textContent = p.hasEmail ? `(${num(p.blankEmailRows)} row(s))` : '(no Email column in this sheet)';
          const nothing = p.removedColumns === 0 && !(st.dropBlank && p.hasEmail);
          run.disabled = nothing || p.keptColumns === 0;
        } catch (e) { sum.textContent = e.message; run.disabled = true; }
      }, 150);
    };

    async function run() {
      if (!list) return;
      const body = { listId: list.id, columns: [...st.selected], mode: st.mode, dropBlankEmail: st.dropBlank, output: st.output, name: $('#sc-name') ? $('#sc-name').value : '' };
      const what = [];
      if (st.selected.size) what.push(st.mode === 'keep' ? `keep only ${st.selected.size} selected column(s)` : `delete ${st.selected.size} selected column(s)`);
      if (st.dropBlank) what.push('delete rows with a blank Email');
      const ok = await uiConfirm('Clean sheet', `Sheet: ${list.name}\nAction: ${what.join(' and ')}\nOutput: ${st.output === 'replace' ? 'apply to this sheet (cannot be undone)' : 'a new sheet'}\n\nProceed?`, 'Clean', 'Cancel');
      if (!ok) return;
      try {
        const r = await api('/sheet-cleaner/run', { method: 'POST', body });
        await loadLists(); refreshActiveSelect(); setActive(r.listId);
        await uiAlert(r.message, 'Sheet Cleaner');
        location.hash = '#/list/' + r.listId;
      } catch (e) { uiAlert(e.message, 'Sheet Cleaner'); }
    }

    await loadSheet();
  };

  views.help = async () => {
    setTitle('Guideline & Help');
    $('#content').innerHTML = `<div class="help">
      <div class="card"><h3>Sheets (instead of spreadsheet tabs)</h3>
        <ul><li>Add a sheet from <b>Sheets → All sheets → Add sheet</b>: upload a <span class="highlight">CSV or XLSX</span>, or paste a <span class="highlight">Google Sheet link</span> (the Google Sheet must be shared as "Anyone with the link: Viewer"; a copy is kept here, the Google Sheet is not changed).</li>
        <li>For uploads the first row must be the header. Each upload or import becomes a sheet listed under All sheets.</li>
        <li>Open a sheet to see its data and stats. Download the result any time as CSV or XLSX. The sheet that is open (or last opened) is the <span class="highlight">selected sheet</span> - every tool runs on it.</li>
        <li>Users only see their own sheets. <span class="highlight">Admins see everyone's sheets.</span></li></ul></div>
      <div class="card"><h3>Sheet Cleaner</h3>
        <ul><li>Pick a sheet (or upload a new one). Its columns appear as chips: click to select.</li>
        <li><span class="highlight">Keep only the selected columns</span> or <span class="highlight">Delete the selected columns</span>. Nothing selected means all columns stay.</li>
        <li>Tick <span class="highlight">Delete rows where the Email cell is blank</span> to drop rows without an email address.</li>
        <li>Save the result as a new sheet (default) or apply it to the same sheet.</li></ul></div>
      <div class="card"><h3>Bulk Lead List Clean</h3>
        <p>Automatically verifies large email lists using all enabled Reoon accounts in parallel:</p>
        <ul><li>Divides all unverified emails across available Reoon accounts to maximize daily verification speed.</li>
        <li><span class="highlight">Uses Daily Credits Only:</span> consumes free daily balances first to protect paid instant credits.</li>
        <li><span class="highlight">Non-Blocking:</span> polls Reoon every 10 seconds for up to 100 seconds and shows the summary; anything still running is written automatically in the background every minute.</li>
        <li>Adds <span class="highlight">Verification Status</span> and <span class="highlight">Verification Date</span> columns right after <span class="highlight">Email</span> if missing.</li>
        <li><span class="highlight">Activity Logging:</span> every run is logged to the <b>info</b> Activity Log with User Email, Function, Sheet, Task ID, API Account, Date, Total emails and Status.</li>
        <li><span class="highlight">Check Pending Results:</span> manually poll all active tasks and write results immediately. If rows are stuck as <span class="warning">"Pending..."</span> with no active task, it offers to clear them so they are processed again.</li>
        <li><span class="highlight">Clear All Pending Tasks:</span> forgets all running tasks (rows stay "Pending..." until cleared).</li></ul></div>
      <div class="card"><h3>Verify Account Emails (Overview page)</h3>
        <ul><li><span class="warning">Access Restricted:</span> only <b>admins</b> can run per-account verification. For users the buttons are locked.</li>
        <li>Submits a bulk verification task for the selected sheet with ONE account and returns immediately - <span class="success">no waiting required</span>. May use daily <b>and</b> instant credits of that account.</li>
        <li>Results appear <span class="highlight">automatically within 1–5 minutes</span> via the background poller.</li>
        <li><span class="highlight">Refresh & Show All Credits:</span> fetches fresh Daily / Instant balances of every account.</li></ul></div>
      <div class="card"><h3>Clean Decision Makers</h3>
        <p>Filters the selected sheet to keep only target decision makers per company:</p>
        <ul><li>Requires <span class="highlight">Title / Job Title</span> and <span class="highlight">Company / Company Name</span> columns (case-insensitive).</li>
        <li><span class="highlight">Verification Priority:</span> if a status column exists, deliverable emails (Safe → Role Account → Catch All) are prioritized automatically.</li>
        <li><span class="highlight">Title Keyword Fallback:</span> if the keywords box is empty, 29 pre-defined default titles (CEO, VP, Director, Owner, Founder, etc.) are used. Custom keywords replace defaults entirely.</li>
        <li>Supports filtering by Industry, Country, Seniority and Department. The matching count updates live.</li>
        <li>Outputs to a new sheet <span class="highlight">"Cleaned - [Sheet Name]"</span>, keeping original data untouched.</li></ul></div>
      <div class="card"><h3>Company Names Cleaner (GPT-Powered)</h3>
        <ul><li>Uses the OpenAI API to remove locations, legal suffixes (LLC, Inc, GmbH), URLs and generic business terms.</li>
        <li><span class="highlight">Start Cleaning:</span> duplicates the selected sheet to <span class="highlight">"[your email], the company name cleaning"</span>, adds a <span class="highlight">"Clean Company Name"</span> column and processes <span class="highlight">100 rows per batch</span> in the background.</li>
        <li><span class="highlight">Check Progress:</span> percentage done, last processed row and remaining rows. <span class="highlight">Reset Progress:</span> stops the job.</li>
        <li><span class="highlight">Safe Writes:</span> rows that already have a cleaned name are skipped.</li>
        <li>The OpenAI key and model are set by an admin in <span class="highlight">Admin → API Keys &amp; Settings</span>.</li></ul></div>
      <div class="card"><h3>Activity Log (the "info" tab)</h3>
        <ul><li><span class="highlight">Columns:</span> User Email · Function · Sheet · Task ID · API Account · Date · Task Name · Status · Total · Progress · Action</li>
        <li><span class="highlight">Misuse Monitoring:</span> admins can review who ran which tool, on which sheet, how many rows and when. Users see only their own runs.</li></ul></div>
      <div class="card"><h3>Roles</h3>
        <ul><li><b>Admin:</b> manage users and Reoon / OpenAI API keys, view all activity and all sheets, run every tool including Verify Account Emails.</li>
        <li><b>User:</b> upload own sheets, run Lead List Clean, Clean Decision Makers and Company Name Cleaner; view own activity and credit balances.</li></ul></div>
      <div class="card"><h3>Tips</h3>
        <ul><li>Only one action runs at a time - wait for the current one to finish before starting another.</li>
        <li>Don't re-upload a sheet that is still being verified; open the existing sheet and use <b>Check Pending Results</b>.</li></ul></div>
    </div>`;
  };

  views.account = async () => {
    setTitle('My Account');
    $('#content').innerHTML = `<div class="grid grid-2">
      <div class="card"><h3>Profile</h3><p style="color:var(--muted);line-height:1.8">Email: <b style="color:var(--text)">${esc(state.user.email)}</b><br>Name: ${esc(state.user.name || '-')}<br>Role: <span class="badge ${isAdmin() ? '' : 'gray'}">${state.user.role.toUpperCase()}</span></p>
        <div class="hint" style="margin-top:8px">${isAdmin() ? 'Admins can manage users and API keys, see every user\'s activity and sheets, and run Verify Account Emails.' : 'Users can upload their own sheets and run Lead List Clean, Clean Decision Makers and Company Name Cleaner. Verify Account Emails and admin pages are locked.'}</div></div>
      <div class="card"><h3>Change password</h3><form id="pw-form">
        <div class="field"><label class="f">Current password</label><input type="password" name="currentPassword" required autocomplete="current-password"></div>
        <div class="field"><label class="f">New password (min 6 chars)</label><input type="password" name="newPassword" required autocomplete="new-password"></div>
        <button class="btn primary" type="submit">Update password</button></form></div></div>`;
    $('#pw-form').onsubmit = async (e) => {
      e.preventDefault();
      try { await api('/auth/password', { method: 'POST', body: { currentPassword: e.target.currentPassword.value, newPassword: e.target.newPassword.value } }); toast('Password updated', 'ok'); e.target.reset(); } catch (err) { toast(err.message, 'err'); }
    };
  };

  // ── Login ──────────────────────────────────────────────────────────────────
  function loginView() {
    return `<div class="login-wrap"><div class="login-card">
      <h1><span class="logo">${icon('mail', 22)}</span>Email Verifier</h1><div class="sub">Reoon API Dashboard. Sign in to continue.</div>
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
      const btn = $('button[type=submit]', f); btn.disabled = true; btn.innerHTML = '<span class="spin"></span>Signing in';
      try {
        state.user = (await api('/auth/login', { method: 'POST', body: { email: f.email.value, password: f.password.value } })).user;
        await afterLogin(); render();
      } catch (err) {
        btn.disabled = false; btn.textContent = 'Sign in'; console.error(err); const el = $('#login-err'); if (el) el.innerHTML = `<div class="alert err">${esc(err.message)}</div>`; else toast(err.message, 'err'); }
    };
  }

  // Auto-refresh the open sheet while its tasks are running (results are written in the background)
  setInterval(() => {
    if (!state.user || modalRoot().children.length) return;
    const { name, args } = parseHash();
    if (name !== 'list') return;
    const l = state.lists.find((x) => x.id === Number(args[0]));
    if (l && l.pending_tasks) loadLists().then(() => views.sheet(args));
  }, 30000);

  boot();
})();

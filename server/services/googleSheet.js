// =============================================================================
//  googleSheet.js - import a Google Sheet that is shared "Anyone with the link"
//  Uses the public CSV export URL, so no Google credentials are needed.
// =============================================================================
const fileParser = require('./fileParser');

const EXPORT_BASE = (process.env.GOOGLE_SHEETS_EXPORT_BASE || 'https://docs.google.com').replace(/\/+$/, '');

/** Accepts a full Google Sheets URL (any /edit, /view, ?usp=, #gid= form) or a bare spreadsheet id. */
function parseLink(input) {
  const s = String(input || '').trim();
  if (!s) throw new Error('Paste the Google Sheet link first.');
  let id = null;
  let gid = null;
  const m = s.match(/\/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9_-]{20,})/);
  if (m) id = m[1];
  else if (/^[a-zA-Z0-9_-]{20,}$/.test(s)) id = s;
  if (!id) throw new Error('This does not look like a Google Sheets link. It should contain /spreadsheets/d/<id>/.');
  const g = s.match(/[#?&]gid=(\d+)/);
  if (g) gid = g[1];
  return { id, gid: gid || '0' };
}

async function fetchCsv(id, gid) {
  const url = `${EXPORT_BASE}/spreadsheets/d/${id}/export?format=csv&gid=${encodeURIComponent(gid)}`;
  let res;
  try {
    res = await fetch(url, { redirect: 'follow', headers: { 'User-Agent': 'Mozilla/5.0 (EmailVerifierDashboard)' } });
  } catch (e) {
    throw new Error('Could not reach Google Sheets: ' + e.message);
  }
  const ctype = (res.headers.get('content-type') || '').toLowerCase();
  const buf = Buffer.from(await res.arrayBuffer());
  const head = buf.slice(0, 300).toString('utf8').toLowerCase();
  if (res.status === 404) throw new Error('Google Sheet not found. Check the link (and the gid of the tab).');
  if (!res.ok || ctype.indexOf('text/html') !== -1 || head.indexOf('<html') !== -1 || head.indexOf('<!doctype') !== -1) {
    throw new Error('The sheet is not shared publicly. In Google Sheets click Share, set "Anyone with the link" to Viewer, then try again.');
  }
  // Google sends: attachment; filename="Spreadsheet title - Tab name.csv"
  let title = '';
  const cd = res.headers.get('content-disposition') || '';
  const fm = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
  if (fm) { try { title = decodeURIComponent(fm[1]); } catch (e) { title = fm[1]; } title = title.replace(/\.csv$/i, ''); }
  return { buf, title };
}

async function importSheet(input) {
  const { id, gid } = parseLink(input);
  const { buf, title } = await fetchCsv(id, gid);
  const parsed = await fileParser.parseUpload(buf, 'google-sheet.csv');
  const canonical = `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${gid}`;
  return { id, gid, title, url: canonical, columns: parsed.columns, rows: parsed.rows };
}

module.exports = { parseLink, importSheet };

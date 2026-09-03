// =============================================================================
//  decisionMaker.js — port of runDecisionMakerFilter / countDecisionMakerLeads /
//  matchesSubDepartment (Code.gs)
// =============================================================================
const lists = require('./lists');
const activity = require('./activityLog');

const DEFAULT_KEYWORDS = [
  'Chief', 'President', 'VP', 'Vice president', 'SVP', 'Head', 'Director',
  'Founder', 'Co-Founder', 'Owner', 'Co-Owner', 'CEO', 'Executive Director (ED)', 'COO',
  'CFO', 'CDO', 'CPO', 'CSO', 'CMO', 'CIO', 'Chief Advocacy Officer (CAO)',
  'Chief Impact Officer (CIO)', 'Chairperson of the Board', 'Vice Chairperson', 'Treasurer',
  'Secretary', 'Board Member', 'Program Director', 'Program Manager'
];

const TITLE_HEADERS    = ['Title', 'Job Title'];
const COMPANY_HEADERS  = ['Company', 'Company Name'];
const STATUS_HEADERS   = ['Status', 'Verification Status'];
const INDUSTRY_HEADERS = ['Industry', 'Sector'];
const COUNTRY_HEADERS  = ['Country', 'Location', 'Nation'];
const STATUS_PRIORITY  = ['safe', 'role_account', 'catch_all', 'disposable'];

function matchesSubDepartment(title, subDept) {
  const t = title.toLowerCase();
  const s = subDept.toLowerCase();
  if (s === 'software development') {
    return t.indexOf('software') !== -1 || t.indexOf('developer') !== -1 || t.indexOf('programmer') !== -1 || t.indexOf('engineer') !== -1;
  }
  if (s === 'c-suite' || s === 'executive') {
    return t.indexOf('chief') !== -1 || t.indexOf('c-suite') !== -1 || t.indexOf('executive') !== -1 || t.indexOf('ceo') !== -1 ||
      t.indexOf('cto') !== -1 || t.indexOf('cfo') !== -1 || t.indexOf('coo') !== -1;
  }
  const words = s.split(/\s+/);
  for (const w of words) {
    if (w.length > 3 && t.indexOf(w) !== -1) return true;
  }
  return t.indexOf(s) !== -1;
}

function lowerAll(arr) { return (arr || []).map((x) => String(x).toLowerCase().trim()).filter(Boolean); }

function findCols(columns) {
  return {
    titleCol: lists.findHeader(columns, TITLE_HEADERS),
    companyCol: lists.findHeader(columns, COMPANY_HEADERS),
    statusCol: lists.findHeader(columns, STATUS_HEADERS),
    industryCol: lists.findHeader(columns, INDUSTRY_HEADERS),
    countryCol: lists.findHeader(columns, COUNTRY_HEADERS)
  };
}

/** Returns true if the row passes all filters (industry, country, keyword, seniority, department). */
function rowMatches(row, cols, f) {
  const rowTitle = row[cols.titleCol] ? String(row[cols.titleCol]).toLowerCase().trim() : '';

  if (f.industries.length) {
    if (cols.industryCol === -1) return false;
    const v = row[cols.industryCol] ? String(row[cols.industryCol]).toLowerCase().trim() : '';
    if (!f.industries.some((ind) => v === ind || v.indexOf(ind) !== -1)) return false;
  }
  if (f.countries.length) {
    if (cols.countryCol === -1) return false;
    const v = row[cols.countryCol] ? String(row[cols.countryCol]).toLowerCase().trim() : '';
    if (!f.countries.some((c) => v === c || v.indexOf(c) !== -1)) return false;
  }
  if (f.keywords.length) {
    if (!f.keywords.some((k) => rowTitle.indexOf(k) !== -1)) return false;
  }
  if (f.seniority.length) {
    const ok = f.seniority.some((s) => {
      if (s === 'c-suite') {
        return rowTitle.indexOf('chief') !== -1 || rowTitle.indexOf('ceo') !== -1 || rowTitle.indexOf('cto') !== -1 ||
          rowTitle.indexOf('cfo') !== -1 || rowTitle.indexOf('coo') !== -1;
      }
      return rowTitle.indexOf(s) !== -1;
    });
    if (!ok) return false;
  }
  if (f.departments.length) {
    if (!f.departments.some((d) => matchesSubDepartment(rowTitle, d))) return false;
  }
  return true;
}

function normalizeFilters(filters) {
  filters = filters || {};
  let keywords = Array.isArray(filters.keywords) ? filters.keywords.filter(Boolean) : [];
  if (!keywords.length) keywords = DEFAULT_KEYWORDS;
  return {
    keywords: lowerAll(keywords),
    seniority: lowerAll(filters.seniority),
    departments: lowerAll(filters.departments),
    industries: lowerAll(filters.industry),
    countries: lowerAll(filters.country),
    perCompany: Math.max(1, parseInt(filters.perCompany, 10) || 1)
  };
}

function countLeads(listId, filters) {
  const list = lists.getList(listId);
  const cols = findCols(list.columns);
  if (cols.titleCol === -1 || cols.companyCol === -1) return 0;
  const f = normalizeFilters(filters);
  let count = 0;
  for (const r of lists.getRows(listId)) {
    const company = r.data[cols.companyCol] ? String(r.data[cols.companyCol]).trim() : '';
    if (!company) continue;
    if (rowMatches(r.data, cols, f)) count++;
  }
  return count;
}

function runFilter(user, listId, filters) {
  const list = lists.getList(listId);
  const cols = findCols(list.columns);
  if (cols.titleCol === -1 || cols.companyCol === -1) {
    throw new Error('Required columns (Title/Job Title, Company/Company Name) not found.');
  }
  if (filters && filters.industry && filters.industry.length && cols.industryCol === -1) {
    throw new Error('An Industry filter was selected, but no "Industry" or "Sector" column was found in the sheet.');
  }
  if (filters && filters.country && filters.country.length && cols.countryCol === -1) {
    throw new Error('A Country filter was selected, but no "Country" or "Location" column was found in the sheet.');
  }
  const f = normalizeFilters(filters);
  const hasStatus = cols.statusCol !== -1;

  const companyMap = {};
  let totalScanned = 0, totalMatched = 0;
  const rows = lists.getRows(listId);
  rows.forEach((r, idx) => {
    const row = r.data;
    const company = row[cols.companyCol] ? String(row[cols.companyCol]).trim() : '';
    if (!company) return;
    totalScanned++;
    if (!rowMatches(row, cols, f)) return;

    const status = hasStatus && row[cols.statusCol] ? String(row[cols.statusCol]).trim().toLowerCase() : '';
    const matchesStatus = !hasStatus || STATUS_PRIORITY.indexOf(status) !== -1 || status === '';
    if (matchesStatus) {
      totalMatched++;
      if (!companyMap[company]) companyMap[company] = [];
      let rank = hasStatus ? STATUS_PRIORITY.indexOf(status) : 0;
      if (rank === -1) rank = 999;
      companyMap[company].push({ row, statusRank: rank, index: idx });
    }
  });

  const cleanedRows = [];
  let totalKept = 0;
  Object.keys(companyMap).forEach((company) => {
    companyMap[company].sort((a, b) => (a.statusRank !== b.statusRank ? a.statusRank - b.statusRank : a.index - b.index));
    const limit = Math.min(companyMap[company].length, f.perCompany);
    for (let i = 0; i < limit; i++) { cleanedRows.push(companyMap[company][i].row); totalKept++; }
  });

  // Write to new list "Cleaned — <name>" (replace if exists, like clearing the sheet)
  const cleanedName = 'Cleaned — ' + list.name;
  const existing = lists.getListByName(user.id, cleanedName);
  if (existing) lists.deleteList(existing.id);
  const newId = lists.createList({
    userId: user.id, name: cleanedName, originalName: list.original_name, kind: 'decision_makers',
    sourceListId: list.id, columns: list.columns, rows: cleanedRows
  });

  activity.logActivity({ user, fn: 'Decision Maker Filter', list, taskName: 'Decision Maker — ' + list.name, status: 'completed', total: totalKept });

  const summary = [
    '✅ Clean Decision Makers — Completed',
    '══════════════════════════════════════',
    `📂 Scanned    : ${totalScanned} row(s)`,
    `✅ Matched    : ${totalMatched} decision maker(s)`,
    `📊 Final Kept : ${totalKept} row(s) (max ${f.perCompany} per company)`,
    `🗂  Output Tab : "${cleanedName}"`,
    `📢 Status Col : ${hasStatus ? 'Active (' + list.columns[cols.statusCol] + ')' : 'Not Found (Skipped)'}`
  ].join('\n');

  return { ok: true, message: summary, listId: newId, listName: cleanedName, scanned: totalScanned, matched: totalMatched, kept: totalKept };
}

module.exports = { countLeads, runFilter, DEFAULT_KEYWORDS, matchesSubDepartment };

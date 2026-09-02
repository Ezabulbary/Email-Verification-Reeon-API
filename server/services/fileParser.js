// =============================================================================
//  fileParser.js — CSV / XLSX import & export
// =============================================================================
const path = require('path');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const ExcelJS = require('exceljs');

function cellToString(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((t) => t.text).join('');
    if (v.text !== undefined) return String(v.text);           // hyperlink
    if (v.result !== undefined) return cellToString(v.result); // formula
    if (v.error) return '';
    return String(v);
  }
  return String(v);
}

/** Returns { columns:[], rows:[[...]] } from a CSV or XLSX buffer. */
async function parseUpload(buffer, filename) {
  const ext = path.extname(filename || '').toLowerCase();
  let table = [];

  if (ext === '.xlsx' || ext === '.xlsm' || ext === '.xls') {
    if (ext === '.xls') throw new Error('Legacy .xls is not supported — please save the file as .xlsx or .csv.');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('Workbook has no sheets.');
    let maxCols = 0;
    ws.eachRow({ includeEmpty: false }, (row) => { maxCols = Math.max(maxCols, row.cellCount); });
    ws.eachRow({ includeEmpty: true }, (row, rowNumber) => {
      const arr = [];
      for (let c = 1; c <= maxCols; c++) arr.push(cellToString(row.getCell(c).value));
      table[rowNumber - 1] = arr;
    });
    table = table.map((r) => r || []);
  } else {
    // CSV / TSV / TXT
    let text = buffer.toString('utf8');
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const delimiter = ext === '.tsv' ? '\t' : detectDelimiter(text);
    table = parse(text, { delimiter, relax_column_count: true, skip_empty_lines: false, bom: true, trim: false });
  }

  // Drop fully empty leading rows, use the first non-empty row as header
  while (table.length && table[0].every((c) => String(c).trim() === '')) table.shift();
  if (!table.length) throw new Error('File is empty.');

  const columns = table[0].map((c, i) => (String(c).trim() ? String(c).trim() : 'Column ' + (i + 1)));
  const rows = table.slice(1)
    .filter((r) => r.some((c) => String(c).trim() !== ''))
    .map((r) => columns.map((_, i) => (r[i] === undefined || r[i] === null ? '' : String(r[i]))));
  return { columns, rows };
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || '';
  const counts = { ',': 0, ';': 0, '\t': 0, '|': 0 };
  for (const ch of firstLine) if (counts[ch] !== undefined) counts[ch]++;
  return Object.keys(counts).reduce((a, b) => (counts[b] > counts[a] ? b : a), ',');
}

function toCsv(columns, rows) {
  return stringify([columns, ...rows]);
}

async function toXlsxBuffer(columns, rows, sheetName) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Sheet1');
  ws.addRow(columns);
  ws.getRow(1).font = { bold: true };
  rows.forEach((r) => ws.addRow(r));
  columns.forEach((c, i) => {
    let w = String(c).length;
    for (let k = 0; k < Math.min(rows.length, 200); k++) w = Math.max(w, String(rows[k][i] || '').length);
    ws.getColumn(i + 1).width = Math.min(Math.max(w + 2, 10), 60);
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { parseUpload, toCsv, toXlsxBuffer };

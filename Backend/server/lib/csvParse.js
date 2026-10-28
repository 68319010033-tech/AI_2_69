const { parse } = require('csv-parse/sync');

const normHeader = (h) => String(h).replace(/^\uFEFF/, '').trim().toLowerCase().replace(/[\s\-]+/g, '_');
// Firebase RTDB keys cannot contain . $ # [ ] /
const safeKey = (h) => String(h).replace(/^\uFEFF/, '').replace(/[.$#\[\]\/]/g, '_').trim();

function parseCsv(buffer) {
  const text = buffer.toString('utf8').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n'); // normalize mixed line endings
  const warnings = [];
  if (text.includes('\uFFFD')) warnings.push('File contains invalid characters; it may not be UTF-8.');
  let recs;
  try {
    recs = parse(text, { columns: false, skip_empty_lines: true, relax_column_count: true, info: true });
  } catch (e) {
    return { headers: [], rows: [], mismatches: [], warnings, error: e.message };
  }
  if (!recs.length) return { headers: [], rows: [], mismatches: [], warnings, error: 'File is empty' };
  const headerRec = recs[0].record.map(String);
  const headers = headerRec.map((h, i) => ({ key: safeKey(h) || 'col' + i, orig: h.replace(/^\uFEFF/, ''), norm: normHeader(h) }));
  const mismatches = [];
  const rows = recs.slice(1).map(({ record, info }) => {
    if (record.length !== headers.length) mismatches.push({ row: info.lines, found: record.length, expected: headers.length });
    const o = { _row: info.lines };
    headers.forEach((h, j) => { o[h.key] = record[j] === undefined ? '' : String(record[j]); });
    return o;
  });
  return { headers, rows, mismatches, warnings, error: null };
}

module.exports = { parseCsv, normHeader };

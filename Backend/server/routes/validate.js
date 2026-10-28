const express = require('express');
const db = require('../lib/db');
const { cleanFile } = require('../lib/clean');
const { validate } = require('../lib/validate');
const { FILES, FILE_NAMES } = require('../lib/schema');

const router = express.Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const csvEsc = (v) => (v == null ? '' : /[",\n\r]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));

// POST /api/validate {sessionId}  -> clean + validate, save cleaned data, issues, log
router.post('/validate', ah(async (req, res) => {
  const { sessionId } = req.body || {};
  const raw = await db.get(`sessions/${sessionId}/raw`);
  if (!raw) return res.status(404).json({ error: 'Session not found or no files uploaded' });
  const cleaned = {}, issues = [], log = [];
  for (const name of FILE_NAMES) {
    if (!raw[name]) continue;
    const parsed = { headers: db.arr(raw[name].headers), rows: db.arr(raw[name].rows), mismatches: db.arr(raw[name].mismatches), warnings: db.arr(raw[name].warnings) };
    const r = cleanFile(name, parsed);
    cleaned[name] = { rows: r.rows, missingCols: r.missingCols };
    issues.push(...r.issues); log.push(...r.log);
  }
  const v = validate(cleaned);
  issues.push(...v.issues);
  const order = { error: 0, warning: 1, info: 2 };
  issues.sort((a, b) => order[a.severity] - order[b.severity]);
  const errors = issues.filter((i) => i.severity === 'error').length;
  const canGenerate = errors === 0;

  // store cleaned rows without internal fields (only when no required columns are missing)
  const store = {};
  for (const name of FILE_NAMES) if (cleaned[name]) store[name] = cleaned[name].rows.map(({ _row, _bad, ...rest }) => rest);
  await db.set(`sessions/${sessionId}/cleaned`, store);
  await db.set(`sessions/${sessionId}/issues`, issues);
  await db.set(`sessions/${sessionId}/cleaningLog`, log);
  await db.set(`sessions/${sessionId}/stats`, v.stats);
  await db.update(`sessions/${sessionId}/meta`, { status: 'validated', canGenerate, errorCount: errors });
  res.json({ sessionId, canGenerate, counts: { error: errors, warning: issues.filter((i) => i.severity === 'warning').length, info: issues.filter((i) => i.severity === 'info').length }, issues, stats: v.stats, logCount: log.length, logPreview: log.slice(0, 200) });
}));

router.get('/issues/:sid', ah(async (req, res) => res.json(db.arr(await db.get(`sessions/${req.params.sid}/issues`)))));

router.get('/cleaned/:sid/:file', ah(async (req, res) => {
  const name = req.params.file.replace(/\.csv$/i, '');
  if (!FILES[name]) return res.status(404).json({ error: 'Unknown file' });
  const rows = db.arr(await db.get(`sessions/${req.params.sid}/cleaned/${name}`));
  const cols = Object.keys(FILES[name].cols);
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => csvEsc(r[c])).join(','))].join('\r\n') + '\r\n';
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"` }).send('\uFEFF' + csv);
}));

router.get('/cleaning-log/:sid', ah(async (req, res) => {
  const log = db.arr(await db.get(`sessions/${req.params.sid}/cleaningLog`));
  const cols = ['file', 'row', 'column', 'before', 'after', 'rule'];
  const csv = [cols.join(','), ...log.map((r) => cols.map((c) => csvEsc(r[c])).join(','))].join('\r\n') + '\r\n';
  res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="cleaning_log.csv"' }).send('\uFEFF' + csv);
}));

module.exports = router;

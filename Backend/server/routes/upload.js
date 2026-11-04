const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('../lib/db');
const { ownsSession } = require('../lib/auth');
const { parseCsv } = require('../lib/csvParse');
const { FILES, FILE_NAMES } = require('../lib/schema');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 20 } });
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const revisionOf = raw => crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex');
router.get('/data/schema', (req, res) => res.json({ files: FILES }));

// Only return the signed-in user's latest upload (or their previous session).
router.get('/data/latest', ah(async (req, res) => {
  const sessionId = await db.get(`latestUploads/${req.user.id}`) || req.query.sessionId;
  if (!sessionId) return res.json({ sessionId: null });
  await ownsSession(req, sessionId);
  const raw = await db.get(`sessions/${sessionId}/raw`) || {};
  const files = {};
  for (const name of FILE_NAMES) {
    if (!raw[name]) continue;
    const headers = db.arr(raw[name].headers);
    const data = db.arr(raw[name].rows).map(row => headers.map(header => String(row[header.key] ?? '')));
    files[`${name}.csv`] = { headers: headers.map(header => header.orig), data, rows: data.length };
  }
  res.json({ sessionId, revision: revisionOf(raw), files });
}));

// POST /api/upload  (multipart; any field name; file name must be one of the 10 names, e.g. groups.csv)
router.post('/upload', upload.any(), ah(async (req, res) => {
  if (req.body?.sessionId) await ownsSession(req, req.body.sessionId);
  const sessionId = req.body?.sessionId || crypto.randomBytes(6).toString('hex');
  const summary = [];
  for (const f of req.files || []) {
    const name = f.originalname.replace(/\.csv$/i, '').trim().toLowerCase();
    if (!FILES[name]) { summary.push({ file: f.originalname, recognized: false, message: `Unknown file. Expected one of: ${FILE_NAMES.join(', ')}` }); continue; }
    const parsed = parseCsv(f.buffer);
    if (parsed.error) { summary.push({ file: name, recognized: true, error: parsed.error }); continue; }
    await db.set(`sessions/${sessionId}/raw/${name}`, { headers: parsed.headers, rows: parsed.rows, mismatches: parsed.mismatches, warnings: parsed.warnings });
    summary.push({ file: name, recognized: true, rows: parsed.rows.length, columns: parsed.headers.map((h) => h.orig) });
  }
  const rawKeys = Object.keys((await db.get(`sessions/${sessionId}/raw`)) || {});
  const missing = FILE_NAMES.filter((n) => !rawKeys.includes(n));
  const prev = (await db.get(`sessions/${sessionId}/meta`)) || {};
  await db.update(`sessions/${sessionId}/meta`, { ownerId: prev.ownerId || req.user.id, createdAt: prev.createdAt || new Date().toISOString(), status: 'uploaded', canGenerate: false });
  if (summary.length && summary.every(file => file.recognized && !file.error)) {
    await db.set(`latestUploads/${req.user.id}`, sessionId);
  }
  const revision = revisionOf(await db.get(`sessions/${sessionId}/raw`) || {});
  res.json({ sessionId, revision, files: summary, missing, complete: missing.length === 0 });
}));

module.exports = router;

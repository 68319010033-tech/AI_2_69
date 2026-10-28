const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const db = require('../lib/db');
const { parseCsv } = require('../lib/csvParse');
const { FILES, FILE_NAMES } = require('../lib/schema');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 20 } });
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);

// POST /api/upload  (multipart; any field name; file name must be one of the 10 names, e.g. groups.csv)
router.post('/upload', upload.any(), ah(async (req, res) => {
  const sessionId = (req.body && req.body.sessionId) || crypto.randomBytes(6).toString('hex');
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
  await db.update(`sessions/${sessionId}/meta`, { createdAt: prev.createdAt || new Date().toISOString(), status: 'uploaded', canGenerate: false });
  res.json({ sessionId, files: summary, missing, complete: missing.length === 0 });
}));

module.exports = router;

const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const { ownsSession } = require('../lib/auth');
const router = express.Router();
const ah = fn => (req, res, next) => fn(req, res, next).catch(next);
router.get('/datasets', ah(async (req, res) => {
  const data = await db.get(`datasets/${req.user.id}`) || {};
  res.json({ datasets: Object.values(data).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}));
router.post('/datasets', ah(async (req, res) => {
  const { sessionId, name } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) return res.status(400).json({ message: 'Enter a dataset name (1–80 characters).' });
  await ownsSession(req, sessionId);
  const source = await db.get(`sessions/${sessionId}`);
  if (!source?.meta?.canGenerate || !source.cleaned) return res.status(409).json({ message: 'Validate your data before saving a dataset.' });
  const id = crypto.randomBytes(6).toString('hex');
  const dataset = { id, name: name.trim(), createdAt: new Date().toISOString(), offerings: source.stats?.offerings || 0, periods: source.stats?.totalPeriods || 0 };
  // Copy the validated input: subsequent uploads cannot change the saved snapshot.
  await db.set(`sessions/${id}`, { raw: source.raw, cleaned: source.cleaned, stats: source.stats || {}, meta: { ownerId: req.user.id, canGenerate: true, status: 'validated', datasetName: dataset.name, createdAt: dataset.createdAt } });
  await db.set(`datasets/${req.user.id}/${id}`, dataset);
  res.status(201).json({ dataset });
}));
module.exports = router;

const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const { ownsSession, fail } = require('../lib/auth');
const { loadMeta } = require('../lib/store');
const router = express.Router();
const ah = fn => (req, res, next) => fn(req, res, next).catch(next);
const MAX_PER_USER = 30;
const idOk = id => typeof id === 'string' && /^[a-f0-9]{12}$/.test(id);

// Immutable snapshots of a generated timetable, kept per user so earlier results can be reviewed
// after the dataset is regenerated (schedules/<session>/<method> is overwritten on every run).
async function ownSnapshot(req) {
  if (!idOk(req.params.id)) throw fail(400, 'Invalid timetable ID');
  const meta = await db.get(`timetables/${req.user.id}/${req.params.id}`);
  const data = meta && await db.get(`timetableData/${req.params.id}`);
  if (!meta || !data || data.ownerId !== req.user.id) throw fail(404, 'Saved timetable not found');
  return { meta, data };
}

router.get('/timetables', ah(async (req, res) => {
  const all = await db.get(`timetables/${req.user.id}`) || {};
  res.json({ timetables: Object.values(all).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
}));

router.post('/timetables', ah(async (req, res) => {
  const { sessionId, name } = req.body || {};
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 80) throw fail(400, 'Enter a timetable name (1–80 characters).');
  await ownsSession(req, sessionId);
  const meta = await loadMeta(sessionId);
  const method = ['cpsat', 'baseline'].includes(req.body.method) ? req.body.method : (meta.activeMethod || (meta.has_cpsat ? 'cpsat' : 'baseline'));
  const assignments = db.arr(await db.get(`schedules/${sessionId}/${method}`));
  if (!assignments.length) throw fail(409, 'Generate a timetable before saving it.');
  const existing = await db.get(`timetables/${req.user.id}`) || {};
  if (Object.keys(existing).length >= MAX_PER_USER) throw fail(409, `You can keep up to ${MAX_PER_USER} saved timetables. Delete one first.`);
  const report = await db.get(`reports/${sessionId}/${method}`) || {};
  const id = crypto.randomBytes(6).toString('hex');
  const item = {
    id, name: name.trim(), createdAt: new Date().toISOString(), sessionId, method,
    datasetName: meta.datasetName || '', scheduled: assignments.length,
    valid: report.check?.valid ?? null, violations: report.check?.violations_total ?? null,
    objective: report.objective ?? null, solverStatus: report.solverStatus || null,
  };
  await db.set(`timetableData/${id}`, { ownerId: req.user.id, sessionId, method, assignments, report });
  await db.set(`timetables/${req.user.id}/${id}`, item);
  res.status(201).json({ timetable: item });
}));

// Restore a snapshot as the active timetable of its dataset so the view and export pages show it.
router.post('/timetables/:id/load', ah(async (req, res) => {
  const { meta, data } = await ownSnapshot(req);
  const session = await db.get(`sessions/${meta.sessionId}/meta`);
  if (!session) throw fail(410, 'The dataset used by this timetable no longer exists.');
  await db.set(`schedules/${meta.sessionId}/${data.method}`, data.assignments);
  if (data.report && Object.keys(data.report).length) await db.set(`reports/${meta.sessionId}/${data.method}`, data.report);
  await db.update(`sessions/${meta.sessionId}/meta`, { status: 'generated', [`has_${data.method}`]: true, activeMethod: data.method });
  const dataset = await db.get(`datasets/${req.user.id}/${meta.sessionId}`);
  res.json({ sessionId: meta.sessionId, method: data.method, dataset: dataset || null });
}));

router.delete('/timetables/:id', ah(async (req, res) => {
  await ownSnapshot(req);
  await db.remove(`timetables/${req.user.id}/${req.params.id}`);
  await db.remove(`timetableData/${req.params.id}`);
  res.json({ status: 'deleted' });
}));
module.exports = router;

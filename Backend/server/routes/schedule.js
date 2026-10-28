const express = require('express');
const db = require('../lib/db');
const { loadCleaned, loadMeta } = require('../lib/store');
const { buildReport } = require('../lib/report');
const { DAYS } = require('../lib/schema');

const router = express.Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const csvOut = (res, name, text) => res.set({ 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` }).send('\uFEFF' + text);

async function pickMethod(sid, wanted) {
  const meta = await loadMeta(sid);
  if (!meta) return null;
  return wanted || meta.activeMethod || (meta.has_cpsat ? 'cpsat' : meta.has_baseline ? 'baseline' : null);
}

// GET /api/schedule/:sid?method=cpsat -> enriched items for the 3 views (group / teacher / room)
router.get('/schedule/:sid', ah(async (req, res) => {
  const method = await pickMethod(req.params.sid, req.query.method);
  if (!method) return res.status(404).json({ error: 'No schedule generated yet' });
  const asg = db.arr(await db.get(`schedules/${req.params.sid}/${method}`));
  if (!asg.length) return res.status(404).json({ error: 'No schedule for this method' });
  const d = await loadCleaned(req.params.sid);
  const off = Object.fromEntries(d.offerings.map((o) => [o.offering_id, o]));
  const course = Object.fromEntries(d.courses.map((c) => [c.course_id, c]));
  const items = asg.map((a) => {
    const o = off[a.offering_id]; const c = course[o.course_id] || {};
    return { ...a, periods: o.periods, end_period: a.start_period + o.periods - 1, group_id: o.group_id, teacher_id: o.teacher_id, course_id: o.course_id, course_name: c.course_name || o.course_id };
  });
  res.json({ method, days: DAYS, items,
    groups: d.groups.map((g) => ({ id: g.group_id, name: g.group_name || null })),
    teachers: d.teachers.map((t) => ({ id: t.teacher_id, name: t.teacher_name || null })),
    rooms: d.rooms.map((r) => ({ id: r.room_id, name: r.room_name || null, type: r.room_type })) });
}));

router.get('/report/:sid', ah(async (req, res) => {
  const reports = (await db.get(`reports/${req.params.sid}`)) || {};
  const meta = await loadMeta(req.params.sid);
  res.json({ activeMethod: meta && meta.activeMethod, reports });
}));

// GET /api/compare/:sid  -> baseline vs CP-SAT table for the presentation
router.get('/compare/:sid', ah(async (req, res) => {
  const reports = (await db.get(`reports/${req.params.sid}`)) || {};
  res.json(Object.entries(reports).map(([method, r]) => ({ method, valid: r.check.valid, violations: r.check.violations_total, scheduled: r.check.scheduled, total: r.check.total_offerings, ...r.check.metrics, objective: r.objective, solverStatus: r.solverStatus, seconds: r.wall })));
}));

// GET /api/export/:sid/solution.csv  (exact header: offering_id,day,start_period,room_id)
router.get('/export/:sid/solution.csv', ah(async (req, res) => {
  const method = await pickMethod(req.params.sid, req.query.method);
  const asg = method ? db.arr(await db.get(`schedules/${req.params.sid}/${method}`)) : [];
  if (!asg.length) return res.status(404).json({ error: 'No schedule generated yet' });
  asg.sort((a, b) => a.offering_id.localeCompare(b.offering_id));
  csvOut(res, 'solution.csv', ['offering_id,day,start_period,room_id', ...asg.map((a) => `${a.offering_id},${a.day},${a.start_period},${a.room_id}`)].join('\r\n') + '\r\n');
}));

// GET /api/export/:sid/report.md  (human-readable report)
router.get('/export/:sid/report.md', ah(async (req, res) => {
  const method = await pickMethod(req.params.sid, req.query.method);
  const asg = method ? db.arr(await db.get(`schedules/${req.params.sid}/${method}`)) : [];
  const rep = method ? await db.get(`reports/${req.params.sid}/${method}`) : null;
  if (!asg.length || !rep) return res.status(404).json({ error: 'No schedule generated yet' });
  const data = await loadCleaned(req.params.sid);
  const job = (await db.get(`jobs/${rep.jobId}`)) || {};
  const md = buildReport({ sessionId: req.params.sid, method, job, check: rep.check, data, assignments: asg });
  res.set({ 'Content-Type': 'text/markdown; charset=utf-8', 'Content-Disposition': 'attachment; filename="timetable_report.md"' }).send(md);
}));

module.exports = router;

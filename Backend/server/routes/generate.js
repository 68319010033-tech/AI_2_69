const express = require('express');
const crypto = require('crypto');
const db = require('../lib/db');
const { loadCleaned, loadMeta } = require('../lib/store');
const { solveCpsat, solveBaseline, runChecker } = require('../lib/solverRunner');

const router = express.Router();
const ah = (fn) => (req, res, next) => fn(req, res, next).catch(next);
const jobs = new Map(); // in-memory copy for fast polling

async function saveJob(job) { jobs.set(job.jobId, job); await db.set(`jobs/${job.jobId}`, job); }

// POST /api/generate {sessionId, method:'cpsat'|'baseline', timeLimitSec, seed, workers, weights}
router.post('/generate', ah(async (req, res) => {
  const { sessionId, method = 'cpsat', timeLimitSec = 60, seed = 1, workers = 8, weights } = req.body || {};
  if (!['cpsat', 'baseline'].includes(method)) return res.status(400).json({ error: 'method must be cpsat or baseline' });
  const meta = await loadMeta(sessionId);
  if (!meta) return res.status(404).json({ error: 'Session not found' });
  if (!meta.canGenerate) return res.status(409).json({ error: 'Data has validation errors or was not validated. Run /api/validate and fix all errors first.' });
  const tl = Math.max(1, Math.min(Number(timeLimitSec) || 60, 600));
  const job = { jobId: crypto.randomBytes(6).toString('hex'), sessionId, method, status: 'running', startedAt: Date.now(), elapsedSec: 0, config: { timeLimitSec: tl, seed, workers, weights: weights || null } };
  await saveJob(job);
  res.status(202).json({ jobId: job.jobId });
  runJob(job).catch(() => {});
}));

async function runJob(job) {
  const t0 = Date.now();
  const tick = setInterval(() => { job.elapsedSec = +((Date.now() - t0) / 1000).toFixed(1); }, 500);
  try {
    const data = await loadCleaned(job.sessionId);
    const input = { data, config: job.config };
    const onProgress = (p) => { job.progress = p; job.objective = p.objective ?? job.objective; };
    const r = job.method === 'cpsat'
      ? await solveCpsat(input, { onProgress, timeoutMs: (job.config.timeLimitSec + 120) * 1000 })
      : await solveBaseline(input, { timeoutMs: (job.config.timeLimitSec + 60) * 1000 });
    job.solverStatus = r.status; job.objective = r.objective ?? job.objective; job.bound = r.bound ?? null;
    job.solverWallSec = r.wall_time; job.attempts = r.attempts; job.culprits = r.culprit_constraints || null; job.details = r.details || null;
    job.unplaced = r.unplaced || null;
    if (r.assignments && r.assignments.length) {
      const check = await runChecker(data, r.assignments);
      await db.set(`schedules/${job.sessionId}/${job.method}`, r.assignments);
      await db.set(`reports/${job.sessionId}/${job.method}`, { jobId: job.jobId, check, solverStatus: r.status, objective: r.objective ?? null, wall: r.wall_time, config: job.config, at: new Date().toISOString() });
      job.valid = check.valid; job.violations = check.violations_total; job.metrics = check.metrics;
      await db.update(`sessions/${job.sessionId}/meta`, { status: 'generated', [`has_${job.method}`]: true, activeMethod: job.method === 'cpsat' || !(await db.get(`sessions/${job.sessionId}/meta/has_cpsat`)) ? job.method : 'cpsat' });
    }
    job.status = (r.assignments && r.assignments.length) ? 'done' : 'failed';
    if (job.status === 'failed') job.error = r.reason === 'no_candidates' ? 'Some offerings have no possible placement (see details).' : `Solver status ${r.status}: no schedule found.`;
  } catch (e) {
    job.status = 'failed'; job.error = e.message;
  } finally {
    clearInterval(tick);
    job.elapsedSec = +((Date.now() - t0) / 1000).toFixed(1);
    job.finishedAt = Date.now();
    await saveJob(job).catch(() => {});
  }
}

router.get('/jobs/:jobId', ah(async (req, res) => {
  const j = jobs.get(req.params.jobId) || (await db.get(`jobs/${req.params.jobId}`));
  if (!j) return res.status(404).json({ error: 'Job not found' });
  res.json(j);
}));

module.exports = router;

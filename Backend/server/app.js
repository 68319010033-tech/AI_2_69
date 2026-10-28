const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const db = require('./lib/db');
const a = require('./lib/auth');
const { pythonInfo } = require('./lib/solverRunner');
const app = express();
app.disable('x-powered-by');
if (process.env.TRUST_PROXY_HOPS) app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS));
app.use(cors({ origin: process.env.APP_ORIGIN || 'http://localhost:5173', credentials: true }));
app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use('/api', a.checkOrigin, (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await db.get('health'); dbOk = true; } catch (_) {}
  const py = await pythonInfo();
  res.status(dbOk && py ? 200 : 503).json({ ok: dbOk && !!py, db: { mode: db.getMode(), ok: dbOk }, python: py ? { ok: true, version: py } : { ok: false } });
});
app.use('/api/auth', rateLimit({ windowMs: 15 * 60000, limit: 100, standardHeaders: 'draft-7', legacyHeaders: false, message: { message: 'Too many requests. Try again in 15 minutes.' } }), require('./routes/auth'));
app.use('/api', a.requireAuth);
app.get('/api/admin/users', a.requireAdmin, async (req, res, next) => {
  try { res.json({ users: Object.values(await db.get('authUsers') || {}).map(a.publicUser) }); } catch (e) { next(e); }
});
app.use('/api', async (req, res, next) => {
  try {
    if (req.query.method && !['cpsat', 'baseline'].includes(req.query.method)) throw a.fail(400, 'Invalid method');
    let sid;
    const match = req.path.match(/^\/(schedule|report|compare|export|issues|cleaned|cleaning-log)\/([^/]+)/);
    if (match) sid = decodeURIComponent(match[2]);
    if (['/validate', '/generate'].includes(req.path)) sid = req.body?.sessionId || '';
    if (req.path.startsWith('/jobs/')) {
      const id = req.path.slice(6);
      if (!/^[a-f0-9]{12}$/.test(id)) throw a.fail(400, 'Invalid job ID');
      const job = await db.get(`jobs/${id}`);
      if (!job) throw a.fail(404, 'Job not found');
      sid = job.sessionId;
    }
    if (sid !== undefined) await a.ownsSession(req, sid);
    next();
  } catch (e) { next(e); }
});
for (const route of ['upload', 'validate', 'generate', 'schedule']) app.use('/api', require(`./routes/${route}`));
app.use('/api', (req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, req, res, next) => {
  const status = err.status || (err.name === 'MulterError' ? 400 : 500);
  if (status >= 500) console.error('[request failed]', err.name);
  res.status(status).json({ message: status >= 500 ? 'Service unavailable. Try again later.' : err.message });
});
const dist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html'))); }
module.exports = app;

const express = require('express');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const db = require('./lib/db');
const { pythonInfo } = require('./lib/solverRunner');

const mode = db.init();
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const USER = process.env.ADMIN_USER || 'judge';
const PASS = process.env.ADMIN_PASS || 'judge1234';
const tokens = new Set();

app.get('/api/health', async (req, res) => {
  let dbOk = false;
  try { await db.get('health'); dbOk = true; } catch (_) {}
  const py = await pythonInfo();
  res.status(dbOk && py ? 200 : 503).json({ ok: dbOk && !!py, db: { mode: db.getMode(), ok: dbOk }, python: py ? { ok: true, version: py } : { ok: false } });
});

app.post('/api/login', (req, res) => {
  const { user, pass } = req.body || {};
  if (user === USER && pass === PASS) { const t = crypto.randomBytes(24).toString('hex'); tokens.add(t); return res.json({ token: t }); }
  res.status(401).json({ error: 'Invalid username or password' });
});

// Auth: Bearer token or ?token= (for download links). Set AUTH_DISABLED=1 to turn off.
app.use('/api', (req, res, next) => {
  if (process.env.AUTH_DISABLED === '1') return next();
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : req.query.token;
  if (t && tokens.has(t)) return next();
  res.status(401).json({ error: 'Login required' });
});

app.use('/api', require('./routes/upload'));
app.use('/api', require('./routes/validate'));
app.use('/api', require('./routes/generate'));
app.use('/api', require('./routes/schedule'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => { console.error(err); res.status(500).json({ error: err.message }); });

const dist = path.join(__dirname, '..', 'client', 'dist');
if (fs.existsSync(dist)) { app.use(express.static(dist)); app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html'))); }

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Server on :${port} (db: ${mode})`));

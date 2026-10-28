const crypto = require('node:crypto');
const { promisify } = require('node:util');
const jwt = require('jsonwebtoken');
const db = require('./db');
const scrypt = promisify(crypto.scrypt);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/api' });
const fail = (status, message) => Object.assign(new Error(message), { status });
const emailKey = email => crypto.createHash('sha256').update(email).digest('hex');
const digest = text => crypto.createHmac('sha256', process.env.JWT_SECRET).update(text).digest('hex');
const publicUser = u => ({ id: u.id, email: u.email, name: u.name, role: u.role, verified: u.verified });
const accountPath = id => `authUsers/${id}`;
function emailOf(value) {
  if (typeof value !== 'string' || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) throw fail(400, 'Enter a valid email address');
  return value.trim().toLowerCase();
}
function checkPassword(value) {
  if (typeof value !== 'string' || value.length < 12 || value.length > 128) throw fail(400, 'Use a password of 12–128 characters');
  return value;
}
async function hashPassword(value) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${(await scrypt(value, salt, 64)).toString('hex')}`;
}
async function verifyPassword(value, encoded) {
  const [salt, hash] = (encoded || `${'0'.repeat(32)}:${'0'.repeat(128)}`).split(':');
  const actual = await scrypt(typeof value === 'string' ? value.slice(0, 128) : '', salt, 64);
  return crypto.timingSafeEqual(actual, Buffer.from(hash, 'hex'));
}
function validateConfig() {
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET) < 32) throw new Error('Set JWT_SECRET to at least 32 random bytes');
  if (process.env.NODE_ENV === 'production' && !process.env.APP_ORIGIN?.startsWith('https://')) throw new Error('APP_ORIGIN must use HTTPS in production');
}
function setCookies(res, user, sid, refresh, expires) {
  const token = jwt.sign({ sid }, process.env.JWT_SECRET, { subject: user.id, algorithm: 'HS256', expiresIn: '15m', issuer: 'phupha', audience: 'phupha-web' });
  res.cookie('access', token, { ...cookieOptions(), maxAge: 15 * 60 * 1000 });
  res.cookie('refresh', `${user.id}.${sid}.${refresh}`, { ...cookieOptions(), maxAge: Math.max(0, expires - Date.now()) });
}
function clearCookies(res) {
  res.clearCookie('access', cookieOptions()); res.clearCookie('refresh', cookieOptions());
}
async function newSession(res, id, expectedPasswordHash) {
  const sid = crypto.randomUUID(), refresh = crypto.randomBytes(32).toString('hex'), expires = Date.now() + SESSION_MS;
  const result = await db.transaction(accountPath(id), u => {
    if (!u?.verified) return;
    if (expectedPasswordHash && u.passwordHash !== expectedPasswordHash) return;
    u.sessions = Object.fromEntries(Object.entries(u.sessions || {}).filter(([, s]) => s.expires > Date.now()));
    // Bound account storage to the ten most recent sessions.
    const entries = Object.entries(u.sessions).sort((a, b) => a[1].expires - b[1].expires);
    while (entries.length >= 10) delete u.sessions[entries.shift()[0]];
    u.sessions[sid] = { hash: digest(refresh), expires }; return u;
  });
  if (!result.committed) throw fail(401, 'Please sign in again');
  setCookies(res, result.value, sid, refresh, expires);
  return publicUser(result.value);
}
async function refreshSession(req, res) {
  const [id, sid, token] = (req.cookies.refresh || '').split('.');
  if (!/^[a-f0-9]{64}$/.test(id || '') || !/^[a-f0-9-]{36}$/.test(sid || '') || !/^[a-f0-9]{64}$/.test(token || '')) throw fail(401, 'Please sign in again');
  const next = crypto.randomBytes(32).toString('hex');
  const result = await db.transaction(accountPath(id), u => {
    const s = u?.sessions?.[sid];
    if (!u?.verified || !s || s.expires <= Date.now() || s.hash !== digest(token)) return;
    s.hash = digest(next); return u;
  });
  if (!result.committed) { clearCookies(res); throw fail(401, 'Please sign in again'); }
  setCookies(res, result.value, sid, next, result.value.sessions[sid].expires);
  return publicUser(result.value);
}
async function requireAuth(req, res, next) {
  try {
    const claims = jwt.verify(req.cookies.access || '', process.env.JWT_SECRET, { algorithms: ['HS256'], issuer: 'phupha', audience: 'phupha-web' });
    if (!/^[a-f0-9]{64}$/.test(claims.sub || '')) throw new Error('Invalid subject');
    const u = await db.get(accountPath(claims.sub));
    if (!u?.verified || !u.sessions?.[claims.sid] || u.sessions[claims.sid].expires <= Date.now()) throw new Error('Session revoked');
    req.user = publicUser(u); req.sid = claims.sid; next();
  } catch (e) {
    if (e.code) return next(e);
    res.status(401).json({ message: 'Please sign in again' });
  }
}
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ message: 'Administrator access required' });
  next();
}
function checkOrigin(req, res, next) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== (process.env.APP_ORIGIN || 'http://localhost:5173')) return res.status(403).json({ message: 'Untrusted request origin' });
  next();
}
async function ownsSession(req, sid) {
  if (typeof sid !== 'string' || !/^[a-f0-9]{12}$/.test(sid)) throw fail(400, 'Invalid session ID');
  const meta = await db.get(`sessions/${sid}/meta`);
  if (!meta || (meta.ownerId !== req.user.id && req.user.role !== 'admin')) throw fail(404, 'Session not found');
}
module.exports = { fail, emailKey, emailOf, digest, publicUser, accountPath, checkPassword, hashPassword, verifyPassword, validateConfig, newSession, refreshSession, clearCookies, requireAuth, requireAdmin, checkOrigin, ownsSession };

const express = require('express');
const crypto = require('node:crypto');
const { OAuth2Client } = require('google-auth-library');
const db = require('../lib/db');
const a = require('../lib/auth');
const mail = require('../lib/mail');
const router = express.Router();
const ah = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const generic = { message: 'If this account is eligible, a code will arrive shortly.' };

async function issueOtp(id, purpose) {
  const code = crypto.randomInt(100000, 1000000).toString(), nonce = crypto.randomUUID(), now = Date.now();
  const result = await db.transaction(a.accountPath(id), u => {
    if (!u || (purpose === 'verify' ? u.verified : !u.verified)) return;
    if (u.lastOtpAt && now - u.lastOtpAt < 60000) return;
    const recent = (u.mailTimes || []).filter(t => t > now - 3600000);
    if (recent.length >= 5) return;
    u.mailTimes = [...recent, now]; u.lastOtpAt = now;
    u.otps ||= {}; u.otps[purpose] = { hash: a.digest(`${id}:${purpose}:${code}`), expires: now + 600000, attempts: 0, nonce };
    return u;
  });
  if (!result.committed) return;
  try { await mail.sendOtp(result.value.email, code, purpose); }
  catch (e) {
    await db.transaction(a.accountPath(id), u => { if (u?.otps?.[purpose]?.nonce !== nonce) return; delete u.otps[purpose]; return u; });
    throw a.fail(503, 'Unable to send email. Try again later.');
  }
}
async function consumeOtp(id, purpose, code, mutate = u => u) {
  if (typeof code !== 'string' || !/^\d{6}$/.test(code)) throw a.fail(400, 'Enter the six-digit code');
  let valid = false;
  await db.transaction(a.accountPath(id), u => {
    valid = false;
    const otp = u?.otps?.[purpose];
    if (!otp || otp.expires <= Date.now() || otp.attempts >= 5) return;
    otp.attempts++;
    if (otp.hash !== a.digest(`${id}:${purpose}:${code}`)) return u;
    valid = true; delete u.otps[purpose]; return mutate(u);
  });
  if (!valid) throw a.fail(400, 'Code is incorrect, expired, or already used');
}

router.get('/config', (req, res) => res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || '' }));
router.post('/register', ah(async (req, res) => {
  const email = a.emailOf(req.body.email), password = a.checkPassword(req.body.password);
  const name = typeof req.body.name === 'string' ? req.body.name.trim().slice(0, 80) : '';
  if (!name) throw a.fail(400, 'Enter your name');
  const id = a.emailKey(email), passwordHash = await a.hashPassword(password);
  await db.transaction(a.accountPath(id), u => u ? undefined : { id, email, name, passwordHash, verified: false, role: 'user', createdAt: Date.now() });
  await issueOtp(id, 'verify'); res.status(202).json(generic);
}));
router.post('/otp/request', ah(async (req, res) => {
  const email = a.emailOf(req.body.email), purpose = req.body.purpose;
  if (!['verify', 'login', 'reset'].includes(purpose)) throw a.fail(400, 'Invalid code purpose');
  await issueOtp(a.emailKey(email), purpose); res.status(202).json(generic);
}));
router.post('/otp/verify', ah(async (req, res) => {
  const id = a.emailKey(a.emailOf(req.body.email)), purpose = req.body.purpose;
  if (!['verify', 'login'].includes(purpose)) throw a.fail(400, 'Invalid code purpose');
  // The mailbox owner chooses the password at verification, preventing a
  // preregistered account from retaining a password chosen by another person.
  const passwordHash = purpose === 'verify' ? await a.hashPassword(a.checkPassword(req.body.password)) : null;
  await consumeOtp(id, purpose, req.body.code, u => { u.verified = true; if (passwordHash) u.passwordHash = passwordHash; return u; });
  res.json({ user: await a.newSession(res, id) });
}));
router.post('/password/reset', ah(async (req, res) => {
  const id = a.emailKey(a.emailOf(req.body.email));
  const passwordHash = await a.hashPassword(a.checkPassword(req.body.password));
  await consumeOtp(id, 'reset', req.body.code, u => { u.passwordHash = passwordHash; u.sessions = {}; u.otps = {}; return u; });
  a.clearCookies(res); res.json({ message: 'Password updated. Sign in with your new password.' });
}));
router.post('/login', ah(async (req, res) => {
  const id = a.emailKey(a.emailOf(req.body.email)), u = await db.get(a.accountPath(id));
  const attempt = await db.transaction(`authLoginAttempts/${id}`, value => {
    const current = value && value.until > Date.now() ? value : { until: Date.now() + 900000, count: 0 };
    if (current.count >= 10) return;
    current.count++; return current;
  });
  if (!attempt.committed) throw a.fail(429, 'Too many login attempts. Try again in 15 minutes.');
  const matches = await a.verifyPassword(req.body.password, u?.passwordHash);
  if (!matches || !u) throw a.fail(401, 'Invalid email or password');
  if (!u.verified) return res.status(403).json({ message: 'Verify your email before signing in', code: 'EMAIL_UNVERIFIED' });
  await db.remove(`authLoginAttempts/${id}`);
  res.json({ user: await a.newSession(res, id, u.passwordHash) });
}));
router.post('/google', ah(async (req, res) => {
  if (!process.env.GOOGLE_CLIENT_ID) throw a.fail(503, 'Google sign-in is not configured');
  if (typeof req.body.credential !== 'string' || req.body.credential.length > 10000) throw a.fail(400, 'Invalid Google credential');
  let payload;
  try { payload = (await new OAuth2Client().verifyIdToken({ idToken: req.body.credential, audience: process.env.GOOGLE_CLIENT_ID })).getPayload(); }
  catch (_) { throw a.fail(401, 'Google sign-in could not be verified'); }
  // Google is authoritative for Gmail and verified Workspace domains only.
  if (!payload?.email_verified || !payload.sub || (!payload.email?.endsWith('@gmail.com') && !payload.hd)) throw a.fail(403, 'Use a verified Gmail or Google Workspace account');
  const email = a.emailOf(payload.email), id = a.emailKey(email);
  const result = await db.transaction(a.accountPath(id), u => {
    if (u && !u.verified) return; // Never inherit an unverified account's password.
    if (u?.googleSub && u.googleSub !== payload.sub) return;
    u ||= { id, email, name: (payload.name || email).slice(0, 80), role: 'user', createdAt: Date.now() };
    u.verified = true; u.googleSub = payload.sub; return u;
  });
  if (!result.committed) throw a.fail(409, 'Verify your existing account by email first, then sign in with Google');
  res.json({ user: await a.newSession(res, id) });
}));
router.post('/refresh', ah(async (req, res) => res.json({ user: await a.refreshSession(req, res) })));
router.get('/me', a.requireAuth, (req, res) => res.json({ user: req.user }));
router.post('/logout', ah(async (req, res) => {
  const [id, sid, token] = (req.cookies.refresh || '').split('.');
  if (/^[a-f0-9]{64}$/.test(id || '') && /^[a-f0-9-]{36}$/.test(sid || '')) {
    await db.transaction(a.accountPath(id), u => { if (!u?.sessions?.[sid] || u.sessions[sid].hash !== a.digest(token || '')) return; delete u.sessions[sid]; return u; });
  }
  a.clearCookies(res); res.json({ message: 'Signed out' });
}));
module.exports = router;

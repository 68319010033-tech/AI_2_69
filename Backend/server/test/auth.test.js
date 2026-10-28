process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret-with-more-than-32-bytes';
process.env.APP_ORIGIN = 'http://localhost:5173';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const a = require('../lib/auth');
const mail = require('../lib/mail');
const sent = [];
mail.sendOtp = async (email, code, purpose) => { sent.push({ email, code, purpose }); };
const app = require('../app');
const origin = process.env.APP_ORIGIN;
const password = 'A-long-test-password!';
const post = (url, data, cookie) => request(app).post('/api' + url).set('Origin', origin).set('Cookie', cookie || []).send(data);
const cookies = response => response.headers['set-cookie'].map(c => c.split(';')[0]);
async function user(email = 'test@example.com', role = 'user') {
  const id = a.emailKey(email);
  await db.set(a.accountPath(id), { id, email, name: 'Test', role, verified: true, passwordHash: await a.hashPassword(password) });
  return id;
}
async function login(email = 'test@example.com') { return post('/auth/login', { email, password }); }
beforeEach(async () => { await db.remove('authUsers'); await db.remove('authLoginAttempts'); await db.remove('sessions'); sent.length = 0; });

test('registration verifies email, ignores admin role and consumes OTP once', async () => {
  await post('/auth/register', { email: 'New@example.com', password, name: 'New', role: 'admin' }).expect(202);
  await post('/auth/login', { email: 'new@example.com', password }).expect(403);
  const data = { email: 'new@example.com', purpose: 'verify', code: sent[0].code, password };
  const response = await post('/auth/otp/verify', data).expect(200);
  assert.equal(response.body.user.role, 'user');
  assert.ok(response.headers['set-cookie'].every(c => c.includes('HttpOnly') && c.includes('SameSite=Lax')));
  await post('/auth/otp/verify', data).expect(400);
  assert.equal((await db.get(a.accountPath(a.emailKey(data.email)))).passwordHash.includes(password), false);
});
test('OTP cooldown, wrong purpose, attempt limit and expiry', async () => {
  const id = await user();
  await post('/auth/otp/request', { email: 'test@example.com', purpose: 'login' }).expect(202);
  await post('/auth/otp/request', { email: 'test@example.com', purpose: 'login' }).expect(202);
  assert.equal(sent.length, 1);
  const data = { email: 'test@example.com', purpose: 'login', code: sent[0].code };
  await post('/auth/otp/verify', { ...data, purpose: 'verify' }).expect(400);
  for (let i = 0; i < 5; i++) await post('/auth/otp/verify', { ...data, code: '000000' }).expect(400);
  await post('/auth/otp/verify', data).expect(400);
  await db.update(a.accountPath(id) + '/otps/login', { attempts: 0, expires: Date.now() - 1 });
  await post('/auth/otp/verify', data).expect(400);
});
test('JWT validates signature, refresh rotates and logout revokes access', async () => {
  await user();
  const first = cookies(await login());
  await request(app).get('/api/auth/me').set('Cookie', first).expect(200);
  await request(app).get('/api/auth/me').set('Cookie', ['access=invalid']).expect(401);
  const second = cookies(await post('/auth/refresh', {}, first).expect(200));
  await post('/auth/refresh', {}, first).expect(401);
  await post('/auth/logout', {}, second).expect(200);
  await request(app).get('/api/auth/me').set('Cookie', second).expect(401);
  await post('/auth/refresh', {}, second).expect(401);
});
test('expired JWT cannot access API, valid refresh restores access', async () => {
  const id = await user();
  const first = cookies(await login());
  const claims = jwt.decode(first[0].slice('access='.length));
  const expired = jwt.sign({ sid: claims.sid }, process.env.JWT_SECRET, { subject: id, expiresIn: -1, issuer: 'phupha', audience: 'phupha-web' });
  await request(app).get('/api/auth/me').set('Cookie', [`access=${expired}`]).expect(401);
  await post('/auth/refresh', {}, first).expect(200);
});
test('reset password revokes existing sessions and old password', async () => {
  await user(); const old = cookies(await login());
  await post('/auth/otp/request', { email: 'test@example.com', purpose: 'reset' }).expect(202);
  await post('/auth/password/reset', { email: 'test@example.com', code: sent[0].code, password: 'Changed-password-123!' }).expect(200);
  await request(app).get('/api/auth/me').set('Cookie', old).expect(401);
  await login().then(r => assert.equal(r.status, 401));
  await post('/auth/login', { email: 'test@example.com', password: 'Changed-password-123!' }).expect(200);
});
test('admin role is enforced by backend and user data excludes secrets', async () => {
  await user(); const regular = cookies(await login());
  await request(app).get('/api/admin/users').set('Cookie', regular).expect(403);
  await user('admin@example.test', 'admin'); const admin = cookies(await login('admin@example.test'));
  const response = await request(app).get('/api/admin/users').set('Cookie', admin).expect(200);
  assert.equal(response.body.users.length, 2);
  assert.ok(response.body.users.every(u => !u.passwordHash && !u.sessions && !u.otps));
});
test('users cannot access or overwrite another user timetable, including jobs and downloads', async () => {
  const owner = await user(); const first = cookies(await login());
  const upload = await request(app).post('/api/upload').set('Origin', origin).set('Cookie', first).attach('files', Buffer.from('group_id,group_name\nG1,One'), 'groups.csv').expect(200);
  const sid = upload.body.sessionId;
  assert.equal((await db.get(`sessions/${sid}/meta`)).ownerId, owner);
  await user('other@example.com'); const other = cookies(await login('other@example.com'));
  for (const endpoint of ['schedule', 'report', 'compare', 'issues', 'cleaning-log', 'export']) {
    await request(app).get(`/api/${endpoint}/${sid}${endpoint === 'export' ? '/solution.csv' : ''}`).set('Cookie', other).expect(404);
  }
  await request(app).get(`/api/cleaned/${sid}/groups.csv`).set('Cookie', other).expect(404);
  await post('/validate', { sessionId: sid }, other).expect(404);
  await post('/generate', { sessionId: sid }, other).expect(404);
  await db.set('jobs/123456abcdef', { sessionId: sid });
  await request(app).get('/api/jobs/123456abcdef').set('Cookie', other).expect(404);
  await request(app).post('/api/upload').set('Origin', origin).set('Cookie', other).field('sessionId', sid).expect(404);
  await request(app).get(`/api/cleaned/${sid}/groups.csv`).set('Cookie', first).expect(200);
});
test('CSRF origin, unauthenticated and query token bypasses are rejected', async () => {
  await request(app).post('/api/auth/login').set('Origin', 'https://evil.example').send({}).expect(403);
  await request(app).get('/api/admin/users?token=judge1234').expect(401);
  await request(app).post('/api/login').set('Origin', origin).send({ user: 'judge', pass: 'judge1234' }).expect(401);
});
test('seed is opt-in, idempotent and forbidden in production', async () => {
  process.env.TEST_ADMIN_PASSWORD = password; process.env.TEST_USER_PASSWORD = password;
  const { seed } = require('../seed');
  const original = console.log; console.log = () => {};
  try {
    await seed(); const before = await db.get('authUsers'); await seed(); assert.deepEqual(await db.get('authUsers'), before);
    assert.equal(before[a.emailKey('admin@example.test')].role, 'admin');
    process.env.NODE_ENV = 'production'; await assert.rejects(seed, /production/);
  } finally { process.env.NODE_ENV = 'test'; console.log = original; }
});
test('Google configuration absence fails closed', async () => {
  await post('/auth/google', { credential: 'fake' }).expect(503);
});
test('Google verified Gmail creates a user, invalid tokens and unsafe account linking fail', async () => {
  const { OAuth2Client } = require('google-auth-library');
  const original = OAuth2Client.prototype.verifyIdToken;
  process.env.GOOGLE_CLIENT_ID = 'test-client';
  let payload = { sub: 'google-123', email: 'google@gmail.com', email_verified: true, name: 'Google Test' };
  OAuth2Client.prototype.verifyIdToken = async function(options) {
    assert.equal(options.audience, 'test-client');
    if (options.idToken === 'bad') throw new Error('Bad signature');
    return { getPayload: () => payload };
  };
  try {
    const response = await post('/auth/google', { credential: 'verified-by-mock' }).expect(200);
    assert.equal(response.body.user.role, 'user');
    await post('/auth/google', { credential: 'bad' }).expect(401);
    payload = { ...payload, email_verified: false };
    await post('/auth/google', { credential: 'verified-by-mock' }).expect(403);
    payload = { ...payload, email_verified: true, email: 'pending@gmail.com' };
    await db.set(a.accountPath(a.emailKey(payload.email)), { email: payload.email, verified: false });
    await post('/auth/google', { credential: 'verified-by-mock' }).expect(409);
  } finally { OAuth2Client.prototype.verifyIdToken = original; delete process.env.GOOGLE_CLIENT_ID; }
});
test('verification replaces preregistered password with mailbox owner password', async () => {
  await post('/auth/register', { email: 'owner@example.com', password, name: 'Pre-registration' }).expect(202);
  const chosen = 'Mailbox-owner-password!';
  await post('/auth/otp/verify', { email: 'owner@example.com', purpose: 'verify', code: sent[0].code, password: chosen }).expect(200);
  await post('/auth/login', { email: 'owner@example.com', password }).expect(401);
  await post('/auth/login', { email: 'owner@example.com', password: chosen }).expect(200);
});
test('concurrent OTP verification succeeds only once', async () => {
  await user(); await post('/auth/otp/request', { email: 'test@example.com', purpose: 'login' }).expect(202);
  const data = { email: 'test@example.com', purpose: 'login', code: sent[0].code };
  const results = await Promise.all([post('/auth/otp/verify', data), post('/auth/otp/verify', data)]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
});
test('SMTP failures fail closed and remove the undelivered code', async () => {
  const id = await user(), original = mail.sendOtp;
  mail.sendOtp = async () => { throw new Error('SMTP unavailable'); };
  try {
    await post('/auth/otp/request', { email: 'test@example.com', purpose: 'login' }).expect(503);
    assert.equal(await db.get(a.accountPath(id) + '/otps/login'), null);
  } finally { mail.sendOtp = original; }
});

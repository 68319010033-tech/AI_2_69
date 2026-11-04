process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'demo-test-secret-at-least-thirty-two-bytes';
process.env.APP_ORIGIN = 'http://localhost:5173';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const db = require('../lib/db');
const auth = require('../lib/auth');
const solver = require('../lib/solverRunner');
let aborted = false;
solver.solveCpsat = (_input, { signal }) => new Promise((_resolve, reject) => {
  signal.addEventListener('abort', () => { aborted = true; reject(new Error('Cancelled')); }, { once: true });
});
const app = require('../app');
async function cookie(email) {
  const id = auth.emailKey(email), sid = 'demo-test-session';
  await db.set(auth.accountPath(id), { id, email, name: 'Demo tester', role: 'user', verified: true, sessions: { [sid]: { expires: Date.now() + 60000 } } });
  return 'access=' + jwt.sign({ sid }, process.env.JWT_SECRET, { subject: id, algorithm: 'HS256', expiresIn: '1m', issuer: 'phupha', audience: 'phupha-web' });
}
test('sample upload validates; cancellation reaches the solver and respects ownership', async () => {
  const owner = await cookie('demo@example.com');
  let upload = request(app).post('/api/upload').set('Origin', process.env.APP_ORIGIN).set('Cookie', owner);
  const samples = path.resolve(__dirname, '../../../frontend/public/samples');
  for (const name of fs.readdirSync(samples)) upload = upload.attach('files', path.join(samples, name));
  const result = await upload.expect(200);
  const sessionId = result.body.sessionId;
  const validated = await request(app).post('/api/validate').set('Origin', process.env.APP_ORIGIN).set('Cookie', owner).send({ sessionId }).expect(200);
  assert.equal(validated.body.canGenerate, true);
  const started = await request(app).post('/api/generate').set('Origin', process.env.APP_ORIGIN).set('Cookie', owner).send({ sessionId }).expect(202);
  const jobId = started.body.jobId;
  const other = await cookie('other-demo@example.com');
  await request(app).delete(`/api/jobs/${jobId}`).set('Origin', process.env.APP_ORIGIN).set('Cookie', other).expect(404);
  assert.equal(aborted, false);
  await request(app).delete(`/api/jobs/${jobId}`).set('Origin', process.env.APP_ORIGIN).set('Cookie', owner).expect(200);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(aborted, true);
  const job = await request(app).get(`/api/jobs/${jobId}`).set('Cookie', owner).expect(200);
  assert.equal(job.body.status, 'cancelled');
  assert.equal(await db.get(`schedules/${sessionId}/cpsat`), null);
});

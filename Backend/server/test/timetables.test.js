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
const app = require('../app');
const origin = process.env.APP_ORIGIN;
async function cookie(email) {
  const id = auth.emailKey(email), sid = 'tt-test-session';
  await db.set(auth.accountPath(id), { id, email, name: 'Tester', role: 'user', verified: true, sessions: { [sid]: { expires: Date.now() + 60000 } } });
  return 'access=' + jwt.sign({ sid }, process.env.JWT_SECRET, { subject: id, algorithm: 'HS256', expiresIn: '1m', issuer: 'phupha', audience: 'phupha-web' });
}
test('saved timetables: save, list, restore after regeneration, ownership, delete', async () => {
  const owner = await cookie('tt-owner@example.com');
  let upload = request(app).post('/api/upload').set('Origin', origin).set('Cookie', owner);
  const samples = path.resolve(__dirname, '../../../frontend/public/samples');
  for (const name of fs.readdirSync(samples)) upload = upload.attach('files', path.join(samples, name));
  const working = (await upload.expect(200)).body.sessionId;
  await request(app).post('/api/validate').set('Origin', origin).set('Cookie', owner).send({ sessionId: working }).expect(200);
  const sid = (await request(app).post('/api/datasets').set('Origin', origin).set('Cookie', owner).send({ sessionId: working, name: 'Term 1' }).expect(201)).body.dataset.id;

  const v1 = [{ offering_id: 'O001', day: 'MON', start_period: 1, room_id: 'R01' }];
  const v2 = [{ offering_id: 'O001', day: 'TUE', start_period: 3, room_id: 'R02' }];
  await request(app).post('/api/timetables').set('Origin', origin).set('Cookie', owner).send({ sessionId: sid, name: 'No schedule yet' }).expect(409);
  await db.set(`schedules/${sid}/cpsat`, v1);
  await db.update(`sessions/${sid}/meta`, { activeMethod: 'cpsat', has_cpsat: true });
  await request(app).post('/api/timetables').set('Origin', origin).set('Cookie', owner).send({ sessionId: sid, name: '  ' }).expect(400);
  const saved = (await request(app).post('/api/timetables').set('Origin', origin).set('Cookie', owner).send({ sessionId: sid, name: 'Draft A' }).expect(201)).body.timetable;
  assert.equal(saved.name, 'Draft A'); assert.equal(saved.datasetName, 'Term 1'); assert.equal(saved.scheduled, 1);

  await db.set(`schedules/${sid}/cpsat`, v2); // a later run overwrites the active slot
  const list = (await request(app).get('/api/timetables').set('Cookie', owner).expect(200)).body.timetables;
  assert.equal(list.length, 1); assert.equal(list[0].id, saved.id);

  const stranger = await cookie('tt-stranger@example.com');
  assert.equal((await request(app).get('/api/timetables').set('Cookie', stranger).expect(200)).body.timetables.length, 0);
  await request(app).post(`/api/timetables/${saved.id}/load`).set('Origin', origin).set('Cookie', stranger).expect(404);
  await request(app).delete(`/api/timetables/${saved.id}`).set('Origin', origin).set('Cookie', stranger).expect(404);

  const loaded = (await request(app).post(`/api/timetables/${saved.id}/load`).set('Origin', origin).set('Cookie', owner).expect(200)).body;
  assert.equal(loaded.sessionId, sid); assert.equal(loaded.method, 'cpsat'); assert.equal(loaded.dataset.name, 'Term 1');
  assert.equal(db.arr(await db.get(`schedules/${sid}/cpsat`))[0].day, 'MON');

  await request(app).delete(`/api/timetables/${saved.id}`).set('Origin', origin).set('Cookie', owner).expect(200);
  assert.equal((await request(app).get('/api/timetables').set('Cookie', owner).expect(200)).body.timetables.length, 0);
  assert.equal(await db.get(`timetableData/${saved.id}`), null);
});

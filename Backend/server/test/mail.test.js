const { test } = require('node:test');
const assert = require('node:assert/strict');
const { sendOtp } = require('../lib/mail');

test('HTTPS recovery email accepts only a successful provider response', async t => {
  const oldKey = process.env.RESEND_API_KEY, oldFrom = process.env.MAIL_FROM;
  process.env.RESEND_API_KEY = 'test-only'; process.env.MAIL_FROM = 'Campus <test@example.test>';
  t.after(() => {
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey;
    if (oldFrom === undefined) delete process.env.MAIL_FROM; else process.env.MAIL_FROM = oldFrom;
  });
  let deliver = true;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, 'https://api.resend.com/emails');
    const body = JSON.parse(options.body);
    assert.deepEqual(body.to, ['owner@example.test']);
    assert.match(body.text, /123456/);
    return { ok: deliver };
  });
  await sendOtp('owner@example.test', '123456', 'reset');
  deliver = false;
  await assert.rejects(sendOtp('owner@example.test', '123456', 'reset'), /provider/);
});

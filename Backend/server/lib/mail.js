const nodemailer = require('nodemailer');
let transport;
async function sendOtp(email, code, purpose) {
  const subject = 'Your Phu Pha Campus verification code';
  const text = `Your ${purpose} code is ${code}. It expires in 10 minutes and can be used once. If you did not request this, ignore this email.`;
  if (process.env.BREVO_API_KEY) {
    if (!process.env.MAIL_FROM) throw new Error('Configure a verified sender in MAIL_FROM');
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { 'api-key': process.env.BREVO_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sender: { email: process.env.MAIL_FROM, name: 'Phu Pha Campus' }, to: [{ email }], subject, textContent: text }),
    });
    if (!response.ok) throw new Error(`Brevo rejected the message (${response.status})`);
    return;
  }
  if (process.env.RESEND_API_KEY) {
    if (!process.env.MAIL_FROM) throw new Error('Configure a verified sender in MAIL_FROM');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [email], subject, text }),
    });
    if (!response.ok) throw new Error('Email provider could not accept the message');
    return;
  }
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw Object.assign(new Error('Email delivery is not configured'), { status: 503 });
  transport ||= nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_PORT !== '587', requireTLS: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject, text });
}
module.exports = { sendOtp };

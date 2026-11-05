const nodemailer = require('nodemailer');
let transport;
let gmailAuth;
async function sendOtp(email, code, purpose) {
  const subject = 'Your Phu Pha Campus verification code';
  const text = `Your ${purpose} code is ${code}. It expires in 10 minutes and can be used once. If you did not request this, ignore this email.`;
  if (process.env.GMAIL_REFRESH_TOKEN) {
    if (!process.env.GMAIL_CLIENT_ID || !process.env.GMAIL_CLIENT_SECRET || !process.env.MAIL_FROM) throw new Error('Configure GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET and MAIL_FROM');
    const { OAuth2Client } = require('google-auth-library');
    gmailAuth ||= new OAuth2Client(process.env.GMAIL_CLIENT_ID, process.env.GMAIL_CLIENT_SECRET);
    gmailAuth.setCredentials({ refresh_token: process.env.GMAIL_REFRESH_TOKEN });
    const { token } = await gmailAuth.getAccessToken();
    const raw = Buffer.from(
      `From: ${process.env.MAIL_FROM}\r\nTo: ${email}\r\nSubject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=\r\n` +
      `MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n${text}`
    ).toString('base64url');
    const response = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST', signal: AbortSignal.timeout(12000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!response.ok) throw new Error(`Gmail API rejected the message (${response.status})`);
    return;
  }
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

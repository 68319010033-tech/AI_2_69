const nodemailer = require('nodemailer');
let transport;
async function sendOtp(email, code, purpose) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) throw Object.assign(new Error('Email delivery is not configured'), { status: 503 });
  transport ||= nodemailer.createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 465), secure: process.env.SMTP_PORT !== '587', requireTLS: true, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject: 'Your Phu Pha Campus verification code', text: `Your ${purpose} code is ${code}. It expires in 10 minutes and can be used once. If you did not request this, ignore this email.` });
}
module.exports = { sendOtp };

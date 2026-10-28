require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const crypto = require('node:crypto');
const db = require('./lib/db');
const a = require('./lib/auth');
async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Test users cannot be seeded in production');
  for (const [role, fallback] of [['admin', 'admin@example.test'], ['user', 'user@example.test']]) {
    const prefix = role.toUpperCase();
    const email = a.emailOf(process.env[`TEST_${prefix}_EMAIL`] || fallback), id = a.emailKey(email);
    const password = a.checkPassword(process.env[`TEST_${prefix}_PASSWORD`] || crypto.randomBytes(18).toString('base64url'));
    const passwordHash = await a.hashPassword(password);
    const result = await db.transaction(a.accountPath(id), u => u ? undefined : { id, email, name: `Test ${role}`, role, verified: true, passwordHash, createdAt: Date.now() });
    console.log(result.committed ? `Created ${role}: ${email} | password: ${password}` : `Skipped existing account: ${email}`);
  }
}
if (require.main === module) {
  db.init();
  if (db.getMode() === 'memory') { console.error('For the in-memory dev database, set SEED_TEST_USERS=1 and start the server instead.'); process.exitCode = 1; }
  else seed().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });
}
module.exports = { seed };

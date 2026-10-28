require('dotenv').config({ path: require('path').join(__dirname, '../.env'), quiet: true });
const db = require('./lib/db');
const { validateConfig } = require('./lib/auth');
async function start() {
  validateConfig();
  const mode = db.init();
  if (process.env.SEED_TEST_USERS === '1') await require('./seed').seed();
  const app = require('./app');
  const port = process.env.PORT || 3000;
  app.listen(port, () => console.log(`Server on :${port} (db: ${mode})`));
}
start().catch(e => {
  console.error('[Startup Error]', e.message);
  if (e.cause && e.cause.message !== e.message) {
    console.error('[Cause]', e.cause.message || e.cause);
  }
  process.exitCode = 1;
});

// Helpers to load/save a session in the DB (flat tree, see PLAN section 2.1)
const db = require('./db');
const { FILE_NAMES } = require('./schema');

async function loadCleaned(sid) {
  const c = (await db.get(`sessions/${sid}/cleaned`)) || {};
  const data = {};
  for (const f of FILE_NAMES) data[f] = db.arr(c[f]);
  return data;
}
const loadMeta = (sid) => db.get(`sessions/${sid}/meta`);

module.exports = { loadCleaned, loadMeta };

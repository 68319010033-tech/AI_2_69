// Firebase Realtime Database via firebase-admin, with an in-memory fallback.
let mode = 'memory';
let rtdb = null;
let mem = {};

function init() {
  const url = process.env.FIREBASE_DATABASE_URL;
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (url && (b64 || raw)) {
    try {
      const admin = require('firebase-admin');
      const cred = JSON.parse(b64 ? Buffer.from(b64, 'base64').toString('utf8') : raw);
      admin.initializeApp({ credential: admin.credential.cert(cred), databaseURL: url });
      rtdb = admin.database();
      mode = 'firebase';
    } catch (e) {
      throw new Error('Firebase initialization failed', { cause: e });
    }
  } else {
    if (process.env.NODE_ENV === 'production') throw new Error('Firebase is required in production');
    console.warn('[db] Firebase env not set -> in-memory fallback (data lost on restart)');
  }
  return mode;
}

const parts = (p) => p.split('/').filter(Boolean);
const clone = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

async function get(path) {
  if (mode === 'firebase') return (await rtdb.ref(path).once('value')).val();
  let n = mem;
  for (const k of parts(path)) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
  return n === undefined ? null : clone(n);
}
async function set(path, value) {
  if (mode === 'firebase') return rtdb.ref(path).set(clone(value));
  const ks = parts(path); let n = mem;
  ks.slice(0, -1).forEach((k) => { if (typeof n[k] !== 'object' || n[k] === null) n[k] = {}; n = n[k]; });
  n[ks[ks.length - 1]] = clone(value);
}
async function update(path, value) {
  if (mode === 'firebase') return rtdb.ref(path).update(clone(value));
  const cur = (await get(path)) || {};
  await set(path, { ...cur, ...value });
}
async function remove(path) {
  if (mode === 'firebase') return rtdb.ref(path).remove();
  const ks = parts(path); let n = mem;
  for (const k of ks.slice(0, -1)) { if (!n[k]) return; n = n[k]; }
  delete n[ks[ks.length - 1]];
}
// Realtime DB turns arrays into objects and drops empty ones; this restores arrays.
const arr = (x) => (Array.isArray(x) ? x.filter((v) => v != null) : x && typeof x === 'object' ? Object.keys(x).sort((a, b) => a - b).map((k) => x[k]) : []);

// The updater is synchronous and may be retried by Firebase. Undefined aborts.
async function transaction(path, updater) {
  if (mode === 'firebase') {
    const ref = rtdb.ref(path);
    // Keep the current value cached: aborting on an initial uncached null would
    // otherwise incorrectly reject updates to existing accounts.
    const listener = () => {};
    ref.on('value', listener);
    try {
      await ref.once('value');
      const result = await ref.transaction(updater);
      return { committed: result.committed, value: result.snapshot.val() };
    } finally { ref.off('value', listener); }
  }
  // No awaits between reading and writing: atomic in the single-process dev store.
  const ks = parts(path); let n = mem;
  ks.slice(0, -1).forEach(k => { if (!n[k]) n[k] = {}; n = n[k]; });
  const key = ks[ks.length - 1];
  const value = updater(clone(n[key]));
  if (value === undefined) return { committed: false, value: clone(n[key]) };
  n[key] = clone(value);
  return { committed: true, value: clone(value) };
}

module.exports = { init, get, set, update, remove, transaction, arr, getMode: () => mode };

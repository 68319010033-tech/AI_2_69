// Firebase Realtime Database via firebase-admin, with an in-memory fallback.
let mode = 'memory';
let rtdb = null;
let mem = {};

function init() {
  const url = process.env.FIREBASE_DATABASE_URL ? process.env.FIREBASE_DATABASE_URL.trim() : '';
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_B64 ? process.env.FIREBASE_SERVICE_ACCOUNT_B64.trim() : '';
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT ? process.env.FIREBASE_SERVICE_ACCOUNT.trim() : '';

  if (url && (b64 || raw)) {
    try {
      const admin = require('firebase-admin');
      let credJson = '';

      if (b64) {
        if (b64.startsWith('{')) {
          // User accidentally pasted raw JSON into FIREBASE_SERVICE_ACCOUNT_B64 directly
          credJson = b64;
        } else {
          // Strip any accidental wrapping quotes or spaces/newlines from copy-paste
          const clean = b64.replace(/^["']|["']$/g, '').replace(/\s+/g, '');
          credJson = Buffer.from(clean, 'base64').toString('utf8');
        }
      } else if (raw) {
        credJson = raw;
      }

      let cred;
      try {
        cred = JSON.parse(credJson);
      } catch (jsonErr) {
        console.error('[db] Service account credential is not valid JSON:', jsonErr.message);
        console.error('[db] Decoded text preview (first 80 chars):', credJson.slice(0, 80));
        throw new Error('Invalid service account JSON: ' + jsonErr.message);
      }

      if (cred.private_key && typeof cred.private_key === 'string') {
        cred.private_key = cred.private_key.replace(/\\n/g, '\n');
      }

      if (!cred.client_email || !cred.private_key) {
        throw new Error('Service account is missing client_email or private_key');
      }

      const cleanUrl = url.replace(/\/+$/, '');
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(cred),
          databaseURL: cleanUrl
        });
      }
      rtdb = admin.database();
      mode = 'firebase';
      console.log(`[db] Firebase Realtime Database connected (${cred.project_id || 'ok'})`);
    } catch (e) {
      console.error('[db] Firebase initialization failed:', e.message);
      throw new Error(`Firebase initialization failed: ${e.message}`, { cause: e });
    }
  } else {
    if (process.env.NODE_ENV === 'production') {
      const missing = [];
      if (!url) missing.push('FIREBASE_DATABASE_URL');
      if (!b64 && !raw) missing.push('FIREBASE_SERVICE_ACCOUNT_B64');
      throw new Error(`Firebase is required in production. Missing: ${missing.join(', ')}`);
    }
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

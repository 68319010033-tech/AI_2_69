const { FILES, ROOM_TYPE_MAP } = require('./schema');

// Map the canonical columns to the real (safe) header keys of the uploaded file.
function resolveColumns(spec, headers) {
  const map = {};
  const used = new Set();
  for (const [canon, def] of Object.entries(spec.cols)) {
    for (const name of [canon, ...def.aliases]) {
      const h = headers.find((x) => x.norm === name && !used.has(x.key));
      if (h) { map[canon] = h.key; used.add(h.key); break; }
    }
  }
  const missing = Object.entries(spec.cols).filter(([c, d]) => d.required && !map[c]).map(([c]) => c);
  const extra = headers.filter((h) => !used.has(h.key)).map((h) => h.orig);
  return { map, missing, extra };
}

function normDay(v) {
  const s = v.trim().toUpperCase();
  const m = s.match(/^(MON|TUE|WED|THU|FRI|SAT|SUN)/);
  return m ? m[1] : s;
}

// returns { value, bad } ; bad = reason string when cannot convert safely
function normValue(type, raw) {
  const s = raw == null ? '' : String(raw);
  const t = s.trim();
  if (t === '') return { value: null };
  switch (type) {
    case 'id': return { value: t.toUpperCase() };
    case 'str': return { value: t };
    case 'int':
      if (/^[+-]?\d+(\.0+)?$/.test(t)) return { value: parseInt(t, 10) };
      return { value: null, bad: `Cannot convert "${t}" to an integer` };
    case 'day': return { value: normDay(t) };
    case 'roomtype': {
      const u = t.toUpperCase();
      return { value: ROOM_TYPE_MAP[u] || u };
    }
    default: return { value: t };
  }
}

function cleanFile(name, parsed) {
  const spec = FILES[name];
  const issues = [];
  const log = [];
  const { map, missing, extra } = resolveColumns(spec, parsed.headers);
  const add = (severity, row, column, message, suggestion) => issues.push({ severity, file: name, row, column, message, suggestion });

  parsed.warnings.forEach((w) => add('warning', null, null, w, 'Save the file as UTF-8 CSV.'));
  parsed.mismatches.forEach((m) => add('warning', m.row, null, `Row has ${m.found} fields but the header has ${m.expected}.`, 'Check for missing/extra commas or unquoted commas inside a value.'));
  missing.forEach((c) => add('error', null, c, `Required column "${c}" not found. Headers found: ${parsed.headers.map((h) => h.orig).join(', ')}`, `Rename the column to "${c}" (or one of: ${spec.cols[c].aliases.join(', ') || 'no aliases'}).`));
  if (extra.length) add('info', null, null, `Extra columns kept untouched/ignored: ${extra.join(', ')}`, null);

  let rows = parsed.rows.map((r) => {
    const out = { _row: r._row, _bad: new Set() };
    for (const [canon, def] of Object.entries(spec.cols)) {
      const key = map[canon];
      if (!key) { out[canon] = null; continue; }
      const raw = r[key];
      const { value, bad } = normValue(def.type, raw);
      out[canon] = value;
      if (bad) {
        out._bad.add(canon);
        add('error', r._row, canon, bad, 'Fix the value in the source file (the system does not guess).');
      } else if (value !== null && String(raw) !== String(value)) {
        log.push({ file: name, row: r._row, column: canon, before: String(raw), after: String(value), rule: 'normalize ' + def.type });
      }
    }
    return out;
  });

  // Remove exact duplicates (all fields equal after normalization)
  const seen = new Map();
  const kept = [];
  const colNames = Object.keys(spec.cols);
  for (const r of rows) {
    const k = JSON.stringify(colNames.map((c) => r[c]));
    if (seen.has(k)) {
      log.push({ file: name, row: r._row, column: '*', before: 'duplicate of row ' + seen.get(k), after: '(removed)', rule: 'remove exact duplicate' });
    } else { seen.set(k, r._row); kept.push(r); }
  }
  rows = kept;

  // Conflicting duplicates by primary key: never delete, report
  if (spec.pk) {
    const pkSeen = new Map();
    for (const r of rows) {
      if (spec.pk.some((c) => r[c] == null)) continue;
      const k = spec.pk.map((c) => r[c]).join('|');
      if (pkSeen.has(k)) add('error', r._row, spec.pk.join('+'), `Duplicate key "${k}" with conflicting values (first seen at row ${pkSeen.get(k)}).`, 'Decide which row is correct and remove the other in the source file; the system will not delete it.');
      else pkSeen.set(k, r._row);
    }
  }
  return { rows, issues, log, columnMap: map, missingCols: missing };
}

module.exports = { cleanFile, resolveColumns };

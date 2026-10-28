const { FILES, FILE_NAMES, DAYS, ROOM_TYPES, MIN_PERIOD, MAX_PERIOD, BLOCKS, EXPECTED } = require('./schema');

const blockOf = (p) => BLOCKS.findIndex(([a, b]) => p >= a && p <= b);

// cleaned: { fileName: { rows, missingCols } | undefined }
function validate(cleaned) {
  const issues = [];
  const add = (severity, file, row, column, message, suggestion) => issues.push({ severity, file, row, column, message, suggestion });
  const rowsOf = (f) => (cleaned[f] ? cleaned[f].rows : []);

  for (const f of FILE_NAMES) if (!cleaned[f]) add('error', f, null, null, `File ${f}.csv is missing.`, 'Upload all 10 CSV files.');

  // required cells + ranges
  for (const f of FILE_NAMES) {
    if (!cleaned[f]) continue;
    const spec = FILES[f];
    for (const r of rowsOf(f)) {
      for (const [c, def] of Object.entries(spec.cols)) {
        if (!def.required || cleaned[f].missingCols.includes(c)) continue;
        if (r[c] == null && !r._bad.has(c)) add('error', f, r._row, c, `Missing value in required column "${c}".`, 'Fill in the value; the system will not invent data.');
      }
      if (r.day != null && !DAYS.includes(r.day)) add('error', f, r._row, 'day', `Invalid day "${r.day}" (allowed: ${DAYS.join(', ')}).`, 'Use MON/TUE/WED/THU/FRI.');
      for (const pc of ['period', 'start_period']) {
        if (r[pc] != null && (r[pc] < MIN_PERIOD || r[pc] > MAX_PERIOD)) add('error', f, r._row, pc, `Period ${r[pc]} is outside ${MIN_PERIOD}-${MAX_PERIOD}.`, 'Use period 1-8.');
      }
      if (r.room_type != null && !ROOM_TYPES.includes(r.room_type)) add('error', f, r._row, 'room_type', `Unknown room type "${r.room_type}" (allowed: ${ROOM_TYPES.join(', ')}).`, 'Use GENERAL/COMPUTER/NETWORK/MEDIA (GEN/COM/NET/MED are auto-converted).');
      for (const ic of ['size', 'capacity', 'periods', 'max_periods_per_day', 'max_periods_per_week']) {
        if (r[ic] != null && r[ic] < 1) add('error', f, r._row, ic, `Value ${r[ic]} must be at least 1.`, 'Check the source data.');
      }
    }
  }

  const first = (f, key) => { const m = new Map(); for (const r of rowsOf(f)) if (r[key] != null && !m.has(r[key])) m.set(r[key], r); return m; };
  const G = first('groups', 'group_id'), T = first('teachers', 'teacher_id'), R = first('rooms', 'room_id');
  const C = first('courses', 'course_id'), O = first('offerings', 'offering_id');
  const allowed = new Set(rowsOf('timeslots').map((r) => `${r.day}|${r.period}`));

  const fk = (f, col, map, label) => {
    for (const r of rowsOf(f)) if (r[col] != null && !map.has(r[col])) add('error', f, r._row, col, `${label} "${r[col]}" does not exist.`, 'Fix the ID or add the missing master record. IDs are never created automatically.');
  };
  fk('offerings', 'group_id', G, 'Group'); fk('offerings', 'course_id', C, 'Course'); fk('offerings', 'teacher_id', T, 'Teacher');
  fk('teacher_blocks', 'teacher_id', T, 'Teacher'); fk('room_blocks', 'room_id', R, 'Room');
  fk('fixed_sessions', 'offering_id', O, 'Offering'); fk('fixed_sessions', 'room_id', R, 'Room');
  fk('shared_students', 'group_a', G, 'Group'); fk('shared_students', 'group_b', G, 'Group');
  for (const r of rowsOf('shared_students')) if (r.group_a && r.group_a === r.group_b) add('warning', 'shared_students', r._row, 'group_b', 'Pair contains the same group twice.', 'Remove or correct this row.');

  // per-offering feasibility pre-checks
  const roomsFor = (off) => {
    const course = C.get(off.course_id), grp = G.get(off.group_id);
    if (!course || !grp || course.room_type == null || grp.size == null) return null;
    return [...R.values()].filter((r) => r.room_type === course.room_type && r.capacity >= grp.size);
  };
  const tLoad = new Map(), gLoad = new Map();
  for (const off of O.values()) {
    const p = off.periods, g = G.get(off.group_id), t = T.get(off.teacher_id);
    if (p != null && p > 4) add('error', 'offerings', off.row || off._row, 'periods', `${off.offering_id}: ${p} periods cannot fit in one morning/afternoon block (max 4, no crossing lunch).`, 'Check the data; periods must not be reduced automatically.');
    if (p != null && g && g.max_periods_per_day != null && p > g.max_periods_per_day) add('error', 'offerings', off._row, 'periods', `${off.offering_id}: ${p} periods exceeds group ${g.group_id} max_periods_per_day (${g.max_periods_per_day}).`, 'Data conflict; cannot be scheduled.');
    if (p != null && t && t.max_periods_per_day != null && p > t.max_periods_per_day) add('error', 'offerings', off._row, 'periods', `${off.offering_id}: ${p} periods exceeds teacher ${t.teacher_id} max_periods_per_day (${t.max_periods_per_day}).`, 'Data conflict; cannot be scheduled.');
    const rf = roomsFor(off);
    if (rf && rf.length === 0) add('error', 'offerings', off._row, 'course_id', `${off.offering_id}: no room has type ${C.get(off.course_id).room_type} with capacity >= ${G.get(off.group_id).size}.`, 'Check rooms.csv capacity/type or group size.');
    if (p != null) { tLoad.set(off.teacher_id, (tLoad.get(off.teacher_id) || 0) + p); gLoad.set(off.group_id, (gLoad.get(off.group_id) || 0) + p); }
  }
  for (const [tid, load] of tLoad) { const t = T.get(tid); if (t && t.max_periods_per_week != null && load > t.max_periods_per_week) add('error', 'teachers', t._row, 'max_periods_per_week', `Teacher ${tid} must teach ${load} periods/week but max is ${t.max_periods_per_week}.`, 'Data conflict; the problem is infeasible.'); }
  for (const [gid, load] of gLoad) { const g = G.get(gid); if (g && g.max_periods_per_day != null && load > g.max_periods_per_day * DAYS.length) add('error', 'groups', g._row, 'max_periods_per_day', `Group ${gid} has ${load} periods/week but only ${g.max_periods_per_day * DAYS.length} fit (max/day x 5).`, 'Data conflict; the problem is infeasible.'); }

  // fixed sessions: validity and mutual conflicts
  const tb = new Set(rowsOf('teacher_blocks').map((r) => `${r.teacher_id}|${r.day}|${r.period}`));
  const rb = new Set(rowsOf('room_blocks').map((r) => `${r.room_id}|${r.day}|${r.period}`));
  const occ = { t: new Map(), r: new Map(), g: new Map() };
  const mark = (m, key, oid, row, label) => { if (m.has(key) && m.get(key).oid !== oid) add('error', 'fixed_sessions', row, null, `${label} clash between fixed sessions ${m.get(key).oid} and ${oid} (${key}).`, 'Fixed sessions cannot be changed; check the data.'); else m.set(key, { oid, row }); };
  for (const f of rowsOf('fixed_sessions')) {
    const off = O.get(f.offering_id), room = R.get(f.room_id);
    if (!off || !room || f.start_period == null || !DAYS.includes(f.day)) continue;
    const p = off.periods, end = f.start_period + p - 1;
    if (blockOf(f.start_period) === -1 || blockOf(f.start_period) !== blockOf(end)) add('error', 'fixed_sessions', f._row, 'start_period', `${f.offering_id}: ${p} periods from ${f.start_period} crosses the lunch break or leaves 1-8.`, 'Fixed sessions must be continuous and not cross lunch.');
    const course = C.get(off.course_id), grp = G.get(off.group_id);
    if (course && room.room_type !== course.room_type) add('error', 'fixed_sessions', f._row, 'room_id', `${f.offering_id}: room ${room.room_id} is ${room.room_type} but course needs ${course.room_type}.`, 'Check the data.');
    if (grp && room.capacity < grp.size) add('error', 'fixed_sessions', f._row, 'room_id', `${f.offering_id}: room capacity ${room.capacity} < group size ${grp.size}.`, 'Check the data.');
    for (let q = f.start_period; q <= end; q++) {
      if (!allowed.has(`${f.day}|${q}`)) add('error', 'fixed_sessions', f._row, 'start_period', `${f.offering_id}: ${f.day} period ${q} is not in timeslots.csv.`, 'Check the data.');
      if (tb.has(`${off.teacher_id}|${f.day}|${q}`)) add('error', 'fixed_sessions', f._row, 'start_period', `${f.offering_id}: teacher ${off.teacher_id} is blocked at ${f.day} period ${q}.`, 'Fixed session conflicts with teacher_blocks.');
      if (rb.has(`${f.room_id}|${f.day}|${q}`)) add('error', 'fixed_sessions', f._row, 'room_id', `${f.offering_id}: room ${f.room_id} is closed at ${f.day} period ${q}.`, 'Fixed session conflicts with room_blocks.');
      mark(occ.t, `${off.teacher_id}|${f.day}|${q}`, f.offering_id, f._row, 'Teacher');
      mark(occ.r, `${f.room_id}|${f.day}|${q}`, f.offering_id, f._row, 'Room');
      mark(occ.g, `${off.group_id}|${f.day}|${q}`, f.offering_id, f._row, 'Group');
    }
  }
  for (const s of rowsOf('shared_students')) for (const [k, v] of occ.g) {
    const [g, d, q] = k.split('|');
    if (g === s.group_a && occ.g.has(`${s.group_b}|${d}|${q}`)) add('error', 'fixed_sessions', v.row, null, `Fixed sessions of shared-student groups ${s.group_a}/${s.group_b} overlap at ${d} period ${q}.`, 'Check the data.');
  }

  const totalPeriods = [...O.values()].reduce((a, o) => a + (o.periods || 0), 0);
  const stats = {
    rows: Object.fromEntries(FILE_NAMES.map((f) => [f, cleaned[f] ? cleaned[f].rows.length : null])),
    offerings: O.size, totalPeriods,
    expectedOfferings: EXPECTED.offerings, expectedPeriods: EXPECTED.periods,
    groups: G.size, teachers: T.size, rooms: R.size
  };
  if (cleaned.offerings && !cleaned.offerings.missingCols.length && (O.size !== EXPECTED.offerings || totalPeriods !== EXPECTED.periods))
    add('warning', 'offerings', null, null, `Found ${O.size} offerings / ${totalPeriods} periods; the brief states ${EXPECTED.offerings} / ${EXPECTED.periods}.`, 'Check for lost or duplicated rows (the system never changes period counts).');
  return { issues, stats };
}

module.exports = { validate };

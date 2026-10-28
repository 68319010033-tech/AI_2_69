const { DAYS } = require('./schema');

// Markdown report for real users (principal / teachers)
function buildReport({ sessionId, method, job, check, data, assignments }) {
  const off = Object.fromEntries(data.offerings.map((o) => [o.offering_id, o]));
  const course = Object.fromEntries(data.courses.map((c) => [c.course_id, c]));
  const L = [];
  L.push(`# Timetable report`, '', `Session: ${sessionId}  |  Method: ${method}  |  Generated: ${new Date().toISOString()}`, '');
  L.push('## Summary', '',
    `- Offerings scheduled: ${check.scheduled} / ${check.total_offerings} (${check.scheduled_periods} periods)`,
    `- Hard constraints: ${check.valid ? 'ALL 12 PASSED' : 'FAILED (' + check.violations_total + ' violations)'}`,
    `- Teacher idle gaps: ${check.metrics.teacher_gaps}`,
    `- Group balance deviation: ${check.metrics.group_balance_dev}; busiest group-day: ${check.metrics.group_max_per_day} periods`,
    job ? `- Solver: ${job.solverStatus || ''}, ${job.elapsedSec ?? ''} s` : '', '');
  L.push('## Hard constraint check', '', '| # | Result | Violations |', '|---|---|---|');
  for (const [k, v] of Object.entries(check.hard)) L.push(`| ${k.toUpperCase()} | ${v.pass ? 'PASS' : 'FAIL'} | ${v.count} |`);
  L.push('', '## Timetable by group', '');
  for (const g of data.groups) {
    L.push(`### ${g.group_id}${g.group_name ? ' - ' + g.group_name : ''}`, '', '| Day | Periods | Course | Teacher | Room |', '|---|---|---|---|---|');
    const rows = assignments.filter((a) => off[a.offering_id] && off[a.offering_id].group_id === g.group_id)
      .sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || a.start_period - b.start_period);
    for (const a of rows) {
      const o = off[a.offering_id]; const c = course[o.course_id] || {};
      L.push(`| ${a.day} | ${a.start_period}-${a.start_period + o.periods - 1} | ${c.course_name || o.course_id} | ${o.teacher_id} | ${a.room_id} |`);
    }
    L.push('');
  }
  return L.join('\n');
}
module.exports = { buildReport };

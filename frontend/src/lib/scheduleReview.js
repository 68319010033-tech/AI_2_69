// Detect overlapping resource bookings; this supplements the server's full constraint checker.
export function findConflicts(sessions) {
  const conflicts = []
  for (let i = 0; i < sessions.length; i++) {
    const a = sessions[i]
    for (let j = i + 1; j < sessions.length; j++) {
      const b = sessions[j]
      if (a.day !== b.day || Number(a.start_period) >= Number(b.start_period) + Number(b.periods) || Number(b.start_period) >= Number(a.start_period) + Number(a.periods)) continue
      const resources = ['teacher_id', 'room_id', 'group_id'].filter(key => a[key] && a[key] === b[key])
      if (resources.length) conflicts.push({ a, b, resources })
    }
  }
  return conflicts
}

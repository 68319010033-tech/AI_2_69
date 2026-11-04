import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findConflicts } from '../src/lib/scheduleReview.js'
const session = { day: 'MON', start_period: 1, periods: 2, teacher_id: 'T1', room_id: 'R1', group_id: 'G1' }
test('overlaps identify all shared resources, but adjacent sessions do not clash', () => {
  assert.equal(findConflicts([session, { ...session, start_period: 3 }]).length, 0)
  assert.equal(findConflicts([session, { ...session, day: 'TUE' }]).length, 0)
  assert.deepEqual(findConflicts([session, { ...session, start_period: 2 }])[0].resources, ['teacher_id', 'room_id', 'group_id'])
  assert.equal(findConflicts([session, { ...session, teacher_id: 'T2', room_id: 'R2', group_id: 'G2' }]).length, 0)
})

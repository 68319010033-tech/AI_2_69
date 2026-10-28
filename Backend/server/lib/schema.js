// Canonical schema for the 10 CSV files.
// IMPORTANT: real column names were not visible in the problem PDF, so every column
// accepts several aliases. If the real header differs, add it to the `aliases` list.
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const ROOM_TYPES = ['GENERAL', 'COMPUTER', 'NETWORK', 'MEDIA'];
const ROOM_TYPE_MAP = { GEN: 'GENERAL', COM: 'COMPUTER', NET: 'NETWORK', MED: 'MEDIA' };
const MIN_PERIOD = 1;
const MAX_PERIOD = 8;
const BLOCKS = [[1, 4], [5, 8]]; // morning / afternoon (lunch 12:00-13:00 is between)
const EXPECTED = { offerings: 63, periods: 126 };

const col = (type, aliases = [], required = true) => ({ type, aliases, required });

const FILES = {
  groups: {
    pk: ['group_id'],
    cols: {
      group_id: col('id', ['group', 'group_code', 'groupid', 'id', 'class_id', 'class']),
      group_name: col('str', ['name', 'groupname', 'class_name'], false),
      size: col('int', ['students', 'student_count', 'num_students', 'n_students', 'headcount', 'group_size', 'student_num', 'students_count']),
      max_periods_per_day: col('int', ['max_per_day', 'max_daily_periods', 'max_periods_day', 'max_periods'])
    }
  },
  teachers: {
    pk: ['teacher_id'],
    cols: {
      teacher_id: col('id', ['teacher', 'teacher_code', 'teacherid', 'id']),
      teacher_name: col('str', ['name', 'teachername'], false),
      max_periods_per_day: col('int', ['max_per_day', 'max_daily_periods', 'max_periods_day']),
      max_periods_per_week: col('int', ['max_per_week', 'max_weekly_periods', 'max_periods_week'])
    }
  },
  rooms: {
    pk: ['room_id'],
    cols: {
      room_id: col('id', ['room', 'room_code', 'roomid', 'id']),
      room_name: col('str', ['name', 'roomname'], false),
      room_type: col('roomtype', ['type', 'roomtype', 'room_kind']),
      capacity: col('int', ['cap', 'seats', 'room_capacity', 'max_students'])
    }
  },
  courses: {
    pk: ['course_id'],
    cols: {
      course_id: col('id', ['course', 'course_code', 'subject_id', 'subject', 'id']),
      course_name: col('str', ['name', 'subject_name', 'coursename', 'title'], false),
      room_type: col('roomtype', ['type', 'roomtype', 'required_room_type', 'room_kind'])
    }
  },
  offerings: {
    pk: ['offering_id'],
    cols: {
      offering_id: col('id', ['offering', 'id', 'offer_id', 'offeringid']),
      group_id: col('id', ['group', 'group_code', 'groupid', 'class_id']),
      course_id: col('id', ['course', 'course_code', 'subject_id', 'subject']),
      teacher_id: col('id', ['teacher', 'teacher_code', 'teacherid']),
      periods: col('int', ['period_count', 'num_periods', 'hours', 'length', 'duration', 'periods_per_session', 'periods_per_week'])
    }
  },
  timeslots: {
    pk: ['day', 'period'],
    cols: {
      day: col('day', ['weekday', 'day_of_week']),
      period: col('int', ['slot', 'period_no', 'period_id', 'start_period'])
    }
  },
  teacher_blocks: {
    pk: null,
    cols: {
      teacher_id: col('id', ['teacher', 'teacher_code', 'teacherid']),
      day: col('day', ['weekday', 'day_of_week']),
      period: col('int', ['slot', 'period_no', 'start_period'])
    }
  },
  room_blocks: {
    pk: null,
    cols: {
      room_id: col('id', ['room', 'room_code', 'roomid']),
      day: col('day', ['weekday', 'day_of_week']),
      period: col('int', ['slot', 'period_no', 'start_period'])
    }
  },
  fixed_sessions: {
    pk: ['offering_id'],
    cols: {
      offering_id: col('id', ['offering', 'id', 'offer_id']),
      day: col('day', ['weekday', 'day_of_week']),
      start_period: col('int', ['start', 'period', 'begin_period', 'start_slot']),
      room_id: col('id', ['room', 'room_code', 'roomid'])
    }
  },
  shared_students: {
    pk: null,
    cols: {
      group_a: col('id', ['group1', 'group_1', 'group_id_1', 'group_id1', 'group_id_a', 'g1', 'groupa', 'group_a_id', 'group_id']),
      group_b: col('id', ['group2', 'group_2', 'group_id_2', 'group_id2', 'group_id_b', 'g2', 'groupb', 'group_b_id', 'other_group_id'])
    }
  }
};

module.exports = { DAYS, ROOM_TYPES, ROOM_TYPE_MAP, MIN_PERIOD, MAX_PERIOD, BLOCKS, EXPECTED, FILES, FILE_NAMES: Object.keys(FILES) };

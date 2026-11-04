import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { parseTable, suggestMapping, suggestType, mapTable, templateHeader } from '../src/lib/inputFormat.js'
const require = createRequire(import.meta.url)
const { FILES } = require('../../Backend/server/lib/schema')
const { parseCsv } = require('../../Backend/server/lib/csvParse')
const { cleanFile } = require('../../Backend/server/lib/clean')
import { Buffer } from 'node:buffer'

test('category inference prefers a complete specific match and leaves conflicts for the user', () => {
    assert.equal(suggestType(FILES, ['group_id', 'student_count', 'max_periods_per_day'], 'students-export.csv'), 'groups')
    assert.equal(suggestType(FILES, ['teacher_id', 'day', 'period'], 'unavailable.tsv'), 'teacher_blocks')
    assert.equal(suggestType(FILES, ['teacher_id', 'room_id', 'day', 'period'], 'unknown.csv'), '')
    assert.equal(suggestType(FILES, ['ชื่อ', 'จำนวน'], 'unknown.csv'), '')
    assert.equal(suggestType(FILES, ['group_id', 'student_count', 'max_periods_per_day'], 'rooms.csv'), '')
    assert.equal(suggestType(FILES, ['รหัส', 'ชื่อ'], 'groups.csv'), 'groups')
})

test('all ten reference templates are inferred without relying on their filenames', () => {
    for (const [type, spec] of Object.entries(FILES)) {
        const headers = Object.keys(spec.cols).map(column => templateHeader(type, column))
        assert.equal(suggestType(FILES, headers, 'export.csv'), type)
    }
})

test('CSV, semicolon and tab imports preserve quoted Thai, identifiers and multiline values', () => {
    for (const delimiter of [',', ';', '\t']) {
        const text = ['รหัส', 'ชื่อ', 'จำนวน'].join(delimiter) + '\r\n' + ['001', '"ห้อง, A; B\nบรรทัดสอง"', '28'].join(delimiter)
        const parsed = parseTable(text)
        assert.equal(parsed.delimiter, delimiter)
        assert.deepEqual(parsed.data, [['001', 'ห้อง, A; B\nบรรทัดสอง', '28']])
    }
})

test('every template satisfies backend required columns, preserving the supplied supplementary fields', () => {
    for (const [type, spec] of Object.entries(FILES)) {
        const headers = Object.keys(spec.cols).map(column => templateHeader(type, column))
        const parsed = parseCsv(Buffer.from(headers.join(',') + '\n'))
        assert.deepEqual(cleanFile(type, parsed).missingCols, [])
    }
    assert.ok(FILES.timeslots.cols.start_time)
    assert.ok(FILES.shared_students.cols.shared_student_count)
})

test('known aliases map automatically; unknown Thai headers require explicit mapping', () => {
    const known = suggestMapping(FILES.groups, ['group_id', 'group_name', 'student_count', 'max_periods_per_day'])
    assert.equal(known.size, 2)
    const source = parseTable('รหัส,ชื่อ,จำนวน,สูงสุด,หมายเหตุ\nG1,กลุ่มเอ,28,6,เก็บไว้')
    const guessed = suggestMapping(FILES.groups, source.headers)
    assert.equal(guessed.group_id, -1)
    assert.throws(() => mapTable('groups', FILES.groups, source, guessed), /จับคู่/)
    const mapped = mapTable('groups', FILES.groups, source, { group_id: 0, group_name: 1, size: 2, max_periods_per_day: 3 })
    assert.deepEqual(mapped.headers, ['group_id', 'group_name', 'student_count', 'max_periods_per_day', 'หมายเหตุ'])
    assert.equal(mapped.data[0][4], 'เก็บไว้')
})

test('ambiguous aliases, duplicate mappings and malformed input are not silently accepted', () => {
    assert.equal(suggestMapping(FILES.groups, ['size', 'student_count']).size, -1)
    const source = parseTable('a,b,c\n1,2,3')
    assert.throws(() => mapTable('groups', FILES.groups, source, { group_id: 0, group_name: -1, size: 1, max_periods_per_day: 1 }), /เพียงครั้งเดียว/)
    for (const text of ['id,id\n1,2', 'a,b\n1,2,3', 'a,b\n"unclosed', 'a,b\n"value"oops,2', 'a,b\n1,\uFFFD']) {
        assert.throws(() => parseTable(text))
    }
    assert.deepEqual(parseTable('a,b\n1').data, [['1', '']])
})

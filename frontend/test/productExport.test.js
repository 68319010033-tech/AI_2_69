import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Buffer } from 'node:buffer'
import ExcelJS from 'exceljs'
import { loadExportData, buildXlsxBlob, buildPrintHtml } from '../src/utils/exportSchedule.js'
import { setLocale } from '../src/i18n.js'
import { parseTable } from '../src/lib/inputFormat.js'

test('Excel separator declarations and quoted records import without losing leading zeros', () => {
    assert.deepEqual(parseTable('\uFEFF\r\nsep=;\r\nid;name\r\n001;"ครู; A"').data, [['001', 'ครู; A']])
    assert.throws(() => parseTable('sep=;\r\nid;name\r\n001;A;B'), /แถว 3/)
})

test('workbook and print view export the same selected schedule and preserve names', async () => {
    setLocale('en')
    const items = [{ offering_id: 'O1', course_id: 'C1', course_name: 'Research & Design', group_id: '001',
        group_name: 'กลุ่มเอ', teacher_id: 'T1', room_id: 'R1', day: 'MON', start_period: 2, periods: 2 }]
    const sessions = await loadExportData({ schedule: async (sid, method) => {
        assert.equal(sid, 'selected'); assert.equal(method, 'cpsat'); return { items }
    } }, 'selected', 'cpsat')
    const blob = await buildXlsxBlob(sessions, 'Semester A')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(Buffer.from(await blob.arrayBuffer()))
    assert.equal(workbook.worksheets[0].getCell('B1').value, 'Semester A')
    assert.equal(workbook.getWorksheet('All sessions').getCell('A2').value, 'Research & Design')
    assert.equal(workbook.getWorksheet('All sessions').getCell('B2').value, 'กลุ่มเอ')
    const print = buildPrintHtml(sessions, 'Timetable', { selection: { group: ['001'] } })
    assert.match(print, /Research &amp; Design/)
    assert.match(print, /rowspan="2"/)
    await assert.rejects(loadExportData({ schedule: async () => ({ items: [{ ...items[0], start_period: 4 }] }) }, 'selected'), /Invalid session time/)
})

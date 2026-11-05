import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { ref, computed, watch } from 'vue'
import { createPinia, defineStore } from 'pinia'
import { createRequire } from 'node:module'
import { Buffer } from 'node:buffer'
import { parseTable } from '../src/lib/inputFormat.js'

// Use the server parser to verify exactly what an edited upload will contain.
const require = createRequire(import.meta.url)
const { parseCsv } = require('../../Backend/server/lib/csvParse')
const source = readFileSync(new URL('../src/stores/session.js', import.meta.url), 'utf8')
    .replace(/^import .*$/gm, '').replace(/export const /g, 'const ')

function setup(api = {}, storage = new Map(), userId = 'test-user') {
    const useStore = runInNewContext(`${source}\nuseSessionStore`, {
        ref, computed, watch, defineStore, api, File, setInterval, clearInterval, parseTable,
        auth: { user: { id: userId } },
        localStorage: {
            getItem: key => storage.get(key),
            setItem: (key, value) => storage.set(key, value),
            removeItem: key => storage.delete(key),
        },
    })
    return useStore(createPinia())
}
const csvFile = (text) => new File([text], 'groups.csv')

test('a malformed file leaves the entire existing draft unchanged during a batch import', async () => {
    const store = setup()
    await store.addFiles([csvFile('group_id,name\nG1,Original')])
    await store.addFiles([csvFile('group_id,name\nG2,Replacement'), new File(['id,name\nT1,bad,extra'], 'teachers.csv')])
    assert.equal(store.files['groups.csv'].data[0][1], 'Original')
    assert.equal(store.files['teachers.csv'], undefined)
    assert.match(store.error, /teachers\.csv: แถว 2/)
})

test('edited upload preserves Thai, commas, quotes and line breaks using server parser', async () => {
    let uploaded
    const store = setup({ upload: async files => {
        uploaded = files[0]
        return { sessionId: 'new-session', files: [{ recognized: true }] }
    } })
    await store.addFiles([csvFile('group_id,group_name\r\nG1,Original')])
    const name = 'ห้อง "หนึ่ง", กลุ่มเอ\nบรรทัดสอง'
    store.updateCell('groups.csv', 0, 1, name)
    assert.equal(await store.upload(), true)
    const result = parseCsv(Buffer.from(await uploaded.arrayBuffer()))
    assert.equal(result.error, null)
    assert.equal(result.rows[0].group_name, name)
    // Round trip through the editor, too, to catch CSV escaping regressions.
    const reopened = setup()
    await reopened.addFiles([uploaded])
    assert.equal(reopened.files['groups.csv'].data[0][1], name)
    assert.equal(store.sessionId, 'new-session')
})

test('editing, adding and deleting invalidate prior validation and schedule', async () => {
    const store = setup()
    await store.addFiles([csvFile('group_id,group_name\nG1,One\nG2,Two')])
    store.sessionId = 'old-session'
    store.validated = true
    store.generated = true
    store.stats = { offerings: 63 }
    store.schedule = [{ offering_id: 'old' }]
    store.updateCell('groups.csv', 1, 1, 'Edited second row')
    assert.equal(store.files['groups.csv'].data[0][1], 'One')
    assert.equal(store.files['groups.csv'].data[1][1], 'Edited second row')
    assert.equal(store.sessionId, '')
    assert.equal(store.validated, false)
    assert.equal(store.generated, false)
    assert.equal(store.stats, null)
    assert.equal(store.schedule.length, 0)
    store.addRow('groups.csv')
    assert.equal(store.files['groups.csv'].rows, 3)
    store.removeRow('groups.csv', 0)
    assert.equal(store.files['groups.csv'].rows, 2)
    assert.equal(store.files['groups.csv'].data[0][0], 'G2')
})

test('failed parsing and rejected uploads do not advance to validation', async () => {
    const store = setup({ upload: async () => ({ sessionId: 'bad', files: [{ file: 'groups', error: 'Invalid CSV' }] }) })
    await store.addFiles([csvFile('group_id,name\nG1,"unclosed')])
    assert.equal(store.canNext, false)
    assert.ok(store.error)
    await store.addFiles([csvFile('group_id,name\nG1,One')])
    assert.equal(await store.upload(), false)
    assert.equal(store.sessionId, '')
    assert.match(store.error, /Invalid CSV/)
})

test('uploads lock editing and short rows expose missing cells', async () => {
    let finish
    const store = setup({ upload: () => new Promise(resolve => { finish = resolve }) })
    await store.addFiles([csvFile('group_id,name\nG1')])
    assert.equal(store.files['groups.csv'].data[0][1], '')
    const pending = store.upload()
    store.updateCell('groups.csv', 0, 0, 'blocked')
    store.removeFile('groups.csv')
    assert.equal(store.files['groups.csv'].data[0][0], 'G1')
    finish({ sessionId: 'saved', files: [] })
    assert.equal(await pending, true)
    assert.equal(store.editingLocked, false)
})

test('draft restores unsaved edits after reload and is isolated by account', async () => {
    const storage = new Map()
    const store = setup({}, storage)
    await store.addFiles([csvFile('group_id,name\nG1,One')])
    store.updateCell('groups.csv', 0, 1, 'กำลังพิมพ์')
    const restored = setup({}, storage)
    assert.equal(restored.files['groups.csv'].data[0][1], 'กำลังพิมพ์')
    assert.equal(restored.dirty, true)
    assert.equal(restored.sessionId, '')
    assert.equal(Object.keys(setup({}, storage, 'other-user').files).length, 0)
})

const snapshot = () => ({ sessionId: '123456abcdef', revision: 'v1', files: {
    'groups.csv': { headers: ['group_id', 'name'], data: [['G1', 'Latest']], rows: 1 },
} })

test('refresh fetches latest data, persists it and never replaces unsaved edits', async () => {
    let latest = snapshot()
    const storage = new Map()
    const store = setup({ latestData: async () => latest }, storage)
    await store.refreshLatest()
    assert.equal(store.files['groups.csv'].data[0][1], 'Latest')
    assert.equal(setup({}, storage).sessionId, latest.sessionId)
    store.updateCell('groups.csv', 0, 1, 'My draft')
    latest = { ...snapshot(), revision: 'v2' }
    await store.refreshLatest()
    assert.equal(store.files['groups.csv'].data[0][1], 'My draft')
    assert.equal(store.remoteAvailable, true)
    assert.equal(setup({}, storage).files['groups.csv'].data[0][1], 'My draft')
})

test('an edit made during a refresh request wins over its late response', async () => {
    let finish
    const store = setup({ latestData: () => new Promise(resolve => { finish = resolve }) })
    const pending = store.refreshLatest()
    await store.addFiles([csvFile('group_id,name\nG1,Local')])
    finish(snapshot())
    await pending
    assert.equal(store.files['groups.csv'].data[0][1], 'Local')
})

test('offline refresh retries successfully and storage failure is visible', async () => {
    let offline = true
    const store = setup({ latestData: async () => {
        if (offline) throw new Error('offline')
        return snapshot()
    } })
    await store.refreshLatest()
    assert.match(store.refreshStatus, /เชื่อมต่อไม่ได้/)
    offline = false
    await store.refreshLatest()
    assert.equal(store.sessionId, snapshot().sessionId)
    const fullStorage = { get: () => null, set: () => { throw new Error('quota') } }
    const draft = setup({}, fullStorage)
    await draft.addFiles([csvFile('group_id,name\nG1,Local')])
    assert.match(draft.draftStatus, /บันทึกฉบับร่างไม่ได้/)
    assert.equal(draft.files['groups.csv'].data[0][1], 'Local')
})

test('corrupt saved drafts are reported without crashing the editor', () => {
    const storage = new Map([['timetable-draft-v1:test-user', '{broken']])
    const store = setup({}, storage)
    assert.match(store.draftStatus, /อ่านฉบับร่างเดิมไม่ได้/)
    assert.equal(store.canNext, false)
})

test('manually created and mapped tables persist and use the same edited upload path', async () => {
    const storage = new Map()
    let uploaded
    const store = setup({ upload: async files => {
        uploaded = files[0]
        return { sessionId: 'manual', files: [{ recognized: true }] }
    } }, storage)
    assert.equal(store.setTable('groups.csv', ['group_id', 'student_count'], []), true)
    store.addRow('groups.csv')
    store.updateCell('groups.csv', 0, 0, 'G01')
    store.updateCell('groups.csv', 0, 1, '28')
    assert.equal(setup({}, storage).files['groups.csv'].data[0][1], '28')
    assert.equal(await store.upload(), true)
    const parsed = parseCsv(Buffer.from(await uploaded.arrayBuffer()))
    assert.equal(parsed.rows[0].student_count, '28')
    assert.equal(store.setTable('unsupported.csv', ['id'], []), false)
})

test('undo restores deleted rows and invalidates old results', () => {
    const store = setup()
    store.setTable('groups.csv', ['group_id'], [['G1'], ['G2']])
    store.removeRow('groups.csv', 0)
    store.undo()
    assert.equal(store.files['groups.csv'].data[0][0], 'G1')
    assert.equal(store.files['groups.csv'].rows, 2)
    assert.equal(store.dirty, true)
    assert.equal(store.validated, false)
})
test('backup round trip restores data; invalid backup is atomic', () => {
    const store = setup()
    store.setTable('groups.csv', ['group_id'], [['G1']])
    store.setTerm('Term 1')
    const backup = store.backupData()
    store.removeFile('groups.csv')
    store.restoreBackup(backup)
    assert.equal(store.term, 'Term 1')
    assert.equal(store.files['groups.csv'].rows, 1)
    assert.throws(() => store.restoreBackup('{"version":1,"files":{"groups.csv":{"headers":["id"],"data":[[2]]}}}'))
    assert.equal(store.files['groups.csv'].data[0][0], 'G1')
})

test('generation requires a saved dataset and uses its snapshot without replacing the draft', async () => {
    let requested
    const store = setup({ startJob: async args => { requested = args; return { jobId: 'test-job' } }, getJob: async () => ({ status: 'done', valid: true }), schedule: async sid => { assert.equal(sid, 'saved-snapshot'); return { items: [] } } })
    store.setTable('groups.csv', ['group_id'], [['DRAFT']])
    await store.startGenerate({ timeLimitSec: 30, method: 'cpsat' })
    assert.equal(requested, undefined)
    store.selectedDataset = { id: 'saved-snapshot', name: 'Semester 1' }
    await store.startGenerate({ timeLimitSec: 30, method: 'cpsat' })
    await Promise.resolve()
    assert.equal(requested.sessionId, 'saved-snapshot')
    assert.equal(store.files['groups.csv'].data[0][0], 'DRAFT')
    assert.equal(store.generationSessionId, 'saved-snapshot')
    await store.loadSchedule()
})

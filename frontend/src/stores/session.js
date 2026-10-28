import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'

export const REQUIRED_FILES = [
    'groups', 'teachers', 'rooms', 'courses', 'offerings',
    'timeslots', 'teacher_blocks', 'room_blocks',
    'fixed_sessions', 'shared_students',
].map((n) => `${n}.csv`)

// ---------- helpers สำหรับร่างแก้ไข (draft) ----------
// draft ของแต่ละไฟล์ = {
//   headers: string[],
//   original: string[][],                 // ข้อมูลตอนอัปโหลด (ไม่เปลี่ยน ใช้เทียบ/คืนค่าเดิม)
//   rows: [{ id, o, cells: string[] }]    // แถวที่กำลังแก้ · o = index ในต้นฉบับ (null = แถวที่เพิ่มใหม่)
// }
const DRAFT_KEY = 'timetable.draft.v1'
let rowSeq = 1
const newId = () => rowSeq++

function makeDraft(headers, data) {
    const original = data.map((r) => headers.map((_, i) => r[i] ?? ''))
    return {
        headers,
        original,
        rows: original.map((cells, o) => ({ id: newId(), o, cells: cells.slice() })),
    }
}

function loadDrafts() {
    try {
        const raw = JSON.parse(localStorage.getItem(DRAFT_KEY) || '{}')
        const out = {}
        for (const [name, d] of Object.entries(raw)) {
            if (!REQUIRED_FILES.includes(name) || !Array.isArray(d?.headers) || !Array.isArray(d?.original) || !Array.isArray(d?.rows)) continue
            out[name] = {
                headers: d.headers,
                original: d.original,
                rows: d.rows.map((r) => ({ id: newId(), o: r.o ?? null, cells: r.cells })),
            }
        }
        return out
    } catch {
        return {}
    }
}

// ---------- ชุดข้อมูลที่บันทึกไว้ (snapshot) ----------
const SNAP_KEY = 'timetable.snapshots.v1'
const SNAP_MAX = 20

function loadSnapshots() {
    try {
        const raw = JSON.parse(localStorage.getItem(SNAP_KEY) || '[]')
        if (!Array.isArray(raw)) return []
        const ok = (d) => Array.isArray(d?.headers) && Array.isArray(d?.original) && Array.isArray(d?.rows)
        return raw.filter(
            (s) => s && typeof s.id === 'string' && typeof s.name === 'string' && s.data && typeof s.data === 'object'
                && Object.values(s.data).length > 0 && Object.values(s.data).every(ok),
        )
    } catch {
        return []
    }
}

function toCsv(headers, rows) {
    const esc = (v) => {
        const s = String(v ?? '')
        return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    return '\uFEFF' + [headers, ...rows].map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n'
}

export const useSessionStore = defineStore('session', () => {
    const sessionId = ref(localStorage.getItem('sessionId') || '')
    const files = ref({}) // { 'groups.csv': { file, rows, headers, data } }
    const drafts = ref(loadDrafts()) // { 'groups.csv': draft }
    const uploading = ref(false)
    const error = ref('')
    const validated = ref(false)   // ตั้งเป็น true เมื่อ validate ผ่านไม่มี blocking error
    const generated = ref(false)   // ตั้งเป็น true เมื่อ generate สำเร็จ
    const schedule = ref([])
    const lists = ref({ groups: [], teachers: [], rooms: [] })
    const method = ref('cpsat')
    const scheduleLoading = ref(false)
    const job = ref(null)
    const generating = ref(false)
    const generateError = ref('')
    const startedAt = ref(0)
    let timer = null
    const issues = ref([])
    const log = ref([])
    const stats = ref(null)
    const validating = ref(false)
    const validateError = ref('')
    const stale = ref(false) // true = แก้ข้อมูลหลังตรวจครั้งล่าสุด ต้องตรวจซ้ำ

    // กู้ไฟล์จากร่างที่เก็บไว้ (รีเฟรชแล้วไม่หาย) · file = null เพราะไม่มีออบเจ็กต์ File ดั้งเดิมแล้ว
    for (const [name, d] of Object.entries(drafts.value)) {
        files.value[name] = { file: null, rows: d.rows.length, headers: d.headers, data: d.rows.map((r) => r.cells.slice()) }
    }

    const missing = computed(() => REQUIRED_FILES.filter((n) => !files.value[n]))
    const ready = computed(() => missing.value.length === 0)
    const errorCount = computed(() => issues.value.filter((i) => i.severity === 'error').length)
    const warnCount = computed(() => issues.value.filter((i) => i.severity === 'warning').length)
    const canNext = computed(() => Object.keys(files.value).length > 0)
    // ขั้นสูงสุดที่เข้าได้
    const maxStep = computed(() => {
        if (generated.value) return 5
        if (validated.value) return 3
        if (sessionId.value) return 2
        return 1
    })

    // ---------- บันทึกร่างลง localStorage ----------
    function persist() {
        try {
            const out = {}
            for (const [n, d] of Object.entries(drafts.value)) {
                out[n] = { headers: d.headers, original: d.original, rows: d.rows.map(({ o, cells }) => ({ o, cells })) }
            }
            localStorage.setItem(DRAFT_KEY, JSON.stringify(out))
        } catch { /* เต็ม/ถูกบล็อก: ข้ามเงียบๆ ระบบยังใช้งานได้ แค่รีเฟรชแล้วร่างจะหาย */ }
    }

    // ---------- ชุดข้อมูล (เก็บในเบราว์เซอร์ · P2 ค่อยย้ายขึ้นเซิร์ฟเวอร์) ----------
    const snapshots = ref(loadSnapshots()) // ใหม่สุดอยู่บน

    function persistSnapshots(list) {
        try {
            localStorage.setItem(SNAP_KEY, JSON.stringify(list))
            return true
        } catch {
            return false
        }
    }

    function saveSnapshot(rawName) {
        const name = String(rawName || '').trim().slice(0, 60)
        if (!name) return { ok: false, error: 'กรุณาใส่ชื่อชุด' }
        const names = Object.keys(drafts.value)
        if (!names.length) return { ok: false, error: 'ยังไม่มีข้อมูลให้บันทึก' }

        const data = {}
        for (const n of names) {
            const d = drafts.value[n]
            data[n] = {
                headers: d.headers.slice(),
                original: d.original.map((r) => r.slice()),
                rows: d.rows.map(({ o, cells }) => ({ o, cells: cells.slice() })),
            }
        }

        const key = name.toLowerCase()
        const idx = snapshots.value.findIndex((s) => s.name.trim().toLowerCase() === key)
        const replaced = idx >= 0
        if (!replaced && snapshots.value.length >= SNAP_MAX) {
            return { ok: false, error: `เก็บได้สูงสุด ${SNAP_MAX} ชุด ลบชุดเก่าก่อน` }
        }

        const entry = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, name, savedAt: Date.now(), data }
        const next = snapshots.value.filter((_, i) => i !== idx)
        next.unshift(entry)
        if (!persistSnapshots(next)) {
            return { ok: false, error: 'พื้นที่ในเบราว์เซอร์เต็ม บันทึกไม่ได้ ลองลบชุดเก่าก่อน' }
        }
        snapshots.value = next
        return { ok: true, replaced }
    }

    function deleteSnapshot(id) {
        const next = snapshots.value.filter((s) => s.id !== id)
        snapshots.value = next
        persistSnapshots(next)
    }

    function loadSnapshot(id) {
        const s = snapshots.value.find((x) => x.id === id)
        if (!s) return false

        const nextDrafts = {}
        for (const [name, d] of Object.entries(s.data)) {
            if (!REQUIRED_FILES.includes(name)) continue
            nextDrafts[name] = {
                headers: d.headers.slice(),
                original: d.original.map((r) => r.slice()),
                rows: d.rows.map((r) => ({ id: newId(), o: r.o ?? null, cells: r.cells.slice() })),
            }
        }
        if (!Object.keys(nextDrafts).length) return false

        // หยุดงานที่กำลังคำนวณอยู่ (ข้อมูลเปลี่ยนแล้ว ผลเดิมใช้ไม่ได้)
        stopPolling()
        generating.value = false
        generateError.value = ''
        job.value = null

        drafts.value = nextDrafts
        files.value = {}
        for (const [name, d] of Object.entries(nextDrafts)) {
            files.value[name] = { file: null, rows: d.rows.length, headers: d.headers, data: d.rows.map((r) => r.cells.slice()) }
        }

        // ล้างประวัติ Undo/Redo
        Object.keys(history).forEach((k) => delete history[k])
        histTick.value++

        // ต้องตรวจซ้ำ เหมือนตอนแก้ข้อมูลทั่วไป
        validated.value = false
        generated.value = false
        schedule.value = []
        if (stats.value) stale.value = true

        persist()
        return true
    }


    // ---------- Undo / Redo (เก็บ snapshot ของ rows ต่อไฟล์) ----------
    const history = {} // name -> { past: string[], future: string[] }
    const histTick = ref(0)
    const hist = (name) => (history[name] ||= { past: [], future: [] })

    function pushHistory(name) {
        const h = hist(name)
        h.past.push(JSON.stringify(drafts.value[name].rows))
        if (h.past.length > 100) h.past.shift()
        h.future = []
    }
    const canUndo = (name) => (histTick.value, !!history[name]?.past.length)
    const canRedo = (name) => (histTick.value, !!history[name]?.future.length)

    // ---------- หลังมีการแก้ไขทุกครั้ง ----------
    function syncFile(name) {
        const d = drafts.value[name]
        const f = files.value[name]
        if (!d || !f) return
        f.rows = d.rows.length
        f.data = d.rows.map((r) => r.cells.slice()) // ให้พรีวิวในหน้า Upload เห็นข้อมูลที่แก้แล้ว
    }

    function touch(name) {
        syncFile(name)
        // ข้อมูลเปลี่ยน → ผลตรวจและตารางที่จัดไว้เดิมใช้ไม่ได้แล้ว
        validated.value = false
        generated.value = false
        schedule.value = []
        if (stats.value) stale.value = true
        histTick.value++
        persist()
    }

    // ---------- การแก้ไข ----------
    function setCell(name, r, c, val) {
        const row = drafts.value[name]?.rows[r]
        if (!row || row.cells[c] === val) return
        pushHistory(name)
        row.cells[c] = val
        touch(name)
    }

    function addRow(name, at) {
        const d = drafts.value[name]
        if (!d) return -1
        const idx = at ?? d.rows.length
        pushHistory(name)
        d.rows.splice(idx, 0, { id: newId(), o: null, cells: d.headers.map(() => '') })
        touch(name)
        return idx
    }

    function deleteRow(name, r) {
        const d = drafts.value[name]
        if (!d || !d.rows[r]) return
        pushHistory(name)
        d.rows.splice(r, 1)
        touch(name)
    }

    function undo(name) {
        const h = history[name]
        const d = drafts.value[name]
        if (!h?.past.length || !d) return
        h.future.push(JSON.stringify(d.rows))
        d.rows = JSON.parse(h.past.pop())
        touch(name)
    }

    function redo(name) {
        const h = history[name]
        const d = drafts.value[name]
        if (!h?.future.length || !d) return
        h.past.push(JSON.stringify(d.rows))
        d.rows = JSON.parse(h.future.pop())
        touch(name)
    }

    function resetFile(name) {
        const d = drafts.value[name]
        if (!d) return
        pushHistory(name) // คืนค่าเดิมแล้วยัง Undo กลับได้
        d.rows = d.original.map((cells, o) => ({ id: newId(), o, cells: cells.slice() }))
        touch(name)
    }

    function resetAll() {
        Object.keys(drafts.value).forEach(resetFile)
    }

    // สรุปสิ่งที่แก้ในไฟล์: จำนวนช่องที่แก้ / แถวที่เพิ่ม / แถวที่ลบ
    function editSummary(name) {
        const d = drafts.value[name]
        if (!d) return { cells: 0, added: 0, deleted: 0, total: 0 }
        let cells = 0
        let added = 0
        const kept = new Set()
        for (const r of d.rows) {
            if (r.o === null) { added++; continue }
            kept.add(r.o)
            r.cells.forEach((v, i) => { if (v !== d.original[r.o][i]) cells++ })
        }
        const deleted = d.original.length - kept.size
        return { cells, added, deleted, total: cells + added + deleted }
    }

    const editedTotal = computed(() => Object.keys(drafts.value).reduce((s, n) => s + editSummary(n).total, 0))

    const csvOf = (name) => {
        const d = drafts.value[name]
        return d ? toCsv(d.headers, d.rows.map((r) => r.cells)) : ''
    }

    // ข้อมูลที่แก้แล้วทั้งหมด ใช้ส่งให้ api.validate (โหมด mock) / P2 ใช้ส่งขึ้นเซิร์ฟเวอร์
    function localPayload() {
        const o = {}
        for (const [n, d] of Object.entries(drafts.value)) o[n] = { headers: d.headers, rows: d.rows.map((r) => r.cells) }
        return o
    }

    // ---------- ไฟล์ ----------
    async function addFiles(fileList) {
        for (const f of fileList) {
            const name = f.name.toLowerCase().trim()
            if (!REQUIRED_FILES.includes(name)) continue
            const text = await f.text()
            const { headers, data } = parseCsv(text)
            files.value[name] = { file: f, rows: data.length, headers, data }
            drafts.value[name] = makeDraft(headers, data)
            delete history[name]
        }
        persist()
    }

    function removeFile(name) {
        delete files.value[name]
        delete drafts.value[name]
        delete history[name]
        persist()
    }

    async function upload() {
        uploading.value = true
        error.value = ''
        try {
            // ไฟล์ที่ยังไม่ถูกแก้ส่งไฟล์ต้นฉบับ · ไฟล์ที่แก้แล้ว/กู้จากร่างสร้าง CSV ใหม่จากข้อมูลปัจจุบัน
            const list = Object.entries(files.value).map(([name, x]) => {
                const d = drafts.value[name]
                if (x.file && (!d || editSummary(name).total === 0)) return x.file
                return new File([csvOf(name)], name, { type: 'text/csv' })
            })
            const res = await api.upload(list)
            sessionId.value = res.sessionId
            localStorage.setItem('sessionId', res.sessionId)
            // session ใหม่ → ผลตรวจ/ตารางเดิมใช้ไม่ได้
            stats.value = null
            issues.value = []
            log.value = []
            validated.value = false
            generated.value = false
            stale.value = false
            schedule.value = []
            return true
        } catch (e) {
            error.value = e.response?.data?.message || 'อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง'
            return false
        } finally {
            uploading.value = false
        }
    }


    function parseCsv(text) {
        text = text.replace(/^\uFEFF/, '')
        const rows = []
        let row = [], cell = '', q = false
        for (let i = 0; i < text.length; i++) {
            const c = text[i]
            if (q) {
                if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
                else if (c === '"') q = false
                else cell += c
            } else if (c === '"') q = true
            else if (c === ',') { row.push(cell); cell = '' }
            else if (c === '\n' || c === '\r') {
                if (c === '\r' && text[i + 1] === '\n') i++
                row.push(cell); cell = ''
                rows.push(row); row = []
            } else cell += c
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row) }
        const [headers = [], ...data] = rows.filter((r) => r.some((x) => x.trim() !== ''))
        return { headers: headers.map((h) => h.trim()), data }
    }


    async function validate() {
        validating.value = true
        validateError.value = ''
        try {
            const res = await api.validate(sessionId.value, localPayload())
            issues.value = res.issues
            log.value = res.log
            stats.value = res.stats
            validated.value = res.canGenerate ?? res.issues.every((i) => i.severity !== 'error')
            stale.value = false
        } catch (e) {
            validateError.value = e.response?.data?.message || 'ตรวจสอบข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'
        } finally {
            validating.value = false
        }
    }

    async function loadSchedule(m = method.value) {
        scheduleLoading.value = true
        try {
            const r = await api.schedule(sessionId.value, m)
            schedule.value = r.items
            lists.value = { groups: r.groups || [], teachers: r.teachers || [], rooms: r.rooms || [] }
            method.value = m
        } finally {
            scheduleLoading.value = false
        }
    }


    function stopPolling() {
        clearInterval(timer)
        timer = null
    }

    async function poll(jobId) {
        try {
            const j = await api.getJob(jobId)
            job.value = j
            if (j.status !== 'running') {
                stopPolling()
                generating.value = false
                if (j.status === 'done') {
                    generated.value = true
                    schedule.value = [] // ให้หน้า Timetable โหลดใหม่
                }
            }
        } catch (e) {
            stopPolling()
            generating.value = false
            generateError.value = 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'
        }
    }

    async function startGenerate({ timeLimitSec, method }) {
        stopPolling()
        generating.value = true
        generateError.value = ''
        generated.value = false
        job.value = { status: 'running' }
        startedAt.value = Date.now()
        try {
            const { jobId } = await api.startJob({ sessionId: sessionId.value, timeLimitSec, method })
            timer = setInterval(() => poll(jobId), 1500)
            poll(jobId)
        } catch (e) {
            generating.value = false
            generateError.value = e.response?.data?.message || 'เริ่มคำนวณไม่สำเร็จ ลองใหม่อีกครั้ง'
        }
    }

    function cancelGenerate() {
        stopPolling()
        generating.value = false
        job.value = null
    }

    return {
        sessionId, files, uploading, error, validated, generated, maxStep, missing, ready, canNext, addFiles, removeFile, upload
        , issues, log, stats, validating, validateError, errorCount, warnCount, validate, schedule, lists, method, scheduleLoading, loadSchedule, job, generating, generateError, startedAt, startGenerate, cancelGenerate
        // ---- editor ----
        , drafts, stale, editedTotal, editSummary, setCell, addRow, deleteRow, undo, redo, canUndo, canRedo, resetFile, resetAll, csvOf, snapshots, saveSnapshot, loadSnapshot, deleteSnapshot
    }
})
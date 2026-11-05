import { ref, computed, watch } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'
import { auth } from '@/auth'
import { parseTable } from '@/lib/inputFormat'

export const REQUIRED_FILES = [
    'groups', 'teachers', 'rooms', 'courses', 'offerings',
    'timeslots', 'teacher_blocks', 'room_blocks',
    'fixed_sessions', 'shared_students',
].map((n) => `${n}.csv`)

export const useSessionStore = defineStore('session', () => {
    const sessionId = ref('')
    const sourceSessionId = ref('')
    const selectedDataset = ref(null)
    const generationSessionId = ref('')
    const serverRevision = ref('')
    const dirty = ref(false)
    const term = ref('')
    const lastGeneratedAt = ref('')
    const scheduleError = ref('')
    const history = ref([])
    const canUndo = computed(() => history.value.length > 0 && !editingLocked.value)
    function remember() {
        history.value.push(JSON.stringify(files.value))
        if (history.value.length > 20) history.value.shift()
    }
    function undo() {
        if (!canUndo.value) return
        const previous = JSON.parse(history.value.pop())
        invalidateResults()
        files.value = previous
        reviewIssues.value = []
        saveDraft()
    }
    function setTerm(value) { term.value = value.slice(0, 80); saveDraft() }
    function backupData() {
        return JSON.stringify({ version: 1, term: term.value, files: Object.fromEntries(Object.entries(files.value).map(([name, entry]) => [name, { headers: entry.headers, data: entry.data }])) }, null, 2)
    }
    function restoreBackup(text) {
        if (editingLocked.value) return false
        const saved = JSON.parse(text)
        if (saved.version !== 1 || !saved.files || !Object.keys(saved.files).length || !Object.entries(saved.files).every(([name, entry]) => REQUIRED_FILES.includes(name) && Array.isArray(entry.headers) && entry.headers.length && entry.headers.every(h => typeof h === 'string') && Array.isArray(entry.data) && entry.data.every(row => Array.isArray(row) && row.length === entry.headers.length && row.every(c => typeof c === 'string')))) throw new Error('Invalid backup file')
        remember()
        invalidateResults()
        files.value = Object.fromEntries(Object.entries(saved.files).map(([name, entry]) => [name, { ...entry, rows: entry.data.length }]))
        term.value = typeof saved.term === 'string' ? saved.term.slice(0, 80) : ''
        reviewIssues.value = []
        saveDraft()
        return true
    }
    const draftStatus = ref('')
    const refreshStatus = ref('')
    const remoteAvailable = ref(false)
    let refreshing = false
    let editVersion = 0
    const files = ref({}) // { 'groups.csv': { file, rows } }
    const uploading = ref(false)
    const reading = ref(false)
    const editingLocked = computed(() => uploading.value || reading.value || validating.value || generating.value)
    const error = ref('')
    const validated = ref(false)   // ตั้งเป็น true เมื่อ validate ผ่านไม่มี blocking error
    const generated = ref(false)   // ตั้งเป็น true เมื่อ generate สำเร็จ
    const schedule = ref([])
    const lists = ref({ groups: [], teachers: [], rooms: [] })
    const method = ref('cpsat')
    const scheduleLoading = ref(false)
    const job = ref(null)
    const generating = ref(false)
    const cancelling = ref(false)
    const generateError = ref('')
    const startedAt = ref(0)
    let timer = null
    const issues = ref([])
    const reviewIssues = ref([])
    const log = ref([])
    const stats = ref(null)
    const validating = ref(false)
    const validateError = ref('')


    const missing = computed(() => REQUIRED_FILES.filter((n) => !files.value[n]))
    const ready = computed(() => missing.value.length === 0)
    const errorCount = computed(() => issues.value.filter((i) => i.severity === 'error').length)
    const warnCount = computed(() => issues.value.filter((i) => i.severity === 'warning').length)
    const canNext = computed(() => Object.keys(files.value).length > 0)
    // ขั้นสูงสุดที่เข้าได้
    const maxStep = computed(() => {
        if (generated.value) return 5
        if (validated.value) return 3
        if (sessionId.value || canNext.value) return 2
        return 1
    })

    const draftKey = () => auth.user?.id ? `timetable-draft-v1:${auth.user.id}` : null
    function saveDraft() {
        const key = draftKey()
        if (!key) return
        try {
            const data = Object.fromEntries(Object.entries(files.value).map(([name, entry]) =>
                [name, { headers: entry.headers, data: entry.data, rows: entry.data.length }]))
            localStorage.setItem(key, JSON.stringify({ version: 1, term: term.value, lastGeneratedAt: lastGeneratedAt.value, files: data, sessionId: sessionId.value,
                sourceSessionId: sourceSessionId.value, revision: serverRevision.value, dirty: dirty.value, reviewIssues: reviewIssues.value }))
            draftStatus.value = 'บันทึกฉบับร่างในเครื่องแล้ว'
        } catch {
            draftStatus.value = 'บันทึกฉบับร่างไม่ได้ พื้นที่อาจเต็ม กรุณาอย่าเพิ่งปิดหรือรีเฟรชหน้า'
        }
    }

    watch(() => auth.user?.id, () => {
        stopPolling()
        invalidateResults(false)
        selectedDataset.value = null
        generationSessionId.value = ''
        files.value = {}
        history.value = []
        term.value = ''
        lastGeneratedAt.value = ''
        reviewIssues.value = []
        sourceSessionId.value = ''
        serverRevision.value = ''
        dirty.value = false
        remoteAvailable.value = false
        draftStatus.value = ''
        refreshStatus.value = ''
        const key = draftKey()
        if (!key) return
        try {
            const saved = JSON.parse(localStorage.getItem(key) || 'null')
            if (!saved) return
            if (saved.version !== 1 || !saved.files || !Object.entries(saved.files).every(([name, entry]) =>
                REQUIRED_FILES.includes(name) && Array.isArray(entry.headers) && entry.headers.every(h => typeof h === 'string') &&
                Array.isArray(entry.data) && entry.data.every(row => Array.isArray(row) && row.every(cell => typeof cell === 'string')))) {
                throw new Error('Invalid draft')
            }
            term.value = typeof saved.term === 'string' ? saved.term : ''
            lastGeneratedAt.value = saved.lastGeneratedAt || ''
            files.value = saved.files
            for (const entry of Object.values(files.value)) entry.rows = entry.data.length
            dirty.value = saved.dirty === true
            reviewIssues.value = Array.isArray(saved.reviewIssues) ? saved.reviewIssues.filter(issue => issue && typeof issue.file === 'string') : []
            sessionId.value = dirty.value ? '' : saved.sessionId || ''
            sourceSessionId.value = saved.sourceSessionId || ''
            serverRevision.value = saved.revision || ''
            draftStatus.value = 'กู้คืนฉบับร่างในเครื่องแล้ว'
        } catch {
            draftStatus.value = 'อ่านฉบับร่างเดิมไม่ได้ กรุณาเลือกไฟล์อีกครั้ง'
        }
    }, { immediate: true, flush: 'sync' })

    async function refreshLatest() {
        if (refreshing || editingLocked.value || !auth.user?.id) return
        refreshing = true
        const owner = auth.user.id
        const version = editVersion
        try {
            const latest = await api.latestData(sourceSessionId.value)
            if (owner !== auth.user?.id || version !== editVersion || editingLocked.value) return
            if (!latest.sessionId) { refreshStatus.value = 'ยังไม่มีข้อมูลที่บันทึกบนเซิร์ฟเวอร์'; return }
            if (latest.sessionId === sourceSessionId.value && latest.revision === serverRevision.value) {
                refreshStatus.value = 'ตรวจสอบแล้ว ข้อมูลเป็นปัจจุบัน'
                remoteAvailable.value = false
                return
            }
            if (dirty.value) {
                remoteAvailable.value = true
                refreshStatus.value = 'มีข้อมูลใหม่บนเซิร์ฟเวอร์ แต่เก็บฉบับร่างที่คุณกำลังแก้ไว้'
                return
            }
            invalidateResults(false)
            files.value = latest.files
            reviewIssues.value = []
            sessionId.value = latest.sessionId
            sourceSessionId.value = latest.sessionId
            serverRevision.value = latest.revision
            remoteAvailable.value = false
            refreshStatus.value = 'อัปเดตข้อมูลล่าสุดแล้ว'
            saveDraft()
        } catch {
            refreshStatus.value = 'เชื่อมต่อไม่ได้ จะลองใหม่อัตโนมัติ ฉบับร่างยังอยู่ในเครื่อง'
        } finally {
            refreshing = false
        }
    }

    async function addFiles(fileList) {
        if (editingLocked.value) return
        reading.value = true
        error.value = ''
        try {
            const staged = new Map()
            for (const f of Array.from(fileList)) {
                const name = f.name.toLowerCase().trim()
                if (!REQUIRED_FILES.includes(name)) {
                    error.value = `${f.name}: ใช้ “นำเข้าไฟล์รูปแบบอื่น” เพื่อเลือกประเภทและจับคู่คอลัมน์ (ไฟล์ ZIP ให้แตกไฟล์ก่อน)`
                    continue
                }
                if (f.size > 10 * 1024 * 1024) throw new Error(`${name}: ไฟล์ต้องมีขนาดไม่เกิน 10 MB`)
                try {
                    if (staged.has(name)) throw new Error('พบไฟล์ชื่อเดียวกันในชุดนำเข้า')
                    const { headers, data } = parseTable(await f.text())
                    staged.set(name, { rows: data.length, headers, data })
                } catch (e) { throw new Error(`${name}: ${e.message}`, { cause: e }) }
            }
            if (staged.size) {
                remember()
                invalidateResults()
                for (const [name, entry] of staged) {
                    files.value[name] = entry
                    clearFileIssues(name)
                }
                saveDraft()
            }
        } catch (e) {
            error.value = e.message || 'อ่านไฟล์ไม่สำเร็จ'
        } finally {
            reading.value = false
        }
    }

    function setTable(name, headers, data) {
        if (editingLocked.value || !REQUIRED_FILES.includes(name)) return false
        remember()
        invalidateResults()
        files.value[name] = { headers: [...headers], data: data.map(row => [...row]), rows: data.length }
        clearFileIssues(name)
        saveDraft()
        return true
    }

    function removeFile(name) {
        if (editingLocked.value) return
        remember()
        invalidateResults()
        delete files.value[name]
        clearFileIssues(name)
        saveDraft()
    }

    function invalidateResults(markDirty = true) {
        editVersion++
        if (markDirty) dirty.value = true
        sessionId.value = ''
        validated.value = false
        generated.value = false
        issues.value = []
        log.value = []
        stats.value = null
        schedule.value = []
        lists.value = { groups: [], teachers: [], rooms: [] }
        job.value = null
        validateError.value = ''
        generateError.value = ''
    }

    function updateCell(name, row, column, value) {
        if (editingLocked.value || !files.value[name]?.data[row]) return
        if (files.value[name].data[row][column] === value) return
        remember()
        invalidateResults()
        files.value[name].data[row][column] = value
        saveDraft()
    }

    function addRow(name) {
        if (editingLocked.value || !files.value[name]) return
        remember()
        invalidateResults()
        const entry = files.value[name]
        entry.data.push(entry.headers.map(() => ''))
        entry.rows = entry.data.length
        saveDraft()
    }

    function removeRow(name, row) {
        if (editingLocked.value || !files.value[name]?.data[row]) return
        remember()
        invalidateResults()
        const entry = files.value[name]
        entry.data.splice(row, 1)
        entry.rows = entry.data.length
        const file = name.replace(/\.csv$/, '')
        reviewIssues.value = reviewIssues.value.filter(issue => issue.file !== file || issue.rowIndex !== row)
            .map(issue => issue.file === file && issue.rowIndex > row ? { ...issue, rowIndex: issue.rowIndex - 1 } : issue)
        saveDraft()
    }

    function clearFileIssues(name) {
        reviewIssues.value = reviewIssues.value.filter(issue => `${issue.file}.csv` !== name)
    }

    function addColumn(name, column) {
        const entry = files.value[name]
        if (editingLocked.value || !entry || entry.headers.includes(column)) return
        remember()
        invalidateResults()
        entry.headers.push(column)
        entry.data.forEach(row => row.push(''))
        saveDraft()
    }

    function editedFile(name, entry) {
        const escape = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`
        const csv = [entry.headers, ...entry.data].map(row => row.map(escape).join(',')).join('\r\n') + '\r\n'
        return new File(['\uFEFF', csv], name, { type: 'text/csv;charset=utf-8' })
    }

    async function upload() {
        if (editingLocked.value || !canNext.value) return false
        uploading.value = true
        error.value = ''
        try {
            const res = await api.upload(Object.entries(files.value).map(([name, entry]) => editedFile(name, entry)))
            const failed = res.files?.filter(file => file.error || file.recognized === false) || []
            if (failed.length) throw new Error(failed.map(file => `${file.file}: ${file.error || file.message}`).join('\n'))
            invalidateResults(false)
            sessionId.value = res.sessionId
            sourceSessionId.value = res.sessionId
            serverRevision.value = res.revision || ''
            dirty.value = false
            remoteAvailable.value = false
            saveDraft()
            return true
        } catch (e) {
            error.value = e.response?.data?.message || e.message || 'อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง'
            return false
        } finally {
            uploading.value = false
        }
    }


    async function validate() {
        if (!sessionId.value || editingLocked.value) return false
        validating.value = true
        validated.value = false
        validateError.value = ''
        try {
            const res = await api.validate(sessionId.value)
            issues.value = res.issues
            reviewIssues.value = res.issues
            log.value = res.log
            stats.value = res.stats
            validated.value = res.canGenerate ?? res.issues.every((i) => i.severity !== 'error')
            saveDraft()
            return true
        } catch (e) {
            validateError.value = e.response?.data?.message || 'ตรวจสอบข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'
            return false
        } finally {
            validating.value = false
        }
    }

    async function loadSchedule(m = method.value) {
        if (!generationSessionId.value) { scheduleError.value = 'Generate a timetable first'; return }
        scheduleError.value = ''
        scheduleLoading.value = true
        try {
            const r = await api.schedule(generationSessionId.value, m)
            schedule.value = r.items
            lists.value = { groups: r.groups || [], teachers: r.teachers || [], rooms: r.rooms || [] }
            method.value = m
        } catch {
            scheduleError.value = 'Unable to load timetable. Please retry.'
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
            if (job.value?.jobId !== jobId || !generating.value) return
            job.value = { ...j, jobId }
            if (j.status !== 'running') {
                stopPolling()
                generating.value = false
                cancelling.value = false
                if (j.status === 'done' && j.valid !== false) {
                    lastGeneratedAt.value = new Date().toISOString()
                    saveDraft()
                    generated.value = true
                    schedule.value = [] // ให้หน้า Timetable โหลดใหม่
                }
            }
        } catch {
            stopPolling()
            generating.value = false
            cancelling.value = false
            generateError.value = 'ติดต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง'
        }
    }

    async function startGenerate({ timeLimitSec, method }) {
        if (editingLocked.value || !selectedDataset.value?.id) return
        stopPolling()
        generating.value = true
        cancelling.value = false
        generateError.value = ''
        generated.value = false
        job.value = { status: 'running' }
        generationSessionId.value = selectedDataset.value.id
        schedule.value = []
        startedAt.value = Date.now()
        try {
            const { jobId } = await api.startJob({ sessionId: selectedDataset.value.id, timeLimitSec, method })
            job.value = { ...job.value, jobId }
            timer = setInterval(() => poll(jobId), 1500)
            poll(jobId)
        } catch (e) {
            generating.value = false
            generateError.value = e.response?.data?.message || 'เริ่มคำนวณไม่สำเร็จ ลองใหม่อีกครั้ง'
        }
    }

    async function cancelGenerate() {
        const jobId = job.value?.jobId
        if (!jobId || cancelling.value) return
        cancelling.value = true
        try {
            await api.cancelJob(jobId)
        } catch (e) {
            // 409 = งานจบไปแล้ว ให้ poll ดึงสถานะจริงแทนการขึ้น error
            if (e.response?.status !== 409) {
                cancelling.value = false
                generateError.value = 'ยกเลิกไม่สำเร็จ ลองใหม่อีกครั้ง'
            }
        }
        await poll(jobId) // ถ้ายังไม่หยุด timer จะ poll ต่อจนเห็นสถานะ cancelled
    }

    return {
        selectedDataset, generationSessionId,
        term, setTerm, lastGeneratedAt, scheduleError, canUndo, undo, backupData, restoreBackup,
        sessionId, files, uploading, reading, editingLocked, error, validated, generated, maxStep, missing, ready, canNext, addFiles, removeFile, upload,
        updateCell, addRow, removeRow, setTable, addColumn, reviewIssues,
        dirty, draftStatus, refreshStatus, remoteAvailable, refreshLatest,
        issues, log, stats, validating, validateError, errorCount, warnCount, validate, schedule, scheduleLoading, loadSchedule,
        lists, method, job, generating, cancelling, generateError, startedAt, startGenerate, cancelGenerate
    }
})

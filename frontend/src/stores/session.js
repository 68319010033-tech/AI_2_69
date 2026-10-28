import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { api } from '@/api'

export const REQUIRED_FILES = [
    'groups', 'teachers', 'rooms', 'courses', 'offerings',
    'timeslots', 'teacher_blocks', 'room_blocks',
    'fixed_sessions', 'shared_students',
].map((n) => `${n}.csv`)

export const useSessionStore = defineStore('session', () => {
    const sessionId = ref(localStorage.getItem('sessionId') || '')
    const files = ref({}) // { 'groups.csv': { file, rows } }
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

    async function addFiles(fileList) {
        for (const f of fileList) {
            const name = f.name.toLowerCase().trim()
            if (!REQUIRED_FILES.includes(name)) continue
            const text = await f.text()
            const { headers, data } = parseCsv(text)
            files.value[name] = { file: f, rows: data.length, headers, data }
        }
    }

    function removeFile(name) {
        delete files.value[name]
    }

    async function upload() {
        uploading.value = true
        error.value = ''
        try {
            const res = await api.upload(Object.values(files.value).map((x) => x.file))
            sessionId.value = res.sessionId
            localStorage.setItem('sessionId', res.sessionId)
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
            const res = await api.validate(sessionId.value)
            issues.value = res.issues
            log.value = res.log
            stats.value = res.stats
            validated.value = res.canGenerate ?? res.issues.every((i) => i.severity !== 'error')
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
        , issues, log, stats, validating, validateError, errorCount, warnCount, validate, schedule, scheduleLoading, loadSchedule, job, generating, generateError, startedAt, startGenerate, cancelGenerate
    }
})
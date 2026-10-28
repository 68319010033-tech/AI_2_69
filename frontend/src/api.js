import axios from 'axios'

const MOCK = true
const http = axios.create({ baseURL: '/api' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// issue.row = "เลขบรรทัดในไฟล์" (บรรทัด 1 = หัวตาราง) → index ของแถวข้อมูล = row - ROW_OFFSET
// ถ้า backend นับแถวต่างจากนี้ (เช่น นับข้อมูลแถวแรก = 1) ให้แก้ค่านี้ที่เดียว
export const ROW_OFFSET = 2

const MOCK_SCHEDULE = [
    ['O001', 'MON', 1, 3, 'R01', 'T01', 'G1', 'C01'],
    ['O002', 'MON', 5, 2, 'R02', 'T02', 'G1', 'C02'],
    ['O003', 'TUE', 1, 2, 'R01', 'T03', 'G1', 'C03'],
    ['O004', 'TUE', 3, 2, 'R03', 'T01', 'G1', 'C04'],
    ['O005', 'WED', 2, 3, 'R02', 'T02', 'G1', 'C05'],
    ['O006', 'MON', 1, 2, 'R02', 'T03', 'G2', 'C03'],
    ['O007', 'MON', 3, 2, 'R03', 'T02', 'G2', 'C02'],
    ['O008', 'TUE', 5, 3, 'R03', 'T01', 'G2', 'C01'],
    ['O009', 'THU', 1, 3, 'R01', 'T04', 'G2', 'C06'],
    ['O010', 'WED', 5, 2, 'R02', 'T04', 'G3', 'C05'],
    ['O011', 'FRI', 1, 2, 'R01', 'T03', 'G3', 'C03'],
    ['O012', 'FRI', 3, 2, 'R02', 'T01', 'G3', 'C04'],
    ['O013', 'THU', 5, 3, 'R03', 'T02', 'G3', 'C01'],
    ['O014', 'TUE', 1, 2, 'R02', 'T04', 'G3', 'C06'],
].map(([offering_id, day, start_period, periods, room_id, teacher_id, group_id, course_id]) => ({
    offering_id, day, start_period, periods, room_id, teacher_id, group_id, course_id,
}))

const MOCK_INFEASIBLE = false // เปลี่ยนเป็น true เพื่อทดสอบกรณีจัดตารางไม่ได้
let mockJob = null


// ---------- mock validate ที่ตรวจข้อมูลที่ผู้ใช้แก้จริง ----------
// local = { 'offerings.csv': { headers: [...], rows: [[...], ...] }, ... }
const norm = (v) => String(v ?? '').trim().toUpperCase()

function colIdx(headers, ...names) {
    const h = headers.map((x) => String(x).trim().toLowerCase())
    for (const n of names) {
        const i = h.indexOf(n)
        if (i >= 0) return i
    }
    return -1
}

function idSet(local, file, ...names) {
    const t = local[file]
    if (!t) return null
    const ci = Math.max(colIdx(t.headers, ...names), 0)
    return new Set(t.rows.map((r) => norm(r[ci])))
}

function mockValidateLocal(local) {
    const issues = []
    const log = []

    // 1) รหัสอ้างอิงใน offerings ต้องมีอยู่ในไฟล์หลัก
    const fks = [
        ['teacher_id', 'teachers.csv', ['teacher_id', 'id']],
        ['group_id', 'groups.csv', ['group_id', 'id']],
        ['course_id', 'courses.csv', ['course_id', 'id']],
    ]
    const off = local['offerings.csv']
    for (const [col, refFile, refCols] of fks) {
        const ids = idSet(local, refFile, ...refCols)
        const ci = off ? colIdx(off.headers, col) : -1
        if (!ids || ci < 0) continue
        off.rows.forEach((r, i) => {
            const v = norm(r[ci])
            if (!v) {
                issues.push({ severity: 'error', file: 'offerings.csv', row: i + ROW_OFFSET, column: col, message: 'ค่าว่าง (ห้ามว่าง)', suggestion: `ใส่รหัสให้ตรงกับ ${refFile}` })
            } else if (!ids.has(v)) {
                issues.push({ severity: 'error', file: 'offerings.csv', row: i + ROW_OFFSET, column: col, message: `ไม่พบรหัส ${v} ใน ${refFile}`, suggestion: `ตรวจรหัสให้ตรงกับ ${refFile}` })
            }
        })
    }

    // 2) ความจุห้องผิดปกติ
    const rooms = local['rooms.csv']
    if (rooms) {
        const ci = colIdx(rooms.headers, 'capacity')
        if (ci >= 0) rooms.rows.forEach((r, i) => {
            const n = Number(String(r[ci]).trim())
            if (!Number.isFinite(n) || n <= 0 || n > 200) {
                issues.push({ severity: 'warning', file: 'rooms.csv', row: i + ROW_OFFSET, column: 'capacity', message: `ความจุผิดปกติ (${r[ci]})`, suggestion: 'ตรวจความจุห้อง' })
            }
        })
    }

    // 3) คาบอยู่นอกช่วง 1–8
    for (const f of ['teacher_blocks.csv', 'room_blocks.csv']) {
        const t = local[f]
        if (!t) continue
        const ci = colIdx(t.headers, 'period', 'start_period')
        if (ci < 0) continue
        t.rows.forEach((r, i) => {
            const n = Number(String(r[ci]).trim())
            if (!Number.isInteger(n) || n < 1 || n > 8) {
                issues.push({ severity: 'warning', file: f, row: i + ROW_OFFSET, column: t.headers[ci], message: 'คาบอยู่นอกช่วง 1–8', suggestion: 'แก้ค่าเป็น 1–8' })
            }
        })
    }

    // 4) log จำลอง: ช่อง *_id ที่ยังมีช่องว่าง/ตัวพิมพ์เล็ก (backend จะล้างให้)
    for (const [f, t] of Object.entries(local)) {
        t.headers.forEach((h, ci) => {
            if (!/_id$/i.test(h.trim())) return
            t.rows.forEach((r, i) => {
                const v = r[ci] ?? ''
                if (v && v !== norm(v)) log.push({ file: f, row: i + ROW_OFFSET, column: h, before: v, after: norm(v), rule: 'trim + UPPERCASE' })
            })
        })
    }

    // 5) สถิติรวม
    const pi = off ? colIdx(off.headers, 'periods') : -1
    const periods = pi >= 0 ? off.rows.reduce((s, r) => s + (parseInt(String(r[pi]).trim(), 10) || 0), 0) : 0
    return {
        stats: { offerings: off ? off.rows.length : 0, periods, files: Object.keys(local).length },
        issues,
        log,
        canGenerate: !issues.some((i) => i.severity === 'error'),
    }
}


const DONE = ['done', 'completed', 'complete', 'success', 'finished']
const FAIL = ['failed', 'error', 'infeasible']

function normJob(j) {
    const s = String(j.status || '').toLowerCase()
    const status = DONE.includes(s) ? 'done' : FAIL.includes(s) ? 'failed' : 'running'
    const gap =
        j.objective != null && j.bound != null
            ? Math.abs(j.objective - j.bound) / Math.max(Math.abs(j.objective), 1)
            : j.gap
    const reasons = (j.culprits || []).map((c) => (typeof c === 'string' ? c : c.message || JSON.stringify(c)))
    return { ...j, status, gap, bestSoFar: j.objective, message: j.error, reasons }
}

const normSchedule = (r) => (Array.isArray(r) ? { items: r } : r)

export const api = {

    async startJob({ sessionId, timeLimitSec, method, seed = 42, workers = 8, weights }) {
        if (MOCK) {
            await sleep(300)
            mockJob = { start: Date.now(), timeLimitSec, method }
            return { jobId: 'mock-job-1' }
        }
        return (await http.post('/generate', { sessionId, method, timeLimitSec, seed, workers, weights })).data
    },

    async getJob(jobId) {
        if (MOCK) {
            await sleep(100)
            const elapsedSec = (Date.now() - mockJob.start) / 1000
            const total = Math.min(mockJob.timeLimitSec, 8) // mock จบเร็วสุด 8 วิ
            if (elapsedSec < total) {
                return { status: 'running', elapsedSec, bestSoFar: Math.round(400 - 300 * (elapsedSec / total)) }
            }
            if (MOCK_INFEASIBLE) {
                return {
                    status: 'failed', solverStatus: 'INFEASIBLE', elapsedSec: total,
                    message: 'ไม่สามารถจัดตารางให้ครบทุกรายการได้',
                    reasons: ['ครู T04 มีคาบที่ต้องสอนมากกว่า max_periods_per_week', 'รายการ O021 (3 คาบ) ไม่มีห้อง COMPUTER ว่างพอ'],
                }
            }
            return {
                status: 'done', solverStatus: mockJob.method === 'cpsat' ? 'OPTIMAL' : 'FEASIBLE',
                elapsedSec: total, objective: 100, bestSoFar: 100, gap: 0.04,
                config: { seed: 42, timeLimit: mockJob.timeLimitSec },
            }
        }
        return normJob((await http.get(`/jobs/${jobId}`)).data)
    },
    async schedule(sessionId, method = 'cpsat') {
        if (MOCK) {
            await sleep(500)
            return { items: MOCK_SCHEDULE }
        }
        return normSchedule((await http.get(`/schedule/${sessionId}`, { params: { method } })).data)
    },

    // local = ข้อมูลที่แก้ในเบราว์เซอร์ (ใช้เฉพาะโหมด mock; โหมดจริงรอ P2: PUT /api/files แล้วค่อย validate)
    async validate(sessionId, local) {
        if (MOCK) {
            await sleep(600)
            if (local && local['offerings.csv'] && local['teachers.csv']) return mockValidateLocal(local)
            // ไม่มีไฟล์ในเบราว์เซอร์ → ใช้ข้อมูลจำลองตายตัว
            return {
                stats: { offerings: 63, periods: 126, files: 10 },
                issues: [
                    { severity: 'error', file: 'offerings.csv', row: 12, column: 'teacher_id', message: 'ไม่พบรหัสครู T99 ใน teachers.csv', suggestion: 'ตรวจรหัสครูให้ตรงกับ teachers.csv' },
                    { severity: 'warning', file: 'rooms.csv', row: 5, column: 'capacity', message: 'ความจุผิดปกติ (999)', suggestion: 'ตรวจความจุห้อง' },
                    { severity: 'warning', file: 'teacher_blocks.csv', row: 9, column: 'period', message: 'คาบอยู่นอกช่วง 1–8', suggestion: 'แก้ค่าเป็น 1–8' },
                ],
                log: [
                    { file: 'offerings.csv', row: 8, column: 'teacher_id', before: ' t03 ', after: 'T03', rule: 'trim + UPPERCASE' },
                    { file: 'rooms.csv', row: 3, column: 'room_type', before: 'COM', after: 'COMPUTER', rule: 'แปลงชื่อย่อประเภทห้อง' },
                    { file: 'groups.csv', row: 4, column: 'size', before: ' 02 ', after: '2', rule: 'แปลงเป็นจำนวนเต็ม' },
                ],
            }
        }
        const r = (await http.post('/validate', { sessionId })).data
        return { ...r, log: r.log ?? r.cleaningLog ?? [] }
    },
    cleanedUrl: (sid, file) => `/api/cleaned/${sid}/${file}`,
    solutionUrl: (sid) => `/api/export/${sid}/solution.csv`,
    reportUrl: (sid) => `/api/export/${sid}/report.md`,
    cleaningLogUrl: (sid) => `/api/cleaning-log/${sid}`,
    async compare(sid) { return (await http.get(`/compare/${sid}`)).data },
    async report(sid) {
        if (MOCK) {
            await sleep(400)
            const hardChecks = {}
            for (let i = 1; i <= 12; i++) hardChecks['c' + String(i).padStart(2, '0')] = { pass: true, violations: 0 }
            return { valid: true, hardChecks, softMetrics: { teacherGaps: 12, groupMaxPerDay: 6, solveTimeSec: 8.0 } }
        }
        return (await http.get(`/report/${sid}`)).data
    },
    async health() { return (await http.get('/health')).data },
    async upload(files) {
        if (MOCK) {
            await sleep(800)
            return { sessionId: 'mock-session-1' }
        }
        const fd = new FormData()
        files.forEach((f) => fd.append('files', f, f.name))
        return (await http.post('/upload', fd)).data
    },
}
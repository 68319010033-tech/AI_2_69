import axios from 'axios'

const MOCK = true
const http = axios.create({ baseURL: '/api' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

export const api = {
    async schedule(sessionId) {
        if (MOCK) {
            await sleep(500)
            return MOCK_SCHEDULE
        }
        return (await http.get(`/schedule/${sessionId}`)).data
    },
    async validate(sessionId) {
        if (MOCK) {
            await sleep(1000)
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
        return (await http.post('/validate', { sessionId })).data
    },
    cleanedUrl: (sessionId, file) => `/api/cleaned/${sessionId}/${file}`,
    async upload(files) {
        if (MOCK) {
            await sleep(800)
            return { sessionId: 'mock-session-1' }
        }
        const fd = new FormData()
        files.forEach((f) => fd.append('files', f))
        return (await http.post('/upload', fd)).data
    },
}
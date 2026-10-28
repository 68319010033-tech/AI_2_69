import axios from 'axios'

const MOCK = true
const http = axios.create({ baseURL: '/api' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export const api = {

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
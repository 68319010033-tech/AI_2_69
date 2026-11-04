export const FILE_LABELS = {
    groups: 'กลุ่มเรียน', teachers: 'ครูผู้สอน', rooms: 'ห้องเรียน', courses: 'รายวิชา',
    offerings: 'รายการสอน', timeslots: 'ช่วงเวลา', teacher_blocks: 'เวลาที่ครูไม่ว่าง',
    room_blocks: 'เวลาปิดห้อง', fixed_sessions: 'คาบเรียนที่กำหนดไว้', shared_students: 'นักเรียนร่วมกลุ่ม',
}
export const COLUMN_LABELS = {
    group_id: 'รหัสกลุ่ม', group_name: 'ชื่อกลุ่ม', size: 'จำนวนนักเรียน', student_count: 'จำนวนนักเรียน',
    max_periods_per_day: 'คาบสูงสุดต่อวัน', max_periods_per_week: 'คาบสูงสุดต่อสัปดาห์',
    teacher_id: 'รหัสครู', teacher_name: 'ชื่อครู', room_id: 'รหัสห้อง', room_name: 'ชื่อห้อง',
    room_type: 'ประเภทห้อง', capacity: 'ความจุ', course_id: 'รหัสวิชา', course_name: 'ชื่อวิชา',
    offering_id: 'รหัสรายการสอน', periods: 'จำนวนคาบ', day: 'วัน', period: 'คาบ',
    start_period: 'คาบเริ่มต้น', start_time: 'เวลาเริ่ม', end_time: 'เวลาสิ้นสุด',
    group_a: 'กลุ่มที่หนึ่ง', group_b: 'กลุ่มที่สอง', shared_student_count: 'จำนวนนักเรียนร่วม',
}
export const normHeader = value => value.trim().toLowerCase().replace(/[\s-]+/g, '_')
export const templateHeader = (type, column) => type === 'groups' && column === 'size' ? 'student_count' : column

// Count separators only outside quoted cells on the first record.
export function detectDelimiter(text) {
    const counts = { ',': 0, ';': 0, '\t': 0 }
    let quoted = false
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (c === '"') {
            if (quoted && text[i + 1] === '"') i++
            else quoted = !quoted
        } else if (!quoted) {
            if (c === '\r' || c === '\n') break
            if (c in counts) counts[c]++
        }
    }
    return Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]
}

export function parseTable(text, delimiter = detectDelimiter(text)) {
    text = text.replace(/^\uFEFF/, '')
    if (text.includes('\uFFFD')) throw new Error('อ่านตัวอักษรไม่ได้ กรุณาบันทึกไฟล์เป็น UTF-8')
    const rows = []
    let row = [], cell = '', quoted = false, closed = false
    const endCell = () => { row.push(cell); cell = ''; closed = false }
    const endRow = () => { endCell(); if (row.some(value => value.trim() !== '')) rows.push(row); row = [] }
    for (let i = 0; i < text.length; i++) {
        const c = text[i]
        if (quoted) {
            if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
            else if (c === '"') { quoted = false; closed = true }
            else cell += c
        } else if (c === delimiter) endCell()
        else if (c === '\n' || c === '\r') {
            if (c === '\r' && text[i + 1] === '\n') i++
            endRow()
        } else if (c === '"' && cell === '' && !closed) quoted = true
        else if (closed || c === '"') throw new Error('รูปแบบเครื่องหมายคำพูดในไฟล์ไม่ถูกต้อง')
        else cell += c
    }
    if (quoted) throw new Error('รูปแบบ CSV ไม่ถูกต้อง: มีเครื่องหมายคำพูดที่ยังไม่ปิด')
    if (cell !== '' || row.length || closed) endRow()
    const [header = [], ...data] = rows
    const headers = header.map(value => value.trim())
    if (!headers.length || headers.some(value => !value)) throw new Error('ไม่พบหัวคอลัมน์ หรือมีหัวคอลัมน์ว่าง')
    // Match the server's Firebase-safe keys to avoid overwritten values.
    const keys = headers.map(value => value.replace(/[.$#[\]/]/g, '_').toLowerCase())
    if (new Set(keys).size !== keys.length) throw new Error('หัวคอลัมน์ซ้ำกัน กรุณาตั้งชื่อให้ไม่ซ้ำ')
    for (const values of data) {
        if (values.length > headers.length) throw new Error('ข้อมูลมีคอลัมน์เกินหัวตาราง กรุณาตรวจตัวคั่นหรือเครื่องหมายคำพูด')
        while (values.length < headers.length) values.push('')
    }
    return { headers, data, delimiter }
}

export function suggestMapping(spec, headers) {
    return Object.fromEntries(Object.entries(spec.cols).map(([column, def]) => {
        const matches = headers.flatMap((header, index) =>
            [column, ...def.aliases].includes(normHeader(header)) ? [index] : [])
        return [column, matches.length === 1 ? matches[0] : -1]
    }))
}

export function suggestType(schema, headers, filename = '') {
    const candidates = Object.entries(schema).flatMap(([type, spec]) => {
        const mapping = suggestMapping(spec, headers)
        const required = Object.entries(spec.cols).filter(([, def]) => def.required).map(([column]) => mapping[column])
        const matched = Object.values(mapping).filter(index => index >= 0)
        if (required.some(index => index < 0) || new Set(matched).size !== matched.length) return []
        return [{ type, score: matched.length }]
    })
    const named = filename.trim().replace(/\.(csv|tsv|txt)$/i, '').toLowerCase()
    if (schema[named]) {
        if (!candidates.length || candidates.some(candidate => candidate.type === named)) return named
        return '' // Filename and recognizable columns disagree; ask the user.
    }
    const best = candidates.filter(candidate => candidate.score === Math.max(...candidates.map(item => item.score)))
    return best.length === 1 ? best[0].type : ''
}

export function mapTable(type, spec, source, mapping) {
    const columns = Object.keys(spec.cols)
    const used = new Set()
    for (const column of columns) {
        const index = mapping[column]
        if (index === -1 && !spec.cols[column].required) continue
        if (!Number.isInteger(index) || index < 0 || index >= source.headers.length) {
            throw new Error(`กรุณาจับคู่คอลัมน์ ${COLUMN_LABELS[column] || column}`)
        }
        if (used.has(index)) throw new Error('คอลัมน์ต้นทางหนึ่งคอลัมน์จับคู่ได้เพียงครั้งเดียว')
        used.add(index)
    }
    const selected = columns.filter(column => mapping[column] >= 0)
    const extra = source.headers.map((header, index) => ({ header, index })).filter(item => !used.has(item.index))
    const headers = [...selected.map(column => templateHeader(type, column)), ...extra.map(item => item.header)]
    const keys = headers.map(normHeader)
    if (new Set(keys).size !== keys.length) throw new Error('คอลัมน์ที่ไม่ได้จับคู่มีชื่อซ้ำกับคอลัมน์ปลายทาง กรุณาแก้หัวตารางต้นฉบับ')
    return { headers, data: source.data.map(row => [...selected.map(column => row[mapping[column]] ?? ''), ...extra.map(item => row[item.index] ?? '')]) }
}

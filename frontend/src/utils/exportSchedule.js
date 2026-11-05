import { locale, t as tr } from '../i18n.js'
import Papa from 'papaparse'
import ExcelJS from 'exceljs'

export const DAYS = [['MON', 'จันทร์'], ['TUE', 'อังคาร'], ['WED', 'พุธ'], ['THU', 'พฤหัสบดี'], ['FRI', 'ศุกร์']]
export const TIMES = ['08.00–09.00', '09.00–10.00', '10.00–11.00', '11.00–12.00',
  '13.00–14.00', '14.00–15.00', '15.00–16.00', '16.00–17.00']

// ---------- โหลดและ join ข้อมูล ----------
// ถ้าชื่อคอลัมน์ใน CSV จริงต่างจากนี้ ให้เพิ่มชื่อที่ถูกต้องในลิสต์ของ pick(...) ด้านล่าง
const pick = (row, keys, fallback = '') => {
  for (const k of keys) if (row?.[k] !== undefined && row[k] !== '') return row[k]
  return fallback
}

export const parseCsv = (text) =>
  Papa.parse(text.replace(/^\ufeff/, ''), {
    header: true, skipEmptyLines: true, transformHeader: (h) => h.trim(),
  }).data

const index = (rows, key) => Object.fromEntries(rows.map((r) => [String(r[key] ?? '').trim(), r]))

export function joinSessions({ solution, offerings, courses, teachers, groups, rooms }) {
  const off = index(offerings, 'offering_id')
  const crs = index(courses, 'course_id')
  const tch = index(teachers, 'teacher_id')
  const grp = index(groups, 'group_id')
  const rm = index(rooms, 'room_id')

  return solution.map((s) => {
    const o = off[s.offering_id] ?? {}
    const course_id = pick(o, ['course_id'])
    const teacher_id = pick(o, ['teacher_id'])
    const group_id = pick(o, ['group_id'])
    const c = crs[course_id] ?? {}
    return {
      offering_id: s.offering_id,
      session_no: Number(s.session_no),
      day: s.day,
      start_period: Number(s.start_period),
      // จำนวนคาบของรายการสอนอยู่ใน offerings.csv (periods) · ถ้าไม่มีค่อยลองดูใน courses.csv
      length: Number(pick(o, ['periods'], pick(c, ['session_length', 'length'], 1))),
      course_id, course: pick(c, ['course_name', 'name', 'title'], course_id),
      teacher_id, teacher: pick(tch[teacher_id], ['teacher_name', 'name'], teacher_id),
      group_id, group: pick(grp[group_id], ['group_name', 'name'], group_id),
      room_id: s.room_id, room: pick(rm[s.room_id], ['room_name', 'name'], s.room_id),
    }
  })
}

// ดึงจาก endpoint ที่หน้า Export ใช้อยู่แล้ว (solution + ไฟล์ cleaned)
export async function loadExportData(api, sid) {
  const get = async (url) => {
    const r = await fetch(url)
    if (!r.ok) throw new Error(`โหลดไม่สำเร็จ: ${url}`)
    return r.text()
  }
  const names = ['offerings.csv', 'courses.csv', 'teachers.csv', 'groups.csv', 'rooms.csv']
  const [sol, ...rest] = await Promise.all([get(api.solutionUrl(sid)), ...names.map((f) => get(api.cleanedUrl(sid, f)))])
  const [offerings, courses, teachers, groups, rooms] = rest.map(parseCsv)
  return joinSessions({ solution: parseCsv(sol), offerings, courses, teachers, groups, rooms })
}

// ---------- ตัวช่วย ----------
const hueOf = (id) => 70 + (parseInt(String(id).replace(/\D/g, ''), 10) % 8 || 0) * 16

function hslHex(h, s, l) {
  s /= 100; l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  return [f(0), f(8), f(4)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('')
}

function groupBy(sessions, idKey, nameKey) {
  const m = new Map()
  for (const s of sessions) {
    if (!m.has(s[idKey])) m.set(s[idKey], { id: s[idKey], name: s[nameKey], list: [] })
    m.get(s[idKey]).list.push(s)
  }
  return [...m.values()].sort((a, b) => String(a.name).localeCompare(String(b.name), 'th'))
}

export const VIEWS = [
  { key: 'group', label: 'รายกลุ่ม', idKey: 'group_id', nameKey: 'group', second: (s) => `${s.teacher} · ${s.room}` },
  { key: 'teacher', label: 'รายครู', idKey: 'teacher_id', nameKey: 'teacher', second: (s) => `${s.group} · ${s.room}` },
  { key: 'room', label: 'รายห้อง', idKey: 'room_id', nameKey: 'room', second: (s) => `${s.group} · ${s.teacher}` },
]

// รายการที่เลือกพิมพ์ได้ในแต่ละมุมมอง: { group: [{ id, name, count }], teacher: [...], room: [...] }
export function listEntries(sessions) {
  return Object.fromEntries(
    VIEWS.map((v) => [v.key, groupBy(sessions, v.idKey, v.nameKey).map((e) => ({ id: e.id, name: e.name, count: e.list.length }))]),
  )
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- XLSX ----------
// แถวในตาราง: คาบ 1–4 = แถว 1–4, พักกลางวัน = แถว 5, คาบ 5–8 = แถว 6–9
const bodyRow = (p) => (p <= 4 ? p : p + 1)
const thin = { style: 'thin', color: { argb: 'FFD5E3DA' } }
const border = { top: thin, left: thin, bottom: thin, right: thin }

function writeGrid(ws, top, title, list, second) {
  ws.mergeCells(top, 1, top, 6)
  const t = ws.getCell(top, 1)
  t.value = title
  t.font = { bold: true, size: 14, color: { argb: 'FF123F28' } }
  ws.getRow(top).height = 26

  ;['คาบ', ...DAYS.map((d) => d[1])].forEach((h, i) => {
    const c = ws.getCell(top + 1, i + 1)
    c.value = tr(h)
    c.font = { bold: true, color: { argb: 'FF174E30' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFFAF2' } }
    c.alignment = { horizontal: 'center', vertical: 'middle' }
    c.border = border
  })

  for (let p = 1; p <= 8; p++) {
    const r = top + 1 + bodyRow(p)
    const c = ws.getCell(r, 1)
    c.value = `${tr('คาบ')} ${p}\n${TIMES[p - 1]}`
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = border
    ws.getRow(r).height = 48
    for (let col = 2; col <= 6; col++) ws.getCell(r, col).border = border
  }

  const lunch = top + 1 + 5
  ws.mergeCells(lunch, 1, lunch, 6)
  const lc = ws.getCell(lunch, 1)
  lc.value = tr('พักกลางวัน 12.00–13.00')
  lc.alignment = { horizontal: 'center', vertical: 'middle' }
  lc.font = { color: { argb: 'FF52695A' }, size: 10 }
  lc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F9F6' } }
  ws.getRow(lunch).height = 20

  for (const s of list) {
    const col = DAYS.findIndex((d) => d[0] === s.day) + 2
    if (col < 2) continue
    const r1 = top + 1 + bodyRow(s.start_period)
    const r2 = top + 1 + bodyRow(s.start_period + s.length - 1)
    if (r2 > r1) ws.mergeCells(r1, col, r2, col)
    const c = ws.getCell(r1, col)
    c.value = `${s.course}\n${second(s)}`
    c.alignment = { vertical: 'top', wrapText: true }
    c.font = { size: 11, color: { argb: 'FF14271C' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${hslHex(hueOf(s.course_id), 55, 88)}` } }
  }
  return top + 1 + 9 + 2 // เว้น 1 แถวก่อนตารางถัดไป
}

export async function buildXlsxBlob(sessions) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Smart Campus Scheduler'

  // ชีตรวม: ตารางรายการ กรองได้
  const all = wb.addWorksheet(tr('รายการทั้งหมด'), { views: [{ state: 'frozen', ySplit: 1 }] })
  all.columns = [
    { header: tr('วิชา'), key: 'course', width: 28 }, { header: tr('กลุ่ม'), key: 'group', width: 14 },
    { header: tr('ครู'), key: 'teacher', width: 20 }, { header: tr('ห้อง'), key: 'room', width: 18 },
    { header: tr('วัน'), key: 'day', width: 12 }, { header: tr('คาบเริ่ม'), key: 'start', width: 10 },
    { header: tr('จำนวนคาบ'), key: 'length', width: 11 }, { header: tr('เวลา'), key: 'time', width: 16 },
  ]
  const dayName = Object.fromEntries(DAYS)
  const order = Object.fromEntries(DAYS.map((d, i) => [d[0], i]))
  ;[...sessions]
    .sort((a, b) => order[a.day] - order[b.day] || a.start_period - b.start_period)
    .forEach((s) => all.addRow({
      course: s.course, group: s.group, teacher: s.teacher, room: s.room,
      day: tr(dayName[s.day] ?? s.day), start: s.start_period, length: s.length,
      time: `${TIMES[s.start_period - 1]?.slice(0, 5)}–${TIMES[s.start_period + s.length - 2]?.slice(6)}`,
    }))
  all.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  all.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1D7D47' } }
  all.autoFilter = { from: 'A1', to: 'H1' }

  // ชีตตารางรายกลุ่ม/ครู/ห้อง: วางตารางต่อกันในชีตเดียว
  for (const v of VIEWS) {
    const ws = wb.addWorksheet(tr(v.label))
    ws.columns = [{ width: 14 }, ...Array(5).fill({ width: 28 })]
    let top = 1
    for (const e of groupBy(sessions, v.idKey, v.nameKey)) top = writeGrid(ws, top, `${tr(v.label)}: ${e.name}`, e.list, v.second)
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

// ---------- PDF (เปิดหน้าต่างพิมพ์ แล้วเลือก "บันทึกเป็น PDF") ----------
const esc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))

function gridTable(list, second) {
  const startAt = {}
  const covered = new Set()
  for (const s of list) {
    startAt[s.day + s.start_period] = s
    for (let k = 1; k < s.length; k++) covered.add(s.day + (s.start_period + k))
  }
  let rows = ''
  for (let p = 1; p <= 8; p++) {
    if (p === 5) rows += `<tr class="lunch"><td colspan="6">${tr('พักกลางวัน 12.00–13.00')}</td></tr>`
    const cells = DAYS.map(([d]) => {
      const key = d + p
      if (covered.has(key)) return ''
      const s = startAt[key]
      if (!s) return '<td></td>'
      const bg = `hsl(${hueOf(s.course_id)} 55% 88%)`
      return `<td class="s" rowspan="${s.length}" style="background:${bg}"><b>${esc(s.course)}</b><br>${esc(second(s))}</td>`
    }).join('')
    rows += `<tr><th class="p">${tr('คาบ')} ${p}<br><small>${TIMES[p - 1]}</small></th>${cells}</tr>`
  }
  return `<table><thead><tr><th class="p">${tr('คาบ')}</th>${DAYS.map((d) => `<th>${tr(d[1])}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>`
}

// options:
//   selection: { group?: id[], teacher?: id[], room?: id[] }  ไม่ใส่ = พิมพ์ทั้งหมด · มุมมองที่ไม่อยู่ในนี้ = ข้าม
//   perPage:   1 = หน้าละ 1 ตาราง (A4 แนวนอน) · 2 = หน้าละ 2 ตาราง (A4 แนวตั้ง)
export function buildPrintHtml(sessions, title = 'ตารางเรียน', options = {}) {
  const { selection = null, perPage = 1 } = options
  const items = []
  for (const v of VIEWS) {
    const ids = selection ? selection[v.key] : null
    if (selection && !ids) continue
    const allow = ids ? new Set(ids.map(String)) : null
    for (const e of groupBy(sessions, v.idKey, v.nameKey)) {
      if (allow && !allow.has(String(e.id))) continue
      const total = e.list.reduce((a, s) => a + s.length, 0)
      items.push(
        `<section><h2>${esc(e.name)} <small>${tr(v.label)} · ${total} ${tr('คาบ/สัปดาห์')}</small></h2>${gridTable(e.list, v.second)}</section>`,
      )
    }
  }
  if (!items.length) throw new Error(tr('ยังไม่ได้เลือกตารางที่จะพิมพ์'))

  const n = perPage === 2 ? 2 : 1
  const pages = []
  for (let i = 0; i < items.length; i += n) pages.push(`<div class="page">${items.slice(i, i + n).join('')}</div>`)
  const portrait = n === 2

  return `<!doctype html><html lang="${locale.value}"><head><meta charset="utf-8"><title>${esc(tr(title))}</title><style>
@page { size: A4 ${portrait ? 'portrait' : 'landscape'}; margin: ${portrait ? '10mm' : '12mm'} }
body { font-family: "Leelawadee UI", Tahoma, "Noto Sans Thai", sans-serif; color: #14271c; margin: 0 }
.page { display: flex; flex-direction: column; gap: ${portrait ? '9mm' : '0'}; page-break-after: always; break-after: page }
.page:last-child { page-break-after: auto; break-after: auto }
section { break-inside: avoid }
h2 { margin: 0 0 ${portrait ? '5px' : '8px'}; font-size: ${portrait ? '15px' : '18px'}; color: #123f28 } h2 small { font-size: 11px; color: #52695a; font-weight: 400 }
table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: ${portrait ? '10px' : '11px'} }
th, td { border: 1px solid #cfe0d5; padding: ${portrait ? '3px 5px' : '4px 6px'}; vertical-align: top; text-align: left }
thead th { background: #effaf2; color: #174e30; text-align: center }
th.p { width: ${portrait ? '58px' : '70px'}; text-align: center; background: #fff; font-weight: 600 } th.p small { font-weight: 400; color: #52695a }
td { height: ${portrait ? '40px' : '52px'} } td.s { border-left: 3px solid #1d7d47 }
tr.lunch td { height: 16px; text-align: center; background: #f5f9f6; color: #52695a; font-size: 10px }
</style></head><body>${pages.join('')}</body></html>`
}

export function printPdf(sessions, title, options) {
  const html = buildPrintHtml(sessions, title, options) // โยน error ก่อนสร้าง iframe ถ้าไม่ได้เลือกอะไร
  const iframe = document.createElement('iframe')
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(iframe)
  const doc = iframe.contentDocument
  doc.open(); doc.write(html); doc.close()
  const cleanup = () => setTimeout(() => iframe.remove(), 500)
  iframe.contentWindow.onafterprint = cleanup
  setTimeout(() => { iframe.contentWindow.focus(); iframe.contentWindow.print() }, 300)
}
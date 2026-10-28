<script setup>
import { computed, nextTick, ref, watch } from 'vue'
import { useSessionStore, REQUIRED_FILES } from '@/stores/session'
import { ROW_OFFSET } from '@/api'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import SnapshotMenu from '@/components/SnapshotMenu.vue'

const props = defineProps({
    file: { type: String, default: '' },     // ไฟล์ที่เลือกอยู่ (ใช้ร่วมกับ @update:file)
    focus: { type: Object, default: null },  // { file, row, column, nonce } สั่งให้กระโดดไปช่องที่มีปัญหา
})
const emit = defineEmits(['update:file'])

const store = useSessionStore()
const root = ref(null)
const flash = ref('')

const names = computed(() => REQUIRED_FILES.filter((n) => store.drafts[n]))
const current = computed(() => (names.value.includes(props.file) ? props.file : names.value[0] || ''))
const draft = computed(() => store.drafts[current.value])
const summary = computed(() => store.editSummary(current.value))

// จำนวนปัญหาต่อไฟล์ (ไว้แสดงเป็นป้ายบนแท็บ)
const countsByFile = computed(() => {
    const m = {}
    for (const i of store.issues) {
        const c = (m[i.file] ||= { error: 0, warning: 0 })
        c[i.severity] = (c[i.severity] || 0) + 1
    }
    return m
})

// แปลงรายการปัญหา → ตำแหน่งช่อง/แถวในไฟล์ที่เปิดอยู่
const marks = computed(() => {
    const cols = new Map() // "r:c" -> issue
    const rowSev = new Map() // r -> severity สูงสุดของแถว
    const d = draft.value
    if (!d) return { cols, rowSev }
    const hdr = d.headers.map((h) => h.trim().toLowerCase())
    const rank = { error: 2, warning: 1 }
    for (const i of store.issues) {
        if (i.file !== current.value) continue
        const r = Number(i.row) - ROW_OFFSET
        if (!(r >= 0)) continue
        const c = hdr.indexOf(String(i.column || '').trim().toLowerCase())
        if (c >= 0) {
            const old = cols.get(`${r}:${c}`)
            if (!old || rank[i.severity] > rank[old.severity]) cols.set(`${r}:${c}`, i)
        }
        const oldSev = rowSev.get(r)
        if (!oldSev || rank[i.severity] > rank[oldSev]) rowSev.set(r, i.severity)
    }
    return { cols, rowSev }
})

const isDirty = (row, c) => row.o !== null && row.cells[c] !== draft.value.original[row.o][c]

function cellClass(r, c, row) {
    const m = marks.value.cols.get(`${r}:${c}`)
    let tone = 'border-transparent hover:border-slate-300'
    if (isDirty(row, c)) tone = 'border-sky-300 bg-sky-50'          // แก้แล้ว (มาก่อนสีปัญหา เพราะปัญหาอาจถูกแก้แล้วแต่ยังไม่ตรวจซ้ำ)
    else if (m?.severity === 'error') tone = 'border-red-300 bg-red-50 text-red-700'
    else if (m) tone = 'border-amber-300 bg-amber-50'
    if (flash.value === `${r}-${c}`) tone += ' ring-2 ring-primary-500 animate-pulse motion-reduce:animate-none'
    return [
        'h-8 w-full min-w-[6.5rem] rounded-md border bg-transparent px-3 text-[13px] tabular-nums outline-none transition-colors',
        'focus:border-primary-500 focus:bg-white focus:ring-2 focus:ring-primary-500/30',
        tone,
    ]
}

function cellTitle(r, c, row) {
    const parts = []
    if (isDirty(row, c)) parts.push(`ค่าเดิม: "${draft.value.original[row.o][c]}"`)
    const m = marks.value.cols.get(`${r}:${c}`)
    if (m) parts.push(`${m.severity === 'error' ? 'Error' : 'Warning'}: ${m.message}`)
    return parts.join('\n')
}

// แถบสีด้านซ้ายของแถว: ปัญหา > แถวใหม่ > ปกติ
function rowBar(r, row) {
    const s = marks.value.rowSev.get(r)
    if (s === 'error') return 'border-l-err'
    if (s === 'warning') return 'border-l-warn'
    if (row.o === null) return 'border-l-primary-500'
    return 'border-l-transparent'
}
const rowBg = (row, r) => (row.o === null ? 'bg-primary-50' : r % 2 ? 'bg-slate-100' : 'bg-white')
const rowText = (r) => {
    const s = marks.value.rowSev.get(r)
    return s === 'error' ? 'font-bold text-err' : s === 'warning' ? 'font-bold text-warn' : 'text-slate-500'
}

// ---------- actions ----------
function onChange(r, c, e) {
    store.setCell(current.value, r, c, e.target.value)
}

function onEnter(r, c) {
    root.value?.querySelector(`[data-cell="${r + 1}-${c}"]`)?.focus()
}

// กล่องยืนยันในแอป (แทน confirm() ของเบราว์เซอร์)
const dialog = ref(null)
let pending = null
function ask(opts, action) {
    dialog.value = opts
    pending = action
}
function runDialog() {
    const fn = pending
    dialog.value = null
    pending = null
    fn?.()
}
function closeDialog() {
    dialog.value = null
    pending = null
}

function onDelete(r) {
    const file = current.value
    if (file !== 'offerings.csv') return store.deleteRow(file, r)
    const id = draft.value.rows[r]?.cells[0] || `แถว ${r + ROW_OFFSET}`
    ask(
        {
            title: `ลบรายการ ${id}?`,
            message: 'โจทย์ห้ามลดจำนวนรายการหรือคาบเพื่อให้ผ่านเงื่อนไข ลบได้เฉพาะแถวที่ซ้ำหรือผิดจริงเท่านั้น\nกด "ย้อนกลับ" เพื่อเอาคืนได้ภายหลัง',
            confirmText: 'ลบแถว',
            danger: true,
        },
        () => store.deleteRow(file, r),
    )
}

function onReset() {
    const file = current.value
    ask(
        {
            title: `คืนค่าเดิมทั้งไฟล์ ${file}?`,
            message: `การแก้ไขทั้งหมด ${summary.value.total} รายการในไฟล์นี้จะถูกยกเลิก\nกด "ย้อนกลับ" เพื่อเอาคืนได้ภายหลัง`,
            confirmText: 'คืนค่าเดิม',
            danger: true,
        },
        () => store.resetFile(file),
    )
}

async function onAdd() {
    const idx = store.addRow(current.value)
    await nextTick()
    const el = root.value?.querySelector(`[data-cell="${idx}-0"]`)
    el?.scrollIntoView({ block: 'center' })
    el?.focus()
}

function download() {
    const blob = new Blob([store.csvOf(current.value)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = current.value
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// กระโดดไปช่องที่มีปัญหา (เรียกจากหน้า Validate เมื่อกดแถวปัญหา)
async function goFocus(f) {
    if (!f) return
    emit('update:file', f.file)
    await nextTick()
    await nextTick()
    const d = store.drafts[f.file]
    if (!d) return
    const r = Number(f.row) - ROW_OFFSET
    let c = d.headers.findIndex((h) => h.trim().toLowerCase() === String(f.column || '').trim().toLowerCase())
    if (c < 0) c = 0
    const el = root.value?.querySelector(`[data-cell="${r}-${c}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    el.focus({ preventScroll: true })
    el.select?.()
    flash.value = `${r}-${c}`
    setTimeout(() => { flash.value = '' }, 1800)
}
watch(() => props.focus, goFocus, { immediate: true })

const btn = 'inline-flex h-8 items-center gap-1.5 px-3 text-sm text-slate-700 transition-colors hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-transparent'
</script>

<template>
    <div ref="root">
        <div v-if="!names.length" class="flex flex-col items-center gap-3 py-10 text-center text-slate-400">
            <p>
                ไม่มีข้อมูลไฟล์ในเบราว์เซอร์
                <RouterLink to="/upload" class="ml-1 font-semibold text-primary-600 hover:underline">← กลับไปอัปโหลด
                </RouterLink>
            </p>
            <SnapshotMenu v-if="store.snapshots.length" />
        </div>

        <template v-else>
            <!-- แท็บไฟล์ -->
            <div class="flex flex-wrap gap-1.5" role="tablist">
                <button v-for="n in names" :key="n" role="tab" :aria-selected="n === current"
                    class="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                    :class="n === current ? 'bg-primary-600 font-semibold text-white' : 'bg-slate-100 text-slate-600 hover:bg-primary-50 hover:text-primary-700'"
                    @click="emit('update:file', n)">
                    {{ n.replace('.csv', '') }}
                    <span v-if="countsByFile[n]?.error"
                        class="min-w-[1.25rem] rounded-full bg-err px-1.5 text-center text-[11px] font-semibold leading-5 text-white">{{
                            countsByFile[n].error }}</span>
                    <span v-if="countsByFile[n]?.warning"
                        class="min-w-[1.25rem] rounded-full bg-warn px-1.5 text-center text-[11px] font-semibold leading-5 text-white">{{
                            countsByFile[n].warning }}</span>
                    <span v-if="store.editSummary(n).total" class="h-2 w-2 rounded-full bg-sky-400 ring-2"
                        :class="n === current ? 'ring-primary-600' : 'ring-slate-100'" title="มีการแก้ไข" />
                </button>
            </div>

            <!-- แถบเครื่องมือ -->
            <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <div
                    class="inline-flex divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <button :class="btn" :disabled="!store.canUndo(current)" title="ย้อนกลับ"
                        @click="store.undo(current)">
                        <AppIcon name="undo" />ย้อนกลับ
                    </button>
                    <button :class="btn" :disabled="!store.canRedo(current)" title="ทำซ้ำ" @click="store.redo(current)">
                        <AppIcon name="redo" />ทำซ้ำ
                    </button>
                </div>
                <button
                    class="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary-600 px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                    @click="onAdd">
                    <AppIcon name="plus" />เพิ่มแถว
                </button>
                <div
                    class="inline-flex divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <button :class="btn" :disabled="!summary.total" @click="onReset">
                        <AppIcon name="reset" />คืนค่าเดิม
                    </button>
                    <button :class="btn" @click="download">
                        <AppIcon name="download" />CSV ที่แก้แล้ว
                    </button>
                </div>


                <SnapshotMenu />
                <!-- สถานะ -->
                <div class="ml-auto flex flex-wrap items-center gap-1.5 text-xs">
                    <span class="text-slate-500">{{ draft.rows.length }} แถว</span>
                    <template v-if="summary.total">
                        <span v-if="summary.cells"
                            class="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700">แก้ {{ summary.cells }}
                            ช่อง</span>
                        <span v-if="summary.added"
                            class="rounded-full bg-primary-50 px-2 py-0.5 font-medium text-primary-700">เพิ่ม {{
                                summary.added }}</span>
                        <span v-if="summary.deleted" class="rounded-full bg-red-50 px-2 py-0.5 font-medium text-err">ลบ
                            {{ summary.deleted }}</span>
                        <span class="inline-flex items-center gap-1 text-ok">
                            <AppIcon name="check" class="h-3.5 w-3.5" />บันทึกร่างแล้ว
                        </span>
                    </template>
                    <span v-else class="text-slate-400">ยังไม่มีการแก้ไข</span>
                </div>
            </div>

            <div v-if="current === 'offerings.csv'"
                class="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-800">
                <AppIcon name="alert" class="mt-0.5 h-3.5 w-3.5" />
                <span>โจทย์ห้ามสร้างรายการสอนขึ้นเอง และห้ามลดจำนวนคาบเพื่อให้ผ่านเงื่อนไข —
                    แก้เฉพาะค่าที่ผิดหรือพิมพ์ผิด</span>
            </div>

            <!-- ตาราง -->
            <div class="mt-3 max-h-[32rem] overflow-auto rounded-xl border border-slate-200 bg-white">
                <table class="min-w-full border-separate border-spacing-0 text-sm">
                    <thead>
                        <tr>
                            <th
                                class="sticky left-0 top-0 z-20 w-20 border-b border-primary-100 bg-primary-50 px-3 py-2.5 text-left text-xs font-semibold text-primary-700">
                                แถว</th>
                            <th v-for="(h, c) in draft.headers" :key="c"
                                class="sticky top-0 z-10 whitespace-nowrap border-b border-primary-100 bg-primary-50 px-[17px] py-2.5 text-left text-xs font-semibold text-primary-700">
                                {{ h }}</th>
                            <th class="sticky top-0 z-10 w-10 border-b border-primary-100 bg-primary-50" />
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(row, r) in draft.rows" :key="row.id"
                            class="group hover:bg-primary-100/60 focus-within:bg-primary-100/60" :class="rowBg(row, r)">
                            <td class="sticky left-0 z-[1] whitespace-nowrap border-b border-r border-l-4 border-b-slate-200 border-r-slate-200 px-2.5 py-1 text-xs tabular-nums group-focus-within:bg-primary-100 group-hover:bg-primary-100"
                                :class="[rowBar(r, row), rowBg(row, r), rowText(r)]">
                                {{ r + ROW_OFFSET }}
                                <span v-if="row.o === null"
                                    class="ml-1 rounded bg-primary-600 px-1 py-px text-[10px] font-semibold text-white">ใหม่</span>
                            </td>
                           <td v-for="(h, c) in draft.headers" :key="c" class="border-b border-r border-slate-200 px-1 py-1">
                                <input :value="row.cells[c]" :data-cell="`${r}-${c}`" :class="cellClass(r, c, row)"
                                    :title="cellTitle(r, c, row)" :aria-label="`${h} แถว ${r + ROW_OFFSET}`"
                                    spellcheck="false" autocomplete="off" @change="onChange(r, c, $event)"
                                    @keydown.enter="onEnter(r, c)" />
                            </td>
                            <td class="border-b border-slate-200 px-1 text-center">
                                <button
                                    class="rounded-md p-1.5 text-slate-300 opacity-0 transition hover:bg-red-50 hover:text-err focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-err group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                                    title="ลบแถวนี้" aria-label="ลบแถวนี้" @click="onDelete(r)">
                                    <AppIcon name="x" />
                                </button>
                            </td>
                        </tr>
                        <tr v-if="!draft.rows.length">
                            <td :colspan="draft.headers.length + 2" class="px-3 py-10 text-center text-slate-400">
                                ไม่มีแถวข้อมูล กด
                                "เพิ่มแถว" เพื่อเริ่มต้น</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <!-- คำอธิบายสี -->
            <div class="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                <span class="inline-flex items-center gap-1.5"><span
                        class="h-3 w-3 rounded border border-sky-300 bg-sky-50" />แก้แล้ว (ชี้เมาส์ดูค่าเดิม)</span>
                <span class="inline-flex items-center gap-1.5"><span
                        class="h-3 w-3 rounded border border-red-300 bg-red-50" />Error</span>
                <span class="inline-flex items-center gap-1.5"><span
                        class="h-3 w-3 rounded border border-amber-300 bg-amber-50" />Warning</span>
                <span class="text-slate-400">Enter = ลงช่องล่าง · แก้เสร็จแล้วกด "ตรวจซ้ำ"</span>
            </div>
        </template>

        <ConfirmDialog :open="!!dialog" :title="dialog?.title" :message="dialog?.message"
            :confirm-text="dialog?.confirmText" :danger="dialog?.danger" @confirm="runDialog" @cancel="closeDialog" />
    </div>
</template>
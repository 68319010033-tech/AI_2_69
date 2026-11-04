<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore, REQUIRED_FILES } from '@/stores/session'
import DataInputPanel from '@/components/DataInputPanel.vue'
import { COLUMN_LABELS, normHeader } from '@/lib/inputFormat'

const store = useSessionStore()
const router = useRouter()
const dragging = ref(false)
const input = ref(null)
const schema = ref({})
const DAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI']
const ROOM_TYPES = ['GENERAL', 'COMPUTER', 'NETWORK', 'MEDIA']
function columnDefinition(header) {
    const cols = schema.value[active.value.replace('.csv', '')]?.cols || {}
    return Object.entries(cols).find(([name, definition]) => [name, ...definition.aliases].includes(normHeader(header || '')))
}
function choices(header) {
    const type = columnDefinition(header)?.[1].type
    return type === 'day' ? DAYS : type === 'roomtype' ? ROOM_TYPES : null
}
let refreshTimer
function refreshLatest() {
    if (document.visibilityState !== 'visible' || document.activeElement?.tagName === 'TEXTAREA') return
    store.refreshLatest()
}
onMounted(() => {
    refreshLatest()
    refreshTimer = setInterval(refreshLatest, 15000)
    window.addEventListener('focus', refreshLatest)
    document.addEventListener('visibilitychange', refreshLatest)
})
onUnmounted(() => {
    clearInterval(refreshTimer)
    window.removeEventListener('focus', refreshLatest)
    document.removeEventListener('visibilitychange', refreshLatest)
})

// พรีวิวตาราง
const LIMIT = 100
const active = ref('')
const search = ref('')
const page = ref(1)
const uploaded = computed(() => REQUIRED_FILES.filter((n) => store.files[n]))
watch(
    uploaded,
    (list) => { if (!list.includes(active.value)) active.value = list[0] || '' },
    { immediate: true },
)
const current = computed(() => store.files[active.value])
const filtered = computed(() => {
    const t = search.value.trim().toLowerCase()
    const all = (current.value?.data || []).map((r, i) => ({ n: i + 2, r })) // n = เลขบรรทัดในไฟล์
    return t ? all.filter((x) => x.r.some((c) => c.toLowerCase().includes(t))) : all
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / LIMIT)))
const visibleRows = computed(() => filtered.value.slice((page.value - 1) * LIMIT, page.value * LIMIT))
watch([active, search], () => { page.value = 1 })
watch(pageCount, (count) => { page.value = Math.min(page.value, count) })
function addRow() {
    search.value = ''
    store.addRow(active.value)
    page.value = Math.max(1, Math.ceil(current.value.rows / LIMIT))
}

function onDrop(e) {
    dragging.value = false
    store.addFiles(e.dataTransfer.files)
}
function onPick(e) {
    store.addFiles(e.target.files)
    e.target.value = ''
}
async function next() {
    if (await store.upload()) router.push('/validate')
}
</script>

<template>
    <div class="mx-auto max-w-5xl p-6 md:p-10">
        <h1 class="text-2xl font-bold text-primary-700">① อัปโหลดข้อมูล</h1>
        <p class="mt-1 text-slate-500">ลากไฟล์ CSV ทั้ง 10 ไฟล์มาวางพร้อมกันได้เลย ระบบจับคู่จากชื่อไฟล์ให้อัตโนมัติ</p>
        <div class="mt-3 rounded-lg bg-primary-50 p-3 text-sm" role="status" aria-live="polite">
            <p>{{ store.draftStatus || 'บันทึกฉบับร่างอัตโนมัติในเบราว์เซอร์นี้เมื่อแก้ไขข้อมูล' }}</p>
            <p v-if="store.dirty">มีการแก้ไขที่ยังไม่ได้ส่งไปยังเซิร์ฟเวอร์</p>
            <p :class="store.remoteAvailable ? 'text-amber-700' : 'text-slate-500'">
                {{ store.refreshStatus || 'ตรวจหาข้อมูลล่าสุดทุก 15 วินาที และเมื่อกลับมาที่หน้านี้' }}
            </p>
        </div>
        <DataInputPanel @select="active = $event; search = ''" @schema="schema = $event" />

        <div class="mt-6 grid gap-6 md:grid-cols-5">
            <!-- Dropzone -->
            <div class="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition md:col-span-3"
                :class="dragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-primary-500 hover:bg-primary-50'"
                @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"
                @click="!store.editingLocked && input.click()">
                <div class="text-5xl">📂</div>
                <p class="mt-3 font-semibold">ลากไฟล์มาวางที่นี่</p>
                <p class="text-sm text-slate-500">หรือคลิกเพื่อเลือกไฟล์ (เลือกได้หลายไฟล์)</p>
                <input ref="input" type="file" accept=".csv" multiple class="hidden" :disabled="store.editingLocked" @change="onPick" />
            </div>

            <!-- Checklist -->
            <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
                <div class="mb-2 flex items-center justify-between">
                    <h2 class="font-semibold">ไฟล์ที่ต้องมี</h2>
                    <span class="rounded-full bg-primary-100 px-2 py-0.5 text-sm text-primary-700">
                        {{ REQUIRED_FILES.length - store.missing.length }}/{{ REQUIRED_FILES.length }}
                    </span>
                </div>
                <ul class="divide-y divide-slate-100">
                    <li v-for="name in REQUIRED_FILES" :key="name" class="flex items-center gap-2 py-1.5 text-sm">
                        <span>{{ store.files[name] ? '✅' : '⚪' }}</span>
                        <span :class="store.files[name] ? 'text-slate-800' : 'text-slate-400'">{{ name }}</span>
                        <span v-if="store.files[name]" class="ml-auto text-slate-500">{{ store.files[name].rows }}
                            แถว</span>
                        <button v-if="store.files[name]" class="text-slate-400 hover:text-err" title="ลบไฟล์"
                            :disabled="store.editingLocked" @click="store.removeFile(name)">✕</button>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Preview -->
        <div v-if="uploaded.length" class="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div class="flex flex-wrap gap-1 border-b border-slate-200 p-2">
                <button v-for="n in uploaded" :key="n" class="rounded-lg px-3 py-1.5 text-sm transition"
                    :class="n === active ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
                    @click="active = n; search = ''">
                    {{ n }}
                </button>
            </div>

            <div class="flex items-center justify-between gap-3 p-3">
                <span class="text-sm text-slate-500">
                    {{ current?.rows }} แถว · {{ current?.headers.length }} คอลัมน์
                    · พบ {{ filtered.length }} แถว
                </span>
                <input v-model="search" type="search" placeholder="ค้นหาในไฟล์นี้…"
                    class="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none" />
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
                <p class="text-sm text-slate-500">แก้ไขข้อมูลในช่องได้เลย จากนั้นกด “บันทึกและตรวจสอบข้อมูล” เพื่อส่งข้อมูลไปยังเซิร์ฟเวอร์</p>
                <button class="rounded-lg border border-primary-300 px-3 py-1.5 text-sm text-primary-700 disabled:opacity-50"
                    :disabled="store.editingLocked" @click="addRow">+ เพิ่มแถว</button>
            </div>
            <div class="max-h-96 overflow-auto">
                <table class="w-full text-left text-sm">
                    <thead class="sticky top-0 bg-primary-50 text-primary-700">
                        <tr>
                            <th class="px-3 py-2 text-right text-slate-400">#</th>
                            <th v-for="h in current?.headers" :key="h"
                                class="whitespace-nowrap px-3 py-2 font-semibold">
                                {{ COLUMN_LABELS[columnDefinition(h)?.[0]] || h }}
                                <span v-if="columnDefinition(h)?.[1].required" class="text-red-600">*</span>
                                <span class="block text-xs font-normal text-slate-500">{{ h }}</span>
                            </th>
                            <th class="px-3 py-2">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="x in visibleRows" :key="`${active}-${x.n}`" class="hover:bg-slate-50">
                            <td class="px-3 py-1.5 text-right text-slate-400">{{ x.n }}</td>
                            <td v-for="(c, i) in x.r" :key="i" class="px-3 py-1.5">
                                <select v-if="choices(current.headers[i])" :value="c" :disabled="store.editingLocked"
                                    :aria-label="`${current.headers[i]} แถว ${x.n}`" class="min-w-32 rounded border border-slate-200 p-1"
                                    @change="store.updateCell(active, x.n - 2, i, $event.target.value)">
                                    <option value="">— เลือก —</option>
                                    <option v-if="c && !choices(current.headers[i]).includes(c)" :value="c">{{ c }} (จากไฟล์)</option>
                                    <option v-for="choice in choices(current.headers[i])" :key="choice" :value="choice">{{ choice }}</option>
                                </select>
                                <input v-else-if="columnDefinition(current.headers[i])?.[1].type === 'int'" :value="c" type="text" inputmode="numeric"
                                    :disabled="store.editingLocked" :aria-label="`${current.headers[i]} แถว ${x.n}`"
                                    class="w-32 rounded border border-slate-200 px-2 py-1"
                                    @input="store.updateCell(active, x.n - 2, i, $event.target.value)" />
                                <textarea v-else :value="c" rows="1" :disabled="store.editingLocked"
                                    :aria-label="`${current.headers[i] || 'คอลัมน์เพิ่มเติม'} แถว ${x.n}`"
                                    class="w-full min-w-32 rounded border border-slate-200 px-2 py-1 focus:border-primary-500 focus:outline-none"
                                    @input="store.updateCell(active, x.n - 2, i, $event.target.value)"></textarea>
                            </td>
                            <td class="px-3 py-1.5">
                                <button :disabled="store.editingLocked" :aria-label="`ลบแถว ${x.n}`"
                                    class="whitespace-nowrap text-red-600 disabled:opacity-50"
                                    @click="store.removeRow(active, x.n - 2)">ลบแถว</button>
                            </td>
                        </tr>
                        <tr v-if="!filtered.length">
                            <td :colspan="(current?.headers.length || 0) + 2"
                                class="px-3 py-6 text-center text-slate-400">
                                ไม่พบข้อมูล</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="flex items-center justify-end gap-3 border-t border-slate-200 p-3 text-sm">
                <button :disabled="page <= 1" class="disabled:opacity-40" @click="page--">← ก่อนหน้า</button>
                <span>หน้า {{ page }} / {{ pageCount }}</span>
                <button :disabled="page >= pageCount" class="disabled:opacity-40" @click="page++">ถัดไป →</button>
            </div>
        </div>


        <p v-if="store.error" class="mt-4 rounded-lg bg-red-50 p-3 text-err">❌ {{ store.error }}</p>

        <div class="mt-6 flex items-center justify-end gap-4">
           <span v-if="!store.ready" class="text-sm text-slate-500">ยังไม่ได้อัปโหลด {{ store.missing.length }} ไฟล์</span>
            <button
                class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
               :disabled="!store.canNext || store.editingLocked" @click="next">
                {{ store.reading ? 'กำลังอ่านไฟล์…' : store.uploading ? 'กำลังบันทึก…' : 'บันทึกและตรวจสอบข้อมูล →' }}
            </button>
        </div>
    </div>
</template>

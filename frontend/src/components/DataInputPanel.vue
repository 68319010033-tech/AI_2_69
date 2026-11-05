<script setup>
import { t as tr, message, importNotice } from '@/i18n'
import { ref, computed, onMounted, watch } from 'vue'
import { api } from '@/api'
import { useSessionStore } from '@/stores/session'
import { FILE_LABELS, COLUMN_LABELS, templateHeader, parseTable, suggestMapping, suggestType, mapTable } from '@/lib/inputFormat'

const emit = defineEmits(['select', 'schema'])
const store = useSessionStore()
const schema = ref({})
const type = ref('groups')
const source = ref(null)
const sourceName = ref('')
const mapping = ref({})
const error = ref('')
const reading = ref(false)
const replace = ref(false)
const inferredType = ref('')
const detection = computed(() => inferredType.value ? message('แนะนำประเภท {type} จากชื่อไฟล์และหัวคอลัมน์ กรุณาตรวจการจับคู่ก่อนนำเข้า', { type: tr(FILE_LABELS[inferredType.value]) }) : tr('ยังระบุประเภทไม่ได้แน่ชัด กรุณาเลือกประเภทข้อมูลและจับคู่คอลัมน์ด้วยตนเอง'))
const spec = computed(() => schema.value[type.value])
const target = computed(() => `${type.value}.csv`)
const canReplace = computed(() => !store.files[target.value] || replace.value)
const busy = computed(() => reading.value || store.editingLocked)
const preview = computed(() => {
    if (!source.value || !spec.value) return { error: 'กรุณาเลือกประเภทข้อมูล' }
    try {
        return mapTable(type.value, spec.value, { ...source.value, data: source.value.data.slice(0, 5) }, mapping.value)
    } catch (e) { return { error: e.message } }
})
async function loadSchema() {
    error.value = ''
    try { schema.value = await api.inputSchema(); emit('schema', schema.value) }
    catch { error.value = 'โหลดแบบฟอร์มไม่สำเร็จ กรุณาลองใหม่' }
}
onMounted(loadSchema)
watch([type, source], () => {
    replace.value = false
    mapping.value = source.value && spec.value ? suggestMapping(spec.value, source.value.headers) : {}
})
function createTable() {
    if (!spec.value || busy.value || !canReplace.value) return
    const headers = Object.keys(spec.value.cols).map(column => templateHeader(type.value, column))
    if (store.setTable(target.value, headers, [])) emit('select', target.value)
}
async function readOther(event) {
    const file = event.target.files[0]
    event.target.value = ''
    if (!file || busy.value) return
    error.value = ''
    source.value = null
    reading.value = true
    try {
        if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error('รองรับ CSV / TSV / TXT เท่านั้น กรุณาแตก ZIP หรือบันทึก Excel เป็น CSV UTF-8 ก่อน')
        if (file.size > 10 * 1024 * 1024) throw new Error('ไฟล์ต้องมีขนาดไม่เกิน 10 MB')
        source.value = parseTable(await file.text())
        sourceName.value = file.name
        type.value = suggestType(schema.value, source.value.headers, file.name)
        inferredType.value = type.value
    } catch (e) { error.value = e.message }
    finally { reading.value = false }
}
function importMapped() {
    if (!spec.value || !source.value || busy.value || !canReplace.value) return
    error.value = ''
    try {
        const result = mapTable(type.value, spec.value, source.value, mapping.value)
        if (store.setTable(target.value, result.headers, result.data)) {
            emit('select', target.value)
            source.value = null
            replace.value = false
        }
    } catch (e) { error.value = e.message }
}
</script>

<template>
    <section class="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 class="font-semibold text-primary-700"> {{ tr("กรอกข้อมูลเอง / นำเข้าไฟล์รูปแบบอื่น") }} </h2>
        <p class="mt-1 text-sm text-slate-500"> {{ tr("แบบฟอร์มตาม DATA_CSV ทั้ง 10 ประเภท เลือกประเภทแล้วสร้างตารางว่าง หรือจับคู่คอลัมน์จากไฟล์ของคุณ") }} </p>
        <div class="mt-3 flex flex-wrap items-center gap-3">
            <label class="text-sm"> {{ tr("ประเภทข้อมูล") }} <select v-model="type" :disabled="busy" class="ml-2 rounded border border-slate-300 p-2">
                    <option value=""> {{ tr("— เลือกประเภทข้อมูล —") }} </option>
                    <option v-for="(_, name) in schema" :key="name" :value="name">{{ tr(FILE_LABELS[name]) }} ({{ name }}.csv) </option>
                </select>
            </label>
            <button class="rounded border border-primary-500 px-3 py-2 text-sm text-primary-700 disabled:opacity-40"
                :disabled="!spec || busy || !canReplace" @click="createTable"> {{ tr("สร้างตารางว่าง") }} </button>
            <label class="text-sm"> {{ tr("นำเข้าไฟล์รูปแบบอื่น") }} <input type="file" accept=".csv,.tsv,.txt" :disabled="!Object.keys(schema).length || busy" class="ml-2 max-w-64" @change="readOther" />
            </label>
        </div>
        <p class="mt-2 text-xs text-slate-500"> {{ tr("รองรับ UTF-8 คั่นด้วยจุลภาค เซมิโคลอน หรือแท็บ • ZIP ให้แตกไฟล์ก่อน • Excel ให้บันทึกเป็น CSV UTF-8") }} </p>
        <p v-if="type === 'timeslots' || type === 'shared_students'" class="mt-2 text-xs text-slate-500"> {{ tr("เวลาเริ่ม/สิ้นสุดและจำนวนนักเรียนร่วมเก็บเป็นข้อมูลประกอบ การจัดตารางยังใช้วันและหมายเลขคาบ และห้ามกลุ่มที่มีนักเรียนร่วมเรียนทับกัน") }} </p>
        <label v-if="store.files[target]" class="mt-3 block text-sm text-amber-700">
            <input v-model="replace" type="checkbox" :disabled="busy" /> {{ tr("ยืนยันแทนที่ข้อมูลเดิมใน") }} {{ target }} {{ tr("ด้วยตารางที่จะสร้างหรือนำเข้า") }} </label>
        <div v-if="source" class="mt-3 text-sm" role="status">
            <p>{{ detection }}</p>
            <p v-if="!spec" class="mt-1 text-amber-700"> {{ tr("ไฟล์") }} {{ sourceName }} {{ tr("รอเลือกประเภทข้อมูลด้านบน") }} </p>
        </div>
        <div v-if="source && spec" class="mt-4 border-t border-slate-200 pt-3">
            <h3 class="font-medium"> {{ tr("จับคู่คอลัมน์:") }} {{ sourceName }} → {{ target }} ({{ source.data.length }} {{ tr("แถว)") }} </h3>
            <p class="mt-1 text-sm text-slate-500"> {{ tr("* ต้องมีข้อมูล • ตรวจตัวอย่างก่อนยืนยัน คอลัมน์ที่ไม่จับคู่จะเก็บไว้เป็นข้อมูลเพิ่มเติม") }} </p>
            <div class="mt-3 grid gap-3 sm:grid-cols-2">
                <label v-for="(definition, column) in spec.cols" :key="column" class="text-sm">
                    {{ tr(COLUMN_LABELS[column] || column) }} {{ definition.required ? '*' : tr('(ไม่บังคับ)') }}
                    <span class="block text-xs text-slate-400">{{ templateHeader(type, column) }}</span>
                    <select v-model="mapping[column]" :disabled="busy" class="mt-1 w-full rounded border border-slate-300 p-2">
                        <option :value="-1"> {{ tr("— เลือกคอลัมน์ —") }} </option>
                        <option v-for="(header, index) in source.headers" :key="index" :value="index">
                            {{ header }} · {{ source.data[0]?.[index] || tr('(ว่าง)') }}
                        </option>
                    </select>
                </label>
            </div>
            <p v-if="preview.error" class="mt-3 text-sm text-amber-700" role="status">{{ importNotice(preview.error) }}</p>
            <div v-else class="mt-4 overflow-x-auto">
                <p class="mb-2 text-sm font-medium"> {{ tr("ตัวอย่างหลังจับคู่ (สูงสุด 5 แถว) — ยังไม่แทนที่ข้อมูลเดิมจนกว่าจะยืนยัน") }} </p>
                <table class="w-full text-left text-sm">
                    <thead class="bg-primary-50"><tr><th v-for="header in preview.headers" :key="header" class="whitespace-nowrap px-3 py-2">{{ header }}</th></tr></thead>
                    <tbody><tr v-for="(row, index) in preview.data" :key="index" class="border-b border-slate-100">
                        <td v-for="(cell, column) in row" :key="column" class="whitespace-pre-wrap px-3 py-2">{{ cell }}</td>
                    </tr></tbody>
                </table>
            </div>
            <div class="mt-3 flex gap-3">
                <button class="rounded bg-primary-600 px-4 py-2 text-sm text-white disabled:opacity-40" :disabled="busy || !canReplace || !!preview.error" @click="importMapped"> {{ tr("ยืนยันนำเข้าตาราง") }} </button>
                <button class="text-sm text-slate-500" :disabled="busy" @click="source = null"> {{ tr("ยกเลิก") }} </button>
            </div>
        </div>
        <p v-if="error" role="alert" class="mt-3 text-sm text-red-600">{{ importNotice(error) }}
            <button v-if="!spec" class="ml-2 underline" @click="loadSchema"> {{ tr("ลองใหม่") }} </button>
        </p>
    </section>
</template>

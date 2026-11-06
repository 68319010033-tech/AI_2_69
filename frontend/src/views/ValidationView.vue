<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import DataEditor from '@/components/DataEditor.vue'
import IssueCorrection from '@/components/IssueCorrection.vue'
import AppIcon from '@/components/AppIcon.vue'
import { api } from '@/api'
import { t, formatDate } from '@/i18n'
const store = useSessionStore()
const router = useRouter()
const editor = ref(null)
const datasetName = ref('')
const savingDataset = ref(false)
const datasetError = ref('')
const downloadError = ref('')
async function download(url) {
    downloadError.value = ''
    try { await api.download(url) } catch { downloadError.value = 'ดาวน์โหลดไม่สำเร็จ' }
}
async function saveAndContinue() {
    if (!canNext.value || !datasetName.value.trim() || savingDataset.value) return
    savingDataset.value = true; datasetError.value = ''
    const sessionId = store.sessionId
    try {
        const dataset = await api.saveDataset(sessionId, datasetName.value.trim())
        store.selectedDataset = dataset
        if (store.sessionId === sessionId && !store.dirty) router.push('/generate')
    } catch (error) { datasetError.value = error.response?.data?.message || 'Unable to save dataset. Please retry.' }
    finally { savingDataset.value = false }
}
// ตั้งชื่อเริ่มต้นให้เมื่อข้อมูลผ่าน จะได้กดไปต่อได้ทันที (แก้ชื่อเองได้)
const defaultName = () => `${t('ชุดข้อมูล', 'Dataset')} ${formatDate(new Date(), { dateStyle: 'medium', timeStyle: 'short' })}`
const severity = ref('all')
const search = ref('')
const fileFilter = ref('all')
const issueFiles = computed(() => [...new Set(review.value.map(issue => issue.file))])
const warningCount = computed(() => review.value.filter(issue => issue.severity === 'warning').length)
const statusText = computed(() => store.editingLocked ? 'กำลังตรวจสอบข้อมูล…' : store.dirty ? 'มีข้อมูลที่แก้ไขแล้วรอตรวจสอบ' : store.validated ? 'ข้อมูลผ่านการตรวจสอบแล้ว' : store.stats ? 'แก้ไขข้อผิดพลาดก่อนจัดตาราง' : 'เริ่มตรวจสอบข้อมูลของคุณ')
const review = computed(() => store.reviewIssues)
const rows = computed(() => review.value.filter(issue =>
    (fileFilter.value === 'all' || issue.file === fileFilter.value) &&
    (severity.value === 'all' || issue.severity === severity.value) &&
    Object.values(issue).some(value => String(value).toLowerCase().includes(search.value.toLowerCase()))))
const errorCount = computed(() => review.value.filter(issue => issue.severity === 'error').length)
const canNext = computed(() => store.validated && !store.dirty && !store.editingLocked && !store.validateError)

const state = computed(() => store.editingLocked ? 'busy' : store.dirty ? 'dirty' : store.validated ? 'ok' : store.stats ? 'error' : 'idle')
const tiles = computed(() => {
    const has = !!(store.stats || review.value.length)
    const files = Object.keys(store.files).length
    return [
        { key: 'files', hue: 205, icon: 'file', label: 'ไฟล์พร้อมใช้งาน', value: `${files}`, unit: '/ 10',
          note: files >= 10 ? 'ครบทุกไฟล์แล้ว' : `ยังขาด ${10 - files} ไฟล์` },
        { key: 'offerings', hue: 265, icon: 'calendar', label: 'รายการสอน', value: store.stats ? `${store.stats.offerings}` : '—', unit: '',
          note: store.stats ? `รวม ${store.stats.periods} คาบต่อสัปดาห์` : 'รอตรวจสอบ' },
        { key: 'errors', hue: !has ? 215 : errorCount.value > 0 ? 350 : 150, icon: errorCount.value > 0 ? 'circle-x' : 'circle-check', label: 'ข้อผิดพลาด', value: has ? `${errorCount.value}` : '—', unit: '',
          note: !has ? 'รอตรวจสอบ' : errorCount.value > 0 ? 'ต้องแก้ไขก่อนไปต่อ' : 'ไม่พบข้อผิดพลาด' },
        { key: 'warnings', hue: !has ? 215 : warningCount.value > 0 ? 38 : 150, icon: warningCount.value > 0 ? 'alert' : 'circle-check', label: 'คำเตือน', value: has ? `${warningCount.value}` : '—', unit: '',
          note: !has ? 'รอตรวจสอบ' : warningCount.value > 0 ? 'ควรตรวจดู (ไปต่อได้)' : 'ไม่มีคำเตือน' },
    ]
})
const checkLabel = computed(() => store.uploading ? 'กำลังบันทึก…' : store.validating ? 'กำลังตรวจสอบข้อมูล…' : state.value === 'ok' ? 'ตรวจสอบอีกครั้ง' : 'บันทึกและตรวจสอบ')
watch(canNext, (ready) => { if (ready && !datasetName.value.trim()) datasetName.value = defaultName() }, { immediate: true })
async function check() {
    if (store.editingLocked) return
    if (store.dirty || !store.sessionId) { if (!await store.upload()) return }
    await store.validate()
}
onMounted(async () => {
    if (!store.canNext) await store.refreshLatest()
    if (store.sessionId && !store.stats && !store.dirty) await store.validate()
})
</script>
<template>
    <div class="mx-auto max-w-5xl p-6 pb-12 md:p-10">
        <h1 class="text-2xl font-bold text-primary-700">{{ t('② ตรวจสอบและแก้ไขข้อมูล') }}</h1>
        <p class="mt-1 text-slate-500">{{ t('ตรวจสอบไฟล์ที่อัปโหลด แก้ไขจุดที่มีปัญหา แล้วบันทึกเป็นชุดข้อมูลเพื่อใช้จัดตาราง', 'Check your uploaded files, fix any problems, then save them as a dataset for scheduling.') }}</p>

        <!-- สถานะ -->
        <section class="product-card mt-5" :class="{ 'bg-green-50': state === 'ok', 'bg-red-50': state === 'error', 'bg-amber-50': state === 'dirty' }" aria-live="polite">
            <div class="flex flex-wrap items-center gap-4">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
                    :class="{ 'bg-green-50 text-green-700': state === 'ok', 'bg-red-50 text-red-700': state === 'error', 'bg-amber-50 text-amber-700': state === 'dirty' || state === 'idle', 'bg-slate-50 text-slate-500': state === 'busy' }">
                    <span v-if="state === 'busy'" class="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
                    <AppIcon v-else :name="state === 'ok' ? 'check' : 'alert'" :size="22" />
                </span>
                <div class="min-w-0 flex-1">
                    <p class="font-semibold">
                        <template v-if="state === 'busy'">{{ t('กำลังตรวจสอบข้อมูล…') }}</template>
                        <template v-else-if="state === 'dirty'">{{ t('มีข้อมูลที่แก้ไขแล้วรอตรวจสอบ') }}</template>
                        <template v-else-if="state === 'ok'">{{ t('ข้อมูลผ่านการตรวจสอบแล้ว') }}</template>
                        <template v-else-if="state === 'error'">{{ t('พบข้อผิดพลาดที่ต้องแก้ไข', 'Problems need fixing') }}</template>
                        <template v-else>{{ t('เริ่มตรวจสอบข้อมูลของคุณ') }}</template>
                    </p>
                    <p class="mt-0.5 text-sm text-slate-500">
                        <template v-if="state === 'ok'">{{ t('ตั้งชื่อชุดข้อมูลด้านล่าง แล้วไปจัดตารางต่อได้เลย', 'Name your dataset below, then continue to scheduling.') }}</template>
                        <template v-else-if="state === 'dirty'">{{ t('กด “บันทึกและตรวจสอบ” เพื่อตรวจข้อมูลที่แก้ไขอีกครั้ง', 'Press “Save and check” to validate your edits.') }}</template>
                        <template v-else-if="state === 'error'">{{ t('เลือกปัญหาในรายการเพื่อไปยังช่องที่ต้องแก้ แล้วตรวจสอบอีกครั้ง', 'Pick a problem in the list to jump to the cell, then check again.') }}</template>
                        <template v-else-if="state === 'idle'">{{ t('กดปุ่มด้านขวาเพื่อเริ่มตรวจสอบ', 'Press the button to start checking.') }}</template>
                    </p>
                </div>
                <button :disabled="!store.canNext || store.editingLocked"
                    class="whitespace-nowrap rounded-lg px-5 py-2.5 font-semibold transition disabled:cursor-not-allowed disabled:opacity-40"
                    :class="state === 'ok' ? 'border border-slate-200 text-sm text-slate-500 hover:border-primary-500 hover:text-primary-700' : 'bg-primary-700 text-white hover:bg-primary-600'"
                    @click="check">{{ t(checkLabel) }}</button>
            </div>

            
            <p v-if="store.missing.length" class="mt-3 text-sm text-amber-700">{{ t('ยังไม่ได้อัปโหลด') }} {{ store.missing.join(', ') }}</p>
        </section>

        <!-- ตัวเลขสรุป -->
        <div class="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <div v-for="tile in tiles" :key="tile.key" class="stat-tile" :style="{ '--h': tile.hue }">
                <div class="flex items-center gap-2.5">
                    <span class="stat-icon"><AppIcon :name="tile.icon" :size="18" /></span>
                    <span class="stat-label">{{ t(tile.label) }}</span>
                </div>
                <p class="mt-3 text-4xl font-extrabold leading-none tracking-tight">{{ tile.value }}<span v-if="tile.unit" class="ml-1 text-base font-semibold opacity-60">{{ tile.unit }}</span></p>
                <p class="stat-note mt-2">{{ t(tile.note) }}</p>
                <AppIcon :name="tile.icon" :size="84" class="stat-ghost" />
            </div>
        </div>

        <p v-if="store.error || store.validateError" role="alert" class="mt-4 rounded-lg bg-red-50 p-3 text-red-700">{{ t(store.error || store.validateError) }}</p>

        <!-- ตั้งชื่อชุดข้อมูล · ขั้นถัดไป -->
        <section v-if="canNext" class="product-card mt-5 border-primary-500">
            <h2 class="text-lg font-semibold">{{ t('ตั้งชื่อชุดข้อมูลเพื่อไปต่อ', 'Name your dataset to continue') }}</h2>
            <p class="mt-1 text-sm text-slate-500">{{ t('บันทึกสำเนาข้อมูลที่ตรวจผ่านแล้ว เพื่อเลือกใช้ในหน้าจัดตารางได้ภายหลัง', 'Saves a snapshot of the validated data that you can pick later on the Generate page.') }}</p>
            <div class="mt-4 flex flex-col gap-3 sm:flex-row">
                <input id="dataset-name" v-model="datasetName" maxlength="80" :disabled="savingDataset"
                    :aria-label="t('Dataset name')" :placeholder="t('เช่น ภาคเรียนที่ 1 — ข้อมูลพร้อมใช้', 'e.g. Semester 1 — final data')"
                    class="w-full rounded-lg border border-slate-300 bg-white p-3" @focus="$event.target.select()" @keydown.enter="saveAndContinue" />
                <button :disabled="!datasetName.trim() || savingDataset" class="product-button shrink-0 px-6 py-3" @click="saveAndContinue">
                    {{ t(savingDataset ? 'กำลังบันทึก…' : 'บันทึกและไปจัดตาราง →', savingDataset ? 'Saving dataset…' : 'Save and continue →') }}
                </button>
            </div>
            <p v-if="!datasetName.trim()" class="mt-3 text-sm text-amber-700">{{ t('ตั้งชื่อชุดข้อมูลก่อน จึงจะไปต่อได้', 'Enter a dataset name to continue.') }}</p>
            <p v-if="datasetError" role="alert" class="mt-3 text-sm text-red-700">{{ t(datasetError) }}</p>
        </section>

        <!-- รายการปัญหา -->
        <section v-if="review.length" class="product-card mt-5">
            <div class="flex flex-wrap items-center justify-between gap-3">
                <h2 class="text-lg font-semibold">{{ t('ผลตรวจสอบล่าสุด') }} <span class="text-sm font-normal text-slate-400">({{ rows.length }})</span></h2>
                <div class="flex flex-wrap gap-2">
                    <select v-model="severity" :aria-label="t('ระดับ')" class="rounded-lg border border-slate-300 p-2 text-sm">
                        <option value="all">{{ t('ทั้งหมด') }}</option><option value="error">{{ t('ข้อผิดพลาด') }}</option>
                        <option value="warning">{{ t('คำเตือน') }}</option><option value="info">{{ t('ข้อมูลเพิ่มเติม') }}</option>
                    </select>
                    <select v-model="fileFilter" :aria-label="t('กรองตามไฟล์')" class="rounded-lg border border-slate-300 p-2 text-sm"><option value="all">{{ t('ทุกไฟล์') }}</option><option v-for="file in issueFiles" :key="file" :value="file">{{ file }}.csv</option></select>
                    <input v-model="search" :aria-label="t('ค้นหาปัญหา')" type="search" :placeholder="t('ค้นหา…')" class="w-40 rounded-lg border border-slate-300 p-2 text-sm" />
                </div>
            </div>
            <p v-if="store.dirty" class="mt-2 text-sm text-amber-700">{{ t('แสดงข้อผิดพลาดจากการตรวจครั้งล่าสุด กรุณาตรวจใหม่หลังแก้ไข') }}</p>
            <div class="mt-3 max-h-96 overflow-auto rounded-lg border border-slate-200">
                <table class="w-full text-left text-sm">
                    <thead class="sticky top-0 bg-primary-50 text-primary-700"><tr><th class="p-2.5">{{ t('ไฟล์ / แถว') }}</th><th class="p-2.5">{{ t('คอลัมน์') }}</th><th class="p-2.5">{{ t('ปัญหา') }}</th><th class="p-2.5">{{ t('จัดการ') }}</th></tr></thead>
                    <tbody><tr v-for="(issue, index) in rows" :key="index" class="border-t border-slate-200 align-top" :class="issue.severity === 'error' ? 'bg-red-50 text-red-800' : 'text-slate-700'">
                        <td class="p-2.5 whitespace-nowrap">{{ issue.file }} / {{ issue.row ?? '—' }}</td><td class="p-2.5">{{ issue.column || '—' }}</td>
                        <td class="p-2.5"><span class="font-semibold">{{ t(issue.severity === 'error' ? 'ข้อผิดพลาด' : issue.severity === 'warning' ? 'คำเตือน' : 'ข้อมูลเพิ่มเติม') }}:</span> {{ issue.message }}<p class="mt-1 font-medium">{{ t("How to fix") }}: {{ issue.suggestion || t("Check this value against the related data file, then validate again.") }}</p></td>
                        <td class="p-2.5"><IssueCorrection v-if="store.files[issue.file + '.csv']" :issue="issue" @locate="editor?.focusIssue(issue)" @recheck="check" /><RouterLink v-else to="/upload" class="underline">{{ t('อัปโหลดไฟล์') }}</RouterLink></td>
                    </tr></tbody>
                </table>
                <p v-if="!rows.length" class="p-3 text-slate-500">{{ t('ไม่พบรายการ') }}</p>
            </div>
        </section>

        <!-- แก้ไขข้อมูล -->
        <DataEditor ref="editor" />

        <!-- รายงานการล้างข้อมูล -->
        <details v-if="store.log.length || (store.stats && !store.dirty)" class="product-card mt-5">
            <summary class="flex list-none items-center justify-between gap-3 font-semibold">
                <span>{{ t('รายงานการล้างข้อมูลและไฟล์ที่ล้างแล้ว', 'Cleaning report and cleaned files') }} <span v-if="store.log.length" class="text-sm font-normal text-slate-400">({{ store.log.length }})</span></span>
                <AppIcon name="chevron" :size="18" class="transition [details[open]_&]:rotate-180" />
            </summary>
            <div v-if="store.log.length" class="mt-3 max-h-64 overflow-auto rounded-lg border border-slate-200"><table class="w-full text-left text-sm"><tbody>
                <tr v-for="(entry, index) in store.log" :key="index" class="border-b border-slate-200 last:border-0"><td class="p-2">{{ entry.file }}:{{ entry.row }} / {{ entry.column }}</td><td class="p-2">{{ entry.before }} → {{ entry.after }}</td><td class="p-2 text-slate-500">{{ entry.rule }}</td></tr>
            </tbody></table></div>
            <button v-if="store.log.length && store.sessionId && !store.dirty" class="mt-3 inline-flex items-center gap-1.5 text-sm text-primary-700 underline" @click="download(api.cleaningLogUrl(store.sessionId))"><AppIcon name="download" :size="14" />{{ t('ดาวน์โหลดประวัติการล้างข้อมูล') }}</button>
            <div v-if="store.stats && !store.dirty" class="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                <span class="text-slate-500">{{ t('ดาวน์โหลดไฟล์ที่ล้างแล้ว:') }}</span>
                <button v-for="name in Object.keys(store.files)" :key="name" class="text-primary-700 underline" @click="download(api.cleanedUrl(store.sessionId, name))">{{ name }}</button>
            </div>
            <p v-if="downloadError" role="alert" class="mt-2 text-sm text-red-700">{{ t(downloadError) }}</p>
        </details>

        <div class="mt-6">
            <RouterLink to="/upload" class="text-slate-500 hover:text-primary-700">{{ t('← กลับไปอัปโหลด') }}</RouterLink>
        </div>
    </div>
</template>

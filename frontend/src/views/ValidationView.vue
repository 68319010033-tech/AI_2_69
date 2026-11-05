<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import DataEditor from '@/components/DataEditor.vue'
import IssueCorrection from '@/components/IssueCorrection.vue'
import { api } from '@/api'
import { t } from '@/i18n'
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
    <div class="mx-auto max-w-7xl p-6 md:p-10">
        <h1 class="text-2xl font-bold text-primary-700">{{ t('② ตรวจสอบและแก้ไขข้อมูล') }}</h1>
        <p class="mt-1 text-slate-500">{{ t('เลือกข้อผิดพลาดเพื่อไปยังช่องสีแดง แก้ไขแล้วตรวจสอบอีกครั้งก่อนจัดตาราง') }}</p>
        <section class="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm" aria-live="polite">
<p class="font-semibold text-primary-700">{{ t(statusText) }}</p>
<p class="mt-2 text-sm text-slate-500">{{ t('1. ตรวจสอบข้อมูล → 2. เลือกปัญหาเพื่อแก้ไข → 3. ตรวจซ้ำแล้วจัดตาราง') }}</p>
<div class="mt-4 grid grid-cols-3 gap-3">
<div class="rounded-lg bg-slate-50 p-3"><p>{{ t('ไฟล์พร้อมใช้งาน') }}</p><strong>{{ Object.keys(store.files).length }} / 10</strong></div>
<div class="rounded-lg bg-red-50 p-3"><p>{{ t('ข้อผิดพลาด') }}</p><strong>{{ store.stats || review.length ? errorCount : '—' }}</strong></div>
<div class="rounded-lg bg-amber-50 p-3"><p>{{ t('คำเตือน') }}</p><strong>{{ store.stats || review.length ? warningCount : '—' }}</strong></div>
</div>
<p v-if="store.missing.length" class="mt-3 text-sm text-amber-700">{{ t('ยังไม่ได้อัปโหลด') }} {{ store.missing.join(', ') }}</p>
</section>
<div class="mt-5 flex flex-wrap items-center gap-3">
            <button :disabled="!store.canNext || store.editingLocked" class="rounded-lg bg-primary-700 px-5 py-2.5 font-semibold text-white disabled:opacity-40" @click="check">
                {{ t(store.uploading ? 'กำลังบันทึก…' : store.validating ? 'กำลังตรวจสอบข้อมูล…' : 'บันทึกและตรวจสอบอีกครั้ง') }}
            </button>
            <span v-if="store.dirty" class="text-sm text-amber-700">{{ t('มีข้อมูลที่แก้ไขแล้วรอตรวจสอบ') }}</span>
            <span v-else-if="store.validated" class="text-sm text-green-700">{{ t('ข้อมูลผ่านการตรวจสอบแล้ว') }}</span>
        </div>
        <p v-if="store.error || store.validateError" role="alert" class="mt-3 rounded bg-red-50 p-3 text-red-700">{{ t(store.error || store.validateError) }}</p>
        <div v-if="store.stats" class="mt-4 flex flex-wrap gap-4 rounded-xl border bg-white p-4">
            <span class="font-semibold text-red-700">{{ t('ข้อผิดพลาด') }}: {{ errorCount }}</span>
            <span>{{ t('รายการสอน / คาบรวม') }}: {{ store.stats.offerings }} / {{ store.stats.periods }}</span>
        </div>
        <section v-if="review.length" class="mt-5 rounded-xl border border-slate-200 bg-white p-4">
            <h2 class="font-semibold">{{ t('ผลตรวจสอบล่าสุด') }}</h2>
            <p v-if="store.dirty" class="mt-1 text-sm text-amber-700">{{ t('แสดงข้อผิดพลาดจากการตรวจครั้งล่าสุด กรุณาตรวจใหม่หลังแก้ไข') }}</p>
            <div class="my-3 flex flex-wrap gap-3">
                <select v-model="severity" :aria-label="t('ระดับ')" class="rounded border p-2">
                    <option value="all">{{ t('ทั้งหมด') }}</option><option value="error">{{ t('ข้อผิดพลาด') }}</option>
                    <option value="warning">{{ t('คำเตือน') }}</option><option value="info">{{ t('ข้อมูลเพิ่มเติม') }}</option>
                </select>
                <select v-model="fileFilter" :aria-label="t('กรองตามไฟล์')" class="rounded border p-2"><option value="all">{{ t('ทุกไฟล์') }}</option><option v-for="file in issueFiles" :key="file" :value="file">{{ file }}.csv</option></select>
<input v-model="search" :aria-label="t('ค้นหาปัญหา')" type="search" :placeholder="t('ค้นหา…')" class="rounded border p-2" />
            </div>
            <div class="max-h-80 overflow-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-primary-50"><tr><th class="p-2">{{ t('ไฟล์ / แถว') }}</th><th class="p-2">{{ t('คอลัมน์') }}</th><th class="p-2">{{ t('ปัญหา') }}</th><th class="p-2">{{ t('จัดการ') }}</th></tr></thead>
                    <tbody><tr v-for="(issue, index) in rows" :key="index" :class="issue.severity === 'error' ? 'bg-red-50 text-red-800' : 'text-slate-700'">
                        <td class="p-2">{{ issue.file }} / {{ issue.row ?? '—' }}</td><td class="p-2">{{ issue.column || '—' }}</td>
                        <td class="p-2"><span class="font-semibold">{{ t(issue.severity === 'error' ? 'ข้อผิดพลาด' : issue.severity === 'warning' ? 'คำเตือน' : 'ข้อมูลเพิ่มเติม') }}:</span> {{ issue.message }}<p class="mt-1 text-sm font-medium">{{ t("How to fix") }}: {{ issue.suggestion || t("Check this value against the related data file, then validate again.") }}</p></td>
                        <td class="p-2"><IssueCorrection v-if="store.files[issue.file + '.csv']" :issue="issue" @locate="editor?.focusIssue(issue)" @recheck="check" /><RouterLink v-else to="/upload" class="underline">{{ t('อัปโหลดไฟล์') }}</RouterLink></td>
                    </tr></tbody>
                </table>
                <p v-if="!rows.length" class="p-3 text-slate-500">{{ t('ไม่พบรายการ') }}</p>
            </div>
        </section>
        <DataEditor ref="editor" />
        <details v-if="store.log.length" class="mt-5 rounded border bg-white p-4">
            <summary class="cursor-pointer font-medium">{{ t('ประวัติการล้างข้อมูล') }} ({{ store.log.length }})</summary>
            <div class="max-h-64 overflow-auto"><table class="w-full text-left text-sm"><tbody>
                <tr v-for="(entry, index) in store.log" :key="index"><td class="p-2">{{ entry.file }}:{{ entry.row }} / {{ entry.column }}</td><td class="p-2">{{ entry.before }} → {{ entry.after }}</td><td class="p-2">{{ entry.rule }}</td></tr>
            </tbody></table></div>
            <button v-if="store.sessionId && !store.dirty" class="mt-3 text-primary-700 underline" @click="download(api.cleaningLogUrl(store.sessionId))">{{ t('ดาวน์โหลดประวัติการล้างข้อมูล') }}</button>
        </details>
        <div v-if="store.stats && !store.dirty" class="mt-4 flex flex-wrap gap-2 text-sm">
            <span>{{ t('ดาวน์โหลดไฟล์ที่ล้างแล้ว:') }}</span>
            <button v-for="name in Object.keys(store.files)" :key="name" class="text-primary-700 underline" @click="download(api.cleanedUrl(store.sessionId, name))">{{ name }}</button>
        </div>
        <p v-if="downloadError" role="alert" class="mt-2 text-red-700">{{ t(downloadError) }}</p>
        <section class="product-card mt-6"><h2 class="font-semibold">{{ t('Save a named dataset') }}</h2><p class="mt-2 text-sm text-slate-500">{{ t('After validation, save a snapshot you can select later on the Generate page.') }}</p><label for="dataset-name" class="mt-4 block text-sm">{{ t('Dataset name') }}</label><input id="dataset-name" v-model="datasetName" maxlength="80" class="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3" :placeholder="t('e.g. Semester 1 — final data')" :disabled="savingDataset" /><p v-if="datasetError" role="alert" class="mt-2 text-red-700">{{ t(datasetError) }}</p></section>
        <div class="sticky bottom-0 z-10 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
<button :disabled="!store.canNext || store.editingLocked" class="rounded-lg bg-primary-700 px-4 py-2 font-semibold text-white disabled:opacity-40" @click="check">{{ t(store.validating ? 'กำลังตรวจสอบข้อมูล…' : store.uploading ? 'กำลังบันทึก…' : 'บันทึกและตรวจสอบอีกครั้ง') }}</button>
            <RouterLink to="/upload" class="text-primary-700">{{ t('← กลับไปอัปโหลด') }}</RouterLink>
            <button :disabled="!canNext || !datasetName.trim() || savingDataset" class="rounded-lg bg-primary-700 px-5 py-2.5 font-semibold text-white disabled:opacity-40" @click="saveAndContinue">{{ t(savingDataset ? 'Saving dataset…' : 'Save dataset and continue →') }}</button>
        </div>
    </div>
</template>

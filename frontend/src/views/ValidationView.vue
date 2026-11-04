<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import DataEditor from '@/components/DataEditor.vue'
import { api } from '@/api'
import { t } from '@/i18n'
const store = useSessionStore()
const router = useRouter()
const editor = ref(null)
const severity = ref('all')
const search = ref('')
const review = computed(() => store.reviewIssues)
const rows = computed(() => review.value.filter(issue =>
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
                <input v-model="search" type="search" :placeholder="t('ค้นหา…')" class="rounded border p-2" />
            </div>
            <div class="max-h-80 overflow-auto">
                <table class="w-full text-left text-sm">
                    <thead class="bg-primary-50"><tr><th class="p-2">{{ t('ไฟล์ / แถว') }}</th><th class="p-2">{{ t('คอลัมน์') }}</th><th class="p-2">{{ t('ปัญหา') }}</th><th class="p-2">{{ t('จัดการ') }}</th></tr></thead>
                    <tbody><tr v-for="(issue, index) in rows" :key="index" :class="issue.severity === 'error' ? 'bg-red-50 text-red-800' : 'text-slate-700'">
                        <td class="p-2">{{ issue.file }} / {{ issue.row ?? '—' }}</td><td class="p-2">{{ issue.column || '—' }}</td>
                        <td class="p-2"><span class="font-semibold">{{ t(issue.severity === 'error' ? 'ข้อผิดพลาด' : issue.severity === 'warning' ? 'คำเตือน' : 'ข้อมูลเพิ่มเติม') }}:</span> {{ issue.message }}<p class="text-xs">{{ issue.suggestion }}</p></td>
                        <td class="p-2"><button v-if="store.files[issue.file + '.csv']" class="whitespace-nowrap font-semibold underline" @click="editor?.focusIssue(issue)">{{ t('ไปแก้ไข') }}</button><RouterLink v-else to="/upload" class="underline">{{ t('อัปโหลดไฟล์') }}</RouterLink></td>
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
            <button v-if="store.sessionId && !store.dirty" class="mt-3 text-primary-700 underline" @click="api.download(api.cleaningLogUrl(store.sessionId))">{{ t('ดาวน์โหลดประวัติการล้างข้อมูล') }}</button>
        </details>
        <div v-if="store.stats && !store.dirty" class="mt-4 flex flex-wrap gap-2 text-sm">
            <span>{{ t('ดาวน์โหลดไฟล์ที่ล้างแล้ว:') }}</span>
            <button v-for="name in Object.keys(store.files)" :key="name" class="text-primary-700 underline" @click="api.download(api.cleanedUrl(store.sessionId, name))">{{ name }}</button>
        </div>
        <div class="mt-6 flex items-center justify-between gap-4">
            <RouterLink to="/upload" class="text-primary-700">{{ t('← กลับไปอัปโหลด') }}</RouterLink>
            <button :disabled="!canNext" class="rounded-lg bg-primary-700 px-5 py-2.5 font-semibold text-white disabled:opacity-40" @click="router.push('/generate')">{{ t('ถัดไป: จัดตารางสอน →') }}</button>
        </div>
    </div>
</template>

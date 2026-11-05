<script setup>
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { t as tr } from '@/i18n'
import { ref, computed, watch, nextTick } from 'vue'
import { useSessionStore, REQUIRED_FILES } from '@/stores/session'
import DataInputPanel from '@/components/DataInputPanel.vue'
import { COLUMN_LABELS, normHeader } from '@/lib/inputFormat'
import { t } from '@/i18n'
const store = useSessionStore()
const pendingDelete = ref(null)
function deleteRow() { if (pendingDelete.value) store.removeRow(pendingDelete.value.file, pendingDelete.value.row); pendingDelete.value = null }
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

// พรีวิวตาราง
const LIMIT = 100
const active = ref('')
const search = ref('')
const onlyErrors = ref(false)
const errorRows = computed(() => new Set(activeErrors.value.map(issue => issue.rowIndex)))
function fileErrorCount(name) {
return store.reviewIssues.filter(issue => issue.severity === 'error' && issue.file === name.replace('.csv', '')).length
}
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
    return all.filter(x => (!onlyErrors.value || errorRows.value.has(x.n - 2)) && (!t || x.r.some(c => String(c).toLowerCase().includes(t))))
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / LIMIT)))
const visibleRows = computed(() => filtered.value.slice((page.value - 1) * LIMIT, page.value * LIMIT))
watch([active, search, onlyErrors], () => { page.value = 1 })
watch(pageCount, (count) => { page.value = Math.min(page.value, count) })
function addRow() {
    onlyErrors.value = false
    search.value = ''
    store.addRow(active.value)
    page.value = Math.max(1, Math.ceil(current.value.rows / LIMIT))
}


const root = ref(null)
const activeErrors = computed(() => store.reviewIssues.filter(issue => issue.severity === 'error' && issue.file === active.value.replace('.csv', '')))
function errorsAt(row, column) {
    return activeErrors.value.filter(issue => issue.rowIndex === row && (!issue.column || issue.columnIndices?.includes(column)))
}
const missingColumns = computed(() => activeErrors.value.filter(issue => issue.row == null && issue.column && !issue.columnIndices?.length))
async function focusIssue(issue) {
    onlyErrors.value = false
    active.value = issue.file.endsWith('.csv') ? issue.file : issue.file + '.csv'
    search.value = ''
    await nextTick()
    page.value = Math.floor(Math.max(0, issue.rowIndex ?? 0) / LIMIT) + 1
    await nextTick()
    const cell = root.value?.querySelector('[data-row="' + issue.rowIndex + '"][data-column="' + (issue.columnIndices?.[0] ?? 0) + '"]')
    const target = cell || root.value
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    cell?.querySelector('input, textarea, select')?.focus()
}
defineExpose({ focusIssue })
</script>
<template>
    <section ref="root" class="mt-6">
        <ConfirmDialog :open="!!pendingDelete" :title="t('ลบแถว')" :message="t('Remove this row? You can undo this change.')" :confirm-text="t('ลบแถว')" :cancel-text="t('Cancel')" danger @confirm="deleteRow" @cancel="pendingDelete = null" />
<button class="float-right rounded-lg border px-4 py-2 disabled:opacity-40" :disabled="!store.canUndo" @click="store.undo()">{{ t('Undo last edit') }}</button>
<h2 class="text-lg font-semibold">{{ t('แก้ไขข้อมูล') }}</h2>
        <p class="mt-1 text-sm text-slate-500">{{ t('ช่องสีแดงคือค่าที่ตรวจพบข้อผิดพลาด แก้ไขแล้วกดบันทึกและตรวจสอบอีกครั้ง') }}</p>
        <p v-if="store.dirty" class="mt-2 text-sm text-amber-700">{{ t('แสดงข้อผิดพลาดจากการตรวจครั้งล่าสุด กรุณาตรวจใหม่หลังแก้ไข') }}</p>
        <p class="mt-2 text-sm text-slate-500" role="status">{{ t(store.draftStatus) }}</p>
        <DataInputPanel @select="active = $event; search = ''" @schema="schema = $event" />
        <div v-for="issue in missingColumns" :key="issue.column" class="mt-3 rounded border border-red-300 bg-red-50 p-3 text-red-700">
            {{ issue.message }}
            <button v-if="schema[active.replace('.csv', '')]?.cols[issue.column]" class="ml-2 underline" :disabled="store.editingLocked" @click="store.addColumn(active, issue.column)">{{ t('เพิ่มคอลัมน์ที่ขาด') }}: {{ issue.column }}</button>
        </div>
        <!-- Preview -->
        <div v-if="uploaded.length" class="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div class="flex flex-wrap gap-1 border-b border-slate-200 p-2">
                <button v-for="n in uploaded" :key="n" class="rounded-lg px-3 py-1.5 text-sm transition"
                    :class="n === active ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
                    @click="active = n; search = ''">
                    {{ n }} <span v-if="fileErrorCount(n)" class="ml-1 rounded-full bg-red-100 px-2 text-xs font-bold text-red-800">{{ fileErrorCount(n) }}</span>
                </button>
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 p-3">
                <span class="text-sm text-slate-500">
                    {{ current?.rows }} {{ tr("แถว ·") }} {{ current?.headers.length }} {{ tr("คอลัมน์ · พบ") }} {{ filtered.length }} {{ tr("แถว") }} </span>
                <label class="flex items-center gap-2 text-sm"><input v-model="onlyErrors" type="checkbox" />{{ t('แสดงเฉพาะแถวที่มีข้อผิดพลาด') }}</label>
<input v-model="search" :aria-label="t('ค้นหาในไฟล์นี้…')" type="search" :placeholder="tr('ค้นหาในไฟล์นี้…')"
                    class="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none" />
            </div>

            <div class="flex flex-wrap items-center justify-between gap-3 px-3 pb-3">
                <p class="text-sm text-slate-500"> {{ tr("แก้ไขข้อมูลในช่องได้เลย จากนั้นกด “บันทึกและตรวจสอบข้อมูล” เพื่อส่งข้อมูลไปยังเซิร์ฟเวอร์") }} </p>
                <button class="rounded-lg border border-primary-300 px-3 py-1.5 text-sm text-primary-700 disabled:opacity-50"
                    :disabled="store.editingLocked" @click="addRow"> {{ tr("+ เพิ่มแถว") }} </button>
            </div>
            <div class="max-h-96 overflow-auto">
                <table class="w-full text-left text-sm">
                    <thead class="sticky top-0 bg-primary-50 text-primary-700">
                        <tr>
                            <th class="px-3 py-2 text-right text-slate-400">#</th>
                            <th v-for="h in current?.headers" :key="h"
                                class="whitespace-nowrap px-3 py-2 font-semibold">
                                {{ tr(COLUMN_LABELS[columnDefinition(h)?.[0]] || h) }}
                                <span v-if="columnDefinition(h)?.[1].required" class="text-red-600">*</span>
                                <span class="block text-xs font-normal text-slate-500">{{ h }}</span>
                            </th>
                            <th class="px-3 py-2"> {{ tr("จัดการ") }} </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="x in visibleRows" :key="`${active}-${x.n}`" class="hover:bg-slate-50">
                            <td class="px-3 py-1.5 text-right text-slate-400">{{ x.n }}</td>
                            <td v-for="(c, i) in x.r" :key="i" :data-row="x.n - 2" :data-column="i" class="px-3 py-1.5"
                                :class="errorsAt(x.n - 2, i).length ? 'bg-red-50 ring-1 ring-inset ring-red-400' : ''">
                                <select v-if="choices(current.headers[i])" :value="c" :disabled="store.editingLocked"
                                    :aria-invalid="errorsAt(x.n - 2, i).length > 0" :aria-describedby="errorsAt(x.n - 2, i).length ? `error-${x.n}-${i}` : undefined"
                                    :aria-label="`${current.headers[i]} ${t('แถว')} ${x.n}`" class="min-w-32 rounded border border-slate-200 p-1"
                                    @change="store.updateCell(active, x.n - 2, i, $event.target.value)">
                                    <option value=""> {{ tr("— เลือก —") }} </option>
                                    <option v-if="c && !choices(current.headers[i]).includes(c)" :value="c">{{ c }} {{ tr("(จากไฟล์)") }} </option>
                                    <option v-for="choice in choices(current.headers[i])" :key="choice" :value="choice">{{ choice }}</option>
                                </select>
                                <input v-else-if="columnDefinition(current.headers[i])?.[1].type === 'int'" :value="c" type="text" inputmode="numeric"
                                    :aria-invalid="errorsAt(x.n - 2, i).length > 0" :aria-describedby="errorsAt(x.n - 2, i).length ? `error-${x.n}-${i}` : undefined"
                                    :disabled="store.editingLocked" :aria-label="`${current.headers[i]} ${t('แถว')} ${x.n}`"
                                    class="w-32 rounded border border-slate-200 px-2 py-1"
                                    @input="store.updateCell(active, x.n - 2, i, $event.target.value)" />
                                <textarea v-else :value="c" rows="1" :disabled="store.editingLocked"
                                    :aria-invalid="errorsAt(x.n - 2, i).length > 0" :aria-describedby="errorsAt(x.n - 2, i).length ? `error-${x.n}-${i}` : undefined"
                                    :aria-label="`${current.headers[i] || 'คอลัมน์เพิ่มเติม'} ${t('แถว')} ${x.n}`"
                                    class="w-full min-w-32 rounded border border-slate-200 px-2 py-1 focus:border-primary-500 focus:outline-none"
                                    @input="store.updateCell(active, x.n - 2, i, $event.target.value)"></textarea>
                                <p v-if="errorsAt(x.n - 2, i).length" :id="`error-${x.n}-${i}`" class="mt-1 min-w-48 max-w-72 text-xs font-medium text-red-700">
                                    {{ errorsAt(x.n - 2, i).map(issue => issue.message).join(' · ') }}
                                </p>
                            </td>
                            <td class="px-3 py-1.5">
                                <button :disabled="store.editingLocked" :aria-label="`${t('ลบแถว')} ${x.n}`"
                                    class="whitespace-nowrap text-red-600 disabled:opacity-50"
                                    @click="pendingDelete = { file: active, row: x.n - 2 }"> {{ tr("ลบแถว") }} </button>
                            </td>
                        </tr>
                        <tr v-if="!filtered.length">
                            <td :colspan="(current?.headers.length || 0) + 2"
                                class="px-3 py-6 text-center text-slate-400"> {{ tr("ไม่พบข้อมูล") }} </td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div class="flex items-center justify-end gap-3 border-t border-slate-200 p-3 text-sm">
                <button :disabled="page <= 1" class="disabled:opacity-40" @click="page--"> {{ tr("← ก่อนหน้า") }} </button>
                <span> {{ tr("หน้า") }} {{ page }} / {{ pageCount }}</span>
                <button :disabled="page >= pageCount" class="disabled:opacity-40" @click="page++"> {{ tr("ถัดไป →") }} </button>
            </div>
        </div>



    </section>
</template>

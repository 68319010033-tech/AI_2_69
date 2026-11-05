<script setup>
import { computed, onMounted, ref } from 'vue'
import { api } from '@/api'
import { useSessionStore } from '@/stores/session'
import { t, formatDate } from '@/i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const store = useSessionStore()
const items = ref([])
const loading = ref(false)
const busy = ref(false)
const name = ref('')
const error = ref('')
const notice = ref('')
const pendingLoad = ref(null)
const pendingDelete = ref(null)

const canSave = computed(() => !!store.generationSessionId && store.schedule.length > 0 && name.value.trim().length > 0 && !busy.value)
const reason = (e, fallback) => e.response?.data?.message || fallback

async function refresh() {
  loading.value = true
  try { items.value = await api.timetables(); error.value = '' }
  catch (e) { error.value = reason(e, 'โหลดรายการตารางที่บันทึกไว้ไม่ได้ ลองใหม่อีกครั้ง') }
  finally { loading.value = false }
}

async function save() {
  if (!canSave.value) return
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const saved = await api.saveTimetable(store.generationSessionId, name.value.trim(), store.method)
    name.value = ''
    notice.value = `บันทึกตาราง "${saved.name}" แล้ว`
    await refresh()
  } catch (e) { error.value = reason(e, 'บันทึกตารางไม่สำเร็จ ลองใหม่อีกครั้ง') }
  finally { busy.value = false }
}

function open(item) {
  if (store.schedule.length) pendingLoad.value = item
  else doLoad(item)
}

async function doLoad(item) {
  pendingLoad.value = null
  busy.value = true; error.value = ''; notice.value = ''
  try {
    const r = await api.loadTimetable(item.id)
    store.generationSessionId = r.sessionId
    if (r.dataset) store.selectedDataset = r.dataset
    store.job = null
    store.generated = true
    store.schedule = []
    await store.loadSchedule(r.method)
    notice.value = `เปิดตาราง "${item.name}" แล้ว`
  } catch (e) { error.value = reason(e, 'เปิดตารางไม่สำเร็จ ลองใหม่อีกครั้ง') }
  finally { busy.value = false }
}

async function doDelete() {
  const item = pendingDelete.value
  pendingDelete.value = null
  if (!item) return
  busy.value = true; error.value = ''; notice.value = ''
  try { await api.deleteTimetable(item.id); await refresh() }
  catch (e) { error.value = reason(e, 'ลบตารางไม่สำเร็จ ลองใหม่อีกครั้ง') }
  finally { busy.value = false }
}

onMounted(refresh)
</script>

<template>
  <section class="product-card mt-6">
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-lg font-semibold">{{ t('บันทึกตารางพร้อมชื่อ', 'Save timetable with a name') }}</h2>
      <button class="text-sm text-primary-700 underline disabled:opacity-40" :disabled="loading || busy" @click="refresh">{{ t('รีเฟรช', 'Refresh') }}</button>
    </div>
    <p class="mt-1 text-sm text-slate-500">{{ t('เก็บตารางที่จัดได้ไว้ย้อนดูภายหลัง แม้จะจัดตารางใหม่ภายหลังก็ไม่หาย', 'Keep generated timetables so you can review them later, even after generating again.') }}</p>

    <div class="mt-4 flex flex-col gap-2 sm:flex-row">
      <input
        v-model="name" type="text" maxlength="80" :disabled="busy || !store.schedule.length"
        :aria-label="t('ชื่อตาราง', 'Timetable name')"
        :placeholder="store.schedule.length ? t('เช่น ภาคเรียนที่ 1 — ฉบับร่าง 2', 'e.g. Term 1 — draft 2') : t('จัดตารางหรือเปิดตารางที่บันทึกไว้ก่อน จึงจะบันทึกได้', 'Generate or open a timetable first to save it')"
        class="w-full rounded-lg border border-slate-300 bg-white p-3 disabled:bg-slate-50"
        @keydown.enter="save"
      />
      <button class="shrink-0 rounded-lg bg-primary-600 px-6 py-3 font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300" :disabled="!canSave" @click="save">
        {{ t('💾 บันทึกตาราง', '💾 Save timetable') }}
      </button>
    </div>

    <p v-if="error" role="alert" class="mt-3 rounded-lg bg-red-50 p-3 text-sm text-err">{{ t(error) }}</p>
    <p v-else-if="notice" role="status" class="mt-3 rounded-lg bg-primary-50 p-3 text-sm text-primary-700">{{ t(notice) }}</p>

    <h3 class="mt-6 text-sm font-semibold text-slate-800">{{ t('ตารางที่บันทึกไว้', 'Saved timetables') }} <span class="font-normal text-slate-400">({{ items.length }})</span></h3>
    <p v-if="loading && !items.length" class="mt-2 text-sm text-slate-500">{{ t('กำลังโหลด…', 'Loading…') }}</p>
    <p v-else-if="!items.length" class="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">{{ t('ยังไม่มีตารางที่บันทึกไว้', 'No saved timetables yet.') }}</p>
    <div v-else class="mt-2 overflow-x-auto">
      <table class="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr class="border-b border-slate-200 text-xs text-slate-500">
            <th class="py-2 pr-3 font-semibold">{{ t('ชื่อตาราง', 'Name') }}</th>
            <th class="py-2 pr-3 font-semibold">{{ t('ชุดข้อมูล', 'Dataset') }}</th>
            <th class="py-2 pr-3 font-semibold">{{ t('บันทึกเมื่อ', 'Saved') }}</th>
            <th class="py-2 pr-3 font-semibold">{{ t('ผลตรวจ', 'Check') }}</th>
            <th class="py-2 text-right font-semibold">{{ t('จัดการ', 'Actions') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="it in items" :key="it.id" class="border-b border-slate-100 align-middle">
            <td class="py-2.5 pr-3 font-medium text-slate-800">{{ it.name }}<div class="text-xs font-normal text-slate-400">{{ it.scheduled }} {{ t('รายการ', 'sessions') }}</div></td>
            <td class="py-2.5 pr-3 text-slate-600">{{ it.datasetName || '—' }}</td>
            <td class="py-2.5 pr-3 whitespace-nowrap text-slate-600">{{ formatDate(it.createdAt) }}</td>
            <td class="py-2.5 pr-3">
              <span v-if="it.valid === true" class="rounded-full bg-primary-50 px-2.5 py-0.5 text-xs font-semibold text-ok">{{ t('ผ่านเงื่อนไข', 'Passed') }}</span>
              <span v-else-if="it.valid === false" class="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-err">{{ it.violations ?? '' }} {{ t('ข้อขัดแย้ง', 'violations') }}</span>
              <span v-else class="text-slate-400">—</span>
              <span v-if="it.objective != null" class="ml-2 text-xs text-slate-400">{{ t('คะแนน', 'score') }} {{ it.objective }}</span>
            </td>
            <td class="py-2.5 text-right whitespace-nowrap">
              <button class="rounded-lg border border-primary-500 px-3 py-1 text-primary-700 hover:bg-primary-50 disabled:opacity-40" :disabled="busy" @click="open(it)">{{ t('เปิดดู', 'Open') }}</button>
              <button class="ml-2 rounded-lg border border-slate-300 px-3 py-1 text-slate-600 hover:border-err hover:text-err disabled:opacity-40" :disabled="busy" @click="pendingDelete = it">{{ t('ลบ', 'Delete') }}</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <ConfirmDialog
      :open="!!pendingLoad" :title="t('เปิดตารางที่บันทึกไว้?', 'Open saved timetable?')"
      :message="t('ตารางที่แสดงอยู่ตอนนี้จะถูกแทนที่ ถ้ายังไม่ได้บันทึกชื่อไว้ จะกลับมาดูไม่ได้', 'The timetable currently shown will be replaced. If it has not been saved with a name, you cannot get it back.')"
      :confirm-text="t('เปิดดู', 'Open')" :cancel-text="t('ยกเลิก', 'Cancel')" @confirm="doLoad(pendingLoad)" @cancel="pendingLoad = null"
    />
    <ConfirmDialog
      :open="!!pendingDelete" :title="t('ลบตารางที่บันทึกไว้?', 'Delete saved timetable?')"
      :message="pendingDelete ? t('ลบ', 'Delete') + ' “' + pendingDelete.name + '” ' + t('ออกถาวร ข้อมูลชุดข้อมูลไม่ได้รับผลกระทบ', '— this cannot be undone. Your dataset is not affected.') : ''"
      :confirm-text="t('ลบ', 'Delete')" :cancel-text="t('ยกเลิก', 'Cancel')" danger @confirm="doDelete" @cancel="pendingDelete = null"
    />
  </section>
</template>

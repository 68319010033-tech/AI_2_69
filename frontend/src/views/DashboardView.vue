<script setup>
import { computed, onMounted, ref } from 'vue'
import { useSessionStore } from '@/stores/session'
import { t, formatDate } from '@/i18n'
import { api } from '@/api'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
const store = useSessionStore()
const restoreInput = ref(null)
const pendingBackup = ref('')
const message = ref('')
const health = ref('Not checked')
const next = computed(() => store.generated ? '/timetable' : store.validated && !store.dirty ? '/generate' : store.canNext ? '/validate' : '/upload')
const checklist = computed(() => [
  { title: 'Prepare your data', detail: 'Upload CSV files or start with a sample.', done: store.ready, path: '/upload' },
  { title: 'Check and correct', detail: 'Resolve errors before generating a timetable.', done: store.validated && !store.dirty, path: '/validate' },
  { title: 'Generate a timetable', detail: 'Find a schedule that respects your constraints.', done: store.generated, path: '/generate' },
  { title: 'Review and export', detail: 'Review teachers, classes and rooms before sharing.', done: false, path: '/timetable' },
])
onMounted(() => { if (!store.canNext) store.refreshLatest() })
function backup() {
  const url = URL.createObjectURL(new Blob([store.backupData()], { type: 'application/json' }))
  const a = document.createElement('a'); a.href = url; a.download = 'phupha-data-backup.json'; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
async function chooseBackup(event) {
  try {
    const file = event.target.files[0]
    if (!file) return
    if (file.size > 20 * 1024 * 1024) throw new Error('Backup exceeds 20 MB')
    pendingBackup.value = await file.text()
  } catch { message.value = 'Unable to read backup.' }
  event.target.value = ''
}
function restore() {
  try { store.restoreBackup(pendingBackup.value); message.value = 'Backup restored. Validate the data before generating.' }
  catch { message.value = 'Invalid backup. Your current data has not changed.' }
  pendingBackup.value = ''
}
async function checkHealth() {
  health.value = 'Checking…'
  try { health.value = (await api.health()).ok ? 'Service available' : 'Service needs attention' }
  catch { health.value = 'Service unavailable. Please retry.' }
}
</script>
<template>
  <div class="mx-auto max-w-6xl p-6 md:p-10">
    <div class="rounded-2xl bg-primary-700 p-6 text-white md:p-8">
      <p class="text-sm font-semibold uppercase tracking-widest text-primary-100">PHU PHA · TIMETABLE</p>
      <h1 class="mt-3 text-3xl font-bold">{{ t('Your scheduling workspace') }}</h1>
      <p class="mt-2 text-primary-100">{{ t('Prepare confidently. Resolve issues. Build a better school week.') }}</p>
      <RouterLink :to="next" class="mt-6 inline-block rounded-lg bg-white px-5 py-3 font-semibold text-primary-700">{{ t('Continue your work') }} →</RouterLink>
    </div>
    <div class="mt-6 grid gap-4 sm:grid-cols-3">
      <div class="product-card"><p class="text-sm text-slate-500">{{ t('Files loaded') }}</p><p class="mt-2 text-3xl font-bold">{{ Object.keys(store.files).length }}<span class="text-lg text-slate-400"> / 10</span></p></div>
      <div class="product-card"><p class="text-sm text-slate-500">{{ t('Data status') }}</p><p class="mt-2 font-semibold">{{ t(store.dirty ? 'Changes need validation' : store.validated ? 'Ready to generate' : 'Not yet validated') }}</p></div>
      <div class="product-card"><p class="text-sm text-slate-500">{{ t('Last successful generation') }}</p><p class="mt-2 font-semibold">{{ store.lastGeneratedAt ? formatDate(store.lastGeneratedAt) : t('No timetable yet') }}</p><RouterLink v-if="store.generated" to="/timetable" class="text-primary-700 underline">{{ t('Open timetable') }}</RouterLink></div>
    </div>
    <div class="mt-6 grid gap-6 lg:grid-cols-3">
      <section class="product-card lg:col-span-2">
        <h2 class="text-lg font-bold">{{ t('Your next steps') }}</h2>
        <ol class="mt-4 divide-y divide-slate-100"><li v-for="(step, i) in checklist" :key="step.path" class="flex items-center gap-4 py-4"><span class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-50 font-bold text-primary-700">{{ step.done ? '✓' : i + 1 }}</span><div class="flex-1"><RouterLink :to="step.path" class="font-semibold text-primary-700">{{ t(step.title) }} →</RouterLink><p class="mt-1 text-sm text-slate-500">{{ t(step.detail) }}</p></div></li></ol>
      </section>
      <section class="product-card">
        <label for="term" class="font-semibold">{{ t('Academic term') }}</label>
        <input id="term" :value="store.term" maxlength="80" class="mt-2 w-full rounded-lg border p-2" :placeholder="t('e.g. Semester 1 / 2026')" @change="store.setTerm($event.target.value)" />
        <p class="mt-2 text-xs text-slate-500">{{ t('A label for this workspace and its backup.') }}</p>
        <h2 class="mt-6 font-semibold">{{ t('Keep a copy of your data') }}</h2>
        <p class="mt-2 text-sm text-slate-500">{{ t('Download input data before major edits. Backups do not include generated schedules.') }}</p>
        <button class="product-button mt-3 w-full" :disabled="!store.canNext" @click="backup">{{ t('Download backup') }}</button>
        <button class="mt-3 text-sm text-primary-700 underline" :disabled="store.editingLocked" @click="restoreInput.click()">{{ t('Restore backup') }}</button>
        <input ref="restoreInput" type="file" accept=".json" class="hidden" @change="chooseBackup" />
        <p role="status" class="mt-3 text-sm">{{ t(message) }}</p>
        <div class="mt-6 border-t pt-4"><button class="text-sm text-primary-700 underline" @click="checkHealth">{{ t('Check service status') }}</button><p role="status" class="mt-2 text-sm text-slate-500">{{ t(health) }}</p></div>
      </section>
    </div>
    <ConfirmDialog :open="!!pendingBackup" :title="t('Restore backup')" :message="t('Replace current input data with this backup? You can undo this change.')" :confirm-text="t('Restore backup')" :cancel-text="t('Cancel')" @confirm="restore" @cancel="pendingBackup = ''" />
  </div>
</template>

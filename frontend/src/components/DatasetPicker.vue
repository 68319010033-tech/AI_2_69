<script setup>
import { onMounted, ref } from 'vue'
import { api } from '@/api'
import { useSessionStore } from '@/stores/session'
import { t } from '@/i18n'
const store = useSessionStore()
const datasets = ref([])
const loading = ref(false)
const error = ref('')
async function refresh() {
  loading.value = true; error.value = ''
  try {
    datasets.value = await api.datasets()
    if (store.selectedDataset && !datasets.value.some(d => d.id === store.selectedDataset.id)) store.selectedDataset = null
  } catch { error.value = 'Unable to load datasets. Please retry.' }
  finally { loading.value = false }
}
function select(event) {
  store.selectedDataset = datasets.value.find(d => d.id === event.target.value) || null
  store.job = null
  store.generated = false
  store.schedule = []
  store.generationSessionId = ''
}
onMounted(refresh)
</script>
<template>
  <section class="product-card">
    <div class="flex items-center justify-between gap-3"><h2 class="text-lg font-semibold">{{ t('Choose a saved dataset') }}</h2><button class="text-sm text-primary-700 underline disabled:opacity-40" :disabled="loading || store.editingLocked" @click="refresh">{{ t('Refresh') }}</button></div>
    <p class="mt-2 text-sm text-slate-500">{{ t('Only validated, named datasets can be used to generate a timetable.') }}</p>
    <label for="generate-dataset" class="mt-4 block text-sm font-medium">{{ t('Dataset') }}</label>
    <select id="generate-dataset" :value="store.selectedDataset?.id || ''" :disabled="loading || store.editingLocked" class="mt-2 w-full rounded-lg border border-slate-300 bg-white p-3" @change="select">
      <option value="">{{ t(loading ? 'Loading…' : 'Select a saved dataset first') }}</option>
      <option v-for="dataset in datasets" :key="dataset.id" :value="dataset.id">{{ dataset.name }} · {{ new Date(dataset.createdAt).toLocaleString() }} · {{ dataset.id.slice(-4) }}</option>
    </select>
    <p v-if="store.selectedDataset" class="mt-3 text-sm text-slate-500">{{ store.selectedDataset.offerings }} {{ t('รายการสอน') }} · {{ store.selectedDataset.periods }} {{ t('คาบ') }}</p>
    <p v-if="error" role="alert" class="mt-3 text-red-700">{{ t(error) }}</p>
    <p v-else-if="!loading && !datasets.length" class="mt-3 text-sm text-slate-500">{{ t('No saved datasets yet. Validate your data and save it with a name.') }}</p>
    <RouterLink to="/validate" class="mt-3 inline-block text-sm text-primary-700 underline">{{ t('Validate and save another dataset') }} →</RouterLink>
  </section>
</template>

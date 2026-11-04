<script setup>
import { ref } from 'vue'
import { useSessionStore, REQUIRED_FILES } from '@/stores/session'
import { t } from '@/i18n'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
const store = useSessionStore()
const confirm = ref(false)
const busy = ref(false)
const error = ref('')
async function loadSample() {
  confirm.value = false; busy.value = true; error.value = ''
  try {
    const files = await Promise.all(REQUIRED_FILES.map(async name => {
      const response = await fetch(`${import.meta.env.BASE_URL}samples/${name}`)
      if (!response.ok) throw new Error('Sample unavailable')
      return new File([await response.text()], name, { type: 'text/csv' })
    }))
    await store.addFiles(files)
  } catch { error.value = 'Unable to load sample. Please retry.' }
  finally { busy.value = false }
}
</script>
<template>
  <section class="product-card mt-6">
    <h2 class="text-lg font-semibold">{{ t('New here? Start with a sample.') }}</h2>
    <p class="mt-2 text-sm text-slate-500">{{ t('Explore all 10 file types, then validate and generate. Sample data replaces the current input files.') }}</p>
    <button class="product-button mt-4" :disabled="busy || store.editingLocked" @click="store.canNext ? confirm = true : loadSample()">{{ t(busy ? 'Loading…' : 'Load sample data') }}</button>
    <details class="mt-4 text-sm"><summary class="cursor-pointer text-primary-700">{{ t('Download example CSV files') }}</summary><div class="mt-3 flex flex-wrap gap-3"><a v-for="name in REQUIRED_FILES" :key="name" :href="`/samples/${name}`" :download="name" class="text-primary-700 underline">{{ name }}</a></div></details>
    <p v-if="error" role="alert" class="mt-3 text-red-700">{{ t(error) }}</p>
    <ConfirmDialog :open="confirm" :title="t('Load sample data')" :message="t('Replace your current files with sample data? Download a backup from the dashboard first if needed.')" :confirm-text="t('Load sample data')" :cancel-text="t('Cancel')" @confirm="loadSample" @cancel="confirm = false" />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import { t } from '@/i18n'

const props = defineProps({ issue: { type: Object, required: true } })
const emit = defineEmits(['recheck', 'locate'])
const store = useSessionStore()
const editing = ref(false)
const draft = ref('')
const file = computed(() => props.issue.file + '.csv')
const column = computed(() => props.issue.columnIndices?.length === 1 ? props.issue.columnIndices[0] : -1)
const row = computed(() => store.files[file.value]?.data[props.issue.rowIndex])
const editable = computed(() => props.issue.severity === 'error' && Number.isInteger(props.issue.rowIndex)
    && column.value >= 0 && typeof row.value?.[column.value] === 'string')
const current = computed(() => editable.value ? row.value[column.value] : '')
watch(() => props.issue, () => { editing.value = false })
function start() {
    draft.value = current.value
    editing.value = true
}
function apply() {
    if (!editable.value || store.editingLocked || draft.value === current.value) return
    store.updateCell(file.value, props.issue.rowIndex, column.value, draft.value)
    editing.value = false
    emit('recheck')
}
</script>
<template>
    <form v-if="editing && editable" class="min-w-44 space-y-2" @submit.prevent="apply">
        <label class="block text-sm">{{ t('ค่าที่ถูกต้อง', 'Corrected value') }}
            <textarea v-model="draft" :disabled="store.editingLocked" rows="1" class="mt-1 block w-full rounded border bg-white p-2"></textarea>
        </label>
        <button :disabled="store.editingLocked || draft === current" class="product-button text-sm" type="submit">{{ t('บันทึกและตรวจสอบอีกครั้ง') }}</button>
        <button type="button" class="ml-2 underline" @click="editing = false">{{ t('ยกเลิก') }}</button>
    </form>
    <div v-else class="space-y-1">
        <template v-if="editable">
            <p class="break-words">{{ t('ค่าปัจจุบัน', 'Current value') }}: <strong>{{ current || t('(ว่าง)') }}</strong></p>
            <button type="button" :disabled="store.editingLocked" class="font-semibold underline" @click="start">{{ t('แก้ค่านี้', 'Correct value') }}</button>
        </template>
        <button type="button" class="block whitespace-nowrap underline" @click="emit('locate')">{{ t('ดูในตาราง', 'Show in table') }}</button>
    </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { t } from '@/i18n'
import { DAYS, TIME } from '@/lib/timetable'

const props = defineProps({ session: { type: Object, required: true } })
const emit = defineEmits(['close'])
const dialog = ref(null)
const range = computed(() => {
  const start = Number(props.session.start_period)
  return [TIME[start]?.[0], TIME[start + Number(props.session.periods) - 1]?.[1]].filter(Boolean).join('–')
})
onMounted(() => dialog.value.showModal())
function closeOutside(event) {
  const { left, right, top, bottom } = dialog.value.getBoundingClientRect()
  if (event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom) dialog.value.close()
}
</script>

<template>
  <Teleport to="body">
    <dialog ref="dialog" class="session-dialog m-auto w-[min(32rem,92vw)] rounded-2xl border border-slate-200 bg-white p-6 text-slate-800 shadow-xl"
      aria-labelledby="session-details-title" @close="emit('close')" @click.self="closeOutside">
      <div class="flex items-start justify-between gap-4">
        <h2 id="session-details-title" class="text-xl font-bold">{{ session.course_name || session.course_id }}</h2>
        <button type="button" autofocus class="rounded-lg border px-3 py-1" @click="dialog.close()">{{ t('ปิด', 'Close') }}</button>
      </div>
      <dl class="mt-5 grid grid-cols-[auto_1fr] gap-x-5 gap-y-3">
        <dt>{{ t('รหัสวิชา') }}</dt><dd>{{ session.course_id }}</dd>
        <dt>{{ t('กลุ่มเรียน') }}</dt><dd>{{ session.group_name || session.group_id }}</dd>
        <dt>{{ t('ครูผู้สอน') }}</dt><dd>{{ session.teacher_name || session.teacher_id }}</dd>
        <dt>{{ t('ห้อง') }}</dt><dd>{{ session.room_name || session.room_id }}</dd>
        <dt>{{ t('วัน') }}</dt><dd>{{ t(DAYS.find(day => day.k === session.day)?.l || session.day) }}</dd>
        <dt>{{ t('เวลา') }}</dt><dd>{{ range }} ({{ session.periods }} {{ t('คาบ') }})</dd>
      </dl>
    </dialog>
  </Teleport>
</template>

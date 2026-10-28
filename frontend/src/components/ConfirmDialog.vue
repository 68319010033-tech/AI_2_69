<script setup>
import { nextTick, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: 'ตกลง' },
  cancelText: { type: String, default: 'ยกเลิก' },
  danger: { type: Boolean, default: false },
})
const emit = defineEmits(['confirm', 'cancel'])

const cancelBtn = ref(null)
const okBtn = ref(null)
let prevFocus = null

// เปิด → โฟกัสปุ่มยกเลิก (ปลอดภัยกว่า) · ปิด → คืนโฟกัสให้ที่เดิม
watch(() => props.open, async (v) => {
  if (v) {
    prevFocus = document.activeElement
    await nextTick()
    cancelBtn.value?.focus()
  } else {
    prevFocus?.focus?.()
    prevFocus = null
  }
})

// วนโฟกัสอยู่ในกล่องโต้ตอบ
function onTab(e) {
  const first = cancelBtn.value
  const last = okBtn.value
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus() }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
}
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out motion-reduce:transition-none"
      enter-from-class="opacity-0"
      leave-active-class="transition duration-100 ease-in motion-reduce:transition-none"
      leave-to-class="opacity-0"
    >
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
        @mousedown.self="emit('cancel')"
      >
        <div
          role="alertdialog"
          aria-modal="true"
          :aria-label="title"
          class="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
          @keydown.esc="emit('cancel')"
          @keydown.tab="onTab"
        >
          <div class="flex gap-4">
            <div
              class="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              :class="danger ? 'bg-red-50 text-err' : 'bg-primary-50 text-primary-700'"
            >
              <AppIcon :name="danger ? 'trash' : 'alert'" class="h-5 w-5" />
            </div>
            <div class="min-w-0">
              <h2 class="text-base font-bold text-slate-800">{{ title }}</h2>
              <p class="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-slate-500">{{ message }}</p>
            </div>
          </div>
          <div class="mt-6 flex justify-end gap-2">
            <button
              ref="cancelBtn"
              class="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              @click="emit('cancel')"
            >{{ cancelText }}</button>
            <button
              ref="okBtn"
              class="rounded-lg px-4 py-2 text-sm font-semibold text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
              :class="danger ? 'bg-err hover:bg-red-700 focus-visible:ring-err' : 'bg-primary-600 hover:bg-primary-700 focus-visible:ring-primary-500'"
              @click="emit('confirm')"
            >{{ confirmText }}</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
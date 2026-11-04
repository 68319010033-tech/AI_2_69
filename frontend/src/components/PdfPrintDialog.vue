<script setup>
import { computed, nextTick, reactive, ref, watch } from 'vue'
import { VIEWS, listEntries } from '@/utils/exportSchedule'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  sessions: { type: Array, default: () => [] },
  loading: { type: Boolean, default: false },
  error: { type: String, default: '' },
})
const emit = defineEmits(['close', 'print', 'retry'])

const panel = ref(null)
const perPage = ref(1)
const sel = reactive({ group: new Set(), teacher: new Set(), room: new Set() })

const entries = computed(() => listEntries(props.sessions))

// ข้อมูลโหลดมาใหม่ → เลือกทั้งหมดเป็นค่าเริ่มต้น (เท่ากับพฤติกรรมเดิม)
watch(
  () => props.sessions,
  (s) => {
    const e = listEntries(s)
    for (const v of VIEWS) sel[v.key] = new Set(e[v.key].map((x) => x.id))
  },
  { immediate: true },
)

const total = computed(() => VIEWS.reduce((a, v) => a + sel[v.key].size, 0))
const pages = computed(() => Math.ceil(total.value / perPage.value))

function toggle(key, id) {
  const s = sel[key]
  if (s.has(id)) s.delete(id)
  else s.add(id)
}
const selectAll = (key) => { sel[key] = new Set(entries.value[key].map((x) => x.id)) }
const clearAll = (key) => { sel[key] = new Set() }

function submit() {
  if (!total.value) return
  const selection = {}
  for (const v of VIEWS) if (sel[v.key].size) selection[v.key] = [...sel[v.key]]
  emit('print', { selection, perPage: perPage.value })
}

watch(() => props.open, async (v) => {
  if (v) {
    await nextTick()
    panel.value?.focus()
  }
})
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
        @mousedown.self="emit('close')"
      >
        <div
          ref="panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pdf-dialog-title"
          tabindex="-1"
          class="flex max-h-[88vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl focus:outline-none"
          @keydown.esc="emit('close')"
        >
          <!-- หัว -->
          <div class="flex items-start justify-between gap-4 border-b border-slate-100 px-6 py-4">
            <div>
              <h2 id="pdf-dialog-title" class="text-lg font-bold text-slate-800">พิมพ์ / บันทึกเป็น PDF</h2>
              <p class="mt-0.5 text-sm text-slate-500">เลือกตารางที่ต้องการ และรูปแบบการจัดหน้า</p>
            </div>
            <button
              class="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              aria-label="ปิด"
              @click="emit('close')"
            ><AppIcon name="x" :size="18" /></button>
          </div>

          <!-- เนื้อหา -->
          <div class="flex-1 overflow-auto px-6 py-4">
            <div v-if="loading" class="flex items-center gap-3 py-10 text-slate-600">
              <span class="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
              กำลังโหลดข้อมูลตาราง…
            </div>

            <div v-else-if="error" class="py-8 text-center">
              <p class="text-err">❌ {{ error }}</p>
              <button class="mt-3 rounded-lg border border-primary-500 px-4 py-1.5 text-sm text-primary-700 hover:bg-primary-50" @click="emit('retry')">ลองใหม่</button>
            </div>

            <template v-else>
              <!-- เลือกตาราง -->
              <section v-for="v in VIEWS" :key="v.key" class="mb-5">
                <div class="mb-2 flex items-center gap-3">
                  <h3 class="text-sm font-semibold text-slate-700">
                    {{ v.label }}
                    <span class="ml-1 font-normal text-slate-400">เลือก {{ sel[v.key].size }}/{{ entries[v.key].length }}</span>
                  </h3>
                  <div class="flex gap-1 text-xs">
                    <button class="rounded px-2 py-0.5 text-primary-700 hover:bg-primary-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" @click="selectAll(v.key)">เลือกทั้งหมด</button>
                    <button class="rounded px-2 py-0.5 text-slate-500 hover:bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" @click="clearAll(v.key)">ล้าง</button>
                  </div>
                </div>
                <p v-if="!entries[v.key].length" class="text-sm text-slate-400">ไม่มีข้อมูล</p>
                <div v-else class="flex flex-wrap gap-1.5">
                  <label v-for="e in entries[v.key]" :key="e.id" class="cursor-pointer">
                    <input
                      type="checkbox"
                      class="peer sr-only"
                      :checked="sel[v.key].has(e.id)"
                      @change="toggle(v.key, e.id)"
                    />
                    <span
                      class="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-600 transition-colors hover:border-primary-500 peer-checked:border-primary-600 peer-checked:bg-primary-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500 peer-focus-visible:ring-offset-1"
                    >
                      {{ e.name }}
                      <span class="text-xs opacity-70">{{ e.count }}</span>
                    </span>
                  </label>
                </div>
              </section>

              <!-- จัดหน้า -->
              <section>
                <h3 class="mb-2 text-sm font-semibold text-slate-700">การจัดหน้า</h3>
                <div class="grid gap-3 sm:grid-cols-2">
                  <label v-for="o in [
                    { v: 1, t: '1 ตารางต่อหน้า', d: 'A4 แนวนอน · ตารางใหญ่ อ่านง่าย' },
                    { v: 2, t: '2 ตารางต่อหน้า', d: 'A4 แนวตั้ง · ประหยัดกระดาษ' },
                  ]" :key="o.v" class="cursor-pointer">
                    <input v-model="perPage" type="radio" name="perpage" :value="o.v" class="peer sr-only" />
                    <span class="flex items-center gap-4 rounded-xl border-2 border-slate-200 p-3 transition-colors hover:border-primary-300 peer-checked:border-primary-600 peer-checked:bg-primary-50 peer-focus-visible:ring-2 peer-focus-visible:ring-primary-500">
                      <!-- ภาพย่อหน้ากระดาษ -->
                      <span
                        class="flex shrink-0 flex-col justify-center gap-1 rounded border border-slate-300 bg-white p-1.5"
                        :class="o.v === 1 ? 'h-12 w-16' : 'h-16 w-12'"
                        aria-hidden="true"
                      >
                        <span v-for="k in o.v" :key="k" class="block flex-1 rounded-sm bg-primary-200" />
                      </span>
                      <span>
                        <span class="block text-sm font-semibold text-slate-800">{{ o.t }}</span>
                        <span class="block text-xs text-slate-500">{{ o.d }}</span>
                      </span>
                    </span>
                  </label>
                </div>
              </section>
            </template>
          </div>

          <!-- ท้าย -->
          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-6 py-4">
            <p class="text-sm" :class="total ? 'text-slate-600' : 'text-warn'">
              <template v-if="total">เลือก <b>{{ total }}</b> ตาราง · ประมาณ <b>{{ pages }}</b> หน้า</template>
              <template v-else>ยังไม่ได้เลือกตาราง</template>
            </p>
            <div class="flex gap-2">
              <button class="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500" @click="emit('close')">ยกเลิก</button>
              <button
                class="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
                :disabled="!total || loading || !!error"
                @click="submit"
              >🖨 พิมพ์ / บันทึกเป็น PDF</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
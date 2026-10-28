<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useSessionStore } from '@/stores/session'
import AppIcon from '@/components/AppIcon.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const store = useSessionStore()

const open = ref(false)
const root = ref(null)
const trigger = ref(null)
const nameInput = ref(null)
const name = ref('')
const msg = ref(null) // { ok, text } แจ้งผลหลังบันทึก
let msgTimer = null

const dialog = ref(null)
let pending = null

const fmt = (t) =>
  new Date(t).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

const sameName = computed(() =>
  store.snapshots.some((s) => s.name.trim().toLowerCase() === name.value.trim().toLowerCase()),
)
const canSave = computed(() => !!name.value.trim() && Object.keys(store.drafts).length > 0)

function info(s) {
  const f = Object.values(s.data)
  return `${f.length} ไฟล์ · ${f.reduce((a, d) => a + d.rows.length, 0)} แถว`
}

function flash(m) {
  msg.value = m
  clearTimeout(msgTimer)
  msgTimer = setTimeout(() => { msg.value = null }, 2500)
}

// ---------- เปิด/ปิดเมนู ----------
function onDocDown(e) {
  if (dialog.value) return // กำลังเปิดกล่องยืนยันอยู่ (อยู่นอกเมนู) ไม่ต้องปิด
  if (!root.value?.contains(e.target)) open.value = false
}
function onKey(e) {
  if (e.key === 'Escape' && !dialog.value) {
    open.value = false
    trigger.value?.focus()
  }
}
watch(open, async (v) => {
  if (v) {
    name.value = `ชุดข้อมูล ${fmt(Date.now())}`
    msg.value = null
    document.addEventListener('mousedown', onDocDown)
    document.addEventListener('keydown', onKey)
    await nextTick()
    nameInput.value?.select()
  } else {
    document.removeEventListener('mousedown', onDocDown)
    document.removeEventListener('keydown', onKey)
  }
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onDocDown)
  document.removeEventListener('keydown', onKey)
  clearTimeout(msgTimer)
})

// ---------- actions ----------
function save() {
  if (!canSave.value) return
  const r = store.saveSnapshot(name.value)
  flash(r.ok ? { ok: true, text: r.replaced ? 'บันทึกทับชุดเดิมแล้ว' : 'บันทึกชุดข้อมูลแล้ว' } : { ok: false, text: r.error })
}

function ask(opts, action) {
  dialog.value = opts
  pending = action
}
function runDialog() {
  const fn = pending
  dialog.value = null
  pending = null
  fn?.()
}
function closeDialog() {
  dialog.value = null
  pending = null
}

function doLoad(s) {
  if (store.loadSnapshot(s.id)) open.value = false
}
function askLoad(s) {
  if (!store.editedTotal) return doLoad(s)
  ask(
    {
      title: `โหลดชุด "${s.name}"?`,
      message: 'ข้อมูลที่แก้อยู่ตอนนี้จะถูกแทนที่ทั้งหมด และกด "ย้อนกลับ" เอาคืนไม่ได้\nถ้ายังไม่ได้บันทึกเป็นชุด ให้บันทึกก่อน',
      confirmText: 'โหลดชุดนี้',
      danger: true,
    },
    () => doLoad(s),
  )
}
function askDelete(s) {
  ask(
    { title: `ลบชุด "${s.name}"?`, message: 'ลบแล้วเอาคืนไม่ได้', confirmText: 'ลบชุดนี้', danger: true },
    () => store.deleteSnapshot(s.id),
  )
}
</script>

<template>
  <div ref="root" class="relative">
    <!-- ปุ่มเปิดเมนู: เด่นกว่าปุ่มอื่นในแถบเครื่องมือ -->
    <button
      ref="trigger"
      class="inline-flex h-9 items-center gap-2 rounded-lg border-2 border-primary-500 px-3.5 text-sm font-semibold text-primary-700 shadow-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      :class="open ? 'bg-primary-100' : 'bg-primary-50 hover:bg-primary-100'"
      aria-haspopup="true"
      :aria-expanded="open"
      @click="open = !open"
    >
      <AppIcon name="save" :size="18" class="text-primary-600" />
      ชุดข้อมูล
      <span
        v-if="store.snapshots.length"
        class="min-w-[1.5rem] rounded-full bg-primary-600 px-2 text-center text-xs font-bold leading-6 text-white"
      >{{ store.snapshots.length }}</span>
      <AppIcon name="chevron" :size="16" class="transition-transform motion-reduce:transition-none" :class="open ? 'rotate-180' : ''" />
    </button>

    <div
      v-if="open"
      class="absolute left-0 z-30 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl ring-1 ring-black/5"
    >
      <!-- บันทึกชุดใหม่ -->
      <div class="bg-primary-50/60 p-4">
        <label for="snapshot-name" class="text-sm font-semibold text-slate-800">บันทึกข้อมูลที่แก้อยู่เป็นชุดใหม่</label>
        <p class="mt-0.5 text-xs text-slate-500">เก็บสำเนาข้อมูลทั้ง 10 ไฟล์ไว้ โหลดกลับมาแก้ต่อได้ภายหลัง</p>
        <div class="mt-2.5 flex gap-2">
          <input
            id="snapshot-name"
            ref="nameInput"
            v-model="name"
            type="text"
            maxlength="60"
            autocomplete="off"
            placeholder="ตั้งชื่อชุดข้อมูล"
            class="h-10 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30"
            @keydown.enter.prevent="save"
          />
          <button
            class="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
            :disabled="!canSave"
            @click="save"
          ><AppIcon name="save" :size="16" />บันทึก</button>
        </div>
        <p v-if="sameName" class="mt-2 flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">
          <AppIcon name="alert" :size="14" />มีชื่อนี้อยู่แล้ว — จะบันทึกทับชุดเดิม
        </p>
        <p
          v-if="msg"
          role="status"
          class="mt-2 flex items-center gap-1.5 text-sm font-medium"
          :class="msg.ok ? 'text-ok' : 'text-err'"
        >
          <AppIcon :name="msg.ok ? 'check' : 'alert'" :size="16" />{{ msg.text }}
        </p>
      </div>

      <!-- รายการชุดที่บันทึกไว้ -->
      <div class="border-t border-slate-200">
        <div class="px-4 pb-1.5 pt-3 text-sm font-semibold text-slate-800">ชุดที่บันทึกไว้ ({{ store.snapshots.length }})</div>
        <p v-if="!store.snapshots.length" class="px-4 pb-5 pt-1 text-sm text-slate-400">ยังไม่มีชุดที่บันทึกไว้</p>
        <ul v-else class="max-h-72 divide-y divide-slate-100 overflow-auto pb-1">
          <li v-for="s in store.snapshots" :key="s.id" class="flex items-center gap-3 px-4 py-3 hover:bg-primary-50/50">
            <div class="min-w-0 flex-1">
              <div class="truncate text-[15px] font-semibold text-slate-800" :title="s.name">{{ s.name }}</div>
              <div class="mt-0.5 text-xs text-slate-500">{{ fmt(s.savedAt) }} · {{ info(s) }}</div>
            </div>
            <button
              class="shrink-0 rounded-lg bg-primary-600 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
              @click="askLoad(s)"
            >โหลด</button>
            <button
              class="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-err focus:outline-none focus-visible:ring-2 focus-visible:ring-err"
              :aria-label="`ลบชุด ${s.name}`"
              title="ลบชุดนี้"
              @click="askDelete(s)"
            ><AppIcon name="trash" :size="18" /></button>
          </li>
        </ul>
      </div>
    </div>

    <ConfirmDialog
      :open="!!dialog"
      :title="dialog?.title"
      :message="dialog?.message"
      :confirm-text="dialog?.confirmText"
      :danger="dialog?.danger"
      @confirm="runDialog"
      @cancel="closeDialog"
    />
  </div>
</template>
<script setup>
import { findConflicts } from '@/lib/scheduleReview'
import { t as tr } from '@/i18n'
import { ref, computed, watch, onMounted, nextTick } from 'vue'
import { toPng } from 'html-to-image'
import { useRouter } from 'vue-router'
import SessionDetails from '@/components/SessionDetails.vue'
import TimetableGrid from '@/components/TimetableGrid.vue'
import TimetableFormal from '@/components/TimetableFormal.vue'
import { useSessionStore } from '@/stores/session'
const sheet = ref(null)
const details = ref(null)
const capturing = ref(false)
const modeLabel = computed(() => ({ group: 'กลุ่มเรียน', teacher: 'ครู', room: 'ห้อง' })[mode.value])

// แจกสีต่อวิชา: มุม hue กระจายห่างกันสม่ำเสมอ ไม่ซ้ำกัน
const colors = computed(() => {
    const ids = [...new Set(store.schedule.map((s) => s.course_id))].sort()
    return Object.fromEntries(ids.map((id, i) => [id, Math.round((i * 137.508) % 360)]))
})

async function download() {
    if (!sheet.value || capturing.value) return
    capturing.value = true
    try {
        await nextTick()
        const el = sheet.value
        const url = await toPng(el, {
            pixelRatio: 2,
            backgroundColor: '#ffffff',
            width: el.scrollWidth,
            height: el.scrollHeight,
        })
        const a = document.createElement('a')
        a.href = url
        a.download = `timetable-${look.value}-${mode.value}-${selected.value}.png`
        a.click()
    } finally {
        capturing.value = false
    }
}
const store = useSessionStore()
const router = useRouter()

const tabs = [
    { k: 'group', l: 'ตามกลุ่มเรียน', f: 'group_id' },
    { k: 'teacher', l: 'ตามครู', f: 'teacher_id' },
    { k: 'room', l: 'ตามห้อง', f: 'room_id' },
]
const mode = ref('group')
const look = ref('color') // color | formal
const selected = ref('')
const query = ref('')
const conflicts = computed(() => findConflicts(store.schedule))
const matchingOptions = computed(() => options.value.filter(id => `${id} ${optionLabel(id)}`.toLowerCase().includes(query.value.toLowerCase())))

const field = computed(() => tabs.find((t) => t.k === mode.value).f)
const listKey = computed(() => ({ group: 'groups', teacher: 'teachers', room: 'rooms' })[mode.value])
const options = computed(() => {
  const l = store.lists?.[listKey.value]
  if (l?.length) return l.map((x) => (typeof x === 'string' ? x : x.id))
  return [...new Set((store.schedule || []).map((s) => s[field.value]))].sort()
})
watch(
    options,
    (list) => { if (!list.includes(selected.value)) selected.value = list[0] || '' },
    { immediate: true },
)
const sessions = computed(() => store.schedule.filter((s) => s[field.value] === selected.value))
const totalPeriods = computed(() => sessions.value.reduce((a, s) => a + s.periods, 0))

function optionLabel(id) {
  if (!id) return ''
  const l = store.lists?.[listKey.value]
  if (l?.length) {
    const item = l.find((x) => (typeof x === 'string' ? x : x.id) === id)
    if (item && typeof item === 'object' && item.name) {
      return item.name
    }
  }
  return id
}

onMounted(() => { if (!store.schedule.length && store.generationSessionId) store.loadSchedule() })
</script>

<template>
    <div class="mx-auto max-w-5xl p-6 md:p-10">
        <h1 class="text-2xl font-bold text-primary-700"> {{ tr("④ ดูตารางสอน") }} </h1>
        <p class="mt-1 text-slate-500"> {{ tr("เลือกมุมมองและรายการที่ต้องการดู") }} </p>

        <div v-if="store.scheduleLoading"
            class="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <span class="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <span class="text-slate-600"> {{ tr("กำลังโหลดตาราง…") }} </span>
        </div>

        <template v-else>
<section v-if="store.scheduleError || !store.schedule.length" class="product-card mt-6" role="status"><p>{{ tr(store.scheduleError || 'No timetable yet') }}</p><button v-if="store.sessionId" class="mt-3 text-primary-700 underline" @click="store.loadSchedule()">{{ tr('Retry') }}</button><RouterLink v-else to="/generate" class="mt-3 block text-primary-700 underline">{{ tr('Generate a timetable') }}</RouterLink></section>
<section v-if="store.schedule.length" class="product-card mt-6" :class="conflicts.length ? 'border-red-300 bg-red-50' : ''"><h2 class="font-semibold">{{ tr('Schedule review') }}</h2><p class="mt-2 text-sm">{{ tr(conflicts.length ? 'Overlapping bookings found. Review these sessions before exporting.' : 'No overlapping teacher, room or class bookings detected.') }}</p><p class="mt-1 text-xs text-slate-500">{{ tr('This overlap check supplements the full server validation report.') }}</p><ul class="mt-3 space-y-2"><li v-for="(conflict, i) in conflicts" :key="i" class="rounded-lg border border-red-200 p-3 text-sm text-red-800">{{ conflict.a.day }} · {{ conflict.a.offering_id }} ↔ {{ conflict.b.offering_id }} · {{ conflict.resources.map(key => conflict.a[key]).join(', ') }}</li></ul></section>
            <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div class="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button v-for="t in tabs" :key="t.k" class="rounded-lg px-4 py-1.5 text-sm transition"
                        :class="mode === t.k ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
                        @click="mode = t.k">{{ tr(t.l) }}</button>
                </div>

                <div class="flex flex-wrap items-center gap-3">
                    <div class="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                        <button v-for="l in [{ k: 'color', t: '🎨 สีสัน' }, { k: 'formal', t: '📋 ทางการ' }]" :key="l.k"
                            class="rounded-lg px-3 py-1.5 text-sm transition"
                            :class="look === l.k ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
                            @click="look = l.k">{{ tr(l.t) }}</button>
                    </div>
                    <input v-model="query" type="search" :aria-label="tr('Search teachers, classes or rooms')" :placeholder="tr('Search…')" class="w-40 rounded-lg border p-2 text-sm" /><select v-model="selected" :aria-label="tr('Select timetable')"
                        class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none">
                        <option v-for="o in matchingOptions" :key="o" :value="o">{{ optionLabel(o) }}</option>
                    </select>
                    <button
                        class="rounded-lg border border-primary-500 px-3 py-1.5 text-sm text-primary-700 hover:bg-primary-50"
                        :disabled="!sessions.length" @click="download"> {{ tr("⬇ ดาวน์โหลดรูป") }} </button>
                </div>
            </div>

            <p class="mt-3 text-sm text-slate-500">
                {{ sessions.length }} {{ tr("รายการ ·") }} {{ totalPeriods }} {{ tr("คาบ/สัปดาห์") }} </p>

            <div class="mt-3 overflow-x-auto pb-8">
                <div ref="sheet" :class="capturing ? 'export-surface' : 'screen-sheet'" class="min-w-[900px] rounded-2xl bg-white p-5">
                     <div v-if="look === 'color'" class="mb-3 flex items-center justify-between">
                        <div class="text-2xl font-bold text-primary-700"> {{ tr("ตารางเรียน") }} </div>
                        <div class="rounded-full border-2 border-primary-500 px-5 py-1 font-semibold text-primary-700">
                            {{ tr(modeLabel) }}: {{ optionLabel(selected) }}
                        </div>
                    </div>
            <TimetableGrid v-if="look === 'color'" :sessions="sessions" :mode="mode" :colors="colors" @select="details = $event" />
          <TimetableFormal v-else :sessions="sessions" :mode="mode" :title="`${tr(modeLabel)} ${optionLabel(selected)}`" @select="details = $event" />
                </div>
            </div>

            <div class="mt-6 flex items-center justify-between">
                <RouterLink to="/generate" class="text-slate-500 hover:text-primary-700"> {{ tr("← กลับ") }} </RouterLink>
                <button
                    class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700"
                    :disabled="!store.schedule.length || conflicts.length > 0" @click="router.push('/export')"> {{ tr("ถัดไป: ส่งออกผลลัพธ์ →") }} </button>
            </div>
        </template>
    </div>
    <SessionDetails v-if="details" :session="details" @close="details = null" />
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { toPng } from 'html-to-image'
import { useRouter } from 'vue-router'
import TimetableGrid from '@/components/TimetableGrid.vue'
import TimetableFormal from '@/components/TimetableFormal.vue'
import { useSessionStore } from '@/stores/session'
const sheet = ref(null)
const modeLabel = computed(() => ({ group: 'กลุ่มเรียน', teacher: 'ครู', room: 'ห้อง' })[mode.value])

// แจกสีต่อวิชา: มุม hue กระจายห่างกันสม่ำเสมอ ไม่ซ้ำกัน
const colors = computed(() => {
    const ids = [...new Set(store.schedule.map((s) => s.course_id))].sort()
    return Object.fromEntries(ids.map((id, i) => [id, Math.round((i * 137.508) % 360)]))
})

async function download() {
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

const field = computed(() => tabs.find((t) => t.k === mode.value).f)
const options = computed(() => [...new Set(store.schedule.map((s) => s[field.value]))].sort())
watch(
    options,
    (list) => { if (!list.includes(selected.value)) selected.value = list[0] || '' },
    { immediate: true },
)
const sessions = computed(() => store.schedule.filter((s) => s[field.value] === selected.value))
const totalPeriods = computed(() => sessions.value.reduce((a, s) => a + s.periods, 0))

onMounted(() => { if (!store.schedule.length) store.loadSchedule() })
</script>

<template>
    <div class="mx-auto max-w-5xl p-6 md:p-10">
        <h1 class="text-2xl font-bold text-primary-700">④ ดูตารางสอน</h1>
        <p class="mt-1 text-slate-500">เลือกมุมมองและรายการที่ต้องการดู</p>

        <div v-if="store.scheduleLoading"
            class="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
            <span class="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
            <span class="text-slate-600">กำลังโหลดตาราง…</span>
        </div>

        <template v-else>
            <div class="mt-6 flex flex-wrap items-center justify-between gap-3">
                <div class="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                    <button v-for="t in tabs" :key="t.k" class="rounded-lg px-4 py-1.5 text-sm transition"
                        :class="mode === t.k ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
                        @click="mode = t.k">{{ t.l }}</button>
                </div>

                <div class="flex items-center gap-3">
                    <div class="flex gap-1 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                        <button v-for="l in [{ k: 'color', t: '🎨 สีสัน' }, { k: 'formal', t: '📋 ทางการ' }]" :key="l.k"
                            class="rounded-lg px-3 py-1.5 text-sm transition"
                            :class="look === l.k ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
                            @click="look = l.k">{{ l.t }}</button>
                    </div>
                    <select v-model="selected"
                        class="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none">
                        <option v-for="o in options" :key="o" :value="o">{{ o }}</option>
                    </select>
                    <button
                        class="rounded-lg border border-primary-500 px-3 py-1.5 text-sm text-primary-700 hover:bg-primary-50"
                        @click="download">⬇ ดาวน์โหลดรูป</button>
                </div>
            </div>

            <p class="mt-3 text-sm text-slate-500">
                {{ sessions.length }} รายการ · {{ totalPeriods }} คาบ/สัปดาห์
            </p>

            <div class="mt-3 overflow-x-auto pb-8">
                <div ref="sheet" class="min-w-[900px] rounded-2xl bg-white p-5">
                     <div v-if="look === 'color'" class="mb-3 flex items-center justify-between">
                        <div class="text-2xl font-bold text-primary-700">ตารางเรียน</div>
                        <div class="rounded-full border-2 border-primary-500 px-5 py-1 font-semibold text-primary-700">
                            {{ modeLabel }}: {{ selected }}
                        </div>
                    </div>
            <TimetableGrid v-if="look === 'color'" :sessions="sessions" :mode="mode" :colors="colors" />
          <TimetableFormal v-else :sessions="sessions" :mode="mode" :title="`${modeLabel} ${selected}`" />
                </div>
            </div>

            <div class="mt-6 flex items-center justify-between">
                <RouterLink to="/generate" class="text-slate-500 hover:text-primary-700">← กลับ</RouterLink>
                <button
                    class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700"
                    @click="router.push('/export')">ถัดไป: ส่งออกผลลัพธ์ →</button>
            </div>
        </template>
    </div>
</template>
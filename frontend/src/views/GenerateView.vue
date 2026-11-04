<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import AppIcon from '@/components/AppIcon.vue'

const store = useSessionStore()
const router = useRouter()

const timeLimit = ref(30)
const presets = [
  { s: 15, t: 'เร็ว' },
  { s: 30, t: 'มาตรฐาน' },
  { s: 60, t: 'ละเอียด' },
  { s: 120, t: 'ละเอียดมาก' },
]

// ตัวนับเวลาฝั่งหน้าเว็บ ให้ตัวเลขเดินลื่นระหว่างรอ poll
const now = ref(Date.now())
let tick = null
onMounted(() => { tick = setInterval(() => (now.value = Date.now()), 200) })
onUnmounted(() => clearInterval(tick))

const elapsed = computed(() => Math.max(0, (now.value - store.startedAt) / 1000))
const progress = computed(() => Math.min((elapsed.value / timeLimit.value) * 100, 100))
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const job = computed(() => store.job)
const notReady = computed(() => !store.sessionId || !store.validated)
const canStart = computed(() => !notReady.value && !store.generating && timeLimit.value >= 5)
const start = () =>
  store.startGenerate({ timeLimitSec: Math.min(Math.max(timeLimit.value || 30, 5), 600), method: 'cpsat' })

const statusText = {
  OPTIMAL: 'ดีที่สุดแล้ว',
  FEASIBLE: 'ใช้ได้ (ยังปรับให้ดีขึ้นได้อีก)',
  INFEASIBLE: 'จัดไม่ได้',
}

const steps = [
  { n: 1, t: 'หาตารางที่ไม่ชนกัน', d: 'ตรวจกติกา 12 ข้อ ไม่ให้ครู ห้อง หรือกลุ่มเรียนซ้อนเวลา' },
  { n: 2, t: 'ปรับให้ลงตัวขึ้น', d: 'ลดคาบว่างของครูและกระจายภาระของกลุ่ม' },
  { n: 3, t: 'ตรวจผลและสรุป', d: 'ตรวจกติกาทั้ง 12 ข้อก่อนแสดงตาราง' },
]

// ---------- รายละเอียดว่า AI กำลังทำอะไร (จากค่าจริงที่ backend ส่งมา) ----------
const history = ref([]) // [{ t: วินาที, v: คะแนน }]
const events = ref([]) // [{ t, text, kind }]

watch(
  () => store.generating,
  (g) => {
    if (!g) return
    history.value = []
    events.value = [{ t: 0, kind: 'info', text: `เริ่มคำนวณด้วย CP-SAT (เวลาสูงสุด ${timeLimit.value} วินาที)` }]
  },
)

watch(
  () => store.job?.bestSoFar,
  (v, old) => {
    if (!store.generating || v == null) return
    const t = elapsed.value
    history.value.push({ t, v })
    events.value.push(
      old == null
        ? { t, kind: 'first', text: `พบตารางแรกที่ไม่ชนกันเลย (คะแนนความไม่ลงตัว ${v})` }
        : { t, kind: 'better', text: `ปรับตารางให้ลงตัวขึ้น: ${old} → ${v}` },
    )
  },
)

const eventsNewestFirst = computed(() => [...events.value].reverse())
const improveCount = computed(() => Math.max(history.value.length - 1, 0))
const sinceLast = computed(() =>
  history.value.length ? Math.max(elapsed.value - history.value.at(-1).t, 0) : null,
)

// ขั้นตอนปัจจุบัน: 1 = ยังหาตารางแรก, 2 = พบแล้ว กำลังปรับให้ลงตัวขึ้น
const phase = computed(() => (job.value?.bestSoFar == null ? 1 : 2))
const phases = computed(() =>
  steps.map((p) => ({
    ...p,
    state: p.n < phase.value ? 'done' : p.n === phase.value ? 'active' : 'todo',
  })),
)

// กราฟคะแนนความไม่ลงตัว (ยิ่งต่ำยิ่งดี) วาดแบบขั้นบันได
const chart = computed(() => {
  const h = history.value
  if (!h.length) return null
  const W = 600
  const H = 120
  const P = 10
  const vs = h.map((p) => p.v)
  const max = Math.max(...vs)
  const min = Math.min(...vs)
  const span = max - min || 1
  const x = (t) => P + Math.min(t / timeLimit.value, 1) * (W - 2 * P)
  const y = (v) => P + (1 - (v - min) / span) * (H - 2 * P)
  let d = `M${x(h[0].t)} ${y(h[0].v)}`
  for (let i = 1; i < h.length; i++) d += ` H${x(h[i].t)} V${y(h[i].v)}`
  d += ` H${x(Math.min(elapsed.value, timeLimit.value))}`
  return { d, W, H, dot: { x: x(h.at(-1).t), y: y(h.at(-1).v) }, max, min }
})
</script>

<template>
  <div class="mx-auto max-w-5xl p-6 md:p-10">
    <h1 class="text-2xl font-bold text-primary-700">③ จัดตารางสอน</h1>
    <p class="mt-1 text-slate-500">ตั้งเวลาแล้วกดเริ่ม ระบบใช้ CP-SAT คำนวณตารางที่ไม่ชนกันครบทุกเงื่อนไข</p>

    <!-- ยังไม่พร้อม -->
    <div v-if="notReady" class="mt-6 flex flex-wrap items-center gap-2 rounded-xl border border-warn bg-amber-50 p-4 text-warn">
      <AppIcon name="alert" :size="18" />
      <span class="font-medium">ยังจัดตารางไม่ได้: {{ !store.sessionId ? 'ยังไม่ได้อัปโหลดข้อมูล' : 'ข้อมูลยังมี error ที่ต้องแก้' }}</span>
      <RouterLink :to="!store.sessionId ? '/upload' : '/validate'" class="font-semibold underline">กลับไปแก้</RouterLink>
    </div>

    <!-- ตั้งค่า -->
    <section v-if="!store.generating" class="mt-6 grid gap-5 md:grid-cols-5">
      <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-3">
        <div class="flex items-baseline justify-between">
          <h2 class="font-semibold text-slate-800">เวลาคำนวณสูงสุด</h2>
          <div class="font-mono text-3xl font-bold text-primary-700">{{ timeLimit }}<span class="ml-1 text-base font-normal text-slate-500">วินาที</span></div>
        </div>
        <input v-model.number="timeLimit" type="range" min="5" max="300" step="5" class="mt-4 w-full accent-primary-600" aria-label="เวลาคำนวณสูงสุด (วินาที)" />
        <div class="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button
            v-for="p in presets"
            :key="p.s"
            class="rounded-lg border px-3 py-2 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
            :class="timeLimit === p.s ? 'border-primary-600 bg-primary-50 font-semibold text-primary-700' : 'border-slate-300 hover:bg-primary-50'"
            @click="timeLimit = p.s"
          >
            <div>{{ p.s }} วิ</div>
            <div class="text-xs text-slate-500">{{ p.t }}</div>
          </button>
        </div>
        <p class="mt-3 text-xs text-slate-500">เวลามากขึ้น = ตารางลงตัวขึ้น (คาบว่างครูน้อยลง) ระบบอาจหยุดก่อนถ้าพบตารางที่ดีที่สุดแล้ว</p>

        <button
          class="mt-6 w-full rounded-lg bg-primary-600 px-8 py-3 text-lg font-semibold text-white shadow-sm transition hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
          :disabled="!canStart"
          @click="start"
        >{{ job ? '🔄 คำนวณใหม่' : '▶ เริ่มจัดตาราง' }}</button>
      </div>

      <div class="rounded-xl border border-slate-200 bg-white p-6 shadow-sm md:col-span-2">
        <h2 class="font-semibold text-slate-800">ระบบจะทำอะไร</h2>
        <ol class="mt-4 space-y-4">
          <li v-for="s in steps" :key="s.n" class="flex gap-3">
            <span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-600 text-sm font-bold text-white">{{ s.n }}</span>
            <div>
              <div class="text-sm font-semibold text-slate-800">{{ s.t }}</div>
              <div class="text-xs text-slate-500">{{ s.d }}</div>
            </div>
          </li>
        </ol>
        <p class="mt-4 rounded-lg bg-primary-50 p-3 text-xs text-primary-700">ใช้ค่า seed เดิมและเวลาเดิม จะได้ผลเดิม (ทำซ้ำได้)</p>
      </div>
    </section>

    <p v-if="store.generateError" class="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-err">
      <AppIcon name="alert" :size="18" />{{ store.generateError }}
    </p>

    <!-- กำลังรัน -->
    <section v-if="store.generating" class="mt-6 space-y-4" aria-live="polite">
      <div class="rounded-xl border border-primary-500 bg-white p-6 shadow-sm">
        <div class="flex items-center gap-3">
          <span class="h-6 w-6 animate-spin rounded-full border-[3px] border-primary-600 border-t-transparent motion-reduce:animate-none" />
          <span class="text-lg font-semibold">AI กำลังคำนวณตาราง…</span>
          <span class="ml-auto font-mono text-3xl text-primary-700">{{ fmt(elapsed) }}</span>
        </div>
        <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
          <div class="h-full rounded-full bg-primary-500 transition-all duration-200" :style="{ width: progress + '%' }" />
        </div>
        <div class="mt-1 flex justify-between text-xs text-slate-400">
          <span>เวลาสูงสุด {{ timeLimit }} วินาที</span>
          <button class="text-slate-500 underline hover:text-err" @click="store.cancelGenerate()">ยกเลิก</button>
        </div>

        <!-- ตัวเลขสรุป -->
        <div class="mt-4 grid grid-cols-3 gap-3">
          <div class="rounded-lg bg-primary-50 p-3">
            <div class="text-xs text-slate-500">คะแนนความไม่ลงตัวต่ำสุด (ยิ่งต่ำยิ่งดี)</div>
            <div class="mt-0.5 text-2xl font-bold text-primary-700">{{ job?.bestSoFar ?? '…' }}</div>
          </div>
          <div class="rounded-lg bg-primary-50 p-3">
            <div class="text-xs text-slate-500">ปรับปรุงไปแล้ว</div>
            <div class="mt-0.5 text-2xl font-bold text-primary-700">{{ improveCount }} <span class="text-sm font-normal text-slate-500">ครั้ง</span></div>
          </div>
          <div class="rounded-lg bg-primary-50 p-3">
            <div class="text-xs text-slate-500">ครั้งล่าสุดเมื่อ</div>
            <div class="mt-0.5 text-2xl font-bold text-primary-700">{{ sinceLast == null ? '—' : sinceLast.toFixed(0) }} <span class="text-sm font-normal text-slate-500">วิที่แล้ว</span></div>
          </div>
        </div>
      </div>

      <div class="grid gap-4 md:grid-cols-5">
        <!-- ขั้นตอน -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2">
          <h3 class="text-sm font-semibold text-slate-800">AI กำลังทำอะไรอยู่</h3>
          <ol class="mt-3 space-y-3">
            <li v-for="p in phases" :key="p.n" class="flex gap-3" :class="p.state === 'todo' ? 'opacity-50' : ''">
              <span
                class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                :class="p.state === 'done' ? 'bg-primary-600 text-white' : p.state === 'active' ? 'bg-primary-100 text-primary-700 ring-2 ring-primary-500' : 'bg-slate-100 text-slate-500'"
              >
                <AppIcon v-if="p.state === 'done'" name="check" :size="16" />
                <template v-else>{{ p.n }}</template>
              </span>
              <div>
                <div class="text-sm font-semibold text-slate-800">{{ p.t }}<span v-if="p.state === 'active'" class="ml-1.5 text-xs font-normal text-primary-600">กำลังทำ…</span></div>
                <div class="text-xs text-slate-500">{{ p.d }}</div>
              </div>
            </li>
          </ol>
        </div>

        <!-- กราฟ + บันทึกเหตุการณ์ -->
        <div class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-3">
          <h3 class="text-sm font-semibold text-slate-800">ตารางลงตัวขึ้นแค่ไหนตามเวลา (ยิ่งต่ำยิ่งดี)</h3>
          <div v-if="chart" class="mt-2">
            <svg :viewBox="`0 0 ${chart.W} ${chart.H}`" class="h-32 w-full text-primary-600" role="img" aria-label="กราฟคะแนนความไม่ลงตัวที่ลดลงตามเวลา">
              <path :d="chart.d" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" />
              <circle :cx="chart.dot.x" :cy="chart.dot.y" r="4.5" fill="currentColor" />
            </svg>
            <div class="flex justify-between text-xs text-slate-400"><span>สูงสุด {{ chart.max }}</span><span>ต่ำสุด {{ chart.min }}</span></div>
          </div>
          <p v-else class="mt-2 rounded-lg bg-slate-50 p-4 text-sm text-slate-500">กำลังหาตารางแรกที่ไม่ชนกัน กราฟจะขึ้นเมื่อพบ</p>

          <h3 class="mt-4 text-sm font-semibold text-slate-800">บันทึกการทำงาน</h3>
          <ul class="mt-2 max-h-40 space-y-1.5 overflow-auto text-sm">
            <li v-for="(e, i) in eventsNewestFirst" :key="i" class="flex gap-2">
              <span class="w-10 shrink-0 font-mono text-xs leading-5 text-slate-400">{{ fmt(e.t) }}</span>
              <span :class="e.kind === 'better' ? 'text-primary-700' : e.kind === 'first' ? 'font-semibold text-ok' : 'text-slate-600'">{{ e.text }}</span>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- สำเร็จ -->
    <section v-else-if="job?.status === 'done'" class="mt-6 rounded-xl border bg-white p-6 shadow-sm" :class="job.valid !== false ? 'border-ok' : 'border-err'">
      <div v-if="job.valid !== false" class="flex items-center gap-2 text-lg font-semibold text-ok">
        <AppIcon name="check" :size="22" />จัดตารางสำเร็จ ผ่านการตรวจเงื่อนไขบังคับ
      </div>
      <div v-else class="flex items-center gap-2 text-lg font-semibold text-err">
        <AppIcon name="alert" :size="22" />ได้ตารางแล้ว แต่ไม่ผ่านการตรวจเงื่อนไขบังคับ
      </div>

      <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">สถานะ</div>
          <div class="font-bold text-primary-700">{{ statusText[job.solverStatus] ?? job.solverStatus }}</div>
        </div>
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">คะแนนความไม่ลงตัว</div>
          <div class="font-bold text-primary-700">{{ job.objective }}</div>
        </div>
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">เวลาที่ใช้</div>
          <div class="font-bold text-primary-700">{{ job.elapsedSec != null ? job.elapsedSec.toFixed(1) : '—' }} วินาที</div>
        </div>
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">ห่างจากตารางที่ดีที่สุดที่เป็นไปได้</div>
          <div class="font-bold text-primary-700">{{ job.gap != null ? (job.gap * 100).toFixed(1) + '%' : '—' }}</div>
        </div>
      </div>

      <p v-if="job.config" class="mt-3 text-xs text-slate-500">seed {{ job.config.seed }} · time limit {{ job.config.timeLimit }} วินาที (ใช้ค่าเดิมจะได้ผลเดิม)</p>

      <div class="mt-5 flex flex-wrap justify-end gap-3">
        <button class="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm hover:bg-slate-50" @click="start">
          <AppIcon name="reset" :size="16" />คำนวณใหม่
        </button>
        <button class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white hover:bg-primary-700" @click="router.push('/timetable')">
          ถัดไป: ดูตารางสอน →
        </button>
      </div>
    </section>

    <!-- ล้มเหลว / จัดไม่ได้ -->
    <section v-else-if="job?.status === 'failed'" class="mt-6 rounded-xl border border-err bg-white p-6 shadow-sm">
      <div class="flex items-center gap-2 text-lg font-semibold text-err">
        <AppIcon name="alert" :size="22" />{{ job.message || 'จัดตารางไม่สำเร็จ' }}
      </div>
      <p v-if="job.solverStatus" class="mt-1 text-sm text-slate-500">สถานะ: {{ statusText[job.solverStatus] ?? job.solverStatus }}</p>
      <template v-if="job.reasons?.length">
        <p class="mt-4 font-medium">สาเหตุที่เป็นไปได้:</p>
        <ul class="mt-2 list-disc space-y-1 pl-6 text-slate-700">
          <li v-for="(r, i) in job.reasons" :key="i">{{ r }}</li>
        </ul>
      </template>
      <p class="mt-4 text-sm text-slate-500">แก้ข้อมูลที่เกี่ยวข้อง หรือเพิ่มเวลาคำนวณ แล้วลองใหม่</p>
    </section>

    <div class="mt-6">
      <RouterLink to="/validate" class="text-slate-500 hover:text-primary-700">← กลับ</RouterLink>
    </div>
  </div>
</template>
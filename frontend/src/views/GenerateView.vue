<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const store = useSessionStore()
const router = useRouter()

const timeLimit = ref(30)
const method = ref('cpsat')
const presets = [15, 30, 60, 120]
const methods = [
  { k: 'cpsat', t: 'CP-SAT (แนะนำ)', d: 'คำนวณแบบเหมาะสมที่สุด พิสูจน์ได้ว่าจัดได้หรือไม่' },
  { k: 'baseline', t: 'Baseline', d: 'วิธีพื้นฐาน ใช้เทียบผลตอนนำเสนอ' },
]

// ตัวนับเวลาฝั่งหน้าเว็บ ให้ตัวเลขเดินลื่นระหว่างรอ poll
const now = ref(Date.now())
let tick = null
onMounted(() => { tick = setInterval(() => (now.value = Date.now()), 200) })
onUnmounted(() => clearInterval(tick))

const elapsed = computed(() => (now.value - store.startedAt) / 1000)
const progress = computed(() => Math.min((elapsed.value / timeLimit.value) * 100, 100))
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

const job = computed(() => store.job)
const canStart = computed(() => store.sessionId && store.validated && !store.generating)
const start = () => store.startGenerate({ timeLimitSec: timeLimit.value, method: method.value })
</script>

<template>
  <div class="mx-auto max-w-5xl p-6 md:p-10">
    <h1 class="text-2xl font-bold text-primary-700">③ จัดตารางสอน</h1>
    <p class="mt-1 text-slate-500">ตั้งค่าแล้วกดเริ่ม ระบบจะคำนวณตารางที่ไม่ชนกันครบทุกเงื่อนไข</p>

    <!-- ยังไม่พร้อม -->
    <div v-if="!store.sessionId || !store.validated" class="mt-6 rounded-xl border border-warn bg-amber-50 p-5 text-warn">
      ⚠️ ยังจัดตารางไม่ได้: {{ !store.sessionId ? 'ยังไม่ได้อัปโหลดข้อมูล' : 'ข้อมูลยังมี error ที่ต้องแก้' }}
      <RouterLink :to="!store.sessionId ? '/upload' : '/validate'" class="ml-2 font-semibold underline">กลับไปแก้</RouterLink>
    </div>

    <!-- ตั้งค่า -->
    <div class="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <div class="grid gap-6 md:grid-cols-2">
        <div>
          <label class="font-semibold">เวลาคำนวณสูงสุด (วินาที)</label>
          <div class="mt-2 flex flex-wrap items-center gap-2">
            <input
              v-model.number="timeLimit"
              type="number" min="5" max="600"
              :disabled="store.generating"
              class="w-24 rounded-lg border border-slate-300 px-3 py-1.5 focus:border-primary-500 focus:outline-none disabled:bg-slate-100"
            />
            <button
              v-for="p in presets" :key="p"
              :disabled="store.generating"
              class="rounded-lg border px-3 py-1.5 text-sm transition disabled:opacity-50"
              :class="timeLimit === p ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-300 hover:bg-primary-50'"
              @click="timeLimit = p"
            >{{ p }}</button>
          </div>
          <p class="mt-1 text-xs text-slate-500">เวลามากขึ้น = ตารางดีขึ้น (คาบว่างครูน้อยลง) แนะนำ 30–60</p>
        </div>

        <div>
          <label class="font-semibold">วิธีจัดตาราง</label>
          <div class="mt-2 space-y-2">
            <label
              v-for="m in methods" :key="m.k"
              class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition"
              :class="method === m.k ? 'border-primary-600 bg-primary-50' : 'border-slate-200 hover:bg-slate-50'"
            >
              <input v-model="method" type="radio" :value="m.k" :disabled="store.generating" class="mt-1 accent-primary-600" />
              <span><span class="block font-medium">{{ m.t }}</span><span class="text-sm text-slate-500">{{ m.d }}</span></span>
            </label>
          </div>
        </div>
      </div>

      <div class="mt-6 flex justify-end">
        <button
          class="rounded-lg bg-primary-600 px-8 py-3 text-lg font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
          :disabled="!canStart"
          @click="start"
        >{{ store.generating ? 'กำลังคำนวณ…' : job ? '🔄 คำนวณใหม่' : '▶ เริ่มจัดตาราง' }}</button>
      </div>
    </div>

    <p v-if="store.generateError" class="mt-4 rounded-lg bg-red-50 p-3 text-err">❌ {{ store.generateError }}</p>

    <!-- กำลังรัน -->
    <div v-if="store.generating" class="mt-6 rounded-xl border border-primary-500 bg-white p-6 shadow-sm">
      <div class="flex items-center gap-3">
        <span class="h-6 w-6 animate-spin rounded-full border-[3px] border-primary-600 border-t-transparent" />
        <span class="text-lg font-semibold">AI กำลังคำนวณตาราง…</span>
        <span class="ml-auto font-mono text-2xl text-primary-700">{{ fmt(elapsed) }}</span>
      </div>
      <div class="mt-4 h-3 overflow-hidden rounded-full bg-slate-100">
        <div class="h-full rounded-full bg-primary-500 transition-all duration-200" :style="{ width: progress + '%' }" />
      </div>
      <div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>
          ผลดีที่สุดตอนนี้ (ค่าปรับ):
          <b class="text-slate-800">{{ job?.bestSoFar ?? 'กำลังหาคำตอบแรก…' }}</b>
          <span class="text-slate-400">· ยิ่งน้อยยิ่งดี</span>
        </span>
        <button class="text-slate-500 underline hover:text-err" @click="store.cancelGenerate()">ยกเลิก</button>
      </div>
    </div>

    <!-- สำเร็จ -->
    <div v-else-if="job?.status === 'done'" class="mt-6 rounded-xl border border-ok bg-white p-6 shadow-sm">
     <div v-if="job.valid !== false" class="text-lg font-semibold text-ok">✅ จัดตารางสำเร็จ ผ่านการตรวจเงื่อนไขบังคับ</div>
     <div v-else class="text-lg font-semibold text-err">⚠️ ได้ตารางแล้ว แต่ไม่ผ่านการตรวจเงื่อนไขบังคับ</div>
      <div class="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">สถานะ</div>
          <div class="font-bold text-primary-700">{{ job.solverStatus }}</div>
        </div>
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">ค่าปรับ (objective)</div>
          <div class="font-bold text-primary-700">{{ job.objective }}</div>
        </div>
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">เวลาที่ใช้</div>
          <div class="font-bold text-primary-700">{{ job.elapsedSec.toFixed(1) }} วินาที</div>
        </div>
        <div class="rounded-lg bg-primary-50 p-3">
          <div class="text-xs text-slate-500">ช่องว่างจากค่าที่ดีที่สุด</div>
          <div class="font-bold text-primary-700">{{ job.gap != null ? (job.gap * 100).toFixed(1) + '%' : '—' }}</div>
        </div>
      </div>
      <p v-if="job.config" class="mt-3 text-xs text-slate-500">seed {{ job.config.seed }} · time limit {{ job.config.timeLimit }} วินาที (ใช้ค่าเดิมจะได้ผลเดิม)</p>
      <div class="mt-5 flex justify-end">
        <button
          class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white hover:bg-primary-700"
          @click="router.push('/timetable')"
        >ถัดไป: ดูตารางสอน →</button>
      </div>
    </div>

    <!-- ล้มเหลว / จัดไม่ได้ -->
    <div v-else-if="job?.status === 'failed'" class="mt-6 rounded-xl border border-err bg-white p-6 shadow-sm">
      <div class="text-lg font-semibold text-err">❌ {{ job.message || 'จัดตารางไม่สำเร็จ' }}</div>
      <p v-if="job.solverStatus" class="mt-1 text-sm text-slate-500">สถานะ: {{ job.solverStatus }}</p>
      <template v-if="job.reasons?.length">
        <p class="mt-4 font-medium">สาเหตุที่เป็นไปได้:</p>
        <ul class="mt-2 list-disc space-y-1 pl-6 text-slate-700">
          <li v-for="(r, i) in job.reasons" :key="i">{{ r }}</li>
        </ul>
      </template>
      <p class="mt-4 text-sm text-slate-500">แก้ข้อมูลที่เกี่ยวข้อง หรือเพิ่มเวลาคำนวณ แล้วลองใหม่</p>
    </div>

    <div class="mt-6">
      <RouterLink to="/validate" class="text-slate-500 hover:text-primary-700">← กลับ</RouterLink>
    </div>
  </div>
</template>
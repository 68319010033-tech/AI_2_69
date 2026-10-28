<script setup>
import { ref, computed, onMounted } from 'vue'
import { useSessionStore, REQUIRED_FILES } from '@/stores/session'
import { api } from '@/api'

const store = useSessionStore()
const sid = computed(() => store.sessionId)

const RULES = [
  'ครูไม่สอนซ้อนเวลา',
  'ห้องไม่ถูกใช้ซ้อนเวลา',
  'กลุ่มเรียนไม่เรียนซ้อนเวลา',
  'กลุ่มที่มีนักศึกษาร่วมกันไม่เรียนทับเวลา',
  'ประเภทห้องตรงวิชา และความจุพอ',
  'เรียนต่อเนื่อง วันเดียว ห้องเดียว ไม่ข้ามพักเที่ยง',
  'อยู่ในวัน จ–ศ และคาบ 1–8 ที่อนุญาต',
  'ไม่ตรงคาบที่ครู/ห้องถูกบล็อก',
  'กลุ่มเรียนไม่เกินคาบสูงสุดต่อวัน',
  'ครูไม่เกินคาบสูงสุดต่อวัน/สัปดาห์',
  'รายการ fixed ตรงวัน คาบ ห้องที่กำหนด',
  'จัดครบทุกรายการสอน ไม่ขาด ไม่ซ้ำ',
]
const METRIC_LABELS = {
  teacherGaps: 'คาบว่างระหว่างวันของครู',
  groupMaxPerDay: 'คาบสูงสุดต่อวันของกลุ่ม',
  solveTimeSec: 'เวลาคำนวณ (วินาที)',
}

const report = ref(null)
const loading = ref(false)
const error = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    report.value = await api.report(sid.value)
  } catch {
    error.value = 'โหลดผลการตรวจไม่สำเร็จ'
  } finally {
    loading.value = false
  }
}
onMounted(() => { if (sid.value) load() })

const checks = computed(() =>
  RULES.map((name, i) => {
    const hc = report.value?.hardChecks
    const c = hc?.['c' + String(i + 1).padStart(2, '0')] ?? hc?.[i] ?? {}
    return { n: i + 1, name, pass: !!c.pass, violations: c.violations ?? 0 }
  }),
)
const passCount = computed(() => checks.value.filter((c) => c.pass).length)
const allPass = computed(() => passCount.value === 12)
const metrics = computed(() =>
  Object.entries(report.value?.softMetrics || {}).map(([k, v]) => ({ k, label: METRIC_LABELS[k] || k, v })),
)
</script>

<template>
  <div class="mx-auto max-w-5xl p-6 md:p-10">
    <h1 class="text-2xl font-bold text-primary-700">⑤ ส่งออกผลลัพธ์</h1>
    <p class="mt-1 text-slate-500">ตรวจความถูกต้องของตาราง แล้วดาวน์โหลดไฟล์ที่ต้องส่ง</p>

    <div v-if="!sid" class="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p class="text-slate-600">ยังไม่มีผลลัพธ์ให้ส่งออก</p>
      <RouterLink to="/upload" class="mt-3 inline-block font-semibold text-primary-600 hover:underline">← เริ่มจากอัปโหลด</RouterLink>
    </div>

    <template v-else>
      <!-- ดาวน์โหลด -->
      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <a
          :href="api.solutionUrl(sid)" @click.prevent="api.download(api.solutionUrl(sid))"
          download="solution.csv"
          class="rounded-xl bg-primary-600 p-5 text-white shadow-sm transition hover:bg-primary-700"
        >
          <div class="text-3xl">⬇</div>
          <div class="mt-2 text-lg font-bold">solution.csv</div>
          <div class="text-sm opacity-90">ไฟล์คำตอบที่ส่งตรวจ (UTF-8 BOM)</div>
        </a>
        <a
          :href="api.reportUrl(sid)" @click.prevent="api.download(api.reportUrl(sid))"
          download="report.md"
          class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary-500 hover:bg-primary-50"
        >
          <div class="text-3xl">📄</div>
          <div class="mt-2 text-lg font-bold">report.md</div>
          <div class="text-sm text-slate-500">รายงานสำหรับผู้ใช้งาน</div>
        </a>
        <a
          :href="api.cleaningLogUrl(sid)" @click.prevent="api.download(api.cleaningLogUrl(sid))"
          download="cleaning-log"
          class="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:border-primary-500 hover:bg-primary-50"
        >
          <div class="text-3xl">🔧</div>
          <div class="mt-2 text-lg font-bold">cleaning log</div>
          <div class="text-sm text-slate-500">บันทึกสิ่งที่แก้ในข้อมูลดิบ</div>
        </a>
      </div>

      <!-- ผลตรวจ 12 ข้อ -->
      <div class="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div class="flex items-center justify-between border-b border-slate-200 p-4">
          <h2 class="font-semibold">ผลตรวจเงื่อนไขบังคับ (Hard Constraints)</h2>
          <span
            v-if="report"
            class="rounded-full px-3 py-1 text-sm font-semibold"
            :class="allPass ? 'bg-primary-100 text-ok' : 'bg-red-50 text-err'"
          >{{ allPass ? '✅ ผ่านครบ 12/12' : `❌ ผ่าน ${passCount}/12` }}</span>
        </div>

        <div v-if="loading" class="flex items-center gap-3 p-6 text-slate-600">
          <span class="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
          กำลังโหลดผลตรวจ…
        </div>
        <p v-else-if="error" class="p-4 text-err">
          ❌ {{ error }} <button class="ml-2 underline" @click="load">ลองใหม่</button>
        </p>
        <ul v-else class="divide-y divide-slate-100">
          <li v-for="c in checks" :key="c.n" class="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span class="w-8 text-slate-400">{{ String(c.n).padStart(2, '0') }}</span>
            <span class="flex-1">{{ c.name }}</span>
            <span v-if="c.pass" class="font-semibold text-ok">✔ ผ่าน</span>
            <span v-else class="font-semibold text-err">✘ ไม่ผ่าน ({{ c.violations }} จุด)</span>
          </li>
        </ul>
      </div>

      <!-- คุณภาพตาราง -->
      <div v-if="metrics.length" class="mt-6">
        <h2 class="mb-2 font-semibold">คุณภาพตาราง</h2>
        <div class="grid grid-cols-2 gap-4 md:grid-cols-3">
          <div v-for="m in metrics" :key="m.k" class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div class="text-sm text-slate-500">{{ m.label }}</div>
            <div class="text-3xl font-bold text-primary-700">{{ m.v }}</div>
          </div>
        </div>
      </div>

      <!-- ไฟล์ cleaned -->
      <div class="mt-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 class="mb-2 font-semibold">ไฟล์ข้อมูลที่ทำความสะอาดแล้ว</h2>
        <div class="flex flex-wrap gap-2 text-sm">
          <a
            v-for="f in REQUIRED_FILES"
            :key="f"
            :href="api.cleanedUrl(sid, f)" @click.prevent="api.download(api.cleanedUrl(sid, f))"
            download
            class="rounded-lg border border-primary-500 px-2.5 py-1 text-primary-700 hover:bg-primary-50"
          >⬇ {{ f }}</a>
        </div>
      </div>

      <div class="mt-6">
        <RouterLink to="/timetable" class="text-slate-500 hover:text-primary-700">← กลับไปดูตาราง</RouterLink>
      </div>
    </template>
  </div>
</template>
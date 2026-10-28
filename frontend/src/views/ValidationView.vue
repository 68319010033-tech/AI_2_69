<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore } from '@/stores/session'
import { api } from '@/api'

const store = useSessionStore()
const router = useRouter()

const tab = ref('issues') // issues | log
const sev = ref('all') // all | error | warning
const search = ref('')

onMounted(() => {
  if (store.sessionId && !store.stats) store.validate()
})

function pick(t, s = 'all') {
  tab.value = t
  sev.value = s
}

const match = (r, t) => Object.values(r).some((v) => String(v).toLowerCase().includes(t))
const rows = computed(() => {
  const t = search.value.trim().toLowerCase()
  const src = tab.value === 'issues'
    ? store.issues.filter((i) => sev.value === 'all' || i.severity === sev.value)
    : store.log
  return t ? src.filter((r) => match(r, t)) : src
})

const canNext = computed(() => store.stats && store.errorCount === 0 && !store.validating)
const files = computed(() => [...new Set(store.log.map((l) => l.file))])
</script>

<template>
  <div class="mx-auto max-w-5xl p-6 md:p-10">
    <h1 class="text-2xl font-bold text-primary-700">② ตรวจสอบข้อมูล</h1>
    <p class="mt-1 text-slate-500">ระบบตรวจและล้างข้อมูลก่อนจัดตาราง ปัญหาที่แก้เองไม่ได้จะแสดงให้คุณตรวจสอบ</p>

    <!-- ยังไม่ได้อัปโหลด -->
    <div v-if="!store.sessionId" class="mt-6 rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <p class="text-slate-600">ยังไม่มีข้อมูลที่อัปโหลด</p>
      <RouterLink to="/upload" class="mt-3 inline-block font-semibold text-primary-600 hover:underline">← กลับไปอัปโหลด</RouterLink>
    </div>

    <!-- กำลังตรวจ -->
    <div v-else-if="store.validating" class="mt-6 flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
      <span class="h-5 w-5 animate-spin rounded-full border-2 border-primary-600 border-t-transparent" />
      <span class="text-slate-600">กำลังตรวจสอบข้อมูล…</span>
    </div>

    <p v-else-if="store.validateError" class="mt-6 rounded-lg bg-red-50 p-3 text-err">
      ❌ {{ store.validateError }}
      <button class="ml-2 underline" @click="store.validate()">ลองใหม่</button>
    </p>

    <template v-else-if="store.stats">
      <!-- การ์ดสรุป -->
      <div class="mt-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <button
          class="rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow"
          :class="tab === 'issues' && sev === 'error' ? 'border-err ring-1 ring-err' : 'border-slate-200'"
          @click="pick('issues', 'error')"
        >
          <div class="text-sm text-slate-500">❌ Error</div>
          <div class="text-3xl font-bold text-err">{{ store.errorCount }}</div>
        </button>
        <button
          class="rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow"
          :class="tab === 'issues' && sev === 'warning' ? 'border-warn ring-1 ring-warn' : 'border-slate-200'"
          @click="pick('issues', 'warning')"
        >
          <div class="text-sm text-slate-500">⚠️ Warning</div>
          <div class="text-3xl font-bold text-warn">{{ store.warnCount }}</div>
        </button>
        <button
          class="rounded-xl border bg-white p-4 text-left shadow-sm transition hover:shadow"
          :class="tab === 'log' ? 'border-primary-600 ring-1 ring-primary-600' : 'border-slate-200'"
          @click="pick('log')"
        >
          <div class="text-sm text-slate-500">🔧 แก้ให้อัตโนมัติ</div>
          <div class="text-3xl font-bold text-primary-700">{{ store.log.length }}</div>
        </button>
        <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div class="text-sm text-slate-500">รายการสอน / คาบรวม</div>
          <div class="text-3xl font-bold">
            {{ store.stats.offerings }} <span class="text-lg font-normal text-slate-400">/ {{ store.stats.periods }}</span>
          </div>
          <div class="text-xs" :class="store.stats.offerings === 63 && store.stats.periods === 126 ? 'text-ok' : 'text-err'">
            {{ store.stats.offerings === 63 && store.stats.periods === 126 ? '✅ ตรงตามโจทย์ (63 / 126)' : '❌ ไม่ตรงโจทย์ (ต้อง 63 / 126)' }}
          </div>
        </div>
      </div>

      <!-- ตาราง -->
      <div class="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-3">
          <div class="flex gap-1">
            <button
              v-for="t in [{ k: 'issues', l: `ปัญหา (${store.issues.length})` }, { k: 'log', l: `สิ่งที่แก้ให้ (${store.log.length})` }]"
              :key="t.k"
              class="rounded-lg px-3 py-1.5 text-sm transition"
              :class="tab === t.k ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
              @click="pick(t.k)"
            >{{ t.l }}</button>
          </div>
          <input
            v-model="search"
            type="search"
            placeholder="ค้นหา…"
            class="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none"
          />
        </div>

        <div class="max-h-96 overflow-auto">
          <!-- IssueTable -->
          <table v-if="tab === 'issues'" class="w-full text-left text-sm">
            <thead class="sticky top-0 bg-primary-50 text-primary-700">
              <tr>
                <th class="px-3 py-2">ระดับ</th><th class="px-3 py-2">ไฟล์</th><th class="px-3 py-2">แถว</th>
                <th class="px-3 py-2">คอลัมน์</th><th class="px-3 py-2">ปัญหา</th><th class="px-3 py-2">คำแนะนำ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(i, idx) in rows" :key="idx" class="hover:bg-slate-50">
                <td class="whitespace-nowrap px-3 py-2">
                  <span v-if="i.severity === 'error'" class="font-semibold text-err">❌ Error</span>
                  <span v-else class="font-semibold text-warn">⚠️ Warning</span>
                </td>
                <td class="whitespace-nowrap px-3 py-2">{{ i.file }}</td>
                <td class="px-3 py-2">{{ i.row }}</td>
                <td class="px-3 py-2">{{ i.column }}</td>
                <td class="px-3 py-2">{{ i.message }}</td>
                <td class="px-3 py-2 text-slate-500">{{ i.suggestion }}</td>
              </tr>
              <tr v-if="!rows.length">
                <td colspan="6" class="px-3 py-8 text-center text-slate-400">
                  {{ store.issues.length ? 'ไม่พบรายการ' : '✅ ไม่พบปัญหา ข้อมูลพร้อมใช้งาน' }}
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Cleaning log -->
          <table v-else class="w-full text-left text-sm">
            <thead class="sticky top-0 bg-primary-50 text-primary-700">
              <tr>
                <th class="px-3 py-2">ไฟล์</th><th class="px-3 py-2">แถว</th><th class="px-3 py-2">คอลัมน์</th>
                <th class="px-3 py-2">ก่อน</th><th class="px-3 py-2">หลัง</th><th class="px-3 py-2">กฎ</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100">
              <tr v-for="(l, idx) in rows" :key="idx" class="hover:bg-slate-50">
                <td class="whitespace-nowrap px-3 py-2">{{ l.file }}</td>
                <td class="px-3 py-2">{{ l.row }}</td>
                <td class="px-3 py-2">{{ l.column }}</td>
                <td class="whitespace-pre px-3 py-2 font-mono text-err">{{ l.before }}</td>
                <td class="whitespace-pre px-3 py-2 font-mono text-ok">{{ l.after }}</td>
                <td class="px-3 py-2 text-slate-500">{{ l.rule }}</td>
              </tr>
              <tr v-if="!rows.length">
                <td colspan="6" class="px-3 py-8 text-center text-slate-400">ไม่มีรายการ</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ดาวน์โหลด cleaned -->
      <div v-if="files.length" class="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span class="text-slate-500">ดาวน์โหลดไฟล์ที่ล้างแล้ว:</span>
        <a
          v-for="f in files"
          :key="f"
          :href="api.cleanedUrl(store.sessionId, f)" @click.prevent="api.download(api.cleanedUrl(store.sessionId, f))"
          download
          class="rounded-lg border border-primary-500 px-2.5 py-1 text-primary-700 hover:bg-primary-50"
        >⬇ {{ f }}</a>
      </div>

      <!-- ปุ่มล่าง -->
      <div class="mt-6 flex items-center justify-between gap-4">
        <RouterLink to="/upload" class="text-slate-500 hover:text-primary-700">← กลับ</RouterLink>
        <div class="flex items-center gap-4">
          <span v-if="store.errorCount" class="text-sm text-err">
            แก้ {{ store.errorCount }} ปัญหาก่อน แล้วอัปโหลดใหม่
          </span>
          <button
            class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            :disabled="!canNext"
            @click="router.push('/generate')"
          >ถัดไป: จัดตารางสอน →</button>
        </div>
      </div>
    </template>
  </div>
</template>
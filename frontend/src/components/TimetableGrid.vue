<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  mode: { type: String, default: 'group' }, // group | teacher | room
  colors: { type: Object, default: () => ({}) }, // { course_id: hue }
})

const DAYS = [
  { k: 'MON', l: 'จันทร์' }, { k: 'TUE', l: 'อังคาร' }, { k: 'WED', l: 'พุธ' },
  { k: 'THU', l: 'พฤหัสฯ' }, { k: 'FRI', l: 'ศุกร์' },
]
const MORNING = [1, 2, 3, 4]
const AFTERNOON = [5, 6, 7, 8]
const TIME = {
  1: ['08:00', '09:00'], 2: ['09:00', '10:00'], 3: ['10:00', '11:00'], 4: ['11:00', '12:00'],
  5: ['13:00', '14:00'], 6: ['14:00', '15:00'], 7: ['15:00', '16:00'], 8: ['16:00', '17:00'],
}

// cells['MON-1'] = { s } จุดเริ่มของรายการ | { skip: true } คาบที่ถูก colspan ครอบ
const cells = computed(() => {
  const m = {}
  for (const s of props.sessions) {
    for (let k = 0; k < s.periods; k++) {
      m[`${s.day}-${s.start_period + k}`] = k === 0 ? { s } : { skip: true }
    }
  }
  return m
})

const hue = (id) => props.colors[id] ?? 150
const style = (id) => ({
  backgroundColor: `hsl(${hue(id)} 80% 90%)`,
  border: `2px solid hsl(${hue(id)} 55% 68%)`,
  color: `hsl(${hue(id)} 50% 22%)`,
})
const name = (s) => s.course_name || s.course_id
function sub(s) {
  if (props.mode === 'group') return [s.teacher_name || s.teacher_id, s.room_id]
  if (props.mode === 'teacher') return [s.group_id, s.room_id]
  return [s.group_id, s.teacher_name || s.teacher_id]
}

// การ์ดขยาย
const open = ref(null)
</script>

<template>
  <table class="w-full table-fixed border-separate border-spacing-1.5 text-center">
    <thead>
      <tr class="text-xs text-slate-500">
        <th class="w-20 py-1" />
        <th v-for="p in MORNING" :key="p" class="py-1 font-medium">คาบ {{ p }}</th>
        <th class="w-12" />
        <th v-for="p in AFTERNOON" :key="p" class="py-1 font-medium">คาบ {{ p }}</th>
      </tr>
      <tr>
        <th class="rounded-xl bg-primary-600 py-2 text-sm text-white">วัน/เวลา</th>
        <template v-for="p in [...MORNING, 'L', ...AFTERNOON]" :key="p">
          <th v-if="p === 'L'" />
          <th v-else class="rounded-xl bg-primary-100 py-1.5 text-xs font-semibold leading-tight text-primary-700">
            {{ TIME[p][0] }}<br />{{ TIME[p][1] }}
          </th>
        </template>
      </tr>
    </thead>

    <tbody>
      <tr v-for="(d, di) in DAYS" :key="d.k" class="h-20">
        <td class="rounded-xl bg-primary-600 text-base font-bold text-white">{{ d.l }}</td>

        <template v-for="p in [...MORNING, 'L', ...AFTERNOON]" :key="p">
          <!-- แถบพักกลางวัน (ครอบ 5 แถว) -->
          <td
            v-if="p === 'L'"
            :rowspan="di === 0 ? 5 : undefined"
            :class="di === 0 ? 'rounded-xl bg-slate-100 text-xs text-slate-500' : 'hidden'"
          >
            <span v-if="di === 0" class="[writing-mode:vertical-rl] mx-auto tracking-widest">
              🍚 พักรับประทานอาหาร
            </span>
          </td>

          <td v-else-if="cells[`${d.k}-${p}`]?.skip" class="hidden" />

          <!-- ช่องที่มีวิชา -->
          <td
            v-else-if="cells[`${d.k}-${p}`]?.s"
            :colspan="cells[`${d.k}-${p}`].s.periods"
            class="relative p-0"
          >
            <button
              type="button"
              class="group/cell flex h-full min-h-16 w-full cursor-zoom-in flex-col items-center justify-center rounded-xl px-1 py-1.5 transition duration-150 hover:z-20 hover:scale-125 hover:shadow-2xl"
              :style="style(cells[`${d.k}-${p}`].s.course_id)"
              @click="open = cells[`${d.k}-${p}`].s"
            >
              <span class="line-clamp-2 text-sm font-bold leading-tight">{{ name(cells[`${d.k}-${p}`].s) }}</span>
              <span class="mt-0.5 text-[11px] leading-tight opacity-80">
                {{ sub(cells[`${d.k}-${p}`].s)[0] }}<br />{{ sub(cells[`${d.k}-${p}`].s)[1] }}
              </span>
            </button>
          </td>

          <!-- ช่องว่าง -->
          <td v-else class="rounded-xl border border-slate-200 bg-white" />
        </template>
      </tr>
    </tbody>
  </table>

  <!-- การ์ดใหญ่ (ไม่ติดไปกับรูปที่ดาวน์โหลด เพราะอยู่นอก sheet ในหน้า view) -->
  <Teleport to="body">
    <div
      v-if="open"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      @click.self="open = null"
    >
      <div class="w-full max-w-xl rounded-3xl p-8 shadow-2xl" :style="style(open.course_id)">
        <div class="flex items-start justify-between gap-4">
          <h2 class="text-4xl font-bold leading-tight">{{ name(open) }}</h2>
          <button class="text-3xl leading-none opacity-60 hover:opacity-100" @click="open = null">✕</button>
        </div>
        <dl class="mt-6 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-2xl">
          <dt class="opacity-70">รหัสวิชา</dt><dd class="font-semibold">{{ open.course_id }}</dd>
          <dt class="opacity-70">กลุ่มเรียน</dt><dd class="font-semibold">{{ open.group_id }}</dd>
          <dt class="opacity-70">ครูผู้สอน</dt><dd class="font-semibold">{{ open.teacher_name || open.teacher_id }}</dd>
          <dt class="opacity-70">ห้อง</dt><dd class="font-semibold">{{ open.room_id }}</dd>
          <dt class="opacity-70">วัน</dt>
          <dd class="font-semibold">{{ DAYS.find((x) => x.k === open.day)?.l }}</dd>
          <dt class="opacity-70">เวลา</dt>
          <dd class="font-semibold">
            {{ TIME[open.start_period][0] }}–{{ TIME[open.start_period + open.periods - 1][1] }}
            ({{ open.periods }} คาบ)
          </dd>
        </dl>
      </div>
    </div>
  </Teleport>
</template>
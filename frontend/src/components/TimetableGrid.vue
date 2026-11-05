<script setup>
import { t as copy } from '@/i18n'
import { computed } from 'vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  mode: { type: String, default: 'group' }, // group | teacher | room
  colors: { type: Object, default: () => ({}) }, // { course_id: hue }
})

import { DAYS, TIME } from '@/lib/timetable'
const emit = defineEmits(['select'])
const MORNING = [1, 2, 3, 4]
const AFTERNOON = [5, 6, 7, 8]
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

const name = (s) => s.course_name || s.course_id
function sub(s) {
  const teacher = s.teacher_name || s.teacher_id
  const room = s.room_name || s.room_id
  const group = s.group_name || s.group_id
  if (props.mode === 'group') return [teacher, room]
  if (props.mode === 'teacher') return [group, room]
  return [group, teacher]
}


</script>

<template>
  <table class="w-full table-fixed border-separate border-spacing-1.5 text-center">
    <thead>
      <tr class="text-xs text-slate-500">
        <th class="w-20 py-1" />
        <th v-for="p in MORNING" :key="p" class="py-1 font-medium"> {{ copy("คาบ") }} {{ p }}</th>
        <th class="w-12" />
        <th v-for="p in AFTERNOON" :key="p" class="py-1 font-medium"> {{ copy("คาบ") }} {{ p }}</th>
      </tr>
      <tr>
        <th class="rounded-xl bg-primary-600 py-2 text-sm text-white"> {{ copy("วัน/เวลา") }} </th>
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
        <td class="rounded-xl bg-primary-600 text-base font-bold text-white">{{ copy(d.l) }}</td>

        <template v-for="p in [...MORNING, 'L', ...AFTERNOON]" :key="p">
          <!-- แถบพักกลางวัน (ครอบ 5 แถว) -->
          <td
            v-if="p === 'L'"
            :rowspan="di === 0 ? 5 : undefined"
            :class="di === 0 ? 'rounded-xl bg-slate-100 text-xs text-slate-500' : 'hidden'"
          >
            <span v-if="di === 0" class="[writing-mode:vertical-rl] mx-auto tracking-widest"> {{ copy("🍚 พักรับประทานอาหาร") }} </span>
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
              class="course-cell group/cell flex h-full min-h-16 w-full cursor-zoom-in flex-col items-center justify-center rounded-xl px-1 py-1.5 transition duration-150 hover:z-20 hover:scale-125 hover:shadow-2xl"
              :style="{ '--course-hue': colors[cells[`${d.k}-${p}`].s.course_id] ?? 150 }"
              @click="emit('select', cells[`${d.k}-${p}`].s)"
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

</template>

<script setup>
import { t as copy } from '@/i18n'
import { computed } from 'vue'

const props = defineProps({
  sessions: { type: Array, default: () => [] },
  mode: { type: String, default: 'group' }, // group | teacher | room
  title: { type: String, default: '' }, // เช่น "กลุ่มเรียน G1"
  term: { type: String, default: '' }, // เช่น "ภาคเรียนที่ 1/2569" (เว้นว่างได้)
})

import { DAYS } from '@/lib/timetable'
const emit = defineEmits(['select'])
const COLS = [1, 2, 3, 4, 'L', 5, 6, 7, 8]
const TIME = {
  1: '08.00-09.00', 2: '09.00-10.00', 3: '10.00-11.00', 4: '11.00-12.00',
  5: '13.00-14.00', 6: '14.00-15.00', 7: '15.00-16.00', 8: '16.00-17.00',
}

const cells = computed(() => {
  const m = {}
  for (const s of props.sessions) {
    for (let k = 0; k < s.periods; k++) {
      m[`${s.day}-${s.start_period + k}`] = k === 0 ? { s } : { skip: true }
    }
  }
  return m
})

const teacher = (s) => s.teacher_name || s.teacher_id
const room = (s) => s.room_name || s.room_id
const group = (s) => s.group_name || s.group_id
function lines(s) {
  const course = s.course_name || s.course_id
  if (props.mode === 'group') return [course, teacher(s), room(s)]
  if (props.mode === 'teacher') return [course, group(s), room(s)]
  return [course, group(s), teacher(s)]
}
</script>

<template>
  <table
    class="formal-table w-full table-fixed border-collapse border border-black bg-white font-formal text-black [&_td]:border [&_td]:border-black [&_th]:border [&_th]:border-black"
  >
    <thead>
      <!-- ชื่อตาราง -->
      <tr>
        <th colspan="10" class="px-3 py-3 text-xl font-bold"> {{ copy("ตารางเรียน") }} {{ title }} <span v-if="term">{{ term }}</span>
        </th>
      </tr>
      <!-- ชั่วโมงที่ -->
      <tr class="text-base">
        <th class="w-24 py-1.5 font-semibold"> {{ copy("ชั่วโมงที่") }} </th>
        <th v-for="c in COLS" :key="c" :class="c === 'L' ? 'w-16' : ''" class="py-1.5 font-semibold">
          {{ c === 'L' ? '' : c }}
        </th>
      </tr>
      <!-- เวลา -->
      <tr class="text-sm">
        <th class="py-1.5 font-semibold"> {{ copy("เวลา") }} </th>
        <th v-for="c in COLS" :key="c" class="px-0.5 py-1.5 text-xs font-semibold leading-tight">
          {{ c === 'L' ? '12.00-13.00' : TIME[c] }}
        </th>
      </tr>
    </thead>

    <tbody>
      <tr v-for="d in DAYS" :key="d.k" class="h-28">
        <td class="text-center text-2xl font-bold">{{ copy(d.l) }}</td>

        <template v-for="c in COLS" :key="c">
          <td v-if="c === 'L'" class="text-center text-lg font-semibold"> {{ copy("พัก") }} </td>
          <td v-else-if="cells[`${d.k}-${c}`]?.skip" class="hidden" />
          <td
            v-else-if="cells[`${d.k}-${c}`]?.s"
            :colspan="cells[`${d.k}-${c}`].s.periods"
            class="relative p-0"
          >
            <button type="button" class="formal-session flex min-h-24 w-full flex-col items-center justify-center px-1 text-center leading-snug focus-visible:outline-2"
              @click="emit('select', cells[`${d.k}-${c}`].s)"
            >
              <span class="text-lg font-bold">{{ lines(cells[`${d.k}-${c}`].s)[0] }}</span>
              <span class="text-base">{{ lines(cells[`${d.k}-${c}`].s)[1] }}</span>
              <span class="text-base">{{ lines(cells[`${d.k}-${c}`].s)[2] }}</span>
            </button>
          </td>
          <td v-else />
        </template>
      </tr>
    </tbody>
  </table>
</template>
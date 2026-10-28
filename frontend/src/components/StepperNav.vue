<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSessionStore } from '@/stores/session'

const route = useRoute()
const store = useSessionStore()

const steps = [
  { n: 1, to: '/upload', title: 'อัปโหลดข้อมูล', desc: 'นำเข้าไฟล์ CSV 10 ไฟล์' },
  { n: 2, to: '/validate', title: 'ตรวจสอบข้อมูล', desc: 'ดูปัญหาและการแก้ไข' },
  { n: 3, to: '/generate', title: 'จัดตารางสอน', desc: 'ให้ AI คำนวณตาราง' },
  { n: 4, to: '/timetable', title: 'ดูตารางสอน', desc: 'รายกลุ่ม / ครู / ห้อง' },
  { n: 5, to: '/export', title: 'ส่งออกผลลัพธ์', desc: 'solution.csv และรายงาน' },
]

const current = computed(() => route.meta.step || 1)
const state = (n) =>
  n === current.value ? 'current' : n < current.value ? 'done' : n <= store.maxStep ? 'open' : 'locked'

// ขั้นที่ล็อกยังเป็น RouterLink เหมือนเดิม (ไม่สลับเป็น <div> เพราะทำให้ Vue อัปเดตพังเมื่อสถานะเปลี่ยนระหว่างใช้งาน)
// แต่กดไม่ได้: pointer-events-none + tabindex -1 + ดักคลิกก่อน router
const blockIfLocked = (e, n) => {
  if (state(n) === 'locked') e.preventDefault()
}
</script>

<template>
  <nav class="flex gap-1 overflow-x-auto md:flex-col md:gap-0">
    <RouterLink
      v-for="(s, i) in steps"
      :key="s.n"
      :to="s.to"
      :aria-disabled="state(s.n) === 'locked' ? 'true' : undefined"
      :aria-current="state(s.n) === 'current' ? 'step' : undefined"
      :tabindex="state(s.n) === 'locked' ? -1 : undefined"
      class="relative flex shrink-0 items-start gap-3 rounded-lg p-3 md:pb-6"
      :class="{
        'bg-primary-50': state(s.n) === 'current',
        'hover:bg-slate-50': state(s.n) === 'done' || state(s.n) === 'open',
        'pointer-events-none cursor-not-allowed opacity-50': state(s.n) === 'locked',
      }"
      @click.capture="blockIfLocked($event, s.n)"
    >
      <!-- เส้นเชื่อม -->
      <span
        v-if="i < steps.length - 1"
        class="absolute left-[1.65rem] top-11 hidden h-[calc(100%-1.5rem)] w-0.5 md:block"
        :class="s.n < current ? 'bg-primary-500' : 'bg-slate-200'"
      />
      <!-- วงกลมเลขขั้น -->
      <span
        class="z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold"
        :class="{
          'border-primary-600 bg-primary-600 text-white': state(s.n) === 'current' || state(s.n) === 'done',
          'border-primary-500 bg-white text-primary-600': state(s.n) === 'open',
          'border-slate-300 bg-white text-slate-400': state(s.n) === 'locked',
        }"
      >
        {{ state(s.n) === 'done' ? '✓' : s.n }}
      </span>
      <span class="hidden md:block">
        <span class="block font-semibold" :class="state(s.n) === 'current' ? 'text-primary-700' : 'text-slate-800'">
          {{ s.title }}
        </span>
        <span class="block text-sm text-slate-500">{{ s.desc }}</span>
      </span>
    </RouterLink>
  </nav>
</template>
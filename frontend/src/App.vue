<script setup>
import StepperNav from '@/components/StepperNav.vue'
</script>

<template>
  <div class="min-h-screen md:flex">
    <aside class="border-b border-slate-200 bg-white p-4 md:w-72 md:shrink-0 md:border-b-0 md:border-r md:p-6">
      <div class="mb-4 md:mb-8">
        <div class="text-lg font-bold text-primary-700">🗓️ Intelligent Timetabling</div>
        <div class="text-sm text-slate-500">Phu Pha Digital Campus</div>
      </div>
      <StepperNav />
    </aside>

    <main class="min-w-0 flex-1 bg-primary-50/40">
      <RouterView />
    </main>
  </div>
</template>
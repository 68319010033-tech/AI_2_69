<script setup>
import { theme, setTheme } from '@/lib/theme'
import { lastAppError } from '@/lib/diagnostics'
import StepperNav from '@/components/StepperNav.vue'
import { ref } from 'vue'
import { useRoute } from 'vue-router'
import { auth, signOut } from '@/auth'
import { locale, setLocale, t } from '@/i18n'
const route = useRoute()
const logoutError = ref('')
async function logout() {
  try { await signOut() } catch { logoutError.value = 'Unable to sign out. Please try again.' }
}
</script>

<template>
  <a href="#main-content" class="sr-only focus:not-sr-only">{{ t("Skip to content") }}</a>
  <header class="flex flex-wrap items-center justify-end gap-3 border-b border-slate-200 bg-white px-4 py-2" aria-label="Language / ภาษา">
    <label class="flex items-center gap-2 text-sm"><span>{{ t('Appearance') }}</span><select :value="theme" :aria-label="t('Appearance')" class="rounded-lg border border-slate-200 bg-white px-3 py-2" @change="setTheme($event.target.value)"><option value="light">{{ t('Light') }}</option><option value="dark">{{ t('Dark') }}</option></select></label>
    <div class="flex gap-1 rounded-lg border border-slate-200 p-1">
      <button lang="th" :aria-pressed="locale === 'th'" :class="locale === 'th' ? 'bg-primary-700 text-white' : 'text-slate-600'" class="rounded px-3 py-1 text-sm" @click="setLocale('th')">ไทย</button>
      <button lang="en" :aria-pressed="locale === 'en'" :class="locale === 'en' ? 'bg-primary-700 text-white' : 'text-slate-600'" class="rounded px-3 py-1 text-sm" @click="setLocale('en')">English</button>
    </div>
  </header>
  <RouterView v-if="route.meta.public" />
  <div v-else class="min-h-screen md:flex">
    <aside class="border-b border-slate-200 bg-white p-4 md:w-72 md:shrink-0 md:border-b-0 md:border-r md:p-6">
      <div class="mb-4 md:mb-8">
        <div class="text-lg font-bold text-primary-700">🗓️ {{ t('ระบบจัดตารางสอนอัจฉริยะ', 'Intelligent Timetabling') }}</div>
        <div class="text-sm text-slate-500">Phu Pha Digital Campus</div>
      </div>
      <RouterLink to="/" class="mb-4 block rounded-lg border border-primary-100 bg-primary-50 px-4 py-3 font-semibold text-primary-700">{{ t("Dashboard") }}</RouterLink>
      <StepperNav />
      <div class="mt-6 border-t border-slate-200 pt-4 text-sm">
        <p class="break-all font-semibold">{{ auth.user?.name }}</p>
        <p class="break-all text-slate-500">{{ auth.user?.email }}</p>
        <RouterLink v-if="auth.user?.role === 'admin'" to="/admin" class="mt-3 block text-primary-700">{{ t('ผู้ดูแลระบบ · ผู้ใช้') }}</RouterLink>
        <button class="mt-3 text-primary-700" @click="logout">{{ t('ออกจากระบบ') }}</button>
        <p v-if="logoutError" role="alert" class="mt-2 text-red-700">{{ t(logoutError) }}</p>
      </div>
    </aside>

    <main id="main-content" class="min-w-0 flex-1 bg-primary-50/40">
      <div v-if="lastAppError" role="alert" class="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{{ t(lastAppError) }} <button class="ml-3 underline" @click="lastAppError = ''">{{ t("Dismiss") }}</button></div>
      <RouterView />
    </main>
  </div>
</template>

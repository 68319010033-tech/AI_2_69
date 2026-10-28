<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { auth, http } from '@/auth'

const router = useRouter()
const mode = ref('login'), step = ref('details')
const email = ref(''), password = ref(''), name = ref(''), code = ref('')
const busy = ref(false), error = ref(''), message = ref(''), cooldown = ref(0)
const googleTarget = ref(null), googleMessage = ref('')
const labels = { login: 'Sign in', register: 'Create account', otp: 'Email code', reset: 'Reset password', verify: 'Verify email' }
const purpose = computed(() => mode.value === 'register' || mode.value === 'verify' ? 'verify' : mode.value === 'reset' ? 'reset' : 'login')
const timer = setInterval(() => { if (cooldown.value > 0) cooldown.value-- }, 1000)
onUnmounted(() => clearInterval(timer))
function changeMode(value) {
  mode.value = value; step.value = 'details'; code.value = ''; password.value = ''; error.value = ''; message.value = ''
}
async function complete(data) {
  auth.user = data.user
  localStorage.removeItem('sessionId')
  await router.replace(data.user.role === 'admin' ? '/admin' : '/upload')
}
async function requestCode() {
  await http.post('/auth/otp/request', { email: email.value, purpose: purpose.value })
  step.value = 'code'; cooldown.value = 60
  message.value = 'If your account is eligible, a code will arrive shortly. Check your inbox and spam folder.'
}
async function submit() {
  busy.value = true; error.value = ''; message.value = ''
  try {
    if (step.value === 'code') {
      if (mode.value === 'reset') {
        await http.post('/auth/password/reset', { email: email.value, code: code.value, password: password.value })
        changeMode('login'); message.value = 'Password updated. Sign in with your new password.'
      } else await complete((await http.post('/auth/otp/verify', { email: email.value, code: code.value, purpose: purpose.value, password: password.value })).data)
    } else if (mode.value === 'login') {
      await complete((await http.post('/auth/login', { email: email.value, password: password.value })).data)
    } else if (mode.value === 'register') {
      await http.post('/auth/register', { email: email.value, password: password.value, name: name.value })
      step.value = 'code'; cooldown.value = 60; message.value = 'Enter the code sent to your email to finish registration.'
    } else await requestCode()
  } catch (e) {
    error.value = e.response?.data?.message || 'Unable to connect. Please try again.'
    if (e.response?.data?.code === 'EMAIL_UNVERIFIED') { mode.value = 'verify'; step.value = 'details' }
  } finally { busy.value = false }
}
async function resend() {
  busy.value = true; error.value = ''
  try { await requestCode() } catch (e) { error.value = e.response?.data?.message || 'Unable to send code' }
  finally { busy.value = false }
}
onMounted(async () => {
  try {
    const { data } = await http.get('/auth/config')
    if (!data.googleClientId) { googleMessage.value = 'Google sign-in is not configured yet.'; return }
    if (!window.google?.accounts) await new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'; script.async = true
      script.onload = resolve; script.onerror = reject; document.head.appendChild(script)
    })
    window.google.accounts.id.initialize({ client_id: data.googleClientId, callback: async response => {
      busy.value = true; error.value = ''
      try { await complete((await http.post('/auth/google', { credential: response.credential })).data) }
      catch (e) { error.value = e.response?.data?.message || 'Google sign-in failed' }
      finally { busy.value = false }
    } })
    if (googleTarget.value) window.google.accounts.id.renderButton(googleTarget.value, { theme: 'outline', size: 'large', text: 'continue_with' })
  } catch { googleMessage.value = 'Google sign-in could not load. You can sign in with email.' }
})
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-primary-50 p-5">
    <section class="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
      <p class="mb-2 text-sm font-semibold text-primary-700">PHU PHA DIGITAL CAMPUS</p>
      <h1 class="text-3xl font-bold">{{ labels[mode] }}</h1>
      <p class="mt-2 text-sm text-slate-500">Your workspace for intelligent timetabling.</p>
      <div class="my-6 flex gap-2" aria-label="Sign-in options">
        <button v-for="option in ['login', 'register', 'otp']" :key="option" type="button" :disabled="busy" class="flex-1 rounded-lg border p-2 text-sm" :class="mode === option ? 'border-primary-600 bg-primary-50 text-primary-700' : 'border-slate-200'" @click="changeMode(option)">{{ labels[option] }}</button>
      </div>
      <p v-if="error" role="alert" class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{{ error }}</p>
      <p v-if="message" role="status" class="mb-4 rounded-lg bg-primary-50 p-3 text-sm text-primary-700">{{ message }}</p>
      <form class="space-y-4" @submit.prevent="submit">
        <label v-if="mode === 'register' && step === 'details'" class="block text-sm font-medium">Name
          <input v-model="name" autocomplete="name" required maxlength="80" class="mt-1 w-full rounded-lg border border-slate-300 p-3" />
        </label>
        <label class="block text-sm font-medium">Email
          <input v-model="email" type="email" autocomplete="email" required maxlength="254" :readonly="step === 'code'" class="mt-1 w-full rounded-lg border border-slate-300 p-3" />
        </label>
        <label v-if="step === 'code'" class="block text-sm font-medium">Six-digit email code
          <input v-model="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required class="mt-1 w-full rounded-lg border border-slate-300 p-3 tracking-widest" />
        </label>
        <label v-if="(step === 'details' && ['login', 'register'].includes(mode)) || (step === 'code' && ['reset', 'register', 'verify'].includes(mode))" class="block text-sm font-medium">{{ mode === 'reset' ? 'New password' : 'Password' }}
          <input v-model="password" type="password" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'" :minlength="mode === 'login' ? 1 : 12" maxlength="128" required class="mt-1 w-full rounded-lg border border-slate-300 p-3" />
          <span v-if="mode !== 'login'" class="mt-1 block text-xs text-slate-500">Use 12–128 characters.</span>
        </label>
        <button :disabled="busy" class="w-full rounded-lg bg-primary-700 p-3 font-semibold text-white disabled:opacity-50">{{ busy ? 'Please wait…' : step === 'code' ? (mode === 'reset' ? 'Save new password' : 'Verify and sign in') : ['otp', 'reset', 'verify'].includes(mode) ? 'Send email code' : labels[mode] }}</button>
      </form>
      <div v-if="step === 'code'" class="mt-4 flex justify-between text-sm">
        <button :disabled="busy || cooldown > 0" class="text-primary-700 disabled:text-slate-400" @click="resend">{{ cooldown ? `Resend in ${cooldown}s` : 'Resend code' }}</button>
        <button :disabled="busy" @click="changeMode(mode)">Change details</button>
      </div>
      <button v-if="mode === 'login'" class="mt-4 text-sm text-primary-700" @click="changeMode('reset')">Forgot password?</button>
      <div v-show="mode === 'login' && step === 'details'" class="mt-6 border-t border-slate-200 pt-6">
        <div ref="googleTarget" :inert="busy || undefined"></div>
        <p v-if="googleMessage" class="text-sm text-slate-500">{{ googleMessage }}</p>
      </div>
    </section>
  </main>
</template>

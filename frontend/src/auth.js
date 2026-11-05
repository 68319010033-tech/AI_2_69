import { reactive } from 'vue'
import axios from 'axios'

export const auth = reactive({ user: null })
export const http = axios.create({ baseURL: '/api', withCredentials: true })
let refreshPromise
let initPromise
http.interceptors.response.use(r => r, async error => {
  const config = error.config
  if (error.response?.status === 401 && config && !config._retried && (!config.url.startsWith('/auth/') || config.url === '/auth/me')) {
    config._retried = true
    try {
      refreshPromise ||= http.post('/auth/refresh').finally(() => { refreshPromise = null })
      auth.user = (await refreshPromise).data.user
      return http(config)
    } catch (refreshError) {
      if (refreshError.response?.status === 401) {
        auth.user = null
        if (config.url !== '/auth/me' && window.location.pathname !== '/login') window.location.replace('/login?next=' + encodeURIComponent(window.location.pathname))
      }
      return Promise.reject(refreshError)
    }
  }
  return Promise.reject(error)
})
export function initializeAuth() {
  initPromise ||= http.get('/auth/me').then(r => { auth.user = r.data.user }).catch(() => { auth.user = null })
  return initPromise
}
export async function signOut() {
  await http.post('/auth/logout')
  window.google?.accounts.id.disableAutoSelect()
  localStorage.removeItem('sessionId')
  window.location.replace('/login')
}
export async function downloadFile(url) {
  try {
    const response = await http.get(url.replace(/^\/api/, ''), { responseType: 'blob' })
    const objectUrl = URL.createObjectURL(response.data)
    const anchor = document.createElement('a')
    anchor.href = objectUrl
    anchor.download = url.split('/').pop()
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  } catch {
    throw new Error('Unable to download this file. Check your session and try again.')
  }
}

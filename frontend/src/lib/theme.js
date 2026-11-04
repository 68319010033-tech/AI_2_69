import { ref } from 'vue'
export const theme = ref('light')
try { theme.value = localStorage.getItem('phupha-theme') === 'dark' ? 'dark' : 'light' } catch { /* Use light if storage is unavailable. */ }
export function setTheme(value) {
  theme.value = value === 'dark' ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme.value
  try { localStorage.setItem('phupha-theme', theme.value) } catch { /* Theme still works in this tab. */ }
}
setTheme(theme.value)

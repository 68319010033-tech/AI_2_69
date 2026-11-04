import { ref } from 'vue'
// Keep diagnostics in memory only. Never collect data cells, URLs, tokens or server response bodies.
export const lastAppError = ref('')
export function reportAppError(error) { if (import.meta.env.DEV) console.error(error); lastAppError.value = 'Something went wrong. Your saved draft is kept. Reload the page to try again.' }

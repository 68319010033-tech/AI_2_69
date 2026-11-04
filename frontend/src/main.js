import './assets/main.css'
import { createApp } from 'vue'
import { createPinia } from 'pinia'


import { reportAppError } from './lib/diagnostics'
import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.config.errorHandler = reportAppError
window.addEventListener('unhandledrejection', reportAppError)
app.mount('#app')

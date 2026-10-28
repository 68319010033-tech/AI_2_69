import { createRouter, createWebHistory } from 'vue-router'
import { auth, initializeAuth } from '@/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { public: true } },
    { path: '/admin', name: 'admin', component: () => import('@/views/AdminView.vue'), meta: { admin: true } },
    { path: '/', redirect: '/upload' },
    { path: '/upload', name: 'upload', component: () => import('@/views/UploadView.vue'), meta: { step: 1 } },
    { path: '/validate', name: 'validate', component: () => import('@/views/ValidationView.vue'), meta: { step: 2 } },
    { path: '/generate', name: 'generate', component: () => import('@/views/GenerateView.vue'), meta: { step: 3 } },
    { path: '/timetable', name: 'timetable', component: () => import('@/views/TimetableView.vue'), meta: { step: 4 } },
    { path: '/export', name: 'export', component: () => import('@/views/ExportView.vue'), meta: { step: 5 } },
    { path: '/:pathMatch(.*)*', redirect: '/upload' },
  ],
})

router.beforeEach(async to => {
  await initializeAuth()
  if (!to.meta.public && !auth.user) return '/login'
  if (to.meta.admin && auth.user?.role !== 'admin') return '/upload'
  if (to.name === 'login' && auth.user) return '/upload'
})

export default router

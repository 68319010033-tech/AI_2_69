import { createRouter, createWebHistory } from 'vue-router'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', redirect: '/upload' },
    { path: '/upload', name: 'upload', component: () => import('@/views/UploadView.vue'), meta: { step: 1 } },
    { path: '/validate', name: 'validate', component: () => import('@/views/ValidationView.vue'), meta: { step: 2 } },
    { path: '/generate', name: 'generate', component: () => import('@/views/GenerateView.vue'), meta: { step: 3 } },
    { path: '/timetable', name: 'timetable', component: () => import('@/views/TimetableView.vue'), meta: { step: 4 } },
    { path: '/export', name: 'export', component: () => import('@/views/ExportView.vue'), meta: { step: 5 } },
    { path: '/:pathMatch(.*)*', redirect: '/upload' },
  ],
})

export default router

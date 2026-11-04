<script setup>
import SetupGuide from '@/components/SetupGuide.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { t as tr } from '@/i18n'
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore, REQUIRED_FILES } from '@/stores/session'

const store = useSessionStore()
const router = useRouter()
const dragging = ref(false)
const removeName = ref('')
const input = ref(null)
let refreshTimer
function refreshLatest() {
    if (document.visibilityState !== 'visible' || document.activeElement?.tagName === 'TEXTAREA') return
    store.refreshLatest()
}
onMounted(() => {
    refreshLatest()
    refreshTimer = setInterval(refreshLatest, 15000)
    window.addEventListener('focus', refreshLatest)
    document.addEventListener('visibilitychange', refreshLatest)
})
onUnmounted(() => {
    clearInterval(refreshTimer)
    window.removeEventListener('focus', refreshLatest)
    document.removeEventListener('visibilitychange', refreshLatest)
})

function onDrop(e) {
    dragging.value = false
    store.addFiles(e.dataTransfer.files)
}
function onPick(e) {
    store.addFiles(e.target.files)
    e.target.value = ''
}
async function next() {
    if (await store.upload()) router.push('/validate')
}
</script>

<template>
    <div class="mx-auto max-w-5xl p-6 md:p-10">
        <h1 class="text-2xl font-bold text-primary-700"> {{ tr("① อัปโหลดข้อมูล") }} </h1>
        <p class="mt-1 text-slate-500"> {{ tr("ลากไฟล์ CSV ทั้ง 10 ไฟล์มาวางพร้อมกันได้เลย ระบบจับคู่จากชื่อไฟล์ให้อัตโนมัติ") }} </p>
        <div class="mt-3 rounded-lg bg-primary-50 p-3 text-sm" role="status" aria-live="polite">
            <p>{{ tr(store.draftStatus || 'บันทึกฉบับร่างอัตโนมัติในเบราว์เซอร์นี้เมื่อแก้ไขข้อมูล') }}</p>
            <p v-if="store.dirty"> {{ tr("มีการแก้ไขที่ยังไม่ได้ส่งไปยังเซิร์ฟเวอร์") }} </p>
            <p :class="store.remoteAvailable ? 'text-amber-700' : 'text-slate-500'">
                {{ tr(store.refreshStatus || 'ตรวจหาข้อมูลล่าสุดทุก 15 วินาที และเมื่อกลับมาที่หน้านี้') }}
            </p>
        </div>
        <RouterLink to="/validate" class="mt-4 inline-block font-semibold text-primary-700"> {{ tr("กรอกหรือแก้ไขข้อมูลที่หน้าตรวจสอบข้อมูล →") }} </RouterLink>

        <SetupGuide />
        <ConfirmDialog :open="!!removeName" :title="tr('ลบไฟล์')" :message="removeName" :confirm-text="tr('ลบไฟล์')" :cancel-text="tr('Cancel')" danger @confirm="store.removeFile(removeName); removeName = ''" @cancel="removeName = ''" />
        <div class="mt-6 grid gap-6 md:grid-cols-5">
            <!-- Dropzone -->
            <div class="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition md:col-span-3"
                :class="dragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-primary-500 hover:bg-primary-50'"
                role="button" tabindex="0" @keydown.enter.prevent="!store.editingLocked && input.click()" @keydown.space.prevent="!store.editingLocked && input.click()" @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"
                @click="!store.editingLocked && input.click()">
                <div class="text-5xl">📂</div>
                <p class="mt-3 font-semibold"> {{ tr("ลากไฟล์มาวางที่นี่") }} </p>
                <p class="text-sm text-slate-500"> {{ tr("หรือคลิกเพื่อเลือกไฟล์ (เลือกได้หลายไฟล์)") }} </p>
                <input ref="input" type="file" accept=".csv" multiple class="hidden" :disabled="store.editingLocked" @change="onPick" />
            </div>

            <!-- Checklist -->
            <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
                <div class="mb-2 flex items-center justify-between">
                    <h2 class="font-semibold"> {{ tr("ไฟล์ที่ต้องมี") }} </h2>
                    <span class="rounded-full bg-primary-100 px-2 py-0.5 text-sm text-primary-700">
                        {{ REQUIRED_FILES.length - store.missing.length }}/{{ REQUIRED_FILES.length }}
                    </span>
                </div>
                <ul class="divide-y divide-slate-100">
                    <li v-for="name in REQUIRED_FILES" :key="name" class="flex items-center gap-2 py-1.5 text-sm">
                        <span>{{ store.files[name] ? '✅' : '⚪' }}</span>
                        <span :class="store.files[name] ? 'text-slate-800' : 'text-slate-400'">{{ name }}</span>
                        <span v-if="store.files[name]" class="ml-auto text-slate-500">{{ store.files[name].rows }} {{ tr("แถว") }} </span>
                        <button v-if="store.files[name]" class="text-slate-400 hover:text-err" :title="tr('ลบไฟล์')"
                            :disabled="store.editingLocked" @click="removeName = name">✕</button>
                    </li>
                </ul>
            </div>
        </div>

        <p v-if="store.error" class="mt-4 rounded-lg bg-red-50 p-3 text-err">❌ {{ tr(store.error) }}</p>

        <div class="mt-6 flex items-center justify-end gap-4">
           <span v-if="!store.ready" class="text-sm text-slate-500"> {{ tr("ยังไม่ได้อัปโหลด") }} {{ store.missing.length }} {{ tr("ไฟล์") }} </span>
            <button
                class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
               :disabled="!store.canNext || store.editingLocked" @click="next">
                {{ tr(store.reading ? 'กำลังอ่านไฟล์…' : store.uploading ? 'กำลังบันทึก…' : 'บันทึกและตรวจสอบข้อมูล →') }}
            </button>
        </div>
    </div>
</template>

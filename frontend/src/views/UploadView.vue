<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useSessionStore, REQUIRED_FILES } from '@/stores/session'

const store = useSessionStore()
const router = useRouter()
const dragging = ref(false)
const input = ref(null)

// พรีวิวตาราง
const LIMIT = 100
const active = ref('')
const search = ref('')
const uploaded = computed(() => REQUIRED_FILES.filter((n) => store.files[n]))
watch(
    uploaded,
    (list) => { if (!list.includes(active.value)) active.value = list[0] || '' },
    { immediate: true },
)
const current = computed(() => store.files[active.value])
const filtered = computed(() => {
    const t = search.value.trim().toLowerCase()
    const all = (current.value?.data || []).map((r, i) => ({ n: i + 2, r })) // n = เลขบรรทัดในไฟล์
    return t ? all.filter((x) => x.r.some((c) => c.toLowerCase().includes(t))) : all
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
        <h1 class="text-2xl font-bold text-primary-700">① อัปโหลดข้อมูล</h1>
        <p class="mt-1 text-slate-500">ลากไฟล์ CSV ทั้ง 10 ไฟล์มาวางพร้อมกันได้เลย ระบบจับคู่จากชื่อไฟล์ให้อัตโนมัติ</p>

        <div class="mt-6 grid gap-6 md:grid-cols-5">
            <!-- Dropzone -->
            <div class="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center transition md:col-span-3"
                :class="dragging ? 'border-primary-500 bg-primary-50' : 'border-slate-300 hover:border-primary-500 hover:bg-primary-50'"
                @dragover.prevent="dragging = true" @dragleave.prevent="dragging = false" @drop.prevent="onDrop"
                @click="input.click()">
                <div class="text-5xl">📂</div>
                <p class="mt-3 font-semibold">ลากไฟล์มาวางที่นี่</p>
                <p class="text-sm text-slate-500">หรือคลิกเพื่อเลือกไฟล์ (เลือกได้หลายไฟล์)</p>
                <input ref="input" type="file" accept=".csv" multiple class="hidden" @change="onPick" />
            </div>

            <!-- Checklist -->
            <div class="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-2">
                <div class="mb-2 flex items-center justify-between">
                    <h2 class="font-semibold">ไฟล์ที่ต้องมี</h2>
                    <span class="rounded-full bg-primary-100 px-2 py-0.5 text-sm text-primary-700">
                        {{ REQUIRED_FILES.length - store.missing.length }}/{{ REQUIRED_FILES.length }}
                    </span>
                </div>
                <ul class="divide-y divide-slate-100">
                    <li v-for="name in REQUIRED_FILES" :key="name" class="flex items-center gap-2 py-1.5 text-sm">
                        <span>{{ store.files[name] ? '✅' : '⚪' }}</span>
                        <span :class="store.files[name] ? 'text-slate-800' : 'text-slate-400'">{{ name }}</span>
                        <span v-if="store.files[name]" class="ml-auto text-slate-500">{{ store.files[name].rows }}
                            แถว</span>
                        <button v-if="store.files[name]" class="text-slate-400 hover:text-err" title="ลบไฟล์"
                            @click="store.removeFile(name)">✕</button>
                    </li>
                </ul>
            </div>
        </div>

        <!-- Preview -->
        <div v-if="uploaded.length" class="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div class="flex flex-wrap gap-1 border-b border-slate-200 p-2">
                <button v-for="n in uploaded" :key="n" class="rounded-lg px-3 py-1.5 text-sm transition"
                    :class="n === active ? 'bg-primary-600 font-semibold text-white' : 'text-slate-600 hover:bg-primary-50'"
                    @click="active = n; search = ''">
                    {{ n }}
                </button>
            </div>

            <div class="flex items-center justify-between gap-3 p-3">
                <span class="text-sm text-slate-500">
                    {{ current?.rows }} แถว · {{ current?.headers.length }} คอลัมน์
                    <template v-if="filtered.length > LIMIT"> · แสดง {{ LIMIT }} แถวแรก</template>
                </span>
                <input v-model="search" type="search" placeholder="ค้นหาในไฟล์นี้…"
                    class="w-56 rounded-lg border border-slate-300 px-3 py-1.5 text-sm focus:border-primary-500 focus:outline-none" />
            </div>

            <div class="max-h-96 overflow-auto">
                <table class="w-full text-left text-sm">
                    <thead class="sticky top-0 bg-primary-50 text-primary-700">
                        <tr>
                            <th class="px-3 py-2 text-right text-slate-400">#</th>
                            <th v-for="h in current?.headers" :key="h"
                                class="whitespace-nowrap px-3 py-2 font-semibold">{{ h }}
                            </th>
                        </tr>
                    </thead>
                    <tbody class="divide-y divide-slate-100">
                        <tr v-for="x in filtered.slice(0, LIMIT)" :key="x.n" class="hover:bg-slate-50">
                            <td class="px-3 py-1.5 text-right text-slate-400">{{ x.n }}</td>
                            <td v-for="(c, i) in x.r" :key="i" class="whitespace-nowrap px-3 py-1.5">{{ c }}</td>
                        </tr>
                        <tr v-if="!filtered.length">
                            <td :colspan="(current?.headers.length || 0) + 1"
                                class="px-3 py-6 text-center text-slate-400">
                                ไม่พบข้อมูล</td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>


        <p v-if="store.error" class="mt-4 rounded-lg bg-red-50 p-3 text-err">❌ {{ store.error }}</p>

        <div class="mt-6 flex items-center justify-end gap-4">
           <span v-if="!store.ready" class="text-sm text-slate-500">ยังไม่ได้อัปโหลด {{ store.missing.length }} ไฟล์</span>
            <button
                class="rounded-lg bg-primary-600 px-6 py-2.5 font-semibold text-white transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:bg-slate-300"
               :disabled="!store.canNext || store.uploading" @click="next">
                {{ store.uploading ? 'กำลังอัปโหลด…' : 'ถัดไป: ตรวจสอบข้อมูล →' }}
            </button>
        </div>
    </div>
</template>
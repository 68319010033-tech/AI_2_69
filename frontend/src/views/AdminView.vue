<script setup>
import { t as tr } from '@/i18n'
import { onMounted, ref } from 'vue'
import { http } from '@/auth'
const users = ref([]), error = ref(''), loading = ref(true)
onMounted(async () => {
  try { users.value = (await http.get('/admin/users')).data.users }
  catch (e) { error.value = e.response?.data?.message || 'Unable to load users' }
  finally { loading.value = false }
})
</script>
<template>
  <section class="p-6 md:p-10">
    <h1 class="text-2xl font-bold"> {{ tr("Admin · Users") }} </h1>
    <p class="mt-2 text-slate-500"> {{ tr("View registered accounts and their access roles.") }} </p>
    <p v-if="error" role="alert" class="mt-6 text-red-700">{{ error }}</p>
    <p v-else-if="loading" role="status" class="mt-6"> {{ tr("Loading accounts…") }} </p>
    <div v-else class="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table class="w-full text-left text-sm">
        <thead class="bg-slate-50"><tr><th class="p-4"> {{ tr("Name") }} </th><th class="p-4"> {{ tr("Email") }} </th><th class="p-4"> {{ tr("Role") }} </th><th class="p-4"> {{ tr("Email verified") }} </th></tr></thead>
        <tbody><tr v-for="user in users" :key="user.id" class="border-t border-slate-100"><td class="p-4">{{ user.name }}</td><td class="p-4">{{ user.email }}</td><td class="p-4">{{ user.role }}</td><td class="p-4">{{ tr(user.verified ? 'Yes' : 'Pending') }}</td></tr></tbody>
      </table>
    </div>
  </section>
</template>

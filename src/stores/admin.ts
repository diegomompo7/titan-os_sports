import { ref, computed } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'titanos_admin_token'

export const useAdminStore = defineStore('admin', () => {
  const token = ref<string>(sessionStorage.getItem(STORAGE_KEY) ?? '')

  const isAdmin = computed(() => token.value.length > 0)

  function login(t: string) {
    token.value = t
    sessionStorage.setItem(STORAGE_KEY, t)
  }

  function logout() {
    token.value = ''
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return { token, isAdmin, login, logout }
})

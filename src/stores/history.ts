import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const MAX = 8
const KEY = 'titanos_history'

export const useHistoryStore = defineStore('history', () => {
  const ids = ref<string[]>(JSON.parse(localStorage.getItem(KEY) ?? '[]'))

  watch(ids, (val) => localStorage.setItem(KEY, JSON.stringify(val)), { deep: true })

  function add(channelId: string) {
    ids.value = [channelId, ...ids.value.filter((id) => id !== channelId)].slice(0, MAX)
  }

  function hasHistory(channelId: string): boolean {
    return ids.value.includes(channelId)
  }

  return { ids, add, hasHistory }
})

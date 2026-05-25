import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

const STORAGE_KEY = 'titanos_favorites'

export const useFavoritesStore = defineStore('favorites', () => {
  const ids = ref<string[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  )

  watch(ids, (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true })

  function toggle(channelId: string) {
    const i = ids.value.indexOf(channelId)
    if (i >= 0) ids.value.splice(i, 1)
    else ids.value.push(channelId)
  }

  function isFavorite(channelId: string): boolean {
    return ids.value.includes(channelId)
  }

  return { ids, toggle, isFavorite }
})

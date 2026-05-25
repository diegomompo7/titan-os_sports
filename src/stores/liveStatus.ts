import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

export const useLiveStatusStore = defineStore('liveStatus', () => {
  const statuses = ref<Record<string, boolean>>({})

  async function fetchStatuses() {
    try {
      const { data } = await axios.get<Record<string, boolean>>(`${API}/channels/live-status`)
      // Eliminar canales que ya no están en la respuesta
      for (const key of Object.keys(statuses.value)) {
        if (!(key in data)) delete statuses.value[key]
      }
      // Actualizar propiedades en-place → Vue mantiene el tracking reactivo correctamente
      Object.assign(statuses.value, data)
    } catch {
      // silencioso — no interrumpir la UI si falla
    }
  }

  function isLive(channelId: string): boolean {
    return statuses.value[channelId] ?? false
  }

  return { statuses, fetchStatuses, isLive }
})

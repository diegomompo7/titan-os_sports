import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'
import type { Channel, ChannelFormData } from '@/types/channel'

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

export const useChannelsStore = defineStore('channels', () => {
  const channels = ref<Channel[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchChannels() {
    loading.value = true
    error.value = null
    try {
      const { data } = await axios.get<Channel[]>(`${API}/channels`)
      channels.value = data
    } catch {
      error.value = 'No se pudieron cargar los canales'
    } finally {
      loading.value = false
    }
  }

  async function addChannel(data: ChannelFormData, token: string) {
    const { data: created } = await axios.post<Channel>(`${API}/channels`, data, {
      headers: { Authorization: `Bearer ${token}` },
    })
    channels.value.unshift(created)
    return created
  }

  async function updateChannel(id: string, data: Partial<ChannelFormData>, token: string) {
    const { data: updated } = await axios.put<Channel>(`${API}/channels/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const idx = channels.value.findIndex((c) => c.id === id)
    if (idx !== -1) channels.value[idx] = updated
    return updated
  }

  async function removeChannel(id: string, token: string) {
    await axios.delete(`${API}/channels/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    channels.value = channels.value.filter((c) => c.id !== id)
  }

  return { channels, loading, error, fetchChannels, addChannel, updateChannel, removeChannel }
})

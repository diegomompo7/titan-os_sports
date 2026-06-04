import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

export interface Ad {
  id:        string
  url:       string
  label:     string | null
  position:  number
  active:    boolean
  createdAt: string
}

export const useAdsStore = defineStore('ads', () => {
  const ads     = ref<Ad[]>([])
  const loading = ref(false)
  const error   = ref<string | null>(null)

  async function fetchAds() {
    loading.value = true
    error.value   = null
    try {
      const { data } = await axios.get<Ad[]>(`${API}/ads`)
      ads.value = data
    } catch {
      error.value = 'No se pudieron cargar los anuncios'
    } finally {
      loading.value = false
    }
  }

  async function fetchAllAds(token: string) {
    const { data } = await axios.get<Ad[]>(`${API}/ads/all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    ads.value = data
  }

  async function addAd(data: { url: string; label?: string }, token: string) {
    const { data: created } = await axios.post<Ad>(`${API}/ads`, data, {
      headers: { Authorization: `Bearer ${token}` },
    })
    ads.value.push(created)
    return created
  }

  async function updateAd(id: string, data: Partial<Pick<Ad, 'url' | 'label' | 'active'>>, token: string) {
    const { data: updated } = await axios.put<Ad>(`${API}/ads/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const idx = ads.value.findIndex((a) => a.id === id)
    if (idx !== -1) ads.value[idx] = updated
    return updated
  }

  async function removeAd(id: string, token: string) {
    await axios.delete(`${API}/ads/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    ads.value = ads.value.filter((a) => a.id !== id)
  }

  function pickRandomAd(): Ad | null {
    if (ads.value.length === 0) return null
    const idx = Math.floor(Math.random() * ads.value.length)
    return ads.value[idx] ?? null
  }

  return { ads, loading, error, fetchAds, fetchAllAds, addAd, updateAd, removeAd, pickRandomAd }
})

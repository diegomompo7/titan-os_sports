import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL as string

export interface Ad {
  id: string
  url: string
  label: string | null
  position: number
  active: boolean
  createdAt: string
}

export const useAdsStore = defineStore('ads', () => {
  const ads = ref<Ad[]>([])

  async function fetchAds() {
    const { data } = await axios.get<Ad[]>(`${API}/ads`)
    ads.value = data
  }

  async function fetchAllAds(token: string) {
    const { data } = await axios.get<Ad[]>(`${API}/ads/all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    ads.value = data
  }

  async function addAd(url: string, label: string, token: string) {
    const { data } = await axios.post<Ad>(`${API}/ads`, { url, label }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    ads.value.push(data)
  }

  async function toggleAd(id: string, active: boolean, token: string) {
    const { data } = await axios.put<Ad>(`${API}/ads/${id}`, { active }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const idx = ads.value.findIndex((a) => a.id === id)
    if (idx >= 0) ads.value[idx] = data
  }

  async function removeAd(id: string, token: string) {
    await axios.delete(`${API}/ads/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    ads.value = ads.value.filter((a) => a.id !== id)
  }

  function pickRandomAd(): Ad | null {
    const active = ads.value.filter((a) => a.active)
    if (!active.length) return null
    return active[Math.floor(Math.random() * active.length)] ?? null
  }

  return { ads, fetchAds, fetchAllAds, addAd, toggleAd, removeAd, pickRandomAd }
})

import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API = import.meta.env.VITE_API_URL as string

export interface Banner {
  id: string
  imageUrl: string
  label: string | null
  position: number
  active: boolean
  createdAt: string
}

export const useBannersStore = defineStore('banners', () => {
  const banners = ref<Banner[]>([])

  async function fetchBanners() {
    const { data } = await axios.get<Banner[]>(`${API}/banners`)
    banners.value = data
  }

  async function fetchAllBanners(token: string) {
    const { data } = await axios.get<Banner[]>(`${API}/banners/all`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    banners.value = data
  }

  async function addBanner(imageUrl: string, label: string, token: string) {
    const { data } = await axios.post<Banner>(`${API}/banners`, { image_url: imageUrl, label }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    banners.value.push(data)
  }

  async function toggleBanner(id: string, active: boolean, token: string) {
    const { data } = await axios.put<Banner>(`${API}/banners/${id}`, { active }, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const idx = banners.value.findIndex((b) => b.id === id)
    if (idx >= 0) banners.value[idx] = data
  }

  async function removeBanner(id: string, token: string) {
    await axios.delete(`${API}/banners/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    banners.value = banners.value.filter((b) => b.id !== id)
  }

  function pickRandomBanner(): Banner | null {
    const active = banners.value.filter((b) => b.active)
    if (!active.length) return null
    return active[Math.floor(Math.random() * active.length)] ?? null
  }

  return { banners, fetchBanners, fetchAllBanners, addBanner, toggleBanner, removeBanner, pickRandomBanner }
})

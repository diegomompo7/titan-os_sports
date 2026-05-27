import { ref } from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

export interface ChannelEvent {
  id: string
  channelId: string
  title: string
  scheduledAt: string // ISO string
}

export const useEventsStore = defineStore('events', () => {
  const events = ref<ChannelEvent[]>([])
  const now = ref(Date.now())
  let timer: ReturnType<typeof setInterval> | null = null
  let _pollTimer: ReturnType<typeof setInterval> | null = null

  // Track which events have already fired a notification
  const notified = new Set<string>()

  function checkUpcomingNotifications() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    const in10 = now.value + 10 * 60_000
    for (const ev of events.value) {
      const t = new Date(ev.scheduledAt).getTime()
      if (t > now.value && t <= in10 && !notified.has(ev.id)) {
        notified.add(ev.id)
        const mins = Math.round((t - now.value) / 60_000)
        new Notification(`📅 ${ev.title}`, {
          body: `Empieza en ${mins} minuto${mins !== 1 ? 's' : ''}`,
          tag: `event-${ev.id}`,
        })
      }
    }
  }

  function startTimer() {
    if (timer) return
    timer = setInterval(() => {
      now.value = Date.now()
      checkUpcomingNotifications()
    }, 60_000)
    // Polling de nuevos eventos cada 5 minutos (recoge los que inserta el auto-sync del backend)
    _pollTimer = setInterval(() => { fetchEvents().catch(() => {}) }, 5 * 60_000)
  }

  async function fetchEvents() {
    try {
      const { data } = await axios.get<ChannelEvent[]>(`${API}/events`)
      events.value = data
      startTimer()
      checkUpcomingNotifications()
    } catch { /* silencioso */ }
  }

  async function addEvent(
    payload: { channelId: string; title: string; scheduledAt: string },
    token: string
  ) {
    const { data } = await axios.post<ChannelEvent>(`${API}/events`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    })
    events.value.push(data)
    events.value.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    return data
  }

  interface SyncResult {
    created: number
    skipped: number
    events: ChannelEvent[]
  }

  async function syncYoutubeEvents(channelId: string, token: string): Promise<SyncResult> {
    const { data } = await axios.post<SyncResult>(
      `${API}/channels/${channelId}/sync-youtube-events`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    )
    // Merge de nuevos eventos en el estado local (evitar duplicados por id)
    for (const ev of data.events) {
      if (!events.value.find((e) => e.id === ev.id)) {
        events.value.push(ev)
      }
    }
    // Re-ordenar por fecha
    events.value.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    return data
  }

  async function removeEvent(id: string, token: string) {
    await axios.delete(`${API}/events/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    events.value = events.value.filter((e) => e.id !== id)
    notified.delete(id)
  }

  function getNextEvent(channelId: string): ChannelEvent | null {
    return (
      events.value.find(
        (e) => e.channelId === channelId && new Date(e.scheduledAt).getTime() > now.value
      ) ?? null
    )
  }

  function formatCountdown(scheduledAt: string): string {
    const diff = new Date(scheduledAt).getTime() - now.value
    if (diff <= 0) return '¡Ahora!'
    const h = Math.floor(diff / 3_600_000)
    const m = Math.floor((diff % 3_600_000) / 60_000)
    if (h >= 48) return `En ${Math.floor(h / 24)}d`
    if (h >= 24) return `En ${Math.floor(h / 24)}d ${h % 24}h`
    if (h > 0) return `En ${h}h ${m}m`
    return `En ${m}m`
  }

  return { events, now, fetchEvents, addEvent, syncYoutubeEvents, removeEvent, getNextEvent, formatCountdown }
})

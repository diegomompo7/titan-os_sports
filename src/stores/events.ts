/* =============================================================================
   FICHERO: src/stores/events.ts
   ¿QUÉ ES ESTO?
   Gestiona los eventos deportivos programados (próximos partidos,
   retransmisiones, etc.). Cada canal puede tener eventos futuros asociados
   que se muestran en su tarjeta como "próximo evento".

   También envía notificaciones al usuario cuando un evento está a punto
   de empezar (10 minutos antes).

   Analogía: es como la agenda de un periodista deportivo. Sabe qué
   partidos hay programados, cuándo empiezan, y avisa con un recordatorio
   antes de que empiece cada uno.
============================================================================= */

import { ref }  from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

// Estructura de un evento deportivo
export interface ChannelEvent {
  id:          string   // Identificador único
  channelId:   string   // A qué canal pertenece
  title:       string   // Nombre del evento: "Real Madrid vs Barça"
  scheduledAt: string   // Cuándo empieza (texto en formato ISO: "2024-05-10T20:00:00Z")
}

export const useEventsStore = defineStore('events', () => {
  // Lista de todos los eventos futuros de todos los canales
  const events = ref<ChannelEvent[]>([])

  // La hora actual en milisegundos. Se actualiza cada minuto para
  // que las cuentas atrás ("En 2h 30m") se refresquen automáticamente.
  const now = ref(Date.now())

  // Referencias a los temporizadores internos (para poder cancelarlos si hace falta)
  let timer: ReturnType<typeof setInterval> | null = null        // Reloj de un minuto
  let _pollTimer: ReturnType<typeof setInterval> | null = null   // Consulta al servidor cada 5 min

  // Registro de eventos para los que ya se envió notificación.
  // Así no enviamos la misma notificación dos veces.
  const notified = new Set<string>()

  // Revisa si algún evento va a empezar en los próximos 10 minutos
  // y, si el usuario tiene las notificaciones activadas, envía un aviso.
  function checkUpcomingNotifications() {
    // Si el navegador/TV no soporta notificaciones o el usuario no las aceptó, salimos
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    // Calcula el momento que será dentro de 10 minutos
    const in10 = now.value + 10 * 60_000  // 60_000 = 60.000 ms = 1 minuto

    for (const ev of events.value) {
      const t = new Date(ev.scheduledAt).getTime()  // Cuándo empieza el evento (en ms)

      // Condiciones para enviar notificación:
      // - El evento aún no ha empezado (t > now)
      // - El evento empieza en menos de 10 minutos (t <= in10)
      // - No se ha notificado antes (no está en el Set "notified")
      if (t > now.value && t <= in10 && !notified.has(ev.id)) {
        notified.add(ev.id)  // Marcar como ya notificado

        // Calcular cuántos minutos quedan, redondeando al entero más cercano
        const mins = Math.round((t - now.value) / 60_000)

        // Mostrar la notificación del sistema operativo
        new Notification(`📅 ${ev.title}`, {
          body: `Empieza en ${mins} minuto${mins !== 1 ? 's' : ''}`,
          tag: `event-${ev.id}`,  // tag evita duplicados si la misma notificación se dispara varias veces
        })
      }
    }
  }

  // Arranca el reloj interno si no está ya corriendo.
  // Este reloj hace dos cosas cada minuto:
  // 1. Actualizar "now" para refrescar las cuentas atrás en pantalla
  // 2. Comprobar si hay eventos próximos que notificar
  function startTimer() {
    if (timer) return  // Ya está corriendo, no crear otro

    // Ejecutar cada 60 segundos (60.000 ms)
    timer = setInterval(() => {
      now.value = Date.now()
      checkUpcomingNotifications()
    }, 60_000)

    // También preguntar al servidor cada 5 minutos si hay nuevos eventos
    // (el servidor los puede sincronizar automáticamente desde YouTube/EPG)
    _pollTimer = setInterval(() => { fetchEvents().catch(() => {}) }, 5 * 60_000)
  }

  // Descarga todos los eventos futuros del servidor.
  async function fetchEvents() {
    try {
      const { data } = await axios.get<ChannelEvent[]>(`${API}/events`)
      events.value = data
      startTimer()                   // Arrancar el reloj si no estaba
      checkUpcomingNotifications()   // Comprobar notificaciones inmediatamente
    } catch { /* silencioso */ }
  }

  // Crea un nuevo evento en el servidor y lo añade a la lista local,
  // manteniendo la lista ordenada por fecha.
  async function addEvent(
    payload: { channelId: string; title: string; scheduledAt: string },
    token: string
  ) {
    const { data } = await axios.post<ChannelEvent>(`${API}/events`, payload, {
      headers: { Authorization: `Bearer ${token}` },
    })
    events.value.push(data)

    // Ordenar por fecha para que el próximo evento siempre aparezca primero
    events.value.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    return data
  }

  // Resultado que devuelve el servidor al sincronizar eventos de YouTube
  interface SyncResult {
    created: number       // Cuántos eventos nuevos se crearon
    skipped: number       // Cuántos ya existían (se ignoraron)
    events: ChannelEvent[] // Los eventos recién creados
  }

  // Sincroniza los eventos futuros de un canal desde su página de YouTube.
  // El servidor descarga la lista de próximos directos del canal y los guarda.
  async function syncYoutubeEvents(channelId: string, token: string): Promise<SyncResult> {
    const { data } = await axios.post<SyncResult>(
      `${API}/channels/${channelId}/sync-youtube-events`,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    )

    // Añadir a la lista local solo los eventos que no teníamos ya (evitar duplicados)
    for (const ev of data.events) {
      if (!events.value.find((e) => e.id === ev.id)) {
        events.value.push(ev)
      }
    }

    // Reordenar la lista por fecha después de añadir los nuevos
    events.value.sort(
      (a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    )
    return data
  }

  // Elimina un evento del servidor y de la lista local.
  async function removeEvent(id: string, token: string) {
    await axios.delete(`${API}/events/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    // Filtrar: crear nueva lista sin el evento eliminado
    events.value = events.value.filter((e) => e.id !== id)
    // También quitarlo del registro de notificaciones para limpiar memoria
    notified.delete(id)
  }

  // Devuelve el PRÓXIMO evento de un canal (el que antes va a ocurrir).
  // Si no hay ninguno en el futuro, devuelve null.
  function getNextEvent(channelId: string): ChannelEvent | null {
    return (
      events.value.find(
        (e) => e.channelId === channelId && new Date(e.scheduledAt).getTime() > now.value
      ) ?? null
    )
  }

  // Convierte una fecha futura en un texto legible con el tiempo que falta.
  // Ejemplos: "En 3d", "En 2h 15m", "En 45m", "¡Ahora!"
  function formatCountdown(scheduledAt: string): string {
    const diff = new Date(scheduledAt).getTime() - now.value  // Diferencia en milisegundos

    if (diff <= 0) return '¡Ahora!'  // Ya ha empezado o está a punto de empezar

    // Calcular horas y minutos restantes
    const h = Math.floor(diff / 3_600_000)         // 3.600.000 ms = 1 hora
    const m = Math.floor((diff % 3_600_000) / 60_000) // El resto de horas, en minutos

    // Elegir el formato más apropiado según cuánto falta
    if (h >= 48) return `En ${Math.floor(h / 24)}d`         // Más de 2 días: "En 3d"
    if (h >= 24) return `En ${Math.floor(h / 24)}d ${h % 24}h`  // Entre 1 y 2 días
    if (h > 0)   return `En ${h}h ${m}m`                    // Menos de 1 día: "En 2h 15m"
    return `En ${m}m`                                        // Menos de 1 hora: "En 45m"
  }

  return { events, now, fetchEvents, addEvent, syncYoutubeEvents, removeEvent, getNextEvent, formatCountdown }
})

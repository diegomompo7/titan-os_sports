<script setup lang="ts">
/**
 * EventsPanel — Panel de gestión de eventos programados.
 *
 * Funcionalidades:
 *  1. Añadir un evento puntual (canal + título + fecha/hora)
 *  2. Programar eventos recurrentes por días de la semana
 *  3. Sincronizar próximos directos de YouTube para canales configurados
 *  4. Ver y eliminar los eventos programados existentes
 */
import { reactive, ref, computed, onMounted } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useEventsStore } from '@/stores/events'
import { useChannelsStore } from '@/stores/channels'
import { useAdminStore } from '@/stores/admin'

const emit = defineEmits<{ close: [] }>()

const eventsStore   = useEventsStore()
const channelsStore = useChannelsStore()
const adminStore    = useAdminStore()

// Cargar eventos al montar el panel
onMounted(() => eventsStore.fetchEvents())

// ── Formulario de evento puntual ─────────────────────────────────────────────

/** Devuelve la fecha/hora actual en formato datetime-local (para el input mínimo) */
function getNowForInput(): string {
  const now = new Date()
  now.setSeconds(0, 0)
  return now.toISOString().slice(0, 16)
}

const oneOffForm    = reactive({ channelId: '', title: '', scheduledAt: getNowForInput() })
const oneOffSaving  = ref(false)
const oneOffError   = ref('')

async function saveOneOffEvent() {
  if (!oneOffForm.channelId || !oneOffForm.title || !oneOffForm.scheduledAt) return

  oneOffSaving.value = true
  oneOffError.value  = ''

  try {
    await eventsStore.addEvent(
      { channelId: oneOffForm.channelId, title: oneOffForm.title, scheduledAt: oneOffForm.scheduledAt },
      adminStore.token
    )
    // Limpiar para el siguiente evento
    oneOffForm.title       = ''
    oneOffForm.scheduledAt = getNowForInput()
  } catch {
    oneOffError.value = 'Error al guardar el evento. Comprueba la conexión.'
  } finally {
    oneOffSaving.value = false
  }
}

// ── Formulario de evento recurrente (por días de la semana) ──────────────────

const DAYS_OF_WEEK = [
  { label: 'L', dayIndex: 1 },
  { label: 'M', dayIndex: 2 },
  { label: 'X', dayIndex: 3 },
  { label: 'J', dayIndex: 4 },
  { label: 'V', dayIndex: 5 },
  { label: 'S', dayIndex: 6 },
  { label: 'D', dayIndex: 0 },
]

const weeklyForm         = reactive({ channelId: '', title: '', time: '23:00' })
const selectedDays       = ref<number[]>([])
const weeklySaving       = ref(false)
const weeklyError        = ref('')

function toggleDay(dayIndex: number) {
  const position = selectedDays.value.indexOf(dayIndex)
  if (position >= 0) {
    selectedDays.value.splice(position, 1)  // Ya estaba → quitar
  } else {
    selectedDays.value.push(dayIndex)        // No estaba → añadir
  }
}

/**
 * Calcula la próxima fecha en que cae el día de la semana indicado a la hora dada.
 * Si ese día ya pasó esta semana, devuelve la fecha de la próxima semana.
 */
function getNextOccurrence(dayOfWeek: number, time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const now  = new Date()
  const date = new Date(now)

  date.setHours(hours, minutes, 0, 0)

  const todayIndex = now.getDay()
  let daysUntil    = (dayOfWeek - todayIndex + 7) % 7

  // Si es hoy pero la hora ya pasó, programar para la semana que viene
  if (daysUntil === 0 && date <= now) daysUntil = 7

  date.setDate(date.getDate() + daysUntil)
  return date.toISOString().slice(0, 16)
}

async function saveWeeklyEvents() {
  if (!weeklyForm.channelId || !weeklyForm.title || !weeklyForm.time || selectedDays.value.length === 0) return

  weeklySaving.value = true
  weeklyError.value  = ''

  try {
    // Crear un evento por cada día seleccionado
    for (const dayIndex of selectedDays.value) {
      const scheduledAt = getNextOccurrence(dayIndex, weeklyForm.time)
      await eventsStore.addEvent(
        { channelId: weeklyForm.channelId, title: weeklyForm.title, scheduledAt },
        adminStore.token
      )
    }
    weeklyForm.title = ''
    selectedDays.value = []
  } catch {
    weeklyError.value = 'Error al guardar los eventos. Comprueba la conexión.'
  } finally {
    weeklySaving.value = false
  }
}

// ── Sincronización de directos de YouTube ────────────────────────────────────

/** Canales que tienen URL de YouTube configurada para sincronizar */
const youtubeChannels = computed(() =>
  channelsStore.channels.filter((c) => c.streamType === 'youtube' || !!c.youtubeSyncUrl)
)

const syncingChannels = ref<Record<string, boolean>>({})  // channelId → está sincronizando
const syncMessages    = ref<Record<string, string>>({})    // channelId → mensaje resultado

async function syncYoutubeChannel(channelId: string) {
  syncingChannels.value[channelId] = true
  syncMessages.value[channelId]    = ''

  try {
    const result = await eventsStore.syncYoutubeEvents(channelId, adminStore.token)

    if (result.created > 0) {
      syncMessages.value[channelId] = `✓ ${result.created} evento${result.created !== 1 ? 's' : ''} añadido${result.created !== 1 ? 's' : ''}`
    } else if (result.skipped > 0) {
      syncMessages.value[channelId] = `Sin cambios (${result.skipped} ya existente${result.skipped !== 1 ? 's' : ''})`
    } else {
      syncMessages.value[channelId] = 'No hay directos programados próximamente'
    }
  } catch (error: unknown) {
    // Extraer el mensaje de error de la respuesta del servidor si está disponible
    const serverMessage = (error as { response?: { data?: { error?: string } } })?.response?.data?.error
    syncMessages.value[channelId] = serverMessage ?? 'Error al sincronizar'
  } finally {
    syncingChannels.value[channelId] = false
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function getChannelName(channelId: string): string {
  return channelsStore.channels.find((c) => c.id === channelId)?.name ?? channelId
}

async function deleteEvent(eventId: string) {
  await eventsStore.removeEvent(eventId, adminStore.token)
}
</script>

<template>
  <BaseModal title="📅 Programar eventos" @close="emit('close')">
    <div class="panel">

      <!-- ── Sección 1: Evento puntual ── -->
      <section class="panel-section">
        <h3 class="section-title">Añadir evento único</h3>

        <form class="event-form" @submit.prevent="saveOneOffEvent">
          <div class="field">
            <label for="oneoff-channel">Canal</label>
            <select id="oneoff-channel" v-model="oneOffForm.channelId" required>
              <option value="" disabled>Selecciona un canal…</option>
              <option v-for="ch in channelsStore.channels" :key="ch.id" :value="ch.id">
                {{ ch.name }}
              </option>
            </select>
          </div>

          <div class="field">
            <label for="oneoff-title">Título del evento</label>
            <input
              id="oneoff-title"
              v-model="oneOffForm.title"
              type="text"
              placeholder="Ej: Clásico Real Madrid vs Barça"
              required
            />
          </div>

          <div class="field">
            <label for="oneoff-date">Fecha y hora</label>
            <input
              id="oneoff-date"
              v-model="oneOffForm.scheduledAt"
              type="datetime-local"
              :min="getNowForInput()"
              required
            />
          </div>

          <p v-if="oneOffError" class="error-msg">{{ oneOffError }}</p>

          <button type="submit" class="btn btn-primary" :disabled="oneOffSaving">
            {{ oneOffSaving ? 'Guardando…' : '+ Añadir evento' }}
          </button>
        </form>
      </section>

      <!-- ── Sección 2: Eventos recurrentes por día de la semana ── -->
      <section class="panel-section">
        <h3 class="section-title">📆 Programar por días de la semana</h3>

        <div class="field">
          <label for="weekly-channel">Canal</label>
          <select id="weekly-channel" v-model="weeklyForm.channelId">
            <option value="" disabled>Selecciona un canal…</option>
            <option v-for="ch in channelsStore.channels" :key="ch.id" :value="ch.id">
              {{ ch.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label for="weekly-title">Título</label>
          <input id="weekly-title" v-model="weeklyForm.title" type="text" placeholder="Ej: El Futbolín" />
        </div>

        <div class="field">
          <label for="weekly-time">Hora</label>
          <input id="weekly-time" v-model="weeklyForm.time" type="time" />
        </div>

        <div class="field">
          <label>Días</label>
          <div class="days-row">
            <button
              v-for="day in DAYS_OF_WEEK"
              :key="day.dayIndex"
              type="button"
              class="day-btn"
              :class="{ 'day-btn--active': selectedDays.includes(day.dayIndex) }"
              @click="toggleDay(day.dayIndex)"
            >{{ day.label }}</button>
          </div>
        </div>

        <p v-if="weeklyError" class="error-msg">{{ weeklyError }}</p>

        <button
          type="button"
          class="btn btn-primary"
          :disabled="weeklySaving || selectedDays.length === 0 || !weeklyForm.channelId || !weeklyForm.title"
          @click="saveWeeklyEvents"
        >
          {{ weeklySaving
            ? 'Guardando…'
            : `+ Añadir ${selectedDays.length} evento${selectedDays.length !== 1 ? 's' : ''}` }}
        </button>
      </section>

      <!-- ── Sección 3: Sincronizar directos de YouTube ── -->
      <section v-if="youtubeChannels.length > 0" class="panel-section">
        <h3 class="section-title">🔄 Sincronizar directos de YouTube</h3>

        <div v-for="channel in youtubeChannels" :key="channel.id" class="sync-row">
          <span class="sync-channel-name">{{ channel.name }}</span>
          <span v-if="syncMessages[channel.id]" class="sync-result">{{ syncMessages[channel.id] }}</span>
          <button
            class="btn btn-ghost sync-btn"
            :disabled="syncingChannels[channel.id]"
            @click="syncYoutubeChannel(channel.id)"
          >
            {{ syncingChannels[channel.id] ? 'Sincronizando…' : '↓ Sincronizar' }}
          </button>
        </div>
      </section>

      <!-- ── Sección 4: Lista de eventos próximos ── -->
      <section class="panel-section">
        <h3 class="section-title">Eventos programados</h3>

        <p v-if="eventsStore.events.length === 0" class="empty-msg">
          No hay eventos programados todavía
        </p>

        <ul class="events-list">
          <li v-for="event in eventsStore.events" :key="event.id" class="event-item">
            <div class="event-info">
              <span class="event-channel">{{ getChannelName(event.channelId) }}</span>
              <span class="event-title">{{ event.title }}</span>
              <span class="event-time">{{ eventsStore.formatCountdown(event.scheduledAt) }}</span>
            </div>
            <button
              class="delete-btn"
              title="Eliminar evento"
              @click="deleteEvent(event.id)"
            >🗑️</button>
          </li>
        </ul>
      </section>

    </div>
  </BaseModal>
</template>

<style scoped>
/* ── Panel principal ── */
.panel {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

/* ── Secciones ── */
.panel-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
.panel-section:first-child {
  border-top: none;
  padding-top: 0;
}
.section-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}

/* ── Formulario ── */
.event-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
}
.error-msg {
  color: var(--color-danger);
  font-size: 0.82rem;
}

/* ── Selector de días de la semana ── */
.days-row {
  display: flex;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.day-btn {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.day-btn--active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
}

/* ── Sincronización YouTube ── */
.sync-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.sync-channel-name {
  flex: 1;
  font-size: 0.9rem;
  color: var(--color-text-main);
  min-width: 100px;
}
.sync-result {
  font-size: 0.78rem;
  color: var(--color-accent);
}
.sync-btn {
  font-size: 0.82rem;
  min-height: 36px;
  padding: 0 var(--space-3);
}

/* ── Lista de eventos ── */
.events-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.empty-msg {
  color: var(--color-text-muted);
  font-size: 0.88rem;
  text-align: center;
  padding: var(--space-4) 0;
}
.event-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
}
.event-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.event-channel {
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.event-title {
  font-size: 0.88rem;
  color: var(--color-text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-time {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
.delete-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  padding: var(--space-2);
  opacity: 0.5;
  transition: opacity 0.15s;
  flex-shrink: 0;
  min-width: 36px;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.delete-btn:hover { opacity: 1; }
</style>

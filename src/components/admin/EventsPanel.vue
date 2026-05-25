<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useEventsStore } from '@/stores/events'
import { useChannelsStore } from '@/stores/channels'
import { useAdminStore } from '@/stores/admin'

const emit = defineEmits<{ close: [] }>()

const eventsStore = useEventsStore()
const channelsStore = useChannelsStore()
const adminStore = useAdminStore()

onMounted(() => { eventsStore.fetchEvents() })

const saving = ref(false)
const error = ref('')

// Calcular fecha mínima (ahora) en formato datetime-local
function nowLocal() {
  const d = new Date()
  d.setSeconds(0, 0)
  return d.toISOString().slice(0, 16)
}

const form = reactive({ channelId: '', title: '', scheduledAt: nowLocal() })

async function handleAdd() {
  if (!form.channelId || !form.title || !form.scheduledAt) return
  saving.value = true
  error.value = ''
  try {
    await eventsStore.addEvent(
      { channelId: form.channelId, title: form.title, scheduledAt: form.scheduledAt },
      adminStore.token
    )
    form.title = ''
    form.scheduledAt = nowLocal()
  } catch {
    error.value = 'Error al guardar el evento'
  } finally {
    saving.value = false
  }
}

async function handleDelete(id: string) {
  await eventsStore.removeEvent(id, adminStore.token)
}

function channelName(channelId: string) {
  return channelsStore.channels.find((c) => c.id === channelId)?.name ?? channelId
}

// — Programar por días de la semana —
const DAY_LABELS = [
  { label: 'L', day: 1 },
  { label: 'M', day: 2 },
  { label: 'X', day: 3 },
  { label: 'J', day: 4 },
  { label: 'V', day: 5 },
  { label: 'S', day: 6 },
  { label: 'D', day: 0 },
]

const weekForm = reactive({ channelId: '', title: '', time: '23:00' })
const weekSelectedDays = ref<number[]>([])
const weekSaving = ref(false)
const weekError = ref('')

function toggleDay(day: number) {
  const idx = weekSelectedDays.value.indexOf(day)
  if (idx >= 0) weekSelectedDays.value.splice(idx, 1)
  else weekSelectedDays.value.push(day)
}

function nextWeekday(dayOfWeek: number, time: string): string {
  const [h = 0, m = 0] = time.split(':').map(Number)
  const now = new Date()
  const date = new Date(now)
  date.setHours(h, m, 0, 0)
  const currentDay = now.getDay()
  let daysUntil = (dayOfWeek - currentDay + 7) % 7
  if (daysUntil === 0 && date <= now) daysUntil = 7
  date.setDate(date.getDate() + daysUntil)
  return date.toISOString().slice(0, 16)
}

async function handleWeekAdd() {
  if (!weekForm.channelId || !weekForm.title || !weekForm.time || weekSelectedDays.value.length === 0) return
  weekSaving.value = true
  weekError.value = ''
  try {
    for (const day of weekSelectedDays.value) {
      const scheduledAt = nextWeekday(day, weekForm.time)
      await eventsStore.addEvent(
        { channelId: weekForm.channelId, title: weekForm.title, scheduledAt },
        adminStore.token
      )
    }
    weekForm.title = ''
    weekSelectedDays.value = []
  } catch {
    weekError.value = 'Error al guardar los eventos'
  } finally {
    weekSaving.value = false
  }
}

// — Sincronización YouTube —
const syncing = ref<Record<string, boolean>>({})
const syncResults = ref<Record<string, string>>({})

const youtubeChannels = computed(() =>
  channelsStore.channels.filter((c) => c.streamType === 'youtube')
)

async function handleSync(channelId: string) {
  syncing.value[channelId] = true
  syncResults.value[channelId] = ''
  try {
    const result = await eventsStore.syncYoutubeEvents(channelId, adminStore.token)
    if (result.created === 0) {
      syncResults.value[channelId] = result.skipped > 0
        ? `Sin cambios (${result.skipped} ya existente${result.skipped !== 1 ? 's' : ''})`
        : 'No hay directos programados'
    } else {
      syncResults.value[channelId] =
        `${result.created} evento${result.created !== 1 ? 's' : ''} añadido${result.created !== 1 ? 's' : ''}`
    }
  } catch (err: unknown) {
    const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    syncResults.value[channelId] = msg ?? 'Error al sincronizar'
  } finally {
    syncing.value[channelId] = false
  }
}
</script>

<template>
  <BaseModal title="📅 Programar eventos" @close="emit('close')">
    <div class="events-panel">
      <!-- Formulario nuevo evento -->
      <form class="event-form" @submit.prevent="handleAdd">
        <div class="field">
          <label>Canal</label>
          <select v-model="form.channelId" required>
            <option value="" disabled>Selecciona un canal…</option>
            <option v-for="ch in channelsStore.channels" :key="ch.id" :value="ch.id">
              {{ ch.name }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Título del evento</label>
          <input v-model="form.title" type="text" placeholder="Ej: Clásico Real Madrid vs Barça" required />
        </div>
        <div class="field">
          <label>Fecha y hora</label>
          <input v-model="form.scheduledAt" type="datetime-local" :min="nowLocal()" required />
        </div>
        <div v-if="error" class="error-msg">{{ error }}</div>
        <button type="submit" class="btn btn-primary" :disabled="saving">
          {{ saving ? 'Guardando…' : '+ Añadir evento' }}
        </button>
      </form>

      <!-- Programar por días de la semana -->
      <div class="week-section">
        <p class="week-heading">📆 Por días de la semana</p>
        <div class="field">
          <label>Canal</label>
          <select v-model="weekForm.channelId">
            <option value="" disabled>Selecciona un canal…</option>
            <option v-for="ch in channelsStore.channels" :key="ch.id" :value="ch.id">
              {{ ch.name }}
            </option>
          </select>
        </div>
        <div class="field">
          <label>Título</label>
          <input v-model="weekForm.title" type="text" placeholder="Ej: El Futbolín" />
        </div>
        <div class="field">
          <label>Hora</label>
          <input v-model="weekForm.time" type="time" />
        </div>
        <div class="field">
          <label>Días</label>
          <div class="days-row">
            <button
              v-for="d in DAY_LABELS"
              :key="d.day"
              type="button"
              class="day-btn"
              :class="{ active: weekSelectedDays.includes(d.day) }"
              @click="toggleDay(d.day)"
            >{{ d.label }}</button>
          </div>
        </div>
        <div v-if="weekError" class="error-msg">{{ weekError }}</div>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="weekSaving || weekSelectedDays.length === 0 || !weekForm.channelId || !weekForm.title"
          @click="handleWeekAdd"
        >
          {{ weekSaving ? 'Guardando…' : `+ Añadir ${weekSelectedDays.length} evento${weekSelectedDays.length !== 1 ? 's' : ''}` }}
        </button>
      </div>

      <!-- Sincronización directos YouTube -->
      <div v-if="youtubeChannels.length > 0" class="sync-section">
        <p class="sync-heading">🔄 Sincronizar directos de YouTube</p>
        <div v-for="ch in youtubeChannels" :key="ch.id" class="sync-row">
          <span class="sync-channel-name">{{ ch.name }}</span>
          <span v-if="syncResults[ch.id]" class="sync-result">{{ syncResults[ch.id] }}</span>
          <button
            class="btn btn-sync"
            :disabled="syncing[ch.id]"
            @click="handleSync(ch.id)"
          >
            {{ syncing[ch.id] ? 'Sincronizando…' : '↓ Sincronizar' }}
          </button>
        </div>
      </div>

      <!-- Lista de eventos próximos -->
      <div class="events-list">
        <p v-if="eventsStore.events.length === 0" class="empty-msg">No hay eventos programados</p>
        <div v-for="ev in eventsStore.events" :key="ev.id" class="event-item">
          <div class="event-info">
            <span class="event-channel">{{ channelName(ev.channelId) }}</span>
            <span class="event-title">{{ ev.title }}</span>
            <span class="event-time">{{ eventsStore.formatCountdown(ev.scheduledAt) }}</span>
          </div>
          <button class="btn-del" title="Eliminar" @click="handleDelete(ev.id)">🗑️</button>
        </div>
      </div>
    </div>
  </BaseModal>
</template>

<style scoped>
.events-panel {
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
  min-width: 360px;
}
.event-form {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
input, select {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  padding: 7px 10px;
  font-size: 0.875rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
input:focus, select:focus { border-color: var(--color-accent); }
.btn {
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 18px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  align-self: flex-start;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: var(--color-accent); color: #000; }
.error-msg { color: var(--color-danger); font-size: 0.8rem; }
.events-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-md);
}
.empty-msg {
  color: var(--color-text-muted);
  font-size: 0.85rem;
  text-align: center;
  padding: var(--space-md) 0;
}
.event-item {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
}
.event-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}
.event-channel {
  font-size: 0.65rem;
  font-weight: 700;
  color: var(--color-accent);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.event-title {
  font-size: 0.85rem;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.event-time {
  font-size: 0.7rem;
  color: var(--color-text-muted);
}
.btn-del {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 2px;
  opacity: 0.5;
  transition: opacity 0.15s;
}
.btn-del:hover { opacity: 1; }

/* Días de la semana */
.week-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-md);
}
.week-heading {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}
.days-row {
  display: flex;
  gap: var(--space-xs);
}
.day-btn {
  width: 34px;
  height: 34px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}
.day-btn.active {
  background: var(--color-accent);
  color: #000;
  border-color: var(--color-accent);
}

/* Sincronización YouTube */
.sync-section {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  border-top: 1px solid var(--color-border);
  padding-top: var(--space-md);
}
.sync-heading {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0;
}
.sync-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-xs) 0;
}
.sync-channel-name {
  flex: 1;
  font-size: 0.85rem;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sync-result {
  font-size: 0.75rem;
  color: var(--color-accent);
  white-space: nowrap;
}
.btn-sync {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  color: var(--color-text-primary);
  flex-shrink: 0;
}
.btn-sync:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>

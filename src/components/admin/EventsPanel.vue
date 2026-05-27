<script setup lang="ts">
/**
 * EventsPanel — Panel de gestión de eventos programados para Titan OS.
 * Añadir eventos puntuales o recurrentes, sincronizar YouTube.
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

onMounted(() => eventsStore.fetchEvents())

// ── Evento puntual ────────────────────────────────────────────────────────────
function getNowForInput(): string {
  const now = new Date(); now.setSeconds(0, 0)
  return now.toISOString().slice(0, 16)
}

const oneOffForm   = reactive({ channelId: '', title: '', scheduledAt: getNowForInput() })
const oneOffSaving = ref(false)
const oneOffError  = ref('')

async function saveOneOffEvent() {
  if (!oneOffForm.channelId || !oneOffForm.title || !oneOffForm.scheduledAt) return
  oneOffSaving.value = true; oneOffError.value = ''
  try {
    await eventsStore.addEvent(
      { channelId: oneOffForm.channelId, title: oneOffForm.title, scheduledAt: oneOffForm.scheduledAt },
      adminStore.token
    )
    oneOffForm.title = ''; oneOffForm.scheduledAt = getNowForInput()
  } catch { oneOffError.value = 'Error al guardar el evento.' }
  finally  { oneOffSaving.value = false }
}

// ── Eventos recurrentes ───────────────────────────────────────────────────────
const DAYS = [
  { label: 'L', d: 1 }, { label: 'M', d: 2 }, { label: 'X', d: 3 },
  { label: 'J', d: 4 }, { label: 'V', d: 5 }, { label: 'S', d: 6 }, { label: 'D', d: 0 },
]

const weeklyForm   = reactive({ channelId: '', title: '', time: '23:00' })
const selectedDays = ref<number[]>([])
const weeklySaving = ref(false)
const weeklyError  = ref('')

function toggleDay(d: number) {
  const i = selectedDays.value.indexOf(d)
  if (i >= 0) selectedDays.value.splice(i, 1)
  else        selectedDays.value.push(d)
}

function getNextOccurrence(dayOfWeek: number, time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const now = new Date(); const date = new Date(now)
  date.setHours(hours, minutes, 0, 0)
  let until = (dayOfWeek - now.getDay() + 7) % 7
  if (until === 0 && date <= now) until = 7
  date.setDate(date.getDate() + until)
  return date.toISOString().slice(0, 16)
}

async function saveWeeklyEvents() {
  if (!weeklyForm.channelId || !weeklyForm.title || !weeklyForm.time || !selectedDays.value.length) return
  weeklySaving.value = true; weeklyError.value = ''
  try {
    for (const d of selectedDays.value) {
      await eventsStore.addEvent(
        { channelId: weeklyForm.channelId, title: weeklyForm.title, scheduledAt: getNextOccurrence(d, weeklyForm.time) },
        adminStore.token
      )
    }
    weeklyForm.title = ''; selectedDays.value = []
  } catch { weeklyError.value = 'Error al guardar los eventos.' }
  finally  { weeklySaving.value = false }
}

// ── Sync YouTube ──────────────────────────────────────────────────────────────
const youtubeChannels = computed(() =>
  channelsStore.channels.filter((c) => c.streamType === 'youtube' || !!c.youtubeSyncUrl)
)
const syncingMap  = ref<Record<string, boolean>>({})
const syncMsgMap  = ref<Record<string, string>>({})

async function syncYoutube(channelId: string) {
  syncingMap.value[channelId] = true; syncMsgMap.value[channelId] = ''
  try {
    const r = await eventsStore.syncYoutubeEvents(channelId, adminStore.token)
    syncMsgMap.value[channelId] = r.created > 0
      ? `✓ ${r.created} evento${r.created !== 1 ? 's' : ''} añadido${r.created !== 1 ? 's' : ''}`
      : r.skipped > 0
        ? `Sin cambios (${r.skipped} ya existente${r.skipped !== 1 ? 's' : ''})`
        : 'No hay directos programados'
  } catch (e: unknown) {
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
    syncMsgMap.value[channelId] = msg ?? 'Error al sincronizar'
  } finally { syncingMap.value[channelId] = false }
}

function getChannelName(id: string): string {
  return channelsStore.channels.find((c) => c.id === id)?.name ?? id
}
async function deleteEvent(id: string) {
  await eventsStore.removeEvent(id, adminStore.token)
}
</script>

<template>
  <BaseModal title="📅 Programar eventos" wide @close="emit('close')">
    <div class="panel">

      <!-- ── Evento puntual ── -->
      <section class="section">
        <h3 class="section-title">Añadir evento único</h3>
        <form class="event-form" @submit.prevent="saveOneOffEvent">
          <div class="field">
            <label for="oo-channel">Canal</label>
            <select id="oo-channel" v-model="oneOffForm.channelId" required>
              <option value="" disabled>Selecciona un canal…</option>
              <option v-for="ch in channelsStore.channels" :key="ch.id" :value="ch.id">{{ ch.name }}</option>
            </select>
          </div>
          <div class="field">
            <label for="oo-title">Título del evento</label>
            <input id="oo-title" v-model="oneOffForm.title" type="text" placeholder="Ej: Clásico Real Madrid vs Barça" required />
          </div>
          <div class="field">
            <label for="oo-date">Fecha y hora</label>
            <input id="oo-date" v-model="oneOffForm.scheduledAt" type="datetime-local" :min="getNowForInput()" required />
          </div>
          <p v-if="oneOffError" class="error-msg">{{ oneOffError }}</p>
          <button type="submit" class="btn btn-primary" :disabled="oneOffSaving">
            {{ oneOffSaving ? 'Guardando…' : '+ Añadir evento' }}
          </button>
        </form>
      </section>

      <!-- ── Eventos recurrentes ── -->
      <section class="section">
        <h3 class="section-title">📆 Programar por días de la semana</h3>
        <div class="field">
          <label for="wk-channel">Canal</label>
          <select id="wk-channel" v-model="weeklyForm.channelId">
            <option value="" disabled>Selecciona un canal…</option>
            <option v-for="ch in channelsStore.channels" :key="ch.id" :value="ch.id">{{ ch.name }}</option>
          </select>
        </div>
        <div class="field">
          <label for="wk-title">Título</label>
          <input id="wk-title" v-model="weeklyForm.title" type="text" placeholder="Ej: El Futbolín" />
        </div>
        <div class="field">
          <label for="wk-time">Hora</label>
          <input id="wk-time" v-model="weeklyForm.time" type="time" />
        </div>
        <div class="field">
          <label>Días</label>
          <div class="days-row">
            <button
              v-for="day in DAYS"
              :key="day.d"
              type="button"
              class="day-btn"
              :class="{ 'day-btn--active': selectedDays.includes(day.d) }"
              @click="toggleDay(day.d)"
            >{{ day.label }}</button>
          </div>
        </div>
        <p v-if="weeklyError" class="error-msg">{{ weeklyError }}</p>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="weeklySaving || !selectedDays.length || !weeklyForm.channelId || !weeklyForm.title"
          @click="saveWeeklyEvents"
        >
          {{ weeklySaving
            ? 'Guardando…'
            : `+ Añadir ${selectedDays.length} evento${selectedDays.length !== 1 ? 's' : ''}` }}
        </button>
      </section>

      <!-- ── Sync YouTube ── -->
      <section v-if="youtubeChannels.length > 0" class="section">
        <h3 class="section-title">🔄 Sincronizar directos de YouTube</h3>
        <div v-for="ch in youtubeChannels" :key="ch.id" class="sync-row">
          <span class="sync-name">{{ ch.name }}</span>
          <span v-if="syncMsgMap[ch.id]" class="sync-result">{{ syncMsgMap[ch.id] }}</span>
          <button class="btn btn-ghost sync-btn" :disabled="syncingMap[ch.id]" @click="syncYoutube(ch.id)">
            {{ syncingMap[ch.id] ? 'Sincronizando…' : '↓ Sincronizar' }}
          </button>
        </div>
      </section>

      <!-- ── Lista de eventos ── -->
      <section class="section">
        <h3 class="section-title">Eventos programados</h3>
        <p v-if="!eventsStore.events.length" class="empty-msg">No hay eventos programados todavía</p>
        <ul class="events-list">
          <li v-for="ev in eventsStore.events" :key="ev.id" class="event-item">
            <div class="event-info">
              <span class="event-ch">{{ getChannelName(ev.channelId) }}</span>
              <span class="event-title">{{ ev.title }}</span>
              <span class="event-time">{{ eventsStore.formatCountdown(ev.scheduledAt) }}</span>
            </div>
            <button class="del-btn" title="Eliminar" @click="deleteEvent(ev.id)">🗑️</button>
          </li>
        </ul>
      </section>
    </div>
  </BaseModal>
</template>

<style scoped>
.panel {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
.section:first-child { border-top: none; padding-top: 0; }

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}

.event-form { display: flex; flex-direction: column; gap: var(--space-3); }
.error-msg  { color: var(--color-danger); font-size: 0.82rem; }

/* Días de la semana */
.days-row { display: flex; gap: var(--space-2); flex-wrap: wrap; }
.day-btn {
  width: 2.8rem;
  height: 2.8rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s;
}
.day-btn--active { background: var(--color-accent); border-color: var(--color-accent); color: #000; }

/* Sync */
.sync-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  flex-wrap: wrap;
}
.sync-name   { flex: 1; font-size: 0.9rem; color: var(--color-text-main); min-width: 8rem; }
.sync-result { font-size: 0.78rem; color: var(--color-accent); }
.sync-btn    { font-size: 0.82rem; min-height: 2.5rem; padding: 0 var(--space-3); }

/* Lista de eventos */
.events-list  { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.empty-msg    { color: var(--color-text-muted); font-size: 0.88rem; text-align: center; padding: var(--space-4) 0; }
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
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: 0.15rem;
}
.event-ch    { font-size: 0.65rem; font-weight: 700; color: var(--color-accent); text-transform: uppercase; letter-spacing: 0.05em; }
.event-title { font-size: 0.88rem; color: var(--color-text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.event-time  { font-size: 0.72rem; color: var(--color-text-muted); }
.del-btn {
  background: none; border: none; cursor: pointer; font-size: 0.9rem;
  padding: var(--space-2);
  width: 2.5rem; height: 2.5rem;
  display: flex; align-items: center; justify-content: center;
  opacity: 0.45; transition: opacity 0.15s; flex-shrink: 0;
  border-radius: var(--radius-sm);
}
.del-btn:hover { opacity: 1; }
</style>

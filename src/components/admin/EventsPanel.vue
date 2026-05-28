<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/admin/EventsPanel.vue
   ¿QUÉ ES ESTO?
   El panel del administrador para programar eventos deportivos en los canales.
   Es como la agenda del periodista: el admin introduce aquí los partidos y
   retransmisiones previstas, y esos datos aparecen en las tarjetas de los
   canales como "📅 Clásico en 2h 30min".

   Está dentro de un modal (ventana emergente ancha) y tiene cuatro secciones:
     1. EVENTO ÚNICO      → añadir un partido/evento con fecha y hora concretas
     2. EVENTO SEMANAL    → programar un evento que se repite cada semana en ciertos días
                           (ej: "El Futbolín" todos los lunes y jueves a las 23:00)
     3. SYNC YOUTUBE      → para canales de YouTube con youtubeSyncUrl configurada,
                           consulta automáticamente sus próximos directos y los importa
     4. LISTA DE EVENTOS  → todos los eventos actualmente en la base de datos, con
                           botón 🗑️ para eliminar cada uno

   El admin necesita estar autenticado (adminStore.token) para guardar/eliminar.
   Los cambios se envían al servidor y el eventsStore actualiza la lista local.
============================================================================= */
import { reactive, ref, computed, onMounted } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useEventsStore } from '@/stores/events'
import { useChannelsStore } from '@/stores/channels'
import { useAdminStore } from '@/stores/admin'

// Este componente solo emite un evento: 'close' para cerrar el modal
const emit = defineEmits<{ close: [] }>()

const eventsStore   = useEventsStore()   // Lista de eventos y funciones para añadir/borrar
const channelsStore = useChannelsStore() // Lista de canales (para los selectores)
const adminStore    = useAdminStore()    // Token de administrador para las peticiones protegidas

// Al montar el panel, descargar la lista actual de eventos del servidor
onMounted(() => eventsStore.fetchEvents())

// ── Sección 1: Evento único ───────────────────────────────────────────────────

// Devuelve la fecha y hora actual en el formato que necesita el campo datetime-local
// (ej: "2024-03-15T20:30"). Usamos esto como valor inicial del formulario.
function getNowForInput(): string {
  const now = new Date()
  now.setSeconds(0, 0)  // Truncar segundos (el campo datetime-local no los usa)
  return now.toISOString().slice(0, 16)  // "2024-03-15T20:30"
}

// Estado reactivo del formulario de evento único
const oneOffForm = reactive({
  channelId:   '',                // ID del canal seleccionado en el desplegable
  title:       '',                // Título del evento ("Real Madrid vs Barça")
  scheduledAt: getNowForInput(),  // Fecha y hora del evento
})

const oneOffSaving = ref(false)  // true mientras se está guardando → deshabilita el botón
const oneOffError  = ref('')     // Mensaje de error si la petición falla

// Guarda el evento en el servidor. Se ejecuta al hacer submit del formulario.
async function saveOneOffEvent() {
  // Si falta cualquier campo, no hacemos nada (el atributo "required" del HTML
  // ya previene el submit vacío, pero esta validación es una segunda capa)
  if (!oneOffForm.channelId || !oneOffForm.title || !oneOffForm.scheduledAt) return

  oneOffSaving.value = true
  oneOffError.value  = ''
  try {
    await eventsStore.addEvent(
      { channelId: oneOffForm.channelId, title: oneOffForm.title, scheduledAt: oneOffForm.scheduledAt },
      adminStore.token  // Token de admin para que el servidor acepte la petición
    )
    // Limpiar el formulario tras guardar con éxito (preparar para el siguiente evento)
    oneOffForm.title       = ''
    oneOffForm.scheduledAt = getNowForInput()
  } catch {
    oneOffError.value = 'Error al guardar el evento.'
  } finally {
    oneOffSaving.value = false  // Siempre desactivar el spinner al terminar
  }
}

// ── Sección 2: Eventos semanales ─────────────────────────────────────────────

// Días de la semana para los botones de selección.
// La numeración sigue el estándar JavaScript: 0=domingo, 1=lunes ... 6=sábado.
const DAYS = [
  { label: 'L', d: 1 }, { label: 'M', d: 2 }, { label: 'X', d: 3 },
  { label: 'J', d: 4 }, { label: 'V', d: 5 }, { label: 'S', d: 6 }, { label: 'D', d: 0 },
]

// Estado del formulario de eventos semanales
const weeklyForm   = reactive({ channelId: '', title: '', time: '23:00' })
const selectedDays = ref<number[]>([])  // Días seleccionados (ej: [1, 3] = lunes y miércoles)
const weeklySaving = ref(false)
const weeklyError  = ref('')

// Alterna la selección de un día: si ya está seleccionado lo quita, si no lo añade.
// Ejemplo: toggleDay(1) cuando selectedDays=[1,3] → selectedDays=[3]
function toggleDay(d: number) {
  const i = selectedDays.value.indexOf(d)
  if (i >= 0) selectedDays.value.splice(i, 1)  // Quitar si ya estaba
  else        selectedDays.value.push(d)         // Añadir si no estaba
}

// Calcula la fecha del próximo día de la semana a la hora indicada.
// Si hoy es ese día de la semana pero ya pasó la hora → la siguiente semana.
// Ejemplo: si hoy es lunes y son las 22:00, getNextOccurrence(1, '23:00')
//          devuelve "este lunes a las 23:00" (todavía no ha llegado).
function getNextOccurrence(dayOfWeek: number, time: string): string {
  const [hours = 0, minutes = 0] = time.split(':').map(Number)
  const now  = new Date()
  const date = new Date(now)
  date.setHours(hours, minutes, 0, 0)

  // Calcular cuántos días faltan para llegar a ese día de la semana.
  // El módulo 7 garantiza un valor entre 0 y 6.
  let until = (dayOfWeek - now.getDay() + 7) % 7
  // Si es hoy pero ya pasó la hora, esperar 7 días más (la semana siguiente)
  if (until === 0 && date <= now) until = 7

  date.setDate(date.getDate() + until)
  return date.toISOString().slice(0, 16)
}

// Guarda un evento por cada día seleccionado.
// Ejemplo: "El Futbolín" los lunes y jueves → crea 2 eventos con sus fechas próximas.
async function saveWeeklyEvents() {
  if (!weeklyForm.channelId || !weeklyForm.title || !weeklyForm.time || !selectedDays.value.length) return
  weeklySaving.value = true
  weeklyError.value  = ''
  try {
    // Crear un evento por cada día seleccionado (bucle "for ... of")
    for (const d of selectedDays.value) {
      await eventsStore.addEvent(
        {
          channelId:   weeklyForm.channelId,
          title:       weeklyForm.title,
          scheduledAt: getNextOccurrence(d, weeklyForm.time),  // Próxima ocurrencia de ese día
        },
        adminStore.token
      )
    }
    // Limpiar formulario tras guardar
    weeklyForm.title     = ''
    selectedDays.value   = []
  } catch {
    weeklyError.value = 'Error al guardar los eventos.'
  } finally {
    weeklySaving.value = false
  }
}

// ── Sección 3: Sincronización YouTube ────────────────────────────────────────

// Canales que tienen configurada la sincronización con YouTube:
// - Canales de tipo 'youtube', o
// - Cualquier canal que tenga una URL de YouTube para sincronizar (youtubeSyncUrl)
const youtubeChannels = computed(() =>
  channelsStore.channels.filter((c) => c.streamType === 'youtube' || !!c.youtubeSyncUrl)
)

// Mapas de estado para cada canal: clave=channelId, valor=true/false o mensaje
// Usamos mapas (objetos) en vez de un único boolean para gestionar múltiples
// canales sincronizando a la vez de forma independiente.
const syncingMap = ref<Record<string, boolean>>({})  // ¿Está sincronizando este canal ahora?
const syncMsgMap = ref<Record<string, string>>({})    // Mensaje del resultado de la última sync

// Lanza la sincronización de YouTube para un canal concreto.
// El servidor consulta la YouTube Data API y crea los eventos en la base de datos.
async function syncYoutube(channelId: string) {
  syncingMap.value[channelId] = true
  syncMsgMap.value[channelId] = ''
  try {
    const r = await eventsStore.syncYoutubeEvents(channelId, adminStore.token)
    // Construir el mensaje de resultado según cuántos eventos se crearon/saltaron
    syncMsgMap.value[channelId] = r.created > 0
      ? `✓ ${r.created} evento${r.created !== 1 ? 's' : ''} añadido${r.created !== 1 ? 's' : ''}`
      : r.skipped > 0
        ? `Sin cambios (${r.skipped} ya existente${r.skipped !== 1 ? 's' : ''})`
        : 'No hay directos programados'
  } catch (e: unknown) {
    // Intentar extraer el mensaje de error del servidor; si no, mensaje genérico
    const msg = (e as { response?: { data?: { error?: string } } })?.response?.data?.error
    syncMsgMap.value[channelId] = msg ?? 'Error al sincronizar'
  } finally {
    syncingMap.value[channelId] = false
  }
}

// Ayudante: dado el ID de un canal, devuelve su nombre legible para la lista
function getChannelName(id: string): string {
  return channelsStore.channels.find((c) => c.id === id)?.name ?? id
}

// Elimina un evento de la base de datos (con token de admin)
async function deleteEvent(id: string) {
  await eventsStore.removeEvent(id, adminStore.token)
}
</script>

<template>
  <!-- Modal ancho (wide) — contiene las cuatro secciones del panel de eventos -->
  <BaseModal title="📅 Programar eventos" wide @close="emit('close')">
    <div class="panel">

      <!-- ══ SECCIÓN 1: EVENTO ÚNICO ═══════════════════════════════════════
           Formulario para programar un partido o evento con fecha exacta.
      ════════════════════════════════════════════════════════════════════ -->
      <section class="section">
        <h3 class="section-title">Añadir evento único</h3>
        <!-- @submit.prevent llama a saveOneOffEvent() sin recargar la página -->
        <form class="event-form" @submit.prevent="saveOneOffEvent">
          <!-- Selector de canal -->
          <div class="field">
            <label for="oo-channel">Canal</label>
            <select id="oo-channel" v-model="oneOffForm.channelId" required>
              <option value="" disabled>Selecciona un canal…</option>
              <!-- Un <option> por cada canal disponible -->
              <option v-for="ch in channelsStore.channels" :key="ch.id" :value="ch.id">{{ ch.name }}</option>
            </select>
          </div>
          <!-- Título del evento -->
          <div class="field">
            <label for="oo-title">Título del evento</label>
            <input id="oo-title" v-model="oneOffForm.title" type="text" placeholder="Ej: Clásico Real Madrid vs Barça" required />
          </div>
          <!-- Fecha y hora. :min evita seleccionar fechas pasadas. -->
          <div class="field">
            <label for="oo-date">Fecha y hora</label>
            <input id="oo-date" v-model="oneOffForm.scheduledAt" type="datetime-local" :min="getNowForInput()" required />
          </div>
          <!-- Mensaje de error si falla -->
          <p v-if="oneOffError" class="error-msg">{{ oneOffError }}</p>
          <!-- :disabled bloquea el botón mientras se está guardando -->
          <button type="submit" class="btn btn-primary" :disabled="oneOffSaving">
            {{ oneOffSaving ? 'Guardando…' : '+ Añadir evento' }}
          </button>
        </form>
      </section>

      <!-- ══ SECCIÓN 2: EVENTOS SEMANALES ══════════════════════════════════
           Para programar eventos que se repiten cada semana: el admin elige
           canal, título, hora y días de la semana. Al guardar, se crean
           tantos eventos como días seleccionados, con la próxima ocurrencia
           de cada día.
      ════════════════════════════════════════════════════════════════════ -->
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
        <!-- Botones de selección de días: L M X J V S D
             Cada botón alterna su estado (selectedDays). El resaltado azul
             indica que ese día está seleccionado. -->
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
        <!-- Botón deshabilitado si no hay días seleccionados o faltan campos.
             El texto muestra cuántos eventos se van a crear. -->
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

      <!-- ══ SECCIÓN 3: SINCRONIZACIÓN YOUTUBE ════════════════════════════
           Solo aparece si hay canales con configuración de YouTube.
           Un botón "↓ Sincronizar" por canal que consulta la API de YouTube
           y crea automáticamente los próximos directos como eventos.
      ════════════════════════════════════════════════════════════════════ -->
      <section v-if="youtubeChannels.length > 0" class="section">
        <h3 class="section-title">🔄 Sincronizar directos de YouTube</h3>
        <!-- Una fila por cada canal YouTube/con URL de sync -->
        <div v-for="ch in youtubeChannels" :key="ch.id" class="sync-row">
          <span class="sync-name">{{ ch.name }}</span>
          <!-- Mensaje resultado de la última sincronización (si hay alguno) -->
          <span v-if="syncMsgMap[ch.id]" class="sync-result">{{ syncMsgMap[ch.id] }}</span>
          <!-- Botón deshabilitado mientras sincroniza -->
          <button class="btn btn-ghost sync-btn" :disabled="syncingMap[ch.id]" @click="syncYoutube(ch.id)">
            {{ syncingMap[ch.id] ? 'Sincronizando…' : '↓ Sincronizar' }}
          </button>
        </div>
      </section>

      <!-- ══ SECCIÓN 4: LISTA DE EVENTOS PROGRAMADOS ═══════════════════════
           Todos los eventos en la base de datos, con botón de eliminar.
           Cada item muestra: canal · título · cuenta atrás
      ════════════════════════════════════════════════════════════════════ -->
      <section class="section">
        <h3 class="section-title">Eventos programados</h3>
        <!-- Mensaje vacío si no hay ningún evento -->
        <p v-if="!eventsStore.events.length" class="empty-msg">No hay eventos programados todavía</p>
        <ul class="events-list">
          <li v-for="ev in eventsStore.events" :key="ev.id" class="event-item">
            <div class="event-info">
              <!-- Nombre del canal (resuelto de ID a nombre con getChannelName()) -->
              <span class="event-ch">{{ getChannelName(ev.channelId) }}</span>
              <!-- Título del evento (truncado con "…" si es muy largo) -->
              <span class="event-title">{{ ev.title }}</span>
              <!-- Cuenta atrás: "en 2h 30min", "Ahora", "hace 5min" -->
              <span class="event-time">{{ eventsStore.formatCountdown(ev.scheduledAt) }}</span>
            </div>
            <!-- Botón eliminar: borra el evento del servidor y actualiza la lista -->
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

<script setup lang="ts">
/**
 * ChannelGrid — Grid responsivo de tarjetas de canales.
 *
 * Características:
 * - Búsqueda por nombre en tiempo real
 * - Filtros rápidos: Todos, En directo, Favoritos, Recientes, por categoría
 * - Drag & drop para reordenar canales (orden guardado en localStorage)
 * - Navegación por teclado y mando de juego (expone moveFocus / selectFocused)
 * - Responsivo: 1 col móvil → hasta 6+ cols en TV (auto-fill CSS Grid)
 */
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Sortable from 'sortablejs'
import type { Channel, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore } from '@/stores/history'
import ChannelCard from './ChannelCard.vue'

// ── Props y eventos ──────────────────────────────────────────────────────────
const props = defineProps<{
  channels:      Channel[]
  isAdmin:       boolean
  loading:       boolean
  error:         string | null
  getLiveStatus: (id: string) => boolean
}>()

const emit = defineEmits<{
  select: [Channel]
  edit:   [Channel]
  delete: [Channel]
}>()

// ── Stores ───────────────────────────────────────────────────────────────────
const favStore     = useFavoritesStore()
const historyStore = useHistoryStore()

// ── Estado de filtros ────────────────────────────────────────────────────────
// null = "Todos"
const activeFilter = ref<SportCategory | 'live' | 'favorites' | 'recent' | null>(null)
const searchQuery  = ref('')

// ── Orden personalizado por drag & drop ─────────────────────────────────────
const ORDER_STORAGE_KEY = 'titanos_channel_order'

// Carga el orden guardado (array de IDs en el orden del usuario)
const savedOrder = ref<string[]>(
  JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) ?? '[]')
)

// Persiste el orden cada vez que cambia
watch(savedOrder, (newOrder) => {
  localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(newOrder))
}, { deep: true })

/**
 * Canales ordenados según el orden guardado.
 * Los canales nuevos (no en savedOrder) aparecen al final.
 */
const orderedChannels = computed(() => {
  const allIds = props.channels.map((c) => c.id)

  // Filtrar IDs guardados que aún existen + añadir los nuevos al final
  const savedIds  = savedOrder.value.filter((id) => allIds.includes(id))
  const newIds    = allIds.filter((id) => !savedIds.includes(id))
  const orderedIds = [...savedIds, ...newIds]

  return orderedIds
    .map((id) => props.channels.find((c) => c.id === id))
    .filter((c): c is Channel => !!c)
})

// ── Chips de filtro disponibles ──────────────────────────────────────────────
/** Solo muestra las categorías que tienen al menos un canal */
const presentCategories = computed(() => {
  const categoriesWithChannels = new Set(props.channels.map((c) => c.category))
  return (Object.keys(CATEGORY_LABELS) as SportCategory[])
    .filter((cat) => categoriesWithChannels.has(cat))
})

const hasLiveChannels    = computed(() => props.channels.some((c) => props.getLiveStatus(c.id)))
const hasFavoriteChannels = computed(() => props.channels.some((c) => favStore.isFavorite(c.id)))
const hasRecentChannels  = computed(() => props.channels.some((c) => historyStore.hasHistory(c.id)))

// ── Lista de canales visible (filtrada y ordenada) ───────────────────────────
const visibleChannels = computed(() => {
  let list = orderedChannels.value

  // 1. Filtrar por búsqueda de texto
  const query = searchQuery.value.trim().toLowerCase()
  if (query) {
    list = list.filter((c) => c.name.toLowerCase().includes(query))
  }

  // 2. Aplicar el chip de filtro activo
  if (activeFilter.value === 'live') {
    list = list.filter((c) => props.getLiveStatus(c.id))

  } else if (activeFilter.value === 'favorites') {
    list = list.filter((c) => favStore.isFavorite(c.id))

  } else if (activeFilter.value === 'recent') {
    // Ordenar por historial: el más reciente primero
    const historyIds = historyStore.ids
    list = list
      .filter((c) => historyStore.hasHistory(c.id))
      .sort((a, b) => historyIds.indexOf(a.id) - historyIds.indexOf(b.id))

  } else if (activeFilter.value) {
    // Filtro por categoría deportiva
    list = list.filter((c) => c.category === activeFilter.value)
  }

  // 3. Poner los canales en directo al inicio (excepto en modo "recientes")
  if (activeFilter.value !== 'recent') {
    list = [...list].sort((a, b) => {
      const aIsLive = props.getLiveStatus(a.id) ? 1 : 0
      const bIsLive = props.getLiveStatus(b.id) ? 1 : 0
      return bIsLive - aIsLive  // b - a: los en directo van antes
    })
  }

  return list
})

// ── Drag & drop con SortableJS ───────────────────────────────────────────────
const gridEl = ref<HTMLElement | null>(null)
let sortableInstance: ReturnType<typeof Sortable.create> | null = null

onMounted(() => {
  if (!gridEl.value) return

  sortableInstance = Sortable.create(gridEl.value, {
    animation: 150,
    ghostClass: 'drag-ghost',
    filter: '.admin-actions, .fav-btn',  // No arrastrar si el click es en botones
    preventOnFilter: false,

    onEnd(event) {
      const { oldIndex, newIndex } = event
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return

      // Reordenar los IDs visibles
      const visibleIds = visibleChannels.value.map((c) => c.id)
      const [movedId] = visibleIds.splice(oldIndex, 1)
      if (!movedId) return
      visibleIds.splice(newIndex, 0, movedId)

      // Reconstruir el orden global: nuevos IDs visibles + los canales ocultos al final
      const visibleSet = new Set(visibleChannels.value.map((c) => c.id))
      const hiddenIds  = savedOrder.value.filter(
        (id) => !visibleSet.has(id) && props.channels.some((c) => c.id === id)
      )
      savedOrder.value = [...visibleIds, ...hiddenIds]
    },
  })
})

onBeforeUnmount(() => {
  sortableInstance?.destroy()
  sortableInstance = null
})

// ── Navegación por teclado / mando de juego ──────────────────────────────────
const focusedIndex = ref(-1)     // -1 = sin foco visual (modo ratón)
const cardRefs     = ref<HTMLElement[]>([])

// Si el filtro cambia y el ítem enfocado ya no existe, ajustar el índice
watch(visibleChannels, (newList) => {
  if (focusedIndex.value >= newList.length) {
    focusedIndex.value = Math.max(0, newList.length - 1)
  }
})

/** Mueve el foco visual hacia arriba o abajo */
function moveFocus(direction: 'up' | 'down') {
  const totalChannels = visibleChannels.value.length
  if (totalChannels === 0) return

  if (focusedIndex.value < 0) {
    // Si no hay foco activo, empezar por el primero (abajo) o el último (arriba)
    focusedIndex.value = direction === 'down' ? 0 : totalChannels - 1
  } else {
    focusedIndex.value = direction === 'up'
      ? Math.max(0, focusedIndex.value - 1)
      : Math.min(totalChannels - 1, focusedIndex.value + 1)
  }

  // Hacer scroll para que la tarjeta enfocada sea visible
  nextTick(() => {
    cardRefs.value[focusedIndex.value]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

/** Selecciona el canal que tiene el foco visual */
function selectFocused() {
  const channel = visibleChannels.value[focusedIndex.value]
  if (channel) emit('select', channel)
}

/** El ratón desactiva el foco visual para no interferir con la interacción */
function onMouseEnterGrid() {
  focusedIndex.value = -1
}

// Expone los métodos para que HomeView los llame desde teclado/mando
defineExpose({ moveFocus, selectFocused })
</script>

<template>
  <div class="grid-wrapper">

    <!-- Estado de carga -->
    <p v-if="loading" class="state-message">Cargando canales…</p>

    <!-- Error de red -->
    <p v-else-if="error" class="state-message state-message--error">{{ error }}</p>

    <template v-else>

      <!-- Barra de búsqueda y chips de filtro -->
      <div v-if="channels.length > 0" class="filter-bar">
        <input
          v-model="searchQuery"
          class="search-input"
          type="search"
          placeholder="🔍 Buscar canal…"
          aria-label="Buscar canal"
        />

        <!-- Chip "Todos" -->
        <button
          class="chip"
          :class="{ 'chip--active': activeFilter === null }"
          @click="activeFilter = null"
        >Todos</button>

        <!-- Chip "En directo" — solo visible si hay algún canal live -->
        <button
          v-if="hasLiveChannels"
          class="chip chip--live"
          :class="{ 'chip--active': activeFilter === 'live' }"
          @click="activeFilter = activeFilter === 'live' ? null : 'live'"
        >● En directo</button>

        <!-- Chip "Favoritos" — solo visible si hay alguno marcado -->
        <button
          v-if="hasFavoriteChannels"
          class="chip chip--fav"
          :class="{ 'chip--active': activeFilter === 'favorites' }"
          @click="activeFilter = activeFilter === 'favorites' ? null : 'favorites'"
        >⭐ Favoritos</button>

        <!-- Chip "Recientes" — solo visible si hay historial -->
        <button
          v-if="hasRecentChannels"
          class="chip chip--recent"
          :class="{ 'chip--active': activeFilter === 'recent' }"
          @click="activeFilter = activeFilter === 'recent' ? null : 'recent'"
        >🕑 Recientes</button>

        <!-- Chips por categoría deportiva -->
        <button
          v-for="category in presentCategories"
          :key="category"
          class="chip"
          :class="{ 'chip--active': activeFilter === category }"
          @click="activeFilter = activeFilter === category ? null : category as SportCategory"
        >{{ CATEGORY_LABELS[category] }}</button>
      </div>

      <!-- Mensaje si no hay canales -->
      <p v-if="channels.length === 0" class="state-message">
        No hay canales aún. ¡Añade el primero desde el panel admin!
      </p>

      <!-- Mensaje si el filtro no devuelve resultados -->
      <p v-else-if="visibleChannels.length === 0" class="state-message">
        Ningún canal coincide con este filtro
      </p>

      <!-- Grid de tarjetas -->
      <div
        v-else
        ref="gridEl"
        class="grid"
        @mouseenter="onMouseEnterGrid"
      >
        <ChannelCard
          v-for="(channel, index) in visibleChannels"
          :key="channel.id"
          :ref="(el) => { if (el) cardRefs[index] = (el as any).$el }"
          :channel="channel"
          :isAdmin="isAdmin"
          :isLive="getLiveStatus(channel.id)"
          :isFocused="focusedIndex === index"
          @select="emit('select', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Contenedor principal con scroll ── */
.grid-wrapper {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-3) var(--space-4);
}

/* ── Barra de filtros ── */
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
  align-items: center;
  margin-bottom: var(--space-4);
}

/* Campo de búsqueda */
.search-input {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.8rem;
  padding: 6px 14px;
  outline: none;
  min-height: var(--touch-target);
  width: 160px;
  transition: border-color 0.15s, width 0.2s;
}
.search-input:focus {
  border-color: var(--color-accent);
  width: 220px;
}
.search-input::placeholder { color: var(--color-text-muted); }

/* Chips de filtro */
.chip {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 0 12px;
  min-height: var(--touch-target);
  text-transform: uppercase;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  white-space: nowrap;
}
.chip:hover    { border-color: var(--color-accent); color: var(--color-accent); }
.chip--active  { background: var(--color-accent); border-color: var(--color-accent); color: #000; }

.chip--live    { color: var(--color-live); border-color: rgba(255,68,68,0.4); text-transform: none; }
.chip--live.chip--active  { background: var(--color-live); border-color: var(--color-live); color: #fff; }

.chip--fav     { color: var(--color-fav); border-color: rgba(245,166,35,0.4); text-transform: none; }
.chip--fav.chip--active   { background: var(--color-fav); border-color: var(--color-fav); color: #000; }

.chip--recent  { color: var(--color-recent); border-color: rgba(167,139,250,0.4); text-transform: none; }
.chip--recent.chip--active { background: var(--color-recent); border-color: var(--color-recent); color: #000; }

/* ── Grid responsivo ────────────────────────────────────────────────────────
   auto-fill + minmax crea automáticamente tantas columnas como quepan.
   El número de columnas según pantalla:
     Móvil  (<480px)  → 1 columna   (280px mínimo no cabe si hay márgenes)
     Tablet (480px+)  → 2 columnas
     Medio  (768px+)  → 3 columnas
     Escritorio(1024px+)→ 4 columnas
     Monitor (1440px+)→ 5 columnas
     TV     (1920px+) → 6-7 columnas
   Todo esto sin una sola media query explícita. ──────────────────────────── */
.grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(var(--card-min-width), 1fr));
  gap: var(--space-4);
}

/* ── Estado vacío / cargando ── */
.state-message {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-8) var(--space-4);
  font-size: 0.9rem;
}
.state-message--error {
  color: var(--color-danger);
}
</style>

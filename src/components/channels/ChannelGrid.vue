<script setup lang="ts">
/**
 * ChannelGrid — Grid de canales para Titan OS (1366×768).
 *
 * Diseño exclusivo para Smart TV:
 * - 5 columnas fijas en modo normal, 1 columna en modo sidebar
 * - Navegación completa por D-pad (↑↓←→) y teclado
 * - Sin drag & drop (no usable con mando de TV)
 * - Filter bar integrada en el propio grid
 * - Focus visual prominente para navegación por mando
 */
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import type { Channel, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore }   from '@/stores/history'
import ChannelCard from './ChannelCard.vue'

// ── Props y eventos ──────────────────────────────────────────────────────────
const props = defineProps<{
  channels:      Channel[]
  isAdmin:       boolean
  loading:       boolean
  error:         string | null
  getLiveStatus: (id: string) => boolean
  sidebarMode?:  boolean   // true = columna única (modo teatro/multi)
}>()

const emit = defineEmits<{
  select: [Channel]
  edit:   [Channel]
  delete: [Channel]
}>()

// ── Stores ───────────────────────────────────────────────────────────────────
const favStore     = useFavoritesStore()
const historyStore = useHistoryStore()

// ── Filtros ──────────────────────────────────────────────────────────────────
const activeFilter = ref<SportCategory | 'live' | 'favorites' | 'recent' | null>(null)
const searchQuery  = ref('')

// ── Canales filtrados y ordenados ────────────────────────────────────────────
const presentCategories = computed(() => {
  const set = new Set(props.channels.map((c) => c.category))
  return (Object.keys(CATEGORY_LABELS) as SportCategory[]).filter((cat) => set.has(cat))
})

const hasLiveChannels     = computed(() => props.channels.some((c) => props.getLiveStatus(c.id)))
const hasFavoriteChannels = computed(() => props.channels.some((c) => favStore.isFavorite(c.id)))
const hasRecentChannels   = computed(() => props.channels.some((c) => historyStore.hasHistory(c.id)))

const visibleChannels = computed(() => {
  let list = [...props.channels]

  // 1. Búsqueda de texto
  const query = searchQuery.value.trim().toLowerCase()
  if (query) list = list.filter((c) => c.name.toLowerCase().includes(query))

  // 2. Filtro activo
  if (activeFilter.value === 'live') {
    list = list.filter((c) => props.getLiveStatus(c.id))
  } else if (activeFilter.value === 'favorites') {
    list = list.filter((c) => favStore.isFavorite(c.id))
  } else if (activeFilter.value === 'recent') {
    const historyIds = historyStore.ids
    list = list
      .filter((c) => historyStore.hasHistory(c.id))
      .sort((a, b) => historyIds.indexOf(a.id) - historyIds.indexOf(b.id))
  } else if (activeFilter.value) {
    list = list.filter((c) => c.category === activeFilter.value)
  }

  // 3. Canales en directo primero (salvo modo recientes)
  if (activeFilter.value !== 'recent') {
    list = list.sort((a, b) => {
      return (props.getLiveStatus(b.id) ? 1 : 0) - (props.getLiveStatus(a.id) ? 1 : 0)
    })
  }

  return list
})

// ── Navegación por D-pad ─────────────────────────────────────────────────────
// En modo normal: 5 columnas (--grid-cols)
// En modo sidebar: 1 columna
const COLS = computed(() => props.sidebarMode ? 1 : 5)

const focusedIndex = ref(-1)
const cardRefs     = ref<HTMLElement[]>([])
const gridEl       = ref<HTMLElement | null>(null)

// Ajustar índice cuando cambia la lista
watch(visibleChannels, (newList) => {
  if (focusedIndex.value >= newList.length) {
    focusedIndex.value = Math.max(0, newList.length - 1)
  }
})

function moveFocus(direction: 'up' | 'down' | 'left' | 'right') {
  const total = visibleChannels.value.length
  if (total === 0) return

  const cols = COLS.value

  if (focusedIndex.value < 0) {
    focusedIndex.value = direction === 'up' || direction === 'left' ? total - 1 : 0
  } else {
    const current = focusedIndex.value
    let next = current

    if (direction === 'up')    next = Math.max(0, current - cols)
    if (direction === 'down')  next = Math.min(total - 1, current + cols)
    if (direction === 'left')  next = Math.max(0, current - 1)
    if (direction === 'right') next = Math.min(total - 1, current + 1)

    focusedIndex.value = next
  }

  nextTick(() => {
    cardRefs.value[focusedIndex.value]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function selectFocused() {
  const channel = visibleChannels.value[focusedIndex.value]
  if (channel) emit('select', channel)
}

// Desactivar foco visual cuando el ratón entra al grid
function onMouseEnterGrid() {
  focusedIndex.value = -1
}

// ── Inicializar foco automático al montar ─────────────────────────────────────
onMounted(() => {
  // En modo normal, activar el primer canal al cargar
  if (!props.sidebarMode && visibleChannels.value.length > 0) {
    focusedIndex.value = 0
  }
})

// ── Exponer para HomeView ─────────────────────────────────────────────────────
defineExpose({ moveFocus, selectFocused })
</script>

<template>
  <div class="grid-wrapper" :class="{ 'grid-wrapper--sidebar': sidebarMode }">

    <!-- Estado de carga -->
    <div v-if="loading" class="state-msg">
      <span class="state-spinner">⏳</span>
      <p>Cargando canales…</p>
    </div>

    <!-- Error de red -->
    <div v-else-if="error" class="state-msg state-msg--error">
      <p>⚠️ {{ error }}</p>
    </div>

    <template v-else>

      <!-- ══ BARRA DE FILTROS (solo en modo normal) ══ -->
      <div v-if="!sidebarMode && channels.length > 0" class="filter-bar">

        <!-- Campo de búsqueda -->
        <div class="search-wrap">
          <span class="search-icon">🔍</span>
          <input
            v-model="searchQuery"
            class="search-input"
            type="search"
            placeholder="Buscar canal…"
            aria-label="Buscar canal"
          />
        </div>

        <!-- Chips de filtro -->
        <div class="chips" role="group" aria-label="Filtros">
          <button
            class="chip"
            :class="{ 'chip--active': activeFilter === null }"
            @click="activeFilter = null"
          >Todos</button>

          <button
            v-if="hasLiveChannels"
            class="chip chip--live"
            :class="{ 'chip--active': activeFilter === 'live' }"
            @click="activeFilter = activeFilter === 'live' ? null : 'live'"
          >● EN DIRECTO</button>

          <button
            v-if="hasFavoriteChannels"
            class="chip chip--fav"
            :class="{ 'chip--active': activeFilter === 'favorites' }"
            @click="activeFilter = activeFilter === 'favorites' ? null : 'favorites'"
          >⭐ Favoritos</button>

          <button
            v-if="hasRecentChannels"
            class="chip chip--recent"
            :class="{ 'chip--active': activeFilter === 'recent' }"
            @click="activeFilter = activeFilter === 'recent' ? null : 'recent'"
          >🕑 Recientes</button>

          <button
            v-for="category in presentCategories"
            :key="category"
            class="chip"
            :class="{ 'chip--active': activeFilter === category }"
            @click="activeFilter = activeFilter === category ? null : category as SportCategory"
          >{{ CATEGORY_LABELS[category] }}</button>
        </div>
      </div>

      <!-- Búsqueda simplificada en modo sidebar -->
      <div v-else-if="sidebarMode && channels.length > 0" class="sidebar-search">
        <input
          v-model="searchQuery"
          class="sidebar-search-input"
          type="search"
          placeholder="🔍 Buscar…"
          aria-label="Buscar canal"
        />
      </div>

      <!-- Sin canales -->
      <div v-if="channels.length === 0" class="state-msg">
        <p>No hay canales aún</p>
        <p class="state-sub">Añade el primero desde el panel admin</p>
      </div>

      <!-- Sin resultados en el filtro -->
      <div v-else-if="visibleChannels.length === 0" class="state-msg">
        <p>Sin resultados</p>
        <p class="state-sub">Prueba otro filtro o búsqueda</p>
      </div>

      <!-- ══ GRID DE TARJETAS ══ -->
      <div
        v-else
        ref="gridEl"
        class="grid"
        :class="{ 'grid--sidebar': sidebarMode }"
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
          :compactMode="sidebarMode"
          @select="emit('select', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Contenedor principal ── */
.grid-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Barra de filtros (modo normal) ── */
.filter-bar {
  height: var(--filterbar-height);    /* 52px */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--grid-padding);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}

/* Campo de búsqueda */
.search-wrap {
  position: relative;
  flex-shrink: 0;
}
.search-icon {
  position: absolute;
  left: 10px;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.85rem;
  pointer-events: none;
}
.search-input {
  height: 34px;
  width: 200px;
  padding: 0 12px 0 32px;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.85rem;
  outline: none;
  transition: border-color 0.15s, width 0.2s;
}
.search-input:focus {
  border-color: var(--color-accent);
  width: 260px;
}
.search-input::placeholder { color: var(--color-text-muted); }

/* Chips */
.chips {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow-x: auto;
  flex: 1;
}
.chips::-webkit-scrollbar { height: 0; }

.chip {
  height: 32px;
  padding: 0 14px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
  text-transform: uppercase;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  outline: none;
}
.chip:hover,
.chip:focus-visible        { border-color: var(--color-accent); color: var(--color-accent); }
.chip--active              { background: var(--color-accent); border-color: var(--color-accent); color: #000; }

.chip--live                { color: var(--color-live); border-color: rgba(255,68,68,0.4); text-transform: none; font-size: 0.82rem; }
.chip--live.chip--active   { background: var(--color-live); border-color: var(--color-live); color: #fff; }
.chip--fav                 { color: var(--color-fav);  border-color: rgba(245,166,35,0.4); text-transform: none; }
.chip--fav.chip--active    { background: var(--color-fav);  border-color: var(--color-fav);  color: #000; }
.chip--recent              { color: var(--color-recent); border-color: rgba(167,139,250,0.4); text-transform: none; }
.chip--recent.chip--active { background: var(--color-recent); border-color: var(--color-recent); color: #000; }

/* ── Búsqueda en modo sidebar ── */
.sidebar-search {
  padding: var(--space-2) var(--space-3);
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}
.sidebar-search-input {
  width: 100%;
  height: 34px;
  padding: 0 12px;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.82rem;
  outline: none;
}
.sidebar-search-input:focus { border-color: var(--color-accent); }
.sidebar-search-input::placeholder { color: var(--color-text-muted); }

/* ── Grid de canales ── */
.grid {
  flex: 1;
  overflow-y: auto;
  padding: var(--grid-padding);
  display: grid;
  grid-template-columns: repeat(var(--grid-cols), 1fr);
  gap: var(--grid-gap);
  align-content: start;
}

/* Grid en modo sidebar — columna única */
.grid--sidebar {
  grid-template-columns: 1fr;
  padding: var(--space-2) var(--space-3);
  gap: var(--space-2);
}

/* ── Estados vacíos ── */
.state-msg {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-text-muted);
  font-size: 1rem;
}
.state-msg--error { color: var(--color-danger); }
.state-sub {
  font-size: 0.82rem;
  opacity: 0.7;
}
.state-spinner {
  font-size: 2rem;
  opacity: 0.4;
}
</style>

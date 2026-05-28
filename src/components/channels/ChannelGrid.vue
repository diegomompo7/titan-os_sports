<script setup lang="ts">
/**
 * ChannelGrid — Grid de canales para Titan OS.
 * 4 columnas en modo normal, 1 columna en modo sidebar.
 * Navegación completa por D-pad (↑↓←→).
 * 100% relativa: rem · vw · vh.
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
  sidebarMode?:  boolean
}>()

const emit = defineEmits<{
  select:     [Channel]
  edit:       [Channel]
  delete:     [Channel]
  hoverEnter: [Channel]
  hoverLeave: []
}>()

// ── Stores ───────────────────────────────────────────────────────────────────
const favStore     = useFavoritesStore()
const historyStore = useHistoryStore()

// ── Filtros ──────────────────────────────────────────────────────────────────
const activeFilter = ref<SportCategory | 'live' | 'favorites' | 'recent' | null>(null)
const searchQuery  = ref('')

// ── Canales filtrados ────────────────────────────────────────────────────────
const presentCategories = computed(() => {
  const set = new Set(props.channels.map((c) => c.category))
  return (Object.keys(CATEGORY_LABELS) as SportCategory[]).filter((cat) => set.has(cat))
})

const hasLiveChannels     = computed(() => props.channels.some((c) => props.getLiveStatus(c.id)))
const hasFavoriteChannels = computed(() => props.channels.some((c) => favStore.isFavorite(c.id)))
const hasRecentChannels   = computed(() => props.channels.some((c) => historyStore.hasHistory(c.id)))

const visibleChannels = computed(() => {
  let list = [...props.channels]

  const q = searchQuery.value.trim().toLowerCase()
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q))

  if (activeFilter.value === 'live') {
    list = list.filter((c) => props.getLiveStatus(c.id))
  } else if (activeFilter.value === 'favorites') {
    list = list.filter((c) => favStore.isFavorite(c.id))
  } else if (activeFilter.value === 'recent') {
    const ids = historyStore.ids
    list = list.filter((c) => historyStore.hasHistory(c.id))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  } else if (activeFilter.value) {
    list = list.filter((c) => c.category === activeFilter.value)
  }

  if (activeFilter.value !== 'recent') {
    list = list.sort((a, b) =>
      (props.getLiveStatus(b.id) ? 1 : 0) - (props.getLiveStatus(a.id) ? 1 : 0)
    )
  }
  return list
})

// ── Navegación D-pad ─────────────────────────────────────────────────────────
// 4 columnas en modo normal, 1 en sidebar — sincronizado con el CSS
const COLS = computed(() => props.sidebarMode ? 1 : 4)

const focusedIndex = ref(-1)
const cardRefs     = ref<HTMLElement[]>([])

watch(visibleChannels, (list) => {
  if (focusedIndex.value >= list.length) {
    focusedIndex.value = Math.max(0, list.length - 1)
  }
})

function moveFocus(direction: 'up' | 'down' | 'left' | 'right') {
  const total = visibleChannels.value.length
  if (total === 0) return
  const cols = COLS.value

  if (focusedIndex.value < 0) {
    focusedIndex.value = (direction === 'up' || direction === 'left') ? total - 1 : 0
  } else {
    const cur = focusedIndex.value
    let next  = cur
    if (direction === 'up')    next = Math.max(0, cur - cols)
    if (direction === 'down')  next = Math.min(total - 1, cur + cols)
    if (direction === 'left')  next = Math.max(0, cur - 1)
    if (direction === 'right') next = Math.min(total - 1, cur + 1)
    focusedIndex.value = next
  }

  nextTick(() => {
    cardRefs.value[focusedIndex.value]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function selectFocused() {
  const ch = visibleChannels.value[focusedIndex.value]
  if (ch) emit('select', ch)
}

function onMouseEnter() { focusedIndex.value = -1 }

onMounted(() => {
  if (!props.sidebarMode && visibleChannels.value.length > 0) {
    focusedIndex.value = 0
  }
})

defineExpose({ moveFocus, selectFocused })
</script>

<template>
  <div class="grid-wrapper" :class="{ 'grid-wrapper--sidebar': sidebarMode }">

    <!-- Cargando -->
    <div v-if="loading" class="state-msg">
      <span class="state-spinner">⏳</span>
      <p>Cargando canales…</p>
    </div>

    <!-- Error -->
    <div v-else-if="error" class="state-msg state-msg--error">
      <p>⚠️ {{ error }}</p>
    </div>

    <template v-else>

      <!-- ══ BARRA DE FILTROS (modo normal) ══ -->
      <div v-if="!sidebarMode && channels.length > 0" class="filter-bar">

        <!-- Búsqueda -->
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

        <!-- Chips -->
        <div class="chips" role="group" aria-label="Filtros">
          <button class="chip" :class="{ 'chip--active': activeFilter === null }" @click="activeFilter = null">
            Todos
          </button>
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
            v-for="cat in presentCategories"
            :key="cat"
            class="chip"
            :class="{ 'chip--active': activeFilter === cat }"
            @click="activeFilter = activeFilter === cat ? null : cat as SportCategory"
          >{{ CATEGORY_LABELS[cat] }}</button>
        </div>
      </div>

      <!-- Búsqueda en modo sidebar -->
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
        <p>No hay canales todavía</p>
        <p class="state-sub">Añade el primero desde el panel admin</p>
      </div>

      <!-- Sin resultados -->
      <div v-else-if="visibleChannels.length === 0" class="state-msg">
        <p>Sin resultados</p>
        <p class="state-sub">Prueba otro filtro o búsqueda</p>
      </div>

      <!-- ══ GRID ══ -->
      <div
        v-else
        class="grid"
        :class="{ 'grid--sidebar': sidebarMode }"
        @mouseenter="onMouseEnter"
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
          @hoverEnter="emit('hoverEnter', $event)"
          @hoverLeave="emit('hoverLeave')"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
/* ── Contenedor ── */
.grid-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ══ BARRA DE FILTROS (modo normal) ══ */
.filter-bar {
  height: var(--filterbar-height);
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
  left: 0.8rem;
  top: 50%;
  transform: translateY(-50%);
  font-size: 0.9rem;
  pointer-events: none;
}
.search-input {
  height: 5.5vh;
  width: 16vw;
  padding: 0 1rem 0 2.6rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.9rem;
  outline: none;
  transition: border-color 0.15s, width 0.2s;
}
.search-input:focus {
  border-color: var(--color-accent);
  width: 22vw;
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
  height: 5vh;
  padding: 0 1.1rem;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  cursor: pointer;
  white-space: nowrap;
  text-transform: uppercase;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
  outline: none;
}
.chip:hover,
.chip:focus-visible    { border-color: var(--color-accent); color: var(--color-accent); }
.chip--active          { background: var(--color-accent); border-color: var(--color-accent); color: #000; }

.chip--live            { color: var(--color-live); border-color: rgba(255, 68, 68, 0.4); text-transform: none; }
.chip--live.chip--active { background: var(--color-live); border-color: var(--color-live); color: #fff; }
.chip--fav             { color: var(--color-fav); border-color: rgba(245, 166, 35, 0.4); text-transform: none; }
.chip--fav.chip--active  { background: var(--color-fav); border-color: var(--color-fav); color: #000; }
.chip--recent          { color: var(--color-recent); border-color: rgba(167, 139, 250, 0.4); text-transform: none; }
.chip--recent.chip--active { background: var(--color-recent); border-color: var(--color-recent); color: #000; }

/* ── Búsqueda en sidebar ── */
.sidebar-search {
  padding: var(--space-2) var(--space-3);
  flex-shrink: 0;
  border-bottom: 1px solid var(--color-border);
}
.sidebar-search-input {
  width: 100%;
  height: 5.2vh;
  padding: 0 1rem;
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.15s;
}
.sidebar-search-input:focus  { border-color: var(--color-accent); }
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

/* Modo sidebar — columna única */
.grid--sidebar {
  grid-template-columns: 1fr;
  padding: var(--space-2) var(--space-3);
  gap: var(--space-2);
}

/* ── Estados ── */
.state-msg {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: 1rem;
  text-align: center;
}
.state-msg--error { color: var(--color-danger); }
.state-sub  { font-size: 0.82rem; opacity: 0.65; }
.state-spinner { font-size: 2.5rem; opacity: 0.35; }
</style>

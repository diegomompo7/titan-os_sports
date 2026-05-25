<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import Sortable from 'sortablejs'
import type { Channel, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore } from '@/stores/history'
import ChannelCard from './ChannelCard.vue'

const props = defineProps<{
  channels: Channel[]
  isAdmin: boolean
  loading: boolean
  error: string | null
  getLiveStatus: (id: string) => boolean
}>()

const emit = defineEmits<{
  select: [Channel]
  edit: [Channel]
  delete: [Channel]
}>()

const favStore = useFavoritesStore()
const historyStore = useHistoryStore()

const activeFilter = ref<SportCategory | 'live' | 'favorites' | 'recent' | null>(null)
const searchQuery = ref('')

// ── Drag & drop order ───────────────────────────────────────────────────────
const SORT_KEY = 'titanos_channel_order'
const savedOrder = ref<string[]>(JSON.parse(localStorage.getItem(SORT_KEY) ?? '[]'))
watch(savedOrder, (val) => localStorage.setItem(SORT_KEY, JSON.stringify(val)), { deep: true })

// Merge saved order with any new channels (appended at end)
const orderedChannels = computed(() => {
  const allIds = props.channels.map((c) => c.id)
  const saved = savedOrder.value.filter((id) => allIds.includes(id))
  const newIds = allIds.filter((id) => !saved.includes(id))
  return [...saved, ...newIds]
    .map((id) => props.channels.find((c) => c.id === id))
    .filter((c): c is Channel => !!c)
})

// ── Computed filters ────────────────────────────────────────────────────────
const presentCategories = computed(() => {
  const cats = new Set(props.channels.map((c) => c.category))
  return (Object.keys(CATEGORY_LABELS) as SportCategory[]).filter((k) => cats.has(k))
})

const hasLive = computed(() => props.channels.some((c) => props.getLiveStatus(c.id)))
const hasFavorites = computed(() => props.channels.some((c) => favStore.isFavorite(c.id)))
const hasRecent = computed(() => props.channels.some((c) => historyStore.hasHistory(c.id)))

const visibleChannels = computed(() => {
  let list = orderedChannels.value

  // Search
  const q = searchQuery.value.trim().toLowerCase()
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q))

  // Chip filter
  if (activeFilter.value === 'live') {
    list = list.filter((c) => props.getLiveStatus(c.id))
  } else if (activeFilter.value === 'favorites') {
    list = list.filter((c) => favStore.isFavorite(c.id))
  } else if (activeFilter.value === 'recent') {
    // Preserve history order (most recently watched first)
    const histIds = historyStore.ids
    list = list
      .filter((c) => historyStore.hasHistory(c.id))
      .sort((a, b) => histIds.indexOf(a.id) - histIds.indexOf(b.id))
  } else if (activeFilter.value) {
    list = list.filter((c) => c.category === activeFilter.value)
  }

  // Live-first (stable sort — keeps user drag order within each group)
  if (activeFilter.value !== 'recent') {
    list = [...list].sort((a, b) => {
      const aL = props.getLiveStatus(a.id) ? 1 : 0
      const bL = props.getLiveStatus(b.id) ? 1 : 0
      return bL - aL
    })
  }

  return list
})

// ── Sortable drag & drop ────────────────────────────────────────────────────
const gridEl = ref<HTMLElement | null>(null)
let sortable: InstanceType<typeof Sortable> | null = null

onMounted(() => {
  if (!gridEl.value) return
  sortable = Sortable.create(gridEl.value, {
    animation: 150,
    ghostClass: 'drag-ghost',
    // Allow dragging by anything except the action buttons
    filter: '.channel-actions, .btn-fav',
    preventOnFilter: false,
    onEnd(evt) {
      const { oldIndex, newIndex } = evt
      if (oldIndex === undefined || newIndex === undefined || oldIndex === newIndex) return

      // Compute new order of visible channels
      const ids = visibleChannels.value.map((c) => c.id)
      const moved = ids.splice(oldIndex, 1)[0]
      if (!moved) return
      ids.splice(newIndex, 0, moved)

      // Rebuild full saved order: new visible order + channels not currently visible
      const visibleSet = new Set(visibleChannels.value.map((c) => c.id))
      const hidden = savedOrder.value.filter(
        (id) => !visibleSet.has(id) && props.channels.some((c) => c.id === id),
      )
      savedOrder.value = [...ids, ...hidden]
    },
  })
})

onBeforeUnmount(() => {
  sortable?.destroy()
  sortable = null
})

// ── Navegación por teclado / mando ──────────────────────────────────────────
const focusedIndex = ref(-1)  // -1 = sin foco (control por ratón)
const cardRefs = ref<HTMLElement[]>([])

// Ajustar foco si la lista cambia (filtros, búsqueda)
watch(visibleChannels, (list) => {
  if (focusedIndex.value >= list.length) {
    focusedIndex.value = Math.max(0, list.length - 1)
  }
})

function moveFocus(dir: 'up' | 'down') {
  const len = visibleChannels.value.length
  if (len === 0) return
  if (focusedIndex.value < 0) {
    focusedIndex.value = dir === 'down' ? 0 : len - 1
  } else {
    focusedIndex.value = dir === 'up'
      ? Math.max(0, focusedIndex.value - 1)
      : Math.min(len - 1, focusedIndex.value + 1)
  }
  nextTick(() => {
    cardRefs.value[focusedIndex.value]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}

function selectFocused() {
  const ch = visibleChannels.value[focusedIndex.value]
  if (ch) emit('select', ch)
}

// El ratón quita el foco visual para no interferir
function onGridMouseEnter() { focusedIndex.value = -1 }

defineExpose({ moveFocus, selectFocused })
</script>

<template>
  <div class="grid-wrapper">
    <div v-if="loading" class="state-msg">Cargando canales…</div>
    <div v-else-if="error" class="state-msg state-error">{{ error }}</div>
    <template v-else>
      <div v-if="channels.length > 0" class="filter-bar">
        <!-- Búsqueda -->
        <input
          v-model="searchQuery"
          class="search-input"
          placeholder="🔍 Buscar…"
          type="search"
        />

        <button
          class="filter-chip"
          :class="{ active: activeFilter === null }"
          @click="activeFilter = null"
        >
          Todos
        </button>
        <button
          v-if="hasLive"
          class="filter-chip live-chip"
          :class="{ active: activeFilter === 'live' }"
          @click="activeFilter = activeFilter === 'live' ? null : 'live'"
        >
          ● En directo
        </button>
        <button
          v-if="hasFavorites"
          class="filter-chip fav-chip"
          :class="{ active: activeFilter === 'favorites' }"
          @click="activeFilter = activeFilter === 'favorites' ? null : 'favorites'"
        >
          ⭐ Favoritos
        </button>
        <button
          v-if="hasRecent"
          class="filter-chip recent-chip"
          :class="{ active: activeFilter === 'recent' }"
          @click="activeFilter = activeFilter === 'recent' ? null : 'recent'"
        >
          🕑 Recientes
        </button>
        <button
          v-for="cat in presentCategories"
          :key="cat"
          class="filter-chip"
          :class="{ active: activeFilter === cat }"
          @click="activeFilter = activeFilter === cat ? null : (cat as SportCategory)"
        >
          {{ CATEGORY_LABELS[cat] }}
        </button>
      </div>

      <div v-if="channels.length === 0" class="state-msg">
        No hay canales aún. ¡Añade el primero!
      </div>
      <div v-else-if="visibleChannels.length === 0" class="state-msg">
        No hay canales en esta categoría
      </div>
      <div v-else ref="gridEl" class="grid" @mouseenter="onGridMouseEnter">
        <ChannelCard
          v-for="(ch, i) in visibleChannels"
          :key="ch.id"
          :ref="(el) => { if (el) cardRefs[i] = (el as any).$el }"
          :channel="ch"
          :isAdmin="isAdmin"
          :isLive="getLiveStatus(ch.id)"
          :isFocused="focusedIndex === i"
          @select="emit('select', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.grid-wrapper {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-sm) var(--space-md);
}
.filter-bar {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
  align-items: center;
  max-width: 680px;
  margin: 0 auto var(--space-sm);
}
.search-input {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-primary);
  font-family: inherit;
  font-size: 0.75rem;
  padding: 3px 12px;
  outline: none;
  width: 130px;
  transition: border-color 0.15s, width 0.2s;
}
.search-input:focus {
  border-color: var(--color-accent);
  width: 180px;
}
.search-input::placeholder {
  color: var(--color-text-muted);
}
.filter-chip {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  text-transform: uppercase;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.filter-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.filter-chip.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
}
.live-chip {
  color: #ff4444;
  border-color: rgba(255, 68, 68, 0.4);
}
.live-chip.active {
  background: #ff4444;
  border-color: #ff4444;
  color: #fff;
}
.fav-chip {
  color: #f5a623;
  border-color: rgba(245, 166, 35, 0.4);
  text-transform: none;
  letter-spacing: 0;
}
.fav-chip.active {
  background: #f5a623;
  border-color: #f5a623;
  color: #000;
}
.recent-chip {
  color: #a78bfa;
  border-color: rgba(167, 139, 250, 0.4);
  text-transform: none;
  letter-spacing: 0;
}
.recent-chip.active {
  background: #a78bfa;
  border-color: #a78bfa;
  color: #000;
}
.grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-width: 680px;
  margin: 0 auto;
}
/* Sortable ghost */
:global(.drag-ghost) {
  opacity: 0.4;
  background: var(--color-accent) !important;
  border-color: var(--color-accent) !important;
}
.state-msg {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-lg) 0;
  font-size: 0.9rem;
}
.state-error {
  color: var(--color-danger);
}
</style>

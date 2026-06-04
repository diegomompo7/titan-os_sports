<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/channels/ChannelGrid.vue
   ¿QUÉ ES ESTO?
   La cuadrícula (grid) que muestra todos los canales disponibles en pantalla.
   Piénsalo como la guía de canales de un televisor: una rejilla de tarjetas
   donde cada una representa un canal. El usuario puede:
     - Ver todos los canales ordenados (los que emiten en directo, primero)
     - Filtrar por categoría deportiva (Fútbol, Baloncesto...), favoritos o recientes
     - Buscar por nombre con la barra de búsqueda
     - Navegar con el D-pad del mando (↑↓←→) y abrir con el botón central

   Este componente es solo la "taquilla": muestra la cartelera y avisa al padre
   (HomeView.vue) de qué canal eligió el usuario, pero no lo reproduce él mismo.

   Modos de funcionamiento:
     - Normal:  cuadrícula de 4 columnas con barra de filtros completa arriba
     - Sidebar: columna única sin filtros, para el panel lateral de cambio rápido
============================================================================= */
import { ref, computed, onMounted, watch } from 'vue'
import type { Channel, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useHistoryStore }   from '@/stores/history'
import { useAdsStore } from '@/stores/ads'
import type { Ad } from '@/stores/ads'
import ChannelCard from './ChannelCard.vue'
import ChannelPreview from '@/components/player/ChannelPreview.vue'
import AdPlayer from '@/components/player/AdPlayer.vue'

// ── Propiedades de configuración (lo que el padre nos pasa) ─────────────────
const props = defineProps<{
  channels:      Channel[]           // Lista completa de canales a mostrar
  isAdmin:       boolean             // Si true, las tarjetas muestran botones de editar/borrar
  loading:       boolean             // Si true, muestra un spinner "Cargando canales…"
  error:         string | null       // Si hay texto, muestra un mensaje de error en su lugar
  getLiveStatus: (id: string) => boolean  // Función para preguntar: "¿está este canal en directo ahora?"
  sidebarMode?:  boolean             // Si true, activa el modo columna única sin filtros
}>()

// ── Eventos que este componente envía a su padre ─────────────────────────────
const emit = defineEmits<{
  select:      [Channel]        // El usuario seleccionó un canal
  edit:        [Channel]        // Admin pulsó editar
  delete:      [Channel]        // Admin pulsó borrar
  preview:     [Channel | null] // D-pad/ratón sobre un canal (null = ninguno)
  'reach-top':   []             // D-pad intentó subir por encima del filterbar/search
  'reach-right': []             // D-pad intentó salir a la derecha del sidebar
}>()

// ── Stores (datos compartidos con el resto de la app) ────────────────────────
const favStore     = useFavoritesStore()  // Lista de canales marcados como favoritos
const historyStore = useHistoryStore()    // Historial de canales vistos recientemente
const adsStore     = useAdsStore()

// ── Estado del anuncio ───────────────────────────────────────────────────────
const currentAd  = ref<Ad | null>(null)  // Anuncio activo ahora mismo (null = ninguno)
const adFinished = ref(false)            // false = bloqueando hover hasta que el ad termine

// ── Estado de los filtros ────────────────────────────────────────────────────
// El filtro activo actualmente. Puede ser:
//   null         → mostrar todos los canales
//   'live'       → solo los que emiten en directo ahora
//   'favorites'  → solo los marcados con estrella ⭐
//   'recent'     → los que el usuario ha visto recientemente
//   SportCategory → una categoría deportiva concreta ('football', 'basketball'...)
const activeFilter = ref<SportCategory | 'live' | 'favorites' | 'recent' | null>(null)

// Texto que el usuario está escribiendo en la barra de búsqueda
const searchQuery  = ref('')

// ── Computed: datos calculados automáticamente ───────────────────────────────

// Qué categorías deportivas tienen al menos un canal en la lista.
// Sirve para mostrar solo los chips de filtro que tienen sentido.
// Ejemplo: si no hay ningún canal de Golf, el chip "Golf" no aparece.
const presentCategories = computed(() => {
  const set = new Set(props.channels.map((c) => c.category))
  return (Object.keys(CATEGORY_LABELS) as SportCategory[]).filter((cat) => set.has(cat))
})

// ¿Hay al menos un canal emitiendo en directo ahora? → muestra el chip "EN DIRECTO"
const hasLiveChannels     = computed(() => props.channels.some((c) => props.getLiveStatus(c.id)))
// ¿Hay al menos un canal marcado como favorito? → muestra el chip "⭐ Favoritos"
const hasFavoriteChannels = computed(() => props.channels.some((c) => favStore.isFavorite(c.id)))
// ¿Hay al menos un canal en el historial? → muestra el chip "🕑 Recientes"
const hasRecentChannels   = computed(() => props.channels.some((c) => historyStore.hasHistory(c.id)))

// ── Sistema de zonas de navegación interna ───────────────────────────────────
type InnerZone = 'grid' | 'filterbar' | 'sidebar-search' | 'sidebar-channels'

type FilterItem =
  | { kind: 'search' }
  | { kind: 'todos' }
  | { kind: 'live' }
  | { kind: 'favorites' }
  | { kind: 'recent' }
  | { kind: 'category'; cat: SportCategory }

const filterItems = computed((): FilterItem[] => {
  const items: FilterItem[] = [{ kind: 'search' }, { kind: 'todos' }]
  if (hasLiveChannels.value)     items.push({ kind: 'live' })
  if (hasFavoriteChannels.value) items.push({ kind: 'favorites' })
  if (hasRecentChannels.value)   items.push({ kind: 'recent' })
  presentCategories.value.forEach(cat => items.push({ kind: 'category', cat }))
  return items
})

const filterIdx = computed(() => {
  const map: Record<string, number> = {}
  filterItems.value.forEach((item, i) => {
    map[item.kind === 'category' ? item.cat : item.kind] = i
  })
  return map
})

const innerZone      = ref<InnerZone>('grid')
const filterFocusIdx = ref(0)
const searchInputRef    = ref<HTMLInputElement | null>(null)
const sidebarSearchRef  = ref<HTMLInputElement | null>(null)

function activateFilterItem() {
  const item = filterItems.value[filterFocusIdx.value]
  if (!item) return
  if (item.kind === 'search')    { searchInputRef.value?.focus(); return }
  if (item.kind === 'todos')     { activeFilter.value = null; return }
  if (item.kind === 'live')      { activeFilter.value = activeFilter.value === 'live'      ? null : 'live'; return }
  if (item.kind === 'favorites') { activeFilter.value = activeFilter.value === 'favorites' ? null : 'favorites'; return }
  if (item.kind === 'recent')    { activeFilter.value = activeFilter.value === 'recent'    ? null : 'recent'; return }
  if (item.kind === 'category')  { activeFilter.value = activeFilter.value === item.cat    ? null : item.cat; return }
}

// Lista final de canales que se muestran en pantalla, aplicando búsqueda y filtro.
// Se recalcula automáticamente cada vez que cambia searchQuery, activeFilter,
// la lista de canales, los favoritos o los estados en directo.
const visibleChannels = computed(() => {
  let list = [...props.channels]  // Empezamos con todos los canales

  // Aplicar búsqueda por texto: si el usuario escribió algo, filtrar por nombre
  const q = searchQuery.value.trim().toLowerCase()
  if (q) list = list.filter((c) => c.name.toLowerCase().includes(q))

  // Aplicar filtro de categoría/estado
  if (activeFilter.value === 'live') {
    // Solo los canales que están emitiendo en directo ahora mismo
    list = list.filter((c) => props.getLiveStatus(c.id))
  } else if (activeFilter.value === 'favorites') {
    // Solo los canales que el usuario marcó con estrella
    list = list.filter((c) => favStore.isFavorite(c.id))
  } else if (activeFilter.value === 'recent') {
    // Solo los vistos recientemente, ordenados del más reciente al más antiguo.
    // historyStore.ids es un array donde el primero es el más reciente.
    // indexOf(a.id) - indexOf(b.id) ordena "a" antes que "b" si "a" está primero en el historial.
    const ids = historyStore.ids
    list = list.filter((c) => historyStore.hasHistory(c.id))
      .sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
  } else if (activeFilter.value) {
    // Filtro de categoría concreta: solo canales de ese deporte
    list = list.filter((c) => c.category === activeFilter.value)
  }

  // Ordenar: los canales en directo van primero (excepto en el modo "recientes"
  // donde respetamos el orden cronológico).
  // El truco: convertir true/false a 1/0 — los en directo suman 1 y quedan arriba.
  if (activeFilter.value !== 'recent') {
    list = list.sort((a, b) =>
      (props.getLiveStatus(b.id) ? 1 : 0) - (props.getLiveStatus(a.id) ? 1 : 0)
    )
  }
  return list
})

// Canal actualmente en hover/foco — se muestra en la columna promo-hover
const hoveredChannel = ref<Channel | null>(null)


function setPreview(ch: Channel | null) {
  hoveredChannel.value = ch
  emit('preview', ch)
}

// ── Navegación con el mando D-pad ────────────────────────────────────────────
const COLS = computed(() => props.sidebarMode ? 1 : 4)
const ROWS_VISIBLE = 2

const focusedIndex  = ref(-1)
const cardRefs      = ref<HTMLElement[]>([])

// ── Carrusel vertical ────────────────────────────────────────────────────────
const visibleStartRow  = ref(0)
const scrollDirection  = ref<'down' | 'up'>('down')

const totalRows    = computed(() => Math.ceil(visibleChannels.value.length / COLS.value))
const canScrollUp  = computed(() => visibleStartRow.value > 0)
const canScrollDown = computed(() => visibleStartRow.value + ROWS_VISIBLE < totalRows.value)

const displayedChannels = computed(() => {
  if (props.sidebarMode) return visibleChannels.value
  const start = visibleStartRow.value * COLS.value
  return visibleChannels.value.slice(start, start + ROWS_VISIBLE * COLS.value)
})

// Índice del foco dentro del slice visible.
// -1 cuando no estamos en zona 'grid' (las cards no muestran borde de foco en otras zonas).
const focusedIndexInDisplay = computed(() => {
  if (innerZone.value !== 'grid' && innerZone.value !== 'sidebar-channels') return -1
  if (props.sidebarMode) return focusedIndex.value
  return focusedIndex.value - visibleStartRow.value * COLS.value
})

watch(visibleChannels, (list) => {
  visibleStartRow.value = 0
  innerZone.value = props.sidebarMode ? 'sidebar-channels' : 'grid'
  if (focusedIndex.value >= list.length) {
    focusedIndex.value = Math.max(0, list.length - 1)
  }
})

watch(focusedIndex, (idx) => {
  setPreview(idx >= 0 ? (visibleChannels.value[idx] ?? null) : null)
})

function moveFocus(direction: 'up' | 'down' | 'left' | 'right') {
  const total = visibleChannels.value.length

  // ── Sidebar: zona search ─────────────────────────────────────────────────
  if (props.sidebarMode && innerZone.value === 'sidebar-search') {
    if (direction === 'up')    { emit('reach-top'); return }
    if (direction === 'down')  { innerZone.value = 'sidebar-channels'; if (focusedIndex.value < 0) focusedIndex.value = 0; return }
    if (direction === 'right') { emit('reach-right'); return }
    return
  }

  // ── Sidebar: zona canales ────────────────────────────────────────────────
  if (props.sidebarMode) {
    if (total === 0) return
    if (direction === 'right') { emit('reach-right'); return }
    if (focusedIndex.value < 0) { focusedIndex.value = direction === 'up' ? total - 1 : 0; return }
    const cur = focusedIndex.value
    if (direction === 'up') {
      if (cur === 0) { innerZone.value = 'sidebar-search'; return }
      focusedIndex.value = cur - 1
    } else if (direction === 'down') {
      focusedIndex.value = Math.min(total - 1, cur + 1)
    }
    return
  }

  // ── Normal: zona filterbar ───────────────────────────────────────────────
  if (innerZone.value === 'filterbar') {
    if (direction === 'up')    { emit('reach-top'); return }
    if (direction === 'down')  { innerZone.value = 'grid'; if (focusedIndex.value < 0) focusedIndex.value = visibleStartRow.value * COLS.value; return }
    if (direction === 'left')  { filterFocusIdx.value = Math.max(0, filterFocusIdx.value - 1); return }
    if (direction === 'right') { filterFocusIdx.value = Math.min(filterItems.value.length - 1, filterFocusIdx.value + 1); return }
    return
  }

  // ── Normal: zona grid ────────────────────────────────────────────────────
  if (total === 0) return
  const cols = COLS.value

  if (focusedIndex.value < 0) {
    focusedIndex.value = (direction === 'up' || direction === 'left') ? total - 1 : 0
  } else {
    if (direction === 'up' && Math.floor(focusedIndex.value / cols) === 0) {
      // UP desde fila 0 → filterbar, posicionado en el filtro activo
      innerZone.value = 'filterbar'
      filterFocusIdx.value = filterIdx.value[activeFilter.value ?? 'todos'] ?? 1
      setPreview(null)
      return
    }
    const cur = focusedIndex.value
    let next  = cur
    if (direction === 'up')    next = Math.max(0, cur - cols)
    if (direction === 'down')  next = Math.min(total - 1, cur + cols)
    if (direction === 'left')  next = Math.max(0, cur - 1)
    if (direction === 'right') next = Math.min(total - 1, cur + 1)
    focusedIndex.value = next
  }

  // Ajustar carrusel para mantener el foco visible
  const newRow = Math.floor(focusedIndex.value / cols)
  if (newRow < visibleStartRow.value) {
    scrollDirection.value = 'up'
    visibleStartRow.value = newRow
  } else if (newRow >= visibleStartRow.value + ROWS_VISIBLE) {
    scrollDirection.value = 'down'
    visibleStartRow.value = newRow - ROWS_VISIBLE + 1
  }
}

function scrollCarousel(dir: 'up' | 'down') {
  scrollDirection.value = dir
  if (dir === 'up' && canScrollUp.value)    visibleStartRow.value--
  if (dir === 'down' && canScrollDown.value) visibleStartRow.value++
  focusedIndex.value = -1
}

function selectFocused() {
  if (innerZone.value === 'filterbar') { activateFilterItem(); return }
  if (innerZone.value === 'sidebar-search') { sidebarSearchRef.value?.focus(); return }
  const ch = visibleChannels.value[focusedIndex.value]
  if (ch) emit('select', ch)
}

function onMouseEnter() {
  focusedIndex.value = -1
  innerZone.value = props.sidebarMode ? 'sidebar-channels' : 'grid'
}

// Vuelve el foco al primer canal del grid (llamado desde HomeView al salir del header)
function resetFocusToGrid() {
  innerZone.value = props.sidebarMode ? 'sidebar-channels' : 'grid'
  focusedIndex.value = 0
  visibleStartRow.value = 0
}

onMounted(async () => {
  innerZone.value = props.sidebarMode ? 'sidebar-channels' : 'grid'
  if (visibleChannels.value.length > 0) focusedIndex.value = 0

  if (!props.sidebarMode) {
    await adsStore.fetchAds()
    currentAd.value = adsStore.pickRandomAd()
    if (!currentAd.value) adFinished.value = true
  }
})

function initials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

function focusFilterbar() {
  if (props.sidebarMode) return
  innerZone.value = 'filterbar'
  filterFocusIdx.value = filterIdx.value[activeFilter.value ?? 'todos'] ?? 1
}

function focusSidebarSearch() {
  if (!props.sidebarMode) return
  innerZone.value = 'sidebar-search'
}

defineExpose({ moveFocus, selectFocused, resetFocusToGrid, focusFilterbar, focusSidebarSearch })
</script>

<template>
  <!-- Contenedor principal del grid. En modo sidebar añade la clase --sidebar
       que ajusta el ancho y oculta la barra de filtros. -->
  <div class="grid-wrapper" :class="{ 'grid-wrapper--sidebar': sidebarMode }">

    <!-- ══ ESTADO: CARGANDO ══════════════════════════════════════════════
         Se muestra mientras la app descarga la lista de canales del servidor.
         v-if="loading" → solo visible cuando loading=true
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="loading" class="state-msg">
      <span class="state-spinner">⏳</span>
      <p>Cargando canales…</p>
    </div>

    <!-- ══ ESTADO: ERROR ═════════════════════════════════════════════════
         Si el servidor respondió con un error o no hay conexión.
         v-else-if → solo si NO estamos cargando Y hay un mensaje de error.
    ════════════════════════════════════════════════════════════════════ -->
    <div v-else-if="error" class="state-msg state-msg--error">
      <p>⚠️ {{ error }}</p>
    </div>

    <!-- ══ CONTENIDO NORMAL (sin carga ni error) ═════════════════════════
         <template> es un contenedor invisible — no añade ningún elemento
         al HTML. Agrupa los elementos que solo aparecen cuando hay datos.
    ════════════════════════════════════════════════════════════════════ -->
    <template v-else>

      <!-- ── BARRA DE FILTROS (solo en modo normal, no en sidebar) ──────
           Aparece en la parte superior de la pantalla principal.
           Contiene el campo de búsqueda y los chips de filtro.
           v-if="!sidebarMode && channels.length > 0" → solo si hay canales
           y no estamos en el panel lateral.
      ──────────────────────────────────────────────────────────────── -->
      <div v-if="!sidebarMode && channels.length > 0" class="filter-bar">

        <!-- Campo de búsqueda con icono de lupa.
             v-model="searchQuery" vincula lo que escribe el usuario a la
             variable searchQuery, que filtra automáticamente visibleChannels. -->
        <div class="search-wrap" :class="{ 'search-wrap--nav': innerZone === 'filterbar' && filterFocusIdx === filterIdx['search'] }">
          <span class="search-icon">🔍</span>
          <input
            ref="searchInputRef"
            v-model="searchQuery"
            class="search-input"
            type="search"
            placeholder="Buscar canal…"
            aria-label="Buscar canal"
          />
        </div>

        <div class="chips" role="group" aria-label="Filtros">
          <button
            class="chip"
            :class="{ 'chip--active': activeFilter === null, 'chip--nav': innerZone === 'filterbar' && filterFocusIdx === filterIdx['todos'] }"
            @click="activeFilter = null"
          >Todos</button>

          <button
            v-if="hasLiveChannels"
            class="chip chip--live"
            :class="{ 'chip--active': activeFilter === 'live', 'chip--nav': innerZone === 'filterbar' && filterFocusIdx === filterIdx['live'] }"
            @click="activeFilter = activeFilter === 'live' ? null : 'live'"
          >● EN DIRECTO</button>

          <button
            v-if="hasFavoriteChannels"
            class="chip chip--fav"
            :class="{ 'chip--active': activeFilter === 'favorites', 'chip--nav': innerZone === 'filterbar' && filterFocusIdx === filterIdx['favorites'] }"
            @click="activeFilter = activeFilter === 'favorites' ? null : 'favorites'"
          >⭐ Favoritos</button>

          <button
            v-if="hasRecentChannels"
            class="chip chip--recent"
            :class="{ 'chip--active': activeFilter === 'recent', 'chip--nav': innerZone === 'filterbar' && filterFocusIdx === filterIdx['recent'] }"
            @click="activeFilter = activeFilter === 'recent' ? null : 'recent'"
          >🕑 Recientes</button>

          <button
            v-for="cat in presentCategories"
            :key="cat"
            class="chip"
            :class="{ 'chip--active': activeFilter === cat, 'chip--nav': innerZone === 'filterbar' && filterFocusIdx === filterIdx[cat] }"
            @click="activeFilter = activeFilter === cat ? null : cat as SportCategory"
          >{{ CATEGORY_LABELS[cat] }}</button>
        </div>
      </div>

      <!-- ── BÚSQUEDA EN MODO SIDEBAR ── -->
      <div v-else-if="sidebarMode && channels.length > 0" class="sidebar-search" :class="{ 'sidebar-search--nav': innerZone === 'sidebar-search' }">
        <input
          ref="sidebarSearchRef"
          v-model="searchQuery"
          class="sidebar-search-input"
          type="search"
          placeholder="🔍 Buscar…"
          aria-label="Buscar canal"
        />
      </div>

      <!-- ── ESTADO VACÍO: no hay ningún canal en la base de datos ────────
           Solo aparece la primera vez, cuando el admin no ha añadido nada.
      ──────────────────────────────────────────────────────────────── -->
      <div v-if="channels.length === 0" class="state-msg">
        <p>No hay canales todavía</p>
        <p class="state-sub">Añade el primero desde el panel admin</p>
      </div>

      <!-- ── ESTADO VACÍO: hay canales pero ninguno coincide con el filtro ─
           El filtro activo o la búsqueda no tienen resultados.
      ──────────────────────────────────────────────────────────────── -->
      <div v-else-if="visibleChannels.length === 0" class="state-msg">
        <p>Sin resultados</p>
        <p class="state-sub">Prueba otro filtro o búsqueda</p>
      </div>

      <!-- ══ GRID DE TARJETAS ══════════════════════════════════════════════ -->
      <template v-else>

        <!-- Modo sidebar: scroll libre, sin carrusel -->
        <div v-if="sidebarMode" class="grid grid--sidebar" @mouseenter="onMouseEnter">
          <ChannelCard
            v-for="(channel, index) in displayedChannels"
            :key="channel.id"
            :ref="(el) => { if (el) cardRefs[index] = (el as any).$el }"
            :channel="channel"
            :isAdmin="isAdmin"
            :isLive="getLiveStatus(channel.id)"
            :isFocused="focusedIndexInDisplay === index"
            :compactMode="true"
            @select="emit('select', $event)"
            @edit="emit('edit', $event)"
            @delete="emit('delete', $event)"
            @hover="setPreview($event)"
            @hover-end="setPreview(null)"
          />
        </div>

        <!-- Modo normal: carrusel de 2 filas -->
        <div v-else class="grid-carousel" @mouseenter="onMouseEnter">

          <!-- Flecha arriba -->
          <button
            class="carousel-btn carousel-btn--up"
            :class="{ 'carousel-btn--hidden': !canScrollUp }"
            :disabled="!canScrollUp"
            aria-label="Filas anteriores"
            @click="scrollCarousel('up')"
          >▲</button>

          <Transition :name="'slide-' + scrollDirection" mode="out-in">
            <div :key="visibleStartRow" class="grid">
              <ChannelCard
                v-for="(channel, index) in displayedChannels"
                :key="channel.id"
                :ref="(el) => { if (el) cardRefs[index] = (el as any).$el }"
                :channel="channel"
                :isAdmin="isAdmin"
                :isLive="getLiveStatus(channel.id)"
                :isFocused="focusedIndexInDisplay === index"
                :compactMode="false"
                @select="emit('select', $event)"
                @edit="emit('edit', $event)"
                @delete="emit('delete', $event)"
                @hover="setPreview($event)"
                @hover-end="setPreview(null)"
              />
            </div>
          </Transition>

          <!-- Flecha abajo -->
          <button
            class="carousel-btn carousel-btn--down"
            :class="{ 'carousel-btn--hidden': !canScrollDown }"
            :disabled="!canScrollDown"
            aria-label="Filas siguientes"
            @click="scrollCarousel('down')"
          >▼</button>

          <!-- Indicador de posición -->
          <div v-if="totalRows > ROWS_VISIBLE" class="carousel-indicator">
            <span
              v-for="r in totalRows"
              :key="r"
              class="carousel-dot"
              :class="{ 'carousel-dot--active': r - 1 >= visibleStartRow && r - 1 < visibleStartRow + ROWS_VISIBLE }"
            />
          </div>

        </div>
      </template>

      <!-- ══ SECCIÓN PROMO (solo en modo normal) ═══════════════════════════
           Franja horizontal debajo de los canales con tres zonas:
           izquierda (hover de canal), centro (vídeo publicitario), derecha (banner).
      ════════════════════════════════════════════════════════════════════ -->
      <div v-if="!sidebarMode" class="promo-section">
        <div class="promo-video">
          <ChannelPreview
            v-if="hoveredChannel && adFinished"
            :channel="hoveredChannel"
            @open="emit('select', hoveredChannel!)"
            @close="hoveredChannel = null"
          />
        </div>
        <div class="promo-video">
          <AdPlayer
            v-if="currentAd && !adFinished"
            :url="currentAd.url"
            @done="adFinished = true; currentAd = null"
          />
        </div>
        <div class="promo-banner">
          <!-- banner -->
        </div>
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

/* ── Carrusel wrapper (modo normal) ── */
.grid-carousel {
  flex: 2;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}

/* ── Grid de canales ── */
.grid {
  padding: var(--grid-padding);
  display: grid;
  grid-template-columns: repeat(var(--grid-cols), 1fr);
  gap: var(--grid-gap);
  align-content: start;
}

/* Modo sidebar — columna única con scroll libre */
.grid--sidebar {
  flex: 2;
  overflow-y: auto;
  grid-template-columns: 1fr;
  padding: var(--space-2) var(--space-3);
  gap: var(--space-2);
}

/* ── Botones de navegación del carrusel ── */
.carousel-btn {
  flex-shrink: 0;
  width: 100%;
  padding: 0.4vh 0;
  background: linear-gradient(to bottom, rgba(22, 27, 37, 0.9), transparent);
  border: none;
  cursor: pointer;
  color: var(--color-accent);
  font-size: 1rem;
  letter-spacing: 0.1em;
  transition: color 0.15s, background 0.15s;
  outline: none;
}
.carousel-btn--down {
  background: linear-gradient(to top, rgba(22, 27, 37, 0.9), transparent);
}
.carousel-btn--hidden {
  visibility: hidden;
  pointer-events: none;
}
.carousel-btn:not(:disabled):hover { color: #fff; }

/* ── Indicador de posición (puntos) ── */
.carousel-indicator {
  flex-shrink: 0;
  display: flex;
  justify-content: center;
  gap: 0.4rem;
  padding: 0.4vh 0 0.6vh;
}
.carousel-dot {
  width: 0.45rem;
  height: 0.45rem;
  border-radius: 50%;
  background: var(--color-border);
  transition: background 0.2s;
}
.carousel-dot--active { background: var(--color-accent); }

/* ── Animaciones de entrada/salida del carrusel ── */
.slide-down-enter-active,
.slide-down-leave-active,
.slide-up-enter-active,
.slide-up-leave-active {
  transition: transform 0.22s ease, opacity 0.22s;
}
.slide-down-enter-from { transform: translateY(6%); opacity: 0; }
.slide-down-leave-to   { transform: translateY(-6%); opacity: 0; }
.slide-up-enter-from   { transform: translateY(-6%); opacity: 0; }
.slide-up-leave-to     { transform: translateY(6%); opacity: 0; }

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

/* ── Sección promo ── */
.promo-section {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr;
  gap: var(--grid-gap);
  padding: var(--grid-padding);
}

.promo-hover {
  border-radius: var(--radius-md);
  overflow: hidden;
}

.promo-video {
  aspect-ratio: 16 / 9;
  align-self: start;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.promo-banner {
  background: #1a6e4a;
  border-radius: var(--radius-md);
}

/* ── Foco D-pad en filtros y sidebar-search ── */
.chip--nav             { outline: 2px solid #fff; outline-offset: 2px; }
.chip--active.chip--nav { outline-color: rgba(0, 0, 0, 0.55); }
.search-wrap--nav .search-input,
.sidebar-search--nav .sidebar-search-input {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 2px rgba(0, 191, 255, 0.2);
}
.sidebar-search--nav { border-bottom-color: var(--color-accent); }
</style>

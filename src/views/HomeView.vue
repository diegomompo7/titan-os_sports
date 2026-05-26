<script setup lang="ts">
/**
 * HomeView — Vista principal de TitanOS Sports.
 *
 * Esta es la única vista de la aplicación (SPA sin router).
 * Gestiona tres modos de visualización:
 *   - Normal:   grid de canales + modal de reproductor al seleccionar
 *   - Teatro:   sidebar de canales + reproductor a pantalla completa
 *   - Multi:    grid de canales + vista de múltiples streams simultáneos
 *
 * También gestiona:
 *   - Teclado:  flechas para navegar, Escape para cerrar, M para mute, F para fullscreen
 *   - Gamepad:  D-pad y botones A/B
 *   - Notificaciones push para canales que empiezan a emitir en directo
 *   - URL param ?canal=nombre para abrir directamente un canal
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Channel, ChannelFormData } from '@/types/channel'
import { useChannelsStore }   from '@/stores/channels'
import { useAdminStore }      from '@/stores/admin'
import { useLiveStatusStore } from '@/stores/liveStatus'
import { useEventsStore }     from '@/stores/events'
import { useHistoryStore }    from '@/stores/history'
import { useGamepad }         from '@/composables/useGamepad'

import ChannelGrid       from '@/components/channels/ChannelGrid.vue'
import ChannelForm       from '@/components/channels/ChannelForm.vue'
import PlayerModal       from '@/components/player/PlayerModal.vue'
import VideoPlayer       from '@/components/player/VideoPlayer.vue'
import MultiStreamView   from '@/components/player/MultiStreamView.vue'
import AdminLogin        from '@/components/admin/AdminLogin.vue'
import EventsPanel       from '@/components/admin/EventsPanel.vue'
import BaseModal         from '@/components/ui/BaseModal.vue'

// ── Stores ───────────────────────────────────────────────────────────────────
const channelsStore   = useChannelsStore()
const adminStore      = useAdminStore()
const liveStatusStore = useLiveStatusStore()
const eventsStore     = useEventsStore()
const historyStore    = useHistoryStore()

// ── Estado de modales y paneles ───────────────────────────────────────────────
const activeChannel    = ref<Channel | null>(null)  // Canal abierto en el reproductor
const editingChannel   = ref<Channel | null>(null)  // Canal que se está editando
const showAddForm      = ref(false)
const showAdminLogin   = ref(false)
const showEventsPanel  = ref(false)
const showMobileMenu   = ref(false)         // Menú hamburguesa en móvil
const formLoading      = ref(false)

// ── Modos de visualización ────────────────────────────────────────────────────
const isMultiMode    = ref(false)
const isTheatreMode  = ref(false)
const pinnedChannels = ref<Channel[]>([])   // Canales anclados en modo multi-stream

// ── Referencia al grid de canales (para navegación por teclado/mando) ─────────
const channelGridRef = ref<InstanceType<typeof ChannelGrid> | null>(null)

// ── Cambio de modo ────────────────────────────────────────────────────────────

function activateMultiMode() {
  isMultiMode.value   = true
  isTheatreMode.value = false
  showMobileMenu.value = false
}

function deactivateMultiMode() {
  isMultiMode.value    = false
  pinnedChannels.value = []
}

function activateTheatreMode() {
  isTheatreMode.value = true
  isMultiMode.value   = false
  pinnedChannels.value = []
  showMobileMenu.value = false
}

function deactivateTheatreMode() {
  isTheatreMode.value = false
}

function removePinnedChannel(channelId: string) {
  pinnedChannels.value = pinnedChannels.value.filter((c) => c.id !== channelId)
}

// ── Navegación compartida (teclado + mando) ───────────────────────────────────

function navigateUp()     { channelGridRef.value?.moveFocus('up') }
function navigateDown()   { channelGridRef.value?.moveFocus('down') }
function selectCurrent()  { channelGridRef.value?.selectFocused() }

function navigateBack() {
  if (activeChannel.value && !isTheatreMode.value) { activeChannel.value = null; return }
  if (isTheatreMode.value) { deactivateTheatreMode(); return }
  if (isMultiMode.value)   { deactivateMultiMode(); return }
}

// Soporte de gamepad: D-pad arriba/abajo navegan el grid, A selecciona, B retrocede
useGamepad({
  onUp:     navigateUp,
  onDown:   navigateDown,
  onLeft:   () => {},
  onRight:  () => {},
  onSelect: selectCurrent,
  onBack:   navigateBack,
})

// ── Atajos de teclado ─────────────────────────────────────────────────────────
function handleKeydown(event: KeyboardEvent) {
  // No interceptar atajos cuando el usuario está escribiendo en un campo
  const targetTag = (event.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(targetTag)) return

  switch (event.key) {
    case 'ArrowUp':
      event.preventDefault()
      navigateUp()
      break

    case 'ArrowDown':
      event.preventDefault()
      navigateDown()
      break

    case 'Enter':
      event.preventDefault()
      selectCurrent()
      break

    case 'Escape':
      // Cerrar el primer elemento abierto (en orden de prioridad)
      if (activeChannel.value && !isTheatreMode.value) { activeChannel.value = null; break }
      if (showAddForm.value)      { showAddForm.value = false; break }
      if (editingChannel.value)   { editingChannel.value = null; break }
      if (showEventsPanel.value)  { showEventsPanel.value = false; break }
      if (showAdminLogin.value)   { showAdminLogin.value = false; break }
      if (isTheatreMode.value)    { deactivateTheatreMode(); break }
      if (isMultiMode.value)      { deactivateMultiMode(); break }
      break

    case 'm':
    case 'M': {
      // Silenciar/activar el sonido del vídeo HLS activo
      const videoEl = document.querySelector<HTMLVideoElement>('.player-wrap video')
      if (videoEl) videoEl.muted = !videoEl.muted
      break
    }

    case 'f':
    case 'F': {
      // Pantalla completa del reproductor activo
      const playerEl = document.querySelector<HTMLElement>('.player-wrap')
      if (!playerEl) break
      if (!document.fullscreenElement) {
        playerEl.requestFullscreen().catch(() => {})
      } else {
        document.exitFullscreen()
      }
      break
    }
  }
}

// ── Notificaciones push para canales que comienzan a emitir ──────────────────
const previousLiveStatuses = ref<Record<string, boolean>>({})

watch(
  () => ({ ...liveStatusStore.statuses }),
  (currentStatuses) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    for (const [channelId, isLiveNow] of Object.entries(currentStatuses)) {
      // Solo notificar cuando el canal pasa de offline a online
      const wasLiveBefore = previousLiveStatuses.value[channelId]
      if (isLiveNow && !wasLiveBefore) {
        const channel = channelsStore.channels.find((c) => c.id === channelId)
        if (channel) {
          new Notification(`${channel.name} está en directo`, {
            icon: channel.logoUrl ?? undefined,
            body: 'Haz clic para ver el canal',
            tag:  `live-${channelId}`,  // Evita duplicados si ya hay una notificación activa
          })
        }
      }
    }

    previousLiveStatuses.value = currentStatuses
  },
  { deep: true }
)

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
let liveStatusInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  // Cargar datos iniciales
  await channelsStore.fetchChannels()
  liveStatusStore.fetchStatuses()
  eventsStore.fetchEvents()

  // Actualizar el estado en directo cada 30 segundos
  liveStatusInterval = setInterval(() => liveStatusStore.fetchStatuses(), 30_000)

  // Solicitar permiso para notificaciones (con retraso para no interrumpir la carga)
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3_000)
  }

  // Escuchar atajos de teclado
  window.addEventListener('keydown', handleKeydown)

  // Abrir canal directamente si viene en la URL: ?canal=nombre
  const urlParams  = new URLSearchParams(window.location.search)
  const canalParam = urlParams.get('canal')
  if (canalParam) {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '')
    const channel   = channelsStore.channels.find((c) => normalize(c.name) === normalize(canalParam))
    if (channel) openChannel(channel)
  }
})

onUnmounted(() => {
  if (liveStatusInterval) clearInterval(liveStatusInterval)
  window.removeEventListener('keydown', handleKeydown)
})

// ── Acciones sobre canales ────────────────────────────────────────────────────

/** Abre un canal en el reproductor o lo añade al multi-stream */
function openChannel(channel: Channel) {
  // Los canales "web" siempre abren en una nueva pestaña del navegador
  if (channel.streamType === 'web') {
    window.open(channel.url, '_blank', 'noopener,noreferrer')
    return
  }

  if (isMultiMode.value) {
    // En modo multi-stream: añadir al panel si no está ya
    const alreadyAdded = pinnedChannels.value.some((c) => c.id === channel.id)
    if (!alreadyAdded) {
      pinnedChannels.value = [...pinnedChannels.value, channel]
    }
  } else {
    // En modo normal/teatro: abrir en el reproductor
    activeChannel.value = channel
  }

  historyStore.add(channel.id)
}

/** Extrae el mensaje de error legible de una respuesta de Axios */
function getErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const response = (error as { response: { status: number; data?: { error?: string } } }).response
    const serverMsg = response.data?.error ?? ''
    return `Error ${response.status}${serverMsg ? ': ' + serverMsg : ''}`
  }
  if (error instanceof Error) return error.message
  return fallback
}

async function handleAddChannel(formData: ChannelFormData) {
  formLoading.value = true
  try {
    await channelsStore.addChannel(formData, adminStore.token)
    showAddForm.value = false
  } catch (error) {
    alert(getErrorMessage(error, 'Error al añadir el canal'))
  } finally {
    formLoading.value = false
  }
}

async function handleEditChannel(formData: ChannelFormData) {
  if (!editingChannel.value) return
  formLoading.value = true
  try {
    await channelsStore.updateChannel(editingChannel.value.id, formData, adminStore.token)
    editingChannel.value = null
  } catch (error) {
    alert(getErrorMessage(error, 'Error al actualizar el canal'))
  } finally {
    formLoading.value = false
  }
}

async function handleDeleteChannel(channel: Channel) {
  if (!confirm(`¿Eliminar "${channel.name}"? Esta acción no se puede deshacer.`)) return
  try {
    await channelsStore.removeChannel(channel.id, adminStore.token)
    // Si el canal eliminado estaba abierto, cerrar el reproductor
    if (activeChannel.value?.id === channel.id) activeChannel.value = null
  } catch (error) {
    alert(getErrorMessage(error, 'Error al eliminar el canal'))
  }
}
</script>

<template>
  <div class="app-layout">

    <!-- ══════════════════════════════════════════════════════════════════
         TOP BAR — Siempre visible en la parte superior
    ═══════════════════════════════════════════════════════════════════ -->
    <header class="topbar">

      <!-- Logo / título -->
      <span class="topbar-logo">⚡ TitanOS Sports</span>

      <!-- Botones principales — ocultos en móvil, visibles en tablet+ -->
      <nav class="topbar-nav">
        <button
          class="topbar-btn"
          :class="{ 'topbar-btn--active': isTheatreMode }"
          title="Modo teatro: canal grande + lista lateral"
          @click="isTheatreMode ? deactivateTheatreMode() : activateTheatreMode()"
        >🎬 Teatro</button>

        <button
          class="topbar-btn"
          :class="{ 'topbar-btn--active': isMultiMode }"
          title="Multi-stream: varios canales a la vez"
          @click="isMultiMode ? deactivateMultiMode() : activateMultiMode()"
        >⊞ Multi</button>

        <!-- Botones admin (solo visibles si hay sesión admin) -->
        <template v-if="adminStore.isAdmin">
          <button class="topbar-btn topbar-btn--primary" @click="showAddForm = true">
            + Canal
          </button>
          <button class="topbar-btn" @click="showEventsPanel = true">
            📅 Eventos
          </button>
          <button class="topbar-btn" title="Cerrar sesión admin" @click="adminStore.logout()">
            ✓ Admin
          </button>
        </template>

        <!-- Icono de acceso admin (cuando no hay sesión) -->
        <button
          v-else
          class="topbar-btn topbar-btn--icon"
          title="Acceso administrador"
          @click="showAdminLogin = true"
        >⚙</button>
      </nav>

      <!-- Botón hamburguesa — solo visible en móvil -->
      <button
        class="topbar-menu-btn"
        aria-label="Abrir menú"
        @click="showMobileMenu = !showMobileMenu"
      >☰</button>
    </header>

    <!-- Menú desplegable móvil -->
    <div v-if="showMobileMenu" class="mobile-menu">
      <button
        class="mobile-menu-item"
        :class="{ 'mobile-menu-item--active': isTheatreMode }"
        @click="isTheatreMode ? (deactivateTheatreMode(), showMobileMenu = false) : activateTheatreMode()"
      >🎬 Modo Teatro</button>

      <button
        class="mobile-menu-item"
        :class="{ 'mobile-menu-item--active': isMultiMode }"
        @click="isMultiMode ? (deactivateMultiMode(), showMobileMenu = false) : activateMultiMode()"
      >⊞ Multi-stream</button>

      <template v-if="adminStore.isAdmin">
        <button class="mobile-menu-item" @click="showAddForm = true; showMobileMenu = false">
          + Añadir canal
        </button>
        <button class="mobile-menu-item" @click="showEventsPanel = true; showMobileMenu = false">
          📅 Eventos
        </button>
        <button class="mobile-menu-item" @click="adminStore.logout(); showMobileMenu = false">
          Cerrar sesión admin
        </button>
      </template>
      <button v-else class="mobile-menu-item" @click="showAdminLogin = true; showMobileMenu = false">
        ⚙ Acceso admin
      </button>
    </div>

    <!-- ══════════════════════════════════════════════════════════════════
         MODO TEATRO — Sidebar de canales + reproductor grande
    ═══════════════════════════════════════════════════════════════════ -->
    <main v-if="isTheatreMode" class="layout-theatre">

      <!-- Sidebar: lista de canales -->
      <aside class="theatre-sidebar">
        <ChannelGrid
          ref="channelGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          @select="openChannel"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDeleteChannel"
        />
      </aside>

      <!-- Área del reproductor -->
      <div class="theatre-player">
        <!-- Placeholder cuando no hay canal seleccionado -->
        <div v-if="!activeChannel" class="theatre-empty">
          <span class="theatre-empty-icon">🎬</span>
          <p>Selecciona un canal de la lista</p>
          <p class="theatre-hint">
            <kbd>M</kbd> silenciar · <kbd>F</kbd> pantalla completa · <kbd>Esc</kbd> salir
          </p>
        </div>

        <!-- Reproductor activo -->
        <template v-else>
          <div class="theatre-channel-bar">
            <span class="theatre-channel-name">{{ activeChannel.name }}</span>
            <button class="theatre-close-btn" @click="activeChannel = null">✕ Cerrar</button>
          </div>
          <VideoPlayer :channel="activeChannel" class="theatre-video" />
        </template>
      </div>
    </main>

    <!-- ══════════════════════════════════════════════════════════════════
         MODO MULTI-STREAM — Grid de canales + panel de streams
    ═══════════════════════════════════════════════════════════════════ -->
    <main v-else-if="isMultiMode" class="layout-multi">
      <!-- En móvil el grid se oculta para dar espacio a los streams -->
      <aside class="multi-channel-list">
        <ChannelGrid
          ref="channelGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          @select="openChannel"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDeleteChannel"
        />
      </aside>

      <MultiStreamView
        :channels="pinnedChannels"
        @remove="removePinnedChannel"
        @close="deactivateMultiMode"
      />
    </main>

    <!-- ══════════════════════════════════════════════════════════════════
         MODO NORMAL — Grid de canales a pantalla completa
    ═══════════════════════════════════════════════════════════════════ -->
    <main v-else class="layout-normal">
      <ChannelGrid
        ref="channelGridRef"
        :channels="channelsStore.channels"
        :isAdmin="adminStore.isAdmin"
        :loading="channelsStore.loading"
        :error="channelsStore.error"
        :getLiveStatus="liveStatusStore.isLive"
        @select="openChannel"
        @edit="(ch) => (editingChannel = ch)"
        @delete="handleDeleteChannel"
      />
    </main>

    <!-- ══════════════════════════════════════════════════════════════════
         MODALES
    ═══════════════════════════════════════════════════════════════════ -->

    <!-- Reproductor modal (modo normal) -->
    <PlayerModal
      v-if="activeChannel && !isTheatreMode"
      :channel="activeChannel"
      @close="activeChannel = null"
    />

    <!-- Formulario de añadir canal -->
    <BaseModal v-if="showAddForm" title="Añadir canal" @close="showAddForm = false">
      <ChannelForm
        :loading="formLoading"
        @submit="handleAddChannel"
        @cancel="showAddForm = false"
      />
    </BaseModal>

    <!-- Formulario de editar canal -->
    <BaseModal v-if="editingChannel" title="Editar canal" @close="editingChannel = null">
      <ChannelForm
        :initial="editingChannel"
        :loading="formLoading"
        @submit="handleEditChannel"
        @cancel="editingChannel = null"
      />
    </BaseModal>

    <!-- Panel de eventos -->
    <EventsPanel v-if="showEventsPanel" @close="showEventsPanel = false" />

    <!-- Login de admin -->
    <AdminLogin v-if="showAdminLogin" @close="showAdminLogin = false" />
  </div>
</template>

<style scoped>
/* ── Estructura raíz de la aplicación ── */
.app-layout {
  display: flex;
  flex-direction: column;
  height: 100dvh;             /* dvh: respeta la barra de dirección en móvil */
  overflow: hidden;
}

/* ══════════════════════════════════════════════════════════════════
   TOP BAR
═══════════════════════════════════════════════════════════════════ */
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-4);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  height: var(--topbar-height);
  flex-shrink: 0;
  gap: var(--space-2);
}

.topbar-logo {
  font-weight: 800;
  font-size: clamp(0.9rem, 2.5vw, 1.1rem);
  color: var(--color-accent);
  letter-spacing: 0.02em;
  white-space: nowrap;
}

/* Botones de navegación (visibles en tablet+, ocultos en móvil) */
.topbar-nav {
  display: none;              /* Oculto por defecto (móvil) */
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}
@media (min-width: 640px) {
  .topbar-nav { display: flex; }
}

.topbar-btn {
  background: var(--color-border);
  border: none;
  border-radius: var(--radius-sm);
  color: var(--color-text-main);
  cursor: pointer;
  font-family: inherit;
  font-size: clamp(0.75rem, 1.8vw, 0.875rem);
  font-weight: 600;
  min-height: 36px;
  padding: 0 var(--space-3);
  white-space: nowrap;
  transition: background 0.15s, color 0.15s;
}
.topbar-btn:hover          { background: rgba(255,255,255,0.14); }
.topbar-btn--active        { background: var(--color-accent); color: #000; }
.topbar-btn--primary       { background: var(--color-accent); color: #000; }
.topbar-btn--primary:hover { opacity: 0.85; }
.topbar-btn--icon {
  width: 36px;
  padding: 0;
  font-size: 1.1rem;
  background: none;
  border: 1px solid var(--color-border);
}

/* Botón hamburguesa — solo en móvil */
.topbar-menu-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-main);
  cursor: pointer;
  font-size: 1.3rem;
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  flex-shrink: 0;
}
@media (min-width: 640px) {
  .topbar-menu-btn { display: none; }  /* Oculto en tablet+ */
}

/* Menú desplegable móvil */
.mobile-menu {
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 100;
}
.mobile-menu-item {
  background: none;
  border: none;
  border-top: 1px solid var(--color-border);
  color: var(--color-text-main);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.95rem;
  font-weight: 500;
  min-height: var(--touch-target);
  padding: 0 var(--space-5);
  text-align: left;
  transition: background 0.15s;
}
.mobile-menu-item:hover          { background: rgba(255,255,255,0.05); }
.mobile-menu-item--active        { color: var(--color-accent); }

/* ══════════════════════════════════════════════════════════════════
   MODO NORMAL
═══════════════════════════════════════════════════════════════════ */
.layout-normal {
  flex: 1;
  overflow: hidden;
}

/* ══════════════════════════════════════════════════════════════════
   MODO TEATRO
═══════════════════════════════════════════════════════════════════ */
.layout-theatre {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Sidebar: estrecho en móvil, más ancho en escritorio */
.theatre-sidebar {
  width: clamp(220px, 25vw, 320px);
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

/* En móvil el sidebar ocupa toda la altura y es más estrecho */
@media (max-width: 640px) {
  .theatre-sidebar { width: 160px; }
}

.theatre-player {
  flex: 1;
  min-width: 0;
  background: #000;
  display: flex;
  flex-direction: column;
}

.theatre-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  text-align: center;
  padding: var(--space-6);
}
.theatre-empty-icon {
  font-size: clamp(2rem, 6vw, 4rem);
  opacity: 0.25;
}
.theatre-empty p { margin: 0; font-size: clamp(0.85rem, 2vw, 1rem); }
.theatre-hint {
  font-size: 0.78rem;
  opacity: 0.6;
}
.theatre-hint kbd {
  display: inline-block;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: inherit;
  font-size: 0.7rem;
}

/* Barra superior del canal activo en modo teatro */
.theatre-channel-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: rgba(0,0,0,0.75);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.theatre-channel-name {
  color: #fff;
  font-size: clamp(0.85rem, 2vw, 1rem);
  font-weight: 600;
}
.theatre-close-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.82rem;
  padding: var(--space-1) var(--space-2);
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}
.theatre-close-btn:hover { color: var(--color-danger); }

/* El vídeo llena todo el espacio disponible en modo teatro */
.theatre-video :deep(.player-wrap) {
  aspect-ratio: unset;
  border-radius: 0;
  flex: 1;
  height: 100%;
}

/* ══════════════════════════════════════════════════════════════════
   MODO MULTI-STREAM
═══════════════════════════════════════════════════════════════════ */
.layout-multi {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Lista lateral de canales */
.multi-channel-list {
  width: clamp(200px, 22vw, 340px);
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}

/* En móvil se oculta la lista para dar todo el espacio a los streams */
@media (max-width: 640px) {
  .multi-channel-list { display: none; }
}
</style>

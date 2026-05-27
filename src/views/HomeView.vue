<script setup lang="ts">
/**
 * HomeView — Vista principal de TitanOS Sports para Titan OS (1366×768).
 *
 * Diseñada exclusivamente para Smart TV Philips con Titan OS.
 * Navegación principal por D-pad / control remoto / teclado.
 *
 * Modos de visualización:
 *   - Normal:  grid de canales → reproduce en modal pantalla completa
 *   - Teatro:  sidebar de canales + reproductor a la derecha
 *   - Multi:   sidebar de canales + vista multi-stream
 *
 * No hay menú hamburguesa: todos los controles siempre visibles en el header.
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Channel, ChannelFormData } from '@/types/channel'
import { useChannelsStore }   from '@/stores/channels'
import { useAdminStore }      from '@/stores/admin'
import { useLiveStatusStore } from '@/stores/liveStatus'
import { useEventsStore }     from '@/stores/events'
import { useHistoryStore }    from '@/stores/history'
import { useGamepad }         from '@/composables/useGamepad'

import ChannelGrid     from '@/components/channels/ChannelGrid.vue'
import ChannelForm     from '@/components/channels/ChannelForm.vue'
import PlayerModal     from '@/components/player/PlayerModal.vue'
import VideoPlayer     from '@/components/player/VideoPlayer.vue'
import MultiStreamView from '@/components/player/MultiStreamView.vue'
import AdminLogin      from '@/components/admin/AdminLogin.vue'
import EventsPanel     from '@/components/admin/EventsPanel.vue'
import BaseModal       from '@/components/ui/BaseModal.vue'

// ── Stores ───────────────────────────────────────────────────────────────────
const channelsStore   = useChannelsStore()
const adminStore      = useAdminStore()
const liveStatusStore = useLiveStatusStore()
const eventsStore     = useEventsStore()
const historyStore    = useHistoryStore()

// ── Estado de modales ─────────────────────────────────────────────────────────
const activeChannel   = ref<Channel | null>(null)
const editingChannel  = ref<Channel | null>(null)
const showAddForm     = ref(false)
const showAdminLogin  = ref(false)
const showEventsPanel = ref(false)
const formLoading     = ref(false)

// ── Modos de visualización ────────────────────────────────────────────────────
const isMultiMode    = ref(false)
const isTheatreMode  = ref(false)
const pinnedChannels = ref<Channel[]>([])

// ── Referencia al grid (para navegación por teclado/mando) ───────────────────
const channelGridRef = ref<InstanceType<typeof ChannelGrid> | null>(null)

// ── Cambio de modo ────────────────────────────────────────────────────────────
function activateMultiMode() {
  isMultiMode.value   = true
  isTheatreMode.value = false
}

function deactivateMultiMode() {
  isMultiMode.value    = false
  pinnedChannels.value = []
}

function activateTheatreMode() {
  isTheatreMode.value = true
  isMultiMode.value   = false
  pinnedChannels.value = []
}

function deactivateTheatreMode() {
  isTheatreMode.value = false
  activeChannel.value = null
}

function removePinnedChannel(channelId: string) {
  pinnedChannels.value = pinnedChannels.value.filter((c) => c.id !== channelId)
}

// ── Navegación (teclado + mando) ──────────────────────────────────────────────
function navigateUp()    { channelGridRef.value?.moveFocus('up') }
function navigateDown()  { channelGridRef.value?.moveFocus('down') }
function navigateLeft()  { channelGridRef.value?.moveFocus('left') }
function navigateRight() { channelGridRef.value?.moveFocus('right') }
function selectCurrent() { channelGridRef.value?.selectFocused() }

function navigateBack() {
  if (activeChannel.value && !isTheatreMode.value) { activeChannel.value = null; return }
  if (isTheatreMode.value)  { deactivateTheatreMode(); return }
  if (isMultiMode.value)    { deactivateMultiMode(); return }
  if (showAddForm.value)    { showAddForm.value = false; return }
  if (editingChannel.value) { editingChannel.value = null; return }
  if (showEventsPanel.value){ showEventsPanel.value = false; return }
  if (showAdminLogin.value) { showAdminLogin.value = false; return }
}

// Gamepad D-pad + A/B
useGamepad({
  onUp:     navigateUp,
  onDown:   navigateDown,
  onLeft:   navigateLeft,
  onRight:  navigateRight,
  onSelect: selectCurrent,
  onBack:   navigateBack,
})

// ── Atajos de teclado ─────────────────────────────────────────────────────────
function handleKeydown(event: KeyboardEvent) {
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
    case 'ArrowLeft':
      event.preventDefault()
      navigateLeft()
      break
    case 'ArrowRight':
      event.preventDefault()
      navigateRight()
      break
    case 'Enter':
      event.preventDefault()
      selectCurrent()
      break
    case 'Escape':
    case 'Backspace':
      navigateBack()
      break
    case 'm':
    case 'M': {
      const videoEl = document.querySelector<HTMLVideoElement>('.player-wrap video')
      if (videoEl) videoEl.muted = !videoEl.muted
      break
    }
    case 'f':
    case 'F': {
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

// ── Notificaciones push ───────────────────────────────────────────────────────
const previousLiveStatuses = ref<Record<string, boolean>>({})

watch(
  () => ({ ...liveStatusStore.statuses }),
  (currentStatuses) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const [channelId, isLiveNow] of Object.entries(currentStatuses)) {
      const wasLiveBefore = previousLiveStatuses.value[channelId]
      if (isLiveNow && !wasLiveBefore) {
        const channel = channelsStore.channels.find((c) => c.id === channelId)
        if (channel) {
          new Notification(`${channel.name} está en directo`, {
            icon: channel.logoUrl ?? undefined,
            body: 'Pulsa OK para ver el canal',
            tag:  `live-${channelId}`,
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
  await channelsStore.fetchChannels()
  liveStatusStore.fetchStatuses()
  eventsStore.fetchEvents()

  liveStatusInterval = setInterval(() => liveStatusStore.fetchStatuses(), 30_000)

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 5_000)
  }

  window.addEventListener('keydown', handleKeydown)

  // Abrir canal por URL: ?canal=nombre
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
function openChannel(channel: Channel) {
  if (channel.streamType === 'web') {
    window.open(channel.url, '_blank', 'noopener,noreferrer')
    return
  }
  if (isMultiMode.value) {
    const alreadyAdded = pinnedChannels.value.some((c) => c.id === channel.id)
    if (!alreadyAdded) pinnedChannels.value = [...pinnedChannels.value, channel]
  } else {
    activeChannel.value = channel
  }
  historyStore.add(channel.id)
}

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
  if (!confirm(`¿Eliminar "${channel.name}"?`)) return
  try {
    await channelsStore.removeChannel(channel.id, adminStore.token)
    if (activeChannel.value?.id === channel.id) activeChannel.value = null
  } catch (error) {
    alert(getErrorMessage(error, 'Error al eliminar el canal'))
  }
}
</script>

<template>
  <div class="tv-layout">

    <!-- ══════════════════════════════════════════════════════════════
         HEADER — Siempre visible, altura fija 60px
         Contiene: logo | modos | admin | búsqueda
    ═══════════════════════════════════════════════════════════════ -->
    <header class="tv-header">
      <!-- Logo -->
      <span class="tv-logo">⚡ TitanOS Sports</span>

      <!-- Separador -->
      <div class="header-sep" />

      <!-- Botones de modo -->
      <nav class="header-nav" aria-label="Modos de visualización">
        <button
          class="hdr-btn"
          :class="{ 'hdr-btn--active': isTheatreMode }"
          @click="isTheatreMode ? deactivateTheatreMode() : activateTheatreMode()"
        >🎬 Teatro</button>

        <button
          class="hdr-btn"
          :class="{ 'hdr-btn--active': isMultiMode }"
          @click="isMultiMode ? deactivateMultiMode() : activateMultiMode()"
        >⊞ Multi</button>
      </nav>

      <!-- Separador -->
      <div class="header-sep" />

      <!-- Botones admin (siempre visibles según sesión) -->
      <nav class="header-admin" aria-label="Administración">
        <template v-if="adminStore.isAdmin">
          <button class="hdr-btn hdr-btn--accent" @click="showAddForm = true">
            + Canal
          </button>
          <button class="hdr-btn" @click="showEventsPanel = true">
            📅 Eventos
          </button>
          <button class="hdr-btn hdr-btn--logout" @click="adminStore.logout()">
            ✓ Admin
          </button>
        </template>
        <button
          v-else
          class="hdr-btn hdr-btn--icon"
          title="Acceso administrador"
          @click="showAdminLogin = true"
        >⚙</button>
      </nav>
    </header>

    <!-- ══════════════════════════════════════════════════════════════
         MODO TEATRO — sidebar izquierdo + reproductor derecha
    ═══════════════════════════════════════════════════════════════ -->
    <main v-if="isTheatreMode" class="layout-theatre">
      <!-- Sidebar de canales -->
      <aside class="theatre-sidebar">
        <ChannelGrid
          ref="channelGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          sidebar-mode
          @select="openChannel"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDeleteChannel"
        />
      </aside>

      <!-- Área del reproductor -->
      <div class="theatre-player">
        <div v-if="!activeChannel" class="theatre-empty">
          <span class="empty-icon">🎬</span>
          <p>Selecciona un canal</p>
          <p class="empty-hint">D-pad para navegar · OK para reproducir · Back para salir</p>
        </div>
        <template v-else>
          <div class="theatre-bar">
            <span class="theatre-name">{{ activeChannel.name }}</span>
            <button class="theatre-close" @click="activeChannel = null">✕ Cerrar</button>
          </div>
          <VideoPlayer :channel="activeChannel" class="theatre-video" />
        </template>
      </div>
    </main>

    <!-- ══════════════════════════════════════════════════════════════
         MODO MULTI — sidebar de canales + panel multi-stream
    ═══════════════════════════════════════════════════════════════ -->
    <main v-else-if="isMultiMode" class="layout-multi">
      <aside class="multi-sidebar">
        <ChannelGrid
          ref="channelGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          sidebar-mode
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

    <!-- ══════════════════════════════════════════════════════════════
         MODO NORMAL — barra de filtros + grid de canales
    ═══════════════════════════════════════════════════════════════ -->
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

    <!-- ══════════════════════════════════════════════════════════════
         MODALES
    ═══════════════════════════════════════════════════════════════ -->

    <!-- Reproductor modal (modo normal) -->
    <PlayerModal
      v-if="activeChannel && !isTheatreMode"
      :channel="activeChannel"
      @close="activeChannel = null"
    />

    <!-- Añadir canal -->
    <BaseModal v-if="showAddForm" title="Añadir canal" @close="showAddForm = false">
      <ChannelForm
        :loading="formLoading"
        @submit="handleAddChannel"
        @cancel="showAddForm = false"
      />
    </BaseModal>

    <!-- Editar canal -->
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
/* ── Layout raíz TV — ocupa el 100% de la pantalla ── */
.tv-layout {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-base);
}

/* ══════════════════════════════════════════════════════
   HEADER — altura fija 76px, ancho fluido
══════════════════════════════════════════════════════ */
.tv-header {
  height: var(--header-height);   /* 76px */
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-5);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}

.tv-logo {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--color-accent);
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Separador vertical */
.header-sep {
  width: 1px;
  height: 1.8rem;
  background: var(--color-border);
  flex-shrink: 0;
}

.header-nav,
.header-admin {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* Botones del header — altura en vh para escalar con la TV */
.hdr-btn {
  height: 5.7vh;
  padding: 0 var(--space-4);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.94rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  outline: none;
}
.hdr-btn:hover,
.hdr-btn:focus-visible {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}
.hdr-btn--active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
}
.hdr-btn--accent {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
}
.hdr-btn--logout { color: var(--color-accent); }
.hdr-btn--icon {
  width: 5.7vh;
  padding: 0;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ══════════════════════════════════════════════════════
   MODO NORMAL
══════════════════════════════════════════════════════ */
.layout-normal {
  flex: 1;
  overflow: hidden;
}

/* ══════════════════════════════════════════════════════
   MODO TEATRO
══════════════════════════════════════════════════════ */
.layout-theatre {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Sidebar ~22% del ancho total */
.theatre-sidebar {
  width: 22%;
  min-width: 260px;
  max-width: 340px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
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
  gap: var(--space-4);
  color: var(--color-text-muted);
}
.empty-icon {
  font-size: 4rem;
  opacity: 0.2;
}
.empty-hint {
  font-size: 0.9rem;
  opacity: 0.6;
}

.theatre-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: rgba(0,0,0,0.7);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.theatre-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}
.theatre-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}
.theatre-close:hover { color: var(--color-danger); }

.theatre-video :deep(.player-wrap) {
  aspect-ratio: unset;
  border-radius: 0;
  height: 100%;
}

/* ══════════════════════════════════════════════════════
   MODO MULTI
══════════════════════════════════════════════════════ */
.layout-multi {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.multi-sidebar {
  width: 20%;
  min-width: 240px;
  max-width: 320px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}
</style>

<script setup lang="ts">
/**
 * HomeView — Vista principal de TitanOS Sports para Titan OS.
 *
 * Layout 100% relativo: vw · vh · rem
 * Modos: Normal · Teatro · Multi-stream
 * Navegación: D-pad + teclado
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Channel, ChannelFormData } from '@/types/channel'
import { useChannelsStore }   from '@/stores/channels'
import { useAdminStore }      from '@/stores/admin'
import { useLiveStatusStore } from '@/stores/liveStatus'
import { useEventsStore }     from '@/stores/events'
import { useHistoryStore }    from '@/stores/history'
import { useGamepad }         from '@/composables/useGamepad'
import { useTitanSDK }        from '@/composables/useTitanSDK'

import ChannelGrid     from '@/components/channels/ChannelGrid.vue'
import ChannelForm     from '@/components/channels/ChannelForm.vue'
import PlayerModal     from '@/components/player/PlayerModal.vue'
import ChannelPreview  from '@/components/player/ChannelPreview.vue'
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

// ── Estado de UI ──────────────────────────────────────────────────────────────
const activeChannel   = ref<Channel | null>(null)
const editingChannel  = ref<Channel | null>(null)
const showAddForm     = ref(false)
const showAdminLogin  = ref(false)
const showEventsPanel = ref(false)
const formLoading     = ref(false)

// ── Modos ─────────────────────────────────────────────────────────────────────
const isMultiMode    = ref(false)
const isTheatreMode  = ref(false)
const pinnedChannels = ref<Channel[]>([])

// ── Ref al grid ───────────────────────────────────────────────────────────────
const channelGridRef = ref<InstanceType<typeof ChannelGrid> | null>(null)

// ── Preview al hover/focus ────────────────────────────────────────────────────
const previewChannel = ref<Channel | null>(null)

// ── Cambio de modo ────────────────────────────────────────────────────────────
function activateMultiMode()       { isMultiMode.value = true;  isTheatreMode.value = false }
function deactivateMultiMode()     { isMultiMode.value = false; pinnedChannels.value = [] }
function activateTheatreMode()     { isTheatreMode.value = true; isMultiMode.value = false; pinnedChannels.value = [] }
function deactivateTheatreMode()   { isTheatreMode.value = false; activeChannel.value = null }
function removePinnedChannel(id: string) {
  pinnedChannels.value = pinnedChannels.value.filter((c) => c.id !== id)
}

// ── Navegación ────────────────────────────────────────────────────────────────
const navigateUp    = () => channelGridRef.value?.moveFocus('up')
const navigateDown  = () => channelGridRef.value?.moveFocus('down')
const navigateLeft  = () => channelGridRef.value?.moveFocus('left')
const navigateRight = () => channelGridRef.value?.moveFocus('right')
const selectCurrent = () => channelGridRef.value?.selectFocused()

function navigateBack() {
  if (activeChannel.value && !isTheatreMode.value) { activeChannel.value = null; return }
  if (isTheatreMode.value)   { deactivateTheatreMode(); return }
  if (isMultiMode.value)     { deactivateMultiMode();   return }
  if (showAddForm.value)     { showAddForm.value = false; return }
  if (editingChannel.value)  { editingChannel.value = null; return }
  if (showEventsPanel.value) { showEventsPanel.value = false; return }
  if (showAdminLogin.value)  { showAdminLogin.value = false; return }
}

useGamepad({
  onUp: navigateUp, onDown: navigateDown, onLeft: navigateLeft, onRight: navigateRight,
  onSelect: selectCurrent, onBack: navigateBack,
})

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
  switch (e.key) {
    case 'ArrowUp':    e.preventDefault(); navigateUp();    break
    case 'ArrowDown':  e.preventDefault(); navigateDown();  break
    case 'ArrowLeft':  e.preventDefault(); navigateLeft();  break
    case 'ArrowRight': e.preventDefault(); navigateRight(); break
    case 'Enter':      e.preventDefault(); selectCurrent(); break
    case 'Escape':
    case 'Backspace':  navigateBack(); break
    case 'm': case 'M': {
      const v = document.querySelector<HTMLVideoElement>('.player-wrap video')
      if (v) v.muted = !v.muted
      break
    }
    case 'f': case 'F': {
      const p = document.querySelector<HTMLElement>('.player-wrap')
      if (!p) break
      if (!document.fullscreenElement) p.requestFullscreen().catch(() => {})
      else document.exitFullscreen()
      break
    }
  }
}

// ── Notificaciones push ───────────────────────────────────────────────────────
const previousLive = ref<Record<string, boolean>>({})
watch(
  () => ({ ...liveStatusStore.statuses }),
  (current) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const [id, isLive] of Object.entries(current)) {
      if (isLive && !previousLive.value[id]) {
        const ch = channelsStore.channels.find((c) => c.id === id)
        if (ch) new Notification(`${ch.name} está en directo`, {
          icon: ch.logoUrl ?? undefined,
          body: 'Pulsa OK para ver el canal',
          tag:  `live-${id}`,
        })
      }
    }
    previousLive.value = current
  },
  { deep: true }
)

// ── Ciclo de vida ─────────────────────────────────────────────────────────────
let liveInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await channelsStore.fetchChannels()
  liveStatusStore.fetchStatuses()
  eventsStore.fetchEvents()
  liveInterval = setInterval(() => liveStatusStore.fetchStatuses(), 30_000)

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 5_000)
  }
  window.addEventListener('keydown', handleKeydown)

  const params = new URLSearchParams(window.location.search)
  const nom    = params.get('canal')
  if (nom) {
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
    const ch   = channelsStore.channels.find((c) => norm(c.name) === norm(nom))
    if (ch) openChannel(ch)
  }
})

onUnmounted(() => {
  if (liveInterval) clearInterval(liveInterval)
  window.removeEventListener('keydown', handleKeydown)
})

// ── SDK — lanzar apps nativas de Titan OS ────────────────────────────────────
const { launchApp } = useTitanSDK()

// ── Acciones canales ──────────────────────────────────────────────────────────
function isYoutubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be') || url.startsWith('youtube://')
}

function normalizeYoutubeUrl(url: string): string {
  if (url.startsWith('youtube://')) {
    return 'https://www.youtube.com/' + url.slice('youtube://'.length)
  }
  return url
}

function openChannel(ch: Channel) {
  previewChannel.value = null
  if (ch.streamType === 'web') {
    window.open(ch.url, '_blank', 'noopener,noreferrer')
    return
  }
  // YouTube → app nativa: sdk.apps.launch("youtube", url)
  if (ch.streamType === 'youtube') {
    launchApp('youtube', ch.url)
    return
  }
  // App nativa con deep link: 'dazn://' → sdk.apps.launch("dazn", "dazn://")
  // Excepción: URLs de YouTube se reproducen inline en el PlayerModal
  if (ch.streamType === 'titanapp') {
    if (isYoutubeUrl(ch.url)) {
      activeChannel.value = { ...ch, streamType: 'youtube', url: normalizeYoutubeUrl(ch.url) }
      historyStore.add(ch.id)
      return
    }
    const appId = ch.url.split('://')[0] ?? ch.url
    launchApp(appId, ch.url)
    return
  }
  if (isMultiMode.value) {
    if (!pinnedChannels.value.some((c) => c.id === ch.id))
      pinnedChannels.value = [...pinnedChannels.value, ch]
  } else {
    activeChannel.value = ch
  }
  historyStore.add(ch.id)
}

function getErr(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const r = (error as { response: { status: number; data?: { error?: string } } }).response
    return `Error ${r.status}${r.data?.error ? ': ' + r.data.error : ''}`
  }
  if (error instanceof Error) return error.message
  return fallback
}

async function handleAddChannel(fd: ChannelFormData) {
  formLoading.value = true
  try   { await channelsStore.addChannel(fd, adminStore.token); showAddForm.value = false }
  catch (e) { alert(getErr(e, 'Error al añadir')) }
  finally   { formLoading.value = false }
}

async function handleEditChannel(fd: ChannelFormData) {
  if (!editingChannel.value) return
  formLoading.value = true
  try   { await channelsStore.updateChannel(editingChannel.value.id, fd, adminStore.token); editingChannel.value = null }
  catch (e) { alert(getErr(e, 'Error al actualizar')) }
  finally   { formLoading.value = false }
}

async function handleDeleteChannel(ch: Channel) {
  if (!confirm(`¿Eliminar "${ch.name}"?`)) return
  try {
    await channelsStore.removeChannel(ch.id, adminStore.token)
    if (activeChannel.value?.id === ch.id) activeChannel.value = null
  } catch (e) { alert(getErr(e, 'Error al eliminar')) }
}
</script>

<template>
  <div class="tv-layout">

    <!-- ══ HEADER ══════════════════════════════════════════════════════════ -->
    <header class="tv-header">

      <!-- Logo -->
      <span class="tv-logo">⚡ TitanOS Sports</span>

      <div class="header-sep" />

      <!-- Modos -->
      <nav class="header-group" aria-label="Modos">
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

      <div class="header-sep" />

      <!-- Admin -->
      <nav class="header-group" aria-label="Admin">
        <template v-if="adminStore.isAdmin">
          <button class="hdr-btn hdr-btn--accent" @click="showAddForm = true">+ Canal</button>
          <button class="hdr-btn" @click="showEventsPanel = true">📅 Eventos</button>
          <button class="hdr-btn hdr-btn--muted" @click="adminStore.logout()">✓ Admin</button>
        </template>
        <button v-else class="hdr-btn hdr-btn--icon" title="Acceso admin" @click="showAdminLogin = true">⚙</button>
      </nav>
    </header>

    <!-- ══ MODO TEATRO ══════════════════════════════════════════════════════ -->
    <main v-if="isTheatreMode" class="layout-theatre">
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

      <div class="theatre-player">
        <div v-if="!activeChannel" class="theatre-empty">
          <span class="empty-icon">🎬</span>
          <p class="empty-text">Selecciona un canal</p>
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

    <!-- ══ MODO MULTI ═══════════════════════════════════════════════════════ -->
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

    <!-- ══ MODO NORMAL ══════════════════════════════════════════════════════ -->
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
        @preview="previewChannel = $event"
      />
    </main>

    <!-- ══ MODALES ══════════════════════════════════════════════════════════ -->

    <!-- Reproductor pantalla completa (modo normal) -->
    <PlayerModal
      v-if="activeChannel && !isTheatreMode"
      :channel="activeChannel"
      @close="activeChannel = null"
    />

    <!-- Preview al hover/focus — no mostrar si hay modal abierto -->
    <ChannelPreview
      v-if="previewChannel && !activeChannel"
      :channel="previewChannel"
      @open="openChannel"
      @close="previewChannel = null"
    />

    <!-- Añadir canal -->
    <BaseModal v-if="showAddForm" title="Añadir canal" @close="showAddForm = false">
      <ChannelForm :loading="formLoading" @submit="handleAddChannel" @cancel="showAddForm = false" />
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

    <!-- Eventos -->
    <EventsPanel v-if="showEventsPanel" @close="showEventsPanel = false" />

    <!-- Login admin -->
    <AdminLogin v-if="showAdminLogin" @close="showAdminLogin = false" />
  </div>
</template>

<style scoped>
/* ── Layout raíz ── */
.tv-layout {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-base);
}

/* ══ HEADER ══════════════════════════════════════════════════════════════ */
.tv-header {
  height: var(--header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-5);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}

/* Logo */
.tv-logo {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-accent);
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Separador vertical */
.header-sep {
  width: 1px;
  height: 2rem;
  background: var(--color-border);
  flex-shrink: 0;
}

/* Grupos de botones */
.header-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* Botones del header — altura vh para escalar con la TV */
.hdr-btn {
  height: 6vh;
  padding: 0 var(--space-4);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
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
  font-weight: 700;
}
.hdr-btn--accent {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
  font-weight: 700;
}
.hdr-btn--muted {
  color: var(--color-accent);
  border-color: rgba(0, 191, 255, 0.35);
}
.hdr-btn--icon {
  width: 6vh;
  padding: 0;
  font-size: 1.3rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ══ MODO NORMAL ══════════════════════════════════════════════════════════ */
.layout-normal {
  flex: 1;
  overflow: hidden;
}

/* ══ MODO TEATRO ══════════════════════════════════════════════════════════ */
.layout-theatre {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.theatre-sidebar {
  width: var(--sidebar-width);
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
.empty-icon { font-size: 5rem; opacity: 0.15; }
.empty-text { font-size: 1.3rem; font-weight: 600; }
.empty-hint { font-size: 0.85rem; opacity: 0.55; }

.theatre-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: rgba(0, 0, 0, 0.75);
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
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  transition: color 0.15s, background 0.15s;
  outline: none;
}
.theatre-close:hover { color: var(--color-danger); background: rgba(239, 68, 68, 0.12); }

.theatre-video :deep(.player-wrap) {
  border-radius: 0;
  aspect-ratio: unset;
  height: 100%;
}

/* ══ MODO MULTI ════════════════════════════════════════════════════════════ */
.layout-multi {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.multi-sidebar {
  width: calc(var(--sidebar-width) - 2vw);
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}
</style>

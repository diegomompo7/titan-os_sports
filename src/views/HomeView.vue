<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Channel, ChannelFormData } from '@/types/channel'
import { useChannelsStore } from '@/stores/channels'
import { useAdminStore } from '@/stores/admin'
import { useLiveStatusStore } from '@/stores/liveStatus'
import { useEventsStore } from '@/stores/events'
import { useHistoryStore } from '@/stores/history'
import { useGamepad } from '@/composables/useGamepad'
import ChannelGrid from '@/components/channels/ChannelGrid.vue'
import ChannelForm from '@/components/channels/ChannelForm.vue'
import PlayerModal from '@/components/player/PlayerModal.vue'
import VideoPlayer from '@/components/player/VideoPlayer.vue'
import MultiStreamView from '@/components/player/MultiStreamView.vue'
import AdminLogin from '@/components/admin/AdminLogin.vue'
import EventsPanel from '@/components/admin/EventsPanel.vue'
import BaseModal from '@/components/ui/BaseModal.vue'

const channelsStore = useChannelsStore()
const adminStore = useAdminStore()
const liveStatusStore = useLiveStatusStore()
const eventsStore = useEventsStore()
const historyStore = useHistoryStore()

const activeChannel = ref<Channel | null>(null)
const editingChannel = ref<Channel | null>(null)
const showAddForm = ref(false)
const showAdminLogin = ref(false)
const showEventsPanel = ref(false)
const formLoading = ref(false)

// Multi-stream
const multiMode = ref(false)
const pinnedChannels = ref<Channel[]>([])

// Theatre mode
const theatreMode = ref(false)

// ── Ref al ChannelGrid activo (compartido entre layouts) ─────────────────────
const channelGridRef = ref<InstanceType<typeof ChannelGrid> | null>(null)

function toggleMultiMode() {
  multiMode.value = !multiMode.value
  if (!multiMode.value) pinnedChannels.value = []
  if (multiMode.value) theatreMode.value = false
}

function toggleTheatreMode() {
  theatreMode.value = !theatreMode.value
  if (theatreMode.value) {
    multiMode.value = false
    pinnedChannels.value = []
  }
}

function removePinned(id: string) {
  pinnedChannels.value = pinnedChannels.value.filter((c) => c.id !== id)
}

// ── Navegación compartida (teclado + mando) ──────────────────────────────────
function navUp()     { channelGridRef.value?.moveFocus('up') }
function navDown()   { channelGridRef.value?.moveFocus('down') }
function navSelect() { channelGridRef.value?.selectFocused() }
function navBack() {
  if (activeChannel.value && !theatreMode.value) { activeChannel.value = null; return }
  if (theatreMode.value) { theatreMode.value = false; return }
  if (multiMode.value) { toggleMultiMode() }
}

// Gamepad API — D-pad + stick izquierdo + A/B
useGamepad({ onUp: navUp, onDown: navDown, onLeft: () => {}, onRight: () => {}, onSelect: navSelect, onBack: navBack })

// ── Keyboard shortcuts ──────────────────────────────────────────────────────
function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

  // Flechas + Enter — navegación por la lista de canales
  if (e.key === 'ArrowUp')   { e.preventDefault(); navUp();     return }
  if (e.key === 'ArrowDown') { e.preventDefault(); navDown();   return }
  if (e.key === 'Enter')     { e.preventDefault(); navSelect(); return }

  if (e.key === 'Escape') {
    if (activeChannel.value && !theatreMode.value) { activeChannel.value = null; return }
    if (showAddForm.value) { showAddForm.value = false; return }
    if (editingChannel.value) { editingChannel.value = null; return }
    if (showEventsPanel.value) { showEventsPanel.value = false; return }
    if (showAdminLogin.value) { showAdminLogin.value = false; return }
    if (theatreMode.value) { theatreMode.value = false; return }
    if (multiMode.value) { toggleMultiMode(); return }
    return
  }

  if (e.key === 'm' || e.key === 'M') {
    const video = document.querySelector<HTMLVideoElement>('.player-wrap video')
    if (video) { video.muted = !video.muted; return }
  }

  if (e.key === 'f' || e.key === 'F') {
    const player = document.querySelector<HTMLElement>('.player-wrap')
    if (!player) return
    if (!document.fullscreenElement) player.requestFullscreen().catch(() => {})
    else document.exitFullscreen()
    return
  }
}

// ── Push notifications for live status ─────────────────────────────────────
const prevLiveStatuses = ref<Record<string, boolean>>({})

watch(
  () => ({ ...liveStatusStore.statuses }),
  (newStatuses) => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    for (const [id, isLiveNow] of Object.entries(newStatuses)) {
      if (isLiveNow && !prevLiveStatuses.value[id]) {
        const ch = channelsStore.channels.find((c) => c.id === id)
        if (ch) {
          new Notification(`${ch.name} está en directo`, {
            icon: ch.logoUrl ?? undefined,
            body: 'Haz click para ver el canal',
            tag: `live-${id}`,
          })
        }
      }
    }
    prevLiveStatuses.value = newStatuses
  },
  { deep: true }
)

let liveInterval: ReturnType<typeof setInterval> | null = null

onMounted(async () => {
  await channelsStore.fetchChannels()
  liveStatusStore.fetchStatuses()
  eventsStore.fetchEvents()
  liveInterval = setInterval(() => liveStatusStore.fetchStatuses(), 30_000)
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3000)
  }
  window.addEventListener('keydown', handleKeydown)

  // Abrir canal desde URL: ?canal=rubenmartinweb
  const canalParam = new URLSearchParams(window.location.search).get('canal')
  if (canalParam) {
    const normalize = (s: string) => s.toLowerCase().replace(/\s+/g, '')
    const ch = channelsStore.channels.find((c) => normalize(c.name) === normalize(canalParam))
    if (ch) handleSelect(ch)
  }
})

onUnmounted(() => {
  if (liveInterval) clearInterval(liveInterval)
  window.removeEventListener('keydown', handleKeydown)
})

function handleSelect(ch: Channel) {
  if (ch.streamType === 'web') {
    window.open(ch.url, '_blank', 'noopener,noreferrer')
    return
  }

  if (multiMode.value) {
    if (!pinnedChannels.value.find((c) => c.id === ch.id)) {
      pinnedChannels.value = [...pinnedChannels.value, ch]
    }
    historyStore.add(ch.id)
    return
  }

  activeChannel.value = ch
  historyStore.add(ch.id)
}

function apiError(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const res = (err as { response: { status: number; data?: { error?: string } } }).response
    const msg = res.data?.error ?? ''
    return `Error ${res.status}${msg ? ': ' + msg : ''}`
  }
  if (err instanceof Error) return err.message
  return fallback
}

async function handleAdd(data: ChannelFormData) {
  formLoading.value = true
  try {
    await channelsStore.addChannel(data, adminStore.token)
    showAddForm.value = false
  } catch (err) {
    alert(apiError(err, 'Error al añadir canal'))
  } finally {
    formLoading.value = false
  }
}

async function handleEdit(data: ChannelFormData) {
  if (!editingChannel.value) return
  formLoading.value = true
  try {
    await channelsStore.updateChannel(editingChannel.value.id, data, adminStore.token)
    editingChannel.value = null
  } catch (err) {
    alert(apiError(err, 'Error al actualizar canal'))
  } finally {
    formLoading.value = false
  }
}

async function handleDelete(channel: Channel) {
  if (!confirm(`¿Eliminar "${channel.name}"?`)) return
  try {
    await channelsStore.removeChannel(channel.id, adminStore.token)
    if (activeChannel.value?.id === channel.id) activeChannel.value = null
  } catch (err) {
    alert(apiError(err, 'Error al eliminar canal'))
  }
}
</script>

<template>
  <div class="home">
    <!-- Top bar -->
    <header class="topbar">
      <span class="topbar-title">⚡ TitanOS Sports</span>
      <div class="topbar-actions">
        <button
          class="btn btn-ghost"
          :class="{ 'btn-active': theatreMode }"
          title="Modo teatro (un canal a pantalla completa)"
          @click="toggleTheatreMode"
        >
          🎬 Teatro
        </button>
        <button
          class="btn btn-ghost"
          :class="{ 'btn-active': multiMode }"
          title="Multi-stream"
          @click="toggleMultiMode"
        >
          ⊞ Multi
        </button>
        <button v-if="adminStore.isAdmin" class="btn btn-primary" @click="showAddForm = true">
          + Añadir canal
        </button>
        <button v-if="adminStore.isAdmin" class="btn btn-ghost" title="Programar eventos" @click="showEventsPanel = true">
          📅 Eventos
        </button>
        <button
          v-if="adminStore.isAdmin"
          class="btn btn-ghost"
          title="Cerrar sesión admin"
          @click="adminStore.logout()"
        >
          ✓ Admin
        </button>
        <button
          v-if="!adminStore.isAdmin"
          class="btn-admin-login"
          title="Acceso administrador"
          @click="showAdminLogin = true"
        >
          ⚙
        </button>
      </div>
    </header>

    <!-- ── Teatro ─────────────────────────────────────────────────── -->
    <main v-if="theatreMode" class="main-theatre">
      <div class="theatre-sidebar">
        <ChannelGrid
          ref="channelGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          @select="handleSelect"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDelete"
        />
      </div>
      <div class="theatre-player">
        <div v-if="!activeChannel" class="theatre-empty">
          <span class="theatre-empty-icon">🎬</span>
          <p>Selecciona un canal de la lista</p>
          <p class="theatre-hint">Atajos: <kbd>M</kbd> mute · <kbd>F</kbd> pantalla completa · <kbd>Esc</kbd> salir</p>
        </div>
        <template v-else>
          <div class="theatre-header">
            <span class="theatre-channel-name">{{ activeChannel.name }}</span>
            <button class="theatre-close" @click="activeChannel = null">✕</button>
          </div>
          <VideoPlayer :channel="activeChannel" class="theatre-video" />
        </template>
      </div>
    </main>

    <!-- ── Multi-stream ───────────────────────────────────────────── -->
    <main v-else-if="multiMode" class="main-multi">
      <ChannelGrid
        ref="channelGridRef"
        :channels="channelsStore.channels"
        :isAdmin="adminStore.isAdmin"
        :loading="channelsStore.loading"
        :error="channelsStore.error"
        :getLiveStatus="liveStatusStore.isLive"
        @select="handleSelect"
        @edit="(ch) => (editingChannel = ch)"
        @delete="handleDelete"
      />
      <MultiStreamView
        :channels="pinnedChannels"
        @remove="removePinned"
        @close="toggleMultiMode"
      />
    </main>

    <!-- ── Normal ─────────────────────────────────────────────────── -->
    <main v-else class="main-content">
      <ChannelGrid
        ref="channelGridRef"
        :channels="channelsStore.channels"
        :isAdmin="adminStore.isAdmin"
        :loading="channelsStore.loading"
        :error="channelsStore.error"
        :getLiveStatus="liveStatusStore.isLive"
        @select="handleSelect"
        @edit="(ch) => (editingChannel = ch)"
        @delete="handleDelete"
      />
    </main>

    <!-- Player modal (normal mode only) -->
    <PlayerModal
      v-if="activeChannel && !theatreMode"
      :channel="activeChannel"
      @close="activeChannel = null"
    />

    <!-- Add channel modal -->
    <BaseModal v-if="showAddForm" title="Añadir canal" @close="showAddForm = false">
      <ChannelForm :loading="formLoading" @submit="handleAdd" @cancel="showAddForm = false" />
    </BaseModal>

    <!-- Edit channel modal -->
    <BaseModal v-if="editingChannel" title="Editar canal" @close="editingChannel = null">
      <ChannelForm
        :initial="editingChannel"
        :loading="formLoading"
        @submit="handleEdit"
        @cancel="editingChannel = null"
      />
    </BaseModal>

    <!-- Events panel -->
    <EventsPanel v-if="showEventsPanel" @close="showEventsPanel = false" />

    <!-- Admin login modal -->
    <AdminLogin v-if="showAdminLogin" @close="showAdminLogin = false" />
  </div>
</template>


<style scoped>
.home {
  display: grid;
  grid-template-rows: var(--topbar-height) 1fr;
  height: 100vh;
  overflow: hidden;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-lg);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  height: var(--topbar-height);
}
.topbar-title {
  font-weight: 700;
  font-size: 1rem;
  color: var(--color-accent);
  letter-spacing: 0.03em;
}
.topbar-actions {
  display: flex;
  gap: var(--space-sm);
  align-items: center;
}

/* ── Layouts ── */
.main-content {
  overflow: hidden;
  height: 100%;
}
.main-multi {
  display: flex;
  height: 100%;
  overflow: hidden;
}
.main-multi > :first-child {
  width: 360px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}
.main-multi > :last-child {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

/* ── Theatre mode ── */
.main-theatre {
  display: flex;
  height: 100%;
  overflow: hidden;
}
.theatre-sidebar {
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}
.theatre-player {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: #000;
  position: relative;
}
.theatre-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-sm);
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
.theatre-empty-icon {
  font-size: 3rem;
  opacity: 0.3;
}
.theatre-empty p {
  margin: 0;
}
.theatre-hint {
  font-size: 0.75rem;
  opacity: 0.5;
}
.theatre-hint kbd {
  display: inline-block;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 3px;
  padding: 0 5px;
  font-family: inherit;
  font-size: 0.7rem;
}
.theatre-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(0, 0, 0, 0.8);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.theatre-channel-name {
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
}
.theatre-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}
.theatre-close:hover {
  color: #ff4444;
}
/* Override player aspect-ratio so it fills the theatre area */
.theatre-player :deep(.player-wrap) {
  aspect-ratio: unset;
  flex: 1;
  border-radius: 0;
  height: 100%;
}

/* ── Buttons ── */
.btn {
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 14px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-primary {
  background: var(--color-accent);
  color: #000;
}
.btn-ghost {
  background: var(--color-border);
  color: var(--color-text-primary);
}
.btn-active {
  background: var(--color-accent);
  color: #000;
}
.btn-admin-login {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 1.1rem;
  width: 32px;
  height: 32px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s, border-color 0.15s;
}
.btn-admin-login:hover {
  color: var(--color-text-primary);
  border-color: var(--color-text-muted);
}
</style>

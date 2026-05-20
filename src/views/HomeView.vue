<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue'
import type { Channel, ChannelFormData } from '@/types/channel'
import { useChannelsStore } from '@/stores/channels'
import { useAdminStore } from '@/stores/admin'
import { useLiveStatusStore } from '@/stores/liveStatus'
import ChannelGrid from '@/components/channels/ChannelGrid.vue'
import ChannelForm from '@/components/channels/ChannelForm.vue'
import PlayerModal from '@/components/player/PlayerModal.vue'
import MultiStreamView from '@/components/player/MultiStreamView.vue'
import AdminLogin from '@/components/admin/AdminLogin.vue'
import BaseModal from '@/components/ui/BaseModal.vue'

const channelsStore = useChannelsStore()
const adminStore = useAdminStore()
const liveStatusStore = useLiveStatusStore()

const activeChannel = ref<Channel | null>(null)
const editingChannel = ref<Channel | null>(null)
const showAddForm = ref(false)
const showAdminLogin = ref(false)
const formLoading = ref(false)

// Multi-stream
const multiMode = ref(false)
const pinnedChannels = ref<Channel[]>([])

function toggleMultiMode() {
  multiMode.value = !multiMode.value
  if (!multiMode.value) pinnedChannels.value = []
}

function removePinned(id: string) {
  pinnedChannels.value = pinnedChannels.value.filter((c) => c.id !== id)
}

// Push notifications
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

onMounted(() => {
  channelsStore.fetchChannels()
  liveStatusStore.fetchStatuses()
  liveInterval = setInterval(() => liveStatusStore.fetchStatuses(), 60_000)
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3000)
  }
})

onUnmounted(() => {
  if (liveInterval) clearInterval(liveInterval)
})

function handleSelect(ch: Channel) {
  if (multiMode.value) {
    if (!pinnedChannels.value.find((c) => c.id === ch.id)) {
      pinnedChannels.value = [...pinnedChannels.value, ch]
    }
    return
  }
  if (ch.streamType === 'web') {
    window.open(ch.url, '_blank', 'noopener,noreferrer')
  } else {
    activeChannel.value = ch
  }
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
          :class="{ 'btn-active': multiMode }"
          title="Multi-stream"
          @click="toggleMultiMode"
        >
          ⊞ Multi
        </button>
        <button v-if="adminStore.isAdmin" class="btn btn-primary" @click="showAddForm = true">
          + Añadir canal
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

    <!-- Channel grid / multi-stream split -->
    <main :class="multiMode ? 'main-multi' : 'main-content'">
      <ChannelGrid
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
        v-if="multiMode"
        :channels="pinnedChannels"
        @remove="removePinned"
        @close="toggleMultiMode"
      />
    </main>

    <!-- Player modal -->
    <PlayerModal
      v-if="activeChannel"
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

    <!-- Admin login modal -->
    <AdminLogin v-if="showAdminLogin" @close="showAdminLogin = false" />
  </div>
</template>


<style scoped>
.home {
  display: grid;
  grid-template-rows: var(--topbar-height) 1fr;
  min-height: 100vh;
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
}
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
  width: 280px;
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow-y: auto;
}
.main-multi > :last-child {
  flex: 1;
  min-width: 0;
}
.footer {
  padding: var(--space-sm) var(--space-lg);
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border);
}
.admin-trigger {
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.7rem;
  cursor: pointer;
  opacity: 0.4;
  transition: opacity 0.15s;
}
.admin-trigger:hover {
  opacity: 1;
}
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

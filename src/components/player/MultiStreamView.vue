<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channels: Channel[] }>()
const emit = defineEmits<{ remove: [id: string]; close: [] }>()

const cols = computed(() => {
  const n = props.channels.length
  if (n <= 2) return n || 1
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
}))

// Chat
const showChat = ref(false)
const activeChatId = ref<string | null>(null)

const twitchChannels = computed(() => props.channels.filter((c) => c.streamType === 'twitch'))

watch(
  twitchChannels,
  (channels) => {
    if (!channels.length) { showChat.value = false; return }
    if (!activeChatId.value || !channels.find((c) => c.id === activeChatId.value)) {
      activeChatId.value = channels[0]?.id ?? null
    }
  },
  { immediate: true }
)

const activeChatUrl = computed(() => {
  const ch = twitchChannels.value.find((c) => c.id === activeChatId.value)
  if (!ch) return ''
  const m = ch.url.match(/twitch\.tv\/([^/?#]+)/)
  const login = m?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})
</script>

<template>
  <div class="multistream-overlay">
    <div class="multistream-header">
      <span class="multistream-title">⊞ Multi-stream</span>
      <span class="multistream-hint">
        {{ channels.length ? `${channels.length} canal${channels.length > 1 ? 'es' : ''}` : 'Selecciona canales de la lista' }}
      </span>
      <button
        v-if="twitchChannels.length > 0"
        class="btn-chat"
        :class="{ active: showChat }"
        @click="showChat = !showChat"
      >
        💬 Chat
      </button>
      <button class="multistream-close" @click="emit('close')">✕ Salir</button>
    </div>

    <div class="multistream-body">
      <div class="multistream-grid" :style="gridStyle">
        <div v-for="ch in channels" :key="ch.id" class="stream-slot">
          <div class="slot-header">
            <span class="slot-name">{{ ch.name }}</span>
            <button class="slot-remove" @click="emit('remove', ch.id)">✕</button>
          </div>
          <VideoPlayer :channel="ch" />
        </div>
        <div v-if="channels.length === 0" class="stream-slot empty">
          <span>Haz click en un canal de la lista para añadirlo</span>
        </div>
      </div>

      <!-- Panel de chat -->
      <aside v-if="showChat && twitchChannels.length > 0" class="chat-sidebar">
        <div v-if="twitchChannels.length > 1" class="chat-selector">
          <button
            v-for="ch in twitchChannels"
            :key="ch.id"
            class="chat-channel-btn"
            :class="{ active: activeChatId === ch.id }"
            @click="activeChatId = ch.id"
          >
            {{ ch.name }}
          </button>
        </div>
        <iframe
          v-if="activeChatUrl"
          :key="activeChatUrl"
          :src="activeChatUrl"
          class="chat-frame"
          allow="autoplay"
          title="Twitch chat"
        />
      </aside>
    </div>
  </div>
</template>

<style scoped>
.multistream-overlay {
  background: var(--color-bg-base);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.multistream-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.multistream-title {
  font-weight: 700;
  color: var(--color-accent);
  font-size: 0.9rem;
}
.multistream-hint {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  flex: 1;
}
.btn-chat {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  padding: 4px 10px;
  transition: color 0.15s, border-color 0.15s;
}
.btn-chat:hover,
.btn-chat.active {
  border-color: #9146ff;
  color: #9146ff;
}
.multistream-close {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  padding: 4px 10px;
  transition: color 0.15s, border-color 0.15s;
}
.multistream-close:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
.multistream-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.multistream-grid {
  display: grid;
  flex: 1;
  gap: 2px;
  overflow: hidden;
  padding: 2px;
}
.stream-slot {
  background: #000;
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.stream-slot.empty {
  align-items: center;
  background: var(--color-bg-surface);
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  justify-content: center;
  grid-column: 1 / -1;
}
.slot-header {
  align-items: center;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  gap: var(--space-xs);
  justify-content: space-between;
  padding: 4px 8px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
}
.slot-name {
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 0.75rem;
  flex-shrink: 0;
  padding: 0 2px;
  transition: color 0.15s;
}
.slot-remove:hover { color: #ff4444; }
/* Chat sidebar */
.chat-sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}
.chat-selector {
  display: flex;
  gap: 4px;
  padding: var(--space-xs);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.chat-channel-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.65rem;
  font-weight: 600;
  padding: 2px 8px;
  transition: all 0.15s;
}
.chat-channel-btn.active {
  background: #9146ff;
  border-color: #9146ff;
  color: #fff;
}
.chat-frame {
  border: none;
  flex: 1;
  width: 100%;
}
:deep(.player-wrap) {
  border-radius: 0;
  height: 100%;
  flex: 1;
}
</style>

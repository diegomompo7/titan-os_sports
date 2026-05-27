<script setup lang="ts">
/**
 * MultiStreamView — Vista multi-stream para Titan OS (1366×768).
 *
 * Adaptado para TV: sin media queries responsive, botones grandes,
 * foco visual prominente para navegación con mando.
 *
 * Modos:
 *   - Grid: todos los streams en grid de igual tamaño
 *   - Pro:  stream principal grande + columna de secundarios
 */
import { computed, ref, watch } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channels: Channel[] }>()
const emit  = defineEmits<{ remove: [id: string]; close: [] }>()

// ── Modo ─────────────────────────────────────────────────────────────────────
const isProMode = ref(false)

// ── MODO GRID: columnas según cantidad ───────────────────────────────────────
const gridColumns = computed(() => {
  const count = props.channels.length
  if (count <= 1) return 1
  if (count <= 4) return 2
  return count <= 9 ? 3 : 4
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${gridColumns.value}, 1fr)`,
}))

// ── Chat de Twitch ────────────────────────────────────────────────────────────
const showChat     = ref(false)
const activeChatId = ref<string | null>(null)

const twitchChannels = computed(() =>
  props.channels.filter((c) => c.streamType === 'twitch')
)

watch(twitchChannels, (channels) => {
  if (!channels.length) { showChat.value = false; return }
  if (!activeChatId.value || !channels.find((c) => c.id === activeChatId.value)) {
    activeChatId.value = channels[0]?.id ?? null
  }
}, { immediate: true })

const activeChatUrl = computed(() => {
  const channel = twitchChannels.value.find((c) => c.id === activeChatId.value)
  if (!channel) return ''
  const loginMatch = channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = loginMatch?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})

// ── MODO PRO: orden local ────────────────────────────────────────────────────
const localOrder = ref<number[]>([])

watch(() => props.channels, (channels) => {
  const existing = localOrder.value.filter((i) => i < channels.length)
  const newIdx   = channels.map((_, i) => i).filter((i) => !existing.includes(i))
  localOrder.value = [...existing, ...newIdx]
}, { immediate: true })

const orderedChannels   = computed(() =>
  localOrder.value.map((i) => props.channels[i]).filter((c): c is Channel => !!c)
)
const mainChannel       = computed(() => orderedChannels.value[0] ?? null)
const secondaryChannels = computed(() => orderedChannels.value.slice(1, 5))

function swapWithMain(secondaryIndex: number) {
  const newOrder = [...localOrder.value]
  const slot     = secondaryIndex + 1
  const temp     = newOrder[0]!
  newOrder[0]    = newOrder[slot]!
  newOrder[slot] = temp
  localOrder.value = newOrder
}
</script>

<template>
  <div class="multistream">

    <!-- ── Cabecera ── -->
    <div class="ms-header">
      <span class="ms-title">⊞ Multi-stream</span>
      <span class="ms-count">
        {{ channels.length ? `${channels.length} canal${channels.length > 1 ? 'es' : ''}` : 'Selecciona canales de la lista' }}
      </span>

      <button
        class="ms-btn"
        :class="{ 'ms-btn--active': isProMode }"
        @click="isProMode = !isProMode"
      >{{ isProMode ? '⊞ Grid' : '▣ Pro' }}</button>

      <button
        v-if="!isProMode && twitchChannels.length > 0"
        class="ms-btn ms-btn--twitch"
        :class="{ 'ms-btn--active-twitch': showChat }"
        @click="showChat = !showChat"
      >💬 Chat</button>

      <button class="ms-btn ms-btn--exit" @click="emit('close')">✕ Salir</button>
    </div>

    <!-- ── MODO GRID ── -->
    <div v-if="!isProMode" class="ms-body">
      <div class="streams-grid" :style="gridStyle">

        <!-- Placeholder vacío -->
        <div v-if="channels.length === 0" class="slot slot--empty">
          <span>Selecciona canales de la lista para añadirlos</span>
        </div>

        <!-- Stream slots -->
        <div v-for="channel in channels" :key="channel.id" class="slot">
          <div class="slot-bar">
            <span class="slot-name">{{ channel.name }}</span>
            <button class="slot-close" @click="emit('remove', channel.id)">✕</button>
          </div>
          <VideoPlayer :channel="channel" />
        </div>
      </div>

      <!-- Chat de Twitch -->
      <aside v-if="showChat && twitchChannels.length > 0" class="chat-panel">
        <div v-if="twitchChannels.length > 1" class="chat-selector">
          <button
            v-for="ch in twitchChannels"
            :key="ch.id"
            class="chat-sel-btn"
            :class="{ 'chat-sel-btn--active': activeChatId === ch.id }"
            @click="activeChatId = ch.id"
          >{{ ch.name }}</button>
        </div>
        <iframe
          v-if="activeChatUrl"
          :key="activeChatUrl"
          :src="activeChatUrl"
          class="chat-iframe"
          allow="autoplay"
          title="Chat de Twitch"
        />
      </aside>
    </div>

    <!-- ── MODO PRO ── -->
    <div v-else class="pro-layout">
      <div class="pro-main">
        <VideoPlayer v-if="mainChannel" :channel="mainChannel" />
        <div v-else class="pro-empty">
          <span class="pro-empty-icon">▣</span>
          <p>Selecciona un canal principal</p>
        </div>
        <div v-if="mainChannel" class="pro-bar">
          <span>{{ mainChannel.name }}</span>
          <button class="pro-close" @click="emit('remove', mainChannel.id)">✕</button>
        </div>
      </div>

      <div v-if="secondaryChannels.length > 0" class="pro-secondary">
        <div v-for="(channel, index) in secondaryChannels" :key="channel.id" class="pro-slot">
          <VideoPlayer :channel="channel" />
          <div class="pro-slot-overlay">
            <span class="pro-slot-name">{{ channel.name }}</span>
            <div class="pro-slot-actions">
              <button class="pro-slot-btn pro-slot-btn--promote" title="Hacer principal" @click="swapWithMain(index)">⊞</button>
              <button class="pro-slot-btn pro-slot-btn--remove" title="Eliminar" @click="emit('remove', channel.id)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Contenedor ── */
.multistream {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-base);
  overflow: hidden;
}

/* ── Header ── */
.ms-header {
  height: 48px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}
.ms-title {
  font-weight: 700;
  font-size: 0.92rem;
  color: var(--color-accent);
  flex-shrink: 0;
}
.ms-count {
  color: var(--color-text-muted);
  font-size: 0.78rem;
  flex: 1;
}

.ms-btn {
  height: 34px;
  padding: 0 var(--space-3);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
  outline: none;
  white-space: nowrap;
}
.ms-btn:hover,
.ms-btn:focus-visible { background: var(--color-bg-elevated); border-color: var(--color-accent); box-shadow: var(--focus-ring); }
.ms-btn--active       { background: var(--color-accent); border-color: var(--color-accent); color: #000; }
.ms-btn--twitch       { color: #9146ff; border-color: rgba(145,70,255,0.4); }
.ms-btn--active-twitch{ background: rgba(145,70,255,0.2); border-color: #9146ff; color: #c8a7ff; }
.ms-btn--exit:hover   { border-color: var(--color-danger); color: var(--color-danger); background: none; }

/* ── Cuerpo (modo grid) ── */
.ms-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.streams-grid {
  display: grid;
  flex: 1;
  gap: 3px;
  padding: 3px;
  overflow: hidden;
  background: #000;
}

.slot {
  background: #000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.slot--empty {
  align-items: center;
  justify-content: center;
  background: var(--color-bg-surface);
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.9rem;
  grid-column: 1 / -1;
  padding: var(--space-8);
  text-align: center;
}

.slot-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 10px;
  background: rgba(0,0,0,0.7);
  z-index: 2;
}
.slot-name {
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 2px 6px;
  flex-shrink: 0;
  transition: color 0.15s;
  border-radius: var(--radius-sm);
}
.slot-close:hover { color: var(--color-live); background: rgba(255,68,68,0.15); }

/* Chat panel */
.chat-panel {
  width: 300px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}
.chat-selector {
  display: flex;
  gap: 4px;
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.chat-sel-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 3px 10px;
  transition: all 0.15s;
}
.chat-sel-btn--active { background: #9146ff; border-color: #9146ff; color: #fff; }
.chat-iframe { border: none; flex: 1; width: 100%; }

/* ── Modo Pro ── */
.pro-layout {
  flex: 1;
  display: flex;
  gap: 3px;
  background: #000;
  padding: 3px;
  overflow: hidden;
}

.pro-main {
  flex: 1;
  min-width: 0;
  background: #000;
  position: relative;
  display: flex;
  flex-direction: column;
}
.pro-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 14px;
  background: rgba(0,0,0,0.65);
  color: #fff;
  font-size: 0.88rem;
  font-weight: 600;
}
.pro-close {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-size: 0.9rem;
  transition: color 0.15s;
}
.pro-close:hover { color: var(--color-live); }

.pro-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
.pro-empty-icon { font-size: 3rem; opacity: 0.2; }

.pro-secondary {
  width: 260px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pro-slot {
  flex: 1;
  min-height: 0;
  background: #000;
  position: relative;
  overflow: hidden;
}
.pro-slot-overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgba(0,0,0,0.7);
  gap: var(--space-2);
}
.pro-slot-name {
  flex: 1;
  min-width: 0;
  font-size: 0.72rem;
  font-weight: 700;
  color: rgba(255,255,255,0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pro-slot-actions { display: flex; gap: 3px; flex-shrink: 0; }
.pro-slot-btn {
  background: rgba(255,255,255,0.12);
  border: none;
  border-radius: 3px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 0.72rem;
  padding: 3px 7px;
  transition: all 0.15s;
}
.pro-slot-btn--promote:hover { background: var(--color-accent); color: #000; }
.pro-slot-btn--remove:hover  { background: var(--color-live); color: #fff; }

/* Reproductores llenan su contenedor */
:deep(.player-wrap) {
  border-radius: 0;
  height: 100%;
  aspect-ratio: unset;
  flex: 1;
}
</style>

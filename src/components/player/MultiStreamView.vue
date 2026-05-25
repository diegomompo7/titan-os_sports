<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channels: Channel[] }>()
const emit = defineEmits<{ remove: [id: string]; close: [] }>()

// ── Modo toggle ──────────────────────────────────────────────────────────────
const proMode = ref(false)

// ── MODO GRID (actual) ───────────────────────────────────────────────────────
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

// Chat (modo grid)
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

// ── MODO PRO ─────────────────────────────────────────────────────────────────
// Orden local de canales (permite swap sin mutar props)
const localOrder = ref<number[]>([])

watch(
  () => props.channels,
  (chs) => {
    // Mantener orden existente + añadir nuevos al final
    const existing = localOrder.value.filter((i) => i < chs.length)
    const added = chs.map((_, i) => i).filter((i) => !existing.includes(i))
    localOrder.value = [...existing, ...added]
  },
  { immediate: true }
)

// Número máximo de slots secundarios según altura disponible
const maxSecondary = computed(() => {
  const TOPBAR = 48   // altura topbar aprox
  const HEADER = 40   // header de multistream
  const BANNER = 56   // banner publicitario
  const SLOT_H = 137  // 240px ancho → 135px alto 16:9 + 2px gap
  const available = (typeof window !== 'undefined' ? window.innerHeight : 800)
    - TOPBAR - HEADER - BANNER
  return Math.min(Math.max(1, Math.floor(available / SLOT_H)), 4)
})

const orderedChannels = computed(() =>
  localOrder.value.map((i) => props.channels[i]).filter((c): c is Channel => !!c)
)
const mainChannel = computed(() => orderedChannels.value[0] ?? null)
const secondaryChannels = computed(() =>
  orderedChannels.value.slice(1, maxSecondary.value + 1)
)

function swapWithMain(secondaryIndex: number) {
  const slotIndex = secondaryIndex + 1
  const newOrder = [...localOrder.value]
  const tmp = newOrder[0]!
  newOrder[0] = newOrder[slotIndex]!
  newOrder[slotIndex] = tmp
  localOrder.value = newOrder
}
</script>

<template>
  <div class="multistream-overlay">
    <!-- Header compartido -->
    <div class="multistream-header">
      <span class="multistream-title">⊞ Multi-stream</span>
      <span class="multistream-hint">
        {{ channels.length ? `${channels.length} canal${channels.length > 1 ? 'es' : ''}` : 'Selecciona canales de la lista' }}
      </span>

      <!-- Toggle Grid / Pro -->
      <button
        class="btn-mode"
        :class="{ active: proMode }"
        :title="proMode ? 'Cambiar a modo grid' : 'Cambiar a modo Pro (pantalla principal)'"
        @click="proMode = !proMode"
      >
        {{ proMode ? '⊞ Grid' : '▣ Pro' }}
      </button>

      <button
        v-if="!proMode && twitchChannels.length > 0"
        class="btn-chat"
        :class="{ active: showChat }"
        @click="showChat = !showChat"
      >
        💬 Chat
      </button>
      <button class="multistream-close" @click="emit('close')">✕ Salir</button>
    </div>

    <!-- ── MODO GRID ─────────────────────────────────────────────────── -->
    <div v-if="!proMode" class="multistream-body">
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

    <!-- ── MODO PRO ──────────────────────────────────────────────────── -->
    <div v-else class="pro-wrap">
      <div class="pro-players">
        <!-- Pantalla principal -->
        <div class="pro-main">
          <VideoPlayer v-if="mainChannel" :channel="mainChannel" />
          <div v-else class="pro-empty">
            <span class="pro-empty-icon">▣</span>
            <p>Selecciona un canal de la lista</p>
          </div>
          <!-- Nombre del canal principal -->
          <div v-if="mainChannel" class="pro-main-label">
            <span>{{ mainChannel.name }}</span>
            <button class="pro-remove-main" title="Eliminar" @click="emit('remove', mainChannel.id)">✕</button>
          </div>
        </div>

        <!-- Columna secundaria -->
        <div v-if="secondaryChannels.length > 0" class="pro-secondary-col">
          <div
            v-for="(ch, i) in secondaryChannels"
            :key="ch.id"
            class="pro-secondary-slot"
          >
            <VideoPlayer :channel="ch" />
            <div class="pro-slot-overlay">
              <span class="pro-slot-name">{{ ch.name }}</span>
              <div class="pro-slot-actions">
                <button
                  class="pro-btn-main"
                  title="Poner como pantalla principal"
                  @click="swapWithMain(i)"
                >⊞</button>
                <button
                  class="pro-btn-remove"
                  title="Eliminar"
                  @click="emit('remove', ch.id)"
                >✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Banner publicitario -->
      <div class="pro-banner">
        <a
          href="https://example.com"
          target="_blank"
          rel="noopener noreferrer"
          class="pro-banner-link"
        >
          <img
            src="https://placehold.co/728x56/1a1a2e/e0c060?text=TU+ANUNCIO+AQUÍ"
            alt="Publicidad"
            class="pro-banner-img"
          />
        </a>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Estructura base ── */
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

/* Toggle modo */
.btn-mode {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 4px 10px;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.btn-mode:hover,
.btn-mode.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
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

/* ── MODO GRID ── */
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

/* ── MODO PRO ── */
.pro-wrap {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.pro-players {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 2px;
}

/* Pantalla principal */
.pro-main {
  flex: 1;
  min-width: 0;
  background: #000;
  position: relative;
  display: flex;
  flex-direction: column;
}
.pro-main-label {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.55);
  font-size: 0.8rem;
  font-weight: 600;
  color: #fff;
  z-index: 1;
}
.pro-remove-main {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0 2px;
  transition: color 0.15s;
  flex-shrink: 0;
}
.pro-remove-main:hover { color: #ff4444; }

.pro-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 12px;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
.pro-empty-icon {
  font-size: 3rem;
  opacity: 0.2;
}
.pro-empty p { margin: 0; }

/* Columna secundaria */
.pro-secondary-col {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.pro-secondary-slot {
  flex: 1;
  min-height: 0;
  background: #000;
  position: relative;
  overflow: hidden;
}

/* Overlay siempre visible en slots secundarios */
.pro-slot-overlay {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: rgba(0, 0, 0, 0.70);
  padding: 3px 6px;
  z-index: 1;
  gap: 4px;
}
.pro-slot-name {
  font-size: 0.65rem;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.pro-slot-actions {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}
.pro-btn-main,
.pro-btn-remove {
  background: rgba(255,255,255,0.1);
  border: none;
  border-radius: 3px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 2px 5px;
  transition: background 0.15s, color 0.15s;
  line-height: 1.4;
}
.pro-btn-main:hover {
  background: var(--color-accent);
  color: #000;
}
.pro-btn-remove:hover {
  background: #ff4444;
  color: #fff;
}

/* Banner publicitario */
.pro-banner {
  height: 56px;
  flex-shrink: 0;
  background: #bfdbfe;
  border-top: 1px solid var(--color-border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}
.pro-banner-link {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  width: 100%;
}
.pro-banner-img {
  max-height: 56px;
  max-width: 100%;
  object-fit: contain;
  display: block;
}

/* Override player para llenar slots */
:deep(.player-wrap) {
  border-radius: 0;
  height: 100%;
  flex: 1;
}
</style>

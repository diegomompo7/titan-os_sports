<script setup lang="ts">
/**
 * MultiStreamView — Vista multi-stream para Titan OS.
 * 100% relativa: vw · vh · rem.
 * Modo Grid: todos los streams a igual tamaño.
 * Modo Pro: stream principal grande + columna secundaria.
 */
import { computed, ref, watch } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channels: Channel[] }>()
const emit  = defineEmits<{ remove: [id: string]; close: [] }>()

// ── Modo ─────────────────────────────────────────────────────────────────────
const isProMode = ref(false)

// ── Grid: columnas según cantidad ────────────────────────────────────────────
const gridColumns = computed(() => {
  const n = props.channels.length
  if (n <= 1) return 1
  if (n <= 4) return 2
  return n <= 9 ? 3 : 4
})
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${gridColumns.value}, 1fr)`,
}))

// ── Chat Twitch ───────────────────────────────────────────────────────────────
const showChat     = ref(false)
const activeChatId = ref<string | null>(null)

const twitchChannels = computed(() =>
  props.channels.filter((c) => c.streamType === 'twitch')
)

watch(twitchChannels, (chs) => {
  if (!chs.length) { showChat.value = false; return }
  if (!activeChatId.value || !chs.find((c) => c.id === activeChatId.value)) {
    activeChatId.value = chs[0]?.id ?? null
  }
}, { immediate: true })

const activeChatUrl = computed(() => {
  const ch = twitchChannels.value.find((c) => c.id === activeChatId.value)
  if (!ch) return ''
  const m = ch.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = m?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})

// ── Modo Pro: orden local ─────────────────────────────────────────────────────
const localOrder = ref<number[]>([])
watch(() => props.channels, (chs) => {
  const existing = localOrder.value.filter((i) => i < chs.length)
  const newIdx   = chs.map((_, i) => i).filter((i) => !existing.includes(i))
  localOrder.value = [...existing, ...newIdx]
}, { immediate: true })

const orderedChannels   = computed(() =>
  localOrder.value.map((i) => props.channels[i]).filter((c): c is Channel => !!c)
)
const mainChannel       = computed(() => orderedChannels.value[0] ?? null)
const secondaryChannels = computed(() => orderedChannels.value.slice(1, 5))

function swapWithMain(secIndex: number) {
  const o = [...localOrder.value]
  const slot = secIndex + 1;
  [o[0], o[slot]] = [o[slot]!, o[0]!]
  localOrder.value = o
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
        :class="{ 'ms-btn--twitch-active': showChat }"
        @click="showChat = !showChat"
      >💬 Chat</button>

      <button class="ms-btn ms-btn--exit" @click="emit('close')">✕ Salir</button>
    </div>

    <!-- ══ MODO GRID ══ -->
    <div v-if="!isProMode" class="ms-body">
      <div class="streams-grid" :style="gridStyle">

        <div v-if="channels.length === 0" class="slot slot--empty">
          <span>Selecciona canales de la lista para añadirlos</span>
        </div>

        <div v-for="ch in channels" :key="ch.id" class="slot">
          <div class="slot-bar">
            <span class="slot-name">{{ ch.name }}</span>
            <button class="slot-close" @click="emit('remove', ch.id)">✕</button>
          </div>
          <VideoPlayer :channel="ch" />
        </div>
      </div>

      <!-- Chat Twitch -->
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

    <!-- ══ MODO PRO ══ -->
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
        <div v-for="(ch, i) in secondaryChannels" :key="ch.id" class="pro-slot">
          <VideoPlayer :channel="ch" />
          <div class="pro-overlay">
            <span class="pro-slot-name">{{ ch.name }}</span>
            <div class="pro-slot-btns">
              <button class="pro-btn pro-btn--promote" title="Hacer principal" @click="swapWithMain(i)">⊞</button>
              <button class="pro-btn pro-btn--remove"  title="Eliminar"        @click="emit('remove', ch.id)">✕</button>
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

/* ── Cabecera ── */
.ms-header {
  height: 6.5vh;
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
  font-size: 0.95rem;
  color: var(--color-accent);
  flex-shrink: 0;
}
.ms-count {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  flex: 1;
}

.ms-btn {
  height: 4.8vh;
  padding: 0 var(--space-3);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  outline: none;
}
.ms-btn:hover,
.ms-btn:focus-visible  { background: var(--color-bg-elevated); border-color: var(--color-accent); box-shadow: var(--focus-ring); }
.ms-btn--active        { background: var(--color-accent); border-color: var(--color-accent); color: #000; }
.ms-btn--twitch        { color: #9146ff; border-color: rgba(145, 70, 255, 0.4); }
.ms-btn--twitch-active { background: rgba(145, 70, 255, 0.2); border-color: #9146ff; color: #c8a7ff; }
.ms-btn--exit:hover    { border-color: var(--color-danger); color: var(--color-danger); }

/* ── MODO GRID ── */
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
  padding: 0.3rem 0.65rem;
  background: rgba(0, 0, 0, 0.72);
  z-index: 2;
}
.slot-name {
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0.15rem 0.4rem;
  flex-shrink: 0;
  transition: color 0.15s;
  border-radius: var(--radius-sm);
}
.slot-close:hover { color: var(--color-live); background: rgba(255, 68, 68, 0.15); }

/* Chat */
.chat-panel {
  width: 22vw;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}
.chat-selector {
  display: flex;
  gap: 0.3rem;
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
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.7rem;
  transition: all 0.15s;
}
.chat-sel-btn--active { background: #9146ff; border-color: #9146ff; color: #fff; }
.chat-iframe { border: none; flex: 1; width: 100%; }

/* ── MODO PRO ── */
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
  padding: 0.4rem 1rem;
  background: rgba(0, 0, 0, 0.68);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
}
.pro-close {
  background: none; border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer; font-size: 0.9rem;
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
.pro-empty-icon { font-size: 3rem; opacity: 0.18; }

.pro-secondary {
  width: 20vw;
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
.pro-overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  background: rgba(0, 0, 0, 0.72);
  gap: var(--space-2);
}
.pro-slot-name {
  flex: 1;
  min-width: 0;
  font-size: 0.7rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pro-slot-btns { display: flex; gap: 0.2rem; flex-shrink: 0; }
.pro-btn {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.2rem 0.45rem;
  transition: all 0.15s;
}
.pro-btn--promote:hover { background: var(--color-accent); color: #000; }
.pro-btn--remove:hover  { background: var(--color-live); color: #fff; }

/* Reproductores llenan su contenedor */
:deep(.player-wrap) {
  border-radius: 0;
  height: 100%;
  aspect-ratio: unset;
  flex: 1;
}
</style>

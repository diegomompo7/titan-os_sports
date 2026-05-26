<script setup lang="ts">
/**
 * MultiStreamView — Vista de múltiples streams simultáneos.
 *
 * Modos:
 *  - Grid: todos los streams en un grid de igual tamaño (1-4 columnas)
 *  - Pro:  un stream principal grande + columna de streams secundarios
 *
 * El chat de Twitch es opcional y aparece como sidebar en el modo Grid.
 * En móvil el modo Pro no muestra la columna secundaria como sidebar,
 * sino que los streams secundarios quedan accesibles desde el grid.
 */
import { computed, ref, watch } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channels: Channel[] }>()
const emit  = defineEmits<{ remove: [id: string]; close: [] }>()

// ── Modo de visualización ────────────────────────────────────────────────────
const isProMode = ref(false)

// ── MODO GRID: calcula columnas según cantidad de streams ────────────────────
const gridColumns = computed(() => {
  const count = props.channels.length
  if (count <= 1) return 1
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${gridColumns.value}, 1fr)`,
}))

// ── MODO GRID: chat de Twitch ────────────────────────────────────────────────
const showChat      = ref(false)
const activeChatId  = ref<string | null>(null)

// Solo canales de Twitch pueden tener chat
const twitchChannels = computed(() =>
  props.channels.filter((c) => c.streamType === 'twitch')
)

// Seleccionar el primer canal Twitch si el activo deja de existir
watch(twitchChannels, (channels) => {
  if (!channels.length) { showChat.value = false; return }
  if (!activeChatId.value || !channels.find((c) => c.id === activeChatId.value)) {
    activeChatId.value = channels[0]?.id ?? null
  }
}, { immediate: true })

/** URL del chat de Twitch para el canal seleccionado */
const activeChatUrl = computed(() => {
  const channel = twitchChannels.value.find((c) => c.id === activeChatId.value)
  if (!channel) return ''
  const loginMatch = channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = loginMatch?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})

// ── MODO PRO: orden local de canales (permite intercambiar sin mutar props) ──
const localOrder = ref<number[]>([])

// Sincronizar el orden local cuando cambian los canales
watch(() => props.channels, (channels) => {
  const existingIndices = localOrder.value.filter((i) => i < channels.length)
  const newIndices      = channels.map((_, i) => i).filter((i) => !existingIndices.includes(i))
  localOrder.value = [...existingIndices, ...newIndices]
}, { immediate: true })

/** Canales en el orden del usuario */
const orderedChannels = computed(() =>
  localOrder.value
    .map((i) => props.channels[i])
    .filter((c): c is Channel => !!c)
)

const mainChannel       = computed(() => orderedChannels.value[0] ?? null)
const secondaryChannels = computed(() => orderedChannels.value.slice(1, 5))  // Máximo 4 secundarios

/** Pone un stream secundario como el principal (intercambia posiciones) */
function swapWithMain(secondaryIndex: number) {
  const newOrder = [...localOrder.value]
  const slotIndex = secondaryIndex + 1  // +1 porque el índice 0 es el principal
  const temp       = newOrder[0]!
  newOrder[0]      = newOrder[slotIndex]!
  newOrder[slotIndex] = temp
  localOrder.value = newOrder
}
</script>

<template>
  <div class="multistream">

    <!-- ── Cabecera con controles ── -->
    <div class="multistream-header">
      <span class="header-title">⊞ Multi-stream</span>
      <span class="header-count">
        {{ channels.length ? `${channels.length} canal${channels.length > 1 ? 'es' : ''}` : 'Selecciona canales de la lista' }}
      </span>

      <!-- Toggle Grid / Pro (solo en escritorio — en móvil siempre grid) -->
      <button
        class="header-btn"
        :class="{ 'header-btn--active': isProMode }"
        :title="isProMode ? 'Cambiar a modo grid' : 'Cambiar a modo Pro'"
        @click="isProMode = !isProMode"
      >
        {{ isProMode ? '⊞ Grid' : '▣ Pro' }}
      </button>

      <!-- Chat de Twitch (solo en modo grid y si hay canales Twitch) -->
      <button
        v-if="!isProMode && twitchChannels.length > 0"
        class="header-btn"
        :class="{ 'header-btn--chat': showChat }"
        @click="showChat = !showChat"
      >💬 Chat</button>

      <!-- Botón de salida del modo multi-stream -->
      <button class="header-btn header-btn--exit" @click="emit('close')">✕ Salir</button>
    </div>

    <!-- ── MODO GRID ── -->
    <div v-if="!isProMode" class="multistream-body">

      <div class="streams-grid" :style="gridStyle">
        <!-- Stream vacío placeholder -->
        <div v-if="channels.length === 0" class="stream-slot stream-slot--empty">
          <span>Haz clic en un canal de la lista para añadirlo</span>
        </div>

        <!-- Tarjeta de cada stream -->
        <div v-for="channel in channels" :key="channel.id" class="stream-slot">
          <!-- Nombre del canal sobre el vídeo -->
          <div class="slot-header">
            <span class="slot-name">{{ channel.name }}</span>
            <button class="slot-remove-btn" @click="emit('remove', channel.id)">✕</button>
          </div>
          <VideoPlayer :channel="channel" />
        </div>
      </div>

      <!-- Chat de Twitch (sidebar) -->
      <aside v-if="showChat && twitchChannels.length > 0" class="chat-sidebar">
        <!-- Selector de canal para el chat (si hay varios Twitch) -->
        <div v-if="twitchChannels.length > 1" class="chat-channel-selector">
          <button
            v-for="channel in twitchChannels"
            :key="channel.id"
            class="chat-channel-btn"
            :class="{ 'chat-channel-btn--active': activeChatId === channel.id }"
            @click="activeChatId = channel.id"
          >{{ channel.name }}</button>
        </div>

        <iframe
          v-if="activeChatUrl"
          :key="activeChatUrl"
          :src="activeChatUrl"
          class="chat-frame"
          allow="autoplay"
          title="Chat de Twitch"
        />
      </aside>
    </div>

    <!-- ── MODO PRO ── -->
    <div v-else class="pro-layout">

      <div class="pro-players">

        <!-- Stream principal (grande) -->
        <div class="pro-main">
          <VideoPlayer v-if="mainChannel" :channel="mainChannel" />
          <div v-else class="pro-empty">
            <span class="pro-empty-icon">▣</span>
            <p>Selecciona un canal de la lista</p>
          </div>
          <!-- Label del canal principal con botón de cierre -->
          <div v-if="mainChannel" class="pro-main-label">
            <span>{{ mainChannel.name }}</span>
            <button class="pro-label-btn" @click="emit('remove', mainChannel.id)">✕</button>
          </div>
        </div>

        <!-- Columna de streams secundarios -->
        <div v-if="secondaryChannels.length > 0" class="pro-secondary-column">
          <div
            v-for="(channel, index) in secondaryChannels"
            :key="channel.id"
            class="pro-secondary-slot"
          >
            <VideoPlayer :channel="channel" />
            <!-- Overlay con nombre y acciones -->
            <div class="pro-slot-overlay">
              <span class="pro-slot-name">{{ channel.name }}</span>
              <div class="pro-slot-actions">
                <button
                  class="pro-slot-btn pro-slot-btn--promote"
                  title="Hacer pantalla principal"
                  @click="swapWithMain(index)"
                >⊞</button>
                <button
                  class="pro-slot-btn pro-slot-btn--remove"
                  title="Eliminar stream"
                  @click="emit('remove', channel.id)"
                >✕</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Contenedor principal ── */
.multistream {
  background: var(--color-bg-base);
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* ── Cabecera ── */
.multistream-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-4);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
  flex-wrap: wrap;                /* Se adapta en pantallas pequeñas */
}
.header-title {
  font-weight: 700;
  font-size: 0.9rem;
  color: var(--color-accent);
}
.header-count {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  flex: 1;
}

/* Botones de la cabecera */
.header-btn {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  padding: 6px 12px;
  min-height: 36px;
  transition: all 0.15s;
}
.header-btn:hover,
.header-btn--active  { background: var(--color-accent); border-color: var(--color-accent); color: #000; }
.header-btn--chat    { border-color: rgba(145,70,255,0.4); color: #9146ff; }
.header-btn--chat:hover { background: #9146ff; border-color: #9146ff; color: #fff; }
.header-btn--exit:hover { border-color: var(--color-danger); color: var(--color-danger); background: none; }

/* ── MODO GRID ── */
.multistream-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}
.streams-grid {
  display: grid;
  flex: 1;
  gap: 2px;
  padding: 2px;
  overflow: hidden;
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
.stream-slot--empty {
  align-items: center;
  background: var(--color-bg-surface);
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.85rem;
  justify-content: center;
  grid-column: 1 / -1;
  padding: var(--space-8);
  text-align: center;
}

/* Cabecera de cada slot (nombre + botón cerrar) */
.slot-header {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  background: rgba(0, 0, 0, 0.65);
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
.slot-remove-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  font-size: 0.8rem;
  padding: 0 4px;
  flex-shrink: 0;
  transition: color 0.15s;
}
.slot-remove-btn:hover { color: #ff4444; }

/* Chat sidebar */
.chat-sidebar {
  width: 280px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}
.chat-channel-selector {
  display: flex;
  gap: 4px;
  padding: var(--space-2);
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
  font-size: 0.7rem;
  font-weight: 600;
  padding: 3px 10px;
  transition: all 0.15s;
}
.chat-channel-btn--active { background: #9146ff; border-color: #9146ff; color: #fff; }
.chat-frame { border: none; flex: 1; width: 100%; }

/* Ocultar el chat sidebar en móvil (no hay espacio) */
@media (max-width: 640px) {
  .chat-sidebar { display: none; }
}

/* ── MODO PRO ── */
.pro-layout {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
}
.pro-players {
  display: flex;
  flex: 1;
  gap: 2px;
  min-height: 0;
}
.pro-main {
  flex: 1;
  min-width: 0;
  background: #000;
  position: relative;
}
.pro-main-label {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: rgba(0,0,0,0.6);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
}
.pro-label-btn {
  background: none;
  border: none;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  font-size: 0.8rem;
  transition: color 0.15s;
}
.pro-label-btn:hover { color: #ff4444; }

.pro-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
.pro-empty-icon { font-size: 3rem; opacity: 0.2; }

/* Columna secundaria */
.pro-secondary-column {
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
  font-size: 0.7rem;
  font-weight: 600;
  color: rgba(255,255,255,0.85);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pro-slot-actions { display: flex; gap: 4px; flex-shrink: 0; }
.pro-slot-btn {
  background: rgba(255,255,255,0.12);
  border: none;
  border-radius: 3px;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 3px 6px;
  transition: all 0.15s;
}
.pro-slot-btn--promote:hover { background: var(--color-accent); color: #000; }
.pro-slot-btn--remove:hover  { background: #ff4444; color: #fff; }

/* Ocultar la columna secundaria en móvil */
@media (max-width: 640px) {
  .pro-secondary-column { display: none; }
}

/* El reproductor debe llenar el slot completamente */
:deep(.player-wrap) {
  border-radius: 0;
  height: 100%;
  aspect-ratio: unset;
  flex: 1;
}
</style>

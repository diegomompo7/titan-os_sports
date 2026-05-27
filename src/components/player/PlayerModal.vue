<script setup lang="ts">
/**
 * PlayerModal — Reproductor en pantalla completa para Titan OS (1366×768).
 *
 * Ocupa la resolución completa de la TV (1366×768).
 * Layout:
 *   - Player HLS/YouTube: ocupa ~72% del ancho (980px)
 *   - Panel lateral derecho (386px): nombre del canal, próximo evento, chat Twitch opcional
 *   - Barra superior con nombre del canal y botón Cerrar
 *
 * Navegación:
 *   - Back / Escape: cierra el modal
 *   - M: mute/unmute
 *   - F: pantalla completa del reproductor
 */
import { ref, computed } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'
import { useEventsStore } from '@/stores/events'

const props = defineProps<{ channel: Channel }>()
const emit  = defineEmits<{ close: [] }>()

const eventsStore = useEventsStore()
const showChat    = ref(false)

const isTwitch = computed(() => props.channel.streamType === 'twitch')
const nextEvent = computed(() => eventsStore.getNextEvent(props.channel.id))

/** URL del chat embebido de Twitch */
const twitchChatUrl = computed(() => {
  const loginMatch = props.channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = loginMatch?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})

/** Etiqueta del tipo de stream */
const streamTypeLabel = computed(() => {
  const labels: Record<string, string> = {
    hls: 'HLS', twitch: 'Twitch', youtube: 'YouTube', web: 'Web',
  }
  return labels[props.channel.streamType] ?? props.channel.streamType
})

/** Color del badge de tipo */
const streamTypeBadgeStyle = computed(() => {
  const colors: Record<string, string> = {
    twitch:  '#9146ff',
    youtube: '#ff4444',
    hls:     '#00bfff',
  }
  return { color: colors[props.channel.streamType] ?? '#7b8496' }
})
</script>

<template>
  <!-- Overlay de pantalla completa — cubre exactamente 1366×768 -->
  <div class="tv-player-overlay" @keydown.esc="emit('close')" @keydown.backspace="emit('close')">

    <!-- ── Barra superior ── -->
    <div class="player-topbar">
      <div class="player-topbar-left">
        <span class="player-channel-name">{{ channel.name }}</span>
        <span class="player-type-badge" :style="streamTypeBadgeStyle">{{ streamTypeLabel }}</span>
      </div>
      <div class="player-topbar-right">
        <!-- Toggle chat Twitch -->
        <button
          v-if="isTwitch"
          class="ctrl-btn"
          :class="{ 'ctrl-btn--active': showChat }"
          @click="showChat = !showChat"
        >💬 Chat</button>

        <!-- Cerrar -->
        <button class="ctrl-btn ctrl-btn--close" @click="emit('close')">
          ✕ Cerrar
        </button>
      </div>
    </div>

    <!-- ── Área principal ── -->
    <div class="player-body">

      <!-- Reproductor de vídeo — ocupa el espacio principal -->
      <div class="player-main" :class="{ 'player-main--no-panel': !showChat }">
        <VideoPlayer :channel="channel" class="tv-video-player" />
      </div>

      <!-- Panel lateral — info + chat Twitch -->
      <aside v-if="showChat && isTwitch" class="player-panel">
        <iframe
          :src="twitchChatUrl"
          class="chat-iframe"
          allow="autoplay"
          title="Chat de Twitch"
        />
      </aside>

      <!-- Panel lateral — info del canal (cuando no hay chat) -->
      <aside v-else class="player-panel player-panel--info">

        <!-- Logo / iniciales -->
        <div class="panel-logo">
          <img
            v-if="channel.logoUrl"
            :src="channel.logoUrl"
            :alt="channel.name"
            class="panel-logo-img"
          />
          <span v-else class="panel-logo-initials">
            {{ channel.name.substring(0, 2).toUpperCase() }}
          </span>
        </div>

        <!-- Info del canal -->
        <div class="panel-meta">
          <p class="panel-meta-label">Tipo de stream</p>
          <p class="panel-meta-value" :style="streamTypeBadgeStyle">{{ streamTypeLabel }}</p>
        </div>

        <!-- Próximo evento -->
        <div v-if="nextEvent" class="panel-event">
          <p class="panel-meta-label">Próximo evento</p>
          <p class="panel-event-title">{{ nextEvent.title }}</p>
          <p class="panel-event-countdown">
            {{ eventsStore.formatCountdown(nextEvent.scheduledAt) }}
          </p>
        </div>

        <!-- Atajos de teclado -->
        <div class="panel-shortcuts">
          <p class="panel-meta-label">Controles</p>
          <ul class="shortcut-list">
            <li><kbd>M</kbd> Silenciar</li>
            <li><kbd>F</kbd> Pantalla completa</li>
            <li><kbd>Back</kbd> Cerrar</li>
          </ul>
        </div>

        <!-- Botón Twitch chat si aplica -->
        <button
          v-if="isTwitch"
          class="panel-chat-btn"
          @click="showChat = true"
        >
          💬 Mostrar chat de Twitch
        </button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── Overlay de pantalla completa — fluido ── */
.tv-player-overlay {
  position: fixed;
  inset: 0;
  width:  100%;
  height: 100%;
  background: #000;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  animation: fade-in 0.18s ease;
}

/* ── Barra superior del reproductor ── */
.player-topbar {
  height: 60px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-5);
  background: rgba(0,0,0,0.85);
  border-bottom: 1px solid rgba(255,255,255,0.1);
  backdrop-filter: blur(8px);
}

.player-topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}

.player-channel-name {
  font-size: 1.35rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.01em;
}

.player-type-badge {
  font-size: 0.82rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255,255,255,0.08);
  padding: 4px 12px;
  border-radius: 999px;
}

.player-topbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Botones de control */
.ctrl-btn {
  height: 42px;
  padding: 0 var(--space-4);
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: var(--radius-sm);
  color: rgba(255,255,255,0.8);
  font-family: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  outline: none;
}
.ctrl-btn:hover,
.ctrl-btn:focus-visible {
  background: rgba(255,255,255,0.2);
  color: #fff;
  box-shadow: var(--focus-ring);
}
.ctrl-btn--active {
  background: rgba(145,70,255,0.3);
  border-color: #9146ff;
  color: #c8a7ff;
}
.ctrl-btn--close {
  color: rgba(255,255,255,0.6);
}
.ctrl-btn--close:hover {
  background: rgba(239,68,68,0.2);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

/* ── Área principal ── */
.player-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Reproductor de vídeo */
.player-main {
  flex: 1;
  min-width: 0;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Sin panel lateral: el vídeo ocupa todo el ancho */
.player-main--no-panel {
  /* ocupa todo el ancho — el panel info siempre se muestra */
}

/* Forzar que el vídeo llene el contenedor y mantenga 16:9 */
.tv-video-player :deep(.player-wrap) {
  width: 100%;
  height: 100%;
  aspect-ratio: unset;
  border-radius: 0;
}

/* ── Panel lateral ── */
.player-panel {
  width: 340px;
  flex-shrink: 0;
  border-left: 1px solid rgba(255,255,255,0.08);
  background: #080a0f;
  overflow: hidden;
}

/* Chat iframe */
.chat-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

/* Panel de info del canal */
.player-panel--info {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  overflow-y: auto;
}

/* Logo en el panel */
.panel-logo {
  width: 100%;
  aspect-ratio: 16/9;
  background: #0d0f14;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.panel-logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.panel-logo-initials {
  font-size: 2.5rem;
  font-weight: 800;
  color: var(--color-accent);
}

/* Metadatos del canal */
.panel-meta {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}
.panel-meta-label {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--color-text-muted);
}
.panel-meta-value {
  font-size: 0.95rem;
  font-weight: 700;
}

/* Próximo evento */
.panel-event {
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: var(--space-4);
}
.panel-event-title {
  font-size: 0.92rem;
  font-weight: 600;
  color: var(--color-text-main);
  line-height: 1.4;
}
.panel-event-countdown {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--color-fav);
}

/* Atajos de teclado */
.panel-shortcuts {
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.shortcut-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.shortcut-list li {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.shortcut-list kbd {
  display: inline-block;
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: 4px;
  padding: 2px 8px;
  font-family: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--color-accent);
}

/* Botón mostrar chat */
.panel-chat-btn {
  margin-top: auto;
  height: 40px;
  background: rgba(145,70,255,0.15);
  border: 1px solid rgba(145,70,255,0.4);
  border-radius: var(--radius-md);
  color: #c8a7ff;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  outline: none;
}
.panel-chat-btn:hover,
.panel-chat-btn:focus-visible {
  background: rgba(145,70,255,0.3);
  box-shadow: var(--focus-ring);
}
</style>

<script setup lang="ts">
/**
 * PlayerModal — Reproductor en pantalla completa para Titan OS.
 * 100% relativa: vw · vh · rem.
 * Panel lateral derecho con info del canal, próximo evento y chat Twitch.
 */
import { ref, computed } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'
import { useEventsStore } from '@/stores/events'

const props = defineProps<{ channel: Channel }>()
const emit  = defineEmits<{ close: [] }>()

const eventsStore = useEventsStore()
const showChat    = ref(false)

const isTwitch  = computed(() => props.channel.streamType === 'twitch')
const nextEvent = computed(() => eventsStore.getNextEvent(props.channel.id))

const twitchChatUrl = computed(() => {
  const m = props.channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = m?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})

const streamTypeLabel = computed(() => {
  const map: Record<string, string> = { hls: 'HLS', twitch: 'Twitch', youtube: 'YouTube', web: 'Web' }
  return map[props.channel.streamType] ?? props.channel.streamType
})

const typeBadgeStyle = computed(() => {
  const colors: Record<string, string> = { twitch: '#9146ff', youtube: '#ff4444', hls: '#00bfff' }
  return { color: colors[props.channel.streamType] ?? '#7b8496' }
})
</script>

<template>
  <div class="overlay" @keydown.esc="emit('close')" @keydown.backspace="emit('close')">

    <!-- ── Barra superior ── -->
    <div class="topbar">
      <div class="topbar-left">
        <span class="ch-name">{{ channel.name }}</span>
        <span class="type-badge" :style="typeBadgeStyle">{{ streamTypeLabel }}</span>
      </div>
      <div class="topbar-right">
        <button
          v-if="isTwitch"
          class="ctrl-btn"
          :class="{ 'ctrl-btn--chat-active': showChat }"
          @click="showChat = !showChat"
        >💬 Chat</button>
        <button class="ctrl-btn ctrl-btn--close" @click="emit('close')">✕ Cerrar</button>
      </div>
    </div>

    <!-- ── Cuerpo ── -->
    <div class="body">

      <!-- Reproductor -->
      <div class="player-area">
        <VideoPlayer :channel="channel" class="fill-player" />
      </div>

      <!-- Panel lateral: chat Twitch -->
      <aside v-if="showChat && isTwitch" class="side-panel">
        <iframe
          :src="twitchChatUrl"
          class="chat-iframe"
          allow="autoplay"
          title="Chat de Twitch"
        />
      </aside>

      <!-- Panel lateral: info del canal -->
      <aside v-else class="side-panel side-panel--info">

        <!-- Logo / iniciales -->
        <div class="panel-logo">
          <img v-if="channel.logoUrl" :src="channel.logoUrl" :alt="channel.name" class="logo-img" />
          <span v-else class="logo-initials">{{ channel.name.substring(0, 2).toUpperCase() }}</span>
        </div>

        <!-- Tipo -->
        <div class="panel-meta">
          <p class="meta-label">Tipo de stream</p>
          <p class="meta-value" :style="typeBadgeStyle">{{ streamTypeLabel }}</p>
        </div>

        <!-- Próximo evento -->
        <div v-if="nextEvent" class="panel-event">
          <p class="meta-label">Próximo evento</p>
          <p class="event-title">{{ nextEvent.title }}</p>
          <p class="event-countdown">{{ eventsStore.formatCountdown(nextEvent.scheduledAt) }}</p>
        </div>

        <!-- Controles -->
        <div class="panel-shortcuts">
          <p class="meta-label">Controles</p>
          <ul class="shortcut-list">
            <li><kbd>M</kbd> Silenciar</li>
            <li><kbd>F</kbd> Pantalla completa</li>
            <li><kbd>Back</kbd> Cerrar</li>
          </ul>
        </div>

        <!-- Mostrar chat Twitch -->
        <button v-if="isTwitch" class="chat-btn" @click="showChat = true">
          💬 Mostrar chat de Twitch
        </button>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* ── Overlay pantalla completa ── */
.overlay {
  position: fixed;
  inset: 0;
  width: 100%;
  height: 100%;
  background: #000;
  display: flex;
  flex-direction: column;
  z-index: 1000;
  animation: fade-in 0.18s ease;
}

/* ── Barra superior ── */
.topbar {
  height: 8vh;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--space-5);
  background: rgba(0, 0, 0, 0.88);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(8px);
}

.topbar-left {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.ch-name {
  font-size: 1.35rem;
  font-weight: 800;
  color: #fff;
  letter-spacing: 0.01em;
}
.type-badge {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  background: rgba(255, 255, 255, 0.08);
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
}
.topbar-right {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}

/* Botones de control */
.ctrl-btn {
  height: 5.5vh;
  padding: 0 var(--space-4);
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: var(--radius-sm);
  color: rgba(255, 255, 255, 0.82);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  outline: none;
}
.ctrl-btn:hover,
.ctrl-btn:focus-visible {
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
  box-shadow: var(--focus-ring);
}
.ctrl-btn--chat-active {
  background: rgba(145, 70, 255, 0.3);
  border-color: #9146ff;
  color: #c8a7ff;
}
.ctrl-btn--close:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: var(--color-danger);
  color: var(--color-danger);
}

/* ── Cuerpo ── */
.body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Área del vídeo */
.player-area {
  flex: 1;
  min-width: 0;
  background: #000;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* El player llena el contenedor sin aspect-ratio */
.fill-player :deep(.player-wrap) {
  width: 100%;
  height: 100%;
  aspect-ratio: unset;
  border-radius: 0;
}

/* ── Panel lateral ── */
.side-panel {
  width: var(--panel-width);
  flex-shrink: 0;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  background: #080a0f;
  overflow: hidden;
}

.chat-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

/* Panel de info */
.side-panel--info {
  display: flex;
  flex-direction: column;
  gap: var(--space-5);
  padding: var(--space-6);
  overflow-y: auto;
}

/* Logo */
.panel-logo {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #0d0f14;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.logo-img     { width: 100%; height: 100%; object-fit: contain; }
.logo-initials { font-size: 2.5rem; font-weight: 800; color: var(--color-accent); }

/* Metadatos */
.panel-meta { display: flex; flex-direction: column; gap: var(--space-1); }
.meta-label {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  color: var(--color-text-muted);
}
.meta-value { font-size: 0.95rem; font-weight: 700; }

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
.event-title    { font-size: 0.9rem; font-weight: 600; color: var(--color-text-main); line-height: 1.4; }
.event-countdown { font-size: 1.1rem; font-weight: 800; color: var(--color-fav); }

/* Atajos */
.panel-shortcuts { display: flex; flex-direction: column; gap: var(--space-2); }
.shortcut-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
}
.shortcut-list li {
  font-size: 0.82rem;
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
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--color-accent);
}

/* Botón chat */
.chat-btn {
  margin-top: auto;
  height: 3rem;
  background: rgba(145, 70, 255, 0.15);
  border: 1px solid rgba(145, 70, 255, 0.4);
  border-radius: var(--radius-md);
  color: #c8a7ff;
  font-family: inherit;
  font-size: 0.88rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
  outline: none;
}
.chat-btn:hover,
.chat-btn:focus-visible {
  background: rgba(145, 70, 255, 0.3);
  box-shadow: var(--focus-ring);
}
</style>

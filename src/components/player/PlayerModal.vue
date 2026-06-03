<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/player/PlayerModal.vue
   ¿QUÉ ES ESTO?
   La pantalla de reproducción en pantalla completa. Cuando el usuario hace clic
   en una tarjeta o pulsa el botón central del mando, esta pantalla aparece
   cubriendo toda la TV y muestra el vídeo del canal seleccionado.

   Diseño:
     ┌──────────────────────────────────┬──────────────────┐
     │ [Nombre canal] [tipo]    [Chat] [✕ Cerrar]          │  ← Barra superior (8vh)
     ├──────────────────────────────────┼──────────────────┤
     │                                  │                  │
     │       VÍDEO (ocupa todo          │  Panel lateral:  │
     │       el espacio disponible)     │  • Logo canal    │
     │                                  │  • Tipo stream   │
     │                                  │  • Próximo evento│
     │                                  │  • Atajos teclado│
     └──────────────────────────────────┴──────────────────┘
   Si el canal es Twitch, el panel lateral puede cambiarse por el chat en directo.

   Cierre: pulsando ✕, la tecla Escape, o el botón Atrás del mando.
============================================================================= */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'
import { useEventsStore } from '@/stores/events'

const props = defineProps<{ channel: Channel }>()
const emit  = defineEmits<{ close: [] }>()

const eventsStore = useEventsStore()

// ── Panel lateral ────────────────────────────────────────────────────────────
const showChat = ref(false)
const isTwitch = computed(() => props.channel.streamType === 'twitch')
const nextEvent = computed(() => eventsStore.getNextEvent(props.channel.id))

const twitchChatUrl = computed(() => {
  const m      = props.channel.url.match(/twitch\.tv\/([^/?#]+)/)
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

// ── Navegación D-pad ─────────────────────────────────────────────────────────
type Zone = 'screen' | 'topbar' | 'controls'

const zone            = ref<Zone>('screen')
const topbarFocusIdx  = ref(0)
const controlFocusIdx = ref(0)
const showControls    = ref(false)
const isPlaying       = ref(true)
const isMuted         = ref(false)

const playerAreaRef = ref<HTMLElement | null>(null)

// Solo HLS tiene video element controlable
const canShowControls = computed(() => props.channel.streamType === 'hls')

// Topbar items según tipo de canal
const topbarItems = computed(() => isTwitch.value ? ['chat', 'close'] : ['close'])

function activateTopbarItem() {
  const item = topbarItems.value[topbarFocusIdx.value]
  if (item === 'chat') showChat.value = !showChat.value
  if (item === 'close') emit('close')
}

function execControl(idx: number) {
  const v = document.querySelector<HTMLVideoElement>('.player-wrap video')
  if (idx === 0 && v) {
    v.paused ? v.play() : v.pause()
    isPlaying.value = !v.paused
  }
  if (idx === 1 && v) {
    v.muted = !v.muted
    isMuted.value = v.muted
  }
  if (idx === 2) {
    document.fullscreenElement
      ? document.exitFullscreen()
      : playerAreaRef.value?.requestFullscreen()
  }
}

function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA'].includes(tag)) return

  switch (e.key) {
    case 'Escape':
    case 'Backspace':
      emit('close')
      e.preventDefault()
      break

    case 'ArrowUp':
      e.preventDefault()
      if (zone.value === 'screen') {
        zone.value = 'topbar'
        topbarFocusIdx.value = 0
      } else if (zone.value === 'controls') {
        zone.value = 'screen'
        showControls.value = false
      }
      break

    case 'ArrowDown':
      e.preventDefault()
      if (zone.value === 'topbar') {
        zone.value = 'screen'
      } else if (zone.value === 'screen' && canShowControls.value) {
        zone.value = 'controls'
        showControls.value = true
        controlFocusIdx.value = 0
      } else if (zone.value === 'controls') {
        zone.value = 'screen'
        showControls.value = false
      }
      break

    case 'ArrowLeft':
      e.preventDefault()
      if (zone.value === 'topbar')
        topbarFocusIdx.value = Math.max(0, topbarFocusIdx.value - 1)
      else if (zone.value === 'controls')
        controlFocusIdx.value = Math.max(0, controlFocusIdx.value - 1)
      break

    case 'ArrowRight':
      e.preventDefault()
      if (zone.value === 'topbar')
        topbarFocusIdx.value = Math.min(topbarItems.value.length - 1, topbarFocusIdx.value + 1)
      else if (zone.value === 'controls')
        controlFocusIdx.value = Math.min(2, controlFocusIdx.value + 1)
      break

    case 'Enter':
      e.preventDefault()
      if (zone.value === 'topbar') activateTopbarItem()
      else if (zone.value === 'controls') execControl(controlFocusIdx.value)
      break
  }
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onUnmounted(() => window.removeEventListener('keydown', handleKeydown))
</script>

<template>
  <!-- Capa negra que cubre toda la pantalla (position:fixed inset:0).
       @keydown escucha teclas cuando este elemento tiene el foco:
         Escape    → cerrar el reproductor
         Backspace → equivale a "Atrás" en mandos Android TV -->
  <div class="overlay">

    <!-- ══ BARRA SUPERIOR ════════════════════════════════════════════════
         Franja oscura semitransparente con nombre del canal y botones de control.
    ════════════════════════════════════════════════════════════════════ -->
    <div class="topbar">
      <!-- Izquierda: nombre del canal + badge de tipo con su color de marca -->
      <div class="topbar-left">
        <span class="ch-name">{{ channel.name }}</span>
        <span class="type-badge" :style="typeBadgeStyle">{{ streamTypeLabel }}</span>
      </div>
      <!-- Derecha: botones de control -->
      <div class="topbar-right">
        <!-- Botón Chat: solo aparece si el canal es de Twitch.
             Al hacer clic alterna (toggle) entre mostrar/ocultar el chat. -->
        <button
          v-if="isTwitch"
          class="ctrl-btn"
          :class="{ 'ctrl-btn--chat-active': showChat, 'ctrl-btn--nav': zone === 'topbar' && topbarFocusIdx === 0 }"
          @click="showChat = !showChat"
        >💬 Chat</button>
        <button
          class="ctrl-btn ctrl-btn--close"
          :class="{ 'ctrl-btn--nav': zone === 'topbar' && topbarFocusIdx === topbarItems.length - 1 }"
          @click="emit('close')"
        >✕ Cerrar</button>
      </div>
    </div>

    <!-- ══ CUERPO: reproductor + panel lateral ═══════════════════════════
         Fila horizontal: el vídeo ocupa todo el espacio libre (flex:1),
         y el panel lateral tiene un ancho fijo definido en CSS (--panel-width).
    ════════════════════════════════════════════════════════════════════ -->
    <div class="body">

      <!-- Área del reproductor: ocupa todo el ancho disponible menos el panel lateral -->
      <div
        ref="playerAreaRef"
        class="player-area"
        :class="{ 'player-area--native': channel.streamType === 'titanapp', 'player-area--screen-focus': zone === 'screen' }"
      >
        <VideoPlayer :channel="channel" class="fill-player" :hideNativeControls="canShowControls" />

        <!-- Barra de controles D-pad (solo HLS) -->
        <Transition name="ctrl-fade">
          <div v-if="showControls" class="controls-bar">
            <button
              class="ctrl-icon-btn"
              :class="{ 'ctrl-icon-btn--focused': controlFocusIdx === 0 }"
              @click="execControl(0)"
            >{{ isPlaying ? '⏸' : '▶' }}</button>
            <button
              class="ctrl-icon-btn"
              :class="{ 'ctrl-icon-btn--focused': controlFocusIdx === 1 }"
              @click="execControl(1)"
            >{{ isMuted ? '🔊' : '🔇' }}</button>
            <button
              class="ctrl-icon-btn"
              :class="{ 'ctrl-icon-btn--focused': controlFocusIdx === 2 }"
              @click="execControl(2)"
            >⛶</button>
          </div>
        </Transition>
      </div>

      <!-- ── PANEL LATERAL: Chat de Twitch ────────────────────────────────
           Solo visible si el usuario activó el chat Y es un canal Twitch.
           El iframe incrusta el chat oficial de Twitch. -->
      <aside v-if="showChat && isTwitch" class="side-panel">
        <iframe
          :src="twitchChatUrl"
          class="chat-iframe"
          allow="autoplay"
          title="Chat de Twitch"
        />
      </aside>

      <!-- ── PANEL LATERAL: Información del canal (por defecto) ───────────
           Se muestra cuando no hay chat activo. Contiene:
           logo, tipo de stream, próximo evento y referencia de controles. -->
      <aside v-else class="side-panel side-panel--info">

        <!-- Logo del canal en formato panorámico (16:9) o iniciales si no hay imagen -->
        <div class="panel-logo">
          <img v-if="channel.logoUrl" :src="channel.logoUrl" :alt="channel.name" class="logo-img" />
          <span v-else class="logo-initials">{{ channel.name.substring(0, 2).toUpperCase() }}</span>
        </div>

        <!-- Metadato: tipo de stream (HLS / Twitch / YouTube) -->
        <div class="panel-meta">
          <p class="meta-label">Tipo de stream</p>
          <p class="meta-value" :style="typeBadgeStyle">{{ streamTypeLabel }}</p>
        </div>

        <!-- Próximo evento programado para este canal.
             v-if="nextEvent" → solo aparece si hay un evento en el store. -->
        <div v-if="nextEvent" class="panel-event">
          <p class="meta-label">Próximo evento</p>
          <p class="event-title">{{ nextEvent.title }}</p>
          <p class="event-countdown">{{ eventsStore.formatCountdown(nextEvent.scheduledAt) }}</p>
        </div>

        <!-- Lista de atajos de teclado/mando para el usuario -->
        <div class="panel-shortcuts">
          <p class="meta-label">Controles</p>
          <ul class="shortcut-list">
            <li><kbd>M</kbd> Silenciar</li>
            <li><kbd>F</kbd> Pantalla completa</li>
            <li><kbd>Back</kbd> Cerrar</li>
          </ul>
        </div>

        <!-- Botón para activar el chat (alternativa al botón de la barra superior).
             Solo visible si el canal es de Twitch. -->
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
  position: relative;
}
.player-area--native {
  background: transparent;
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

/* ── Foco D-pad en topbar ── */
.ctrl-btn--nav {
  outline: 2px solid #fff;
  outline-offset: 2px;
}

/* ── Indicador de zona screen ── */
.player-area--screen-focus {
  outline: 2px solid rgba(255, 255, 255, 0.25);
  outline-offset: -2px;
}

/* ── Barra de controles ── */
.controls-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 1.2rem;
  background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
}

.ctrl-icon-btn {
  width: 3.5rem;
  height: 3.5rem;
  font-size: 1.5rem;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.ctrl-icon-btn--focused {
  background: rgba(255,255,255,0.3);
  outline: 2px solid #fff;
  outline-offset: 2px;
}
.ctrl-icon-btn:hover { background: rgba(255,255,255,0.25); }

/* Transición entrada/salida de la barra */
.ctrl-fade-enter-active,
.ctrl-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.ctrl-fade-enter-from,
.ctrl-fade-leave-to     { opacity: 0; transform: translateY(0.5rem); }

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

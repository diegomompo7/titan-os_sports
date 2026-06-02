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

// Canal que hay que reproducir — lo recibimos de HomeView cuando el usuario lo selecciona
const props = defineProps<{ channel: Channel }>()

// Evento de cierre — HomeView lo escucha y elimina este componente del DOM
const emit = defineEmits<{ close: [] }>()

// Store con los eventos deportivos programados
const eventsStore = useEventsStore()

// ¿Está visible el chat de Twitch en el panel lateral? (off por defecto)
const showChat = ref(false)

// ¿Es un canal de Twitch? → para mostrar/ocultar el botón de chat
const isTwitch = computed(() => props.channel.streamType === 'twitch')

// ── Navegación D-pad en la topbar ─────────────────────────────────────────────
// Flecha arriba → activa el foco en la barra superior (botones Chat y Cerrar)
// Flecha abajo  → desactiva el foco de la barra
// Flecha izq/der → mueve entre los botones de la barra
// Enter          → activa el botón enfocado
const topbarFocused = ref(false)
const topbarIdx     = ref(0)  // 0=Chat (si Twitch), 1=Cerrar

function handleModalKey(e: KeyboardEvent) {
  if (e.key === 'ArrowUp' && !topbarFocused.value) {
    topbarFocused.value = true
    topbarIdx.value = isTwitch.value ? 0 : 1
    e.preventDefault()
    return
  }
  if (!topbarFocused.value) return
  if (e.key === 'ArrowDown') {
    topbarFocused.value = false
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowLeft') {
    topbarIdx.value = Math.max(0, topbarIdx.value - 1)
    e.preventDefault()
    return
  }
  if (e.key === 'ArrowRight') {
    topbarIdx.value = Math.min(isTwitch.value ? 1 : 0, topbarIdx.value + 1)
    e.preventDefault()
    return
  }
  if (e.key === 'Enter') {
    if (topbarIdx.value === 0 && isTwitch.value) showChat.value = !showChat.value
    else emit('close')
    e.preventDefault()
    return
  }
}

onMounted(() => window.addEventListener('keydown', handleModalKey))
onUnmounted(() => window.removeEventListener('keydown', handleModalKey))

// Próximo evento deportivo programado para este canal (o null si no hay ninguno)
const nextEvent = computed(() => eventsStore.getNextEvent(props.channel.id))

// URL del iframe de chat de Twitch.
// Twitch exige pasar el dominio padre (parent=) en la URL del embed por seguridad.
// Extraemos el nombre del canal de la URL (ej: "twitch.tv/marcatv" → "marcatv")
const twitchChatUrl = computed(() => {
  const m      = props.channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = m?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})

// Texto legible del tipo de stream para el badge de la barra superior
const streamTypeLabel = computed(() => {
  const map: Record<string, string> = { hls: 'HLS', twitch: 'Twitch', youtube: 'YouTube', web: 'Web' }
  return map[props.channel.streamType] ?? props.channel.streamType
})

// Color del badge según el tipo de stream (morado Twitch, rojo YouTube, azul HLS...)
const typeBadgeStyle = computed(() => {
  const colors: Record<string, string> = { twitch: '#9146ff', youtube: '#ff4444', hls: '#00bfff' }
  return { color: colors[props.channel.streamType] ?? '#7b8496' }
})
</script>

<template>
  <!-- Capa negra que cubre toda la pantalla (position:fixed inset:0).
       @keydown escucha teclas cuando este elemento tiene el foco:
         Escape    → cerrar el reproductor
         Backspace → equivale a "Atrás" en mandos Android TV -->
  <div class="overlay" @keydown.esc="emit('close')" @keydown.backspace="emit('close')">

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
          :class="{ 'ctrl-btn--chat-active': showChat, 'ctrl-btn--nav': topbarFocused && topbarIdx === 0 }"
          @click="showChat = !showChat"
        >💬 Chat</button>
        <!-- Botón Cerrar: siempre visible, color rojo al pasar el ratón -->
        <button
          class="ctrl-btn ctrl-btn--close"
          :class="{ 'ctrl-btn--nav': topbarFocused && (topbarIdx === 1 || !isTwitch) }"
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
      <div class="player-area" :class="{ 'player-area--native': channel.streamType === 'titanapp' }">
        <!-- fill-player modifica el aspect-ratio del VideoPlayer para que llene
             todo el espacio disponible sin la ratio 16:9 fija del componente. -->
        <VideoPlayer :channel="channel" class="fill-player" />
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
.ctrl-btn--nav {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
  background: rgba(255, 255, 255, 0.2);
  color: #fff;
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

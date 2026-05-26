<script setup lang="ts">
/**
 * VideoPlayer — Reproductor de vídeo multi-formato.
 *
 * Tipos de stream soportados:
 *   - HLS (.m3u8): Usa hls.js con cabeceras Referer y User-Agent opcionales
 *   - Twitch: iframe embed oficial de Twitch
 *   - YouTube: iframe embed. Si la URL es un canal (sin videoId),
 *              llama al backend para resolver el vídeo en directo actual.
 *   - Web: Muestra un botón para abrir el enlace en nueva pestaña
 */
import { ref, computed, watchEffect } from 'vue'
import axios from 'axios'
import type { Channel } from '@/types/channel'
import { useVideoPlayer, useTwitchEmbedUrl, useYoutubeEmbedUrl } from '@/composables/useVideoPlayer'

const props = defineProps<{ channel: Channel }>()

const API        = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'
const videoEl    = ref<HTMLVideoElement | null>(null)
const channelRef = computed(() => props.channel)

// Detectores del tipo de stream
const isTwitch  = computed(() => props.channel.streamType === 'twitch')
const isYoutube = computed(() => props.channel.streamType === 'youtube')

/**
 * URL de embed cuando el tipo de stream tiene videoId directo.
 * Para YouTube necesitamos un videoId; si la URL es un canal (@handle)
 * no lo tiene y hay que resolverlo vía backend.
 */
const staticEmbedUrl = computed(() => {
  if (isTwitch.value)  return useTwitchEmbedUrl(props.channel)
  if (isYoutube.value) return useYoutubeEmbedUrl(props.channel)
  return ''
})

// ── Resolución dinámica de YouTube (para URLs de canal sin videoId) ──────────
const resolvedEmbedUrl = ref<string | null>(null)
const isResolving      = ref(false)

watchEffect(async () => {
  // Solo resolver si es YouTube Y no hay ya un embed URL estático
  if (!isYoutube.value || staticEmbedUrl.value) {
    resolvedEmbedUrl.value = null
    return
  }

  isResolving.value = true
  resolvedEmbedUrl.value = null

  try {
    const { data } = await axios.get<{ embedUrl: string | null }>(
      `${API}/channels/resolve-youtube`,
      { params: { url: props.channel.url } }
    )
    resolvedEmbedUrl.value = data.embedUrl
  } catch {
    resolvedEmbedUrl.value = null  // El canal no está en directo o hay error de red
  } finally {
    isResolving.value = false
  }
})

// URL final que se pasa al iframe
const embedUrl = computed(() => staticEmbedUrl.value || resolvedEmbedUrl.value || '')

// Hook de hls.js — gestiona la inicialización del stream HLS
const { playerError } = useVideoPlayer(videoEl, channelRef)
</script>

<template>
  <div class="player-wrap">

    <!-- Error del reproductor HLS -->
    <div v-if="playerError" class="overlay">
      <span class="overlay-icon">⚠️</span>
      <p class="overlay-text">{{ playerError }}</p>
    </div>

    <!-- Cargando embed de YouTube (resolviendo videoId) -->
    <div v-else-if="isYoutube && isResolving" class="overlay">
      <span class="overlay-icon spinner">⏳</span>
      <p class="overlay-text">Conectando…</p>
    </div>

    <!-- Canal de YouTube sin directo activo -->
    <div v-else-if="isYoutube && !embedUrl" class="overlay">
      <span class="overlay-icon">📺</span>
      <p class="overlay-text">Este canal no está en directo ahora mismo</p>
      <a :href="channel.url" target="_blank" rel="noopener noreferrer" class="open-btn">
        Abrir en YouTube ↗
      </a>
    </div>

    <!-- Iframe: Twitch o YouTube -->
    <iframe
      v-else-if="isTwitch || isYoutube"
      :src="embedUrl"
      :title="channel.name"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
      class="player-iframe"
    />

    <!-- Vídeo HLS nativo -->
    <video
      v-else
      ref="videoEl"
      class="player-video"
      controls
      playsinline
      :aria-label="`Reproductor de ${channel.name}`"
    />
  </div>
</template>

<style scoped>
/* ── Contenedor con relación de aspecto 16:9 ── */
.player-wrap {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
}

.player-video,
.player-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
  object-fit: contain;
}

/* ── Overlay centrado para mensajes de estado ── */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-4);
  text-align: center;
}
.overlay-icon {
  font-size: clamp(2rem, 5vw, 3rem);
  opacity: 0.5;
}
.overlay-text {
  color: var(--color-text-muted);
  font-size: clamp(0.8rem, 2vw, 0.95rem);
  margin: 0;
}

/* Botón para abrir YouTube cuando no hay directo */
.open-btn {
  display: inline-block;
  padding: 10px 20px;
  background: #ff0000;
  color: #fff;
  border-radius: var(--radius-sm);
  text-decoration: none;
  font-size: 0.9rem;
  font-weight: 600;
  transition: opacity 0.15s;
}
.open-btn:hover { opacity: 0.85; }
</style>

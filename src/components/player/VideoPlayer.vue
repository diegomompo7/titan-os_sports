<script setup lang="ts">
/**
 * VideoPlayer — Reproductor multi-formato para Titan OS.
 * Soporta: HLS · Twitch iframe · YouTube iframe · Web (enlace externo)
 */
import { ref, computed, watchEffect } from 'vue'
import axios from 'axios'
import type { Channel } from '@/types/channel'
import { useVideoPlayer, useTwitchEmbedUrl, useYoutubeEmbedUrl } from '@/composables/useVideoPlayer'

const props = defineProps<{ channel: Channel }>()

const API        = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'
const videoEl    = ref<HTMLVideoElement | null>(null)
const channelRef = computed(() => props.channel)

const isTwitch  = computed(() => props.channel.streamType === 'twitch')
const isYoutube = computed(() => props.channel.streamType === 'youtube')

const staticEmbedUrl = computed(() => {
  if (isTwitch.value)  return useTwitchEmbedUrl(props.channel)
  if (isYoutube.value) return useYoutubeEmbedUrl(props.channel)
  return ''
})

const resolvedEmbedUrl = ref<string | null>(null)
const isResolving      = ref(false)

watchEffect(async () => {
  if (!isYoutube.value || staticEmbedUrl.value) {
    resolvedEmbedUrl.value = null; return
  }
  isResolving.value = true
  resolvedEmbedUrl.value = null
  try {
    const { data } = await axios.get<{ embedUrl: string | null }>(
      `${API}/channels/resolve-youtube`, { params: { url: props.channel.url } }
    )
    resolvedEmbedUrl.value = data.embedUrl
  } catch {
    resolvedEmbedUrl.value = null
  } finally {
    isResolving.value = false
  }
})

const embedUrl = computed(() => staticEmbedUrl.value || resolvedEmbedUrl.value || '')
const { playerError } = useVideoPlayer(videoEl, channelRef)
</script>

<template>
  <div class="player-wrap">

    <!-- Error HLS -->
    <div v-if="playerError" class="overlay">
      <span class="ov-icon">⚠️</span>
      <p class="ov-text">{{ playerError }}</p>
    </div>

    <!-- Resolviendo YouTube -->
    <div v-else-if="isYoutube && isResolving" class="overlay">
      <span class="ov-icon">⏳</span>
      <p class="ov-text">Conectando…</p>
    </div>

    <!-- YouTube sin directo -->
    <div v-else-if="isYoutube && !embedUrl" class="overlay">
      <span class="ov-icon">📺</span>
      <p class="ov-text">Este canal no está en directo ahora mismo</p>
      <a :href="channel.url" target="_blank" rel="noopener noreferrer" class="open-btn">
        Abrir en YouTube ↗
      </a>
    </div>

    <!-- Iframe Twitch / YouTube -->
    <iframe
      v-else-if="isTwitch || isYoutube"
      :src="embedUrl"
      :title="channel.name"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
      class="player-iframe"
    />

    <!-- Vídeo HLS -->
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
/* Contenedor 16:9 */
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

/* Overlays de estado */
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
.ov-icon { font-size: clamp(2rem, 4vw, 3.5rem); opacity: 0.45; }
.ov-text {
  color: var(--color-text-muted);
  font-size: clamp(0.78rem, 1.5vw, 1rem);
  margin: 0;
}
.open-btn {
  display: inline-block;
  padding: 0.6rem 1.4rem;
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

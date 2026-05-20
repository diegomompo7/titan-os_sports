<script setup lang="ts">
import { ref, computed, watchEffect } from 'vue'
import axios from 'axios'
import type { Channel } from '@/types/channel'
import { useVideoPlayer, useTwitchEmbedUrl, useYoutubeEmbedUrl } from '@/composables/useVideoPlayer'

const props = defineProps<{ channel: Channel }>()

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

const videoEl = ref<HTMLVideoElement | null>(null)
const channelRef = computed(() => props.channel)

const isTwitch = computed(() => props.channel.streamType === 'twitch')
const isYoutube = computed(() => props.channel.streamType === 'youtube')
const staticEmbedUrl = computed(() => {
  if (isTwitch.value) return useTwitchEmbedUrl(props.channel)
  if (isYoutube.value) return useYoutubeEmbedUrl(props.channel)
  return ''
})

// Para URLs de canal YouTube (sin video ID), resolver via backend
const resolvedEmbedUrl = ref<string | null>(null)
const resolving = ref(false)

watchEffect(async () => {
  if (!isYoutube.value || staticEmbedUrl.value) {
    resolvedEmbedUrl.value = null
    return
  }
  resolving.value = true
  resolvedEmbedUrl.value = null
  try {
    const { data } = await axios.get<{ embedUrl: string | null }>(
      `${API}/channels/resolve-youtube`,
      { params: { url: props.channel.url } }
    )
    resolvedEmbedUrl.value = data.embedUrl
  } catch {
    resolvedEmbedUrl.value = null
  } finally {
    resolving.value = false
  }
})

const embedUrl = computed(() => staticEmbedUrl.value || resolvedEmbedUrl.value || '')

const { playerError } = useVideoPlayer(videoEl, channelRef)
</script>

<template>
  <div class="player-wrap">
    <div v-if="playerError" class="player-error">{{ playerError }}</div>

    <div v-else-if="isYoutube && resolving" class="player-error">Conectando…</div>

    <div v-else-if="isYoutube && !embedUrl" class="player-fallback">
      <span class="fallback-icon">▶</span>
      <p class="fallback-msg">Este canal no está en directo</p>
      <a :href="channel.url" target="_blank" rel="noopener noreferrer" class="fallback-btn">
        Abrir en YouTube ↗
      </a>
    </div>

    <iframe
      v-else-if="isTwitch || isYoutube"
      :src="embedUrl"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
      class="player-iframe"
    />

    <video
      v-else
      ref="videoEl"
      class="player-video"
      controls
      playsinline
    />
  </div>
</template>

<style scoped>
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
.player-error {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 0.875rem;
  padding: var(--space-md);
  text-align: center;
}
.player-fallback {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  text-align: center;
}
.fallback-icon {
  font-size: 2rem;
  color: var(--color-text-muted);
  opacity: 0.4;
}
.fallback-msg {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  margin: 0;
}
.fallback-btn {
  display: inline-block;
  padding: 8px 18px;
  background: #ff0000;
  color: #fff;
  border-radius: var(--radius-sm);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 600;
  transition: opacity 0.15s;
}
.fallback-btn:hover {
  opacity: 0.85;
}
</style>

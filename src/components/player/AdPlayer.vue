<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Ad } from '@/stores/ads'

const props = defineProps<{ ad: Ad }>()
const emit  = defineEmits<{ done: [] }>()

const iframeRef = ref<HTMLIFrameElement | null>(null)

// Extrae el video ID de cualquier formato de URL de YouTube
function extractVideoId(url: string): string | null {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  const liveMatch  = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/)
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  return watchMatch?.[1] ?? liveMatch?.[1] ?? shortMatch?.[1] ?? embedMatch?.[1] ?? null
}

const embedUrl = computed(() => {
  const id = extractVideoId(props.ad.url)
  if (!id) return ''
  return `https://www.youtube.com/embed/${id}?autoplay=1&enablejsapi=1&rel=0`
})

// Fallback: si YouTube no manda el evento de fin en 10 min, avanzamos igualmente
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

function handleDone() {
  if (fallbackTimer) clearTimeout(fallbackTimer)
  emit('done')
}

function handleYtMessage(event: MessageEvent) {
  if (!iframeRef.value || event.source !== iframeRef.value.contentWindow) return
  let data: { event?: string; info?: unknown }
  try {
    data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data
  } catch { return }
  if (data?.event === 'onStateChange' && data?.info === 0) {
    handleDone()
  }
}

onMounted(() => {
  window.addEventListener('message', handleYtMessage)
  fallbackTimer = setTimeout(handleDone, 10 * 60 * 1000)
})

onUnmounted(() => {
  window.removeEventListener('message', handleYtMessage)
  if (fallbackTimer) clearTimeout(fallbackTimer)
})
</script>

<template>
  <div class="ad-player">
    <iframe
      v-if="embedUrl"
      ref="iframeRef"
      class="ad-iframe"
      :src="embedUrl"
      title="Anuncio"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin"
      allowfullscreen
    />
    <div v-else class="ad-placeholder">
      <span>Sin anuncio disponible</span>
    </div>
  </div>
</template>

<style scoped>
.ad-player {
  width: 100%;
  aspect-ratio: 16 / 9;
  border-radius: var(--radius-md);
  overflow: hidden;
  background: #000;
}

.ad-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

.ad-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>

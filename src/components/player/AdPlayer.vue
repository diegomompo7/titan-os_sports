<script setup lang="ts">
import { computed, onMounted, onUnmounted } from 'vue'

const props = defineProps<{ url: string }>()
const emit = defineEmits<{ done: [] }>()

// Convierte cualquier URL de YouTube en una URL de embed con autoplay y sonido
const embedUrl = computed(() => {
  let videoId: string | null = null

  const watchMatch = props.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  const liveMatch  = props.url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/)
  const shortMatch = props.url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  const embedMatch = props.url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)

  videoId = watchMatch?.[1] ?? liveMatch?.[1] ?? shortMatch?.[1] ?? embedMatch?.[1] ?? null

  if (!videoId) return props.url

  const origin = encodeURIComponent(window.location.origin)
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0&enablejsapi=1&origin=${origin}`
})

let fallbackTimer: ReturnType<typeof setTimeout> | null = null

function onMessage(e: MessageEvent) {
  try {
    const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data
    // YouTube IFrame API: state 0 = ended
    if (data?.event === 'onStateChange' && data?.info === 0) {
      finish()
    }
  } catch {
    // ignorar mensajes no parseables
  }
}

function finish() {
  cleanup()
  emit('done')
}

function cleanup() {
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
  window.removeEventListener('message', onMessage)
}

onMounted(() => {
  window.addEventListener('message', onMessage)
  // Fallback: si en 3 minutos no llega el evento de fin, consideramos el anuncio terminado
  fallbackTimer = setTimeout(finish, 3 * 60 * 1000)
})

onUnmounted(cleanup)
</script>

<template>
  <iframe
    class="ad-iframe"
    :src="embedUrl"
    title="Anuncio"
    frameborder="0"
    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
    allowfullscreen
  />
</template>

<style scoped>
.ad-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}
</style>

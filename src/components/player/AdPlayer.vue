<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps<{ url: string }>()
const emit = defineEmits<{ done: [] }>()

const containerEl = ref<HTMLDivElement | null>(null)

// Module-level: promesa compartida para no cargar el script dos veces
let ytApiReady: Promise<void> | null = null

function loadYTApi(): Promise<void> {
  if (!ytApiReady) {
    ytApiReady = new Promise((resolve) => {
      if ((window as any).YT?.Player) { resolve(); return }
      const tag = document.createElement('script')
      tag.src = 'https://www.youtube.com/iframe_api'
      document.head.appendChild(tag)
      ;(window as any).onYouTubeIframeAPIReady = resolve
    })
  }
  return ytApiReady
}

function extractVideoId(url: string): string | null {
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  const liveMatch  = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/)
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  const embedMatch = url.match(/youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/)
  return watchMatch?.[1] ?? liveMatch?.[1] ?? shortMatch?.[1] ?? embedMatch?.[1] ?? null
}

let player: any = null
let fallbackTimer: ReturnType<typeof setTimeout> | null = null

function finish() {
  if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null }
  emit('done')
}

onMounted(async () => {
  const videoId = extractVideoId(props.url)
  if (!videoId) { finish(); return }

  await loadYTApi()
  if (!containerEl.value) return

  player = new (window as any).YT.Player(containerEl.value, {
    videoId,
    width: '100%',
    height: '100%',
    playerVars: { autoplay: 1, rel: 0, playsinline: 1 },
    events: {
      onReady: (e: any) => e.target.playVideo(),
      onStateChange: (e: any) => { if (e.data === 0) finish() },
    },
  })

  fallbackTimer = setTimeout(finish, 3 * 60 * 1000)
})

onUnmounted(() => {
  if (fallbackTimer) clearTimeout(fallbackTimer)
  player?.destroy()
  player = null
})
</script>

<template>
  <div ref="containerEl" class="ad-player" />
</template>

<style scoped>
.ad-player {
  width: 100%;
  height: 100%;
}
.ad-player :deep(iframe) {
  width: 100% !important;
  height: 100% !important;
  border: none;
  display: block;
}
</style>



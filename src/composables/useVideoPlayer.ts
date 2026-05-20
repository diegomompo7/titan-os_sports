import { ref, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { Channel } from '@/types/channel'

export function useYoutubeEmbedUrl(channel: Channel): string {
  const url = channel.url

  // URLs de canal (@handle, /channel/ID) no son embebibles — devolver '' para mostrar fallback
  if (url.match(/youtube\.com\/@/) || url.match(/youtube\.com\/channel\//)) return ''

  // Video específico: watch?v=, youtu.be/, /live/ID, /embed/ID
  const watchMatch = url.match(/[?&]v=([^&]+)/)
  const shortMatch = url.match(/youtu\.be\/([^?]+)/)
  const liveMatch = url.match(/youtube\.com\/live\/([^?]+)/)
  const embedMatch = url.match(/youtube\.com\/embed\/([^?]+)/)
  const videoId = watchMatch?.[1] ?? shortMatch?.[1] ?? liveMatch?.[1] ?? embedMatch?.[1] ?? ''
  if (!videoId) return ''
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
}

export function useTwitchEmbedUrl(channel: Channel): string {
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  // Extraer nombre de canal de URLs como https://www.twitch.tv/channelname
  const match = channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const channelName = match?.[1] ?? channel.url
  return `https://player.twitch.tv/?channel=${channelName}&parent=${parent}&autoplay=true&muted=false`
}

export function useVideoPlayer(videoEl: Ref<HTMLVideoElement | null>, channel: Ref<Channel | null>) {
  const playerError = ref<string | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hlsInstance: any = null

  async function initHls(url: string) {
    const { default: Hls } = await import('hls.js')

    if (!Hls.isSupported()) {
      // Safari: native HLS
      if (videoEl.value?.canPlayType('application/vnd.apple.mpegurl')) {
        videoEl.value.src = url
        videoEl.value.play().catch(() => null)
      } else {
        playerError.value = 'Tu navegador no soporta HLS'
      }
      return
    }

    const referer = channel.value?.referer
    const userAgent = channel.value?.userAgent

    hlsInstance = new Hls({
      enableWorker: true,
      lowLatencyMode: true,
      xhrSetup: (xhr: XMLHttpRequest) => {
        if (referer) xhr.setRequestHeader('Referer', referer)
      },
      fetchSetup: (context: { url: string }, initParams: RequestInit) => {
        const headers = new Headers(initParams.headers)
        if (referer) headers.set('Referer', referer)
        if (userAgent) headers.set('User-Agent', userAgent)
        return new Request(context.url, { ...initParams, headers })
      },
    })
    hlsInstance.loadSource(url)
    hlsInstance.attachMedia(videoEl.value!)
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      videoEl.value?.play().catch(() => null)
    })
    hlsInstance.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean }) => {
      if (data.fatal) playerError.value = 'El stream no está disponible'
    })
  }

  function destroyHls() {
    if (hlsInstance) {
      hlsInstance.destroy()
      hlsInstance = null
    }
    if (videoEl.value) {
      videoEl.value.pause()
      videoEl.value.removeAttribute('src')
      videoEl.value.load()
    }
    playerError.value = null
  }

  watch(
    channel,
    (ch) => {
      destroyHls()
      if (!ch || ch.streamType !== 'hls') return
      initHls(ch.url)
    },
    { immediate: true }
  )

  onUnmounted(destroyHls)

  return { playerError }
}

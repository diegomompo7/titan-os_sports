/* =============================================================================
   FICHERO: src/composables/useVideoPlayer.ts
   ¿QUÉ ES ESTO?
   Contiene toda la lógica técnica para reproducir vídeo en la app.
   Soporta tres tipos de reproducción:

   1. YouTube → genera una URL de iframe embebible (como pegar un vídeo en una web)
   2. Twitch  → genera una URL de iframe del player de Twitch
   3. HLS     → carga un stream M3U8 en tiempo real usando la librería hls.js

   Analogía: es como el mecanismo interno de un reproductor de DVD.
   Dependiendo del disco que metas (YouTube, Twitch, HLS), el mecanismo
   sabe cómo leerlo y mostrarlo en la pantalla.

   ¿Qué es HLS?
   HTTP Live Streaming — el formato más común para televisión en directo.
   Los canales de televisión emiten en este formato. Usa ficheros .m3u8
   que son "listas de playlist" de trozos de vídeo de pocos segundos.
============================================================================= */

import { ref, watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { Channel } from '@/types/channel'

/* =============================================================================
   FUNCIÓN: useYoutubeEmbedUrl
   Convierte una URL de YouTube en una URL de embed (para mostrar en un iframe).

   Ejemplos de transformación:
   - "https://www.youtube.com/watch?v=ABC123" → "https://www.youtube.com/embed/ABC123?autoplay=1&rel=0"
   - "https://youtu.be/ABC123"               → "https://www.youtube.com/embed/ABC123?autoplay=1&rel=0"
   - "https://www.youtube.com/@canal/live"   → "" (no embebible directamente)

   ¿Por qué? Los iframe de YouTube necesitan una URL especial del tipo /embed/ID.
   No se puede poner la URL normal del vídeo en un iframe — daría error.
============================================================================= */
export function useYoutubeEmbedUrl(channel: Channel): string {
  const url = channel.url

  // URLs de canal completo (@handle o /channel/ID) no se pueden embeber directamente.
  // Para estas, el servidor debe buscar primero qué vídeo está en directo.
  if (url.match(/youtube\.com\/@/) || url.match(/youtube\.com\/channel\//)) return ''

  // Intentamos extraer el ID del vídeo de los cuatro formatos de URL posibles:

  // Formato 1: watch?v=VIDEO_ID  (URL normal de YouTube)
  const watchMatch = url.match(/[?&]v=([^&]+)/)

  // Formato 2: youtu.be/VIDEO_ID  (URL corta de compartir)
  const shortMatch = url.match(/youtu\.be\/([^?]+)/)

  // Formato 3: youtube.com/live/VIDEO_ID  (URL de directo específico)
  const liveMatch = url.match(/youtube\.com\/live\/([^?]+)/)

  // Formato 4: youtube.com/embed/VIDEO_ID  (URL de embed ya formateada)
  const embedMatch = url.match(/youtube\.com\/embed\/([^?]+)/)

  // Usamos el primero que haya encontrado algo (el ?? significa "si es vacío, usa el siguiente")
  const videoId = watchMatch?.[1] ?? shortMatch?.[1] ?? liveMatch?.[1] ?? embedMatch?.[1] ?? ''

  // Si no encontramos ningún ID, devolvemos cadena vacía (el player mostrará un fallback)
  if (!videoId) return ''

  // Construimos la URL de embed con autoplay=1 (empieza solo) y rel=0 (no muestra vídeos relacionados)
  return `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
}

/* =============================================================================
   FUNCIÓN: useTwitchEmbedUrl
   Construye la URL del player embebido de Twitch para un canal.

   Ejemplo: canal "twitchgaming" → "https://player.twitch.tv/?channel=twitchgaming&parent=..."

   ¿Por qué "parent"?
   Por seguridad, Twitch exige que le digas desde qué dominio estás embebiendo su player.
   Se configura en la variable de entorno VITE_TWITCH_PARENT.
============================================================================= */
export function useTwitchEmbedUrl(channel: Channel): string {
  // El dominio desde el que se carga la app (configurable por entorno)
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'

  // Extraer el nombre del canal de la URL: "https://www.twitch.tv/nombrecanal" → "nombrecanal"
  const match = channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const channelName = match?.[1] ?? channel.url

  // Construir la URL del player de Twitch con parámetros de configuración
  return `https://player.twitch.tv/?channel=${channelName}&parent=${parent}&autoplay=true&muted=false`
}

/* =============================================================================
   FUNCIÓN: useVideoPlayer
   Gestiona la reproducción de streams HLS (vídeo en directo con ficheros .m3u8).
   Usa la librería hls.js para hacer que funcione en todos los navegadores.

   Recibe:
   - videoEl: referencia al elemento <video> del HTML
   - channel: el canal que se está reproduciendo (puede cambiar)

   Devuelve:
   - playerError: si algo falla, aquí estará el mensaje de error
============================================================================= */
export function useVideoPlayer(videoEl: Ref<HTMLVideoElement | null>, channel: Ref<Channel | null>) {
  // Mensaje de error que se muestra en pantalla si el stream no funciona
  const playerError = ref<string | null>(null)

  // Instancia de hls.js — se crea al iniciar y se destruye al cambiar de canal
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let hlsInstance: any = null

  /*
   * Inicializa la reproducción HLS para la URL dada.
   * HLS.js es una librería que descarga y ensambla los trozos de vídeo .ts
   * para reproducirlos en el elemento <video>.
   */
  async function initHls(url: string) {
    // Importar hls.js de forma dinámica (solo cuando se necesita, para no ralentizar la carga)
    const { default: Hls } = await import('hls.js')

    // Safari soporta HLS de forma nativa — no necesita hls.js
    if (!Hls.isSupported()) {
      if (videoEl.value?.canPlayType('application/vnd.apple.mpegurl')) {
        // Safari: asignar la URL directamente al elemento de vídeo
        videoEl.value.src = url
        videoEl.value.play().catch(() => null)
      } else {
        playerError.value = 'Tu navegador no soporta HLS'
      }
      return
    }

    // Algunos streams requieren una cabecera "Referer" para verificar que la
    // petición viene de un sitio autorizado (como un pase de peaje de autopista)
    const referer = channel.value?.referer
    const userAgent = channel.value?.userAgent

    // Crear la instancia de HLS con configuración avanzada
    hlsInstance = new Hls({
      enableWorker: true,     // Usar un hilo separado para no bloquear la interfaz
      lowLatencyMode: true,   // Minimizar el retraso en emisiones en directo

      // xhrSetup: se ejecuta antes de cada petición HTTP de los segmentos de vídeo
      xhrSetup: (xhr: XMLHttpRequest) => {
        if (referer) xhr.setRequestHeader('Referer', referer)
      },

      // fetchSetup: igual pero para las peticiones hechas con fetch
      fetchSetup: (context: { url: string }, initParams: RequestInit) => {
        const headers = new Headers(initParams.headers)
        if (referer)    headers.set('Referer', referer)
        if (userAgent)  headers.set('User-Agent', userAgent)
        return new Request(context.url, { ...initParams, headers })
      },
    })

    // Decirle a HLS.js qué URL cargar y en qué elemento <video> mostrarlo
    hlsInstance.loadSource(url)
    hlsInstance.attachMedia(videoEl.value!)

    // Cuando HLS.js haya descargado y procesado el fichero de playlist (.m3u8),
    // comenzamos la reproducción automáticamente
    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      videoEl.value?.play().catch(() => null)
    })

    // Si ocurre un error fatal (stream no disponible, red cortada, etc.), lo mostramos
    hlsInstance.on(Hls.Events.ERROR, (_: unknown, data: { fatal: boolean }) => {
      if (data.fatal) playerError.value = 'El stream no está disponible'
    })
  }

  /*
   * Detiene y limpia el reproductor HLS.
   * Se llama al cambiar de canal o al cerrar el reproductor.
   * Es importante limpiar para no dejar descargas en curso en segundo plano.
   */
  function destroyHls() {
    if (hlsInstance) {
      hlsInstance.destroy()  // Detener todas las descargas y liberar memoria
      hlsInstance = null
    }
    if (videoEl.value) {
      videoEl.value.pause()            // Pausar el vídeo
      videoEl.value.removeAttribute('src')  // Quitar la URL para detener la carga
      videoEl.value.load()             // Resetear el elemento de vídeo
    }
    playerError.value = null  // Limpiar errores previos
  }

  // watch: cuando cambia el canal (el usuario selecciona otro), reiniciamos el reproductor.
  // { immediate: true } hace que también se ejecute al montar el componente por primera vez.
  watch(
    channel,
    (ch) => {
      destroyHls()                           // Siempre limpiar el reproductor anterior
      if (!ch || ch.streamType !== 'hls') return  // Solo continuar si es un stream HLS
      initHls(ch.url)
    },
    { immediate: true }
  )

  // Limpiar el reproductor cuando el componente se desmonta (cierre del modal, navegación, etc.)
  onUnmounted(destroyHls)

  return { playerError }
}

<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/player/VideoPlayer.vue
   ¿QUÉ ES ESTO?
   El reproductor de vídeo universal de la app. Es como el lector de DVD que
   puede reproducir distintos formatos: DVD normal, Blu-ray, streaming...

   Este componente recibe un canal y elige automáticamente cómo reproducirlo:
     - Canal HLS (.m3u8)   → usa el elemento <video> del navegador + HLS.js
     - Canal Twitch         → incrusta la web de Twitch en un <iframe>
     - Canal YouTube        → incrusta YouTube en un <iframe> (con autoplay)
     - Canal Web            → no reproduce nada; solo muestra un enlace externo

   Para YouTube, hay dos caminos:
     1. URL directa de vídeo (youtube.com/watch?v=XXX) → iframe directo
     2. URL de canal (@marcatv) → primero pregunta al servidor qué vídeo está
        en directo ahora mismo, y luego carga ese vídeo en el iframe

   Los mensajes de estado (⚠️ error, ⏳ cargando, 📺 sin directo) se muestran
   como capas encima del reproductor (overlays).
============================================================================= */
import { ref, computed, watchEffect, onMounted, onUnmounted } from 'vue'
import axios from 'axios'
import type { Channel } from '@/types/channel'
import { useVideoPlayer, useTwitchEmbedUrl, useYoutubeEmbedUrl } from '@/composables/useVideoPlayer'
import { useTitanSDK } from '@/composables/useTitanSDK'

// true en npm run dev, false en build de producción
const isDev = import.meta.env.DEV

// Canal que hay que reproducir — lo pasa el componente padre
const props = defineProps<{ channel: Channel }>()

// Dirección del servidor backend (donde consultamos el directo de YouTube)
const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

// Referencia al elemento <video> del HTML. useVideoPlayer() lo necesita para
// cargar HLS.js y gestionar el stream de vídeo.
const videoEl = ref<HTMLVideoElement | null>(null)

// Referencia al contenedor raíz del player (necesaria para leer coordenadas de pantalla)
const wrapRef = ref<HTMLElement | null>(null)

// SDK de Titan OS para el reproductor nativo (canales titanapp)
const { playerSetSource, playerSetRect, playerStop } = useTitanSDK()

// Ciclo de vida del player nativo para canales titanapp.
// Al montarse: lanza el stream y lo posiciona sobre esta área exacta.
// Al desmontarse: detiene el stream y libera el player nativo.
onMounted(async () => {
  if (props.channel.streamType !== 'titanapp') return
  const el = wrapRef.value
  if (!el) return
  const r   = el.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  await playerSetSource(props.channel.url)
  await playerSetRect(
    Math.round(r.x * dpr), Math.round(r.y * dpr),
    Math.round(r.width * dpr), Math.round(r.height * dpr),
  )
})

onUnmounted(async () => {
  if (props.channel.streamType === 'titanapp') await playerStop()
})

// Wrapped en computed para que useVideoPlayer() reaccione si el canal cambia
const channelRef = computed(() => props.channel)

// Shortcuts para saber el tipo de canal sin repetir la comparación
const isTwitch  = computed(() => props.channel.streamType === 'twitch')
const isYoutube = computed(() => props.channel.streamType === 'youtube')

// URL de embed calculada directamente de la URL del canal (cuando es posible).
// Ejemplo: "https://twitch.tv/marcatv" → URL de embed de Twitch
//          "https://youtu.be/VIDEOID"  → URL de embed de YouTube
// Si no se puede calcular (URL de canal YouTube), devuelve cadena vacía ''.
const staticEmbedUrl = computed(() => {
  if (isTwitch.value)  return useTwitchEmbedUrl(props.channel)
  if (isYoutube.value) return useYoutubeEmbedUrl(props.channel)
  return ''
})

// URL de embed obtenida del servidor (para canales YouTube sin ID de vídeo).
// Empieza null y se rellena cuando el servidor responde.
const resolvedEmbedUrl = ref<string | null>(null)
// Indica que estamos esperando la respuesta del servidor → mostramos "Conectando…"
const isResolving      = ref(false)

// watchEffect se ejecuta automáticamente cada vez que cambia cualquier variable
// reactiva que lea. Aquí: cuando cambia el canal o la URL estática.
// Objetivo: si es YouTube y no tenemos URL directa, preguntar al servidor.
watchEffect(async () => {
  // Si no es YouTube, o si ya tenemos la URL estática → no necesitamos el servidor
  if (!isYoutube.value || staticEmbedUrl.value) {
    resolvedEmbedUrl.value = null; return
  }

  isResolving.value = true
  resolvedEmbedUrl.value = null

  try {
    // Llamada al servidor: "¿qué vídeo está en directo ahora en este canal de YouTube?"
    const { data } = await axios.get<{ embedUrl: string | null }>(
      `${API}/channels/resolve-youtube`, { params: { url: props.channel.url } }
    )
    resolvedEmbedUrl.value = data.embedUrl  // null si el canal no está en directo
  } catch {
    resolvedEmbedUrl.value = null  // Error de red o servidor caído → sin vídeo
  } finally {
    isResolving.value = false  // Siempre desactivar el spinner al terminar
  }
})

// URL final para el iframe: prefiere la estática (más rápida), o la del servidor
const embedUrl = computed(() => staticEmbedUrl.value || resolvedEmbedUrl.value || '')

// Hook que gestiona el reproductor HLS: carga HLS.js, conecta el stream .m3u8
// al elemento <video>, y expone playerError si algo falla.
const { playerError } = useVideoPlayer(videoEl, channelRef)
</script>

<template>
  <!-- Contenedor cuadrado negro 16:9 (relación de aspecto de un televisor moderno) -->
  <div class="player-wrap" ref="wrapRef" :class="{ 'player-wrap--native': channel.streamType === 'titanapp' }">

    <!-- ── OVERLAY: Error en el stream HLS ─────────────────────────────────
         Aparece si HLS.js no puede cargar el .m3u8 (URL incorrecta, canal offline...) -->
    <div v-if="playerError" class="overlay">
      <span class="ov-icon">⚠️</span>
      <p class="ov-text">{{ playerError }}</p>
    </div>

    <!-- ── OVERLAY: Cargando YouTube ───────────────────────────────────────
         Mientras el servidor busca el directo de YouTube, mostramos un spinner. -->
    <div v-else-if="isYoutube && isResolving" class="overlay">
      <span class="ov-icon">⏳</span>
      <p class="ov-text">Conectando…</p>
    </div>

    <!-- ── OVERLAY: Canal YouTube sin directo activo ───────────────────────
         El canal de YouTube existe, pero no está transmitiendo en este momento.
         Ofrecemos un enlace para abrir el canal en la app de YouTube directamente. -->
    <div v-else-if="isYoutube && !embedUrl" class="overlay">
      <span class="ov-icon">📺</span>
      <p class="ov-text">Este canal no está en directo ahora mismo</p>
      <!-- target="_blank" → abrir en nueva pestaña/app
           rel="noopener noreferrer" → seguridad: la nueva pestaña no puede
           acceder a nuestra app mediante JavaScript -->
      <a :href="channel.url" target="_blank" rel="noopener noreferrer" class="open-btn">
        Abrir en YouTube ↗
      </a>
    </div>

    <!-- ── IFRAME: Twitch o YouTube ─────────────────────────────────────────
         Incrustamos la plataforma dentro de nuestra app mediante un iframe
         (como una ventana dentro de la ventana).
         v-else-if: solo si no hay error ni estamos cargando ni falta directo. -->
    <iframe
      v-else-if="isTwitch || isYoutube"
      :src="embedUrl"
      :title="channel.name"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
      class="player-iframe"
    />

    <!-- ── OVERLAY: Reproductor nativo Titan OS ──────────────────────────────
         Para canales titanapp (dazn://, netflix://…), el SDK gestiona el vídeo
         en una capa nativa del OS. Mostramos solo un indicador de estado.
         background:transparent permite que el vídeo nativo se vea debajo. -->
    <div v-else-if="channel.streamType === 'titanapp'" class="overlay overlay--native">
      <template v-if="isDev">
        <span class="ov-icon">📺</span>
        <p class="ov-text">Player nativo Titan OS</p>
        <code class="ov-url">{{ channel.url }}</code>
        <p class="ov-text"><small>Solo visible en TV real</small></p>
      </template>
    </div>

    <!-- ── VIDEO HLS ─────────────────────────────────────────────────────────
         Para streams .m3u8 (HLS), usamos el elemento nativo <video> del navegador.
         ref="videoEl" conecta este elemento con useVideoPlayer() que aplica HLS.js.
         controls → muestra los controles nativos de vídeo (play, volumen...)
         playsinline → en móvil, reproduce dentro de la página (no pantalla completa) -->
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

/* URL del deep link visible en dev mode para verificar sin consola ni ADB */
.ov-url {
  font-size: 0.7rem;
  color: var(--color-accent);
  word-break: break-all;
  background: rgba(0, 191, 255, 0.08);
  border-radius: 4px;
  padding: 4px 8px;
  max-width: 90%;
  text-align: center;
}

/* Transparent hole para Titan OS: el vídeo nativo del OS se ve a través del WebView */
.player-wrap--native {
  background: transparent;
}
.overlay--native {
  background: transparent;
  pointer-events: none;
}
</style>

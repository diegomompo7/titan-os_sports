<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/player/PromoPlayer.vue
   ¿QUÉ ES ESTO?
   Reproductor de publicidad para la franja inferior de la pantalla principal.
   Gestiona una playlist de clips y los reproduce en bucle.

   Soporta dos modos según el tipo de URL:
     - YouTube (youtube:// o youtube.com): usa un <iframe> con la URL de embed,
       igual que los canales YouTube normales de VideoPlayer.vue.
       YouTube gestiona la playlist y el bucle internamente.
     - Otras URLs (HLS, deeplinks DRM): usa el reproductor nativo de Titan OS
       con playerSetSource + playerSetRect (transparent hole del WebView).

   ¿Por qué dos modos?
   playerSetSource está pensado para streams HLS y deeplinks DRM (DAZN, Netflix).
   YouTube en Titan OS no se controla así — necesita un iframe embed.
   Intentar usar playerSetSource con una URL de YouTube produce una pantalla negra.
============================================================================= */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useTitanSDK } from '@/composables/useTitanSDK'

// ── Props ────────────────────────────────────────────────────────────────────
const props = defineProps<{
  // Array de URLs o deeplinks de los clips publicitarios.
  // YouTube: 'youtube://playlist?list=PLxxx' o 'https://youtube.com/playlist?list=PLxxx'
  // Otros:   'https://cdn.example.com/ad.m3u8', 'dazn://promo/...'
  playlist: string[]
}>()

// ── Estado ───────────────────────────────────────────────────────────────────

// true cuando la app corre con "npm run dev" (no en la TV real).
// En dev mostramos un overlay de depuración en lugar del vídeo.
const isDev = import.meta.env.DEV

// Referencia al div contenedor — usada solo para el modo native player,
// para calcular sus coordenadas en pantalla con getBoundingClientRect().
const containerRef = ref<HTMLElement | null>(null)

// Índice del clip activo (solo relevante en modo native player con varios clips).
const currentIndex = ref(0)

// ── Detección del tipo de URL ─────────────────────────────────────────────────

/*
 * ¿El primer clip de la playlist es una URL de YouTube?
 * Detecta tanto el scheme propio ('youtube://') como URLs web ('youtube.com').
 * Si es YouTube → modo iframe.
 * Si no → modo native player.
 */
const isYoutubeUrl = computed(() =>
  props.playlist[0]?.startsWith('youtube://') ||
  props.playlist[0]?.includes('youtube.com')
)

/*
 * Construye la URL de embed de YouTube para el iframe.
 * Extrae el ID de playlist del parámetro `list=` de la URL original.
 *
 * Ejemplo de entrada:  'youtube://playlist?list=PLAangdNFwyFH7ODyNy6Mh8cOmvzKdNGop'
 * Ejemplo de salida:   'https://www.youtube.com/embed/videoseries?list=PLAang...&autoplay=1&loop=1&rel=0&controls=0'
 *
 * Parámetros de la URL de embed:
 *   autoplay=1  → el vídeo arranca solo sin que el usuario pulse play
 *   loop=1      → al terminar la playlist, la reinicia desde el principio
 *   rel=0       → no muestra vídeos relacionados de otros canales al terminar
 *   controls=0  → oculta la barra de controles (modo publicidad sin interacción)
 */
const youtubeEmbedUrl = computed(() => {
  const url = props.playlist[0] ?? ''
  // Busca el parámetro 'list=XXXX' en la URL (puede ir precedido de '?' o '&')
  const match = url.match(/[?&]list=([^&]+)/)
  const listId = match?.[1]
  if (!listId) return ''
  return `https://www.youtube.com/embed/videoseries?list=${listId}&autoplay=1&loop=1&rel=0&controls=0`
})

// ── SDK (solo para URLs no-YouTube) ──────────────────────────────────────────

// Extraemos las funciones del SDK que usa el modo native player
const { playerSetSource, playerSetRect, playerStop, playerOnEnded, playerOffEnded } = useTitanSDK()

// ── Lógica de reproducción (modo native player) ───────────────────────────────

/*
 * Reproduce el clip en la posición `index` usando el reproductor nativo de Titan OS.
 * Solo se llama cuando isYoutubeUrl es false.
 *
 * Pasos:
 *   1. Leer la URL del clip
 *   2. Calcular las coordenadas del contenedor en pantalla física
 *   3. Pasar la URL al reproductor nativo
 *   4. Posicionar el reproductor sobre nuestro div (transparent hole)
 */
async function playAt(index: number) {
  const url = props.playlist[index]
  if (!url) return                    // Sin URL → no hacer nada
  if (!containerRef.value) return     // DOM no listo → no hacer nada

  // Coordenadas del div en píxeles CSS
  const r   = containerRef.value.getBoundingClientRect()
  // Convertir a píxeles físicos (importante en pantallas 4K con devicePixelRatio > 1)
  const dpr = window.devicePixelRatio || 1

  // Indicar al reproductor nativo qué URL reproducir
  await playerSetSource(url)

  // Posicionar el reproductor nativo exactamente sobre este div.
  // El reproductor se pinta en una capa del SO por debajo del WebView.
  await playerSetRect(
    Math.round(r.x * dpr),
    Math.round(r.y * dpr),
    Math.round(r.width * dpr),
    Math.round(r.height * dpr),
  )
}

/*
 * Callback para el evento 'ended' del native player.
 * Avanza al siguiente clip en bucle.
 */
async function onVideoEnded() {
  currentIndex.value = (currentIndex.value + 1) % props.playlist.length
  await playAt(currentIndex.value)
}

// ── Ciclo de vida ────────────────────────────────────────────────────────────

/*
 * Al montar el componente:
 * - Si es YouTube: el iframe arranca solo (autoplay=1 en la URL), no hay nada que hacer.
 * - Si no es YouTube: iniciar el native player y registrar el listener de fin de clip.
 */
onMounted(async () => {
  if (isYoutubeUrl.value) return          // YouTube gestiona autoplay internamente
  if (!props.playlist.length) return      // Sin clips → no hacer nada
  await playAt(0)
  await playerOnEnded(onVideoEnded)
})

/*
 * Al desmontar el componente (modo Teatro, Multi, cierre de app, etc.):
 * - Si es YouTube: el iframe se destruye solo con el componente, sin cleanup extra.
 * - Si no es YouTube: liberar el reproductor nativo y eliminar el listener.
 */
onUnmounted(async () => {
  if (isYoutubeUrl.value) return
  await playerOffEnded(onVideoEnded)
  await playerStop()
})
</script>

<template>
  <!--
    Contenedor principal.
    En modo YouTube: el iframe rellena este div directamente (fondo visible).
    En modo native player: este div es transparente (transparent hole del WebView).
  -->
  <div class="promo-player" ref="containerRef">

    <!--
      MODO DESARROLLO (npm run dev):
      Mostramos un overlay informativo en lugar del vídeo real,
      indicando si usará iframe o native player.
    -->
    <div v-if="isDev && playlist.length" class="pp-dev-overlay">
      <span class="pp-icon">📺</span>
      <span class="pp-counter">Promo · {{ isYoutubeUrl ? 'YouTube iframe' : 'Native player' }}</span>
      <span class="pp-url">{{ playlist[currentIndex] }}</span>
    </div>

    <!--
      YOUTUBE (producción):
      Iframe con la URL de embed. YouTube gestiona el autoplay y el bucle
      a través de los parámetros de la URL (autoplay=1&loop=1).
    -->
    <iframe
      v-else-if="isYoutubeUrl && youtubeEmbedUrl"
      :src="youtubeEmbedUrl"
      class="pp-iframe"
      allowfullscreen
      allow="autoplay; encrypted-media; picture-in-picture"
      title="Publicidad"
    />

    <!--
      SIN CLIPS: la playlist está vacía, mostramos un placeholder.
    -->
    <div v-else-if="!playlist.length" class="pp-empty">
      <span>📺 Sin clips</span>
    </div>

    <!--
      NATIVE PLAYER (producción, URLs no-YouTube):
      El div queda transparente. El reproductor nativo de Titan OS
      se pinta en la capa del SO por debajo del WebView.
      No hay elementos HTML que añadir aquí.
    -->

  </div>
</template>

<style scoped>
/* ── Contenedor principal ── */
/* En modo native player debe ser transparente (transparent hole).
   En modo YouTube el iframe lo rellena directamente. */
.promo-player {
  width: 100%;
  height: 100%;
  background: transparent;
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
}

/* ── Iframe YouTube ── */
/* Ocupa todo el área del contenedor, sin borde ni márgenes. */
.pp-iframe {
  width: 100%;
  height: 100%;
  border: none;
  display: block;
}

/* ── Overlay de depuración (solo en npm run dev) ── */
.pp-dev-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  background: rgba(192, 57, 43, 0.75);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  text-align: center;
  padding: var(--space-3);
}
.pp-icon    { font-size: 2rem; opacity: 0.7; }
.pp-counter { font-size: 0.9rem; }
.pp-url     { font-size: 0.65rem; opacity: 0.65; word-break: break-all; max-width: 90%; }

/* ── Estado vacío ── */
.pp-empty {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-text-muted);
  font-size: 0.85rem;
}
</style>

<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/player/PromoPlayer.vue
   ¿QUÉ ES ESTO?
   Reproductor de publicidad para la franja inferior de la pantalla principal.
   Gestiona una lista de clips (playlist) y los reproduce en bucle usando
   el reproductor nativo de Titan OS, igual que los canales titanapp.

   Flujo de reproducción:
     1. Al montar el componente → reproduce el primer clip
     2. Cuando el clip termina (evento 'ended' del SDK) → reproduce el siguiente
     3. Al llegar al último clip → vuelve al primero (bucle infinito)
     4. Al desmontar → libera el reproductor nativo

   Titan OS "transparent hole":
   El reproductor nativo del sistema operativo se pinta en una capa DEBAJO
   del WebView. Para verlo, este componente tiene fondo transparente
   (un "agujero" a través del cual se ve la capa de vídeo nativa).

   En desarrollo (navegador):
   Como no hay TV real, se muestra un overlay de depuración con el índice
   del clip activo para verificar que la lógica de playlist funciona.
============================================================================= */
import { ref, onMounted, onUnmounted } from 'vue'
import { useTitanSDK } from '@/composables/useTitanSDK'

// ── Props ────────────────────────────────────────────────────────────────────
const props = defineProps<{
  // Array de URLs o deeplinks de los clips publicitarios.
  // Ejemplos: 'https://cdn.example.com/ad1.mp4', 'titanapp://promo/clip2'
  playlist: string[]
}>()

// ── Estado ───────────────────────────────────────────────────────────────────

// true cuando la app corre con "npm run dev" (no en la TV real).
// Controla si mostrar el overlay de depuración.
const isDev = import.meta.env.DEV

// Referencia al div contenedor del player en el DOM.
// Necesaria para leer su posición y tamaño con getBoundingClientRect(),
// que luego se pasa a playerSetRect() para alinear el vídeo nativo.
const containerRef = ref<HTMLElement | null>(null)

// Índice del clip que se está reproduciendo ahora mismo (0 = primer clip).
// Reactivo: si cambia, la plantilla actualiza el overlay de depuración.
const currentIndex = ref(0)

// ── SDK ──────────────────────────────────────────────────────────────────────

// Extraemos del SDK solo las funciones necesarias para este componente
const { playerSetSource, playerSetRect, playerStop, playerOnEnded, playerOffEnded } = useTitanSDK()

// ── Lógica de reproducción ───────────────────────────────────────────────────

/*
 * Reproduce el clip en la posición `index` de la playlist.
 *
 * Pasos internos:
 *   1. Leer la URL del clip en esa posición
 *   2. Calcular dónde está el div en la pantalla física
 *   3. Decirle al reproductor nativo qué vídeo reproducir
 *   4. Decirle al reproductor nativo en qué coordenadas pintarse
 */
async function playAt(index: number) {
  // Obtener la URL del clip en esa posición
  const url = props.playlist[index]
  if (!url) return                    // Lista vacía o índice fuera de rango → no hacer nada
  if (!containerRef.value) return     // DOM no montado todavía → no hacer nada

  // getBoundingClientRect() devuelve la posición y tamaño del div en píxeles CSS
  const r   = containerRef.value.getBoundingClientRect()

  // devicePixelRatio convierte píxeles CSS a píxeles físicos de pantalla.
  // En una TV 4K con escala 2×: 1 píxel CSS = 2 píxeles físicos.
  const dpr = window.devicePixelRatio || 1

  // Paso 1: pasar la URL del vídeo al reproductor nativo
  await playerSetSource(url)

  // Paso 2: posicionar el reproductor nativo exactamente sobre nuestro div.
  // Math.round elimina decimales (el SDK espera enteros).
  await playerSetRect(
    Math.round(r.x * dpr),       // distancia desde el borde izquierdo de la pantalla
    Math.round(r.y * dpr),       // distancia desde el borde superior de la pantalla
    Math.round(r.width * dpr),   // ancho del área de vídeo
    Math.round(r.height * dpr),  // alto del área de vídeo
  )
}

/*
 * Callback que el SDK llama cuando el clip actual termina de reproducirse.
 * Calcula el índice del siguiente clip usando módulo (%) para hacer el bucle:
 *   - Clip 0 → 1 → 2 → 0 → 1 → ... (bucle infinito)
 */
async function onVideoEnded() {
  // (currentIndex + 1) % playlist.length: cuando llegamos al último, vuelve a 0
  currentIndex.value = (currentIndex.value + 1) % props.playlist.length
  await playAt(currentIndex.value)
}

// ── Ciclo de vida ────────────────────────────────────────────────────────────

/*
 * onMounted: se ejecuta cuando el div ya está en el DOM (coordenadas disponibles).
 *   1. Si no hay clips, salir sin hacer nada
 *   2. Reproducir el primer clip (índice 0)
 *   3. Registrar el callback de fin de vídeo para que la playlist avance sola
 */
onMounted(async () => {
  if (!props.playlist.length) return
  await playAt(0)
  await playerOnEnded(onVideoEnded)
})

/*
 * onUnmounted: se ejecuta cuando el componente se destruye
 * (usuario cambia a modo Teatro/Multi, cierra la app, etc.).
 *   1. Quitar el callback de fin de vídeo (evita llamadas sobre componente destruido)
 *   2. Detener el reproductor nativo y liberar sus recursos
 */
onUnmounted(async () => {
  await playerOffEnded(onVideoEnded)
  await playerStop()
})
</script>

<template>
  <!--
    Contenedor principal del reproductor de publicidad.
    ref="containerRef" → permite leer su posición con getBoundingClientRect().
    background: transparent → "agujero" para que el reproductor nativo se vea debajo.
  -->
  <div class="promo-player" ref="containerRef">

    <!--
      MODO DESARROLLO (npm run dev):
      En el navegador no hay reproductor nativo, así que mostramos un overlay
      con información del clip activo para depurar la lógica de playlist.
      Se oculta automáticamente en producción (build para TV).
    -->
    <div v-if="isDev && playlist.length" class="pp-dev-overlay">
      <span class="pp-icon">📺</span>
      <span class="pp-counter">Promo {{ currentIndex + 1 }} / {{ playlist.length }}</span>
      <!-- URL del clip activo — útil para verificar que avanza correctamente -->
      <span class="pp-url">{{ playlist[currentIndex] }}</span>
    </div>

    <!--
      PLAYLIST VACÍA: no hay clips configurados todavía.
      Se muestra mientras el administrador no haya añadido URLs de publicidad.
    -->
    <div v-else-if="!playlist.length" class="pp-empty">
      <span>📺 Sin clips</span>
    </div>

    <!--
      MODO PRODUCCIÓN (TV Titan OS):
      Cuando hay clips y no estamos en dev, este div queda completamente transparente.
      El reproductor nativo del sistema pinta el vídeo en la capa inferior.
      No se renderiza ningún elemento HTML adicional.
    -->

  </div>
</template>

<style scoped>
/* ── Contenedor principal ── */
/* Ocupa todo el espacio que le asigne el padre (.promo-video en ChannelGrid).
   background: transparent es esencial → es el "agujero" por el que se ve
   el reproductor nativo de Titan OS pintado en la capa inferior del WebView. */
.promo-player {
  width: 100%;
  height: 100%;
  background: transparent;
  border-radius: var(--radius-md);
  overflow: hidden;
  position: relative;
}

/* ── Overlay de depuración (solo en npm run dev) ── */
/* Fondo rojo semitransparente para distinguir visualmente el área de publicidad
   mientras se trabaja en el navegador sin TV real. */
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
/* URL del clip: letra pequeña para que no tape el indicador de posición */
.pp-url {
  font-size: 0.65rem;
  opacity: 0.65;
  word-break: break-all;
  max-width: 90%;
}

/* ── Estado vacío (sin clips configurados) ── */
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

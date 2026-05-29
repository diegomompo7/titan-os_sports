<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/player/ChannelPreview.vue
   ¿QUÉ ES ESTO?
   La "ventana flotante de vista previa" que aparece en la esquina inferior
   derecha de la pantalla cuando el usuario pasa el ratón por encima de una
   tarjeta de canal (sin llegar a hacer clic).

   Piénsalo como el recuadro de "siguiente programa" que aparece en algunas
   pantallas de TV: sin cambiar el canal principal, puedes ver qué hay en otro.

   Características:
     - Aparece con una animación de deslizamiento desde abajo (slide-up)
     - Espera 500ms antes de iniciar el reproductor, para evitar que se carguen
       streams si el usuario simplemente pasa rápido el D-pad por varios canales
     - Para canales HLS/Twitch/YouTube → muestra el VideoPlayer real
     - Para canales Web/TitanApp → muestra el logo del canal (no se pueden
       previsualizar porque son apps externas, no streams directos)
     - Clic en la caja → abre el canal en pantalla completa
     - Clic en el botón ✕ → cierra el preview sin abrir el canal

   Este componente se crea/destruye cada vez que el usuario cambia el foco —
   cuando se destruye (onUnmounted), cancela el temporizador de 500ms para
   no arrancar un reproductor de un canal que ya no está seleccionado.
============================================================================= */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

// Canal que hay que previsualizar — lo pasa HomeView cuando el usuario hace hover
const props = defineProps<{ channel: Channel }>()

// Eventos que este componente puede enviar:
//   open  → el usuario hizo clic → abrir el canal en pantalla completa
//   close → el usuario cerró el preview → ocultar la cajita
const emit = defineEmits<{ open: [Channel]; close: [] }>()

// Indica si ya han pasado los 500ms de gracia antes de iniciar el reproductor.
// Empieza en false y se pone a true cuando el temporizador dispara.
const ready = ref(false)

// Guardamos el ID del temporizador para poder cancelarlo si el componente
// se destruye antes de que pasen los 500ms (usuario movió el D-pad rápido).
let timer: ReturnType<typeof setTimeout> | null = null

// Al montar el componente (aparece en pantalla), iniciar el temporizador de 500ms
onMounted(() => { timer = setTimeout(() => (ready.value = true), 500) })

// Al desmontar (usuario cambió el foco a otro canal), cancelar el temporizador
// si todavía no había disparado. Evita cargar un stream de un canal ya olvidado.
onUnmounted(() => { if (timer) clearTimeout(timer) })

// ¿Este canal se puede previsualizar con un reproductor de vídeo?
// Solo HLS, Twitch y YouTube tienen stream que podemos incrustar.
// Web y TitanApp son apps externas → no se pueden previsualizar.
const isStreamable = computed(() =>
  ['hls', 'twitch', 'youtube'].includes(props.channel.streamType)
)

// Genera las iniciales del canal para el placeholder cuando no hay logo.
// "La Liga TV" → "LL",  "ESPN" → "ES"
function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
</script>

<template>
  <!-- <Transition> aplica la animación CSS "preview-slide" al entrar y salir.
       El componente padre (HomeView) crea/destruye este componente con v-if,
       y la transición lo hace aparecer suavemente desde abajo. -->
  <Transition name="preview-slide">
    <!-- Caja flotante. @click en la caja abre el canal en pantalla completa.
         Posición fija en la esquina inferior derecha (2rem desde los bordes). -->
    <div class="preview-box" @click="emit('open', channel)">

      <!-- ── ZONA DE VÍDEO (arriba, proporción 16:9) ──────────────────────
           SI el canal es reproducible Y ya pasaron los 500ms → VideoPlayer real
           SI no → placeholder con logo o iniciales del canal -->
      <div class="preview-player">
        <VideoPlayer v-if="ready && isStreamable" :channel="channel" :muted="true" />
        <!-- Placeholder: se muestra mientras espera los 500ms o si no hay stream -->
        <div v-else class="preview-placeholder">
          <img v-if="channel.logoUrl" :src="channel.logoUrl" :alt="channel.name" class="ph-logo" />
          <span v-else class="ph-initials">{{ getInitials(channel.name) }}</span>
        </div>
      </div>

      <!-- ── BARRA DE INFORMACIÓN (abajo) ─────────────────────────────────
           Logo pequeño + nombre del canal + texto "Pulsa para ver" -->
      <div class="preview-info">
        <div class="pi-left">
          <img v-if="channel.logoUrl" :src="channel.logoUrl" :alt="channel.name" class="pi-logo" />
          <span v-else class="pi-initials">{{ getInitials(channel.name) }}</span>
          <span class="pi-name">{{ channel.name }}</span>
        </div>
        <span class="pi-hint">Pulsa para ver</span>
      </div>

      <!-- ── BOTÓN CERRAR (X) ──────────────────────────────────────────────
           @click.stop evita que el clic en la X también abra el canal
           (sin .stop, el clic se propagaría al @click de preview-box). -->
      <button class="preview-close" title="Cerrar preview" @click.stop="emit('close')">✕</button>
    </div>
  </Transition>
</template>

<style scoped>
.preview-box {
  width: 100%;
  background: var(--color-bg-surface);
  border: 2px solid var(--color-accent);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), var(--focus-ring);
  cursor: pointer;
  transition: transform 0.12s;
}
.preview-box:hover { transform: scale(1.015); }

/* Player 16:9 */
.preview-player {
  width: 100%;
  aspect-ratio: 16 / 9;
  background: #000;
}

/* Placeholder cuando no hay stream o está cargando */
.preview-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #08090e;
}
.ph-logo {
  max-width: 60%;
  max-height: 60%;
  object-fit: contain;
  opacity: 0.7;
}
.ph-initials {
  font-size: 3rem;
  font-weight: 800;
  color: var(--color-accent);
  opacity: 0.5;
}

/* Barra inferior */
.preview-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
  padding: var(--space-2) var(--space-3);
  background: var(--color-bg-surface);
}
.pi-left {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}
.pi-logo {
  width: 1.6rem;
  height: 1.6rem;
  border-radius: var(--radius-sm);
  object-fit: contain;
  flex-shrink: 0;
}
.pi-initials {
  width: 1.6rem;
  height: 1.6rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: 800;
  color: var(--color-accent);
  background: var(--color-accent-dim);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.pi-name {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pi-hint {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  flex-shrink: 0;
}

/* Botón cerrar */
.preview-close {
  position: absolute;
  top: 0.4rem;
  right: 0.4rem;
  width: 1.6rem;
  height: 1.6rem;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 0.65rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.7;
  transition: opacity 0.12s;
  z-index: 1;
}
.preview-close:hover { opacity: 1; }

/* Transición slide-up desde abajo */
.preview-slide-enter-active,
.preview-slide-leave-active {
  transition: transform 0.22s ease, opacity 0.22s ease;
}
.preview-slide-enter-from,
.preview-slide-leave-to {
  transform: translateY(1.5rem);
  opacity: 0;
}
</style>

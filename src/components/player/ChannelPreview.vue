<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channel: Channel }>()
const emit  = defineEmits<{ open: [Channel]; close: [] }>()

// Esperar 500ms antes de arrancar el player para evitar cargas en scroll rápido
const ready = ref(false)
let timer: ReturnType<typeof setTimeout> | null = null
onMounted(() => { timer = setTimeout(() => (ready.value = true), 500) })
onUnmounted(() => { if (timer) clearTimeout(timer) })

const isStreamable = computed(() =>
  ['hls', 'twitch', 'youtube'].includes(props.channel.streamType)
)

function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
</script>

<template>
  <Transition name="preview-slide">
    <div class="preview-box" @click="emit('open', channel)">

      <!-- Player o logo -->
      <div class="preview-player">
        <VideoPlayer v-if="ready && isStreamable" :channel="channel" />
        <div v-else class="preview-placeholder">
          <img v-if="channel.logoUrl" :src="channel.logoUrl" :alt="channel.name" class="ph-logo" />
          <span v-else class="ph-initials">{{ getInitials(channel.name) }}</span>
        </div>
      </div>

      <!-- Info del canal -->
      <div class="preview-info">
        <div class="pi-left">
          <img v-if="channel.logoUrl" :src="channel.logoUrl" :alt="channel.name" class="pi-logo" />
          <span v-else class="pi-initials">{{ getInitials(channel.name) }}</span>
          <span class="pi-name">{{ channel.name }}</span>
        </div>
        <span class="pi-hint">Pulsa para ver</span>
      </div>

      <!-- Cerrar -->
      <button class="preview-close" title="Cerrar preview" @click.stop="emit('close')">✕</button>
    </div>
  </Transition>
</template>

<style scoped>
.preview-box {
  position: fixed;
  bottom: 2rem;
  right: 2rem;
  width: 28vw;
  min-width: 240px;
  max-width: 480px;
  background: var(--color-bg-surface);
  border: 2px solid var(--color-accent);
  border-radius: var(--radius-md);
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.6), var(--focus-ring);
  cursor: pointer;
  z-index: 200;
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

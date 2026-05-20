<script setup lang="ts">
import { computed } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channels: Channel[] }>()
const emit = defineEmits<{ remove: [id: string]; close: [] }>()

const cols = computed(() => {
  const n = props.channels.length
  if (n <= 2) return n || 1
  if (n <= 4) return 2
  if (n <= 9) return 3
  return 4
})

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${cols.value}, 1fr)`,
}))
</script>

<template>
  <div class="multistream-overlay">
    <div class="multistream-header">
      <span class="multistream-title">⊞ Multi-stream</span>
      <span class="multistream-hint">
        {{ channels.length ? `${channels.length} canal${channels.length > 1 ? 'es' : ''}` : 'Selecciona canales de la lista' }}
      </span>
      <button class="multistream-close" @click="emit('close')">✕ Salir</button>
    </div>
    <div class="multistream-grid" :style="gridStyle">
      <div v-for="ch in channels" :key="ch.id" class="stream-slot">
        <div class="slot-header">
          <span class="slot-name">{{ ch.name }}</span>
          <button class="slot-remove" @click="emit('remove', ch.id)">✕</button>
        </div>
        <VideoPlayer :channel="ch" />
      </div>
      <div v-if="channels.length === 0" class="stream-slot empty">
        <span>Haz click en un canal de la lista para añadirlo</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.multistream-overlay {
  background: var(--color-bg-base);
  display: flex;
  flex-direction: column;
  height: 100%;
}
.multistream-header {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-lg);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.multistream-title {
  font-weight: 700;
  color: var(--color-accent);
  font-size: 0.9rem;
}
.multistream-hint {
  color: var(--color-text-muted);
  font-size: 0.75rem;
  flex: 1;
}
.multistream-close {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  padding: 4px 10px;
  transition: color 0.15s, border-color 0.15s;
}
.multistream-close:hover {
  border-color: var(--color-danger);
  color: var(--color-danger);
}
.multistream-grid {
  display: grid;
  flex: 1;
  gap: 2px;
  overflow: hidden;
  padding: 2px;
}
.stream-slot {
  background: #000;
  border-radius: var(--radius-sm);
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.stream-slot.empty {
  align-items: center;
  background: var(--color-bg-surface);
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.8rem;
  justify-content: center;
  grid-column: 1 / -1;
}
.slot-header {
  align-items: center;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  gap: var(--space-xs);
  justify-content: space-between;
  padding: 4px 8px;
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 1;
}
.slot-name {
  color: #fff;
  font-size: 0.75rem;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-remove {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  font-size: 0.75rem;
  flex-shrink: 0;
  padding: 0 2px;
  transition: color 0.15s;
}
.slot-remove:hover {
  color: #ff4444;
}
:deep(.player-wrap) {
  border-radius: 0;
  height: 100%;
  flex: 1;
}
</style>

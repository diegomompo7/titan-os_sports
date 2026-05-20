<script setup lang="ts">
import { computed } from 'vue'
import type { Channel } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'

const props = defineProps<{ channel: Channel; isAdmin: boolean; isLive?: boolean }>()
const emit = defineEmits<{ select: [Channel]; edit: [Channel]; delete: [Channel] }>()

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

const streamTypeLabel = computed(() => {
  const labels: Record<string, string> = { hls: 'HLS', twitch: 'Twitch', youtube: 'YouTube', web: 'Web' }
  return labels[props.channel.streamType] ?? props.channel.streamType
})
</script>

<template>
  <div class="channel-card" @click="emit('select', channel)">
    <div class="channel-logo">
      <img v-if="channel.logoUrl" :src="channel.logoUrl" :alt="channel.name" />
      <span v-else class="channel-initials">{{ initials(channel.name) }}</span>
    </div>

    <div class="channel-info">
      <span class="channel-name">
        {{ channel.name }}
        <span v-if="channel.streamType === 'web'" class="web-badge" title="Abre en navegador">↗</span>
        <span v-if="isLive" class="live-badge">● LIVE</span>
      </span>
      <div class="channel-meta">
        <span class="channel-badge">{{ CATEGORY_LABELS[channel.category] }}</span>
        <span class="stream-type-badge" :data-type="channel.streamType">{{ streamTypeLabel }}</span>
      </div>
    </div>

    <div v-if="isAdmin" class="channel-actions" @click.stop>
      <button class="btn-icon" title="Editar" @click="emit('edit', channel)">✏️</button>
      <button class="btn-icon btn-danger" title="Eliminar" @click="emit('delete', channel)">🗑️</button>
    </div>
  </div>
</template>

<style scoped>
.channel-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  position: relative;
  width: 100%;
}
.channel-card:hover {
  border-color: var(--color-accent);
  background: rgba(0, 191, 255, 0.05);
}
.channel-logo {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.channel-logo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.channel-initials {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-accent);
}
.channel-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.channel-name {
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 4px;
}
.web-badge {
  font-size: 0.75rem;
  color: var(--color-accent);
  flex-shrink: 0;
}
.channel-meta {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  flex-wrap: wrap;
}
.channel-badge {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.stream-type-badge {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  display: inline-block;
}
.stream-type-badge[data-type='youtube'] {
  background: rgba(255, 0, 0, 0.15);
  color: #ff4444;
}
.stream-type-badge[data-type='twitch'] {
  background: rgba(145, 70, 255, 0.15);
  color: #9146ff;
}
.stream-type-badge[data-type='hls'] {
  background: rgba(0, 191, 255, 0.1);
  color: var(--color-accent);
}
.stream-type-badge[data-type='web'] {
  background: rgba(107, 114, 128, 0.2);
  color: var(--color-text-muted);
}
.live-badge {
  font-size: 0.65rem;
  font-weight: 700;
  color: #ff4444;
  letter-spacing: 0.04em;
  animation: live-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}
@keyframes live-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
.channel-actions {
  display: flex;
  gap: var(--space-xs);
  opacity: 0;
  transition: opacity 0.15s;
}
.channel-card:hover .channel-actions {
  opacity: 1;
}
.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: var(--radius-sm);
  font-size: 0.85rem;
  line-height: 1;
}
.btn-icon:hover {
  background: var(--color-border);
}
</style>

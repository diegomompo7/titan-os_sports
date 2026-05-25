<script setup lang="ts">
import { computed, ref, watchEffect, nextTick } from 'vue'
import type { Channel } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useEventsStore } from '@/stores/events'

const props = defineProps<{ channel: Channel; isAdmin: boolean; isLive?: boolean }>()
const emit = defineEmits<{ select: [Channel]; edit: [Channel]; delete: [Channel] }>()

const favStore = useFavoritesStore()
const eventsStore = useEventsStore()

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

// Marquee nombre de canal
const nameRef = ref<HTMLElement | null>(null)
const nameOverflows = ref(false)
watchEffect(() => {
  void props.channel.name // dependencia reactiva
  nextTick(() => {
    const el = nameRef.value
    if (!el) return
    nameOverflows.value = el.scrollWidth > (el.parentElement?.clientWidth ?? 0)
  })
})

// Marquee solo si el texto desborda el contenedor
const titleTextRef = ref<HTMLElement | null>(null)
const titleOverflows = ref(false)

watchEffect(() => {
  const event = eventsStore.getNextEvent(props.channel.id) // dependencia reactiva
  if (!event) { titleOverflows.value = false; return }
  nextTick(() => {
    const el = titleTextRef.value
    if (!el) return
    titleOverflows.value = el.scrollWidth > (el.parentElement?.clientWidth ?? 0)
  })
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
        <span class="name-wrap">
          <span ref="nameRef" class="name-text" :class="{ scrolling: nameOverflows }">
            {{ channel.name }}
          </span>
        </span>
        <span v-if="channel.streamType === 'web'" class="web-badge" title="Abre en navegador">↗</span>
        <span v-if="isLive" class="live-badge">● LIVE</span>
      </span>
      <div class="channel-meta">
        <span class="channel-badge">{{ CATEGORY_LABELS[channel.category] }}</span>
        <span class="stream-type-badge" :data-type="channel.streamType">{{ streamTypeLabel }}</span>
      </div>
      <div v-if="eventsStore.getNextEvent(channel.id)" class="event-row">
        <span class="event-title-wrap">
          <span
            ref="titleTextRef"
            class="event-title-text"
            :class="{ scrolling: titleOverflows }"
          >📅 {{ eventsStore.getNextEvent(channel.id)!.title }}</span>
        </span>
        <em class="event-countdown">
          {{ eventsStore.formatCountdown(eventsStore.getNextEvent(channel.id)!.scheduledAt) }}
        </em>
      </div>
    </div>

    <button
      class="btn-fav"
      :class="{ active: favStore.isFavorite(channel.id) }"
      :title="favStore.isFavorite(channel.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'"
      @click.stop="favStore.toggle(channel.id)"
    >{{ favStore.isFavorite(channel.id) ? '⭐' : '☆' }}</button>

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
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  overflow: hidden;
}
.name-wrap {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}
.name-text {
  display: inline-block;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-text-primary);
  white-space: nowrap;
}
.name-text.scrolling {
  animation: marquee-scroll 14s linear infinite;
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
.event-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 2px;
  overflow: hidden;
}
.event-title-wrap {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}
.event-title-text {
  display: inline-block;
  font-size: 0.65rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.event-title-text.scrolling {
  animation: marquee-scroll 14s linear infinite;
}
@keyframes marquee-scroll {
  0%, 15%   { transform: translateX(0); }
  85%, 100% { transform: translateX(-100%); }
}
.event-countdown {
  font-style: normal;
  font-weight: 700;
  font-size: 0.65rem;
  color: #f5a623;
  flex-shrink: 0;
  white-space: nowrap;
}
.btn-fav {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 6px;
  border-radius: var(--radius-sm);
  opacity: 0.3;
  transition: opacity 0.15s;
  flex-shrink: 0;
  line-height: 1;
}
.btn-fav:hover,
.btn-fav.active {
  opacity: 1;
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

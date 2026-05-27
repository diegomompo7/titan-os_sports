<script setup lang="ts">
/**
 * ChannelCard — Tarjeta de canal para Titan OS (1366×768).
 *
 * Diseño TV-first:
 * - Tipografía grande y legible desde distancia
 * - Focus visual prominente (anillo cian) como indicador de selección con mando
 * - Botones de admin siempre visibles (no dependen de hover)
 * - Modo compacto (sidebar) para las vistas Teatro y Multi
 */
import { computed, ref, watchEffect, nextTick } from 'vue'
import type { Channel } from '@/types/channel'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useEventsStore }    from '@/stores/events'

const props = defineProps<{
  channel:      Channel
  isAdmin:      boolean
  isLive?:      boolean
  isFocused?:   boolean   // Foco por teclado / mando — muestra anillo visual
  compactMode?: boolean   // true en sidebar (teatro/multi): layout más pequeño
}>()

const emit = defineEmits<{
  select: [Channel]
  edit:   [Channel]
  delete: [Channel]
}>()

const favStore    = useFavoritesStore()
const eventsStore = useEventsStore()

// Iniciales del canal (máximo 2 letras) cuando no hay logo
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

const streamTypeLabel = computed(() => {
  const labels: Record<string, string> = {
    hls:     'HLS',
    twitch:  'Twitch',
    youtube: 'YouTube',
    web:     'Web',
  }
  return labels[props.channel.streamType] ?? props.channel.streamType
})

const nextEvent = computed(() => eventsStore.getNextEvent(props.channel.id))

// Marquee: scroll automático si el título del evento desborda
const eventTitleRef     = ref<HTMLElement | null>(null)
const eventTitleScrolls = ref(false)

watchEffect(() => {
  const event = nextEvent.value
  if (!event) { eventTitleScrolls.value = false; return }
  nextTick(() => {
    const el = eventTitleRef.value
    if (!el) return
    eventTitleScrolls.value = el.scrollWidth > (el.parentElement?.clientWidth ?? 0)
  })
})
</script>

<template>
  <article
    class="card"
    :class="{
      'card--focused':  isFocused,
      'card--live':     isLive,
      'card--compact':  compactMode,
    }"
    role="button"
    tabindex="0"
    :aria-label="`Ver ${channel.name}${isLive ? ' — EN DIRECTO' : ''}`"
    @click="emit('select', channel)"
    @keydown.enter.prevent="emit('select', channel)"
    @keydown.space.prevent="emit('select', channel)"
  >
    <!-- ── Logo / Miniatura ── -->
    <div class="card-thumb">
      <img
        v-if="channel.logoUrl"
        :src="channel.logoUrl"
        :alt="channel.name"
        class="thumb-img"
        loading="lazy"
      />
      <span v-else class="thumb-initials">{{ getInitials(channel.name) }}</span>

      <!-- Badge EN DIRECTO -->
      <span v-if="isLive" class="live-badge">● LIVE</span>

      <!-- Icono web (enlace externo) -->
      <span v-if="channel.streamType === 'web'" class="web-badge" title="Abre en nueva pestaña">↗</span>
    </div>

    <!-- ── Info del canal ── -->
    <div class="card-info">
      <!-- Nombre + favorito -->
      <div class="info-row name-row">
        <span class="channel-name" :title="channel.name">{{ channel.name }}</span>
        <button
          class="fav-btn"
          :class="{ 'fav-btn--active': favStore.isFavorite(channel.id) }"
          :title="favStore.isFavorite(channel.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'"
          @click.stop="favStore.toggle(channel.id)"
          tabindex="-1"
        >{{ favStore.isFavorite(channel.id) ? '⭐' : '☆' }}</button>
      </div>

      <!-- Badges categoría + tipo (ocultos en compacto) -->
      <div v-if="!compactMode" class="info-row badges-row">
        <span class="badge badge-cat">
          {{ CATEGORY_ICONS[channel.category] ?? '🏆' }}
          {{ CATEGORY_LABELS[channel.category] ?? channel.category }}
        </span>
        <span class="badge badge-type" :data-type="channel.streamType">{{ streamTypeLabel }}</span>
      </div>

      <!-- Próximo evento -->
      <div v-if="nextEvent && !compactMode" class="info-row event-row">
        <div class="event-title-wrap">
          <span
            ref="eventTitleRef"
            class="event-title"
            :class="{ 'event-title--scrolling': eventTitleScrolls }"
          >📅 {{ nextEvent.title }}</span>
        </div>
        <em class="event-countdown">{{ eventsStore.formatCountdown(nextEvent.scheduledAt) }}</em>
      </div>

      <!-- Botones admin — siempre visibles (TV: no hay hover) -->
      <div v-if="isAdmin" class="admin-actions" @click.stop>
        <button class="admin-btn" title="Editar" @click="emit('edit', channel)">✏️</button>
        <button class="admin-btn admin-btn--del" title="Eliminar" @click="emit('delete', channel)">🗑️</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* ── Tarjeta base ── */
.card {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  overflow: hidden;
  outline: none;
  user-select: none;
  transition: border-color 0.12s, background 0.12s, transform 0.1s;
}

/* Hover del ratón */
.card:hover {
  border-color: rgba(0,191,255,0.5);
  background: rgba(0,191,255,0.04);
}

/* Foco activo — anillo prominente para navegación con mando */
.card--focused {
  border-color: var(--color-accent) !important;
  background: var(--color-accent-dim) !important;
  box-shadow: var(--focus-ring);
  transform: scale(1.03);
}

.card--live {
  border-color: rgba(255,68,68,0.3);
}
.card--live.card--focused {
  border-color: var(--color-accent) !important;
}

/* Modo compacto (sidebar) */
.card--compact {
  flex-direction: row;
  align-items: center;
  border-radius: var(--radius-sm);
}

/* ── Miniatura (logo) ── */
.card-thumb {
  aspect-ratio: 16 / 9;
  background: #0a0c10;
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}

.card--compact .card-thumb {
  aspect-ratio: 1;
  width: 64px;
  height: 64px;
}

.thumb-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Iniciales grandes — visibles desde distancia de TV */
.thumb-initials {
  font-size: 2rem;
  font-weight: 800;
  color: var(--color-accent);
  letter-spacing: -0.02em;
}
.card--compact .thumb-initials {
  font-size: 1.1rem;
}

/* Badge EN DIRECTO — más grande y legible */
.live-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  background: var(--color-live);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 3px 8px;
  border-radius: 999px;
  animation: live-pulse 1.5s ease-in-out infinite;
}

.web-badge {
  position: absolute;
  top: 8px;
  left: 8px;
  background: rgba(0,0,0,0.6);
  color: var(--color-accent);
  font-size: 0.85rem;
  padding: 2px 7px;
  border-radius: var(--radius-sm);
}

/* ── Info del canal ── */
.card-info {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
  min-width: 0;
}
.card--compact .card-info {
  padding: var(--space-2) var(--space-3);
  gap: var(--space-1);
}

.info-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/* ── Nombre del canal — tipografía grande para TV ── */
.channel-name {
  flex: 1;
  min-width: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
}
.card--compact .channel-name {
  font-size: 0.9rem;
}
.card--focused .channel-name {
  color: #fff;
}

/* ── Favorito ── */
.fav-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.1rem;
  opacity: 0.3;
  transition: opacity 0.15s;
  flex-shrink: 0;
  line-height: 1;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}
.fav-btn:hover,
.fav-btn--active { opacity: 1; }

/* ── Badges ── */
.badges-row { flex-wrap: wrap; }
.badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 3px 9px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.badge-cat {
  color: var(--color-text-muted);
  background: rgba(255,255,255,0.06);
}
.badge-type[data-type='youtube'] { background: rgba(255,68,68,0.15); color: #ff4444; }
.badge-type[data-type='twitch']  { background: rgba(145,70,255,0.15); color: #9146ff; }
.badge-type[data-type='hls']     { background: rgba(0,191,255,0.1);   color: var(--color-accent); }
.badge-type[data-type='web']     { background: rgba(107,114,128,0.2); color: var(--color-text-muted); }

/* ── Próximo evento ── */
.event-row { overflow: hidden; }
.event-title-wrap {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}
.event-title {
  display: inline-block;
  font-size: 0.8rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.event-title--scrolling { animation: marquee-scroll 14s linear infinite; }
.event-countdown {
  font-style: normal;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--color-fav);
  flex-shrink: 0;
  white-space: nowrap;
}

/* ── Botones admin — siempre visibles en TV ── */
.admin-actions {
  display: flex;
  gap: var(--space-1);
  margin-top: auto;
}
.admin-btn {
  background: rgba(255,255,255,0.06);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.95rem;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.admin-btn:hover         { background: rgba(255,255,255,0.14); }
.admin-btn--del:hover    { background: rgba(239,68,68,0.2); }
</style>

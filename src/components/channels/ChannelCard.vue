<script setup lang="ts">
/**
 * ChannelCard — Tarjeta vertical de un canal de streaming.
 *
 * Diseño responsivo: funciona tanto en lista de 1 columna (móvil)
 * como en grid de 4-6 columnas (escritorio y TV).
 *
 * Estructura visual:
 *   ┌──────────────────┐
 *   │   Logo / LIVE    │  ← imagen o iniciales del canal
 *   ├──────────────────┤
 *   │  Nombre    ⭐    │  ← nombre + botón favorito
 *   │  Categoría │ Tipo│  ← badges informativos
 *   │  📅 Próximo evento│  ← cuenta atrás al próximo partido
 *   └──────────────────┘
 */
import { computed, ref, watchEffect, nextTick } from 'vue'
import type { Channel } from '@/types/channel'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useEventsStore } from '@/stores/events'

const props = defineProps<{
  channel:   Channel
  isAdmin:   boolean
  isLive?:   boolean
  isFocused?: boolean  // Foco por teclado o mando
}>()

const emit = defineEmits<{
  select: [Channel]
  edit:   [Channel]
  delete: [Channel]
}>()

const favStore    = useFavoritesStore()
const eventsStore = useEventsStore()

// ── Datos derivados del canal ────────────────────────────────────────────────

/** Iniciales del canal (máximo 2 letras) para cuando no hay logo */
function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

/** Etiqueta corta del tipo de stream */
const streamTypeLabel = computed(() => {
  const labels: Record<string, string> = {
    hls:     'HLS',
    twitch:  'Twitch',
    youtube: 'YouTube',
    web:     'Web',
  }
  return labels[props.channel.streamType] ?? props.channel.streamType
})

/** Próximo evento programado para este canal (o null si no hay) */
const nextEvent = computed(() => eventsStore.getNextEvent(props.channel.id))

// ── Marquee (scroll automático) para el título del evento si desborda ────────
const eventTitleRef  = ref<HTMLElement | null>(null)
const eventTitleScrolls = ref(false)

watchEffect(() => {
  // Re-evalúa cuando cambia el evento siguiente
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
  <!-- La card completa es clickable para abrir el canal -->
  <article
    class="card"
    :class="{ 'card--focused': isFocused }"
    role="button"
    tabindex="0"
    :aria-label="`Ver ${channel.name}`"
    @click="emit('select', channel)"
    @keydown.enter="emit('select', channel)"
    @keydown.space.prevent="emit('select', channel)"
  >
    <!-- ── Área superior: logo / iniciales ── -->
    <div class="card-logo">
      <img
        v-if="channel.logoUrl"
        :src="channel.logoUrl"
        :alt="channel.name"
        class="logo-img"
        loading="lazy"
      />
      <span v-else class="logo-initials">{{ getInitials(channel.name) }}</span>

      <!-- Badge "EN DIRECTO" sobre la imagen -->
      <span v-if="isLive" class="live-badge" aria-label="En directo">● LIVE</span>

      <!-- Icono de enlace externo (tipo web) -->
      <span v-if="channel.streamType === 'web'" class="web-icon" title="Abre en nueva pestaña">↗</span>
    </div>

    <!-- ── Área inferior: info del canal ── -->
    <div class="card-body">

      <!-- Nombre + botón favorito -->
      <div class="name-row">
        <span class="channel-name">{{ channel.name }}</span>
        <button
          class="fav-btn"
          :class="{ 'fav-btn--active': favStore.isFavorite(channel.id) }"
          :title="favStore.isFavorite(channel.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'"
          @click.stop="favStore.toggle(channel.id)"
        >
          {{ favStore.isFavorite(channel.id) ? '⭐' : '☆' }}
        </button>
      </div>

      <!-- Badges: categoría y tipo de stream -->
      <div class="badges-row">
        <span class="badge badge-category">
          {{ CATEGORY_ICONS[channel.category] ?? '🏆' }}
          {{ CATEGORY_LABELS[channel.category] ?? channel.category }}
        </span>
        <span class="badge" :data-type="channel.streamType">{{ streamTypeLabel }}</span>
      </div>

      <!-- Próximo evento programado -->
      <div v-if="nextEvent" class="event-row">
        <span class="event-title-wrap">
          <span
            ref="eventTitleRef"
            class="event-title"
            :class="{ 'event-title--scrolling': eventTitleScrolls }"
          >
            📅 {{ nextEvent.title }}
          </span>
        </span>
        <em class="event-countdown">
          {{ eventsStore.formatCountdown(nextEvent.scheduledAt) }}
        </em>
      </div>

      <!-- Botones admin (editar / eliminar) — visibles solo para admin -->
      <div v-if="isAdmin" class="admin-actions" @click.stop>
        <button class="admin-btn" title="Editar canal" @click="emit('edit', channel)">✏️</button>
        <button class="admin-btn admin-btn--danger" title="Eliminar canal" @click="emit('delete', channel)">🗑️</button>
      </div>
    </div>
  </article>
</template>

<style scoped>
/* ── Tarjeta contenedora ── */
.card {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg-surface);
  cursor: pointer;
  overflow: hidden;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
  outline: none;
  user-select: none;
}
.card:hover {
  border-color: var(--color-accent);
  background: rgba(0, 191, 255, 0.05);
}
.card--focused {
  border-color: var(--color-accent);
  background: rgba(0, 191, 255, 0.1);
  box-shadow: 0 0 0 2px var(--color-accent);
}
/* Pequeña animación de presión en táctil */
.card:active {
  transform: scale(0.98);
}

/* ── Logo ── */
.card-logo {
  aspect-ratio: 16 / 9;           /* Mantiene la relación 16:9 para el logo */
  background: var(--color-bg-base);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
  flex-shrink: 0;
}
.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;            /* Muestra el logo completo sin recorte */
}
.logo-initials {
  font-size: clamp(1.5rem, 4vw, 2.5rem);  /* Escala con el viewport */
  font-weight: 800;
  color: var(--color-accent);
  letter-spacing: -0.02em;
}

/* ── Badge "EN DIRECTO" ── */
.live-badge {
  position: absolute;
  top: var(--space-2);
  right: var(--space-2);
  background: var(--color-live);
  color: #fff;
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.06em;
  padding: 2px 6px;
  border-radius: 999px;
  animation: live-pulse 1.5s ease-in-out infinite;
}

/* ── Icono web (enlace externo) ── */
.web-icon {
  position: absolute;
  top: var(--space-2);
  left: var(--space-2);
  color: var(--color-accent);
  font-size: 0.9rem;
  background: rgba(0,0,0,0.5);
  border-radius: var(--radius-sm);
  padding: 1px 5px;
}

/* ── Cuerpo de la tarjeta ── */
.card-body {
  padding: var(--space-3);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  flex: 1;
}

/* ── Nombre del canal ── */
.name-row {
  display: flex;
  align-items: center;
  gap: var(--space-1);
}
.channel-name {
  flex: 1;
  min-width: 0;
  font-size: clamp(0.8rem, 2vw, 0.95rem);
  font-weight: 700;
  color: var(--color-text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Botón favorito ── */
.fav-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  padding: var(--space-1);
  opacity: 0.35;
  transition: opacity 0.15s;
  flex-shrink: 0;
  line-height: 1;
  min-width: 32px;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.fav-btn:hover,
.fav-btn--active {
  opacity: 1;
}

/* ── Badges ── */
.badges-row {
  display: flex;
  gap: var(--space-1);
  flex-wrap: wrap;
}
.badge {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.badge-category {
  color: var(--color-text-muted);
  background: rgba(255,255,255,0.06);
}
/* Colores por tipo de stream */
.badge[data-type='youtube'] { background: rgba(255,68,68,0.15); color: #ff4444; }
.badge[data-type='twitch']  { background: rgba(145,70,255,0.15); color: #9146ff; }
.badge[data-type='hls']     { background: rgba(0,191,255,0.1); color: var(--color-accent); }
.badge[data-type='web']     { background: rgba(107,114,128,0.2); color: var(--color-text-muted); }

/* ── Próximo evento ── */
.event-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
}
.event-title-wrap {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}
.event-title {
  display: inline-block;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.event-title--scrolling {
  animation: marquee-scroll 14s linear infinite;
}
.event-countdown {
  font-style: normal;
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--color-fav);
  flex-shrink: 0;
  white-space: nowrap;
}

/* ── Botones de admin ── */
.admin-actions {
  display: flex;
  gap: var(--space-1);
  opacity: 0;
  transition: opacity 0.15s;
  margin-top: auto;              /* Empuja los botones al fondo de la tarjeta */
}
.card:hover .admin-actions {
  opacity: 1;
}
/* En táctil los botones son siempre visibles (no hay hover) */
@media (hover: none) {
  .admin-actions {
    opacity: 1;
  }
}
.admin-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  padding: var(--space-1);
  border-radius: var(--radius-sm);
  min-width: 32px;
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.admin-btn:hover {
  background: var(--color-border);
}
.admin-btn--danger:hover {
  background: rgba(239,68,68,0.15);
}
</style>

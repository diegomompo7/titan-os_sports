<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Channel, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'
import ChannelCard from './ChannelCard.vue'

const props = defineProps<{
  channels: Channel[]
  isAdmin: boolean
  loading: boolean
  error: string | null
  getLiveStatus: (id: string) => boolean
}>()

const emit = defineEmits<{
  select: [Channel]
  edit: [Channel]
  delete: [Channel]
}>()

const activeFilter = ref<SportCategory | 'live' | null>(null)

const presentCategories = computed(() => {
  const cats = new Set(props.channels.map((c) => c.category))
  return (Object.keys(CATEGORY_LABELS) as SportCategory[]).filter((k) => cats.has(k))
})

const hasLive = computed(() => props.channels.some((c) => props.getLiveStatus(c.id)))

const visibleChannels = computed(() => {
  if (!activeFilter.value) return props.channels
  if (activeFilter.value === 'live') return props.channels.filter((c) => props.getLiveStatus(c.id))
  return props.channels.filter((c) => c.category === activeFilter.value)
})
</script>

<template>
  <div class="grid-wrapper">
    <div v-if="loading" class="state-msg">Cargando canales…</div>
    <div v-else-if="error" class="state-msg state-error">{{ error }}</div>
    <template v-else>
      <div v-if="channels.length > 0" class="filter-bar">
        <button
          class="filter-chip"
          :class="{ active: activeFilter === null }"
          @click="activeFilter = null"
        >
          Todos
        </button>
        <button
          v-if="hasLive"
          class="filter-chip live-chip"
          :class="{ active: activeFilter === 'live' }"
          @click="activeFilter = activeFilter === 'live' ? null : 'live'"
        >
          ● En directo
        </button>
        <button
          v-for="cat in presentCategories"
          :key="cat"
          class="filter-chip"
          :class="{ active: activeFilter === cat }"
          @click="activeFilter = activeFilter === cat ? null : (cat as SportCategory)"
        >
          {{ CATEGORY_LABELS[cat] }}
        </button>
      </div>

      <div v-if="channels.length === 0" class="state-msg">
        No hay canales aún. ¡Añade el primero!
      </div>
      <div v-else-if="visibleChannels.length === 0" class="state-msg">
        No hay canales en esta categoría
      </div>
      <div v-else class="grid">
        <ChannelCard
          v-for="ch in visibleChannels"
          :key="ch.id"
          :channel="ch"
          :isAdmin="isAdmin"
          :isLive="getLiveStatus(ch.id)"
          @select="emit('select', $event)"
          @edit="emit('edit', $event)"
          @delete="emit('delete', $event)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
.grid-wrapper {
  height: 100%;
  overflow-y: auto;
  padding: var(--space-sm) var(--space-md);
}
.filter-bar {
  display: flex;
  gap: var(--space-xs);
  flex-wrap: wrap;
  max-width: 680px;
  margin: 0 auto var(--space-sm);
}
.filter-chip {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  padding: 3px 10px;
  text-transform: uppercase;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.filter-chip:hover {
  border-color: var(--color-accent);
  color: var(--color-accent);
}
.filter-chip.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
}
.live-chip {
  color: #ff4444;
  border-color: rgba(255, 68, 68, 0.4);
}
.live-chip.active {
  background: #ff4444;
  border-color: #ff4444;
  color: #fff;
}
.grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  max-width: 680px;
  margin: 0 auto;
}
.state-msg {
  text-align: center;
  color: var(--color-text-muted);
  padding: var(--space-lg) 0;
  font-size: 0.9rem;
}
.state-error {
  color: var(--color-danger);
}
</style>

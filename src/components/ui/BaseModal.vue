<script setup lang="ts">
/**
 * BaseModal — Modal centrado para Titan OS (TV).
 * Sin comportamiento "sheet desde abajo" de móvil.
 * Tamaño grande y legible desde el sofá.
 */
defineProps<{
  title?: string
  wide?:  boolean
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="backdrop" role="dialog" aria-modal="true" @click.self="emit('close')">
      <div class="box" :class="{ 'box--wide': wide }">

        <!-- Cabecera -->
        <div v-if="title" class="header">
          <span class="title">{{ title }}</span>
          <button class="close-btn" aria-label="Cerrar" @click="emit('close')">✕</button>
        </div>

        <!-- Contenido -->
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Fondo ── */
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.82);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  animation: fade-in 0.15s ease;
}

/* ── Caja centrada — tamaño TV ── */
.box {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  width: 58vw;
  max-height: 88vh;
  overflow-y: auto;
  animation: slide-up 0.18s ease;
}

.box--wide {
  width: 76vw;
}

/* ── Cabecera fija ── */
.header {
  position: sticky;
  top: 0;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-5);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}

.title {
  font-size: 1.1rem;
  font-weight: 700;
  color: var(--color-text-main);
}

.close-btn {
  width: 2.8rem;
  height: 2.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-size: 1.1rem;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  outline: none;
  flex-shrink: 0;
}
.close-btn:hover,
.close-btn:focus-visible {
  color: var(--color-text-main);
  background: var(--color-bg-elevated);
  box-shadow: var(--focus-ring);
}
</style>

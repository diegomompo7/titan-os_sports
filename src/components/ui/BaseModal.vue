<script setup lang="ts">
defineProps<{ title?: string; wide?: boolean }>()
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <div class="modal-backdrop" @click.self="emit('close')">
      <div class="modal-box" :class="{ wide }" role="dialog" aria-modal="true">
        <div v-if="title" class="modal-header">
          <span class="modal-title">{{ title }}</span>
          <button class="modal-close" aria-label="Cerrar" @click="emit('close')">✕</button>
        </div>
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
.modal-box {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  width: min(90vw, 560px);
  max-height: 90vh;
  overflow-y: auto;
}
.modal-box.wide {
  width: min(95vw, 1020px);
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-border);
}
.modal-title {
  font-weight: 600;
  color: var(--color-text-primary);
}
.modal-close {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1rem;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}
.modal-close:hover {
  color: var(--color-text-primary);
}
</style>

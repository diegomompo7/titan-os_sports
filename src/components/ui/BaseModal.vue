<script setup lang="ts">
/**
 * BaseModal — Modal reutilizable con Teleport al body.
 *
 * En móvil ocupa toda la pantalla. En escritorio es una caja centrada.
 * Cerrando por el backdrop o el botón ✕ emite el evento 'close'.
 */
defineProps<{
  title?: string  // Título en la cabecera (opcional)
  wide?:  boolean // Si true, el modal es más ancho (para el reproductor con chat)
}>()

const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <!-- Teleport saca el modal del árbol DOM del componente padre
       para que no herede overflow:hidden ni z-index incorrectos. -->
  <Teleport to="body">
    <div class="backdrop" role="dialog" aria-modal="true" @click.self="emit('close')">
      <div class="box" :class="{ wide }">

        <!-- Cabecera con título y botón de cierre -->
        <div v-if="title" class="header">
          <span class="title">{{ title }}</span>
          <button class="close-btn" aria-label="Cerrar" @click="emit('close')">✕</button>
        </div>

        <!-- Contenido inyectado por el componente padre -->
        <slot />
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* ── Fondo oscuro semitransparente que cubre toda la pantalla ── */
.backdrop {
  position: fixed;
  inset: 0;                       /* top:0 right:0 bottom:0 left:0 */
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: flex-end;          /* En móvil el modal sube desde abajo */
  justify-content: center;
  z-index: 200;
}

/* ── Caja del modal — móvil: hoja inferior; escritorio: caja centrada ── */
.box {
  background: var(--color-bg-surface);
  border: 1px solid var(--color-border);
  width: 100%;
  max-height: 92vh;
  overflow-y: auto;
  border-radius: var(--radius-lg) var(--radius-lg) 0 0; /* Esquinas arriba en móvil */
}

/* En tablet y escritorio: caja centrada con ancho limitado */
@media (min-width: 600px) {
  .backdrop {
    align-items: center;
  }
  .box {
    width: min(92vw, 580px);
    max-height: 88vh;
    border-radius: var(--radius-lg);
  }
  .box.wide {
    width: min(96vw, 1060px);
  }
}

/* ── Cabecera ── */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4);
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  background: var(--color-bg-surface);
  z-index: 1;
}

.title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--color-text-main);
}

.close-btn {
  background: none;
  border: none;
  color: var(--color-text-muted);
  cursor: pointer;
  font-size: 1rem;
  min-width: var(--touch-target);
  min-height: var(--touch-target);
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: color 0.15s;
}
.close-btn:hover {
  color: var(--color-text-main);
}
</style>

<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/ui/BaseModal.vue
   ¿QUÉ ES ESTO?
   Un componente de "ventana emergente" (modal) genérico y reutilizable.
   Cuando la app necesita mostrar un formulario o información importante
   encima de la pantalla principal, usa este componente como contenedor.

   Está diseñado específicamente para TV (no móvil): la caja es grande,
   centrada en la pantalla, y se puede cerrar haciendo clic en el fondo oscuro.

   Analogía: es como el marco de un cuadro. El marco es siempre el mismo
   (fondo oscuro, caja blanca, cabecera con título y botón X). Lo que
   va dentro del cuadro lo decide quien lo usa (el "slot").

   Lo usan: AdminLogin, ChannelForm, EventsPanel.
============================================================================= */

// Props (propiedades de configuración que el padre puede pasar):
defineProps<{
  title?: string  // Título que aparece en la cabecera del modal. Si no se pasa, no hay cabecera.
  wide?:  boolean // Si es true, la caja es más ancha (para formularios con mucho contenido)
}>()

// El modal puede emitir solo un evento: 'close', cuando el usuario quiere cerrar
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <!--
    Teleport: mueve este HTML al final del <body>, fuera del árbol de componentes.
    Necesario para que el fondo oscuro cubra TODA la pantalla sin quedar tapado
    por otros elementos que puedan tener z-index más alto.
  -->
  <Teleport to="body">
    <!-- Fondo oscuro semitransparente. @click.self: cerrar solo si se hace clic
         directamente en el fondo (no en la caja interna del modal) -->
    <div class="backdrop" role="dialog" aria-modal="true" @click.self="emit('close')">

      <!-- La caja del modal. box--wide la hace más ancha si el padre lo pide -->
      <div class="box" :class="{ 'box--wide': wide }">

        <!-- Cabecera con título y botón cerrar (solo si se pasó un título) -->
        <div v-if="title" class="header">
          <span class="title">{{ title }}</span>
          <button class="close-btn" aria-label="Cerrar" @click="emit('close')">✕</button>
        </div>

        <!-- slot: aquí va el contenido que ponga el componente padre.
             BaseModal no sabe qué hay dentro — solo proporciona el contenedor. -->
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

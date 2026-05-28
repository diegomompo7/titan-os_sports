<script setup lang="ts">
/* =============================================================================
   FICHERO: src/App.vue
   ¿QUÉ ES ESTO?
   Es el componente "raíz" o "contenedor principal" de toda la app.
   En Vue, la interfaz se divide en piezas llamadas componentes (como bloques
   de Lego). Este es el bloque exterior que envuelve a todos los demás.

   Analogía: si la app fuera un televisor, App.vue sería la carcasa exterior.
   Dentro solo hay una pantalla (HomeView) que muestra todo el contenido.
   Este fichero es tan sencillo porque toda la lógica real está en HomeView.
============================================================================= */

// Importamos la vista principal — la pantalla que el usuario ve al abrir la app
import HomeView from '@/views/HomeView.vue'
</script>

<template>
  <!-- Simplemente mostramos la vista principal. Nada más. -->
  <HomeView />
</template>

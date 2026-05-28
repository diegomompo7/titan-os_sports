/* =============================================================================
   FICHERO: src/stores/favorites.ts
   ¿QUÉ ES ESTO?
   Guarda la lista de canales que el usuario ha marcado como favoritos (⭐).
   Los favoritos se guardan en el navegador/TV (localStorage) para que
   no desaparezcan al cerrar la app o apagar el televisor.

   Analogía: es como la lista de canales marcados como favoritos en un
   mando a distancia. Aunque saques las pilas (cierres la app), cuando
   vuelves a encender el mando tus favoritos siguen ahí.
============================================================================= */

import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

// Nombre de la "clave" bajo la que se guardan los favoritos en localStorage.
// localStorage es un pequeño cajón de almacenamiento del navegador que
// persiste aunque se cierre la app.
const STORAGE_KEY = 'titanos_favorites'

export const useFavoritesStore = defineStore('favorites', () => {
  // Cargamos los favoritos guardados previamente.
  // JSON.parse convierte el texto guardado en localStorage (como "[\"id1\",\"id2\"]")
  // de vuelta a un array de JavaScript. Si no hay nada guardado, usamos array vacío.
  const ids = ref<string[]>(
    JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
  )

  // watch: "vigila" el array de ids. Cada vez que cambie (se añada o quite un favorito),
  // guarda automáticamente la versión actualizada en localStorage.
  // { deep: true } es necesario porque vigilamos los ELEMENTOS del array, no el array en sí.
  watch(ids, (val) => localStorage.setItem(STORAGE_KEY, JSON.stringify(val)), { deep: true })

  // Alterna un canal entre favorito y no favorito.
  // Si ya era favorito → lo quita. Si no lo era → lo añade.
  // Es como un interruptor de luz: si estaba encendido lo apaga, y viceversa.
  function toggle(channelId: string) {
    const i = ids.value.indexOf(channelId)  // Busca si el canal ya está en la lista
    if (i >= 0) ids.value.splice(i, 1)      // Si está: lo elimina de esa posición
    else ids.value.push(channelId)           // Si no está: lo añade al final
  }

  // Devuelve true si el canal con ese ID está en la lista de favoritos, false si no.
  function isFavorite(channelId: string): boolean {
    return ids.value.includes(channelId)
  }

  return { ids, toggle, isFavorite }
})

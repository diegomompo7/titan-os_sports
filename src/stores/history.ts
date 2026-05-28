/* =============================================================================
   FICHERO: src/stores/history.ts
   ¿QUÉ ES ESTO?
   Lleva un registro de los últimos canales que el usuario ha visto.
   Guarda hasta 8 canales recientes. Si el usuario vuelve a ver uno
   que ya estaba en el historial, lo mueve al principio (el más reciente
   siempre aparece primero). El historial persiste al cerrar la app.

   Analogía: es como el historial de llamadas del móvil. Los últimos
   a los que has llamado aparecen primero. Si vuelves a llamar a alguien
   que ya estaba en el historial, sube a la primera posición. Y si el
   historial se llena (más de 8), el más antiguo desaparece.
============================================================================= */

import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

// Máximo de canales a recordar en el historial
const MAX = 8
// Clave de almacenamiento en localStorage
const KEY = 'titanos_history'

export const useHistoryStore = defineStore('history', () => {
  // Cargamos el historial guardado. Si no hay nada, empezamos con array vacío.
  const ids = ref<string[]>(JSON.parse(localStorage.getItem(KEY) ?? '[]'))

  // Cada vez que el historial cambia, lo guardamos automáticamente
  watch(ids, (val) => localStorage.setItem(KEY, JSON.stringify(val)), { deep: true })

  // Añade un canal al historial cuando el usuario lo ve.
  // Lógica: el canal nuevo va al principio, se elimina si ya existía
  // (para no tener duplicados), y se recorta a MAX elementos.
  function add(channelId: string) {
    ids.value = [
      channelId,                                    // El canal nuevo va primero
      ...ids.value.filter((id) => id !== channelId) // El resto, eliminando si ya estaba
    ].slice(0, MAX)                                  // Recortar a máximo 8 elementos
  }

  // Devuelve true si el canal está en el historial (el usuario lo ha visto antes)
  function hasHistory(channelId: string): boolean {
    return ids.value.includes(channelId)
  }

  return { ids, add, hasHistory }
})

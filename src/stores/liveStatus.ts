/* =============================================================================
   FICHERO: src/stores/liveStatus.ts
   ¿QUÉ ES ESTO?
   Mantiene actualizado qué canales están emitiendo EN DIRECTO en este momento.
   La app pregunta al servidor periódicamente (cada 30 segundos) si hay
   cambios, y actualiza los indicadores "● LIVE" de las tarjetas.

   Analogía: es como el panel de salidas del aeropuerto. Muestra en tiempo
   real qué vuelos están embarcando ahora mismo. Este store es el encargado
   de ir al tablón (servidor) y traer la información actualizada.

   Importante: si la consulta falla (sin internet, servidor caído), la app
   simplemente no actualiza los indicadores — no muestra ningún error al usuario.
============================================================================= */

import { ref }  from 'vue'
import { defineStore } from 'pinia'
import axios from 'axios'

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

export const useLiveStatusStore = defineStore('liveStatus', () => {
  // Diccionario de id → true/false. Por ejemplo:
  // { "canal-123": true, "canal-456": false, "canal-789": true }
  // true = está en directo ahora, false = no está en directo
  const statuses = ref<Record<string, boolean>>({})

  // Descarga los estados en directo del servidor y actualiza el diccionario local.
  async function fetchStatuses() {
    try {
      const { data } = await axios.get<Record<string, boolean>>(`${API}/channels/live-status`)

      // Eliminar del diccionario local los canales que ya no aparecen en la respuesta
      // (puede pasar si un canal fue eliminado del servidor)
      for (const key of Object.keys(statuses.value)) {
        if (!(key in data)) delete statuses.value[key]
      }

      // Object.assign: copia todas las propiedades de "data" sobre "statuses.value"
      // Se hace así (en vez de statuses.value = data) para que Vue sepa que cambió
      // y actualice la interfaz correctamente
      Object.assign(statuses.value, data)
    } catch {
      // Silencioso — si falla la red, simplemente no actualizamos. No pasa nada.
    }
  }

  // Devuelve si un canal específico está en directo.
  // Si no tenemos información de ese canal, devolvemos false por defecto.
  function isLive(channelId: string): boolean {
    return statuses.value[channelId] ?? false
  }

  return { statuses, fetchStatuses, isLive }
})

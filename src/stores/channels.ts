/* =============================================================================
   FICHERO: src/stores/channels.ts
   ¿QUÉ ES ESTO?
   El "almacén" central de canales. Todos los componentes de la app que
   necesitan la lista de canales la piden aquí, y este store se encarga
   de ir al servidor a buscarla y mantenerla actualizada.

   Analogía: imagina una recepcionista de hotel. Cualquier empleado que
   necesite la lista de habitaciones ocupadas se la pide a ella. Ella va
   al ordenador central (servidor/API), trae la información y la tiene
   disponible para todos. Si alguien añade o borra una habitación, ella
   también actualiza su lista.

   ¿Qué es un store (Pinia)?
   Es una variable compartida entre todos los componentes de la app.
   Sin store, cada componente tendría su propia copia de los canales
   y podrían desincronizarse. Con el store, todos leen y escriben
   en el mismo sitio.
============================================================================= */

// ref: para crear variables reactivas (cuando cambian, la interfaz se actualiza)
import { ref } from 'vue'
// defineStore: función de Pinia para crear un almacén compartido
import { defineStore } from 'pinia'
// axios: librería para hacer llamadas HTTP al servidor (como fetch pero más cómodo)
import axios from 'axios'
// Tipos: Channel (un canal) y ChannelFormData (datos del formulario)
import type { Channel, ChannelFormData } from '@/types/channel'

// La URL base del servidor. Se lee de las variables de entorno.
// Si no está definida, usa localhost:3000 (para desarrollo local)
const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

export const useChannelsStore = defineStore('channels', () => {
  // ── Estado ──────────────────────────────────────────────────────────────────
  // Lista de todos los canales. Empieza vacía y se rellena al cargar.
  const channels = ref<Channel[]>([])

  // Indica si se está cargando la lista (para mostrar un spinner)
  const loading = ref(false)

  // Si algo falla, aquí guardamos el mensaje de error para mostrarlo
  const error = ref<string | null>(null)

  // ── Acciones ─────────────────────────────────────────────────────────────────

  // Descarga la lista de canales del servidor y la guarda en "channels"
  async function fetchChannels() {
    loading.value = true   // Activar indicador de carga
    error.value = null     // Borrar cualquier error previo
    try {
      // GET /channels → el servidor devuelve un array de canales en formato JSON
      const { data } = await axios.get<Channel[]>(`${API}/channels`)
      channels.value = data  // Guardar los canales recibidos
    } catch {
      // Si el servidor no responde o hay un error de red
      error.value = 'No se pudieron cargar los canales'
    } finally {
      // Siempre desactivar el indicador de carga, haya o no error
      loading.value = false
    }
  }

  // Crea un nuevo canal en el servidor y lo añade al principio de la lista local.
  // Requiere token de administrador para que solo el admin pueda añadir canales.
  async function addChannel(data: ChannelFormData, token: string) {
    const { data: created } = await axios.post<Channel>(`${API}/channels`, data, {
      // El token se manda en la cabecera Authorization para identificar al admin
      headers: { Authorization: `Bearer ${token}` },
    })
    // unshift añade el nuevo canal al PRINCIPIO del array (aparece primero en el grid)
    channels.value.unshift(created)
    return created
  }

  // Actualiza un canal existente en el servidor y en la lista local.
  async function updateChannel(id: string, data: Partial<ChannelFormData>, token: string) {
    const { data: updated } = await axios.put<Channel>(`${API}/channels/${id}`, data, {
      headers: { Authorization: `Bearer ${token}` },
    })
    // Buscar la posición del canal en la lista por su ID
    const idx = channels.value.findIndex((c) => c.id === id)
    // Si lo encontramos (índice distinto de -1), lo reemplazamos con la versión actualizada
    if (idx !== -1) channels.value[idx] = updated
    return updated
  }

  // Borra un canal del servidor y lo elimina de la lista local.
  async function removeChannel(id: string, token: string) {
    await axios.delete(`${API}/channels/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    // filter crea un nuevo array sin el canal eliminado (donde el id no coincide)
    channels.value = channels.value.filter((c) => c.id !== id)
  }

  // Exponemos solo lo necesario — los componentes acceden a esto
  return { channels, loading, error, fetchChannels, addChannel, updateChannel, removeChannel }
})

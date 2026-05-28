/* =============================================================================
   FICHERO: backend/src/services/youtubeSync.ts
   ¿QUÉ ES ESTO?
   Descarga de YouTube los próximos directos programados de un canal y los
   guarda en la base de datos como "eventos futuros". Así la app puede mostrar
   en las tarjetas "próximo evento: Champions League — Vie 21:00".

   El proceso completo para sincronizar un canal es:
   1. Resolver la URL del canal a su ID interno de YouTube (UCxxxxxx)
   2. Buscar sus directos programados
   3. Guardar en BD los que no existían ya

   Para buscar directos programados usa tres estrategias de menor a mayor
   "manualidad": API oficial → scraping de /streams → scraping de /live.

   Analogía: es como un asistente que va a la página del canal de YouTube,
   mira la sección "Próximas emisiones" y apunta en la agenda los partidos
   que van a retransmitir.
============================================================================= */

import type { Pool, RowDataPacket } from 'mysql2/promise'

// Cabeceras HTTP para simular un navegador real al hacer scraping de YouTube
const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Cookie': 'SOCS=CAI; GPS=1',
}

/* ── Clases de error personalizadas ──────────────────────────────────────────
   Permiten distinguir qué tipo de problema ocurrió al sincronizar,
   para dar mensajes de error más descriptivos al administrador.
*/

// Error cuando la YouTube API devuelve un código de error (cuota agotada, etc.)
export class YoutubeApiError extends Error {
  constructor(public code: number, message: string) {
    super(message)
    this.name = 'YoutubeApiError'
  }
}

// Error cuando no se puede encontrar el canal de YouTube con la URL indicada
export class YoutubeChannelNotFoundError extends Error {
  constructor(url: string) {
    super(`No se encontró el canal de YouTube para: ${url}`)
    this.name = 'YoutubeChannelNotFoundError'
  }
}

// Tipo de respuesta de la YouTube Channels API
type ChannelsApiResponse = {
  error?: { code: number; message: string }
  items?: { id: string }[]
}

/* =============================================================================
   FUNCIÓN: resolveYoutubeChannelId
   Convierte una URL de canal de YouTube a su ID interno (empieza por "UC").

   YouTube tiene varios formatos de URL para canales:
   - /channel/UCxxxxxx  → el ID ya está en la URL, se extrae directamente
   - /@handle           → hay que preguntar a la API por el handle
   - /c/nombre          → URL personalizada legada, se pregunta a la API
   - otros formatos     → se hace scraping del HTML buscando el externalId
============================================================================= */
export async function resolveYoutubeChannelId(url: string, apiKey: string): Promise<string> {
  // Formato 1: /channel/UCxxxxxx — el ID está directamente en la URL
  const channelMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/)
  if (channelMatch) return channelMatch[1]

  // Formato 2: /@handle (el formato más moderno de YouTube)
  // Ejemplo: "https://www.youtube.com/@LaLigaTV"
  const handleMatch = url.match(/\/@([^/?#]+)/)
  if (handleMatch) {
    const handle = handleMatch[1]
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${handle}&key=${apiKey}`
    )
    const data = (await res.json()) as ChannelsApiResponse
    if (data.error) throw new YoutubeApiError(data.error.code, data.error.message)
    if (!data.items?.length) throw new YoutubeChannelNotFoundError(url)
    return data.items[0].id  // El primer resultado es nuestro canal
  }

  // Formato 3: /c/nombre (URLs personalizadas del sistema antiguo de YouTube)
  const customMatch = url.match(/youtube\.com\/c\/([^/?#]+)/)
  if (customMatch) {
    const name = customMatch[1]
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${name}&key=${apiKey}`
    )
    const data = (await res.json()) as ChannelsApiResponse
    if (data.error) throw new YoutubeApiError(data.error.code, data.error.message)
    if (data.items?.length) return data.items[0].id

    // Si la API no lo encuentra, intentar scraping del HTML del canal
    const pageRes = await fetch(url, { headers: SCRAPE_HEADERS, redirect: 'follow' })
    const html = await pageRes.text()
    // Buscar el externalId en el JSON embebido en el HTML de la página
    const externalIdMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/)
    if (externalIdMatch) return externalIdMatch[1]
    throw new YoutubeChannelNotFoundError(url)
  }

  // Formato desconocido → último recurso: scraping HTML
  try {
    const pageRes = await fetch(url, { headers: SCRAPE_HEADERS, redirect: 'follow' })
    const html = await pageRes.text()
    const externalIdMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/)
    if (externalIdMatch) return externalIdMatch[1]
  } catch { /* ignorar errores de red */ }

  throw new YoutubeChannelNotFoundError(url)
}

/* =============================================================================
   FUNCIÓN: extractVideoIdsFromHtml
   Extrae los IDs de vídeo del código HTML de una página de YouTube.
   YouTube incluye datos en formato JSON dentro del HTML, y entre ellos
   aparecen los videoId de los vídeos mostrados en la página.

   Devuelve hasta `max` IDs únicos (sin repeticiones).
============================================================================= */
function extractVideoIdsFromHtml(html: string, max = 15): string[] {
  const ids = new Set<string>()
  // Buscar todos los patrones "videoId":"XXXXXXXXXXX" en el HTML
  for (const m of html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)) {
    ids.add(m[1])        // Set evita duplicados automáticamente
    if (ids.size >= max) break  // Parar cuando tengamos suficientes
  }
  return [...ids]  // Convertir el Set a array
}

// Estructura de un vídeo en la respuesta de la YouTube Videos API
type VideoApiItem = {
  id: string
  snippet: {
    title: string
    liveBroadcastContent: string  // 'upcoming', 'live', 'none'
  }
  liveStreamingDetails?: {
    scheduledStartTime?: string   // Cuándo está programado (ISO 8601)
  }
}

/* =============================================================================
   FUNCIÓN: fetchUpcomingFromVideoIds
   Dado un listado de videoIds, consulta la YouTube Videos API para obtener
   cuáles son directos programados (status 'upcoming') y cuándo empiezan.

   Coste en cuota de YouTube: 1 unidad (muy barato — el máximo diario es 10.000)
   Comparado con search.list que cuesta 100 unidades por consulta.
============================================================================= */
async function fetchUpcomingFromVideoIds(
  videoIds: string[],
  apiKey: string
): Promise<Array<{ title: string; scheduledStartTime: string }>> {
  if (!videoIds.length) return []

  const ids = videoIds.join(',')  // "id1,id2,id3,..."
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${ids}&key=${apiKey}`
  )
  const data = (await res.json()) as {
    error?: { code: number; message: string }
    items?: VideoApiItem[]
  }

  if (data.error) throw new YoutubeApiError(data.error.code, data.error.message)
  if (!data.items?.length) return []

  // Filtrar solo los que son directos futuros (upcoming) y tienen fecha de inicio
  return data.items
    .filter(
      (v) =>
        v.snippet.liveBroadcastContent === 'upcoming' &&  // Está programado (no emitido aún)
        v.liveStreamingDetails?.scheduledStartTime        // Tiene fecha de inicio definida
    )
    .map((v) => ({
      title:              v.snippet.title,
      scheduledStartTime: v.liveStreamingDetails!.scheduledStartTime!,
    }))
}

/* =============================================================================
   FUNCIÓN: fetchUpcomingBroadcasts
   Obtiene la lista de próximos directos programados de un canal de YouTube.

   Usa tres estrategias en orden de preferencia:
   1. YouTube Search API (search?eventType=upcoming) — rápido pero cuesta 100 unidades
   2. Scraping de /streams + Videos API — más fiable, cuesta solo 1 unidad
   3. Scraping de /live + Videos API — fallback extra

   Si la estrategia 1 devuelve resultados → se usa directamente.
   Si no → se prueba la 2 y luego la 3.
============================================================================= */
export async function fetchUpcomingBroadcasts(
  ytChannelId: string,
  apiKey: string,
  channelUrl?: string
): Promise<Array<{ title: string; scheduledStartTime: string }>> {
  // ── Nivel 1: YouTube Search API ───────────────────────────────────────────
  // Busca directamente directos programados en el canal
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&channelId=${ytChannelId}&eventType=upcoming&type=video&key=${apiKey}&maxResults=10`

  const searchRes  = await fetch(searchUrl)
  const searchData = (await searchRes.json()) as {
    error?: { code: number; message: string }
    items?: { snippet: { title: string; scheduledStartTime?: string } }[]
  }

  if (searchData.error) throw new YoutubeApiError(searchData.error.code, searchData.error.message)

  // Filtrar los resultados que tienen fecha válida y devolver si hay alguno
  const fromSearch = (searchData.items ?? [])
    .map((item) => ({
      title:              item.snippet.title,
      scheduledStartTime: item.snippet.scheduledStartTime ?? '',
    }))
    .filter((b) => b.scheduledStartTime && !isNaN(new Date(b.scheduledStartTime).getTime()))

  if (fromSearch.length > 0) return fromSearch  // ¡Encontramos directos programados!

  // Si la búsqueda no devolvió nada, intentar con scraping
  if (!channelUrl) return []

  // Limpiar la URL base (quitar /live o /streams al final si los tiene)
  const baseUrl = channelUrl.replace(/\/(live|streams)\/?$/, '').replace(/\/$/, '')

  // ── Niveles 2 y 3: Scraping + Videos API ─────────────────────────────────
  // Probamos /streams primero (página de próximos directos) y luego /live
  for (const suffix of ['/streams', '/live']) {
    try {
      // Descargar la página del canal
      const pageRes = await fetch(baseUrl + suffix, {
        headers: SCRAPE_HEADERS,
        redirect: 'follow',
      })
      const html = await pageRes.text()

      // Extraer los videoIds que aparecen en el HTML
      const videoIds = extractVideoIdsFromHtml(html)
      if (videoIds.length === 0) continue  // No encontramos nada, probar el siguiente

      // Consultar la API para ver cuáles son directos futuros
      const results = await fetchUpcomingFromVideoIds(videoIds, apiKey)
      if (results.length > 0) return results  // ¡Encontramos directos!
    } catch {
      // Si falla este fallback, probar el siguiente (no abortar la sincronización)
    }
  }

  return []  // No se encontraron directos programados por ningún método
}

// ─── Estructura del resultado de la sincronización ───────────────────────────

export interface SyncResult {
  created: number   // Cuántos eventos nuevos se crearon
  skipped: number   // Cuántos se saltaron por ya existir
  events: Array<{ id: string; channelId: string; title: string; scheduledAt: string }>
}

/* =============================================================================
   FUNCIÓN PRINCIPAL: syncChannelEvents (exportada)
   Sincroniza los directos futuros de un canal de YouTube con la base de datos.

   Pasos:
   1. Resolver la URL del canal al ID de YouTube (UCxxxxxx)
   2. Obtener la lista de directos programados
   3. Para cada directo: comprobar si ya existe en BD para evitar duplicados
   4. Insertar los nuevos y devolver un resumen

   Esta función la usan tanto el endpoint manual (admin pulsa "Sincronizar")
   como el job automático que corre cada hora.
============================================================================= */
export async function syncChannelEvents(
  channel: { id: string; name: string; url: string },
  apiKey: string,
  pool: Pool
): Promise<SyncResult> {
  // Paso 1: Obtener el ID interno de YouTube del canal
  const ytChannelId = await resolveYoutubeChannelId(channel.url, apiKey)

  // Paso 2: Obtener los directos futuros del canal
  const broadcasts = await fetchUpcomingBroadcasts(ytChannelId, apiKey, channel.url)

  let created = 0
  let skipped = 0
  const events: SyncResult['events'] = []

  for (const broadcast of broadcasts) {
    // Convertir la fecha de YouTube (ISO 8601) al formato que usa MySQL
    const scheduledDate  = new Date(broadcast.scheduledStartTime)
    const scheduledMysql = scheduledDate.toISOString().slice(0, 19).replace('T', ' ')

    // Comprobar si ya existe un evento similar (mismo canal, mismo título, fecha próxima ±1h)
    // Así evitamos insertar el mismo partido dos veces si ya se sincronizó antes
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM events
       WHERE channel_id = ? AND title = ?
       AND ABS(TIMESTAMPDIFF(SECOND, scheduled_at, ?)) < 3600`,  // Diferencia menor de 1 hora
      [channel.id, broadcast.title, scheduledMysql]
    )

    if (existing.length > 0) {
      skipped++  // Ya existe, no insertar
      continue
    }

    // Insertar el nuevo evento
    const eventId = crypto.randomUUID()
    await pool.query(
      'INSERT INTO events (id, channel_id, title, scheduled_at) VALUES (?, ?, ?, ?)',
      [eventId, channel.id, broadcast.title, scheduledMysql]
    )
    created++
    events.push({
      id:          eventId,
      channelId:   channel.id,
      title:       broadcast.title,
      scheduledAt: scheduledDate.toISOString(),
    })
  }

  return { created, skipped, events }
}

import type { Pool, RowDataPacket } from 'mysql2/promise'

const SCRAPE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'es-ES,es;q=0.9',
  'Cookie': 'SOCS=CAI; GPS=1',
}

export class YoutubeApiError extends Error {
  constructor(public code: number, message: string) {
    super(message)
    this.name = 'YoutubeApiError'
  }
}

export class YoutubeChannelNotFoundError extends Error {
  constructor(url: string) {
    super(`No se encontró el canal de YouTube para: ${url}`)
    this.name = 'YoutubeChannelNotFoundError'
  }
}

type ChannelsApiResponse = {
  error?: { code: number; message: string }
  items?: { id: string }[]
}

/**
 * Resuelve la URL de un canal de YouTube a su Channel ID (UCxxxx).
 * Soporta los formatos:
 *   - https://www.youtube.com/channel/UCxxxx  → extrae directamente
 *   - https://www.youtube.com/@handle         → llama a channels API con forHandle
 *   - https://www.youtube.com/c/name          → llama a channels API con forUsername; fallback scraping HTML
 *   - Otros → intenta scraping HTML buscando externalId
 */
export async function resolveYoutubeChannelId(url: string, apiKey: string): Promise<string> {
  // Formato 1: /channel/UCxxxx — extraer directamente
  const channelMatch = url.match(/\/channel\/(UC[a-zA-Z0-9_-]+)/)
  if (channelMatch) return channelMatch[1]

  // Formato 2: /@handle
  const handleMatch = url.match(/\/@([^/?#]+)/)
  if (handleMatch) {
    const handle = handleMatch[1]
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=@${handle}&key=${apiKey}`
    )
    const data = (await res.json()) as ChannelsApiResponse
    if (data.error) throw new YoutubeApiError(data.error.code, data.error.message)
    if (!data.items?.length) throw new YoutubeChannelNotFoundError(url)
    return data.items[0].id
  }

  // Formato 3: /c/name (URL personalizada legacy)
  const customMatch = url.match(/youtube\.com\/c\/([^/?#]+)/)
  if (customMatch) {
    const name = customMatch[1]
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/channels?part=id&forUsername=${name}&key=${apiKey}`
    )
    const data = (await res.json()) as ChannelsApiResponse
    if (data.error) throw new YoutubeApiError(data.error.code, data.error.message)
    if (data.items?.length) return data.items[0].id

    // Fallback: scraping HTML buscando externalId
    const pageRes = await fetch(url, { headers: SCRAPE_HEADERS, redirect: 'follow' })
    const html = await pageRes.text()
    const externalIdMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/)
    if (externalIdMatch) return externalIdMatch[1]
    throw new YoutubeChannelNotFoundError(url)
  }

  // Formato desconocido → intentar scraping HTML
  try {
    const pageRes = await fetch(url, { headers: SCRAPE_HEADERS, redirect: 'follow' })
    const html = await pageRes.text()
    const externalIdMatch = html.match(/"externalId":"(UC[a-zA-Z0-9_-]+)"/)
    if (externalIdMatch) return externalIdMatch[1]
  } catch { /* ignorar */ }

  throw new YoutubeChannelNotFoundError(url)
}

/** Extrae hasta `max` video IDs únicos del HTML de una página de YouTube */
function extractVideoIdsFromHtml(html: string, max = 15): string[] {
  const ids = new Set<string>()
  for (const m of html.matchAll(/"videoId":"([a-zA-Z0-9_-]{11})"/g)) {
    ids.add(m[1])
    if (ids.size >= max) break
  }
  return [...ids]
}

type VideoApiItem = {
  id: string
  snippet: { title: string; liveBroadcastContent: string }
  liveStreamingDetails?: { scheduledStartTime?: string }
}

/**
 * Dado un conjunto de video IDs, llama a videos.list para obtener los que son
 * upcoming y tienen scheduledStartTime. Coste: 1 unidad de cuota.
 */
async function fetchUpcomingFromVideoIds(
  videoIds: string[],
  apiKey: string
): Promise<Array<{ title: string; scheduledStartTime: string }>> {
  if (!videoIds.length) return []

  const ids = videoIds.join(',')
  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,liveStreamingDetails&id=${ids}&key=${apiKey}`
  )
  const data = (await res.json()) as {
    error?: { code: number; message: string }
    items?: VideoApiItem[]
  }

  if (data.error) throw new YoutubeApiError(data.error.code, data.error.message)
  if (!data.items?.length) return []

  return data.items
    .filter(
      (v) =>
        v.snippet.liveBroadcastContent === 'upcoming' &&
        v.liveStreamingDetails?.scheduledStartTime
    )
    .map((v) => ({
      title: v.snippet.title,
      scheduledStartTime: v.liveStreamingDetails!.scheduledStartTime!,
    }))
}

/**
 * Obtiene los directos programados (upcoming) de un canal de YouTube.
 *
 * Estrategia de 3 niveles para máxima fiabilidad:
 *   1. search?eventType=upcoming (rápido, pero la API falla con frecuencia)
 *   2. Scraping /streams + videos.list (fiable, coste bajo)
 *   3. Scraping /live  + videos.list (fallback extra)
 *
 * NOTA cuota: search.list cuesta 100 unidades; videos.list cuesta 1 unidad.
 */
export async function fetchUpcomingBroadcasts(
  ytChannelId: string,
  apiKey: string,
  channelUrl?: string
): Promise<Array<{ title: string; scheduledStartTime: string }>> {
  // — Nivel 1: YouTube Search API —
  const searchUrl =
    `https://www.googleapis.com/youtube/v3/search` +
    `?part=snippet&channelId=${ytChannelId}&eventType=upcoming&type=video&key=${apiKey}&maxResults=10`

  const searchRes = await fetch(searchUrl)
  const searchData = (await searchRes.json()) as {
    error?: { code: number; message: string }
    items?: { snippet: { title: string; scheduledStartTime?: string } }[]
  }

  if (searchData.error) throw new YoutubeApiError(searchData.error.code, searchData.error.message)

  const fromSearch = (searchData.items ?? [])
    .map((item) => ({
      title: item.snippet.title,
      scheduledStartTime: item.snippet.scheduledStartTime ?? '',
    }))
    .filter((b) => b.scheduledStartTime && !isNaN(new Date(b.scheduledStartTime).getTime()))

  if (fromSearch.length > 0) return fromSearch

  // — Nivel 2 y 3: Scraping + videos.list —
  if (!channelUrl) return []

  // Normalizar la base URL del canal (quitar /live, /streams, trailing slash)
  const baseUrl = channelUrl.replace(/\/(live|streams)\/?$/, '').replace(/\/$/, '')

  for (const suffix of ['/streams', '/live']) {
    try {
      const pageRes = await fetch(baseUrl + suffix, {
        headers: SCRAPE_HEADERS,
        redirect: 'follow',
      })
      const html = await pageRes.text()
      const videoIds = extractVideoIdsFromHtml(html)

      if (videoIds.length === 0) continue

      const results = await fetchUpcomingFromVideoIds(videoIds, apiKey)
      if (results.length > 0) return results
    } catch {
      // ignorar errores de red en el fallback y probar el siguiente
    }
  }

  return []
}

// ─── syncChannelEvents ────────────────────────────────────────────────────────

export interface SyncResult {
  created: number
  skipped: number
  events: Array<{ id: string; channelId: string; title: string; scheduledAt: string }>
}

/**
 * Sincroniza los directos programados de un canal de YouTube con la BD de eventos.
 * Reutilizable por el route handler manual y el job de auto-sync.
 */
export async function syncChannelEvents(
  channel: { id: string; name: string; url: string },
  apiKey: string,
  pool: Pool
): Promise<SyncResult> {
  const ytChannelId = await resolveYoutubeChannelId(channel.url, apiKey)
  const broadcasts = await fetchUpcomingBroadcasts(ytChannelId, apiKey, channel.url)

  let created = 0
  let skipped = 0
  const events: SyncResult['events'] = []

  for (const broadcast of broadcasts) {
    const scheduledDate = new Date(broadcast.scheduledStartTime)
    const scheduledMysql = scheduledDate.toISOString().slice(0, 19).replace('T', ' ')

    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM events
       WHERE channel_id = ? AND title = ?
       AND ABS(TIMESTAMPDIFF(SECOND, scheduled_at, ?)) < 3600`,
      [channel.id, broadcast.title, scheduledMysql]
    )

    if (existing.length > 0) {
      skipped++
      continue
    }

    const eventId = crypto.randomUUID()
    await pool.query(
      'INSERT INTO events (id, channel_id, title, scheduled_at) VALUES (?, ?, ?, ?)',
      [eventId, channel.id, broadcast.title, scheduledMysql]
    )
    created++
    events.push({
      id: eventId,
      channelId: channel.id,
      title: broadcast.title,
      scheduledAt: scheduledDate.toISOString(),
    })
  }

  return { created, skipped, events }
}

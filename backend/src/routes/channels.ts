/* =============================================================================
   FICHERO: backend/src/routes/channels.ts
   ¿QUÉ ES ESTO?
   Define todas las rutas de la API relacionadas con los canales de televisión.
   Es el fichero más extenso del backend porque gestiona muchas operaciones:

   RUTAS DISPONIBLES:
   - GET  /channels/live-status       → ¿Qué canales están en directo ahora?
   - GET  /channels/resolve-youtube   → Resolver URL de canal a vídeo en directo
   - GET  /channels/resolve-logo      → Obtener logo automático de Twitch/YouTube
   - GET  /channels                   → Listar todos los canales
   - POST /channels                   → Crear canal (solo admin)
   - PUT  /channels/:id               → Editar canal (solo admin)
   - POST /channels/:id/sync-youtube-events → Sincronizar eventos de YouTube (solo admin)
   - DELETE /channels/:id             → Borrar canal (solo admin)

   Analogía: es como la oficina central de una cadena de televisión. Tiene
   ventanillas para: consultar qué canales emiten ahora, añadir nuevos canales,
   editar los existentes, borrarlos, y obtener información automática de ellos.
============================================================================= */

import { Router } from 'express'
import type { Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import pool from '../db'
import { adminAuth } from '../middleware/adminAuth'
import { getLiveStatuses } from '../services/liveStatus'
import {
  syncChannelEvents,
  YoutubeApiError,
  YoutubeChannelNotFoundError,
} from '../services/youtubeSync'

const router = Router()

// Los cinco tipos de canal que la app soporta
type StreamType = 'hls' | 'twitch' | 'youtube' | 'web' | 'titanapp'

// Set de tipos que deben especificarse explícitamente (no se auto-detectan)
// 'web' y 'titanapp' no tienen patrones de URL reconocibles, hay que indicarlos a mano
const EXPLICIT_TYPES = new Set<string>(['hls', 'twitch', 'youtube', 'web', 'titanapp'])

/*
 * Detecta automáticamente el tipo de stream a partir de la URL.
 * Si la URL contiene "twitch.tv" → es Twitch.
 * Si contiene "youtube.com" o "youtu.be" → es YouTube.
 * En cualquier otro caso → asumimos HLS (el más común para TV en directo).
 *
 * Nota: si el admin indica el tipo manualmente, esta función no se usa.
 */
function detectStreamType(url: string): StreamType {
  if (url.includes('twitch.tv')) return 'twitch'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  return 'hls'
}

// Lista de columnas a seleccionar en las consultas SQL.
// Convierte los nombres de columna de MySQL (snake_case) a JavaScript (camelCase):
// stream_type → streamType, logo_url → logoUrl, etc.
const SELECT_COLS =
  'id, name, url, stream_type AS streamType, category, logo_url AS logoUrl, referer, user_agent AS userAgent, added_at AS addedAt, youtube_sync_url AS youtubeSyncUrl'

/* ── GET /channels/live-status ───────────────────────────────────────────────
   Comprueba en tiempo real qué canales están emitiendo EN DIRECTO.
   Solo consulta los canales de Twitch y YouTube (los demás son siempre "en directo"
   si están configurados correctamente, o simplemente no tienen estado live).
   Devuelve un objeto { "id-canal": true/false, ... }
*/
router.get('/live-status', async (_req: Request, res: Response) => {
  try {
    // Obtener solo los canales de Twitch y YouTube de la BD
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, url, stream_type AS streamType FROM channels WHERE stream_type IN ('twitch', 'youtube')"
    )

    // Preguntar a los servicios externos (Twitch API, YouTube API) si están en directo
    const statuses = await getLiveStatuses(
      rows as Array<{ id: string; url: string; streamType: string }>
    )
    res.json(statuses)
  } catch (err) {
    console.error(err)
    res.json({})  // En caso de error, devolver objeto vacío (ningún canal "live")
  }
})

/* ── GET /channels/resolve-youtube?url=... ───────────────────────────────────
   Resuelve una URL de canal de YouTube al ID del vídeo en directo actual.
   Necesario para canales como "@LaLigaSportsTV" donde no hay un ID de vídeo fijo.

   El servidor lo intenta de tres formas, de más precisa a menos:
   1. Usando la YouTube Data API (requiere YOUTUBE_API_KEY)
   2. Extrayendo el videoId directamente de la URL si ya lo tiene
   3. Haciendo "scraping" de la página HTML de YouTube (sin API key)
*/
router.get('/resolve-youtube', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }
  if (!url || !url.includes('youtube.com')) {
    res.status(400).json({ error: 'URL inválida' })
    return
  }

  // ── Caso 1: URL con @handle de canal ─────────────────────────────────────
  // Ejemplo: "https://www.youtube.com/@LaLigaTV/live"
  const handleMatch = url.match(/youtube\.com\/@([^/?#]+)/)
  const apiKey = process.env['YOUTUBE_API_KEY']

  if (handleMatch && apiKey) {
    const handle = handleMatch[1]  // Extraer el nombre del handle: "LaLigaTV"
    try {
      // Paso 1: Convertir el @handle al ID interno del canal de YouTube
      const chRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
      )
      const chData = await chRes.json() as { items?: { id: string }[] }
      const channelId = chData.items?.[0]?.id
      if (!channelId) { res.json({ embedUrl: null }); return }

      // Paso 2: Buscar qué vídeo está en directo ahora mismo en ese canal
      const srRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`
      )
      const srData = await srRes.json() as { items?: { id: { videoId: string } }[] }
      const videoId = srData.items?.[0]?.id?.videoId ?? null

      // Devolver la URL de embed si encontramos un vídeo en directo
      res.json({ embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : null })
      return
    } catch (err) {
      console.error('resolve-youtube (API):', err)
      res.json({ embedUrl: null })
      return
    }
  }

  // ── Caso 2: URL con videoId ya incluido ──────────────────────────────────
  // Ejemplos: "watch?v=ABC123", "/live/ABC123", "youtu.be/ABC123"
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  const liveMatch  = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/)
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  const directVideoId = watchMatch?.[1] ?? liveMatch?.[1] ?? shortMatch?.[1] ?? null

  if (directVideoId) {
    res.json({ embedUrl: `https://www.youtube.com/embed/${directVideoId}?autoplay=1&rel=0` })
    return
  }

  // ── Caso 3: Scraping HTML de YouTube ─────────────────────────────────────
  // Como último recurso, descargamos la página de YouTube y buscamos el videoId
  // en el código HTML. Es menos fiable pero no requiere API key.
  try {
    const response = await fetch(url, {
      headers: {
        // Nos hacemos pasar por un navegador normal para que YouTube nos sirva el HTML completo
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cookie': 'SOCS=CAI; GPS=1',  // Aceptar cookies de YouTube
      },
      redirect: 'follow',  // Seguir redirecciones (YouTube a veces redirige)
    })

    // Si hubo redirección a un vídeo concreto, extraer el ID de la URL final
    if (response.redirected) {
      const m = response.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      if (m) { res.json({ embedUrl: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` }); return }
    }

    const html = await response.text()

    // Comprobar si la página indica que hay una emisión en directo activa
    const isLive = html.includes('"liveBroadcastContent":"live"') || html.includes('"isLive":true')
    if (!isLive) { res.json({ embedUrl: null }); return }

    // Buscar el videoId en el HTML de dos formas diferentes
    const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/)
    const jsonMatch      = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)
    const vid = canonicalMatch?.[1] ?? jsonMatch?.[1] ?? null

    res.json({ embedUrl: vid ? `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0` : null })
  } catch (err) {
    console.error('resolve-youtube (scraping):', err)
    res.json({ embedUrl: null })
  }
})

/* ── GET /channels/resolve-logo?url=... ──────────────────────────────────────
   Obtiene automáticamente el logo de un canal de Twitch o YouTube a partir de su URL.
   Así el admin no tiene que buscar e introducir manualmente la URL del logo.

   - Twitch: consulta la API pública de Twitch (GQL) para obtener la foto de perfil
   - YouTube: descarga la página y extrae la imagen "og:image" (la miniatura principal)
*/
router.get('/resolve-logo', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }
  if (!url) { res.status(400).json({ error: 'URL requerida' }); return }

  try {
    // ── Logo de Twitch ────────────────────────────────────────────────────
    if (url.includes('twitch.tv')) {
      // Extraer el nombre de usuario del canal: "https://www.twitch.tv/usuario" → "usuario"
      const m = url.match(/twitch\.tv\/([^/?#]+)/)
      const login = m?.[1]
      if (!login) { res.json({ logoUrl: null }); return }

      // Consultar la API GQL pública de Twitch (no requiere credenciales propias)
      const gqlRes = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        headers: {
          'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko',  // Client-ID público de Twitch
          'Content-Type': 'application/json'
        },
        // GraphQL query: pedir la URL de la foto de perfil del usuario
        body: JSON.stringify({ query: `{ user(login: "${login}") { profileImageURL(width: 300) } }` }),
      })
      const gqlData = (await gqlRes.json()) as { data?: { user?: { profileImageURL?: string } } }
      res.json({ logoUrl: gqlData.data?.user?.profileImageURL ?? null })
      return
    }

    // ── Logo de YouTube ───────────────────────────────────────────────────
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
      // Descargar la página del canal
      const pageRes = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-ES,es;q=0.9',
          'Cookie': 'SOCS=CAI; GPS=1',
        },
        redirect: 'follow',
      })
      const html = await pageRes.text()

      // Buscar la etiqueta og:image en el HTML — es la imagen principal de la página
      // Ejemplo: <meta property="og:image" content="https://i.ytimg.com/vi/ABC/maxresdefault.jpg">
      const m = html.match(/<meta property="og:image" content="([^"]+)"/)
      res.json({ logoUrl: m?.[1] ?? null })
      return
    }

    res.json({ logoUrl: null })
  } catch (err) {
    console.error('resolve-logo:', err)
    res.json({ logoUrl: null })
  }
})

/* ── GET /channels/resolve-pluto?slug=... ────────────────────────────────────
   Comprueba si un slug de PlutoTV existe en la API pública de PlutoTV.
   Devuelve { found: true, name: "Fox Sports Europe" } o { found: false }.
*/
router.get('/resolve-pluto', async (req: Request, res: Response) => {
  const { slug } = req.query as { slug?: string }
  if (!slug) { res.status(400).json({ error: 'slug requerido' }); return }

  try {
    const r = await fetch('https://api.pluto.tv/v2/channels.json')
    const channels = await r.json() as Array<{ slug: string; name: string }>
    const match = channels.find((ch) => ch.slug === slug)
    res.json(match ? { found: true, name: match.name } : { found: false })
  } catch (err) {
    console.error('resolve-pluto:', err)
    res.json({ found: false })
  }
})

/* ── GET /channels/resolve-dazn?url=... ──────────────────────────────────────
   Comprueba si una URL de DAZN es válida:
   - dazn://              → siempre válido (abre la app en inicio)
   - dazn://player/ID     → intenta verificar el evento en la web pública de DAZN
   Devuelve { valid: boolean, message: string }
*/
router.get('/resolve-dazn', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }
  if (!url || !url.startsWith('dazn://')) {
    res.status(400).json({ error: 'URL de DAZN inválida' }); return
  }

  if (url === 'dazn://' || url === 'dazn://home') {
    res.json({ valid: true, message: 'Abre la app de DAZN en el menú principal' }); return
  }

  const playerMatch = url.match(/^dazn:\/\/player\/([^/]+)/)
  if (playerMatch) {
    const eventId = playerMatch[1]
    try {
      const r = await fetch(
        `https://www.dazn.com/es-ES/epg-fixture/${eventId}`,
        {
          method: 'HEAD', redirect: 'follow',
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        }
      )
      if (r.ok) {
        res.json({ valid: true, message: `Evento encontrado (ID: ${eventId})` })
      } else {
        res.json({ valid: false, message: `Evento no encontrado (HTTP ${r.status})` })
      }
    } catch (err) {
      console.error('resolve-dazn:', err)
      res.json({ valid: false, message: 'No se pudo comprobar — verifica en la TV' })
    }
    return
  }

  res.json({ valid: true, message: 'Formato correcto — verifica en la TV' })
})

/* ── GET /channels ───────────────────────────────────────────────────────────
   Devuelve la lista completa de todos los canales, ordenados por fecha de
   añadido (los más recientes primero).
*/
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM channels ORDER BY added_at DESC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener canales' })
  }
})

/* ── POST /channels ──────────────────────────────────────────────────────────
   Crea un nuevo canal en la base de datos. Solo el admin puede hacerlo.
   Después de crear el canal, automáticamente intenta sincronizar sus eventos
   de YouTube (si corresponde).
*/
router.post('/', adminAuth, async (req: Request, res: Response) => {
  // Extraer todos los campos del cuerpo de la petición
  const { name, url, category, logoUrl, referer, userAgent, streamType: explicitType, youtubeSyncUrl } = req.body as {
    name: string; url: string; category: string
    logoUrl?: string; referer?: string; userAgent?: string
    streamType?: string; youtubeSyncUrl?: string
  }

  // Validar que los campos obligatorios están presentes
  if (!name || !url || !category) {
    res.status(400).json({ error: 'name, url y category son obligatorios' })
    return
  }

  const id = crypto.randomUUID()  // Generar ID único para el nuevo canal

  // Determinar el tipo de stream: usar el indicado por el admin, o auto-detectar
  const streamType = (explicitType && EXPLICIT_TYPES.has(explicitType))
    ? explicitType as StreamType
    : detectStreamType(url)

  try {
    // Insertar el canal en la base de datos
    await pool.query(
      'INSERT INTO channels (id, name, url, stream_type, category, logo_url, referer, user_agent, youtube_sync_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, url, streamType, category, logoUrl ?? null, referer ?? null, userAgent ?? null, youtubeSyncUrl ?? null]
    )

    // Recuperar el canal recién insertado para devolvérselo al cliente
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM channels WHERE id = ?`, [id]
    )
    res.status(201).json(rows[0])  // 201 = "Creado con éxito"

    // Sincronización de eventos en segundo plano.
    // No esperamos a que termine — respondemos al admin primero y hacemos el sync después.
    // Así el admin no tiene que esperar a que YouTube cargue.
    const apiKey = process.env['YOUTUBE_API_KEY']
    if (apiKey) {
      // Usar youtube_sync_url si está definida; si no, la url del canal (si es YouTube)
      const syncUrl = streamType === 'youtube' ? url : (youtubeSyncUrl ?? null)
      if (syncUrl) {
        syncChannelEvents({ id, name, url: syncUrl }, apiKey, pool)
          .then((r) => {
            if (r.created > 0) console.log(`[AutoSync] ${name}: +${r.created} evento${r.created !== 1 ? 's' : ''} nuevo${r.created !== 1 ? 's' : ''}`)
          })
          .catch((err: unknown) => console.error(`[AutoSync] Error inicial en ${name}:`, (err as Error).message))
      }
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear canal' })
  }
})

/* ── PUT /channels/:id ───────────────────────────────────────────────────────
   Actualiza los datos de un canal existente. Solo el admin puede hacerlo.
   Todos los campos son opcionales — solo se actualizan los que se envíen.
   Si no se manda un campo, se conserva el valor actual.
*/
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const { name, url, category, logoUrl, referer, userAgent, streamType: explicitType, youtubeSyncUrl } = req.body as {
    name?: string; url?: string; category?: string
    logoUrl?: string; referer?: string; userAgent?: string
    streamType?: string; youtubeSyncUrl?: string
  }

  try {
    // Primero obtenemos los datos actuales del canal para no perder campos que no se envíen
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT name, url, stream_type, category, logo_url, referer, user_agent, youtube_sync_url FROM channels WHERE id = ?',
      [id]
    )
    if (existing.length === 0) {
      res.status(404).json({ error: 'Canal no encontrado' })
      return
    }

    // Datos actuales del canal (los usaremos como valores por defecto)
    const row = existing[0] as {
      name: string; url: string; stream_type: string; category: string
      logo_url: string | null; referer: string | null; user_agent: string | null; youtube_sync_url: string | null
    }

    // Si se envió una nueva URL, usarla; si no, conservar la actual
    const newUrl = url ?? row.url

    // Re-detectar el tipo de stream si la URL cambió (o usar el explícito si se mandó)
    const streamType = (explicitType && EXPLICIT_TYPES.has(explicitType))
      ? explicitType as StreamType
      : detectStreamType(newUrl)

    // Actualizar el canal, usando el valor nuevo si se mandó, o el actual si no
    await pool.query(
      'UPDATE channels SET name=?, url=?, stream_type=?, category=?, logo_url=?, referer=?, user_agent=?, youtube_sync_url=? WHERE id=?',
      [
        name ?? row.name,                                                   // Nombre: nuevo o actual
        newUrl,                                                              // URL: nueva o actual
        streamType,                                                          // Tipo: detectado o explícito
        category ?? row.category,                                            // Categoría: nueva o actual
        logoUrl !== undefined ? logoUrl : row.logo_url,                      // Logo: solo si se mandó
        referer !== undefined ? referer : row.referer,                       // Referer: solo si se mandó
        userAgent !== undefined ? userAgent : row.user_agent,                // UserAgent: solo si se mandó
        youtubeSyncUrl !== undefined ? (youtubeSyncUrl || null) : row.youtube_sync_url, // YT sync URL
        id,
      ]
    )

    // Devolver el canal actualizado
    const [updated] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM channels WHERE id = ?`, [id]
    )
    res.json(updated[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar canal' })
  }
})

/* ── POST /channels/:id/sync-youtube-events ──────────────────────────────────
   Sincroniza manualmente los eventos futuros de un canal desde YouTube.
   El servidor descargará los próximos directos programados del canal y los
   guardará en la base de datos para mostrarlos como "próximo evento".
*/
router.post('/:id/sync-youtube-events', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const apiKey = process.env['YOUTUBE_API_KEY']

  // Sin API key no podemos consultar YouTube
  if (!apiKey) {
    res.status(400).json({ error: 'YOUTUBE_API_KEY no está configurada en el servidor' })
    return
  }

  try {
    // Obtener los datos del canal (necesitamos su URL de YouTube)
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, url, stream_type AS streamType, youtube_sync_url AS youtubeSyncUrl FROM channels WHERE id = ?',
      [id]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Canal no encontrado' })
      return
    }
    const channel = rows[0] as {
      id: string; name: string; url: string; streamType: string; youtubeSyncUrl: string | null
    }

    // Determinar qué URL de YouTube usar para la sincronización:
    // 1ª opción: youtube_sync_url (URL del canal YT si el canal principal no es YouTube)
    // 2ª opción: la url del canal si es de tipo YouTube
    const syncUrl = channel.youtubeSyncUrl || (channel.streamType === 'youtube' ? channel.url : null)
    if (!syncUrl) {
      res.status(400).json({ error: 'El canal no tiene URL de YouTube configurada para sincronizar' })
      return
    }

    // Ejecutar la sincronización y devolver el resultado
    const result = await syncChannelEvents(
      { id: channel.id, name: channel.name, url: syncUrl },
      apiKey,
      pool
    )
    res.json(result)
  } catch (err) {
    // Distinguir entre distintos tipos de error para dar mensajes más descriptivos
    if (err instanceof YoutubeChannelNotFoundError) {
      // El canal de YouTube no existe o la URL es incorrecta
      res.status(404).json({ error: 'No se pudo resolver el canal de YouTube' })
    } else if (err instanceof YoutubeApiError) {
      // La YouTube API devolvió un error (cuota agotada, API key inválida, etc.)
      res.status(502).json({ error: `Error de YouTube API: ${err.message}` })
    } else {
      console.error('sync-youtube-events:', err)
      res.status(500).json({ error: 'Error interno al sincronizar eventos' })
    }
  }
})

/* ── DELETE /channels/:id ────────────────────────────────────────────────────
   Borra un canal de la base de datos. Solo el admin puede hacerlo.
   Si el canal no existe, devuelve error 404.
*/
router.delete('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  try {
    const [result] = await pool.query('DELETE FROM channels WHERE id = ?', [id])
    const affectedRows = (result as { affectedRows: number }).affectedRows

    // affectedRows = 0 significa que no había ningún canal con ese ID
    if (affectedRows === 0) {
      res.status(404).json({ error: 'Canal no encontrado' })
      return
    }
    res.json({ deleted: id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al eliminar canal' })
  }
})

export default router

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

type StreamType = 'hls' | 'twitch' | 'youtube' | 'web'

const EXPLICIT_TYPES = new Set<string>(['hls', 'twitch', 'youtube', 'web'])

function detectStreamType(url: string): StreamType {
  if (url.includes('twitch.tv')) return 'twitch'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  return 'hls'
}

const SELECT_COLS =
  'id, name, url, stream_type AS streamType, category, logo_url AS logoUrl, referer, user_agent AS userAgent, added_at AS addedAt, youtube_sync_url AS youtubeSyncUrl'

// GET /channels/live-status — público
router.get('/live-status', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT id, url, stream_type AS streamType FROM channels WHERE stream_type IN ('twitch', 'youtube')"
    )
    const statuses = await getLiveStatuses(
      rows as Array<{ id: string; url: string; streamType: string }>
    )
    res.json(statuses)
  } catch (err) {
    console.error(err)
    res.json({})
  }
})

// GET /channels/resolve-youtube?url=... — resuelve URL de canal al video en directo actual
router.get('/resolve-youtube', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }
  if (!url || !url.includes('youtube.com')) {
    res.status(400).json({ error: 'URL inválida' })
    return
  }

  // ── Caso 1: URL de canal con handle (/@handle o /@handle/live) ──
  const handleMatch = url.match(/youtube\.com\/@([^/?#]+)/)
  const apiKey = process.env['YOUTUBE_API_KEY']

  if (handleMatch && apiKey) {
    const handle = handleMatch[1]
    try {
      // Paso 1: resolver handle → channelId
      const chRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=id&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`
      )
      const chData = await chRes.json() as { items?: { id: string }[] }
      const channelId = chData.items?.[0]?.id
      if (!channelId) { res.json({ embedUrl: null }); return }

      // Paso 2: buscar directo activo en el canal
      const srRes = await fetch(
        `https://www.googleapis.com/youtube/v3/search?part=id&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`
      )
      const srData = await srRes.json() as { items?: { id: { videoId: string } }[] }
      const videoId = srData.items?.[0]?.id?.videoId ?? null
      res.json({ embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : null })
      return
    } catch (err) {
      console.error('resolve-youtube (API):', err)
      res.json({ embedUrl: null })
      return
    }
  }

  // ── Caso 2: URL con videoId directo (watch?v=, /live/ID, youtu.be/) ──
  const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
  const liveMatch  = url.match(/youtube\.com\/live\/([a-zA-Z0-9_-]{11})/)
  const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]{11})/)
  const directVideoId = watchMatch?.[1] ?? liveMatch?.[1] ?? shortMatch?.[1] ?? null
  if (directVideoId) {
    res.json({ embedUrl: `https://www.youtube.com/embed/${directVideoId}?autoplay=1&rel=0` })
    return
  }

  // ── Caso 3: fallback scraping HTML (sin API key o URL desconocida) ──
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cookie': 'SOCS=CAI; GPS=1',
      },
      redirect: 'follow',
    })
    if (response.redirected) {
      const m = response.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      if (m) { res.json({ embedUrl: `https://www.youtube.com/embed/${m[1]}?autoplay=1&rel=0` }); return }
    }
    const html = await response.text()
    const isLive = html.includes('"liveBroadcastContent":"live"') || html.includes('"isLive":true')
    if (!isLive) { res.json({ embedUrl: null }); return }
    const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/)
    const jsonMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)
    const vid = canonicalMatch?.[1] ?? jsonMatch?.[1] ?? null
    res.json({ embedUrl: vid ? `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0` : null })
  } catch (err) {
    console.error('resolve-youtube (scraping):', err)
    res.json({ embedUrl: null })
  }
})

// GET /channels/resolve-logo?url=... — obtiene el logo automáticamente para Twitch/YouTube
router.get('/resolve-logo', async (req: Request, res: Response) => {
  const { url } = req.query as { url?: string }
  if (!url) { res.status(400).json({ error: 'URL requerida' }); return }

  try {
    // Twitch: GQL público
    if (url.includes('twitch.tv')) {
      const m = url.match(/twitch\.tv\/([^/?#]+)/)
      const login = m?.[1]
      if (!login) { res.json({ logoUrl: null }); return }
      const gqlRes = await fetch('https://gql.twitch.tv/gql', {
        method: 'POST',
        headers: { 'Client-ID': 'kimne78kx3ncx6brgo4mv6wki5h1ko', 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: `{ user(login: "${login}") { profileImageURL(width: 300) } }` }),
      })
      const gqlData = (await gqlRes.json()) as { data?: { user?: { profileImageURL?: string } } }
      res.json({ logoUrl: gqlData.data?.user?.profileImageURL ?? null })
      return
    }

    // YouTube: extraer og:image del HTML
    if (url.includes('youtube.com') || url.includes('youtu.be')) {
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

// GET /channels — público
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

// POST /channels — solo admin
router.post('/', adminAuth, async (req: Request, res: Response) => {
  const { name, url, category, logoUrl, referer, userAgent, streamType: explicitType, youtubeSyncUrl } = req.body as {
    name: string
    url: string
    category: string
    logoUrl?: string
    referer?: string
    userAgent?: string
    streamType?: string
    youtubeSyncUrl?: string
  }

  if (!name || !url || !category) {
    res.status(400).json({ error: 'name, url y category son obligatorios' })
    return
  }

  const id = crypto.randomUUID()
  const streamType = (explicitType && EXPLICIT_TYPES.has(explicitType))
    ? explicitType as StreamType
    : detectStreamType(url)

  try {
    await pool.query(
      'INSERT INTO channels (id, name, url, stream_type, category, logo_url, referer, user_agent, youtube_sync_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, url, streamType, category, logoUrl ?? null, referer ?? null, userAgent ?? null, youtubeSyncUrl ?? null]
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM channels WHERE id = ?`,
      [id]
    )
    res.status(201).json(rows[0])

    // Sync automático en background: canal YouTube propio o cualquier canal con youtube_sync_url
    const apiKey = process.env['YOUTUBE_API_KEY']
    if (apiKey) {
      const syncUrl = streamType === 'youtube' ? url : (youtubeSyncUrl ?? null)
      if (syncUrl) {
        syncChannelEvents({ id, name, url: syncUrl }, apiKey, pool)
          .then((r) => { if (r.created > 0) console.log(`[AutoSync] ${name}: +${r.created} evento${r.created !== 1 ? 's' : ''} nuevo${r.created !== 1 ? 's' : ''}`) })
          .catch((err: unknown) => console.error(`[AutoSync] Error inicial en ${name}:`, (err as Error).message))
      }
    }
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear canal' })
  }
})

// PUT /channels/:id — solo admin
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const { name, url, category, logoUrl, referer, userAgent, streamType: explicitType, youtubeSyncUrl } = req.body as {
    name?: string
    url?: string
    category?: string
    logoUrl?: string
    referer?: string
    userAgent?: string
    streamType?: string
    youtubeSyncUrl?: string
  }

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT name, url, stream_type, category, logo_url, referer, user_agent, youtube_sync_url FROM channels WHERE id = ?',
      [id]
    )
    if (existing.length === 0) {
      res.status(404).json({ error: 'Canal no encontrado' })
      return
    }

    const row = existing[0] as {
      name: string
      url: string
      stream_type: string
      category: string
      logo_url: string | null
      referer: string | null
      user_agent: string | null
      youtube_sync_url: string | null
    }
    const newUrl = url ?? row.url
    const streamType = (explicitType && EXPLICIT_TYPES.has(explicitType))
      ? explicitType as StreamType
      : detectStreamType(newUrl)

    await pool.query(
      'UPDATE channels SET name=?, url=?, stream_type=?, category=?, logo_url=?, referer=?, user_agent=?, youtube_sync_url=? WHERE id=?',
      [
        name ?? row.name,
        newUrl,
        streamType,
        category ?? row.category,
        logoUrl !== undefined ? logoUrl : row.logo_url,
        referer !== undefined ? referer : row.referer,
        userAgent !== undefined ? userAgent : row.user_agent,
        youtubeSyncUrl !== undefined ? (youtubeSyncUrl || null) : row.youtube_sync_url,
        id,
      ]
    )
    const [updated] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM channels WHERE id = ?`,
      [id]
    )
    res.json(updated[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar canal' })
  }
})

// POST /channels/:id/sync-youtube-events — solo admin
router.post('/:id/sync-youtube-events', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const apiKey = process.env['YOUTUBE_API_KEY']

  if (!apiKey) {
    res.status(400).json({ error: 'YOUTUBE_API_KEY no está configurada en el servidor' })
    return
  }

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, name, url, stream_type FROM channels WHERE id = ?',
      [id]
    )
    if (rows.length === 0) {
      res.status(404).json({ error: 'Canal no encontrado' })
      return
    }
    const channel = rows[0] as { id: string; name: string; url: string; stream_type: string }
    if (channel.stream_type !== 'youtube') {
      res.status(400).json({ error: 'El canal no es de tipo YouTube' })
      return
    }

    const result = await syncChannelEvents(channel, apiKey, pool)
    res.json(result)
  } catch (err) {
    if (err instanceof YoutubeChannelNotFoundError) {
      res.status(404).json({ error: `No se pudo resolver el canal de YouTube` })
    } else if (err instanceof YoutubeApiError) {
      res.status(502).json({ error: `Error de YouTube API: ${err.message}` })
    } else {
      console.error('sync-youtube-events:', err)
      res.status(500).json({ error: 'Error interno al sincronizar eventos' })
    }
  }
})

// DELETE /channels/:id — solo admin
router.delete('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  try {
    const [result] = await pool.query('DELETE FROM channels WHERE id = ?', [id])
    const affectedRows = (result as { affectedRows: number }).affectedRows
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

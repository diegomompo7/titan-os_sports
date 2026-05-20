import { Router } from 'express'
import type { Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import pool from '../db'
import { adminAuth } from '../middleware/adminAuth'
import { getLiveStatuses } from '../services/liveStatus'

const router = Router()

type StreamType = 'hls' | 'twitch' | 'youtube' | 'web'

const EXPLICIT_TYPES = new Set<string>(['hls', 'twitch', 'youtube', 'web'])

function detectStreamType(url: string): StreamType {
  if (url.includes('twitch.tv')) return 'twitch'
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube'
  return 'hls'
}

const SELECT_COLS =
  'id, name, url, stream_type AS streamType, category, logo_url AS logoUrl, referer, user_agent AS userAgent, added_at AS addedAt'

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

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Upgrade-Insecure-Requests': '1',
        'Cookie': 'SOCS=CAI; GPS=1',
      },
      redirect: 'follow',
    })

    // Método 1: YouTube hizo un HTTP redirect a watch?v=ID
    if (response.redirected) {
      const match = response.url.match(/[?&]v=([a-zA-Z0-9_-]{11})/)
      if (match) {
        res.json({ embedUrl: `https://www.youtube.com/embed/${match[1]}?autoplay=1&rel=0` })
        return
      }
    }

    // Método 2: parsear el HTML en busca de señales de directo
    const html = await response.text()
    const isLive = html.includes('"liveBroadcastContent":"live"') || html.includes('"isLive":true')
    if (!isLive) {
      res.json({ embedUrl: null })
      return
    }
    const canonicalMatch = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})"/)
    const jsonMatch = html.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)
    const videoId = canonicalMatch?.[1] ?? jsonMatch?.[1] ?? null
    res.json({ embedUrl: videoId ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0` : null })
  } catch (err) {
    console.error('resolve-youtube:', err)
    res.json({ embedUrl: null })
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
  const { name, url, category, logoUrl, referer, userAgent, streamType: explicitType } = req.body as {
    name: string
    url: string
    category: string
    logoUrl?: string
    referer?: string
    userAgent?: string
    streamType?: string
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
      'INSERT INTO channels (id, name, url, stream_type, category, logo_url, referer, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, name, url, streamType, category, logoUrl ?? null, referer ?? null, userAgent ?? null]
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM channels WHERE id = ?`,
      [id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear canal' })
  }
})

// PUT /channels/:id — solo admin
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const { name, url, category, logoUrl, referer, userAgent, streamType: explicitType } = req.body as {
    name?: string
    url?: string
    category?: string
    logoUrl?: string
    referer?: string
    userAgent?: string
    streamType?: string
  }

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT name, url, stream_type, category, logo_url, referer, user_agent FROM channels WHERE id = ?',
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
    }
    const newUrl = url ?? row.url
    const streamType = (explicitType && EXPLICIT_TYPES.has(explicitType))
      ? explicitType as StreamType
      : detectStreamType(newUrl)

    await pool.query(
      'UPDATE channels SET name=?, url=?, stream_type=?, category=?, logo_url=?, referer=?, user_agent=? WHERE id=?',
      [
        name ?? row.name,
        newUrl,
        streamType,
        category ?? row.category,
        logoUrl !== undefined ? logoUrl : row.logo_url,
        referer !== undefined ? referer : row.referer,
        userAgent !== undefined ? userAgent : row.user_agent,
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

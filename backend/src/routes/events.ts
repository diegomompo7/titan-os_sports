import { Router } from 'express'
import type { Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import pool from '../db'
import { adminAuth } from '../middleware/adminAuth'

const router = Router()

// GET /events — eventos futuros ordenados por fecha
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id, channel_id AS channelId, title,
              DATE_FORMAT(scheduled_at, '%Y-%m-%dT%H:%i:%s') AS scheduledAt
       FROM events
       WHERE scheduled_at > NOW()
       ORDER BY scheduled_at ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.json([])
  }
})

// POST /events — solo admin
router.post('/', adminAuth, async (req: Request, res: Response) => {
  const { channelId, title, scheduledAt } = req.body as {
    channelId: string
    title: string
    scheduledAt: string
  }
  if (!channelId || !title || !scheduledAt) {
    res.status(400).json({ error: 'channelId, title y scheduledAt son obligatorios' })
    return
  }
  const id = crypto.randomUUID()
  await pool.query(
    'INSERT INTO events (id, channel_id, title, scheduled_at) VALUES (?, ?, ?, ?)',
    [id, channelId, title, new Date(scheduledAt)]
  )
  res.status(201).json({ id, channelId, title, scheduledAt })
})

// DELETE /events/:id — solo admin
router.delete('/:id', adminAuth, async (req: Request, res: Response) => {
  await pool.query('DELETE FROM events WHERE id = ?', [req.params['id']])
  res.json({ ok: true })
})

export default router

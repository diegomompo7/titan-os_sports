import { Router } from 'express'
import type { Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import pool from '../db'
import { adminAuth } from '../middleware/adminAuth'

const router = Router()

router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, image_url AS imageUrl, label, position, active, created_at AS createdAt FROM banners WHERE active = 1 ORDER BY position ASC'
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener banners' })
  }
})

router.get('/all', adminAuth, async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, image_url AS imageUrl, label, position, active, created_at AS createdAt FROM banners ORDER BY position ASC'
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener banners' })
  }
})

router.post('/', adminAuth, async (req: Request, res: Response) => {
  const { image_url, label, position } = req.body as { image_url?: string; label?: string; position?: number }

  if (!image_url) {
    res.status(400).json({ error: 'image_url es obligatorio' })
    return
  }

  const id = crypto.randomUUID()
  const pos = position ?? 0

  try {
    await pool.query(
      'INSERT INTO banners (id, image_url, label, position, active) VALUES (?, ?, ?, ?, 1)',
      [id, image_url, label ?? null, pos]
    )
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT id, image_url AS imageUrl, label, position, active, created_at AS createdAt FROM banners WHERE id = ?',
      [id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear banner' })
  }
})

router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const { image_url, label, position, active } = req.body as {
    image_url?: string; label?: string; position?: number; active?: boolean
  }

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT image_url, label, position, active FROM banners WHERE id = ?', [id]
    )
    if (existing.length === 0) {
      res.status(404).json({ error: 'Banner no encontrado' })
      return
    }
    const row = existing[0] as { image_url: string; label: string | null; position: number; active: number }

    await pool.query(
      'UPDATE banners SET image_url=?, label=?, position=?, active=? WHERE id=?',
      [
        image_url ?? row.image_url,
        label !== undefined ? (label || null) : row.label,
        position ?? row.position,
        active !== undefined ? (active ? 1 : 0) : row.active,
        id,
      ]
    )
    const [updated] = await pool.query<RowDataPacket[]>(
      'SELECT id, image_url AS imageUrl, label, position, active, created_at AS createdAt FROM banners WHERE id = ?', [id]
    )
    res.json(updated[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar banner' })
  }
})

router.delete('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  try {
    const [result] = await pool.query('DELETE FROM banners WHERE id = ?', [id])
    if ((result as { affectedRows: number }).affectedRows === 0) {
      res.status(404).json({ error: 'Banner no encontrado' })
      return
    }
    res.json({ deleted: id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al eliminar banner' })
  }
})

export default router

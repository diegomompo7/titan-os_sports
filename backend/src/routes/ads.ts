import { Router } from 'express'
import type { Request, Response } from 'express'
import type { RowDataPacket } from 'mysql2'
import pool from '../db'
import { adminAuth } from '../middleware/adminAuth'

const router = Router()

const SELECT_COLS = 'id, url, label, position, active, created_at AS createdAt'

/* ── GET /ads ────────────────────────────────────────────────────────────────
   Devuelve todos los anuncios activos, ordenados por posición.
*/
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM ads WHERE active = 1 ORDER BY position ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener anuncios' })
  }
})

/* ── GET /ads/all ────────────────────────────────────────────────────────────
   Solo admin: devuelve todos los anuncios (activos e inactivos) para el panel.
*/
router.get('/all', adminAuth, async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM ads ORDER BY position ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al obtener anuncios' })
  }
})

/* ── POST /ads ───────────────────────────────────────────────────────────────
   Crea un nuevo anuncio. Solo admin.
*/
router.post('/', adminAuth, async (req: Request, res: Response) => {
  const { url, label } = req.body as { url: string; label?: string }

  if (!url) {
    res.status(400).json({ error: 'url es obligatorio' })
    return
  }

  const id = crypto.randomUUID()

  try {
    const [maxRow] = await pool.query<RowDataPacket[]>('SELECT COALESCE(MAX(position), -1) AS maxPos FROM ads')
    const nextPos = ((maxRow[0] as { maxPos: number }).maxPos) + 1

    await pool.query(
      'INSERT INTO ads (id, url, label, position, active) VALUES (?, ?, ?, ?, 1)',
      [id, url, label ?? null, nextPos]
    )

    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM ads WHERE id = ?`, [id]
    )
    res.status(201).json(rows[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al crear anuncio' })
  }
})

/* ── PUT /ads/:id ────────────────────────────────────────────────────────────
   Actualiza un anuncio. Solo admin.
*/
router.put('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  const { url, label, active } = req.body as { url?: string; label?: string; active?: boolean }

  try {
    const [existing] = await pool.query<RowDataPacket[]>(
      'SELECT url, label, active FROM ads WHERE id = ?', [id]
    )
    if (existing.length === 0) {
      res.status(404).json({ error: 'Anuncio no encontrado' })
      return
    }
    const row = existing[0] as { url: string; label: string | null; active: number }

    await pool.query(
      'UPDATE ads SET url=?, label=?, active=? WHERE id=?',
      [
        url ?? row.url,
        label !== undefined ? (label || null) : row.label,
        active !== undefined ? (active ? 1 : 0) : row.active,
        id,
      ]
    )

    const [updated] = await pool.query<RowDataPacket[]>(
      `SELECT ${SELECT_COLS} FROM ads WHERE id = ?`, [id]
    )
    res.json(updated[0])
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al actualizar anuncio' })
  }
})

/* ── DELETE /ads/:id ─────────────────────────────────────────────────────────
   Elimina un anuncio. Solo admin.
*/
router.delete('/:id', adminAuth, async (req: Request, res: Response) => {
  const { id } = req.params as { id: string }
  try {
    const [result] = await pool.query('DELETE FROM ads WHERE id = ?', [id])
    if ((result as { affectedRows: number }).affectedRows === 0) {
      res.status(404).json({ error: 'Anuncio no encontrado' })
      return
    }
    res.json({ deleted: id })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Error al eliminar anuncio' })
  }
})

export default router

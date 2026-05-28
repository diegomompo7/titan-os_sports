/* =============================================================================
   FICHERO: backend/src/routes/events.ts
   ¿QUÉ ES ESTO?
   Define las "rutas" de la API para gestionar los eventos deportivos.
   Una ruta es como una ventanilla de atención: cuando la app hace una
   petición a "/events", el servidor sabe qué tiene que responder.

   Rutas disponibles:
   - GET  /events          → Devuelve todos los eventos futuros ordenados por fecha
   - POST /events          → Crea un nuevo evento (solo admin)
   - DELETE /events/:id    → Borra un evento concreto (solo admin)
   - DELETE /events/epg-all → Borra todos los eventos de la guía EPG (solo admin)
   - POST /events/sync-epg  → Sincroniza la guía EPG española manualmente (solo admin)

   Analogía: es la centralita de un call center. Según el número (ruta) al que
   llamas, te atiende una persona diferente con información diferente.
============================================================================= */

// Router: permite agrupar rutas relacionadas en un módulo independiente
import { Router } from 'express'
import type { Request, Response } from 'express'
// RowDataPacket: tipo para las filas que devuelve MySQL
import type { RowDataPacket } from 'mysql2'
// El pool de conexiones a la base de datos
import pool from '../db'
// Middleware de autenticación: bloquea si no eres admin
import { adminAuth } from '../middleware/adminAuth'
// Servicio de sincronización de la guía de programación EPG
import { syncEPGEvents } from '../services/epgSync'

// Crear el router de Express para agrupar estas rutas
const router = Router()

/* ── GET /events ─────────────────────────────────────────────────────────────
   Devuelve todos los eventos programados en el FUTURO, ordenados por
   fecha de inicio (el más próximo primero).

   ¿Por qué "WHERE scheduled_at > NOW()"?
   Para no enviar eventos que ya han pasado — no tiene sentido mostrar
   en la pantalla "partido de ayer".
*/
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      // CONCAT + DATE_FORMAT: convierte la fecha de MySQL al formato ISO 8601
      // que entiende JavaScript (ejemplo: "2024-05-10T20:00:00Z")
      `SELECT id, channel_id AS channelId, title,
              CONCAT(DATE_FORMAT(scheduled_at, '%Y-%m-%dT%H:%i:%s'), 'Z') AS scheduledAt,
              CONCAT(DATE_FORMAT(end_time,     '%Y-%m-%dT%H:%i:%s'), 'Z') AS endTime,
              source
       FROM events
       WHERE scheduled_at > NOW()
       ORDER BY scheduled_at ASC`
    )
    res.json(rows)
  } catch (err) {
    console.error(err)
    res.json([])  // Si hay error, devolver lista vacía (no romper la app)
  }
})

/* ── POST /events ────────────────────────────────────────────────────────────
   Crea un nuevo evento deportivo. Solo accesible para el administrador.
   El body de la petición debe incluir: channelId, title, scheduledAt.
*/
router.post('/', adminAuth, async (req: Request, res: Response) => {
  // Extraemos los datos del cuerpo de la petición
  const { channelId, title, scheduledAt } = req.body as {
    channelId: string
    title: string
    scheduledAt: string
  }

  // Validar que los tres campos obligatorios están presentes
  if (!channelId || !title || !scheduledAt) {
    res.status(400).json({ error: 'channelId, title y scheduledAt son obligatorios' })
    return
  }

  // Generamos un ID único automáticamente (como un número de ticket)
  const id = crypto.randomUUID()

  // Insertar el evento en la base de datos con una consulta SQL parametrizada.
  // Los "?" se reemplazan por los valores del array — esto previene inyección SQL.
  await pool.query(
    'INSERT INTO events (id, channel_id, title, scheduled_at) VALUES (?, ?, ?, ?)',
    [id, channelId, title, new Date(scheduledAt)]
  )

  // 201 = "Creado con éxito" — devolvemos el evento creado para que el cliente
  // pueda añadirlo a su lista local sin tener que volver a pedir todos los eventos
  res.status(201).json({ id, channelId, title, scheduledAt })
})

/* ── DELETE /events/:id ──────────────────────────────────────────────────────
   Borra un evento específico por su ID. Solo el admin puede hacerlo.
   :id es un "parámetro de ruta" — por ejemplo DELETE /events/abc-123
   borrará el evento con id = "abc-123"
*/
router.delete('/:id', adminAuth, async (req: Request, res: Response) => {
  await pool.query('DELETE FROM events WHERE id = ?', [req.params['id']])
  res.json({ ok: true })
})

/* ── DELETE /events/epg-all ──────────────────────────────────────────────────
   Borra TODOS los eventos que vinieron de la guía EPG de una vez.
   Útil para hacer una limpieza completa antes de una nueva sincronización.
   Solo el admin puede hacerlo.
*/
router.delete('/epg-all', adminAuth, async (_req: Request, res: Response) => {
  // El resultado incluye "affectedRows": cuántas filas se borraron
  const [result] = await pool.query(`DELETE FROM events WHERE source = 'epg'`) as [{ affectedRows: number }, unknown]
  res.json({ ok: true, deleted: result.affectedRows })
})

/* ── POST /events/sync-epg ───────────────────────────────────────────────────
   Lanza una sincronización manual de la guía de programación EPG española.
   El servicio epgSync descarga el XML de la guía y lo importa a la BD.
   Útil cuando el admin quiere forzar una actualización sin esperar al sync automático.
*/
router.post('/sync-epg', adminAuth, async (_req: Request, res: Response) => {
  try {
    const result = await syncEPGEvents(pool)
    res.json({ ok: true, ...result })
  } catch (err) {
    console.error('[EPG] Error en sync manual:', err)
    res.status(500).json({ ok: false, error: (err as Error).message })
  }
})

export default router

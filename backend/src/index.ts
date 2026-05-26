import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import type { RowDataPacket } from 'mysql2'
import pool from './db'
import channelsRouter from './routes/channels'
import eventsRouter from './routes/events'
import { syncChannelEvents } from './services/youtubeSync'
import { syncEPGEvents } from './services/epgSync'

const app = express()
const port = Number(process.env['PORT'] ?? 3000)

app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*' }))
app.use(express.json())

app.use('/channels', channelsRouter)
app.use('/events', eventsRouter)

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

// Crear tabla events si no existe + migraciones incrementales
async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id           CHAR(36)     PRIMARY KEY,
      channel_id   CHAR(36)     NOT NULL,
      title        VARCHAR(200) NOT NULL,
      scheduled_at DATETIME     NOT NULL,
      created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `)
  // Migración: columna youtube_sync_url en channels (idempotente)
  const [cols] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'youtube_sync_url'`
  )
  if ((cols[0] as { cnt: number }).cnt === 0) {
    await pool.query(`ALTER TABLE channels ADD COLUMN youtube_sync_url TEXT NULL`)
  }

  // Migración: columna end_time en events (idempotente)
  const [colsEndTime] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'end_time'`
  )
  if ((colsEndTime[0] as { cnt: number }).cnt === 0) {
    await pool.query(`ALTER TABLE events ADD COLUMN end_time DATETIME NULL`)
  }

  // Migración: columna source en events (idempotente)
  const [colsSource] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'source'`
  )
  if ((colsSource[0] as { cnt: number }).cnt === 0) {
    await pool.query(`ALTER TABLE events ADD COLUMN source VARCHAR(20) NULL`)
  }
}

// ─── Auto-sync de eventos YouTube ─────────────────────────────────────────────
async function autoSyncYoutubeEvents() {
  const apiKey = process.env['YOUTUBE_API_KEY']
  if (!apiKey) return

  const [channels] = await pool.query<RowDataPacket[]>(`
    SELECT
      id, name,
      CASE WHEN youtube_sync_url IS NOT NULL AND youtube_sync_url != ''
           THEN youtube_sync_url
           ELSE url
      END AS syncUrl
    FROM channels
    WHERE stream_type = 'youtube'
       OR (youtube_sync_url IS NOT NULL AND youtube_sync_url != '')
  `)
  for (const ch of channels as Array<{ id: string; name: string; syncUrl: string }>) {
    try {
      const result = await syncChannelEvents({ id: ch.id, name: ch.name, url: ch.syncUrl }, apiKey, pool)
      if (result.created > 0)
        console.log(`[AutoSync] ${ch.name}: +${result.created} evento${result.created !== 1 ? 's' : ''} nuevo${result.created !== 1 ? 's' : ''}`)
    } catch (err) {
      console.error(`[AutoSync] Error en ${ch.name}:`, (err as Error).message)
    }
  }
}

/**
 * Lanza fn() una vez al arranque (tras `delayMs`) y después siempre en punto:
 * calcula el tiempo hasta la próxima frontera exacta del intervalo y a partir
 * de ahí repite cada `intervalMs`. Ej: arranque 13:37 → primer tick 14:00:00,
 * luego 15:00, 16:00… (funciona igual para múltiplos de hora: 6h → 00/06/12/18h)
 */
function scheduleAtHourBoundary(fn: () => Promise<unknown>, intervalMs: number, startDelayMs: number) {
  // Sync inicial al arrancar
  setTimeout(() => fn().catch(console.error), startDelayMs)

  // Calcular ms hasta la próxima frontera exacta de intervalo (en epoch UTC)
  const msUntilNext = intervalMs - (Date.now() % intervalMs)
  setTimeout(() => {
    fn().catch(console.error)
    setInterval(() => fn().catch(console.error), intervalMs)
  }, msUntilNext)
}

// YouTube: cada 1 hora en punto (configurable con YOUTUBE_SYNC_INTERVAL_HOURS)
const syncIntervalHours = Number(process.env['YOUTUBE_SYNC_INTERVAL_HOURS'] ?? 1)
scheduleAtHourBoundary(autoSyncYoutubeEvents, syncIntervalHours * 3_600_000, 30_000)

// EPG: cada 6 horas en punto
scheduleAtHourBoundary(syncEPGEvents.bind(null, pool), 6 * 3_600_000, 60_000)

migrate()
  .then(() => app.listen(port, () => console.log(`TitanOS Sports API corriendo en puerto ${port}`)))
  .catch((err) => { console.error('Error en migración:', err); process.exit(1) })

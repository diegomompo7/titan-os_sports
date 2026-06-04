/* =============================================================================
   FICHERO: backend/src/index.ts
   ¿QUÉ ES ESTO?
   El servidor principal del backend. Es el punto de arranque de toda la parte
   del servidor de la aplicación. Cuando se ejecuta "node index.js" (o el
   equivalente), este fichero es lo primero que corre.

   Sus responsabilidades son:
   1. Configurar el servidor HTTP (Express)
   2. Registrar las rutas de la API (/channels, /events)
   3. Ejecutar migraciones de base de datos al arrancar
   4. Programar tareas periódicas automáticas (sync YouTube, sync EPG)

   Analogía: es como el encargado de abrir la oficina por la mañana.
   Enciende las luces (Express), coloca a cada empleado en su puesto
   (rutas), revisa si hay algún cambio pendiente en los archivos (migración),
   y programa las tareas recurrentes del día (sync automático).
============================================================================= */

// dotenv: carga las variables de entorno del fichero .env (contraseñas, URLs, etc.)
import 'dotenv/config'
// express: el framework de servidor web más usado en Node.js
import express from 'express'
// cors: permite que el frontend (que corre en otro servidor/puerto) acceda a la API
import cors from 'cors'
import type { RowDataPacket } from 'mysql2'
// Pool de conexión a la base de datos
import pool from './db'
// Los módulos de rutas — cada uno gestiona un grupo de endpoints
import channelsRouter from './routes/channels'
import eventsRouter   from './routes/events'
import adsRouter      from './routes/ads'
// Servicios de sincronización automática
import { syncChannelEvents } from './services/youtubeSync'
import { syncEPGEvents }     from './services/epgSync'

// Crear la app Express (el servidor HTTP)
const app = express()

// Puerto en el que escucha el servidor. Se puede configurar con la variable PORT.
// Si no está definida, usa el 3000 por defecto.
const port = Number(process.env['PORT'] ?? 3000)

// ── Middlewares globales ─────────────────────────────────────────────────────

// CORS: permite peticiones desde el frontend (configurable con CORS_ORIGIN)
// '*' significa "aceptar peticiones de cualquier origen" — útil en desarrollo
app.use(cors({ origin: process.env['CORS_ORIGIN'] ?? '*' }))

// express.json(): permite leer el body de las peticiones POST/PUT en formato JSON
app.use(express.json())

// ── Rutas de la API ──────────────────────────────────────────────────────────

// Todas las rutas que empiecen por /channels van al channelsRouter
app.use('/channels', channelsRouter)

// Todas las rutas que empiecen por /events van al eventsRouter
app.use('/events', eventsRouter)

// Todas las rutas que empiecen por /ads van al adsRouter
app.use('/ads', adsRouter)

// Health check: ruta simple para comprobar si el servidor está vivo
// Útil para herramientas de monitorización y despliegue (Railway, etc.)
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

/* ── Migración de base de datos ────────────────────────────────────────────
   Una "migración" es un cambio incremental en la estructura de la base de datos.
   Por ejemplo: añadir una nueva columna, crear una tabla nueva.

   Las migraciones son "idempotentes" — se pueden ejecutar múltiples veces sin
   causar errores. Si la tabla/columna ya existe, se ignora.

   ¿Por qué ejecutarlas al arrancar?
   Así cuando desplegamos una versión nueva del servidor, la BD se actualiza
   automáticamente sin intervención manual.
*/
async function migrate() {
  // Crear la tabla de eventos si no existe todavía (primera vez que se ejecuta)
  await pool.query(`
    CREATE TABLE IF NOT EXISTS events (
      id           CHAR(36)     PRIMARY KEY,
      channel_id   CHAR(36)     NOT NULL,
      title        VARCHAR(200) NOT NULL,
      scheduled_at DATETIME     NOT NULL,
      created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // Migración: añadir columna "youtube_sync_url" a la tabla channels (si no existe)
  // Verifica en INFORMATION_SCHEMA (el catálogo interno de MySQL) si la columna existe
  const [cols] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'channels' AND COLUMN_NAME = 'youtube_sync_url'`
  )
  if ((cols[0] as { cnt: number }).cnt === 0) {
    // cnt === 0 significa que la columna NO existe → añadirla
    await pool.query(`ALTER TABLE channels ADD COLUMN youtube_sync_url TEXT NULL`)
  }

  // Migración: añadir columna "end_time" a events (para eventos EPG con hora de fin)
  const [colsEndTime] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'end_time'`
  )
  if ((colsEndTime[0] as { cnt: number }).cnt === 0) {
    await pool.query(`ALTER TABLE events ADD COLUMN end_time DATETIME NULL`)
  }

  // Migración: añadir columna "source" a events (para saber si vino de YouTube o EPG)
  const [colsSource] = await pool.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'events' AND COLUMN_NAME = 'source'`
  )
  if ((colsSource[0] as { cnt: number }).cnt === 0) {
    await pool.query(`ALTER TABLE events ADD COLUMN source VARCHAR(20) NULL`)
  }
}

/* ── Sincronización automática de eventos de YouTube ───────────────────────
   Una vez por hora, el servidor descarga los próximos directos de todos
   los canales de YouTube y los guarda en la base de datos.
   Así la información de "próximo evento" siempre está actualizada.
*/
async function autoSyncYoutubeEvents() {
  const apiKey = process.env['YOUTUBE_API_KEY']
  if (!apiKey) return  // Sin API key, no podemos consultar YouTube

  // Obtener todos los canales que tienen YouTube: tipo 'youtube' o con youtube_sync_url
  // La cláusula CASE elige qué URL usar: youtube_sync_url tiene prioridad sobre url
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

  // Sincronizar cada canal uno por uno (en serie para no saturar la API de YouTube)
  for (const ch of channels as Array<{ id: string; name: string; syncUrl: string }>) {
    try {
      const result = await syncChannelEvents({ id: ch.id, name: ch.name, url: ch.syncUrl }, apiKey, pool)
      if (result.created > 0)
        console.log(`[AutoSync] ${ch.name}: +${result.created} evento${result.created !== 1 ? 's' : ''} nuevo${result.created !== 1 ? 's' : ''}`)
    } catch (err) {
      // Si un canal falla, continuamos con el siguiente (no queremos que un error pare todo)
      console.error(`[AutoSync] Error en ${ch.name}:`, (err as Error).message)
    }
  }
}

/* ── Programador de tareas en horas en punto ────────────────────────────────
   En vez de ejecutar tareas a intervalos fijos desde el arranque (que podría
   ser a las 13:37, 14:37, 15:37...), esta función las sincroniza con el reloj
   real para que corran siempre en horas en punto (14:00, 15:00, 16:00...).

   Primero hace una ejecución inicial tras un pequeño retraso, luego calcula
   cuánto falta hasta la próxima hora exacta y a partir de ahí repite.

   Ejemplo: servidor arranca a las 13:37
   - Ejecución inicial: a las 13:37 + startDelayMs
   - Próxima ejecución en punto: a las 14:00:00
   - A partir de ahí: cada hora en punto (15:00, 16:00, etc.)
*/
function scheduleAtHourBoundary(fn: () => Promise<unknown>, intervalMs: number, startDelayMs: number) {
  // Ejecución inicial: esperar startDelayMs (para que la BD esté migrada)
  setTimeout(() => fn().catch(console.error), startDelayMs)

  // Calcular cuántos milisegundos faltan hasta la próxima "frontera" del intervalo
  // Date.now() % intervalMs = cuántos ms llevamos desde la última frontera
  // intervalMs - eso = cuántos ms faltan para la próxima
  const msUntilNext = intervalMs - (Date.now() % intervalMs)

  setTimeout(() => {
    fn().catch(console.error)                          // Ejecutar en la frontera
    setInterval(() => fn().catch(console.error), intervalMs)  // Y luego repetir
  }, msUntilNext)
}

// ── Programación de tareas automáticas ──────────────────────────────────────

// Sync de YouTube: cada 1 hora en punto (configurable con YOUTUBE_SYNC_INTERVAL_HOURS)
// startDelay = 30 segundos para que la migración termine antes
const syncIntervalHours = Number(process.env['YOUTUBE_SYNC_INTERVAL_HOURS'] ?? 1)
scheduleAtHourBoundary(autoSyncYoutubeEvents, syncIntervalHours * 3_600_000, 30_000)

// Sync de EPG (guía de programación): cada 6 horas en punto (00:00, 06:00, 12:00, 18:00 UTC)
// startDelay = 60 segundos para no solaparse con la migración
scheduleAtHourBoundary(syncEPGEvents.bind(null, pool), 6 * 3_600_000, 60_000)

// ── Arrancar el servidor ─────────────────────────────────────────────────────
// Primero ejecutamos las migraciones, luego arrancamos el servidor en el puerto configurado
migrate()
  .then(() => app.listen(port, () => console.log(`TitanOS Sports API corriendo en puerto ${port}`)))
  .catch((err) => {
    // Si la migración falla (BD no disponible, error SQL), cerramos el servidor
    console.error('Error en migración:', err)
    process.exit(1)  // Código 1 = salida con error
  })

import { parseStringPromise } from 'xml2js'
import type { Pool, RowDataPacket } from 'mysql2/promise'

// EPG fuente: davidmuma/EPG_dobleM — cubre todos los canales españoles incluyendo Atresmedia
const EPG_URL = 'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiaiptv.xml'
const EPG_WINDOW_DAYS = 7

// ─── Palabras clave deportivas ────────────────────────────────────────────────
const SPORT_KEYWORDS = [
  'deport',
  'fútbol', 'futbol',
  'tenis',
  'baloncest',
  'atletism',
  'ciclism',
  'motociclism', 'motor sport', 'motorsport',
  'formula',
  'golf',
  'nataci',
  'boxeo',
  'rugby',
  'olimp',
  'handball', 'balonmano',
  'esgrima',
  'judo',
  'karate',
  'voley', 'volei',
  'padel', 'pádel',
  'beisbol', 'béisbol',
  'hockey',
  'snowboard', 'esqui', 'esquí',
  'surf',
  'triatlón', 'triatlon',
  'gimnasia',
  'equitacion', 'equitación',
  'vela',
  'remo',
  'piragüismo', 'piraguismo',
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Normaliza texto: minúsculas, quita tildes, trim */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Devuelve true si el programa es deportivo.
 * Comprueba <category>, el título, y SOLO el prefijo de <desc>
 * (antes del primer | · o salto de línea) para evitar falsos positivos.
 * En davidmuma el desc empieza: "Deportes,Fútbol | año | detalles..."
 */
function isSportsProgram(categories: string[], title: string, desc: string): boolean {
  const descPrefix = desc.split(/[|·\n\r]/)[0] ?? ''
  const text = normalize([...categories, title, descPrefix].join(' '))
  return SPORT_KEYWORDS.some((k) => text.includes(normalize(k)))
}

/**
 * Parsea la fecha XMLTV: "20250526153000 +0200" → Date (UTC)
 */
function parseXMLTVDate(str: string): Date | null {
  const m = str.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})/)
  if (!m) return null
  const [, year, month, day, hour, min, sec, sign, offH, offM] = m
  const offsetMin = (sign === '+' ? 1 : -1) * (Number(offH) * 60 + Number(offM))
  const utcMs =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec)) -
    offsetMin * 60_000
  const d = new Date(utcMs)
  return isNaN(d.getTime()) ? null : d
}

/** Formatea Date a "YYYY-MM-DD HH:mm:ss" para MySQL */
function toMysqlDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface XmlChannel {
  $: { id: string }
  'display-name'?: Array<string | { _: string; $?: { lang: string } }>
}

interface XmlProgramme {
  $: { start: string; stop?: string; channel: string }
  title?: Array<string | { _: string; $?: { lang: string } }>
  category?: Array<string | { _: string; $?: { lang: string } }>
  desc?: Array<string | { _: string; $?: { lang: string } }>
}

function extractText(arr: Array<string | { _: string }> | undefined): string {
  if (!arr?.length) return ''
  const first = arr[0]
  return typeof first === 'string' ? first : (first._ ?? '')
}

function extractTexts(arr: Array<string | { _: string }> | undefined): string[] {
  if (!arr?.length) return []
  return arr.map((x) => (typeof x === 'string' ? x : (x._ ?? '')))
}

// Tags XMLTV válidos — cualquier otro tag es HTML contaminado
const XMLTV_VALID_TAGS = new Set([
  'tv', 'channel', 'programme', 'display-name', 'title', 'sub-title',
  'category', 'desc', 'icon', 'url', 'date', 'episode-num', 'star-rating',
  'value', 'credits', 'director', 'actor', 'writer', 'adapter', 'producer',
  'composer', 'editor', 'presenter', 'commentator', 'guest', 'previously-shown',
  'premiere', 'last-chance', 'new', 'subtitles', 'rating', 'review', 'image',
  'keyword', 'language', 'orig-language', 'length', 'country', 'video', 'audio',
  'present', 'colour', 'aspect', 'quality', 'stereo', 'live',
])

/**
 * Sanitiza XML potencialmente malformado:
 *  1. Limpia HTML dentro de <desc> conservando texto plano
 *  2. Arregla & sueltos → &amp;
 *  3. Elimina tags HTML no-XMLTV (<br>, <a>, <p>, etc.)
 *  4. Arregla < sin escapar → &lt;
 */
function sanitizeXml(xml: string): string {
  return xml
    .replace(/<desc\b([^>]*)>([\s\S]*?)<\/desc>/gi, (_, attrs: string, content: string) => {
      const clean = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return `<desc${attrs}>${clean}</desc>`
    })
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, '&amp;')
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?\/?>/g, (match, tagName: string) => {
      return XMLTV_VALID_TAGS.has(tagName.toLowerCase()) ? match : ''
    })
    .replace(/<(?![/!?]|[a-zA-Z_:])/g, '&lt;')
}

// ─── Resultado ────────────────────────────────────────────────────────────────

export interface EpgSyncResult {
  matched: number
  matchedChannels: string[]
  created: number
  skipped: number
  byChannel: Record<string, number>
}

// ─── Función principal ────────────────────────────────────────────────────────

export async function syncEPGEvents(pool: Pool): Promise<EpgSyncResult> {
  console.log('[EPG] Iniciando sincronización...')

  // 1. Descargar XML (plain, no gzip)
  const resp = await fetch(EPG_URL)
  if (!resp.ok) throw new Error(`[EPG] Error al descargar EPG: HTTP ${resp.status}`)
  const xml = await resp.text()
  console.log(`[EPG] XML descargado (${(xml.length / 1024).toFixed(0)} KB)`)

  // 2. Sanitizar y parsear XML
  const xmlClean = sanitizeXml(xml)
  const parsed = (await parseStringPromise(xmlClean, { explicitArray: true })) as {
    tv: { channel?: XmlChannel[]; programme?: XmlProgramme[] }
  }
  const { channel: epgChannels = [], programme: programmes = [] } = parsed.tv

  // 3. Cargar canales de la BD
  const [dbRows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM channels')
  const dbChannels = dbRows as Array<{ id: string; name: string }>

  // 4. Construir mapa EPG channelId → DB channelId
  //    En davidmuma el ID del canal = nombre con espacios: "La 1 HD", "Antena 3 HD"
  //    Match exacto normalizado (sin includes para evitar canales hermanos como Ten/Antena 3)
  const epgToDb = new Map<string, string>()
  const matchedNames: string[] = []

  for (const epgCh of epgChannels) {
    const epgId = epgCh.$.id
    const epgNorm = normalize(epgId)
    const epgNoSp = epgNorm.replace(/\s+/g, '')

    const dbMatch = dbChannels.find((db) => {
      const dbNorm = normalize(db.name)
      const dbNoSp = dbNorm.replace(/\s+/g, '')
      return dbNorm === epgNorm || dbNoSp === epgNoSp
    })

    if (dbMatch && !epgToDb.has(epgId)) {
      epgToDb.set(epgId, dbMatch.id)
      matchedNames.push(dbMatch.name)
    }
  }

  console.log(`[EPG] Canales con match: ${matchedNames.length} → [${[...new Set(matchedNames)].join(', ')}]`)

  if (epgToDb.size === 0) {
    console.log('[EPG] No se encontraron canales coincidentes. Revisa los nombres en la BD.')
    return { matched: 0, matchedChannels: [], created: 0, skipped: 0, byChannel: {} }
  }

  // 5. Borrar TODOS los eventos EPG (sync limpio)
  await pool.query(`DELETE FROM events WHERE source = 'epg'`)

  // Mapa dbChannelId → nombre del canal (para el INSERT de channel_name)
  const dbIdToName = new Map(dbChannels.map((c) => [c.id, c.name]))

  // 6. Procesar programas
  const now = new Date()
  const maxDate = new Date(now.getTime() + EPG_WINDOW_DAYS * 24 * 3_600_000)
  let created = 0
  let skipped = 0
  const byChannel: Record<string, number> = {}

  for (const prog of programmes) {
    const epgChannelId = prog.$.channel
    const dbChannelId = epgToDb.get(epgChannelId)
    if (!dbChannelId) continue

    const title = extractText(prog.title)
    if (!title) continue

    const categories = extractTexts(prog.category)
    const desc = extractText(prog.desc)

    if (!isSportsProgram(categories, title, desc)) continue

    const startDate = parseXMLTVDate(prog.$.start)
    if (!startDate || startDate <= now || startDate > maxDate) continue

    const stopDate = prog.$.stop ? parseXMLTVDate(prog.$.stop) : null
    const scheduledMysql = toMysqlDatetime(startDate)

    // Comprobar duplicado
    const [existing] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM events
       WHERE channel_id = ? AND title = ?
       AND ABS(TIMESTAMPDIFF(SECOND, scheduled_at, ?)) < 3600`,
      [dbChannelId, title, scheduledMysql]
    )

    if (existing.length > 0) {
      skipped++
      continue
    }

    await pool.query(
      `INSERT INTO events (id, channel_id, channel_name, title, scheduled_at, end_time, source)
       VALUES (?, ?, ?, ?, ?, ?, 'epg')`,
      [
        crypto.randomUUID(),
        dbChannelId,
        dbIdToName.get(dbChannelId) ?? '',
        title,
        scheduledMysql,
        stopDate ? toMysqlDatetime(stopDate) : null,
      ]
    )

    created++
    byChannel[dbChannelId] = (byChannel[dbChannelId] ?? 0) + 1
  }

  // Log por canal
  for (const [chId, count] of Object.entries(byChannel)) {
    console.log(`[EPG] ${dbIdToName.get(chId) ?? chId}: +${count} evento${count !== 1 ? 's' : ''} deportivo${count !== 1 ? 's' : ''}`)
  }
  console.log(`[EPG] Sync completado — ${created} creados, ${skipped} duplicados omitidos`)

  const uniqueMatchedNames = [...new Set(matchedNames)]
  return { matched: uniqueMatchedNames.length, matchedChannels: uniqueMatchedNames, created, skipped, byChannel }
}

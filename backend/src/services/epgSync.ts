import { gunzipSync } from 'zlib'
import { parseStringPromise } from 'xml2js'
import type { Pool, RowDataPacket } from 'mysql2/promise'

const EPG_URL = 'https://www.tdtchannels.com/epg/TV.xml.gz'
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

/** Devuelve true si el programa es deportivo según categorías o título */
function isSportsProgram(categories: string[], title: string): boolean {
  const text = normalize([...categories, title].join(' '))
  return SPORT_KEYWORDS.some((k) => text.includes(normalize(k)))
}

/**
 * Parsea la fecha XMLTV: "20250526153000 +0200" → Date (UTC)
 * Formato: YYYYMMDDHHmmss ±HHmm
 */
function parseXMLTVDate(str: string): Date | null {
  // Acepta: "20250526153000 +0200" o "20250526153000 +020000"
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

// Tags XMLTV válidos — cualquier otro tag que aparezca en el XML es HTML contaminado
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
 * Sanitiza XML malformado del proveedor EPG (tdtchannels.com):
 *  1. Elimina <desc> enteros (suelen contener HTML crudo; no los usamos)
 *  2. Arregla & sueltos → &amp;
 *  3. Elimina tags HTML no-XMLTV (<br>, <a href=...>, <p>, etc.)
 *  4. Arregla < que no abren ningún construct XML válido → &lt;
 */
function sanitizeXml(xml: string): string {
  return xml
    // 1. Eliminar elementos <desc> (contienen HTML con tags sin escapar)
    .replace(/<desc\b[^>]*>[\s\S]*?<\/desc>/gi, '')
    // 2. Arreglar & sueltos
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, '&amp;')
    // 3. Eliminar tags HTML no-XMLTV incrustados en nodos de texto
    //    (<br>, <a href=...>, <b>, <i>, <p>, <span>…)
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?\/?>/g, (match, tagName: string) => {
      return XMLTV_VALID_TAGS.has(tagName.toLowerCase()) ? match : ''
    })
    // 4. < sueltos que quedaron sin escapar
    .replace(/<(?![/!?]|[a-zA-Z_:])/g, '&lt;')
}

// ─── Función principal ────────────────────────────────────────────────────────

export interface EpgSyncResult {
  matched: number   // canales de la BD que encontraron match en el EPG
  created: number
  skipped: number
  byChannel: Record<string, number>
}

export async function syncEPGEvents(pool: Pool): Promise<EpgSyncResult> {
  console.log('[EPG] Iniciando sincronización...')

  // 1. Descargar y descomprimir
  const resp = await fetch(EPG_URL)
  if (!resp.ok) throw new Error(`[EPG] Error al descargar EPG: HTTP ${resp.status}`)
  const buffer = Buffer.from(await resp.arrayBuffer())
  const xml = gunzipSync(buffer).toString('utf-8')
  console.log(`[EPG] XML descargado y descomprimido (${(xml.length / 1024).toFixed(0)} KB)`)

  // 2. Parsear XML (sanitizar caracteres mal codificados del proveedor)
  const xmlClean = sanitizeXml(xml)
  const parsed = (await parseStringPromise(xmlClean, { explicitArray: true })) as {
    tv: { channel?: XmlChannel[]; programme?: XmlProgramme[] }
  }
  const { channel: epgChannels = [], programme: programmes = [] } = parsed.tv

  // 3. Cargar canales de la BD
  const [dbRows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM channels')
  const dbChannels = dbRows as Array<{ id: string; name: string }>

  // 4. Construir mapa EPG channelId → DB channelId
  //    Match: nombre normalizado del EPG == nombre normalizado de la BD
  const epgToDb = new Map<string, string>() // epgChannelId → dbChannelId
  const matchedNames: string[] = []

  for (const epgCh of epgChannels) {
    const epgId = epgCh.$.id
    const epgName = normalize(extractText(epgCh['display-name']))
    if (!epgName) continue

    // Buscar coincidencia en la BD
    const dbMatch = dbChannels.find((db) => {
      const dbName = normalize(db.name)
      return dbName === epgName || dbName.includes(epgName) || epgName.includes(dbName)
    })

    if (dbMatch) {
      epgToDb.set(epgId, dbMatch.id)
      matchedNames.push(dbMatch.name)
    }
  }

  console.log(`[EPG] Canales con match: ${matchedNames.length} → [${matchedNames.join(', ')}]`)

  if (epgToDb.size === 0) {
    console.log('[EPG] No se encontraron canales coincidentes. Revisa los nombres en la BD.')
    return { matched: 0, created: 0, skipped: 0, byChannel: {} }
  }

  // 5. Limpiar eventos EPG pasados
  await pool.query(`DELETE FROM events WHERE source = 'epg' AND scheduled_at < NOW()`)

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

    if (!isSportsProgram(categories, title)) continue

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
      `INSERT INTO events (id, channel_id, title, scheduled_at, end_time, source)
       VALUES (?, ?, ?, ?, ?, 'epg')`,
      [
        crypto.randomUUID(),
        dbChannelId,
        title,
        scheduledMysql,
        stopDate ? toMysqlDatetime(stopDate) : null,
      ]
    )

    created++
    byChannel[dbChannelId] = (byChannel[dbChannelId] ?? 0) + 1
  }

  // Log por canal usando nombres
  const dbIdToName = new Map(dbChannels.map((c) => [c.id, c.name]))
  for (const [chId, count] of Object.entries(byChannel)) {
    console.log(`[EPG] ${dbIdToName.get(chId) ?? chId}: +${count} evento${count !== 1 ? 's' : ''} deportivo${count !== 1 ? 's' : ''}`)
  }
  console.log(`[EPG] Sync completado — ${created} creados, ${skipped} duplicados omitidos`)

  return { matched: epgToDb.size, created, skipped, byChannel }
}

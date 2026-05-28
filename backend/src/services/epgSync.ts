/* =============================================================================
   FICHERO: backend/src/services/epgSync.ts
   ¿QUÉ ES ESTO?
   Descarga y procesa la Guía Electrónica de Programación (EPG) de la
   televisión española. La EPG es un fichero XML con la programación
   completa de todos los canales TV del país (qué programa emite cada
   canal a cada hora).

   Este servicio:
   1. Descarga el XML de la EPG española (proyecto davidmuma en GitHub)
   2. Filtra solo los programas deportivos
   3. Los cruza con los canales que tenemos en la BD
   4. Guarda los eventos deportivos futuros en la tabla de eventos

   Así la app puede mostrar "próximo evento: Fórmula 1 — GP Mónaco (Antena 3)"
   incluso para canales de TDT que no tienen API propia.

   Analogía: es como un administrativo que compra el periódico del día,
   recorta solo las noticias de deportes, busca qué artículos están
   relacionados con nuestros canales de TV, y los archiva.
============================================================================= */

// xml2js: librería para convertir XML a objetos JavaScript
import { parseStringPromise } from 'xml2js'
import type { Pool, RowDataPacket } from 'mysql2/promise'

// URL de la EPG española — proyecto de código abierto en GitHub
// Cubre todos los canales españoles: TDT, Atresmedia, Mediaset, etc.
const EPG_URL = 'https://raw.githubusercontent.com/davidmuma/EPG_dobleM/master/guiaiptv.xml'

// Cuántos días hacia el futuro cargamos de la EPG
const EPG_WINDOW_DAYS = 7

/* ── Palabras clave para detectar programas deportivos ──────────────────────
   Si el programa contiene alguna de estas palabras (en título o categoría),
   se considera deportivo y se guarda como evento.

   Nota: algunas palabras como "vela", "remo" o "surf" se eliminaron porque
   también aparecen en palabras no deportivas ("novela", "recorremos", "Surface")
   causando falsos positivos.
*/
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
  'snowboard',
  'triatlón', 'triatlon',
  'gimnasia',
  'equitacion', 'equitación',
  'piragüismo', 'piraguismo',
]

/* ── Funciones auxiliares (helpers) ─────────────────────────────────────────*/

/*
 * Normaliza texto para comparaciones: convierte a minúsculas, elimina tildes
 * y espacios al inicio/fin. Así "Fútbol" y "futbol" son iguales para nosotros.
 */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')                     // Descompone caracteres acentuados: "é" → "e" + acento
    .replace(/[̀-ͯ]/g, '')              // Elimina los acentos separados
    .trim()
}

/*
 * Determina si un programa de la EPG es deportivo.
 * La EPG de davidmuma usa el formato en el campo descripción:
 * "Categoría1,Categoría2 | año | descripción libre..."
 *
 * Solo analizamos el texto ANTES del primer "|" (el bloque de categorías).
 * Si no hay "|", ignoramos el programa para evitar falsos positivos en
 * descripciones libres sin formato estándar.
 *
 * Ejemplo: "Magazine,Entretenimiento,Deportes | 2025 | ..." → es deportivo ✓
 *          "Series,Telenovela | 2025 | ..."                → NO es deportivo ✓
 */
function isSportsProgram(categories: string[], _title: string, desc: string): boolean {
  const pipeIdx = desc.indexOf('|')
  if (pipeIdx === -1) return false  // Sin formato estándar, ignorar

  const beforePipe = desc.slice(0, pipeIdx).trim()  // Solo las categorías
  // Unir categorías + texto antes del "|", normalizar y buscar palabras clave
  const text = normalize([...categories, beforePipe].join(' '))
  return SPORT_KEYWORDS.some((k) => text.includes(normalize(k)))
}

/*
 * Parsea el formato de fecha de los ficheros XMLTV (EPG):
 * Formato: "20250526153000 +0200" (YYYYMMDDHHMMSS zona_horaria)
 * Devuelve un objeto Date en UTC, o null si el formato es inválido.
 *
 * Ejemplo: "20250526153000 +0200"
 * → 26 de mayo de 2025, 15:30:00 hora de Madrid (UTC+2)
 * → 26 de mayo de 2025, 13:30:00 UTC
 */
function parseXMLTVDate(str: string): Date | null {
  // Expresión regular para extraer año, mes, día, hora, minuto, segundo y zona horaria
  const m = str.trim().match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-])(\d{2})(\d{2})/)
  if (!m) return null

  const [, year, month, day, hour, min, sec, sign, offH, offM] = m
  // Calcular el offset de la zona horaria en minutos
  const offsetMin = (sign === '+' ? 1 : -1) * (Number(offH) * 60 + Number(offM))

  // Construir la fecha en UTC restando el offset de la zona horaria
  const utcMs =
    Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hour), Number(min), Number(sec)) -
    offsetMin * 60_000

  const d = new Date(utcMs)
  return isNaN(d.getTime()) ? null : d  // null si la fecha resultante no es válida
}

/* Convierte un objeto Date al formato que usa MySQL: "YYYY-MM-DD HH:mm:ss" */
function toMysqlDatetime(d: Date): string {
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/* ── Tipos para el XML parseado ─────────────────────────────────────────────
   Definen la estructura exacta del XML de la EPG tal como lo parsea xml2js.
*/

// Estructura de un canal en el XML de la EPG
interface XmlChannel {
  $: { id: string }                                                          // id="Canal 1 HD"
  'display-name'?: Array<string | { _: string; $?: { lang: string } }>      // Nombre del canal
}

// Estructura de un programa en el XML de la EPG
interface XmlProgramme {
  $: { start: string; stop?: string; channel: string }  // Fechas y canal al que pertenece
  title?:    Array<string | { _: string; $?: { lang: string } }>   // Título del programa
  category?: Array<string | { _: string; $?: { lang: string } }>   // Categorías: "Deportes", etc.
  desc?:     Array<string | { _: string; $?: { lang: string } }>   // Descripción
}

/* Extrae el texto de un campo xml2js que puede ser string o {_: string} */
function extractText(arr: Array<string | { _: string }> | undefined): string {
  if (!arr?.length) return ''
  const first = arr[0]
  return typeof first === 'string' ? first : (first._ ?? '')
}

/* Extrae todos los textos de un campo que puede tener múltiples valores */
function extractTexts(arr: Array<string | { _: string }> | undefined): string[] {
  if (!arr?.length) return []
  return arr.map((x) => (typeof x === 'string' ? x : (x._ ?? '')))
}

// Tags XMLTV válidos — cualquier otro tag es HTML contaminado que hay que limpiar
const XMLTV_VALID_TAGS = new Set([
  'tv', 'channel', 'programme', 'display-name', 'title', 'sub-title',
  'category', 'desc', 'icon', 'url', 'date', 'episode-num', 'star-rating',
  'value', 'credits', 'director', 'actor', 'writer', 'adapter', 'producer',
  'composer', 'editor', 'presenter', 'commentator', 'guest', 'previously-shown',
  'premiere', 'last-chance', 'new', 'subtitles', 'rating', 'review', 'image',
  'keyword', 'language', 'orig-language', 'length', 'country', 'video', 'audio',
  'present', 'colour', 'aspect', 'quality', 'stereo', 'live',
])

/*
 * Limpia el XML de la EPG antes de parsearlo, porque algunos proveedores
 * incluyen HTML dentro de las etiquetas XML (lo que invalida el XML).
 *
 * Correcciones que aplica:
 * 1. Eliminar etiquetas HTML dentro de <desc> (conservar solo texto plano)
 * 2. Escapar '&' sueltos que no forman parte de entidades XML válidas
 * 3. Eliminar etiquetas HTML no estándar (<br>, <a href="...">, <p>, etc.)
 * 4. Escapar '<' que no forman parte de etiquetas XML
 */
function sanitizeXml(xml: string): string {
  return xml
    // Limpiar contenido HTML dentro de <desc>: quitar etiquetas, dejar texto
    .replace(/<desc\b([^>]*)>([\s\S]*?)<\/desc>/gi, (_, attrs: string, content: string) => {
      const clean = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      return `<desc${attrs}>${clean}</desc>`
    })
    // Escapar '&' que no son parte de entidades XML (&amp;, &lt;, &#123;, etc.)
    .replace(/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/gi, '&amp;')
    // Eliminar etiquetas HTML no reconocidas como XMLTV válidas
    .replace(/<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?\/?>/g, (match, tagName: string) => {
      return XMLTV_VALID_TAGS.has(tagName.toLowerCase()) ? match : ''
    })
    // Escapar '<' que no inician una etiqueta XML (< sin letra, slash o signo de exclamación)
    .replace(/<(?![/!?]|[a-zA-Z_:])/g, '&lt;')
}

/* ── Estructura del resultado ───────────────────────────────────────────────*/

export interface EpgSyncResult {
  matched:         number           // Cuántos canales EPG coincidieron con canales de la BD
  matchedChannels: string[]         // Nombres de los canales que coincidieron
  created:         number           // Eventos deportivos nuevos insertados
  skipped:         number           // Eventos duplicados que se saltaron
  byChannel:       Record<string, number>  // Conteo de eventos por canal
}

/* =============================================================================
   FUNCIÓN PRINCIPAL: syncEPGEvents (exportada)
   Descarga y procesa la EPG española completa.

   Pasos:
   1. Descargar el XML de la EPG
   2. Limpiar y parsear el XML
   3. Cargar los canales de nuestra BD
   4. Cruzar los canales de la EPG con los de la BD (por nombre normalizado)
   5. Borrar todos los eventos EPG anteriores (sync limpio)
   6. Para cada programa en la ventana de 7 días:
      - ¿Es deportivo? ¿Es futuro? ¿No está duplicado?
      - Si todo OK → insertar como evento
============================================================================= */
export async function syncEPGEvents(pool: Pool): Promise<EpgSyncResult> {
  console.log('[EPG] Iniciando sincronización...')

  // ── Paso 1: Descargar el XML de la EPG ────────────────────────────────────
  const resp = await fetch(EPG_URL)
  if (!resp.ok) throw new Error(`[EPG] Error al descargar EPG: HTTP ${resp.status}`)
  const xml = await resp.text()
  console.log(`[EPG] XML descargado (${(xml.length / 1024).toFixed(0)} KB)`)

  // ── Paso 2: Limpiar y parsear el XML ──────────────────────────────────────
  const xmlClean = sanitizeXml(xml)
  // parseStringPromise: convierte el XML a un objeto JavaScript normal
  const parsed = (await parseStringPromise(xmlClean, { explicitArray: true })) as {
    tv: { channel?: XmlChannel[]; programme?: XmlProgramme[] }
  }
  const { channel: epgChannels = [], programme: programmes = [] } = parsed.tv

  // ── Paso 3: Cargar los canales de la BD ───────────────────────────────────
  const [dbRows] = await pool.query<RowDataPacket[]>('SELECT id, name FROM channels')
  const dbChannels = dbRows as Array<{ id: string; name: string }>

  // ── Paso 4: Cruzar canales EPG con canales de la BD ───────────────────────
  // La EPG usa el ID del canal como nombre: "La 1 HD", "Antena 3 HD", etc.
  // Buscamos el canal de nuestra BD cuyo nombre normalizado coincida exactamente.
  // Usamos coincidencia EXACTA (no "contiene") para evitar confundir canales
  // con nombres similares como "Ten" y "Antena 3".
  const epgToDb = new Map<string, string>()  // epgChannelId → dbChannelId
  const matchedNames: string[] = []

  for (const epgCh of epgChannels) {
    const epgId   = epgCh.$.id
    const epgNorm = normalize(epgId)
    const epgNoSp = epgNorm.replace(/\s+/g, '')  // Sin espacios: "La1HD"

    const dbMatch = dbChannels.find((db) => {
      const dbNorm = normalize(db.name)
      const dbNoSp = dbNorm.replace(/\s+/g, '')
      // Coincide si el nombre normalizado es igual (con o sin espacios)
      return dbNorm === epgNorm || dbNoSp === epgNoSp
    })

    if (dbMatch && !epgToDb.has(epgId)) {
      epgToDb.set(epgId, dbMatch.id)
      matchedNames.push(dbMatch.name)
    }
  }

  console.log(`[EPG] Canales con match: ${matchedNames.length} → [${[...new Set(matchedNames)].join(', ')}]`)

  // Si no hay coincidencias, no hay nada que hacer
  if (epgToDb.size === 0) {
    console.log('[EPG] No se encontraron canales coincidentes. Revisa los nombres en la BD.')
    return { matched: 0, matchedChannels: [], created: 0, skipped: 0, byChannel: {} }
  }

  // ── Paso 5: Borrar eventos EPG anteriores (sync limpio) ──────────────────
  // Hacemos un sync completo: borramos todos los EPG y los volvemos a insertar.
  // Así no acumulamos eventos obsoletos de días anteriores.
  await pool.query(`DELETE FROM events WHERE source = 'epg'`)

  // Mapa de ID de canal BD → nombre del canal (para el campo channel_name)
  const dbIdToName = new Map(dbChannels.map((c) => [c.id, c.name]))

  // ── Paso 6: Procesar los programas ───────────────────────────────────────
  const now     = new Date()
  const maxDate = new Date(now.getTime() + EPG_WINDOW_DAYS * 24 * 3_600_000)  // +7 días
  let created = 0
  let skipped = 0
  const byChannel: Record<string, number> = {}

  for (const prog of programmes) {
    // ¿Pertenece a algún canal que tenemos en la BD?
    const epgChannelId = prog.$.channel
    const dbChannelId  = epgToDb.get(epgChannelId)
    if (!dbChannelId) continue  // No es un canal nuestro, ignorar

    // ¿Tiene título?
    const title = extractText(prog.title)
    if (!title) continue

    const categories = extractTexts(prog.category)
    const desc       = extractText(prog.desc)

    // ¿Es un programa deportivo?
    if (!isSportsProgram(categories, title, desc)) continue

    // ¿Está en la ventana de tiempo (futuro, hasta 7 días)?
    const startDate = parseXMLTVDate(prog.$.start)
    if (!startDate || startDate <= now || startDate > maxDate) continue

    const stopDate       = prog.$.stop ? parseXMLTVDate(prog.$.stop) : null
    const scheduledMysql = toMysqlDatetime(startDate)

    // ¿Es un duplicado? (mismo canal, mismo título, fecha con menos de 1 hora de diferencia)
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

    // Insertar el evento deportivo nuevo.
    // source = 'epg' para diferenciarlo de los eventos de YouTube o añadidos a mano
    await pool.query(
      `INSERT INTO events (id, channel_id, channel_name, title, scheduled_at, end_time, source)
       VALUES (?, ?, ?, ?, ?, ?, 'epg')`,
      [
        crypto.randomUUID(),
        dbChannelId,
        dbIdToName.get(dbChannelId) ?? '',  // Nombre del canal en la BD
        title,
        scheduledMysql,
        stopDate ? toMysqlDatetime(stopDate) : null,  // Hora de fin (si la tiene)
      ]
    )

    created++
    // Contar eventos creados por canal para el resumen final
    byChannel[dbChannelId] = (byChannel[dbChannelId] ?? 0) + 1
  }

  // Mostrar resumen por canal en los logs del servidor
  for (const [chId, count] of Object.entries(byChannel)) {
    console.log(`[EPG] ${dbIdToName.get(chId) ?? chId}: +${count} evento${count !== 1 ? 's' : ''} deportivo${count !== 1 ? 's' : ''}`)
  }
  console.log(`[EPG] Sync completado — ${created} creados, ${skipped} duplicados omitidos`)

  const uniqueMatchedNames = [...new Set(matchedNames)]
  return { matched: uniqueMatchedNames.length, matchedChannels: uniqueMatchedNames, created, skipped, byChannel }
}

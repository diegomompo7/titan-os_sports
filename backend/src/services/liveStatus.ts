/* =============================================================================
   FICHERO: backend/src/services/liveStatus.ts
   ¿QUÉ ES ESTO?
   Consulta en tiempo real si los canales de Twitch y YouTube están emitiendo
   EN DIRECTO en este momento. La app muestra un indicador "● LIVE" en las
   tarjetas de los canales que están emitiendo.

   Para no saturar las APIs externas con consultas constantes, los resultados
   se guardan en caché durante 30 segundos. Así, aunque 10 usuarios abran la
   app a la vez, solo se hace UNA consulta a Twitch/YouTube cada 30 segundos.

   Analogía: es como el equipo de actualización del marcador de un partido.
   Consultan el resultado cada 30 segundos y lo cuelgan en el tablón. Si
   alguien pregunta antes de que pasen los 30 segundos, ven el resultado
   del tablón, no se molesta en consultar de nuevo.
============================================================================= */

// Estructura de datos que describe un canal (lo mínimo para comprobar si está live)
type ChannelRef = { id: string; url: string; streamType: string }

// Caché de resultados: guarda el último resultado y cuándo expira
let cache: { data: Record<string, boolean>; expiresAt: number } | null = null

// Cuánto tiempo se mantiene válida la caché: 30 segundos
const CACHE_TTL = 30_000

/* =============================================================================
   FUNCIÓN: checkTwitchLiveGql
   Consulta si varios canales de Twitch están en directo usando la API GQL pública.
   Esta API no requiere credenciales propias — usa el Client-ID oficial del cliente
   web de Twitch que es público. Se usa como alternativa cuando no hay credenciales
   de Twitch configuradas en el servidor.
============================================================================= */
async function checkTwitchLiveGql(channels: { id: string; name: string }[]): Promise<Record<string, boolean>> {
  // Client ID del cliente web oficial de Twitch (usado por twitch.tv en el navegador)
  const GQL_CLIENT_ID = 'kimne78kx3ncx6brgo4mv6wki5h1ko'

  // Enviamos una petición GraphQL "en lote" — preguntamos por todos los canales de una vez
  // (más eficiente que hacer una petición por canal)
  const res = await fetch('https://gql.twitch.tv/gql', {
    method: 'POST',
    headers: {
      'Client-ID': GQL_CLIENT_ID,
      'Content-Type': 'application/json',
    },
    // GraphQL: para cada canal preguntamos "¿tiene stream activo?"
    // Si user.stream tiene un id → está en directo. Si es null → no está.
    body: JSON.stringify(
      channels.map((c) => ({
        query: `{ user(login: "${c.name}") { stream { id } } }`,
        variables: {},
      }))
    ),
  })

  const results = (await res.json()) as { data: { user: { stream: { id: string } | null } | null } }[]

  // Construir el objeto resultado: { "id-canal": true/false, ... }
  // Object.fromEntries convierte un array de pares [clave, valor] en un objeto
  return Object.fromEntries(
    channels.map((c, i) => [
      c.id,
      // El canal está en directo si "stream" existe y no es null
      results[i]?.data?.user?.stream !== null && results[i]?.data?.user?.stream !== undefined,
    ])
  )
}

/* =============================================================================
   FUNCIÓN: checkTwitchLive
   Comprueba si los canales de Twitch están en directo.
   Usa dos métodos según la configuración del servidor:
   - Si hay TWITCH_CLIENT_ID y TWITCH_CLIENT_SECRET → Helix API oficial (más fiable)
   - Si no → checkTwitchLiveGql (API pública sin credenciales)
============================================================================= */
async function checkTwitchLive(channels: ChannelRef[]): Promise<Record<string, boolean>> {
  const clientId     = process.env['TWITCH_CLIENT_ID']
  const clientSecret = process.env['TWITCH_CLIENT_SECRET']

  // Extraer el nombre de cada canal de su URL de Twitch
  // Ejemplo: "https://www.twitch.tv/nombrecanal" → { id: "xxx", name: "nombrecanal" }
  const names = channels
    .map((ch) => {
      const m = ch.url.match(/twitch\.tv\/([^/?#]+)/)
      return { id: ch.id, name: m?.[1] ?? '' }
    })
    .filter((c) => c.name)  // Eliminar los que no tenemos nombre

  if (!names.length) return {}  // No hay canales de Twitch, devolver vacío

  // Sin credenciales propias → usamos la API GQL pública (más limitada pero funciona)
  if (!clientId || !clientSecret) return checkTwitchLiveGql(names)

  // Con credenciales → Helix API oficial de Twitch (más fiable, sin límites estrictos)

  // Paso 1: Obtener un token de acceso temporal con las credenciales del servidor
  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' }
  )
  const { access_token } = (await tokenRes.json()) as { access_token: string }

  // Paso 2: Consultar qué streams están activos ahora mismo
  // Construimos: "user_login=canal1&user_login=canal2&user_login=canal3"
  const query = names.map((c) => `user_login=${c.name}`).join('&')
  const streamsRes = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${access_token}` },
  })
  const { data: streams } = (await streamsRes.json()) as { data: { user_login: string }[] }

  // La API devuelve solo los canales que ESTÁN en directo (los offline no aparecen)
  // Creamos un Set de nombres en directo para buscar rápidamente
  const liveNames = new Set(streams.map((s) => s.user_login.toLowerCase()))

  // Para cada canal, verdad si su nombre está en el Set de canales en directo
  return Object.fromEntries(names.map((c) => [c.id, liveNames.has(c.name.toLowerCase())]))
}

/* =============================================================================
   FUNCIÓN AUXILIAR: extractYoutubeVideoId
   Extrae el ID de un vídeo de YouTube a partir de distintos formatos de URL.
   Devuelve cadena vacía si no se puede extraer (p.ej. URLs de canal @handle).
============================================================================= */
function extractYoutubeVideoId(url: string): string {
  const watchMatch = url.match(/[?&]v=([^&]+)/)           // ?v=VIDEO_ID
  const shortMatch = url.match(/youtu\.be\/([^?]+)/)       // youtu.be/VIDEO_ID
  const liveMatch  = url.match(/youtube\.com\/live\/([^?#]+)/) // /live/VIDEO_ID
  return watchMatch?.[1] ?? shortMatch?.[1] ?? liveMatch?.[1] ?? ''
}

/* =============================================================================
   FUNCIÓN: scrapeYoutubeLive
   Comprueba si un canal de YouTube está en directo descargando su página HTML
   y buscando indicadores de emisión activa en el código.

   Se usa para canales con URL de tipo "@handle/live" donde no hay videoId fijo.
   Es un método de "raspado web" — no es ideal pero funciona cuando no hay API key.
============================================================================= */
async function scrapeYoutubeLive(ch: ChannelRef): Promise<[string, boolean]> {
  try {
    // Descargar la página del canal simulando un navegador normal
    const res = await fetch(ch.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cookie': 'SOCS=CAI; GPS=1',
      },
      redirect: 'follow',
    })

    // Método 1: YouTube redirige automáticamente al vídeo en directo si lo hay
    // Si la URL final contiene un ?v=VIDEO_ID → hay emisión activa
    if (res.redirected && /[?&]v=[a-zA-Z0-9_-]{11}/.test(res.url)) {
      return [ch.id, true]
    }

    // Método 2: buscar en el HTML de la página indicadores de emisión en directo
    const html = await res.text()
    const isLive = html.includes('"liveBroadcastContent":"live"') || html.includes('"isLive":true')
    return [ch.id, isLive]
  } catch {
    // Si falla la petición por cualquier motivo, asumimos que no está en directo
    return [ch.id, false]
  }
}

/* =============================================================================
   FUNCIÓN: checkYoutubeLive
   Comprueba si los canales de YouTube están en directo.
   Separa los canales en dos grupos según el tipo de URL:
   - Grupo A: tiene videoId en la URL → usa YouTube Data API (más preciso)
   - Grupo B: URL de canal @handle → usa scraping HTML (sin API key)
============================================================================= */
async function checkYoutubeLive(channels: ChannelRef[]): Promise<Record<string, boolean>> {
  const apiKey = process.env['YOUTUBE_API_KEY']

  // Separar canales según si tienen videoId directamente en la URL o no
  const videoIdItems:    { id: string; videoId: string }[] = []  // Grupo A: tienen videoId
  const handleChannels:  ChannelRef[]                      = []  // Grupo B: son canales @handle

  for (const ch of channels) {
    const videoId = extractYoutubeVideoId(ch.url)
    if (videoId) {
      videoIdItems.push({ id: ch.id, videoId })  // Tiene videoId → grupo A
    } else {
      handleChannels.push(ch)                     // Sin videoId → grupo B
    }
  }

  const results: Record<string, boolean> = {}

  // ── Grupo A: video ID conocido → YouTube Data API ─────────────────────────
  // Consultamos todos los videoIds de una vez (más eficiente)
  if (videoIdItems.length && apiKey) {
    const ids = videoIdItems.map((c) => c.videoId).join(',')  // "id1,id2,id3"
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${apiKey}`
    )
    const { items: videos } = (await ytRes.json()) as {
      items: { id: string; snippet: { liveBroadcastContent: string } }[]
    }

    // Los vídeos con liveBroadcastContent === 'live' son los que están emitiendo ahora
    const liveVideoIds = new Set(
      videos.filter((v) => v.snippet.liveBroadcastContent === 'live').map((v) => v.id)
    )
    for (const c of videoIdItems) results[c.id] = liveVideoIds.has(c.videoId)
  }

  // ── Grupo B: URL tipo @handle/live → scraping HTML ───────────────────────
  // Hacemos todas las peticiones en paralelo para no tardar demasiado
  if (handleChannels.length) {
    const scraped = await Promise.all(handleChannels.map(scrapeYoutubeLive))
    for (const [id, isLive] of scraped) results[id] = isLive
  }

  return results
}

/* =============================================================================
   FUNCIÓN PRINCIPAL: getLiveStatuses (exportada)
   Punto de entrada del servicio. Devuelve el estado en directo de todos los
   canales de Twitch y YouTube proporcionados.

   Primero comprueba si hay un resultado en caché que todavía sea válido.
   Si lo hay, lo devuelve directamente (sin consultar APIs externas).
   Si no, hace las consultas y guarda el resultado en caché.
============================================================================= */
export async function getLiveStatuses(
  channels: ChannelRef[]
): Promise<Record<string, boolean>> {
  // Si la caché existe y no ha expirado, devolver el resultado guardado
  if (cache && Date.now() < cache.expiresAt) return cache.data

  // Separar canales por plataforma
  const twitch  = channels.filter((c) => c.streamType === 'twitch')
  const youtube = channels.filter((c) => c.streamType === 'youtube')

  // Consultar Twitch y YouTube en paralelo (al mismo tiempo, no uno tras otro)
  // Si alguna falla, devolvemos objeto vacío para esa plataforma (no rompe la app)
  const [twitchResult, youtubeResult] = await Promise.all([
    checkTwitchLive(twitch).catch(() => ({}) as Record<string, boolean>),
    checkYoutubeLive(youtube).catch(() => ({}) as Record<string, boolean>),
  ])

  // Combinar resultados de ambas plataformas en un solo objeto
  const data = { ...twitchResult, ...youtubeResult }

  // Guardar en caché con tiempo de expiración
  cache = { data, expiresAt: Date.now() + CACHE_TTL }
  return data
}

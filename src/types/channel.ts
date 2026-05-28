/* =============================================================================
   FICHERO: src/types/channel.ts
   ¿QUÉ ES ESTO?
   Este fichero define los "moldes" de datos que usa toda la aplicación.
   En TypeScript, los tipos son como formularios con campos fijos: definen
   exactamente qué información tiene cada cosa y de qué tipo es cada dato.

   Analogía: es como los impresos oficiales de un ayuntamiento. El impreso
   "Canal" dice: "rellena aquí el nombre (texto), aquí la URL (texto), aquí
   el tipo de stream (solo estas opciones)...". Todos los componentes de la
   app usan estos mismos impresos para asegurarse de que hablan el mismo idioma.

   IMPORTANTE: este fichero solo contiene definiciones, no ejecuta nada.
   Es como un diccionario — lo consultan el frontend y el backend por igual.
============================================================================= */

/* ── Tipo de fuente del stream ──────────────────────────────────────────────
   Define los cinco tipos de canal que la app sabe reproducir:
   - 'hls'      → Stream de vídeo directo en formato M3U8 (el más común en TV)
   - 'twitch'   → Canal en directo de la plataforma Twitch
   - 'youtube'  → Vídeo o canal de YouTube
   - 'web'      → Enlace a una página web (se abre en el navegador)
   - 'titanapp' → Aplicación nativa instalada en la Titan OS (DAZN, Netflix…)
*/
export type StreamType = 'hls' | 'twitch' | 'youtube' | 'web' | 'titanapp'

/* ── Categorías deportivas ──────────────────────────────────────────────────
   Los canales se clasifican en categorías deportivas para poder filtrarlos.
   Solo se permiten estas categorías exactas — no se puede escribir cualquier cosa.
*/
export type SportCategory =
  | 'football'    // Fútbol
  | 'basketball'  // Baloncesto
  | 'tennis'      // Tenis
  | 'motorsport'  // Motor (F1, MotoGP…)
  | 'combat'      // Deportes de combate (boxeo, MMA…)
  | 'other'       // Otros deportes

/* ── Etiquetas legibles para cada categoría ─────────────────────────────────
   Un diccionario que traduce el código interno al texto que verá el usuario.
   Por ejemplo: 'football' → 'Fútbol'
*/
export const CATEGORY_LABELS: Record<SportCategory, string> = {
  football:   'Fútbol',
  basketball: 'Baloncesto',
  tennis:     'Tenis',
  motorsport: 'Motor',
  combat:     'Combate',
  other:      'Otros',
}

/* ── Emojis decorativos para cada categoría ─────────────────────────────────
   Igual que el anterior pero con emojis, para mostrar junto al nombre
   de categoría en los botones de filtro y las tarjetas de canal.
*/
export const CATEGORY_ICONS: Record<SportCategory, string> = {
  football:   '⚽',
  basketball: '🏀',
  tennis:     '🎾',
  motorsport: '🏎️',
  combat:     '🥊',
  other:      '🏆',
}

/* ── Estructura de un Canal ─────────────────────────────────────────────────
   Define todos los campos que tiene un canal tal como llega desde la API
   (el servidor). Es la "ficha técnica" de cada canal.

   Los campos con "?" son opcionales — pueden existir o no.
*/
export interface Channel {
  id:             string   // Identificador único (como el DNI del canal)
  name:           string   // Nombre visible: "LaLiga TV", "Eurosport"…
  url:            string   // Dirección del stream o deep link
  streamType:     StreamType   // Tipo de reproducción (ver StreamType arriba)
  category:       SportCategory // Categoría deportiva
  logoUrl?:       string   // URL de la imagen del logo (puede no tener)
  referer?:       string   // Cabecera HTTP Referer para streams que lo requieren
  userAgent?:     string   // Cabecera User-Agent para streams que lo requieren
  addedAt:        string   // Fecha y hora en que se añadió (formato ISO)
  youtubeSyncUrl?: string  // URL del canal de YouTube para sincronizar eventos
}

/* ── Datos del formulario al crear o editar un canal ────────────────────────
   Similar a Channel pero sin los campos que genera el servidor automáticamente
   (como el id o la fecha). Es lo que el administrador rellena en el formulario.
*/
export interface ChannelFormData {
  name:           string
  url:            string
  category:       SportCategory
  logoUrl?:       string
  referer?:       string
  userAgent?:     string
  streamType?:    StreamType    // Opcional: si no se indica, el servidor lo detecta solo
  youtubeSyncUrl?: string
}

/* ── Evento programado ───────────────────────────────────────────────────────
   Un evento es un partido o retransmisión que va a ocurrir en el futuro.
   Se muestra en la tarjeta del canal como "próximo evento".
   Ejemplos: "Real Madrid vs Barcelona — Sáb 21:00"
*/
export interface ChannelEvent {
  id:          string    // Identificador único del evento
  channelId:   string    // A qué canal pertenece este evento
  title:       string    // Nombre del evento: "Final Champions League"
  scheduledAt: string    // Cuándo empieza (formato ISO 8601 en UTC)
  endTime?:    string    // Cuándo termina — solo para eventos de guía EPG
  source?:     'youtube' | 'epg' | null  // De dónde vino este evento
}

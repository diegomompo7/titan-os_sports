/* ─────────────────────────────────────────────────────────────────────────────
   TYPES — Definiciones TypeScript compartidas por frontend y backend.
───────────────────────────────────────────────────────────────────────────── */

/** Tipo de fuente del stream */
export type StreamType = 'hls' | 'twitch' | 'youtube' | 'web' | 'titanapp'

/** Categorías deportivas disponibles (las mismas que en la BD) */
export type SportCategory =
  | 'football'
  | 'basketball'
  | 'tennis'
  | 'motorsport'
  | 'combat'
  | 'other'

/** Etiquetas legibles para cada categoría */
export const CATEGORY_LABELS: Record<SportCategory, string> = {
  football:   'Fútbol',
  basketball: 'Baloncesto',
  tennis:     'Tenis',
  motorsport: 'Motor',
  combat:     'Combate',
  other:      'Otros',
}

/** Emojis decorativos para cada categoría */
export const CATEGORY_ICONS: Record<SportCategory, string> = {
  football:   '⚽',
  basketball: '🏀',
  tennis:     '🎾',
  motorsport: '🏎️',
  combat:     '🥊',
  other:      '🏆',
}

/** Canal de streaming tal como llega de la API */
export interface Channel {
  id:             string
  name:           string
  url:            string
  streamType:     StreamType
  category:       SportCategory
  logoUrl?:       string
  referer?:       string
  userAgent?:     string
  addedAt:        string
  youtubeSyncUrl?: string
}

/** Datos del formulario al crear o editar un canal */
export interface ChannelFormData {
  name:           string
  url:            string
  category:       SportCategory
  logoUrl?:       string
  referer?:       string
  userAgent?:     string
  streamType?:    StreamType
  youtubeSyncUrl?: string
}

/** Evento programado (próximo partido, retransmisión, etc.) */
export interface ChannelEvent {
  id:          string
  channelId:   string
  title:       string
  scheduledAt: string   // ISO 8601 UTC
  endTime?:    string   // ISO 8601 UTC (solo eventos EPG)
  source?:     'youtube' | 'epg' | null
}

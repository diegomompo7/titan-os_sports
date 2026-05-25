export type StreamType = 'hls' | 'twitch' | 'youtube' | 'web'

export type SportCategory =
  | 'football'
  | 'basketball'
  | 'tennis'
  | 'motorsport'
  | 'combat'
  | 'other'

export const CATEGORY_LABELS: Record<SportCategory, string> = {
  football: 'Fútbol',
  basketball: 'Baloncesto',
  tennis: 'Tenis',
  motorsport: 'Motor',
  combat: 'Combate',
  other: 'Otros',
}

export interface Channel {
  id: string
  name: string
  url: string
  streamType: StreamType
  category: SportCategory
  logoUrl?: string
  referer?: string
  userAgent?: string
  addedAt: string
  youtubeSyncUrl?: string
}

export interface ChannelFormData {
  name: string
  url: string
  category: SportCategory
  logoUrl?: string
  referer?: string
  userAgent?: string
  streamType?: StreamType
  youtubeSyncUrl?: string
}

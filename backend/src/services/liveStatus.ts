type ChannelRef = { id: string; url: string; streamType: string }

let cache: { data: Record<string, boolean>; expiresAt: number } | null = null
const CACHE_TTL = 60_000

async function checkTwitchLive(channels: ChannelRef[]): Promise<Record<string, boolean>> {
  const clientId = process.env['TWITCH_CLIENT_ID']
  const clientSecret = process.env['TWITCH_CLIENT_SECRET']
  if (!clientId || !clientSecret) return {}

  const tokenRes = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`,
    { method: 'POST' }
  )
  const { access_token } = (await tokenRes.json()) as { access_token: string }

  const names = channels
    .map((ch) => {
      const m = ch.url.match(/twitch\.tv\/([^/?#]+)/)
      return { id: ch.id, name: m?.[1] ?? '' }
    })
    .filter((c) => c.name)

  if (!names.length) return {}

  const query = names.map((c) => `user_login=${c.name}`).join('&')
  const streamsRes = await fetch(`https://api.twitch.tv/helix/streams?${query}`, {
    headers: { 'Client-ID': clientId, Authorization: `Bearer ${access_token}` },
  })
  const { data: streams } = (await streamsRes.json()) as { data: { user_login: string }[] }
  const liveNames = new Set(streams.map((s) => s.user_login.toLowerCase()))

  return Object.fromEntries(names.map((c) => [c.id, liveNames.has(c.name.toLowerCase())]))
}

function extractYoutubeVideoId(url: string): string {
  const watchMatch = url.match(/[?&]v=([^&]+)/)
  const shortMatch = url.match(/youtu\.be\/([^?]+)/)
  const liveMatch = url.match(/youtube\.com\/live\/([^?#]+)/)
  return watchMatch?.[1] ?? shortMatch?.[1] ?? liveMatch?.[1] ?? ''
}

async function scrapeYoutubeLive(ch: ChannelRef): Promise<[string, boolean]> {
  try {
    const res = await fetch(ch.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Cookie': 'SOCS=CAI; GPS=1',
      },
      redirect: 'follow',
    })
    // YouTube redirige /live → watch?v=ID sólo cuando hay emisión activa
    const isLive = res.redirected && /[?&]v=[a-zA-Z0-9_-]{11}/.test(res.url)
    return [ch.id, isLive]
  } catch {
    return [ch.id, false]
  }
}

async function checkYoutubeLive(channels: ChannelRef[]): Promise<Record<string, boolean>> {
  const apiKey = process.env['YOUTUBE_API_KEY']

  const videoIdItems: { id: string; videoId: string }[] = []
  const handleChannels: ChannelRef[] = []

  for (const ch of channels) {
    const videoId = extractYoutubeVideoId(ch.url)
    if (videoId) {
      videoIdItems.push({ id: ch.id, videoId })
    } else {
      handleChannels.push(ch)
    }
  }

  const results: Record<string, boolean> = {}

  // Grupo A: video ID conocido → YouTube Data API
  if (videoIdItems.length && apiKey) {
    const ids = videoIdItems.map((c) => c.videoId).join(',')
    const ytRes = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${ids}&key=${apiKey}`
    )
    const { items: videos } = (await ytRes.json()) as {
      items: { id: string; snippet: { liveBroadcastContent: string } }[]
    }
    const liveVideoIds = new Set(
      videos.filter((v) => v.snippet.liveBroadcastContent === 'live').map((v) => v.id)
    )
    for (const c of videoIdItems) results[c.id] = liveVideoIds.has(c.videoId)
  }

  // Grupo B: URL tipo @handle/live → scraping HTML
  if (handleChannels.length) {
    const scraped = await Promise.all(handleChannels.map(scrapeYoutubeLive))
    for (const [id, isLive] of scraped) results[id] = isLive
  }

  return results
}

export async function getLiveStatuses(
  channels: ChannelRef[]
): Promise<Record<string, boolean>> {
  if (cache && Date.now() < cache.expiresAt) return cache.data

  const twitch = channels.filter((c) => c.streamType === 'twitch')
  const youtube = channels.filter((c) => c.streamType === 'youtube')

  const [twitchResult, youtubeResult] = await Promise.all([
    checkTwitchLive(twitch).catch(() => ({}) as Record<string, boolean>),
    checkYoutubeLive(youtube).catch(() => ({}) as Record<string, boolean>),
  ])

  const data = { ...twitchResult, ...youtubeResult }
  cache = { data, expiresAt: Date.now() + CACHE_TTL }
  return data
}

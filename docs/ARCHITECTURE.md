# Arquitectura técnica — TitanOS Sports

---

## Diagrama de componentes

```
┌─────────────────────────────────────────────────────────────────┐
│  BROWSER / PWA                                                   │
│                                                                  │
│  App.vue                                                         │
│    └── HomeView.vue                                              │
│          ├── ChannelGrid.vue ──── ChannelCard.vue                │
│          │     └── (search, filters, drag-drop, keyboard nav)    │
│          ├── PlayerModal.vue ─── VideoPlayer.vue                 │
│          │     └── (HLS / Twitch iframe / YouTube iframe)        │
│          ├── MultiStreamView.vue                                  │
│          │     └── (grid, pro mode, Twitch chat selector)        │
│          └── [Admin] ChannelForm / EventsPanel / AdminLogin      │
│                                                                  │
│  Pinia Stores                                                    │
│    channels ── events ── liveStatus ── admin ── favorites ── history │
│                                                                  │
│  Composables                                                     │
│    useGamepad.ts   useVideoPlayer.ts                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ Axios (HTTPS)
┌────────────────────────────▼────────────────────────────────────┐
│  EXPRESS API  (Node.js 20 + TypeScript 5)                        │
│  Railway — titanos-backend.up.railway.app                        │
│                                                                  │
│  index.ts                                                        │
│    ├── migrate()             — crea/migra tablas al arrancar     │
│    ├── scheduleAtHourBoundary(youtubeSync, 1h, delay=30s)        │
│    └── scheduleAtHourBoundary(epgSync, 6h, delay=60s)            │
│                                                                  │
│  routes/channels.ts          routes/events.ts                    │
│    └── middleware/adminAuth    └── middleware/adminAuth           │
│                                                                  │
│  services/                                                       │
│    ├── epgSync.ts    — XMLTV parser + sports filter              │
│    ├── youtubeSync.ts — YouTube API + scraping fallback          │
│    └── liveStatus.ts  — Twitch + YouTube live check (30s cache)  │
│                                                                  │
│  db.ts — mysql2/promise pool (10 conexiones, SSL)                │
└──────┬──────────────────────────┬───────────────────────────────┘
       │                          │
┌──────▼──────┐    ┌──────────────▼──────────────────────────────┐
│  MySQL 8    │    │  APIs externas                               │
│  (Railway)  │    │                                              │
│             │    │  GitHub raw (davidmuma EPG XML)              │
│  channels   │    │  YouTube Data API v3                         │
│  events     │    │  Twitch Helix API                            │
└─────────────┘    │  Twitch GQL (fallback, sin credenciales)     │
                   └─────────────────────────────────────────────┘
```

---

## Frontend — Vue 3 + Pinia

### Estructura de ficheros

```
src/
├── App.vue                      # Root (monta HomeView)
├── main.ts                      # createApp + Pinia
├── assets/base.css              # CSS global con variables CSS
├── views/
│   └── HomeView.vue             # Vista única (SPA sin router)
├── components/
│   ├── channels/
│   │   ├── ChannelGrid.vue      # Grid con búsqueda, filtros, drag-drop
│   │   ├── ChannelCard.vue      # Tarjeta de canal con logo, badges, eventos
│   │   └── ChannelForm.vue      # Formulario add/edit canal
│   ├── player/
│   │   ├── VideoPlayer.vue      # Reproductor multi-tipo (HLS/Twitch/YouTube/web)
│   │   ├── PlayerModal.vue      # Modal que envuelve VideoPlayer + chat toggle
│   │   └── MultiStreamView.vue  # Vista multi-stream (grid + pro mode)
│   ├── admin/
│   │   ├── AdminLogin.vue       # Input de token admin
│   │   └── EventsPanel.vue      # CRUD eventos + sync YouTube
│   └── ui/
│       └── BaseModal.vue        # Modal base con Teleport
├── composables/
│   ├── useGamepad.ts            # Navegación con mando (D-pad, A, B)
│   └── useVideoPlayer.ts        # Lógica de reproducción HLS
├── stores/
│   ├── channels.ts              # CRUD canales, fetchChannels
│   ├── events.ts                # Eventos, countdown, notificaciones
│   ├── liveStatus.ts            # Estado en vivo (polling 30s)
│   ├── admin.ts                 # Token admin (sessionStorage)
│   ├── favorites.ts             # IDs favoritos (localStorage)
│   └── history.ts               # Últimos 8 canales (localStorage)
└── types/
    └── channel.ts               # Interfaces TypeScript compartidas
```

### Flujo de datos

```
Arranque
  → main.ts: createApp(App).use(pinia).mount('#app')
  → HomeView mounted:
      → channelsStore.fetchChannels()      — GET /channels
      → eventsStore.fetchEvents()          — GET /events
      → liveStatusStore.fetchStatuses()    — GET /channels/live-status
      → setInterval(fetchStatuses, 30 000) — polling live status
      → setInterval(fetchEvents, 5 * 60 000) — polling eventos

Usuario selecciona canal
  → historyStore.add(channelId)
  → activeChannel = channel
  → PlayerModal abre VideoPlayer

VideoPlayer (YouTube)
  → fetch GET /channels/resolve-youtube?url=...
  → renderiza <iframe> con embedUrl resuelto

Panel Admin
  → AdminLogin: token → adminStore.login(token)
  → ChannelForm submit → channelsStore.addChannel(data, token)
  → EventsPanel: syncYoutubeEvents → POST /channels/:id/sync-youtube-events
```

### Notas de diseño

- **Sin Vue Router**: toda la navegación es por estado reactivo (`ref`, `reactive`) en `HomeView`.
- **URL param**: `?canal=nombre` abre directamente un canal al cargar.
- **Persistencia local**: favoritos (`titanos_favorites`), historial (`titanos_history`), orden de canales (`titanos_order`) — todo en `localStorage`.
- **Tema oscuro**: CSS custom properties en `base.css` (`--color-bg-base: #0d0f14`, acento cian `#00bfff`).
- **PWA**: service worker con Workbox — NetworkFirst para la API, CacheFirst para assets estáticos.

---

## Backend — Express + TypeScript

### Estructura de ficheros

```
backend/src/
├── index.ts                # Entry point: app, migraciones, scheduling
├── db.ts                   # Pool mysql2 (10 conexiones, SSL)
├── middleware/
│   └── adminAuth.ts        # Comprueba Authorization: Bearer <ADMIN_TOKEN>
├── routes/
│   ├── channels.ts         # 8 endpoints /channels
│   └── events.ts           # 5 endpoints /events
└── services/
    ├── epgSync.ts          # Sync EPG (XMLTV davidmuma)
    ├── youtubeSync.ts      # Sync YouTube upcoming broadcasts
    └── liveStatus.ts       # Live status Twitch + YouTube (caché 30s)
```

### Scheduling — `scheduleAtHourBoundary`

```typescript
// Alinea los sync a fronteras exactas de intervalo en UTC
// Ej: arranque a las 13:37 → primer tick a las 14:00:00, luego 15:00, 16:00...
function scheduleAtHourBoundary(fn, intervalMs, startDelayMs) {
  setTimeout(() => fn(), startDelayMs)                    // sync inicial
  const msUntilNext = intervalMs - (Date.now() % intervalMs)
  setTimeout(() => {
    fn()
    setInterval(fn, intervalMs)                           // ticks en frontera
  }, msUntilNext)
}

scheduleAtHourBoundary(autoSyncYoutubeEvents, 1h, 30s)   // 00:00, 01:00, ...
scheduleAtHourBoundary(syncEPGEvents, 6h, 60s)           // 00:00, 06:00, 12:00, 18:00
```

### Migraciones

Al arrancar, `migrate()` ejecuta DDL idempotente:

```sql
CREATE TABLE IF NOT EXISTS events (...)
ALTER TABLE channels ADD COLUMN youtube_sync_url  -- si no existe
ALTER TABLE events   ADD COLUMN end_time          -- si no existe
ALTER TABLE events   ADD COLUMN source            -- si no existe
```

---

## Servicio EPG (`epgSync.ts`)

### Flujo completo

```
syncEPGEvents(pool)
  │
  ├─ 1. fetch(EPG_URL)                  — descarga XML plain (~MB)
  ├─ 2. sanitizeXml(xml)               — limpia HTML en <desc>, escapa &, filtra tags
  ├─ 3. parseStringPromise(xmlClean)   — xml2js → { tv: { channel[], programme[] } }
  ├─ 4. Cargar channels de BD
  ├─ 5. Construir mapa EPG-id → DB-id
  │      Normalizar: lowercase + quitar tildes + quitar espacios
  │      Match exacto (no substring) → evita Ten ≠ Antena 3
  │
  ├─ 6. DELETE FROM events WHERE source='epg'  — sync limpio
  │
  └─ 7. Por cada programme:
         ├─ Buscar dbChannelId en mapa → si no está, skip
         ├─ isSportsProgram(categories, title, desc)
         │    └─ busca keywords en todo el texto antes del primer '|'
         │       si no hay '|' → skip (desc sin formato estándar)
         ├─ parseXMLTVDate(start) → si pasado o >7 días → skip
         ├─ Comprobar duplicado (mismo título ±1h) → si existe, skipped++
         └─ INSERT INTO events (id, channel_id, channel_name, title,
                                scheduled_at, end_time, source='epg')
```

### Formato davidmuma

El campo `desc` sigue el patrón:
```
"Cat1,Cat2,Cat3 | YYYY | ★rating · descripción libre..."
```

El bloque de categorías es todo lo anterior al primer `|`. Los keywords deportivos se buscan en ese bloque completo (no solo la primera categoría), lo que permite detectar casos como `"Magazine,Deportes | ..."`.

---

## Servicio YouTube (`youtubeSync.ts`)

### Flujo de resolución de channelId

```
resolveYoutubeChannelId(url)
  ├─ /channel/UCxxxx   → extraer directamente
  ├─ /@handle          → YouTube API: channels.list?forHandle=
  ├─ /c/customname     → YouTube API: channels.list?forUsername= + fallback HTML
  └─ desconocido       → HTML scraping: buscar "externalId" en JSON embebido
```

### Tres niveles de fallback para upcoming broadcasts

```
fetchUpcomingBroadcasts(channelId)
  ├─ Nivel 1 (API)     → search?eventType=upcoming&channelId=...
  │                       100 cuotas/llamada — puede fallar/no devolver nada
  ├─ Nivel 2 (scraping)→ HTML de /streams → extraer videoIds
  │                       videos.list → filtrar liveBroadcastContent=upcoming
  │                       1 cuota/lote — más fiable
  └─ Nivel 3 (fallback)→ HTML de /live → extraer videoId actual
                          videos.list → verificar que es upcoming
```

---

## Servicio Live Status (`liveStatus.ts`)

### Caché de 30 segundos

```
getLiveStatuses(channels)
  ├─ Si cache válida (<30s) → devolver cache
  └─ Si no:
       ├─ checkTwitchLive(twitchChannels)
       │    ├─ Si TWITCH_CLIENT_ID+SECRET → Helix API /streams (OAuth2)
       │    └─ Si no → GQL público { user(login:) { stream { id } } }
       │
       ├─ checkYoutubeLive(youtubeChannels)
       │    ├─ Si videoId conocido → videos?part=snippet → liveBroadcastContent=live
       │    └─ Si no → scraping HTML canal → buscar "liveBroadcastContent":"live"
       │                                      o "isLive":true
       └─ Merge resultados → actualizar cache → devolver
```

---

## Base de datos

### Esquema completo

```sql
CREATE TABLE channels (
  id               CHAR(36)      PRIMARY KEY,
  name             VARCHAR(200)  NOT NULL,
  url              TEXT          NOT NULL,
  stream_type      VARCHAR(20)   NOT NULL,     -- hls|twitch|youtube|web
  category         VARCHAR(100)  NOT NULL,
  logo_url         TEXT,
  referer          TEXT,
  user_agent       TEXT,
  youtube_sync_url TEXT,                        -- migración incremental
  added_at         TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE events (
  id           CHAR(36)      PRIMARY KEY,
  channel_id   CHAR(36)      NOT NULL,          -- FK channels.id (implícita)
  channel_name VARCHAR(200),                    -- cacheado (EPG)
  title        VARCHAR(200)  NOT NULL,
  scheduled_at DATETIME      NOT NULL,
  end_time     DATETIME,                        -- migración incremental
  source       VARCHAR(20),                     -- migración incremental: youtube|epg
  created_at   TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);
```

### Conexión — `db.ts`

```typescript
mysql.createPool({
  uri: process.env.DATABASE_URL,    // mysql://user:pass@host:port/db
  ssl: { rejectUnauthorized: false },
  waitForConnections: true,
  connectionLimit: 10,
})
```

---

## Integraciones externas

| Sistema | Uso | Auth |
|---|---|---|
| **davidmuma/EPG_dobleM** | XML con 7 días de programación española | Ninguna (GitHub raw) |
| **YouTube Data API v3** | upcoming broadcasts, resolve channelId, live status | API key (`YOUTUBE_API_KEY`) |
| **Twitch Helix API** | Live status | Client credentials OAuth2 |
| **Twitch GraphQL** | Live status fallback | Client-ID público hardcoded |
| **YouTube scraping** | Resolve live embed URL, live status fallback | Ninguna |

---

## Despliegue

| Servicio | Plataforma | URL |
|---|---|---|
| Frontend (Vue SPA) | Railway Static | `titan-ossports-production.up.railway.app` |
| Backend (Express) | Railway Service | `titanos-backend.up.railway.app` |
| Base de datos | Railway MySQL | Interna (via `DATABASE_URL`) |

**Health check:** Railway sondea `GET /health` cada 30 s; reinicia el servicio tras 3 fallos consecutivos.

# TitanOS Sports

Plataforma web para seguir retransmisiones deportivas en directo. Agrega canales de televisión (HLS, Twitch, YouTube) y muestra su programación deportiva sincronizada desde la EPG española y desde YouTube. Permite ver hasta 4 streams simultáneos, con chat de Twitch integrado y notificaciones de inicio de emisión.

**Producción:**
- Frontend: <https://titan-ossports-production.up.railway.app>
- API: <https://titanos-backend.up.railway.app>

---

## ✨ Características principales

| Característica | Descripción |
|---|---|
| Multi-stream | Hasta 4 canales simultáneos con grid adaptativo |
| Modo teatro | Canal principal grande + sidebar de canales |
| Chat Twitch | Integrado en el reproductor y en multi-stream |
| EPG deportiva | Sincronización automática cada 6 h desde EPG española |
| YouTube events | Detección automática de próximas retransmisiones (cada 1 h) |
| Estado en vivo | Badge "EN DIRECTO" actualizado cada 30 s (Twitch y YouTube) |
| Favoritos | Marcado persistente en localStorage |
| Historial | Últimos 8 canales reproducidos |
| Drag & drop | Reordenación de canales con persistencia |
| Gamepad | Navegación con mando (D-pad, A/B) |
| PWA | Instalable, caché offline con Workbox |
| Panel admin | CRUD de canales y eventos, sincronización manual |

---

## 🎨 Interfaz y vistas

### Modo Normal (por defecto)
Grid de tarjetas de canal con búsqueda, filtros (Todos / En directo / Favoritos / Recientes / categoría) y ordenación drag-and-drop. Cada tarjeta muestra logo, nombre, badge de tipo de stream, badge "EN DIRECTO" y el próximo evento programado con cuenta atrás.

### Modo Teatro
Canal activo a pantalla casi completa (izquierda) con sidebar de miniaturas de canales a la derecha. Se activa pulsando `T`.

### Modo Multi-stream
Grid configurable (1-4 columnas) con modo Pro: canal principal grande + columna de secundarios + selector de chat de Twitch. Se activa con `M` o desde el menú.

### Reproductor de vídeo
- **HLS**: hls.js con cabeceras personalizadas (Referer, User-Agent)
- **Twitch**: iframe embed + chat embebido
- **YouTube**: iframe embed; el embed URL se resuelve en tiempo real via API o scraping
- **Web**: enlace externo

### Panel Admin
Accesible con token Bearer guardado en `sessionStorage`. Permite:
- Añadir / editar / eliminar canales (con autodetección de logo)
- Crear eventos manuales o recurrentes por día de semana
- Sincronizar eventos de YouTube por canal
- Disparar sync EPG manual y borrar todos los eventos EPG

---

## 🏗️ Arquitectura general

```
┌─────────────────────────────────────────────────────────┐
│                    Browser / PWA                         │
│                                                          │
│  Vue 3 SPA                                               │
│  ├── Pinia stores (channels, events, liveStatus, ...)    │
│  ├── Componentes (ChannelGrid, VideoPlayer, ...)         │
│  └── Axios → REST API                                    │
└───────────────────────┬─────────────────────────────────┘
                        │ HTTPS
┌───────────────────────▼─────────────────────────────────┐
│              Express API (Node.js + TypeScript)          │
│  Railway — titanos-backend.up.railway.app                │
│                                                          │
│  /channels  ──→ routes/channels.ts                       │
│  /events    ──→ routes/events.ts                         │
│  /health    ──→ index.ts                                 │
│                                                          │
│  Services:                                               │
│  ├── epgSync      (EPG XML, cada 6 h)                   │
│  ├── youtubeSync  (YouTube API + scraping, cada 1 h)    │
│  └── liveStatus   (Twitch + YouTube, caché 30 s)        │
└──────┬───────────────────────┬──────────────────────────┘
       │                       │
┌──────▼──────┐    ┌───────────▼─────────────────────┐
│  MySQL DB   │    │       APIs externas              │
│  (Railway)  │    │  davidmuma EPG (GitHub raw XML)  │
│             │    │  YouTube Data API v3             │
│  channels   │    │  Twitch Helix API / GQL          │
│  events     │    └─────────────────────────────────┘
└─────────────┘
```

### Stack tecnológico

| Capa | Tecnología | Propósito |
|---|---|---|
| Frontend | Vue 3.5 + Vite 8 | UI reactiva |
| Estado | Pinia 3 | Stores globales |
| Streaming | hls.js 1.6 | Reproducción HLS |
| HTTP cliente | Axios | Llamadas a la API |
| UI interactions | SortableJS | Drag-and-drop |
| PWA | vite-plugin-pwa | Caché offline, instalable |
| Backend | Express 4 + TypeScript 5 | API REST |
| Base de datos | MySQL 8 (mysql2) | Persistencia |
| EPG parser | xml2js | Parseo XMLTV |
| Despliegue | Railway | Hosting + DB |

---

## ⚙️ Business Logic

### Sincronización EPG (cada 6 horas)

Se ejecuta automáticamente en puntos exactos del día (00:00, 06:00, 12:00, 18:00 UTC) y también 60 segundos después del arranque del servidor.

1. **Descarga** el XML de [davidmuma/EPG_dobleM](https://github.com/davidmuma/EPG_dobleM) — fuente completa de canales españoles (~7 días de programación).
2. **Sanitiza** el XML: elimina HTML dentro de `<desc>`, escapa `&` sueltos, filtra tags no-XMLTV.
3. **Parsea** con `xml2js` y construye un mapa EPG-channelId → DB-channelId (match normalizado exacto, sin tildes, sin espacios).
4. **Filtra** los programas deportivos buscando keywords en todo el texto antes del primer `|` del campo `desc` (donde davidmuma codifica las categorías: `"Deportes,Fútbol | 2025 | ..."`).
5. **Borra** todos los eventos EPG existentes (sync limpio).
6. **Inserta** los nuevos eventos deportivos con `source = 'epg'`, ventana de +7 días, deduplicando por título ±1 h.

**Keywords deportivos:** fútbol, tenis, baloncesto, atletismo, ciclismo, motorsport, Fórmula 1, golf, natación, boxeo, rugby, olimpiadas, balonmano, esgrima, judo, karate, voleibol, pádel, béisbol, hockey, snowboard, triatlón, gimnasia, equitación, piragüismo.

### Sincronización YouTube (cada 1 hora)

Se ejecuta en cada frontera horaria (configurable con `YOUTUBE_SYNC_INTERVAL_HOURS`).

1. Consulta la BD: canales con `stream_type='youtube'` o con `youtube_sync_url` definido.
2. Para cada canal, llama a `syncChannelEvents()` con 3 niveles de fallback:
   - **Nivel 1 (API):** `search?eventType=upcoming` — fiable pero gasta 100 cuotas por llamada.
   - **Nivel 2 (scraping):** Extrae videoIds de la página `/streams`, luego `videos.list` (1 cuota/lote).
   - **Nivel 3 (fallback):** Scraping de la página `/live` + `videos.list`.
3. Inserta los próximos directos con `source = 'youtube'`, deduplicando por título ±1 h.

Al crear un canal YouTube en el panel admin, se dispara un sync inicial en background.

### Estado en vivo (caché 30 s)

Resultado cacheado 30 segundos para evitar saturar las APIs externas.

- **Twitch:** Si hay `TWITCH_CLIENT_ID` + `TWITCH_CLIENT_SECRET` → Helix API (`/streams`). Si no → GraphQL público (`user { stream { id } }`).
- **YouTube:** Si el canal tiene videoId conocido → `videos?part=snippet&liveBroadcastContent=live`. Si no → scraping HTML del canal buscando `"liveBroadcastContent":"live"` o `"isLive":true`.

### Autenticación admin

Bearer token comparado con `process.env.ADMIN_TOKEN`. Sin JWT, sin sesiones: token estático largo (≥ 64 chars recomendado). Se guarda en `sessionStorage` del navegador (se pierde al cerrar la pestaña).

### Deduplicación de eventos

Antes de insertar cualquier evento (YouTube o EPG) se comprueba si ya existe un registro con el mismo `channel_id` y `title` cuyo `scheduled_at` difiere menos de 3600 segundos. Si existe, se omite (`skipped++`).

---

## 🗄️ Base de datos

### Tabla `channels`

| Columna | Tipo | Nulable | Descripción |
|---|---|---|---|
| `id` | CHAR(36) PK | NO | UUID generado en inserción |
| `name` | VARCHAR(200) | NO | Nombre visible del canal |
| `url` | TEXT | NO | URL del stream |
| `stream_type` | VARCHAR(20) | NO | `hls` \| `twitch` \| `youtube` \| `web` |
| `category` | VARCHAR(100) | NO | Categoría libre (ej. "Deportes", "Noticias") |
| `logo_url` | TEXT | SÍ | URL del logo |
| `referer` | TEXT | SÍ | Cabecera Referer para streams HLS protegidos |
| `user_agent` | TEXT | SÍ | Cabecera User-Agent personalizada |
| `youtube_sync_url` | TEXT | SÍ | URL de canal YouTube alternativa para sync de eventos |
| `added_at` | TIMESTAMP | NO | Fecha de creación (DEFAULT CURRENT_TIMESTAMP) |

### Tabla `events`

| Columna | Tipo | Nulable | Descripción |
|---|---|---|---|
| `id` | CHAR(36) PK | NO | UUID generado en inserción |
| `channel_id` | CHAR(36) | NO | FK → channels.id |
| `channel_name` | VARCHAR(200) | SÍ | Nombre del canal cacheado (EPG) |
| `title` | VARCHAR(200) | NO | Título del programa |
| `scheduled_at` | DATETIME | NO | Hora de inicio (UTC) |
| `end_time` | DATETIME | SÍ | Hora de fin (UTC) — solo EPG |
| `source` | VARCHAR(20) | SÍ | `youtube` \| `epg` |
| `created_at` | TIMESTAMP | NO | Fecha de inserción |

### Migraciones

El servidor aplica migraciones idempotentes en cada arranque (función `migrate()` en `index.ts`): crea la tabla `events` si no existe y añade las columnas `youtube_sync_url`, `end_time` y `source` si faltan.

---

## 🔧 Variables de entorno

### Backend (`backend/.env`)

| Variable | Requerida | Descripción |
|---|---|---|
| `DATABASE_URL` | ✅ | Cadena de conexión MySQL (`mysql://user:pass@host:port/db`) |
| `ADMIN_TOKEN` | ✅ | Token secreto para endpoints de administración |
| `PORT` | ❌ | Puerto del servidor (defecto: `3000`) |
| `CORS_ORIGIN` | ❌ | Origen CORS permitido (defecto: `*`) |
| `YOUTUBE_API_KEY` | ❌ | YouTube Data API v3 — necesario para sync de eventos |
| `TWITCH_CLIENT_ID` | ❌ | Twitch Helix API — fallback a GQL si no está |
| `TWITCH_CLIENT_SECRET` | ❌ | Twitch Helix API — fallback a GQL si no está |
| `YOUTUBE_SYNC_INTERVAL_HOURS` | ❌ | Intervalo sync YouTube en horas (defecto: `1`) |

### Frontend (`.env`)

| Variable | Descripción |
|---|---|
| `VITE_API_URL` | URL base de la API (ej. `https://titanos-backend.up.railway.app`) |
| `VITE_TWITCH_PARENT` | Dominio padre para embeds de Twitch (ej. `titan-ossports-production.up.railway.app`) |

---

## 🚀 Desarrollo local

### Requisitos

- Node.js ≥ 20
- MySQL 8 (local o Railway)

### Pasos

```bash
# 1. Clonar
git clone https://github.com/diegomompo7/titan-os_sports.git
cd titan-os_sports

# 2. Frontend — instalar y arrancar
npm install
cp .env.example .env          # editar VITE_API_URL=http://localhost:3000
npm run dev                   # http://localhost:5173

# 3. Backend — en otra terminal
cd backend
npm install
cp .env.example .env          # editar DATABASE_URL y ADMIN_TOKEN
npm run dev                   # http://localhost:3000

# La BD se inicializa automáticamente en el primer arranque
```

### Scripts disponibles

| Directorio | Comando | Acción |
|---|---|---|
| raíz | `npm run dev` | Vite dev server (frontend, HMR) |
| raíz | `npm run build` | Compilar frontend para producción |
| raíz | `npm run lint` | ESLint + Oxlint |
| backend | `npm run dev` | ts-node-dev (recarga automática) |
| backend | `npm run build` | Compilar TypeScript → `dist/` |
| backend | `npm start` | Arrancar JS compilado |

---

## 🌐 Despliegue en Railway

El backend se despliega automáticamente con la configuración en `backend/railway.toml`:

```toml
[build]
builder = "nixpacks"
buildCommand = "npm install && npm run build"

[deploy]
startCommand = "npm start"
healthcheckPath = "/health"
healthcheckTimeout = 30
restartPolicyType = "on_failure"
restartPolicyMaxRetries = 3
```

El frontend se construye con `npm run build` y se sirve como sitio estático.

La base de datos MySQL está gestionada como servicio de Railway, conectada vía `DATABASE_URL`.

# API Reference — TitanOS Sports

**Base URL:** `https://titanos-backend.up.railway.app`  
**Formato:** JSON  
**Codificación:** UTF-8

---

## Autenticación

Los endpoints de administración requieren un **Bearer token** en la cabecera `Authorization`:

```
Authorization: Bearer <ADMIN_TOKEN>
```

El token se configura en la variable de entorno `ADMIN_TOKEN` del servidor.  
Los endpoints públicos no requieren autenticación.

---

## Channels

### `GET /channels`

Lista todos los canales ordenados por fecha de creación (más reciente primero).

**Auth:** Pública

**Respuesta `200`:**
```json
[
  {
    "id": "uuid",
    "name": "La 1 HD",
    "url": "https://example.m3u8",
    "streamType": "hls",
    "category": "Generalista",
    "logoUrl": "https://...",
    "referer": null,
    "userAgent": null,
    "addedAt": "2024-01-15T10:00:00.000Z",
    "youtubeSyncUrl": null
  }
]
```

**Ejemplo:**
```bash
curl https://titanos-backend.up.railway.app/channels
```

---

### `POST /channels`

Crea un nuevo canal. El `streamType` se autodetecta por la URL si no se especifica (`twitch.tv` → twitch, `youtube.com` → youtube, resto → hls). Al crear un canal YouTube, se dispara una sincronización de eventos en background.

**Auth:** Admin

**Body:**
```json
{
  "name": "Teledeporte",
  "url": "https://stream.rtve.es/live/teledeporte.m3u8",
  "category": "Deportes",
  "logoUrl": "https://...",
  "streamType": "hls",
  "referer": "https://www.rtve.es",
  "userAgent": null,
  "youtubeSyncUrl": null
}
```

| Campo | Tipo | Requerido |
|---|---|---|
| `name` | string | ✅ |
| `url` | string | ✅ |
| `category` | string | ✅ |
| `logoUrl` | string \| null | ❌ |
| `streamType` | `hls`\|`twitch`\|`youtube`\|`web` | ❌ (autodetectado) |
| `referer` | string \| null | ❌ |
| `userAgent` | string \| null | ❌ |
| `youtubeSyncUrl` | string \| null | ❌ |

**Respuesta `201`:** Objeto canal creado (mismo esquema que GET).

**Ejemplo:**
```bash
curl -X POST https://titanos-backend.up.railway.app/channels \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"Teledeporte","url":"https://...","category":"Deportes"}'
```

---

### `PUT /channels/:id`

Actualiza un canal existente. Solo se modifican los campos enviados; los demás conservan su valor actual.

**Auth:** Admin

**Params:** `id` — UUID del canal

**Body:** Cualquier subconjunto de los campos de POST.

**Respuesta `200`:** Objeto canal actualizado.

**Errores:** `404` si el canal no existe.

**Ejemplo:**
```bash
curl -X PUT https://titanos-backend.up.railway.app/channels/uuid-aqui \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"logoUrl":"https://nuevo-logo.png"}'
```

---

### `DELETE /channels/:id`

Elimina un canal.

**Auth:** Admin

**Params:** `id` — UUID del canal

**Respuesta `200`:**
```json
{ "deleted": "uuid-del-canal" }
```

**Errores:** `404` si el canal no existe.

**Ejemplo:**
```bash
curl -X DELETE https://titanos-backend.up.railway.app/channels/uuid-aqui \
  -H "Authorization: Bearer <TOKEN>"
```

---

### `GET /channels/live-status`

Devuelve el estado en directo de todos los canales Twitch y YouTube. Resultado cacheado 30 segundos.

**Auth:** Pública

**Respuesta `200`:**
```json
{
  "uuid-canal-1": true,
  "uuid-canal-2": false
}
```

Solo aparecen canales con `streamType` `twitch` o `youtube`.  
`true` = emitiendo en directo ahora mismo.

**Ejemplo:**
```bash
curl https://titanos-backend.up.railway.app/channels/live-status
```

---

### `GET /channels/resolve-youtube?url=`

Resuelve una URL de canal o vídeo de YouTube al embed URL del directo activo en ese momento.

**Auth:** Pública

**Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `url` | string | URL de YouTube (canal, vídeo o handle) |

**Estrategia de resolución:**
1. Handle (`/@nombre`) + API key → YouTube Data API para encontrar el directo activo
2. URL con videoId directo (`watch?v=`, `/live/ID`) → embed directo
3. Fallback → scraping HTML del canal buscando `liveBroadcastContent: live`

**Respuesta `200`:**
```json
{ "embedUrl": "https://www.youtube.com/embed/VIDEO_ID?autoplay=1&rel=0" }
```
`embedUrl` es `null` si el canal no está en directo o no se pudo resolver.

**Ejemplo:**
```bash
curl "https://titanos-backend.up.railway.app/channels/resolve-youtube?url=https://www.youtube.com/@LaLiga"
```

---

### `GET /channels/resolve-logo?url=`

Obtiene automáticamente el logo de un canal Twitch o YouTube.

**Auth:** Pública

**Query params:**

| Param | Tipo | Descripción |
|---|---|---|
| `url` | string | URL del canal |

**Estrategia:**
- Twitch → GraphQL público: `profileImageURL(width: 300)`
- YouTube → scraping `<meta property="og:image">`

**Respuesta `200`:**
```json
{ "logoUrl": "https://..." }
```
`logoUrl` es `null` si no se pudo obtener.

**Ejemplo:**
```bash
curl "https://titanos-backend.up.railway.app/channels/resolve-logo?url=https://www.twitch.tv/movistarplus"
```

---

### `POST /channels/:id/sync-youtube-events`

Dispara manualmente la sincronización de próximas retransmisiones de un canal YouTube.

**Auth:** Admin

**Params:** `id` — UUID del canal

**Requisitos:**
- `YOUTUBE_API_KEY` debe estar configurada en el servidor
- El canal debe tener `streamType='youtube'` o `youtubeSyncUrl` definido

**Respuesta `200`:**
```json
{
  "created": 3,
  "skipped": 1,
  "events": [
    {
      "id": "uuid",
      "channelId": "uuid-canal",
      "title": "LaLiga EA Sports | Jornada 38",
      "scheduledAt": "2025-05-26T19:00:00.000Z"
    }
  ]
}
```

**Errores:** `400` si no hay API key o el canal no tiene URL de YouTube. `404` si el canal o el canal de YouTube no existe. `502` si la YouTube API devuelve error.

**Ejemplo:**
```bash
curl -X POST https://titanos-backend.up.railway.app/channels/uuid-aqui/sync-youtube-events \
  -H "Authorization: Bearer <TOKEN>"
```

---

## Events

### `GET /events`

Lista todos los eventos futuros ordenados por fecha de inicio ascendente.

**Auth:** Pública

**Respuesta `200`:**
```json
[
  {
    "id": "uuid",
    "channelId": "uuid-canal",
    "title": "Fútbol: Champions League",
    "scheduledAt": "2025-05-27T20:00:00Z",
    "endTime": "2025-05-27T22:00:00Z",
    "source": "epg"
  }
]
```

| Campo | Descripción |
|---|---|
| `scheduledAt` | ISO 8601 UTC (siempre termina en `Z`) |
| `endTime` | ISO 8601 UTC o `null` si no hay hora de fin |
| `source` | `epg` \| `youtube` \| `null` (manual) |

**Ejemplo:**
```bash
curl https://titanos-backend.up.railway.app/events
```

---

### `POST /events`

Crea un evento manualmente.

**Auth:** Admin

**Body:**
```json
{
  "channelId": "uuid-canal",
  "title": "Partido de exhibición",
  "scheduledAt": "2025-06-01T18:00:00Z"
}
```

Todos los campos son obligatorios.

**Respuesta `201`:**
```json
{
  "id": "uuid-nuevo",
  "channelId": "uuid-canal",
  "title": "Partido de exhibición",
  "scheduledAt": "2025-06-01T18:00:00Z"
}
```

**Ejemplo:**
```bash
curl -X POST https://titanos-backend.up.railway.app/events \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"channelId":"uuid","title":"Partido","scheduledAt":"2025-06-01T18:00:00Z"}'
```

---

### `DELETE /events/:id`

Elimina un evento por su ID.

**Auth:** Admin

**Params:** `id` — UUID del evento

**Respuesta `200`:**
```json
{ "ok": true }
```

**Ejemplo:**
```bash
curl -X DELETE https://titanos-backend.up.railway.app/events/uuid-evento \
  -H "Authorization: Bearer <TOKEN>"
```

---

### `DELETE /events/epg-all`

Elimina todos los eventos con `source = 'epg'`.

**Auth:** Admin

**Respuesta `200`:**
```json
{ "ok": true, "deleted": 72 }
```

**Ejemplo:**
```bash
curl -X DELETE https://titanos-backend.up.railway.app/events/epg-all \
  -H "Authorization: Bearer <TOKEN>"
```

---

### `POST /events/sync-epg`

Dispara manualmente la sincronización completa de EPG:
1. Descarga el XML de davidmuma/EPG_dobleM
2. Filtra programas deportivos
3. Borra todos los eventos EPG existentes
4. Inserta los nuevos

**Auth:** Admin

**Respuesta `200`:**
```json
{
  "ok": true,
  "matched": 3,
  "matchedChannels": ["La 1 HD", "Antena 3 HD", "Teledeporte"],
  "created": 72,
  "skipped": 0,
  "byChannel": {
    "uuid-la1": 13,
    "uuid-antena3": 47,
    "uuid-teledeporte": 12
  }
}
```

**Errores:** `500` si falla la descarga o el parseo del XML.

**Ejemplo:**
```bash
curl -X POST https://titanos-backend.up.railway.app/events/sync-epg \
  -H "Authorization: Bearer <TOKEN>"
```

---

## Health

### `GET /health`

Comprobación de estado del servidor. Usado por Railway para el health check.

**Auth:** Pública

**Respuesta `200`:**
```json
{ "status": "ok" }
```

**Ejemplo:**
```bash
curl https://titanos-backend.up.railway.app/health
```

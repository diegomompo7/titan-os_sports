<script setup lang="ts">
/**
 * ChannelForm — Formulario para añadir o editar un canal.
 *
 * El campo 'streamType' se puede dejar en automático (el backend lo detecta
 * por la URL). Para canales con DRM (DAZN, Movistar+) usar tipo 'web'.
 *
 * El logo se busca automáticamente para URLs de Twitch y YouTube
 * cuando el campo está vacío (con 600ms de debounce para no saturar la API).
 */
import { reactive, computed, watch, ref } from 'vue'
import axios from 'axios'
import type { ChannelFormData, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'

const props = defineProps<{
  initial?:  Partial<ChannelFormData>  // Datos existentes (modo edición)
  loading?:  boolean                   // Guardando → deshabilita el botón
}>()
const emit = defineEmits<{
  submit: [ChannelFormData]
  cancel: []
}>()

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

// ── Estado del formulario (pre-rellenado en modo edición) ────────────────────
const form = reactive<ChannelFormData>({
  name:           props.initial?.name           ?? '',
  url:            props.initial?.url            ?? '',
  category:       props.initial?.category       ?? 'football',
  logoUrl:        props.initial?.logoUrl        ?? '',
  referer:        props.initial?.referer        ?? '',
  userAgent:      props.initial?.userAgent      ?? '',
  streamType:     props.initial?.streamType,
  youtubeSyncUrl: props.initial?.youtubeSyncUrl ?? '',
})

const categories = Object.entries(CATEGORY_LABELS) as [SportCategory, string][]

// ── Búsqueda automática de logo ──────────────────────────────────────────────
const fetchingLogo = ref(false)
let logoDebounceTimer: ReturnType<typeof setTimeout> | null = null

// Cuando el usuario escribe una URL de Twitch o YouTube, busca el logo automáticamente
watch(() => form.url, (newUrl) => {
  if (logoDebounceTimer) clearTimeout(logoDebounceTimer)
  if (!newUrl || form.logoUrl) return  // Si ya hay logo, no sobreescribir

  const isTwitchUrl  = newUrl.includes('twitch.tv')
  const isYoutubeUrl = newUrl.includes('youtube.com') || newUrl.includes('youtu.be')
  if (!isTwitchUrl && !isYoutubeUrl) return

  // Esperar 600ms antes de llamar a la API (para no hacer petición en cada tecla)
  logoDebounceTimer = setTimeout(async () => {
    if (form.logoUrl) return  // El usuario rellenó el campo mientras esperábamos
    fetchingLogo.value = true
    try {
      const { data } = await axios.get<{ logoUrl: string | null }>(
        `${API}/channels/resolve-logo`,
        { params: { url: newUrl } }
      )
      if (data.logoUrl && !form.logoUrl) {
        form.logoUrl = data.logoUrl  // Solo rellenar si el campo sigue vacío
      }
    } catch {
      // Silencioso: si falla la búsqueda del logo, el usuario lo puede poner manualmente
    } finally {
      fetchingLogo.value = false
    }
  }, 600)
})

// ── Ayudas contextuales para el campo URL ────────────────────────────────────
const urlPlaceholder = computed(() => {
  if (form.streamType === 'web')     return 'https://dazn.com/es'
  if (form.streamType === 'youtube') return 'https://www.youtube.com/@LaLiga'
  return 'https://... (m3u8, twitch.tv/... o youtube.com/...)'
})

const urlHint = computed(() => {
  if (form.streamType === 'web')     return 'URL de la web oficial — se abrirá en el navegador'
  if (form.streamType === 'youtube') return 'URL de canal o vídeo de YouTube'
  return 'Formatos: .m3u8 (HLS), twitch.tv/canal, youtube.com/...'
})

// ── Envío del formulario ─────────────────────────────────────────────────────
function handleSubmit() {
  if (!form.name.trim() || !form.url.trim()) return

  emit('submit', {
    ...form,
    // Enviar undefined en lugar de cadena vacía para los campos opcionales
    logoUrl:        form.logoUrl?.trim()        || undefined,
    referer:        form.referer?.trim()        || undefined,
    userAgent:      form.userAgent?.trim()      || undefined,
    streamType:     form.streamType             ?? undefined,
    youtubeSyncUrl: form.youtubeSyncUrl?.trim() || undefined,
  })
}
</script>

<template>
  <form class="channel-form" @submit.prevent="handleSubmit">

    <!-- Nombre del canal -->
    <div class="field">
      <label for="cf-name">Nombre del canal</label>
      <input id="cf-name" v-model="form.name" type="text" placeholder="Ej: ESPN HD" required />
    </div>

    <!-- Tipo de stream -->
    <div class="field">
      <label for="cf-type">Tipo de stream</label>
      <select id="cf-type" v-model="form.streamType">
        <option :value="undefined">Automático (detecta HLS / Twitch / YouTube)</option>
        <option value="youtube">YouTube</option>
        <option value="web">Web — DRM (DAZN, Movistar+…)</option>
      </select>
      <span class="field-hint">
        "Web" abre el canal en el navegador externo, para canales con protección DRM
      </span>
    </div>

    <!-- URL del stream -->
    <div class="field">
      <label for="cf-url">URL del stream</label>
      <input
        id="cf-url"
        v-model="form.url"
        type="url"
        :placeholder="urlPlaceholder"
        required
      />
      <span class="field-hint">{{ urlHint }}</span>
    </div>

    <!-- Categoría -->
    <div class="field">
      <label for="cf-category">Categoría deportiva</label>
      <select id="cf-category" v-model="form.category">
        <option v-for="[value, label] in categories" :key="value" :value="value">
          {{ label }}
        </option>
      </select>
    </div>

    <!-- Logo URL (con preview y auto-fetch) -->
    <div class="field">
      <label for="cf-logo">
        Logo URL
        <span class="label-optional">(opcional)</span>
        <span v-if="fetchingLogo" class="label-loading">⏳ Buscando logo…</span>
      </label>
      <div class="logo-row">
        <input
          id="cf-logo"
          v-model="form.logoUrl"
          type="url"
          placeholder="https://… (se busca automáticamente para Twitch/YouTube)"
        />
        <!-- Preview del logo en tiempo real -->
        <img
          v-if="form.logoUrl"
          :src="form.logoUrl"
          class="logo-preview"
          alt="Preview del logo"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
          @load="($event.target as HTMLImageElement).style.display = 'block'"
        />
      </div>
    </div>

    <!-- Sección avanzada (headers HTTP) — colapsada por defecto -->
    <details class="advanced-section">
      <summary class="advanced-summary">
        ⚙ Headers avanzados
        <span class="label-optional">(solo si el canal los requiere)</span>
      </summary>

      <div class="advanced-fields">
        <div class="field">
          <label for="cf-referer">Referer</label>
          <input
            id="cf-referer"
            v-model="form.referer"
            type="url"
            placeholder="https://www.atresplayer.com/"
          />
          <span class="field-hint">Necesario para algunos canales (Antena 3, Neox, etc.)</span>
        </div>

        <div class="field">
          <label for="cf-useragent">User-Agent <span class="label-optional">(opcional)</span></label>
          <input
            id="cf-useragent"
            v-model="form.userAgent"
            type="text"
            placeholder="Mozilla/5.0 …"
          />
        </div>

        <div class="field">
          <label for="cf-yt-sync">URL de YouTube para sincronizar eventos</label>
          <input
            id="cf-yt-sync"
            v-model="form.youtubeSyncUrl"
            type="url"
            placeholder="https://www.youtube.com/@marcatv"
          />
          <span class="field-hint">
            Los próximos directos de este canal de YouTube aparecerán en la tarjeta del canal
          </span>
        </div>
      </div>
    </details>

    <!-- Botones de acción -->
    <div class="form-actions">
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">Cancelar</button>
      <button type="submit" class="btn btn-primary" :disabled="loading">
        {{ loading ? 'Guardando…' : 'Guardar canal' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.channel-form {
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

/* Etiqueta con extras (opcional / cargando) */
.label-optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.72rem;
  color: var(--color-text-muted);
}
.label-loading {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--color-accent);
  text-transform: none;
  letter-spacing: 0;
  margin-left: var(--space-2);
}

/* Pista explicativa debajo del campo */
.field-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

/* Fila logo + preview */
.logo-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.logo-row input { flex: 1; }
.logo-preview {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  display: none;           /* Se muestra solo si la imagen carga correctamente */
}

/* Sección avanzada (colapsable) */
.advanced-section {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-3) var(--space-4);
}
.advanced-summary {
  cursor: pointer;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  user-select: none;
}
.advanced-fields {
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
  margin-top: var(--space-4);
}

/* Botones del formulario */
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-2);
  flex-wrap: wrap;
}
</style>

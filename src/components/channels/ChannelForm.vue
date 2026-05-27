<script setup lang="ts">
/**
 * ChannelForm — Formulario de añadir/editar canal para Titan OS.
 * Campos grandes y legibles para uso en TV.
 */
import { reactive, computed, watch, ref } from 'vue'
import axios from 'axios'
import type { ChannelFormData, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'

const props = defineProps<{
  initial?: Partial<ChannelFormData>
  loading?: boolean
}>()
const emit = defineEmits<{
  submit: [ChannelFormData]
  cancel: []
}>()

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

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
let logoTimer: ReturnType<typeof setTimeout> | null = null

watch(() => form.url, (newUrl) => {
  if (logoTimer) clearTimeout(logoTimer)
  if (!newUrl || form.logoUrl) return
  const isTw = newUrl.includes('twitch.tv')
  const isYt = newUrl.includes('youtube.com') || newUrl.includes('youtu.be')
  if (!isTw && !isYt) return
  logoTimer = setTimeout(async () => {
    if (form.logoUrl) return
    fetchingLogo.value = true
    try {
      const { data } = await axios.get<{ logoUrl: string | null }>(
        `${API}/channels/resolve-logo`, { params: { url: newUrl } }
      )
      if (data.logoUrl && !form.logoUrl) form.logoUrl = data.logoUrl
    } catch { /* silencioso */ }
    finally { fetchingLogo.value = false }
  }, 600)
})

const urlPlaceholder = computed(() => {
  if (form.streamType === 'web')      return 'https://dazn.com/es'
  if (form.streamType === 'youtube')  return 'https://youtu.be/dQw4w9WgXcQ'
  if (form.streamType === 'titanapp') return 'dazn://  ó  netflix://  ó  youtube://'
  return 'https://... (m3u8, twitch.tv/... o youtube.com/...)'
})
const urlHint = computed(() => {
  if (form.streamType === 'web')      return 'URL de la web — se abrirá en el navegador'
  if (form.streamType === 'youtube')  return 'URL del vídeo o canal — abre la app nativa de YouTube en la TV'
  if (form.streamType === 'titanapp') return 'Deep link URI — dazn:// abre la app DAZN instalada en la TV (DRM completo)'
  return 'Formatos: .m3u8 (HLS), twitch.tv/canal, youtube.com/...'
})

function handleSubmit() {
  if (!form.name.trim() || !form.url.trim()) return
  emit('submit', {
    ...form,
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

    <div class="field">
      <label for="cf-name">Nombre del canal</label>
      <input id="cf-name" v-model="form.name" type="text" placeholder="Ej: ESPN HD" required />
    </div>

    <div class="field">
      <label for="cf-type">Tipo de stream</label>
      <select id="cf-type" v-model="form.streamType">
        <option :value="undefined">Automático (detecta HLS / Twitch / YouTube)</option>
        <option value="youtube">YouTube — abre app nativa</option>
        <option value="web">Web — DRM (DAZN, Movistar+…)</option>
        <option value="titanapp">📺 App nativa Titan OS (DAZN, Netflix…)</option>
      </select>
      <span class="field-hint">
        "YouTube" y "App nativa" usan el SDK de Titan OS para abrir la app instalada en la TV
      </span>
    </div>

    <div class="field">
      <label for="cf-url">URL del stream</label>
      <input
        id="cf-url"
        v-model="form.url"
        :type="form.streamType === 'titanapp' ? 'text' : 'url'"
        :placeholder="urlPlaceholder"
        required
      />
      <span class="field-hint">{{ urlHint }}</span>
    </div>

    <div class="field">
      <label for="cf-category">Categoría deportiva</label>
      <select id="cf-category" v-model="form.category">
        <option v-for="[val, lbl] in categories" :key="val" :value="val">{{ lbl }}</option>
      </select>
    </div>

    <div class="field">
      <label for="cf-logo">
        Logo URL
        <span class="label-optional">(opcional)</span>
        <span v-if="fetchingLogo" class="label-loading">⏳ Buscando…</span>
      </label>
      <div class="logo-row">
        <input
          id="cf-logo"
          v-model="form.logoUrl"
          type="url"
          placeholder="https://… (se busca automáticamente para Twitch/YouTube)"
        />
        <img
          v-if="form.logoUrl"
          :src="form.logoUrl"
          class="logo-preview"
          alt="Preview"
          @error="($event.target as HTMLImageElement).style.display = 'none'"
          @load="($event.target as HTMLImageElement).style.display = 'block'"
        />
      </div>
    </div>

    <details class="advanced-section">
      <summary class="advanced-summary">
        ⚙ Headers avanzados <span class="label-optional">(solo si el canal los requiere)</span>
      </summary>
      <div class="advanced-fields">
        <div class="field">
          <label for="cf-referer">Referer</label>
          <input id="cf-referer" v-model="form.referer" type="url" placeholder="https://www.atresplayer.com/" />
          <span class="field-hint">Necesario para algunos canales (Antena 3, Neox, etc.)</span>
        </div>
        <div class="field">
          <label for="cf-ua">User-Agent <span class="label-optional">(opcional)</span></label>
          <input id="cf-ua" v-model="form.userAgent" type="text" placeholder="Mozilla/5.0 …" />
        </div>
        <div class="field">
          <label for="cf-yt-sync">URL de YouTube para sincronizar eventos</label>
          <input id="cf-yt-sync" v-model="form.youtubeSyncUrl" type="url" placeholder="https://www.youtube.com/@marcatv" />
          <span class="field-hint">Los próximos directos aparecerán en la tarjeta del canal</span>
        </div>
      </div>
    </details>

    <div class="form-actions">
      <button type="button" class="btn btn-ghost" @click="emit('cancel')">Cancelar</button>
      <button type="submit"  class="btn btn-primary" :disabled="loading">
        {{ loading ? 'Guardando…' : 'Guardar canal' }}
      </button>
    </div>
  </form>
</template>

<style scoped>
.channel-form {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}

.label-optional {
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  margin-left: var(--space-1);
}
.label-loading {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--color-accent);
  text-transform: none;
  letter-spacing: 0;
  margin-left: var(--space-2);
}
.field-hint {
  font-size: 0.73rem;
  color: var(--color-text-muted);
}

.logo-row {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
.logo-row input { flex: 1; }
.logo-preview {
  width: 3rem;
  height: 3rem;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  display: none;
}

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

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding-top: var(--space-2);
}
</style>

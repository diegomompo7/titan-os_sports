<script setup lang="ts">
import { reactive, computed, watch, ref } from 'vue'
import axios from 'axios'
import type { ChannelFormData, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'

const props = defineProps<{ initial?: Partial<ChannelFormData>; loading?: boolean }>()
const emit = defineEmits<{ submit: [ChannelFormData]; cancel: [] }>()

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'
const fetchingLogo = ref(false)

const form = reactive<ChannelFormData>({
  name: props.initial?.name ?? '',
  url: props.initial?.url ?? '',
  category: props.initial?.category ?? 'football',
  logoUrl: props.initial?.logoUrl ?? '',
  referer: props.initial?.referer ?? '',
  userAgent: props.initial?.userAgent ?? '',
  streamType: props.initial?.streamType,
  youtubeSyncUrl: props.initial?.youtubeSyncUrl ?? '',
})

const categories = Object.entries(CATEGORY_LABELS) as [SportCategory, string][]

// Auto-fetch logo cuando se escribe una URL de Twitch o YouTube
let logoDebounce: ReturnType<typeof setTimeout> | null = null
watch(
  () => form.url,
  (newUrl) => {
    if (logoDebounce) clearTimeout(logoDebounce)
    if (!newUrl || form.logoUrl) return
    const isTwitch = newUrl.includes('twitch.tv')
    const isYoutube = newUrl.includes('youtube.com') || newUrl.includes('youtu.be')
    if (!isTwitch && !isYoutube) return
    logoDebounce = setTimeout(async () => {
      if (form.logoUrl) return // el usuario llenó el campo mientras esperábamos
      fetchingLogo.value = true
      try {
        const { data } = await axios.get<{ logoUrl: string | null }>(`${API}/channels/resolve-logo`, {
          params: { url: newUrl },
        })
        if (data.logoUrl && !form.logoUrl) form.logoUrl = data.logoUrl
      } catch { /* silencioso */ } finally {
        fetchingLogo.value = false
      }
    }, 600)
  }
)

const urlPlaceholder = computed(() => {
  if (form.streamType === 'web') return 'https://dazn.com'
  if (form.streamType === 'youtube') return 'https://www.youtube.com/watch?v=...'
  return 'https://... (m3u8, twitch.tv/... o youtube.com/...)'
})

const urlHint = computed(() => {
  if (form.streamType === 'web') return 'URL de la web oficial del canal'
  if (form.streamType === 'youtube') return 'URL de YouTube (watch, live o youtu.be)'
  return 'HLS (.m3u8), enlace de Twitch o YouTube'
})

function handleSubmit() {
  if (!form.name.trim() || !form.url.trim()) return
  emit('submit', {
    ...form,
    logoUrl: form.logoUrl?.trim() || undefined,
    referer: form.referer?.trim() || undefined,
    userAgent: form.userAgent?.trim() || undefined,
    streamType: form.streamType ?? undefined,
    youtubeSyncUrl: form.youtubeSyncUrl?.trim() || undefined,
  })
}
</script>

<template>
  <form class="channel-form" @submit.prevent="handleSubmit">
    <div class="field">
      <label>Nombre del canal</label>
      <input v-model="form.name" type="text" placeholder="Ej: ESPN HD" required />
    </div>
    <div class="field">
      <label>Tipo de stream</label>
      <select v-model="form.streamType">
        <option :value="undefined">Auto (HLS / Twitch / YouTube)</option>
        <option value="youtube">YouTube</option>
        <option value="web">Web (DAZN, Movistar+…)</option>
      </select>
      <span class="field-hint">
        "Web" abre en el navegador del sistema — para canales con DRM
      </span>
    </div>
    <div class="field">
      <label>URL del stream</label>
      <input
        v-model="form.url"
        type="url"
        :placeholder="urlPlaceholder"
        required
      />
      <span class="field-hint">
        {{ urlHint }}
      </span>
    </div>
    <div class="field">
      <label>Categoría</label>
      <select v-model="form.category">
        <option v-for="[val, label] in categories" :key="val" :value="val">{{ label }}</option>
      </select>
    </div>
    <div class="field">
      <label>
        Logo URL <span class="optional">(opcional)</span>
        <span v-if="fetchingLogo" class="logo-fetching">⏳ Buscando logo…</span>
      </label>
      <div class="logo-row">
        <input v-model="form.logoUrl" type="url" placeholder="https://… (se rellena solo para Twitch/YouTube)" />
        <img v-if="form.logoUrl" :src="form.logoUrl" class="logo-preview" alt="preview" @error="($event.target as HTMLImageElement).style.display='none'" @load="($event.target as HTMLImageElement).style.display='block'" />
      </div>
    </div>
    <details class="advanced">
      <summary>Headers avanzados <span class="optional">(para canales que lo requieran)</span></summary>
      <div class="advanced-fields">
        <div class="field">
          <label>Referer</label>
          <input v-model="form.referer" type="url" placeholder="https://www.atresplayer.com/" />
          <span class="field-hint">Necesario para canales como Neox, Antena 3...</span>
        </div>
        <div class="field">
          <label>User-Agent <span class="optional">(opcional)</span></label>
          <input v-model="form.userAgent" type="text" placeholder="Mozilla/5.0 ..." />
        </div>
        <div class="field">
          <label>URL de YouTube <span class="optional">(para sincronizar eventos)</span></label>
          <input
            v-model="form.youtubeSyncUrl"
            type="url"
            placeholder="https://www.youtube.com/@marcatv"
          />
          <span class="field-hint">
            Los directos programados de este canal de YouTube aparecerán en esta tarjeta
          </span>
        </div>
      </div>
    </details>

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
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}
.field {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}
label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
input,
select {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  padding: 8px 10px;
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}
input:focus,
select:focus {
  border-color: var(--color-accent);
}
.field-hint {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}
.optional {
  font-weight: 400;
  text-transform: none;
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
  padding-top: var(--space-sm);
}
.btn {
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 18px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--color-accent);
  color: #000;
}
.btn-ghost {
  background: var(--color-border);
  color: var(--color-text-primary);
}
.logo-row {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}
.logo-row input {
  flex: 1;
}
.logo-preview {
  width: 40px;
  height: 40px;
  border-radius: var(--radius-sm);
  object-fit: cover;
  flex-shrink: 0;
  display: none;
}
.logo-fetching {
  font-size: 0.7rem;
  font-weight: 400;
  color: var(--color-accent);
  text-transform: none;
  letter-spacing: 0;
  margin-left: var(--space-xs);
}
.advanced {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  padding: var(--space-sm) var(--space-md);
}
.advanced summary {
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
  gap: var(--space-md);
  margin-top: var(--space-md);
}
</style>

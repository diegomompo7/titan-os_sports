<script setup lang="ts">
import { reactive, computed } from 'vue'
import type { ChannelFormData, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'

const props = defineProps<{ initial?: Partial<ChannelFormData>; loading?: boolean }>()
const emit = defineEmits<{ submit: [ChannelFormData]; cancel: [] }>()

const form = reactive<ChannelFormData>({
  name: props.initial?.name ?? '',
  url: props.initial?.url ?? '',
  category: props.initial?.category ?? 'football',
  logoUrl: props.initial?.logoUrl ?? '',
  referer: props.initial?.referer ?? '',
  userAgent: props.initial?.userAgent ?? '',
  streamType: props.initial?.streamType,
})

const categories = Object.entries(CATEGORY_LABELS) as [SportCategory, string][]

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
      <label>Logo URL <span class="optional">(opcional)</span></label>
      <input v-model="form.logoUrl" type="url" placeholder="https://..." />
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

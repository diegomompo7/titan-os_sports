<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/channels/ChannelForm.vue
   ¿QUÉ ES ESTO?
   El formulario que usa el administrador para añadir o editar un canal.
   Aparece dentro de un BaseModal cuando el admin pulsa "Añadir canal" o
   el icono de editar en una tarjeta.

   Características especiales:
   - Búsqueda automática de logo: cuando el admin introduce la URL de un canal
     de Twitch o YouTube, el formulario busca automáticamente el logo del canal
     (esperando 600ms para no hacer peticiones con cada tecla)
   - Placeholder e hint dinámicos: el campo URL cambia su texto de ayuda
     según el tipo de stream seleccionado
   - Campos avanzados: Referer y User-Agent están ocultos en un acordeón
     para no abrumar al admin con opciones poco usadas
============================================================================= */
import { reactive, computed, watch, ref } from 'vue'
import axios from 'axios'
import type { ChannelFormData, SportCategory } from '@/types/channel'
import { CATEGORY_LABELS } from '@/types/channel'

const props = defineProps<{
  initial?: Partial<ChannelFormData>  // Si se pasa, el formulario empieza pre-relleno (modo edición)
  loading?: boolean                   // Si true, deshabilita el botón de guardar (petición en curso)
}>()
const emit = defineEmits<{
  submit: [ChannelFormData]  // Cuando el admin pulsa "Guardar", emite los datos del formulario
  cancel: []                 // Cuando pulsa "Cancelar"
}>()

const API = import.meta.env['VITE_API_URL'] ?? 'http://localhost:3000'

// Estado reactivo del formulario. reactive() hace que Vue actualice la vista
// automáticamente cuando cambia cualquier campo.
// Si hay datos iniciales (modo edición), los usamos; si no, campos vacíos.
const form = reactive<ChannelFormData>({
  name:           props.initial?.name           ?? '',
  url:            props.initial?.url            ?? '',
  category:       props.initial?.category       ?? 'football',
  logoUrl:        props.initial?.logoUrl        ?? '',
  referer:        props.initial?.referer        ?? '',
  userAgent:      props.initial?.userAgent      ?? '',
  streamType:     props.initial?.streamType,          // undefined = auto-detectar
  youtubeSyncUrl: props.initial?.youtubeSyncUrl ?? '',
})

// Lista de categorías para el selector desplegable: [["football", "Fútbol"], ...]
const categories = Object.entries(CATEGORY_LABELS) as [SportCategory, string][]

// ── Búsqueda automática de logo ──────────────────────────────────────────────
// Indicador de que se está buscando el logo en segundo plano
const fetchingLogo = ref(false)
let logoTimer: ReturnType<typeof setTimeout> | null = null

// Vigilamos cambios en el campo URL para buscar el logo automáticamente
watch(() => form.url, (newUrl) => {
  // Cancelar búsqueda anterior si el admin sigue escribiendo
  if (logoTimer) clearTimeout(logoTimer)
  // Solo buscar logo para Twitch y YouTube; y solo si no hay logo ya introducido
  if (!newUrl || form.logoUrl) return
  const isTw = newUrl.includes('twitch.tv')
  const isYt = newUrl.includes('youtube.com') || newUrl.includes('youtu.be')
  if (!isTw && !isYt) return

  // Esperar 600ms antes de buscar (para no hacer petición con cada letra que escribe)
  logoTimer = setTimeout(async () => {
    if (form.logoUrl) return  // Si ya pusieron logo manualmente mientras esperábamos, no sobreescribir
    fetchingLogo.value = true
    try {
      const { data } = await axios.get<{ logoUrl: string | null }>(
        `${API}/channels/resolve-logo`, { params: { url: newUrl } }
      )
      // Solo asignar si el servidor encontró un logo y el campo sigue vacío
      if (data.logoUrl && !form.logoUrl) form.logoUrl = data.logoUrl
    } catch { /* silencioso — si falla, el admin puede poner el logo manualmente */ }
    finally { fetchingLogo.value = false }
  }, 600)
})

// Texto de ejemplo (placeholder) del campo URL según el tipo de stream seleccionado
const urlPlaceholder = computed(() => {
  if (form.streamType === 'web')      return 'https://dazn.com/es'
  if (form.streamType === 'youtube')  return 'https://youtu.be/dQw4w9WgXcQ'
  if (form.streamType === 'titanapp') return 'dazn://  ó  pluto://channel/ID  ó  netflix://'
  return 'https://... (m3u8, twitch.tv/... o youtube.com/...)'
})

// Texto de ayuda debajo del campo URL, explicando qué hace cada tipo
const urlHint = computed(() => {
  if (form.streamType === 'web')      return 'URL de la web — se abrirá en el navegador'
  if (form.streamType === 'youtube')  return 'URL del vídeo o canal — abre la app nativa de YouTube en la TV'
  if (form.streamType === 'titanapp') {
    const isYt    = form.url.includes('youtube.com') || form.url.includes('youtu.be') || form.url.startsWith('youtube://')
    const isPluto = form.url.startsWith('pluto://')
    if (isYt)    return '▶ YouTube detectado — se reproducirá embebido dentro de TitanOS Sports'
    if (isPluto) return '📺 PlutoTV detectado — el canal se reproducirá en la app nativa de Titan OS'
    return 'Deep link de app: dazn://, pluto://channel/ID, netflix://… — el player nativo de Titan OS gestionará la reproducción'
  }
  return 'Formatos: .m3u8 (HLS), twitch.tv/canal, youtube.com/...'
})

// Se ejecuta cuando el admin pulsa "Guardar".
// Limpia los campos opcionales vacíos (los convierte a undefined en vez de '')
// antes de emitir los datos, ya que el servidor prefiere undefined a ''.
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
        <option value="titanapp">📺 App nativa Titan OS (DAZN, PlutoTV, Netflix…)</option>
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

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useAdsStore } from '@/stores/ads'
import { useAdminStore } from '@/stores/admin'

const emit = defineEmits<{ close: [] }>()

const adsStore   = useAdsStore()
const adminStore = useAdminStore()

onMounted(() => adsStore.fetchAllAds(adminStore.token))

const newUrl   = ref('')
const newLabel = ref('')
const saving   = ref(false)
const saveErr  = ref('')

async function addAd() {
  if (!newUrl.value.trim()) return
  saving.value = true
  saveErr.value = ''
  try {
    await adsStore.addAd({ url: newUrl.value.trim(), label: newLabel.value.trim() || undefined }, adminStore.token)
    newUrl.value   = ''
    newLabel.value = ''
  } catch {
    saveErr.value = 'Error al añadir el anuncio.'
  } finally {
    saving.value = false
  }
}

async function toggleActive(id: string, current: boolean) {
  await adsStore.updateAd(id, { active: !current }, adminStore.token)
}

async function deleteAd(id: string) {
  if (!confirm('¿Eliminar este anuncio?')) return
  await adsStore.removeAd(id, adminStore.token)
}

function truncate(url: string, max = 50): string {
  return url.length > max ? url.slice(0, max) + '…' : url
}
</script>

<template>
  <BaseModal title="Anuncios" @close="emit('close')">
    <div class="panel">

      <section class="section">
        <h3 class="section-title">Añadir anuncio</h3>
        <form class="ad-form" @submit.prevent="addAd">
          <div class="field">
            <label for="ad-url">URL de YouTube</label>
            <input
              id="ad-url"
              v-model="newUrl"
              type="text"
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
          </div>
          <div class="field">
            <label for="ad-label">Etiqueta (opcional)</label>
            <input id="ad-label" v-model="newLabel" type="text" placeholder="Ej: Spot verano 2025" />
          </div>
          <p v-if="saveErr" class="error-msg">{{ saveErr }}</p>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Guardando…' : '+ Añadir' }}
          </button>
        </form>
      </section>

      <section class="section">
        <h3 class="section-title">Anuncios configurados</h3>
        <p v-if="!adsStore.ads.length" class="empty-msg">No hay anuncios todavía</p>
        <ul class="ads-list">
          <li v-for="ad in adsStore.ads" :key="ad.id" class="ad-item">
            <div class="ad-info">
              <span v-if="ad.label" class="ad-label">{{ ad.label }}</span>
              <span class="ad-url">{{ truncate(ad.url) }}</span>
            </div>
            <div class="ad-actions">
              <button
                class="toggle-btn"
                :class="{ 'toggle-btn--on': ad.active }"
                :title="ad.active ? 'Desactivar' : 'Activar'"
                @click="toggleActive(ad.id, ad.active)"
              >{{ ad.active ? 'Activo' : 'Inactivo' }}</button>
              <button class="del-btn" title="Eliminar" @click="deleteAd(ad.id)">🗑️</button>
            </div>
          </li>
        </ul>
      </section>

    </div>
  </BaseModal>
</template>

<style scoped>
.panel {
  padding: var(--space-5);
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.section {
  display: flex;
  flex-direction: column;
  gap: var(--space-3);
  padding-top: var(--space-4);
  border-top: 1px solid var(--color-border);
}
.section:first-child { border-top: none; padding-top: 0; }

.section-title {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin: 0;
}

.ad-form { display: flex; flex-direction: column; gap: var(--space-3); }
.error-msg { color: var(--color-danger); font-size: 0.82rem; }

.empty-msg { color: var(--color-text-muted); font-size: 0.88rem; text-align: center; padding: var(--space-4) 0; }

.ads-list { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }

.ad-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
}

.ad-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.ad-label {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--color-accent);
}

.ad-url {
  font-size: 0.78rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ad-actions {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

.toggle-btn {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-surface);
  color: var(--color-text-muted);
  cursor: pointer;
  transition: all 0.15s;
}
.toggle-btn--on {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
}

.del-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  padding: var(--space-1);
  opacity: 0.45;
  transition: opacity 0.15s;
}
.del-btn:hover { opacity: 1; }
</style>

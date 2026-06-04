<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useAdsStore } from '@/stores/ads'
import { useAdminStore } from '@/stores/admin'

const emit = defineEmits<{ close: [] }>()

const adsStore   = useAdsStore()
const adminStore = useAdminStore()

const newUrl   = ref('')
const newLabel = ref('')
const saving   = ref(false)
const error    = ref('')

onMounted(() => adsStore.fetchAllAds(adminStore.token))

async function addAd() {
  if (!newUrl.value.trim()) return
  saving.value = true
  error.value  = ''
  try {
    await adsStore.addAd(newUrl.value.trim(), newLabel.value.trim(), adminStore.token)
    newUrl.value   = ''
    newLabel.value = ''
  } catch {
    error.value = 'Error al añadir el anuncio.'
  } finally {
    saving.value = false
  }
}

async function toggle(id: string, current: boolean) {
  try {
    await adsStore.toggleAd(id, !current, adminStore.token)
  } catch {
    error.value = 'Error al actualizar.'
  }
}

async function remove(id: string) {
  if (!confirm('¿Eliminar este anuncio?')) return
  try {
    await adsStore.removeAd(id, adminStore.token)
  } catch {
    error.value = 'Error al eliminar.'
  }
}
</script>

<template>
  <BaseModal title="📢 Anuncios" wide @close="emit('close')">
    <div class="panel">

      <section class="section">
        <h3 class="section-title">Añadir anuncio</h3>
        <form class="ad-form" @submit.prevent="addAd">
          <div class="field">
            <label for="ad-url">URL de YouTube</label>
            <input
              id="ad-url"
              v-model="newUrl"
              type="url"
              placeholder="https://www.youtube.com/watch?v=..."
              required
            />
          </div>
          <div class="field">
            <label for="ad-label">Etiqueta (opcional)</label>
            <input
              id="ad-label"
              v-model="newLabel"
              type="text"
              placeholder="Ej: Promo verano"
            />
          </div>
          <p v-if="error" class="error-msg">{{ error }}</p>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Guardando…' : '+ Añadir anuncio' }}
          </button>
        </form>
      </section>

      <section class="section">
        <h3 class="section-title">Anuncios configurados</h3>
        <p v-if="!adsStore.ads.length" class="empty-msg">No hay anuncios todavía</p>
        <ul class="ads-list">
          <li v-for="ad in adsStore.ads" :key="ad.id" class="ad-item">
            <div class="ad-info">
              <span class="ad-label">{{ ad.label || '(sin etiqueta)' }}</span>
              <span class="ad-url">{{ ad.url }}</span>
            </div>
            <div class="ad-actions">
              <button
                class="btn btn-ghost toggle-btn"
                :class="{ 'toggle-btn--active': ad.active }"
                @click="toggle(ad.id, ad.active)"
              >{{ ad.active ? '● Activo' : '○ Inactivo' }}</button>
              <button class="del-btn" title="Eliminar" @click="remove(ad.id)">🗑️</button>
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
  font-size: 0.88rem;
  color: var(--color-text-main);
  font-weight: 600;
}
.ad-url {
  font-size: 0.72rem;
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
  font-size: 0.78rem;
  min-height: 2.2rem;
  padding: 0 var(--space-3);
  color: var(--color-text-muted);
  border-color: var(--color-border);
}
.toggle-btn--active {
  color: var(--color-accent);
  border-color: rgba(0, 191, 255, 0.4);
}

.del-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.9rem;
  padding: var(--space-2);
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0.45;
  transition: opacity 0.15s;
  border-radius: var(--radius-sm);
}
.del-btn:hover { opacity: 1; }
</style>

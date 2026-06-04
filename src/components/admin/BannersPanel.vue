<script setup lang="ts">
import { ref, onMounted } from 'vue'
import BaseModal from '@/components/ui/BaseModal.vue'
import { useBannersStore } from '@/stores/banners'
import { useAdminStore } from '@/stores/admin'

const emit = defineEmits<{ close: [] }>()

const bannersStore = useBannersStore()
const adminStore   = useAdminStore()

const newUrl   = ref('')
const newLabel = ref('')
const saving   = ref(false)
const error    = ref('')

onMounted(() => bannersStore.fetchAllBanners(adminStore.token))

async function addBanner() {
  if (!newUrl.value.trim()) return
  saving.value = true
  error.value  = ''
  try {
    await bannersStore.addBanner(newUrl.value.trim(), newLabel.value.trim(), adminStore.token)
    newUrl.value   = ''
    newLabel.value = ''
  } catch {
    error.value = 'Error al añadir el banner.'
  } finally {
    saving.value = false
  }
}

async function toggle(id: string, current: boolean) {
  try {
    await bannersStore.toggleBanner(id, !current, adminStore.token)
  } catch {
    error.value = 'Error al actualizar.'
  }
}

async function remove(id: string) {
  if (!confirm('¿Eliminar este banner?')) return
  try {
    await bannersStore.removeBanner(id, adminStore.token)
  } catch {
    error.value = 'Error al eliminar.'
  }
}
</script>

<template>
  <BaseModal title="🖼️ Banners" wide @close="emit('close')">
    <div class="panel">

      <section class="section">
        <h3 class="section-title">Añadir banner</h3>
        <form class="form" @submit.prevent="addBanner">
          <div class="field">
            <label for="banner-url">URL de imagen</label>
            <input
              id="banner-url"
              v-model="newUrl"
              type="text"
              placeholder="https://ejemplo.com/imagen.jpg  o  /assets/banners/imagen.jpg"
              required
            />
          </div>
          <div class="field">
            <label for="banner-label">Etiqueta (opcional)</label>
            <input
              id="banner-label"
              v-model="newLabel"
              type="text"
              placeholder="Ej: Promo verano"
            />
          </div>
          <p v-if="error" class="error-msg">{{ error }}</p>
          <button type="submit" class="btn btn-primary" :disabled="saving">
            {{ saving ? 'Guardando…' : '+ Añadir banner' }}
          </button>
        </form>
      </section>

      <section class="section">
        <h3 class="section-title">Banners configurados</h3>
        <p v-if="!bannersStore.banners.length" class="empty-msg">No hay banners todavía</p>
        <ul class="list">
          <li v-for="banner in bannersStore.banners" :key="banner.id" class="item">
            <img :src="banner.imageUrl" class="thumb" alt="" />
            <div class="info">
              <span class="lbl">{{ banner.label || '(sin etiqueta)' }}</span>
              <span class="url">{{ banner.imageUrl }}</span>
            </div>
            <div class="actions">
              <button
                class="btn btn-ghost toggle-btn"
                :class="{ 'toggle-btn--active': banner.active }"
                @click="toggle(banner.id, banner.active)"
              >{{ banner.active ? '● Activo' : '○ Inactivo' }}</button>
              <button class="del-btn" title="Eliminar" @click="remove(banner.id)">🗑️</button>
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
.form { display: flex; flex-direction: column; gap: var(--space-3); }
.error-msg { color: var(--color-danger); font-size: 0.82rem; }
.empty-msg { color: var(--color-text-muted); font-size: 0.88rem; text-align: center; padding: var(--space-4) 0; }

.list { list-style: none; display: flex; flex-direction: column; gap: var(--space-2); }
.item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm);
  border: 1px solid var(--color-border);
  background: var(--color-bg-base);
}
.thumb {
  width: 4rem;
  height: 2.5rem;
  object-fit: cover;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  background: #111;
}
.info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}
.lbl { font-size: 0.88rem; color: var(--color-text-main); font-weight: 600; }
.url {
  font-size: 0.72rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.actions { display: flex; align-items: center; gap: var(--space-2); flex-shrink: 0; }
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

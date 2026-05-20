<script setup lang="ts">
import { ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import BaseModal from '@/components/ui/BaseModal.vue'

const emit = defineEmits<{ close: [] }>()
const adminStore = useAdminStore()
const tokenInput = ref('')
const error = ref('')

function handleLogin() {
  if (!tokenInput.value.trim()) {
    error.value = 'Introduce el token admin'
    return
  }
  adminStore.login(tokenInput.value.trim())
  emit('close')
}
</script>

<template>
  <BaseModal title="Acceso admin" @close="emit('close')">
    <form class="login-form" @submit.prevent="handleLogin">
      <div class="field">
        <label>Token de administrador</label>
        <input
          v-model="tokenInput"
          type="password"
          placeholder="••••••••••••"
          autocomplete="current-password"
        />
        <span v-if="error" class="field-error">{{ error }}</span>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" @click="emit('close')">Cancelar</button>
        <button type="submit" class="btn btn-primary">Entrar</button>
      </div>
    </form>
  </BaseModal>
</template>

<style scoped>
.login-form {
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
input {
  background: var(--color-bg-base);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-primary);
  padding: 8px 10px;
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
}
input:focus {
  border-color: var(--color-accent);
}
.field-error {
  font-size: 0.75rem;
  color: var(--color-danger);
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-sm);
}
.btn {
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px 18px;
  font-size: 0.875rem;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn-primary {
  background: var(--color-accent);
  color: #000;
}
.btn-ghost {
  background: var(--color-border);
  color: var(--color-text-primary);
}
</style>

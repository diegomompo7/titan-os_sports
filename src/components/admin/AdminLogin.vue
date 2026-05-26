<script setup lang="ts">
/**
 * AdminLogin — Modal de acceso al panel de administración.
 * El token se guarda en sessionStorage (desaparece al cerrar la pestaña).
 */
import { ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import BaseModal from '@/components/ui/BaseModal.vue'

const emit      = defineEmits<{ close: [] }>()
const adminStore = useAdminStore()

const tokenInput = ref('')
const errorMsg   = ref('')

function handleLogin() {
  const token = tokenInput.value.trim()

  if (!token) {
    errorMsg.value = 'Introduce el token de administrador'
    return
  }

  adminStore.login(token)
  emit('close')
}
</script>

<template>
  <BaseModal title="🔐 Acceso admin" @close="emit('close')">
    <form class="login-form" @submit.prevent="handleLogin">

      <div class="field">
        <label for="admin-token">Token de administrador</label>
        <input
          id="admin-token"
          v-model="tokenInput"
          type="password"
          placeholder="••••••••••••"
          autocomplete="current-password"
          autofocus
        />
        <span v-if="errorMsg" class="error-msg">{{ errorMsg }}</span>
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
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  gap: var(--space-4);
}
.error-msg {
  font-size: 0.8rem;
  color: var(--color-danger);
}
.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
}
</style>

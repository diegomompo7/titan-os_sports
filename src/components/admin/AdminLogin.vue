<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/admin/AdminLogin.vue
   ¿QUÉ ES ESTO?
   La ventana de login para el administrador. Cuando el admin quiere acceder
   al panel de gestión de canales, introduce aquí su token secreto.

   Un "token" es como una contraseña especial de un solo uso (o de larga
   duración). No hay usuarios registrados — simplemente hay un token correcto
   (configurado en el servidor) y quien lo conozca es admin.

   Si el token es correcto, se guarda en la sesión del navegador y el
   usuario pasa a ser admin hasta que cierre la pestaña/app.
============================================================================= */
import { ref } from 'vue'
import { useAdminStore } from '@/stores/admin'
import BaseModal from '@/components/ui/BaseModal.vue'

// Evento que emite para decirle al padre que cierre esta ventana
const emit = defineEmits<{ close: [] }>()

// El store de admin — gestiona si el usuario es administrador
const adminStore = useAdminStore()

// Lo que el usuario está escribiendo en el campo de contraseña
const tokenInput = ref('')

// Mensaje de error si el campo está vacío al pulsar "Entrar"
const errorMsg = ref('')

// Se ejecuta cuando el usuario pulsa "Entrar" o hace submit del formulario
function handleLogin() {
  const token = tokenInput.value.trim()  // Quitar espacios al inicio/fin

  // Validar que no está vacío
  if (!token) { errorMsg.value = 'Introduce el token de administrador'; return }

  // Guardar el token en el store (y en sessionStorage para que persista al refrescar)
  // Nota: el servidor verificará si el token es correcto en cada petición.
  // Este login es "optimista" — asumimos que el token es correcto y si no,
  // el servidor rechazará las peticiones admin con error 401.
  adminStore.login(token)
  emit('close')  // Cerrar el modal
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
  padding: var(--space-5);
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

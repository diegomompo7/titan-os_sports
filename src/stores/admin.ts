/* =============================================================================
   FICHERO: src/stores/admin.ts
   ¿QUÉ ES ESTO?
   Gestiona si el usuario actual es administrador o no.
   En la app hay dos tipos de usuario:
   - Usuario normal: solo puede ver canales
   - Administrador: puede añadir, editar y borrar canales

   Para ser admin se necesita introducir un token secreto (como una contraseña).
   Este store recuerda si ya se ha introducido ese token durante la sesión.

   Analogía: es como la llave maestra de un edificio. Una vez que el conserje
   comprueba que tienes la llave buena, te da acceso al panel de control. Este
   store es quien guarda si tienes o no esa llave maestra.
============================================================================= */

import { ref, computed } from 'vue'
import { defineStore }   from 'pinia'

// Clave usada para guardar el token en la memoria del navegador.
// sessionStorage es como localStorage pero se borra al cerrar el navegador/pestaña.
// Así el admin no tiene que volver a hacer login si refresca la página,
// pero sí cuando cierra la app.
const STORAGE_KEY = 'titanos_admin_token'

export const useAdminStore = defineStore('admin', () => {
  // Al iniciar, intentamos recuperar el token de la sesión anterior.
  // Si no hay ninguno guardado, el token es una cadena vacía ''.
  const token = ref<string>(sessionStorage.getItem(STORAGE_KEY) ?? '')

  // isAdmin es true si hay un token (aunque sea de una sola letra).
  // computed: se recalcula automáticamente cada vez que cambia "token".
  const isAdmin = computed(() => token.value.length > 0)

  // Guarda el token tanto en memoria (para uso inmediato)
  // como en sessionStorage (para que sobreviva a un refresco de página)
  function login(t: string) {
    token.value = t
    sessionStorage.setItem(STORAGE_KEY, t)
  }

  // Borra el token de ambos sitios. El usuario vuelve a ser visitante normal.
  function logout() {
    token.value = ''
    sessionStorage.removeItem(STORAGE_KEY)
  }

  return { token, isAdmin, login, logout }
})

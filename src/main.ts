/* =============================================================================
   FICHERO: src/main.ts
   ¿QUÉ ES ESTO?
   Es el "botón de arranque" de toda la aplicación. Cuando el navegador o la TV
   carga la app, este fichero es lo primero que se ejecuta. Su único trabajo es
   montar la aplicación Vue en la página HTML.

   Analogía: imagina que la app es una tienda. Este fichero es el conserje que
   abre la puerta por la mañana, enciende las luces (Pinia) y coloca el cartel
   de "ABIERTO" (mount) en la ventana (#app).
============================================================================= */

// createApp: función que crea la aplicación Vue (el "motor" de la interfaz)
import { createApp } from 'vue'

// createPinia: crea el sistema de memoria compartida entre componentes.
// Pinia es como una pizarra central donde todos los componentes pueden
// leer y escribir datos sin tener que pasárselos de uno en uno.
import { createPinia } from 'pinia'

// El componente raíz — el primer "ladrillo" de la interfaz visual
import App from './App.vue'

// Estilos globales CSS: variables de color, tipografía, reset del navegador, etc.
import './assets/base.css'

// Crear la app, añadir Pinia (la memoria compartida) y mostrarla
// en el elemento HTML con id="app" (está en index.html)
createApp(App).use(createPinia()).mount('#app')

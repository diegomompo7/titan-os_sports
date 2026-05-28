/* =============================================================================
   FICHERO: src/composables/useGamepad.ts
   ¿QUÉ ES ESTO?
   Permite navegar por la app con un mando de videojuego o gamepad
   (también funciona con las flechas del teclado en la TV).

   Detecta cuándo el usuario pulsa los botones del D-pad (las flechas del
   mando) y llama a las funciones correspondientes: ir arriba, abajo,
   izquierda, derecha, seleccionar o volver atrás.

   También implementa "repetición automática": si mantienes pulsado el D-pad
   hacia abajo, el cursor sigue moviéndose solo — como en un teclado de PC.

   Analogía: es como el módulo de un juego que escucha el mando. Cuando
   el jugador mueve el stick o pulsa un botón, este módulo lo traduce a
   acciones concretas del juego (mover personaje, saltar, etc.).
============================================================================= */

import { onMounted, onUnmounted } from 'vue'

// Tiempo que hay que mantener pulsado antes de que empiece la repetición automática
const REPEAT_DELAY = 400  // ms (0,4 segundos)
// Velocidad de repetición una vez que ha empezado
const REPEAT_RATE  = 150  // ms entre cada repetición (unos 6-7 pasos por segundo)

/*
 * useGamepad recibe un objeto con las 6 funciones a llamar según qué botón se pulse.
 * El componente que lo usa decide qué hace cada botón (navegar el grid, cerrar modal…)
 */
export function useGamepad(handlers: {
  onUp:     () => void  // D-pad arriba
  onDown:   () => void  // D-pad abajo
  onLeft:   () => void  // D-pad izquierda
  onRight:  () => void  // D-pad derecha
  onSelect: () => void  // Botón A (confirmar/seleccionar)
  onBack:   () => void  // Botón B (cancelar/volver)
}) {
  /*
   * Mapa estándar de botones del Gamepad API.
   * El estándar W3C define estos índices para gamepads "estándar":
   *   0 = A (confirmación)   1 = B (cancelar)
   *   12 = D-pad arriba      13 = D-pad abajo
   *   14 = D-pad izquierda   15 = D-pad derecha
   */
  const BUTTONS = [
    { index: 12, fn: handlers.onUp },
    { index: 13, fn: handlers.onDown },
    { index: 14, fn: handlers.onLeft },
    { index: 15, fn: handlers.onRight },
    { index: 0,  fn: handlers.onSelect },
    { index: 1,  fn: handlers.onBack },
  ]

  // Mapa de estado de cada botón pulsado.
  // Guarda cuándo se pulsó y cuándo fue la última repetición.
  type PressState = { pressedAt: number; lastRepeat: number }
  const state = new Map<number, PressState>()

  // ID del frame de animación (para poder cancelarlo al desmontar)
  let rafId = 0

  /*
   * Procesa la pulsación de un botón con soporte de repetición automática.
   * - Primera vez que se detecta → ejecuta la función inmediatamente
   * - Si lleva más de REPEAT_DELAY pulsado → empieza a repetir cada REPEAT_RATE
   */
  function fire(id: number, fn: () => void, now: number) {
    const prev = state.get(id)
    if (!prev) {
      // Primera pulsación — registrar y ejecutar
      state.set(id, { pressedAt: now, lastRepeat: now })
      fn()
    } else if (
      now - prev.pressedAt > REPEAT_DELAY &&   // ¿Lleva más de 400ms pulsado?
      now - prev.lastRepeat > REPEAT_RATE       // ¿Han pasado más de 150ms desde la última repetición?
    ) {
      prev.lastRepeat = now  // Actualizar el tiempo de última repetición
      fn()                   // Ejecutar de nuevo
    }
  }

  /*
   * Bucle de lectura del gamepad. Se ejecuta en cada frame (60 veces por segundo).
   * requestAnimationFrame garantiza que la lectura esté sincronizada con la pantalla.
   *
   * Nota: la Gamepad API es de "polling" — no hay eventos, hay que preguntar
   * continuamente si algo ha cambiado. Por eso usamos un bucle de animación.
   */
  function poll() {
    // Obtener el estado actual de todos los gamepads conectados
    const gamepads = navigator.getGamepads?.() ?? []
    const now = performance.now()  // Tiempo actual en milisegundos de alta precisión

    for (const gp of gamepads) {
      if (!gp) continue  // Slot vacío — no hay mando en esta posición

      // ── Leer D-pad y botones A/B ──────────────────────────────────────────
      for (const { index, fn } of BUTTONS) {
        const pressed = gp.buttons[index]?.pressed ?? false
        if (pressed) {
          fire(index, fn, now)  // Botón pulsado: procesar con repetición
        } else {
          state.delete(index)   // Botón suelto: eliminar del mapa de estado
        }
      }

      // ── Leer stick analógico izquierdo ────────────────────────────────────
      // Los ejes devuelven valores entre -1 y 1:
      //   ax < 0 = izquierda,  ax > 0 = derecha
      //   ay < 0 = arriba,     ay > 0 = abajo
      const ax = gp.axes[0] ?? 0
      const ay = gp.axes[1] ?? 0
      const DEAD = 0.5  // Zona muerta: ignorar movimientos pequeños (ruido del stick)

      // Usamos IDs 100-103 para el stick (distintos a los del D-pad)
      // así el D-pad y el stick pueden funcionar de forma independiente
      const stickMap: Array<[number, boolean, () => void]> = [
        [100, ay < -DEAD, handlers.onUp],
        [101, ay >  DEAD, handlers.onDown],
        [102, ax < -DEAD, handlers.onLeft],
        [103, ax >  DEAD, handlers.onRight],
      ]

      for (const [id, active, fn] of stickMap) {
        if (active) {
          fire(id, fn, now)
        } else {
          state.delete(id)
        }
      }
    }

    // Programar la siguiente lectura en el próximo frame
    rafId = requestAnimationFrame(poll)
  }

  // Cuando el componente que usa este composable se monta en la pantalla,
  // comenzamos el bucle de lectura del mando (si el navegador lo soporta)
  onMounted(() => {
    if (typeof navigator.getGamepads === 'function') {
      rafId = requestAnimationFrame(poll)
    }
  })

  // Cuando el componente se desmonta (deja de mostrarse),
  // cancelamos el bucle para no desperdiciar recursos
  onUnmounted(() => cancelAnimationFrame(rafId))
}

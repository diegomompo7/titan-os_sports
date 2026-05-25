import { onMounted, onUnmounted } from 'vue'

const REPEAT_DELAY = 400  // ms antes de empezar a repetir
const REPEAT_RATE  = 150  // ms entre repeticiones al mantener

export function useGamepad(handlers: {
  onUp:     () => void
  onDown:   () => void
  onLeft:   () => void
  onRight:  () => void
  onSelect: () => void
  onBack:   () => void
}) {
  // Standard Gamepad mapping:
  // 0=A(confirm)  1=B(back)  12=D-up  13=D-down  14=D-left  15=D-right
  const BUTTONS = [
    { index: 12, fn: handlers.onUp },
    { index: 13, fn: handlers.onDown },
    { index: 14, fn: handlers.onLeft },
    { index: 15, fn: handlers.onRight },
    { index: 0,  fn: handlers.onSelect },
    { index: 1,  fn: handlers.onBack },
  ]

  type PressState = { pressedAt: number; lastRepeat: number }
  const state = new Map<number, PressState>()

  let rafId = 0

  function fire(id: number, fn: () => void, now: number) {
    const prev = state.get(id)
    if (!prev) {
      state.set(id, { pressedAt: now, lastRepeat: now })
      fn()
    } else if (
      now - prev.pressedAt > REPEAT_DELAY &&
      now - prev.lastRepeat > REPEAT_RATE
    ) {
      prev.lastRepeat = now
      fn()
    }
  }

  function poll() {
    const gamepads = navigator.getGamepads?.() ?? []
    const now = performance.now()

    for (const gp of gamepads) {
      if (!gp) continue

      // ── Botones D-pad y A/B ──────────────────────────────────────────
      for (const { index, fn } of BUTTONS) {
        const pressed = gp.buttons[index]?.pressed ?? false
        if (pressed) {
          fire(index, fn, now)
        } else {
          state.delete(index)
        }
      }

      // ── Stick izquierdo ──────────────────────────────────────────────
      const ax = gp.axes[0] ?? 0
      const ay = gp.axes[1] ?? 0
      const DEAD = 0.5

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

    rafId = requestAnimationFrame(poll)
  }

  onMounted(() => {
    if (typeof navigator.getGamepads === 'function') {
      rafId = requestAnimationFrame(poll)
    }
  })
  onUnmounted(() => cancelAnimationFrame(rafId))
}

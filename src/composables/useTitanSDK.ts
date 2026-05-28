/* =============================================================================
   FICHERO: src/composables/useTitanSDK.ts
   ¿QUÉ ES ESTO?
   El "conector" con la televisión. Titan OS es el sistema operativo de la TV,
   y este fichero permite que la app web hable con las funciones nativas de la
   tele: abrir apps instaladas (YouTube, DAZN, Netflix…), leer información del
   dispositivo, etc.

   Analogía: es como el mando a distancia de la tele. Cuando pulsas el botón
   de Netflix en el mando, algo tiene que decirle a la tele "abre la app de
   Netflix". Este composable es esa "lógica" del mando.

   ¿Qué es un composable?
   Es una función reutilizable que se puede usar en cualquier componente Vue.
   En vez de copiar la misma lógica en 10 sitios distintos, la defines una vez
   aquí y cualquier componente puede importarla y usarla.

   MODO DESARROLLO:
   Cuando la app corre en el ordenador (no en la TV real), el SDK usa
   "fallbackToBrowser: true" para no fallar. Las apps no se abrirán realmente,
   pero el código no dará errores.
============================================================================= */

// El SDK oficial de Titan OS — es la librería que permite comunicarse con la TV
import { getTitanSDK } from '@titan-os/sdk'
import type { TitanSDK, DeviceInfo } from '@titan-os/sdk'

/* ── Singleton ─────────────────────────────────────────────────────────────
   El SDK se inicializa UNA SOLA VEZ cuando la app arranca.
   "Singleton" significa que aunque varios componentes usen este composable,
   todos comparten el mismo objeto SDK (no se crean copias).
   Es como tener un único mando para toda la casa — no uno por habitación.
*/
const sdk: TitanSDK = getTitanSDK({
  dev: import.meta.env.DEV,       // true si estamos en desarrollo (no en la TV)
  fallbackToBrowser: true,        // En desarrollo no falla aunque no haya TV real
})

// Extraemos el tipo del mapa de teclas del mando directamente del SDK
// (el SDK no lo exporta directamente, así que lo inferimos del método)
export type KeyCodesMap = ReturnType<TitanSDK['deviceInfo']['getKeyCodes']>
export type { DeviceInfo }

/* ── Composable ──────────────────────────────────────────────────────────── */
export function useTitanSDK() {

  /*
   * Lanza una aplicación nativa instalada en la Titan OS.
   * Ejemplos de uso:
   *   launchApp('youtube', 'https://youtu.be/abc')  → abre YouTube en ese vídeo
   *   launchApp('dazn',    'dazn://')               → abre la app DAZN en la pantalla de inicio
   *   launchApp('netflix', 'netflix://')            → abre Netflix
   *
   * Devuelve true si la app se abrió correctamente, false si falló.
   */
  async function launchApp(appId: string, deepLink: string): Promise<boolean> {
    // Esperamos a que el SDK esté listo antes de usarlo
    // (la TV puede tardar unos milisegundos en inicializarse)
    await sdk.isReady
    try {
      const launched = await sdk.apps.launch(appId, deepLink)
      if (!launched) console.warn(`[TitanSDK] No se pudo lanzar: ${appId}`)
      return launched
    } catch (err) {
      console.error(`[TitanSDK] Error al lanzar ${appId}:`, err)
      return false
    }
  }

  /*
   * Obtiene los códigos de las teclas del mando a distancia.
   * Cada fabricante de TV puede usar códigos distintos para las mismas teclas.
   * El SDK normaliza estas diferencias y devuelve un mapa unificado.
   * Útil para saber: "cuando el usuario pulse ←, ¿qué número llega?"
   */
  function getKeyCodes(): KeyCodesMap {
    return sdk.deviceInfo.getKeyCodes()
  }

  /*
   * Obtiene información técnica del dispositivo:
   * - Modelo de la TV y versión de firmware
   * - Soporte DRM: Widevine (Google), PlayReady (Microsoft) — necesario para canales de pago
   * - Soporte HDR (imágenes con más detalle en luces y sombras)
   * - Resolución máxima (Full HD, 4K UHD)
   */
  async function getDeviceInfo(): Promise<DeviceInfo> {
    await sdk.isReady
    return sdk.deviceInfo.getDeviceInfo()
  }

  /*
   * Pasa una fuente (URL o deep link) al reproductor nativo de Titan OS.
   * En lugar de abrir una app externa, el reproductor del sistema gestiona
   * la autenticación, el DRM y la reproducción, mostrando el contenido
   * dentro del contexto de TitanOS Sports.
   *
   * Ejemplos de uso:
   *   playerSetSource('dazn://play/event/123')   → DAZN reproduce ese evento
   *   playerSetSource('netflix://title/81234')   → Netflix reproduce ese título
   */
  async function playerSetSource(url: string): Promise<void> {
    await sdk.isReady
    try {
      await (sdk as any).player.setSource(url)
    } catch (err) {
      console.error('[TitanSDK] Error al pasar fuente al player:', err)
    }
  }

  /*
   * Detiene la reproducción del reproductor nativo de Titan OS.
   * Se llama cuando el usuario cierra el canal o navega hacia atrás,
   * para liberar los recursos y detener el stream.
   */
  async function playerStop(): Promise<void> {
    await sdk.isReady
    try {
      await (sdk as any).player.stop()
    } catch (err) {
      console.error('[TitanSDK] Error al detener el player:', err)
    }
  }

  // Exponemos el SDK completo además de las funciones específicas,
  // por si algún componente necesita acceso directo a algo no cubierto aquí
  return { sdk, launchApp, playerSetSource, playerStop, getKeyCodes, getDeviceInfo }
}

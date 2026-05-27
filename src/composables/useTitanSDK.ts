/**
 * useTitanSDK — Composable singleton para el SDK oficial de Titan OS.
 *
 * Inicializa el SDK una sola vez y expone:
 *   - launchApp(appId, deepLink) → abre una app nativa de la TV
 *   - getKeyCodes()              → map de teclas del mando (TPV / VESTEL)
 *   - getDeviceInfo()            → info del dispositivo (DRM, UHD, HDR…)
 *
 * Ejemplos de uso:
 *   launchApp('youtube',  'https://youtu.be/dQw4w9WgXcQ')
 *   launchApp('dazn',     'dazn://')
 *   launchApp('netflix',  'netflix://')
 */
import { getTitanSDK } from '@titan-os/sdk'
import type { TitanSDK, DeviceInfo } from '@titan-os/sdk'

// ── Singleton ────────────────────────────────────────────────────────────────
const sdk: TitanSDK = getTitanSDK({
  dev:               import.meta.env.DEV,
  fallbackToBrowser: true,   // En desarrollo (PC) no falla
})

// KeyCodesMap no es exportado por el SDK — se infiere desde el método
export type KeyCodesMap = ReturnType<TitanSDK['deviceInfo']['getKeyCodes']>
export type { DeviceInfo }

// ── Composable ───────────────────────────────────────────────────────────────
export function useTitanSDK() {

  /**
   * Lanza una app nativa de Titan OS.
   *
   * @param appId    Identificador de la app: 'youtube', 'dazn', 'netflix'…
   * @param deepLink URL completa o deep link URI:
   *                   'https://youtu.be/abc'  → abre YouTube en ese vídeo
   *                   'dazn://'               → abre DAZN en inicio
   */
  async function launchApp(appId: string, deepLink: string): Promise<boolean> {
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

  /**
   * Obtiene los key codes del mando para esta plataforma.
   * TPV y VESTEL pueden diferir — el SDK los normaliza.
   */
  function getKeyCodes(): KeyCodesMap {
    return sdk.deviceInfo.getKeyCodes()
  }

  /**
   * Obtiene información completa del dispositivo:
   * modelo, firmware, DRM (Widevine, PlayReady), HDR, UHD…
   */
  async function getDeviceInfo(): Promise<DeviceInfo> {
    await sdk.isReady
    return sdk.deviceInfo.getDeviceInfo()
  }

  return { sdk, launchApp, getKeyCodes, getDeviceInfo }
}

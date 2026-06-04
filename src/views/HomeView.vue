<script setup lang="ts">
/* =============================================================================
   FICHERO: src/views/HomeView.vue
   ¿QUÉ ES ESTO?
   La pantalla principal de TitanOS Sports — el punto de entrada para el usuario.
   Es el "director de orquesta" que coordina todos los demás componentes.

   Piénsalo como el menú principal de un televisor moderno: muestra la guía de
   canales, responde a los botones del mando, y lanza el reproductor adecuado
   según qué canal elija el usuario.

   Esta vista tiene tres MODOS que el usuario puede activar desde la barra superior:

   1. MODO NORMAL (por defecto)
      - Cuadrícula de canales a pantalla completa con filtros
      - Al seleccionar un canal → PlayerModal cubre toda la pantalla
      - Al pasar el ratón/D-pad sobre un canal → ChannelPreview aparece abajo-derecha

   2. MODO TEATRO (🎬 Teatro)
      - La pantalla se divide: sidebar de canales a la izquierda + reproductor a la derecha
      - El reproductor no tapa la lista; el usuario puede cambiar de canal sin salir
      - Como el modo "Picture with Guide" de las TVs Samsung

   3. MODO MULTI (⊞ Multi)
      - Igual que Teatro pero el área derecha es MultiStreamView
      - El usuario puede "añadir" múltiples canales que se reproducen en paralelo
      - Útil para seguir varios partidos a la vez

   También contiene todos los modales (AdminLogin, ChannelForm, EventsPanel),
   la lógica de notificaciones push para cuando un canal empieza en directo,
   y el deeplink (?canal=ESPN) para abrir un canal directamente desde una URL.
============================================================================= */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { Channel, ChannelFormData } from '@/types/channel'
import { useChannelsStore }   from '@/stores/channels'
import { useAdminStore }      from '@/stores/admin'
import { useLiveStatusStore } from '@/stores/liveStatus'
import { useEventsStore }     from '@/stores/events'
import { useHistoryStore }    from '@/stores/history'
import { useAdsStore }        from '@/stores/ads'
import type { Ad }            from '@/stores/ads'
import { useTitanSDK }        from '@/composables/useTitanSDK'

import ChannelGrid     from '@/components/channels/ChannelGrid.vue'
import ChannelForm     from '@/components/channels/ChannelForm.vue'
import PlayerModal     from '@/components/player/PlayerModal.vue'
import ChannelPreview  from '@/components/player/ChannelPreview.vue'
import AdPlayer        from '@/components/player/AdPlayer.vue'
import VideoPlayer     from '@/components/player/VideoPlayer.vue'
import MultiStreamView from '@/components/player/MultiStreamView.vue'
import AdminLogin      from '@/components/admin/AdminLogin.vue'
import EventsPanel     from '@/components/admin/EventsPanel.vue'
import AdsPanel        from '@/components/admin/AdsPanel.vue'
import BaseModal       from '@/components/ui/BaseModal.vue'

// ── Stores (datos compartidos con toda la app) ────────────────────────────────
const channelsStore   = useChannelsStore()   // Lista de canales + fetch/add/edit/delete
const adminStore      = useAdminStore()      // Token de admin + isAdmin flag
const liveStatusStore = useLiveStatusStore() // Qué canales están en directo ahora
const eventsStore     = useEventsStore()     // Eventos deportivos programados
const historyStore    = useHistoryStore()    // Canales vistos recientemente
const adsStore        = useAdsStore()        // Anuncios de inicio

// Ref al ChannelGrid del modo normal para poder llamar moveFocus/selectFocused
const channelGridRef = ref<InstanceType<typeof ChannelGrid> | null>(null)

// Foco D-pad en el header: -1 = sin foco, 0 = Teatro, 1 = Multi
const headerFocusIdx = ref(-1)

// ── Navegación D-pad Modo Teatro ─────────────────────────────────────────────
const theatreGridRef    = ref<InstanceType<typeof ChannelGrid> | null>(null)
const theatrePlayerRef  = ref<HTMLElement | null>(null)
const theatreZone       = ref<'sidebar' | 'live' | 'cerrar' | 'controls'>('sidebar')
const theatreShowCtrl   = ref(false)
const theatreCtrlIdx    = ref(0)
const theatreIsPlaying  = ref(true)
const theatreIsMuted    = ref(false)
const theatreCanCtrl    = computed(() => activeChannel.value?.streamType === 'hls')

// ── Estado de la interfaz (qué está visible ahora mismo) ─────────────────────
const activeChannel   = ref<Channel | null>(null)  // Canal en reproducción (PlayerModal o Teatro)
const editingChannel  = ref<Channel | null>(null)  // Canal que el admin está editando
const showAddForm     = ref(false)     // ¿Está visible el formulario "Añadir canal"?
const showAdminLogin  = ref(false)     // ¿Está visible la ventana de login admin?
const showEventsPanel = ref(false)     // ¿Está visible el panel de eventos?
const showAdsPanel    = ref(false)     // ¿Está visible el panel de anuncios?
const formLoading     = ref(false)     // ¿Está guardando el formulario ahora? (spinner)

// ── Fase de anuncio inicial ───────────────────────────────────────────────────
// 'loading' → cargando ads del servidor
// 'playing' → reproduciendo el ad inicial, hover suprimido
// 'done'    → ad terminado, hover activo
const adsPhase  = ref<'loading' | 'playing' | 'done'>('loading')
const currentAd = ref<Ad | null>(null)

// ── Modos de visualización ────────────────────────────────────────────────────
const isMultiMode    = ref(false)         // Modo multi-stream activo
const isTheatreMode  = ref(false)         // Modo teatro activo
const pinnedChannels = ref<Channel[]>([]) // Canales añadidos al modo multi-stream


// ── Canal bajo el ratón o D-pad para el preview ───────────────────────────────
// Cuando el usuario pasa por encima de una tarjeta (sin hacer clic), guardamos
// aquí el canal para que ChannelPreview lo muestre en la esquina.
const previewChannel = ref<Channel | null>(null)

// ── Funciones de cambio de modo ───────────────────────────────────────────────

// Activar modo multi: solo puede estar activo uno de los dos modos especiales
function activateMultiMode()   { isMultiMode.value = true;  isTheatreMode.value = false }
// Desactivar multi: limpiar también los canales "clavados" en la pantalla dividida
function deactivateMultiMode() { isMultiMode.value = false; pinnedChannels.value = [] }

// Activar teatro: cancela el multi y limpia los canales fijados
function activateTheatreMode() {
  isTheatreMode.value = true
  isMultiMode.value = false
  pinnedChannels.value = []
  theatreZone.value = 'sidebar'
  theatreShowCtrl.value = false
}
// Desactivar teatro: también cierra el reproductor que estuviera activo
function deactivateTheatreMode() { isTheatreMode.value = false; closeActiveChannel() }

// Quita un canal concreto del modo multi-stream (cuando el usuario pulsa ✕ en un slot)
function removePinnedChannel(id: string) {
  pinnedChannels.value = pinnedChannels.value.filter((c) => c.id !== id)
}

// Cierra el canal activo
function closeActiveChannel() {
  activeChannel.value = null
  if (isTheatreMode.value) { theatreZone.value = 'sidebar'; theatreShowCtrl.value = false }
}

// ── Handlers de navegación teatro ────────────────────────────────────────────
function handleTheatreReachTop()  { headerFocusIdx.value = 0 }
function handleTheatreReachRight() { if (activeChannel.value) theatreZone.value = 'live' }

function execTheatreControl(idx: number) {
  const v = document.querySelector<HTMLVideoElement>('.player-wrap video')
  if (idx === 0 && v) { v.paused ? v.play() : v.pause(); theatreIsPlaying.value = !v.paused }
  if (idx === 1 && v) { v.muted = !v.muted; theatreIsMuted.value = v.muted }
  if (idx === 2) {
    document.fullscreenElement
      ? document.exitFullscreen()
      : theatrePlayerRef.value?.requestFullscreen()
  }
}

// Manejador de teclas: M (mute), F (fullscreen), Escape/Backspace (cerrar/salir)
function handleKeydown(e: KeyboardEvent) {
  const tag = (e.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return
  switch (e.key) {
    case 'Escape':
    case 'Backspace':
      e.preventDefault()
      if (headerFocusIdx.value >= 0) { headerFocusIdx.value = -1; break }
      if (isTheatreMode.value) {
        if (theatreZone.value === 'live' || theatreZone.value === 'cerrar' || theatreZone.value === 'controls') {
          closeActiveChannel()
        } else {
          deactivateTheatreMode()
        }
        break
      }
      if (activeChannel.value && !isTheatreMode.value) closeActiveChannel()
      else if (isMultiMode.value) deactivateMultiMode()
      break
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight': {
      if ((activeChannel.value && !isTheatreMode.value) || isMultiMode.value) break
      e.preventDefault()
      const dir = e.key.replace('Arrow', '').toLowerCase() as 'up' | 'down' | 'left' | 'right'
      if (isTheatreMode.value) {
        if (headerFocusIdx.value >= 0) {
          if (dir === 'left')  headerFocusIdx.value = Math.max(0, headerFocusIdx.value - 1)
          if (dir === 'right') headerFocusIdx.value = Math.min(1, headerFocusIdx.value + 1)
          if (dir === 'down')  { headerFocusIdx.value = -1; theatreGridRef.value?.focusSidebarSearch() }
        } else {
          switch (theatreZone.value) {
            case 'sidebar':
              theatreGridRef.value?.moveFocus(dir)
              break
            case 'live':
              if (dir === 'up')   theatreZone.value = 'cerrar'
              if (dir === 'left') { theatreZone.value = 'sidebar'; theatreGridRef.value?.resetFocusToGrid() }
              if (dir === 'down' && theatreCanCtrl.value) { theatreZone.value = 'controls'; theatreShowCtrl.value = true; theatreCtrlIdx.value = 0 }
              break
            case 'cerrar':
              if (dir === 'down') theatreZone.value = 'live'
              break
            case 'controls':
              if (dir === 'up' || dir === 'down') { theatreZone.value = 'live'; theatreShowCtrl.value = false }
              if (dir === 'left')  theatreCtrlIdx.value = Math.max(0, theatreCtrlIdx.value - 1)
              if (dir === 'right') theatreCtrlIdx.value = Math.min(2, theatreCtrlIdx.value + 1)
              break
          }
        }
      } else {
        if (headerFocusIdx.value >= 0) {
          if (dir === 'left')  headerFocusIdx.value = Math.max(0, headerFocusIdx.value - 1)
          if (dir === 'right') headerFocusIdx.value = Math.min(1, headerFocusIdx.value + 1)
          if (dir === 'down')  { headerFocusIdx.value = -1; channelGridRef.value?.focusFilterbar() }
        } else {
          channelGridRef.value?.moveFocus(dir)
        }
      }
      break
    }
    case 'Enter': {
      if ((activeChannel.value && !isTheatreMode.value) || isMultiMode.value) break
      e.preventDefault()
      if (headerFocusIdx.value >= 0) {
        if (headerFocusIdx.value === 0)
          isTheatreMode.value ? deactivateTheatreMode() : activateTheatreMode()
        else
          isMultiMode.value ? deactivateMultiMode() : activateMultiMode()
        headerFocusIdx.value = -1
      } else if (isTheatreMode.value) {
        switch (theatreZone.value) {
          case 'sidebar':  theatreGridRef.value?.selectFocused(); break
          case 'cerrar':   closeActiveChannel(); break
          case 'controls': execTheatreControl(theatreCtrlIdx.value); break
        }
      } else {
        channelGridRef.value?.selectFocused()
      }
      break
    }
  }
}

// ── Notificaciones push ───────────────────────────────────────────────────────
// Cuando un canal pasa de "no en directo" a "en directo", enviamos una notificación
// del sistema al usuario (como las notificaciones de WhatsApp).
// previousLive guarda el estado anterior para comparar y detectar el cambio.
const previousLive = ref<Record<string, boolean>>({})

watch(
  // Vigilamos una COPIA del objeto statuses (con {...}) para que el watch detecte cambios
  () => ({ ...liveStatusStore.statuses }),
  (current) => {
    // Si el navegador no soporta notificaciones o el usuario no las ha permitido → salir
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return

    // Recorrer todos los canales y detectar cuáles pasaron de "offline" a "en directo"
    for (const [id, isLive] of Object.entries(current)) {
      if (isLive && !previousLive.value[id]) {
        // Este canal acaba de empezar a emitir → lanzar notificación
        const ch = channelsStore.channels.find((c) => c.id === id)
        if (ch) new Notification(`${ch.name} está en directo`, {
          icon: ch.logoUrl ?? undefined,
          body: 'Pulsa OK para ver el canal',
          tag:  `live-${id}`,  // Evita duplicar la notificación si el canal ya la emitió
        })
      }
    }
    previousLive.value = current  // Guardar el estado actual para la próxima comparación
  },
  { deep: true }  // deep:true necesario para detectar cambios dentro del objeto
)

// ── Ciclo de vida del componente ──────────────────────────────────────────────
// Variable donde guardamos el ID del intervalo para poder cancelarlo al desmontar
let liveInterval: ReturnType<typeof setInterval> | null = null

function handleAdDone() {
  adsPhase.value  = 'done'
  currentAd.value = null
}

onMounted(async () => {
  // 1. Descargar la lista de canales del servidor (esperamos a que termine)
  await channelsStore.fetchChannels()

  // 1b. Cargar anuncios y seleccionar uno al azar para el inicio
  await adsStore.fetchAds()
  const picked = adsStore.pickRandomAd()
  if (picked) {
    currentAd.value = picked
    adsPhase.value  = 'playing'
  } else {
    adsPhase.value = 'done'
  }

  // 2. Consultar qué canales están en directo ahora mismo
  liveStatusStore.fetchStatuses()

  // 3. Cargar los eventos deportivos programados
  eventsStore.fetchEvents()

  // 4. Actualizar el estado en directo cada 30 segundos automáticamente
  //    30_000 = 30 segundos en milisegundos (los _ son separadores visuales en JS)
  liveInterval = setInterval(() => liveStatusStore.fetchStatuses(), 30_000)

  // 5. Pedir permiso para notificaciones (esperar 5s para no asustar al usuario
  //    con el diálogo del navegador nada más entrar a la web)
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 5_000)
  }

  // 6. Registrar el listener de teclado en toda la ventana
  window.addEventListener('keydown', handleKeydown)

  // 7. Soporte de deeplink: ?canal=ESPN en la URL abre ese canal automáticamente
  //    Útil para lanzadores de TV que incluyen una URL predefinida por canal.
  const params = new URLSearchParams(window.location.search)
  const nom    = params.get('canal')  // ej: "ESPN", "La Liga", "Marca TV"
  if (nom) {
    // Normalizar el nombre: ignorar mayúsculas y espacios para la comparación
    // "la liga tv" === "LaLigaTv" → norm("La Liga TV") = "laliga tv" → norm los dos = "laligat v"
    const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '')
    const ch   = channelsStore.channels.find((c) => norm(c.name) === norm(nom))
    if (ch) openChannel(ch)  // Si existe, abrirlo directamente
  }
})

// Al desmontar el componente (al cerrar la app), limpiar los recursos:
// cancelar el intervalo de actualización y retirar el listener de teclado
onUnmounted(() => {
  if (liveInterval) clearInterval(liveInterval)
  window.removeEventListener('keydown', handleKeydown)
})

// ── SDK de Titan OS para lanzar apps nativas ─────────────────────────────────
// launchApp → abre una app instalada en el televisor (YouTube nativo)
// El player nativo para titanapp lo gestiona VideoPlayer.vue directamente.
const { launchApp } = useTitanSDK()

// ── Utilidades para detectar y normalizar URLs de YouTube ────────────────────

// ¿Es esta URL de YouTube? Cubre los tres formatos posibles:
//   https://www.youtube.com/...   (URL normal)
//   https://youtu.be/...          (URL corta)
//   youtube://...                 (Deep link de la app)
function isYoutubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be') || url.startsWith('youtube://')
}

// Convierte el deep link youtube:// en una URL https normal.
// Necesario porque el iframe de YouTube solo acepta URLs https.
// Ejemplo: "youtube://watch?v=abc" → "https://www.youtube.com/watch?v=abc"
function normalizeYoutubeUrl(url: string): string {
  if (url.startsWith('youtube://')) {
    return 'https://www.youtube.com/' + url.slice('youtube://'.length)
  }
  return url
}

// ── Acción principal: abrir un canal ─────────────────────────────────────────
// Se llama cuando el usuario hace clic en una tarjeta o pulsa Enter en el D-pad.
// Decide qué hacer según el tipo de stream del canal.
function openChannel(ch: Channel) {
  previewChannel.value = null  // Cerrar el preview antes de abrir el canal completo

  // Canal web (DAZN, Movistar+...): abrir en el navegador externo
  if (ch.streamType === 'web') {
    window.open(ch.url, '_blank', 'noopener,noreferrer')
    return
  }

  // Canal YouTube: usar el SDK de Titan OS para abrir la app nativa de YouTube
  // en el televisor, que es la forma más fluida de ver YouTube en TV con DRM.
  if (ch.streamType === 'youtube') {
    launchApp('youtube', ch.url)
    return
  }

  // Canal App nativa (titanapp): dos comportamientos posibles:
  //   a) URL de YouTube → reproducir embebido con iframe (sin salir de la app)
  //   b) Otros deep links (dazn://, netflix://...) → VideoPlayer llama setSource()+setRect()
  //      en onMounted; el player nativo queda posicionado sobre el área del PlayerModal.
  if (ch.streamType === 'titanapp') {
    if (isYoutubeUrl(ch.url)) {
      // YouTube embebido: cambiamos el tipo a 'youtube' con URL normalizada
      activeChannel.value = { ...ch, streamType: 'youtube', url: normalizeYoutubeUrl(ch.url) }
      historyStore.add(ch.id)
      return
    }
    // App nativa (DAZN, Netflix...): abrir PlayerModal; VideoPlayer gestiona el SDK player.
    activeChannel.value = ch
    historyStore.add(ch.id)
    return
  }

  // Canales HLS y Twitch: abrir el reproductor
  if (isMultiMode.value) {
    // En modo multi-stream: añadir el canal a la lista de canales simultáneos
    // Solo si no estaba ya añadido (evitar duplicados)
    if (!pinnedChannels.value.some((c) => c.id === ch.id))
      pinnedChannels.value = [...pinnedChannels.value, ch]
  } else {
    // En modo normal o teatro: reproducir este canal
    activeChannel.value = ch
  }
  historyStore.add(ch.id)  // Registrar en el historial de canales vistos
}

// ── Utilidad de mensajes de error ─────────────────────────────────────────────
// Extrae un mensaje legible de un error de red (Axios) o de JS genérico.
// Los errores de Axios tienen estructura { response: { status, data } }.
function getErr(error: unknown, fallback: string): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const r = (error as { response: { status: number; data?: { error?: string } } }).response
    return `Error ${r.status}${r.data?.error ? ': ' + r.data.error : ''}`
  }
  if (error instanceof Error) return error.message
  return fallback
}

// ── Handlers de formularios de admin ─────────────────────────────────────────

// Guarda un canal nuevo (llamado desde ChannelForm cuando el admin pulsa "Guardar")
async function handleAddChannel(fd: ChannelFormData) {
  formLoading.value = true
  try {
    await channelsStore.addChannel(fd, adminStore.token)
    showAddForm.value = false  // Cerrar el formulario al guardar con éxito
  } catch (e) {
    alert(getErr(e, 'Error al añadir'))
  } finally {
    formLoading.value = false
  }
}

// Guarda los cambios de un canal existente
async function handleEditChannel(fd: ChannelFormData) {
  if (!editingChannel.value) return  // Seguridad: no editar si no hay canal seleccionado
  formLoading.value = true
  try {
    await channelsStore.updateChannel(editingChannel.value.id, fd, adminStore.token)
    editingChannel.value = null  // Cerrar el formulario al guardar con éxito
  } catch (e) {
    alert(getErr(e, 'Error al actualizar'))
  } finally {
    formLoading.value = false
  }
}

// Elimina un canal tras pedir confirmación al administrador
async function handleDeleteChannel(ch: Channel) {
  // confirm() muestra un diálogo nativo del navegador. Si el admin cancela → salir.
  if (!confirm(`¿Eliminar "${ch.name}"?`)) return
  try {
    await channelsStore.removeChannel(ch.id, adminStore.token)
    // Si el canal eliminado estaba en reproducción → cerrar el reproductor
    if (activeChannel.value?.id === ch.id) closeActiveChannel()
  } catch (e) {
    alert(getErr(e, 'Error al eliminar'))
  }
}
</script>

<template>
  <!-- Contenedor raíz: ocupa toda la pantalla (100vw × 100vh) en columna vertical.
       Estructura: [Barra superior] + [Área principal] -->
  <div class="tv-layout">

    <!-- ══ BARRA SUPERIOR (header) ════════════════════════════════════════════
         Franja fija en la parte superior con: logo, botones de modo y admin.
         Visible en todos los modos. Altura definida en --header-height.
    ════════════════════════════════════════════════════════════════════════ -->
    <header class="tv-header">

      <!-- Logo de la app -->
      <span class="tv-logo">⚡ TitanOS Sports</span>

      <!-- Separador vertical decorativo -->
      <div class="header-sep" />

      <!-- Botones de modo: Teatro y Multi-stream.
           hdr-btn--active → fondo azul cuando ese modo está activo.
           El clic alterna entre activar/desactivar el modo (toggle). -->
      <nav class="header-group" aria-label="Modos">
        <button
          class="hdr-btn"
          :class="{ 'hdr-btn--active': isTheatreMode, 'hdr-btn--nav': headerFocusIdx === 0 }"
          @click="isTheatreMode ? deactivateTheatreMode() : activateTheatreMode()"
        >🎬 Teatro</button>

        <button
          class="hdr-btn"
          :class="{ 'hdr-btn--active': isMultiMode, 'hdr-btn--nav': headerFocusIdx === 1 }"
          @click="isMultiMode ? deactivateMultiMode() : activateMultiMode()"
        >⊞ Multi</button>
      </nav>

      <div class="header-sep" />

      <!-- Zona admin: si el usuario es admin muestra los botones de gestión;
           si no lo es, muestra solo el icono ⚙ para acceder al login. -->
      <nav class="header-group" aria-label="Admin">
        <!-- v-if="adminStore.isAdmin" → solo visible para administradores -->
        <template v-if="adminStore.isAdmin">
          <!-- Botón para abrir el formulario de añadir canal -->
          <button class="hdr-btn hdr-btn--accent" @click="showAddForm = true">+ Canal</button>
          <!-- Botón para abrir el panel de eventos deportivos -->
          <button class="hdr-btn" @click="showEventsPanel = true">📅 Eventos</button>
          <!-- Botón para gestionar los anuncios de inicio -->
          <button class="hdr-btn" @click="showAdsPanel = true">Anuncios</button>
          <!-- Botón de cierre de sesión admin (color acento como indicador de que está activo) -->
          <button class="hdr-btn hdr-btn--muted" @click="adminStore.logout()">✓ Admin</button>
        </template>
        <!-- Si no es admin: icono de engranaje para abrir la ventana de login -->
        <button v-else class="hdr-btn hdr-btn--icon" title="Acceso admin" @click="showAdminLogin = true">⚙</button>
      </nav>
    </header>

    <!-- ══ ÁREA PRINCIPAL: MODO TEATRO ═══════════════════════════════════════
         Solo visible cuando isTheatreMode=true.
         Estructura horizontal: [Sidebar canales] + [Área reproductor]
         El sidebar muestra el grid en columna única; el área derecha reproduce el canal activo.
    ════════════════════════════════════════════════════════════════════════ -->
    <main v-if="isTheatreMode" class="layout-theatre">
      <!-- Sidebar izquierdo con la lista de canales en modo compacto -->
      <aside class="theatre-sidebar">
        <ChannelGrid
          ref="theatreGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          sidebar-mode
          @select="openChannel"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDeleteChannel"
          @reach-top="handleTheatreReachTop"
          @reach-right="handleTheatreReachRight"
        />
      </aside>

      <!-- Área derecha: reproductor o pantalla de bienvenida -->
      <div
        ref="theatrePlayerRef"
        class="theatre-player"
        :class="{ 'theatre-player--nav': theatreZone === 'live' || theatreZone === 'controls' }"
      >
        <div v-if="!activeChannel" class="theatre-empty">
          <span class="empty-icon">🎬</span>
          <p class="empty-text">Selecciona un canal</p>
          <p class="empty-hint">Haz clic en un canal para reproducirlo</p>
        </div>
        <template v-else>
          <div class="theatre-bar">
            <span class="theatre-name">{{ activeChannel.name }}</span>
            <button
              class="theatre-close"
              :class="{ 'theatre-close--nav': theatreZone === 'cerrar' }"
              @click="closeActiveChannel()"
            >✕ Cerrar</button>
          </div>
          <VideoPlayer :channel="activeChannel" class="theatre-video" :hideNativeControls="theatreCanCtrl" />
          <Transition name="ctrl-fade">
            <div v-if="theatreShowCtrl" class="theatre-controls-bar">
              <button class="ctrl-icon-btn" :class="{ 'ctrl-icon-btn--focused': theatreCtrlIdx === 0 }" @click="execTheatreControl(0)">{{ theatreIsPlaying ? '⏸' : '▶' }}</button>
              <button class="ctrl-icon-btn" :class="{ 'ctrl-icon-btn--focused': theatreCtrlIdx === 1 }" @click="execTheatreControl(1)">{{ theatreIsMuted ? '🔊' : '🔇' }}</button>
              <button class="ctrl-icon-btn" :class="{ 'ctrl-icon-btn--focused': theatreCtrlIdx === 2 }" @click="execTheatreControl(2)">⛶</button>
            </div>
          </Transition>
        </template>
      </div>
    </main>

    <!-- ══ ÁREA PRINCIPAL: MODO MULTI-STREAM ═════════════════════════════════
         v-else-if → solo visible si isMultiMode=true Y no es Teatro.
         Estructura: [Sidebar canales] + [MultiStreamView]
         El usuario elige canales en el sidebar y se añaden a la vista de múltiple.
    ════════════════════════════════════════════════════════════════════════ -->
    <main v-else-if="isMultiMode" class="layout-multi">
      <!-- Sidebar para seleccionar canales que añadir al multi-stream -->
      <aside class="multi-sidebar">
        <ChannelGrid
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          sidebar-mode
          @select="openChannel"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDeleteChannel"
        />
      </aside>
      <MultiStreamView
        :channels="pinnedChannels"
        @remove="removePinnedChannel"
        @close="deactivateMultiMode"
      />
    </main>

    <!-- ══ ÁREA PRINCIPAL: MODO NORMAL ════════════════════════════════════════
         v-else → visible cuando ningún modo especial está activo.
         El grid ocupa toda la pantalla con sus 4 columnas y filtros.
         @preview → cuando el D-pad o el ratón está sobre una tarjeta, guardamos
                    el canal en previewChannel para mostrar el preview.
    ════════════════════════════════════════════════════════════════════════ -->
    <main v-else class="layout-normal">
      <ChannelGrid
        ref="channelGridRef"
        style="flex: 1; min-height: 0; overflow: hidden;"
        :channels="channelsStore.channels"
        :isAdmin="adminStore.isAdmin"
        :loading="channelsStore.loading"
        :error="channelsStore.error"
        :getLiveStatus="liveStatusStore.isLive"
        @select="openChannel"
        @edit="(ch) => (editingChannel = ch)"
        @delete="handleDeleteChannel"
        @preview="previewChannel = $event"
        @reach-top="headerFocusIdx = 0"
      />
      <!-- Sección promo: hover | ad/vídeo | banner -->
      <div class="promo-section">
        <div class="promo-hover">
          <ChannelPreview
            v-if="adsPhase === 'done' && previewChannel"
            :channel="previewChannel"
            @open="openChannel($event); previewChannel = null"
            @close="previewChannel = null"
          />
        </div>
        <div class="promo-video">
          <AdPlayer
            v-if="adsPhase === 'playing' && currentAd"
            :ad="currentAd"
            @done="handleAdDone"
          />
        </div>
        <div class="promo-banner"><!-- banner --></div>
      </div>
    </main>

    <!-- ══ CAPA DE MODALES ════════════════════════════════════════════════════
         Los modales se renderizan encima de todo el resto de la UI.
         Cada uno tiene su condición v-if para aparecer/desaparecer.
         (BaseModal usa Teleport para salir del árbol y aparecer al final del <body>)
    ════════════════════════════════════════════════════════════════════════ -->

    <!-- PlayerModal: reproductor en pantalla completa.
         Solo en modo normal (no en teatro, donde el reproductor está inline).
         Cierra al hacer clic en ✕ o pulsar Escape/Atrás. -->
    <PlayerModal
      v-if="activeChannel && !isTheatreMode"
      :channel="activeChannel"
      @close="closeActiveChannel()"
    />

    <!-- Modal: formulario para añadir un canal nuevo -->
    <BaseModal v-if="showAddForm" title="Añadir canal" @close="showAddForm = false">
      <ChannelForm :loading="formLoading" @submit="handleAddChannel" @cancel="showAddForm = false" />
    </BaseModal>

    <!-- Modal: formulario para editar un canal existente.
         :initial="editingChannel" pre-rellena el formulario con los datos actuales. -->
    <BaseModal v-if="editingChannel" title="Editar canal" @close="editingChannel = null">
      <ChannelForm
        :initial="editingChannel"
        :loading="formLoading"
        @submit="handleEditChannel"
        @cancel="editingChannel = null"
      />
    </BaseModal>

    <!-- Panel de eventos deportivos programados (admin) -->
    <EventsPanel v-if="showEventsPanel" @close="showEventsPanel = false" />

    <!-- Panel de anuncios de inicio (admin) -->
    <AdsPanel v-if="showAdsPanel" @close="showAdsPanel = false" />

    <!-- Ventana de login para el administrador -->
    <AdminLogin v-if="showAdminLogin" @close="showAdminLogin = false" />
  </div>
</template>

<style scoped>
/* ── Layout raíz ── */
.tv-layout {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--color-bg-base);
}

/* ══ HEADER ══════════════════════════════════════════════════════════════ */
.tv-header {
  height: var(--header-height);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-5);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}

/* Logo */
.tv-logo {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-accent);
  letter-spacing: 0.02em;
  white-space: nowrap;
  flex-shrink: 0;
}

/* Separador vertical */
.header-sep {
  width: 1px;
  height: 2rem;
  background: var(--color-border);
  flex-shrink: 0;
}

/* Grupos de botones */
.header-group {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-shrink: 0;
}

/* Botones del header — altura vh para escalar con la TV */
.hdr-btn {
  height: 6vh;
  padding: 0 var(--space-4);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-main);
  font-family: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s, border-color 0.15s, color 0.15s;
  outline: none;
}
.hdr-btn:hover,
.hdr-btn:focus-visible {
  background: var(--color-bg-elevated);
  border-color: var(--color-accent);
  box-shadow: var(--focus-ring);
}
.hdr-btn--nav { outline: 2px solid var(--color-accent); outline-offset: 2px; background: var(--color-bg-elevated); }
.hdr-btn--active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
  font-weight: 700;
}
.hdr-btn--accent {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: #000;
  font-weight: 700;
}
.hdr-btn--muted {
  color: var(--color-accent);
  border-color: rgba(0, 191, 255, 0.35);
}
.hdr-btn--icon {
  width: 6vh;
  padding: 0;
  font-size: 1.3rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ══ MODO NORMAL ══════════════════════════════════════════════════════════ */
.layout-normal {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.promo-section {
  flex-shrink: 0;
  display: grid;
  grid-template-columns: 1fr 1.5fr 1fr;
  gap: var(--grid-gap);
  padding: var(--grid-padding);
}

.promo-hover {
  border-radius: var(--radius-md);
  overflow: hidden;
}

.promo-video {
  aspect-ratio: 16 / 9;
  align-self: start;
  border-radius: var(--radius-md);
  overflow: hidden;
}

.promo-banner {
  background: #1a6e4a;
  border-radius: var(--radius-md);
}

/* ══ MODO TEATRO ══════════════════════════════════════════════════════════ */
.layout-theatre {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.theatre-sidebar {
  width: var(--sidebar-width);
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}

.theatre-player {
  flex: 1;
  min-width: 0;
  background: #000;
  display: flex;
  flex-direction: column;
  position: relative;
}

.theatre-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-4);
  color: var(--color-text-muted);
}
.empty-icon { font-size: 5rem; opacity: 0.15; }
.empty-text { font-size: 1.3rem; font-weight: 600; }
.empty-hint { font-size: 0.85rem; opacity: 0.55; }

.theatre-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-2) var(--space-4);
  background: rgba(0, 0, 0, 0.75);
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}
.theatre-name {
  font-size: 1.1rem;
  font-weight: 700;
  color: #fff;
}
.theatre-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.9rem;
  padding: var(--space-1) var(--space-3);
  border-radius: var(--radius-sm);
  transition: color 0.15s, background 0.15s;
  outline: none;
}
.theatre-close:hover,
.theatre-close--nav  { color: var(--color-danger); background: rgba(239, 68, 68, 0.12); outline: 2px solid var(--color-danger); outline-offset: 2px; }
.theatre-player--nav { outline: 2px solid var(--color-accent); outline-offset: -2px; }

.theatre-video :deep(.player-wrap) {
  border-radius: 0;
  aspect-ratio: unset;
  height: 100%;
}

/* ── Controles D-pad en modo teatro ── */
.theatre-controls-bar {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 1.2rem;
  background: linear-gradient(to top, rgba(0,0,0,0.85), transparent);
}
.ctrl-icon-btn {
  width: 3.5rem;
  height: 3.5rem;
  font-size: 1.5rem;
  background: rgba(255,255,255,0.12);
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 50%;
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.ctrl-icon-btn--focused { background: rgba(255,255,255,0.3); outline: 2px solid #fff; outline-offset: 2px; }
.ctrl-icon-btn:hover    { background: rgba(255,255,255,0.25); }
.ctrl-fade-enter-active,
.ctrl-fade-leave-active { transition: opacity 0.2s, transform 0.2s; }
.ctrl-fade-enter-from,
.ctrl-fade-leave-to     { opacity: 0; transform: translateY(0.5rem); }

/* ══ MODO MULTI ════════════════════════════════════════════════════════════ */
.layout-multi {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.multi-sidebar {
  width: calc(var(--sidebar-width) - 2vw);
  flex-shrink: 0;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
}
</style>

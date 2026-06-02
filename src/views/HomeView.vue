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
import { useGamepad }         from '@/composables/useGamepad'
import { useTitanSDK }        from '@/composables/useTitanSDK'

import ChannelGrid     from '@/components/channels/ChannelGrid.vue'
import ChannelForm     from '@/components/channels/ChannelForm.vue'
import PlayerModal     from '@/components/player/PlayerModal.vue'
import VideoPlayer     from '@/components/player/VideoPlayer.vue'
import MultiStreamView from '@/components/player/MultiStreamView.vue'
import AdminLogin      from '@/components/admin/AdminLogin.vue'
import EventsPanel     from '@/components/admin/EventsPanel.vue'
import BaseModal       from '@/components/ui/BaseModal.vue'

// ── Stores (datos compartidos con toda la app) ────────────────────────────────
const channelsStore   = useChannelsStore()   // Lista de canales + fetch/add/edit/delete
const adminStore      = useAdminStore()      // Token de admin + isAdmin flag
const liveStatusStore = useLiveStatusStore() // Qué canales están en directo ahora
const eventsStore     = useEventsStore()     // Eventos deportivos programados
const historyStore    = useHistoryStore()    // Canales vistos recientemente

// ── Estado de la interfaz (qué está visible ahora mismo) ─────────────────────
const activeChannel   = ref<Channel | null>(null)  // Canal en reproducción (PlayerModal o Teatro)
const editingChannel  = ref<Channel | null>(null)  // Canal que el admin está editando
const showAddForm     = ref(false)     // ¿Está visible el formulario "Añadir canal"?
const showAdminLogin  = ref(false)     // ¿Está visible la ventana de login admin?
const showEventsPanel = ref(false)     // ¿Está visible el panel de eventos?
const formLoading     = ref(false)     // ¿Está guardando el formulario ahora? (spinner)

// ── Modos de visualización ────────────────────────────────────────────────────
const isMultiMode    = ref(false)         // Modo multi-stream activo
const isTheatreMode  = ref(false)         // Modo teatro activo
const pinnedChannels = ref<Channel[]>([]) // Canales añadidos al modo multi-stream

// ── Referencia al componente ChannelGrid ─────────────────────────────────────
// Necesitamos esta referencia para llamar a moveFocus() y selectFocused()
// desde fuera del componente (cuando el mando D-pad envía eventos de navegación).
const channelGridRef = ref<InstanceType<typeof ChannelGrid> | null>(null)

// ── Canal bajo el ratón o D-pad para el preview ───────────────────────────────
// Cuando el usuario pasa por encima de una tarjeta (sin hacer clic), guardamos
// aquí el canal para que ChannelPreview lo muestre en la esquina.
const previewChannel = ref<Channel | null>(null)

// ── Funciones de cambio de modo ───────────────────────────────────────────────

// Activar modo multi: solo puede estar activo uno de los dos modos especiales
function activateMultiMode() {
  isMultiMode.value = true
  isTheatreMode.value = false
  closeActiveChannel()   // evita que PlayerModal aparezca sobre el multi-view
  navZone.value = 'main' // resetea zona para no heredar zonas teatro fantasma
}
// Desactivar multi: limpiar también los canales "clavados" en la pantalla dividida
function deactivateMultiMode() {
  isMultiMode.value = false
  pinnedChannels.value = []
  navZone.value = 'main'
}

// Activar teatro: cancela el multi y limpia los canales fijados
function activateTheatreMode() {
  isTheatreMode.value = true
  isMultiMode.value = false
  pinnedChannels.value = []
  navZone.value = 'main'
}
// Desactivar teatro: también cierra el reproductor que estuviera activo
function deactivateTheatreMode() {
  isTheatreMode.value = false
  closeActiveChannel()
  navZone.value = 'main'
}

// Quita un canal concreto del modo multi-stream (cuando el usuario pulsa ✕ en un slot)
function removePinnedChannel(id: string) {
  pinnedChannels.value = pinnedChannels.value.filter((c) => c.id !== id)
}

// ── Sistema de zonas de navegación ───────────────────────────────────────────
type NavZone = 'main' | 'header' | 'theatre-player' | 'theatre-controls'
             | 'multi-ms-header' | 'multi-streams'

const navZone      = ref<NavZone>('main')
const headerFocusIdx  = ref(0)   // 0=Teatro, 1=Multi
const msHeaderFocusIdx = ref(0)  // 0=Grid/Pro toggle, [1=Chat si existe], último=Salir

// PlayerModal activo: cede el control de flechas al modal
const isModalActive = computed(() => !!activeChannel.value && !isTheatreMode.value)

// Índice máximo de la cabecera multi (dinámico según si hay botón chat)
function getMsMaxHeaderIdx(): number {
  return multiStreamRef.value?.hasChatButton?.() ? 2 : 1
}

// Devuelve true si el elemento <video> nativo tiene el foco del navegador.
// En ese caso, los controles nativos del vídeo (Space, flechas, M, F) deben funcionar.
function isVideoFocused(): boolean {
  return document.activeElement?.tagName === 'VIDEO'
}

// Referencia al MultiStreamView para delegar navegación
const multiStreamRef = ref<InstanceType<typeof MultiStreamView> | null>(null)

// ChannelGrid emite reach-top cuando el D-pad no puede subir más
function onGridReachTop() {
  navZone.value = 'header'
  headerFocusIdx.value = 0
}

// ChannelGrid emite reach-right cuando el D-pad intenta salir por la derecha del sidebar
function onGridReachRight() {
  if (isTheatreMode.value && activeChannel.value) {
    navZone.value = 'theatre-player'
  } else if (isMultiMode.value) {
    navZone.value = 'multi-ms-header'
    msHeaderFocusIdx.value = 0
  }
}

function navigateUp() {
  if (isModalActive.value || isVideoFocused()) return
  if (navZone.value === 'header') return
  if (navZone.value === 'theatre-player') { navZone.value = 'main'; return }
  if (navZone.value === 'theatre-controls') { navZone.value = 'theatre-player'; return }
  if (navZone.value === 'multi-ms-header') { navZone.value = 'main'; return }
  if (navZone.value === 'multi-streams') {
    const atTop = multiStreamRef.value?.isAtTop?.()
    if (atTop) { navZone.value = 'multi-ms-header'; return }
    multiStreamRef.value?.moveFocus('up')
    return
  }
  channelGridRef.value?.moveFocus('up')
}

function navigateDown() {
  if (isModalActive.value || isVideoFocused()) return
  if (navZone.value === 'header') {
    navZone.value = 'main'
    // En teatro/multi va al sidebar; en normal va al filterbar → grid (ChannelGrid lo gestiona)
    channelGridRef.value?.resetFocusToGrid()
    return
  }
  if (navZone.value === 'theatre-player') {
    // DOWN sobre el player enfoca el <video> para que los controles nativos respondan al teclado.
    // El botón Cerrar sigue accesible con RIGHT desde theatre-player.
    const video = document.querySelector<HTMLVideoElement>('.theatre-video video, .theatre-player video')
    video?.focus()
    return
  }
  if (navZone.value === 'theatre-controls') { navZone.value = 'theatre-player'; return }
  if (navZone.value === 'multi-ms-header') { navZone.value = 'multi-streams'; multiStreamRef.value?.resetFocus(); return }
  if (navZone.value === 'multi-streams') { multiStreamRef.value?.moveFocus('down'); return }
  channelGridRef.value?.moveFocus('down')
}

function navigateLeft() {
  if (isModalActive.value || isVideoFocused()) return
  if (navZone.value === 'header') { headerFocusIdx.value = Math.max(0, headerFocusIdx.value - 1); return }
  if (navZone.value === 'theatre-player') { navZone.value = 'main'; return }
  if (navZone.value === 'theatre-controls') { navZone.value = 'theatre-player'; return }
  if (navZone.value === 'multi-ms-header') { msHeaderFocusIdx.value = Math.max(0, msHeaderFocusIdx.value - 1); return }
  if (navZone.value === 'multi-streams') {
    const atLeft = multiStreamRef.value?.isAtLeft?.()
    if (atLeft) { navZone.value = 'main'; return }
    multiStreamRef.value?.moveFocus('left')
    return
  }
  channelGridRef.value?.moveFocus('left')
}

function navigateRight() {
  if (isModalActive.value || isVideoFocused()) return
  if (navZone.value === 'header') {
    if (headerFocusIdx.value < 1) { headerFocusIdx.value++; return }
    // Pasado el último botón → vuelve al grid/sidebar
    navZone.value = 'main'
    channelGridRef.value?.resetFocusToGrid()
    return
  }
  if (navZone.value === 'theatre-player') { navZone.value = 'theatre-controls'; return }
  if (navZone.value === 'theatre-controls') return  // ya en el extremo derecho
  if (navZone.value === 'multi-ms-header') {
    msHeaderFocusIdx.value = Math.min(getMsMaxHeaderIdx(), msHeaderFocusIdx.value + 1)
    return
  }
  if (navZone.value === 'multi-streams') { multiStreamRef.value?.moveFocus('right'); return }
  channelGridRef.value?.moveFocus('right')
}

function selectCurrent() {
  if (isModalActive.value || isVideoFocused()) return
  if (navZone.value === 'header') {
    if (headerFocusIdx.value === 0) isTheatreMode.value ? deactivateTheatreMode() : activateTheatreMode()
    if (headerFocusIdx.value === 1) isMultiMode.value   ? deactivateMultiMode()   : activateMultiMode()
    return
  }
  if (navZone.value === 'theatre-controls') { closeActiveChannel(); navZone.value = 'main'; return }
  if (navZone.value === 'theatre-player') return  // clic en el player no hace nada
  if (navZone.value === 'multi-ms-header') {
    if (msHeaderFocusIdx.value === 0) {
      multiStreamRef.value?.toggleMode?.()
    } else if (msHeaderFocusIdx.value === 1 && multiStreamRef.value?.hasChatButton?.()) {
      multiStreamRef.value?.toggleChat?.()
    } else {
      deactivateMultiMode()
    }
    return
  }
  if (navZone.value === 'multi-streams') { multiStreamRef.value?.selectFocused(); return }
  channelGridRef.value?.selectFocused()
}

// Cierra el canal activo
function closeActiveChannel() {
  activeChannel.value = null
}

function navigateBack() {
  if (activeChannel.value && !isTheatreMode.value) { closeActiveChannel(); return }
  if (navZone.value !== 'main') { navZone.value = 'main'; return }
  if (isTheatreMode.value)   { deactivateTheatreMode(); return }
  if (isMultiMode.value)     { deactivateMultiMode();   return }
  if (showAddForm.value)     { showAddForm.value = false; return }
  if (editingChannel.value)  { editingChannel.value = null; return }
  if (showEventsPanel.value) { showEventsPanel.value = false; return }
  if (showAdminLogin.value)  { showAdminLogin.value = false; return }
}

// Conectar el mando de juego (gamepad/mando TV) con las funciones de navegación
useGamepad({
  onUp: navigateUp, onDown: navigateDown, onLeft: navigateLeft, onRight: navigateRight,
  onSelect: selectCurrent, onBack: navigateBack,
})

// Manejador de eventos de teclado para navegar también con el teclado físico.
// Se registra en window para capturar teclas en toda la app.
function handleKeydown(e: KeyboardEvent) {
  // Si el usuario está escribiendo en un campo (input/select), ignorar las teclas
  // de navegación para no interferir con el texto que está introduciendo.
  const tag = (e.target as HTMLElement)?.tagName
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tag)) return

  // Cuando PlayerModal está activo, solo gestionamos Escape/Backspace aquí;
  // las flechas y Enter las gestiona el propio PlayerModal con su listener.
  if (isModalActive.value) {
    if (e.key === 'Escape' || e.key === 'Backspace') navigateBack()
    return
  }

  // Si un <video> nativo tiene el foco, dejar que sus controles respondan (Space, flechas, M, F).
  // Escape/Backspace sale del foco de vídeo y vuelve al sistema de navegación.
  if (isVideoFocused()) {
    if (e.key === 'Escape' || e.key === 'Backspace') {
      e.preventDefault()
      ;(document.activeElement as HTMLVideoElement).blur()
      if (navZone.value === 'multi-streams') multiStreamRef.value?.exitControls?.()
      // En teatro: navZone sigue en 'theatre-player', no necesita cambio
    }
    return
  }

  switch (e.key) {
    case 'ArrowUp':    e.preventDefault(); navigateUp();    break
    case 'ArrowDown':  e.preventDefault(); navigateDown();  break
    case 'ArrowLeft':  e.preventDefault(); navigateLeft();  break
    case 'ArrowRight': e.preventDefault(); navigateRight(); break
    case 'Enter':      e.preventDefault(); selectCurrent(); break
    case 'Escape':
    case 'Backspace':  navigateBack(); break
    // M: silenciar/activar audio del reproductor HLS activo
    case 'm': case 'M': {
      const v = document.querySelector<HTMLVideoElement>('.player-wrap video')
      if (v) v.muted = !v.muted
      break
    }
    // F: alternar pantalla completa en el reproductor activo
    case 'f': case 'F': {
      const p = document.querySelector<HTMLElement>('.player-wrap')
      if (!p) break
      if (!document.fullscreenElement) p.requestFullscreen().catch(() => {})
      else document.exitFullscreen()
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

onMounted(async () => {
  // 1. Descargar la lista de canales del servidor (esperamos a que termine)
  await channelsStore.fetchChannels()

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
          :class="{ 'hdr-btn--active': isTheatreMode, 'hdr-btn--nav': navZone === 'header' && headerFocusIdx === 0 }"
          @click="isTheatreMode ? deactivateTheatreMode() : activateTheatreMode()"
        >🎬 Teatro</button>

        <button
          class="hdr-btn"
          :class="{ 'hdr-btn--active': isMultiMode, 'hdr-btn--nav': navZone === 'header' && headerFocusIdx === 1 }"
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
          ref="channelGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          sidebar-mode
          @select="openChannel"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDeleteChannel"
          @reach-top="onGridReachTop"
          @reach-right="onGridReachRight"
        />
      </aside>

      <!-- Área derecha: reproductor o pantalla de bienvenida -->
      <div class="theatre-player" :class="{ 'theatre-player--nav': navZone === 'theatre-player' }">
        <div v-if="!activeChannel" class="theatre-empty">
          <span class="empty-icon">🎬</span>
          <p class="empty-text">Selecciona un canal</p>
          <p class="empty-hint">D-pad para navegar · OK para reproducir · Back para salir</p>
        </div>
        <template v-else>
          <div class="theatre-bar">
            <span class="theatre-name">{{ activeChannel.name }}</span>
            <button
              class="theatre-close"
              :class="{ 'theatre-close--nav': navZone === 'theatre-controls' }"
              @click="closeActiveChannel()"
            >✕ Cerrar</button>
          </div>
          <VideoPlayer :channel="activeChannel" class="theatre-video" />
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
          ref="channelGridRef"
          :channels="channelsStore.channels"
          :isAdmin="adminStore.isAdmin"
          :loading="channelsStore.loading"
          :error="channelsStore.error"
          :getLiveStatus="liveStatusStore.isLive"
          sidebar-mode
          @select="openChannel"
          @edit="(ch) => (editingChannel = ch)"
          @delete="handleDeleteChannel"
          @reach-top="onGridReachTop"
          @reach-right="onGridReachRight"
        />
      </aside>
      <MultiStreamView
        ref="multiStreamRef"
        :channels="pinnedChannels"
        :msNavIdx="navZone === 'multi-ms-header' ? msHeaderFocusIdx : undefined"
        :hasFocus="navZone === 'multi-streams'"
        @remove="removePinnedChannel"
        @close="deactivateMultiMode"
        @reach-top="navZone = 'multi-ms-header'"
        @reach-left="navZone = 'main'"
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
        :channels="channelsStore.channels"
        :isAdmin="adminStore.isAdmin"
        :loading="channelsStore.loading"
        :error="channelsStore.error"
        :getLiveStatus="liveStatusStore.isLive"
        @select="openChannel"
        @edit="(ch) => (editingChannel = ch)"
        @delete="handleDeleteChannel"
        @preview="previewChannel = $event"
        @reach-top="onGridReachTop"
      />
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

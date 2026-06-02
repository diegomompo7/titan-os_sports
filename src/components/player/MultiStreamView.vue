<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/player/MultiStreamView.vue
   ¿QUÉ ES ESTO?
   La pantalla de "multi-stream": ver varios canales a la vez dividiendo la
   pantalla en celdas. Es como el modo Picture-in-Picture pero más potente.

   El usuario puede:
     - Ver hasta 4-9 canales simultáneamente
     - Elegir entre dos layouts:
         Modo GRID: todos los canales al mismo tamaño (como cuadros en una pared)
         Modo PRO:  un canal grande a la izquierda + columna pequeña a la derecha
     - En Modo PRO, intercambiar cualquier canal secundario con el principal
       haciendo clic en el botón ⊞ (esto cambia el orden local, no en el servidor)
     - Mostrar el chat de Twitch si hay canales de ese tipo

   Esta pantalla se activa desde HomeView cuando el usuario selecciona múltiples
   canales con el botón "Añadir a multi-stream". HomeView le pasa la lista de
   canales activos, y este componente decide cómo ordenarlos y mostrarlos.
============================================================================= */
import { computed, ref, watch } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

// Lista de canales que hay que mostrar — la pasa HomeView
const props = defineProps<{ channels: Channel[] }>()

// Eventos que este componente puede enviar:
//   remove → el usuario quitó un canal de la vista (pasamos su ID)
//   close  → el usuario quiere salir del modo multi-stream
const emit = defineEmits<{ remove: [id: string]; close: [] }>()

// ── Modo de visualización ────────────────────────────────────────────────────
// false = Modo Grid (todos iguales), true = Modo Pro (uno grande + columna lateral)
const isProMode = ref(false)

// ── Cálculo automático de columnas para el Grid ──────────────────────────────
// Cuántas columnas necesitamos según el número de canales:
//   1 canal  → 1 columna   (un reproductor a pantalla completa)
//   2-4 canales → 2 columnas  (2x2 máximo)
//   5-9 canales → 3 columnas  (3x3 máximo)
//   10+ canales → 4 columnas
const gridColumns = computed(() => {
  const n = props.channels.length
  if (n <= 1) return 1
  if (n <= 4) return 2
  return n <= 9 ? 3 : 4
})

// CSS inline para aplicar el número de columnas calculado al grid
const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${gridColumns.value}, 1fr)`,
}))

// ── Chat de Twitch ───────────────────────────────────────────────────────────
// ¿Está visible el panel de chat?
const showChat = ref(false)

// ID del canal de Twitch cuyo chat está seleccionado actualmente
const activeChatId = ref<string | null>(null)

// Filtramos solo los canales de Twitch (son los únicos que tienen chat incrustable)
const twitchChannels = computed(() =>
  props.channels.filter((c) => c.streamType === 'twitch')
)

// Cuando cambia la lista de canales Twitch, verificar que el chat activo siga válido.
// Si ya no hay canales Twitch → ocultar el chat.
// Si el canal activo desapareció → seleccionar el primero de la lista.
// { immediate: true } → ejecutar también al montar el componente (no solo en cambios)
watch(twitchChannels, (chs) => {
  if (!chs.length) { showChat.value = false; return }
  if (!activeChatId.value || !chs.find((c) => c.id === activeChatId.value)) {
    activeChatId.value = chs[0]?.id ?? null
  }
}, { immediate: true })

// URL del iframe del chat del canal Twitch activo
const activeChatUrl = computed(() => {
  const ch = twitchChannels.value.find((c) => c.id === activeChatId.value)
  if (!ch) return ''
  const m      = ch.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = m?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})

// ── Modo Pro: orden local de los canales ─────────────────────────────────────
// En Modo Pro, el usuario puede intercambiar canales entre la posición principal
// y las secundarias. Este orden es LOCAL: solo afecta a cómo se muestran aquí,
// no cambia nada en el servidor ni en el store global.
// localOrder guarda los índices (posiciones en props.channels) en el orden visual deseado.
const localOrder = ref<number[]>([])

// Cuando la lista de canales cambia, actualizar el orden local:
// - Conservar la posición de los canales que ya existían
// - Añadir los nuevos al final
watch(() => props.channels, (chs) => {
  const existing = localOrder.value.filter((i) => i < chs.length)
  const newIdx   = chs.map((_, i) => i).filter((i) => !existing.includes(i))
  localOrder.value = [...existing, ...newIdx]
}, { immediate: true })

// Lista de canales reordenada según el orden visual del usuario
const orderedChannels   = computed(() =>
  localOrder.value.map((i) => props.channels[i]).filter((c): c is Channel => !!c)
)
// El canal principal (el grande) es el primero del orden
const mainChannel       = computed(() => orderedChannels.value[0] ?? null)
// Los secundarios son los siguientes (máximo 4 en la columna lateral)
const secondaryChannels = computed(() => orderedChannels.value.slice(1, 5))

function swapWithMain(secIndex: number) {
  const o    = [...localOrder.value]
  const slot = secIndex + 1
  ;[o[0], o[slot]] = [o[slot]!, o[0]!]
  localOrder.value = o
}

function toggleMode() { isProMode.value = !isProMode.value }
</script>

<template>
  <!-- Contenedor principal que ocupa todo el espacio que le da HomeView -->
  <div class="multistream">

    <!-- ══ BARRA SUPERIOR ════════════════════════════════════════════════
         Controles del multi-stream: título, contador de canales y botones.
    ════════════════════════════════════════════════════════════════════ -->
    <div class="ms-header">
      <!-- Título fijo -->
      <span class="ms-title">⊞ Multi-stream</span>

      <!-- Contador dinámico: "2 canales", "1 canal", o instrucción si vacío -->
      <span class="ms-count">
        {{ channels.length ? `${channels.length} canal${channels.length > 1 ? 'es' : ''}` : 'Selecciona canales de la lista' }}
      </span>

      <!-- Botón que alterna entre Modo Grid y Modo Pro.
           ms-btn--active → fondo azul cuando el modo Pro está activo -->
      <button
        class="ms-btn"
        :class="{ 'ms-btn--active': isProMode }"
        @click="isProMode = !isProMode"
      >{{ isProMode ? '⊞ Grid' : '▣ Pro' }}</button>

      <!-- Botón Chat: solo en Modo Grid y solo si hay canales Twitch -->
      <button
        v-if="!isProMode && twitchChannels.length > 0"
        class="ms-btn ms-btn--twitch"
        :class="{ 'ms-btn--twitch-active': showChat }"
        @click="showChat = !showChat"
      >💬 Chat</button>

      <!-- Botón Salir: cierra el multi-stream y vuelve a la pantalla principal -->
      <button class="ms-btn ms-btn--exit" @click="emit('close')">✕ Salir</button>
    </div>

    <!-- ══ MODO GRID ══════════════════════════════════════════════════════
         Todos los canales al mismo tamaño en una cuadrícula.
         v-if="!isProMode" → solo visible cuando isProMode=false
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="!isProMode" class="ms-body">

      <!-- La cuadrícula de reproductores. :style aplica las columnas dinámicamente. -->
      <div class="streams-grid" :style="gridStyle">

        <!-- Mensaje de "vacío" si todavía no hay canales seleccionados.
             grid-column: 1/-1 hace que ocupe todo el ancho de la rejilla. -->
        <div v-if="orderedChannels.length === 0" class="slot slot--empty">
          <span>Selecciona canales de la lista para añadirlos</span>
        </div>

        <!-- Un bloque por cada canal activo. -->
        <div
          v-for="ch in orderedChannels"
          :key="ch.id"
          class="slot"
        >
          <div class="slot-bar">
            <span class="slot-name">{{ ch.name }}</span>
            <button class="slot-close" @click="emit('remove', ch.id)">✕</button>
          </div>
          <VideoPlayer :channel="ch" />
        </div>
      </div>

      <!-- Panel de chat Twitch (columna lateral derecha).
           Solo visible si el usuario activó el chat Y hay canales Twitch. -->
      <aside v-if="showChat && twitchChannels.length > 0" class="chat-panel">
        <!-- Si hay más de un canal Twitch, mostrar selectores para elegir cuál -->
        <div v-if="twitchChannels.length > 1" class="chat-selector">
          <button
            v-for="ch in twitchChannels"
            :key="ch.id"
            class="chat-sel-btn"
            :class="{ 'chat-sel-btn--active': activeChatId === ch.id }"
            @click="activeChatId = ch.id"
          >{{ ch.name }}</button>
        </div>
        <!-- :key="activeChatUrl" fuerza a Vue a recrear el iframe cuando cambia la URL -->
        <iframe
          v-if="activeChatUrl"
          :key="activeChatUrl"
          :src="activeChatUrl"
          class="chat-iframe"
          allow="autoplay"
          title="Chat de Twitch"
        />
      </aside>
    </div>

    <!-- ══ MODO PRO ═══════════════════════════════════════════════════════
         Layout con un canal principal grande y una columna de secundarios.
         v-else → solo cuando isProMode=true
         ┌──────────────────────────┬──────────┐
         │                          │  Canal 2 │
         │     CANAL PRINCIPAL      │  Canal 3 │
         │     (flex:1, grande)     │  Canal 4 │
         │                          │  Canal 5 │
         └──────────────────────────┴──────────┘
    ════════════════════════════════════════════════════════════════════ -->
    <div v-else class="pro-layout">

      <div class="pro-main">
        <VideoPlayer v-if="mainChannel" :channel="mainChannel" />
        <div v-else class="pro-empty">
          <span class="pro-empty-icon">▣</span>
          <p>Selecciona un canal principal</p>
        </div>
        <div v-if="mainChannel" class="pro-bar">
          <span>{{ mainChannel.name }}</span>
          <button class="pro-close" @click="emit('remove', mainChannel.id)">✕</button>
        </div>
      </div>

      <div v-if="secondaryChannels.length > 0" class="pro-secondary">
        <div
          v-for="(ch, i) in secondaryChannels"
          :key="ch.id"
          class="pro-slot"
        >
          <VideoPlayer :channel="ch" />
          <div class="pro-overlay">
            <span class="pro-slot-name">{{ ch.name }}</span>
            <div class="pro-slot-btns">
              <button class="pro-btn pro-btn--promote" title="Hacer principal" @click="swapWithMain(i)">⊞</button>
              <button class="pro-btn pro-btn--remove" title="Eliminar" @click="emit('remove', ch.id)">✕</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── Contenedor ── */
.multistream {
  flex: 1;
  display: flex;
  flex-direction: column;
  background: var(--color-bg-base);
  overflow: hidden;
}

/* ── Cabecera ── */
.ms-header {
  height: 6.5vh;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0 var(--space-4);
  background: var(--color-bg-surface);
  border-bottom: 1px solid var(--color-border);
}
.ms-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--color-accent);
  flex-shrink: 0;
}
.ms-count {
  color: var(--color-text-muted);
  font-size: 0.8rem;
  flex: 1;
}

.ms-btn {
  height: 4.8vh;
  padding: 0 var(--space-3);
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  font-family: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s;
  outline: none;
}
.ms-btn:hover,
.ms-btn:focus-visible  { background: var(--color-bg-elevated); border-color: var(--color-accent); box-shadow: var(--focus-ring); }
.ms-btn--active        { background: var(--color-accent); border-color: var(--color-accent); color: #000; }
.ms-btn--twitch        { color: #9146ff; border-color: rgba(145, 70, 255, 0.4); }
.ms-btn--twitch-active { background: rgba(145, 70, 255, 0.2); border-color: #9146ff; color: #c8a7ff; }
.ms-btn--exit:hover    { border-color: var(--color-danger); color: var(--color-danger); }

/* ── MODO GRID ── */
.ms-body {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.streams-grid {
  display: grid;
  flex: 1;
  gap: 3px;
  padding: 3px;
  overflow: hidden;
  background: #000;
}

.slot {
  background: #000;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}
.slot--empty {
  align-items: center;
  justify-content: center;
  background: var(--color-bg-surface);
  border: 1px dashed var(--color-border);
  color: var(--color-text-muted);
  font-size: 0.9rem;
  grid-column: 1 / -1;
  padding: var(--space-8);
  text-align: center;
}

.slot-bar {
  position: absolute;
  top: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.3rem 0.65rem;
  background: rgba(0, 0, 0, 0.72);
  z-index: 2;
}
.slot-name {
  color: #fff;
  font-size: 0.75rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.slot-close {
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  font-size: 0.82rem;
  padding: 0.15rem 0.4rem;
  flex-shrink: 0;
  transition: color 0.15s;
  border-radius: var(--radius-sm);
}
.slot-close:hover { color: var(--color-live); background: rgba(255, 68, 68, 0.15); }

/* Chat */
.chat-panel {
  width: 22vw;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--color-border);
  background: var(--color-bg-surface);
}
.chat-selector {
  display: flex;
  gap: 0.3rem;
  padding: var(--space-2);
  border-bottom: 1px solid var(--color-border);
  flex-wrap: wrap;
}
.chat-sel-btn {
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: 999px;
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.2rem 0.7rem;
  transition: all 0.15s;
}
.chat-sel-btn--active { background: #9146ff; border-color: #9146ff; color: #fff; }
.chat-iframe { border: none; flex: 1; width: 100%; }

/* ── MODO PRO ── */
.pro-layout {
  flex: 1;
  display: flex;
  gap: 3px;
  background: #000;
  padding: 3px;
  overflow: hidden;
}

.pro-main {
  flex: 1;
  min-width: 0;
  background: #000;
  position: relative;
  display: flex;
  flex-direction: column;
}
.pro-bar {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.4rem 1rem;
  background: rgba(0, 0, 0, 0.68);
  color: #fff;
  font-size: 0.9rem;
  font-weight: 600;
}
.pro-close {
  background: none; border: none;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer; font-size: 0.9rem;
  transition: color 0.15s;
}
.pro-close:hover { color: var(--color-live); }

.pro-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--space-3);
  color: var(--color-text-muted);
  font-size: 0.9rem;
}
.pro-empty-icon { font-size: 3rem; opacity: 0.18; }

.pro-secondary {
  width: 20vw;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.pro-slot {
  flex: 1;
  min-height: 0;
  background: #000;
  position: relative;
  overflow: hidden;
}
.pro-overlay {
  position: absolute;
  bottom: 0; left: 0; right: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
  background: rgba(0, 0, 0, 0.72);
  gap: var(--space-2);
}
.pro-slot-name {
  flex: 1;
  min-width: 0;
  font-size: 0.7rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pro-slot-btns { display: flex; gap: 0.2rem; flex-shrink: 0; }
.pro-btn {
  background: rgba(255, 255, 255, 0.12);
  border: none;
  border-radius: 3px;
  color: rgba(255, 255, 255, 0.7);
  cursor: pointer;
  font-size: 0.7rem;
  padding: 0.2rem 0.45rem;
  transition: all 0.15s;
}
.pro-btn--promote:hover { background: var(--color-accent); color: #000; }
.pro-btn--remove:hover  { background: var(--color-live); color: #fff; }

/* Reproductores llenan su contenedor */
:deep(.player-wrap) {
  border-radius: 0;
  height: 100%;
  aspect-ratio: unset;
  flex: 1;
}

</style>

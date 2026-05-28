<script setup lang="ts">
/* =============================================================================
   FICHERO: src/components/channels/ChannelCard.vue
   ¿QUÉ ES ESTO?
   La "tarjeta" visual de cada canal en la pantalla principal. Es el bloque
   que el usuario ve y selecciona para ver un canal.

   Cada tarjeta muestra:
   - Logo del canal (o iniciales si no tiene logo)
   - Nombre del canal
   - Badge de LIVE si está emitiendo en directo ahora
   - Categoría deportiva y tipo de stream
   - Próximo evento (si hay alguno programado)
   - Botones de editar/borrar (solo si el usuario es admin)
   - Botón de favorito (estrella)

   También soporta:
   - Estado "focused" para navegación con mando (D-pad) — escala y resalta
   - Modo compacto para cuando aparece en el sidebar
   - Efecto marquee (texto deslizante) si el nombre del evento es muy largo
============================================================================= */
import { computed, ref, watchEffect, nextTick } from 'vue'
import type { Channel } from '@/types/channel'
import { CATEGORY_LABELS, CATEGORY_ICONS } from '@/types/channel'
import { useFavoritesStore } from '@/stores/favorites'
import { useEventsStore }    from '@/stores/events'

const props = defineProps<{
  channel:      Channel    // Los datos del canal a mostrar
  isAdmin:      boolean    // Si es true, muestra los botones de editar y borrar
  isLive?:      boolean    // Si es true, muestra el badge "● LIVE"
  isFocused?:   boolean    // Si es true, la tarjeta está seleccionada con D-pad
  compactMode?: boolean    // Si es true, modo compacto para sidebar (logo más pequeño, sin badges)
}>()

const emit = defineEmits<{
  select:      [Channel]  // Al hacer clic/Enter → abrir el canal
  edit:        [Channel]  // Al pulsar el botón de editar (admin)
  delete:      [Channel]  // Al pulsar el botón de borrar (admin)
  hover:       [Channel]  // Al pasar el ratón por encima → mostrar preview
  'hover-end': []         // Al sacar el ratón → ocultar preview
}>()

const favStore    = useFavoritesStore()
const eventsStore = useEventsStore()

// Genera las iniciales del canal a partir de su nombre.
// Ejemplo: "La Liga TV" → "LL", "ESPN" → "ES"
function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}

// Texto legible para el badge de tipo de stream
const streamTypeLabel = computed(() => {
  const map: Record<string, string> = {
    hls:      'HLS',
    twitch:   'Twitch',
    youtube:  'YouTube',
    web:      'Web',
    titanapp: 'App TV',
  }
  return map[props.channel.streamType] ?? props.channel.streamType
})

// El próximo evento programado de este canal (null si no hay ninguno)
const nextEvent = computed(() => eventsStore.getNextEvent(props.channel.id))

// ── Marquee (texto deslizante) ───────────────────────────────────────────────
// Si el título del próximo evento es más largo que el espacio disponible,
// activamos una animación CSS que hace que el texto se deslice horizontalmente.
const eventTitleRef = ref<HTMLElement | null>(null)  // Referencia al elemento del título
const scrolling     = ref(false)                      // ¿Está activa la animación?

watchEffect(() => {
  const ev = nextEvent.value
  if (!ev) { scrolling.value = false; return }

  // nextTick: esperar a que Vue actualice el DOM antes de medir el elemento
  // (si medimos antes de que Vue haya renderizado, el tamaño puede ser 0)
  nextTick(() => {
    const el = eventTitleRef.value
    // scrollWidth = ancho real del texto; clientWidth = ancho visible del contenedor
    // Si el texto es más ancho que el contenedor, hay desbordamiento → animar
    scrolling.value = !!el && el.scrollWidth > (el.parentElement?.clientWidth ?? 0)
  })
})
</script>

<template>
  <!-- ══════════════════════════════════════════════════════════════════
       RAÍZ DE LA TARJETA — elemento <article>
       Todo el contenido visible de la tarjeta vive dentro de aquí.

       Se comporta como un botón grande: clic o Enter la "pulsa".
       Las clases CSS cambian su aspecto según el estado:
         card--focused  → el mando D-pad está sobre esta tarjeta (escala 103%, brillo)
         card--live     → el canal está emitiendo en directo (borde rojo sutil)
         card--compact  → modo sidebar, tarjeta más pequeña sin badges ni eventos

       Accesibilidad:
         role="button"  → el navegador lo trata como un botón (lector de pantalla)
         tabindex="0"   → permite llegar aquí con la tecla Tab del teclado
         aria-label     → texto que leen los lectores de pantalla ("Ver ESPN HD — EN DIRECTO")

       Eventos del ratón:
         @mouseenter → cuando el ratón entra en la tarjeta, avisa al padre para mostrar preview
         @mouseleave → cuando el ratón sale, avisa para ocultar el preview
  ══════════════════════════════════════════════════════════════════ -->
  <article
    class="card"
    :class="{
      'card--focused':  isFocused,
      'card--live':     isLive,
      'card--compact':  compactMode,
    }"
    role="button"
    tabindex="0"
    :aria-label="`Ver ${channel.name}${isLive ? ' — EN DIRECTO' : ''}`"
    @click="emit('select', channel)"
    @keydown.enter.prevent="emit('select', channel)"
    @keydown.space.prevent="emit('select', channel)"
    @mouseenter="emit('hover', channel)"
    @mouseleave="emit('hover-end')"
  >

    <!-- ══ SECCIÓN 1: CABECERA — logo + nombre del canal ════════════════
         Disposición: [LOGO cuadrado] [Nombre + badges] en fila horizontal.
    ════════════════════════════════════════════════════════════════════ -->
    <div class="card-header">

      <!-- Logo del canal (cuadrado redondeado, ≈62px).
           SI el canal tiene imagen (logoUrl) → muestra la foto.
           SI no tiene imagen (v-else) → muestra las iniciales calculadas por getInitials().
           loading="lazy" significa que la imagen no se descarga hasta que el usuario
           se acerca a esa parte de la pantalla (ahorra ancho de banda). -->
      <div class="card-logo">
        <img
          v-if="channel.logoUrl"
          :src="channel.logoUrl"
          :alt="channel.name"
          class="logo-img"
          loading="lazy"
        />
        <span v-else class="logo-initials">{{ getInitials(channel.name) }}</span>
      </div>

      <!-- Bloque de texto a la derecha del logo.
           flex:1 + min-width:0 permite que el texto se trunce (…) si no cabe. -->
      <div class="card-title">

        <!-- FILA SUPERIOR: [Nombre canal] [● LIVE?] [↗ Web?] [⭐ Fav]
             Todos los elementos aparecen/desaparecen según las condiciones. -->
        <div class="title-row">

          <!-- Nombre del canal. :title muestra el nombre completo en tooltip
               si el texto está truncado con "…" (cuando es muy largo). -->
          <span class="channel-name" :title="channel.name">{{ channel.name }}</span>

          <!-- Badge "● LIVE" con animación de pulso.
               v-if="isLive" → solo aparece si el padre nos dijo que el canal está en directo. -->
          <span v-if="isLive" class="live-badge">● LIVE</span>

          <!-- Badge "↗" para canales tipo 'web' que abren en el navegador externo.
               Avisa al usuario de que no se reproducirá dentro de la app. -->
          <span v-if="channel.streamType === 'web'" class="web-badge" title="Abre en nueva pestaña">↗</span>

          <!-- Botón de favorito (estrella).
               @click.stop → el clic no se "propaga" al <article> padre, así que
               pulsar la estrella NO abre el canal (solo añade/quita de favoritos).
               tabindex="-1" → el botón no es accesible con Tab (la tarjeta ya lo es). -->
          <button
            class="fav-btn"
            :class="{ 'fav-btn--active': favStore.isFavorite(channel.id) }"
            :title="favStore.isFavorite(channel.id) ? 'Quitar de favoritos' : 'Añadir a favoritos'"
            tabindex="-1"
            @click.stop="favStore.toggle(channel.id)"
          >{{ favStore.isFavorite(channel.id) ? '⭐' : '☆' }}</button>
        </div>

        <!-- FILA INFERIOR: badges de categoría y tipo de stream.
             v-if="!compactMode" → solo en modo normal, no en sidebar (ahorrar espacio).
             Ejemplo: [🏆 Fútbol] [YouTube]  o  [🎾 Tenis] [HLS] -->
        <div v-if="!compactMode" class="badges-row">
          <!-- Categoría deportiva: icono + nombre legible. Si no hay icono para esa
               categoría, muestra '🏆' por defecto. -->
          <span class="badge badge-cat">
            {{ CATEGORY_ICONS[channel.category] ?? '🏆' }}
            {{ CATEGORY_LABELS[channel.category] ?? channel.category }}
          </span>
          <!-- Tipo de stream: el color del badge cambia según la tecnología
               (rojo para YouTube, morado para Twitch, azul para HLS...).
               data-type es un atributo CSS que permite aplicar estilos distintos. -->
          <span class="badge badge-type" :data-type="channel.streamType">{{ streamTypeLabel }}</span>
        </div>
      </div>
    </div>

    <!-- ══ SECCIÓN 2: PRÓXIMO EVENTO ════════════════════════════════════
         Aparece solo si hay un evento programado Y no estamos en modo compacto.
         Muestra: [📅 Título del partido]  [en 2h 30min →]
         Si el título es demasiado largo, la clase event-title--scroll activa
         una animación CSS que lo hace deslizar horizontalmente (efecto marquee).
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="nextEvent && !compactMode" class="event-row">
      <!-- event-wrap tiene overflow:hidden para recortar el texto que sobresalga -->
      <div class="event-wrap">
        <!-- ref="eventTitleRef" — el script mide este elemento para saber si
             el texto desborda y debe animarse. scrolling=true activa el CSS. -->
        <span
          ref="eventTitleRef"
          class="event-title"
          :class="{ 'event-title--scroll': scrolling }"
        >📅 {{ nextEvent.title }}</span>
      </div>
      <!-- Cuenta atrás calculada por formatCountdown(): "en 45min", "en 2h", "Ahora" -->
      <em class="event-countdown">{{ eventsStore.formatCountdown(nextEvent.scheduledAt) }}</em>
    </div>

    <!-- ══ SECCIÓN 3: BOTONES ADMIN ══════════════════════════════════════
         Solo cuando isAdmin=true. Siempre visibles (en TV no hay estado "hover").
         @click.stop en el contenedor evita que pulsar los botones también
         dispare el @click del <article> (que abriría el canal).
    ════════════════════════════════════════════════════════════════════ -->
    <div v-if="isAdmin" class="admin-row" @click.stop>
      <!-- Botón lápiz: abre el formulario para editar nombre/URL/logo del canal -->
      <button class="admin-btn" title="Editar"    @click="emit('edit', channel)">✏️</button>
      <!-- Botón papelera: elimina el canal (HomeView pedirá confirmación antes) -->
      <button class="admin-btn admin-btn--del" title="Eliminar" @click="emit('delete', channel)">🗑️</button>
    </div>
  </article>
</template>

<style scoped>
/* ── Tarjeta base ── */
.card {
  display: flex;
  flex-direction: column;
  background: var(--color-bg-surface);
  border: 2px solid transparent;
  border-radius: var(--radius-md);
  cursor: pointer;
  overflow: hidden;
  outline: none;
  user-select: none;
  transition: border-color 0.12s, background 0.12s, transform 0.1s;
}
.card:hover {
  border-color: rgba(0, 191, 255, 0.45);
  background: rgba(0, 191, 255, 0.03);
}

/* Foco activo — anillo prominente para mando */
.card--focused {
  border-color: var(--color-accent) !important;
  background: var(--color-accent-dim) !important;
  box-shadow: var(--focus-ring);
  transform: scale(1.03);
}

.card--live { border-color: rgba(255, 68, 68, 0.3); }
.card--live.card--focused { border-color: var(--color-accent) !important; }

/* Modo compacto — más comprimido, sin escalar */
.card--compact {
  border-radius: var(--radius-sm);
}

/* ══ CABECERA: logo + título ═══════════════════════════════════════════ */
.card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-3);
  padding-bottom: var(--space-2);
}
.card--compact .card-header {
  padding: var(--space-2) var(--space-3);
  gap: var(--space-2);
}

/* Logo cuadrado — 3.5rem escala con html { font-size: 1.3vw }
   → ≈ 62px en 1366px  /  87px en 1920px  /  175px en 3840px */
.card-logo {
  width: 3.5rem;
  height: 3.5rem;
  border-radius: var(--radius-sm);
  background: #08090e;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.card--compact .card-logo {
  width: 2.4rem;
  height: 2.4rem;
}

.logo-img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.logo-initials {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-accent);
  letter-spacing: -0.02em;
}
.card--compact .logo-initials { font-size: 0.85rem; }
.card--focused .logo-initials { color: #fff; }

/* Título (a la derecha del logo) */
.card-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--space-1);
}

/* Fila nombre + badges inline */
.title-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  min-width: 0;
}

/* Nombre del canal */
.channel-name {
  flex: 1;
  min-width: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text-main);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  line-height: 1.35;
}
.card--compact .channel-name { font-size: 0.88rem; }
.card--focused .channel-name { color: #fff; }

/* LIVE badge — inline, no absoluto */
.live-badge {
  background: var(--color-live);
  color: #fff;
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  padding: 0.15rem 0.45rem;
  border-radius: 999px;
  animation: live-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
  white-space: nowrap;
}

/* WEB badge — inline */
.web-badge {
  background: rgba(0, 0, 0, 0.45);
  color: var(--color-accent);
  font-size: 0.78rem;
  padding: 0.1rem 0.4rem;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}

/* Botón favorito */
.fav-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1rem;
  opacity: 0.28;
  transition: opacity 0.15s;
  flex-shrink: 0;
  width: 1.8rem;
  height: 1.8rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
}
.fav-btn:hover,
.fav-btn--active { opacity: 1; }

/* ── Badges categoría + tipo ── */
.badges-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  flex-wrap: wrap;
}
.badge {
  font-size: 0.65rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.18rem 0.5rem;
  border-radius: var(--radius-sm);
  white-space: nowrap;
}
.badge-cat { color: var(--color-text-muted); background: rgba(255, 255, 255, 0.06); }
.badge-type[data-type='youtube']  { background: rgba(255, 68, 68, 0.15); color: #ff4444; }
.badge-type[data-type='twitch']   { background: rgba(145, 70, 255, 0.15); color: #9146ff; }
.badge-type[data-type='hls']      { background: rgba(0, 191, 255, 0.1); color: var(--color-accent); }
.badge-type[data-type='web']      { background: rgba(107, 114, 128, 0.2); color: var(--color-text-muted); }
.badge-type[data-type='titanapp'] { background: rgba(0, 220, 130, 0.15); color: #00dc82; }

/* ══ PRÓXIMO EVENTO ════════════════════════════════════════════════════ */
.event-row {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  overflow: hidden;
  padding: 0 var(--space-3) var(--space-2);
  /* Sangría visual: alineado con el texto del título (logo + gap) */
  padding-left: calc(3.5rem + var(--space-3) + var(--space-3));
}
.event-wrap {
  flex: 1;
  overflow: hidden;
  min-width: 0;
}
.event-title {
  display: inline-block;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  white-space: nowrap;
}
.event-title--scroll { animation: marquee-scroll 14s linear infinite; }
.event-countdown {
  font-style: normal;
  font-size: 0.78rem;
  font-weight: 800;
  color: var(--color-fav);
  flex-shrink: 0;
  white-space: nowrap;
}

/* ══ BOTONES ADMIN ═════════════════════════════════════════════════════ */
.admin-row {
  display: flex;
  gap: var(--space-1);
  padding: 0 var(--space-3) var(--space-3);
  /* Misma sangría que el evento */
  padding-left: calc(3.5rem + var(--space-3) + var(--space-3));
}
.admin-btn {
  background: rgba(255, 255, 255, 0.06);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  font-size: 0.9rem;
  width: 2.2rem;
  height: 2.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s;
}
.admin-btn:hover      { background: rgba(255, 255, 255, 0.14); }
.admin-btn--del:hover { background: rgba(239, 68, 68, 0.22); }
</style>

<script setup lang="ts">
/**
 * PlayerModal — Modal del reproductor de vídeo.
 *
 * En móvil ocupa pantalla completa. En escritorio es una caja centrada.
 * Para canales de Twitch ofrece un botón para mostrar/ocultar el chat.
 */
import { ref, computed } from 'vue'
import type { Channel } from '@/types/channel'
import BaseModal from '@/components/ui/BaseModal.vue'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channel: Channel }>()
const emit  = defineEmits<{ close: [] }>()

const showChat = ref(false)

const isTwitch = computed(() => props.channel.streamType === 'twitch')

/** Construye la URL del chat embebido de Twitch */
const twitchChatUrl = computed(() => {
  const loginMatch = props.channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const login  = loginMatch?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})
</script>

<template>
  <!-- El prop :wide muestra el modal más ancho cuando el chat está visible -->
  <BaseModal
    :title="channel.name"
    :wide="isTwitch && showChat"
    @close="emit('close')"
  >
    <div class="player-modal-body" :class="{ 'player-modal-body--with-chat': isTwitch && showChat }">

      <!-- Reproductor de vídeo -->
      <div class="player-container">
        <VideoPlayer :channel="channel" />

        <!-- Botón para mostrar/ocultar chat de Twitch -->
        <button
          v-if="isTwitch"
          class="chat-toggle-btn"
          @click="showChat = !showChat"
        >
          {{ showChat ? 'Ocultar chat' : '💬 Mostrar chat' }}
        </button>
      </div>

      <!-- Chat de Twitch (se muestra a la derecha en escritorio) -->
      <iframe
        v-if="isTwitch && showChat"
        :src="twitchChatUrl"
        class="chat-frame"
        allow="autoplay"
        title="Chat de Twitch"
      />
    </div>
  </BaseModal>
</template>

<style scoped>
.player-modal-body {
  padding: var(--space-4);
}

/* En escritorio con chat: el reproductor y el chat van lado a lado */
.player-modal-body--with-chat {
  display: flex;
  gap: var(--space-4);
}

/* En móvil el chat va debajo del reproductor */
@media (max-width: 599px) {
  .player-modal-body--with-chat {
    flex-direction: column;
  }
}

.player-container {
  flex: 1;
  min-width: 0;
}

/* Botón para mostrar/ocultar chat */
.chat-toggle-btn {
  margin-top: var(--space-2);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.8rem;
  padding: 6px 12px;
  transition: color 0.15s, border-color 0.15s;
}
.chat-toggle-btn:hover {
  border-color: #9146ff;
  color: #9146ff;
}

/* iframe del chat de Twitch */
.chat-frame {
  border: none;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  width: 300px;
  height: 480px;
}

/* En móvil el chat ocupa todo el ancho */
@media (max-width: 599px) {
  .chat-frame {
    width: 100%;
    height: 300px;
  }
}
</style>

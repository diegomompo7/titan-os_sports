<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Channel } from '@/types/channel'
import BaseModal from '@/components/ui/BaseModal.vue'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channel: Channel }>()
const emit = defineEmits<{ close: [] }>()

const showChat = ref(false)
const isTwitch = computed(() => props.channel.streamType === 'twitch')

const twitchChatUrl = computed(() => {
  const m = props.channel.url.match(/twitch\.tv\/([^/?#]+)/)
  const login = m?.[1] ?? ''
  const parent = import.meta.env['VITE_TWITCH_PARENT'] ?? 'localhost'
  return `https://www.twitch.tv/embed/${login}/chat?parent=${parent}&darkpopout`
})
</script>

<template>
  <BaseModal :title="channel.name" :wide="isTwitch && showChat" @close="emit('close')">
    <div class="player-modal-body" :class="{ 'with-chat': isTwitch && showChat }">
      <div class="player-container">
        <VideoPlayer :channel="channel" />
        <button v-if="isTwitch" class="chat-toggle" @click="showChat = !showChat">
          {{ showChat ? 'Ocultar chat' : '💬 Chat' }}
        </button>
      </div>
      <iframe
        v-if="isTwitch && showChat"
        :src="twitchChatUrl"
        class="chat-frame"
        allow="autoplay"
        title="Twitch chat"
      />
    </div>
  </BaseModal>
</template>

<style scoped>
.player-modal-body {
  padding: var(--space-md);
}
.player-modal-body.with-chat {
  display: flex;
  gap: var(--space-md);
}
.player-container {
  flex: 1;
  min-width: 0;
}
.chat-toggle {
  margin-top: var(--space-xs);
  background: none;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text-muted);
  cursor: pointer;
  font-family: inherit;
  font-size: 0.75rem;
  padding: 3px 10px;
  transition: color 0.15s, border-color 0.15s;
}
.chat-toggle:hover {
  border-color: #9146ff;
  color: #9146ff;
}
.chat-frame {
  border: none;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
  height: 480px;
  width: 300px;
}
</style>

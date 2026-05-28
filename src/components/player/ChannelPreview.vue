<script setup lang="ts">
import { computed } from 'vue'
import type { Channel } from '@/types/channel'
import VideoPlayer from './VideoPlayer.vue'

const props = defineProps<{ channel: Channel }>()

const previewChannel = computed<Channel>(() => {
  const ch = props.channel
  if (ch.streamType !== 'titanapp') return ch
  if (isYoutubeUrl(ch.url)) {
    return { ...ch, streamType: 'youtube', url: normalizeYoutubeUrl(ch.url) }
  }
  return ch
})

function isYoutubeUrl(url: string): boolean {
  return url.includes('youtube.com') || url.includes('youtu.be') || url.startsWith('youtube://')
}

function normalizeYoutubeUrl(url: string): string {
  if (url.startsWith('youtube://')) {
    return 'https://www.youtube.com/' + url.slice('youtube://'.length)
  }
  return url
}
</script>

<template>
  <div class="channel-preview">
    <VideoPlayer :channel="previewChannel" />
  </div>
</template>

<style scoped>
.channel-preview {
  position: fixed;
  bottom: 0;
  left: 0;
  width: calc(25vw - 1rem);
  z-index: 500;
  border-top: 2px solid var(--color-accent);
  border-right: 2px solid var(--color-accent);
  border-radius: 0 var(--radius-sm) 0 0;
  overflow: hidden;
}
</style>

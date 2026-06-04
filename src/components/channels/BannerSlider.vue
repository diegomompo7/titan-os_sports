<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useBannersStore } from '@/stores/banners'

const store = useBannersStore()
const current = ref<string | null>(null)
let timer: ReturnType<typeof setInterval> | null = null

function pickRandom() {
  const active = store.banners.filter((b) => b.active)
  if (!active.length) { current.value = null; return }
  const pool = active.length > 1 ? active.filter((b) => b.imageUrl !== current.value) : active
  current.value = pool[Math.floor(Math.random() * pool.length)]?.imageUrl ?? null
}

onMounted(async () => {
  await store.fetchBanners()
  pickRandom()
  timer = setInterval(pickRandom, 5000)
})

onUnmounted(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div class="banner-slider">
    <Transition name="banner-fade">
      <img v-if="current" :key="current" :src="current" class="banner-img" alt="" />
    </Transition>
  </div>
</template>

<style scoped>
.banner-slider {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  overflow: hidden;
  background: #0a0e1a;
  position: relative;
}
.banner-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.banner-fade-enter-active,
.banner-fade-leave-active { transition: opacity 0.6s ease; }
.banner-fade-enter-from,
.banner-fade-leave-to     { opacity: 0; }
</style>

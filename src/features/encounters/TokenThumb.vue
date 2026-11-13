<script setup lang="ts">
/** A token's picture as a round thumbnail, or its initial. */
import type { ImageRef } from '@/domain/schema'
import { useImageUrl } from '@/ui/imageUrl'

const props = defineProps<{ image: ImageRef | null; name: string; size?: number }>()
const url = useImageUrl(() => props.image)
</script>

<template>
  <img v-if="url" :src="url" alt="" class="thumb" :style="{ width: `${size ?? 32}px`, height: `${size ?? 32}px` }" />
  <span v-else class="thumb none" :style="{ width: `${size ?? 32}px`, height: `${size ?? 32}px`, fontSize: `${(size ?? 32) * 0.45}px` }">{{ name.charAt(0).toUpperCase() }}</span>
</template>

<style scoped>
.thumb { border-radius: 50%; object-fit: cover; flex: none; border: 1px solid var(--line-strong); }
.none { display: inline-flex; align-items: center; justify-content: center; background: var(--bg-sunken); color: var(--text-dim); font-family: var(--font-title); }
</style>

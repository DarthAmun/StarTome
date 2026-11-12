<template>
  <span
    class="eot"
    :class="{ round: media === 'portrait', arch: item.archived }"
    :style="{ width: size + 'px', height: size + 'px', fontSize: Math.round(size * 0.38) + 'px', '--sw': item.swatch ?? undefined }"
  >
    <img v-if="item.image" :src="item.image" alt="" loading="lazy" />
    <span v-else-if="media === 'swatch'" class="eot-swatch" />
    <template v-else>{{ item.initial }}</template>
  </span>
</template>

<script setup lang="ts">
import type { BrowseItem, MediaKind } from '~/composables/useEntityBrowse'

defineProps<{ item: Pick<BrowseItem, 'image' | 'initial' | 'archived' | 'swatch'>; media: MediaKind; size: number }>()
</script>

<style scoped>
.eot {
  flex: none;
  position: relative;
  overflow: hidden;
  border-radius: 8px;
  display: grid;
  place-items: center;
  background: radial-gradient(circle at 50% 40%, color-mix(in srgb, var(--type-color, var(--accent)) 20%, transparent), transparent 75%), var(--bg);
  box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--type-color, var(--accent)) 60%, transparent);
  font-family: var(--fh);
  font-weight: 600;
  color: var(--type-color, var(--accent));
}
.eot.round { border-radius: 50%; }
.eot.arch { filter: grayscale(1); }
.eot img { width: 100%; height: 100%; object-fit: cover; }
.eot-swatch { position: absolute; inset: 0; background: var(--sw); }
</style>

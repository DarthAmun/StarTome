<script setup lang="ts">
/** The small picture of an entry in lists: its image, or its type's icon. */
import type { Entry } from '@/domain/schema'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { useImageUrl } from '@/ui/imageUrl'
import { entryImage } from './facts'

const props = defineProps<{ entry: Entry }>()
const url = useImageUrl(() => entryImage(props.entry))
</script>

<template>
  <span class="thumb" :class="entry.type" :style="{ '--type': ENTRY_TYPE_INFO[entry.type].color }">
    <img v-if="url" :src="url" alt="" loading="lazy" />
    <component :is="ENTRY_TYPE_INFO[entry.type].icon" v-else :size="17" />
  </span>
</template>

<style scoped>
.thumb { width: 38px; height: 38px; display: grid; place-items: center; border: 1px solid color-mix(in srgb, var(--type) 40%, var(--line)); border-radius: var(--radius); color: var(--type); background: color-mix(in srgb, var(--type) 8%, transparent); overflow: hidden; }
.thumb.npc { border-radius: 50%; }
.thumb img { width: 100%; height: 100%; object-fit: cover; }
</style>

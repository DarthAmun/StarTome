<script setup lang="ts">
/** A Game Icon by its stored name (`gi-castle`). The icon data loads once, apart from the app's first load. */
import { shallowRef, watchEffect } from 'vue'

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 16 })

type Icons = Record<string, { box: string; body: string }>
let loading: Promise<Icons> | null = null
const load = () => (loading ??= import('@/ui/gameIcons.gen').then(m => m.GAME_ICONS))

const icon = shallowRef<{ box: string; body: string } | null>(null)
watchEffect(async () => { icon.value = (await load())[props.name] ?? null })
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- generated at build time from the icon set, never user text -->
  <svg v-if="icon" :width="size" :height="size" :viewBox="icon.box" fill="currentColor" aria-hidden="true" v-html="icon.body" />
  <span v-else :style="{ display: 'inline-block', width: `${size}px`, height: `${size}px` }" />
</template>

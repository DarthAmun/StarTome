<script setup lang="ts">
/** Markdown as it reads, nothing editable: links open in the dock, dice roll. For cards, panels and lists. */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { isEntryTypeName } from '@/domain/links'
import { findEntryByName, rulesByName } from '@/data/repo'
import { entryImage } from '@/features/shared/facts'
import { rollDice } from '@/ui/dice'
import { imageUrlOf } from '@/ui/imageUrl'
import { renderMarkdown } from '@/ui/markdown'
import { peek } from '@/ui/workbench'

const props = defineProps<{ text: string; campaignId: string; /** Draws an NPC's portrait beside each mention of it. */ faces?: boolean }>()
const html = computed(() => renderMarkdown(props.text))
const el = ref<HTMLElement | null>(null)

/** After each render: the NPCs named in the text get their portrait in front of the name. */
async function drawFaces() {
  await nextTick()
  if (!props.faces || !el.value) return
  for (const a of el.value.querySelectorAll<HTMLElement>('a.ref[data-ref-type="npc"]:not([data-face])')) {
    a.dataset.face = '1'
    const entry = await findEntryByName(props.campaignId, 'npc', a.dataset.refName ?? '')
    const url = entry ? await imageUrlOf(entryImage(entry)) : null
    if (!url || !a.isConnected) continue
    const img = document.createElement('img')
    img.src = url; img.alt = ''; img.className = 'ref-face'
    a.prepend(img)
  }
}
onMounted(drawFaces)
watch([html, () => props.faces], drawFaces)

async function click(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-ref-type], [data-widget]')
  if (!el) return
  e.stopPropagation()
  if (el.dataset.widget) { if (el.dataset.expr) rollDice(el.dataset.expr, el.dataset.label); return }
  const type = el.dataset.refType ?? '', name = el.dataset.refName ?? ''
  if (isEntryTypeName(type)) { const entry = await findEntryByName(props.campaignId, type, name); if (entry) peek({ kind: 'entry', id: entry.id }) }
  else { const row = await rulesByName(name, type); if (row) peek({ kind: 'rules', id: row.id }) }
}
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
  <div ref="el" class="prose text" @click="click" v-html="html" />
</template>

<style scoped>
.text { font-size: .9rem; line-height: 1.45; }
.text :deep(h1), .text :deep(h2), .text :deep(h3) { font-size: .95rem; margin: .5em 0 .2em; }
.text :deep(p) { margin: 0 0 .4em; }
.text :deep(.ref-face) { width: 1.25em; height: 1.25em; border-radius: 50%; object-fit: cover; align-self: center; }
</style>

<script setup lang="ts">
/** Markdown as it reads, nothing editable: links open in the dock, dice roll. For cards, panels and lists. */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { isEntryTypeName } from '@/domain/links'
import { findEntryByName, rulesByName } from '@/data/repo'
import { rollDice } from '@/ui/dice'
import { renderMarkdown } from '@/ui/markdown'
import { peek } from '@/ui/workbench'
import { fillEmbeds, fillFaces } from './embeds'

const props = defineProps<{ text: string; campaignId: string }>()
const html = computed(() => renderMarkdown(props.text))
const el = ref<HTMLElement | null>(null)

/** After each render: linked entries get their picture in front of the name, `| entry` links their card. */
async function decorate() {
  await nextTick()
  if (!el.value) return
  void fillEmbeds(el.value, props.campaignId)
  void fillFaces(el.value, props.campaignId)
}
onMounted(decorate)
watch(html, decorate)

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
</style>

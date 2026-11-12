<script setup lang="ts">
/** One lore entry, read-only: used by the peek dock and the full page. (Editing arrives with the World phase.) */
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import type { Entry } from '@/domain/schema'
import { entries, findEntryByName, rulesByName } from '@/data/repo'
import { notify } from '@/ui/dialogs'
import { ENTRY_TYPE_INFO, isEntryType } from '@/ui/entryTypes'
import { useImageUrl } from '@/ui/imageUrl'
import { renderMarkdown } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'
import { peek } from '@/ui/workbench'
import { entryFacts, entryImage } from './facts'

const props = defineProps<{ entryId: string }>()

const entry = useLive<Entry | undefined>(() => entries.get(props.entryId), undefined, [() => props.entryId])
const outgoing = useLive(() => entries.linksFrom(props.entryId), [], [() => props.entryId])
const incoming = useLive(async () => {
  const links = await entries.linksTo(props.entryId)
  const sources = await Promise.all([...new Set(links.map(l => l.sourceId))].map(id => entries.get(id)))
  return sources.filter((e): e is Entry => !!e)
}, [] as Entry[], [() => props.entryId])

const info = computed(() => (entry.value ? ENTRY_TYPE_INFO[entry.value.type] : null))
const image = useImageUrl(() => (entry.value ? entryImage(entry.value) : null))
const facts = computed(() => (entry.value ? entryFacts(entry.value) : []))
const html = computed(() => {
  const resolved = new Set(outgoing.value.filter(l => l.targetEntryId).map(l => `${l.targetType}|${l.targetName.toLowerCase()}`))
  return renderMarkdown(entry.value?.body ?? '', { resolves: (type, name) => !isEntryType(type) || resolved.has(`${type}|${name.toLowerCase()}`) })
})

async function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>('.ref')
  if (!el || !entry.value) return
  e.preventDefault()
  const type = el.dataset.refType ?? '', name = el.dataset.refName ?? ''
  if (isEntryType(type)) {
    const target = await findEntryByName(entry.value.campaignId, type, name)
    if (target) peek({ kind: 'entry', id: target.id })
    else notify(`No ${ENTRY_TYPE_INFO[type].label.toLowerCase()} named “${name}” in this campaign.`)
    return
  }
  const rules = await rulesByName(name, type)
  if (rules) peek({ kind: 'rules', id: rules.id })
  else notify(`“${name}” is not in the compendium here yet.`)
}
</script>

<template>
  <article v-if="entry && info" class="entry" :style="{ '--type': info.color }">
    <header class="entry-head">
      <img v-if="image" :src="image" alt="" class="entry-img" :class="entry.type" />
      <div class="entry-title">
        <div class="eyebrow entry-type"><component :is="info.icon" :size="13" /> {{ info.label }}</div>
        <h1>{{ entry.name }} <Star v-if="entry.favorite" :size="16" class="fav" fill="currentColor" /></h1>
        <div v-if="entry.tags.length" class="entry-tags"><span v-for="t in entry.tags" :key="t" class="chip">#{{ t }}</span></div>
      </div>
    </header>
    <dl v-if="facts.length" class="facts">
      <template v-for="[k, v] in facts" :key="k"><dt>{{ k }}</dt><dd>{{ v }}</dd></template>
    </dl>
    <!-- eslint-disable-next-line vue/no-v-html -- sanitised by renderMarkdown -->
    <div v-if="entry.body.trim()" class="prose" @click="onClick" v-html="html" />
    <p v-else class="faint">Nothing written yet.</p>
    <footer v-if="incoming.length" class="backlinks">
      <div class="eyebrow">Referenced by</div>
      <button v-for="s in incoming" :key="s.id" class="chip link" :style="{ color: ENTRY_TYPE_INFO[s.type].color }" @click="peek({ kind: 'entry', id: s.id })">
        <component :is="ENTRY_TYPE_INFO[s.type].icon" :size="12" /> {{ s.name }}
      </button>
    </footer>
  </article>
  <p v-else class="empty">This entry no longer exists.</p>
</template>

<style scoped>
.entry { padding: 1.2rem 1.4rem 2rem; }
.entry-head { display: flex; gap: 1rem; align-items: center; padding-bottom: 1rem; border-bottom: 1px solid color-mix(in srgb, var(--type) 45%, var(--line)); margin-bottom: 1rem; }
.entry-img { width: 84px; height: 84px; object-fit: cover; border-radius: var(--radius); border: var(--frame); flex: none; }
.entry-img.npc { border-radius: 50%; border-color: var(--type); }
.entry-type { display: flex; align-items: center; gap: .4em; color: var(--type); margin-bottom: .25rem; }
.entry-title h1 { font-size: 1.5rem; }
.fav { color: var(--accent); vertical-align: middle; }
.entry-tags { display: flex; flex-wrap: wrap; gap: .3rem; margin-top: .5rem; }
.facts { display: grid; grid-template-columns: max-content 1fr; gap: .25rem 1rem; margin: 0 0 1.2rem; padding: .7rem .9rem; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); }
.facts dt { color: var(--text-faint); font-size: .78rem; letter-spacing: .08em; text-transform: uppercase; align-self: center; }
.facts dd { margin: 0; }
.backlinks { margin-top: 1.6rem; padding-top: 1rem; border-top: var(--frame); display: flex; flex-wrap: wrap; gap: .35rem; align-items: center; }
.backlinks .eyebrow { width: 100%; margin-bottom: .2rem; }
.link { background: none; cursor: pointer; }
.link:hover { border-color: currentColor; }
</style>

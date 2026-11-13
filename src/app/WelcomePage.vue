<script setup lang="ts">
/** The start: pick a campaign (or edit, copy, delete one), begin a new one, or bring your data over when there is none. */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, Pencil, Trash2 } from 'lucide-vue-next'
import { newId } from '@/domain/ids'
import type { Campaign } from '@/domain/schema'
import { campaignStats, cloneCampaign, deleteCampaign, type CampaignStats } from '@/data/campaigns'
import { createCampaign, rulesCount } from '@/data/repo'
import { createDemoCampaign } from '@/services/demo'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { ENTRY_TYPE_INFO, ENTRY_TYPE_ORDER } from '@/ui/entryTypes'
import { useLive } from '@/ui/useLive'
import { campaigns } from '@/ui/workbench'
import CampaignDialog from './CampaignDialog.vue'

const router = useRouter()
const name = ref('')
const game = ref<'pf2e' | 'sf2e'>('pf2e')
const editing = ref<Campaign | null>(null)
const hour = new Date().getHours()
const greeting = hour < 5 ? 'Still up?' : hour < 12 ? 'Good morning.' : hour < 18 ? 'Good afternoon.' : 'Good evening.'
const stats = useLive(async () => new Map<string, CampaignStats>(await Promise.all(campaigns.value.map(async c => [c.id, await campaignStats(c.id)] as const))), new Map<string, CampaignStats>(), [campaigns])
const compendium = useLive(() => rulesCount(), 0)
const act = (what: string, work: () => Promise<unknown>) => work().catch(err => reportError(what, err))

async function create() {
  if (!name.value.trim()) return
  try {
    const c = await createCampaign({ id: newId(), name: name.value.trim(), description: '', game: game.value })
    name.value = ''
    await router.push({ name: 'tonight', params: { campaignId: c.id } })
  } catch (err) { reportError('Creating the campaign', err) }
}
const demo = () => act('Creating the demo campaign', async () => router.push({ name: 'tonight', params: { campaignId: await createDemoCampaign() } }))
const clone = (c: Campaign) => act('Copying the campaign', () => cloneCampaign(c.id))
const remove = (c: Campaign) => act('Deleting the campaign', async () => {
  const s = stats.value.get(c.id)
  if (await confirmDialog({ title: `Delete “${c.name}”?`, body: `Its ${s?.entries ?? 0} entries, ${s?.encounters ?? 0} encounters, its party, inventory and layouts are deleted for good. Take a backup first if you are not sure.`, confirmLabel: 'Delete the campaign', danger: true })) await deleteCampaign(c.id)
})
</script>

<template>
  <div class="page welcome">
    <div class="eyebrow">StarTome · {{ greeting }}</div>
    <h1>Which table tonight?</h1>
    <div v-if="campaigns.length" class="cards">
      <div v-for="c in campaigns" :key="c.id" class="card panel" :class="c.game" :data-campaign="c.name">
        <RouterLink :to="{ name: 'tonight', params: { campaignId: c.id } }" class="open">
          <div class="eyebrow">{{ c.game === 'sf2e' ? 'Starfinder 2e' : 'Pathfinder 2e' }}</div>
          <h2>{{ c.name }}</h2>
          <p class="dim">{{ c.description }}</p>
        </RouterLink>
        <div v-if="stats.get(c.id)" class="pills">
          <RouterLink v-for="t in ENTRY_TYPE_ORDER.filter(x => stats.get(c.id)?.byType[x])" :key="t" :to="{ name: 'world', params: { campaignId: c.id }, query: { type: t } }" class="pill" :style="{ '--type': ENTRY_TYPE_INFO[t].color }"><b class="num">{{ stats.get(c.id)?.byType[t] }}</b> {{ ENTRY_TYPE_INFO[t].plural }}</RouterLink>
        </div>
        <div class="foot"><span class="faint">{{ stats.get(c.id)?.entries ?? 0 }} entries · changed {{ c.updatedAt.slice(0, 10) }}</span><span class="grow" />
          <button class="btn btn-ghost btn-icon" :aria-label="`Edit ${c.name}`" title="Settings" @click="editing = c"><Pencil :size="14" /></button>
          <button class="btn btn-ghost btn-icon" :aria-label="`Copy ${c.name}`" title="Copy" @click="clone(c)"><Copy :size="14" /></button>
          <button class="btn btn-ghost btn-icon" :aria-label="`Delete ${c.name}`" title="Delete" @click="remove(c)"><Trash2 :size="14" /></button>
        </div>
      </div>
    </div>
    <div v-else class="panel first">
      <h2>Nothing here yet</h2>
      <p class="dim">Bring your campaigns over from v0.42, begin a new one below, or look around in a small demo campaign.</p>
      <RouterLink :to="{ name: 'data' }" class="btn btn-primary">Open Import &amp; Backup</RouterLink>
    </div>
    <form class="new" @submit.prevent="create">
      <input v-model="name" class="input" placeholder="New campaign…" aria-label="New campaign name" />
      <select v-model="game" class="input game" aria-label="Game"><option value="pf2e">Pathfinder 2e</option><option value="sf2e">Starfinder 2e</option></select>
      <button class="btn" :disabled="!name.trim()">Begin</button>
    </form>
    <p class="faint more">
      <button class="linkish" data-test="demo-campaign" @click="demo">Create the demo campaign</button> ·
      Compendium: {{ compendium.toLocaleString() }} entries · <RouterLink :to="{ name: 'compendium-sync' }">Update from Foundry</RouterLink>
    </p>
    <CampaignDialog v-if="editing" :key="editing.id" :campaign="editing" @close="editing = null" />
  </div>
</template>

<style scoped>
.welcome { display: flex; flex-direction: column; align-items: center; padding-top: 12vh; gap: 1rem; }
.welcome h1 { font-size: 2.4rem; margin-bottom: 1rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 340px)); gap: 1rem; justify-content: center; width: 100%; }
.card { padding: 1.3rem 1.4rem .7rem; color: var(--text); display: flex; flex-direction: column; gap: .5rem; border-top: 3px solid #c9973a; transition: transform var(--speed) var(--ease), border-color var(--speed); }
.card.sf2e { border-top-color: #4cc9f0; }
.card:hover { text-decoration: none; transform: translateY(-2px); border-color: var(--line-strong); }
.card h2 { margin: .3rem 0 .5rem; font-size: 1.35rem; }
.first { padding: 1.6rem 2rem; text-align: center; max-width: 480px; }
.first h2 { margin-bottom: .5rem; }
.new { display: flex; gap: .5rem; margin-top: 1.5rem; width: min(520px, 100%); }
.game { width: auto; }
.open { color: var(--text); } .open:hover { text-decoration: none; } .open:hover h2 { color: var(--accent); }
.pills { display: flex; flex-wrap: wrap; gap: .2rem .9rem; font-size: .85rem; } .pill { color: var(--text-dim); } .pill b { color: var(--type); }
.foot { display: flex; align-items: center; gap: .2rem; border-top: var(--frame); padding-top: .4rem; margin-top: auto; font-size: .8rem; } .grow { flex: 1; }
.more { margin-top: .6rem; } .linkish { background: none; border: 0; padding: 0; color: var(--accent); }
</style>

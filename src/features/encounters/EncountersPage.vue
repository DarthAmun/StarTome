<script setup lang="ts">
/** Every encounter of the campaign: find, open, copy, resolve or re-open, delete. */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Copy, Plus, Trash2 } from 'lucide-vue-next'
import type { Encounter } from '@/domain/schema'
import { cloneEncounter, createEncounter, deleteEncounter, encounters } from '@/data/encounters'
import { reopenEncounter } from '@/data/resolution'
import { starships, startStarshipBattle } from '@/data/starships'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'
import EncounterTabs from './EncounterTabs.vue'
import ResolveDialog from './ResolveDialog.vue'

const props = defineProps<{ campaignId: string }>()
const router = useRouter()

const STATUS: Record<Encounter['status'], string> = { prepared: 'Prepared', active: 'Running', resolved: 'Resolved' }
const rows = useLive(async () => {
  const list = await encounters.ofCampaign(props.campaignId)
  const counts = await encounters.counts(list.map(e => e.id))
  return list.map(e => ({ e, tokens: counts.get(e.id) ?? 0 }))
}, [], [() => props.campaignId])
const search = ref('')
const status = ref<Encounter['status'] | ''>('')
const shown = computed(() => { const q = search.value.trim().toLowerCase(); return rows.value.filter(r => (!q || r.e.name.toLowerCase().includes(q)) && (!status.value || r.e.status === status.value)) })
const resolving = ref<string | null>(null)

const open = (id: string) => router.push({ name: 'encounter', params: { campaignId: props.campaignId, encounterId: id } })
const act = (what: string, work: () => Promise<unknown>) => work().catch(err => reportError(what, err))
const ship = useLive(() => starships.active(props.campaignId), null, [() => props.campaignId])
const starshipBattle = () => act('Starting the starship battle', async () => { if (ship.value) open(await startStarshipBattle(ship.value)) })
const create = () => act('Creating the encounter', async () => open((await createEncounter(props.campaignId)).id))
const clone = (e: Encounter) => act('Copying the encounter', async () => { await cloneEncounter(e.id) })
const remove = (e: Encounter) => act('Deleting the encounter', async () => {
  if (await confirmDialog({ title: `Delete “${e.name}”?`, body: 'Its map setup, tokens, log and planned loot are deleted with it.', confirmLabel: 'Delete', danger: true })) await deleteEncounter(e.id)
})
const reopen = (e: Encounter) => act('Re-opening the encounter', async () => {
  if (!await confirmDialog({ title: `Re-open “${e.name}”?`, body: 'Its XP award is undone and its loot comes back from the stash as far as it is still there.', confirmLabel: 'Re-open' })) return
  const short = await reopenEncounter(e.id)
  if (short.names.length || short.cp) notify(`Could not take back: ${[...short.names, short.cp ? 'some coins' : ''].filter(Boolean).join(', ')}.`)
})
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Encounters</h1><button v-if="ship" class="btn" :title="`A battle aboard ${ship.name}: a copy of its interior with the crew at their stations`" data-test="new-starship-battle" @click="starshipBattle">+ Starship</button><button class="btn btn-primary" data-test="new-encounter" @click="create"><Plus :size="15" /> New encounter</button></div>
    <EncounterTabs :campaign-id="campaignId" />
    <div class="filters">
      <input v-model="search" class="input" placeholder="Search encounters…" aria-label="Search encounters" />
      <select v-model="status" class="input st" aria-label="Status"><option value="">Any status</option><option v-for="(l, k) in STATUS" :key="k" :value="k">{{ l }}</option></select>
    </div>
    <ul class="list" data-test="encounter-list">
      <li v-for="{ e, tokens } in shown" :key="e.id" class="panel" :data-encounter="e.name">
        <button class="main" @click="open(e.id)">
          <b>{{ e.name }}</b><span class="chip" :class="e.status">{{ STATUS[e.status] }}</span>
          <span class="faint">{{ tokens }} token{{ tokens === 1 ? '' : 's' }}{{ e.map ? ' · map' : ' · no map' }}{{ e.fovEnabled ? ' · sight' : '' }}{{ e.starship ? (e.starship.role === 'interior' ? ' · ship interior' : ' · starship battle') : '' }}{{ e.status === 'active' ? ` · round ${e.turn.round}` : '' }}{{ e.status === 'resolved' && e.xpAwarded != null ? ` · ${e.xpAwarded} XP each` : '' }}</span>
        </button>
        <button v-if="e.status !== 'resolved'" class="btn" :data-resolve="e.name" @click="resolving = e.id">Resolve…</button>
        <button v-else class="btn" @click="reopen(e)">Re-open</button>
        <button class="btn btn-icon" title="Copy" :aria-label="`Copy ${e.name}`" @click="clone(e)"><Copy :size="14" /></button>
        <button class="btn btn-icon btn-danger" title="Delete" :aria-label="`Delete ${e.name}`" @click="remove(e)"><Trash2 :size="14" /></button>
      </li>
    </ul>
    <p v-if="!shown.length" class="empty">{{ rows.length ? 'No encounter matches.' : 'No encounters yet. Start one here, or put one together in the builder.' }}</p>
    <ResolveDialog v-if="resolving" :encounter-id="resolving" @close="resolving = null" />
  </div>
</template>

<style scoped>
.filters { display: flex; gap: .5rem; margin-bottom: .8rem; max-width: 40rem; } .st { width: auto; }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; }
.list li { display: flex; align-items: center; gap: .4rem; padding: .3rem .5rem; }
.main { flex: 1; display: flex; align-items: baseline; gap: .7rem; background: none; border: 0; text-align: left; padding: .35rem .3rem; min-width: 0; }
.main:hover b { color: var(--accent); }
.chip.active { color: var(--accent); border-color: var(--accent); } .chip.resolved { color: var(--text-faint); }
</style>

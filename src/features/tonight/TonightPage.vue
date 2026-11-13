<script setup lang="ts">
/** Tonight: the campaign's home. The session in hand, open quests, the party, what changed last. */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { updateCampaign } from '@/data/campaigns'
import { pickImage, storeImage } from '@/services/images'
import { reportError } from '@/ui/dialogs'
import type { Entry, EntryOf } from '@/domain/schema'
import { characters, entries as entryRepo } from '@/data/repo'
import { ENTRY_TYPE_INFO, ENTRY_TYPE_ORDER } from '@/ui/entryTypes'
import { useImageUrl } from '@/ui/imageUrl'
import { excerpt } from '@/ui/markdown'
import { useLive } from '@/ui/useLive'
import { campaign, campaignId, peek } from '@/ui/workbench'

const all = useLive<Entry[]>(() => (campaignId.value ? entryRepo.ofCampaign(campaignId.value) : Promise.resolve([])), [], [campaignId])
const recent = useLive<Entry[]>(() => (campaignId.value ? entryRepo.recent(campaignId.value, 8) : Promise.resolve([])), [], [campaignId])
const party = useLive(() => (campaignId.value ? characters.ofCampaign(campaignId.value) : Promise.resolve([])), [], [campaignId])
const banner = useImageUrl(() => campaign.value?.banner, true)

const sessions = computed(() => all.value.filter((e): e is EntryOf<'session'> => e.type === 'session')
  .sort((a, b) => (Number(b.data.number) || 0) - (Number(a.data.number) || 0) || b.updatedAt.localeCompare(a.updatedAt)))
/** The session being run, else the one being planned, else the last one played. */
const current = computed(() => sessions.value.find(s => s.data.mode === 'running') ?? sessions.value.find(s => s.data.mode === 'planning') ?? sessions.value[0] ?? null)
const quests = computed(() => all.value.filter((e): e is EntryOf<'quest'> => e.type === 'quest' && e.data.status === 'active'))
const counts = computed(() => ENTRY_TYPE_ORDER.map(t => ({ t, n: all.value.filter(e => e.type === t).length })).filter(c => c.n))
const partyLevel = computed(() => {
  const pcs = party.value.filter(c => c.role === 'pc' || c.treatAsPc)
  return pcs.length ? Math.floor(pcs.reduce((n, c) => n + c.level, 0) / pcs.length) : null
})
const router = useRouter()
async function setBanner() {
  const file = await pickImage()
  if (file && campaign.value) await updateCampaign(campaign.value.id, { banner: await storeImage(file) }).catch(err => reportError('Setting the banner', err))
}
const board = (id: string) => router.push({ name: 'session', params: { campaignId: campaign.value?.id, sessionId: id } })
const MODE: Record<string, string> = { running: 'Running now', planning: 'In preparation', finished: 'Last played' }
</script>

<template>
  <div v-if="campaign" class="page tonight">
    <header class="hero" :class="{ 'has-banner': banner }" :style="banner ? { backgroundImage: `linear-gradient(180deg, transparent, var(--bg) 92%), url(${banner})` } : {}">
      <div class="eyebrow">{{ campaign.game === 'sf2e' ? 'Starfinder 2e' : 'Pathfinder 2e' }} · {{ campaign.rules.advancement === 'milestone' ? 'milestones' : 'experience points' }}</div>
      <h1>{{ campaign.name }}</h1>
      <p v-if="campaign.description" class="dim">{{ campaign.description }}</p>
      <div class="links">
        <RouterLink class="btn" :to="{ name: 'graphs', params: { campaignId: campaign.id } }">Relationship graphs</RouterLink>
        <button class="btn btn-ghost" @click="setBanner">{{ banner ? 'Change banner' : 'Add a banner' }}</button>
        <button v-if="banner" class="btn btn-ghost" @click="updateCampaign(campaign.id, { banner: null })">Remove banner</button>
      </div>
    </header>

    <div class="grid">
      <section class="panel block session">
        <div class="eyebrow">{{ current ? MODE[current.data.mode] : 'Session' }}</div>
        <template v-if="current">
          <h2 class="clickable" @click="peek({ kind: 'entry', id: current.id })">{{ current.name }}</h2>
          <p class="faint">{{ [current.data.number && `Session ${current.data.number}`, current.data.date].filter(Boolean).join(' · ') }}</p>
          <p class="dim">{{ excerpt(current.body, 320) || 'Nothing on its board yet.' }}</p>
          <button class="btn btn-primary" data-test="open-board" @click="board(current.id)">{{ current.data.mode === 'running' ? 'Back to the board' : 'Open the board' }}</button>
        </template>
        <p v-else class="faint">No sessions yet.</p>
      </section>

      <section class="panel block">
        <div class="eyebrow">Party<template v-if="partyLevel !== null"> · level {{ partyLevel }}</template></div>
        <p v-if="!party.length" class="faint">No party members yet.</p>
        <div v-for="c in party" :key="c.id" class="line" :class="{ clickable: c.entryId }" @click="c.entryId && peek({ kind: 'entry', id: c.entryId })">
          <span>{{ c.name }}</span><span class="faint">{{ c.role === 'companion' ? 'companion' : '' }}</span><span class="num">Lv {{ c.level }}</span>
        </div>
      </section>

      <section class="panel block">
        <div class="eyebrow">Open quests</div>
        <p v-if="!quests.length" class="faint">No active quests.</p>
        <div v-for="q in quests" :key="q.id" class="line clickable" @click="peek({ kind: 'entry', id: q.id })">
          <span>{{ q.name }}</span><span class="faint">{{ q.data.giver.name }}</span>
        </div>
      </section>

      <section class="panel block">
        <div class="eyebrow">Last touched</div>
        <div v-for="e in recent" :key="e.id" class="line clickable" @click="peek({ kind: 'entry', id: e.id })">
          <span><component :is="ENTRY_TYPE_INFO[e.type].icon" :size="13" :style="{ color: ENTRY_TYPE_INFO[e.type].color }" /> {{ e.name }}</span>
          <span class="faint">{{ e.updatedAt.slice(0, 10) }}</span>
        </div>
      </section>
    </div>

    <div class="counts">
      <RouterLink v-for="c in counts" :key="c.t" :to="{ name: 'world', params: { campaignId: campaign.id } }" class="count" :style="{ '--type': ENTRY_TYPE_INFO[c.t].color }">
        <span class="num">{{ c.n }}</span> {{ ENTRY_TYPE_INFO[c.t].plural }}
      </RouterLink>
    </div>
  </div>
</template>

<style scoped>
.hero { padding: 2.2rem 0 1.4rem; margin: -1.6rem -2rem 1.2rem; padding-inline: 2rem; background-size: cover; background-position: center; }
.hero.has-banner { padding-top: 7rem; }
.hero h1 { font-size: 2.3rem; margin: .3rem 0 .5rem; }
.hero p { max-width: 720px; }
.links { display: flex; gap: .4rem; flex-wrap: wrap; margin-top: .8rem; }
.grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 1rem; }
.block { padding: 1rem 1.2rem; }
.block .eyebrow { margin-bottom: .6rem; color: var(--accent); }
.session h2 { font-size: 1.4rem; margin-bottom: .2rem; }
.line { display: flex; gap: .8rem; align-items: baseline; padding: .28rem 0; border-bottom: var(--frame); }
.line:last-child { border-bottom: 0; }
.line > :first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.clickable { cursor: pointer; }
.clickable:hover { color: var(--accent); }
.counts { display: flex; flex-wrap: wrap; gap: .5rem 1.4rem; margin-top: 1.4rem; }
.count { color: var(--text-dim); }
.count .num { color: var(--type); font-size: 1.15rem; margin-right: .2rem; }
</style>

<script setup lang="ts">
/** The start: pick a campaign, or bring your data over when there is none. */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { newId } from '@/domain/ids'
import { createCampaign } from '@/data/repo'
import { reportError } from '@/ui/dialogs'
import { campaigns } from '@/ui/workbench'

const router = useRouter()
const name = ref('')
const game = ref<'pf2e' | 'sf2e'>('pf2e')

async function create() {
  if (!name.value.trim()) return
  try {
    const c = await createCampaign({ id: newId(), name: name.value.trim(), description: '', game: game.value })
    name.value = ''
    await router.push({ name: 'tonight', params: { campaignId: c.id } })
  } catch (err) { reportError('Creating the campaign', err) }
}
</script>

<template>
  <div class="page welcome">
    <div class="eyebrow">StarTome · rework preview</div>
    <h1>Which table tonight?</h1>
    <div v-if="campaigns.length" class="cards">
      <RouterLink v-for="c in campaigns" :key="c.id" :to="{ name: 'tonight', params: { campaignId: c.id } }" class="card panel" :class="c.game">
        <div class="eyebrow">{{ c.game === 'sf2e' ? 'Starfinder 2e' : 'Pathfinder 2e' }}</div>
        <h2>{{ c.name }}</h2>
        <p class="dim">{{ c.description }}</p>
      </RouterLink>
    </div>
    <div v-else class="panel first">
      <h2>Nothing here yet</h2>
      <p class="dim">Your campaigns are still in v0.42. Bring them over; the old app stays as it is.</p>
      <RouterLink :to="{ name: 'data' }" class="btn btn-primary">Open Import &amp; Backup</RouterLink>
    </div>
    <form class="new" @submit.prevent="create">
      <input v-model="name" class="input" placeholder="New campaign…" aria-label="New campaign name" />
      <select v-model="game" class="input game" aria-label="Game"><option value="pf2e">Pathfinder 2e</option><option value="sf2e">Starfinder 2e</option></select>
      <button class="btn" :disabled="!name.trim()">Begin</button>
    </form>
  </div>
</template>

<style scoped>
.welcome { display: flex; flex-direction: column; align-items: center; padding-top: 12vh; gap: 1rem; }
.welcome h1 { font-size: 2.4rem; margin-bottom: 1rem; }
.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 340px)); gap: 1rem; justify-content: center; width: 100%; }
.card { padding: 1.3rem 1.4rem; color: var(--text); border-top: 3px solid #c9973a; transition: transform var(--speed) var(--ease), border-color var(--speed); }
.card.sf2e { border-top-color: #4cc9f0; }
.card:hover { text-decoration: none; transform: translateY(-2px); border-color: var(--line-strong); }
.card h2 { margin: .3rem 0 .5rem; font-size: 1.35rem; }
.first { padding: 1.6rem 2rem; text-align: center; max-width: 480px; }
.first h2 { margin-bottom: .5rem; }
.new { display: flex; gap: .5rem; margin-top: 1.5rem; width: min(520px, 100%); }
.game { width: auto; }
</style>

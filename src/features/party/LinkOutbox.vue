<script setup lang="ts">
/** What was sent to the players and what became of it, and the rolls they made. */
import { computed } from 'vue'
import { isFinal, outbox } from '@/data/link'
import { clearAnswered, link, withdraw } from '@/services/characterLink/link'
import { reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'

const props = defineProps<{ campaignId: string }>()
const rows = useLive(() => outbox.ofCampaign(props.campaignId), [])
const answered = computed(() => rows.value.filter(r => isFinal(r.state)).length)
const STATE: Record<string, string> = { outbox: 'not sent yet', queued: 'waits for the player to come online', delivered: 'waiting for the player', accepted: 'accepted', declined: 'declined', withdrawn: 'withdrawn', expired: 'expired', failed: 'failed' }
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
const run = (what: string, work: Promise<unknown>) => { void work.catch(err => reportError(what, err)) }
</script>

<template>
  <div v-if="rows.length" class="box" data-test="link-outbox">
    <div class="head"><span class="eyebrow">Sent</span><span class="grow" /><button v-if="answered" class="btn btn-ghost" @click="run('Clearing', clearAnswered(campaignId))">Clear answered ({{ answered }})</button></div>
    <div v-for="r in rows.slice(0, 30)" :key="r.id" class="row" :class="r.state" :data-sent="r.summary">
      <span class="faint num">{{ time(r.createdAt) }}</span>
      <span class="what">{{ r.summary }}<b v-if="r.roll"> · {{ r.roll.total }}<template v-if="r.roll.degree"> ({{ r.roll.degree.replace(/([A-Z])/g, ' $1').toLowerCase() }})</template></b></span>
      <span class="state" :title="r.reason ?? undefined">{{ STATE[r.state] }}<template v-if="r.reason">: {{ r.reason }}</template></span>
      <button v-if="!isFinal(r.state)" class="btn" @click="run('Withdrawing', withdraw(r))">Withdraw</button><span v-else />
    </div>
  </div>
  <div v-if="link.rolls.length" class="box" data-test="link-rolls">
    <span class="eyebrow">Players' rolls</span>
    <div v-for="r in link.rolls.slice(0, 8)" :key="r.id" class="row"><span class="faint num">{{ time(r.at) }}</span><span class="what"><b>{{ r.who }}</b> · {{ r.line }}</span><span /><span /></div>
  </div>
</template>

<style scoped>
.box { display: flex; flex-direction: column; gap: .1rem; margin-top: .3rem; }
.head { display: flex; align-items: center; } .grow { flex: 1; }
.row { display: grid; grid-template-columns: 5.2rem minmax(0, 1fr) auto auto; gap: .7rem; align-items: baseline; padding: .15rem 0; border-bottom: var(--frame); }
.row .faint { white-space: nowrap; }
.state { color: var(--text-dim); font-size: .85rem; }
.row.accepted .state { color: var(--ok); } .row.declined .state, .row.failed .state, .row.expired .state { color: var(--warn); }
.row.withdrawn .what { text-decoration: line-through; color: var(--text-faint); }
</style>

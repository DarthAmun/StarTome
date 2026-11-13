<script setup lang="ts">
/** Wealth: what the party was awarded against the treasure table, the pace within this level, the gear check and treasure awards. */
import { computed, ref, shallowRef, watch } from 'vue'
import type { CampaignRules, GameId } from '@/domain/game'
import { formatMoney, parseMoney } from '@/domain/rules/format'
import { characterOwner, parseOwner, partyTotals, STASH, type InventoryEntry as Stack } from '@/domain/rules/inventory'
import { isPartyMember, type PartyLevel } from '@/domain/rules/party'
import { GAME_RULES } from '@/domain/rules/registry'
import type { Item } from '@/domain/rules/types'
import { gearCheck, gearPiece, type GearPiece } from '@/domain/rules/wealth'
import type { Character, LedgerEntry } from '@/domain/schema'
import { awardTreasure, undoTreasureAward, updateCampaignRules, type TreasureAwardEntry } from '@/data/party'
import { loadWealth, type WealthState } from '@/data/wealth'
import { reportError } from '@/ui/dialogs'
import TreasureRoll from './TreasureRoll.vue'

const props = defineProps<{ campaignId: string; game: GameId; rules: CampaignRules; characters: Character[]; party: PartyLevel; ledger: LedgerEntry[]; stacks: Stack[]; items: Map<string, Item>; purses: Record<string, number> }>()

const state = shallowRef<WealthState | null>(null)
const money = (cp: number) => formatMoney({ cp }, props.game)
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })
const awards = computed(() => props.ledger.filter((l): l is TreasureAwardEntry => l.kind === 'treasureAward'))

let seq = 0
// Inventory edits, awards, level-ups, roster changes and the campaign's options all move the numbers
watch(() => [props.ledger, props.characters, props.party, props.rules] as const, async () => {
  const mine = ++seq
  try {
    const next = await loadWealth(props.campaignId, { level: props.party.level, size: props.party.size, xps: props.characters.filter(isPartyMember).map(c => c.xp) })
    if (mine === seq) state.value = next
  } catch (err) { reportError('Reading the wealth', err) }
}, { immediate: true })

const setRule = (patch: Partial<CampaignRules>) => updateCampaignRules(props.campaignId, patch).catch(err => reportError('Saving the option', err))
const tone = computed(() => { const r = state.value?.readout?.ratio; return r === null || r === undefined ? '' : r < 0.8 ? 'low' : r > 1.25 ? 'high' : 'ok' })
const paceText = computed(() => { const p = state.value?.pace; return !p ? '' : p.remaining >= 0 ? `${money(p.remaining)} left to give this level` : `${money(-p.remaining)} ahead of this level` })
const owned = computed(() => partyTotals(props.stacks.filter(e => parseOwner(e.owner).kind !== 'encounter'), props.items, Object.entries(props.purses).map(([owner, cp]) => ({ owner, cp })), 'gm', props.game !== 'sf2e').total)

const gear = computed(() => props.characters.filter(isPartyMember).map((c) => {
  const pieces = props.stacks.filter(e => e.owner === characterOwner(c.id)).map(e => gearPiece(e, e.itemId ? props.items.get(e.itemId) : undefined)).filter((p): p is GearPiece => !!p)
  return { id: c.id, name: c.name, level: c.level, lines: gearCheck(props.game, c.level, pieces, props.rules.abp) }
}))

const amount = ref('')
const label = ref('')
const amountCp = computed(() => { const cp = parseMoney(amount.value, props.game); return cp !== null && cp > 0 ? cp : null })
async function record() {
  if (amountCp.value === null) return
  await awardTreasure(props.campaignId, { value: amountCp.value, consumables: 0 }, label.value.trim() || 'Award').catch(err => reportError('Recording the award', err))
  amount.value = ''; label.value = ''
}
const rolling = ref(false)
</script>

<template>
  <section class="wealth">
    <div class="head">
      <h2>Wealth</h2><span class="grow" />
      <label class="faint" title="Off: consumables are left out of what was awarded, and the expected side subtracts the table's consumables priced at the compendium median (an estimate)"><input type="checkbox" :checked="rules.countConsumables" @change="setRule({ countConsumables: !rules.countConsumables })" /> Count consumables</label>
      <label class="faint" title="Automatic Bonus Progression: no rune check on the gear"><input type="checkbox" :checked="rules.abp" @change="setRule({ abp: !rules.abp })" /> ABP</label>
    </div>
    <p v-if="!state" class="faint">Loading…</p>
    <p v-else-if="!state.readout" class="faint">Add party members to see the wealth readout.</p>
    <template v-else>
      <div class="readout">
        <div class="big"><span class="pct num" :class="tone" data-test="wealth-pct">{{ state.readout.ratio === null ? '—' : `${Math.round(state.readout.ratio * 100)}%` }}</span><span class="faint">of the treasure expected by now</span></div>
        <div class="lines">
          <p>Awarded <b>{{ money(state.readout.awarded) }}</b><template v-if="state.readout.expected"> of <b>{{ money(state.readout.expected) }}</b></template><span v-else class="faint"> · nothing is expected yet at the very start of level 1</span><span v-if="state.readout.estimate" class="chip" title="The consumable share is priced from the compendium's median consumable price per level">estimate</span></p>
          <p>Matches level <b>{{ state.readout.matches.level }}</b>, {{ Math.round(Math.min(1, state.readout.matches.progress) * 100) }}% of the way through <span class="faint">· party level {{ party.level }}, counting {{ rules.advancement === 'xp' ? 'their XP toward the next level' : 'the encounters since the last level-up' }}</span></p>
          <p class="faint">Baseline {{ money(rules.startingTreasure) }} <template v-if="rules.baselineAt">(level {{ rules.startingLevel }}, {{ when(rules.baselineAt) }})</template><template v-else>(not set)</template> · encounters +{{ money(state.sinceBaseline.encounters) }} · other awards +{{ money(state.sinceBaseline.manual) }}</p>
          <p class="faint" title="What the party holds now, at GM values. Information only: the % measures what was awarded.">Owned now {{ money(owned) }}</p>
          <p v-if="!rules.baselineAt" class="note">For a running campaign, enter the party's items and coins in the inventory and press <b>Set treasure baseline</b>. From then on only resolved loot and what you add “as treasure” counts.</p>
          <p v-if="rules.abp" class="note">ABP is on: the gear check skips runes. GM Core gives no reduced treasure table for ABP, so the expected side stays the standard table.</p>
        </div>
        <div v-if="state.pace" class="pace" title="Treasure awarded since the last level-up against this level's row of Party Treasure by Level">
          <p>This level: <b>{{ money(state.pace.awarded) }}</b> of {{ money(state.pace.expected) }} <span class="faint">· {{ paceText }}</span></p>
          <div class="meter"><div :style="{ width: `${Math.min(100, state.pace.fraction * 100)}%` }" :class="{ over: state.pace.fraction > 1 }" /></div>
        </div>
      </div>

      <div class="eyebrow">Gear check <span v-if="!GAME_RULES[game].gear.verified" class="chip" title="The SF2e grade levels follow PF2e's rune levels and still need checking against the book">unverified</span></div>
      <p v-if="rules.abp && game === 'pf2e'" class="faint">ABP replaces fundamental runes; nothing to check.</p>
      <div v-else class="gear">
        <div v-for="g in gear" :key="g.id" class="gear-row">
          <span>{{ g.name }} <span class="faint num">{{ g.level }}</span></span>
          <span v-for="l in g.lines" :key="l.kind" :class="l.status" :title="l.piece ? `${l.piece.name}: ${l.have}; expected at level ${g.level}: ${l.expected}` : `No ${l.kind} in their inventory`">{{ l.kind }}: {{ l.have }} <span class="faint">/ {{ l.expected }}</span></span>
        </div>
      </div>

      <div class="eyebrow">Treasure awards</div>
      <div class="award">
        <input v-model="amount" class="input amt" :placeholder="game === 'sf2e' ? 'e.g. 500 cr' : 'e.g. 40 gp'" aria-label="Award value" />
        <input v-model="label" class="input" placeholder="What it was (e.g. a reward from the guild)" aria-label="Award label" @keydown.enter="record" />
        <button class="btn" :disabled="amountCp === null" title="Counts toward the wealth readout without adding an item or coins" data-test="record-award" @click="record">Record award</button>
        <button v-if="party.level !== null" class="btn" @click="rolling = !rolling">{{ rolling ? 'Close the roll' : 'Roll treasure…' }}</button>
      </div>
      <TreasureRoll v-if="rolling && party.level !== null" class="panel rollbox" :campaign-id="campaignId" :game="game" :owner="STASH" :level="party.level" :party-size="party.size" :pace="state.pace" :stacks="stacks" @added="(v, l) => awardTreasure(campaignId, v, l)" />
      <div v-for="a in awards.slice(0, 15)" :key="a.id" class="log" :class="{ undone: a.undoneAt }">
        <span class="faint">{{ when(a.at) }}</span><span class="what">{{ a.label }}</span>
        <span class="num">+{{ money(a.value) }}<template v-if="a.consumables"> ({{ money(a.consumables) }} consumables)</template></span>
        <span v-if="a.undoneAt" class="faint">undone</span><button v-else class="btn" @click="undoTreasureAward(a.id)">Undo</button>
      </div>
      <p v-if="!awards.length" class="faint">Resolved encounter loot counts on its own. Tick “as treasure” when adding items or coins outside an encounter.</p>
    </template>
  </section>
</template>

<style scoped>
.wealth { display: flex; flex-direction: column; gap: .6rem; }
.wealth p { margin: 0; }
.head, .award { display: flex; align-items: center; gap: .7rem; flex-wrap: wrap; }
.grow { flex: 1; }
.readout { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: .4rem 1.4rem; padding: .8rem 1rem; border: var(--frame); border-radius: var(--radius); background: var(--bg-raised); }
.big { display: flex; flex-direction: column; }
.pct { font-size: 2.2rem; line-height: 1.1; }
.pct.low { color: var(--warn); } .pct.high { color: var(--accent-2); } .pct.ok { color: var(--ok); }
.lines { display: flex; flex-direction: column; gap: .2rem; }
.note { padding: .35rem .6rem; border-left: 3px solid var(--accent); background: var(--accent-soft); }
.pace { grid-column: 1 / -1; display: flex; flex-direction: column; gap: .25rem; }
.meter { height: 6px; background: var(--bg-sunken); border: var(--frame); }
.meter div { height: 100%; background: var(--accent); } .meter .over { background: var(--accent-2); }
.eyebrow { margin-top: .5rem; display: flex; gap: .5rem; align-items: center; }
.gear { display: flex; flex-direction: column; }
.gear-row { display: grid; grid-template-columns: minmax(8rem, 1fr) 1fr 1fr; gap: 1rem; padding: .2rem 0; border-bottom: var(--frame); }
.behind, .none { color: var(--warn); } .ahead { color: var(--accent); }
.amt { width: 9rem; } .award .input:not(.amt) { flex: 1; min-width: 12rem; }
.rollbox { padding: .7rem .9rem; }
.log { display: grid; grid-template-columns: 7rem minmax(0, 1fr) auto auto; gap: .8rem; align-items: baseline; padding: .2rem 0; border-bottom: var(--frame); }
.log.undone .what, .log.undone .num { text-decoration: line-through; color: var(--text-faint); }
</style>

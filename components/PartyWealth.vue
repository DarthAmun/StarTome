<template>
  <section class="pw party-section">
    <div class="pw-head">
      <div class="party-section-title">Wealth</div>
      <div class="pw-options">
        <label class="pw-check" title="Off: consumables are left out of what was awarded, and the expected side subtracts GM Core's consumables priced at the compendium median (an estimate)">
          <input type="checkbox" :checked="state?.rules.countConsumables ?? true" @change="setRule({ countConsumables: !state?.rules.countConsumables })" />
          Count consumables
        </label>
        <label class="pw-check" title="Automatic Bonus Progression: no rune check on the gear">
          <input type="checkbox" :checked="state?.rules.abp ?? false" @change="setRule({ abp: !state?.rules.abp })" />
          ABP
        </label>
      </div>
    </div>

    <div v-if="!state" class="party-empty">Loading…</div>
    <div v-else-if="!state.readout" class="party-empty">Add party members to see the wealth readout.</div>
    <template v-else>
      <div class="pw-panel">
        <!-- Readout -->
        <div class="pw-main">
          <div class="pw-big">
            <span class="pw-pct" :class="statusClass">{{ state.readout.ratio == null ? '—' : `${Math.round(state.readout.ratio * 100)}%` }}</span>
            <span class="pw-dim">of the treasure expected by now</span>
          </div>
          <div class="pw-line">
            Awarded <b>{{ money(state.readout.awarded) }}</b>
            <template v-if="state.readout.expected">of <b>{{ money(state.readout.expected) }}</b></template>
            <span v-else class="pw-dim">· nothing is expected yet at the very start of level 1</span>
            <span v-if="state.readout.estimate" class="pw-tag" title="The consumable share is priced from the compendium's median consumable price per level">estimate</span>
          </div>
          <div class="pw-line">
            Matches level <b>{{ state.readout.matches.level }}</b>, {{ Math.round(Math.min(1, state.readout.matches.progress) * 100) }}% of the way through
            <span class="pw-dim">· party level {{ party.level }}{{ progressNote }}</span>
          </div>
          <div class="pw-line pw-dim">
            Baseline {{ money(state.rules.startingTreasure) }}
            <template v-if="state.rules.baselineAt">(level {{ state.rules.startingLevel }}, {{ formatDate(state.rules.baselineAt) }})</template>
            <template v-else>(not set)</template>
            · encounters +{{ money(state.sinceBaseline.encounters) }} · other awards +{{ money(state.sinceBaseline.manual) }}
          </div>
          <div class="pw-line pw-dim" title="What the party holds now, at GM values. Information only: the % measures what was awarded.">
            Owned now {{ money(owned) }}
          </div>
          <div v-if="!state.rules.baselineAt" class="pw-note">
            For a running campaign, enter the party's items and coins in the inventory and press <b>Set treasure baseline</b>. From then on only resolved loot and items added “as treasure” count.
          </div>
          <div v-if="state.rules.abp" class="pw-note">
            ABP is on: the gear check skips runes. The expected treasure still uses the standard table; GM Core's ABP-reduced values aren't entered yet.
          </div>
        </div>

        <!-- Pace -->
        <div v-if="state.pace" class="pw-pace" title="Treasure awarded since the last level-up against this level's row of Party Treasure by Level">
          <div class="pw-line">
            This level: <b>{{ money(state.pace.awarded) }}</b> of {{ money(state.pace.expected) }}
            <span class="pw-dim">· {{ paceText }}</span>
          </div>
          <span class="pw-bar"><span :style="{ width: `${Math.min(100, state.pace.fraction * 100)}%` }" :class="{ over: state.pace.fraction > 1 }" /></span>
        </div>
      </div>

      <!-- Gear check -->
      <div class="pw-subtitle">
        Gear check
        <span v-if="!gearVerified" class="pw-tag" title="The SF2e grade levels follow PF2e's rune levels and still need checking against the book">unverified</span>
      </div>
      <div v-if="state.rules.abp && game === 'pf2e'" class="party-empty">ABP replaces fundamental runes; nothing to check.</div>
      <div v-else-if="!gear.length" class="party-empty">No party members.</div>
      <div v-else class="pw-gear">
        <div v-for="g in gear" :key="g.id" class="pw-gear-row">
          <span class="pw-gear-name">{{ g.name }} <span class="pw-dim">· {{ g.level }}</span></span>
          <span v-for="l in g.lines" :key="l.kind" class="pw-gear-cell" :class="`pw-gear--${l.status}`"
            :title="l.piece ? `${l.piece.name}: ${l.have}; expected at level ${g.level}: ${l.expected}` : `No ${l.kind} in their inventory`">
            <OhVueIcon :name="l.kind === 'weapon' ? 'gi-broadsword' : 'gi-checked-shield'" scale="0.7" />
            {{ l.have }}
            <span class="pw-dim">/ {{ l.expected }}</span>
          </span>
        </div>
      </div>

      <!-- Awards -->
      <div class="pw-subtitle">Treasure awards</div>
      <div class="pw-award-add">
        <input v-model="awardAmount" class="pw-input pw-amount" :placeholder="game === 'sf2e' ? 'e.g. 500 cr' : 'e.g. 40 gp'" />
        <input v-model="awardLabel" class="pw-input pw-label" placeholder="What it was (e.g. a reward from the guild)" @keydown.enter="recordAward" />
        <button class="ghost-btn pw-small" :disabled="awardCp == null" title="Counts toward the wealth readout without adding an item or coins" @click="recordAward">Record award</button>
      </div>
      <div v-for="a in awards.slice(0, 15)" :key="a.id" class="party-log" :class="{ 'party-log--undone': a.undoneAt }">
        <span class="party-log-date">{{ formatDate(a.at) }}</span>
        <span class="party-log-trigger">{{ a.label }}</span>
        <span class="party-log-changes">+{{ money(a.value) }}<template v-if="a.consumables"> ({{ money(a.consumables) }} consumables)</template></span>
        <span v-if="a.undoneAt" class="party-log-undone">undone</span>
        <button v-else class="ghost-btn pw-small" @click="undoTreasureAward(a.id)">Undo</button>
      </div>
      <div v-if="!awards.length" class="pw-dim pw-hint">Resolved encounter loot counts on its own. Tick “as treasure” when adding items or coins outside an encounter.</div>
    </template>
  </section>
</template>

<script setup lang="ts">
/** Wealth readout, treasure pace and gear check (FEATURES_PLAN.md P5, §3). */
import { useInventory } from '~/composables/useInventory'
import { useParty, type Character } from '~/composables/useParty'
import { useWealth, type WealthState } from '~/composables/useWealth'
import { useFormatters } from '~/composables/useFormatters'
import { formatMoney, parseMoney } from '~/rules/format'
import { characterOwner, parseOwner, partyTotals } from '~/rules/inventory'
import { isPartyMember, type PartyLevel } from '~/rules/party'
import { GAME_RULES } from '~/rules/registry'
import { gearCheck, gearPiece, type GearPiece } from '~/rules/wealth'
import type { CampaignRules, GameId } from '~/types/game'

const props = defineProps<{ campaignId: number; game: GameId; characters: Character[]; party: PartyLevel }>()

const inv = useInventory()
const { levelUps } = useParty()
const { awards, revision, loadAwards, awardTreasure, undoTreasureAward, loadWealth, updateRules } = useWealth()
const { formatDate } = useFormatters()

const state = ref<WealthState | null>(null)
const money = (cp: number) => formatMoney({ cp }, props.game)

let seq = 0
async function refresh() {
  const n = ++seq
  const members = props.characters.filter(isPartyMember)
  const next = await loadWealth(props.campaignId, { level: props.party.level, size: props.party.size, xps: members.map(c => c.xp) })
  if (n === seq) state.value = next
}

onMounted(async () => {
  await loadAwards(props.campaignId)
  await refresh()
})
// Inventory edits, resolves, awards, level-ups and roster changes all move the numbers
watch([() => inv.entries.value, () => inv.purses.value, revision, levelUps, () => props.characters, () => props.party], refresh, { deep: false })

async function setRule(patch: Partial<CampaignRules>) {
  await updateRules(props.campaignId, patch)
}

const progressNote = computed(() => {
  if (!state.value) return ''
  return state.value.rules.advancement === 'xp' ? ', counting their XP toward the next level' : ', counting the encounters since the last level-up'
})

const statusClass = computed(() => {
  const r = state.value?.readout?.ratio
  if (r == null) return ''
  return r < 0.8 ? 'pw--low' : r > 1.25 ? 'pw--high' : 'pw--ok'
})

const paceText = computed(() => {
  const p = state.value?.pace
  if (!p) return ''
  return p.remaining >= 0 ? `${money(p.remaining)} left to give this level` : `${money(-p.remaining)} ahead of this level`
})

const owned = computed(() => {
  const entries = inv.entries.value.filter(e => parseOwner(e.owner).kind !== 'encounter')
  return partyTotals(entries, inv.items.value, inv.purseList.value, 'gm', props.game !== 'sf2e').total
})

// ── Gear ──
const gearVerified = computed(() => GAME_RULES[props.game].gear.verified)
const gear = computed(() => props.characters.filter(isPartyMember).map(c => {
  const owner = characterOwner(c.id)
  const pieces = inv.entries.value
    .filter(e => e.owner === owner)
    .map(e => gearPiece(e, e.itemId ? inv.items.value.get(e.itemId) : undefined))
    .filter((p): p is GearPiece => !!p)
  return { id: c.id, name: c.name, level: c.level, lines: gearCheck(props.game, c.level, pieces, state.value?.rules.abp ?? false) }
}))

// ── Manual award ──
const awardAmount = ref('')
const awardLabel = ref('')
const awardCp = computed(() => {
  const cp = parseMoney(awardAmount.value, props.game)
  return cp != null && cp > 0 ? cp : null
})
async function recordAward() {
  if (awardCp.value == null) return
  await awardTreasure({ campaignId: props.campaignId, value: { value: awardCp.value, consumables: 0 }, label: awardLabel.value.trim() || 'Award' })
  awardAmount.value = ''
  awardLabel.value = ''
}
</script>

<style scoped>
/* Shared with the party page (its styles are scoped) */
.party-section { margin-bottom: 28px; }
.party-section-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }
.party-empty { font-size: 13px; color: var(--text3); padding: 8px 0 12px; }
.party-log { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text2); flex-wrap: wrap; }
.party-log--undone { opacity: 0.5; }
.party-log--undone > span:not(.party-log-undone) { text-decoration: line-through; }
.party-log-date { font-family: var(--fm); font-size: 12px; color: var(--text3); min-width: 90px; }
.party-log-trigger { min-width: 140px; color: var(--text); }
.party-log-changes { flex: 1; }
.party-log-undone { font-size: 11px; color: var(--text3); }

.pw-head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
.pw-options { display: flex; gap: 14px; }
.pw-check { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text2); cursor: pointer; }
.pw-panel { display: flex; gap: 24px; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 14px; }
.pw-main { flex: 2; min-width: 260px; display: flex; flex-direction: column; gap: 4px; }
.pw-big { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
.pw-pct { font-family: var(--fh, serif); font-size: 28px; color: var(--text); }
.pw--low { color: #c9973a; }
.pw--ok { color: #7cc44e; }
.pw--high { color: #a87de8; }
.pw-line { font-size: 13px; color: var(--text2); }
.pw-line b { color: var(--text); font-weight: 600; }
.pw-dim { color: var(--text3); font-size: 12px; }
.pw-tag { margin-left: 6px; padding: 1px 6px; border-radius: 4px; font-size: 10px; letter-spacing: 0.05em; text-transform: uppercase; color: var(--text3); border: 1px solid var(--border); }
.pw-note { margin-top: 6px; font-size: 12px; color: var(--text2); padding: 6px 10px; border-left: 2px solid var(--border-hi); }
.pw-pace { flex: 1; min-width: 220px; display: flex; flex-direction: column; gap: 6px; justify-content: center; }
.pw-bar { display: block; height: 6px; border-radius: 3px; background: var(--surface-hi); overflow: hidden; }
.pw-bar span { display: block; height: 100%; background: var(--accent); }
.pw-bar span.over { background: #a87de8; }

.pw-subtitle { margin: 16px 0 6px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.pw-gear-row { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; flex-wrap: wrap; }
.pw-gear-name { min-width: 160px; color: var(--text); }
.pw-gear-cell { display: inline-flex; align-items: center; gap: 5px; min-width: 210px; color: var(--text2); }
.pw-gear--behind, .pw-gear--none { color: #c9973a; }
.pw-gear--ahead { color: #a87de8; }
.pw-gear--ok { color: #7cc44e; }

.pw-award-add { display: flex; gap: 8px; align-items: center; margin-bottom: 4px; flex-wrap: wrap; }
.pw-input { height: 28px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); font-size: 13px; }
.pw-amount { width: 130px; }
.pw-label { flex: 1; min-width: 180px; }
.pw-small { padding: 3px 10px; font-size: 12px; }
.pw-hint { padding: 6px 0; }
</style>

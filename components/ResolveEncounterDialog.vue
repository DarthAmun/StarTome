<template>
  <Teleport to="body">
    <div class="pv-dialog-mask" @click.self="emit('close')">
      <div class="pv-dialog red" role="dialog" aria-labelledby="red-title">
        <div class="pv-dialog-header">
          <span id="red-title" class="pv-dialog-title">Resolve {{ ctx?.encounter.name ?? 'encounter' }}</span>
          <button class="pv-dialog-close" aria-label="Close" @click="emit('close')">
            <OhVueIcon name="md-close" scale="0.85" />
          </button>
        </div>
        <div v-if="!ctx" class="pv-dialog-content red-dim">Loading…</div>
        <div v-else class="pv-dialog-content">
          <!-- Enemies -->
          <div class="red-title">Enemies <span class="red-dim">at party level {{ levelUsed }}</span></div>
          <div v-if="!lines.length" class="red-dim red-empty">No enemies with a stat block.</div>
          <label v-for="l in lines" :key="l.key" class="red-row" :class="{ 'red-row--off': !counted.has(l.key) }">
            <input type="checkbox" :checked="counted.has(l.key)" @change="counted = toggled(counted, l.key)" />
            <span class="red-name">{{ l.name }}</span>
            <span v-if="l.adjustment" class="red-tag">{{ l.adjustment }}</span>
            <span v-if="l.defeated" class="red-tag" title="Removed from the map in Run mode; its XP was kept">removed</span>
            <span v-else-if="l.dead" class="red-tag">dead</span>
            <span class="red-level">lvl {{ l.level }}</span>
            <span class="red-xp">{{ l.xp }} XP</span>
          </label>
          <div v-if="unlinked" class="red-dim red-note">+ {{ unlinked }} {{ unlinked === 1 ? 'token' : 'tokens' }} without a stat block (no XP)</div>
          <EncounterMeterBar class="red-meter" :game="game" :xp="xpTotal" :party-size="participants.size" />

          <!-- Participants -->
          <div class="red-title">Took part</div>
          <div v-if="!characters.length" class="red-dim red-empty">
            No party members yet. Add them on the <NuxtLink :to="`/campaign/${ctx.encounter.campaign_id}/party`" @click="emit('close')">Party</NuxtLink> page.
          </div>
          <label v-for="c in characters" :key="c.id" class="red-row" :class="{ 'red-row--off': !participants.has(c.id) }">
            <input type="checkbox" :checked="participants.has(c.id)" @change="participants = toggled(participants, c.id)" />
            <span class="red-name">{{ c.name }}</span>
            <span v-if="c.role === 'companion'" class="red-tag">companion</span>
            <span v-if="xpMode" class="red-xp">{{ c.xp }}<template v-if="participants.has(c.id) && award"> → <b>{{ c.xp + award }}</b></template> XP</span>
          </label>

          <!-- Award -->
          <div class="red-award">
            <span class="red-dim">Accomplishment XP</span>
            <button v-for="v in [0, ...Object.values(ACCOMPLISHMENT_XP)]" :key="v" class="red-chip" :class="{ active: accomplishment === v }" @click="accomplishment = v">{{ v || 'none' }}</button>
            <input v-model.number="accomplishment" class="f-input-box red-num" type="number" min="0" />
          </div>
          <div class="red-sum">
            <template v-if="xpMode">
              Each participant gets <b>{{ award }} XP</b>{{ ' ' }}<span class="red-dim">({{ creatureAward }} for the fight as for four PCs<template v-if="accomplishment > 0"> + {{ accomplishment }}</template>)</span>
            </template>
            <template v-else>
              Milestone campaign: no XP is awarded. <b>{{ award }} XP</b> is recorded for the pacing hint{{ ' ' }}<span v-if="pace" class="red-dim">({{ pace.xp + award }} / {{ XP_PER_LEVEL.toLocaleString() }} since the last level-up)</span>.
            </template>
          </div>

          <!-- Loot -->
          <div class="red-title">Loot → party stash</div>
          <div v-if="!loot.length && !coins" class="red-dim red-empty">No loot planned on this encounter.</div>
          <div v-else class="red-loot">
            <span v-if="coins" class="red-loot-item">{{ money(coins) }}</span>
            <span v-for="e in loot" :key="e.id" class="red-loot-item" :class="{ 'red-loot-item--unid': !e.identified }">
              {{ e.quantity > 1 ? `${e.quantity}× ` : '' }}{{ effective(e, e.itemId ? items.get(e.itemId) : null).name }}
            </span>
          </div>
          <p class="red-dim red-hint">You can re-open the encounter later: the loot that's still in the stash comes back and the XP is taken back.</p>
        </div>
        <div class="pv-dialog-footer">
          <button class="ghost-btn" @click="emit('close')">Cancel</button>
          <button class="seal-btn" :disabled="!ctx || busy || (xpMode && award > 0 && !participants.size)" @click="confirm">
            <OhVueIcon name="gi-laurels" scale="0.85" /> Resolve
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** "Resolve encounter" (FEATURES_PLAN.md §5): XP, participants and loot → stash. Works from the encounter page and the encounters list. */
import { dbApi } from '~/composables/useDb'
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { useResolution, type ResolveContext } from '~/composables/useResolution'
import { ACCOMPLISHMENT_XP, defaultParticipants, fourPcAward, XP_PER_LEVEL, type Pacing } from '~/rules/advancement'
import { entryXp, tokenSides } from '~/rules/encounter'
import { effective, encounterOwner } from '~/rules/inventory'
import { formatMoney } from '~/rules/format'
import { clampLevel, partyMembers } from '~/rules/party'
import type { Adjustment } from '~/rules/combat'
import { campaignGame, campaignRules, type GameId } from '~/types/game'
import type { Hazard } from '~/types/rules'

const props = defineProps<{ encounterId: number }>()
const emit = defineEmits<{ close: []; resolved: [] }>()

const { characters, party, load, loadedCampaign } = useParty()
const inv = useInventory()
const { items } = inv
const { resolveEncounter, loadResolveContext, loadPacing } = useResolution()

const ctx = shallowRef<ResolveContext | null>(null)
const game = ref<GameId>('pf2e')
const xpMode = ref(true)
const pace = ref<Pacing | null>(null)
const counted = ref(new Set<string>())
const participants = ref(new Set<number>())
const accomplishment = ref(0)
const busy = ref(false)

onMounted(async () => {
  const c = await loadResolveContext(props.encounterId)
  if (!c) return emit('close')
  const campaignId = c.encounter.campaign_id
  const campaign = await dbApi.campaigns.get(campaignId)
  game.value = campaignGame(campaign)
  xpMode.value = campaignRules(campaign).advancement === 'xp'
  await Promise.all([
    loadedCampaign.value !== campaignId ? load(campaignId) : null,
    inv.loadedCampaign.value !== campaignId ? inv.load(campaignId) : null,
  ])
  if (!xpMode.value) pace.value = await loadPacing(campaignId)
  ctx.value = c
  counted.value = new Set(lines.value.map(l => l.key))
  participants.value = new Set(defaultParticipants(characters.value, c.tokens.map(t => ({ linkedEntityId: t.linked_entity_id ?? null, tokenId: t.token_id }))))
})

const levelUsed = computed(() => ctx.value?.encounter.party_level ?? party.value.level ?? 1)

interface Line { key: string; name: string; level: number; adjustment: Adjustment | null; xp: number; dead: boolean; defeated: boolean }

const sides = computed(() => {
  const c = ctx.value
  if (!c) return { enemies: [], unlinked: [] }
  const partyNpcIds = new Set(partyMembers(characters.value).map(m => m.npcEntityId).filter((id): id is number => id !== null))
  return tokenSides(c.tokens.map(t => ({
    row: t, linkedRulesId: t.linked_rules_id ?? null, linkedEntityId: t.linked_entity_id ?? null,
    adjustment: t.rules_adjustment ?? null, isPlayerToken: !!t.is_player_token, isAlly: !!t.is_ally,
  })), partyNpcIds)
})
const unlinked = computed(() => sides.value.unlinked.length)

const lines = computed<Line[]>(() => {
  const c = ctx.value
  if (!c) return []
  const out: Line[] = []
  for (const t of sides.value.enemies) {
    const e = c.entries.get(t.linkedRulesId!)
    if (!e) continue
    const kind = e.kind === 'hazard' ? 'hazard' : 'creature'
    const complex = e.kind === 'hazard' && (e as Hazard).complex
    out.push({
      key: `t:${t.row.id}`, name: t.row.label || e.name, level: e.level, adjustment: t.adjustment, dead: !!t.row.is_dead, defeated: false,
      xp: entryXp(game.value, { level: e.level, kind, complex, adjustment: t.adjustment }, levelUsed.value),
    })
  }
  c.defeated.forEach((d, i) => out.push({
    key: `d:${i}`, name: d.name, level: d.level, adjustment: d.adjustment, dead: true, defeated: true,
    xp: entryXp(game.value, d, levelUsed.value),
  }))
  return out
})

const xpTotal = computed(() => lines.value.filter(l => counted.value.has(l.key)).reduce((n, l) => n + l.xp, 0))
const creatureAward = computed(() => fourPcAward(game.value, xpTotal.value, participants.value.size))
const award = computed(() => creatureAward.value + Math.max(0, Math.round(accomplishment.value || 0)))

const owner = computed(() => encounterOwner(props.encounterId))
const loot = computed(() => inv.entries.value.filter(e => e.owner === owner.value))
const coins = computed(() => inv.purses.value[owner.value] ?? 0)
const money = (cp: number) => formatMoney({ cp }, game.value)

function toggled<T>(set: Set<T>, key: T): Set<T> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

async function confirm() {
  busy.value = true
  try {
    await resolveEncounter({
      encounterId: props.encounterId,
      participants: [...participants.value],
      xpTotal: xpTotal.value,
      partyLevel: clampLevel(levelUsed.value),
      accomplishment: Math.max(0, Math.round(accomplishment.value || 0)),
      xpAwarded: award.value,
      awardXp: xpMode.value,
    })
    emit('resolved')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.red { width: 540px; max-height: 88vh; display: flex; flex-direction: column; }
.red .pv-dialog-content { overflow-y: auto; }
.red-title { margin: 14px 0 4px; font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }
.red-title:first-child { margin-top: 0; }
.red-title .red-dim { text-transform: none; letter-spacing: 0; font-family: inherit; margin-left: 6px; }
.red-dim { font-size: 12px; color: var(--text3); }
.red-empty { padding: 4px 0; }
.red-row { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 6px; cursor: pointer; }
.red-row:hover { background: var(--surface-hi); }
.red-row--off .red-name, .red-row--off .red-xp { color: var(--text3); }
.red-name { flex: 1; font-size: 13px; color: var(--text); }
.red-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.red-level { font-size: 12px; color: var(--text3); }
.red-xp { font-family: var(--fm); font-size: 12px; color: var(--text2); min-width: 56px; text-align: right; }
.red-xp b { color: var(--accent-l, var(--accent)); }
.red-note { padding: 2px 8px; }
.red-meter { margin: 8px 0 4px; }
.red-award { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-top: 12px; }
.red-chip { padding: 3px 8px; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text2); font-size: 12px; cursor: pointer; }
.red-chip.active { border-color: var(--accent); color: var(--accent); }
.red-num { width: 64px; }
.red-sum { margin-top: 10px; font-size: 13px; color: var(--text2); }
.red-sum b { color: var(--text); }
.red-loot { display: flex; flex-wrap: wrap; gap: 6px; }
.red-loot-item { padding: 2px 8px; border: 1px solid var(--border); border-radius: 10px; font-size: 12px; color: var(--text2); }
.red-loot-item--unid { border-style: dashed; }
.red-hint { margin: 14px 0 0; }
</style>

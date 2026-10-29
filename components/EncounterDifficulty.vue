<template>
  <div class="ed">
    <EncounterMeterBar :game="game" :xp="xp" :party-size="party.size" compact />
    <div class="ed-row">
      <span class="ed-label">Party lvl</span>
      <span class="ed-stepper" :title="encounter?.partyLevel == null ? 'From the party tab' : 'Overridden for this encounter'">
        <button aria-label="Lower party level" :disabled="levelUsed <= MIN_LEVEL" @click="setLevel(levelUsed - 1)">−</button>
        <b :class="{ 'ed-override': encounter?.partyLevel != null }">{{ levelUsed }}</b>
        <button aria-label="Raise party level" :disabled="levelUsed >= MAX_LEVEL" @click="setLevel(levelUsed + 1)">+</button>
      </span>
      <button v-if="encounter?.partyLevel != null && party.level !== null" class="ed-link" @click="store.setPartyLevel(null)">reset</button>
      <span class="ed-size">{{ party.size || DEFAULT_PARTY_SIZE }} PCs</span>
    </div>
    <div class="ed-notes">
      <span>{{ sides.enemies.length }} {{ sides.enemies.length === 1 ? 'enemy' : 'enemies' }}</span>
      <span v-if="defeated.length" title="Removed from the map in Run mode; their XP still counts">
        + {{ defeated.length }} removed <button class="ed-link" title="Forget the removed enemies' XP" @click="store.clearDefeated()">clear</button>
      </span>
      <span v-if="sides.unlinked.length" class="ed-warn" title="Tokens that aren't party or ally and have no compendium stat block add no XP">
        + {{ sides.unlinked.length }} without a stat block
      </span>
      <span v-if="strong.length" class="ed-warn" :title="strong.join(', ')">
        {{ strong.length }} more than {{ MAX_LEVEL_ABOVE }} levels above level {{ party.min }}
      </span>
      <span v-if="!party.size" class="ed-dim">No party members: budgets assume four PCs</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useEncounterStore } from '~/stores/encounter'
import { useParty } from '~/composables/useParty'
import { rulesGetMany } from '~/composables/useRules'
import { DEFAULT_PARTY_SIZE, entryXp, MAX_LEVEL_ABOVE, tokenSides, tooStrong, type XpEntry } from '~/rules/encounter'
import { MAX_LEVEL, MIN_LEVEL, clampLevel, partyMembers } from '~/rules/party'
import type { GameId } from '~/types/game'
import type { Hazard, RulesEntity } from '~/types/rules'

const props = defineProps<{ game: GameId }>()

const store = useEncounterStore()
const { characters, party, load, loadedCampaign } = useParty()
const encounter = computed(() => store.current)

watch(() => encounter.value?.campaignId, (id) => {
  if (id && loadedCampaign.value !== id) load(id)
}, { immediate: true })

const levelUsed = computed(() => encounter.value?.partyLevel ?? party.value.level ?? 1)

function setLevel(level: number) {
  const l = clampLevel(level)
  store.setPartyLevel(l === party.value.level ? null : l)
}

const partyNpcIds = computed(() => new Set(partyMembers(characters.value).map(c => c.npcEntityId).filter((id): id is number => id !== null)))
const sides = computed(() => tokenSides(store.allTokens, partyNpcIds.value))

// Compendium entries of the enemies, loaded when the set of linked ids changes
const entries = shallowRef<Record<string, RulesEntity>>({})
watch(() => [...new Set(sides.value.enemies.map(t => t.linkedRulesId!))].sort().join('|'), async (key) => {
  const ids = key ? key.split('|').filter(id => !entries.value[id]) : []
  if (!ids.length) return
  const found = await rulesGetMany(ids)
  entries.value = { ...entries.value, ...Object.fromEntries(found.map(e => [e.id, e])) }
}, { immediate: true })

const defeated = computed(() => encounter.value?.defeated ?? [])

const xpEntries = computed(() => [
  ...sides.value.enemies.flatMap((t): (XpEntry & { name: string })[] => {
    const e = entries.value[t.linkedRulesId!]
    if (!e) return []
    return [{ name: t.label || e.name, level: e.level, kind: e.kind === 'hazard' ? 'hazard' : 'creature', complex: e.kind === 'hazard' && (e as Hazard).complex, adjustment: t.adjustment }]
  }),
  ...defeated.value,
])

const xp = computed(() => xpEntries.value.reduce((n, e) => n + entryXp(props.game, e, levelUsed.value), 0))
const strong = computed(() => xpEntries.value.filter(e => tooStrong(e, party.value.min)).map(e => e.name))
</script>

<style scoped>
.ed { display: flex; flex-direction: column; gap: 8px; }
.ed-row { display: flex; align-items: center; gap: 5px; font-size: 12px; color: var(--text2); white-space: nowrap; }
.ed-label { color: var(--text3); }
.ed-stepper { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; }
.ed-stepper button { width: 20px; height: 22px; background: transparent; border: none; color: var(--text2); cursor: pointer; }
.ed-stepper button:disabled { opacity: 0.35; cursor: default; }
.ed-stepper b { min-width: 20px; text-align: center; font-family: var(--fm); color: var(--text); }
.ed-override { color: var(--accent) !important; }
.ed-link { background: none; border: none; padding: 0; color: var(--text3); font-size: 11px; text-decoration: underline; cursor: pointer; }
.ed-size { margin-left: auto; color: var(--text3); }
.ed-notes { display: flex; flex-wrap: wrap; gap: 6px; font-size: 11px; color: var(--text3); }
.ed-warn { padding: 0 5px; border-radius: 4px; color: #c9973a; border: 1px solid #c9973a66; }
.ed-dim { color: var(--text3); }
</style>

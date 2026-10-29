<template>
  <div class="party screen-in">
    <header class="party-head">
      <div>
        <h1 class="page-title party-title">Party</h1>
        <div class="party-sub">
          <template v-if="party.level !== null">
            Party level <b>{{ party.level }}</b>
            <span v-if="party.mixed" class="party-warn" title="Members are at different levels; the party level is their average, rounded down">
              mixed: {{ party.min }}–{{ party.max }}
            </span>
            · {{ party.size }} {{ party.size === 1 ? 'member' : 'members' }}
          </template>
          <template v-else>No party members yet</template>
          · <span class="party-mode" :title="modeHint">{{ advancement === 'milestone' ? 'Milestone levelling' : 'XP levelling' }}</span>
        </div>
      </div>
      <button class="seal-btn" :disabled="!characters.length" @click="openLevelUp">
        <OhVueIcon name="gi-upgrade" scale="0.85" /> Level up party
      </button>
    </header>

    <!-- ── Roster ── -->
    <section class="party-section">
      <div class="party-section-title">Roster</div>
      <div v-if="!characters.length" class="party-empty">
        Add your player characters below. NPCs flagged as Player Character join automatically.
      </div>
      <div v-for="c in characters" :key="c.id" class="party-row" :class="{ 'party-row--out': !isPartyMember(c) }">
        <div class="party-avatar">
          <img v-if="portrait(c)" :src="portrait(c)!" alt="" />
          <span v-else>{{ c.name.charAt(0) }}</span>
        </div>
        <div class="party-name">
          <NuxtLink v-if="c.npcEntityId" :to="`/campaign/${campaignId}/npcs/${c.npcEntityId}`">{{ c.name }}</NuxtLink>
          <span v-else>{{ c.name }}</span>
          <span class="party-role-badge" :class="`party-role-badge--${c.role}`">{{ c.role === 'pc' ? 'PC' : 'Companion' }}</span>
        </div>

        <label class="party-field" title="Level">
          <span class="party-field-label">Level</span>
          <span class="party-stepper">
            <button aria-label="Lower level" :disabled="c.level <= MIN_LEVEL" @click="setLevel(c, c.level - 1)">−</button>
            <input type="number" :min="MIN_LEVEL" :max="MAX_LEVEL" :value="c.level" @change="setLevel(c, Number(($event.target as HTMLInputElement).value))" />
            <button aria-label="Raise level" :disabled="c.level >= MAX_LEVEL" @click="setLevel(c, c.level + 1)">+</button>
          </span>
        </label>

        <label v-if="c.role === 'companion'" class="party-toggle" title="Counts for party size and party level, e.g. a capable NPC who joins the fight">
          <input type="checkbox" :checked="c.treatAsPc" @change="updateCharacter(c.id, { treatAsPc: !c.treatAsPc })" />
          Treat as player character
        </label>
        <span v-else class="party-toggle party-toggle--fixed">Counts for the party</span>

        <label class="party-field" title="Strength modifier, for the encumbrance warning">
          <span class="party-field-label">Str</span>
          <input class="party-str" type="number" min="-5" max="10" placeholder="—" :value="c.strMod ?? ''"
            @change="setStr(c, ($event.target as HTMLInputElement).value)" />
        </label>

        <div class="party-actions">
          <button class="party-icon-btn" :title="c.role === 'pc' ? 'Make companion' : 'Make player character'"
            @click="updateCharacter(c.id, { role: c.role === 'pc' ? 'companion' : 'pc' })">
            <OhVueIcon :name="c.role === 'pc' ? 'gi-meeple-group' : 'gi-deadly-strike'" scale="0.75" />
          </button>
          <button class="party-icon-btn party-icon-btn--danger" title="Remove from party (the NPC entry stays)" @click="remove(c)">
            <OhVueIcon name="md-close" scale="0.75" />
          </button>
        </div>
      </div>

      <!-- Add -->
      <div class="party-add">
        <input v-model="addSearch" class="party-add-input" placeholder="Add a character: search NPCs or type a new name…" @keydown.enter="addTyped('pc')" />
        <div v-if="addSearch.trim()" class="party-add-results">
          <div v-for="n in npcMatches" :key="n.id" class="party-add-row">
            <span class="party-add-name">{{ n.name }}</span>
            <button class="ghost-btn party-add-btn" @click="addNpc(n, 'pc')">+ PC</button>
            <button class="ghost-btn party-add-btn" @click="addNpc(n, 'companion')">+ Companion</button>
          </div>
          <div v-if="!exactNpc" class="party-add-row party-add-row--new">
            <span class="party-add-name">New: “{{ addSearch.trim() }}” <span class="party-add-hint">(no NPC entry)</span></span>
            <button class="ghost-btn party-add-btn" @click="addTyped('pc')">+ PC</button>
            <button class="ghost-btn party-add-btn" @click="addTyped('companion')">+ Companion</button>
          </div>
        </div>
      </div>
    </section>

    <!-- ── Level-up history ── -->
    <section v-if="levelUps.length" class="party-section">
      <div class="party-section-title">Level-ups</div>
      <div v-for="(l, i) in levelUps.slice(0, 15)" :key="l.id" class="party-log" :class="{ 'party-log--undone': l.undoneAt }">
        <span class="party-log-date">{{ formatDate(l.at) }}</span>
        <span class="party-log-trigger">{{ triggerLabel(l) }}</span>
        <span class="party-log-changes">{{ l.changes.map(ch => `${nameOf(ch.characterId)} ${ch.from}→${ch.to}`).join(', ') }}</span>
        <span v-if="l.undoneAt" class="party-log-undone">undone</span>
        <button v-else-if="i === firstActive" class="ghost-btn party-add-btn" @click="undoLevelUp(l.id)">Undo</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { dbApi } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import { useParty, type Character, type LevelUpEntry } from '~/composables/useParty'
import { useFormatters } from '~/composables/useFormatters'
import { campaignRules, type AdvancementMode } from '~/types/game'
import { MAX_LEVEL, MIN_LEVEL, isPartyMember, type CharacterRole } from '~/rules/party'

const route = useRoute()
const campaignId = Number(route.params.id)
const entitiesStore = useEntities()
const { characters, levelUps, party, load, addCharacter, updateCharacter, removeCharacter, undoLevelUp, requestLevelUp } = useParty()
const { formatDate } = useFormatters()

const advancement = ref<AdvancementMode>('xp')
const modeHint = computed(() => advancement.value === 'milestone'
  ? 'Level up with the button, or by completing a quest marked as milestone. Change the mode in the campaign settings on the home page.'
  : 'XP awards arrive with encounter resolution. Change the mode in the campaign settings on the home page.')

onMounted(async () => {
  const campaign = await dbApi.campaigns.get(campaignId)
  advancement.value = campaignRules(campaign).advancement
  if (!entitiesStore.entities.some(e => e.campaignId === campaignId)) await entitiesStore.loadAll(campaignId)
  await load(campaignId)
})

const npcs = computed(() => entitiesStore.entities.filter(e => e.campaignId === campaignId && e.type === 'npc'))

function portrait(c: Character): string | null {
  if (!c.npcEntityId) return null
  return (npcs.value.find(n => n.id === c.npcEntityId)?.attributes as { portraitSource?: string })?.portraitSource ?? null
}

function setLevel(c: Character, level: number) {
  if (!Number.isFinite(level) || level === c.level) return
  updateCharacter(c.id, { level })
}

function setStr(c: Character, raw: string) {
  const v = raw.trim() === '' ? null : Math.round(Number(raw))
  if (v !== null && !Number.isFinite(v)) return
  updateCharacter(c.id, { strMod: v })
}

async function remove(c: Character) {
  if (!confirm(`Remove ${c.name} from the party? The NPC entry stays.`)) return
  await removeCharacter(c.id)
}

// ── Adding ──
const addSearch = ref('')
const inParty = computed(() => new Set(characters.value.map(c => c.npcEntityId).filter(Boolean)))
const npcMatches = computed(() => {
  const q = addSearch.value.trim().toLowerCase()
  if (!q) return []
  return npcs.value.filter(n => !inParty.value.has(n.id) && n.name.toLowerCase().includes(q)).slice(0, 8)
})
const exactNpc = computed(() => npcMatches.value.some(n => n.name.toLowerCase() === addSearch.value.trim().toLowerCase()))

async function addNpc(n: { id: number; name: string }, role: CharacterRole) {
  await addCharacter({ campaignId, name: n.name, role, npcEntityId: n.id })
  addSearch.value = ''
}

async function addTyped(role: CharacterRole) {
  const name = addSearch.value.trim()
  if (!name) return
  const match = npcMatches.value.find(n => n.name.toLowerCase() === name.toLowerCase())
  if (match) return addNpc(match, role)
  await addCharacter({ campaignId, name, role })
  addSearch.value = ''
}

// ── Level-ups ──
function openLevelUp() {
  requestLevelUp({ campaignId, trigger: 'manual', refId: null, reason: 'Raise the selected characters by one level.' })
}

const firstActive = computed(() => levelUps.value.findIndex(l => !l.undoneAt))

function nameOf(id: number) {
  return characters.value.find(c => c.id === id)?.name ?? '(removed)'
}

function triggerLabel(l: LevelUpEntry) {
  if (l.trigger === 'quest') {
    const q = entitiesStore.entities.find(e => e.id === l.refId)
    return q ? `Milestone: ${q.name}` : 'Milestone quest'
  }
  return l.trigger === 'encounter' ? 'Encounter' : 'Manual'
}
</script>

<style scoped>
.party { flex: 1; overflow-y: auto; padding: 28px 32px 48px; max-width: 980px; }
.party-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 24px; flex-wrap: wrap; }
.party-title { margin: 0 0 4px; }
.party-sub { font-size: 13px; color: var(--text2); }
.party-sub b { color: var(--text); }
.party-warn { margin-left: 4px; padding: 1px 6px; border-radius: 4px; font-size: 11px; color: #c9973a; border: 1px solid #c9973a66; }
.party-mode { border-bottom: 1px dotted var(--text3); cursor: help; }

.party-section { margin-bottom: 28px; }
.party-section-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); margin-bottom: 10px; }
.party-empty { font-size: 13px; color: var(--text3); padding: 8px 0 12px; }

.party-row {
  display: flex; align-items: center; gap: 14px; flex-wrap: wrap;
  padding: 10px 12px; margin-bottom: 6px;
  background: var(--surface); border: 1px solid var(--border); border-radius: 8px;
}
.party-row--out { opacity: 0.65; }
.party-avatar {
  width: 36px; height: 36px; border-radius: 50%; overflow: hidden; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface-hi); color: var(--text2); font-family: var(--fh, serif);
}
.party-avatar img { width: 100%; height: 100%; object-fit: cover; }
.party-name { flex: 1; min-width: 140px; display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--text); }
.party-name a { color: inherit; text-decoration: none; }
.party-name a:hover { text-decoration: underline; }
.party-role-badge { font-size: 10px; letter-spacing: 0.06em; text-transform: uppercase; padding: 1px 6px; border-radius: 4px; border: 1px solid var(--border); color: var(--text3); }
.party-role-badge--pc { color: #7cc44e; border-color: #7cc44e55; }

.party-field { display: flex; align-items: center; gap: 6px; }
.party-field-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.party-stepper { display: inline-flex; align-items: center; border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.party-stepper button { width: 24px; height: 26px; background: transparent; border: none; color: var(--text2); cursor: pointer; }
.party-stepper button:disabled { opacity: 0.35; cursor: default; }
.party-stepper input { width: 40px; height: 26px; text-align: center; border: none; border-left: 1px solid var(--border); border-right: 1px solid var(--border); background: transparent; color: var(--text); font-family: var(--fm); -moz-appearance: textfield; }
.party-stepper input::-webkit-inner-spin-button { -webkit-appearance: none; }
.party-str { width: 48px; height: 26px; text-align: center; border: 1px solid var(--border); border-radius: 6px; background: transparent; color: var(--text); font-family: var(--fm); }
.party-toggle { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2); min-width: 170px; cursor: pointer; }
.party-toggle--fixed { color: var(--text3); cursor: default; }
.party-actions { display: flex; gap: 4px; }
.party-icon-btn { width: 28px; height: 28px; display: flex; align-items: center; justify-content: center; background: transparent; border: 1px solid var(--border); border-radius: 6px; color: var(--text2); cursor: pointer; }
.party-icon-btn:hover { color: var(--text); border-color: var(--border-hi); }
.party-icon-btn--danger:hover { color: var(--blood, #d04a4a); }

.party-add { margin-top: 10px; }
.party-add-input { width: 100%; padding: 8px 12px; border: 1px dashed var(--border-hi); border-radius: 8px; background: transparent; color: var(--text); font-size: 13px; }
.party-add-results { margin-top: 6px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.party-add-row { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-bottom: 1px solid var(--border); }
.party-add-row:last-child { border-bottom: none; }
.party-add-name { flex: 1; font-size: 13px; color: var(--text); }
.party-add-hint { color: var(--text3); font-size: 12px; }
.party-add-btn { padding: 3px 10px; font-size: 12px; }

.party-log { display: flex; align-items: center; gap: 12px; padding: 6px 0; border-bottom: 1px solid var(--border); font-size: 13px; color: var(--text2); flex-wrap: wrap; }
.party-log--undone { opacity: 0.5; }
.party-log--undone > span:not(.party-log-undone) { text-decoration: line-through; }
.party-log-date { font-family: var(--fm); font-size: 12px; color: var(--text3); min-width: 90px; }
.party-log-trigger { min-width: 140px; color: var(--text); }
.party-log-changes { flex: 1; }
.party-log-undone { font-size: 11px; color: var(--text3); }

@media (max-width: 640px) {
  .party { padding: 20px 16px 40px; }
  .party-toggle { min-width: 0; }
}
</style>

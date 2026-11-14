<script setup lang="ts">
/**
 * The party: roster with levels and XP, one inventory for everyone, the
 * wealth readout, and the log of level-ups and XP awards with undo.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { Bot, Coins, Sparkles, Star, TrendingUp, UserMinus, Users, X } from 'lucide-vue-next'
import { campaignRules } from '@/domain/game'
import { XP_PER_LEVEL, type Pacing } from '@/domain/rules/advancement'
import { isPartyMember, MAX_LEVEL, MIN_LEVEL, partyLevel } from '@/domain/rules/party'
import type { Character, Entry } from '@/domain/schema'
import { addCharacter, ledgerOf, partyOf, removeCharacter, undoXpAward, updateCharacter, type LevelUpEntry, type XpAwardEntry } from '@/data/party'
import { entries as entryRepo } from '@/data/repo'
import { loadPacing } from '@/data/wealth'
import { offerHeroPoints, undoPartyLevelUp } from '@/services/characterLink/link'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { imageUrlOf } from '@/ui/imageUrl'
import { levelUpPrompt, xpPrompt } from '@/ui/partyPrompts'
import { useLive } from '@/ui/useLive'
import { campaign, peek } from '@/ui/workbench'
import CompanionDialog from './CompanionDialog.vue'
import EarnIncomeDialog from './EarnIncomeDialog.vue'
import InventoryPanel from './InventoryPanel.vue'
import LinkPanel from './LinkPanel.vue'
import WealthPanel from './WealthPanel.vue'

const props = defineProps<{ campaignId: string }>()

const characters = useLive(() => partyOf(props.campaignId), [])
const ledger = useLive(() => ledgerOf(props.campaignId), [])
const npcs = useLive(() => entryRepo.ofType(props.campaignId, 'npc'), [] as Entry[])
const game = computed(() => campaign.value?.game ?? 'pf2e')
const rules = computed(() => campaignRules(campaign.value))
const xpMode = computed(() => rules.value.advancement === 'xp')
const party = computed(() => partyLevel(characters.value))
const run = (what: string, work: Promise<unknown>) => { void work.catch(err => reportError(what, err)) }
const when = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' })

// Milestone pacing restarts at each level-up
const pace = shallowRef<Pacing | null>(null)
watch([ledger, xpMode], async () => { pace.value = xpMode.value ? null : await loadPacing(props.campaignId) }, { immediate: true })

// Portraits of members that stand for an NPC entry
const portraits = ref<Record<string, string | null>>({})
watch([characters, npcs], async () => {
  const out: Record<string, string | null> = {}
  for (const c of characters.value) {
    const e = npcs.value.find(n => n.id === c.entryId)
    out[c.id] = e?.type === 'npc' ? await imageUrlOf(e.data.portrait) : null
  }
  portraits.value = out
}, { immediate: true })

// ── Roster ─────────────────────────────────────────────────────────────────
const num = (e: Event) => (e.target as HTMLInputElement).value
function setLevel(c: Character, level: number) { if (Number.isFinite(level) && level !== c.level) run('Changing the level', updateCharacter(c.id, { level })) }
function setXp(c: Character, raw: string) { const v = Math.round(Number(raw)); if (raw.trim() !== '' && Number.isFinite(v) && v !== c.xp) run('Changing the XP', updateCharacter(c.id, { xp: v })) }
function setStr(c: Character, raw: string) { const v = raw.trim() === '' ? null : Math.round(Number(raw)); if (v === null || Number.isFinite(v)) run('Changing Strength', updateCharacter(c.id, { strMod: v })) }
async function remove(c: Character) {
  if (await confirmDialog({ title: `Remove ${c.name} from the party?`, body: c.link ? 'The NPC entry stays. What is in their Play Buddy stays theirs.' : 'The NPC entry stays. Their items and coins go to the party stash.', confirmLabel: 'Remove' })) run('Removing the member', removeCharacter(c.id))
}

const addSearch = ref('')
const inParty = computed(() => new Set(characters.value.map(c => c.entryId)))
const matches = computed(() => { const q = addSearch.value.trim().toLowerCase(); return q ? npcs.value.filter(n => !inParty.value.has(n.id) && n.name.toLowerCase().includes(q)).slice(0, 8) : [] })
const exact = computed(() => matches.value.find(n => n.name.toLowerCase() === addSearch.value.trim().toLowerCase()))
async function add(role: Character['role'], npc?: Entry) {
  const name = npc?.name ?? addSearch.value.trim()
  if (!name) return
  const target = npc ?? exact.value
  await addCharacter({ campaignId: props.campaignId, name, role, entryId: target?.id ?? null }).catch(err => reportError('Adding the member', err))
  addSearch.value = ''
}

const incomeFor = shallowRef<Character | null>(null)
const companionFor = shallowRef<Character | null>(null)

// ── Logs ───────────────────────────────────────────────────────────────────
const levelUps = computed(() => ledger.value.filter((l): l is LevelUpEntry => l.kind === 'levelUp'))
const xpAwards = computed(() => ledger.value.filter((l): l is XpAwardEntry => l.kind === 'xpAward'))
const firstActive = computed(() => levelUps.value.find(l => !l.undoneAt)?.id)
const nameOf = (id: string) => characters.value.find(c => c.id === id)?.name ?? '(removed)'
function triggerLabel(l: LevelUpEntry) { return l.trigger === 'quest' ? 'Milestone quest' : l.trigger === 'encounter' ? 'Encounter' : 'By hand' }
function awardLabel(a: XpAwardEntry) { return a.source === 'encounter' ? (a.reason ? `Encounter: ${a.reason}` : 'Encounter') : a.reason || (a.refType === 'quest' ? 'Quest' : 'Accomplishment') }

const inv = ref<InstanceType<typeof InventoryPanel> | null>(null)
</script>

<template>
  <div class="page party">
    <div class="page-head">
      <div class="title">
        <h1>Party</h1>
        <p class="dim">
          <template v-if="party.level !== null">Level <b class="num">{{ party.level }}</b><span v-if="party.mixed" class="warn" title="Members are at different levels; the party level is their average, rounded down"> · mixed {{ party.min }}–{{ party.max }}</span> · {{ party.size }} {{ party.size === 1 ? 'member' : 'members' }}</template>
          <template v-else>No party members yet</template>
          · <span :title="xpMode ? 'Resolving an encounter awards its XP; at 1,000 XP a character can level up.' : 'Level up with the button, or by completing a quest marked as a milestone.'">{{ xpMode ? 'XP levelling' : 'Milestone levelling' }}</span>
        </p>
        <div v-if="pace?.encounters" class="pace" title="Encounter XP (as for four PCs) resolved since the last level-up. GM Core paces about 1,000 XP per level; only you see this.">
          <span class="faint">Since the last level-up: {{ pace.encounters }} {{ pace.encounters === 1 ? 'encounter' : 'encounters' }}, <b>{{ pace.xp }}</b> / {{ XP_PER_LEVEL.toLocaleString() }} XP</span>
          <div class="meter"><div :style="{ width: `${Math.min(100, pace.fraction * 100)}%` }" /></div>
        </div>
      </div>
      <RouterLink class="btn" :to="{ name: 'encounter-builder', params: { campaignId } }">Build encounter</RouterLink>
      <RouterLink v-if="game === 'sf2e'" class="btn" data-test="open-starship" :to="{ name: 'starship', params: { campaignId } }">Starship</RouterLink>
      <button v-if="xpMode" class="btn" :disabled="!characters.length" title="Accomplishment XP: minor 10, moderate 30, major 80" data-test="award-xp" @click="xpPrompt = { campaignId, refType: null, refId: null, reason: '' }"><Sparkles :size="15" /> Award XP</button>
      <button class="btn btn-primary" :disabled="!characters.length" data-test="level-up" @click="levelUpPrompt = { campaignId, trigger: 'manual', refId: null, reason: 'Raise the selected characters by one level.' }"><TrendingUp :size="15" /> Level up party</button>
    </div>

    <section>
      <h2>Roster</h2>
      <p v-if="!characters.length" class="faint">Add your player characters below. An NPC switched to “player character” on its entry joins by itself.</p>
      <div v-for="c in characters" :key="c.id" class="member" :class="{ out: !isPartyMember(c) }" :data-member="c.name">
        <span class="avatar"><img v-if="portraits[c.id]" :src="portraits[c.id] ?? ''" alt="" /><template v-else>{{ c.name.charAt(0) }}</template></span>
        <span class="who">
          <a v-if="c.entryId" @click="peek({ kind: 'entry', id: c.entryId })">{{ c.name }}</a><span v-else>{{ c.name }}</span>
          <span class="chip" :class="c.role">{{ c.role === 'pc' ? 'PC' : 'Companion' }}</span>
          <template v-if="c.link">
            <span class="chip pc" title="Linked to a player's Play Buddy: their app owns the sheet, so level and Strength follow it">linked</span>
            <span v-if="c.link.mirror?.basic" class="num shared" data-test="member-hp" :title="c.link.mirror.basic.conditions.map(k => `${k.name}${k.value ? ` ${k.value}` : ''}`).join(', ') || 'No conditions'">{{ c.link.mirror.basic.hp.value }}/{{ c.link.mirror.basic.hp.max }} HP<template v-if="c.link.mirror.basic.hp.temp"> +{{ c.link.mirror.basic.hp.temp }}</template><template v-if="c.link.mirror.basic.heroPoints !== null"> · <span title="Hero points">{{ '●'.repeat(c.link.mirror.basic.heroPoints) }}{{ '○'.repeat(Math.max(0, 3 - c.link.mirror.basic.heroPoints)) }}</span></template><span v-if="c.link.mirror.basic.conditions.length" class="warn"> · {{ c.link.mirror.basic.conditions.map(k => `${k.name}${k.value ? ` ${k.value}` : ''}`).join(', ') }}</span></span>
          </template>
        </span>
        <label class="field"><span class="label">Level</span>
          <span class="stepper"><button aria-label="Lower level" :disabled="c.level <= MIN_LEVEL || !!c.link" @click="setLevel(c, c.level - 1)">−</button><input type="number" :min="MIN_LEVEL" :max="MAX_LEVEL" :value="c.level" aria-label="Level" :disabled="!!c.link" @change="setLevel(c, Number(num($event)))" /><button aria-label="Raise level" :disabled="c.level >= MAX_LEVEL || !!c.link" @click="setLevel(c, c.level + 1)">+</button></span>
        </label>
        <label v-if="c.role === 'companion'" class="dim counts" title="Counts for party size and party level, for example a capable NPC who joins the fight"><input type="checkbox" :checked="c.treatAsPc" @change="run('Saving', updateCharacter(c.id, { treatAsPc: !c.treatAsPc }))" /> counts as a PC</label>
        <span v-else class="faint counts">counts for the party</span>
        <label v-if="xpMode" class="field" :title="`XP toward the next level (${XP_PER_LEVEL.toLocaleString()})`"><span class="label">XP</span><input class="input small" :class="{ ready: c.xp >= XP_PER_LEVEL && c.level < MAX_LEVEL }" type="number" min="0" :value="c.xp" aria-label="XP" @change="setXp(c, num($event))" /></label>
        <label class="field" title="Strength modifier, for the encumbrance warning"><span class="label">Str</span><input class="input tiny" type="number" min="-5" max="10" placeholder="—" :value="c.strMod ?? ''" aria-label="Strength modifier" @change="setStr(c, num($event))" /></label>
        <span class="actions">
          <button v-if="c.role === 'companion'" class="btn btn-ghost btn-icon" :class="{ on: !!c.companion }" :title="c.companion ? 'Companion stat block (kept at this level)' : 'Build a companion stat block: animal, robot or drone'" @click="companionFor = c"><Bot :size="15" /></button>
          <button v-if="c.link" class="btn btn-ghost btn-icon" title="Give a hero point" data-test="hero-point" @click="run('Giving a hero point', offerHeroPoints(c))"><Star :size="15" /></button>
          <button class="btn btn-ghost btn-icon" title="Earn income (downtime)" @click="incomeFor = c"><Coins :size="15" /></button>
          <button class="btn btn-ghost btn-icon" :title="c.role === 'pc' ? 'Make companion' : 'Make player character'" @click="run('Saving', updateCharacter(c.id, { role: c.role === 'pc' ? 'companion' : 'pc' }))"><component :is="c.role === 'pc' ? UserMinus : Users" :size="15" /></button>
          <button class="btn btn-ghost btn-icon" title="Remove from the party (the NPC entry stays)" @click="remove(c)"><X :size="15" /></button>
        </span>
      </div>
      <div class="add">
        <input v-model="addSearch" class="input" placeholder="Add a character: search NPCs or type a new name…" data-test="party-add" @keydown.enter="add('pc')" />
        <div v-if="addSearch.trim()" class="add-results">
          <div v-for="n in matches" :key="n.id" class="add-row"><span>{{ n.name }}</span><button class="btn" @click="add('pc', n)">+ PC</button><button class="btn" @click="add('companion', n)">+ Companion</button></div>
          <div v-if="!exact" class="add-row"><span>New: “{{ addSearch.trim() }}” <span class="faint">(no NPC entry)</span></span><button class="btn" @click="add('pc')">+ PC</button><button class="btn" @click="add('companion')">+ Companion</button></div>
        </div>
      </div>
    </section>

    <LinkPanel :campaign-id="campaignId" :game="game" :characters="characters" />

    <InventoryPanel ref="inv" :campaign-id="campaignId" :game="game" :characters="characters" :party-level="party.level" :rules="rules" />

    <WealthPanel v-if="inv" :campaign-id="campaignId" :game="game" :rules="rules" :characters="characters" :party="party" :ledger="ledger"
      :stacks="inv.ctx.stacks.value" :items="inv.ctx.items.value" :purses="inv.ctx.purses.value" />

    <section v-if="xpAwards.length">
      <h2>XP awards</h2>
      <div v-for="a in xpAwards.slice(0, 15)" :key="a.id" class="log" :class="{ undone: a.undoneAt }">
        <span class="faint">{{ when(a.at) }}</span><span>{{ awardLabel(a) }}</span><span class="what">+{{ a.amount }} XP · {{ a.characterIds.map(nameOf).join(', ') }}</span>
        <span v-if="a.undoneAt" class="faint">undone</span>
        <button v-else-if="a.source === 'accomplishment'" class="btn" @click="run('Undoing the award', undoXpAward(a.id))">Undo</button>
        <span v-else class="faint" title="Re-open the encounter to undo its award">encounter</span>
      </div>
    </section>

    <section v-if="levelUps.length">
      <h2>Level-ups</h2>
      <div v-for="l in levelUps.slice(0, 15)" :key="l.id" class="log" :class="{ undone: l.undoneAt }">
        <span class="faint">{{ when(l.at) }}</span><span>{{ triggerLabel(l) }}</span><span class="what">{{ l.changes.map(ch => `${nameOf(ch.characterId)} ${ch.from}→${ch.to}${ch.offer && ch.offer.state !== 'accepted' ? ` (${ch.offer.state === 'pending' ? 'waiting for the player' : ch.offer.state})` : ''}`).join(', ') }}</span>
        <span v-if="l.undoneAt" class="faint">undone</span>
        <button v-else-if="l.id === firstActive" class="btn" data-test="undo-level-up" @click="run('Undoing the level-up', undoPartyLevelUp(l.id))">Undo</button><span v-else />
      </div>
    </section>

    <CompanionDialog v-if="companionFor" :character="companionFor" @close="companionFor = null" />
    <EarnIncomeDialog v-if="incomeFor" :campaign-id="campaignId" :game="game" :character="incomeFor" @close="incomeFor = null" />
  </div>
</template>

<style scoped>
.party { display: flex; flex-direction: column; gap: 2rem; max-width: 1180px; }
.page-head { margin-bottom: 0; align-items: center; }
.title { flex: 1; } .title p { margin: .2rem 0 0; }
.warn { color: var(--warn); }
.pace { margin-top: .4rem; max-width: 420px; display: flex; flex-direction: column; gap: .2rem; }
.meter { height: 5px; background: var(--bg-sunken); border: var(--frame); } .meter div { height: 100%; background: var(--accent); }
section { display: flex; flex-direction: column; gap: .4rem; }
.member { display: grid; grid-template-columns: 36px minmax(10rem, 1fr) auto 11rem auto auto auto; gap: .9rem; align-items: center; padding: .35rem .2rem; border-bottom: var(--frame); }
.member.out { opacity: .7; }
.avatar { width: 34px; height: 34px; border-radius: 50%; overflow: hidden; display: grid; place-items: center; background: var(--bg-sunken); border: var(--frame); font-family: var(--font-title); color: var(--text-dim); }
.avatar img { width: 100%; height: 100%; object-fit: cover; }
.who { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; } .shared { font-size: .85rem; color: var(--text-dim); } .who a { cursor: pointer; }
.chip.pc { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
.field { display: flex; align-items: center; gap: .4rem; } .field .label { margin: 0; }
.stepper { display: inline-flex; border: var(--frame); border-radius: var(--radius); overflow: hidden; }
.stepper button { width: 1.7rem; background: var(--bg-raised); border: 0; }
.stepper input { width: 2.8rem; text-align: center; background: var(--bg-sunken); border: 0; }
.small { width: 5.5rem; } .tiny { width: 3.6rem; }
.ready { border-color: var(--ok); }
.actions { display: flex; } .actions .on { color: var(--accent); }
.add { position: relative; margin-top: .4rem; max-width: 560px; }
.add-results { margin-top: 2px; border: var(--frame); border-radius: var(--radius); background: var(--bg-raised); }
.add-row { display: flex; align-items: center; gap: .4rem; padding: .3rem .6rem; } .add-row span:first-child { flex: 1; }
.log { display: grid; grid-template-columns: 7rem 12rem minmax(0, 1fr) auto; gap: .8rem; align-items: baseline; padding: .2rem 0; border-bottom: var(--frame); }
.log.undone .what { text-decoration: line-through; color: var(--text-faint); }
</style>

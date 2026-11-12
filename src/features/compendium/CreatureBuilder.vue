<script setup lang="ts">
/**
 * Builds a homebrew creature from GM Core's creature-building tables, or
 * rebuilds one at another level. The result is a plain homebrew creature;
 * its road map and columns are kept on it for the next rebuild.
 */
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import type { GameId } from '@/domain/game'
import {
  attackValue, buildStats, BUILD_STATS, columnsFor, customKeys, damageFormula, MAX_BUILD_LEVEL, MIN_BUILD_LEVEL,
  newBuild, roadmapColumns, ROADMAPS, ROADMAPS_VERIFIED, skillValue, spellDc, statValue, type BuildStat, type Column, type CreatureBuild,
} from '@/domain/rules/creatureBuilding'
import { newRulesEntity } from '@/domain/rules/factory'
import { formatActionCost, signed, SIZE_LABEL } from '@/domain/rules/format'
import { RARITIES, SIZES, type ActionCost, type Creature, type Rarity, type RulesEntity, type Size, type StatAction } from '@/domain/rules/types'
import { rulesGet, rulesSaveUser, rulesSearch } from '@/data/rules'
import { reportError } from '@/ui/dialogs'

const props = defineProps<{ open: boolean; game: GameId; startLevel?: number; base?: Creature | null }>()
const emit = defineEmits<{ close: []; saved: [creature: Creature, edit: boolean] }>()

const STAT_LABEL: Record<BuildStat, string> = { perception: 'Perception', str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha', ac: 'AC', fort: 'Fort', ref: 'Ref', will: 'Will', hp: 'HP' }
const COL: Record<Column, string> = { extreme: 'Ext', high: 'High', moderate: 'Mod', low: 'Low', terrible: 'Ter' }
const TRADITIONS = ['arcane', 'divine', 'occult', 'primal']
const COSTS: Record<string, { label: string; cost: ActionCost }> = {
  passive: { label: 'passive', cost: 'passive' }, 1: { label: '◆', cost: 1 }, 2: { label: '◆◆', cost: 2 }, 3: { label: '◆◆◆', cost: 3 },
  free: { label: '◇ free', cost: 'free' }, reaction: { label: '↺ reaction', cost: 'reaction' },
}
const SKILLS = ['Acrobatics', 'Arcana', 'Athletics', 'Crafting', 'Deception', 'Diplomacy', 'Intimidation', 'Medicine', 'Nature', 'Occultism', 'Performance', 'Religion', 'Society', 'Stealth', 'Survival', 'Thievery']
const skillNames = computed(() => (props.game === 'sf2e' ? [...SKILLS, 'Computers', 'Piloting'].sort() : SKILLS))

const el = ref<HTMLDialogElement | null>(null)
const name = ref('')
const level = ref(1)
const size = ref<Size>('med')
const rarity = ref<Rarity>('common')
const traitsText = ref('')
const build = ref<CreatureBuild>(newBuild())
const actions = ref<StatAction[]>([])
const clone = <T>(v: T) => JSON.parse(JSON.stringify(v)) as T

// Copy abilities from a compendium creature
const copySearch = ref('')
const copyResults = shallowRef<RulesEntity[]>([])
const copyFrom = shallowRef<Creature | null>(null)
watch(copySearch, async (q) => { copyFrom.value = null; copyResults.value = q.trim().length < 2 ? [] : (await rulesSearch(q, 24, [props.game])).filter(e => e.kind === 'creature').slice(0, 8) })
async function pickCopy(id: string) {
  const e = await rulesGet(id)
  copyFrom.value = e?.kind === 'creature' ? e : null
}

watch(() => props.open, async (open) => {
  await nextTick()
  if (!open) { el.value?.close(); return }
  const b = props.base
  name.value = b?.name ?? ''
  level.value = b?.level ?? props.startLevel ?? 1
  size.value = b?.size ?? 'med'
  rarity.value = b?.rarity ?? 'common'
  traitsText.value = (b?.traits ?? []).join(', ')
  build.value = b?.build ? clone(b.build) : newBuild()
  actions.value = b ? clone(b.actions) : []
  copySearch.value = ''
  el.value?.showModal()
}, { immediate: true })

function applyRoadmap(key: string) {
  const r = ROADMAPS[key]
  build.value.roadmap = key
  build.value.columns = roadmapColumns(key)
  for (const s of build.value.strikes) { s.attack = r?.attack ?? 'moderate'; s.damage = r?.damage ?? 'moderate' }
  build.value.spell = r?.spell ? { column: r.spell, tradition: build.value.spell?.tradition ?? 'arcane', type: build.value.spell?.type ?? 'innate' } : null
}
function addStrike() {
  const r = ROADMAPS[build.value.roadmap]
  build.value.strikes.push({ name: '', range: 'melee', traits: [], damageType: 'bludgeoning', attack: r?.attack ?? 'moderate', damage: r?.damage ?? 'moderate' })
}
function setSpell(column: Column) {
  build.value.spell = { column, tradition: build.value.spell?.tradition ?? 'arcane', type: build.value.spell?.type ?? 'innate' }
}

// Typed-over values
const isCustom = (key: string) => { const v = build.value.custom[key]; return v !== undefined && v !== '' }
const customNum = (key: string) => { const v = build.value.custom[key]; return typeof v === 'number' ? v : '' }
function setCustom(key: string, text: string, asText = false) {
  const n = Number(text)
  if (!text.trim() || (!asText && !Number.isFinite(n))) delete build.value.custom[key]
  else build.value.custom[key] = asText ? text.trim() : Math.round(n)
}
const keptCustom = computed(() => customKeys(build.value).map(k => (k.startsWith('strike:') ? `Strike ${Number(k.split(':')[1]) + 1} ${k.split(':')[2]}` : STAT_LABEL[k as BuildStat] ?? k)))
const fmt = (stat: BuildStat, v: number) => (stat === 'ac' || stat === 'hp' ? String(v) : signed(v))
const splitList = (text: string) => text.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
const val = (e: Event) => (e.target as HTMLInputElement).value
function costKey(cost: ActionCost): string {
  if (cost === null || cost === 'passive') return 'passive'
  return typeof cost === 'object' ? ('min' in cost ? String(cost.min) : 'passive') : String(cost)
}
const summary = computed(() => {
  const s = buildStats(build.value, level.value)
  return `AC ${s.ac} · HP ${s.hp} · Fort ${signed(s.saves.fort)} Ref ${signed(s.saves.ref)} Will ${signed(s.saves.will)}`
})

async function save(edit: boolean) {
  try {
    const stats = buildStats(build.value, level.value)
    const start = props.base ?? newRulesEntity('creature', { name: name.value.trim(), game: props.game }) as Creature
    const creature: Creature = {
      ...start, ...stats, name: name.value.trim(), level: level.value, size: size.value, rarity: rarity.value, traits: splitList(traitsText.value),
      actions: actions.value.filter(a => a.name.trim()),
      // Strikes from the builder replace the old ones; spells keep their list when the DC changes
      spellcasting: stats.spellcasting.map((sc, i) => ({ ...sc, spells: start.spellcasting[i]?.spells ?? [] })),
      build: build.value,
    }
    emit('saved', await rulesSaveUser(creature) as Creature, edit)
  } catch (err) { reportError('Saving the creature', err) }
}
</script>

<template>
  <dialog ref="el" class="builder" @close="emit('close')" @click.self="emit('close')">
    <header><h2>{{ base ? `Rebuild ${base.name}` : 'Build creature' }}</h2><button class="btn btn-ghost btn-icon" aria-label="Close" @click="emit('close')"><X :size="16" /></button></header>
    <div class="body">
      <section class="basics">
        <label class="wide"><span class="label">Name</span><input v-model="name" class="input" data-test="builder-name" /></label>
        <label><span class="label">Level</span><input v-model.number="level" type="number" :min="MIN_BUILD_LEVEL" :max="MAX_BUILD_LEVEL" class="input" /></label>
        <label><span class="label">Size</span><select v-model="size" class="input"><option v-for="s in SIZES" :key="s" :value="s">{{ SIZE_LABEL[s] }}</option></select></label>
        <label><span class="label">Rarity</span><select v-model="rarity" class="input"><option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option></select></label>
        <label class="wide"><span class="label">Traits</span><input v-model="traitsText" class="input" placeholder="humanoid, goblin" /></label>
        <label class="wide"><span class="label">Road map</span>
          <select :value="build.roadmap" class="input" @change="applyRoadmap(val($event))"><option v-for="(r, key) in ROADMAPS" :key="key" :value="key">{{ r.label }}</option></select>
        </label>
      </section>
      <p class="faint">{{ ROADMAPS[build.roadmap]?.hint }}<template v-if="!ROADMAPS_VERIFIED && build.roadmap !== 'custom'"> Road map columns follow GM Core's sidebar and aren't checked against the book yet.</template></p>

      <h3>Statistics <span class="faint">click a column; type a number to override it</span></h3>
      <div v-for="s in BUILD_STATS" :key="s" class="stat-row">
        <span class="name">{{ STAT_LABEL[s] }}</span>
        <button v-for="c in columnsFor(s)" :key="c" class="col" :class="{ on: build.columns[s] === c }" @click="build.columns[s] = c"><b>{{ fmt(s, statValue(s, c, level)) }}</b><i>{{ COL[c] }}</i></button>
        <input :value="customNum(s)" class="input over" :class="{ set: isCustom(s) }" :placeholder="String(statValue(s, build.columns[s], level))" :aria-label="`${STAT_LABEL[s]} override`" @change="setCustom(s, val($event))" />
      </div>

      <h3>Skills</h3>
      <div v-for="(sk, i) in build.skills" :key="i" class="stat-row">
        <input v-model="sk.name" class="input name" list="builder-skills" placeholder="Skill" />
        <button v-for="c in columnsFor('skill')" :key="c" class="col" :class="{ on: sk.column === c }" @click="sk.column = c"><b>{{ signed(skillValue(c, level)) }}</b><i>{{ COL[c] }}</i></button>
        <button class="btn btn-ghost btn-icon" title="Remove skill" @click="build.skills.splice(i, 1)"><X :size="13" /></button>
      </div>
      <datalist id="builder-skills"><option v-for="n in skillNames" :key="n" :value="n" /></datalist>
      <button class="btn add" @click="build.skills.push({ name: '', column: 'moderate' })"><Plus :size="13" /> Skill</button>

      <h3>Strikes</h3>
      <div v-for="(st, i) in build.strikes" :key="i" class="block panel">
        <div class="top">
          <input v-model="st.name" class="input" placeholder="Jaws" />
          <select v-model="st.range" class="input short"><option value="melee">Melee</option><option value="ranged">Ranged</option></select>
          <input :value="st.traits.join(', ')" class="input" placeholder="traits" @change="st.traits = splitList(val($event))" />
          <input v-model="st.damageType" class="input short" placeholder="piercing" />
          <button class="btn btn-ghost btn-icon" title="Remove Strike" @click="build.strikes.splice(i, 1)"><X :size="13" /></button>
        </div>
        <div class="stat-row">
          <span class="name faint">Attack</span>
          <button v-for="c in columnsFor('attack')" :key="c" class="col" :class="{ on: st.attack === c }" @click="st.attack = c"><b>{{ signed(attackValue(c, level)) }}</b><i>{{ COL[c] }}</i></button>
          <input :value="customNum(`strike:${i}:attack`)" class="input over" :class="{ set: isCustom(`strike:${i}:attack`) }" placeholder="—" @change="setCustom(`strike:${i}:attack`, val($event))" />
        </div>
        <div class="stat-row">
          <span class="name faint">Damage</span>
          <button v-for="c in columnsFor('damage')" :key="c" class="col dmg" :class="{ on: st.damage === c }" @click="st.damage = c"><b>{{ damageFormula(c, level) }}</b><i>{{ COL[c] }}</i></button>
          <input :value="build.custom[`strike:${i}:damage`] ?? ''" class="input over dice" :class="{ set: isCustom(`strike:${i}:damage`) }" placeholder="dice" @change="setCustom(`strike:${i}:damage`, val($event), true)" />
        </div>
      </div>
      <button class="btn add" @click="addStrike"><Plus :size="13" /> Strike</button>

      <h3>Spellcasting</h3>
      <div class="stat-row">
        <button class="col" :class="{ on: !build.spell }" @click="build.spell = null"><b>—</b><i>none</i></button>
        <button v-for="c in columnsFor('spell')" :key="c" class="col dmg" :class="{ on: build.spell?.column === c }" @click="setSpell(c)"><b>DC {{ spellDc(c, level).dc }}</b><i>{{ COL[c] }}</i></button>
        <template v-if="build.spell">
          <select v-model="build.spell.tradition" class="input short"><option v-for="t in TRADITIONS" :key="t" :value="t">{{ t }}</option></select>
          <select v-model="build.spell.type" class="input short"><option value="innate">innate</option><option value="prepared">prepared</option><option value="spontaneous">spontaneous</option></select>
        </template>
      </div>

      <h3>Abilities</h3>
      <div v-for="(a, i) in actions" :key="i" class="block panel">
        <div class="top">
          <input v-model="a.name" class="input" placeholder="Ability name" />
          <select :value="costKey(a.cost)" class="input short" @change="a.cost = COSTS[val($event)]?.cost ?? 1"><option v-for="(c, key) in COSTS" :key="key" :value="key">{{ c.label }}</option></select>
          <select v-model="a.section" class="input short"><option value="interaction">interaction</option><option value="defensive">defensive</option><option value="offensive">offensive</option></select>
          <button class="btn btn-ghost btn-icon" title="Remove ability" @click="actions.splice(i, 1)"><X :size="13" /></button>
        </div>
        <textarea v-model="a.text" class="input" rows="2" placeholder="What it does" />
      </div>
      <div class="top">
        <button class="btn add" @click="actions.push({ name: '', cost: 1, section: 'offensive', traits: [], text: '' })"><Plus :size="13" /> Ability</button>
        <input v-model="copySearch" class="input" placeholder="Copy from a compendium creature…" />
      </div>
      <div v-if="copyFrom" class="copy">
        <div class="faint">{{ copyFrom.name }}: <a @click="copyFrom = null">pick another</a></div>
        <div v-if="!copyFrom.actions.length" class="faint">No abilities.</div>
        <div v-for="a in copyFrom.actions" :key="a.name" class="copy-row"><span>{{ a.name }} <span class="faint">{{ formatActionCost(a.cost) }}</span></span><a @click="actions.push(clone(a))">Add</a></div>
      </div>
      <div v-else-if="copyResults.length" class="copy">
        <button v-for="r in copyResults" :key="r.id" class="copy-row" @click="pickCopy(r.id)">{{ r.name }} <span class="faint">creature {{ r.level }}</span></button>
      </div>
      <p v-if="base && keptCustom.length" class="faint">Kept typed-over values (they don't follow the level): {{ keptCustom.join(', ') }}</p>
    </div>
    <footer>
      <span class="faint num grow">{{ summary }}</span>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button v-if="!base" class="btn" :disabled="!name.trim()" @click="save(true)">Save and edit</button>
      <button class="btn btn-primary" :disabled="!name.trim()" @click="save(false)">{{ base ? 'Rebuild' : 'Save' }}</button>
    </footer>
  </dialog>
</template>

<style scoped>
.builder { width: min(820px, 94vw); max-height: 90vh; padding: 0; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--bg-raised); color: var(--text); box-shadow: var(--shadow); }
.builder[open] { display: flex; flex-direction: column; }
.builder::backdrop { background: rgb(0 0 0 / .5); }
header, footer { display: flex; align-items: center; gap: .5rem; padding: .7rem 1rem; border-bottom: var(--frame); }
header h2 { flex: 1; }
footer { border-bottom: 0; border-top: var(--frame); }
.grow { flex: 1; }
.body { overflow: auto; padding: .9rem 1rem; display: flex; flex-direction: column; gap: .4rem; }
h3 { margin-top: .8rem; color: var(--accent); }
h3 .faint { font-family: var(--font-ui); font-size: .8rem; text-transform: none; letter-spacing: 0; margin-left: .5rem; }
.basics { display: grid; grid-template-columns: repeat(6, 1fr); gap: .5rem .7rem; }
.basics .wide { grid-column: span 3; }
.stat-row { display: flex; align-items: center; gap: 4px; }
.name { width: 6.5rem; flex: none; }
.col { display: flex; flex-direction: column; align-items: center; width: 3.6rem; padding: .15rem 0; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); color: var(--text-dim); line-height: 1.15; }
.col.dmg { width: 5.6rem; }
.col b { font-family: var(--font-mono); font-weight: 500; font-size: .85rem; }
.col i { font-style: normal; font-size: .62rem; text-transform: uppercase; letter-spacing: .08em; color: var(--text-faint); }
.col.on { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }
.over { width: 4.6rem; margin-left: .4rem; } .over.dice { width: 7rem; }
.over.set { border-color: var(--accent-2); }
.block { padding: .5rem .6rem; background: var(--bg-sunken); display: flex; flex-direction: column; gap: .35rem; }
.top { display: flex; gap: .4rem; align-items: center; }
.short { width: 8rem; flex: none; }
.add { align-self: flex-start; flex: none; }
.copy { border: var(--frame); border-radius: var(--radius); padding: .4rem .6rem; display: flex; flex-direction: column; gap: .2rem; }
.copy-row { display: flex; justify-content: space-between; gap: 1rem; background: none; border: 0; text-align: left; padding: .1rem 0; }
.copy a { cursor: pointer; }
</style>

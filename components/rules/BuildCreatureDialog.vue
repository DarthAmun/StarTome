<template>
  <Teleport to="body">
    <div v-if="open" class="pv-dialog-mask" @click.self="emit('close')">
      <div class="pv-dialog bc-dialog" @keydown.esc="emit('close')">
        <div class="bc-head">
          <span class="bc-title">{{ base ? `Rebuild ${base.name}` : 'Build creature' }}</span>
          <button class="bc-close" @click="emit('close')">✕</button>
        </div>

        <div class="bc-body">
          <!-- 1. Basics -->
          <section class="bc-section">
            <div class="bc-grid-basics">
              <label class="bc-field bc-field--wide">Name <input v-model="name" class="bc-input" /></label>
              <label class="bc-field">Level
                <input v-model.number="level" type="number" :min="MIN_BUILD_LEVEL" :max="MAX_BUILD_LEVEL" class="bc-input bc-input--num" />
              </label>
              <label class="bc-field">Size
                <select v-model="size" class="bc-input"><option v-for="s in SIZES" :key="s" :value="s">{{ SIZE_LABEL[s] }}</option></select>
              </label>
              <label class="bc-field">Rarity
                <select v-model="rarity" class="bc-input"><option v-for="r in RARITIES" :key="r" :value="r">{{ r }}</option></select>
              </label>
              <label class="bc-field bc-field--wide">Traits <input v-model="traitsText" class="bc-input" placeholder="humanoid, goblin" /></label>
              <label class="bc-field bc-field--wide">Road map
                <select :value="build.roadmap" class="bc-input" @change="applyRoadmap(($event.target as HTMLSelectElement).value)">
                  <option v-for="(r, key) in ROADMAPS" :key="key" :value="key">{{ r.label }}</option>
                </select>
              </label>
            </div>
            <p class="bc-hint">{{ ROADMAPS[build.roadmap]?.hint }}<template v-if="!ROADMAPS_VERIFIED && build.roadmap !== 'custom'"> Road map columns follow GM Core's sidebar and aren't checked against the book yet.</template></p>
          </section>

          <!-- 2. Statistics -->
          <section class="bc-section">
            <div class="bc-section-title">Statistics <span class="bc-dim">click a column; type a number to override it</span></div>
            <div class="bc-stats">
              <div v-for="s in BUILD_STATS" :key="s" class="bc-stat-row">
                <span class="bc-stat-label">{{ STAT_LABEL[s] }}</span>
                <div class="bc-cols">
                  <button v-for="c in columnsFor(s)" :key="c" class="bc-col"
                    :class="{ on: build.columns[s] === c }" :title="c" @click="build.columns[s] = c">
                    <span class="bc-col-num">{{ fmt(s, statValue(s, c, level)) }}</span>
                    <span class="bc-col-label">{{ COL_SHORT[c] }}</span>
                  </button>
                </div>
                <input :value="customNum(s)" class="bc-input bc-input--num bc-custom" :class="{ set: isCustom(s) }" :placeholder="String(statValue(s, build.columns[s], level))" @change="setCustom(s, ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
          </section>

          <!-- Skills -->
          <section class="bc-section">
            <div class="bc-section-title">Skills</div>
            <div v-for="(sk, i) in build.skills" :key="i" class="bc-stat-row">
              <input v-model="sk.name" class="bc-input bc-stat-label" list="bc-skill-list" placeholder="Skill" />
              <div class="bc-cols">
                <button v-for="c in columnsFor('skill')" :key="c" class="bc-col" :class="{ on: sk.column === c }" @click="sk.column = c">
                  <span class="bc-col-num">{{ signed(skillValue(c, level)) }}</span>
                  <span class="bc-col-label">{{ COL_SHORT[c] }}</span>
                </button>
              </div>
              <button class="bc-x" title="Remove skill" @click="build.skills.splice(i, 1)">✕</button>
            </div>
            <datalist id="bc-skill-list"><option v-for="s in skillNames" :key="s" :value="s" /></datalist>
            <button class="bc-add" @click="build.skills.push({ name: '', column: 'moderate' })">+ Skill</button>
          </section>

          <!-- 3. Strikes -->
          <section class="bc-section">
            <div class="bc-section-title">Strikes</div>
            <div v-for="(st, i) in build.strikes" :key="i" class="bc-strike">
              <div class="bc-strike-top">
                <input v-model="st.name" class="bc-input" placeholder="Jaws" />
                <select v-model="st.range" class="bc-input bc-input--short"><option value="melee">Melee</option><option value="ranged">Ranged</option></select>
                <input :value="st.traits.join(', ')" class="bc-input" placeholder="traits" @change="st.traits = splitList(($event.target as HTMLInputElement).value)" />
                <input v-model="st.damageType" class="bc-input bc-input--short" placeholder="piercing" />
                <button class="bc-x" title="Remove Strike" @click="build.strikes.splice(i, 1)">✕</button>
              </div>
              <div class="bc-strike-cols">
                <span class="bc-dim">Attack</span>
                <button v-for="c in columnsFor('attack')" :key="c" class="bc-col" :class="{ on: st.attack === c }" @click="st.attack = c">
                  <span class="bc-col-num">{{ signed(attackValue(c, level)) }}</span><span class="bc-col-label">{{ COL_SHORT[c] }}</span>
                </button>
                <input :value="customNum(`strike:${i}:attack`)" class="bc-input bc-input--num bc-custom" :class="{ set: isCustom(`strike:${i}:attack`) }" placeholder="—" @change="setCustom(`strike:${i}:attack`, ($event.target as HTMLInputElement).value)" />
              </div>
              <div class="bc-strike-cols">
                <span class="bc-dim">Damage</span>
                <button v-for="c in columnsFor('damage')" :key="c" class="bc-col bc-col--dmg" :class="{ on: st.damage === c }" @click="st.damage = c">
                  <span class="bc-col-num">{{ damageFormula(c, level) }}</span><span class="bc-col-label">{{ COL_SHORT[c] }}</span>
                </button>
                <input :value="build.custom[`strike:${i}:damage`] ?? ''" class="bc-input bc-custom bc-input--dice" :class="{ set: isCustom(`strike:${i}:damage`) }" placeholder="dice" @change="setCustomText(`strike:${i}:damage`, ($event.target as HTMLInputElement).value)" />
              </div>
            </div>
            <button class="bc-add" @click="addStrike">+ Strike</button>
          </section>

          <!-- Spells -->
          <section class="bc-section">
            <div class="bc-section-title">Spellcasting</div>
            <div class="bc-strike-cols">
              <button class="bc-col" :class="{ on: !build.spell }" @click="build.spell = null"><span class="bc-col-num">—</span><span class="bc-col-label">none</span></button>
              <button v-for="c in columnsFor('spell')" :key="c" class="bc-col" :class="{ on: build.spell?.column === c }" @click="setSpell(c)">
                <span class="bc-col-num">DC {{ spellDc(c, level).dc }}</span><span class="bc-col-label">{{ COL_SHORT[c] }}</span>
              </button>
              <template v-if="build.spell">
                <select v-model="build.spell.tradition" class="bc-input bc-input--short"><option v-for="t in TRADITIONS" :key="t" :value="t">{{ t }}</option></select>
                <select v-model="build.spell.type" class="bc-input bc-input--short"><option value="innate">innate</option><option value="prepared">prepared</option><option value="spontaneous">spontaneous</option></select>
              </template>
            </div>
          </section>

          <!-- 4. Abilities -->
          <section class="bc-section">
            <div class="bc-section-title">Abilities</div>
            <div v-for="(a, i) in actions" :key="i" class="bc-ability">
              <div class="bc-strike-top">
                <input v-model="a.name" class="bc-input" placeholder="Ability name" />
                <select :value="costKey(a.cost)" class="bc-input bc-input--short" @change="a.cost = COSTS[($event.target as HTMLSelectElement).value].cost">
                  <option v-for="(c, key) in COSTS" :key="key" :value="key">{{ c.label }}</option>
                </select>
                <select v-model="a.section" class="bc-input bc-input--short">
                  <option value="interaction">interaction</option><option value="defensive">defensive</option><option value="offensive">offensive</option>
                </select>
                <button class="bc-x" title="Remove ability" @click="actions.splice(i, 1)">✕</button>
              </div>
              <textarea v-model="a.text" class="bc-input bc-text" rows="2" placeholder="What it does" />
            </div>
            <div class="bc-strike-top">
              <button class="bc-add" @click="actions.push({ name: '', cost: 1, section: 'offensive', traits: [], text: '' })">+ Ability</button>
              <input v-model="copySearch" class="bc-input" placeholder="Copy from a compendium creature…" />
            </div>
            <div v-if="copyResults.length && !copyFrom" class="bc-copy-list">
              <button v-for="r in copyResults" :key="r.id" class="bc-copy-row" @click="pickCopy(r.id)">{{ r.name }} <span class="bc-dim">{{ r.kind }} {{ r.level }}</span></button>
            </div>
            <div v-if="copyFrom" class="bc-copy-list">
              <div class="bc-dim">{{ copyFrom.name }}: <button class="bc-link" @click="copyFrom = null">pick another</button></div>
              <div v-if="!copyFrom.actions.length" class="bc-dim">No abilities.</div>
              <div v-for="a in copyFrom.actions" :key="a.name" class="bc-copy-row">
                <span>{{ a.name }} <span class="bc-dim">{{ formatActionCost(a.cost) }}</span></span>
                <button class="bc-link" @click="actions.push(JSON.parse(JSON.stringify(a)))">Add</button>
              </div>
            </div>
          </section>

          <p v-if="base && keptCustom.length" class="bc-hint">Kept typed-over values (they don't follow the level): {{ keptCustom.join(', ') }}</p>
        </div>

        <div class="bc-foot">
          <span class="bc-dim">{{ summary }}</span>
          <button class="ghost-btn" @click="emit('close')">Cancel</button>
          <button v-if="!base" class="ghost-btn" :disabled="!name.trim()" @click="save(true)">Save and edit</button>
          <button class="seal-btn" :disabled="!name.trim()" @click="save(false)">{{ base ? 'Rebuild' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * Builds a homebrew creature from GM Core's creature-building tables
 * (FEATURES_PLAN §10.3), or rebuilds one at another level. The result is a
 * plain `user` creature; its road map and columns are kept in `build`.
 */
import { useCreatureSearch } from '~/composables/useCreatureSearch'
import { rulesGet, rulesSaveUser } from '~/composables/useRules'
import {
  attackValue, buildStats, BUILD_STATS, columnsFor, customKeys, damageFormula, MAX_BUILD_LEVEL, MIN_BUILD_LEVEL,
  newBuild, roadmapColumns, ROADMAPS, ROADMAPS_VERIFIED, skillValue, spellDc, statValue,
  type BuildStat, type Column, type CreatureBuild,
} from '~/rules/creatureBuilding'
import { newRulesEntity } from '~/rules/factory'
import { formatActionCost, signed, SIZE_LABEL } from '~/rules/format'
import type { GameId } from '~/types/game'
import { RARITIES, SIZES, type ActionCost, type Creature, type Rarity, type Size, type StatAction } from '~/types/rules'

const props = defineProps<{ open: boolean; game: GameId; level?: number; base?: Creature | null }>()
const emit = defineEmits<{ close: []; saved: [creature: Creature, edit: boolean] }>()

const STAT_LABEL: Record<BuildStat, string> = {
  perception: 'Perception', str: 'Str', dex: 'Dex', con: 'Con', int: 'Int', wis: 'Wis', cha: 'Cha',
  ac: 'AC', fort: 'Fort', ref: 'Ref', will: 'Will', hp: 'HP',
}
const COL_SHORT: Record<Column, string> = { extreme: 'Ext', high: 'High', moderate: 'Mod', low: 'Low', terrible: 'Ter' }
const TRADITIONS = ['arcane', 'divine', 'occult', 'primal']
const COSTS: Record<string, { label: string; cost: ActionCost }> = {
  passive: { label: 'passive', cost: 'passive' }, '1': { label: '◆', cost: 1 }, '2': { label: '◆◆', cost: 2 },
  '3': { label: '◆◆◆', cost: 3 }, free: { label: '◇ free', cost: 'free' }, reaction: { label: '⤾ reaction', cost: 'reaction' },
}
const PF2E_SKILLS = ['Acrobatics', 'Arcana', 'Athletics', 'Crafting', 'Deception', 'Diplomacy', 'Intimidation', 'Medicine', 'Nature', 'Occultism', 'Performance', 'Religion', 'Society', 'Stealth', 'Survival', 'Thievery']
const skillNames = computed(() => props.game === 'sf2e' ? [...PF2E_SKILLS, 'Computers', 'Piloting'].sort() : PF2E_SKILLS)

const name = ref('')
const level = ref(1)
const size = ref<Size>('med')
const rarity = ref<Rarity>('common')
const traitsText = ref('')
const build = ref<CreatureBuild>(newBuild())
const actions = ref<StatAction[]>([])

// ── Copy abilities from a compendium creature ──
const gameRef = computed(() => props.game)
const { search: copySearch, results: copyResults } = useCreatureSearch(gameRef, { limit: 8 })
const copyFrom = shallowRef<Creature | null>(null)
async function pickCopy(id: string) {
  const e = await rulesGet(id)
  copyFrom.value = e?.kind === 'creature' ? e as Creature : null
}

watch(() => props.open, (open) => {
  if (!open) return
  const b = props.base
  name.value = b?.name ?? ''
  level.value = b?.level ?? props.level ?? 1
  size.value = b?.size ?? 'med'
  rarity.value = b?.rarity ?? 'common'
  traitsText.value = (b?.traits ?? []).join(', ')
  build.value = b?.build ? JSON.parse(JSON.stringify(b.build)) : newBuild()
  actions.value = b ? JSON.parse(JSON.stringify(b.actions)) : []
  copySearch.value = ''
  copyFrom.value = null
}, { immediate: true })

function applyRoadmap(key: string) {
  const r = ROADMAPS[key]
  build.value.roadmap = key
  build.value.columns = roadmapColumns(key)
  for (const s of build.value.strikes) {
    s.attack = r?.attack ?? 'moderate'
    s.damage = r?.damage ?? 'moderate'
  }
  build.value.spell = r?.spell ? { column: r.spell, tradition: build.value.spell?.tradition ?? 'arcane', type: build.value.spell?.type ?? 'innate' } : null
}

function addStrike() {
  const r = ROADMAPS[build.value.roadmap]
  build.value.strikes.push({ name: '', range: 'melee', traits: [], damageType: 'bludgeoning', attack: r?.attack ?? 'moderate', damage: r?.damage ?? 'moderate' })
}

function setSpell(column: Column) {
  build.value.spell = { column, tradition: build.value.spell?.tradition ?? 'arcane', type: build.value.spell?.type ?? 'innate' }
}

// ── Typed-over values ──
function isCustom(key: string) {
  const v = build.value.custom[key]
  return v !== undefined && v !== ''
}
function customNum(key: string) {
  const v = build.value.custom[key]
  return typeof v === 'number' ? v : ''
}
function setCustom(key: string, text: string) {
  const n = Number(text)
  if (text.trim() === '' || !Number.isFinite(n)) delete build.value.custom[key]
  else build.value.custom[key] = Math.round(n)
}
function setCustomText(key: string, text: string) {
  if (!text.trim()) delete build.value.custom[key]
  else build.value.custom[key] = text.trim()
}

const keptCustom = computed(() => customKeys(build.value).map(k => k.startsWith('strike:')
  ? `Strike ${Number(k.split(':')[1]) + 1} ${k.split(':')[2]}` : STAT_LABEL[k as BuildStat] ?? k))

function fmt(stat: BuildStat, v: number) {
  return stat === 'ac' || stat === 'hp' ? String(v) : signed(v)
}

function splitList(text: string) {
  return text.split(',').map(t => t.trim().toLowerCase()).filter(Boolean)
}

function costKey(cost: ActionCost): string {
  if (cost === null || cost === 'passive') return 'passive'
  if (typeof cost === 'object') return 'min' in cost ? String(cost.min) : 'passive'
  return String(cost)
}

const summary = computed(() => {
  const s = buildStats(build.value, level.value)
  return `AC ${s.ac} · HP ${s.hp} · Fort ${signed(s.saves.fort)} Ref ${signed(s.saves.ref)} Will ${signed(s.saves.will)}`
})

// ── Save ──
async function save(edit: boolean) {
  const stats = buildStats(build.value, level.value)
  const start = props.base ?? newRulesEntity('creature', { name: name.value.trim(), game: props.game }) as Creature
  const creature: Creature = {
    ...start,
    ...stats,
    name: name.value.trim(),
    level: level.value,
    size: size.value,
    rarity: rarity.value,
    traits: splitList(traitsText.value),
    actions: actions.value.filter(a => a.name.trim()),
    // Strikes from the builder replace the old ones; spells keep their list when the DC changes
    spellcasting: stats.spellcasting.map((sc, i) => ({ ...sc, spells: start.spellcasting[i]?.spells ?? [] })),
    build: build.value,
  }
  const saved = await rulesSaveUser(creature) as Creature
  emit('saved', saved, edit)
}
</script>

<style scoped>
.bc-dialog { width: 860px; }
.bc-head { display: flex; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--border); }
.bc-title { flex: 1; font-family: var(--fh); font-size: 16px; font-weight: 700; }
.bc-close { background: none; border: none; color: var(--text2); cursor: pointer; font-size: 14px; }
.bc-body { overflow-y: auto; padding: 8px 16px 12px; display: flex; flex-direction: column; gap: 10px; }
.bc-section { display: flex; flex-direction: column; gap: 4px; }
.bc-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text2); margin-top: 4px; }
.bc-dim { color: var(--text3); font-size: 11px; font-weight: 400; text-transform: none; letter-spacing: 0; }
.bc-hint { font-size: 11.5px; color: var(--text3); margin: 2px 0 0; }
.bc-grid-basics { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px 10px; }
.bc-field { display: flex; flex-direction: column; gap: 2px; font-size: 11px; color: var(--text2); grid-column: span 1; }
.bc-field--wide { grid-column: span 2; }
.bc-input { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font-size: 12.5px; min-width: 0; }
.bc-input--num { width: 64px; }
.bc-input--short { width: 110px; flex: none; }
.bc-input--dice { width: 90px; }
.bc-custom.set { border-color: var(--accent-l, #c9973a); }
.bc-stats { display: flex; flex-direction: column; gap: 3px; }
.bc-stat-row { display: flex; align-items: center; gap: 8px; }
.bc-stat-label { width: 110px; flex: none; font-size: 12.5px; }
.bc-cols, .bc-strike-cols { display: flex; gap: 3px; flex-wrap: wrap; align-items: center; }
.bc-col { display: flex; flex-direction: column; align-items: center; min-width: 52px; padding: 2px 6px; border: 1px solid var(--border); border-radius: 4px; background: transparent; color: var(--text); cursor: pointer; }
.bc-col--dmg { min-width: 70px; }
.bc-col.on { background: var(--accent, #8b2030); border-color: transparent; color: #fff; }
.bc-col-num { font-size: 12.5px; font-weight: 700; }
.bc-col-label { font-size: 9px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.75; }
.bc-strike, .bc-ability { display: flex; flex-direction: column; gap: 4px; padding: 6px 0; border-bottom: 1px dashed var(--border); }
.bc-strike-top { display: flex; gap: 6px; align-items: center; }
.bc-strike-top .bc-input:not(.bc-input--short) { flex: 1; }
.bc-text { width: 100%; resize: vertical; font-family: inherit; }
.bc-x { background: none; border: none; color: var(--text3); cursor: pointer; }
.bc-add, .bc-link { align-self: flex-start; background: none; border: none; color: var(--accent-l, #c9973a); cursor: pointer; font-size: 12px; padding: 2px 0; }
.bc-copy-list { display: flex; flex-direction: column; gap: 2px; max-height: 160px; overflow-y: auto; padding: 4px 8px; border: 1px solid var(--border); border-radius: 4px; }
.bc-copy-row { display: flex; justify-content: space-between; gap: 8px; background: none; border: none; color: var(--text); text-align: left; cursor: pointer; font-size: 12.5px; padding: 2px 0; }
.bc-foot { display: flex; align-items: center; gap: 8px; padding: 10px 16px; border-top: 1px solid var(--border); }
.bc-foot .bc-dim { flex: 1; font-size: 12px; }
@media (max-width: 640px) {
  .bc-grid-basics { grid-template-columns: repeat(2, 1fr); }
  .bc-stat-label { width: 70px; }
}
</style>

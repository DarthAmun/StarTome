<script setup lang="ts">
/**
 * An NPC's progression: class features and feat slots level by level, from
 * the ancestry, class and level on its entry. A slot lists the feats that
 * could fill it. A class that is not in the compendium gets the usual levels.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { X } from 'lucide-vue-next'
import type { GameId } from '@/domain/game'
import { parseLevel } from '@/domain/rules/party'
import { FEAT_SLOTS, levelPlan, SLOT_LABEL, slotOptions, slotTotals, type Slot } from '@/domain/rules/progression'
import { classTrait } from '@/domain/rules/subclasses'
import type { Feat, ReferenceEntry } from '@/domain/rules/types'
import { rulesClassFeats, rulesFindByName, rulesQuery } from '@/data/rules'
import { rulesRevision } from '@/ui/rulesLive'
import { peek } from '@/ui/workbench'

const props = defineProps<{ ancestry: string; classes: string[]; level: string; game: GameId }>()

type PlanClass = Pick<ReferenceEntry, 'name' | 'features' | 'progression'>
const found = shallowRef<{ ancestry?: ReferenceEntry; classes: (ReferenceEntry | undefined)[] }>({ classes: [] })
let token = 0
watch(() => [props.ancestry, props.classes.join('|'), props.game, rulesRevision.value] as const, async () => {
  const mine = ++token
  const find = async (kind: 'ancestry' | 'class', name: string) => (name.trim() ? await rulesFindByName(kind, name, props.game) as ReferenceEntry | undefined : undefined)
  const [ancestry, ...classes] = await Promise.all([find('ancestry', props.ancestry), ...props.classes.map(c => find('class', c))])
  if (mine === token) found.value = { ancestry, classes }
}, { immediate: true })

/** Ancestry feats carry the ancestry's name as a trait, made up or not. */
const ancestryName = computed(() => found.value.ancestry?.name ?? (props.ancestry.trim() || undefined))
const classEntries = computed(() => props.classes.map((name, i): PlanClass | null => (name.trim() ? found.value.classes[i] ?? { name: name.trim() } : null)).filter((c): c is PlanClass => !!c))
const custom = computed(() => classEntries.value.filter(c => !('id' in c)).map(c => c.name))
const dual = computed(() => classEntries.value.length > 1)
const level = computed(() => parseLevel(props.level))
const showAll = ref(false)
const shownLevel = computed(() => level.value ?? 20)
const plan = computed(() => levelPlan(classEntries.value))
const rows = computed(() => (showAll.value || level.value === null ? plan.value : plan.value.filter(r => r.level <= (level.value ?? 20))))
const totals = computed(() => slotTotals(plan.value, shownLevel.value))

const slotKey = (s: Slot) => `${s.kind}:${s.className ?? ''}`
const isFeatSlot = (s: Slot) => FEAT_SLOTS.includes(s.kind)
const slotLabel = (s: Slot, plural = false) => `${SLOT_LABEL[s.kind]}${plural ? 's' : ''}${s.kind === 'classFeat' && dual.value ? ` (${s.className})` : ''}`

const open = ref<{ slot: Slot; level: number } | null>(null)
const search = ref('')
const options = shallowRef<Feat[]>([])
const loading = ref(false)
watch(() => [level.value, props.classes.join('|')], () => { open.value = null })
const isOpen = (s: Slot, lvl: number) => !!open.value && slotKey(open.value.slot) === slotKey(s) && open.value.level === lvl
function openSlot(s: Slot, lvl: number) { if (isFeatSlot(s)) open.value = isOpen(s, lvl) ? null : { slot: s, level: lvl } }

function featsFor(s: Slot): Promise<Feat[]> {
  if (s.kind === 'classFeat') return rulesClassFeats(classTrait(s.className ?? ''), props.game)
  const trait = s.kind === 'ancestryFeat' ? (ancestryName.value ? classTrait(ancestryName.value) : null) : 'general'
  return trait ? rulesQuery({ kind: 'feat', games: [props.game], traits: [trait], limit: 5000 }).then(p => p.items as Feat[]) : Promise.resolve([])
}
let optToken = 0
watch(() => [open.value, ancestryName.value, rulesRevision.value] as const, async ([o]) => {
  const mine = ++optToken
  if (!o) { options.value = []; return }
  loading.value = true
  const feats = await featsFor(o.slot)
  if (mine !== optToken) return
  options.value = slotOptions(feats, o.slot, o.level, ancestryName.value)
  loading.value = false
})
const filtered = computed(() => { const q = search.value.trim().toLowerCase(); return q ? options.value.filter(f => f.name.toLowerCase().includes(q) || f.traits.includes(q)) : options.value })
async function openFeature(name: string) { const f = await rulesFindByName('feat', name, props.game); if (f) peek({ kind: 'rules', id: f.id }) }
</script>

<template>
  <div class="prog">
    <p v-if="!classEntries.length" class="faint">Set a class in the fields above (from the compendium or your own) to see the feat slots level by level.</p>
    <p v-else-if="custom.length" class="faint">{{ custom.join(' and ') }}: not in the compendium, so the usual feat levels and no class features. Class feats are the ones with the trait “{{ custom.map(classTrait).join('” or “') }}”.</p>
    <div v-if="totals.length" class="totals">
      <span class="faint">By level {{ shownLevel }}:</span>
      <button v-for="t in totals" :key="slotKey(t.slot)" class="chip" :class="{ on: isOpen(t.slot, shownLevel), still: !isFeatSlot(t.slot) }" @click="openSlot(t.slot, shownLevel)">{{ slotLabel(t.slot) }} <span class="num">×{{ t.count }}</span></button>
    </div>
    <table>
      <tbody>
        <tr v-for="row in rows" :key="row.level" :class="{ future: level !== null && row.level > level }">
          <td class="num lvl">{{ row.level }}</td>
          <td><template v-for="(f, i) in row.features" :key="f.className + f.name"><a @click="openFeature(f.name)">{{ f.name }}</a><span v-if="dual" class="faint"> ({{ f.className }})</span><template v-if="i < row.features.length - 1">, </template></template></td>
          <td class="slots"><button v-for="s in row.slots" :key="slotKey(s)" class="chip" :class="{ on: isOpen(s, row.level), still: !isFeatSlot(s) }" @click="openSlot(s, row.level)">{{ slotLabel(s) }}</button></td>
        </tr>
      </tbody>
    </table>
    <button v-if="level !== null && level < 20" class="btn btn-ghost" @click="showAll = !showAll">{{ showAll ? `Hide levels above ${level}` : `Show levels ${level + 1}–20` }}</button>
    <aside v-if="open" class="options panel">
      <header><b>{{ slotLabel(open.slot, true) }}</b><span class="faint"> up to level {{ open.level }}</span><span class="grow" /><button class="btn btn-ghost btn-icon" title="Close" @click="open = null"><X :size="14" /></button></header>
      <input v-model="search" class="input" placeholder="Filter…" />
      <p v-if="loading" class="faint">Loading…</p>
      <p v-else-if="open.slot.kind === 'ancestryFeat' && !ancestryName" class="faint">Set an ancestry first.</p>
      <template v-else>
        <p class="faint">{{ filtered.length }} {{ filtered.length === 1 ? 'feat' : 'feats' }}</p>
        <ul><li v-for="f in filtered" :key="f.id" @click="peek({ kind: 'rules', id: f.id })"><span class="num faint">{{ f.level }}</span><span>{{ f.name }}</span><span v-if="f.publication && !f.publication.remaster" class="faint" :title="`From ${f.publication.title}, a pre-Remaster book`">legacy</span></li></ul>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.prog { display: flex; flex-direction: column; gap: .5rem; }
.prog p { margin: 0; }
.totals, .slots { display: flex; flex-wrap: wrap; gap: .25rem; align-items: center; }
.chip { background: none; cursor: pointer; font-size: .75rem; }
.chip.still { cursor: default; opacity: .75; }
.chip.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
table { border-collapse: collapse; width: 100%; }
td { padding: .2rem .5rem .2rem 0; border-bottom: var(--frame); vertical-align: top; }
.lvl { width: 2rem; color: var(--text-dim); }
tr.future { opacity: .55; }
a { cursor: pointer; }
.options { padding: .6rem .7rem; display: flex; flex-direction: column; gap: .35rem; background: var(--bg-sunken); }
.options header { display: flex; align-items: center; gap: .3rem; }
.grow { flex: 1; }
ul { list-style: none; margin: 0; padding: 0; max-height: 300px; overflow: auto; }
li { display: grid; grid-template-columns: 2rem 1fr auto; gap: .4rem; padding: .15rem .2rem; cursor: pointer; }
li:hover { background: var(--bg-hover); }
</style>

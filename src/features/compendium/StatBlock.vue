<script setup lang="ts">
/**
 * A compendium entry as its stat block, for all 19 kinds. Numbers that are
 * rolled at the table are buttons; names of other entries are links.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { GAME_CONFIG, type GameId } from '@/domain/game'
import { recallKnowledge } from '@/domain/rules/dcs'
import { formatActionCost, formatBulk, formatMoney, formatTrait, RARITY_COLOR, signed, SIZE_LABEL, titleCase } from '@/domain/rules/format'
import { classOptionGroups, classTrait, featuresByLevel, type OptionGroup } from '@/domain/rules/subclasses'
import { RULES_KIND_CONFIG, RULES_KINDS, type Action, type Condition, type Creature, type Feat, type Item, type ReferenceEntry, type RelicGift, type RulesEntity, type RulesKind, type Spell } from '@/domain/rules/types'
import { rulesClassFeats, rulesFindByName } from '@/data/rules'
import { notify } from '@/ui/dialogs'
import { rollDice } from '@/ui/dice'
import { rulesImageRef, useImageUrl } from '@/ui/imageUrl'
import { rulesRevision } from '@/ui/rulesLive'
import FieldNotes from './FieldNotes.vue'
import StatActor from './StatActor.vue'
import StatStarship from './StatStarship.vue'
import './stat.css'
import { formatDefense, humanize, md, ordinal } from './statText'

const props = defineProps<{ entity: RulesEntity; game?: GameId }>()
const emit = defineEmits<{ open: [id: string] }>()

const ORIGIN_LABEL = { foundry: 'Foundry compendium', user: 'Homebrew', legacy: 'Imported from DM’s Tome' } as const
const ACTOR: RulesKind[] = ['creature', 'hazard', 'vehicle']
const SHIP: RulesKind[] = ['starship', 'starshipFrame', 'battleStation', 'stationUpgrade', 'expansionBay']

const e = computed(() => props.entity)
const cfg = computed(() => RULES_KIND_CONFIG[e.value.kind])
const as = <T extends RulesEntity>(kind: RulesKind) => computed(() => (e.value.kind === kind ? e.value as T : null))
const item = as<Item>('item'), creature = as<Creature>('creature'), spell = as<Spell>('spell'), feat = as<Feat>('feat')
const action = as<Action>('action'), condition = as<Condition>('condition'), gift = as<RelicGift>('relicGift')
const reference = computed(() => ('facts' in e.value ? e.value as ReferenceEntry : null))
const featLike = computed(() => feat.value ?? action.value)
const imgUrl = useImageUrl(() => rulesImageRef(e.value.img), true)
const notesOpen = ref(false)

const headLabel = computed(() => {
  if (spell.value) {
    const kind = spell.value.traits.includes('cantrip') ? 'Cantrip' : spell.value.spellType === 'focus' ? 'Focus' : spell.value.spellType === 'ritual' ? 'Ritual' : 'Spell'
    return `${kind} ${e.value.level}`
  }
  return cfg.value.hasLevel || e.value.level ? `${cfg.value.label} ${e.value.level}` : cfg.value.label
})
const headGlyph = computed(() => (featLike.value ? formatActionCost(featLike.value.cost) : ''))
const sizeLabel = computed(() => ('size' in e.value && (e.value.kind === 'creature' || e.value.kind === 'vehicle') ? SIZE_LABEL[e.value.size] : ''))
const rk = computed(() => (e.value.kind === 'creature' || e.value.kind === 'hazard' ? recallKnowledge(e.value, props.game) : null))
const factEntries = computed(() => Object.entries(reference.value?.facts ?? {}).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)))

// Subclasses: a class lists its features and options; an option names its class
const classFeats = shallowRef<Feat[]>([])
const optionParents = shallowRef<Feat[]>([])
const optionClass = shallowRef<RulesEntity | null>(null)
const featureRows = computed(() => (e.value.kind === 'class' ? featuresByLevel(e.value as ReferenceEntry) : []))
const optionGroups = computed<OptionGroup[]>(() => (e.value.kind === 'class' ? classOptionGroups(e.value, classFeats.value) : []))

let token = 0
watch(() => [e.value, rulesRevision.value] as const, async ([entry]) => {
  const mine = ++token
  let feats: Feat[] = [], parents: Feat[] = [], cls: RulesEntity | null = null
  if (entry.kind === 'class') feats = await rulesClassFeats(classTrait(entry.name), entry.game)
  else if (entry.kind === 'feat' && (entry as Feat).optionOf?.length) {
    const tags = new Set((entry as Feat).optionOf)
    // Options without the class trait (Kineticist gates, Exemplar ikons) name the class in their tag: 'kineticist-kinetic-gate'
    for (const t of new Set([...entry.traits, ...[...tags].map(tag => tag.split('-')[0] ?? '')])) {
      const c = await rulesFindByName('class', t.replace(/-/g, ' '), props.game)
      if (!c) continue
      cls = c
      parents = (await rulesClassFeats(t, entry.game)).filter(f => f.choices?.some(x => tags.has(x)))
      break
    }
  }
  if (mine !== token) return
  classFeats.value = feats; optionParents.value = parents; optionClass.value = cls
}, { immediate: true })

async function openByName(kind: RulesKind, name: string) {
  const own = kind === 'feat' ? classFeats.value.find(f => f.name.toLowerCase() === name.toLowerCase()) : undefined
  const target = own ?? await rulesFindByName(kind, name, props.game ?? (e.value.game === 'both' ? undefined : e.value.game))
  if (target) emit('open', target.id)
  else notify(`“${name}” is not in the compendium.`)
}

/** Links and roll buttons inside rendered text. */
function onClick(ev: MouseEvent) {
  const target = ev.target as HTMLElement
  const widget = target.closest<HTMLElement>('.widget')
  if (widget?.dataset.widget === 'dice') { rollDice(widget.dataset.expr ?? 'd20', widget.dataset.label ?? e.value.name); return }
  const link = target.closest<HTMLElement>('.ref')
  if (!link) return
  ev.preventDefault()
  const kind = RULES_KINDS.find(k => k.toLowerCase() === (link.dataset.refType ?? '').toLowerCase())
  if (kind) void openByName(kind, link.dataset.refName ?? '')
}
</script>

<template>
  <article class="stat" :style="{ '--kind-color': cfg.color }" @click="onClick">
    <header class="stat-head">
      <h2>{{ e.name }} <span v-if="headGlyph" class="glyph">{{ headGlyph }}</span></h2>
      <span class="stat-kind">{{ headLabel }}</span>
    </header>
    <img v-if="imgUrl" class="stat-portrait" :src="imgUrl" :alt="e.name" />
    <div class="stat-traits">
      <span v-if="e.rarity !== 'common'" class="stat-trait rarity" :style="{ background: RARITY_COLOR[e.rarity] }">{{ e.rarity }}</span>
      <span v-if="sizeLabel" class="stat-trait">{{ sizeLabel }}</span>
      <span v-for="t in e.traits" :key="t" class="stat-trait">{{ formatTrait(t) }}</span>
    </div>
    <div v-if="rk" class="stat-rk" title="GM only: Recall Knowledge to identify this">
      <p><b>Recall Knowledge</b> DC {{ rk.dc }}<template v-if="rk.rarity !== 'common'"> ({{ rk.rarity }})</template>; {{ rk.skills.length ? rk.skills.map(titleCase).join(', ') : 'GM’s choice' }}; <b>Lore</b> DC {{ rk.loreDcs.specific }} / {{ rk.loreDcs.verySpecific }}</p>
      <button v-if="creature" class="place" title="The stat block as sentences without numbers, to copy to a player" @click.stop="notesOpen = true">Field notes</button>
    </div>
    <FieldNotes v-if="creature && notesOpen" :open="notesOpen" :creature="creature" @close="notesOpen = false" />

    <template v-if="item">
      <p class="line"><b>Price</b> {{ formatMoney(item.price, e.game) }}<template v-if="item.priceFor && item.priceFor > 1"> for {{ item.priceFor }}</template></p>
      <p class="line"><template v-if="item.usage"><b>Usage</b> {{ humanize(item.usage) }}; </template><b>Bulk</b> {{ formatBulk(item.bulk, item.bulkNote) }}<template v-if="item.hands">; <b>Hands</b> {{ item.hands }}</template></p>
      <template v-if="item.weapon">
        <p class="line"><b>Damage</b> {{ item.weapon.damage.dice }}{{ item.weapon.damage.die }} {{ item.weapon.damage.type }}<template v-if="item.weapon.range">; <b>Range</b> {{ item.weapon.range }} feet</template><template v-if="item.weapon.reload">; <b>Reload</b> {{ item.weapon.reload }}</template></p>
        <p class="line"><b>Category</b> {{ item.weapon.category }}<template v-if="item.weapon.group">; <b>Group</b> {{ item.weapon.group }}</template><template v-if="item.weapon.grade">; <b>Grade</b> {{ item.weapon.grade }}</template><template v-if="item.weapon.ammo?.capacity">; <b>Capacity</b> {{ item.weapon.ammo.capacity }}</template><template v-if="item.weapon.expend">; <b>Expend</b> {{ item.weapon.expend }}</template></p>
      </template>
      <template v-if="item.armor">
        <p class="line"><b>AC Bonus</b> {{ signed(item.armor.acBonus) }}; <b>Dex Cap</b> {{ item.armor.dexCap === null ? '—' : signed(item.armor.dexCap) }}; <b>Strength</b> {{ item.armor.strength ?? '—' }}</p>
        <p class="line"><b>Check Penalty</b> {{ item.armor.checkPenalty ? signed(item.armor.checkPenalty) : '—' }}; <b>Speed Penalty</b> {{ item.armor.speedPenalty ? `${item.armor.speedPenalty} ft.` : '—' }}; <b>Category</b> {{ item.armor.category }}<template v-if="item.armor.group">; <b>Group</b> {{ item.armor.group }}</template></p>
      </template>
      <p v-if="item.shield" class="line"><b>AC Bonus</b> {{ signed(item.shield.acBonus) }}; <b>Hardness</b> {{ item.shield.hardness }}; <b>HP</b> {{ item.shield.hp }} (BT {{ item.shield.bt }})</p>
      <template v-if="item.activation?.length">
        <hr />
        <p v-for="(a, i) in item.activation" :key="i" class="line"><b>Activate</b> <span class="glyph">{{ formatActionCost(a.cost) }}</span><template v-if="a.traits?.length"> ({{ a.traits.join(', ') }})</template><template v-if="a.text">; {{ a.text }}</template></p>
      </template>
    </template>

    <StatActor v-if="ACTOR.includes(e.kind)" :entity="e" :game="game" />
    <StatStarship v-if="SHIP.includes(e.kind)" :entity="e" :game="game" />

    <template v-if="spell">
      <p v-if="spell.traditions.length" class="line"><b>Traditions</b> {{ spell.traditions.join(', ') }}</p>
      <p class="line"><b>Cast</b> <span class="glyph">{{ formatActionCost(spell.cast) || '—' }}</span><template v-if="spell.range">; <b>Range</b> {{ spell.range }}</template><template v-if="spell.area">; <b>Area</b> {{ spell.area }}</template><template v-if="spell.targets">; <b>Targets</b> {{ spell.targets }}</template></p>
      <p v-if="spell.defense || spell.duration" class="line"><template v-if="spell.defense"><b>Defense</b> {{ formatDefense(spell.defense) }}</template><template v-if="spell.defense && spell.duration">; </template><template v-if="spell.duration"><b>Duration</b> {{ spell.sustained ? 'sustained up to ' : '' }}{{ spell.duration }}</template></p>
    </template>

    <template v-if="featLike">
      <p v-if="feat?.prerequisites.length" class="line"><b>Prerequisites</b> {{ feat.prerequisites.join('; ') }}</p>
      <p v-if="featLike.frequency" class="line"><b>Frequency</b> {{ featLike.frequency }}</p>
      <p v-if="featLike.trigger" class="line"><b>Trigger</b> {{ featLike.trigger }}</p>
      <p v-if="featLike.requirements" class="line"><b>Requirements</b> {{ featLike.requirements }}</p>
      <p v-if="optionParents.length || optionClass" class="line">
        <b>Subclass</b>{{ ' ' }}
        <template v-for="(p, i) in optionParents" :key="p.id"><a class="ref" @click.stop="emit('open', p.id)">{{ p.name }}</a><template v-if="i < optionParents.length - 1">, </template></template>
        <template v-if="optionClass"> option of the <a class="ref" @click.stop="emit('open', optionClass.id)">{{ optionClass.name }}</a></template>
      </p>
    </template>

    <template v-if="gift">
      <p class="line"><b>Gift</b> {{ titleCase(gift.tier) }}<template v-if="gift.aspects.length">; <b>Aspects</b> {{ gift.aspects.join(', ') }}</template></p>
      <p v-if="gift.prerequisites?.length" class="line"><b>Prerequisites</b> {{ gift.prerequisites.join('; ') }}</p>
      <p v-if="gift.grantsRune" class="line"><b>Grants rune</b> <a class="ref" @click.stop="openByName('item', gift.grantsRune)">{{ gift.grantsRune }}</a></p>
    </template>

    <p v-if="condition?.overrides.length" class="line"><b>Overrides</b> {{ condition.overrides.join(', ') }}</p>
    <template v-if="reference"><p v-for="[k, v] in factEntries" :key="k" class="line"><b>{{ titleCase(humanize(k)) }}</b> {{ Array.isArray(v) ? v.join(', ') : v }}</p></template>

    <template v-if="featureRows.length">
      <div class="stat-sub">Class features</div>
      <p v-for="row in featureRows" :key="row.level" class="line"><b>{{ ordinal(row.level) }}</b>{{ ' ' }}<template v-for="(n, i) in row.names" :key="n"><a class="ref" @click.stop="openByName('feat', n)">{{ n }}</a><template v-if="i < row.names.length - 1">, </template></template></p>
    </template>
    <template v-if="optionGroups.length">
      <div class="stat-sub">Subclasses</div>
      <p v-for="g in optionGroups" :key="g.tag" class="line">
        <b>{{ g.label }}</b> <span class="muted">({{ ordinal(g.level) }})</span>{{ ' ' }}
        <template v-for="(o, i) in g.options" :key="o.id"><a class="ref" @click.stop="emit('open', o.id)">{{ o.name }}</a><span v-if="o.publication && !o.publication.remaster" class="muted" :title="`From ${o.publication.title}, a pre-Remaster book`"> (legacy)</span><template v-if="i < g.options.length - 1">, </template></template>
      </p>
    </template>

    <!-- eslint-disable vue/no-v-html -- sanitised by renderMarkdown -->
    <template v-if="e.kind !== 'hazard' && e.description"><hr /><div class="prose" v-html="md(e.description)" /></template>
    <template v-if="spell?.heightened?.length"><hr /><p v-for="(h, i) in spell.heightened" :key="i" class="line"><b>Heightened ({{ h.trigger }})</b> {{ h.text }}</p></template>
    <div v-if="e.gmNotes || item?.unidentified" class="stat-gm">
      <div class="stat-gm-title">GM only</div>
      <p v-if="item?.unidentified" class="line"><b>Unidentified as</b> {{ item.unidentified.name }}</p>
      <div v-if="e.gmNotes" class="prose" v-html="md(e.gmNotes)" />
    </div>
    <!-- eslint-enable vue/no-v-html -->

    <footer class="stat-foot">
      <span v-if="e.publication">{{ e.publication.title }}<template v-if="!e.publication.remaster && e.origin === 'foundry'"> · legacy</template></span>
      <span v-else>{{ ORIGIN_LABEL[e.origin] }}</span>
      <span>{{ e.game === 'both' ? 'PF2e · SF2e' : GAME_CONFIG[e.game].short }}</span>
    </footer>
  </article>
</template>

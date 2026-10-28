<template>
  <article class="rsb" :style="{ '--kind-color': cfg.color }" @click="onClick">
    <header class="rsb-head">
      <h2 class="rsb-name">
        {{ entity.name }}
        <span v-if="headGlyph" class="rsb-glyph">{{ headGlyph }}</span>
      </h2>
      <span class="rsb-kind">{{ headLabel }}</span>
    </header>

    <div class="rsb-traits">
      <span v-if="entity.rarity !== 'common'" class="rsb-trait rsb-trait--rarity" :style="{ background: RARITY_COLOR[entity.rarity] }">{{ entity.rarity }}</span>
      <span v-if="sizeLabel" class="rsb-trait rsb-trait--size">{{ sizeLabel }}</span>
      <span v-for="t in entity.traits" :key="t" class="rsb-trait">{{ formatTrait(t) }}</span>
    </div>

    <!-- ── Item ───────────────────────────────────────────────── -->
    <template v-if="item">
      <p class="rsb-line">
        <template v-if="item.price !== undefined"><b>Price</b> {{ formatMoney(item.price, entity.game) }}</template>
      </p>
      <p class="rsb-line">
        <template v-if="item.usage"><b>Usage</b> {{ humanize(item.usage) }}; </template>
        <b>Bulk</b> {{ formatBulk(item.bulk, item.bulkNote) }}
        <template v-if="item.hands">; <b>Hands</b> {{ item.hands }}</template>
      </p>
      <template v-if="item.weapon">
        <p class="rsb-line">
          <b>Damage</b> {{ item.weapon.damage.dice }}{{ item.weapon.damage.die }} {{ item.weapon.damage.type }}
          <template v-if="item.weapon.range">; <b>Range</b> {{ item.weapon.range }} feet</template>
          <template v-if="item.weapon.reload">; <b>Reload</b> {{ item.weapon.reload }}</template>
        </p>
        <p class="rsb-line">
          <b>Category</b> {{ item.weapon.category }}<template v-if="item.weapon.group">; <b>Group</b> {{ item.weapon.group }}</template>
          <template v-if="item.weapon.ammo?.capacity">; <b>Capacity</b> {{ item.weapon.ammo.capacity }}</template>
          <template v-if="item.weapon.expend">; <b>Expend</b> {{ item.weapon.expend }}</template>
        </p>
      </template>
      <template v-if="item.armor">
        <p class="rsb-line">
          <b>AC Bonus</b> {{ signed(item.armor.acBonus) }}; <b>Dex Cap</b> {{ item.armor.dexCap === null ? '—' : signed(item.armor.dexCap) }};
          <b>Strength</b> {{ item.armor.strength ?? '—' }}
        </p>
        <p class="rsb-line">
          <b>Check Penalty</b> {{ item.armor.checkPenalty ? signed(item.armor.checkPenalty) : '—' }};
          <b>Speed Penalty</b> {{ item.armor.speedPenalty ? `${item.armor.speedPenalty} ft.` : '—' }};
          <b>Category</b> {{ item.armor.category }}<template v-if="item.armor.group">; <b>Group</b> {{ item.armor.group }}</template>
        </p>
      </template>
      <p v-if="item.shield" class="rsb-line">
        <b>AC Bonus</b> {{ signed(item.shield.acBonus) }}; <b>Hardness</b> {{ item.shield.hardness }};
        <b>HP</b> {{ item.shield.hp }} (BT {{ item.shield.bt }})
      </p>
      <template v-if="item.activation?.length">
        <hr />
        <p v-for="(a, i) in item.activation" :key="i" class="rsb-line">
          <b>Activate</b> <span class="rsb-glyph">{{ formatActionCost(a.cost) }}</span>
          <template v-if="a.traits?.length"> ({{ a.traits.join(', ') }})</template>
          <template v-if="a.text">; {{ a.text }}</template>
        </p>
      </template>
    </template>

    <!-- ── Creature ───────────────────────────────────────────── -->
    <template v-if="creature">
      <p class="rsb-line"><b>Perception</b> {{ signed(creature.perception) }}<template v-if="creature.senses.length">; {{ creature.senses.map(formatSense).join(', ') }}</template></p>
      <p v-if="creature.languages.length" class="rsb-line"><b>Languages</b> {{ creature.languages.join(', ') }}</p>
      <p v-if="skillLine" class="rsb-line"><b>Skills</b> {{ skillLine }}</p>
      <p class="rsb-line rsb-abilities">
        <span v-for="k in ABILITY_KEYS" :key="k"><b>{{ titleCase(k) }}</b> {{ signed(creature.abilities[k]) }}</span>
      </p>
      <p v-for="a in actionsIn('interaction')" :key="a.name" class="rsb-line rsb-action">
        <b>{{ a.name }}</b> <span v-if="formatActionCost(a.cost)" class="rsb-glyph">{{ formatActionCost(a.cost) }}</span>
        <template v-if="a.traits.length"> ({{ a.traits.map(formatTrait).join(', ') }})</template>
        {{ ' ' }}<span class="rsb-md" v-html="md(a.text)" />
      </p>
      <hr />
      <p class="rsb-line">
        <b>AC</b> {{ creature.ac }}<template v-if="creature.acNote"> ({{ creature.acNote }})</template>;
        <b>Fort</b> {{ signed(creature.saves.fort) }}, <b>Ref</b> {{ signed(creature.saves.ref) }}, <b>Will</b> {{ signed(creature.saves.will) }}<template v-if="creature.saveNote">; {{ creature.saveNote }}</template>
      </p>
      <p class="rsb-line">
        <b>HP</b> {{ creature.hp }}<template v-if="creature.hpNote"> ({{ creature.hpNote }})</template>
        <template v-if="creature.hardness">; <b>Hardness</b> {{ creature.hardness }}</template>
        <template v-if="creature.immunities.length">; <b>Immunities</b> {{ creature.immunities.join(', ') }}</template>
        <template v-if="creature.weaknesses.length">; <b>Weaknesses</b> {{ creature.weaknesses.map(formatIwr).join(', ') }}</template>
        <template v-if="creature.resistances.length">; <b>Resistances</b> {{ creature.resistances.map(formatIwr).join(', ') }}</template>
      </p>
      <p v-for="a in actionsIn('defensive')" :key="a.name" class="rsb-line rsb-action">
        <b>{{ a.name }}</b> <span v-if="formatActionCost(a.cost)" class="rsb-glyph">{{ formatActionCost(a.cost) }}</span>
        <template v-if="a.traits.length"> ({{ a.traits.map(formatTrait).join(', ') }})</template>
        {{ ' ' }}<span class="rsb-md" v-html="md(a.text)" />
      </p>
      <hr />
      <p class="rsb-line"><b>Speed</b> {{ speedLine }}</p>
      <p v-for="(s, i) in creature.strikes" :key="'s' + i" class="rsb-line">
        <b>{{ s.range === 'melee' ? 'Melee' : 'Ranged' }}</b> <span class="rsb-glyph">◆</span> {{ s.name }} {{ signed(s.bonus) }}
        <template v-if="s.traits.length"> ({{ s.traits.map(formatTrait).join(', ') }})</template>,
        <b>Damage</b> {{ s.damage.map(d => `${d.formula} ${d.type}`).join(' plus ') }}<template v-if="s.effects?.length"> plus {{ s.effects.join(', ') }}</template>
      </p>
      <p v-for="(sc, i) in creature.spellcasting" :key="'sc' + i" class="rsb-line">
        <b>{{ sc.name }}</b> DC {{ sc.dc }}<template v-if="sc.attack !== undefined">, attack {{ signed(sc.attack) }}</template>;
        <template v-for="(group, gi) in spellsByRank(sc)" :key="gi">
          <b>{{ group.label }}</b>
          <template v-for="(sp, si) in group.spells" :key="si">
            <span class="rsb-link" data-entity-type="spell" :data-entity-name="sp.name">{{ sp.name }}</span><template v-if="sp.uses"> (×{{ sp.uses }})</template><template v-if="si < group.spells.length - 1">, </template></template><template v-if="gi < spellsByRank(sc).length - 1">;&#32;</template>
        </template>
      </p>
      <p v-for="a in actionsIn('offensive')" :key="a.name" class="rsb-line rsb-action">
        <b>{{ a.name }}</b> <span v-if="formatActionCost(a.cost)" class="rsb-glyph">{{ formatActionCost(a.cost) }}</span>
        <template v-if="a.traits.length"> ({{ a.traits.map(formatTrait).join(', ') }})</template>
        {{ ' ' }}<span class="rsb-md" v-html="md(a.text)" />
      </p>
    </template>

    <!-- ── Hazard ─────────────────────────────────────────────── -->
    <template v-if="hazard">
      <p class="rsb-line">
        <b>Stealth</b> {{ hazard.stealth.bonus === null ? '—' : signed(hazard.stealth.bonus) }}<template v-if="hazard.stealth.note"> {{ hazard.stealth.note }}</template>
      </p>
      <div v-if="entity.description" class="rsb-md rsb-line" v-html="md(`**Description** ${entity.description}`)" />
      <hr />
      <div v-if="hazard.disable" class="rsb-md rsb-line" v-html="md(`**Disable** ${hazard.disable}`)" />
      <p v-if="hazardDefense" class="rsb-line" v-html="hazardDefense" />
      <p v-for="a in hazard.actions" :key="a.name" class="rsb-line rsb-action">
        <b>{{ a.name }}</b> <span v-if="formatActionCost(a.cost)" class="rsb-glyph">{{ formatActionCost(a.cost) }}</span>
        <template v-if="a.traits.length"> ({{ a.traits.map(formatTrait).join(', ') }})</template>
        {{ ' ' }}<span class="rsb-md" v-html="md(a.text)" />
      </p>
      <div v-if="hazard.routine" class="rsb-md rsb-line" v-html="md(`**Routine** ${hazard.routine}`)" />
      <div v-if="hazard.reset" class="rsb-md rsb-line" v-html="md(`**Reset** ${hazard.reset}`)" />
    </template>

    <!-- ── Spell ──────────────────────────────────────────────── -->
    <template v-if="spell">
      <p v-if="spell.traditions.length" class="rsb-line"><b>Traditions</b> {{ spell.traditions.join(', ') }}</p>
      <p class="rsb-line">
        <b>Cast</b> <span class="rsb-glyph">{{ formatActionCost(spell.cast) || '—' }}</span>
        <template v-if="spell.range">; <b>Range</b> {{ spell.range }}</template>
        <template v-if="spell.area">; <b>Area</b> {{ spell.area }}</template>
        <template v-if="spell.targets">; <b>Targets</b> {{ spell.targets }}</template>
      </p>
      <p v-if="spell.defense || spell.duration" class="rsb-line">
        <template v-if="spell.defense"><b>Defense</b> {{ formatDefense(spell.defense) }}</template>
        <template v-if="spell.defense && spell.duration">; </template>
        <template v-if="spell.duration"><b>Duration</b> {{ spell.sustained ? 'sustained up to ' : '' }}{{ spell.duration }}</template>
      </p>
    </template>

    <!-- ── Feat / Action ─────────────────────────────────────── -->
    <template v-if="feat || action">
      <p v-if="feat?.prerequisites.length" class="rsb-line"><b>Prerequisites</b> {{ feat.prerequisites.join('; ') }}</p>
      <p v-if="(feat ?? action)!.frequency" class="rsb-line"><b>Frequency</b> {{ (feat ?? action)!.frequency }}</p>
      <p v-if="(feat ?? action)!.trigger" class="rsb-line"><b>Trigger</b> {{ (feat ?? action)!.trigger }}</p>
      <p v-if="(feat ?? action)!.requirements" class="rsb-line"><b>Requirements</b> {{ (feat ?? action)!.requirements }}</p>
    </template>

    <!-- ── Condition ─────────────────────────────────────────── -->
    <p v-if="condition?.overrides.length" class="rsb-line"><b>Overrides</b> {{ condition.overrides.join(', ') }}</p>

    <!-- ── Reference kinds ───────────────────────────────────── -->
    <template v-if="reference && factEntries.length">
      <p v-for="[k, v] in factEntries" :key="k" class="rsb-line"><b>{{ titleCase(humanize(k)) }}</b> {{ Array.isArray(v) ? v.join(', ') : v }}</p>
    </template>

    <!-- ── Body ──────────────────────────────────────────────── -->
    <template v-if="!hazard && entity.description">
      <hr />
      <div class="rsb-md rsb-body" v-html="md(entity.description)" />
    </template>

    <template v-if="spell?.heightened?.length">
      <hr />
      <p v-for="(h, i) in spell.heightened" :key="i" class="rsb-line"><b>Heightened ({{ h.trigger }})</b> {{ h.text }}</p>
    </template>

    <template v-if="entity.gmNotes || item?.unidentified">
      <div class="rsb-gm">
        <div class="rsb-gm-title">GM only</div>
        <p v-if="item?.unidentified" class="rsb-line"><b>Unidentified as</b> {{ item.unidentified.name }}</p>
        <div v-if="entity.gmNotes" class="rsb-md" v-html="md(entity.gmNotes)" />
      </div>
    </template>

    <footer class="rsb-foot">
      <span v-if="entity.publication">{{ entity.publication.title }}<template v-if="!entity.publication.remaster"> · legacy</template></span>
      <span v-else>{{ ORIGIN_LABEL[entity.origin] }}</span>
      <span class="rsb-foot-game">{{ entity.game === 'both' ? 'PF2e · SF2e' : GAME_CONFIG[entity.game].short }}</span>
    </footer>
  </article>
</template>

<script setup lang="ts">
import { useDiceRoll } from '~/composables/useDiceRoll'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { rulesFindByName } from '~/composables/useRules'
import {
  formatActionCost, formatBulk, formatMoney, formatTrait, RARITY_COLOR, signed, SIZE_LABEL, titleCase,
} from '~/rules/format'
import { GAME_CONFIG, type GameId } from '~/types/game'
import {
  isRulesKind, RULES_KIND_CONFIG, RULES_KINDS,
  type AbilityKey, type Action, type Condition, type Creature, type Feat, type Hazard, type Item,
  type ReferenceEntry, type Resistance, type RulesEntity, type Sense, type Spell, type Spellcasting, type StatAction, type Weakness,
} from '~/types/rules'

const props = defineProps<{ entity: RulesEntity; game?: GameId }>()

const router = useRouter()
const { renderMarkdown } = useEntityMarkdown()
const { triggerRoll } = useDiceRoll()

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const ORIGIN_LABEL = { foundry: 'Foundry compendium', user: 'Homebrew', legacy: "Imported from DM's Tome" } as const

const cfg = computed(() => RULES_KIND_CONFIG[props.entity.kind])
const item = computed(() => props.entity.kind === 'item' ? props.entity as Item : null)
const creature = computed(() => props.entity.kind === 'creature' ? props.entity as Creature : null)
const hazard = computed(() => props.entity.kind === 'hazard' ? props.entity as Hazard : null)
const spell = computed(() => props.entity.kind === 'spell' ? props.entity as Spell : null)
const feat = computed(() => props.entity.kind === 'feat' ? props.entity as Feat : null)
const action = computed(() => props.entity.kind === 'action' ? props.entity as Action : null)
const condition = computed(() => props.entity.kind === 'condition' ? props.entity as Condition : null)
const reference = computed(() => 'facts' in props.entity ? props.entity as ReferenceEntry : null)

const headLabel = computed(() => {
  const e = props.entity
  if (spell.value) {
    const kind = spell.value.traits.includes('cantrip') ? 'Cantrip' : spell.value.spellType === 'focus' ? 'Focus' : spell.value.spellType === 'ritual' ? 'Ritual' : 'Spell'
    return `${kind} ${e.level}`
  }
  return cfg.value.hasLevel || e.level ? `${cfg.value.label} ${e.level}` : cfg.value.label
})

const headGlyph = computed(() => {
  if (feat.value) return formatActionCost(feat.value.cost)
  if (action.value) return formatActionCost(action.value.cost)
  return ''
})

const sizeLabel = computed(() => creature.value ? SIZE_LABEL[creature.value.size] : '')

const skillLine = computed(() =>
  Object.entries(creature.value?.skills ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${titleCase(humanize(k))} ${signed(v)}`)
    .join(', '),
)

const speedLine = computed(() => {
  const s = creature.value?.speeds ?? {}
  const parts = Object.entries(s).map(([k, v]) => k === 'land' ? `${v} feet` : `${k} ${v} feet`)
  return parts.length ? parts.join(', ') : '—'
})

const hazardDefense = computed(() => {
  const h = hazard.value
  if (!h) return ''
  const parts: string[] = []
  if (h.ac) parts.push(`<b>AC</b> ${h.ac}`)
  const saves = h.saves ?? {}
  const sv = (['fort', 'ref', 'will'] as const).filter(k => saves[k]).map(k => `<b>${titleCase(k)}</b> ${signed(saves[k]!)}`)
  if (sv.length) parts.push(sv.join(', '))
  if (h.hardness) parts.push(`<b>Hardness</b> ${h.hardness}`)
  if (h.hp) parts.push(`<b>HP</b> ${h.hp}${h.bt ? ` (BT ${h.bt})` : ''}`)
  if (h.immunities?.length) parts.push(`<b>Immunities</b> ${esc(h.immunities.join(', '))}`)
  if (h.weaknesses?.length) parts.push(`<b>Weaknesses</b> ${esc(h.weaknesses.map(formatIwr).join(', '))}`)
  if (h.resistances?.length) parts.push(`<b>Resistances</b> ${esc(h.resistances.map(formatIwr).join(', '))}`)
  return parts.join('; ')
})

const factEntries = computed(() => Object.entries(reference.value?.facts ?? {}).filter(([, v]) => v !== '' && !(Array.isArray(v) && !v.length)))

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function actionsIn(section: StatAction['section']) {
  return creature.value?.actions.filter(a => a.section === section) ?? []
}

function spellsByRank(sc: Spellcasting) {
  const groups = new Map<number, Spellcasting['spells']>()
  for (const s of sc.spells) {
    const r = s.heightenedTo ?? s.rank
    groups.set(r, [...(groups.get(r) ?? []), s])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([rank, spells]) => ({ label: rankLabel(rank), spells }))
}

function rankLabel(rank: number) {
  if (rank === 0) return 'Cantrips'
  const teen = rank % 100 >= 11 && rank % 100 <= 13
  return `${rank}${teen ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[rank % 10] ?? 'th'}`
}

function formatSense(s: Sense) {
  return `${s.type}${s.acuity ? ` (${s.acuity})` : ''}${s.range ? ` ${s.range} feet` : ''}`
}

function formatIwr(w: Weakness | Resistance) {
  const except = 'except' in w && w.except?.length ? ` (except ${w.except.join(', ')})` : ''
  return `${w.type} ${w.value}${except}${w.note ? ` (${w.note})` : ''}`
}

function formatDefense(d: NonNullable<Spell['defense']>) {
  if ('ac' in d) return 'AC'
  return `${d.basic ? 'basic ' : ''}${{ fort: 'Fortitude', ref: 'Reflex', will: 'Will' }[d.save]}`
}

function humanize(s: string) {
  return s.replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function md(text: string) {
  return renderMarkdown(text, { rich: true, extraTypes: RULES_KINDS, postProcess: rollChips })
}

/** ::dice[2d6+3] and ::button[Label | 2d6] become clickable rolls for the global dice roller. */
function rollChips(html: string) {
  return html.replace(/::(dice|button)\[([^\]]+)\]/g, (_m, kind: string, args: string) => {
    const [label, expr] = kind === 'button' ? args.split('|').map(x => x.trim()) : [args.trim(), args.trim()]
    const roll = esc(expr || label)
    return `<span class="roll-ref" data-roll="${roll}">${esc(label)}</span>`
  })
}

/** Refs inside a stat block ({{spell: Fireball}}, spell lists) open the compendium entry. */
async function onClick(e: MouseEvent) {
  const rollEl = (e.target as HTMLElement).closest('.roll-ref') as HTMLElement | null
  if (rollEl?.dataset.roll) { triggerRoll(rollEl.dataset.roll); return }
  const el = (e.target as HTMLElement).closest('[data-entity-type]') as HTMLElement | null
  if (!el) return
  const kind = el.dataset.entityType ?? ''
  const name = el.dataset.entityName ?? ''
  if (!isRulesKind(kind)) return
  const target = await rulesFindByName(kind, name, props.game)
  if (target) router.push(`/compendium/${RULES_KIND_CONFIG[kind].segment}?id=${target.id}`)
}
</script>

<style scoped>
.rsb { font-family: var(--fu); font-size: 13.5px; line-height: 1.55; color: var(--text); max-width: 760px; }
.rsb-head { display: flex; align-items: baseline; gap: 12px; border-bottom: 2px solid var(--kind-color); padding-bottom: 4px; }
.rsb-name { flex: 1; font-family: var(--fh); font-size: 20px; font-weight: 700; margin: 0; }
.rsb-kind { font-family: var(--fh); font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: var(--kind-color); white-space: nowrap; }
.rsb-glyph { font-size: 0.85em; color: var(--text2); white-space: nowrap; }
.rsb-traits { display: flex; flex-wrap: wrap; gap: 3px; margin: 8px 0 10px; }
.rsb-trait {
  font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em;
  padding: 2px 7px; border-radius: 3px; background: #5d0000; color: #fff; border: 1px solid #d8c483;
}
.rsb-trait--size { background: #3a7d4a; }
.rsb-line { margin: 2px 0; }
.rsb-line b, .rsb-md :deep(strong) { font-weight: 700; color: var(--text); }
.rsb-abilities { display: flex; flex-wrap: wrap; gap: 4px 14px; }
.rsb-action { padding-left: 0; }
.rsb-md :deep(p) { display: inline; margin: 0; }
.rsb-body :deep(p) { display: block; margin: 6px 0; }
.rsb-md :deep(ul) { margin: 4px 0; padding-left: 1.4em; }
.rsb-md :deep(table) { border-collapse: collapse; margin: 6px 0; }
.rsb-md :deep(td), .rsb-md :deep(th) { border: 1px solid var(--border-hi); padding: 3px 8px; font-size: 12.5px; }
.rsb :deep(.roll-ref) {
  display: inline-flex; align-items: center; padding: 0 6px; border-radius: 4px; cursor: pointer;
  background: rgba(184, 134, 11, 0.1); border: 1px solid rgba(184, 134, 11, 0.35); color: var(--gold, #d4b54a);
  font-family: var(--fm); font-size: 0.88em; white-space: nowrap;
}
.rsb :deep(.roll-ref:hover) { background: rgba(184, 134, 11, 0.22); }
.rsb-link { color: var(--accent-l, var(--kind-color)); cursor: pointer; text-decoration: underline dotted; }
.rsb-md :deep(.entity-ref) { color: var(--accent-l, var(--kind-color)); cursor: pointer; text-decoration: underline dotted; }
hr { border: none; border-top: 1px solid var(--border-hi); margin: 8px 0; }
.rsb-gm { margin-top: 12px; border-left: 3px solid #8b2030; background: oklch(54% 0.24 22 / 0.08); padding: 6px 10px; border-radius: 0 4px 4px 0; }
.rsb-gm-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #e87a7a; margin-bottom: 2px; }
.rsb-foot { display: flex; justify-content: space-between; gap: 12px; margin-top: 14px; padding-top: 6px; border-top: 1px solid var(--border); font-size: 11px; color: var(--text3); }
.rsb-foot-game { font-family: var(--fm); }
</style>

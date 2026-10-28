<template>
  <div class="red">
    <p v-if="entity.origin === 'foundry'" class="red-note">
      This entry comes from the Foundry compendium. Your changes are kept as local edits and survive re-syncs.
    </p>

    <!-- ── Common ─────────────────────────────────────────────── -->
    <section class="red-section">
      <div class="red-grid">
        <label class="red-field red-span-2">
          <span>Name</span>
          <input class="red-input" :value="local.name" @change="set('name', str($event))" />
        </label>
        <label class="red-field">
          <span>Game</span>
          <select class="red-input" :value="local.game" @change="set('game', str($event))">
            <option value="pf2e">Pathfinder 2e</option>
            <option value="sf2e">Starfinder 2e</option>
            <option value="both">Both</option>
          </select>
        </label>
        <label class="red-field">
          <span>{{ cfg.levelLabel }}</span>
          <input class="red-input" type="number" :value="local.level" @change="set('level', num($event))" />
        </label>
        <label class="red-field">
          <span>Rarity</span>
          <select class="red-input" :value="local.rarity" @change="set('rarity', str($event))">
            <option v-for="r in RARITIES" :key="r" :value="r">{{ titleCase(r) }}</option>
          </select>
        </label>
        <label class="red-field red-span-3">
          <span>Traits <em>comma-separated</em></span>
          <input class="red-input" :value="formatList(local.traits)" @change="set('traits', parseTraits(str($event)))" />
        </label>
      </div>
    </section>

    <!-- ── Item ───────────────────────────────────────────────── -->
    <section v-if="L.kind === 'item'" class="red-section">
      <h4>Item</h4>
      <div class="red-grid">
        <label class="red-field">
          <span>Category</span>
          <select class="red-input" :value="L.category" @change="set('category', str($event))">
            <option v-for="c in ITEM_CATEGORIES" :key="c" :value="c">{{ titleCase(c) }}</option>
          </select>
        </label>
        <label class="red-field">
          <span>Subcategory</span>
          <input class="red-input" :value="L.subcategory ?? ''" placeholder="potion, martial…" @change="set('subcategory', opt($event))" />
        </label>
        <label class="red-field">
          <span>Price ({{ moneyUnit }})</span>
          <input class="red-input" type="number" step="any" min="0" :value="priceValue" placeholder="—" @change="setPrice(str($event))" />
        </label>
        <label class="red-field">
          <span>Bulk</span>
          <input class="red-input" :value="formatBulk(L.bulk, L.bulkNote)" placeholder="—, L, 1, 2…" @change="setBulk(str($event))" />
        </label>
        <label class="red-field">
          <span>Usage</span>
          <input class="red-input" :value="L.usage ?? ''" placeholder="held in one hand" @change="set('usage', opt($event))" />
        </label>
        <label class="red-field">
          <span>Hands</span>
          <input class="red-input" :value="L.hands ?? ''" placeholder="1, 2, 1+" @change="set('hands', opt($event))" />
        </label>
        <label class="red-field red-span-3">
          <span>Unidentified name <em>shown to players until identified</em></span>
          <input class="red-input" :value="L.unidentified?.name ?? ''" placeholder="e.g. Murky red potion" @change="setUnidentified(str($event))" />
        </label>
      </div>

      <template v-if="L.category === 'weapon'">
        <h5>Weapon</h5>
        <div class="red-grid">
          <label class="red-field"><span>Category</span>
            <select class="red-input" :value="L.weapon?.category ?? 'simple'" @change="setSub('weapon', 'category', str($event))">
              <option v-for="c in ['unarmed', 'simple', 'martial', 'advanced']" :key="c" :value="c">{{ titleCase(c) }}</option>
            </select>
          </label>
          <label class="red-field"><span>Group</span><input class="red-input" :value="L.weapon?.group ?? ''" @change="setSub('weapon', 'group', opt($event))" /></label>
          <label class="red-field"><span>Damage dice</span><input class="red-input" type="number" min="0" :value="L.weapon?.damage.dice ?? 1" @change="setWeaponDamage('dice', num($event))" /></label>
          <label class="red-field"><span>Die</span>
            <select class="red-input" :value="L.weapon?.damage.die ?? 'd6'" @change="setWeaponDamage('die', str($event))">
              <option v-for="d in ['d4', 'd6', 'd8', 'd10', 'd12']" :key="d" :value="d">{{ d }}</option>
            </select>
          </label>
          <label class="red-field"><span>Damage type</span><input class="red-input" :value="L.weapon?.damage.type ?? ''" placeholder="slashing" @change="setWeaponDamage('type', str($event))" /></label>
          <label class="red-field"><span>Range (ft.)</span><input class="red-input" type="number" :value="L.weapon?.range ?? ''" @change="setSub('weapon', 'range', optNum($event))" /></label>
          <label class="red-field"><span>Reload</span><input class="red-input" :value="L.weapon?.reload ?? ''" @change="setSub('weapon', 'reload', opt($event))" /></label>
        </div>
      </template>

      <template v-if="L.category === 'armor'">
        <h5>Armor</h5>
        <div class="red-grid">
          <label class="red-field"><span>Category</span>
            <select class="red-input" :value="L.armor?.category ?? 'light'" @change="setSub('armor', 'category', str($event))">
              <option v-for="c in ['unarmored', 'light', 'medium', 'heavy']" :key="c" :value="c">{{ titleCase(c) }}</option>
            </select>
          </label>
          <label class="red-field"><span>Group</span><input class="red-input" :value="L.armor?.group ?? ''" @change="setSub('armor', 'group', opt($event))" /></label>
          <label class="red-field"><span>AC bonus</span><input class="red-input" type="number" :value="L.armor?.acBonus ?? 0" @change="setSub('armor', 'acBonus', num($event))" /></label>
          <label class="red-field"><span>Dex cap</span><input class="red-input" type="number" :value="L.armor?.dexCap ?? ''" placeholder="—" @change="setSub('armor', 'dexCap', optNum($event) ?? null)" /></label>
          <label class="red-field"><span>Check penalty</span><input class="red-input" type="number" :value="L.armor?.checkPenalty ?? 0" @change="setSub('armor', 'checkPenalty', num($event))" /></label>
          <label class="red-field"><span>Speed penalty</span><input class="red-input" type="number" :value="L.armor?.speedPenalty ?? 0" @change="setSub('armor', 'speedPenalty', num($event))" /></label>
          <label class="red-field"><span>Strength</span><input class="red-input" type="number" :value="L.armor?.strength ?? ''" placeholder="—" @change="setSub('armor', 'strength', optNum($event) ?? null)" /></label>
        </div>
      </template>

      <template v-if="L.category === 'shield'">
        <h5>Shield</h5>
        <div class="red-grid">
          <label class="red-field"><span>AC bonus</span><input class="red-input" type="number" :value="L.shield?.acBonus ?? 2" @change="setSub('shield', 'acBonus', num($event))" /></label>
          <label class="red-field"><span>Hardness</span><input class="red-input" type="number" :value="L.shield?.hardness ?? 0" @change="setSub('shield', 'hardness', num($event))" /></label>
          <label class="red-field"><span>HP</span><input class="red-input" type="number" :value="L.shield?.hp ?? 0" @change="setSub('shield', 'hp', num($event))" /></label>
          <label class="red-field"><span>BT</span><input class="red-input" type="number" :value="L.shield?.bt ?? 0" @change="setSub('shield', 'bt', num($event))" /></label>
        </div>
      </template>
    </section>

    <!-- ── Creature ───────────────────────────────────────────── -->
    <section v-if="L.kind === 'creature'" class="red-section">
      <h4>Creature</h4>
      <div class="red-grid">
        <label class="red-field"><span>Size</span>
          <select class="red-input" :value="L.size" @change="set('size', str($event))">
            <option v-for="s in SIZES" :key="s" :value="s">{{ SIZE_LABEL[s] }}</option>
          </select>
        </label>
        <label class="red-field"><span>Perception</span><input class="red-input" type="number" :value="L.perception" @change="set('perception', num($event))" /></label>
        <label class="red-field"><span>AC</span><input class="red-input" type="number" :value="L.ac" @change="set('ac', num($event))" /></label>
        <label class="red-field"><span>HP</span><input class="red-input" type="number" :value="L.hp" @change="set('hp', num($event))" /></label>
        <label class="red-field"><span>Fort</span><input class="red-input" type="number" :value="L.saves.fort" @change="set('saves.fort', num($event))" /></label>
        <label class="red-field"><span>Ref</span><input class="red-input" type="number" :value="L.saves.ref" @change="set('saves.ref', num($event))" /></label>
        <label class="red-field"><span>Will</span><input class="red-input" type="number" :value="L.saves.will" @change="set('saves.will', num($event))" /></label>
        <label class="red-field"><span>Hardness</span><input class="red-input" type="number" :value="L.hardness ?? ''" placeholder="—" @change="set('hardness', optNum($event))" /></label>
        <label v-for="k in ABILITY_KEYS" :key="k" class="red-field red-field--narrow">
          <span>{{ titleCase(k) }}</span>
          <input class="red-input" type="number" :value="L.abilities[k]" @change="set(`abilities.${k}`, num($event))" />
        </label>
        <label class="red-field red-span-3"><span>Senses <em>darkvision, scent (imprecise) 30</em></span><input class="red-input" :value="formatSenses(L.senses)" @change="set('senses', parseSenses(str($event)))" /></label>
        <label class="red-field red-span-3"><span>Languages</span><input class="red-input" :value="formatList(L.languages)" @change="set('languages', parseList(str($event)))" /></label>
        <label class="red-field red-span-3"><span>Skills <em>acrobatics +7, stealth +5</em></span><input class="red-input" :value="formatNumberMap(L.skills, true)" @change="set('skills', parseNumberMap(str($event)))" /></label>
        <label class="red-field red-span-3"><span>Speeds <em>25, fly 40</em></span><input class="red-input" :value="formatSpeeds(L.speeds)" @change="set('speeds', parseSpeeds(str($event)))" /></label>
        <label class="red-field red-span-3"><span>Immunities</span><input class="red-input" :value="formatList(L.immunities)" @change="set('immunities', parseList(str($event)))" /></label>
        <label class="red-field red-span-3"><span>Weaknesses <em>cold iron 5</em></span><input class="red-input" :value="formatIwrList(L.weaknesses)" @change="set('weaknesses', parseIwr(str($event)))" /></label>
        <label class="red-field red-span-3"><span>Resistances <em>physical 5 (except silver)</em></span><input class="red-input" :value="formatIwrList(L.resistances)" @change="set('resistances', parseIwr(str($event)))" /></label>
      </div>

      <h5>Strikes</h5>
      <div v-for="(s, i) in L.strikes" :key="'s' + i" class="red-row">
        <input class="red-input red-w-name" :value="s.name" placeholder="Name" @change="editRow('strikes', i, 'name', str($event))" />
        <select class="red-input red-w-sm" :value="s.range" @change="editRow('strikes', i, 'range', str($event))">
          <option value="melee">Melee</option><option value="ranged">Ranged</option>
        </select>
        <input class="red-input red-w-xs" type="number" :value="s.bonus" title="Attack bonus" @change="editRow('strikes', i, 'bonus', num($event))" />
        <input class="red-input red-w-md" :value="formatDamage(s.damage)" placeholder="1d6+3 slashing plus 1d4 fire" @change="editRow('strikes', i, 'damage', parseDamage(str($event)))" />
        <input class="red-input red-w-md" :value="formatList(s.traits)" placeholder="agile, finesse" @change="editRow('strikes', i, 'traits', parseTraits(str($event)))" />
        <button class="red-x" title="Remove" @click="removeRow('strikes', i)">✕</button>
      </div>
      <button class="btn btn-ghost btn-sm" @click="addRow('strikes', { name: '', range: 'melee', bonus: 0, traits: [], damage: [] })">+ Strike</button>

      <h5>Abilities &amp; actions</h5>
      <StatActionRows :rows="L.actions" with-section @update="(rows: StatAction[]) => set('actions', rows)" />

      <h5>Spellcasting</h5>
      <div v-for="(sc, i) in L.spellcasting" :key="'sc' + i" class="red-block">
        <div class="red-row">
          <input class="red-input red-w-name" :value="sc.name" placeholder="Arcane Prepared Spells" @change="editRow('spellcasting', i, 'name', str($event))" />
          <input class="red-input red-w-sm" :value="sc.tradition" placeholder="arcane" @change="editRow('spellcasting', i, 'tradition', str($event))" />
          <select class="red-input red-w-sm" :value="sc.type" @change="editRow('spellcasting', i, 'type', str($event))">
            <option v-for="t in ['prepared', 'spontaneous', 'innate', 'focus', 'ritual']" :key="t" :value="t">{{ titleCase(t) }}</option>
          </select>
          <input class="red-input red-w-xs" type="number" :value="sc.dc" title="Spell DC" @change="editRow('spellcasting', i, 'dc', num($event))" />
          <input class="red-input red-w-xs" type="number" :value="sc.attack ?? ''" title="Spell attack" placeholder="atk" @change="editRow('spellcasting', i, 'attack', optNum($event))" />
          <button class="red-x" title="Remove" @click="removeRow('spellcasting', i)">✕</button>
        </div>
        <input class="red-input" :value="formatSpellList(sc.spells)" placeholder="3: fireball, haste; 1: fear (×2); cantrips: detect magic" @change="editRow('spellcasting', i, 'spells', parseSpellList(str($event), sc.spells))" />
      </div>
      <button class="btn btn-ghost btn-sm" @click="addRow('spellcasting', { name: 'Spells', tradition: 'arcane', type: 'innate', dc: 10, spells: [] })">+ Spellcasting</button>
    </section>

    <!-- ── Hazard ─────────────────────────────────────────────── -->
    <section v-if="L.kind === 'hazard'" class="red-section">
      <h4>Hazard</h4>
      <div class="red-grid">
        <label class="red-field red-check"><input type="checkbox" :checked="L.complex" @change="set('complex', checked($event))" /> Complex</label>
        <label class="red-field"><span>Stealth bonus</span><input class="red-input" type="number" :value="L.stealth.bonus ?? ''" placeholder="—" @change="set('stealth.bonus', optNum($event) ?? null)" /></label>
        <label class="red-field"><span>Stealth note</span><input class="red-input" :value="L.stealth.note ?? ''" placeholder="(expert)" @change="set('stealth.note', opt($event))" /></label>
        <label class="red-field"><span>AC</span><input class="red-input" type="number" :value="L.ac ?? ''" placeholder="—" @change="set('ac', optNum($event))" /></label>
        <label class="red-field"><span>Fort</span><input class="red-input" type="number" :value="L.saves?.fort ?? ''" @change="set('saves.fort', optNum($event))" /></label>
        <label class="red-field"><span>Ref</span><input class="red-input" type="number" :value="L.saves?.ref ?? ''" @change="set('saves.ref', optNum($event))" /></label>
        <label class="red-field"><span>Will</span><input class="red-input" type="number" :value="L.saves?.will ?? ''" @change="set('saves.will', optNum($event))" /></label>
        <label class="red-field"><span>Hardness</span><input class="red-input" type="number" :value="L.hardness ?? ''" @change="set('hardness', optNum($event))" /></label>
        <label class="red-field"><span>HP</span><input class="red-input" type="number" :value="L.hp ?? ''" @change="set('hp', optNum($event))" /></label>
        <label class="red-field"><span>BT</span><input class="red-input" type="number" :value="L.bt ?? ''" @change="set('bt', optNum($event))" /></label>
        <label class="red-field red-span-3"><span>Immunities</span><input class="red-input" :value="formatList(L.immunities)" @change="set('immunities', parseList(str($event)))" /></label>
        <label class="red-field red-span-3"><span>Disable</span><textarea class="red-input" rows="2" :value="L.disable" @change="set('disable', str($event))" /></label>
        <label class="red-field red-span-3"><span>Routine</span><textarea class="red-input" rows="2" :value="L.routine ?? ''" @change="set('routine', opt($event))" /></label>
        <label class="red-field red-span-3"><span>Reset</span><input class="red-input" :value="L.reset ?? ''" @change="set('reset', opt($event))" /></label>
      </div>
      <h5>Actions</h5>
      <StatActionRows :rows="L.actions" @update="(rows: StatAction[]) => set('actions', rows)" />
    </section>

    <!-- ── Spell ──────────────────────────────────────────────── -->
    <section v-if="L.kind === 'spell'" class="red-section">
      <h4>Spell</h4>
      <div class="red-grid">
        <label class="red-field"><span>Type</span>
          <select class="red-input" :value="L.spellType" @change="set('spellType', str($event))">
            <option value="spell">Spell</option><option value="focus">Focus</option><option value="ritual">Ritual</option>
          </select>
        </label>
        <label class="red-field"><span>Cast</span><input class="red-input" :value="costText(L.cast)" placeholder="2, reaction, 1 minute" @change="set('cast', parseActionCost(str($event)))" /></label>
        <label class="red-field"><span>Traditions</span><input class="red-input" :value="formatList(L.traditions)" placeholder="arcane, primal" @change="set('traditions', parseTraits(str($event)))" /></label>
        <label class="red-field"><span>Range</span><input class="red-input" :value="L.range ?? ''" @change="set('range', opt($event))" /></label>
        <label class="red-field"><span>Area</span><input class="red-input" :value="L.area ?? ''" @change="set('area', opt($event))" /></label>
        <label class="red-field"><span>Targets</span><input class="red-input" :value="L.targets ?? ''" @change="set('targets', opt($event))" /></label>
        <label class="red-field"><span>Duration</span><input class="red-input" :value="L.duration ?? ''" @change="set('duration', opt($event))" /></label>
        <label class="red-field red-check"><input type="checkbox" :checked="!!L.sustained" @change="set('sustained', checked($event))" /> Sustained</label>
        <label class="red-field"><span>Defense</span>
          <select class="red-input" :value="defenseKey" @change="setDefense(str($event))">
            <option value="">—</option>
            <option value="ac">AC</option>
            <option v-for="d in ['fort', 'ref', 'will']" :key="d" :value="d">{{ titleCase(d) }}</option>
            <option v-for="d in ['fort', 'ref', 'will']" :key="'b' + d" :value="'basic-' + d">basic {{ titleCase(d) }}</option>
          </select>
        </label>
      </div>
      <h5>Heightened</h5>
      <div v-for="(h, i) in L.heightened ?? []" :key="'h' + i" class="red-row">
        <input class="red-input red-w-xs" :value="h.trigger" placeholder="+1" @change="editRow('heightened', i, 'trigger', str($event))" />
        <input class="red-input red-grow" :value="h.text" @change="editRow('heightened', i, 'text', str($event))" />
        <button class="red-x" title="Remove" @click="removeRow('heightened', i)">✕</button>
      </div>
      <button class="btn btn-ghost btn-sm" @click="addRow('heightened', { trigger: '+1', text: '' })">+ Heightened entry</button>
    </section>

    <!-- ── Feat / Action ─────────────────────────────────────── -->
    <section v-if="L.kind === 'feat' || L.kind === 'action'" class="red-section">
      <h4>{{ cfg.label }}</h4>
      <div class="red-grid">
        <label v-if="L.kind === 'feat'" class="red-field"><span>Category</span><input class="red-input" :value="L.category" placeholder="general, skill, class…" @change="set('category', str($event))" /></label>
        <label class="red-field"><span>Actions</span><input class="red-input" :value="costText(L.cost)" placeholder="1, free, reaction" @change="set('cost', parseActionCost(str($event)))" /></label>
        <label v-if="L.kind === 'feat'" class="red-field red-span-3"><span>Prerequisites <em>separate with ;</em></span><input class="red-input" :value="L.prerequisites.join('; ')" @change="set('prerequisites', splitList(str($event), ';'))" /></label>
        <label v-if="L.kind === 'feat'" class="red-field red-span-3"><span>Frequency</span><input class="red-input" :value="L.frequency ?? ''" @change="set('frequency', opt($event))" /></label>
        <label class="red-field red-span-3"><span>Trigger</span><input class="red-input" :value="L.trigger ?? ''" @change="set('trigger', opt($event))" /></label>
        <label class="red-field red-span-3"><span>Requirements</span><input class="red-input" :value="L.requirements ?? ''" @change="set('requirements', opt($event))" /></label>
      </div>
    </section>

    <!-- ── Condition ─────────────────────────────────────────── -->
    <section v-if="L.kind === 'condition'" class="red-section">
      <h4>Condition</h4>
      <div class="red-grid">
        <label class="red-field red-check"><input type="checkbox" :checked="L.valued" @change="set('valued', checked($event))" /> Has a value</label>
        <label class="red-field"><span>Group</span><input class="red-input" :value="L.group ?? ''" @change="set('group', opt($event))" /></label>
        <label class="red-field"><span>Overrides</span><input class="red-input" :value="formatList(L.overrides)" @change="set('overrides', parseList(str($event)))" /></label>
      </div>
    </section>

    <!-- ── Reference kinds ───────────────────────────────────── -->
    <section v-if="'facts' in L" class="red-section">
      <h4>Details <em>one "key: value" per line</em></h4>
      <textarea class="red-input" rows="5" :value="formatFacts(L.facts)" placeholder="HP: 8&#10;Size: Medium" @change="set('facts', parseFacts(str($event)))" />
    </section>

    <!-- ── Text ──────────────────────────────────────────────── -->
    <section class="red-section">
      <label class="red-field">
        <span>Description <em>markdown; {{ '{' + '{spell: Fireball}' + '}' }} links other entries</em></span>
        <textarea class="red-input" rows="9" :value="local.description" @change="set('description', str($event))" />
      </label>
      <label class="red-field">
        <span>GM notes <em>never shown to players, never touched by sync</em></span>
        <textarea class="red-input" rows="3" :value="local.gmNotes ?? ''" @change="set('gmNotes', opt($event))" />
      </label>
    </section>
  </div>
</template>

<script setup lang="ts">
import { useDebouncedSave } from '~/composables/useDebouncedSave'
import { rulesUpdate } from '~/composables/useRules'
import { setPath } from '~/rules/edits'
import { coinsToCp, formatActionCost, formatBulk, parseActionCost, parseBulk, SIZE_LABEL, titleCase } from '~/rules/format'
import {
  formatFacts, formatIwrList, formatList, formatNumberMap, formatSenses, formatSpeeds, formatSpellList,
  parseFacts, parseIwr, parseList, parseNumberMap, parseSenses, parseSpeeds, parseSpellList, parseTraits, splitList,
} from '~/rules/parse'
import {
  ITEM_CATEGORIES, RARITIES, RULES_KIND_CONFIG, SIZES,
  type AbilityKey, type ActionCost, type DamageRoll, type RulesEntity, type Spell, type StatAction,
} from '~/types/rules'

const props = defineProps<{ entity: RulesEntity }>()
const emit = defineEmits<{ saved: [entity: RulesEntity] }>()

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

// Local copy is the source of truth while editing; parent updates don't clobber typing.
const local = ref<RulesEntity>(structuredClone(toRaw(props.entity)))
watch(() => props.entity.id, () => { flush(); local.value = structuredClone(toRaw(props.entity)) })

/** Loosely typed view of `local` for kind-specific template sections (guarded by v-if on kind). */
const L = computed<any>(() => local.value)
const cfg = computed(() => RULES_KIND_CONFIG[local.value.kind])

// ── Saving: every changed path is queued; nothing is dropped on unmount ──────
const pending = new Map<string, unknown>()
const { schedule, flush } = useDebouncedSave(350)

function set(path: string, value: unknown) {
  local.value = setPath(local.value, path, value)
  pending.set(path, value)
  schedule(commit)
}

async function commit() {
  const id = local.value.id
  const changes = [...pending.entries()]
  pending.clear()
  let saved: RulesEntity | undefined
  for (const [path, value] of changes) saved = await rulesUpdate(id, path, toRaw(value))
  if (saved) emit('saved', saved)
}

defineExpose({ flush })

// ── Input helpers ──────────────────────────────────────────────────────────
const target = (e: Event) => e.target as HTMLInputElement
const str = (e: Event) => target(e).value
const opt = (e: Event) => target(e).value.trim() || undefined
const num = (e: Event) => Number(target(e).value) || 0
const optNum = (e: Event) => target(e).value === '' ? undefined : Number(target(e).value)
const checked = (e: Event) => target(e).checked

// ── Item ───────────────────────────────────────────────────────────────────
const moneyUnit = computed(() => local.value.game === 'sf2e' ? 'credits' : 'gp')
const priceValue = computed(() => {
  const p = L.value.price as { cp: number } | null
  if (!p) return ''
  return local.value.game === 'sf2e' ? p.cp / 10 : p.cp / 100
})

function setPrice(text: string) {
  if (text.trim() === '') return set('price', null)
  const n = Number(text)
  set('price', { cp: local.value.game === 'sf2e' ? coinsToCp({ credits: n }) : coinsToCp({ gp: n }) })
}

function setBulk(text: string) {
  const bulk = parseBulk(text)
  if (bulk === undefined) { set('bulk', null); set('bulkNote', text.trim()) }
  else { set('bulk', bulk); set('bulkNote', undefined) }
}

function setUnidentified(name: string) {
  set('unidentified', name.trim() ? { ...(L.value.unidentified ?? {}), name: name.trim() } : undefined)
}

const SUB_DEFAULTS: Record<string, object> = {
  weapon: { category: 'simple', damage: { dice: 1, die: 'd6', type: 'bludgeoning' } },
  armor: { category: 'light', acBonus: 0, dexCap: null, checkPenalty: 0, speedPenalty: 0, strength: null },
  shield: { acBonus: 2, hardness: 0, hp: 0, bt: 0 },
}

/** Sets a field of an optional sub-object (weapon/armor/shield), creating it on first edit. */
function setSub(sub: 'weapon' | 'armor' | 'shield', key: string, value: unknown) {
  set(sub, { ...SUB_DEFAULTS[sub], ...(L.value[sub] ?? {}), [key]: value })
}

function setWeaponDamage(key: 'dice' | 'die' | 'type', value: unknown) {
  const w = { ...SUB_DEFAULTS.weapon, ...(L.value.weapon ?? {}) } as any
  set('weapon', { ...w, damage: { ...w.damage, [key]: value } })
}

// ── Lists of rows (strikes, spellcasting, heightened) ──────────────────────
function rows(key: string): any[] { return [...(L.value[key] ?? [])] }
function editRow(key: string, i: number, field: string, value: unknown) {
  const list = rows(key)
  list[i] = { ...list[i], [field]: value }
  set(key, list)
}
function addRow(key: string, row: object) { set(key, [...rows(key), row]) }
function removeRow(key: string, i: number) { set(key, rows(key).filter((_, j) => j !== i)) }

/** "1d6+3 slashing plus 1d4 fire" ⇄ damage rolls */
function parseDamage(text: string): DamageRoll[] {
  return text.split(/\s+plus\s+/i).map(s => s.trim()).filter(Boolean).map(part => {
    const m = part.match(/^(\S+)\s*(.*)$/)!
    return { formula: m[1], type: m[2].trim() }
  })
}
function formatDamage(rolls: DamageRoll[]) { return rolls.map(d => `${d.formula} ${d.type}`.trim()).join(' plus ') }

// ── Spell ──────────────────────────────────────────────────────────────────
const defenseKey = computed(() => {
  const d = L.value.defense as Spell['defense']
  if (!d) return ''
  if ('ac' in d) return 'ac'
  return `${d.basic ? 'basic-' : ''}${d.save}`
})

function setDefense(key: string) {
  if (!key) return set('defense', null)
  if (key === 'ac') return set('defense', { ac: true })
  const basic = key.startsWith('basic-')
  set('defense', { save: key.replace('basic-', ''), basic })
}

function costText(cost: ActionCost) {
  if (cost === null || cost === undefined) return ''
  if (typeof cost === 'object' && 'text' in cost) return cost.text
  return formatActionCost(cost)
}
</script>

<style scoped>
.red { display: flex; flex-direction: column; gap: 14px; max-width: 860px; }
.red-note { font-size: 12px; color: var(--text2); background: var(--surface); border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; margin: 0; }
.red-section { display: flex; flex-direction: column; gap: 8px; }
.red-section h4 { font-family: var(--fh); font-size: 13px; margin: 4px 0 0; color: var(--text); letter-spacing: 0.04em; }
.red-section h5 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; margin: 8px 0 0; color: var(--text3); }
.red-section em, .red-field em { font-style: normal; font-weight: 400; color: var(--text3); text-transform: none; letter-spacing: 0; margin-left: 4px; }
.red-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px 12px; }
.red-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--text2); min-width: 0; }
.red-field > span { font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; font-size: 10px; }
.red-field--narrow { max-width: 90px; }
.red-span-2 { grid-column: span 2; }
.red-span-3 { grid-column: 1 / -1; }
.red-check { flex-direction: row; align-items: center; gap: 6px; font-size: 12px; padding-top: 14px; }
.red-input {
  background: var(--parch-dark); border: 1px solid var(--border-hi); border-radius: 5px;
  padding: 6px 8px; color: var(--text); font-size: 13px; font-family: var(--fu); width: 100%; min-width: 0;
}
.red-input:focus { outline: none; border-color: var(--accent); }
textarea.red-input { resize: vertical; line-height: 1.5; }
.red-row { display: flex; gap: 6px; align-items: center; }
.red-block { display: flex; flex-direction: column; gap: 5px; padding: 8px; border: 1px solid var(--border); border-radius: 6px; }
.red-w-name { flex: 1.4; }
.red-w-md { flex: 1.6; }
.red-w-sm { flex: 0 0 110px; }
.red-w-xs { flex: 0 0 64px; }
.red-grow { flex: 1; }
.red-x { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 13px; padding: 4px 6px; }
.red-x:hover { color: var(--danger, #e05555); }
</style>

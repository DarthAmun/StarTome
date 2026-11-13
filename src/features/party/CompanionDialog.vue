<script setup lang="ts">
/**
 * A companion's build (animal, robot or drone): the type from the book and its
 * stage. The stat block is written as a homebrew creature in the "Companions"
 * pack and follows the character's level.
 */
import { computed, reactive, ref } from 'vue'
import { Plus, X } from 'lucide-vue-next'
import { blankCompanionBase, COMPANION_STAGES, companionStats, customizationAllowance, SPECIALIZATIONS, stageLabel, type CompanionBuild } from '@/domain/rules/companions'
import { signed, SIZE_LABEL } from '@/domain/rules/format'
import { SIZES, type AbilityKey } from '@/domain/rules/types'
import type { Character } from '@/domain/schema'
import { setCompanion } from '@/data/party'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'

const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ close: [] }>()

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
const b = reactive<CompanionBuild>(props.character.companion
  ? JSON.parse(JSON.stringify(props.character.companion)) as CompanionBuild
  : { kind: 'robot', base: blankCompanionBase('robot'), stage: 'young', path: null, specialization: null, customizations: [] })
const list = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean)
const val = (e: Event) => (e.target as HTMLInputElement).value

const sensesText = computed({ get: () => b.base.senses.join(', '), set: (v: string) => { b.base.senses = list(v) } })
/** "30, climb 20" ⇄ { land: 30, climb: 20 } */
const speedsText = computed({
  get: () => Object.entries(b.base.speeds).map(([k, v]) => (k === 'land' ? String(v) : `${k} ${v}`)).join(', '),
  set: (v: string) => {
    const out: Record<string, number> = {}
    for (const part of list(v)) { const m = /^(?:([a-z]+)\s+)?(\d+)/i.exec(part); if (m) out[(m[1] ?? 'land').toLowerCase()] = Number(m[2]) }
    b.base.speeds = out
  },
})
const maneuverName = computed({
  get: () => b.base.advancedManeuver?.name ?? '',
  set: (v: string) => { b.base.advancedManeuver = v.trim() ? { name: v.trim(), cost: 2, text: b.base.advancedManeuver?.text ?? '' } : null },
})
const maneuverText = computed({ get: () => b.base.advancedManeuver?.text ?? '', set: (v: string) => { if (b.base.advancedManeuver) b.base.advancedManeuver.text = v } })
const stats = computed(() => companionStats(b, props.character.level))
const saving = ref(false)

async function save(build: CompanionBuild | null) {
  saving.value = true
  try { await setCompanion(props.character.id, build); emit('close') }
  catch (err) { reportError('Saving the companion', err) } finally { saving.value = false }
}
</script>

<template>
  <AppDialog :title="`Companion · ${character.name}`" wide @close="emit('close')">
    <p class="faint">Enter the type (or chassis) from the book and its stage. The stat block is built at {{ character.name }}'s level ({{ character.level }}) as a homebrew creature in the “Companions” pack and kept at that level.</p>
    <div class="row">
      <label><span class="label">Kind</span><select v-model="b.kind" class="input"><option value="animal">Animal companion</option><option value="robot">Robot companion</option><option value="drone">Drone (mechanic)</option></select></label>
      <label class="grow"><span class="label">Type / chassis</span><input v-model="b.base.typeName" class="input" placeholder="Powerful chassis" /></label>
      <label><span class="label">Size</span><select v-model="b.base.size" class="input"><option v-for="s in SIZES" :key="s" :value="s">{{ SIZE_LABEL[s] }}</option></select></label>
      <label><span class="label">HP (type)</span><input v-model.number="b.base.hp" type="number" min="0" class="input num" /></label>
    </div>
    <div class="row">
      <label v-for="k in ABILITY_KEYS" :key="k"><span class="label">{{ k }}</span><input v-model.number="b.base.abilities[k]" type="number" class="input num" /></label>
    </div>
    <div class="row">
      <label><span class="label">Trained skill</span><input v-model="b.base.skill" class="input" placeholder="stealth" /></label>
      <label class="grow"><span class="label">Senses</span><input v-model="sensesText" class="input" placeholder="low-light vision, darkvision" /></label>
      <label class="grow"><span class="label">Speeds</span><input v-model="speedsText" class="input" placeholder="30, climb 20" /></label>
    </div>
    <div class="eyebrow">Attacks</div>
    <div v-for="(a, i) in b.base.attacks" :key="i" class="row tight">
      <select v-model="a.range" class="input short" aria-label="Range"><option value="melee">Melee</option><option value="ranged">Ranged</option></select>
      <input v-model="a.name" class="input" placeholder="jaws" aria-label="Attack name" />
      <input v-model="a.die" class="input num" placeholder="d8" title="One die; advancement adds more" />
      <input v-model="a.type" class="input short" placeholder="piercing" aria-label="Damage type" />
      <input :value="a.traits.join(', ')" class="input" placeholder="agile, finesse" aria-label="Traits" @change="a.traits = list(val($event))" />
      <input v-if="a.range === 'ranged'" v-model.number="a.rangeIncrement" type="number" min="0" class="input num" placeholder="ft" title="Range increment" />
      <button class="btn btn-ghost btn-icon" title="Remove" @click="b.base.attacks.splice(i, 1)"><X :size="13" /></button>
    </div>
    <button class="btn self" @click="b.base.attacks.push({ name: '', range: 'melee', die: 'd6', type: 'bludgeoning', traits: [] })"><Plus :size="13" /> Attack</button>
    <label><span class="label">Support benefit</span><textarea v-model="b.base.supportBenefit" rows="2" class="input" /></label>
    <div class="row">
      <label><span class="label">Advanced maneuver</span><input v-model="maneuverName" class="input" placeholder="Hydraulic Flipper" /></label>
      <label class="grow"><span class="label">Its text</span><input v-model="maneuverText" class="input" /></label>
    </div>
    <div class="row">
      <label><span class="label">Stage</span><select v-model="b.stage" class="input"><option v-for="s in COMPANION_STAGES" :key="s" :value="s">{{ stageLabel(b.kind, s, b.path) }}</option></select></label>
      <label v-if="b.stage === 'specialized'"><span class="label">From</span><select v-model="b.path" class="input"><option value="burly">burly</option><option value="deft">deft</option></select></label>
      <label v-if="b.stage === 'specialized'"><span class="label">Specialization</span><select v-model="b.specialization" class="input"><option :value="null">—</option><option v-for="s in SPECIALIZATIONS" :key="s" :value="s">{{ s }}</option></select></label>
    </div>
    <label v-if="b.kind !== 'animal'">
      <span class="label">Customizations <em>{{ b.customizations.length }} of {{ customizationAllowance(b.kind, b.stage) }} at this stage, more from feats</em></span>
      <input :value="b.customizations.join(', ')" class="input" placeholder="armored plates, flier, integrated weapon mount" @change="b.customizations = list(val($event))" />
    </label>
    <div class="preview panel">
      <b>Level {{ character.level }}</b> · {{ SIZE_LABEL[stats.size] }} · AC {{ stats.ac }} · HP {{ stats.hp }} · Fort {{ signed(stats.saves.fort) }}, Ref {{ signed(stats.saves.ref) }}, Will {{ signed(stats.saves.will) }} · Perception {{ signed(stats.perception) }}
      <div v-for="s in stats.strikes" :key="s.name" class="faint">{{ s.range === 'melee' ? 'Melee' : 'Ranged' }} {{ s.name }} {{ signed(s.bonus) }}, {{ s.damage[0]?.formula }} {{ s.damage[0]?.type }}</div>
      <div v-if="stats.weaknesses.length" class="faint">Weakness {{ stats.weaknesses.map(w => `${w.type} ${w.value}`).join(', ') }}</div>
    </div>
    <template #footer>
      <button v-if="character.companion" class="btn" title="Stop building a stat block; the creature entry stays" @click="save(null)">Remove build</button>
      <span class="grow" />
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" :disabled="saving || !b.base.typeName.trim()" @click="save(b)">Save stat block</button>
    </template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; }
.row { display: flex; align-items: end; gap: .6rem; flex-wrap: wrap; }
.row.tight { gap: .3rem; flex-wrap: nowrap; }
.grow { flex: 1; }
.num { width: 4.6rem; } .short { width: 7rem; flex: none; }
.self { align-self: flex-start; }
.label em { text-transform: none; letter-spacing: 0; font-style: normal; opacity: .75; margin-left: .4em; }
.preview { padding: .5rem .7rem; background: var(--bg-sunken); }
</style>

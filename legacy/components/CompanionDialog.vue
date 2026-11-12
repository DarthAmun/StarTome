<template>
  <AppDialog class="cpd" @close="emit('close')">
      <template #title>Companion · {{ character.name }}</template>
        <div class="pv-dialog-content cpd-body">
          <p class="cpd-dim">
            Enter the type (or chassis) from the book and its stage. StarTome builds the stat block at {{ character.name }}'s level
            (level {{ character.level }}) as a homebrew creature in the "Companions" pack and keeps it at that level. Tech Core pp. 73–79.
          </p>

          <div class="cpd-row">
            <label class="cpd-field">Kind
              <select v-model="b.kind" class="cpd-input">
                <option value="animal">Animal companion</option>
                <option value="robot">Robot companion</option>
                <option value="drone">Drone (mechanic)</option>
              </select>
            </label>
            <label class="cpd-field">Type / chassis <input v-model="b.base.typeName" class="cpd-input cpd-wide" placeholder="Powerful chassis" /></label>
            <label class="cpd-field">Size
              <select v-model="b.base.size" class="cpd-input"><option v-for="s in SIZES" :key="s" :value="s">{{ SIZE_LABEL[s] }}</option></select>
            </label>
            <label class="cpd-field">HP (type) <input v-model.number="b.base.hp" type="number" min="0" class="cpd-input cpd-num" /></label>
          </div>

          <div class="cpd-row">
            <label v-for="k in ABILITY_KEYS" :key="k" class="cpd-field">{{ k.toUpperCase() }}
              <input v-model.number="b.base.abilities[k]" type="number" class="cpd-input cpd-num" />
            </label>
          </div>

          <div class="cpd-row">
            <label class="cpd-field">Trained skill <input v-model="b.base.skill" class="cpd-input" placeholder="stealth" /></label>
            <label class="cpd-field">Senses <input v-model="sensesText" class="cpd-input cpd-wide" placeholder="low-light vision, darkvision" /></label>
            <label class="cpd-field">Speeds <input v-model="speedsText" class="cpd-input cpd-wide" placeholder="30, climb 20" /></label>
          </div>

          <div class="cpd-subtitle">Attacks</div>
          <div v-for="(a, i) in b.base.attacks" :key="i" class="cpd-row">
            <select v-model="a.range" class="cpd-input cpd-num"><option value="melee">Melee</option><option value="ranged">Ranged</option></select>
            <input v-model="a.name" class="cpd-input" placeholder="jaws" />
            <input v-model="a.die" class="cpd-input cpd-num" placeholder="d8" title="One die; advancement adds more" />
            <input v-model="a.type" class="cpd-input" placeholder="piercing" />
            <input :value="a.traits.join(', ')" class="cpd-input cpd-wide" placeholder="agile, finesse" @change="a.traits = list(($event.target as HTMLInputElement).value)" />
            <input v-if="a.range === 'ranged'" v-model.number="a.rangeIncrement" type="number" min="0" class="cpd-input cpd-num" placeholder="ft" title="Range increment" />
            <button class="ghost-btn cpd-small" title="Remove" @click="b.base.attacks.splice(i, 1)">×</button>
          </div>
          <button class="ghost-btn cpd-small cpd-self" @click="b.base.attacks.push({ name: '', range: 'melee', die: 'd6', type: 'bludgeoning', traits: [] })">+ Attack</button>

          <label class="cpd-field cpd-full">Support benefit
            <textarea v-model="b.base.supportBenefit" rows="2" class="cpd-input" />
          </label>
          <div class="cpd-row">
            <label class="cpd-field">Advanced maneuver <input v-model="maneuverName" class="cpd-input" placeholder="Hydraulic Flipper" /></label>
            <label class="cpd-field cpd-grow">Its text <input v-model="maneuverText" class="cpd-input cpd-full" placeholder="The robot companion makes a melee Strike…" /></label>
          </div>

          <div class="cpd-row">
            <label class="cpd-field">Stage
              <select v-model="b.stage" class="cpd-input">
                <option v-for="s in COMPANION_STAGES" :key="s" :value="s">{{ stageLabel(b.kind, s, b.path) }}</option>
              </select>
            </label>
            <label v-if="b.stage === 'specialized'" class="cpd-field">From
              <select v-model="b.path" class="cpd-input"><option value="burly">burly</option><option value="deft">deft</option></select>
            </label>
            <label v-if="b.stage === 'specialized'" class="cpd-field">Specialization
              <select v-model="b.specialization" class="cpd-input">
                <option :value="null">—</option>
                <option v-for="s in SPECIALIZATIONS" :key="s" :value="s">{{ s }}</option>
              </select>
            </label>
          </div>

          <label v-if="b.kind !== 'animal'" class="cpd-field cpd-full">
            Customizations <span class="cpd-dim">({{ b.customizations.length }} of {{ customizationAllowance(b.kind, b.stage) }} at this stage, more from feats)</span>
            <input :value="b.customizations.join(', ')" class="cpd-input cpd-full" placeholder="armored plates, flier, integrated weapon mount"
              @change="b.customizations = list(($event.target as HTMLInputElement).value)" />
          </label>

          <div class="cpd-preview">
            <b>Level {{ character.level }}</b> · {{ SIZE_LABEL[stats.size] }} · AC {{ stats.ac }} · HP {{ stats.hp }} ·
            Fort {{ signed(stats.saves.fort) }}, Ref {{ signed(stats.saves.ref) }}, Will {{ signed(stats.saves.will) }} · Perception {{ signed(stats.perception) }}
            <div v-for="s in stats.strikes" :key="s.name" class="cpd-dim">{{ s.range === 'melee' ? 'Melee' : 'Ranged' }} {{ s.name }} {{ signed(s.bonus) }}, {{ s.damage[0]?.formula }} {{ s.damage[0]?.type }}</div>
            <div v-if="stats.weaknesses.length" class="cpd-dim">Weakness {{ stats.weaknesses.map(w => `${w.type} ${w.value}`).join(', ') }}</div>
          </div>
        </div>
        <div class="pv-dialog-footer">
          <button v-if="character.companion" class="ghost-btn" title="Stop building a stat block; the creature entry stays" @click="save(null)">Remove build</button>
          <span class="cpd-spacer" />
          <button class="ghost-btn" @click="emit('close')">Cancel</button>
          <button class="seal-btn" :disabled="saving || !b.base.typeName.trim()" @click="save(b)">Save stat block</button>
        </div>
    </AppDialog>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useParty, type Character } from '~/composables/useParty'
import {
  blankCompanionBase, COMPANION_STAGES, companionStats, customizationAllowance, SPECIALIZATIONS, stageLabel, type CompanionBuild,
} from '~/rules/companions'
import { signed, SIZE_LABEL } from '~/rules/format'
import { SIZES, type AbilityKey } from '~/types/rules'

const props = defineProps<{ character: Character }>()
const emit = defineEmits<{ close: [] }>()
const { setCompanion } = useParty()

const ABILITY_KEYS: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']

const start: CompanionBuild = props.character.companion
  ? JSON.parse(JSON.stringify(props.character.companion))
  : { kind: 'robot', base: blankCompanionBase('robot'), stage: 'young', path: null, specialization: null, customizations: [] }
const b = reactive<CompanionBuild>(start)

const list = (text: string) => text.split(',').map(s => s.trim()).filter(Boolean)

const sensesText = computed({
  get: () => b.base.senses.join(', '),
  set: (v: string) => { b.base.senses = list(v) },
})
/** "30, climb 20" ↔ { land: 30, climb: 20 } */
const speedsText = computed({
  get: () => Object.entries(b.base.speeds).map(([k, v]) => (k === 'land' ? String(v) : `${k} ${v}`)).join(', '),
  set: (v: string) => {
    const out: Record<string, number> = {}
    for (const part of list(v)) {
      const m = part.match(/^(?:([a-z]+)\s+)?(\d+)/i)
      if (m) out[(m[1] ?? 'land').toLowerCase()] = Number(m[2])
    }
    b.base.speeds = out
  },
})
const maneuverName = computed({
  get: () => b.base.advancedManeuver?.name ?? '',
  set: (v: string) => { b.base.advancedManeuver = v.trim() ? { name: v.trim(), cost: 2, text: b.base.advancedManeuver?.text ?? '' } : null },
})
const maneuverText = computed({
  get: () => b.base.advancedManeuver?.text ?? '',
  set: (v: string) => { if (b.base.advancedManeuver) b.base.advancedManeuver.text = v },
})

const stats = computed(() => companionStats(b, props.character.level))

const saving = ref(false)
async function save(build: CompanionBuild | null) {
  saving.value = true
  try {
    await setCompanion(props.character.id, build ? JSON.parse(JSON.stringify(build)) : null)
    emit('close')
  } finally {
    saving.value = false
  }
}
</script>

<style scoped>
.cpd { width: min(760px, 96vw); }
.cpd-body { display: flex; flex-direction: column; gap: 10px; max-height: 70vh; overflow-y: auto; }
.cpd-row { display: flex; align-items: flex-end; gap: 8px; flex-wrap: wrap; }
.cpd-field { display: flex; flex-direction: column; gap: 3px; font-size: 11.5px; color: var(--text2); }
.cpd-grow { flex: 1; }
.cpd-full { width: 100%; }
.cpd-input { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font-size: 13px; width: 120px; }
.cpd-num { width: 64px; }
.cpd-wide { width: 200px; }
textarea.cpd-input, .cpd-full .cpd-input, .cpd-input.cpd-full { width: 100%; }
.cpd-subtitle { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.cpd-small { padding: 2px 10px; font-size: 12px; }
.cpd-self { align-self: flex-start; }
.cpd-dim { font-size: 11.5px; color: var(--text3); }
.cpd-preview { border: 1px solid var(--border); border-radius: 6px; padding: 8px 10px; font-size: 12.5px; color: var(--text2); display: flex; flex-direction: column; gap: 2px; }
.cpd-spacer { flex: 1; }
</style>

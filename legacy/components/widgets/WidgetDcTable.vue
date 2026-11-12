<template>
  <div class="wdc-body">
    <div class="wdc-head">
      <select v-model="sourceModel" class="wdc-source" title="DC for a level or for a pinned stat block">
        <option value="">By level</option>
        <option v-for="p in pinnedEntries" :key="p.id" :value="p.id">{{ p.name }} ({{ p.kind }} {{ p.level }})</option>
      </select>
      <div v-if="!subject" class="wdc-level">
        <button class="wdc-step" :disabled="level <= MIN_DC_LEVEL" title="Lower level" @click="setLevel(level - 1)">−</button>
        <label class="wdc-level-label">Level
          <input :value="level" type="number" :min="MIN_DC_LEVEL" :max="MAX_DC_LEVEL" class="wdc-level-input" @change="setLevel(Number(($event.target as HTMLInputElement).value))" />
        </label>
        <button class="wdc-step" :disabled="level >= MAX_DC_LEVEL" title="Raise level" @click="setLevel(level + 1)">+</button>
      </div>
    </div>

    <RecallKnowledgeLine v-if="subject" :entity="subject" :game="game" />

    <div class="wdc-main">
      <span class="wdc-main-label">{{ subject ? `Level ${subject.level}` : `Level ${level}` }} DC</span>
      <span class="wdc-main-dc">{{ baseDc }}</span>
    </div>

    <div class="wdc-row">
      <div v-for="s in steps" :key="s.key" class="wdc-chip" :title="`${s.label} (${s.adjust > 0 ? '+' : ''}${s.adjust})`">
        <span class="wdc-chip-dc">{{ baseDc + s.adjust }}</span>
        <span class="wdc-chip-label">{{ s.label }}</span>
        <span v-if="RARITY_OF[s.key]" class="wdc-chip-rarity">{{ RARITY_OF[s.key] }}</span>
      </div>
    </div>

    <div class="wdc-sub">Simple DCs</div>
    <div class="wdc-row">
      <div v-for="r in PROFICIENCIES" :key="r" class="wdc-chip wdc-chip--simple">
        <span class="wdc-chip-dc">{{ SIMPLE_DCS[r] }}</span>
        <span class="wdc-chip-label">{{ titleCase(r) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * GM screen widget: DCs by level with the six adjustments and the simple DCs.
 * Picking a pinned creature or hazard shows its Recall Knowledge (FEATURES_PLAN §10.1).
 */
import { rulesGet, useRulesRevision } from '~/composables/useRules'
import { clampDcLevel, DC_STEPS, levelDc, MAX_DC_LEVEL, MIN_DC_LEVEL, PROFICIENCIES, SIMPLE_DCS, type DcStep } from '~/rules/dcs'
import { titleCase } from '~/rules/format'
import type { GameId } from '~/types/game'
import type { RulesEntity } from '~/types/rules'

const props = defineProps<{ config: Record<string, any>; game?: GameId; pinnedRulesIds: string[] }>()
const emit = defineEmits<{ 'update:config': [config: Record<string, any>] }>()

const RARITY_OF: Partial<Record<DcStep, string>> = { hard: 'uncommon', 'very-hard': 'rare', 'incredibly-hard': 'unique' }
const steps = DC_STEPS.filter(s => s.key !== 'normal')

const level = computed(() => clampDcLevel(Number(props.config.level ?? 1)))
const revision = useRulesRevision()

/** Pinned rules-entry widgets that are creatures or hazards. */
const pinnedEntries = shallowRef<RulesEntity[]>([])
watch([() => props.pinnedRulesIds.join('|'), revision], async () => {
  const rows = await Promise.all(props.pinnedRulesIds.map(id => rulesGet(id)))
  pinnedEntries.value = rows.filter((e): e is RulesEntity => !!e && (e.kind === 'creature' || e.kind === 'hazard'))
}, { immediate: true })

const subject = computed(() => pinnedEntries.value.find(e => e.id === props.config.rulesId) ?? null)

const sourceModel = computed({
  get: () => subject.value?.id ?? '',
  set: (v: string) => emit('update:config', { ...props.config, rulesId: v || null }),
})

const baseDc = computed(() => levelDc(subject.value?.level ?? level.value, props.game))

function setLevel(n: number) {
  if (!Number.isFinite(n)) return
  emit('update:config', { ...props.config, level: clampDcLevel(n) })
}
</script>

<style scoped>
.wdc-body { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 12.5px; }
.wdc-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.wdc-source { flex: 1; min-width: 120px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font-size: 12px; }
.wdc-level { display: flex; align-items: center; gap: 4px; }
.wdc-level-label { display: flex; align-items: center; gap: 4px; color: var(--text2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
.wdc-level-input { width: 48px; background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 2px 4px; text-align: center; }
.wdc-step { width: 22px; height: 22px; border-radius: 4px; border: 1px solid var(--border); background: var(--surface); color: var(--text); cursor: pointer; }
.wdc-step:disabled { opacity: 0.4; cursor: default; }
.wdc-main { display: flex; align-items: baseline; gap: 8px; }
.wdc-main-label { color: var(--text2); font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
.wdc-main-dc { font-family: var(--fh); font-size: 26px; font-weight: 700; color: var(--text); }
.wdc-row { display: flex; flex-wrap: wrap; gap: 4px; }
.wdc-chip { display: flex; flex-direction: column; align-items: center; min-width: 64px; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; background: var(--surface); }
.wdc-chip-dc { font-size: 15px; font-weight: 700; color: var(--text); }
.wdc-chip-label { font-size: 10px; color: var(--text2); white-space: nowrap; }
.wdc-chip-rarity { font-size: 9px; color: var(--text3); text-transform: uppercase; letter-spacing: 0.05em; }
.wdc-sub { margin-top: 4px; font-size: 10px; font-weight: 700; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; }
</style>

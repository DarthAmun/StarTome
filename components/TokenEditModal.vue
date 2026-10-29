<template>
  <Teleport to="body">
    <div v-if="open && token" class="pv-dialog-mask" style="z-index:var(--z-modal-top)" @click.self="$emit('close')">
      <div class="pv-dialog tem-dialog" @keydown.esc="$emit('close')">

        <!-- Header -->
        <div class="tem-header">
          <span class="tem-title">{{ localLabel || token.name }}</span>
          <span class="tem-sub">— Edit Token</span>
          <button class="tem-close" @click="$emit('close')">✕</button>
        </div>

        <div class="tem-body">

          <!-- ── IDENTITY ─────────────────────────────────────────────────── -->
          <div class="tem-section">
            <div class="tem-section-label">Identity</div>

            <div class="tem-field">
              <label class="tem-label">Label</label>
              <input v-model="localLabel" class="tem-text-input" :placeholder="token.name" />
            </div>

            <div class="tem-field">
              <label class="tem-label">Linked Creature</label>
              <div v-if="linkedName && !changingLink" class="tem-linked-row">
                <span class="tem-linked-badge">{{ linkedName }}</span>
                <select v-model="localAdjustment" class="tem-adjust" title="Weak/elite adjustment">
                  <option :value="null">Normal</option>
                  <option value="weak">Weak</option>
                  <option value="elite">Elite</option>
                </select>
                <button class="tem-clear-link" @click="changingLink = true">Change</button>
                <button class="tem-clear-link tem-clear-link--danger" @click="clearLink">× Clear</button>
              </div>
              <div v-else>
                <input
                  v-model="linkSearch"
                  class="tem-text-input"
                  placeholder="Search creatures and hazards…"
                />
                <div v-if="linkResults.length" class="tem-dropdown">
                  <button
                    v-for="opt in linkResults"
                    :key="opt.id"
                    class="tem-dropdown-row"
                    @click="selectEntry(opt)"
                  >
                    <span class="tem-rec-type">{{ opt.kind }} {{ opt.level }}{{ otherGameTag(opt.game, game) }}</span>
                    {{ opt.name }}
                  </button>
                </div>
              </div>
              <label v-if="linkChanged" class="tem-sync-row">
                <input type="checkbox" v-model="syncHpAc" class="tem-checkbox" />
                <span>Update HP, AC and size from the stat block</span>
              </label>
            </div>
          </div>

          <!-- ── COMBAT ──────────────────────────────────────────────────── -->
          <div class="tem-section">
            <div class="tem-section-label">Combat</div>
            <div class="tem-combat-cols">
              <!-- Left -->
              <div class="tem-col">
                <label class="tem-label">HP Current</label>
                <div class="tem-stepper">
                  <button class="tem-step-btn" @click="localHpCurrent = Math.max(0, (localHpCurrent ?? 0) - 1)">−</button>
                  <input v-model.number="localHpCurrent" type="number" class="tem-num-input" />
                  <button class="tem-step-btn" @click="localHpCurrent = (localHpCurrent ?? 0) + 1">+</button>
                </div>

                <label class="tem-label" style="margin-top:10px">HP Max</label>
                <input v-model.number="localHpMax" type="number" class="tem-num-input" />

                <label class="tem-label" style="margin-top:12px">Quick HP Change</label>
                <div class="tem-damage-row">
                  <input v-model.number="damageAmt" type="number" min="0" class="tem-num-input tem-damage-input" placeholder="Amt" />
                  <button class="tem-dmg-btn tem-dmg-btn--dmg" @click="applyDamage">− Dmg</button>
                  <button class="tem-dmg-btn tem-dmg-btn--heal" @click="applyHealing">+ Heal</button>
                </div>
                <label class="tem-sync-row" style="margin-top:6px" title="Dying 2 instead of 1 when this drops the token to 0 HP">
                  <input v-model="localCritical" type="checkbox" class="tem-checkbox" />
                  <span>Critical hit</span>
                </label>
                <label class="tem-sync-row" title="Party tokens use the dying rules at 0 HP; others are defeated. Turn it on for a named NPC.">
                  <input v-model="localUsesDying" type="checkbox" class="tem-checkbox" />
                  <span>Uses dying rules <span class="tem-hint-inline">{{ localUsesDying === localIsPlayerToken ? 'default' : 'set here' }}</span></span>
                </label>
              </div>

              <!-- Right -->
              <div class="tem-col">
                <label class="tem-label">AC</label>
                <input v-model.number="localAc" type="number" class="tem-num-input" />

                <label class="tem-label" style="margin-top:10px">Size</label>
                <select v-model="localSize" class="tem-select">
                  <option v-for="opt in tokenSizeOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
                </select>

                <label class="tem-label" style="margin-top:10px">
                  Elevation
                  <span class="tem-hint-inline">ft / tiles · blank = ground</span>
                </label>
                <input v-model.number="localElevation" type="number" class="tem-num-input" placeholder="0" />
              </div>
            </div>
          </div>

          <!-- ── INITIATIVE ───────────────────────────────────────────────── -->
          <div class="tem-section">
            <div class="tem-section-label">Initiative</div>
            <div class="tem-field" style="max-width:160px">
              <label class="tem-label">
                Initiative
                <span class="tem-hint-inline">Higher goes first</span>
              </label>
              <input v-model.number="localInitiative" type="number" class="tem-num-input" />
            </div>
          </div>

          <!-- ── TIMERS ───────────────────────────────────────────────────── -->
          <div class="tem-section">
            <div class="tem-section-label">
              Timers
              <span class="tem-hint-inline">count down at the start of this token's turn</span>
            </div>
            <div v-for="tmr in localTimers" :key="tmr.id" class="tem-timer-row">
              <input v-model="tmr.name" class="tem-text-input tem-timer-name" placeholder="Name" />
              <input
                v-model.number="tmr.remaining"
                type="number"
                min="0"
                class="tem-num-input tem-timer-num"
                title="Turns left (0 = up)"
              />
              <span class="tem-timer-of">/</span>
              <input
                v-model.number="tmr.duration"
                type="number"
                min="1"
                class="tem-num-input tem-timer-num"
                title="Reset value"
              />
              <button
                class="tem-timer-btn"
                :class="{ 'tem-timer-btn--on': tmr.visibleToPlayers }"
                :title="tmr.visibleToPlayers ? 'Shown to players' : 'GM only'"
                @click="tmr.visibleToPlayers = !tmr.visibleToPlayers"
              >
                <OhVueIcon :name="tmr.visibleToPlayers ? 'md-visibility' : 'md-visibilityoff'" scale="0.75" />
              </button>
              <button class="tem-timer-btn tem-timer-btn--danger" title="Remove timer" @click="removeLocalTimer(tmr.id)">✕</button>
            </div>
            <div class="tem-timer-add">
              <button class="tem-add-cond-btn" @click="addLocalTimer()">+ Add Timer</button>
              <button
                v-for="preset in TIMER_PRESETS"
                :key="preset.name"
                class="tem-timer-preset"
                @click="addLocalTimer(preset.name, preset.turns)"
              >{{ preset.name }} · {{ preset.turns }}</button>
            </div>
          </div>

          <!-- ── VISION ─────────────────────────────────────────────────────── -->
          <div class="tem-section">
            <div class="tem-section-label">Vision</div>
            <label class="tem-sync-row" style="margin-bottom:12px">
              <input type="checkbox" v-model="localIsPlayerToken" class="tem-checkbox" />
              <span>Player Character Token <span class="tem-hint-inline">shares vision, shows exact HP to players</span></span>
            </label>
            <div class="tem-field">
              <label class="tem-label">
                Vision Range
                <span class="tem-hint-inline">tiles · blank = unlimited</span>
              </label>
              <input
                v-model.number="localVisionRange"
                type="number"
                min="1"
                class="tem-num-input"
                placeholder="∞"
              />
            </div>
          </div>

          <!-- ── CONDITIONS ───────────────────────────────────────────────── -->
          <div class="tem-section">
            <div class="tem-section-label">Conditions</div>
            <div class="enc-conditions-list">
              <div v-for="cond in token.conditions" :key="cond.name" class="condition-tag">
                <span class="condition-tag-name">{{ cond.name }}</span>
                <span v-if="cond.value !== null" class="condition-value-display">{{ cond.value }}</span>
              </div>
              <span v-if="!token.conditions.length" class="enc-no-conditions">None</span>
            </div>
            <button class="tem-add-cond-btn" style="margin-top:8px" @click="$emit('open-conditions')">
              Edit Conditions →
            </button>
          </div>

          <!-- ── NOTES ─────────────────────────────────────────────────────── -->
          <div class="tem-section">
            <div class="tem-section-label">Notes</div>
            <textarea
              v-model="localNotes"
              class="tem-textarea"
              rows="3"
              placeholder="Notes visible to GM only…"
            />
          </div>

        </div><!-- /tem-body -->

        <!-- Footer -->
        <div class="tem-footer">
          <button class="link-btn link-btn--skip" @click="$emit('close')">Cancel</button>
          <button class="link-btn link-btn--link" @click="save">Save Changes</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { EncounterToken, HpChangeOptions, TokenCondition, TokenTimer } from '~/stores/encounter'
import { rulesGet } from '~/composables/useRules'
import { useCreatureSearch, otherGameTag, type CreatureOption } from '~/composables/useCreatureSearch'
import { tokenStats, type Adjustment } from '~/rules/combat'
import { SIZE_SQUARES } from '~/rules/format'
import type { GameId } from '~/types/game'

const props = defineProps<{
  token: EncounterToken | null
  game: GameId
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  update: [tokenId: number, changes: Partial<EncounterToken>, hpOpts?: HpChangeOptions]
  'open-conditions': []
}>()

// ── Local editable state ───────────────────────────────────────────────────
const localLabel      = ref('')
const localHpCurrent  = ref<number | null>(null)
const localHpMax      = ref<number | null>(null)
const localAc         = ref<number | null>(null)
const localInitiative = ref<number | null>(null)
const localSize       = ref(1)
const localNotes      = ref('')
const localConditions = ref<TokenCondition[]>([])
const localLinkedRulesId = ref<string | null>(null)
const localAdjustment = ref<Adjustment | null>(null)
const localIsPlayerToken = ref(false)
const localVisionRange = ref<number | null>(null)
const localElevation = ref<number | null>(null)
const localTimers = ref<TokenTimer[]>([])
const localCritical = ref(false)
const localUsesDying = ref(false)
/** Hits taken in this dialog while the token was already at 0 HP (each raises dying). */
const hitsAtZero = ref(0)

const TIMER_PRESETS = [
  { name: 'Breath Weapon', turns: 2 },
  { name: 'Concentration', turns: 10 },
]

function addLocalTimer(name = '', turns = 1) {
  localTimers.value.push({
    id: `tmr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name, remaining: turns, duration: turns, visibleToPlayers: false,
  })
}

function removeLocalTimer(id: string) {
  localTimers.value = localTimers.value.filter(t => t.id !== id)
}

/** Drops unnamed rows and clamps counts so a half-typed form can't store junk. */
function cleanTimers(timers: TokenTimer[]): TokenTimer[] {
  return timers
    .filter(t => t.name.trim())
    .map(t => {
      const duration = Math.max(1, Math.floor(Number(t.duration) || 1))
      return { ...t, name: t.name.trim(), duration, remaining: Math.max(0, Math.floor(Number(t.remaining) || 0)) }
    })
}

// Reset local state whenever the token changes
watch(() => props.token, (tok) => {
  if (!tok) return
  localLabel.value      = tok.label ?? ''
  localHpCurrent.value  = tok.hpCurrent
  localHpMax.value      = tok.hpMax
  localAc.value         = tok.ac
  localInitiative.value = tok.initiative
  localSize.value       = tok.size
  localNotes.value      = tok.notes ?? ''
  localLinkedRulesId.value = tok.linkedRulesId
  localAdjustment.value = tok.adjustment
  localIsPlayerToken.value = tok.isPlayerToken ?? false
  localVisionRange.value = tok.visionRange ?? null
  localElevation.value = tok.elevation ?? null
  localTimers.value = (tok.timers ?? []).map(t => ({ ...t }))
  localCritical.value = false
  localUsesDying.value = tok.usesDying ?? tok.isPlayerToken ?? false
  hitsAtZero.value = 0
  linkedName.value = null
  changingLink.value = false
  resetLinkSearch()
  syncHpAc.value = true
  damageAmt.value = null
  if (tok.linkedRulesId) loadLinkedName(tok.linkedRulesId)
}, { immediate: true })

// ── Linked compendium entry ────────────────────────────────────────────────
const linkedName = ref<string | null>(null)
const changingLink = ref(false)
const syncHpAc = ref(true)
const { search: linkSearch, results: linkResults, reset: resetLinkSearch } = useCreatureSearch(toRef(props, 'game'), { limit: 8, hazards: true })

const linkChanged = computed(() =>
  !!props.token && !!localLinkedRulesId.value &&
  (localLinkedRulesId.value !== props.token.linkedRulesId || localAdjustment.value !== props.token.adjustment))

async function loadLinkedName(id: string) {
  const entry = await rulesGet(id)
  linkedName.value = entry?.name ?? '(missing from the compendium)'
}

function selectEntry(opt: CreatureOption) {
  linkedName.value = opt.name
  localLinkedRulesId.value = opt.id
  changingLink.value = false
  resetLinkSearch()
}

function clearLink() {
  localLinkedRulesId.value = null
  localAdjustment.value = null
  linkedName.value = null
  changingLink.value = false
  resetLinkSearch()
}

// ── Damage / healing quick row ─────────────────────────────────────────────
const damageAmt = ref<number | null>(null)

function applyDamage() {
  if (!damageAmt.value) return
  const current = localHpCurrent.value ?? 0
  if (current <= 0 && damageAmt.value > 0) hitsAtZero.value++
  localHpCurrent.value = Math.max(0, current - damageAmt.value)
  damageAmt.value = null
}

function applyHealing() {
  if (!damageAmt.value) return
  const current = localHpCurrent.value ?? 0
  const max = localHpMax.value ?? current + damageAmt.value
  localHpCurrent.value = Math.min(max, current + damageAmt.value)
  damageAmt.value = null
}


// ── Save ───────────────────────────────────────────────────────────────────
const SIZE_LABELS: Record<number, string> = {
  1: 'medium', 2: 'large', 3: 'huge', 4: 'gargantuan',
}
const tokenSizeOptions = [...new Set(Object.values(SIZE_SQUARES))]
  .sort((a, b) => a - b)
  .map(v => ({ label: `${v}×${v} (${SIZE_LABELS[v] ?? v})`, value: v }))

async function save() {
  if (!props.token) return
  const changes: Partial<EncounterToken> = {}

  if (localLabel.value !== (props.token.label ?? '')) changes.label = localLabel.value || null
  if (localHpCurrent.value !== props.token.hpCurrent) changes.hpCurrent = localHpCurrent.value
  if (localHpMax.value !== props.token.hpMax) changes.hpMax = localHpMax.value
  if (localAc.value !== props.token.ac) changes.ac = localAc.value
  if (localInitiative.value !== props.token.initiative) changes.initiative = localInitiative.value
  if (localSize.value !== props.token.size) changes.size = localSize.value
  if (localNotes.value !== (props.token.notes ?? '')) changes.notes = localNotes.value || null
  if (localLinkedRulesId.value !== props.token.linkedRulesId) changes.linkedRulesId = localLinkedRulesId.value
  const adjustment = localLinkedRulesId.value ? localAdjustment.value : null
  if (adjustment !== props.token.adjustment) changes.adjustment = adjustment
  if (localIsPlayerToken.value !== (props.token.isPlayerToken ?? false)) changes.isPlayerToken = localIsPlayerToken.value
  if (localVisionRange.value !== props.token.visionRange) changes.visionRange = localVisionRange.value || null
  if (localElevation.value !== props.token.elevation) changes.elevation = localElevation.value ?? null
  // Stored only when it differs from the default, so the PC flag keeps steering it
  const usesDying = localUsesDying.value === localIsPlayerToken.value ? null : localUsesDying.value
  if (usesDying !== (props.token.usesDying ?? null)) changes.usesDying = usesDying
  // Damage at 0 HP raises dying even though HP stays at 0
  if (hitsAtZero.value && !('hpCurrent' in changes)) changes.hpCurrent = localHpCurrent.value
  const timers = cleanTimers(localTimers.value)
  if (JSON.stringify(timers) !== JSON.stringify(props.token.timers ?? [])) changes.timers = timers

  // Optionally take over HP/AC/size from the newly linked (or re-adjusted) stat block.
  // Damage already taken carries over.
  if (linkChanged.value && syncHpAc.value) {
    const stats = tokenStats(await rulesGet(localLinkedRulesId.value!), adjustment)
    if (stats.hpMax !== null) {
      const damage = localHpMax.value !== null && localHpCurrent.value !== null ? localHpMax.value - localHpCurrent.value : 0
      changes.hpMax = stats.hpMax
      changes.hpCurrent = Math.max(0, stats.hpMax - damage)
    }
    if (stats.ac !== null) changes.ac = stats.ac
    changes.size = stats.size
  }

  if (Object.keys(changes).length) emit('update', props.token.id, changes, { critical: localCritical.value, hitsAtZero: hitsAtZero.value })
  emit('close')
}
</script>

<style scoped>
.tem-dialog {
  width: 480px;
  max-width: 96vw;
  max-height: 88vh;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

/* Header */
.tem-header {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--parch-line);
  flex-shrink: 0;
}
.tem-title {
  font-family: 'Cinzel', var(--font-deco);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
}
.tem-sub {
  font-family: var(--font-head);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-ghost);
  text-transform: uppercase;
}
.tem-close {
  margin-left: auto;
  background: none;
  border: none;
  font-size: 14px;
  color: var(--ink-ghost);
  cursor: pointer;
  padding: 0;
  line-height: 1;
  transition: color 0.15s;
}
.tem-close:hover { color: var(--blood); }

/* Scrollable body */
.tem-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 18px 8px;
}

/* Section */
.tem-section {
  padding: 14px 0;
  border-bottom: 1px dashed var(--parch-line);
}
.tem-section:last-child { border-bottom: none; }
.tem-section-label {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  margin-bottom: 12px;
}

/* Field */
.tem-field { margin-bottom: 10px; }
.tem-field:last-child { margin-bottom: 0; }
.f-field { margin-bottom: 14px; }
.tem-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  margin-bottom: 5px;
}
.tem-hint-inline {
  font-family: var(--font-body);
  font-size: 10px;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 400;
  color: var(--ink-ghost);
  font-style: italic;
}

/* Text input */
.tem-text-input {
  width: 100%;
  padding: 6px 9px;
  background: var(--parch);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  box-sizing: border-box;
}
.tem-text-input:focus { outline: 1px solid var(--gold); border-color: var(--gold); }
.tem-text-input::placeholder { color: var(--ink-ghost); font-style: italic; }

/* Number input */
.tem-num-input {
  width: 100%;
  padding: 5px 8px;
  background: var(--parch);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  box-sizing: border-box;
  text-align: center;
}
.tem-num-input:focus { outline: 1px solid var(--gold); border-color: var(--gold); }

/* Stepper row */
.tem-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
}
.tem-step-btn {
  width: 28px;
  height: 28px;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  background: var(--parch);
  color: var(--ink-ghost);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: border-color 0.15s, color 0.15s;
}
.tem-step-btn:hover { border-color: var(--gold); color: var(--gold); }

/* Select */
.tem-select {
  width: 100%;
  padding: 5px 8px;
  background: var(--parch);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
}

/* Two-column combat layout */
.tem-combat-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.tem-col { display: flex; flex-direction: column; }

/* Quick damage row */
.tem-damage-row {
  display: flex;
  gap: 4px;
  align-items: center;
}
.tem-damage-input { flex: 1; }
.tem-dmg-btn {
  padding: 5px 8px;
  border-radius: 2px;
  border: 1px solid;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.tem-dmg-btn--dmg { background: rgba(139,0,0,0.08); color: var(--blood); border-color: rgba(139,0,0,0.35); }
.tem-dmg-btn--dmg:hover { background: rgba(139,0,0,0.18); }
.tem-dmg-btn--heal { background: rgba(74,143,90,0.1); color: #4a8f5a; border-color: rgba(74,143,90,0.35); }
.tem-dmg-btn--heal:hover { background: rgba(74,143,90,0.2); }

/* Linked record row */
.tem-linked-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.tem-adjust {
  font-size: 12px;
  padding: 2px 4px;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  background: transparent;
  color: var(--ink);
}
.tem-linked-badge {
  flex: 1;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  font-style: italic;
}
.tem-clear-link {
  background: none;
  border: none;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  cursor: pointer;
  padding: 2px 6px;
  border-radius: 2px;
  color: var(--ink-ghost);
  border: 1px solid var(--parch-line);
  transition: all 0.15s;
}
.tem-clear-link:hover { color: var(--ink); border-color: var(--ink-ghost); }
.tem-clear-link--danger:hover { color: var(--blood); border-color: var(--blood); }

/* Dropdown list */
.tem-dropdown {
  border: 1px solid var(--parch-line);
  border-top: none;
  border-radius: 0 0 2px 2px;
  background: var(--parch);
  max-height: 160px;
  overflow-y: auto;
}
.tem-dropdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: none;
  border: none;
  text-align: left;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  transition: background 0.1s;
}
.tem-dropdown-row:hover { background: rgba(184,134,11,0.08); }
.tem-rec-type {
  font-family: var(--font-head);
  font-size: 8px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  background: rgba(28,20,16,0.06);
  padding: 1px 5px;
  border-radius: 2px;
  flex-shrink: 0;
}

/* Sync checkbox */
.tem-sync-row {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink-ghost);
  cursor: pointer;
}
.tem-checkbox { accent-color: var(--gold); cursor: pointer; }

/* Condition value badge (read-only display) */
.condition-value-display {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--arcane-l, #9f7abf);
  background: rgba(159,122,191,0.12);
  border-radius: 2px;
  padding: 0 4px;
}

/* Add / edit condition button */
.tem-add-cond-btn {
  background: none;
  border: 1px dashed var(--parch-line);
  border-radius: 2px;
  padding: 4px 12px;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  cursor: pointer;
  transition: all 0.15s;
}
.tem-add-cond-btn:hover { border-color: var(--ink-ghost); color: var(--ink); }

/* Timers */
.tem-timer-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
}
.tem-timer-name { flex: 1; min-width: 0; }
.tem-timer-num { width: 52px; flex-shrink: 0; padding: 5px 4px; }
.tem-timer-of { color: var(--ink-ghost); font-size: 12px; }
.tem-timer-btn {
  width: 26px;
  height: 26px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  color: var(--ink-ghost);
  font-size: 11px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.tem-timer-btn:hover { color: var(--ink); border-color: var(--ink-ghost); }
.tem-timer-btn--on { color: var(--gold); border-color: var(--gold); }
.tem-timer-btn--danger:hover { color: var(--blood); border-color: var(--blood); }
.tem-timer-add {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.tem-timer-preset {
  background: none;
  border: 1px solid var(--parch-line);
  border-radius: 10px;
  padding: 2px 9px;
  font-size: 11px;
  color: var(--ink-ghost);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.tem-timer-preset:hover { color: var(--ink); border-color: var(--gold); }

.tem-cond-adder { margin-top: 8px; }

/* Notes textarea */
.tem-textarea {
  width: 100%;
  padding: 7px 9px;
  background: var(--parch);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  resize: vertical;
  box-sizing: border-box;
}
.tem-textarea:focus { outline: 1px solid var(--gold); border-color: var(--gold); }
.tem-textarea::placeholder { color: var(--ink-ghost); font-style: italic; }

/* Footer */
.tem-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 18px 14px;
  border-top: 1px solid var(--parch-line);
  flex-shrink: 0;
}
</style>

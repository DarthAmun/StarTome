<template>
  <Teleport to="body">
    <div v-if="open && token" class="pv-dialog-mask" style="z-index:var(--z-modal-top)" @click.self="$emit('close')">
      <div class="pv-dialog cm-dialog" @keydown.esc="$emit('close')">

        <!-- Header -->
        <div class="cm-header">
          <span class="cm-title">Conditions</span>
          <span class="cm-sub">— {{ token.label || token.name }}</span>
          <button class="cm-close" @click="$emit('close')">✕</button>
        </div>

        <!-- Search -->
        <div class="cm-search-wrap">
          <OhVueIcon name="fa-search" scale="0.75" class="cm-search-icon" />
          <input
            ref="searchEl"
            v-model="search"
            class="cm-search-input"
            placeholder="Search conditions… (or Persistent fire 2d6)"
            autocomplete="off"
          />
          <button v-if="search" class="cm-search-clear" @click="search = ''">✕</button>
        </div>

        <div class="cm-body" @click="editingStyle = null">

          <!-- Active conditions -->
          <div v-if="localConditions.length" class="cm-section">
            <div class="cm-section-header">
              <span class="cm-section-label cm-section-label--active">Active</span>
              <span class="cm-section-count">{{ localConditions.length }}</span>
            </div>
            <div class="cm-active-list">
              <div v-for="(cond, idx) in localConditions" :key="cond.name + idx" class="cm-active-item">
                <div class="cm-active-row">
                  <span
                    class="cm-active-name"
                    :class="{ 'cm-active-name--hidden': cond.hidden }"
                    title="Open full condition details"
                    @click="emit('show-condition-panel', cond.name, cond.value)"
                  >{{ cond.name }}</span>
                  <div class="cm-active-stepper">
                    <button class="cond-ctrl-btn" @click="adjustValue(idx, -1)">−</button>
                    <span class="cm-val-display">{{ cond.value !== null ? cond.value : '—' }}</span>
                    <button class="cond-ctrl-btn" @click="adjustValue(idx, 1)">+</button>
                  </div>
                  <button
                    class="cond-ctrl-btn cond-vis-btn"
                    :class="{ 'cond-vis-btn--hidden': cond.hidden }"
                    :title="cond.hidden ? 'Hidden from players — click to reveal' : 'Visible to players — click to hide'"
                    @click="toggleHidden(idx)"
                  >{{ cond.hidden ? '◌' : '👁' }}</button>
                  <button class="condition-remove" @click="removeCondition(idx)">✕</button>
                </div>
                <div v-if="isPersistent(cond)" class="cm-persistent-row">
                  <span class="cm-persistent-label">Damage per turn</span>
                  <input :value="cond.formula ?? ''" class="cm-persistent-input" placeholder="2d6" @change="setFormula(idx, ($event.target as HTMLInputElement).value)" />
                </div>
              </div>
            </div>
          </div>

          <!-- Available conditions -->
          <div class="cm-section">
            <div class="cm-section-header">
              <span class="cm-section-label cm-section-label--avail">Available</span>
              <span class="cm-section-count">{{ filteredAvailable.length }}</span>
            </div>

            <div v-if="loading" class="cm-loading">
              <OhVueIcon name="md-autorenew" scale="1.2" class="cm-spin" />
            </div>
            <template v-else>
              <!-- Free-text "add custom" entry — shown when search doesn't match any known condition -->
              <button v-if="customConditionEntry" class="cm-add-custom" @click="addCustomCondition">
                <OhVueIcon name="md-add" scale="0.85" style="flex-shrink:0" />
                Add "<strong>{{ customConditionEntry }}</strong>" as condition
              </button>

              <div v-if="!filteredAvailable.length && !customConditionEntry" class="cm-empty">
                {{ search ? `No matches for "${search}"` : 'No conditions in linked system' }}
              </div>
              <div v-else class="cm-list">
                <div
                  v-for="cond in filteredAvailable"
                  :key="cond.name"
                  class="cm-row"
                  :class="{ 'cm-row--active': isActive(cond.name) }"
                >
                  <div class="cm-row-body">
                    <div class="cm-row-top">
                      <!-- Color/icon swatch — only for compendium conditions, where the style is saved -->
                      <button
                        v-if="cond.rulesId"
                        class="cm-style-swatch"
                        :style="{ background: cond.color ?? '#666' }"
                        :title="'Edit color / icon for ' + cond.name"
                        @click.stop="editingStyle = editingStyle === cond.name ? null : cond.name"
                      >
                        <OhVueIcon v-if="cond.icon" :name="cond.icon" :scale="0.5" style="opacity:0.9;pointer-events:none" />
                      </button>
                      <span class="cm-cond-name">{{ cond.name }}</span>
                      <OhVueIcon
                        v-if="isActive(cond.name)"
                        name="md-check"
                        scale="0.85"
                        class="cm-active-check"
                      />
                      <button class="cm-toggle-btn" @click="toggleCondition(cond)">
                        {{ isActive(cond.name) ? 'Remove' : 'Add' }}
                      </button>
                    </div>
                    <span v-if="cond.summary" class="cm-cond-summary">{{ cond.summary }}</span>

                    <!-- Style popover -->
                    <div v-if="editingStyle === cond.name" class="cm-style-popover" @click.stop>
                      <div class="cm-style-section-label">Color</div>
                      <div class="cm-style-colors">
                        <button
                          v-for="c in STYLE_COLORS"
                          :key="c"
                          class="cm-swatch-btn"
                          :class="{ 'cm-swatch-btn--active': cond.color === c }"
                          :style="{ background: c }"
                          @click="saveConditionStyle(cond, c)"
                        />
                      </div>
                      <div class="cm-style-section-label" style="margin-top:8px">Icon</div>
                      <div class="cm-style-icons">
                        <button
                          v-for="ic in STYLE_ICONS"
                          :key="ic"
                          class="cm-icon-btn"
                          :class="{ 'cm-icon-btn--active': cond.icon === ic }"
                          :title="ic"
                          @click="saveConditionStyle(cond, undefined, ic)"
                        >
                          <OhVueIcon :name="ic" :scale="0.75" />
                        </button>
                      </div>
                      <button class="cm-style-close" @click="editingStyle = null">Done</button>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>

        </div><!-- /cm-body -->

        <!-- Footer -->
        <div class="cm-footer">
          <button class="link-btn link-btn--link" @click="$emit('close')">Done</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import type { EncounterToken, TokenCondition } from '~/stores/encounter'
import { conditionInfo, getConditionColor } from '~/composables/useConditions'
import { loadAvailableConditions, saveConditionStyle as storeConditionStyle, type AvailableCondition } from '~/composables/useConditionCatalog'
import type { GameId } from '~/types/game'
import { isPersistent, parsePersistent } from '~/rules/turnEffects'

const props = defineProps<{
  token: EncounterToken | null
  game?: GameId
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  update: [tokenId: number, conditions: TokenCondition[]]
  'show-condition-panel': [name: string, value: number | null]
}>()

// ── Condition style palette ────────────────────────────────────────────────
const STYLE_COLORS = [
  '#5fae54', '#e07b39', '#d04a4a', '#a06ad4', '#d9c34a',
  '#7d8a99', '#4aa3c0', '#d4b54a', '#8456a8', '#6a89b5',
  '#88c5c5', '#c08a5a', '#a35b5b', '#9aa7b8', '#c86fa8', '#7cc44e',
]
const STYLE_ICONS = [
  'gi-poison-bottle', 'gi-fire',          'gi-falling',       'gi-spider-web',
  'gi-terror',        'gi-knockout',      'gi-sight-disabled','gi-brain',
  'gi-angel-wings',   'gi-evil-moon',     'gi-snail',         'gi-invisible',
  'gi-grab',          'gi-tired-eye',     'gi-death-skull',   'gi-broken-bone',
  'gi-chain-lightning','gi-magic-swirl',  'gi-frozen-orb',    'gi-heart-shield',
  'gi-sleepy',        'gi-eye-shield',    'gi-acid',          'gi-circle',
]

// ── State ──────────────────────────────────────────────────────────────────
const search = ref('')
const searchEl = ref<HTMLInputElement | null>(null)
const loading = ref(false)
const localConditions = ref<TokenCondition[]>([])
const editingStyle = ref<string | null>(null)  // condition name whose style popover is open

type AvailCondition = AvailableCondition

const availableConditions = ref<AvailCondition[]>([])

// ── Synced compendium conditions, topped up by the built-in list ──────────
async function loadConditions() {
  loading.value = true
  availableConditions.value = []
  try {
    availableConditions.value = await loadAvailableConditions(props.game ?? 'pf2e')
  } finally {
    loading.value = false
  }
}

// ── Computed ───────────────────────────────────────────────────────────────
const filteredAvailable = computed(() => {
  const q = search.value.toLowerCase()
  return q
    ? availableConditions.value.filter(c => c.name.toLowerCase().includes(q))
    : availableConditions.value
})

// Shows an "Add 'X'" prompt when the search text doesn't exactly match any known condition
const customConditionEntry = computed<string | null>(() => {
  const q = search.value.trim()
  if (!q) return null
  if (availableConditions.value.some(c => c.name.toLowerCase() === q.toLowerCase())) return null
  return q
})

function isActive(name: string) {
  return localConditions.value.some(c => c.name === name)
}

// ── Mutations — immediately emitted ───────────────────────────────────────
function emit_update() {
  if (!props.token) return
  emit('update', props.token.id, [...localConditions.value])
}

function addCustomCondition() {
  const typed = customConditionEntry.value
  if (!typed) return
  // "Persistent fire 2d6" → a persistent damage condition with its formula
  const persistent = parsePersistent(typed)
  const name = persistent?.name ?? typed
  if (isActive(name)) return
  const cat = conditionInfo(name)
  localConditions.value.push({
    name,
    value: null,
    color: cat?.color ?? getConditionColor(name),
    icon: cat?.icon,
    ...(persistent ? { formula: persistent.formula } : {}),
  })
  emit_update()
  search.value = ''
}

function toggleCondition(cond: AvailCondition) {
  const idx = localConditions.value.findIndex(c => c.name === cond.name)
  if (idx !== -1) {
    localConditions.value.splice(idx, 1)
  } else {
    localConditions.value.push({
      name: cond.name,
      value: cond.hasValue ? 1 : null,
      color: cond.color,
      icon: cond.icon,
    })
  }
  emit_update()
}

function setFormula(idx: number, formula: string) {
  localConditions.value[idx] = { ...localConditions.value[idx], formula: formula.trim() || undefined }
  emit_update()
}

function removeCondition(idx: number) {
  localConditions.value.splice(idx, 1)
  emit_update()
}

function toggleHidden(idx: number) {
  const c = localConditions.value[idx]
  localConditions.value[idx] = { ...c, hidden: !c.hidden }
  emit_update()
}

function adjustValue(idx: number, delta: number) {
  const c = localConditions.value[idx]
  if (c.value === null) {
    // Null means "no stage" — + assigns stage 1, − does nothing
    if (delta > 0) {
      localConditions.value[idx] = { ...c, value: 1 }
      emit_update()
    }
    return
  }
  const next = c.value + delta
  // Clamp at 1 minimum — use the ✕ button to fully remove the condition
  localConditions.value[idx] = { ...c, value: Math.max(1, next) }
  emit_update()
}


// ── Condition style editing ────────────────────────────────────────────────
async function saveConditionStyle(cond: AvailCondition, color?: string, icon?: string) {
  if (color !== undefined) cond.color = color
  if (icon !== undefined) cond.icon = icon
  // Saved on the compendium entry (a user-owned field, kept across re-syncs)
  if (cond.rulesId) await storeConditionStyle(cond.rulesId, { color: cond.color, icon: cond.icon })
  // Propagate to any active condition on the current token
  const active = localConditions.value.find(c => c.name === cond.name)
  if (active) {
    if (color !== undefined) active.color = color
    if (icon !== undefined) active.icon = icon
    emit_update()
  }
}

// ── Lifecycle ──────────────────────────────────────────────────────────────
watch(() => props.open, async (open) => {
  if (!open) return
  search.value = ''
  localConditions.value = props.token ? props.token.conditions.map(c => ({ ...c })) : []
  await loadConditions()
  nextTick(() => searchEl.value?.focus())
}, { immediate: false })

watch(() => props.token, (tok) => {
  if (tok && props.open) {
    localConditions.value = tok.conditions.map(c => ({ ...c }))
  }
})
</script>

<style scoped>
.cm-dialog {
  width: 520px;
  max-width: 96vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  padding: 10px;
}

/* Header */
.cm-header {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding: 14px 18px 12px;
  border-bottom: 1px solid var(--parch-line);
  flex-shrink: 0;
}
.cm-title {
  font-family: 'Cinzel', var(--font-deco);
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}
.cm-sub {
  font-family: var(--font-head);
  font-size: 10px;
  letter-spacing: 0.1em;
  color: var(--ink-ghost);
  text-transform: uppercase;
}
.cm-close {
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
.cm-close:hover { color: var(--blood); }

/* Search */
.cm-search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  border-bottom: 1px solid var(--parch-line);
  flex-shrink: 0;
}
.cm-search-icon { color: var(--ink-ghost); flex-shrink: 0; }
.cm-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
}
.cm-search-input::placeholder { color: var(--ink-ghost); font-style: italic; }
.cm-search-clear {
  background: none;
  border: none;
  color: var(--ink-ghost);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  transition: color 0.15s;
}
.cm-search-clear:hover { color: var(--blood); }

/* Scrollable body */
.cm-body {
  flex: 1;
  overflow-y: auto;
  padding: 0 14px 8px;
}

/* Section */
.cm-section { padding: 12px 0; border-bottom: 1px dashed var(--parch-line); }
.cm-section:last-child { border-bottom: none; }
.cm-section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}
.cm-section-label {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}
.cm-section-label--active { color: var(--arcane-l, #9f7abf); }
.cm-section-label--avail  { color: var(--ink-ghost); }
.cm-section-count {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-ghost);
  opacity: 0.6;
}

/* Active conditions list */
.cm-active-list { display: flex; flex-direction: column; gap: 2px; }
.cm-active-item { display: flex; flex-direction: column; }
.cm-active-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 4px;
  border-radius: 3px;
  transition: background 0.1s;
}
.cm-active-row:hover { background: rgba(159,122,191,0.06); }
.cm-persistent-row { display: flex; align-items: center; gap: 8px; padding: 0 10px 6px; }
.cm-persistent-label { font-size: 11px; color: var(--text3); }
.cm-persistent-input { width: 90px; padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border); background: transparent; color: var(--text); font-size: 12px; }
.cm-active-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-head);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--arcane-l, #9f7abf);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition: color 0.15s;
}
.cm-active-name:hover { color: var(--ink); }
.cm-active-name--open { color: var(--ink); }
.cm-active-name--hidden { opacity: 0.55; text-decoration: line-through; }
.cond-vis-btn { font-size: 11px; opacity: 0.6; }
.cond-vis-btn:hover { opacity: 1; }
.cond-vis-btn--hidden { color: #6b6b9a; opacity: 0.85; }
.cm-active-stepper {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.cm-val-display {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--ink);
  min-width: 18px;
  text-align: center;
}
.cm-active-detail {
  margin: 2px 4px 6px 12px;
  padding: 6px 10px;
  background: rgba(159,122,191,0.05);
  border-left: 2px solid rgba(159,122,191,0.3);
  border-radius: 0 2px 2px 0;
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--ink-faded);
  line-height: 1.5;
}
.cm-detail-empty { font-style: italic; }

/* Available list */
.cm-list { display: flex; flex-direction: column; gap: 1px; }
.cm-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  background: none;
  border: none;
  border-radius: 2px;
  text-align: left;
  transition: background 0.1s;
}
.cm-row:hover { background: rgba(28,20,16,0.05); }
.cm-row--active { background: rgba(159,122,191,0.07); }
.cm-row--active:hover { background: rgba(159,122,191,0.13); }

.cm-row-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
.cm-row-top {
  display: flex;
  align-items: center;
  gap: 7px;
}
.cm-cond-name {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  font-weight: 600;
  flex: 1;
}
.cm-row--active .cm-cond-name { color: var(--arcane-l, #9f7abf); }
.cm-cond-summary {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink-ghost);
  font-style: italic;
  line-height: 1.4;
}
.cm-cond-desc {
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--ink-faded);
  line-height: 1.45;
  margin-top: 1px;
}
.cm-active-check { color: var(--arcane-l, #9f7abf); flex-shrink: 0; }
.cm-toggle-btn {
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--parch-line);
  background: none;
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  cursor: pointer;
  transition: all 0.15s;
}
.cm-toggle-btn:hover { border-color: var(--arcane, #7a5abf); color: var(--arcane-l, #9f7abf); }
.cm-row--active .cm-toggle-btn {
  border-color: rgba(159,122,191,0.4);
  color: var(--arcane-l, #9f7abf);
}
.cm-row--active .cm-toggle-btn:hover {
  border-color: var(--blood);
  color: var(--blood);
}

/* Loading / empty */
.cm-loading {
  display: flex;
  justify-content: center;
  padding: 24px 0;
  color: var(--ink-ghost);
}
.cm-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.cm-empty {
  padding: 16px 10px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-ghost);
  font-style: italic;
  text-align: center;
}

/* Free-text add-custom button */
.cm-add-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  margin-bottom: 6px;
  border: 1px dashed rgba(159, 122, 191, 0.4);
  border-radius: 3px;
  background: none;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--arcane-l, #9f7abf);
  text-align: left;
  transition: background 0.12s, border-color 0.12s;
}
.cm-add-custom:hover {
  background: rgba(159, 122, 191, 0.08);
  border-color: rgba(159, 122, 191, 0.7);
}
.cm-add-custom strong { font-weight: 700; }

/* Style swatch button */
.cm-style-swatch {
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid rgba(255,255,255,0.18);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.12s, border-color 0.12s;
  color: #fff;
}
.cm-style-swatch:hover {
  transform: scale(1.2);
  border-color: rgba(255,255,255,0.5);
}

/* Style popover */
.cm-style-popover {
  margin-top: 8px;
  padding: 10px;
  background: var(--surface2, rgba(20,16,12,0.97));
  border: 1px solid var(--parch-line);
  border-radius: 5px;
}
.cm-style-section-label {
  font-family: var(--font-head);
  font-size: 8.5px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  margin-bottom: 6px;
}
.cm-style-colors {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.cm-swatch-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.1s, border-color 0.1s;
}
.cm-swatch-btn:hover { transform: scale(1.2); }
.cm-swatch-btn--active { border-color: #fff; transform: scale(1.15); }

.cm-style-icons {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.cm-icon-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  border: 1px solid var(--parch-line);
  background: none;
  color: var(--ink-ghost);
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
}
.cm-icon-btn:hover { background: rgba(159,122,191,0.12); color: var(--ink); }
.cm-icon-btn--active { background: rgba(159,122,191,0.22); color: var(--arcane-l, #9f7abf); border-color: rgba(159,122,191,0.5); }

.cm-style-close {
  display: block;
  margin-top: 8px;
  padding: 3px 10px;
  border-radius: 999px;
  border: 1px solid var(--parch-line);
  background: none;
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  cursor: pointer;
}
.cm-style-close:hover { border-color: var(--arcane); color: var(--arcane-l, #9f7abf); }

/* Footer */
.cm-footer {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px 14px;
  border-top: 1px solid var(--parch-line);
  flex-shrink: 0;
}
</style>

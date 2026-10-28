<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="menuEl"
      class="ctx-menu"
      :style="{ left: adjustedX + 'px', top: adjustedY + 'px' }"
      @keydown.esc="$emit('close')"
    >
      <!-- Empty canvas click -->
      <template v-if="!targetToken">
        <button class="ctx-item" @click="emit('add-token-here', gridX, gridY); emit('close')">
          <OhVueIcon name="md-add" scale="0.85" class="ctx-icon" />
          Add Token Here
        </button>
      </template>

      <!-- Token click -->
      <template v-else>
        <button class="ctx-item" @click="emit('edit-token', targetToken.id); emit('close')">
          <OhVueIcon name="md-editnote" scale="0.85" class="ctx-icon" />
          Edit Token
        </button>
        <!-- Quick conditions -->
        <div class="ctx-quick-conditions">
          <button
            v-for="cond in QUICK_CONDITIONS"
            :key="cond"
            class="ctx-cond-chip"
            :class="{ 'ctx-cond-chip--active': activeConditions.has(cond) }"
            :title="activeConditions.has(cond) ? `Remove ${cond}` : `Add ${cond}`"
            @click="emit('quick-condition', targetToken.id, cond); emit('close')"
          >{{ cond }}</button>
        </div>
        <button class="ctx-item" @click="emit('add-condition', targetToken.id); emit('close')">
          <OhVueIcon name="gi-poison" scale="0.85" class="ctx-icon" />
          All Conditions…
        </button>

        <!-- Inline initiative -->
        <div class="ctx-inline-row">
          <OhVueIcon name="gi-sands-of-time" scale="0.85" class="ctx-icon ctx-inline-icon" />
          <span class="ctx-inline-label">Initiative</span>
          <input
            v-model.number="initValue"
            type="number"
            class="ctx-inline-input"
            placeholder="—"
            @keyup.enter="commitInit"
            @keyup.esc="emit('close')"
            @click.stop
          />
        </div>

        <!-- Inline damage / heal -->
        <div class="ctx-inline-row">
          <OhVueIcon name="gi-drop" scale="0.85" class="ctx-icon ctx-inline-icon" />
          <span class="ctx-inline-label">
            Damage
            <span v-if="targetToken.hpMax" class="ctx-hp-hint">{{ targetToken.hpCurrent }}/{{ targetToken.hpMax }}</span>
          </span>
          <input
            v-model.number="dmgValue"
            type="number"
            class="ctx-inline-input"
            placeholder="0"
            @keyup.enter="commitDamage"
            @keyup.esc="emit('close')"
            @click.stop
          />
        </div>

        <!-- Inline timer: name + turns, ticks down at the start of this token's turn -->
        <div class="ctx-inline-row" title="Counts down at the start of this token's turn">
          <OhVueIcon name="gi-hourglass" scale="0.85" class="ctx-icon ctx-inline-icon" />
          <input
            v-model="timerName"
            type="text"
            class="ctx-inline-input ctx-inline-input--text"
            placeholder="Timer, e.g. Breath"
            @keyup.enter="commitTimer"
            @keyup.esc="emit('close')"
            @click.stop
          />
          <input
            v-model.number="timerTurns"
            type="number"
            min="1"
            class="ctx-inline-input"
            placeholder="turns"
            title="Turns until it's up"
            @keyup.enter="commitTimer"
            @keyup.esc="emit('close')"
            @click.stop
          />
        </div>

        <button
          v-if="targetToken.linkedRulesId"
          class="ctx-item"
          @click="emit('view-record', targetToken.id); emit('close')"
        >
          <OhVueIcon name="md-menubook" scale="0.85" class="ctx-icon" />
          View Entry
        </button>
        <button
          v-if="targetToken.linkedEntityId"
          class="ctx-item"
          @click="emit('view-npc', targetToken.id); emit('close')"
        >
          <OhVueIcon name="gi-person" scale="0.85" class="ctx-icon" />
          View NPC
        </button>
        <button class="ctx-item" @click="emit('toggle-visibility', targetToken.id); emit('close')">
          <OhVueIcon :name="targetToken.isVisible ? 'md-visibilityoff' : 'md-visibility'" scale="0.85" class="ctx-icon" />
          {{ targetToken.isVisible ? 'Hide from Players' : 'Show to Players' }}
        </button>
        <button
          v-if="!targetToken.isVisible"
          class="ctx-item"
          title="Whether this hidden token still takes its turn"
          @click="emit('toggle-acts-while-hidden', targetToken.id); emit('close')"
        >
          <OhVueIcon name="gi-sands-of-time" scale="0.85" class="ctx-icon" />
          {{ targetToken.actsWhileHidden ? 'Skip Turns While Hidden' : 'Keep in Turn Order' }}
        </button>
        <button class="ctx-item" @click="emit('toggle-player-token', targetToken.id); emit('close')">
          <OhVueIcon name="gi-crowned-heart" scale="0.85" class="ctx-icon" />
          {{ targetToken.isPlayerToken ? 'Unmark Player Character' : 'Mark as Player Character' }}
        </button>
        <button class="ctx-item" @click="emit('toggle-dead', targetToken.id); emit('close')">
          <OhVueIcon name="fa-skull-crossbones" scale="0.85" class="ctx-icon" />
          {{ targetToken.isDead ? 'Mark Alive' : 'Mark Dead' }}
        </button>
        <div class="ctx-divider" />
        <button class="ctx-item ctx-item--danger" @click="emit('remove-token', targetToken.id); emit('close')">
          <OhVueIcon name="md-delete" scale="0.85" class="ctx-icon" />
          Remove Token
        </button>
      </template>
    </div>

    <!-- Click-outside overlay -->
    <div v-if="open" class="ctx-backdrop" @click="$emit('close')" @contextmenu.prevent="$emit('close')" />
  </Teleport>
</template>

<script setup lang="ts">
import type { EncounterToken } from '~/stores/encounter'

const props = defineProps<{
  x: number
  y: number
  gridX: number
  gridY: number
  targetToken: EncounterToken | null
  open: boolean
}>()

const emit = defineEmits<{
  close: []
  'add-token-here': [gridX: number, gridY: number]
  'edit-token': [tokenId: number]
  'add-condition': [tokenId: number]
  'quick-condition': [tokenId: number, name: string]
  'set-initiative': [tokenId: number, value: number | null]
  'apply-damage': [tokenId: number, amount: number]
  'view-record': [tokenId: number]
  'view-npc': [tokenId: number]
  'toggle-visibility': [tokenId: number]
  'toggle-dead': [tokenId: number]
  'toggle-player-token': [tokenId: number]
  'toggle-acts-while-hidden': [tokenId: number]
  'add-timer': [tokenId: number, name: string, turns: number]
  'remove-token': [tokenId: number]
}>()

const QUICK_CONDITIONS = ['Prone', 'Blinded', 'Frightened', 'Stunned', 'Poisoned', 'Restrained']

const activeConditions = computed(() =>
  new Set(props.targetToken?.conditions?.map(c => c.name) ?? [])
)

const menuEl = ref<HTMLElement | null>(null)

const initValue = ref<number | null>(null)
const dmgValue = ref<number | null>(null)
const timerName = ref('')
const timerTurns = ref<number | null>(null)

const MENU_W = 220
const MENU_H = 420

const adjustedX = computed(() => {
  const max = window.innerWidth - MENU_W - 8
  return Math.min(props.x, max)
})

const adjustedY = computed(() => {
  const max = window.innerHeight - MENU_H - 8
  return Math.min(props.y, max)
})

watch(() => props.open, (val) => {
  if (!val) return
  initValue.value = props.targetToken?.initiative ?? null
  dmgValue.value = null
  timerName.value = ''
  timerTurns.value = null
})

function commitInit() {
  if (props.targetToken) {
    emit('set-initiative', props.targetToken.id, initValue.value)
  }
  emit('close')
}

function commitTimer() {
  const turns = Math.floor(timerTurns.value ?? 0)
  if (props.targetToken && timerName.value.trim() && turns >= 1) {
    emit('add-timer', props.targetToken.id, timerName.value.trim(), turns)
  }
  emit('close')
}

function commitDamage() {
  if (props.targetToken && dmgValue.value !== null && dmgValue.value !== 0) {
    emit('apply-damage', props.targetToken.id, dmgValue.value)
  }
  emit('close')
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
})

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.open) emit('close')
}
</script>

<style scoped>
.ctx-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
}

.ctx-menu {
  position: fixed;
  z-index: var(--z-modal-top); /* must exceed backdrop's --z-modal so clicks reach buttons */
  min-width: 200px;
  background-color: var(--parch);
  background-image: var(--paper);
  background-blend-mode: multiply;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  padding: 4px 0;
}

.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
  white-space: nowrap;
}
.ctx-item:hover {
  background: rgba(28, 20, 16, 0.06);
}

.ctx-item--danger {
  color: var(--blood);
}
.ctx-item--danger:hover {
  background: rgba(139, 0, 0, 0.07);
}

.ctx-icon {
  flex-shrink: 0;
  opacity: 0.7;
}

.ctx-divider {
  height: 1px;
  background: var(--parch-line);
  margin: 4px 0;
}

/* ── Inline input rows ── */
.ctx-inline-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px 5px 14px;
}

.ctx-inline-icon {
  flex-shrink: 0;
}

.ctx-inline-label {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  opacity: 0.75;
  flex: 1;
  white-space: nowrap;
  display: flex;
  align-items: center;
  gap: 5px;
}

.ctx-hp-hint {
  font-size: 11px;
  opacity: 0.6;
  font-family: var(--font-mono);
}

.ctx-inline-input {
  width: 52px;
  padding: 3px 6px;
  background: rgba(0, 0, 0, 0.06);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--ink);
  text-align: center;
  outline: none;
  flex-shrink: 0;
}
.ctx-inline-input--text {
  flex: 1;
  flex-shrink: 1;
  min-width: 0;
  width: auto;
  text-align: left;
  font-family: var(--font-body);
}
.ctx-inline-input:focus {
  border-color: var(--gold);
  background: rgba(0, 0, 0, 0.04);
}
.ctx-inline-input::-webkit-inner-spin-button,
.ctx-inline-input::-webkit-outer-spin-button { opacity: 0.4; }

/* ── Quick condition chips ── */
.ctx-quick-conditions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 5px 14px;
}
.ctx-cond-chip {
  padding: 2px 7px;
  border-radius: 99px;
  border: 1px solid var(--parch-line);
  background: none;
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--ink-ghost);
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.ctx-cond-chip:hover { border-color: var(--gold); color: var(--ink); background: rgba(184,134,11,0.08); }
.ctx-cond-chip--active { border-color: var(--blood); color: var(--blood); background: rgba(139,0,0,0.07); }
.ctx-cond-chip--active:hover { background: rgba(139,0,0,0.12); }
</style>

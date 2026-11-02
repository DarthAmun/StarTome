<template>
  <Transition name="sbp-slide">
    <aside v-if="token" class="sbp" :aria-label="`Stat block: ${tokenName}`">
      <header class="sbp-head">
        <div class="sbp-title">
          <span class="sbp-name">{{ tokenName }}</span>
          <button class="sbp-close" title="Close" @click="emit('close')">✕</button>
        </div>
        <div class="sbp-stats">
          <span v-if="token.hpMax" class="sbp-hp" :style="{ color: hpColor(hpFraction) }">
            HP {{ token.hpCurrent ?? 0 }}/{{ token.hpMax }}<span v-if="token.tempHp" class="sbp-temp" title="Temporary HP"> +{{ token.tempHp }}</span>
          </span>
          <span v-if="token.ac !== null" class="sbp-ac">AC {{ token.ac }}</span>
          <span v-if="token.adjustment" class="sbp-adjust">{{ ADJUSTMENT_LABEL[token.adjustment] }}</span>
          <span v-if="token.isDead" class="sbp-dead">Defeated</span>
        </div>
        <div v-if="token.conditions.length" class="sbp-conds">
          <span
            v-for="c in token.conditions" :key="c.name" class="sbp-cond"
            :style="{ borderColor: c.color || getConditionColor(c.name) }"
            :title="c.hidden ? 'Hidden from players' : ''"
          >{{ c.value ? `${c.name} ${c.value}` : c.name }}{{ c.hidden ? ' ·' : '' }}</span>
        </div>
      </header>

      <div class="sbp-body">
        <template v-if="kind === 'rules'">
          <RulesStatBlock v-if="entry" :entity="entry" :game="game" />
          <p v-else-if="missing" class="sbp-hint">The linked stat block is missing from the compendium.</p>
        </template>

        <NpcCard v-else-if="kind === 'npc' && npc" :name="npc.name" :attrs="npc.attrs" />

        <template v-else-if="kind === 'playbuddy' && pbMirror">
          <p class="sbp-hint">Shared by {{ pbMirror.basic?.name ?? 'the player' }}'s Play Buddy, as of {{ formatAt(pbMirror.at) }}.</p>
          <dl v-if="pbMirror.defenses" class="sbp-defs">
            <div><dt>AC</dt><dd>{{ pbMirror.defenses.ac }}</dd></div>
            <div><dt>Fort</dt><dd>{{ signed(pbMirror.defenses.fort) }}</dd></div>
            <div><dt>Ref</dt><dd>{{ signed(pbMirror.defenses.ref) }}</dd></div>
            <div><dt>Will</dt><dd>{{ signed(pbMirror.defenses.will) }}</dd></div>
            <div><dt>Perception</dt><dd>{{ signed(pbMirror.defenses.perception) }}</dd></div>
            <div><dt>Speed</dt><dd>{{ pbMirror.defenses.speed }} ft</dd></div>
          </dl>
          <p v-else class="sbp-hint">The player doesn't share defenses.</p>
          <p v-if="pbMirror.basic" class="sbp-line">
            <b>HP</b> {{ pbMirror.basic.hp.value }}/{{ pbMirror.basic.hp.max }}<template v-if="pbMirror.basic.hp.temp"> +{{ pbMirror.basic.hp.temp }} temp</template>
          </p>
        </template>

        <div v-else class="sbp-empty">
          <p class="sbp-hint">This token has no stat block.</p>
          <button class="sbp-link-btn" @click="emit('link', token.id)">Link a stat block</button>
        </div>
      </div>
    </aside>
  </Transition>
</template>

<script setup lang="ts">
/**
 * The stat block of a token in the fight (COMBAT_PLAN.md §3), opened from the
 * turn order or the token menu. The header follows the token live: HP, temp
 * HP, AC and conditions. GM only.
 */
import { computed, shallowRef, watch } from 'vue'
import { getConditionColor, hpColor } from '~/composables/useConditions'
import { rulesGet } from '~/composables/useRules'
import type { CharacterMirror } from '~/partylink/port'
import { ADJUSTMENT_LABEL, applyAdjustment } from '~/rules/combat'
import { signed } from '~/rules/format'
import type { EncounterToken } from '~/stores/encounter'
import type { GameId } from '~/types/game'
import type { RulesEntity } from '~/types/rules'
import { statPanelKind } from '~/utils/statPanel'

const props = defineProps<{
  /** The token shown; null closes the panel. */
  token: EncounterToken | null
  game: GameId
  /** The campaign NPC the token stands for. */
  npc?: { name: string; attrs: Record<string, any> } | null
  /** Shared numbers of a Play Buddy-linked character. */
  pbMirror?: CharacterMirror | null
}>()

const emit = defineEmits<{
  close: []
  link: [tokenId: number]
}>()

const tokenName = computed(() => props.token ? props.token.label || props.token.name : '')
const hpFraction = computed(() => props.token?.hpMax ? Math.max(0, (props.token.hpCurrent ?? 0) / props.token.hpMax) : 1)
const kind = computed(() => props.token
  ? statPanelKind(props.token, { npc: !!props.npc, playBuddy: !!props.pbMirror })
  : 'none')

const entry = shallowRef<RulesEntity | null>(null)
const missing = computed(() => !!props.token?.linkedRulesId && !entry.value && loaded.value)
const loaded = shallowRef(false)

let run = 0
watch(() => [props.token?.linkedRulesId, props.token?.adjustment] as const, async ([id, adj]) => {
  const mine = ++run
  loaded.value = false
  if (!id) { entry.value = null; return }
  const e = await rulesGet(id)
  if (mine !== run) return
  entry.value = e ? applyAdjustment(e, adj) : null
  loaded.value = true
}, { immediate: true })

function formatAt(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' })
}
</script>

<style scoped>
.sbp {
  position: absolute; top: 0; right: 0; bottom: 0; width: min(380px, 100%); z-index: 31;
  display: flex; flex-direction: column;
  background-color: var(--parch); background-image: var(--paper); background-blend-mode: multiply;
  border-left: 1px solid var(--parch-line);
  box-shadow: -4px 0 24px rgba(28, 20, 16, 0.3);
}
.sbp-head { padding: 12px 16px 10px; border-bottom: 1px solid var(--parch-line); }
.sbp-title { display: flex; align-items: baseline; gap: 8px; }
.sbp-name { flex: 1; min-width: 0; font-family: var(--font-head); font-size: 15px; font-weight: 600; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sbp-close { background: none; border: none; font-size: 14px; color: var(--ink-ghost); cursor: pointer; padding: 2px 4px; line-height: 1; }
.sbp-close:hover { color: var(--blood); }
.sbp-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 4px; font-family: var(--font-mono); font-size: 12px; color: var(--ink-faded); }
.sbp-hp { font-weight: 600; }
.sbp-temp { color: #4a90d9; }
.sbp-adjust { font-style: italic; font-family: var(--font-body); }
.sbp-dead { color: var(--blood); font-family: var(--font-body); }
.sbp-conds { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 8px; }
.sbp-cond { font-size: 11px; padding: 1px 6px; border: 1px solid var(--parch-line); border-left-width: 3px; border-radius: 2px; color: var(--ink); }
.sbp-body { flex: 1; overflow-y: auto; padding: 14px 16px 24px; }
.sbp-hint { font-size: 12px; font-style: italic; color: var(--ink-ghost); margin: 0 0 8px; }
.sbp-line { font-size: 13px; color: var(--ink); }
.sbp-defs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 12px; margin: 0 0 10px; }
.sbp-defs div { display: flex; flex-direction: column; }
.sbp-defs dt { font-family: var(--font-head); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink-ghost); }
.sbp-defs dd { margin: 0; font-family: var(--font-mono); font-size: 14px; color: var(--ink); }
.sbp-empty { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.sbp-link-btn {
  font-family: var(--font-head); font-size: 10px; letter-spacing: 0.1em; text-transform: uppercase;
  padding: 5px 10px; border: 1px solid var(--gold); border-radius: 2px; background: rgba(184,134,11,0.08); color: var(--ink); cursor: pointer;
}
.sbp-slide-enter-active, .sbp-slide-leave-active { transition: transform 0.2s ease; }
.sbp-slide-enter-from, .sbp-slide-leave-to { transform: translateX(100%); }
</style>

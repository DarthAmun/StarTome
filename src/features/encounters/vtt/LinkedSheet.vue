<script setup lang="ts">
/** A linked player's shared numbers, where a stat block would be. Click one to ask their player to roll it. */
import { computed, ref } from 'vue'
import type { Token } from '@/data/encounters'
import { requestRoll } from '@/services/characterLink/link'
import { notify, reportError } from '@/ui/dialogs'
import { characterOfToken } from './linkLive'

const props = defineProps<{ token: Token }>()
const who = computed(() => characterOfToken(props.token))
const m = computed(() => who.value?.link?.mirror ?? null)
const secret = ref(false)
const dc = ref<number | null>(null)
const sign = (n: number) => (n >= 0 ? `+${n}` : String(n))
const title = (s: string) => s.replace(/-/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase())
const checks = computed(() => {
  const d = m.value?.defenses, s = m.value?.skills
  return [
    ...(d ? [['fortitude', 'Fort', d.fort], ['reflex', 'Ref', d.ref], ['will', 'Will', d.will], ['perception', 'Perception', d.perception]] as [string, string, number][] : []),
    ...Object.entries(s?.skills ?? {}).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [`skill:${k}`, title(k), v] as [string, string, number]),
  ]
})
async function ask(check: string, label: string) {
  if (!who.value) return
  try { await requestRoll(who.value, { check, label, ...(dc.value ? { dc: dc.value } : {}), ...(secret.value ? { secret: true } : {}) }); notify(`Asked ${who.value.name} to roll ${label}.`, 'ok', 2500) }
  catch (err) { reportError('Asking for the roll', err) }
}
</script>

<template>
  <div v-if="who && m" class="shared" data-test="linked-sheet">
    <span class="faint">From {{ who.name }}'s Play Buddy<template v-if="m.basic?.heroPoints != null"> · hero points {{ m.basic.heroPoints }}</template><template v-if="m.skills?.classDc"> · class DC {{ m.skills.classDc }}</template><template v-if="m.skills?.spellDc"> · spell DC {{ m.skills.spellDc }}</template></span>
    <span v-if="checks.length" class="checks">
      <button v-for="[check, label, mod] in checks" :key="check" class="chip" :title="`Ask ${who.name} to roll ${label}`" @click="ask(check, label)">{{ label }} <b class="num">{{ sign(mod) }}</b></button>
    </span>
    <span v-if="checks.length" class="opts faint">Click to ask for the roll · <input v-model.number="dc" class="input num" type="number" placeholder="DC" aria-label="DC of the roll" /> <label><input v-model="secret" type="checkbox" /> secret</label></span>
    <span v-else class="faint">They share neither defenses nor skills.</span>
  </div>
</template>

<style scoped>
.shared { flex-basis: 100%; display: flex; flex-direction: column; gap: .3rem; font-size: .85rem; }
.checks { display: flex; flex-wrap: wrap; gap: .2rem; max-height: 6.5rem; overflow: auto; } .checks .chip { background: none; cursor: pointer; } .checks .chip:hover { border-color: var(--accent); }
.opts { display: flex; align-items: center; gap: .4rem; } .opts .input { width: 4rem; padding: .1em .4em; }
</style>

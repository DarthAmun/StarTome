<script setup lang="ts">
/** "Roll this for me": asks one linked player, or all of them, for a check in their app; secretly if wanted. */
import { ref } from 'vue'
import type { Character } from '@/domain/schema'
import { requestRoll } from '@/services/characterLink/link'
import { notify, reportError } from '@/ui/dialogs'

const props = defineProps<{ characters: Character[] }>()

const who = ref('all')
const check = ref('perception')
const skill = ref('')
const dc = ref<number | null>(null)
const secret = ref(false)
const LABEL: Record<string, string> = { perception: 'Perception', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will', flat: 'Flat check' }

async function ask() {
  const slug = skill.value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (check.value === 'skill' && !slug) return
  if (check.value === 'flat' && !dc.value) { notify('A flat check needs a DC.'); return }
  const targets = props.characters.filter(c => who.value === 'all' || c.id === who.value)
  const what = { check: check.value === 'skill' ? `skill:${slug}` : check.value, label: check.value === 'skill' ? skill.value.trim() : LABEL[check.value] ?? check.value, ...(dc.value ? { dc: dc.value } : {}), ...(secret.value ? { secret: true } : {}) }
  try { for (const c of targets) await requestRoll(c, what); notify(`Asked ${targets.length === 1 ? targets[0]?.name : `${targets.length} players`} to roll ${what.label}.`, 'ok') }
  catch (err) { reportError('Asking for the roll', err) }
}
</script>

<template>
  <span class="ask" data-test="link-roll">
    <span class="faint">Ask</span>
    <select v-model="who" class="input" aria-label="Who rolls"><option value="all">everyone</option><option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option></select>
    <span class="faint">to roll</span>
    <select v-model="check" class="input" aria-label="Check"><option value="perception">Perception</option><option value="fortitude">Fortitude</option><option value="reflex">Reflex</option><option value="will">Will</option><option value="skill">a skill…</option><option value="flat">a flat check</option></select>
    <input v-if="check === 'skill'" v-model="skill" class="input skill" placeholder="Stealth, Warfare Lore…" aria-label="Skill" @keydown.enter="ask" />
    <input v-model.number="dc" class="input dc" type="number" min="0" placeholder="DC" aria-label="DC" @keydown.enter="ask" />
    <label class="faint" title="The player sees that they rolled, not the result"><input v-model="secret" type="checkbox" /> secret</label>
    <button class="btn" data-test="link-roll-ask" @click="ask">Ask</button>
  </span>
</template>

<style scoped>
.ask { display: inline-flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
.input { width: auto; } .dc { width: 4.5rem; } .skill { width: 11rem; }
</style>

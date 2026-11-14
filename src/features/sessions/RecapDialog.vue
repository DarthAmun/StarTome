<script setup lang="ts">
/** When a session starts: what the players should know from last time, to tick off as you tell it. */
import { ref } from 'vue'
import type { EntryOf, SessionPanel } from '@/domain/schema'
import { linkedCharacters } from '@/data/link'
import { patchPanel, sessions } from '@/data/sessions'
import { heroPointsForAll } from '@/services/characterLink/link'
import { notify, reportError } from '@/ui/dialogs'
import ProseText from '@/features/shared/ProseText.vue'
import AppDialog from '@/ui/components/AppDialog.vue'
import { useLive } from '@/ui/useLive'

const props = defineProps<{ session: EntryOf<'session'> }>()
const emit = defineEmits<{ close: [] }>()

/** The session before this one, and its panels marked "players should know" that were not told yet. */
const recap = useLive(async () => {
  const all = await sessions.ofCampaign(props.session.campaignId)
  const prev = all[all.findIndex(s => s.id === props.session.id) - 1]
  if (!prev) return { name: '', items: [] as SessionPanel[] }
  return { name: prev.name, items: (await sessions.panels(prev.id)).filter(p => p.attrs.playersShouldKnow && !p.attrs.told).sort((a, b) => String(a.attrs.at ?? '').localeCompare(String(b.attrs.at ?? ''))) }
}, { name: '', items: [] as SessionPanel[] })
/** Linked players (Play Buddy) and their hero points: a session starts with one each. */
const linked = useLive(() => linkedCharacters(props.session.campaignId), [])
const heroSent = ref(false)
async function heroPoints() {
  try { const n = await heroPointsForAll(props.session.campaignId); heroSent.value = true; notify(`Sent a hero point to ${n} ${n === 1 ? 'player' : 'players'}.`, 'ok') }
  catch (err) { reportError('Giving hero points', err) }
}
const told = ref(new Set<string>())
function toggle(id: string) { const s = new Set(told.value); if (s.has(id)) s.delete(id); else s.add(id); told.value = s }
async function done() {
  for (const p of recap.value.items) if (told.value.has(p.id)) await patchPanel(p.id, { attrs: { ...p.attrs, told: true } })
  emit('close')
}
</script>

<template>
  <AppDialog :title="`Recap · ${session.name}`" @close="emit('close')">
    <p v-if="recap.name" class="dim">From {{ recap.name }}: what the players should know.</p>
    <label v-for="p in recap.items" :key="p.id" class="item" :class="{ told: told.has(p.id) }">
      <input type="checkbox" :checked="told.has(p.id)" @change="toggle(p.id)" />
      <span><b v-if="p.title">{{ p.title }}</b><ProseText :text="p.body" :campaign-id="p.campaignId" /></span>
    </label>
    <p v-if="!recap.items.length" class="faint">{{ recap.name ? 'Nothing was marked for the players last time.' : 'This is the first session: nothing to recap.' }}</p>
    <p v-if="linked.length" class="hero">
      <span class="dim">Hero points: {{ linked.map(c => `${c.name} ${c.link?.mirror?.basic?.heroPoints ?? '?'}`).join(' · ') }}</span>
      <button class="btn" :disabled="heroSent" data-test="recap-hero" @click="heroPoints">{{ heroSent ? 'Sent' : 'One for everyone' }}</button>
    </p>
    <template #footer><button class="btn btn-primary" data-test="recap-done" @click="done">Start playing</button></template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; } .item { display: flex; gap: .6rem; align-items: flex-start; } .item.told { opacity: .55; } .hero { display: flex; align-items: center; gap: .6rem; margin-top: .4rem; }
</style>

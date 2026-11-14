<script setup lang="ts">
/**
 * The table bar: on top of every screen while a session of the open campaign
 * is running. Log what happened from anywhere (Alt+L puts the cursor here),
 * see the round and whose turn it is when an encounter is open, and the party.
 */
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import type { Character } from '@/domain/schema'
import { partyOf } from '@/data/party'
import { addLog, sessions } from '@/data/sessions'
import { live } from '@/features/encounters/vtt/live'
import { order, round } from '@/features/encounters/vtt/turns'
import { boardMemory } from '@/features/sessions/board'
import { notify, reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'
import { campaignId } from '@/ui/workbench'

const route = useRoute()
const session = useLive(() => (campaignId.value ? sessions.running(campaignId.value) : Promise.resolve(null)), null, [campaignId])
const party = useLive(() => (campaignId.value ? partyOf(campaignId.value) : Promise.resolve([])), [], [campaignId])
/** What a linked player shares (Play Buddy): HP, hero points and conditions ride along in the bar. */
const shared = (c: Character) => c.link?.mirror?.basic ?? null
const sharedTitle = (c: Character) => { const b = shared(c); return b ? `Level ${c.level} · ${b.hp.value}/${b.hp.max} HP${b.hp.temp ? ` +${b.hp.temp}` : ''}${b.heroPoints !== null ? ` · ${b.heroPoints} hero ${b.heroPoints === 1 ? 'point' : 'points'}` : ''}${b.conditions.length ? ` · ${b.conditions.map(k => `${k.name}${k.value ? ` ${k.value}` : ''}`).join(', ')}` : ''}` : '' }
const text = ref('')
const input = ref<HTMLInputElement | null>(null)
/** On the session's own board the capture bar there does the logging. */
const onBoard = computed(() => route.name === 'session' && route.params.sessionId === session.value?.id)
const fight = computed(() => (live.encounter?.status === 'active' && live.encounter.campaignId === campaignId.value ? { name: live.encounter.name, id: live.encounter.id, round: round.value, acting: order.value.find(t => t.id === live.activeId)?.name ?? null } : null))

async function log() {
  const s = session.value, body = text.value.trim()
  if (!s || !body) return
  try {
    // Onto the panel last selected on the board (the scene in play), else improvised
    const target = (await sessions.panels(s.id)).find(p => p.id === boardMemory(s.id).selectedId && p.kind !== 'log' && p.kind !== 'frame') ?? null
    await addLog(s, body, { attachTo: target })
    text.value = ''
    notify(target ? `Logged on “${target.title || target.kind}”.` : 'Logged.', 'ok', 2500)
  } catch (err) { reportError('Logging', err) }
}
function key(e: KeyboardEvent) { if (e.altKey && e.key.toLowerCase() === 'l' && session.value) { e.preventDefault(); input.value?.focus() } }
onMounted(() => window.addEventListener('keydown', key))
onUnmounted(() => window.removeEventListener('keydown', key))
</script>

<template>
  <div v-if="session" class="table-bar" data-test="table-bar">
    <RouterLink class="now" :to="{ name: 'session', params: { campaignId: session.campaignId, sessionId: session.id } }" title="Open the running session's board">● {{ session.name }}</RouterLink>
    <input v-if="!onBoard" ref="input" v-model="text" class="input" placeholder="What happened? Enter logs it (Alt+L)" aria-label="Log to the running session" @keydown.enter="log" />
    <span v-else class="grow" />
    <RouterLink v-if="fight" class="fight" :to="{ name: 'encounter', params: { campaignId: session.campaignId, encounterId: fight.id } }">{{ fight.name }} · round <b class="num">{{ fight.round }}</b><template v-if="fight.acting"> · {{ fight.acting }}</template></RouterLink>
    <span class="party"><span v-for="c in party" :key="c.id" class="chip" :title="shared(c) ? sharedTitle(c) : `${c.role === 'pc' ? 'Level' : 'Companion, level'} ${c.level}`">{{ c.name }} <b class="num">{{ c.level }}</b><template v-if="shared(c)"> <span class="num hp" :class="{ low: shared(c)!.hp.value * 2 <= shared(c)!.hp.max }">{{ shared(c)!.hp.value }}/{{ shared(c)!.hp.max }}</span><span v-if="shared(c)!.heroPoints !== null" class="hero" title="Hero points"> {{ '●'.repeat(shared(c)!.heroPoints ?? 0) }}</span><span v-if="shared(c)!.conditions.length" class="cond"> {{ shared(c)!.conditions.length }}!</span></template></span></span>
  </div>
</template>

<style scoped>
.table-bar { grid-column: 2 / -1; grid-row: 2; display: flex; align-items: center; gap: .7rem; padding: .25rem 1rem; border-bottom: var(--frame); background: color-mix(in srgb, var(--accent) 7%, var(--bg-sunken)); min-width: 0; }
.now { color: var(--accent); white-space: nowrap; font-family: var(--font-title); font-size: .9rem; } .input { flex: 1; max-width: 40rem; padding: .25em .6em; } .grow { flex: 1; }
.fight { white-space: nowrap; color: var(--text); } .party { display: flex; gap: .3rem; overflow: hidden; margin-left: auto; } .party .chip { white-space: nowrap; } .hp { color: var(--text-dim); } .hp.low, .cond { color: var(--warn); } .hero { color: var(--accent); letter-spacing: -.1em; }
</style>

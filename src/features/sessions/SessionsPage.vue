<script setup lang="ts">
/** The campaign's sessions: open a board, start a new session, or read the log of all of them. */
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Trash2 } from 'lucide-vue-next'
import { logsInOrder, LOG_TYPE_COLORS, type LogType } from '@/domain/rules/sessionBoard'
import type { EntryOf } from '@/domain/schema'
import { deleteEntry } from '@/data/entries'
import { createSession, sessions } from '@/data/sessions'
import ProseText from '@/features/shared/ProseText.vue'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'

const props = defineProps<{ campaignId: string }>()
const router = useRouter()
const MODE = { planning: 'In preparation', running: 'Running', finished: 'Played' } as const
const view = ref<'list' | 'log'>('list')
const open = ref(new Set<string>())

const rows = useLive(async () => {
  const list = [...await sessions.ofCampaign(props.campaignId)].reverse()
  return Promise.all(list.map(async (s) => {
    const panels = await sessions.panels(s.id)
    return { s, panels, logs: logsInOrder(panels, await sessions.edges(s.id)), plan: panels.filter(p => p.kind === 'scene' || p.kind === 'beat' || p.kind === 'clue' || p.kind === 'encounter') }
  }))
}, [], [() => props.campaignId])

const go = (id: string) => router.push({ name: 'session', params: { campaignId: props.campaignId, sessionId: id } })
const create = () => createSession(props.campaignId).then(s => go(s.id)).catch(err => reportError('Creating the session', err))
async function remove(s: EntryOf<'session'>) {
  if (await confirmDialog({ title: `Delete “${s.name}”?`, body: 'The session and its board are deleted. Panels in the drawer stay.', confirmLabel: 'Delete', danger: true })) await deleteEntry(s.id).catch(err => reportError('Deleting the session', err))
}
function toggle(id: string) { const n = new Set(open.value); if (n.has(id)) n.delete(id); else n.add(id); open.value = n }
const time = (at: unknown) => (typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : '')
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Sessions</h1><button class="btn btn-primary" data-test="new-session" @click="create"><Plus :size="15" /> New session</button></div>
    <nav class="tabs"><button :class="{ on: view === 'list' }" @click="view = 'list'">Sessions</button><button :class="{ on: view === 'log' }" data-test="session-log-tab" @click="view = 'log'">Session log</button></nav>

    <ul v-if="view === 'list'" class="list" data-test="session-list">
      <li v-for="{ s, panels, logs } in rows" :key="s.id" class="panel" :data-session="s.name">
        <button class="main" @click="go(s.id)">
          <span class="num n">{{ s.data.number || '–' }}</span><b>{{ s.name }}</b><span class="chip" :class="s.data.mode">{{ MODE[s.data.mode] }}</span>
          <span class="faint">{{ [s.data.date, `${panels.filter(p => p.kind !== 'frame' && p.kind !== 'log').length} panels`, logs.length ? `${logs.length} logged` : ''].filter(Boolean).join(' · ') }}</span>
        </button>
        <button class="btn btn-icon btn-danger" :aria-label="`Delete ${s.name}`" @click="remove(s)"><Trash2 :size="14" /></button>
      </li>
    </ul>

    <div v-else class="log" data-test="session-log">
      <section v-for="{ s, logs, plan } in rows" :key="s.id" class="panel">
        <header @click="toggle(s.id)"><b>{{ s.name }}</b><span class="faint">{{ [s.data.date, MODE[s.data.mode], `${logs.length} logged`].filter(Boolean).join(' · ') }}</span><span class="grow" /><button class="btn btn-ghost" @click.stop="go(s.id)">Open board</button></header>
        <template v-if="!open.has(s.id)">
          <ol>
            <li v-for="{ log, attachedTo } in logs" :key="log.id">
              <span class="when faint">{{ time(log.attrs.at) }}</span>
              <i class="dot" :style="{ background: LOG_TYPE_COLORS[(log.attrs.logType as LogType) ?? 'happened'] }" :title="String(log.attrs.logType ?? 'happened')" />
              <div><ProseText :text="log.body" :campaign-id="campaignId" /><small v-if="attachedTo.length" class="faint">on {{ attachedTo.map(p => p.title || p.kind).join(', ') }}</small></div>
            </li>
          </ol>
          <p v-if="!logs.length" class="faint">Nothing logged.</p>
          <p v-if="plan.length" class="faint plan">Plan: <span v-for="p in plan" :key="p.id" :class="p.status ?? ''">{{ p.title || p.kind }}</span></p>
        </template>
      </section>
    </div>
    <p v-if="!rows.length" class="empty">No sessions yet. A session is a board: scenes to plan, and a log of what happened.</p>
  </div>
</template>

<style scoped>
.tabs { display: flex; gap: .2rem; margin-bottom: 1.1rem; border-bottom: var(--frame); } .tabs button { background: none; border: 0; padding: .4rem .9rem; color: var(--text-dim); border-bottom: 2px solid transparent; margin-bottom: -1px; } .tabs button.on { color: var(--accent); border-bottom-color: var(--accent); }
.list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .4rem; } .list li { display: flex; align-items: center; gap: .4rem; padding: .3rem .5rem; }
.main { flex: 1; display: flex; align-items: baseline; gap: .7rem; background: none; border: 0; text-align: left; padding: .35rem .3rem; min-width: 0; } .main:hover b { color: var(--accent); } .n { color: var(--accent); width: 2rem; text-align: right; }
.chip.running { color: var(--accent); border-color: var(--accent); } .chip.finished { color: var(--text-faint); }
.log { display: flex; flex-direction: column; gap: .7rem; } .log section { padding: .6rem .9rem; } .log header { display: flex; gap: .8rem; align-items: baseline; cursor: pointer; } .grow { flex: 1; }
ol { list-style: none; margin: .5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; } ol li { display: grid; grid-template-columns: 3.2rem 10px 1fr; gap: .5rem; align-items: baseline; }
.dot { width: 8px; height: 8px; border-radius: 50%; } .when { font-size: .78rem; text-align: right; } p { margin: .4rem 0 0; }
.plan span { margin-right: .6rem; } .plan .played, .plan .done, .plan .revealed { color: var(--text-dim); } .plan .skipped { text-decoration: line-through; }
</style>

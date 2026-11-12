<script setup lang="ts">
/**
 * The command bar (Ctrl+K): go anywhere, find any entry or compendium entry.
 * Enter opens an entry in the dock, so a lookup never leaves the screen you
 * are on; Shift+Enter opens its page.
 */
import MiniSearch from 'minisearch'
import { computed, nextTick, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search } from 'lucide-vue-next'
import { parseCommand } from '@/domain/commands'
import { evaluateFormula } from '@/domain/formula'
import type { Entry } from '@/domain/schema'
import { createEntry, deleteEntry, saveEntry } from '@/data/entries'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { entries as entryRepo, rulesByPrefix } from '@/data/repo'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { campaign, campaignId, campaigns, closePeek, commandBarOpen, dock, patchSettings, peek } from '@/ui/workbench'
import { PLACES, UTILITIES } from './places'

interface Hit { key: string; group: string; label: string; sub: string; color: string; run: (full: boolean) => void }

const router = useRouter()
const dialog = ref<HTMLDialogElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const query = ref('')
const cursor = ref(0)
const rules = ref<{ id: string; name: string; kind: string; level: number }[]>([])
let index: MiniSearch<Entry> | null = null
const byId = shallowRef(new Map<string, Entry>())

watch(commandBarOpen, async (open) => {
  if (!open) { dialog.value?.close(); return }
  query.value = ''; cursor.value = 0; rules.value = []
  dialog.value?.showModal()
  await nextTick()
  input.value?.focus()
  // Built when the bar opens: a few hundred entries index in milliseconds, and it is never stale
  const list = campaignId.value ? await entryRepo.ofCampaign(campaignId.value) : []
  byId.value = new Map(list.map(e => [e.id, e]))
  index = new MiniSearch<Entry>({ fields: ['name', 'tags', 'body'], extractField: (doc, field) => (field === 'tags' ? doc.tags.join(' ') : String(doc[field as 'name' | 'body'] ?? '')) })
  index.addAll(list)
})

watch(query, async (q) => {
  cursor.value = 0
  rules.value = await rulesByPrefix(q, 8)
})

/** The entry open in the dock: what rename, append, delete and favourite act on. */
const docked = computed(() => { const t = dock.open ? dock.stack[dock.active] : undefined; return t?.kind === 'entry' ? byId.value.get(t.id) ?? null : null })

/** A typed command, as the first thing offered. */
function commandHit(): Hit | null {
  const cmd = parseCommand(query.value)
  if (!cmd) return null
  const hit = (label: string, sub: string, run: () => void | Promise<unknown>): Hit => ({ key: `cmd:${cmd.kind}`, group: 'Do', label, sub, color: 'var(--accent-2)', run: () => { void Promise.resolve(run()).catch(err => reportError(label, err)) } })
  const e = docked.value
  switch (cmd.kind) {
    case 'new': return campaignId.value ? hit(`New ${ENTRY_TYPE_INFO[cmd.type].label}${cmd.name ? `: ${cmd.name}` : ''}`, 'creates it and opens it beside', async () => { peek({ kind: 'entry', id: (await createEntry(campaignId.value ?? '', cmd.type, cmd.name || undefined)).id }) }) : null
    case 'roll': return hit(`Roll ${cmd.expr}`, 'dice', () => { try { notify(`${cmd.expr} → ${evaluateFormula(cmd.expr)}`, 'ok', 12000) } catch { notify(`“${cmd.expr}” is not a dice expression.`, 'error') } })
    case 'mode': return hit(`${cmd.mode === 'light' ? 'Light' : 'Dark'} mode`, 'settings', () => patchSettings({ mode: cmd.mode }))
    case 'rename': return e ? hit(`Rename “${e.name}” to “${cmd.name}”`, 'texts that name it are rewritten', () => saveEntry(e.id, { name: cmd.name })) : null
    case 'append': return e ? hit(`Add to “${e.name}”`, cmd.text, () => saveEntry(e.id, { body: `${e.body.trimEnd()}${e.body.trim() ? '\n\n' : ''}${cmd.text}` })) : null
    case 'favorite': return e ? hit(`${e.favorite ? 'Remove' : 'Add'} “${e.name}” ${e.favorite ? 'from' : 'to'} favourites`, '', () => saveEntry(e.id, { favorite: !e.favorite })) : null
    case 'delete': return e ? hit(`Delete “${e.name}”…`, 'asks first', async () => {
      if (!await confirmDialog({ title: `Delete “${e.name}”?`, body: 'The entry, its history and its pins are removed.', confirmLabel: 'Delete', danger: true })) return
      await deleteEntry(e.id)
      const at = dock.stack.findIndex(t => t.kind === 'entry' && t.id === e.id)
      if (at >= 0) closePeek(at)
    }) : null
  }
}

const hits = computed<Hit[]>(() => {
  const q = query.value.trim().toLowerCase()
  const out: Hit[] = []
  const cmd = commandHit()
  if (cmd) out.push(cmd)
  const go = (name: string, needsCampaign: boolean) => () => {
    if (needsCampaign && !campaignId.value) return
    void router.push(needsCampaign ? { name, params: { campaignId: campaignId.value } } : { name })
  }
  for (const p of [...PLACES, ...UTILITIES]) {
    if (p.campaign && !campaignId.value) continue
    if (!q || p.label.toLowerCase().includes(q) || p.aliases.some(a => a.startsWith(q))) {
      out.push({ key: `place:${p.name}`, group: 'Go to', label: p.label, sub: p.phase ? `phase ${p.phase}` : p.holds, color: 'var(--accent)', run: go(p.name, p.campaign) })
    }
  }
  if (q && index) {
    for (const r of index.search(q, { prefix: true, fuzzy: 0.2, boost: { name: 4, tags: 2 } }).slice(0, 12)) {
      const e = byId.value.get(String(r.id))
      if (!e) continue
      const info = ENTRY_TYPE_INFO[e.type]
      out.push({
        key: `entry:${e.id}`, group: campaign.value?.name ?? 'Entries', label: e.name, sub: info.label, color: info.color,
        run: full => (full ? void router.push({ name: 'entry', params: { campaignId: e.campaignId, entryId: e.id } }) : peek({ kind: 'entry', id: e.id })),
      })
    }
    for (const r of rules.value) out.push({ key: `rules:${r.id}`, group: 'Compendium', label: r.name, sub: `${r.kind} ${r.level}`, color: 'var(--accent-2)', run: () => peek({ kind: 'rules', id: r.id }) })
  }
  for (const c of campaigns.value) {
    if (c.id !== campaignId.value && (!q || c.name.toLowerCase().includes(q))) {
      out.push({ key: `camp:${c.id}`, group: 'Switch campaign', label: c.name, sub: c.game === 'sf2e' ? 'Starfinder 2e' : 'Pathfinder 2e', color: 'var(--text-dim)', run: () => void router.push({ name: 'tonight', params: { campaignId: c.id } }) })
    }
  }
  return q ? out : out.slice(0, 14)
})

function choose(hit: Hit | undefined, full: boolean) {
  if (!hit) return
  commandBarOpen.value = false
  hit.run(full)
}

function onKey(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') { e.preventDefault(); cursor.value = Math.min(hits.value.length - 1, cursor.value + 1) }
  else if (e.key === 'ArrowUp') { e.preventDefault(); cursor.value = Math.max(0, cursor.value - 1) }
  else if (e.key === 'Enter') { e.preventDefault(); choose(hits.value[cursor.value], e.shiftKey) }
  else return
  document.querySelector(`[data-hit="${cursor.value}"]`)?.scrollIntoView({ block: 'nearest' })
}
</script>

<template>
  <dialog ref="dialog" class="bar" @close="commandBarOpen = false" @click.self="commandBarOpen = false">
    <label class="field">
      <Search :size="17" />
      <input ref="input" v-model="query" placeholder="Go to a place, find an entry, look up a rule…" title="Also: new npc Name · roll 2d6+3 · rename … · append … · favourite · delete · light · dark" autocomplete="off" spellcheck="false" @keydown="onKey" />
      <span class="kbd">Esc</span>
    </label>
    <div class="hits">
      <template v-for="(h, i) in hits" :key="h.key">
        <div v-if="i === 0 || hits[i - 1]?.group !== h.group" class="eyebrow group">{{ h.group }}</div>
        <button class="hit" :class="{ on: i === cursor }" :data-hit="i" @mousemove="cursor = i" @click="choose(h, $event.shiftKey)">
          <span class="dot" :style="{ background: h.color }" /><span class="label">{{ h.label }}</span><span class="sub faint">{{ h.sub }}</span>
        </button>
      </template>
      <p v-if="!hits.length" class="empty">Nothing found for “{{ query }}”.</p>
    </div>
    <footer class="faint"><span class="kbd">Enter</span> opens beside your work · <span class="kbd">Shift</span>+<span class="kbd">Enter</span> opens the page · commands: <code>new npc Name</code>, <code>roll 2d6</code>, <code>rename …</code>, <code>append …</code>, <code>favourite</code>, <code>delete</code></footer>
  </dialog>
</template>

<style scoped>
.bar { width: min(660px, 92vw); margin-top: 12vh; padding: 0; border: 1px solid var(--line-strong); border-radius: var(--radius); background: var(--bg-raised); color: var(--text); box-shadow: var(--shadow); }
.bar::backdrop { background: rgb(0 0 0 / .5); }
.field { display: flex; align-items: center; gap: .7rem; padding: .85rem 1rem; border-bottom: var(--frame); color: var(--text-faint); }
.field input { flex: 1; background: none; border: 0; outline: none; font-size: 1.1rem; color: var(--text); }
.hits { max-height: 52vh; overflow: auto; padding: .3rem 0; }
.group { padding: .7rem 1rem .25rem; }
.hit { font-family: var(--font-ui); text-transform: none; letter-spacing: 0; display: grid; grid-template-columns: 10px 1fr auto; align-items: center; gap: .7rem; width: 100%; padding: .42rem 1rem; background: none; border: 0; text-align: left; }
.hit.on { background: var(--accent-soft); }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sub { font-size: .82rem; max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
footer { padding: .5rem 1rem; border-top: var(--frame); font-size: .8rem; }
footer code { font-family: var(--font-mono); color: var(--text-dim); }
</style>

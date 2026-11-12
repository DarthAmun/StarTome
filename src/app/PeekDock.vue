<script setup lang="ts">
/** The peek dock: entries and stat blocks open here, beside what you are doing. */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { Maximize2, Pin, PinOff, X } from 'lucide-vue-next'
import { entries, getRow } from '@/data/repo'
import EntryView from '@/features/world/EntryView.vue'
import RulesPeek from '@/features/world/RulesPeek.vue'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { useLive } from '@/ui/useLive'
import { closeDock, closePeek, dock, isPinned, togglePin, type PeekTarget } from '@/ui/workbench'

const router = useRouter()
const current = computed<PeekTarget | undefined>(() => dock.stack[dock.active])

/** Names for the tabs. */
const titles = useLive(async () => {
  const out: { label: string; type: string; color: string }[] = []
  for (const t of dock.stack) {
    if (t.kind === 'entry') {
      const e = await entries.get(t.id)
      out.push({ label: e?.name ?? 'Gone', type: e?.type ?? '', color: e ? ENTRY_TYPE_INFO[e.type].color : 'var(--text-faint)' })
    } else {
      const r = await getRow('rules', t.id)
      out.push({ label: r?.name ?? 'Gone', type: r?.kind ?? '', color: 'var(--accent-2)' })
    }
  }
  return out
}, [], [() => dock.stack.map(t => t.id).join('|')])

function pinCurrent() {
  const t = current.value, title = titles.value[dock.active]
  if (t && title) void togglePin({ ...t, label: title.label, type: title.type })
}

function openFull() {
  const t = current.value
  if (t?.kind !== 'entry') return
  void entries.get(t.id).then((e) => { if (e) void router.push({ name: 'entry', params: { campaignId: e.campaignId, entryId: e.id } }) })
}
</script>

<template>
  <aside v-if="dock.open && current" class="dock" aria-label="Peek">
    <div class="tabs">
      <button v-for="(t, i) in dock.stack" :key="`${t.kind}:${t.id}`" class="tab" :class="{ on: i === dock.active }" :style="{ '--c': titles[i]?.color }" @click="dock.active = i" @auxclick.middle="closePeek(i)">
        <span class="tab-label">{{ titles[i]?.label ?? '…' }}</span>
        <X :size="12" class="tab-x" @click.stop="closePeek(i)" />
      </button>
      <span class="grow" />
      <button class="btn btn-ghost btn-icon" :title="isPinned(current) ? 'Unpin from the tray' : 'Pin to the tray'" @click="pinCurrent"><component :is="isPinned(current) ? PinOff : Pin" :size="15" /></button>
      <button v-if="current.kind === 'entry'" class="btn btn-ghost btn-icon" title="Open as a page" @click="openFull"><Maximize2 :size="15" /></button>
      <button class="btn btn-ghost btn-icon" title="Close the dock (Esc)" @click="closeDock"><X :size="16" /></button>
    </div>
    <div class="body">
      <EntryView v-if="current.kind === 'entry'" :key="current.id" :entry-id="current.id" />
      <RulesPeek v-else :key="current.id" :rules-id="current.id" />
    </div>
  </aside>
</template>

<style scoped>
.dock { width: var(--dock-w); display: flex; flex-direction: column; border-left: 1px solid var(--line-strong); background: var(--bg-raised); min-height: 0; box-shadow: -12px 0 30px rgb(0 0 0 / .25); }
.tabs { display: flex; align-items: center; gap: 2px; padding: .3rem .3rem 0 .4rem; border-bottom: var(--frame); background: var(--bg-sunken); overflow-x: auto; }
.tab { display: flex; align-items: center; gap: .4rem; max-width: 150px; padding: .35rem .5rem; background: none; border: 0; border-bottom: 2px solid transparent; color: var(--text-faint); }
.tab.on { color: var(--text); border-bottom-color: var(--c, var(--accent)); background: var(--bg-raised); }
.tab-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.tab-x { opacity: .5; flex: none; } .tab-x:hover { opacity: 1; }
.grow { flex: 1; }
.body { flex: 1; overflow: auto; }
</style>

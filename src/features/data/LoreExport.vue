<script setup lang="ts">
/** Exports of a campaign's lore for other tools: Markdown as a folder or as one file, and the players' quest board. */
import { ref } from 'vue'
import { FileDown } from 'lucide-vue-next'
import { exportMarkdownFolder, exportQuestBoard, exportSingleMarkdown, type ExportFile } from '@/services/loreExport'
import { reportError } from '@/ui/dialogs'
import { campaign } from '@/ui/workbench'

const target = ref<'folder' | 'single'>('single')
const gm = ref(true)
const busy = ref(false)

async function run(work: (id: string) => Promise<ExportFile>) {
  const c = campaign.value
  if (!c || busy.value) return
  busy.value = true
  try {
    const file = await work(c.id)
    const url = URL.createObjectURL(file.blob)
    const a = document.createElement('a')
    a.href = url; a.download = file.name; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (err) { reportError('Exporting', err) } finally { busy.value = false }
}
</script>

<template>
  <section class="panel block">
    <h2>Export the lore of “{{ campaign?.name ?? 'no campaign open' }}”</h2>
    <p class="dim">For reading elsewhere, not for restoring: use a backup for that.</p>
    <div class="actions">
      <select v-model="target" class="input pick" aria-label="Export as"><option value="single">One Markdown file (for a Claude project)</option><option value="folder">A folder of Markdown files (zip)</option></select>
      <label class="check"><input v-model="gm" type="checkbox" /> Include GM-only blocks</label>
      <button class="btn btn-primary" :disabled="!campaign || busy" @click="run(id => (target === 'single' ? exportSingleMarkdown(id, gm) : exportMarkdownFolder(id, gm)))"><FileDown :size="15" /> Export</button>
    </div>
    <div class="actions">
      <button class="btn" :disabled="!campaign || busy" @click="run(exportQuestBoard)">Quest board for players (JSON)</button>
      <span class="faint">Quests without GM-only text; items named in rewards are looked up in the compendium.</span>
    </div>
  </section>
</template>

<style scoped>
.block { max-width: 900px; padding: 1.2rem 1.4rem; margin-bottom: 1rem; }
.block h2 { margin-bottom: .5rem; }
.actions { display: flex; flex-wrap: wrap; gap: .6rem; align-items: center; margin: .6rem 0; }
.pick { width: auto; }
.check { display: flex; gap: .4rem; align-items: center; }
</style>

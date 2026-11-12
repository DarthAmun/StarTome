<script setup lang="ts">
/**
 * Import & Backup: bring the v0.42 data over, write and restore backups, and
 * set the backup folder. Everything here runs in one step and leaves the
 * database untouched when it fails.
 */
import { onMounted, ref } from 'vue'
import { Download, FolderOpen, HardDriveUpload, Trash2 } from 'lucide-vue-next'
import { countRows, wipeDatabase } from '@/data/snapshot'
import { BackupError, backupFileName, exportBackupBlob, importBackup } from '@/services/backup'
import { backupFolderState, backupFolderSupported, backupToFolder, chooseBackupFolder, forgetBackupFolder, type FolderState } from '@/services/backup/folder'
import { importLegacyFile, importLegacyFromBrowser, legacyDbExists, type LegacyImportResult } from '@/services/v042/import'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { campaign } from '@/ui/workbench'
import LoreExport from './LoreExport.vue'

const emit = defineEmits<{ changed: [] }>()
const version = __APP_VERSION__

const busy = ref<string | null>(null)
const counts = ref<Record<string, number>>({})
const oldDbHere = ref(false)
const legacy = ref<LegacyImportResult | null>(null)
const folder = ref<FolderState>({ name: null, permission: null, lastBackupAt: null })

async function refresh() {
  counts.value = await countRows()
  folder.value = await backupFolderState()
  oldDbHere.value = await legacyDbExists()
}
onMounted(refresh)

async function run<T>(label: string, work: () => Promise<T>): Promise<T | undefined> {
  if (busy.value) return undefined
  busy.value = label
  try { return await work() } catch (err) {
    if (err instanceof BackupError) notify(err.message, 'error')
    else reportError(label, err)
    return undefined
  } finally {
    busy.value = null
    await refresh()
    emit('changed')
  }
}

const hasData = () => (counts.value.campaigns ?? 0) > 0
const replaceWarning = 'Everything in this app is replaced by what is imported. The source is not changed.'

async function legacyFromBrowser() {
  if (hasData() && !await confirmDialog({ title: 'Import from v0.42 in this browser?', body: replaceWarning, confirmLabel: 'Replace and import', danger: true })) return
  legacy.value = await run('Importing from v0.42', () => importLegacyFromBrowser(step => { busy.value = step })) ?? legacy.value
}

async function onFile(file: File) {
  const isZip = /\.zip$/i.test(file.name)
  if (!isZip) {
    if (hasData() && !await confirmDialog({ title: `Import ${file.name}?`, body: replaceWarning, confirmLabel: 'Replace and import', danger: true })) return
    legacy.value = await run('Importing the v0.42 file', () => importLegacyFile(file, step => { busy.value = step })) ?? legacy.value
    return
  }
  const restore = await confirmDialog({ title: `Restore ${file.name}?`, body: 'Restore replaces everything here with the backup (your synced compendium stays). Cancel, then use “Add campaigns” to put its campaigns beside what is here instead.', confirmLabel: 'Restore', danger: true })
  if (!restore) return
  const result = await run('Restoring the backup', () => importBackup(file, 'restore'))
  if (result) notify(`Restored: ${result.written.campaigns ?? 0} campaigns, ${result.written.entries ?? 0} entries, ${result.written.images ?? 0} images.`, 'ok')
}

async function addFrom(file: File) {
  const result = await run('Adding campaigns', () => importBackup(file, 'add'))
  if (result) notify(`Added ${result.written.campaigns ?? 0} campaign(s); ${Object.values(result.skipped).reduce((a, b) => a + b, 0)} rows were here already.`, 'ok')
}

function pick(handler: (f: File) => void, accept: string) {
  const input = document.createElement('input')
  input.type = 'file'; input.accept = accept
  input.onchange = () => { const f = input.files?.[0]; if (f) handler(f) }
  input.click()
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

async function exportAll() {
  const out = await run('Writing the backup', () => exportBackupBlob({ appVersion: version }))
  if (out) download(out.blob, backupFileName(out.manifest))
}

async function exportCampaign() {
  const c = campaign.value
  if (!c) return
  const out = await run('Writing the campaign file', () => exportBackupBlob({ appVersion: version, campaignIds: [c.id] }))
  if (out) download(out.blob, backupFileName(out.manifest, c.name))
}

async function chooseFolder() {
  const name = await run('Choosing the folder', chooseBackupFolder)
  if (name) notify(`Backups go to “${name}”.`, 'ok')
}

async function backupNow() {
  const out = await run('Backing up to the folder', () => backupToFolder(version, true))
  if (out && 'file' in out) notify(`Backup written: ${out.file}`, 'ok')
  else if (out) notify(out.skipped === 'no-folder' ? 'Choose a backup folder first.' : 'The browser did not allow writing to the folder.', 'error')
}

async function wipe() {
  if (!await confirmDialog({ title: 'Wipe this app’s data?', body: 'Every campaign, entry, image and compendium entry in the rework app is deleted. v0.42 and its data are not touched. This cannot be undone.', confirmLabel: 'Wipe everything', danger: true })) return
  await run('Wiping', wipeDatabase)
  legacy.value = null
}

function onDrop(e: DragEvent) {
  const f = e.dataTransfer?.files[0]
  if (f) void onFile(f)
}

const SHOWN = ['campaigns', 'entries', 'encounters', 'combatants', 'characters', 'inventory', 'sessionPanels', 'rules', 'images'] as const
</script>

<template>
  <div class="page" @dragover.prevent @drop.prevent="onDrop">
    <div class="page-head"><h1>Import &amp; Backup</h1><span v-if="busy" class="chip busy">{{ busy }}…</span></div>

    <section class="panel block">
      <h2>Bring your data over from v0.42</h2>
      <p class="dim">Reads everything from the old app and replaces what is here. The old app and its data stay exactly as they are, so you can repeat this whenever you want to try the rework with current data.</p>
      <div class="actions">
        <button class="btn btn-primary" :disabled="!oldDbHere || !!busy" @click="legacyFromBrowser"><HardDriveUpload :size="15" /> Import from v0.42 in this browser</button>
        <button class="btn" :disabled="!!busy" @click="pick(onFile, '.json,application/json')">From a v0.42 backup file…</button>
      </div>
      <p v-if="!oldDbHere" class="faint">No v0.42 database in this browser at this address. Use a backup file (v0.42 › Import &amp; Export › Full Backup), or drop it anywhere on this page.</p>
      <div v-if="legacy" class="report">
        <div class="eyebrow">Last import</div>
        <table>
          <tr v-for="(t, name) in legacy.report.tables" :key="name"><td>{{ name }}</td><td class="num">{{ t.converted }}</td><td class="num" :class="{ warn: t.dropped }">{{ t.dropped ? `${t.dropped} left out` : '' }}</td></tr>
          <tr><td>images</td><td class="num">{{ legacy.written.images }}</td><td class="num" :class="{ warn: legacy.missingImages }">{{ legacy.missingImages ? `${legacy.missingImages} missing` : '' }}</td></tr>
        </table>
        <p v-if="legacy.dangling.length" class="warn">{{ legacy.dangling.length }} references point at nothing. Please report this: {{ legacy.dangling.slice(0, 3).join('; ') }}</p>
        <details v-if="legacy.report.notes.length"><summary>{{ legacy.report.notes.length }} notes</summary><ul><li v-for="(n, i) in legacy.report.notes" :key="i">{{ n }}</li></ul></details>
        <p v-else class="faint">Nothing had to be repaired or left out.</p>
      </div>
    </section>

    <section class="panel block">
      <h2>Backup</h2>
      <p class="dim">A backup is one <code>.startome.zip</code>: your campaigns, own compendium entries, layouts, settings and every image as a file. The synced Foundry compendium is not in it; sync again after restoring on a new device.</p>
      <div class="actions">
        <button class="btn btn-primary" :disabled="!!busy" @click="exportAll"><Download :size="15" /> Download a full backup</button>
        <button class="btn" :disabled="!campaign || !!busy" @click="exportCampaign">Only “{{ campaign?.name ?? 'this campaign' }}”</button>
        <button class="btn" :disabled="!!busy" @click="pick(onFile, '.zip,application/zip')">Restore a backup…</button>
        <button class="btn" :disabled="!!busy" @click="pick(addFrom, '.zip,application/zip')">Add campaigns from a file…</button>
      </div>
      <hr class="rule" />
      <h3>Backup folder</h3>
      <template v-if="backupFolderSupported()">
        <p class="dim">Pick a folder once. The app then writes a full backup there when the last one is more than a day old, and keeps the newest three. That is your copy if the browser's storage is ever cleared, and what you carry to a new laptop.</p>
        <p v-if="folder.name">Folder: <strong>{{ folder.name }}</strong>
          <span v-if="folder.permission !== 'granted'" class="warn"> · the browser asks for permission again on the next “Back up now”</span>
        </p>
        <p class="faint">Last full backup: {{ folder.lastBackupAt ? new Date(folder.lastBackupAt).toLocaleString() : 'never' }}</p>
        <div class="actions">
          <button class="btn" :disabled="!!busy" @click="chooseFolder"><FolderOpen :size="15" /> {{ folder.name ? 'Change folder' : 'Choose a folder' }}</button>
          <button class="btn" :disabled="!folder.name || !!busy" @click="backupNow">Back up now</button>
          <button v-if="folder.name" class="btn btn-ghost" :disabled="!!busy" @click="forgetBackupFolder().then(refresh)">Stop using it</button>
        </div>
      </template>
      <p v-else class="faint">This browser cannot write to a folder by itself (it needs Chrome or another Chromium browser). Use “Download a full backup”.</p>
    </section>

    <LoreExport />

    <section class="panel block">
      <h2>In this app now</h2>
      <div class="stats"><div v-for="k in SHOWN" :key="k"><span class="num">{{ (counts[k] ?? 0).toLocaleString() }}</span> {{ k }}</div></div>
      <div class="actions"><button class="btn btn-danger" :disabled="!!busy" @click="wipe"><Trash2 :size="15" /> Wipe this app's data</button></div>
    </section>
  </div>
</template>

<style scoped>
.block { max-width: 900px; padding: 1.2rem 1.4rem; margin-bottom: 1rem; }
.block h2 { margin-bottom: .5rem; } .block h3 { margin-bottom: .4rem; }
.actions { display: flex; flex-wrap: wrap; gap: .5rem; margin: .8rem 0 .4rem; }
.busy { color: var(--accent); border-color: var(--accent); }
.report { margin-top: 1rem; padding: .8rem 1rem; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); }
.report table { border-collapse: collapse; margin: .4rem 0 .6rem; }
.report td { padding: .1rem 1.2rem .1rem 0; }
.warn { color: var(--warn); }
.stats { display: flex; flex-wrap: wrap; gap: .4rem 1.6rem; color: var(--text-dim); }
.stats .num { color: var(--text); font-size: 1.1rem; margin-right: .2rem; }
code { font-family: var(--font-mono); font-size: .9em; }
</style>

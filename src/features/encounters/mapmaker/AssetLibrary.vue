<script setup lang="ts">
/**
 * The map maker's asset library: images you imported (files, whole folders,
 * or dropped here), filed by folder. Click one to place it on the map.
 * Importing a folder again skips what is already there.
 */
import { computed, ref, watch } from 'vue'
import { FolderPlus, ImagePlus, Trash2 } from 'lucide-vue-next'
import { assetFolder, assetFolders, assetKey, assetName, filterAssets, type AssetSource } from '@/domain/rules/mapAssets'
import type { MapAsset } from '@/domain/schema'
import { mapAssets } from '@/data/encounters'
import { droppedAssetFiles, importAsset, pickAssetFiles, pickAssetFolder } from '@/services/assetFiles'
import { confirmDialog, notify } from '@/ui/dialogs'
import { imageUrlOf } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'

defineProps<{ placingId: string | null }>()
const emit = defineEmits<{ place: [asset: MapAsset]; gone: [ids: string[]] }>()

const PAGE = 120
const assets = useLive(() => mapAssets.list(), [])
/** null = all folders, '' = loose files. */
const folder = ref<string | null>(null)
const query = ref('')
const limit = ref(PAGE)
const folders = computed(() => assetFolders(assets.value))
const shown = computed(() => filterAssets(assets.value, folder.value, query.value))
const visible = computed(() => shown.value.slice(0, limit.value))
const thumbs = ref<Record<string, string>>({})
const progress = ref<{ done: number; total: number } | null>(null)
const dropping = ref(false)
watch([folder, query], () => { limit.value = PAGE })
// Libraries run to thousands of assets: thumbnails load a page at a time
watch(visible, (list) => {
  for (const a of list) {
    if (a.imageId in thumbs.value) continue
    thumbs.value[a.imageId] = ''
    void imageUrlOf({ imageId: a.imageId }).then((url) => { if (url) thumbs.value[a.imageId] = url })
  }
}, { immediate: true })

async function importSources(sources: AssetSource[]) {
  if (!sources.length) { notify('No PNG, WebP, SVG, JPEG or GIF images there.'); return }
  if (progress.value) return
  const known = new Set(assets.value.map(a => assetKey(a.folder, a.name)))
  progress.value = { done: 0, total: sources.length }
  let failed = 0, skipped = 0
  for (const s of sources) {
    const key = assetKey(assetFolder(s.path), assetName(s.file.name))
    if (known.has(key)) skipped++
    else { try { await importAsset(s); known.add(key) } catch { failed++ } }
    progress.value = { done: progress.value.done + 1, total: sources.length }
  }
  progress.value = null
  // Show what came in: the folder, when it was one
  const top = new Set(sources.map(s => assetFolder(s.path).split(' / ')[0] ?? ''))
  if (top.size === 1) folder.value = [...top][0] || null
  query.value = ''
  const notes = [skipped && `${skipped} already in the library were skipped`, failed && `${failed} could not be read as images`].filter(Boolean)
  if (notes.length) notify(`Imported ${sources.length - skipped - failed} of ${sources.length}: ${notes.join(', ')}.`)
}

async function remove(list: MapAsset[], what: string) {
  if (!list.length || !await confirmDialog({ title: `Remove ${what} from the library?`, body: 'Copies already placed on maps stay.', confirmLabel: 'Remove', danger: true })) return
  const ids = list.map(a => a.id)
  await mapAssets.remove(ids)
  emit('gone', ids)
  if (list.length > 1) folder.value = null
}
const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files')
async function drop(e: DragEvent) {
  dropping.value = false
  if (e.dataTransfer && hasFiles(e)) await importSources(await droppedAssetFiles(e.dataTransfer))
}
</script>

<template>
  <aside class="lib" :class="{ dropping }" data-test="asset-library" @dragover.prevent="dropping = hasFiles($event)" @dragleave="dropping = false" @drop.prevent="drop">
    <div class="row">
      <span class="eyebrow grow">Assets <span class="faint">{{ assets.length }}</span></span>
      <button class="btn btn-icon" title="Import image files" @click="pickAssetFiles().then(importSources)"><ImagePlus :size="15" /></button>
      <button class="btn btn-icon" title="Import a folder with its subfolders" @click="pickAssetFolder().then(importSources)"><FolderPlus :size="15" /></button>
    </div>
    <p v-if="progress" class="faint">Importing {{ progress.done }} of {{ progress.total }}…</p>
    <template v-if="assets.length">
      <input v-model="query" class="input" placeholder="Search assets…" aria-label="Search assets" />
      <div v-if="folders.length" class="row">
        <select v-model="folder" class="input" aria-label="Folder"><option :value="null">All folders</option><option value="">Loose files</option><option v-for="f in folders" :key="f" :value="f">{{ f }}</option></select>
        <button v-if="folder !== null" class="btn btn-icon btn-danger" title="Remove this folder's assets" @click="remove(shown, `${shown.length} assets in “${folder || 'Loose files'}”`)"><Trash2 :size="14" /></button>
      </div>
      <ul>
        <li v-for="a in visible" :key="a.id" :class="{ on: placingId === a.id }" :title="a.folder ? `${a.name} · ${a.folder}` : a.name" :data-asset="a.name" @click="emit('place', a)">
          <img v-if="thumbs[a.imageId]" :src="thumbs[a.imageId]" alt="" loading="lazy" /><span>{{ a.name }}</span>
          <button class="del" :aria-label="`Remove ${a.name}`" @click.stop="remove([a], `“${a.name}”`)"><Trash2 :size="11" /></button>
        </li>
      </ul>
      <button v-if="shown.length > visible.length" class="btn" @click="limit += PAGE">Show more ({{ shown.length - visible.length }} left)</button>
    </template>
    <p v-else-if="!progress" class="faint">Import images of furniture, trees, rugs… or drop files and folders here. Click an asset, then click the map to place it.</p>
  </aside>
</template>

<style scoped>
.lib { display: flex; flex-direction: column; gap: .45rem; padding: .5rem; min-height: 0; background: var(--bg-raised); } .lib.dropping { outline: 2px dashed var(--accent); outline-offset: -4px; }
.row { display: flex; gap: .3rem; align-items: center; } .grow { flex: 1; } p { margin: 0; font-size: .82rem; }
ul { list-style: none; margin: 0; padding: 0; overflow: auto; display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; align-content: start; flex: 1; }
li { position: relative; aspect-ratio: 1; border: 1px solid var(--line); border-radius: var(--radius); background: var(--bg-sunken); cursor: pointer; overflow: hidden; display: flex; align-items: center; justify-content: center; }
li:hover { border-color: var(--line-strong); } li.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
li img { max-width: 100%; max-height: 100%; object-fit: contain; } li span { position: absolute; inset: auto 0 0 0; font-size: .62rem; padding: 0 2px; background: rgb(0 0 0 / .6); color: #ddd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.del { position: absolute; top: 1px; right: 1px; display: none; background: rgb(0 0 0 / .7); border: 0; color: var(--danger); border-radius: 3px; padding: 1px 3px; } li:hover .del { display: block; }
</style>

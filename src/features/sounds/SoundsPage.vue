<script setup lang="ts">
/** The sound library: tracks (local files, web addresses, Spotify links), tags that work as automatic playlists, and playlists of your own. */
import { computed, reactive, ref } from 'vue'
import { Link2, Pencil, Play, Plus, Trash2 } from 'lucide-vue-next'
import type { SoundPlaylist, SoundTrack } from '@/domain/schema'
import { sounds } from '@/data/sounds'
import { hasFile, linkFile, pickSoundFiles, playPlaylist, playQueue, player } from '@/services/soundPlayer'
import AppDialog from '@/ui/components/AppDialog.vue'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { useLive } from '@/ui/useLive'

type View = { kind: 'all' } | { kind: 'tag'; tag: string } | { kind: 'playlist'; id: string }
const tracks = useLive(() => sounds.tracks(), [])
const playlists = useLive(() => sounds.playlists(), [])
const linked = useLive(async () => new Set((await Promise.all(tracks.value.map(async t => (t.type === 'file' && await hasFile(t.id) ? t.id : '')))).filter(Boolean)), new Set<string>(), [tracks])
const view = ref<View>({ kind: 'all' })
const search = ref('')
const tags = computed(() => [...new Set(tracks.value.flatMap(t => t.tags))].sort())
const current = computed(() => (view.value.kind === 'playlist' ? playlists.value.find(p => p.id === (view.value as { id: string }).id) ?? null : null))
const shown = computed(() => {
  const v = view.value, q = search.value.trim().toLowerCase()
  const base = v.kind === 'tag' ? tracks.value.filter(t => t.tags.includes(v.tag))
    : v.kind === 'playlist' ? (current.value?.trackIds ?? []).map(id => tracks.value.find(t => t.id === id)).filter((t): t is SoundTrack => !!t) : tracks.value
  return q ? base.filter(t => t.name.toLowerCase().includes(q) || t.tags.some(x => x.toLowerCase().includes(q))) : base
})
const title = computed(() => (view.value.kind === 'tag' ? `#${view.value.tag}` : current.value?.name ?? 'All tracks'))
const run = (what: string, work: () => Promise<unknown>) => work().catch(err => reportError(what, err))

// ── Tracks ──
const edit = reactive({ open: false, id: '', name: '', type: 'url' as SoundTrack['type'], src: '', tags: '' })
function openEdit(t?: SoundTrack) { Object.assign(edit, { open: true, id: t?.id ?? '', name: t?.name ?? '', type: t?.type ?? 'url', src: t?.src ?? '', tags: t?.tags.join(', ') ?? '' }) }
const parseTags = (s: string) => [...new Set(s.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))]
const saveEdit = () => run('Saving the track', async () => {
  const type = edit.id ? edit.type : /open\.spotify\.com|^spotify:/.test(edit.src) ? 'spotify' : 'url'
  const t = await sounds.saveTrack({ ...(edit.id ? { id: edit.id } : {}), name: edit.name.trim() || edit.src.split('/').pop() || 'Track', type, src: edit.src.trim(), tags: parseTags(edit.tags) })
  if (!edit.id && current.value) await sounds.savePlaylist({ ...current.value, trackIds: [...current.value.trackIds, t.id] })
  edit.open = false
})
const addFiles = () => run('Adding files', async () => {
  const files = await pickSoundFiles()
  if (!files.length) { if (!('showOpenFilePicker' in window)) notify('This browser cannot keep links to local files. Use Chrome, or add tracks by web address.'); return }
  const added: string[] = []
  for (const f of files) {
    const t = await sounds.saveTrack({ name: f.name.replace(/\.[^.]+$/, ''), type: 'file', fileName: f.name, tags: view.value.kind === 'tag' ? [view.value.tag] : [] })
    await linkFile(t.id, f.handle)
    added.push(t.id)
  }
  if (current.value) await sounds.savePlaylist({ ...current.value, trackIds: [...current.value.trackIds, ...added] })
})
/** A file track imported from a backup or another device: pick the file again. */
const relink = (t: SoundTrack) => run('Linking the file', async () => {
  const [f] = await pickSoundFiles()
  if (f) { await linkFile(t.id, f.handle); await sounds.saveTrack({ ...t, fileName: f.name }) }
})
const removeTrack = (t: SoundTrack) => run('Deleting the track', async () => {
  if (await confirmDialog({ title: `Delete “${t.name}”?`, body: 'The track leaves the library and every playlist. A local file itself is not touched.', confirmLabel: 'Delete', danger: true })) await sounds.removeTrack(t.id)
})

// ── Playlists ──
const newList = ref('')
const createList = () => run('Creating the playlist', async () => { if (newList.value.trim()) { const p = await sounds.savePlaylist({ name: newList.value.trim() }); newList.value = ''; view.value = { kind: 'playlist', id: p.id } } })
const patchList = (p: SoundPlaylist, patch: Partial<SoundPlaylist>) => run('Saving the playlist', () => sounds.savePlaylist({ ...p, ...patch }))
const removeList = (p: SoundPlaylist) => run('Deleting the playlist', async () => {
  if (await confirmDialog({ title: `Delete the playlist “${p.name}”?`, body: 'Its tracks stay in the library.', confirmLabel: 'Delete', danger: true })) { await sounds.removePlaylist(p.id); view.value = { kind: 'all' } }
})
const inList = (t: SoundTrack) => !!current.value?.trackIds.includes(t.id)
const adding = ref(false)
const playAll = () => (current.value ? playPlaylist(current.value.id) : playQueue(shown.value, 0, title.value))
</script>

<template>
  <div class="page sounds">
    <div class="page-head"><h1>Sounds</h1>
      <button class="btn" data-test="add-sound-url" @click="openEdit()"><Link2 :size="14" /> Web address or Spotify link</button>
      <button class="btn btn-primary" @click="addFiles"><Plus :size="15" /> Local files</button>
    </div>
    <div class="cols">
      <nav class="side">
        <button :class="{ on: view.kind === 'all' }" @click="view = { kind: 'all' }">All tracks <span class="faint">{{ tracks.length }}</span></button>
        <span class="eyebrow">Playlists</span>
        <button v-for="p in playlists" :key="p.id" :class="{ on: view.kind === 'playlist' && view.id === p.id }" :data-playlist="p.name" @click="view = { kind: 'playlist', id: p.id }"><i class="dot" :style="{ background: p.color ?? 'var(--accent)' }" />{{ p.name }} <span class="faint">{{ p.trackIds.length }}</span></button>
        <div class="new"><input v-model="newList" class="input" placeholder="New playlist" aria-label="New playlist name" @keydown.enter="createList" /><button class="btn btn-icon" aria-label="Create playlist" @click="createList"><Plus :size="14" /></button></div>
        <span v-if="tags.length" class="eyebrow">Tags</span>
        <button v-for="t in tags" :key="t" :class="{ on: view.kind === 'tag' && view.tag === t }" @click="view = { kind: 'tag', tag: t }">#{{ t }}</button>
      </nav>
      <section class="main">
        <header>
          <h2>{{ title }}</h2>
          <button class="btn" :disabled="!shown.length" data-test="play-all" @click="playAll"><Play :size="14" /> Play</button>
          <template v-if="current">
            <input type="color" :value="current.color ?? '#c9973a'" aria-label="Playlist colour" @change="patchList(current, { color: ($event.target as HTMLInputElement).value })" />
            <label class="dim"><input type="checkbox" :checked="current.shuffle" @change="patchList(current, { shuffle: !current.shuffle })" /> shuffle</label>
            <label class="dim"><input type="checkbox" :checked="current.loop" @change="patchList(current, { loop: !current.loop })" /> loop</label>
            <button class="btn" :class="{ 'btn-primary': adding }" @click="adding = !adding">Add from library</button>
            <button class="btn btn-icon btn-danger" aria-label="Delete playlist" @click="removeList(current)"><Trash2 :size="14" /></button>
          </template>
          <span class="grow" /><input v-model="search" class="input search" placeholder="Search…" aria-label="Search tracks" />
        </header>
        <ul v-if="adding && current" class="tracks pick">
          <li v-for="t in tracks.filter(x => !inList(x))" :key="t.id"><span class="name">{{ t.name }}</span><button class="btn" @click="patchList(current, { trackIds: [...current.trackIds, t.id] })">Add</button></li>
          <li v-if="tracks.every(inList)" class="faint">Every track is in this playlist.</li>
        </ul>
        <ul class="tracks" data-test="track-list">
          <li v-for="(t, i) in shown" :key="t.id" :class="{ now: player.queue[player.index]?.id === t.id }" :data-track="t.name">
            <button class="btn btn-icon" :aria-label="`Play ${t.name}`" @click="playQueue(shown, i, title)"><Play :size="13" /></button>
            <span class="name">{{ t.name }}</span>
            <span class="chip">{{ t.type === 'file' ? 'file' : t.type === 'spotify' ? 'Spotify' : 'web' }}</span>
            <button v-if="t.type === 'file' && !linked.has(t.id)" class="btn warn" :title="`The file ${t.fileName ?? ''} must be picked again on this device`" @click="relink(t)">Link the file</button>
            <span class="tags faint">{{ t.tags.map(x => `#${x}`).join(' ') }}</span>
            <button v-if="current" class="btn btn-ghost" @click="patchList(current, { trackIds: current.trackIds.filter(x => x !== t.id) })">Take out</button>
            <button class="btn btn-ghost btn-icon" :aria-label="`Edit ${t.name}`" @click="openEdit(t)"><Pencil :size="13" /></button>
            <button class="btn btn-ghost btn-icon" :aria-label="`Delete ${t.name}`" @click="removeTrack(t)"><Trash2 :size="13" /></button>
          </li>
        </ul>
        <p v-if="!shown.length" class="empty">{{ tracks.length ? 'No tracks here.' : 'No tracks yet. Add local files (they stay where they are; only a link is kept) or a web address.' }}</p>
      </section>
    </div>

    <AppDialog v-if="edit.open" :title="edit.id ? 'Track' : 'New track'" @close="edit.open = false">
      <label v-if="edit.type !== 'file'"><span class="label">Web address of an audio file, or a Spotify link</span><input v-model="edit.src" class="input" placeholder="https://…" aria-label="Track address" /></label>
      <label><span class="label">Name</span><input v-model="edit.name" class="input" aria-label="Track name" /></label>
      <label><span class="label">Tags (each tag is a playlist by itself)</span><input v-model="edit.tags" class="input" placeholder="combat, tavern" aria-label="Track tags" /></label>
      <template #footer><button class="btn" @click="edit.open = false">Cancel</button><button class="btn btn-primary" :disabled="edit.type !== 'file' && !edit.src.trim()" data-test="save-track" @click="saveEdit">Save</button></template>
    </AppDialog>
  </div>
</template>

<style scoped>
.cols { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 1.4rem; align-items: start; }
.side { display: flex; flex-direction: column; gap: 2px; } .side > button { display: flex; align-items: center; gap: .45rem; background: none; border: 0; text-align: left; padding: .3rem .5rem; border-radius: var(--radius); }
.side > button:hover { background: var(--bg-hover); } .side > button.on { background: var(--accent-soft); color: var(--accent); } .side .eyebrow { margin: .8rem 0 .2rem .5rem; } .side .faint { margin-left: auto; }
.dot { width: 9px; height: 9px; border-radius: 50%; } .new { display: flex; gap: .3rem; margin-top: .3rem; }
.main header { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; margin-bottom: .7rem; } .grow { flex: 1; } .search { width: 14rem; }
.tracks { list-style: none; margin: 0; padding: 0; } .tracks li { display: flex; align-items: center; gap: .5rem; padding: .25rem .3rem; border-bottom: var(--frame); } .tracks li.now .name { color: var(--accent); }
.name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .tags { font-size: .8rem; } .warn { color: var(--warn); border-color: var(--warn); }
.pick { margin-bottom: 1rem; max-height: 14rem; overflow: auto; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); }
</style>

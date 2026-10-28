<template>
  <div class="snd-page">

    <!-- ── Sidebar ───────────────────────────────────────────────────────── -->
    <div class="snd-sidebar">

      <!-- Library section -->
      <div class="snd-sb-section">
        <div class="snd-sb-header">
          <span class="snd-sb-title">Library</span>
          <button class="snd-sb-add" title="Add track" @click="openAddTrack">+</button>
        </div>
        <button
          class="snd-pl-item"
          :class="{ active: view.type === 'all' }"
          @click="view = { type: 'all' }"
        >
          <span class="snd-pl-icon">♫</span>
          <span class="snd-pl-name">All Tracks</span>
          <span class="snd-pl-count">{{ tracks.length }}</span>
        </button>
      </div>

      <!-- Tags section (auto-playlists) -->
      <div v-if="allTags.length" class="snd-sb-section">
        <div class="snd-sb-header">
          <span class="snd-sb-title">Tags</span>
        </div>
        <button
          v-for="tag in allTags"
          :key="tag"
          class="snd-pl-item"
          :class="{ active: view.type === 'tag' && (view as TagView).tag === tag }"
          @click="view = { type: 'tag', tag }"
        >
          <span class="snd-tag-hash">#</span>
          <span class="snd-pl-name">{{ tag }}</span>
          <span class="snd-pl-count">{{ getTracksByTag(tag).length }}</span>
        </button>
      </div>

      <!-- Playlists section -->
      <div class="snd-sb-section">
        <div class="snd-sb-header">
          <span class="snd-sb-title">Playlists</span>
          <button class="snd-sb-add" title="New playlist" @click="showNewPlaylist = true">+</button>
        </div>
        <div v-if="!playlists.length" class="snd-sb-empty">No playlists yet</div>
        <button
          v-for="pl in playlists"
          :key="pl.id"
          class="snd-pl-item"
          :class="{ active: view.type === 'playlist' && (view as PlaylistView).id === pl.id }"
          :style="{ '--pl-color': pl.color ?? 'var(--accent)' }"
          @click="view = { type: 'playlist', id: pl.id! }"
        >
          <span class="snd-pl-dot" />
          <span class="snd-pl-name">{{ pl.name }}</span>
          <span class="snd-pl-count">{{ trackCount(pl) }}</span>
        </button>
      </div>

    </div>

    <!-- ── Main panel ─────────────────────────────────────────────────────── -->
    <div class="snd-main">

      <!-- All Tracks view -->
      <template v-if="view.type === 'all'">
        <div class="snd-hdr">
          <div class="snd-hdr-left">
            <span class="snd-hdr-name">All Tracks</span>
            <span class="snd-hdr-count">{{ tracks.length }} track{{ tracks.length !== 1 ? 's' : '' }}</span>
          </div>
          <div class="snd-hdr-actions">
            <button v-if="tracks.length" class="snd-play-all" @click="playAllTracks">▶ Play all</button>
            <button class="snd-add-track-btn" @click="openAddTrack">+ Add Track</button>
          </div>
        </div>

        <div class="snd-tracks">
          <div v-if="!tracks.length" class="snd-tracks-empty">
            <p>No tracks yet.</p>
            <button class="snd-add-track-btn" @click="openAddTrack">+ Add Track</button>
          </div>

          <div
            v-for="(track, i) in sortedTracks"
            :key="track.id"
            class="snd-track"
            :class="{ playing: isCurrentTrack(track) }"
          >
            <div class="snd-track-num">
              <button
                v-if="isCurrentTrack(track) && isPlaying && track.type !== 'spotify'"
                class="snd-track-play active"
                @click="togglePlay"
              >⏸</button>
              <button v-else class="snd-track-play" @click="playFromAll(i)">
                {{ track.type === 'spotify' ? '↗' : '▶' }}
              </button>
            </div>
            <div class="snd-track-type-icon" :class="`snd-type--${track.type}`">
              <span v-if="track.type === 'file'">♫</span>
              <span v-else-if="track.type === 'url'">🔗</span>
              <span v-else style="color:#1db954">●</span>
            </div>
            <div class="snd-track-body">
              <span class="snd-track-name">{{ track.name }}</span>
              <span v-if="track.type === 'spotify'" class="snd-track-sub snd-track-sub--spotify">Spotify</span>
              <span v-else-if="track.type === 'url'" class="snd-track-sub">{{ shortenUrl(track.src) }}</span>
              <span v-else-if="track.duration" class="snd-track-sub">{{ fmtSeconds(track.duration) }}</span>
            </div>
            <div class="snd-track-tags">
              <span v-for="tag in parseTags(track.tags)" :key="tag" class="snd-tag-chip">#{{ tag }}</span>
            </div>
            <div class="snd-track-actions">
              <button class="snd-track-act" title="Edit" @click="openEditTrack(track)">✎</button>
              <button v-if="track.type === 'spotify'" class="snd-track-act" title="Open in Spotify" @click="openSpotify(track.src)">↗</button>
              <button class="snd-track-act snd-track-act--del" title="Delete track" @click="confirmDeleteTrack(track.id!)">✕</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Tag view (auto-playlist) -->
      <template v-else-if="view.type === 'tag'">
        <div class="snd-hdr">
          <div class="snd-hdr-left">
            <span class="snd-hdr-tag-prefix">#</span>
            <span class="snd-hdr-name">{{ (view as TagView).tag }}</span>
            <span class="snd-hdr-count">{{ tagTracks.length }} track{{ tagTracks.length !== 1 ? 's' : '' }}</span>
          </div>
          <div class="snd-hdr-actions">
            <button v-if="tagTracks.length" class="snd-play-all" @click="playTagTracks(0)">▶ Play all</button>
          </div>
        </div>

        <div class="snd-tracks">
          <div v-if="!tagTracks.length" class="snd-tracks-empty">
            <p>No tracks with this tag.</p>
          </div>
          <div
            v-for="(track, i) in tagTracks"
            :key="track.id"
            class="snd-track"
            :class="{ playing: isCurrentTrack(track) }"
          >
            <div class="snd-track-num">
              <button
                v-if="isCurrentTrack(track) && isPlaying && track.type !== 'spotify'"
                class="snd-track-play active"
                @click="togglePlay"
              >⏸</button>
              <button v-else class="snd-track-play" @click="playTagTracks(i)">
                {{ track.type === 'spotify' ? '↗' : '▶' }}
              </button>
            </div>
            <div class="snd-track-type-icon" :class="`snd-type--${track.type}`">
              <span v-if="track.type === 'file'">♫</span>
              <span v-else-if="track.type === 'url'">🔗</span>
              <span v-else style="color:#1db954">●</span>
            </div>
            <div class="snd-track-body">
              <span class="snd-track-name">{{ track.name }}</span>
              <span v-if="track.type === 'spotify'" class="snd-track-sub snd-track-sub--spotify">Spotify</span>
              <span v-else-if="track.type === 'url'" class="snd-track-sub">{{ shortenUrl(track.src) }}</span>
              <span v-else-if="track.duration" class="snd-track-sub">{{ fmtSeconds(track.duration) }}</span>
            </div>
            <div class="snd-track-actions">
              <button class="snd-track-act" title="Edit" @click="openEditTrack(track)">✎</button>
            </div>
          </div>
        </div>
      </template>

      <!-- Playlist view -->
      <template v-else-if="view.type === 'playlist' && selectedPlaylist">
        <div class="snd-hdr">
          <div class="snd-hdr-left">
            <div class="snd-hdr-dot" :style="{ background: selectedPlaylist.color ?? 'var(--accent)' }" />
            <span class="snd-hdr-name">{{ selectedPlaylist.name }}</span>
            <span class="snd-hdr-count">{{ playlistTracks.length }} track{{ playlistTracks.length !== 1 ? 's' : '' }}</span>
          </div>
          <div class="snd-hdr-actions">
            <button
              v-if="playlistTracks.length"
              class="snd-play-all"
              :style="{ '--pl-color': selectedPlaylist.color ?? 'var(--accent)' }"
              @click="playPlaylistTracks(0)"
            >▶ Play all</button>
            <button class="snd-add-track-btn" @click="openLibraryPicker">+ Add</button>
            <button class="snd-del-pl" title="Delete playlist" @click="confirmDeletePlaylist">✕</button>
          </div>
        </div>

        <div class="snd-tracks">
          <div v-if="!playlistTracks.length" class="snd-tracks-empty">
            <p>No tracks yet.</p>
            <button class="snd-add-track-btn" @click="openLibraryPicker">+ Add from Library</button>
          </div>

          <div
            v-for="(track, i) in playlistTracks"
            :key="track.id"
            class="snd-track"
            :class="{ playing: isCurrentTrack(track) }"
          >
            <div class="snd-track-num">
              <button
                v-if="isCurrentTrack(track) && isPlaying && track.type !== 'spotify'"
                class="snd-track-play active"
                @click="togglePlay"
              >⏸</button>
              <button v-else class="snd-track-play" @click="playPlaylistTracks(i)">
                {{ track.type === 'spotify' ? '↗' : '▶' }}
              </button>
            </div>
            <div class="snd-track-type-icon" :class="`snd-type--${track.type}`">
              <span v-if="track.type === 'file'">♫</span>
              <span v-else-if="track.type === 'url'">🔗</span>
              <span v-else style="color:#1db954">●</span>
            </div>
            <div class="snd-track-body">
              <span class="snd-track-name">{{ track.name }}</span>
              <span v-if="track.type === 'spotify'" class="snd-track-sub snd-track-sub--spotify">Spotify</span>
              <span v-else-if="track.type === 'url'" class="snd-track-sub">{{ shortenUrl(track.src) }}</span>
              <span v-else-if="track.duration" class="snd-track-sub">{{ fmtSeconds(track.duration) }}</span>
            </div>
            <div class="snd-track-tags">
              <span v-for="tag in parseTags(track.tags)" :key="tag" class="snd-tag-chip">#{{ tag }}</span>
            </div>
            <div class="snd-track-actions">
              <button v-if="track.type === 'spotify'" class="snd-track-act" title="Open in Spotify" @click="openSpotify(track.src)">↗</button>
              <button class="snd-track-act snd-track-act--del" title="Remove from playlist" @click="removeFromPlaylist(track.id!)">✕</button>
            </div>
          </div>
        </div>
      </template>

      <div v-else class="snd-empty-state">
        <div class="snd-empty-icon">♫</div>
        <div class="snd-empty-label">Add tracks to your library to get started</div>
        <button class="snd-add-track-btn" @click="openAddTrack">+ Add Track</button>
      </div>

    </div>

    <!-- ── Dialogs ─────────────────────────────────────────────────────────── -->
    <Teleport to="body">

      <!-- New Playlist -->
      <div v-if="showNewPlaylist" class="snd-dialog-mask" @click.self="showNewPlaylist = false">
        <div class="snd-dialog">
          <div class="snd-dlg-header">
            <span class="snd-dlg-title">New Playlist</span>
            <button class="snd-dlg-close" @click="showNewPlaylist = false">✕</button>
          </div>
          <div class="snd-dlg-body">
            <label class="snd-dlg-label">Name</label>
            <input ref="newPlNameRef" v-model="newPlName" class="snd-dlg-input" placeholder="Combat Music…" @keyup.enter="submitNewPlaylist" />
            <label class="snd-dlg-label" style="margin-top:10px">Color</label>
            <div class="snd-color-row">
              <button
                v-for="c in PLAYLIST_COLORS"
                :key="c"
                class="snd-color-swatch"
                :style="{ background: c, outline: newPlColor === c ? '2px solid white' : 'none' }"
                @click="newPlColor = c"
              />
            </div>
          </div>
          <div class="snd-dlg-footer">
            <button class="ghost-btn" @click="showNewPlaylist = false">Cancel</button>
            <button class="seal-btn" :disabled="!newPlName.trim()" @click="submitNewPlaylist">Create</button>
          </div>
        </div>
      </div>

      <!-- Add Track -->
      <div v-if="showAddTrack" class="snd-dialog-mask" @click.self="showAddTrack = false">
        <div class="snd-dialog snd-dialog--wide">
          <div class="snd-dlg-header">
            <span class="snd-dlg-title">Add Track</span>
            <button class="snd-dlg-close" @click="showAddTrack = false">✕</button>
          </div>
          <div class="snd-dlg-body">
            <div class="snd-type-tabs">
              <button
                v-for="t in TRACK_TYPES"
                :key="t.value"
                class="snd-type-tab"
                :class="{ active: newTrackType === t.value }"
                @click="newTrackType = t.value; newTrackSrc = ''; newTrackName = ''"
              >{{ t.label }}</button>
            </div>

            <template v-if="newTrackType === 'file'">
              <p class="snd-dlg-hint">Pick audio files from your computer.</p>
              <button class="snd-file-pick-btn" @click="pickFiles">
                <span>📂 Choose Files…</span>
              </button>
              <div v-if="pendingFiles.length" class="snd-pending-files">
                <div v-for="(f, i) in pendingFiles" :key="f.name + f.size" class="snd-pending-file">
                  <span class="snd-pending-name">{{ f.name }}</span>
                  <button class="snd-del-pending" @click="pendingFiles.splice(i, 1)">✕</button>
                </div>
              </div>
            </template>

            <template v-else>
              <label class="snd-dlg-label">
                {{ newTrackType === 'spotify' ? 'Spotify Track or Playlist URL' : 'Audio URL' }}
              </label>
              <input
                v-model="newTrackSrc"
                class="snd-dlg-input"
                :placeholder="newTrackType === 'spotify'
                  ? 'https://open.spotify.com/track/…'
                  : 'https://example.com/music.mp3'"
                @input="autoFillName"
              />
              <label class="snd-dlg-label" style="margin-top:10px">Name</label>
              <input v-model="newTrackName" class="snd-dlg-input" placeholder="Track name…" />
            </template>
          </div>
          <div class="snd-dlg-footer">
            <button class="ghost-btn" @click="showAddTrack = false">Cancel</button>
            <button class="seal-btn" :disabled="!canSubmitTrack" @click="submitAddTrack">Add</button>
          </div>
        </div>
      </div>

      <!-- Edit Track -->
      <div v-if="showEditTrack" class="snd-dialog-mask" @click.self="showEditTrack = false">
        <div class="snd-dialog snd-dialog--wide">
          <div class="snd-dlg-header">
            <span class="snd-dlg-title">Edit Track</span>
            <button class="snd-dlg-close" @click="showEditTrack = false">✕</button>
          </div>
          <div class="snd-dlg-body">
            <label class="snd-dlg-label">Name</label>
            <input ref="editNameRef" v-model="editTrackName" class="snd-dlg-input" placeholder="Track name…" @keyup.enter="submitEditTrack" />
            <label class="snd-dlg-label" style="margin-top:10px">Tags</label>
            <input v-model="editTrackTagsRaw" class="snd-dlg-input" placeholder="ambient, combat, tavern…" @keyup.enter="submitEditTrack" />
            <p class="snd-dlg-hint" style="margin-top:4px">Comma-separated. Each tag creates an automatic playlist.</p>
          </div>
          <div class="snd-dlg-footer">
            <button class="ghost-btn" @click="showEditTrack = false">Cancel</button>
            <button class="seal-btn" :disabled="!editTrackName.trim()" @click="submitEditTrack">Save</button>
          </div>
        </div>
      </div>

      <!-- Library Picker (add tracks to playlist) -->
      <div v-if="showLibraryPicker" class="snd-dialog-mask" @click.self="showLibraryPicker = false">
        <div class="snd-dialog snd-dialog--wide">
          <div class="snd-dlg-header">
            <span class="snd-dlg-title">Add from Library</span>
            <button class="snd-dlg-close" @click="showLibraryPicker = false">✕</button>
          </div>
          <div class="snd-dlg-body" style="padding-bottom:8px">
            <input v-model="librarySearch" class="snd-dlg-input" placeholder="Search tracks…" />
            <div class="snd-lib-list">
              <label
                v-for="track in filteredLibraryTracks"
                :key="track.id"
                class="snd-lib-row"
                :class="{ 'snd-lib-row--added': isInCurrentPlaylist(track.id!) }"
              >
                <input
                  type="checkbox"
                  :value="track.id"
                  v-model="pickedTrackIds"
                  :disabled="isInCurrentPlaylist(track.id!)"
                />
                <span class="snd-lib-type">
                  <span v-if="track.type === 'file'">♫</span>
                  <span v-else-if="track.type === 'url'">🔗</span>
                  <span v-else style="color:#1db954">●</span>
                </span>
                <span class="snd-lib-name">{{ track.name }}</span>
                <span v-if="isInCurrentPlaylist(track.id!)" class="snd-lib-added">added</span>
                <div v-else class="snd-track-tags">
                  <span v-for="tag in parseTags(track.tags)" :key="tag" class="snd-tag-chip">#{{ tag }}</span>
                </div>
              </label>
              <div v-if="!filteredLibraryTracks.length" class="snd-lib-empty">No tracks found</div>
            </div>
          </div>
          <div class="snd-dlg-footer">
            <span class="snd-dlg-hint-sm">{{ pickedTrackIds.length }} selected</span>
            <button class="ghost-btn" @click="showLibraryPicker = false">Cancel</button>
            <button class="seal-btn" :disabled="!pickedTrackIds.length" @click="submitLibraryPick">Add Selected</button>
          </div>
        </div>
      </div>

    </Teleport>

  </div>
</template>

<script setup lang="ts">
import { APP_NAME } from '~/utils/appNamespace'
import { useSounds } from '~/composables/useSounds'
import { useSoundPlayer } from '~/composables/useSoundPlayer'
import type { DbSoundPlaylist, DbSoundTrack } from '~/composables/useDb'

useHead({ title: `Sounds — ${APP_NAME}` })

type AllView      = { type: 'all' }
type TagView      = { type: 'tag'; tag: string }
type PlaylistView = { type: 'playlist'; id: number }
type SidebarView  = AllView | TagView | PlaylistView

const sounds = useSounds()
const {
  tracks, playlists, trackCount,
  allTags, parseTags, getTracksByTag,
  getPlaylistTracks, createPlaylist, deletePlaylist,
  addTrack, updateTrack, deleteTrack,
  addTrackToPlaylist, removeTrackFromPlaylist,
} = sounds

const { currentTrack, isPlaying, togglePlay, playPlaylist } = useSoundPlayer()

// ── View selection ─────────────────────────────────────────────────────────
const view = ref<SidebarView>({ type: 'all' })

const selectedPlaylist = computed(() =>
  view.value.type === 'playlist'
    ? playlists.value.find(p => p.id === (view.value as PlaylistView).id) ?? null
    : null
)

const tagTracks = computed(() =>
  view.value.type === 'tag' ? getTracksByTag((view.value as TagView).tag) : []
)

const playlistTracks = computed(() =>
  selectedPlaylist.value ? getPlaylistTracks(selectedPlaylist.value) : []
)

const sortedTracks = computed(() =>
  [...tracks.value].sort((a, b) => a.name.localeCompare(b.name))
)

// ── Playback ───────────────────────────────────────────────────────────────
function isCurrentTrack(t: DbSoundTrack) { return currentTrack.value?.id === t.id }

function makeVirtualPlaylist(name: string): DbSoundPlaylist {
  return { name, trackIds: '[]', loop: 0, shuffle: 0, createdAt: '', updatedAt: '' } as DbSoundPlaylist
}

function playAllTracks() {
  playPlaylist(makeVirtualPlaylist('All Tracks'), sortedTracks.value, 0)
}

function playFromAll(i: number) {
  playPlaylist(makeVirtualPlaylist('All Tracks'), sortedTracks.value, i)
}

function playTagTracks(i: number) {
  const tag = (view.value as TagView).tag
  playPlaylist(makeVirtualPlaylist(`#${tag}`), tagTracks.value, i)
}

function playPlaylistTracks(i: number) {
  if (!selectedPlaylist.value) return
  playPlaylist(selectedPlaylist.value, playlistTracks.value, i)
}

function openSpotify(url: string) { window.open(url, '_blank', 'noopener') }

// ── New Playlist ───────────────────────────────────────────────────────────
const PLAYLIST_COLORS = [
  '#e05555', '#e8924a', '#e8c44a', '#7cc44e',
  '#4ab8e8', '#6b9fe8', '#a87de8', '#c86fa8',
]

const showNewPlaylist = ref(false)
const newPlName      = ref('')
const newPlColor     = ref(PLAYLIST_COLORS[5])
const newPlNameRef   = ref<HTMLInputElement | null>(null)

watch(showNewPlaylist, v => { if (v) nextTick(() => newPlNameRef.value?.focus()) })

async function submitNewPlaylist() {
  if (!newPlName.value.trim()) return
  const pl = await createPlaylist(newPlName.value.trim(), newPlColor.value)
  view.value = { type: 'playlist', id: pl.id! }
  newPlName.value = ''
  showNewPlaylist.value = false
}

async function confirmDeletePlaylist() {
  if (!selectedPlaylist.value) return
  if (!confirm(`Delete playlist "${selectedPlaylist.value.name}"?`)) return
  await deletePlaylist(selectedPlaylist.value.id!)
  view.value = { type: 'all' }
}

// ── Add Track ──────────────────────────────────────────────────────────────
const TRACK_TYPES = [
  { value: 'file' as const,    label: '♫ Local File' },
  { value: 'url' as const,     label: '🔗 Audio URL' },
  { value: 'spotify' as const, label: '● Spotify' },
]

const showAddTrack = ref(false)
const newTrackType = ref<'file' | 'url' | 'spotify'>('file')
const newTrackSrc  = ref('')
const newTrackName = ref('')
const pendingFiles = ref<{ name: string; handle?: FileSystemFileHandle; file?: File }[]>([])

function openAddTrack() {
  newTrackType.value = 'file'
  newTrackSrc.value = ''
  newTrackName.value = ''
  pendingFiles.value = []
  showAddTrack.value = true
}

const canSubmitTrack = computed(() => {
  if (newTrackType.value === 'file') return pendingFiles.value.length > 0
  return newTrackSrc.value.trim() !== '' && newTrackName.value.trim() !== ''
})

async function pickFiles() {
  if ('showOpenFilePicker' in window) {
    try {
      const handles = await (window as any).showOpenFilePicker({
        types: [{ description: 'Audio', accept: { 'audio/*': ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac'] } }],
        multiple: true,
      }) as FileSystemFileHandle[]
      for (const handle of handles) {
        const file = await handle.getFile()
        pendingFiles.value.push({ name: file.name, handle, file })
      }
    } catch { /* cancelled */ }
  } else {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'audio/*'
    input.multiple = true
    input.onchange = () => {
      for (const file of Array.from(input.files ?? []))
        pendingFiles.value.push({ name: file.name, file })
    }
    input.click()
  }
}

function autoFillName() {
  if (newTrackName.value) return
  const src = newTrackSrc.value.trim()
  if (!src) return
  try {
    const url = new URL(src)
    newTrackName.value = url.pathname.split('/').pop() ?? src
  } catch { newTrackName.value = src }
}

async function submitAddTrack() {
  if (newTrackType.value === 'file') {
    for (const f of pendingFiles.value) {
      let dur: number | undefined
      if (f.file) dur = await getAudioDuration(f.file)
      await addTrack({
        name: f.name.replace(/\.[^/.]+$/, ''),
        type: 'file', src: '',
        fileHandle: f.handle ?? f.file,
        duration: dur,
      })
    }
    pendingFiles.value = []
  } else {
    await addTrack({
      name: newTrackName.value.trim(),
      type: newTrackType.value,
      src:  newTrackSrc.value.trim(),
    })
    newTrackSrc.value = ''
    newTrackName.value = ''
  }
  showAddTrack.value = false
}

// ── Edit Track ─────────────────────────────────────────────────────────────
const showEditTrack    = ref(false)
const editTrackId      = ref<number | null>(null)
const editTrackName    = ref('')
const editTrackTagsRaw = ref('')
const editNameRef      = ref<HTMLInputElement | null>(null)

watch(showEditTrack, v => { if (v) nextTick(() => editNameRef.value?.focus()) })

function openEditTrack(track: DbSoundTrack) {
  editTrackId.value      = track.id!
  editTrackName.value    = track.name
  editTrackTagsRaw.value = parseTags(track.tags).join(', ')
  showEditTrack.value    = true
}

async function submitEditTrack() {
  if (!editTrackId.value || !editTrackName.value.trim()) return
  const tags = editTrackTagsRaw.value
    .split(',')
    .map(t => t.trim().toLowerCase().replace(/\s+/g, '-'))
    .filter(Boolean)
  await updateTrack(editTrackId.value, {
    name: editTrackName.value.trim(),
    tags: JSON.stringify(tags),
  })
  showEditTrack.value = false
}

async function confirmDeleteTrack(id: number) {
  const track = tracks.value.find(t => t.id === id)
  if (!confirm(`Delete "${track?.name ?? 'track'}"? It will be removed from all playlists.`)) return
  await deleteTrack(id)
}

// ── Library Picker ─────────────────────────────────────────────────────────
const showLibraryPicker = ref(false)
const librarySearch     = ref('')
const pickedTrackIds    = ref<number[]>([])

function openLibraryPicker() {
  librarySearch.value  = ''
  pickedTrackIds.value = []
  showLibraryPicker.value = true
}

const filteredLibraryTracks = computed(() => {
  const q = librarySearch.value.toLowerCase()
  return sortedTracks.value.filter(t =>
    !q || t.name.toLowerCase().includes(q) || parseTags(t.tags).some(tag => tag.includes(q))
  )
})

function isInCurrentPlaylist(trackId: number): boolean {
  if (!selectedPlaylist.value) return false
  return (JSON.parse(selectedPlaylist.value.trackIds) as number[]).includes(trackId)
}

async function submitLibraryPick() {
  if (!selectedPlaylist.value) return
  for (const id of pickedTrackIds.value)
    await addTrackToPlaylist(selectedPlaylist.value.id!, id)
  showLibraryPicker.value = false
}

async function removeFromPlaylist(trackId: number) {
  if (!selectedPlaylist.value) return
  await removeTrackFromPlaylist(selectedPlaylist.value.id!, trackId)
}

// ── Helpers ────────────────────────────────────────────────────────────────
function getAudioDuration(file: File): Promise<number | undefined> {
  return new Promise(resolve => {
    const el  = document.createElement('audio')
    const url = URL.createObjectURL(file)
    el.src = url
    el.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(isFinite(el.duration) ? el.duration : undefined) }
    el.onerror          = () => { URL.revokeObjectURL(url); resolve(undefined) }
  })
}

function shortenUrl(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}
</script>

<style scoped>
.snd-page {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Sidebar ─────────────────────────────────────────────── */
.snd-sidebar {
  width: 210px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-bottom: 60px;
}

.snd-sb-section {
  border-bottom: 1px solid var(--border);
  padding-bottom: 6px;
}
.snd-sb-section:last-child { border-bottom: none; }

.snd-sb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 14px 6px;
  flex-shrink: 0;
}

.snd-sb-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text3);
  font-family: var(--fm);
}

.snd-sb-add {
  width: 22px; height: 22px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: none;
  color: var(--text3);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  display: flex; align-items: center; justify-content: center;
}
.snd-sb-add:hover { color: var(--text); background: var(--bg); }

.snd-sb-empty { font-size: 12px; color: var(--text3); padding: 4px 14px 8px; font-style: italic; }

.snd-pl-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  width: 100%;
  color: var(--text2);
  font-size: 13px;
  transition: background 0.1s;
  border-left: 2px solid transparent;
}
.snd-pl-item:hover { background: var(--bg); color: var(--text); }
.snd-pl-item.active {
  background: color-mix(in oklch, var(--pl-color, var(--accent)) 8%, transparent);
  border-left-color: var(--pl-color, var(--accent));
  color: var(--text);
}

.snd-pl-dot {
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--pl-color);
  flex-shrink: 0;
}

.snd-pl-icon { font-size: 12px; flex-shrink: 0; color: var(--text3); }

.snd-tag-hash {
  font-size: 13px;
  color: var(--accent-l);
  font-weight: 700;
  flex-shrink: 0;
  line-height: 1;
}

.snd-pl-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.snd-pl-count { font-size: 10px; color: var(--text3); font-family: var(--fm); flex-shrink: 0; }

/* ── Main panel ──────────────────────────────────────────── */
.snd-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-bottom: 60px;
}

.snd-hdr {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  gap: 12px;
}

.snd-hdr-left { display: flex; align-items: center; gap: 10px; }
.snd-hdr-dot { width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0; }
.snd-hdr-name { font-size: 17px; font-weight: 700; color: var(--text); }
.snd-hdr-count { font-size: 12px; color: var(--text3); }

.snd-hdr-tag-prefix {
  font-size: 17px;
  font-weight: 700;
  color: var(--accent-l);
}

.snd-hdr-actions { display: flex; align-items: center; gap: 8px; }

.snd-play-all {
  padding: 5px 14px;
  border-radius: 20px;
  border: none;
  background: var(--pl-color, var(--accent));
  color: #fff;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.9;
  transition: opacity 0.1s;
}
.snd-play-all:hover { opacity: 1; }

.snd-add-track-btn {
  padding: 5px 12px;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.1s;
}
.snd-add-track-btn:hover { border-color: var(--accent); color: var(--accent-l); }

.snd-del-pl {
  background: none; border: none; cursor: pointer; color: var(--text3);
  font-size: 13px; padding: 4px 6px; border-radius: 4px;
}
.snd-del-pl:hover { color: var(--danger); background: color-mix(in oklch, var(--danger) 10%, transparent); }

/* ── Track list ──────────────────────────────────────────── */
.snd-tracks { display: flex; flex-direction: column; padding: 8px 12px; gap: 2px; }

.snd-tracks-empty {
  display: flex; flex-direction: column; align-items: center; gap: 12px;
  padding: 40px 20px; color: var(--text3); font-style: italic; font-size: 13px;
}

.snd-track {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: 6px;
  transition: background 0.1s;
  cursor: default;
}
.snd-track:hover { background: var(--surface); }
.snd-track.playing { background: color-mix(in oklch, var(--accent) 8%, transparent); }

.snd-track-num { width: 28px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.snd-track-play {
  background: none; border: none; cursor: pointer;
  font-size: 13px; color: var(--text3); padding: 2px 4px; border-radius: 3px;
  transition: color 0.1s;
}
.snd-track-play:hover { color: var(--text); }
.snd-track-play.active { color: var(--accent-l); }

.snd-track-type-icon { width: 22px; flex-shrink: 0; font-size: 12px; text-align: center; color: var(--text3); }

.snd-track-body { flex: 1; min-width: 0; }
.snd-track-name { display: block; font-size: 13px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.snd-track-sub { font-size: 10.5px; color: var(--text3); }
.snd-track-sub--spotify { color: #1db954; }

.snd-track-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
  flex-shrink: 0;
  max-width: 160px;
}

.snd-tag-chip {
  font-size: 10px;
  color: var(--accent-l);
  background: color-mix(in oklch, var(--accent) 10%, transparent);
  border: 1px solid color-mix(in oklch, var(--accent) 25%, transparent);
  border-radius: 20px;
  padding: 1px 6px;
  white-space: nowrap;
  font-family: var(--fm);
}

.snd-track-actions { display: flex; align-items: center; gap: 4px; opacity: 0; transition: opacity 0.1s; }
.snd-track:hover .snd-track-actions { opacity: 1; }
.snd-track-act {
  background: none; border: none; cursor: pointer; font-size: 12px;
  color: var(--text3); padding: 3px 5px; border-radius: 3px;
}
.snd-track-act:hover { color: var(--text); background: var(--bg); }
.snd-track-act--del:hover { color: var(--danger); }

/* ── Empty state ─────────────────────────────────────────── */
.snd-empty-state {
  flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; color: var(--text3);
}
.snd-empty-icon { font-size: 48px; opacity: 0.3; }
.snd-empty-label { font-size: 14px; }

/* ── Dialogs ─────────────────────────────────────────────── */
.snd-dialog-mask {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 500;
}
.snd-dialog {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 10px;
  width: 340px;
  overflow: hidden;
}
.snd-dialog--wide { width: 440px; }

.snd-dlg-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border);
}
.snd-dlg-title { font-size: 14px; font-weight: 700; color: var(--text); }
.snd-dlg-close { background: none; border: none; cursor: pointer; color: var(--text3); font-size: 13px; }
.snd-dlg-close:hover { color: var(--text); }

.snd-dlg-body { padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.snd-dlg-label { font-size: 11px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.06em; font-family: var(--fm); }
.snd-dlg-input {
  width: 100%; padding: 7px 10px; border-radius: 6px;
  background: var(--bg); border: 1px solid var(--border);
  font-size: 13px; color: var(--text); box-sizing: border-box;
}
.snd-dlg-input:focus { outline: none; border-color: var(--border-hi); }
.snd-dlg-hint { font-size: 12px; color: var(--text3); margin: 0; }
.snd-dlg-hint-sm { font-size: 11px; color: var(--text3); margin-right: auto; }

.snd-dlg-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border);
}

.snd-color-row { display: flex; gap: 6px; flex-wrap: wrap; }
.snd-color-swatch {
  width: 22px; height: 22px; border-radius: 50%;
  border: 2px solid transparent; cursor: pointer;
  transition: transform 0.1s;
}
.snd-color-swatch:hover { transform: scale(1.15); }

.snd-type-tabs { display: flex; gap: 4px; margin-bottom: 12px; }
.snd-type-tab {
  flex: 1; padding: 6px; border-radius: 6px; font-size: 12px; font-weight: 600;
  border: 1px solid var(--border); background: var(--bg); color: var(--text2);
  cursor: pointer; transition: all 0.1s;
}
.snd-type-tab.active {
  background: color-mix(in oklch, var(--accent) 12%, transparent);
  border-color: color-mix(in oklch, var(--accent) 40%, transparent);
  color: var(--accent-l);
}

.snd-file-pick-btn {
  padding: 10px; border-radius: 8px; width: 100%;
  border: 1px dashed var(--border); background: none;
  color: var(--text2); font-size: 13px; cursor: pointer;
  transition: all 0.1s;
}
.snd-file-pick-btn:hover { border-color: var(--accent); color: var(--accent-l); }

.snd-pending-files { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; }
.snd-pending-file { display: flex; align-items: center; gap: 6px; background: var(--bg); padding: 5px 8px; border-radius: 5px; }
.snd-pending-name { flex: 1; font-size: 12px; color: var(--text2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.snd-del-pending { background: none; border: none; cursor: pointer; color: var(--text3); font-size: 11px; }
.snd-del-pending:hover { color: var(--danger); }

/* ── Library Picker ──────────────────────────────────────── */
.snd-lib-list {
  margin-top: 10px;
  max-height: 300px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.snd-lib-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.1s;
  font-size: 13px;
}
.snd-lib-row:hover { background: var(--bg); }
.snd-lib-row--added { opacity: 0.45; cursor: default; }

.snd-lib-type { font-size: 12px; color: var(--text3); width: 18px; flex-shrink: 0; text-align: center; }
.snd-lib-name { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text); }
.snd-lib-added { font-size: 10px; color: var(--text3); font-style: italic; flex-shrink: 0; }
.snd-lib-empty { font-size: 12px; color: var(--text3); text-align: center; padding: 20px; font-style: italic; }
</style>

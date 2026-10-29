<template>
  <div class="settings-shell screen-in">

    <!-- Left nav -->
    <nav class="settings-nav">
      <div class="settings-nav-group">
        <div class="settings-nav-label">Preferences</div>
        <button
          v-for="s in NAV_SECTIONS"
          :key="s.id"
          class="settings-nav-item"
          :class="{ active: activeSection === s.id }"
          @click="activeSection = s.id"
        >
          <span class="settings-nav-icon">{{ s.icon }}</span>
          {{ s.label }}
        </button>
      </div>


      <div class="settings-nav-group">
        <div class="settings-nav-label">Data</div>
        <button
          class="settings-nav-item"
          :class="{ active: activeSection === 'data' }"
          @click="activeSection = 'data'"
        >
          <span class="settings-nav-icon">⬡</span>
          Import &amp; Export
        </button>
        <button
          class="settings-nav-item settings-nav-item--danger"
          :class="{ active: activeSection === 'danger' }"
          @click="activeSection = 'danger'"
        >
          <span class="settings-nav-icon">⚠</span>
          Danger Zone
        </button>
      </div>

      <div class="settings-nav-group">
        <div class="settings-nav-label">Info</div>
        <button
          class="settings-nav-item"
          :class="{ active: activeSection === 'about' }"
          @click="activeSection = 'about'"
        >
          <span class="settings-nav-icon">◎</span>
          About
        </button>
      </div>
    </nav>

    <!-- Body -->
    <div class="settings-body">

      <!-- Appearance -->
      <section v-if="activeSection === 'appearance'" class="sett-section">
        <div class="sett-section-title">Theme</div>
        <div class="sett-group">
          <div class="sett-row sett-row--wrap">
            <div class="sett-row-text">
              <span class="sett-label">Color Theme</span>
              <span class="sett-desc">Overall color palette for the interface</span>
            </div>
            <div class="theme-grid">
              <button
                v-for="t in THEMES"
                :key="t.id"
                class="theme-card"
                :class="{ active: settings.theme === t.id }"
                :title="t.name"
                @click="update('theme', t.id)"
              >
                <div class="theme-card-preview" :style="{ background: t.bg }">
                  <div class="theme-card-surface" :style="{ background: t.surface }" />
                </div>
                <span class="theme-card-name">{{ t.name }}</span>
              </button>
            </div>
          </div>

          <div class="sett-row sett-row--wrap">
            <div class="sett-row-text">
              <span class="sett-label">Accent Color</span>
              <span class="sett-desc">Highlight color used throughout the interface</span>
            </div>
            <div class="accent-row">
              <button
                v-for="p in ACCENT_PRESETS"
                :key="p.id"
                class="accent-swatch"
                :class="{ active: settings.accentPreset === p.id }"
                :title="p.name"
                :style="{ background: p.color }"
                @click="update('accentPreset', p.id)"
              />
              <label class="accent-swatch accent-swatch--custom" :class="{ active: settings.accentPreset === 'custom' }" title="Custom">
                <span v-if="settings.accentPreset !== 'custom'">+</span>
                <div v-else class="accent-swatch-dot" :style="{ background: settings.accentCustom }" />
                <input type="color" :value="settings.accentCustom" @input="onCustomAccent" style="display:none" />
              </label>
            </div>
          </div>

          <div class="sett-row">
            <div class="sett-row-text">
              <span class="sett-label">Page Animations</span>
              <span class="sett-desc">Entrance transitions on navigation</span>
            </div>
            <button class="sett-toggle" :class="{ on: settings.pageAnimations }"
              @click="update('pageAnimations', !settings.pageAnimations)" />
          </div>
          <div class="sett-row">
            <div class="sett-row-text">
              <span class="sett-label">Arcane Sparks</span>
              <span class="sett-desc">Particle burst on clicks</span>
            </div>
            <button class="sett-toggle" :class="{ on: settings.sparkEffects }"
              @click="update('sparkEffects', !settings.sparkEffects)" />
          </div>
          <div class="sett-row">
            <div class="sett-row-text">
              <span class="sett-label">Ink Write Effect</span>
              <span class="sett-desc">Animate headings letter by letter on page load</span>
            </div>
            <button class="sett-toggle" :class="{ on: settings.inkWrite }"
              @click="update('inkWrite', !settings.inkWrite)" />
          </div>
        </div>
      </section>

      <!-- Typography -->
      <section v-else-if="activeSection === 'typography'" class="sett-section">
        <div class="sett-section-title">Typography</div>
        <div class="sett-group">
          <div class="sett-row">
            <div class="sett-row-text">
              <span class="sett-label">Interface Size</span>
              <span class="sett-desc">Scale the entire UI up or down</span>
            </div>
            <div class="sett-theme-pills">
              <button class="sett-pill-btn" :class="{ active: settings.fontSize === 'compact' }"
                @click="update('fontSize', 'compact')">Compact</button>
              <button class="sett-pill-btn" :class="{ active: settings.fontSize === 'normal' }"
                @click="update('fontSize', 'normal')">Normal</button>
              <button class="sett-pill-btn" :class="{ active: settings.fontSize === 'large' }"
                @click="update('fontSize', 'large')">Large</button>
            </div>
          </div>

          <div class="sett-row sett-row--wrap">
            <div class="sett-row-text">
              <span class="sett-label">UI Font</span>
              <span class="sett-desc">Font used for the interface and notes</span>
            </div>
            <div class="font-cards">
              <button
                v-for="f in FONT_OPTIONS"
                :key="f.id"
                class="font-card"
                :class="{ active: settings.uiFont === f.id }"
                :style="{ fontFamily: f.family }"
                @click="update('uiFont', f.id)"
              >
                <span class="font-card-sample">Aa</span>
                <span class="font-card-name">{{ f.name }}</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- Shortcuts -->
      <section v-else-if="activeSection === 'shortcuts'" class="sett-section">
        <div class="sett-section-title">Keyboard Shortcuts</div>
        <div class="sett-group">
          <div v-for="group in SHORTCUT_GROUPS" :key="group.label" class="shortcut-group">
            <div class="shortcut-group-label">{{ group.label }}</div>
            <div v-for="s in group.shortcuts" :key="s.keys.join('')" class="shortcut-row">
              <span class="shortcut-desc">{{ s.desc }}</span>
              <div class="shortcut-keys">
                <kbd v-for="k in s.keys" :key="k" class="kbd">{{ k }}</kbd>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- Import & Export -->
      <div v-else-if="activeSection === 'data'" class="sett-data-cols">

        <!-- Database stats -->
        <section class="sett-section">
          <div class="sett-section-title">Database</div>
          <div class="sett-group">
            <div v-if="stats" class="sett-stats-row" style="border-bottom:none">
              <span class="sett-stat">{{ stats.campaigns }} campaigns</span>
              <span class="sett-stat">{{ stats.entities }} notes</span>
              <span class="sett-stat">{{ stats.graphs }} graphs</span>
              <span class="sett-stat">{{ stats.rulesSynced }} synced entries</span>
              <span class="sett-stat">{{ stats.rulesOwn }} own entries</span>
              <span class="sett-stat">{{ stats.images }} portraits</span>
              <span class="sett-stat">{{ stats.tokens }} tokens</span>
            </div>
          </div>
        </section>

        <!-- Image Tools -->
        <section class="sett-section">
          <div class="sett-section-title">Image Tools</div>
          <div class="sett-group">

            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Image Folder Import</span>
                <span class="sett-desc">Match a folder of images to compendium entries by filename, then set them as portraits or token art.</span>
              </div>
              <button class="sett-btn" @click="imgFolderOpen = true">↑ Import</button>
            </div>

            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Re-compress Images</span>
                <span class="sett-desc">Downscale all stored images to ≤1920 px. Check a category to also convert it to JPEG for smaller files (PNGs lose transparency).</span>
                <div class="sett-check-grid">
                  <label class="sett-check">
                    <input type="checkbox" v-model="rcJpegBanners" :disabled="recompressing" />
                    Campaign banners → JPEG
                  </label>
                  <label class="sett-check">
                    <input type="checkbox" v-model="rcJpegMaps" :disabled="recompressing" />
                    Encounter maps → JPEG
                  </label>
                  <label class="sett-check">
                    <input type="checkbox" v-model="rcJpegTokens" :disabled="recompressing" />
                    Token images → JPEG
                  </label>
                  <label class="sett-check">
                    <input type="checkbox" v-model="rcJpegRecords" :disabled="recompressing" />
                    Compendium portraits → JPEG
                  </label>
                </div>
              </div>
              <button class="sett-btn" :disabled="recompressing" @click="recompressImages">{{ recompressLabel }}</button>
            </div>

          </div>
        </section>

        <!-- Full Backup -->
        <section class="sett-section">
          <div class="sett-section-title">Full Backup</div>
          <div class="sett-group">
            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Everything</span>
                <span class="sett-desc">All campaigns, tokens, your own compendium entries and your portraits, notes and edits on synced ones (the synced content itself is not included; sync it again after importing). Coming from DM's Tome? Use the <NuxtLink to="/compendium/legacy">DM's Tome import</NuxtLink> instead — it links your library to the compendium.</span>
              </div>
              <div class="sett-btn-pair">
                <button class="sett-btn" @click="exportAll">↓ Export</button>
                <label class="sett-btn">↑ Import
                  <input type="file" accept=".json" style="display:none" @change="openImport($event, 'all')" />
                </label>
              </div>
            </div>
          </div>
        </section>

        <!-- Campaigns -->
        <section class="sett-section">
          <div class="sett-section-title">Campaigns</div>
          <div class="sett-group">

            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Campaigns</span>
                <span class="sett-desc">Campaigns with encounters, notes and links</span>
              </div>
              <div class="sett-btn-pair">
                <button class="sett-btn" @click="exportCampaigns">↓ Export</button>
                <label class="sett-btn">↑ Import
                  <input type="file" accept=".json" style="display:none" @change="openImport($event, 'campaigns')" />
                </label>
              </div>
            </div>

            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Export as Markdown</span>
                <span class="sett-desc">Download a campaign's notes as a Markdown zip</span>
                <select v-if="campaigns.length" v-model="mdExportCampaignId" class="sett-md-select">
                  <option :value="null">— choose campaign —</option>
                  <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label class="sett-check sett-export-gm">
                  <input type="checkbox" v-model="mdIncludeGmOnly" /> Include GM-only blocks
                </label>
              </div>
              <button class="sett-btn" :disabled="!mdExportCampaignId || mdExporting" @click="exportCampaignMarkdown">
                {{ mdExporting ? 'Exporting…' : '↓ Export' }}
              </button>
            </div>

            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Export for Claude</span>
                <span class="sett-desc">Single Markdown file optimised for uploading to a Claude project as reference knowledge</span>
                <select v-if="campaigns.length" v-model="claudeExportCampaignId" class="sett-md-select">
                  <option :value="null">— choose campaign —</option>
                  <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
                <label class="sett-check sett-export-gm">
                  <input type="checkbox" v-model="claudeIncludeGmOnly" /> Include GM-only blocks
                </label>
              </div>
              <button class="sett-btn sett-btn--claude" :disabled="!claudeExportCampaignId || claudeExporting" @click="exportCampaignForClaude">
                {{ claudeExporting ? 'Building…' : '↓ Export' }}
              </button>
            </div>

          </div>
        </section>

        <!-- Old library backup (left by the v4 upgrade) -->
        <section v-if="legacyLibrary" class="sett-section">
          <div class="sett-section-title">Old Rules Library</div>
          <div class="sett-group">
            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Backup from {{ legacyLibrary.savedAt.slice(0, 10) }}</span>
                <span class="sett-desc">{{ legacyLibrary.systems }} systems and {{ legacyLibrary.records }} records from DM's Tome's rules library, saved when StarTome removed it. The compendium replaces them; download the file if you want to keep them.</span>
              </div>
              <div class="sett-btn-pair">
                <button class="sett-btn" @click="downloadLegacyLibrary">↓ Download</button>
                <button class="sett-btn sett-btn--danger" @click="deleteLegacyLibrary">Delete</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Quest board -->
        <section class="sett-section">
          <div class="sett-section-title">Quest Board</div>
          <div class="sett-group">
            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Quest board export</span>
                <span class="sett-desc">A campaign's quests for players: GM-only blocks removed, reward items resolved against the compendium (level, price, rarity)</span>
                <select v-if="campaigns.length" v-model="questBoardCampaignId" class="sett-md-select">
                  <option :value="null">— choose campaign —</option>
                  <option v-for="c in campaigns" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>
              <button class="sett-btn" :disabled="!questBoardCampaignId" @click="exportQuestBoard">↓ Export</button>
            </div>
          </div>
        </section>

        <!-- Tokens -->
        <section class="sett-section">
          <div class="sett-section-title">Tokens</div>
          <div class="sett-group">
            <div class="sett-row">
              <div class="sett-row-text">
                <span class="sett-label">Token templates</span>
                <span class="sett-desc">Token templates and their images</span>
              </div>
              <div class="sett-btn-pair">
                <button class="sett-btn" @click="exportTokens">↓ Export</button>
                <label class="sett-btn">↑ Import
                  <input type="file" accept=".json" style="display:none" @change="openImport($event, 'tokens')" />
                </label>
              </div>
            </div>
          </div>
        </section>

      </div>

      <!-- Danger Zone -->
      <section v-else-if="activeSection === 'danger'" class="sett-section sett-section--danger">
        <div class="sett-section-title">Danger Zone</div>
        <div class="sett-group">
          <div class="sett-row">
            <div class="sett-row-text">
              <span class="sett-label">Wipe All Data</span>
              <span class="sett-desc">Permanently delete every campaign, token and compendium entry. This cannot be undone.</span>
            </div>
            <button class="sett-btn sett-btn--danger" @click="clearAll">Wipe</button>
          </div>
        </div>
      </section>

      <!-- About -->
      <section v-else-if="activeSection === 'about'" class="sett-section">
        <div class="sett-section-title">About</div>
        <div class="sett-about">
          <img src="/icons/icon-512.png" class="sett-about-logo" alt="StarTome"
            @error="(e: Event) => (e.target as HTMLImageElement).style.display = 'none'" />
          <div class="sett-about-info">
            <div class="sett-about-name">{{ APP_NAME }}</div>
            <div class="sett-about-version">Version {{ version }}</div>
            <div class="sett-about-desc">Offline-first D&amp;D campaign manager. All data lives in your browser — no account required.</div>
          </div>
        </div>
      </section>

    </div>
  </div>

  <ImageFolderImportModal :open="imgFolderOpen" @close="imgFolderOpen = false" />

  <ImportModal
    :open="modalOpen"
    :phase="modalPhase"
    :payload="modalPayload"
    :sections="importSections"
    :log-lines="logLines"
    :progress-done="progressDone"
    :progress-total="progressTotal"
    @close="modalOpen = false"
    @run="runImport"
    @update:sections="importSections = $event"
  />
</template>

<script setup lang="ts">
import { APP_NS, APP_NAME, exportFilename } from '~/utils/appNamespace'
import { stripGmOnly } from '~/utils/gmContent'
import JSZip from 'jszip'
import { getDb, dbApi, compressDataUrl, now, parseRecordData } from '~/composables/useDb'
import { notifyRulesChanged, rulesFindByName } from '~/composables/useRules'
import { dataUrlToBlob, resolveImageDataUrl } from '~/rules/images'
import { buildQuestBoard, imageIdsOf, itemRefNames, planRulesImport, rulesForExport, type ExportedImage, type RulesOverlay } from '~/converters/export'
import { campaignGame } from '~/types/game'
import type { Item, RulesEntity } from '~/types/rules'
import { THEMES, ACCENT_PRESETS } from '~/composables/useSettings'
import { ENTITY_TYPE_CONFIG } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import type { ImportSection, LogLine } from '../components/ImportModal.vue'

const { public: { version } } = useRuntimeConfig()
const { settings, update } = useSettings()

const NAV_SECTIONS = [
  { id: 'appearance', label: 'Appearance', icon: '◐' },
  { id: 'typography', label: 'Typography',  icon: 'T' },
  { id: 'shortcuts', label: 'Shortcuts',    icon: '⌘' },
]

const FONT_OPTIONS = [
  { id: 'dm-sans', name: 'DM Sans',       family: '"DM Sans", sans-serif' },
  { id: 'im-fell', name: 'IM Fell',       family: '"IM Fell English", Georgia, serif' },
  { id: 'system',  name: 'System',        family: 'system-ui, -apple-system, sans-serif' },
] as const

const isMac = import.meta.client && navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl'

const SHORTCUT_GROUPS = [
  {
    label: 'Global',
    shortcuts: [
      { keys: [mod, 'K'], desc: 'Open search' },
      { keys: ['Esc'],    desc: 'Close panel / search' },
      { keys: ['B'],      desc: 'Toggle sidebar (when not typing)' },
    ],
  },
  {
    label: 'Markdown Editor',
    shortcuts: [
      { keys: [mod, 'B'], desc: 'Bold' },
      { keys: [mod, 'I'], desc: 'Italic' },
    ],
  },
  {
    label: 'Encounter',
    shortcuts: [
      { keys: [mod, 'Z'], desc: 'Undo wall segment' },
    ],
  },
]

function onCustomAccent(e: Event) {
  const hex = (e.target as HTMLInputElement).value
  update('accentCustom', hex)
  update('accentPreset', 'custom')
}

const activeSection = ref('appearance')

interface DbStats {
  campaigns: number; encounters: number; encounterTokens: number
  entities: number; entityLinks: number; tokens: number
  rulesSynced: number; rulesOwn: number; images: number
  graphs: number; entityConnections: number
}

const stats = ref<DbStats | null>(null)
const campaigns = ref<{ id: number; name: string }[]>([])
const mdExportCampaignId = ref<number | null>(null)
const mdExporting = ref(false)
const mdIncludeGmOnly = ref(true)
const claudeExportCampaignId = ref<number | null>(null)
const claudeExporting = ref(false)
const claudeIncludeGmOnly = ref(true)
const questBoardCampaignId = ref<number | null>(null)

const imgFolderOpen    = ref(false)
const recompressing  = ref(false)
const rcJpegBanners  = ref(true)
const rcJpegMaps     = ref(true)
const rcJpegTokens   = ref(true)
const rcJpegRecords  = ref(true)
const recompressDone  = ref(0)
const recompressTotal = ref(0)
const recompressLabel  = computed(() => {
  if (recompressing.value) return `Working… ${recompressDone.value} / ${recompressTotal.value}`
  if (recompressTotal.value > 0 && recompressDone.value === recompressTotal.value) return `Done — ${recompressDone.value} images`
  return '↻ Compress'
})

async function recompressImages() {
  if (recompressing.value) return
  recompressing.value = true
  recompressDone.value = 0
  recompressTotal.value = 0
  try {
    const db = getDb()
    const jpegBanners = rcJpegBanners.value
    const jpegMaps    = rcJpegMaps.value
    const jpegTokens  = rcJpegTokens.value
    const jpegRecords = rcJpegRecords.value

    const [c, enc, tok, etok, imageIds] = await Promise.all([
      db.campaigns.toArray(),
      db.encounters.toArray(),
      db.tokens.toArray(),
      db.encounterTokens.toArray(),
      db.images.toCollection().primaryKeys(),
    ])

    type Task = { table: any; id: number; field: string; value: string; toJpeg: boolean }

    const tableDefs = [
      { table: db.campaigns,       rows: c,    field: 'banner_source', toJpeg: jpegBanners },
      { table: db.encounters,      rows: enc,  field: 'map_source',    toJpeg: jpegMaps    },
      { table: db.tokens,          rows: tok,  field: 'image_source',  toJpeg: jpegTokens  },
      { table: db.encounterTokens, rows: etok, field: 'image_source',  toJpeg: jpegTokens  },
    ]

    const tasks: Task[] = []
    for (const { table, rows, field, toJpeg } of tableDefs) {
      for (const row of rows) {
        const value = (row as any)[field]
        if (value?.startsWith('data:')) tasks.push({ table, id: row.id!, field, value, toJpeg })
      }
    }

    recompressTotal.value = tasks.length + imageIds.length
    for (const task of tasks) {
      const compressed = await compressDataUrl(task.value, task.toJpeg)
      await task.table.update(task.id, { [task.field]: compressed })
      recompressDone.value++
    }
    // Compendium portraits live as blobs in the image store
    for (const id of imageIds) {
      const dataUrl = await resolveImageDataUrl(`img:${id}`)
      if (dataUrl) {
        const blob = dataUrlToBlob(await compressDataUrl(dataUrl, jpegRecords))
        await db.images.update(id, { blob, mime: blob.type })
      }
      recompressDone.value++
    }
  } finally {
    recompressing.value = false
  }
}

async function loadCampaigns() {
  campaigns.value = (await dbApi.campaigns.list()).map((c: any) => ({ id: c.id, name: c.name }))
}

async function loadStats() {
  const db = getDb()
  const [c, enc, et, ent, el, tok, synced, total, img, gl, ec] = await Promise.all([
    db.campaigns.count(), db.encounters.count(), db.encounterTokens.count(),
    db.entities.count(), db.entityLinks.count(), db.tokens.count(),
    db.rules.where('origin').equals('foundry').count(), db.rules.count(), db.images.count(),
    db.graphLayouts.count(), db.entityConnections.count(),
  ])
  stats.value = { campaigns: c, encounters: enc, encounterTokens: et, entities: ent, entityLinks: el, tokens: tok, rulesSynced: synced, rulesOwn: total - synced, images: img, graphs: gl, entityConnections: ec }
}

// ── Old library backup ───────────────────────────────────────────────────────
const legacyLibrary = ref<{ savedAt: string; systems: number; records: number } | null>(null)

async function loadLegacyLibrary() {
  const db = getDb()
  const [first, systems, records] = await Promise.all([
    db.legacyLibrary.limit(1).first(),
    db.legacyLibrary.where('table').equals('systems').count(),
    db.legacyLibrary.where('table').equals('records').count(),
  ])
  legacyLibrary.value = first ? { savedAt: first.savedAt, systems, records } : null
}

async function downloadLegacyLibrary() {
  const db = getDb()
  const [systems, records] = await Promise.all([
    db.legacyLibrary.where('table').equals('systems').toArray(),
    db.legacyLibrary.where('table').equals('records').toArray(),
  ])
  if (!systems.length && !records.length) return
  const savedAt = (systems[0] ?? records[0]).savedAt
  // Same shape as DM's Tome's "systems-full" export, so DM's Tome can import it again
  download({ version: 1, type: 'systems-full', exportedAt: savedAt, systems: systems.map(s => s.row), records: records.map(r => r.row) }, exportFilename(`old-library-${savedAt.slice(0, 10)}.json`))
}

async function deleteLegacyLibrary() {
  if (!confirm('Delete the backup of the old rules library? Download it first if you might need it.')) return
  await getDb().legacyLibrary.clear()
  legacyLibrary.value = null
}

onMounted(() => { loadStats(); loadCampaigns(); loadLegacyLibrary() })

function download(data: object, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

function slug() { return now().slice(0, 10) }
function safeFilename(s: string) { return s.replace(/[/\\:*?"<>|]/g, '_') }
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

async function readJson(e: Event): Promise<any | null> {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return null
  try { return JSON.parse(await file.text()) }
  catch (err: any) { alert('Invalid file: ' + err.message); return null }
  finally { (e.target as HTMLInputElement).value = '' }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

async function exportAll() {
  const db = getDb()
  const [campaigns, encounters, encounterTokens, encounterWalls, entities, entityLinks, entitySnapshots, entityConnections, graphLayouts, tokens, characters, levelUps, inventory, purses, rulesRows, syncState] =
    await Promise.all([
      db.campaigns.toArray(), db.encounters.toArray(), db.encounterTokens.toArray(), db.encounterWalls.toArray(),
      db.entities.toArray(), db.entityLinks.toArray(), db.entitySnapshots.toArray(), db.entityConnections.toArray(), db.graphLayouts.toArray(),
      db.tokens.toArray(), db.characters.toArray(), db.levelUps.toArray(), db.inventory.toArray(), db.purses.toArray(), db.rules.toArray(), db.syncState.toArray(),
    ])
  const { entries: rules, overlays: rulesOverlays } = rulesForExport(rulesRows)
  const imageRows = await db.images.bulkGet(imageIdsOf([...rules, ...rulesOverlays] as unknown as Record<string, unknown>[]))
  const images: ExportedImage[] = await Promise.all(imageRows.filter(r => !!r).map(async r => ({ id: r!.id, mime: r!.mime, data: await blobToDataUrl(r!.blob) })))
  download({ version: 1, app: APP_NS, type: 'all', exportedAt: now(), campaigns, encounters, encounterTokens, encounterWalls, entities, entityLinks, entitySnapshots, entityConnections, graphLayouts, tokens, characters, levelUps, inventory, purses, rules, rulesOverlays, images, syncState }, exportFilename(`all-${slug()}.json`))
}

async function exportCampaigns() {
  const db = getDb()
  const campaigns = await db.campaigns.toArray()
  const campIds = campaigns.map(c => c.id as number)
  const encounters = await db.encounters.toArray()
  const encIds = encounters.map(e => e.id as number)
  const encounterTokens = encIds.length ? await db.encounterTokens.where('encounter_id').anyOf(encIds).toArray() : []
  const encounterWalls = encIds.length ? await db.encounterWalls.where('encounter_id').anyOf(encIds).toArray() : []
  const entities = await db.entities.toArray()
  const entIds = entities.map(e => e.id as number)
  const entityLinks = entIds.length ? await db.entityLinks.where('source_id').anyOf(entIds).toArray() : []
  const entitySnapshots = entIds.length ? await db.entitySnapshots.where('entity_id').anyOf(entIds).toArray() : []
  const entityConnections = campIds.length ? await db.entityConnections.where('campaign_id').anyOf(campIds).toArray() : []
  const graphLayouts = campIds.length ? await db.graphLayouts.where('campaign_id').anyOf(campIds).toArray() : []
  const characters = campIds.length ? await db.characters.where('campaign_id').anyOf(campIds).toArray() : []
  const levelUps = campIds.length ? await db.levelUps.where('campaign_id').anyOf(campIds).toArray() : []
  const inventory = campIds.length ? await db.inventory.where('campaign_id').anyOf(campIds).toArray() : []
  const purses = campIds.length ? await db.purses.where('campaign_id').anyOf(campIds).toArray() : []
  download({ version: 1, app: APP_NS, type: 'campaigns', exportedAt: now(), campaigns, encounters, encounterTokens, encounterWalls, entities, entityLinks, entitySnapshots, entityConnections, graphLayouts, characters, levelUps, inventory, purses }, exportFilename(`campaigns-${slug()}.json`))
}

/** Player-facing quest list for the quest board (FORK_PLAN §8.5). */
async function exportQuestBoard() {
  const id = questBoardCampaignId.value
  if (!id) return
  const db = getDb()
  const campaign = await db.campaigns.get(id)
  if (!campaign) return
  const game = campaignGame(campaign)
  const rows = await db.entities.where('campaign_id').equals(id).filter(e => e.type === 'quest').toArray()
  const quests = rows.map(r => ({ id: r.id!, name: r.name, content: r.content ?? '', attributes: parseRecordData(r.attributes) }))
  // Resolve every referenced item once, then build synchronously
  const items = new Map<string, Item | undefined>()
  const refs = new Set(quests.flatMap(q => [...itemRefNames(q.attributes.reward ?? ''), ...itemRefNames(q.content)]))
  for (const name of refs) items.set(name.toLowerCase(), (await rulesFindByName('item', name, game)) as Item | undefined)
  const board = buildQuestBoard(APP_NS, { name: campaign.name, game }, quests, name => items.get(name.toLowerCase()), now())
  download(board, exportFilename(`questboard-${safeFilename(campaign.name)}-${slug()}.json`))
}

async function exportTokens() {
  const db = getDb()
  const tokens = await db.tokens.toArray()
  download({ version: 1, app: APP_NS, type: 'tokens', exportedAt: now(), tokens }, exportFilename(`tokens-${slug()}.json`))
}

function wikilinkify(text: string): string {
  if (!text) return ''
  return text.replace(/\{\{(\w+):\s*([^}]+)\}\}/g, (_m, _type, name) => `[[${name.trim()}]]`)
}

function entityFrontmatter(e: any): string {
  const lines = ['---', `name: "${(e.name ?? '').replace(/"/g, '\\"')}"`, `type: "${e.type ?? ''}"`]
  if (e.tags?.length) lines.push(`tags: [${e.tags.map((t: string) => `"${t}"`).join(', ')}]`)
  lines.push('---')
  return lines.join('\n')
}

async function exportCampaignMarkdown() {
  if (!mdExportCampaignId.value) return
  mdExporting.value = true
  try {
    const db = getDb()
    const campaignId = mdExportCampaignId.value
    const gm = (md: string) => mdIncludeGmOnly.value ? md : stripGmOnly(md)
    const campaign = await db.campaigns.get(campaignId)
    if (!campaign) { alert('Campaign not found.'); return }
    const entities = (await dbApi.entities.list(campaignId)) as any[]
    const encounters = await db.encounters.where('campaign_id').equals(campaignId).toArray()
    const zip = new JSZip()
    const root = zip.folder(safeFilename(campaign.name))!
    root.file('_index.md', [`---`, `name: "${campaign.name.replace(/"/g, '\\"')}"`, `---`, ``, `# ${campaign.name}`, ``, campaign.description ? wikilinkify(gm(campaign.description)) : '_No description._'].join('\n'))
    const notesFolder = root.folder('notes')!
    for (const e of entities) {
      const folder = notesFolder.folder(safeFilename(e.type ?? 'misc'))!
      folder.file(`${safeFilename(e.name ?? 'Unnamed')}.md`, [entityFrontmatter(e), '', `# ${e.name ?? 'Unnamed'}`, '', wikilinkify(gm(e.content ?? e.notes ?? '')) || '_No content._'].join('\n'))
    }
    if (encounters.length) {
      const encFolder = root.folder('encounters')!
      encFolder.file('_index.md', [`# Encounters — ${campaign.name}`, '', ...encounters.map(enc => `- **${enc.name ?? 'Unnamed'}**`)].join('\n'))
    }
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, `${safeFilename(campaign.name)}-${slug()}.zip`)
  } finally { mdExporting.value = false }
}

// ── Claude export ─────────────────────────────────────────────────────────────

const CLAUDE_TYPE_ORDER: EntityType[] = ['npc', 'location', 'faction', 'quest', 'event', 'session', 'note', 'rumor', 'random-table']

type MetaField = { key: string; label: string; transform?: (v: any) => string | false; alwaysEmit?: boolean }

function buildMeta(a: Record<string, any>, fields: MetaField[]): string {
  const parts: string[] = []
  for (const { key, label, transform, alwaysEmit } of fields) {
    const v = a[key]
    if (!alwaysEmit && (v === undefined || v === null || v === '')) continue
    const text = transform ? transform(v) : String(v)
    if (text !== false) parts.push(`**${label}:** ${text}`)
  }
  return parts.join(' | ')
}

const META_FIELDS: Partial<Record<EntityType, MetaField[]>> = {
  npc: [
    { key: 'isPlayerCharacter', label: 'PC',    transform: v => v ? 'Yes' : false },
    { key: 'title',  label: 'Title' },
    { key: 'race',   label: 'Race' },
    { key: 'role',   label: 'Role' },
    { key: 'level',  label: 'Level' },
    { key: 'isAlive', label: 'Vital', transform: v => v === false ? 'Dead' : 'Alive', alwaysEmit: true },
    { key: 'status', label: 'Status' },
  ],
  location: [
    { key: 'locationType', label: 'Type' },
    { key: 'status',       label: 'Status' },
  ],
  faction: [
    { key: 'factionType',     label: 'Type' },
    { key: 'size',            label: 'Size' },
    { key: 'isSecret',        label: 'Secret',  transform: v => v ? 'Yes' : false },
    { key: 'headquartersName', label: 'HQ' },
  ],
  quest: [
    { key: 'status',     label: 'Status' },
    { key: 'questGiver', label: 'Quest Giver' },
    { key: 'reward',     label: 'Reward' },
  ],
  event: [
    { key: 'date',     label: 'Date' },
    { key: 'location', label: 'Location' },
  ],
  session: [
    { key: 'mode', label: 'Status' },
    { key: 'date', label: 'Date' },
  ],
}

function entityMeta(type: string, attrs: any): string {
  if (!attrs || typeof attrs !== 'object') return ''
  const fields = META_FIELDS[type as EntityType]
  return fields ? buildMeta(attrs, fields) : ''
}

function renderLinks(linksByEntity: Map<number, any[]>, entityId: number, entityIndex: Map<number, string>): string {
  const entityLinks = linksByEntity.get(entityId)
  if (!entityLinks?.length) return ''
  const names: string[] = []
  for (const l of entityLinks) {
    const otherId = l.source_id === entityId ? l.target_id : l.source_id
    const name = entityIndex.get(otherId)
    if (name) names.push(name)
  }
  if (!names.length) return ''
  return `\n**Related:** ${names.map(n => `[[${n}]]`).join(', ')}`
}

async function exportCampaignForClaude() {
  if (!claudeExportCampaignId.value) return
  claudeExporting.value = true
  try {
    const db = getDb()
    const campaignId = claudeExportCampaignId.value
    const gm = (md: string) => claudeIncludeGmOnly.value ? md : stripGmOnly(md)
    const campaign = await db.campaigns.get(campaignId)
    if (!campaign) { alert('Campaign not found.'); return }

    const rawEntities = (await dbApi.entities.list(campaignId)) as any[]
    const entIds = rawEntities.map(e => e.id as number)
    const rawLinks = entIds.length ? await db.entityLinks.where('source_id').anyOf(entIds).toArray() : []

    const entityIndex = new Map<number, string>()
    for (const e of rawEntities) entityIndex.set(e.id, e.name ?? 'Unnamed')

    // attributes can arrive as a serialised JSON string from the DB
    const entities = rawEntities.map(e => {
      let attrs: any = e.attributes ?? {}
      if (typeof attrs === 'string') { try { attrs = JSON.parse(attrs) } catch { attrs = {} } }
      return { ...e, attributes: attrs }
    })

    const linksByEntity = new Map<number, any[]>()
    for (const l of rawLinks) {
      for (const id of [l.source_id, l.target_id]) {
        if (!linksByEntity.has(id)) linksByEntity.set(id, [])
        linksByEntity.get(id)!.push(l)
      }
    }

    const byType = new Map<string, typeof entities>()
    for (const e of entities) {
      const t = e.type ?? 'note'
      if (!byType.has(t)) byType.set(t, [])
      byType.get(t)!.push(e)
    }

    const lines: string[] = []
    const exportDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

    lines.push(`# ${campaign.name} — Campaign Knowledge Base`)
    lines.push(`*Exported from ${APP_NAME} · ${exportDate}*`)
    if (campaign.description) {
      lines.push('')
      lines.push('## Campaign Overview')
      lines.push('')
      lines.push(wikilinkify(gm(campaign.description)))
    }

    const orderedTypes = [
      ...CLAUDE_TYPE_ORDER.filter(t => byType.has(t)),
      ...[...byType.keys()].filter(t => !CLAUDE_TYPE_ORDER.includes(t as EntityType)),
    ]

    for (const type of orderedTypes) {
      const entries = byType.get(type)!
      const label = ENTITY_TYPE_CONFIG[type as EntityType]?.plural ?? type
      lines.push('')
      lines.push(`---`)
      lines.push('')
      lines.push(`## ${label} (${entries.length})`)

      for (const e of entries) {
        lines.push('')
        lines.push(`### ${e.name ?? 'Unnamed'}`)

        const meta = entityMeta(type, e.attributes)
        if (meta) lines.push(meta)

        const relatedLine = renderLinks(linksByEntity, e.id, entityIndex)
        if (relatedLine) lines.push(relatedLine)

        const body = wikilinkify(gm(e.content ?? e.notes ?? ''))
        if (body.trim()) {
          lines.push('')
          lines.push(body.trim())
        }
      }
    }

    lines.push('')
    lines.push('---')
    lines.push(`*${entities.length} entries across ${orderedTypes.length} categories*`)

    downloadBlob(new Blob([lines.join('\n')], { type: 'text/markdown' }), `${safeFilename(campaign.name)}-claude-${slug()}.md`)
  } finally { claudeExporting.value = false }
}

const modalOpen    = ref(false)
const modalPhase   = ref<'configure' | 'running' | 'done'>('configure')
const modalPayload = ref<any>(null)
const importSections   = ref<ImportSection[]>([])
const logLines         = ref<LogLine[]>([])
const progressDone     = ref(0)
const progressTotal    = ref(0)

async function openImport(e: Event, _expectedType: string) {
  const payload = await readJson(e)
  if (!payload) return
  modalPayload.value = markRaw(payload)
  buildImportSections(payload)
  modalPhase.value = 'configure'; logLines.value = []; progressDone.value = 0; progressTotal.value = 0
  modalOpen.value = true
}

function buildImportSections(payload: any) {
  const sections: ImportSection[] = []
  function addSection(key: string, label: string) {
    const arr: any[] | undefined = payload[key]
    if (arr && arr.length > 0) sections.push({ key, label, count: arr.length, enabled: true })
  }
  addSection('campaigns', 'Campaigns'); addSection('encounters', 'Encounters')
  addSection('encounterTokens', 'Encounter Tokens'); addSection('encounterWalls', 'Encounter Walls')
  addSection('entities', 'Notes & Entities'); addSection('entityLinks', 'Entity Links')
  addSection('entitySnapshots', 'Entity Snapshots'); addSection('entityConnections', 'Entity Connections')
  addSection('graphLayouts', 'Graphs'); addSection('tokens', 'Tokens')
  addSection('characters', 'Party members'); addSection('levelUps', 'Level-ups')
  addSection('inventory', 'Inventory'); addSection('purses', 'Purses')
  addSection('rules', 'Own compendium entries'); addSection('rulesOverlays', 'Portraits, notes & edits on synced entries')
  importSections.value = sections
}

async function runImport() {
  if (!modalPayload.value) return
  const payload = modalPayload.value
  const db = getDb()
  modalPhase.value = 'running'; logLines.value = []; progressDone.value = 0
  const addLog = (ok: boolean, msg: string) => { logLines.value = [...logLines.value, { ok, msg }] }
  if (payload.systems?.length || payload.records?.length) {
    addLog(false, `Skipped ${payload.systems?.length ?? 0} systems and ${payload.records?.length ?? 0} records: DM's Tome's rules library is imported through Compendium › DM's Tome import, which links it to the synced compendium.`)
  }
  type WorkItem = { table: any; row: any }
  const work: WorkItem[] = []
  function queueSection(key: string, table: any) {
    const sec = importSections.value.find(s => s.key === key)
    if (!sec?.enabled) return
    for (const row of (payload[key] ?? [])) {
      if (key === 'entities' && typeof row.attributes !== 'string') {
        row.attributes = JSON.stringify(row.attributes ?? {})
      }
      work.push({ table, row })
    }
  }
  queueSection('campaigns', db.campaigns); queueSection('encounters', db.encounters)
  queueSection('encounterTokens', db.encounterTokens); queueSection('encounterWalls', db.encounterWalls)
  queueSection('entities', db.entities); queueSection('entityLinks', db.entityLinks)
  queueSection('entitySnapshots', db.entitySnapshots); queueSection('entityConnections', db.entityConnections)
  queueSection('graphLayouts', db.graphLayouts); queueSection('tokens', db.tokens)
  queueSection('characters', db.characters); queueSection('levelUps', db.levelUps)
  queueSection('inventory', db.inventory); queueSection('purses', db.purses)
  // Compendium: images first (entries point at them), then entries and overlays
  const rulesSec = importSections.value.find(s => s.key === 'rules')
  const overlaySec = importSections.value.find(s => s.key === 'rulesOverlays')
  const rulesEntries: RulesEntity[] = rulesSec?.enabled ? (payload.rules ?? []) : []
  const rulesOverlays: RulesOverlay[] = overlaySec?.enabled ? (payload.rulesOverlays ?? []) : []
  if (rulesEntries.length || rulesOverlays.length) {
    const wanted = new Set(imageIdsOf([...rulesEntries, ...rulesOverlays] as unknown as Record<string, unknown>[]))
    for (const img of (payload.images ?? []) as ExportedImage[]) {
      if (!wanted.has(img.id)) continue
      const blob = dataUrlToBlob(img.data)
      work.push({ table: db.images, row: { id: img.id, blob, mime: img.mime || blob.type, createdAt: now() } })
    }
    const existing = new Map((await db.rules.bulkGet(rulesOverlays.map(o => o.id))).filter((r): r is RulesEntity => !!r).map(r => [r.id, r]))
    const plan = planRulesImport(existing, rulesEntries, rulesOverlays, now())
    for (const row of plan.put) work.push({ table: db.rules, row })
    if (plan.missing.length) addLog(false, `${plan.missing.length} portraits/notes belong to synced entries this browser doesn't have yet. Run the Foundry sync, then import this file again.`)
  }
  progressTotal.value = work.length
  if (progressTotal.value === 0) { addLog(false, 'Nothing was selected to import.'); modalPhase.value = 'done'; return }
  const BATCH = 50
  for (let i = 0; i < work.length; i += BATCH) {
    const batch = work.slice(i, i + BATCH)
    const results = await Promise.allSettled(batch.map(item => item.table.put(item.row)))
    let batchOk = 0
    const newLines: LogLine[] = []
    for (let j = 0; j < batch.length; j++) {
      if (results[j].status === 'fulfilled') batchOk++
      else newLines.push({ ok: false, msg: `Failed: ${(results[j] as PromiseRejectedResult).reason}` })
      progressDone.value++
    }
    if (batchOk > 0) newLines.unshift({ ok: true, msg: `Imported ${batchOk} items (batch ${Math.floor(i / BATCH) + 1})` })
    logLines.value = [...logLines.value, ...newLines]
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  notifyRulesChanged()
  await loadStats()
  modalPhase.value = 'done'
}

async function clearAll() {
  if (!confirm('Permanently delete ALL data — campaigns, tokens, the compendium, everything?')) return
  if (!confirm('Last chance: this cannot be undone. Continue?')) return
  const db = getDb()
  await Promise.all([
    db.campaigns.clear(), db.encounters.clear(), db.encounterTokens.clear(), db.encounterWalls.clear(),
    db.entities.clear(), db.entityLinks.clear(), db.entitySnapshots.clear(), db.entityConnections.clear(), db.graphLayouts.clear(),
    db.tokens.clear(), db.characters.clear(), db.levelUps.clear(), db.inventory.clear(), db.purses.clear(), db.rules.clear(), db.images.clear(), db.syncState.clear(), db.legacyLibrary.clear(),
  ])
  notifyRulesChanged()
  await loadStats()
  alert('All data has been wiped.')
}
</script>

<style scoped>
.settings-shell {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-width: 0;
  background: var(--bg);
}

/* Left nav */
.settings-nav {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 16px 8px;
  overflow-y: auto;
}

.settings-nav-group {
  display: flex;
  flex-direction: column;
  margin-bottom: 20px;
}

.settings-nav-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text3);
  padding: 4px 10px 6px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: var(--r1);
  border: none;
  background: none;
  color: var(--text2);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s, color 0.12s;
  font-family: var(--fu);
}
.settings-nav-item:hover { background: var(--surface-hi); color: var(--text); }
.settings-nav-item.active { background: var(--accent-bg); color: var(--accent); }
.settings-nav-item--danger { color: var(--danger); }
.settings-nav-item--danger:hover { background: var(--danger-bg); color: var(--danger); }
.settings-nav-item--danger.active { background: var(--danger-bg); color: var(--danger); }
.settings-nav-icon { font-size: 14px; flex-shrink: 0; opacity: 0.7; }

/* Body */
.settings-body {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 28px 32px;
}

/* Section */
.sett-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r3);
  overflow: hidden;
  max-width: 640px;
}

.sett-section-title {
  font-family: var(--fh);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--text2);
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--border);
}
.sett-section--danger .sett-section-title { color: var(--danger); }

.sett-group { display: flex; flex-direction: column; }

.sett-stats-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.sett-stat {
  font-family: var(--fm);
  font-size: 11px;
  color: var(--text3);
  background: var(--surface-hi);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 2px 9px;
}

.sett-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.sett-row:last-child { border-bottom: none; }

.sett-row-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-width: 0;
}
.sett-label { font-size: 13px; font-weight: 500; color: var(--text); }
.sett-desc { font-size: 11px; color: var(--text3); line-height: 1.4; }
.sett-check { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--text2); cursor: pointer; user-select: none; }
.sett-check input[type="checkbox"] { accent-color: var(--accent); cursor: pointer; }
.sett-export-gm { margin-top: 6px; }
.sett-check-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 16px; margin-top: 8px; }
.sett-data-cols { display: flex; flex-direction: column; gap: 12px; max-width: 640px; }

.sett-theme-pills { display: flex; gap: 4px; flex-shrink: 0; margin-top: 2px; }
.sett-pill-btn {
  padding: 4px 12px;
  border-radius: var(--r1);
  border: 1px solid var(--border);
  background: none;
  color: var(--text2);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s;
  font-family: var(--fu);
}
.sett-pill-btn:hover { border-color: var(--border-hi); color: var(--text); }
.sett-pill-btn.active { background: var(--accent-bg); border-color: oklch(58% 0.24 295 / 0.4); color: var(--accent); font-weight: 500; }

.sett-toggle {
  flex-shrink: 0;
  width: 38px;
  height: 20px;
  border-radius: 10px;
  background: var(--surface-hi);
  border: 1px solid var(--border);
  position: relative;
  cursor: pointer;
  transition: background 0.2s, border-color 0.2s;
  margin-top: 2px;
}
.sett-toggle::after {
  content: '';
  position: absolute;
  top: 2px; left: 2px;
  width: 14px; height: 14px;
  border-radius: 50%;
  background: var(--text3);
  transition: transform 0.2s, background 0.2s;
}
.sett-toggle.on { background: var(--accent-bg); border-color: oklch(58% 0.24 295 / 0.4); }
.sett-toggle.on::after { transform: translateX(18px); background: var(--accent); }

.sett-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: var(--r1);
  background: var(--surface-hi);
  border: 1px solid var(--border);
  color: var(--text2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.12s;
  margin-top: 2px;
  font-family: var(--fu);
}
.sett-btn:hover { border-color: var(--border-hi); color: var(--text); }
.sett-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sett-btn--danger { color: var(--danger); border-color: oklch(54% 0.22 22 / 0.3); }
.sett-btn--danger:hover { background: var(--danger-bg); border-color: var(--danger); }
.sett-btn--claude { color: #d97706; border-color: rgba(217, 119, 6, 0.35); }
.sett-btn--claude:not(:disabled):hover { background: rgba(217, 119, 6, 0.1); border-color: #d97706; color: #b45309; }

.sett-btn-pair { display: flex; gap: 4px; flex-shrink: 0; margin-top: 2px; }

.sett-md-select {
  margin-top: 6px;
  font-size: 12px;
  color: var(--text);
  background: var(--surface-hi);
  border: 1px solid var(--border);
  border-radius: var(--r1);
  padding: 4px 8px;
  max-width: 220px;
  cursor: pointer;
  outline: none;
  font-family: var(--fu);
}
.sett-md-select:focus { border-color: oklch(58% 0.24 295 / 0.5); }

.sett-about { display: flex; align-items: center; gap: 16px; padding: 20px 16px; }
.sett-about-logo { width: 48px; height: 48px; border-radius: 10px; object-fit: cover; opacity: 0.85; flex-shrink: 0; }
.sett-about-name { font-family: var(--fh); font-size: 16px; color: var(--text); margin-bottom: 3px; }
.sett-about-version { font-family: var(--fm); font-size: 11px; color: var(--accent); margin-bottom: 6px; }
.sett-about-desc { font-size: 12px; color: var(--text3); line-height: 1.5; }

.sett-row--wrap { flex-wrap: wrap; gap: 10px; }

/* ── Theme cards ── */
.theme-grid {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.theme-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  background: none;
  border: 2px solid var(--border);
  border-radius: var(--r2);
  padding: 6px;
  cursor: pointer;
  transition: border-color 0.15s;
}
.theme-card:hover { border-color: var(--border-hi); }
.theme-card.active { border-color: var(--accent); }
.theme-card-preview {
  width: 52px;
  height: 36px;
  border-radius: 6px;
  overflow: hidden;
  display: flex;
  align-items: flex-end;
  padding: 4px;
}
.theme-card-surface {
  width: 100%;
  height: 60%;
  border-radius: 3px;
  opacity: 0.9;
}
.theme-card-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--text2);
  letter-spacing: 0.04em;
}
.theme-card.active .theme-card-name { color: var(--accent); }

/* ── Accent swatches ── */
.accent-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
}
.accent-swatch {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  transition: transform 0.12s, border-color 0.12s;
  flex-shrink: 0;
}
.accent-swatch:hover { transform: scale(1.15); }
.accent-swatch.active { border-color: var(--text); transform: scale(1.15); }
.accent-swatch--custom {
  background: var(--surface-hi);
  border-color: var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: var(--text3);
  font-weight: 600;
}
.accent-swatch--custom.active { border-color: var(--text); }
.accent-swatch-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
}

/* ── Font cards ── */
.font-cards {
  display: flex;
  gap: 8px;
}
.font-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  background: none;
  border: 2px solid var(--border);
  border-radius: var(--r2);
  padding: 10px 14px;
  cursor: pointer;
  transition: border-color 0.15s;
  min-width: 72px;
}
.font-card:hover { border-color: var(--border-hi); }
.font-card.active { border-color: var(--accent); }
.font-card-sample {
  font-size: 22px;
  color: var(--text);
  line-height: 1;
}
.font-card-name {
  font-size: 10px;
  font-weight: 600;
  color: var(--text3);
  font-family: var(--fu);
  letter-spacing: 0.04em;
}
.font-card.active .font-card-name { color: var(--accent); }

/* ── Shortcuts ── */
.shortcut-group {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}
.shortcut-group:last-child { border-bottom: none; }
.shortcut-group-label {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text3);
  margin-bottom: 8px;
}
.shortcut-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 0;
  gap: 12px;
}
.shortcut-desc {
  font-size: 13px;
  color: var(--text2);
}
.shortcut-keys {
  display: flex;
  gap: 4px;
  align-items: center;
  flex-shrink: 0;
}
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 22px;
  padding: 0 6px;
  background: var(--surface-hi);
  border: 1px solid var(--border-hi);
  border-bottom-width: 2px;
  border-radius: 5px;
  font-family: var(--fm);
  font-size: 11px;
  font-weight: 600;
  color: var(--text2);
  white-space: nowrap;
}
</style>

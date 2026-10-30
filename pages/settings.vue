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
        <NuxtLink to="/data" class="settings-nav-item">
          <span class="settings-nav-icon">⬡</span>
          Import &amp; Export ›
        </NuxtLink>
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
</template>

<script setup lang="ts">
import { APP_NAME } from '~/utils/appNamespace'
import { getDb } from '~/composables/useDb'
import { notifyRulesChanged } from '~/composables/useRules'
import { invalidateEntities } from '~/composables/useEntities'
import { THEMES, ACCENT_PRESETS } from '~/composables/useSettings'

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

async function clearAll() {
  if (!confirm('Permanently delete ALL data — campaigns, tokens, the compendium, everything?')) return
  if (!confirm('Last chance: this cannot be undone. Continue?')) return
  const db = getDb()
  await Promise.all([
    db.campaigns.clear(), db.encounters.clear(), db.encounterTokens.clear(), db.encounterWalls.clear(),
    db.entities.clear(), db.entityLinks.clear(), db.entitySnapshots.clear(), db.entityConnections.clear(), db.graphLayouts.clear(),
    db.tokens.clear(), db.characters.clear(), db.levelUps.clear(), db.xpAwards.clear(), db.treasureAwards.clear(), db.inventory.clear(), db.purses.clear(), db.rules.clear(), db.images.clear(), db.syncState.clear(),
  ])
  invalidateEntities()
  notifyRulesChanged()
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

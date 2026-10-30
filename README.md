# StarTome

An offline-first Progressive Web App for Pathfinder 2e and Starfinder 2e Game Masters — campaign notes, world maps, a full VTT encounter system, and a rules compendium. Runs entirely in the browser with no server required. Can be hosted for free on GitHub Pages.

StarTome is a fork of [DM's Tome](https://github.com/DarthAmun/DmsTome). The fork plan — typed PF2e/SF2e entities, Foundry compendium sync, Pf2e Play Buddy integration — is in [FORK_PLAN.md](FORK_PLAN.md).

StarTome is unofficial and not affiliated with Paizo Inc. Pathfinder and Starfinder are trademarks of Paizo Inc.

## Technology Stack

| Layer | Tech |
|-------|------|
| App | PWA (installable, offline-capable) |
| Database | IndexedDB via Dexie.js (database `startome`, schema v4) |
| Frontend | Nuxt 3 (static/CSR) + Vue 3 |
| Styling | Tailwind CSS |
| UI Components | PrimeVue v4 (unstyled) |
| Icons | oh-vue-icons |
| State | Pinia |
| Canvas / VTT | PixiJS v8 |
| Knowledge Graph | Vue Flow + Cytoscape |
| Markdown | markdown-it + DOMPurify |
| Import / Export | JSZip |
| Sync | BroadcastChannel API |

---

## Quick Start

```bash
pnpm install
pnpm dev
```

Open http://localhost:3001 — all data is stored in your browser's IndexedDB.

## Production Build

```bash
pnpm generate     # outputs to .output/public/
```

## Deploy to GitHub Pages

1. Push to GitHub
2. Go to **Settings → Pages → Source** → select **GitHub Actions**
3. Edit `.github/workflows/nuxtjs.yml` — set `NUXT_APP_BASE_URL` to `/your-repo-name/`
4. Push to `main` → auto-deploys

Live at: `https://your-username.github.io/your-repo-name/`

---

## Features

### Campaign Management
- Multiple campaigns, each with a banner image, description, and full set of content
- Dashboard overview with quick stats and navigation to all sections
- All data persists offline in IndexedDB — no account or server needed

### Lore & World-Building

Nine entity types per campaign, each with a dedicated section:

| Type | Purpose |
|------|---------|
| Notes | Freeform markdown documents |
| NPCs | Characters with typed attribute blocks |
| Locations | Places with optional map images, sub-maps, and logo/banner |
| Factions | Organizations and groups |
| Events | World/story events with an optional timeline view |
| Sessions | Session summaries and logs |
| Quests | Quest tracking with status |
| Rumors | Rumor seeds and hooks |
| Random Tables | Rollable tables for improvisation |

Every entity supports:
- Markdown editor with live preview
- Typed attribute fields (stat blocks, images, dice, tags, links, clocks, checklists, and more)
- Entity links via `{{entity: Name}}` inline syntax
- Version snapshots with a labeled timeline (e.g. "Before Ascension", "Session 12")

### Knowledge Graph
- Interactive node graph of all campaign entities (Vue Flow)
- Create and label directional or bi-directional connections between entities
- Customize edge style and color per connection
- Save and restore named graph layouts
- Player-facing read-only graph view in a separate tab

### World Map
- Load any image as a world map (stored as base64 or URL)
- Pin any entity — NPC, faction, location, note — to a point on the map
- Click pins for an inline preview panel; drill into sub-maps (world → city → dungeon)
- Location entities each carry their own map with their own pins

### VTT Encounters (PixiJS)
- Load a map image and configure grid size and offset
- Token library — drag templates onto the map, snap to grid
- Per-token: name, image, HP, AC, initiative, size, conditions, visibility, dead/alive, notes
- Tokens link to compendium creatures and hazards (normal, weak or elite): HP, AC and size come from the stat block, initiative rolls Perception
- Fog of War — paint and erase fog cells; hide all / reveal all shortcuts
- Wall tool — draw line walls with cover types (full, ¾, ½, ¼, door) for line-of-sight blocking
- Field-of-view compute per token (vision range in tiles)
- Round/turn tracker with a combat log
- Sound playlist association per encounter
- **Player View** — opens in a separate browser tab, syncs in real-time via BroadcastChannel

### DM Screen
- Freeform widget board — add, resize, and rearrange panels
- Zoom and density controls; layout saved per campaign
- Available widgets: Dice Roller, NPC Generator, Conditions Grid, Random Table, Quest, Session, Note, Faction, Location, Rumor, Scratchpad, Rules Lookup, Encounter Link, Search, Compendium Entry, Timer

### Compendium (PF2e / SF2e)
- Typed entries: items, creatures, hazards, spells, feats, actions, conditions, ancestries, heritages, backgrounds, classes, deities
- Synced from the Foundry VTT PF2e/SF2e release (`json-assets.zip` drop); re-syncs keep portraits, notes and local edits
- Your own entries next to synced ones; `{{kind: Name}}` refs in every editor
- DM's Tome import: campaigns come over, the old library is matched against the compendium

### Audio
- Sound library with track management
- Playlists — assign a playlist to an encounter for ambient audio during play
- Playback controls with loop and volume

### Cross-Cutting Features
- **Global Search** — search across all entities in all campaigns
- **Command Palette** — keyboard-driven quick navigation
- **Bookmarks** — pin frequently accessed entities to a ribbon
- **Dice Roller** — available everywhere in the app
- **Settings** — theme and app-level preferences
- **Import / Export** — JSZip-based backup and restore

---

## Project Structure

```
startome/
├── composables/
│   ├── useDb.ts                  # Dexie/IndexedDB layer — all tables and queries
│   ├── useEncounterCanvas.ts     # PixiJS VTT engine
│   ├── useRules.ts               # Compendium repository (the only accessor of `rules`)
│   ├── useEntities.ts            # Campaign entities CRUD
│   ├── useFovCompute.ts          # Field-of-view raycasting
│   ├── useSoundPlayer.ts         # Audio playback
│   └── ...
│
├── pages/
│   ├── index.vue                               # Campaign list / home
│   ├── settings.vue                            # App settings
│   ├── sounds.vue                              # Sound library
│   ├── campaign/[id]/
│   │   ├── index.vue                           # Campaign dashboard
│   │   ├── notes.vue / npcs.vue / ...          # Entity list pages (9 types)
│   │   ├── map.vue                             # World map
│   │   ├── graphs.vue                          # Knowledge graph
│   │   ├── dm-screen.vue                       # DM widget board
│   │   └── chronicle.vue                       # Entity snapshot timeline
│   ├── encounter/[id]/
│   │   ├── index.vue                           # DM encounter view (PixiJS)
│   │   └── player.vue                          # Player view (read-only, synced)
│   └── compendium/
│       ├── [kind].vue                          # Compendium lists + stat blocks
│       ├── sync.vue                            # Foundry sync
│       └── legacy.vue                          # DM's Tome import
│
├── components/
│   ├── editors/                  # Per-entity-type edit forms
│   ├── rules/                    # Compendium stat blocks and editors
│   ├── widgets/                  # DM Screen widget panels
│   ├── graph/                    # Vue Flow graph nodes + modals
│   ├── notes/                    # Entity list-row components
│   └── ...
│
├── stores/
│   └── encounter.ts              # Encounter state + BroadcastChannel player sync
│
└── .github/workflows/
    └── nuxtjs.yml                # GitHub Pages auto-deploy
```

---

## Data & Backups

All data lives in browser IndexedDB in the database `startome`. Every localStorage key starts with `startome.` and the player-view channels are `startome-player` / `startome-map` (see `utils/appNamespace.ts`), so StarTome and DM's Tome can run side by side on the same origin without sharing data.

Exports from DM's Tome (`dmstome-*.json`) come in through Compendium › DM's Tome import.

The Import & Export page (sidebar) takes any StarTome file, a DM's Tome export or a Foundry `json-assets.zip` in one drop zone and opens the right importer. It backs up campaigns, encounters, tokens, your own compendium entries and your portraits/notes/edits on synced ones (the synced content itself is re-synced, not exported). A quest board export gives players a GM-text-free quest list.

Manual export: DevTools → Application → IndexedDB → right-click → Export

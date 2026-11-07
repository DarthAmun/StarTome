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
- Load any image as a world map (kept in the image store, or a URL)
- Pin any entity — NPC, faction, location, note — to a point on the map
- Click pins for an inline preview panel; drill into sub-maps (world → city → dungeon)
- Location entities each carry their own map with their own pins

### VTT Encounters (PixiJS)
- Load a map image and configure grid size and offset
- Map maker — paint a battle map from tiles (rooms, floors, carpet, sand, snow, ice, rubble, swamp, water, fire, magma, walls, doors, windows, hidden doors); it becomes the encounter's map with its grid, walls, doors and windows. Hidden doors look like wall on the map but open like doors for the GM. Tools and tiles sit in a rail, assets in a side drawer; wheel zooms, middle-, Alt- or Space-drag pans
- Map assets — import PNG/WebP/SVG images (furniture, trees, rugs) one by one or as whole folders (picked or dropped; subfolders become library folders, re-imports skip what is already there) and place them on map maker maps: move, resize, rotate, flip, floor or object layer
- Token library — drag templates onto the map, snap to grid
- Per-token: name, image, HP, AC, initiative, size, conditions, visibility, dead/alive, notes
- Tokens link to compendium creatures and hazards (normal, weak or elite): HP, AC and size come from the stat block, initiative rolls Perception
- Fog of War — paint and erase fog cells; hide all / reveal all shortcuts
- Wall tool — draw line walls with cover types (wall, greater, standard, lesser cover), windows (sight passes), doors and hidden doors (a door only the GM sees) for line-of-sight blocking
- Field-of-view compute per token (vision range in tiles)
- Round/turn tracker with a combat log
- Sound playlist association per encounter
- **Player View** — opens in a separate browser tab, syncs in real-time via BroadcastChannel

### DM Screen
- Freeform widget board — add, resize, and rearrange panels
- Zoom and density controls; layout saved per campaign
- Available widgets: Dice Roller, NPC Generator, Conditions Grid, Random Table, Quest, Session, Note, Faction, Location, Rumor, Scratchpad, Rules Lookup, Encounter Link, Search, Compendium Entry, Timer

### Compendium (PF2e / SF2e)
- Typed entries: items, creatures, hazards, spells, feats, actions, conditions, ancestries, heritages, backgrounds, classes, deities, relic gifts, vehicles
- Synced from the Foundry VTT PF2e/SF2e release (`json-assets.zip` drop); re-syncs keep portraits, notes and local edits
- Your own entries next to synced ones; `{{kind: Name}}` refs in every editor
- DM's Tome import: campaigns come over, the old library is matched against the compendium

### Starfinder 2e
The plan for Tech Core, starships and tactical starship combat is in [STARFINDER_PLAN.md](STARFINDER_PLAN.md).
- **Upgrade slots:** weapons and armor show "upgrades 1/2" by grade (Player Core improvement tables), with a GM-set base; full hosts, a second installed weapon or one above its host's grade get a warning
- **Installed weapons** attach to the host their trait names
- **Augmentations:** implant one in the character who owns it; implanted gear can't change hands, and more than four (apex ones free) gets a warning
- **Vehicles:** a compendium kind synced from Foundry (AC, Fortitude, Hardness, HP, collision, crew, piloting check, speed); they stand on the map as tokens and are worth no XP
- **Companions:** animal, robot and drone (mechanic) companions get a stat block from their type and stage (Tech Core advancement), written as a homebrew creature that follows the companion's level and links its map token
- **Starship compendium:** enemy starships, frames, battle stations (advancement tables and station actions by grade), station upgrades and starship weapons, expansion bays, and the five starship conditions. Foundry has no starship data: `scripts/techcore/build.sh "<your Tech Core PDF>"` builds a homebrew pack from your own copy of the book into `local/` (git-ignored), to import under Import & Export → Homebrew
- **Starship page** (SF2e campaigns): the party's starship sheet from its frame at the party level (or a pinned level): HP/SP, AC, saves, speed, sensor range, conditions; battle station cards with grade, helmed bonus, upgrades (limits checked, a gunnery's weapon apart) and station actions; expansion bays; "new at this level"; several ships with one active
- **Crew roster:** drag party members onto battle stations (one each), pick their exploration activity, see the suggested initiative skill with optional hand-entered SF2e skills, and save the arrangement as named presets
- **Interior map and stations on the map:** the ship keeps an interior map (built in the map maker) with its battle stations placed on squares; "Start starship battle" copies it (map, walls, objects, markers) into a new encounter with the crew standing at their stations. A token on a station square helms it: the encounter's Stations panel shows who helms what, the ship's AC and saves with the helmed bonuses, and on a helming crew member's turn their station's actions and suggested initiative skill. "Save positions as crew" turns where everyone stands into the roster
- **Sensor map:** a starship battle has a row of zones (12 by default) above the interior map. Starships and starship hazards from the compendium and the party's own ship stand in zones and face left or right; drag them between zones, turn them, track HP and Shield Points, hide them from players. The selected ship shows its sensor range and the zones behind it (off-guard); cones, lines, emanations and bursts in zones pick their targets and open the usual save prompt. Ships take turns in the normal initiative order; the player view shows the sensor map with health words for enemies
- **Starship combat:** damage hits Shield Points first (bypassing skips them); Generate Shields, Fortify and Repair Self buttons. The party's ship at 0 HP becomes compromised (plus its wrecked value), its stations malfunction and it joins initiative right before the turn that dropped it, where the Stations panel runs the hull integrity check; repairs end it with wrecked +1; nonlethal makes it inoperable. Its AC and saves include helmed bonuses, the pilot's Piloting DC and inoperable/off-kilter, the save prompt uses them, and HP, SP and lasting conditions are written back to the ship. Enemy starships are destroyed at 0 HP and count for XP; their "3-zone cone" abilities get a Zone area button
- **Starship encounters in the builder:** tick "Starship encounter" to search starships too; starships count as creatures for XP, a crew of three or fewer gets the book's lower budgets (−10/−20, off with the concierge upgrade), and "Create encounter" starts a battle on the active ship with starships and starship hazards on the sensor map and creatures boarding the interior. Battles start with full Shield Points and keep the ship's wrecked condition
- **Area Fire / Auto-Fire** buttons on creature Strikes with the area or automatic trait place the cone, line or burst and ask for basic Reflex saves

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

The Import & Export page (sidebar) takes any StarTome file, a DM's Tome export or a Foundry `json-assets.zip` in one drop zone and opens the right importer. It backs up campaigns, encounters, tokens, your own compendium entries and your portraits/notes/edits on synced ones (the synced content itself is re-synced, not exported). A quest board export gives players a GM-text-free quest list. Files bigger than the browser's ~512 MB string limit (backups with many images) are read as a stream.

Images — portraits, location maps, banners, encounter maps, compendium art — live in the `images` table; rows keep an `img:<id>` ref, and lists show cached thumbnails.

Manual export: DevTools → Application → IndexedDB → right-click → Export

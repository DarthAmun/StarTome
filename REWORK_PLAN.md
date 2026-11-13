# StarTome rework plan

Status: **approved 2026-11-12 with the decisions in section 0.** Written against v0.41.0 (`67bc760`). Phase 0 is done (v0.42.0, on `main`). Phases 1 to 7 are done on the `rework` branch (see section 11a). Phase 8 is next.

How this was produced: the schema, types, format docs, backup/import code, the Play Buddy port and the app shell were read line by line. The large UI files (encounter page, GM screen, map maker, editors, session board) were read by extracting their templates, handlers, shortcuts and storage keys rather than every line. The app was started (`pnpm dev`), the main screens were opened, `pnpm test` (557 passed, 2 skipped) and `pnpm typecheck` ran clean. A real backup (`~/Downloads/startome-all-2026-11-03.json`, 578 MB) was inspected for its actual shape. Anything in the inventory I could not confirm by running it is still listed; Phase 3 verifies each line.

Contents

0. [Decisions](#0-decisions-2026-11-12)
1. [Three things to decide first](#1-three-things-to-decide-first)
2. [Feature inventory (parity checklist)](#2-feature-inventory-parity-checklist)
3. [External formats](#3-external-formats)
4. [Flagged features (your decision)](#4-flagged-features-your-decision)
5. [Current problems](#5-current-problems)
6. [UX concept](#6-ux-concept)
7. [Platform and stack](#7-platform-and-stack)
8. [Target architecture](#8-target-architecture)
9. [Target data model](#9-target-data-model)
10. [Getting legacy data in](#10-getting-legacy-data-in)
11. [Implementation phases](#11-implementation-phases)
12. [Risks](#12-risks)
13. [Open questions](#13-open-questions)

---

## 0. Decisions (2026-11-12)

Your answers after the review. Where they differ from the text further down, this section wins.

**How strict parity is.** You have not checked every feature and do not know whether you use all of them: "it's a fresh start, and if something is missing that I need I will add it back." The checklist in section 2 therefore stays the working list for each phase, but it is a guide, not a gate: a small behaviour that turns out awkward in the new design may be left out if it is reported at the end of the phase. The reference screenshots planned for Phase 0 are dropped.

**Flags**

| # | Decision |
|---|---|
| F1 | As recommended: sparks and ink-write go, one "reduce motion" switch. |
| F2 | As recommended: light and dark per skin, accent, interface size. No font choice. |
| F3 | As recommended: DM's Tome import is cut. |
| F4 | As recommended: history becomes a plain list with view and restore; no timeline strip, no event linkage. Existing states are imported. |
| F5 | Cut. |
| F6 | Merged into areas. |
| F7 | **Changed.** You use plain Edit mode to replace a whole text at once, which block editing cannot do. The editor gets two modes: the live editor, and **Source** (the whole text as one plain document, select-all and paste works). The read-only view stays. |
| F8 | As recommended: star for favourites, tray for pins. |
| F9 | As recommended: one export dialog; per-type JSON button cut. |
| F10 | Cut. |
| F11 | As recommended, **with PNGs protected**: images are never converted to another format on their own. Automatic handling only downscales images above a size limit, keeping their format and transparency; an image can be marked "keep original" to skip even that. Converting to JPEG or WebP stays a deliberate action per image or selection. Unused images are removed automatically. |
| F12 | Cut. |
| F13 | Weather lists become random tables. |
| F14 | **Changed.** Casting to network speakers does not work the way you wanted and is cut. The sound features are unused today but wanted later with a Bluetooth speaker paired to the laptop: the **output device picker stays** and is the supported way to send sound somewhere. Spotify becomes a plain link on a playlist. |
| F15 | Demo campaign becomes a button. |
| F16 | **Keep**: graph player view and hiding single attributes on nodes. |
| F17 | Undecided, so kept as it is: scenes from other campaigns in the session drawer. |
| F18 | As recommended: restore a backup, or add its campaigns. |
| F19 | **Keep, and fix.** Regions are entries you use often. They live in World, can be created there **without a map**, hold notes like any entry, and can be placed on a map later (or drawn directly on one, as today). Checklist item C24 is corrected by this. |
| F20 | The cross-campaign home goes. The idea behind it stays as a wish: a **Statistics** page (entries over time, sessions played, encounters and XP, treasure, most-linked entries). Not part of parity; built after the cut-over if you still want it. |
| F21 | Dead code removed. |

**Questions**

| # | Answer | Consequence |
|---|---|---|
| Q1 | The three "future features" were a stale note; all are in and reviewed. | They are parity items. No extra design room needed beyond section 8. |
| Q2 | New branch. | `rework` branch as planned. |
| Q3 | v0.41/0.42 is frozen except for fixes. | |
| Q4 | Laptop only, Chrome, installed as a PWA. | The layout targets one laptop screen (plus a second window for players); no phone or tablet layouts. The backup folder can rely on Chromium's file access. |
| Q5 | The quest board reader is another app, unused for now; it will follow the new export. | Quest board v2 as specified; free to change. |
| Q6 | Nothing but the app reads backups. Backups matter for clearing the browser and moving to a new laptop. | Backup v3 as specified. The backup folder and restore-on-a-new-device are first-class in Phase 1. |
| Q7 | Stay a PWA. | |
| Q8 | Two skins, by game. | |
| Q10 | Play Buddy is still only the mock; Carl implements what we specify. | `PLAYBUDDY_API.md` is ours to change. Phase 8 may simplify the API where the new model makes that natural, and every change is written into that file for Carl. |
| Q11 | Yes. | The finished plan files are folded into module docs and removed during the rework; STARFINDER_PLAN's unfinished phases stay. |

---

## 1. Three things to decide first

**1. The three "planned future features" already exist.** Your brief lists them as future work to design for. The code has all three:

| You called it planned | What is there today |
|---|---|
| Friend's character app via its API (gifting items, viewing inventories, hidden rolls) | Play Buddy integration: `composables/usePlayBuddy.ts` (531 lines), `partylink/` (port, wire v1, converters), `components/PlayBuddyPanel.vue`, a mock server, three test files. Pairing, status mirror at four share levels, item/coin/level-up/hero-point offers with an outbox, secret roll and initiative requests, damage requests, share-file fallback. |
| Encounter builder that deploys tokens to the VTT | `pages/campaign/[id]/encounter-builder.vue` + `composables/useEncounterBuild.ts`: XP budget, compendium search, weak/elite, "Create encounter" places the party and every enemy on a new prepared encounter. |
| Milestone leveling | Campaign advancement `xp` or `milestone`, a `milestone` flag on quests that prompts a level-up on completion, the Level-up dialog with undo, the level-up log. Both of your campaigns are set to milestone. |

So they go into the parity checklist as features that must survive, and the rework has to keep them, which is more work than leaving room for them. What I still treat as future: whatever Play Buddy does not do yet ("shared/harmonised entities" beyond item matching by Foundry id), and anything you tell me is missing from the other two. See question Q1.

**2. I recommend against replacing the language, the framework or the platform.** Details in section 7. In short: about 12,000 lines of the app are pure, well-tested TypeScript rules and converters that are already in good shape; throwing them away buys nothing. The UI layer (about 45,000 lines of Vue files, a third of that CSS) gets rewritten for the redesign either way. What I would replace is Nuxt (with plain Vite), the icon package, the storage layout and the internal structure. Electron or Tauri would solve one real problem (your data lives in a browser profile) that an automatic backup folder solves at a fraction of the cost.

**3. The rework cannot be done in place.** A new data model and a new UI cannot share screens with the old ones phase by phase. The plan builds the new app on a branch; the current app on `main` keeps serving your sessions until the parity checklist is complete. "Working at the end of every phase" then means: the new app builds, passes its tests, imports your real data and does everything the finished phases cover. See section 11 and question Q2.

---

## 2. Feature inventory (parity checklist)

Checkbox = verified in the rework (all empty now). IDs are for reference in later phases. "(flag Fn)" points at section 4.

### A. Shell and navigation

- [ ] A1 Collapsible sidebar, state remembered; `B` toggles it when not typing
- [ ] A2 Sidebar lists campaigns; one expanded at a time; expanding follows the route (also on encounter pages, via the encounter's campaign)
- [ ] A3 Per campaign: links to the 10 entity types with counts, Party, Starship (SF2e campaigns only), Encounters, Graphs, GM Screen
- [ ] A4 Campaign header shows banner image or a gradient when active; campaign colour dot
- [ ] A5 Compendium section: 19 kinds with entry counts, starship kinds grouped
- [ ] A6 Footer links: Sounds, Import & Export (stays lit on the importer pages), Settings
- [ ] A7 Collapsed sidebar: icon rail with tooltips
- [ ] A8 Bookmark ribbon: bookmark the current page or entity, drag to reorder, remove, jump; light/dark quick toggle (flag F8)
- [x] A9 Floating Dice, Music and Search buttons on every GM page
- [x] A10 Player routes (encounter player view, map player, graph player) render without any GM chrome
- [x] A11 Notices (toasts) bottom right: failed saves, storage quota errors, sticky notices with an action
- [ ] A12 "Updated in another tab" notice with Reload; "waiting for other tabs to close" notice during a schema upgrade
- [x] A13 New Campaign dialog reachable from sidebar and home (name, description, game)
- [ ] A14 PWA install button when the browser offers it
- [ ] A15 Old routes redirect: `/dm-screen` → `/gm-screen`, `/graph` → `/graphs`, `/map` → `/locations` (flag F12)
- [ ] A16 Click sparks and ink-write heading animation (flag F1)

### B. Home and campaigns

- [x] B1 Home: greeting by time of day; totals (campaigns, entries, compendium entries)
- [x] B2 Campaign cards: name, game, description, per-type count pills (click opens that list), entry count, last updated
- [x] B3 Card actions: edit, clone ("(Copy)", shares library tokens, drops history logs), delete with confirm (cascades to everything of the campaign)
- [x] B4 Edit campaign: name, description, game, advancement (XP / milestones), three automation switches (tick-down and reminders, dying and recovery, persistent damage)
- [ ] B5 Recently updated entries across campaigns (8), active quests across campaigns (8)
- [x] B6 Compendium summary with counts and "Update from Foundry"
- [x] B7 Empty state with "Begin a Campaign"
- [x] B8 First start seeds the demo campaign "Welcome to StarTome" with tutorial entries and a demo encounter (flag F15)
- [x] B9 Campaign dashboard: banner upload/remove, count tiles per type, active quests with giver, quick links to Encounters and Graph
- [ ] B10 Opening a campaign loads its entries and starts following its linked Play Buddy game
- [ ] B11 `/chronicle` page: overview of seven entry types (flag F5)

### C. Lore entries (10 types: session, note, NPC, location, faction, quest, event, random table, rumor, region)

Common
- [x] C1 Overview per type: search (`/` focuses, typing anywhere starts a search, Esc clears), filter pills with counts, active-filter chips, clear all
- [x] C2 Group by (per-type keys), sort (per-type keys) with reverse, three densities (gallery, compact, table); table header click sorts
- [ ] C3 Collapsible groups with thumbnail previews; favourites group; paged rendering with "more load as you scroll"; A–Z jump rail above 24 entries
- [x] C4 Archive mode per type (show / dim / hide): dead NPCs, destroyed locations, closed quests, false rumors
- [x] C5 Keyboard: arrows move, Enter opens, Space favourites; hover or focus shows a peek card (facts, excerpt, last edited)
- [x] C6 Empty states ("no matches" with clear, "none yet" with create); view preferences remembered per type
- [ ] C7 Entry page: list column (collapsible to a rail, search, favourites, filters shared with the overview) beside the editor
- [x] C8 Entry header: click-to-rename, favourite, delete with confirm
- [x] C9 Collapsible attributes panel; edits merge onto the stored entry so changes made elsewhere are not overwritten
- [x] C10 Link bar under every entry: outgoing links, "referenced by" (backlinks), "found in" (maps that pin it)
- [ ] C11 Per-type JSON export from the list column (flag F9)
- [x] C12 Images are file uploads or URLs; stored as `img:` references with cached thumbnails

Per type
- [ ] C13 NPC: portrait, title, level, ancestry and class (compendium suggestions or free text), second class (dual-class), status text, alive/dead, Player Character switch (adds/removes the party member; removing asks and moves their items to the stash)
- [x] C14 NPC card above the text; derived "last seen in session N", factions and locations from links and map pins
- [ ] C15 NPC Progression panel: class features and feat slots by level (dual-class aware), click a slot for the matching feats, legacy tag, custom class fallback, show levels above current
- [x] C16 Location: banner/logo, map image, type, discovery status, Map button; table shows pin and region counts
- [x] C17 Faction: emblem, type, size, secret flag, headquarters; member count from links
- [x] C18 Quest: status, quest giver picker (NPC or faction, or typed text), reward, tags, milestone flag; objectives counted from task-list items
- [ ] C19 Completing a quest prompts a party level-up (milestone flag) or accomplishment XP
- [x] C20 Event: date (text), location, significance; Timeline view
- [x] C21 Note: icon (10 choices), tags
- [x] C22 Rumor: several statuses at once (unheard, heard, revealed, false), source, tags
- [x] C23 Random table: die (d4–d100), rows (min, max, result with link completion), Roll with rendered result
- [x] C24 Region: creatable in World without a map, placed or drawn on a map later (decision F19; in v0.41 the list offers no "New" for regions); polygon preview, colour, parent map
- [x] C25 Session: number, date, mode (planning / running / finished); switching to running sets today's date and opens the recap; finishing opens the review

History (flag F4)
- [ ] C26 Record a historical state of an NPC, faction, location or quest (label, note, linked event)
- [ ] C27 Timeline strip above the editor; view a past state, return to present; edit or delete a state
- [ ] C28 Events list the historical states linked to them

### D. Markdown editor

- [x] D1 Three view modes: Edit, Mixed (click a block to edit it), Preview; choice remembered (flag F7)
- [x] D2 Toolbar: bold, italic, heading, list, task, quote; Ctrl+B / Ctrl+I; undo covers toolbar actions
- [x] D3 Lists continue on Enter; Tab / Shift+Tab indent; spellcheck
- [x] D4 `{{type: Name}}` links with autocomplete: campaign entries, encounters, graphs, compendium entries, historical states
- [x] D5 `{{type: Name | entry}}` embeds the entry's card
- [ ] D6 `{{roll: 2d6+3}}`, `::dice[…]`, `::button[Label | dice]`, `::table[Name]`, `::choose[a | b]`, `::clock[Name | 0/6]` (click advances and saves); widget reference panel inserts them
- [x] D7 GM-only blocks (`> [!hidden]`) toggled per block; styled for the GM, stripped from everything players get
- [ ] D8 Task lists, callouts
- [x] D9 Print / save as PDF without GM-only blocks
- [x] D10 Debounced saving that flushes on leaving the page
- [x] D11 Clicking a link opens the campaign entry, or the compendium entry of that name

### E. Search, commands, dice

- [ ] E1 Global search (Ctrl/⌘+K): campaigns, entries (name, tags, text), compendium, encounters, graphs, session panels; word starts and typos
- [ ] E2 `#tag` search; campaign context chip (click to unset)
- [ ] E3 Result actions: open, open in a new window, bookmark; full keyboard navigation
- [ ] E4 Command mode (`>`): goto (with aliases), add entry, find, set/unset campaign, theme, delete, edit attribute, append paragraph, rename, roll dice, DC lookup
- [x] E5 Dice panel: build a pool by clicking dice (right-click removes), modifier, roll, natural 20 / natural 1 callouts, history with clear
- [x] E6 Rolls from text and stat blocks land in the dice panel with their follow-up buttons (apply damage and so on)
- [x] E7 Formula evaluator (dice, arithmetic, floor/ceil/min/max, field references) for initiative formulas

### F. Sessions

- [x] F1 Session board: free canvas of panels (scene, beat, clue, encounter, log, note, entry, random table, reward) and frames
- [x] F2 Add from the toolbar or by right-click at the cursor; double-click edits; drag, resize frames, panels inside frames move with them
- [x] F3 Connections between panels (plan, sequence, attach) with labels; arrows run between facing sides
- [x] F4 Panel editor: title, markdown, tags, status per kind, encounter picker, entry picker, "players should know", attached-to info
- [x] F5 Status per kind (scene planned/played/continued/skipped, beat open/done, clue hidden/revealed, reward pending/awarded)
- [x] F6 Drawer: unplaced panels of the campaign, search by text or tag, place, delete; "other campaigns" scenes to copy
- [ ] F7 Capture bar while running: type what happened, Enter logs; log types (happened, changed, improvised, consequence); attaches to the selected panel or logs as improvised; `@` and `{{` completion; "players should know" eye
- [x] F8 Encounter panel: Run opens the encounter and Back returns; "log it" writes the outcome
- [x] F9 Random table panel: roll, turn the result into a log
- [x] F10 Reward panel: award its XP to the party
- [ ] F11 Party panel on the board (movable between corners, collapsible): Perception, saves, hero points from Play Buddy; offer a hero point
- [x] F12 Recap dialog when a session starts: last session's "players should know" logs to tick off; hero points for linked players
- [x] F13 Finish dialog: prep that did not come up goes to the next session, to the drawer, or stays (scenes marked skipped)
- [x] F14 Review and Fit buttons; viewport remembered; Esc closes menus
- [x] F15 The session's searchable text is rebuilt from its panels; old two-editor sessions are converted to boards
- [x] F16 Session Log page: every session with its logs and plan, expandable
- [ ] F17 Mentions of an NPC in panel text show the portrait

### G. Encounters and VTT

List and builder
- [x] G1 Encounter list per campaign: search, status, details (map, tokens, round, FOV), open, clone, delete with confirm
- [x] G2 Resolve and re-open from the list
- [x] G3 "+ Starship" creates a starship battle on the active ship (SF2e)
- [x] G4 Encounter builder: party level (override, reset, mixed-level hint), treasure pace for the level
- [x] G5 Builder search: creatures, hazards, starships; level range, rarity, traits; both games' creatures usable
- [x] G6 Builder selection: counts, weak/elite, XP per slot, "too strong / too weak" warnings, threat meter with budgets
- [ ] G7 Build creature (GM Core tables) from the builder
- [x] G8 Starship encounter switch with small-crew budgets and the concierge variant
- [x] G9 "Create encounter" places party tokens and enemies on free squares of a new prepared encounter; the selection is kept per campaign until cleared

Prepare
- [x] G10 Modes Prepare / Run / Resolved, remembered per encounter; editable name
- [x] G11 Difficulty meter in the encounter: party level override, allies excluded, removed enemies' XP kept (clearable), tokens without stat block noted
- [x] G12 Loot: entries owned by the encounter, suggestions from the enemies' gear, treasure roll, pace readout
- [x] G13 Map: drop an image, load a file or URL, or build one in the map maker
- [x] G14 Grid: cell size, X/Y offset
- [x] G15 FOV and walls switch; FOV view modes (GM sees all, active token's vision, all player tokens' vision)
- [x] G16 Music: link a playlist; starting the encounter offers to play it
- [x] G17 Player view layout: turn order position and size, token names shown or hidden, hidden combatants' turns left out or shown as "?"

Map tools
- [x] G18 Fog of war: paint, reveal, cover all, clear all
- [x] G19 Ruler
- [x] G20 Shape overlays: circle, square, cone with colour and size (flag F6)
- [x] G21 Areas: burst, cone, line, emanation that know which tokens are inside; placement rules (burst on an intersection, cone in 45° steps from a token's edge)
- [x] G22 Area effect: save type, basic save, DC, damage, conditions per degree, lingering until a round
- [x] G23 Save prompt: one row per creature inside, NPC saves rolled, player rolls typed, damage rolled once and split by degree, apply to all
- [x] G24 Walls: draw with snapping; kinds wall, greater/standard/lesser cover, window, door, hidden door; Backspace removes the last point, Ctrl+Z the last wall; right-click a wall to open/close a door or delete
- [x] G25 Ping: click to ping the player view, Shift+click also centres it, long-press on the map
- [x] G26 Pan and zoom; viewport remembered per encounter

Tokens
- [x] G27 Token library (shared by all campaigns): search, PCs pinned first, add, edit, remove
- [x] G28 Library token: name, image (file/URL), linked creature with weak/elite, linked NPC, image synced with the linked entry, PC flag
- [x] G29 Drag library tokens or compendium creatures onto the map; add-to-encounter auto-places on a free square
- [x] G30 "Link to stat block?" offer when an unlinked token is placed
- [x] G31 Token on the map: portrait or initial, disposition ring, HP arc (GM), condition ring segments, nameplate, hidden badge, elevation badge, timer badge, active-turn ring, dead overlay
- [x] G32 Token edit: label, link and adjustment, "update from stat block", HP/max/temp, quick damage and heal, critical hit, uses dying rules, size, elevation, initiative, timers (name, turns, reset, visible to players), PC token (shares vision, exact HP to players), vision range, conditions, GM notes
- [x] G33 Right-click menu on a token: edit, quick conditions, all conditions, initiative, damage (to Play Buddy for linked PCs), temp HP, timer, view entry / NPC, visibility, dead, player token, ally, acts while hidden, remove
- [x] G34 Right-click on the map: add token here, add creature here
- [x] G35 Conditions dialog: search, valued conditions with +/−, persistent damage with formula, custom conditions, hide a condition from players, colour and icon per condition (saved on the compendium entry)
- [x] G36 Condition reference panel with the full rules text (or a short reminder without a synced compendium)
- [x] G37 Stat block panel for a token: live HP, AC, conditions; pick a target; rolls with apply buttons; Recall Knowledge line; the campaign NPC card or a linked player's shared numbers instead of a stat block

Run
- [x] G38 Turn order with round counter, next / previous turn, undo turn
- [x] G39 Roll all initiative; initiative formula with presets; ask linked players to roll in Play Buddy
- [x] G40 Inline HP field per row (positive = damage, negative = heal); multi-select rows to show, hide or remove
- [x] G41 Quick add (`A`): creature or empty token, count, ally/summon, rolled initiative
- [x] G42 Condition automation prompts: recovery checks with dying/wounded, persistent damage and its flat check, tick-down of frightened and stunned, action reminders
- [x] G43 Temp HP rules (damage takes them first, grants do not stack)
- [x] G44 Combat log: damage, healing, temp HP, rolls, conditions, unconscious, revived, notes per token; clear with confirm
- [x] G45 Timers count down at the start of the token's turn; click resets
- [x] G46 Hidden tokens that still take their turn

Resolve
- [x] G47 Resolve dialog: enemies and XP at the party level, who took part, accomplishment XP, loot to the party stash; milestone campaigns record XP for pacing only
- [x] G48 Re-open undoes the award and brings back loot that is still in the stash

Player view
- [x] G49 Opens in its own window and follows the GM live: map, fog, tokens, turn rail, condition chips, areas, pings
- [x] G50 Only player-safe data leaves the GM window: no GM notes, AC, initiative, links, hidden conditions or timers; enemy HP as a health word
- [x] G51 Reconnects when either window reloads; large images are sent once per connection

Map maker
- [x] G52 Paint tiles: floors (room, carpet, sand, snow, ice, rubble, swamp, water, fire, magma), walls, doors, windows, hidden doors; room and fill tools
- [x] G53 Map size in squares with resize; start over; undo/redo (Ctrl+Z / Ctrl+Y)
- [x] G54 View: wheel zoom, `+` `-` `0`, pan with middle-drag, Alt-drag or Space-drag
- [x] G55 Asset library: import files or whole folders (also by dropping), folders from subfolders, search, paging, remove asset or folder; re-imports skip what is there
- [x] G56 Placed assets: move, resize, rotate (`R`), mirror (`F`), floor or object layer, forward/backward (`]` `[`), duplicate (Ctrl+D), delete; Shift places off the grid; Esc stops placing
- [x] G57 "Make walls" derives line-of-sight walls and doors from the tiles and turns FOV on
- [x] G58 "Use as encounter map" renders the image and sets the grid; leaving with unsaved changes asks

### H. Party and advancement

- [x] H1 Roster: add from an NPC or a typed name; player character or companion; remove with confirm (items to the stash)
- [x] H2 NPCs flagged as Player Character join the party automatically; the flag and the roster stay in step
- [x] H3 Level +/−, XP, Strength modifier per member; companions can count as PCs
- [x] H4 Party level (average, rounded down) with mixed-level hint; pacing since the last level-up
- [x] H5 Level up party: pick who levels, undo, log; opened by hand or by a milestone quest
- [x] H6 Award XP: accomplishment sizes (10/30/80), who, reason; reaching 1,000 XP prompts a level-up; log with undo
- [x] H7 Companion builder (animal, robot, drone): writes a homebrew creature that follows the companion's level and links its token
- [x] H8 Earn Income per member: task level, proficiency, days, roll; pay goes into the purse as a correction
- [ ] H9 Level-up offers to linked Play Buddy players ("level N offered")

### I. Inventory and wealth

- [x] I1 One inventory for the stash, every character and every encounter's loot
- [x] I2 GM view and player view (unidentified items show their player name and count as nothing)
- [x] I3 Add from the compendium or as free text; "as treasure" switch; quantity; delete with attachments
- [x] I4 Move or give a quantity to another owner; coins per purse with money parsing (gp/sp/cp or credits); split coins evenly
- [x] I5 Bulk totals and encumbrance against the Strength modifier
- [x] I6 Containers with capacity and bulk reduction
- [x] I7 Attachments: runes, talismans, upgrades, relic gifts on a host item; value sums up
- [x] I8 Relics with aspects; gifts dormant or awakened
- [x] I9 Identify / unidentified with player name and description
- [x] I10 Overrides: name, price, bulk, grade; GM notes; missing-entry marker
- [x] I11 Wealth readout: awarded versus expected treasure by level, consumables counted or not, ABP switch, "matches level N"
- [x] I12 Treasure baseline (set with confirm); treasure awards outside encounters with undo
- [x] I13 Gear check: expected runes or grades by level per member
- [x] I14 Treasure roll: fill a share of a level's treasure with random items (rarity, kinds, skip owned, re-roll a slot, currency)

### J. Starfinder 2e

- [x] J1 Upgrade slots by grade with a GM-set base; warnings for full hosts, a second installed weapon, a weapon above its host's grade
- [x] J2 Installed weapons attach to their host; augmentations are implanted and cannot change hands; limit warning (apex free)
- [x] J3 Vehicles as a compendium kind and as tokens worth no XP
- [x] J4 Area Fire / Auto-Fire buttons on Strikes with those traits
- [x] J5 Starship compendium kinds: starship, frame, battle station, station upgrade, expansion bay; the five starship conditions
- [ ] J6 `scripts/techcore/build.sh` builds a private Tech Core pack from your PDF into `local/`
- [x] J7 Starship page: several ships, one active; create from a frame, delete with confirm; level follows the party or is pinned
- [x] J8 Ship sheet: HP/SP, AC, saves, speed, sensor range, conditions, "new at this level", notes, image
- [x] J9 Battle stations: grade, helmed bonus, upgrades with limits, station actions; expansion bays
- [x] J10 Crew: drag members onto stations, exploration activity, suggested initiative skill, hand-entered skills, named presets
- [x] J11 Interior map with station markers; "Start starship battle" copies it into a new encounter with the crew at their stations; "Save positions as crew"
- [x] J12 Sensor map: zones, ships and hazards with heading, drag between zones, turn, HP and Shield Points, hide from players, sensor range and off-guard zones, zone areas with the save prompt; shown in the player view
- [x] J13 Starship combat: shields before hull, bypassing, nonlethal, Generate Shields, Fortify, Repair Self; compromised and wrecked, malfunctioning stations, hull integrity check; state written back to the ship
- [x] J14 Stations panel in the encounter: who helms what, defenses with helmed bonuses, the helming member's station actions on their turn
- [x] J15 Emergency Repairs on the Starship page; start-of-encounter effects from exploration activities; downtime notes of expansion bays

### K. Play Buddy

- [ ] K1 Pair with Play Buddy on this computer (port, six-digit code); unpair; health and version check
- [ ] K2 Link a campaign to the open game; game-system mismatch warning
- [ ] K3 Link players to party characters, or add a character from a player; unlink keeps the last known items
- [ ] K4 Status mirror by share level: HP, conditions, hero points, defenses, skills, inventory (read-only here)
- [ ] K5 Offers from the stash: items (with attachments, unidentified names, custom items), coins (refunded if declined), level-up, hero point (one or everyone), identify
- [ ] K6 Requests: roll (secret, with DC), initiative into the turn order, damage with conditions
- [ ] K7 Outbox with idempotency keys; withdraw; clear answered; offer and roll lists
- [ ] K8 Live events while the campaign is open (long poll); tokens of linked characters follow their HP and conditions
- [ ] K9 Share-file import as a fallback, from the Import page or the party page
- [ ] K10 SF2e games: system, skills, attack bonuses, grades, implants

### L. Compendium

- [x] L1 List per kind: search, game filter, level range, rarity, traits, source, pack, favourites only, superseded legacy, removed upstream; sort; paging; preferences per kind
- [x] L2 Stat blocks for all 19 kinds, with clickable rolls: saves, Perception, skills, Strikes with the multiple attack penalty, damage, critical and two-hand damage, spell attacks
- [x] L3 "Place area" from abilities and spells; GM-only callouts; unidentified name; class features and subclasses; heightened entries; legacy tags
- [x] L4 Field notes dialog: a creature as numberless sentences to copy to a player
- [x] L5 Recall Knowledge line for creatures and hazards
- [x] L6 Edit any entry; edits to synced entries are kept as local edits that survive re-syncs ("edited" badge, reset edits with confirm)
- [x] L7 New entry per kind, duplicate as homebrew, delete with confirm, favourite, portrait and token art
- [x] L8 Creature builder: road maps, table columns with typed overrides, Strikes, spellcasting, copy abilities from a creature, rebuild at another level
- [x] L9 Foundry sync: drop `json-assets.zip`, choose packs, sync in a worker with progress, report (new, updated, unchanged, removed upstream, conflicts with local edits, conversion notes), older-release warning, latest-release check on GitHub, licences and attribution
- [x] L10 Homebrew import: drop, pick or paste (a fenced `json` block works); every entry checked, small slips fixed and listed, unreadable entries left out; pick entries; default game and pack; copy the problem list; pf2ools relic gifts read as they are
- [x] L11 Homebrew packs: export selected packs, rename, delete a pack with its portraits
- [x] L12 `{{kind: Name}}` references to compendium entries in every editor

### M. Import, export, data

- [ ] M1 One drop zone (also file picker and paste) that recognises backups, campaign files, token files, homebrew, Play Buddy share files, DM's Tome exports and Foundry zips, and opens the right importer
- [ ] M2 Files beyond the 512 MB string limit are read as a stream
- [ ] M3 Import dialog: sections to include, merge (new ids, nothing overwritten) or replace (with confirm), progress log; one transaction, all or nothing
- [x] M4 Full backup export: campaigns, tokens, own compendium entries, overlays on synced entries, images
- [x] M5 Campaign export (one or all) with the library tokens and map assets it uses
- [x] M6 Markdown zip of a campaign (frontmatter, wiki links, GM-only switch); "Export for Claude" single file (GM-only switch) (flag F9)
- [x] M7 Quest board export for players
- [ ] M8 Token templates export (flag F10)
- [x] M9 Format guides to download (campaign and homebrew formats)
- [x] M10 Database statistics
- [x] M11 Image folder import: match files to compendium entries by name, review matches, set portraits or token art, optional JPEG conversion
- [ ] M12 Re-compress stored images; clean up unused images (flag F11)
- [ ] M13 DM's Tome import: from a file or straight from its database in the same browser; summary, already-imported warning, report (flag F3)
- [x] M14 Wipe all data with two confirms

### N. GM screen

- [x] N1 Free board of widgets: drag, resize, snap, pan, wheel zoom, fit, zoom buttons, density (compact, cozy, loose)
- [x] N2 Palette: bookmarks, quick widgets, entries by type, compendium search; drag or double-click to add; collapses to a rail
- [x] N3 Shift+click selects several widgets to move as a group; deselect all; configure or remove a widget
- [x] N4 Layout saved per campaign; reset to default, clear (scratchpad kept), "suggest a layout", named saved layouts (save, load, delete)
- [ ] N5 Entry widgets, editable in place: session summary, NPC, location (details and map with drill-down), faction, quest, event, note, rumor, random table with Roll
- [x] N6 Tool widgets: encounter link, conditions grid, scratchpad, compendium entry, compendium lookup, timer (stopwatch, countdown), NPC generator (gender, ancestry, class, name; sources configurable), weather (own list, roll or pick), DC table (by level, adjustments, simple DCs, Recall Knowledge for a pinned creature)
- [x] N7 Entry quick-view drawer; Esc leaves the screen

### O. Graphs

- [x] O1 Several named graphs per campaign: create, rename, delete with confirm
- [x] O2 Add entries by search; show or hide by type; mention edges from text links on/off
- [x] O3 Hand-made connections: label, direction (one-way, both, none), line style, colour; edit or delete from the edge
- [x] O4 Layout (positions, zoom, pan) saved; fit; node toolbar (open, remove)
- [x] O5 Hide nodes or single attributes from players; player view in its own window

### P. Maps

- [x] P1 Every location can carry a map image; pan, zoom, fit
- [x] P2 Pin any entry on a map (search, click to place), remove, hide from players
- [x] P3 Pin preview with links to the entry and, for locations, its own map; drill-down with breadcrumbs
- [x] P4 Regions: draw a polygon (click vertices, double-click or Finish, Esc cancels), name, colour, preview, delete
- [x] P5 Player map window that follows the map the GM has open

### Q. Sounds

- [x] Q1 Library: all tracks, tags (each tag is an automatic playlist), playlists with a colour
- [x] Q2 Tracks: local files (kept as file handles, permission asked again when needed), URLs, Spotify links (opens Spotify)
- [x] Q3 Add, edit, delete tracks; create and delete playlists; add from library, remove from playlist
- [x] Q4 Player bar everywhere: play/pause, previous, next, seek, volume, shuffle, loop, playlist menu
- [x] Q5 Output device picker; cast to a network speaker when the browser supports it
- [x] Q6 An encounter's linked playlist is offered when the encounter starts

### R. Settings

- [ ] R1 Themes: dark, void, forest, light, parchment (flag F2)
- [ ] R2 Accent: eight presets or a custom colour
- [ ] R3 Interface size: compact, normal, large; UI font: DM Sans, IM Fell, system (flag F2)
- [ ] R4 Page animations, click sparks, ink-write switches (flag F1)
- [ ] R5 Shortcut list; About with version

### S. Offline and storage behaviour

- [ ] S1 Everything works without a network after the first load (service worker caches the app, fonts are bundled)
- [ ] S2 The only network calls: the GitHub latest-release check on the sync page, URL images and tracks, Play Buddy on `127.0.0.1`
- [x] S3 All data in IndexedDB; storage is asked to persist during the big imports
- [ ] S4 StarTome and DM's Tome can share an origin without sharing data (prefixed names)
- [ ] S5 Changes written in one tab or a worker show up in the others

### T. Keyboard shortcuts (all in one place)

| Where | Keys |
|---|---|
| Anywhere | Ctrl/⌘+K search · Esc closes dialogs, panels, search · `B` sidebar |
| Lists | `/` search · type to search · arrows · Enter · Space favourite |
| Editor | Ctrl+B · Ctrl+I · Tab / Shift+Tab · `{{` completion · Esc leaves a block |
| Search | ↑ ↓ Tab Enter Esc · `>` commands · `#` tags |
| Encounter | `A` quick add (Run) · Backspace / Ctrl+Z while drawing walls · Shift+click ping centres · Enter in HP fields |
| Map maker | Ctrl+Z / Ctrl+Y · Ctrl+D · Delete · `R` `F` `[` `]` · `+` `-` `0` · Space/Alt pan · Shift off-grid · Esc |
| GM screen | Shift+click select · Esc exit |
| Session board | Esc closes menus · Enter logs in the capture bar |

---

## 3. External formats

| # | Format | Direction | Defined in | Changes in the rework? |
|---|---|---|---|---|
| X1 | Backup / campaign / tokens file, JSON `version: 2` | out and in | `sync/backup.ts`, `converters/export.ts` | **Yes.** Replaced by a zip (`docs/formats/BACKUP_V3.md`). Version 2 files stay importable for good. |
| X2 | Campaign authoring format (what Claude writes) | in | `CAMPAIGN_FORMAT.md` | **No.** Kept as an interchange format with its file-local numeric ids. The importer starts checking fields (today it does not). |
| X3 | Homebrew format | in and out | `HOMEBREW_FORMAT.md`, `rules/homebrew.ts` | **No.** The compendium model is already clean. Your skills (`startome-homebrew-import`, `pathbuilder-homebrew-pack`), `scripts/techcore/` and existing pack files keep working. |
| X4 | Quest board export, `version: 1` | out | `converters/export.ts` `buildQuestBoard` | **Yes, slightly.** Quest `id` becomes a string (`docs/formats/QUESTBOARD_V2.md`). |
| X5 | Markdown zip and "Export for Claude" | out | `pages/data.vue` | No (same layout; produced from the new model). |
| X6 | Per-type entry JSON from the list column | out | `components/EntityChronicle.vue:181` | Flagged for removal (F9). If kept: string ids. |
| X7 | Play Buddy GM API v1 and share file | both | `PLAYBUDDY_API.md`, `partylink/wire/v1.ts` | No. It is a contract with Carl's app; the rework only moves the client. |
| X8 | Foundry `json-assets.zip` | in | `sync/foundrySync.ts`, `converters/foundry/` | No. |
| X9 | pf2ools relic gift files | in | `converters/pf2ools/relicGifts.ts` | No. |
| X10 | DM's Tome export `version: 1` and its `dmforge` database | in | `sync/legacyImport.ts`, `converters/legacy/lore.ts` | Flagged for removal (F3). |
| X11 | Tech Core pack built by `scripts/techcore/` | in (as X3) | `scripts/techcore/build_pack.py` | No. |
| X12 | GM ↔ player window messages (BroadcastChannel) | internal | `utils/windowChannel.ts`, `utils/playerPayload.ts` | Yes, but both ends ship together. |
| X13 | Browser storage: database `startome`, `startome.*` localStorage keys | internal | `utils/appNamespace.ts` | Yes: new database, state moves into it (section 9). The old database is read once by the legacy import and never written. |

What breaks on the other side:

- **X1:** only StarTome reads these files. Old files import through the legacy path. If you have scripts that open a backup as JSON, they need the zip's `data/*.ndjson` instead (question Q6).
- **X4:** whoever reads the quest board file sees `"id": "0192…"` instead of `"id": 12`. A reader that treats ids as opaque keys is unaffected; one that parses numbers breaks. I do not know what reads this file (question Q5).
- **X2, X3:** nothing. The guide files you give Claude stay valid.

---

## 4. Flagged features (your decision)

Nothing here is removed unless you say so. "Keep" is always an option; the recommendation is what I would do.

| # | Feature | Why it is flagged | Recommendation |
|---|---|---|---|
| F1 | Click sparks, ink-write headings, page-animation switch, `paperTexture` setting | Decoration with DOM work on every click and navigation (`app.vue:157`, `:100`). `paperTexture` is stored but nothing reads it. | Cut sparks and ink-write. One "reduce motion" switch. |
| F2 | Five themes, three UI fonts | The new design has its own two skins (section 6). Five hand-tuned palettes multiply every visual change by five. | Light and dark per skin, accent colour and interface size stay. Drop the font choice. |
| F3 | DM's Tome import (file and same-browser database) | You moved over on 2026-10-28. It keeps a converter, a worker, a page and tests alive. | Cut, once you confirm nothing is left in DM's Tome. Your last DM's Tome exports stay importable with v0.41 if ever needed. |
| F4 | Historical states (snapshots) | Timeline UI in four editors, link completion, event links. Your backup of 292 entries holds **one** snapshot. | Keep the data and a plain "History" list with view/restore; drop the timeline strip and the event linkage. Or cut. |
| F5 | `/chronicle` overview page | Repeats the dashboard's count tiles. | Cut; the new World browser covers it. |
| F6 | Shape overlays (circle, square, cone) | Areas do the same and also know who is inside. Two tools for one job. | Merge: an area without an effect is the plain template. |
| F7 | Three editor modes (Edit / Mixed / Preview) | Three renderers of the same text to keep consistent (`components/MarkdownEditor.vue`, 1,593 lines). | One live editor (rendered blocks, the block under the cursor as source) plus a read-only view. Tell me if you use plain Edit mode. |
| F8 | Three ways to pin things: bookmarks ribbon, favourites star, GM-screen palette | Overlapping ideas, three stores. | One: a star marks favourites; the pin tray (section 6) holds what you want at hand. Bookmarks of pages become tray pins. |
| F9 | Three lore exports: Markdown zip, "Export for Claude", per-type JSON button | Overlap. The JSON button writes database rows nobody reads back. | One export dialog with two targets (folder of Markdown, single file). Cut the per-type JSON. |
| F10 | Token-templates-only export | A backup contains them. | Cut. |
| F11 | Re-compress images, clean up unused images | Maintenance chores the app can do itself. | Compress on import; remove unreferenced images automatically. Keep one "storage" readout. |
| F12 | Redirects from DM's Tome routes | Only matter for bookmarks made before the fork. | Cut. |
| F13 | Weather widget | A list you roll on: a random table. | Convert its list into a random table on import; the table widget replaces it. |
| F14 | Spotify tracks, cast button, output device picker | A Spotify "track" only opens a link. Cast and device routing depend on browser support. | Keep Spotify as a plain link on a playlist. Keep device picker and cast in the player menu; they cost little. |
| F15 | Automatic demo campaign on first start | You are the user; it mostly serves tests today. | Replace with a "Create demo campaign" button on the empty home screen. Tests create their own data. |
| F16 | Graph player view, hiding single attributes on graph nodes | Niche; the graph rarely goes on the table screen (my guess, not measured). | Your call. Kept unless you say cut. |
| F17 | "Other campaigns" scenes in the session drawer | Niche. | Your call. Kept unless you say cut. |
| F18 | Import dialog with per-table checkboxes | "Import encounter walls but not encounters" produces broken data. | Two choices: restore a backup (replaces everything) or add its campaigns. |
| F19 | Regions as an entry type with their own nav item | They cannot be created from their list. | Keep the data and notes; list them on their map, not in the main navigation. |
| F20 | Home screen across campaigns (recent activity, quests of all campaigns) | With two campaigns and one being run at a time, the campaign's own home is what you look at. | Fold into the campaign switcher. |
| F21 | Dead code: `WidgetDice.vue`, `WidgetDiceSearch.vue`, `WidgetSearch.vue`, `SpineSeal.vue`, `graph/HiddenNodesPanel.vue`, `hidden_nodes` column | Not referenced anywhere. The README lists Dice and Search widgets that the board cannot add. | Remove. No feature is lost. |

---

## 5. Current problems

### UI / UX

- **Navigation is a tree of about 35 links** (10 entry types + 5 tools per campaign, 19 compendium kinds, 3 footer links; `components/AppSidebar.vue`). Lore is split into ten separate list pages; a mid-session lookup is a page change that loses your place.
- **Three places to run a session** that do not know each other: the session board, the encounter page and the GM screen. Logging what happened is only possible on the board; the party's state only on the party page or a corner panel.
- **Quick view exists in some places only** (`EntityQuickPanel` on the GM screen and encounter page); everywhere else a link navigates away.
- **Native `confirm` / `alert` / `prompt` in 45 places**: unstyled, blocking, not keyboard-consistent.
- **Shortcuts are sparse and uneven.** The settings page documents six; the map maker has fifteen undocumented ones; the encounter page has two.
- **Duplicated screens:** home and campaign dashboard and `/chronicle` show the same counts; overview and list column are two list implementations with shared state (`useEntityBrowse.ts`, `useCampaignEntity.ts`).
- **Stale text:** About says "D&D campaign manager" (`pages/settings.vue:209`); the README names Cytoscape and widgets that do not exist.

### Data structure

- **Numeric auto-increment ids** in 22 of 25 tables. Every merge import must renumber and rewrite references, including ids buried in JSON: map pins, quest givers, region parents, graph positions keyed by id, panel attributes, crew lists, resolution records (`sync/backup.ts:231-393`, repeated for DM's Tome in `converters/legacy/lore.ts`). A reference that the remapper forgets is silently wrong.
- **Links are by name.** `entityLinks` stores `target_type` + `target_name`; renaming an entry does not touch the `{{type: Old Name}}` text that points at it (`composables/useEntities.ts` has no rename handling), so links and backlinks break quietly.
- **State outside the database and outside backups.** GM screen layouts, saved layouts, scratchpad, NPC generator config, bookmarks, the encounter builder's selection, per-encounter mode, player-view layout and all settings are in localStorage (22 key patterns). The sound library and playlists are in the database but not in `CAMPAIGN_TABLES`. A restored backup has none of it. The GM screen key has gone through four versions (`dmscreen-v2…v4`).
- **"Wipe all data" misses tables**: starships, session panels, link offers, map assets and both sound tables survive (`pages/settings.vue:280`).
- **Mixed conventions in one schema:** `snake_case` and `camelCase` (`created_at` vs `createdAt`, `coverType`), booleans as `0 | 1` beside real booleans, structured columns typed `value | string` because old rows held JSON text (`db/schema.ts:64-66`, `VALUE_COLUMNS`), so every read goes through `parseJson`.
- **Entry attributes are untyped.** `attributes: Record<string, any>`; the per-type interfaces are comments ("Shape reference"). Real data shows drift: events and sessions carry an `icon` field no type lists; sessions carry `scriptContent` years after the board replaced it.
- **The encounter row does everything:** map, grid, fog, viewport, combat log, defeated list, resolution, areas, battle map tiles, starship state, sensor map (`db/schema.ts:53-90`). The whole combat log array is rewritten on every logged action (`stores/encounter.ts:854`).
- **Three overlapping "who is this token" links** (`linked_rules_id`, `linked_entity_id`, `characters.token_id`) plus `is_player_character` on the library token, `is_player_token` on the placement and `isPlayerCharacter` on the NPC, kept in step by hand (`useParty.ts` `syncPcFlags`).
- **Owner as a formatted string** (`'character:12'`), parsed wherever it is used.
- **Session board edges live inside the session entry's attributes** while panels have their own table.
- **Backups are one JSON file with base64 images.** Yours is 578 MB, 430 MB of it images inflated by a third, already past the 512 MB string limit that needed a hand-written streaming parser (`utils/jsonStream.ts`).
- **The campaign importer validates nothing** (CAMPAIGN_FORMAT.md says so itself): a wrong type breaks the page that shows the entry.

### Architecture

- **Components reach into the database.** 16 pages and components call `getDb()` directly, past the repositories.
- **Very large units:** `pages/encounter/[id]/index.vue` 3,877 lines, `useEncounterCanvas.ts` 1,815, `stores/encounter.ts` 1,735 (state, persistence, combat rules glue, player sync, starship combat in one store), `MarkdownEditor.vue` 1,593, `map-maker.vue` 1,414, `gm-screen.vue` 1,381, `pages/data.vue` 1,054. An AI session cannot hold the encounter page and its store in view at once.
- **State management is three things:** one Pinia store, module-level singletons in composables (`useEntities`, `useParty`, `useInventory`, `usePlayBuddy`) with hand-rolled `reloadIfLoaded`, and localStorage. Cross-tab refresh is a custom Dexie listener (`db/changes.ts`).
- **Nuxt for a client-only app.** No server rendering, no server routes; what it adds is auto-imports (names appear in files without an import line, which is exactly what makes code hard for a fresh AI session to trace), a build layer and `noUncheckedIndexedAccess` switched off to cope (`nuxt.config.ts:88`).
- **Folders by technical kind** (`components/`, `composables/`, `utils/`), so one feature is spread over five directories. The good exception is `rules/`, `converters/`, `partylink/`: pure, documented, tested.
- **Legacy conversion runs on every start** (`db/schema.ts:647`, `on('ready')` converts old sessions).

### Expandability

- **The character-app link is half generic.** `partylink/port.ts` is a clean port, but the rows are Play Buddy-specific (`pb_player_id`, `pb_status`, `pb_entry_id`, `pb_offer_id`, `campaign.playbuddy`), and `usePlayBuddy.ts` reaches into party, inventory and the encounter store directly.
- **No single ledger for advancement.** Level-ups, XP awards and treasure awards are three tables with three undo implementations, plus resolution records inside encounters.
- **The widget board, the session board panels and the quick panel render the same entries with three component sets** (`components/widgets/`, `components/session/`, `components/notes/`).

### Performance

- **11 MB of JavaScript**, one chunk of 6.4 MB (the icon set, `utils/gameIcons.ts` documents it), precached by the service worker.
- **18,000 lines of CSS** (14,194 scoped in components, 3,903 in `main.css`).
- **All entries of a campaign are loaded into memory** on opening it (`pages/campaign/[id].vue`), then filtered in computed properties.
- **The player view gets whole-state messages** on each change (throttled to a frame, images deduplicated; `stores/encounter.ts:1283`); with many tokens every HP change re-sends all of them.
- **Fog and combat log are whole-value rewrites** of a row that also holds everything else.
- Good already: images out of rows with thumbnails, compound indexes, sync and import in workers, lazy heavy components.

### Code style

- **265 uses of `any`** outside tests (`WorldMap.vue` 17, encounter page 16, `useEntityBrowse.ts` 13, `pages/data.vue` 12).
- **No linter or formatter configured.** Two formatting styles coexist (`pages/index.vue` is formatted differently from its neighbours).
- **Copy-paste:** snapshot handling is repeated in four editors (`NpcEditor`, `FactionEditor`, `LocationEditor`, `QuestEditor`); ten near-identical list-row components in `components/notes/`; `TYPE_PLURAL_ROUTE` is defined three times beside the real `ENTITY_TYPE_ROUTE`; colour tables for entry types exist in four places.
- **Plan documents as code references.** Comments point into `FORK_PLAN.md §14 PERF-03` and four other plan files (about 6,000 lines of finished plans in the repo root).
- **Tests are strong on rules and weak on screens:** 557 unit tests for pure logic and repositories, about 20 browser tests in total.

---

## 6. UX concept

### Direction: the GM's desk, in two skins

A GM does three things with this app, and you named them: prepare, run the table, look something up without losing the thread. The current app is organised by data type instead. The redesign is organised by those three activities and built on one rule: **whatever you are doing stays on screen; everything else comes to you.**

**Look.** The app is called StarTome and runs two games; the design takes that literally. One layout, two skins, chosen by the campaign's game:

- **Tome** (Pathfinder): deep ink background, warm paper-toned text, brass and oxblood accents, a bookish serif for titles, rules text set like a printed stat block.
- **Star** (Starfinder): near-black blue, cool text, cyan and amber signal colours, a condensed technical face for titles, hairline frames like a ship console.

Both share spacing, components and behaviour, each has a dark and a light variant, and your accent colour still applies. Opening the Starfinder campaign changes the room, which also tells you at a glance which campaign you are in. No cards-on-a-dashboard look: dense, typographic, built for a screen you read from an arm's length away while talking.

### Information architecture

One campaign is open at a time (switcher top left). A slim rail has seven places instead of 35 links:

| Place | Holds | Replaces |
|---|---|---|
| **Tonight** | The campaign's home: the session being prepared or run, open quests, party at a glance, recent entries | Home, campaign dashboard, chronicle page |
| **World** | Every lore entry in one browser, type as a filter beside status, tags, favourites; maps, graphs and timeline as views of the same data | Ten list pages, Graphs, map pages, timeline |
| **Sessions** | Session list, board, log | Sessions, session log |
| **Encounters** | List, builder, VTT, map maker, token library | Encounters, builder, encounter pages |
| **Party** | Roster, inventory, wealth, starship (SF2e), character-app link | Party, Starship |
| **Compendium** | One browser, kind as a filter | 19 kind pages, sync and homebrew pages |
| **Desk** | The widget board | GM Screen |

Sounds, Import & Export and Settings sit at the bottom of the rail. Everything is also reachable from the command bar.

Three things are present everywhere:

1. **Command bar** (Ctrl+K): today's search and command palette, promoted to the main way of getting anywhere. Same commands, same typo tolerance.
2. **Peek dock** (right edge): clicking any link, search result or token opens the entry or stat block in a side panel over what you are doing. It stacks as tabs, can be pinned, and Ctrl+click navigates for real. This is today's quick panel made universal.
3. **Tray** (bottom edge): pinned entries, stat blocks and tools one click away; dice and the sound player live here instead of floating buttons. Pins belong to the campaign and are in the backup.

When a session is in "running" mode, a **table bar** appears at the top of every screen: the capture field (log what happened from anywhere, with a hotkey), the round and whose turn it is if an encounter is live, and the party strip (HP, conditions, hero points when shared). Starting an encounter from the board and coming back no longer cuts you off from the log.

### Main flows

**Prep.** Open Tonight → the next session's board. Add scenes; type `{{` to link or create entries without leaving; drag an encounter panel in, "Build" opens the builder in the dock with the party level filled in, "Create" drops the tokens and returns you to the board. Loot is planned on the encounter with the treasure pace beside it. The Desk can be laid out for the night and saved as a layout.

**Running a session.** Switch the session to Running: recap comes up, the table bar appears. Scenes are on the board; the capture field takes notes with Enter. Run an encounter: the VTT fills the screen, turn order on one side, the selected token's stat block in the dock, the table bar still on top. Resolve: XP and loot are handled, the outcome is logged to the session, you are back on the board. Finishing reviews what did not come up.

**Looking something up mid-session.** Ctrl+K, type three letters, Enter: the stat block or NPC opens in the dock. Read it, roll from it, pin it if it will come up again, Esc. The screen underneath never changed. From a token: click it, same dock.

### Why this beats the current design

- A lookup is one keystroke and no navigation, instead of a page change and a way back.
- Ten lists with ten sets of remembered filters become one browser; "everything tagged act-2" is one filter instead of nine visits.
- Running a session is one continuous surface instead of three unconnected pages.
- Pins, layouts and scratch notes are campaign data, so they survive a backup and a new machine.
- Every confirm is an in-app dialog with undo where possible; every shortcut is listed in one cheat sheet (`?`).
- One set of entry cards serves the browser, the dock, the board and the Desk, so a change to how an NPC is shown happens once.

What the concept deliberately keeps: the session board, the VTT's tools and automation, the inventory model, the compendium stat blocks with their rolls. Those are the parts that already work the way a GM thinks.

---

## 7. Platform and stack

### Platform: stay a PWA, add a backup folder

| Option | For | Against |
|---|---|---|
| **PWA (recommended)** | Runs today, updates by pushing to GitHub, no installer, same code on any screen, player windows and Play Buddy on `127.0.0.1` already work. | Data lives in a browser profile; a backup is a manual act. |
| Electron | Real files, real folders, Chromium guaranteed. | Around 150 MB to ship, a release pipeline to maintain per platform, auto-update to build, and everything it offers can be had from Chromium's file access with far less. |
| Tauri | Small. | On your Linux machine it renders with WebKitGTK: weaker WebGL for the map, no audio device routing, no file handles, different IndexedDB behaviour. A second browser engine to test against for no gain. |

The one real weakness of the PWA is that 580 MB of campaign work sits in browser storage. The fix that costs least: **a backup folder**. You pick a folder once; the app writes a backup there after each session ends and when it has been a day since the last one, keeping the newest few. Images are written once and reused between backups. Storage is also asked to persist at first start instead of only during imports. If you later want a desktop shell, the app's storage sits behind an interface (section 8) and a shell can be added without touching features.

### Stack: keep the language and the engine room, replace the scaffolding

| Layer | Today | Rework | Why |
|---|---|---|---|
| Language | TypeScript, loose in places | TypeScript, `strict` plus `noUncheckedIndexedAccess`, no `any` (lint error) | The single biggest help for AI sessions working unsupervised. |
| UI framework | Vue 3 | **Keep** | The framework is not the problem; component size and structure are. Switching to React or Svelte rewrites the same screens for no user-visible gain. |
| App framework | Nuxt 4 (client-only) | **Vite + Vue Router** | Removes auto-imports and a build layer that only serves features the app does not use. Every name in a file gets an import line. |
| Storage | Dexie / IndexedDB | **Keep Dexie**, new database and schema, `liveQuery` for reading | Typed, tested with `fake-indexeddb`, handles blobs. Live queries replace the hand-rolled reload logic. SQLite in the browser would add a worker protocol and a WASM blob to solve a problem we do not have. |
| Validation | hand-written (`rules/homebrew.ts`) for one format | **Zod schemas** as the single source of row types and import checks | Types and runtime checks cannot drift apart; every import is validated. |
| State | Pinia + singletons + localStorage | Repositories + live queries; Pinia only for the live encounter and UI state | One rule for where state lives. |
| Map | PixiJS 8 | **Keep**, engine separated from Vue | It works; it needs boundaries, not replacing. |
| Boards | Vue Flow | Keep | Used by graph and session board. |
| Editor | CodeMirror 6 + markdown-it + DOMPurify | Keep | |
| Search | MiniSearch | Keep | |
| Primitives | Reka UI | Keep | Accessible dialogs, menus, comboboxes already wrapped. |
| Icons | oh-vue-icons (6.4 MB chunk) | **Generated SVG sprite** of the icons actually used; icon names in your data keep working | Cuts most of the bundle. |
| Zip | JSZip | **fflate**, streaming | Backups written and read as streams, no 512 MB ceiling. |
| CSS | 18,000 lines, scoped per component | Design tokens + a small component library; scoped CSS only for layout | Two skins need tokens anyway. |
| Tests | Vitest + Playwright | Keep; add ESLint with import-boundary rules, Prettier, coverage gate on `domain/` and `data/` | The tests are what you rely on. |
| Deploy | GitHub Pages via Actions | Keep | Free, no server. |

**Cost of this switch.** Kept nearly as they are (moved, imports fixed, strictness errors resolved): `rules/` (6,200 lines), `converters/`, `partylink/`, `sync/foundrySync.ts`, `utils/search.ts`, the canvas drawing code, and their 6,500 lines of tests. Rewritten: every screen and the data layer under them. That rewrite is the redesign you asked for; it would be the same size under any framework, plus the cost of porting the kept parts if the language or framework changed.

**Cost of a full switch, for comparison.** React or Svelte: port all of the above screens *and* re-fit the Vue-specific libraries (Vue Flow → another graph library with different behaviour, Reka → Radix/Bits), with a higher risk of losing small behaviours. Electron: add a main process, IPC, packaging and signing on top. Neither changes what you see at the table.

---

## 8. Target architecture

```
src/
  domain/       Pure TypeScript. Schemas (Zod), ids, and the rules: combat, areas, inventory,
                wealth, starships … (today's rules/, moved). No Vue, no database, no browser APIs.
  data/         The database (Dexie), one repository per aggregate, migrations, live queries.
                The only code that touches IndexedDB.
  services/     Things that talk to the outside: backup, legacy import, homebrew import,
                Foundry sync (worker), character link (today's partylink/), audio,
                player-window link, backup folder.
  features/     One folder per place in the app: tonight, world, sessions, encounters (with vtt/
                and map-maker/), party, compendium, desk, sounds, data, settings.
                Each holds its screens, components and view logic.
  ui/           The component library: buttons, dialogs, dock, tray, cards, tokens of the two skins.
  app/          Shell, router, command registry, shortcut registry.
```

Rules that a linter enforces, so they hold when nobody is reading the code:

- `domain` imports nothing from the other layers. `data` imports `domain`. `services` import `data` and `domain`. `features` import everything below but **not each other**; shared pieces move down into `ui` or `domain`.
- Only `data/` opens the database. Only `services/player-link` uses `BroadcastChannel`. Only `app/` reads or writes localStorage (device preferences).
- No file over 400 lines, no function over 80 (lint warnings that fail CI). The encounter page becomes a shell plus panels; the store becomes slices (tokens, turn order, fog, areas, log, player projection, starship).
- Features talk to each other through **domain events** (today's small bus, used consistently): "quest completed", "encounter resolved", "session finished", "level-up accepted". The party reacts to a resolved encounter; the encounter does not call the party.
- Commands and shortcuts are registered in one registry by each feature; the command bar and the cheat sheet are generated from it.

**VTT.** The Pixi engine takes a plain scene description (map, grid, tokens, fog, walls, areas) and draws it; it knows nothing about Vue or the database. The GM view and the player view feed it different projections of the same state. The player link sends changes (token moved, HP state changed) instead of the whole scene, with a full snapshot on connect.

**Character link.** `services/character-link/` keeps today's port. Party, inventory and encounter expose what the link needs through their repositories and events; the link no longer writes into their tables with its own field names (section 9).

**How the future features fit**

- *More of the character app:* a second provider implements the same port; shared entities are compendium ids, which both apps already take from Foundry.
- *Encounter builder to VTT:* exists; in the new model a built encounter is a list of combatants with an actor reference each, which is also what the VTT places.
- *Milestone leveling:* exists; becomes entries in the party ledger, so new milestone rules (levels per chapter, a milestone track) are new entry types, not new tables.

**Testing**

- `domain/`: unit tests, the existing 557 carried over, coverage gate.
- `data/`: repository tests on `fake-indexeddb`; one migration test per schema version.
- `services/`: legacy import against a synthetic fixture covering every table and field, and against your real backups when present (section 10); backup round trip (export → wipe → import → compare); homebrew and Foundry fixtures as today.
- `features/`: Playwright flows for the three main flows of section 6 and one per checklist section; each phase adds the flows for what it built.

---

## 9. Target data model

Principles

1. **String ids (UUID v7) on every row.** Sortable by creation time, unique across devices. Merging a file never renumbers anything; references are plain ids. Compendium ids stay as they are (`fvtt:pf2e:<pack>:<id>`, UUIDs for homebrew).
2. **One naming style** (`camelCase`), real booleans, ISO timestamps, no JSON-in-strings.
3. **Every row type is a Zod schema**; entry data is a discriminated union per type, not a free-form bag.
4. **References by id, text by name.** Markdown keeps `{{npc: Name}}` because you and Claude write it. On save each link is resolved to an id and stored in `links`; renaming an entry rewrites the references to it.
5. **Everything you made is in the database** and therefore in the backup. localStorage keeps only device matters (sidebar width, the Play Buddy pairing token, the backup folder handle).
6. **Append-only ledgers** where history matters (party advancement, combat log), each entry carrying what is needed to undo it.

Collections (old → new)

| New collection | Holds | Comes from |
|---|---|---|
| `campaigns` | name, description, game, banner image, rules options, character-link settings | `campaigns` |
| `entries` | lore entries: `type`, `name`, `body` (markdown), `data` (typed per type), `favorite`, `tags` | `entities` |
| `links` | resolved references between entries and to compendium entries (source, target id or unresolved name, kind) | `entityLinks` |
| `entryVersions` | historical states | `entitySnapshots` |
| `mapPins` | pins on a location's map (map entry, pinned entry, x, y, hidden) | `attributes.mapPins` |
| `graphs`, `graphEdges` | named graphs with node positions and player visibility; hand-made connections | `graphLayouts`, `entityConnections` |
| `sessionPanels`, `sessionEdges` | board panels and connections | `sessionPanels`, `attributes.board` |
| `actors` | token library: name, image, and what it stands for | `tokens` |
| `encounters` | preparation: name, status, map, grid, FOV switch, playlist, party level override, starship setup | `encounters` (part) |
| `combatants` | tokens placed in an encounter: position, HP, conditions, timers, flags, **one** `actor` reference | `encounterTokens` |
| `encounterMaps` | walls, fog, areas, battle map tiles, viewport, sensor map (written often, kept apart from the encounter row) | `encounters` (part), `encounterWalls` |
| `combatLog` | one row per logged event | `encounters.combat_log` |
| `characters` | party members; `link` holds the character-app link (provider, player id, character id, mirror) | `characters` |
| `partyLedger` | level-ups, XP awards, treasure awards, encounter resolutions; each undoable | `levelUps`, `xpAwards`, `treasureAwards`, `encounters.resolution` |
| `inventory`, `purses` | as today, with a typed owner (`{ kind, id }`) and link fields under `link` | `inventory`, `purses` |
| `linkOutbox` | offers and requests to the character app | `linkOffers` |
| `starships` | as today | `starships` |
| `rules`, `syncState` | compendium, unchanged in shape | `rules`, `syncState` |
| `images` | blobs with thumbnails, plus a reference count for automatic cleanup | `images` |
| `mapAssets` | map maker library | `mapAssets` |
| `soundTracks`, `soundPlaylists` | sound library (now backed up; file handles stay on the device, the file name is kept to re-link) | same |
| `workspace` | per campaign: Desk layout and saved layouts, scratchpad, tray pins, builder draft, NPC generator config, view preferences | localStorage keys |
| `settings` | app settings | localStorage `startome.settings` |
| `meta` | schema version, last backup, import history | new |

The actor reference that replaces three link fields and three PC flags:

```ts
type ActorRef =
  | { kind: 'rules'; rulesId: string; adjustment: 'weak' | 'elite' | null }   // compendium creature, hazard, vehicle, starship
  | { kind: 'entry'; entryId: string }                                        // a campaign NPC
  | { kind: 'character'; characterId: string }                                // a party member
  | { kind: 'none' }                                                          // a bare token
```

"Is this a player character" is then one fact: the combatant's actor is a character.

Schema changes after the rework go through numbered migrations, each a pure function with a test, and the backup carries its schema version so an old backup is migrated on import by the same code.

---

## 10. Getting legacy data in

**An in-app legacy import, not a Python script.** It can reuse the Zod schemas and the existing v1 → v2 row normalisation, it runs where your data is, and it is tested by the same suite as everything else.

Two entrances, one converter:

1. **From this browser.** If the new app is served from the same origin as the old one (it will be, on GitHub Pages), it opens the old `startome` database read-only and reads the `startome.*` localStorage keys. One click, no 578 MB file in between, and it brings what no export contains: Desk layouts, saved layouts, scratchpad, bookmarks, builder draft, settings, sound library.
2. **From a file.** Any `version: 2` backup or campaign file, read as a stream. This is the path the tests exercise and the fallback for another machine.

The converter is a pure function: old rows in, new rows plus a report out. The report lists, per collection, how many rows came over and every row it had to repair or drop, with the reason. Nothing is written until the whole conversion has succeeded, and the old database is never modified, so you can go back to v0.41 at any time.

What it handles that is easy to forget: ids inside attributes (pins, quest givers, region parents, graph positions, panel attributes, crew, presets, resolution records, log entries), `value | string` columns, inline base64 images from before v0.17 (your 11-03 backup has 138 MB of them in entries), sessions with `scriptContent` / `notesContent` from before the board, the three PC flags, owner strings, name-based links resolved to ids (unresolved ones kept as unresolved, listed in the report), bookmarks with old routes.

Tests you can rely on:

- A synthetic export in the repo with every table and every field variant, converted and compared against a checked-in expected result.
- `STARTOME_LEGACY_EXPORT=/path/to/file`: when set, the suite also converts that real file and checks invariants: every campaign, entry, encounter, token, character and inventory row accounted for (converted or listed in the report), every reference resolves, every image referenced exists, counts match the source. Your files are private and too large for the repo, so this runs on your machine and not in CI. I would run it against `startome-all-2026-11-03.json` (old shapes) and a fresh export you make before the cut-over (current shapes).
- Round trip: legacy import → backup v3 export → wipe → import → identical database.

**One small change to the current app first (Phase 0):** v0.42 adds the localStorage state and the sound library to the full backup, so that the file path loses nothing either and you have a complete safety copy before anything else happens.

---

## 11. Implementation phases

The new app is built on a `rework` branch and published to a second path (for example `/StarTome/next/`) so you can try each phase with your real data while `main` keeps running your sessions. At the end of every phase: the new app builds, all tests pass, the legacy import brings your data in, the checklist items of that phase are marked, one commit.

| Phase | Builds | Checklist sections | You can do at the end |
|---|---|---|---|
| **0 Safety net** (on `main`) ✅ | v0.42.0: the full backup includes the sound library and the localStorage state (layouts, bookmarks, settings; never the Play Buddy token), and a restore puts them back. "Wipe all data" clears every table. Tests in `tests/backup.test.ts`. The synthetic legacy fixture moves to Phase 1. | M4, M14 | Take a complete backup. |
| **1 Foundation** ✅ | Vite + Vue + strict TypeScript project, lint rules, design tokens and both skins, shell (rail, command bar, dock, tray), domain schemas, database, repositories, backup v3, legacy import with tests, backup folder. Pure rules and their tests moved over. | S, parts of A, M3–M5 | Import everything, switch campaigns, search, open any entry read-only in the dock, export and restore a backup. |
| **2 World** ✅ | Entry browser, editors for all ten types, markdown editor with links and widgets, backlinks, history, favourites and tray pins, maps with pins and regions, player map, graphs, timeline, lore exports. | C, D, E1–E4, O, P, M6–M7 | Do all campaign writing in the new app. |
| **3 Compendium** ✅ | Browser, stat blocks with rolls, entry editor, creature builder, homebrew import and packs, Foundry sync, image folder import, field notes, dice panel. | L, E5–E7, M9–M11 | Look up and maintain rules content. |
| **4 Party and loot** ✅ | Roster, ledger (XP, milestones, level-ups), inventory, wealth, treasure roll, earn income, companions. | H, I, J1–J2 | Track the party between sessions. |
| **5 Encounters** ✅ | List, builder, VTT engine (prepare and run), tokens, conditions and automation, areas, resolve, player view, map maker, token library. | G, J3–J4 | Run a fight. |
| **6 Sessions and the table** ✅ | Session board, capture, recap and finish, session log, table bar, Tonight, Desk with all widgets, sounds. | F, N, Q, B | Run a whole Pathfinder session in the new app. |
| **7 Starfinder** ✅ | Starship page, crew, interior map, sensor map, starship combat, starship encounters. | J5–J15 | Run a Starfinder session. |
| **8 Link, polish, cut-over** | Character link (Play Buddy), settings, shortcut cheat sheet, offline and install checks, performance pass with measurements, final parity audit, move the new app to the main path, tag the old one. Summary report. | K, R, A, T, the rest | Retire v0.41. |

Order reasoning: data safety first; then the parts every later phase leans on (entries, compendium); party before encounters because resolution writes to the ledger and the stash; sessions after encounters because the table bar and board run encounters; Starfinder after its dependencies; the character link last because it touches party, inventory and encounters and has a mock server to test against.

During the build your live data is in the old app. Each time you try a phase you re-import (the import replaces the new app's database), so nothing has to be kept in step until the cut-over.

### 11a. Phase log

**Phase 1, Foundation (done 2026-11-12, branch `rework`).**

What exists: the new app in `src/` (Vite, Vue, strict TypeScript, ESLint with the layer rules of section 8), the old app moved to `legacy/` as reference with its 560 unit tests still running (`pnpm test:legacy`). Every collection of section 9 has a Zod schema and a store. The legacy import (`src/services/v042/`) works from a file and from the old database in the same browser. Backup version 3 exports, restores and adds. The backup folder writes a zip when the last backup is a day old. The shell has both skins, the rail, the command bar, the peek dock and the tray; Tonight and World are read-only views of the imported data.

Checked against real data: the backup of 2026-11-12 (591 MB: 2 campaigns, 295 entries, 23 encounters, 204 placed tokens, 2,702 map assets, 5,255 images) imports in the browser in about 5 seconds with nothing dropped, no reference pointing at nothing and no image missing. The 2026-11-03 backup (older row shapes) converts the same way.

Tests added: 23 for the legacy conversion on a synthetic backup with every table and awkward shape, 1 that runs against a real backup when `STARTOME_LEGACY_EXPORT` points at one, 7 for backup round trips, 2 browser tests (new campaign and skins and command bar; backup download and restore).

Differences from the plan as written:

- **Pure rules move with their feature, not all in Phase 1.** `rules/`, `converters/`, `partylink/` stay in `legacy/` (tests running) until the phase that uses them moves them into `src/domain/`. Several of them take v0.42 row types as input, so moving them before their feature's new types exist would mean adapting them twice.
- **The backup folder holds zips, not an unpacked folder.** Simpler and each file is a complete backup, at the cost of writing all images each time (about 450 MB per backup for your data, three kept). Sharing images between backups, as BACKUP_V3.md describes, is still open.
- **No reference screenshots** (decision in section 0).
- **Editing is not in yet.** Tonight and World show data; the editors come in Phase 2. The only writes are: new campaign, settings, tray pins, imports.
- **The preview is not published yet.** Putting the rework at `/StarTome/next/` needs a change to the deploy workflow on `main` (build both branches). Until then it runs locally with `pnpm dev`, and the import "from v0.42 in this browser" only finds the old database on the same address.

Checklist: A11, A13, M4, M5, M14, S3 verified. Section S1–S2 (offline) wait for the cut-over build check in Phase 8.

How to try it: `git switch rework && pnpm install && pnpm dev`, open http://localhost:3001, Import & Backup, "From a v0.42 backup file…".

**Phase 2, World (done 2026-11-12, branch `rework`).**

What exists: entries can be created, written, renamed and deleted from the World list without leaving it (they open in the dock; Shift+Enter or double-click opens the page). Each of the ten types has its typed fields; images are uploaded or linked and keep their format. The editor has the three modes of decision F7: Live (click a block to edit it), Source (the whole text as one document) and Read, with `{{` completion for entries and compendium entries, the toolbar, GM-only blocks, tasks you can tick and clocks you can advance in rendered text, dice, tables and pickers, and print without GM-only text. Links are stored resolved: a rename rewrites every text that names the entry (bodies, quest rewards, table rows, quest givers), a link written before its target exists starts working when the target is created, and deleting an entry leaves the text that named it and marks the link as missing. History is a list of recorded states with view, restore and delete. World has four views: Entries, Maps (pins, hide from players, step into a pinned location's map, regions drawn as polygons or placed later), Graphs (several per campaign, mention lines, hand-drawn connections with label, direction, line and colour, hiding entries or single facts from players) and Timeline. Maps and graphs each have a players' window that follows what the GM has open. Import & Backup exports the lore as one Markdown file, a folder of Markdown files, or the quest board (version 2).

Tests added: 10 for entry writes and references, 4 for the block editing helpers, 4 for the exports, 3 browser tests (write, link and rename; fields, live editor and a region without a map; graph and timeline). Totals: 48 unit tests and 5 browser tests in the new app.

Bug found by the browser tests and fixed: Escape pressed inside an editor closed the dock and lost sight of the entry.

Not done in this phase, by item:

- **World list (C1–C6):** search, type, tags, favourites, the "dead, destroyed, closed, false" switch and three sort orders are in. Not in: filters per field (status, ancestry, faction …), grouping, the gallery and table densities, the A–Z rail, Space to favourite. The hover card is replaced by the dock.
- **Note icon (C21)** and all icons stored by name: the icon set is not bundled yet, so the icon cannot be chosen or shown. The stored names are kept.
- **Embedded cards (D5):** `{{npc: Name | entry}}` shows as a link, not as the entry's card.
- **Link completion (D4):** entries and compendium entries complete; encounters, graphs and historical states do not.
- **Command bar commands (E4):** it goes to places and finds things; add, rename, delete, edit, roll and DC commands are not in.
- **NPC (C13–C15):** ancestry and class are plain text until the compendium phase adds suggestions and the progression panel. "Last seen in session", faction and location derived from links are not shown.
- **Faction member count (C17)** is not shown.
- **Quests (C19):** completing one sends the event; the level-up and XP prompts arrive with the party phase.
- **Sessions (C25):** fields and a read-only list of the imported panels; the board is Phase 6.
- **Dice results (D6)** appear as notices until the dice panel of Phase 3.
- **Removed as decided:** per-type JSON export (F9), event links of historical states and the timeline strip (F4).

Checklist: C8–C10, C12, C16, C18, C20, C22–C24, D1–D3, D7, D9–D11, O1–O5, P1–P5, M6, M7 verified.

**Phase 2 leftovers (done 2026-11-12).** Of the list above, now in:

- **World list:** with one type chosen, its fields become filters with counts (an NPC's vital status, status, ancestry, class, level; a location's type and discovery; and so on) and choices for grouping. Grouping by type or first tag works across types. Three views: rows, gallery, table (the table's columns are the chosen type's fields). Space toggles favourite, a letter rail jumps through long name-sorted lists, and sort, grouping, view and the archive switch are remembered per campaign.
- **Icons:** `scripts/build-icons.mjs` bundles the 130 Game Icons v0.42 used or offered (204 KB, loaded apart from the first load) instead of the whole 6.7 MB set. Notes have their icon picker back, and stored icon names show in lists.
- **Embedded cards:** `{{npc: Name | entry}}` shows the entry's picture, facts and first lines in place.
- **Link completion** also offers encounters and graphs; a graph link opens the graph.
- **NPC and faction relations:** an NPC shows its factions, where it is found (linked or pinned on a map) and the last session that names it; a faction shows its members.
- **Command bar commands:** `new npc Name` (any type), `roll 2d6+3` or just `d20+7`, and on the entry open in the dock `rename …`, `append …`, `favourite`, `delete`; `light` and `dark`.

Still open from the list: collapsible groups with previews and paged rendering (C3; lists of a few hundred entries render at once without trouble), filters by an NPC's faction or location, completion and links for historical states, the old "edit attribute" and DC commands (the DC table arrives in Phase 3), and everything listed as waiting for a later phase.

Tests added: 3 for command parsing, 1 for relations, 1 browser test (commands, field filter, table and gallery, embedded card). Totals: 52 unit tests and 6 browser tests.

**Phase 3, Compendium (done 2026-11-12, branch `rework`).**

What exists: Compendium is one place with four views. **Browse** lists every kind in one list (or one kind), filtered by game, level range, rarity, traits, source, pack, favourites, superseded legacy and removed upstream, sorted by name or level, with the filters remembered per kind; the entry you pick shows beside the list. **Stat blocks** cover all 19 kinds; Perception, saves, skills, Strikes (three attacks with the multiple attack penalty, damage, critical, two-hand) and spell attacks are buttons; names of other entries are links; Recall Knowledge and Field notes are on creatures. The same view opens in the dock from links, the command bar and the tray. **Editing** works for every kind from one field list per kind (`features/compendium/editorFields.ts`); an edit to a synced entry is kept as a local edit ("edited" badge, Reset). New entry, duplicate as homebrew, delete, favourite, portrait and token art are on the entry. The **creature builder** builds from the tables and rebuilds at another level. **Foundry sync** (drop the zip, choose packs, worker, progress, report with conflicts and conversion notes, older-release warning, latest-release check, licences), **Homebrew** (drop, pick or paste; checks and fixes listed; pick entries; default game and pack; copy the problem list; packs exported, renamed, deleted) and **Art** (a folder of images matched to entries by name, reviewed, stored as portraits or token art) are the other three views. The **dice panel** sits on the tray: pool, modifier, natural 20 and 1, history; rolls from text, stat blocks and the command bar land in it. The command bar finds compendium entries with word starts and typos and answers `dc 5 hard` and `dc expert`. Import & Backup offers the two format guides, shows every collection's row count and the storage used, and sends a dropped Foundry zip or homebrew file to its screen. NPC ancestry and class fields offer the compendium's names.

Moved from `legacy/` into `src/`, with their tests: rolls, DCs, the registry, formatting and parsing, local edits, the entry factory, packs, the homebrew checker (split into three files to stay under 400 lines), field notes, creature building, subclasses, areas, SF2e gear, the Foundry converters, the pf2ools relic gifts converter, name search, and the Foundry sync. The converters produce the same output as before (checked against the v0.42 snapshots).

Checked against real data: the PF2e 8.7.0 release (21,046 entries from the 30 default packs) and the SF2e 1.7.0 release (5,638 from 15) sync with no failed entry, and a second run changes nothing (`STARTOME_FOUNDRY_ZIP=<zip> pnpm test tests/rules/realRelease`). The 2,281 homebrew entries imported from v0.42 browse and render.

Tests added: 210 unit tests moved over with the rules (rolls, DCs, parsing, homebrew, field notes, creature building, subclasses, packs, converters, search, the compendium repository, the sync), 3 for the editor's fields (every field of every kind reads back what it shows), 3 for image name matching, 1 for the DC command, 2 browser tests (sync a small release, find, read, roll, edit and reset, look up from the command bar; import homebrew from pasted text, build a creature, create an entry). Totals: 269 unit tests and 8 browser tests in the new app.

Bug found by the browser tests and fixed: the development server reloaded the page the first time the sync worker loaded its zip library, dropping the chosen file.

Differences from v0.42, and what is left:

- **"Place area"** (L3) is built into the stat block but only appears where a map can take the area: the encounter of Phase 5. The starship "Zone area" button comes with Phase 7.
- **Images that are replaced or whose entry is deleted stay in storage.** Decision F11 says unused images are removed automatically; that clean-up is not written yet (it must know every place an image is used, which is complete only once all phases have their data). Until then nothing is lost, storage only grows a little.
- **Local edits are kept per field, not per sub-field.** Changing a creature's Fortitude stores your whole "saves" line; a later Foundry change to its Will would be reported as a conflict with your edit instead of merging silently.
- **Callouts other than GM-only** (`> [!note]`) show as plain quotes.
- **A sync or import in another window** does not refresh a list that is already open; reload that window.
- **NPC progression panel** (C15) is not built here: it lists feat slots and choices per level, which belongs with the party's level-ups in Phase 4. Ancestry and class suggestions are in.
- **Command bar**: the old "edit attribute" command is still not in.
- **Wealth helpers** that read the compendium (median consumable prices) and the attachment rules move with Phase 4.
- **Code rules relaxed in two places**, both on purpose: the Foundry and pf2ools converters may use untyped values (they read other people's JSON), and the unit tests moved from v0.42 (`tests/rules/`) are run but not type-checked under the stricter settings.
- **The sync still uses JSZip**; the plan's switch to fflate applies to backups, which have it.

**Phase 4, Party and loot (done 2026-11-13, branch `rework`).**

What exists: **Party** is one page. The **roster** adds members from an NPC entry or a typed name, as player character or companion; level (stepper), XP and Strength are edited in the row; a member's level is also what its NPC entry states; removing a member sends their items and coins to the stash. "Is this NPC a player character" is one fact now (a party member of role PC points at the entry), so the switch on the NPC and the roster cannot disagree. The header shows the party level with the mixed-level hint and, in milestone campaigns, the pacing since the last level-up. **Level up party** and **Award XP** are two prompts that also open by themselves: a completed milestone quest asks to level up, a completed quest in an XP campaign offers quest XP, and anyone reaching 1,000 XP is offered a level-up that costs it. Level-ups, XP awards and treasure awards are entries of one ledger, each with its undo. **Companions** get a stat block built from type and stage, written as a homebrew creature that follows the companion's level. **Earn Income** pays into a member's purse. The **inventory** is one list for the stash and every character (and, by a switch already built in, an encounter's loot): add from the compendium or as free text, quantity, "as treasure", unidentified; a click on a stack opens everything about it (name, price, Bulk, grade and upgrade slots in Starfinder, GM notes, identify with player name and description, container, relic and aspects, implant, move a quantity, attach runes, talismans, upgrades or gifts, delete). Coins per purse with money parsing, give to another owner, split evenly. GM view and player view. Bulk and encumbrance against Strength, containers with capacity. Starfinder upgrade slots and their warnings, installed weapons, augmentations with the limit warning. **Wealth** shows awarded against expected treasure, "matches level N", the pace within this level, the baseline, the consumables and ABP switches, the gear check per member, recorded awards with undo, and the treasure roll. An NPC entry with a class has a **Progression** section: class features and feat slots by level, each slot listing the feats that fit.

Moved from `legacy/` into `src/domain/rules/`, with their tests: party, inventory, attachments, wealth, advancement, income, treasure roll, companions, progression, and (ahead of Phase 5, because advancement needs them) encounter and combat.

Checked against real data: the Codex campaign imported from v0.42 shows its five members with portraits, six purses, the stash and the wealth readout (71% of expected, baseline of 5 November).

Tests added: 99 unit tests moved over with the rules, 9 for the party and inventory writes (members and their entry's level, level-ups and XP with undo, companions, stacks merging and splitting, attaching and replacing runes, containers, coins, the wealth readout), 2 browser tests (members, XP, level-up and undo; coins, an unidentified item, the player view, a move, awards and the readout). Totals: 377 unit tests and 10 browser tests.

Differences from v0.42, and what is left:

- **Everything Play Buddy** waits for Phase 8: level-up and item offers to linked players (H9), the read-only mirror of a linked character's inventory. Linked characters and their mirrored stacks are imported and shown (marked "in their app"), but nothing is sent.
- **The treasure roll** puts its result in the stash and counts it as a treasure award. In v0.42 it only filled an encounter's loot; that use comes back with the encounter's loot dialog in Phase 5 (the same component, pointed at the encounter).
- **Tokens** are Phase 5: a companion's stat block is written, but not yet linked to its map token.
- **Old rune fields.** v0.42 turned runes stored the old way (a "+1 striking" field on the item) into attached rune entries when the compendium had them. That conversion is not carried over; such an item shows its runes as a label and counts in the gear check, but lists no attached runes.
- **The roster's "Build encounter" button** comes with Phase 5.
- **Quest names in the log.** A level-up from a milestone quest says "Milestone quest", without the quest's name.

**Phase 5, Encounters (done 2026-11-13, branch `rework`).**

What exists: **Encounters** has three views. The **list** finds encounters by name and status and opens, copies, resolves, re-opens or deletes them. The **builder** searches creatures and hazards (level range, "near the party", rarity, traits, both games), keeps a selection with counts, weak or elite, XP per line, warnings and the threat meter against the party's level (or one you set), shows the treasure pace, and "Create encounter" puts the party's tokens and every enemy on a new prepared encounter; the selection is a draft kept with the campaign. The **token library** is shared by all campaigns: name, picture, what the token stands for (a stat block with weak or elite, an NPC, a party member), "picture follows the entry", "player character".

An **encounter** opens on its map. Its mode is its status: Prepare, Run, Resolved. *Prepare*: map from a file, a web address, a dropped image or the map maker; grid size and offsets; "sight and walls"; music; the difficulty meter (party level override, allies and party left out, removed enemies still counted until forgotten, tokens without a stat block noted); loot (the party's inventory panel pointed at the encounter, with what the enemies carry as suggestions and the treasure roll); what the players' window shows; add creatures from the compendium or tokens from the library (click, or drag onto the map). *Map tools*: select (drag tokens, click doors, drag the map to pan, hold to ping), fog (hide, reveal, brush, cover all, clear all), ruler in feet, areas (burst, cone, line, emanation with the placement rules; an area can carry a save, DC, damage, conditions per degree, and linger), walls (seven kinds, snapping, Backspace, Ctrl+Z, right-click to open, change or delete), ping. Right-click gives a menu for a token, a wall, an area or the bare map. *Tokens* show portrait or initial, side, HP and temporary HP arcs, condition ring, hidden, elevation and timer badges, the acting ring and the dead mark. The token editor and the conditions dialog cover everything of G32 and G35 except what is listed below. *Run*: turn order with round, next and previous turn (previous undoes exactly what the turn change did), roll all initiative, a formula with presets, an HP field per row, ticking rows to show, hide or remove, quick add (`A`), recovery checks with dying, wounded and doomed, persistent damage with its flat check, frightened and stunned ticking down, action reminders, temporary HP rules, timers, hidden tokens that still act, and the log (one row per line in the database). Rolls from a stat block in the dock are rolled against the chosen target's AC, can be applied to it, and are logged under the selected token; "Place area" and the Area Fire and Auto-Fire buttons put the area on the map and ask for saves. *Resolve* shows the enemies and XP, who took part, accomplishment XP and the loot; it awards XP in XP campaigns, records it in milestone ones, moves the loot to the stash and offers the level-up at 1,000 XP. Re-open takes the XP back and the loot as far as it is still in the stash. The **players' window** follows live: map, fog, what their tokens see, tokens with health as a shade, areas, pings, the turn order with visible conditions; it reconnects when either window reloads. The **map maker** paints tiles (brush, rectangle, room, fill; right-click picks a tile), resizes, undoes and redoes, pans and zooms, keeps an asset library (files, folders, drops; folders, search, paging), places, moves, resizes, rotates, mirrors, layers, restacks and duplicates assets, and "Use as encounter map" renders the image, sets the grid and, with "Make walls", derives walls and doors and turns sight on.

How it is built: `src/features/encounters/vtt/engine/` is the map engine (Pixi), which draws a plain scene and reports pointer input; it knows nothing of Vue or the database, and the GM's and the players' windows feed it different projections. `vtt/live.ts` (tokens, log), `turns.ts`, `areasLive.ts`, `playerSync.ts`, `rolls.ts` and `tools.ts` are the slices of the open encounter's state. What the players get is built by one pure function, `domain/rules/playerView.ts`, as a whitelist. Every write goes through `data/encounters.ts`, `data/resolution.ts` and `data/encounterBuild.ts`.

Moved from `legacy/` into `src/domain/rules/`, with their tests: temporary HP, the turn effects, the condition catalogue, the battle map tiles and walls, the map asset rules; sight (the visibility polygon) became `walls.ts`.

Checked against real data: the 23 imported encounters of The Codex list with their status, tokens and rounds; "The Fort" opens with its map, walls, sight and the turn order at round 3 with its log of 42 lines.

Tests added: 44 unit tests moved over with the rules, 15 for the encounter repository, the builder, resolving and re-opening, difficulty, the players' projection (nothing of the GM's leaves) and sight; 5 browser tests (a fight by hand with damage, conditions, turns, undo, the log, the players' window and a reload; an area's saves; builder, stat block roll against a target, resolve and re-open; the map maker; the prepare tools, menus and dialogs without errors). Totals: 436 unit tests and 15 browser tests.

Bugs found by the browser tests and fixed: two quick saves of the same encounter could overwrite each other (status lost when a fight started); the players' window was sent reactive objects, which cannot be sent; a changed label did not rename the token until reload.

Differences from v0.42, and what is left:

- **Enemy tokens of your imported encounters show as "Token"** until the Foundry compendium is synced in the new app: their names come from the stat block, and the preview's compendium holds only your homebrew so far.
- **Everything starship** (G3, G8, sensor map, stations, shields) is Phase 7. Tokens on a sensor map are kept and take turns, but are not drawn.
- **Everything Play Buddy** is Phase 8: damage requests to linked players, asking them to roll initiative, their shared numbers in place of a stat block.
- **Music (G16):** the playlist link is stored; the offer to play it when the fight starts comes with Sounds in Phase 6.
- **The mode is the status.** Prepare and Run are the encounter's status in the database, not a setting of the browser.
- **Sight for players in "All" mode.** With sight on and the GM seeing everything, the players' window shows what the players' tokens see together. In v0.42 it showed no darkness at all in that mode.
- **Pictures are not sent to the players' window**; it reads them from the same local storage. The scene itself is sent whole (it is small without pictures), at most once a frame, not as single changes.
- **The stat block of a token opens in the dock**, not in a panel of its own; a bar under the turn order shows the selected token and the target of its attacks.
- **Conditions:** colour per condition on the token; no icon picker, and the colour is not saved back to the compendium entry. The condition's name opens the compendium's rules text.
- **Shape overlays** are areas without an effect (decision F6). Old shape overlays were never stored, so nothing is lost.
- **Left-drag pans the map** in the select tool (as well as the middle button and Alt-drag).
- **Creature builder from the encounter builder (G7):** a link to the compendium, where the creature builder is; not a dialog inside the builder.
- **Dragging a compendium creature onto the map** from the compendium list is not wired (the map accepts it; the list does not offer the drag). Search and click, or right-click the map, adds one.
- **Bulk "roll for one token"** and a per-token initiative roll are the initiative field and "roll all" (which only fills empty ones).
- **Not exercised by a browser test:** dropping an image on the map, dragging from the library, importing assets into the map maker, weak and elite stat blocks in the dock, lingering areas, the recovery and persistent damage prompts (their rules are unit-tested).
- **The Party page's "Build encounter" button** is still not there; the builder is one click away under Encounters.

**Phase 6, Sessions and the table (done 2026-11-13, branch `rework`).**

What exists: **Sessions** lists the campaign's sessions (number, date, state, how much is on the board and in the log) and has the **session log**: every session with what was logged, in order, and its plan. A session opens on its **board**: scenes, beats, clues, encounters, logs, notes, entries, random tables, rewards and frames, added from the toolbar (beside what is there) or by right-click at the pointer; dragged freely; a panel dropped into a frame belongs to it and moves with it; frames resize at their corner. Panels connect by dragging from one to another (planned path, happened next, attached; a label; click a connection to change or remove it). Double-click opens a panel beside the board: title, text in the same editor as everywhere, tags, status, and what its kind links to. Statuses cycle with a click. An encounter panel runs its encounter and, once that is resolved, logs the outcome; a random table panel rolls and logs the result; a reward panel awards its XP. The **drawer** holds panels kept for later, searchable by text or tag, and offers scenes of other campaigns to copy. Switching to **Run** sets today's date, shows the **recap** (what was marked "players should know" last time, to tick off) and brings up the **capture bar**: type what happened, Enter logs it on the selected panel (which then counts as played and joins the numbered "happened next" chain) or on the board as improvised. **Finish** lists what did not come up and sends it to the next session (made if there is none, in a frame), to the drawer, or leaves it; a scene that continues is copied. Review fades what came up. The session's text, which search and backlinks read, is rebuilt from its panels on every change.

The **table bar** sits on top of every screen while a session of the open campaign runs: its name (back to the board), a field that logs from anywhere (Alt+L), the round and who is acting when an encounter is open, and the party with levels.

**Sounds**: tracks from local files (only a link is kept; a file imported from a backup or another device is linked again with one click), web addresses and Spotify links; tags as automatic playlists; playlists with colour, shuffle and loop. The **player** appears on every screen while something is queued: play, pause, previous, next, seek, volume, shuffle, loop, a playlist menu, and the output device picker (the way to send sound to a paired Bluetooth speaker). An encounter with a linked playlist offers it when the fight starts and has a button for it.

The **Desk**: a free board of widgets, moved by their bar, resized at the corner, snapping to a grid; pan by dragging the board, zoom with the wheel or the buttons, fit; three densities; Shift+click to move several at once. The palette (collapsible) has the tools, what you pinned to the tray, and a search over entries and the compendium; double-click or drag to add. Tools: scratchpad (kept apart, so clearing the Desk keeps it), encounters, conditions, DCs by level with the adjustments and simple DCs, timer (stopwatch or countdown), compendium lookup, a pinned compendium entry, NPC generator (name, ancestry and class from the compendium, "keep as an NPC entry"), weather from your own list. Entry widgets show picture, facts and text, and a random table rolls in place. The layout is the campaign's and in the backup; reset, clear, "suggest a layout" and named saved layouts. Layouts imported from v0.42 open as they were.

**Start page and Tonight**: campaign cards with a count per entry type (a count opens World filtered to it), last change, and edit, copy and delete. Campaign settings: name, description, game, XP or milestones, the three automation switches. A copy gets new ids throughout, shares the token library and images, and starts without ledger or combat logs. Delete removes everything of the campaign after one confirm that says how much that is. "Create the demo campaign" is a button. Tonight has the banner (add, change, remove), opens the session's board, and links to the graphs.

Moved from `legacy/` into `src/domain/rules/`: the session board rules and the name generator.

Checked against real data: The Codex's 39 sessions list in order (their number is read from the name when the field is empty), and Session 39 opens with its 12 imported panels, their connections, and its encounter panel linked to "The Fort".

Tests added: 16 unit tests (sessions and their text and links, drawer, logging, carrying over, the board rules, copying and deleting a campaign, settings, sounds, the Desk's layout) and 5 browser tests (plan, run, log, finish and read back; the table bar; the Desk; sounds; demo campaign, copy, settings, delete). Totals: 452 unit tests and 20 browser tests.

Bugs found and fixed on the way: new panels were put on top of each other; the encounter map kept watching the encounter after its page was left (from Phase 5), which threw errors once the page was gone; Tonight's quick links duplicated the rail's.

Differences from v0.42, and what is left:

- **Capture bar:** no `@` or `{{` completion while typing a log line; a link typed in full works. The panel editor has completion.
- **Party panel on the board (F11)** and hero points in the recap need Play Buddy's numbers: Phase 8. The table bar shows the party's names and levels.
- **NPC portraits beside mentions in panel text (F17)** are not drawn; an entry panel links the NPC.
- **Connections** run from a panel's lower dot to another's upper dot, not between the nearest sides.
- **Desk entry widgets are not edited in place**: the name opens the entry in the dock, where everything is editable. A location widget shows no map with drill-down. The DC widget has no Recall Knowledge line for a pinned creature (the stat block in the dock has it).
- **Weather** stayed a small widget with your list instead of becoming random tables (decision F13 said tables): nothing had to be converted and nothing is lost. Say if you want the conversion.
- **A compendium entry on the Desk** is a card that opens the stat block in the dock, not the stat block itself.
- **Renaming an entry** rewrites the texts that name it, but not yet the text of session panels; the session's own text is rebuilt from the panels, so a renamed NPC shows as a missing link there until the panel is edited.
- **The cross-campaign home** (recent entries and quests of all campaigns) is gone as decided (F20); the cards carry the counts.
- **Local sound files** need Chrome's file access, as planned; other browsers can only use web addresses.
- **Not exercised by a browser test:** dragging panels into frames, drawing connections, the drawer's copy from another campaign, random table and reward panels, playing an actual audio file and switching the output device, saved Desk layouts.

**Phase 7, Starfinder (done 2026-11-13, branch `rework`).**

What exists: the **Starship** page (from the Party page, in Starfinder campaigns). Several ships, one of them the party's; a ship is made from a frame, which brings its stations. The sheet follows the ship's level (the party's, or one you pin): Hull and Shield Points (current and maximum), AC, saves, speed, sensor range, the four lasting conditions, what the last level brought, notes and a picture. **Battle stations**: the frame's own and the ones you choose, each with its grade, helmed bonus, upgrades against its limit (with warnings for an upgrade in the wrong station, above the ship's level, or too many), and its actions. **Expansion bays** with their options against the frame's slots. **Crew**: each party member at a station, as free crew or not aboard; their exploration activity; the skill rolled for initiative there, entered by hand; seatings saved by name. **Emergency Repairs** rolls Crafting against the DC of the rank attempted and applies the result. The ship's **interior** is an encounter map: its Stations panel places each station on a square. **Start a starship battle** (also "+ Starship" in the encounter list) copies the interior with its walls and whatever stands on it, puts the ship on the sensor map and seats the crew at their stations.

In a starship encounter the side panel has two more parts. **Stations**: who stands on (helms) which station, the ship's AC and saves right now (helmed bonuses, the pilot's Piloting DC if higher, inoperable, off-kilter), the acting crew member's station actions, malfunctioning stations, the hull integrity check of a compromised ship, what the exploration activities give when initiative is rolled, and "Save positions as crew". **Sensor map**: a row of zones (3 to 30) with ships and hazards facing left or right; select one to move or turn it, hide it, open its stat block, see its sensor range and from where it is caught off-guard; damage goes to Shield Points first unless bypassing, then the hull; Generate Shields, Fortify, Repair Self; a zone area (cone, line, emanation, burst with its range) shows whom it hits and asks for saves in the same save prompt as areas on the map. The party's ship at 0 Hull Points becomes compromised (plus its wrecked value; 2 on a critical hit; inoperable on nonlethal), every station malfunctions and it joins the turn order; the hull integrity check moves compromised up or down; at 10 it is destroyed; repaired above 0 it is wrecked one step more. Hull, shields and the lasting conditions are written back to the ship. The players' window shows the row of zones: their ship in numbers, the others as a word. The **builder** has a "Starship encounter" switch (starships in the search, the small-crew budgets, the concierge variant) and creates the battle with ships on the sensor map facing the party and boarders on the interior.

Moved from `legacy/` into `src/domain/rules/`, with their tests: starship stats and grades, the party's starship (sheet, slots, crew, markers), the sensor map, starship combat and Emergency Repairs.

Tests added: 33 unit tests moved over with the rules, 6 for the starship repository, battles, the builder and the players' sensor view, 1 browser test (build a ship from a frame, choose a station, seat the crew, place a station on the interior, start a battle, damage through shields to compromised, the players' window, the state back on the sheet). Totals: 491 unit tests and 21 browser tests.

Not checked against your data: the preview's compendium has no starship frames (they come from your Tech Core pack), and neither imported campaign has a starship in this database, so the page was exercised with test entries of the same shape.

Differences from v0.42, and what is left:

- **Crew are seated with a select per member**, not by dragging onto stations.
- **"Zone area" is opened from the sensor map**, with shape, size, DC and damage typed in; a starship's stat block has no button that fills them in.
- **Play Buddy's skill numbers** for the crew (Piloting and the like) come with Phase 8; until then the modifier is the one entered on the Starship page.
- **`scripts/techcore/build.sh` (J6)** was not touched or run here; it writes homebrew files, which import as before.
- **Not exercised by a browser test:** upgrades and bays, crew presets, Emergency Repairs, zone areas and their saves, the hull integrity check's outcomes (unit-tested), a starship encounter made by the builder (unit-tested).

### 11b. Open items (one list)

Everything left out or left open so far, gathered from the phase entries above. Each later phase updates this list: items it closes are removed, new ones are added. Nothing here blocks the phases; it is what the final parity audit in Phase 8 walks through.

**Waiting for a later phase**

- *Phase 8 (Play Buddy):* pairing and linking; the crew's skill modifiers on the Starship page; item, coin, level-up and hero point offers; the read-only mirror of a linked character's inventory; damage requests and "roll initiative" requests from an encounter; a linked player's shared numbers in place of a stat block and in area saves; the party panel on the session board; hero points in the recap.
- *Phase 8 (polish and cut-over):* settings page in full and the shortcut cheat sheet (`?`); offline and install checks (S1, S2); "updated in another tab" notice; removing images nothing uses any more (decision F11); publishing the preview beside the old app; the performance pass; the final parity audit.

**Small things not built** (say which you want; none is planned otherwise)

- *World:* collapsible groups with previews and paged rendering in the list (lists of a few hundred render at once); filtering NPCs by faction or location; `{{` completion and links for recorded historical states; the old "edit attribute" command in the command bar; callouts other than GM-only (`> [!note]`) show as plain quotes.
- *Compendium:* your edits to a synced entry are kept per field, not per sub-field (changing a creature's Fortitude keeps your whole saves line, so a later Foundry change to its Will is reported as a conflict); a sync or import in another window does not refresh an open list; the Foundry sync still unpacks with JSZip.
- *Party:* runes stored the old way (a "+1 striking" field) show as a label and count in the gear check but are not turned into attached rune entries; a level-up from a milestone quest says "Milestone quest" without the quest's name.
- *Encounters:* no icon picker for conditions, and a condition's colour is not saved back to the compendium entry; the creature builder is a link to the compendium, not a dialog inside the encounter builder; a creature cannot be dragged from the compendium list onto the map (search, click or right-click the map instead); no per-token "roll initiative" button (type it, or "roll all" fills the empty ones); the players' window gets the whole scene on each change instead of single changes.
- *Sessions:* the capture bar has no `{{` or `@` completion; NPC portraits are not drawn beside mentions in panel text; connections run from a panel's lower dot to another's upper dot, not between the nearest sides; renaming an entry does not rewrite session panel text.
- *Desk:* entry widgets are not edited in place (the name opens the dock); a location widget has no map with drill-down; the DC widget has no Recall Knowledge line for a pinned creature; a compendium entry is a card that opens the stat block, not the stat block itself; weather stayed a widget with its list instead of becoming random tables (decision F13).
- *Starfinder:* crew are seated with a select, not by dragging; a starship's stat block has no "Zone area" button that fills in the sensor map's zone area; `scripts/techcore/build.sh` was not re-run against the new app.
- *Backup folder:* each backup is a complete zip, so images are written every time (about 450 MB per backup for your data, three kept) instead of being shared between backups.

**Changed on purpose** (different from v0.42, not missing)

- An encounter's mode (Prepare, Run) is its status in the database, not a browser setting.
- With sight on and the GM seeing everything, the players' window shows what the party's tokens see together (v0.42 showed no darkness there).
- A token's stat block opens in the dock; left-drag pans the map in the select tool; shape overlays are areas without an effect.
- The treasure roll counts as a treasure award when it fills the stash; it also fills an encounter's loot.
- The cross-campaign home is gone (decision F20); the start page's campaign cards carry the counts.

**Built but not exercised by a browser test** (their rules are unit-tested where there are rules)

- *Encounters:* dropping an image on the map, dragging tokens from the library, importing assets into the map maker, weak and elite stat blocks in the dock, lingering areas, the recovery and persistent damage prompts.
- *Sessions and Desk:* dragging panels into frames, drawing connections, copying a scene from another campaign, random table and reward panels, saved Desk layouts.
- *Sounds:* playing a real audio file and switching the output device.
- *Starfinder:* upgrades and bays, crew presets, Emergency Repairs, zone areas, a builder-made starship encounter; and nothing of it against real Tech Core entries, which the preview's compendium does not hold yet.
- *Data:* enemy tokens of imported encounters are named after their stat block, so they show as "Token" until the Foundry compendium is synced in the new app.

---

## 12. Risks

- **Size.** About 45,000 lines of screen code (a third of it CSS) are rewritten and 255 checklist items verified. This is many sessions of work. The phase gates exist so that it can stop after any phase without leaving a broken app.
- **Small behaviours get lost.** The inventory comes from reading code, and the large files were read by structure. Mitigation: the Phase 0 screenshots, a pass through each old screen at the start of its phase, and telling you about every item added to the checklist late.
- **The VTT is the riskiest port:** 5,500 lines across page, store and canvas with many interacting rules (automation, areas, starship combat, player projection). It gets the most browser tests and its own phase.
- **Two apps for some weeks.** Fixes you need in v0.41 during the rework are made on `main` and may add checklist items. A feature freeze on `main` keeps this small (question Q3).
- **Same-origin import depends on hosting.** If the new app ends up on another origin, only the file path works; Phase 0 makes that path complete.
- **Backup folder needs Chromium** (file access API). Firefox and Safari would fall back to a download prompt. You appear to use a Chromium browser (sound file handles, output device picker); confirm in Q4.
- **Rules tables marked unverified** (`rules/registry.ts`, `rules/sf2eGear.ts`, road maps in `rules/creatureBuilding.ts`) are carried over as they are; the rework does not check them against the books.
- **Redesign taste.** A written concept is not a design. Phase 1 ends with the shell and both skins on screen so you can redirect before the screens are built on it.

---

## 13. Open questions (answered, see section 0)

- **Q1 Future features.** All three you listed exist (section 1). What is still missing from each that the design should leave room for? In particular: what does "shared/harmonised entities" mean beyond matching items by Foundry id?
- **Q2 Branch strategy.** Is building the new app beside the old one, with a cut-over at full parity, acceptable? The alternative (changing the live app screen by screen) I consider unworkable with a new data model.
- **Q3 Feature freeze.** Can v0.41 be frozen except for bug fixes while the rework runs?
- **Q4 Browser and devices.** Which browser do you run it in, and only on this desktop, or also a laptop or tablet at the table? This decides the backup folder and how much the layout must adapt to small screens.
- **Q5 Quest board.** What reads the quest board export? That decides whether string ids are a problem.
- **Q6 Scripts.** Does anything of yours read backup JSON directly?
- **Q7 Platform.** Do you accept "stay a PWA, add a backup folder", or do you want the desktop shell despite the cost in section 7?
- **Q8 Skins.** Tome and Star by campaign game: yes, or one look for both?
- **Q9 Flags.** A decision on each of F1–F21. The ones that change the most work: F3 (DM's Tome import), F4 (history), F7 (editor modes), F8 (pins), F2 (themes).
- **Q10 Play Buddy.** Is the API in `PLAYBUDDY_API.md` still a draft on Carl's side, or is a real build of Play Buddy available to test against in Phase 8? Today only the mock server is in the repo.
- **Q11 Old plan files.** `FORK_PLAN.md`, `FEATURES_PLAN.md`, `COMBAT_PLAN.md`, `SESSION_BOARD_PLAN.md`, `STARFINDER_PLAN.md`, `implementation-plan.md` are finished plans that code comments cite. May the rework fold what is still true into module docs and remove the files (STARFINDER_PLAN's unfinished phases would stay)?

# Fork Plan: DM's Tome → PF2e / SF2e Edition

Status: **draft for review, revision 3** (2026-10-28). No code has changed. Based on:
- the code at `89aad32` (v0.9.1),
- your export `dmstome-all-2026-10-28.json` (profiled, not copied into the repo),
- the Foundry VTT PF2e/SF2e system repo `foundryvtt/pf2e` (branch `v14-dev` at `cc6d069`, releases `pf2e-8.6.1` / `sf2e-1.6.1`), sampled and profiled,
- Carl's draft spec "Pf2e Play Buddy – Phase 2" (nothing implemented yet).

What changed since revision 2: the compendium no longer comes from your pf2etools-derived records. It comes from a **Foundry sync** (§7): versioned, ID-stable, remaster-flagged data for **both PF2e and SF2e**, with structured strikes, spellcasting DCs and cross-links. Your existing library is **reconciled** against it (portraits, token links, homebrew), not converted field by field (§8).

App name: **StarTome** (decided 2026-10-28). Repo folder `../StarTome`, remotes `origin` → `DarthAmun/StarTome` (to be created on GitHub), `upstream` → `DarthAmun/DmsTome`.

---

## 0. TL;DR

- **Keep** campaign lore, the editor, the VTT and the GM tools. **Replace** the user-designed rules library (`systems`/`records`, schema builder, ~27 generic field components, regex stat guessing) with a typed PF2e/SF2e compendium.
- **The compendium comes from Foundry's PF2e/SF2e data.**
  - Each release ships a `json-assets.zip`: 34 MB zipped, one JSON per pack, plus language files.
  - Every document has a stable ID (`Compendium.pf2e.<pack>.<Type>.<_id>`), license and remaster flags, and the system version.
  - Links between entries (a creature's spells, its gear, conditions mentioned in text) are already resolved to IDs.
  - It's far better than your current data: real creature sizes, hazard stealth bonuses, spell DCs, strikes as structured data, SF2e content.
- **The sync function** is a pure conversion layer (`converters/foundry/`) running in a Web Worker. Data comes in by one of three routes:
  1. **Release ZIP** (versioned, recommended). Delivered either as a file you drop into the app, or automatically from a mirror that a GitHub Action in the StarTome repo publishes to the app's own Pages site. The mirror is needed because GitHub release downloads don't allow cross-origin browser fetches.
  2. Optional **dev channel**: per-file sync straight from `v14-dev`, using git blob hashes so only changed files download.
  - Either way, the app checks for new versions via the raw `system.*.json` manifests, which are browser-fetchable.
  - Re-syncs are incremental, keep your edits/portraits/notes, and never break links.
- **Your existing library is reconciled by name** rather than converted: 86–100% of each type has a Foundry twin. 973 of your 1,104 creature portraits carry over automatically. Unmatched records (your German homebrew items, renamed legacy spells, …) become user entries through a small legacy converter.
- **Play Buddy** stays behind a `PartyLink` port with its own conversion layer (§9). Foundry IDs are the obvious shared item key if Carl's catalog comes from the same packs (§9.7 #2).
- The plan has 8 phases (§11), and the app works after each one.

---

## 1. How the app works today

### 1.1 Stack
Nuxt 3 (SSR off, hash routing) + Vue 3 + Pinia + PrimeVue (unstyled) + Tailwind. Dexie/IndexedDB for data. PixiJS v8 for the VTT. Vue Flow/Cytoscape for the graph. markdown-it + DOMPurify for markdown. JSZip for exports. vite-pwa for offline use. Static deploy to GitHub Pages via `.github/workflows/nuxtjs.yml`. **No test runner.**

### 1.2 Storage (`composables/useDb.ts`)
- Dexie DB **`dmforge`**, schema v13 (the README says `dmstome`; that's out of date).
- Tables: `campaigns`, `encounters`, `tokens`, `encounterTokens`, `encounterWalls`, `entities`, `entityLinks`, `entitySnapshots`, `entityConnections`, `graphLayouts`, `systems`, `records`, `soundTracks`, `soundPlaylists`.
- Numeric auto-increment ids. JSON stored as strings. Images inline as base64. Images make up most of your 238 MB export (entities ≈ 132 MB, records ≈ 90 MB).
- `dbApi` is also exposed as `window.dmstome` (an Electron leftover).
- Per-browser keys: localStorage `dmstome.*`, `dmstome-settings`, `dmstome-cmd-ctx`, `sb-collapsed`, `dmscreen-*`, the encounter mode key. BroadcastChannels `dmforge-player`/`dmforge-map`. Window names `dmforge-player`/`dmforge-map-player`.

### 1.3 Campaign lore entities
`DbEntity { campaign_id, type, name, content, attributes(JSON), is_favorite }`, 10 types. Snapshots, graph, map pins, regions, favourites, search, palette and bookmarks build on them. They're system-neutral.

### 1.4 The rules library (the generic system)
- `DbSystem.entityTypes: EntityTypeSchema[]` → `FieldSchema[]` (27 component types). `DbRecord.data` is untyped JSON.
- UI: schema builder (974 lines), record pages via `FieldRenderer`. Campaigns pick a system via `system_id`.
- Code that only exists because records are untyped: `useStatBlockLinker.ts`, `ConditionModal::loadConditions` guessing, `getImageKeysByType`/`_recordImageKey`, `FieldEntityLink`, `extraTypes`, `dataToScope`, import `systemIdRemap`, the record branch of `recompressImages`.

### 1.5 Markdown editor and GM-locked paragraphs
- Modes edit/split/preview/mixed. Pipeline: md → callouts/task lists/`::dice|table|button|choose|clock` → `{{type: Name}}` refs → DOMPurify.
- The GM lock is the `> [!hidden]` callout. It's removed **only in print**. The Markdown/Claude exports include it, and no player view renders entity text. A real `stripGmOnly()` is needed.

### 1.6 VTT / tokens
- Canvas, store, page (3,943 lines), FoV, fog, walls, ping, timers, turn rail, hidden combatants, conditions with values. A BroadcastChannel player view.
- Tokens link `linked_record_id` / `linked_entity_id`. Stats are guessed by regex.
- Your data: 62 placements and 6 library tokens link creatures. 6 placements point to deleted records. 7 tokens are flagged PC.
- The condition catalog has 5e text. The fallback list is pre-remaster.

### 1.7 Import / export
JSON `version: 1` (`all`/`campaigns`/`systems(-full)`/`tokens`) as raw rows. Import writes **with the original ids**. Also a Markdown ZIP, the "Claude export", image-folder import, recompression. The quest board reads one of these externally (Q4).

### 1.8 Only for other systems / dead weight
Schema builder, 5e demo seed, 5e condition text, D&D field types (`statblock` modifiers, `spellslots`, `attack`, `abilities`, `rating`), the heuristics above, Electron leftovers, "DM" wording.

---

## 2. Keep / simplify / replace / remove

| Area | Decision | Notes |
|---|---|---|
| Lore entities, editors, overview | **Keep** | Add typed links: NPC → creature, NPC → character, quest → reward items. |
| Markdown editor, widgets, refs | **Keep** | `stripGmOnly()`. Fixed kinds `{{item:}}`, `{{creature:}}`, `{{spell:}}`, `{{condition:}}`, `{{action:}}`… |
| Snapshots, graph, map, regions, GM screen, sounds, search, palette, bookmarks, dice | **Keep** | Swap `records` queries for compendium queries. |
| VTT engine | **Keep** | Only namespacing changes. |
| Token ↔ record linking | **Simplify** | `linked_ref {kind,id}` + weak/elite adjustment. Stats read directly. Delete `useStatBlockLinker`. |
| Initiative | **Simplify** | Default Perception. Per-token skill override. |
| Conditions | **Replace** | Synced from Foundry `conditions` (43 PF2e, 3 SF2e additions). `flat-footed` is an alias of `off-guard`. |
| Rules library, builder, generic fields | **Replace → remove** | Typed compendium fed by the Foundry sync. Keep a few field components as editor building blocks. |
| `campaigns.system_id` | **Replace** | `campaigns.game` + `campaigns.rules`. |
| Seed | **Replace** | Tutorial campaign. The compendium arrives via sync, not the seed. |
| Import/export | **Extend** | Ids remapped. Lore shapes byte-compatible (§8.5). |
| `window.dmstome`, Electron leftovers, D&D fields | **Remove** | |

---

## 3. Design principles

1. **Store rules data, don't run rules.** Foundry's `rules` arrays (rule elements) are dropped. Text + structured headers only.
2. **One model for PF2e and SF2e.** A `game` tag. Differences live in registries.
3. **Definitions vs instances** (`Item` vs `ItemInstance`, `Creature` vs placement/plan slot).
4. **Stable, source-derived ids.** Synced entries use their Foundry identity as primary key (`fvtt:pf2e:equipment-srd:00gDg8WcPv3TKC9N`). Re-syncs, cross-device exports and Play Buddy matching never drift. User-made entries get a UUIDv7.
5. **Everything external goes through a conversion layer.** Pure `(input, ctx) → { value, issues[] }`, golden-tested, versioned by source version. Three of them: Foundry (§7), legacy DM's Tome (§8), Play Buddy (§9).
6. **Upstream data and user data never overwrite each other.** Sync owns the upstream fields. The user owns portraits, notes, tags, favourites, unidentified names and explicit local edits (an overlay, §7.6).
7. **Lossless.** Anything unmapped goes to `legacy`/`extra`. Every conversion issue is reported.

---

## 4. Typed entity model

### 4.1 Shared primitives

```ts
type GameId = 'pf2e' | 'sf2e'
type Rarity = 'common' | 'uncommon' | 'rare' | 'unique'
type Size = 'tiny' | 'sm' | 'med' | 'lg' | 'huge' | 'grg'          // Foundry's values verbatim
type ActionCost = 'free' | 'reaction' | 'passive' | 1 | 2 | 3 | { min: 1|2|3; max: 1|2|3 } | { text: string } | null
type Proficiency = 'untrained' | 'trained' | 'expert' | 'master' | 'legendary'

/** Integer copper for both games. SF2e credits: Foundry stores SF2e prices as `sp`, so 1 credit = 10 cp (verify against the book). */
interface Money { cp: number }
type Coins = Partial<Record<'pp'|'gp'|'sp'|'cp'|'credits'|'upb', number>>   // as held; same keys as Play Buddy's coins offer
type BulkTenths = number | null                                            // Foundry: 0.1 → 1, 1 → 10

interface SourceRef { system: 'foundry' | 'pf2etools' | 'playbuddy' | 'dmstome-legacy' | string; id: string; version?: string }

interface RulesEntityBase {
  id: string                         // 'fvtt:<game>:<pack>:<_id>' for synced, uuid for user entries
  origin: 'foundry' | 'user' | 'legacy'
  kind: RulesKind; game: GameId | 'both'
  name: string; level: number; rarity: Rarity; traits: string[]
  publication?: { title: string; remaster: boolean; license: 'ORC' | 'OGL' | string }
  supersededBy?: string              // legacy → remaster pairing
  description: string                // markdown (converted from Foundry HTML), may contain > [!hidden]
  sourceRefs: SourceRef[]
  upstream?: { pack: string; version: string; hash: string; removed?: boolean }   // sync bookkeeping
  // user-owned — never touched by sync:
  img?: string | null; tokenImg?: string | null
  gmNotes?: string; tags?: string[]; isFavorite?: boolean
  localEdits?: Record<string, unknown>   // JSON-pointer → value overlay, re-applied after each sync
  legacy?: Record<string, unknown>
  createdAt: string; updatedAt: string
}
type RulesKind = 'item' | 'creature' | 'hazard' | 'spell' | 'feat' | 'action' | 'condition'
               | 'ancestry' | 'heritage' | 'background' | 'class' | 'deity'          // later: 'vehicle'
```

Tables:
- `rules`: `id, kind, game, name, level, rarity, *traits, [kind+level], [kind+name], upstream.pack, updatedAt`.
- `images`: Blob store for user portraits.
- `syncState`: per game: version, channel, per-pack hash/count, last run, issue summary.

### 4.2 Kinds (fields chosen from what Foundry actually provides)

```ts
interface Item extends RulesEntityBase {
  kind: 'item'
  category: 'weapon'|'armor'|'shield'|'equipment'|'consumable'|'treasure'|'container'|'ammunition'|'kit'
  subcategory?: string               // Foundry system.category: 'potion', 'martial', 'heavy', ...
  baseItem?: string                  // 'longsword'
  price: Money | null; bulk: BulkTenths
  usage?: string                     // 'held-in-one-hand' → display label via registry
  hands?: string
  activation?: { cost: ActionCost; traits?: string[]; text?: string }[]   // parsed from the description's Activate lines
  uses?: { max: number }
  unidentified?: { name: string; description?: string }
  weapon?: { category: string; group?: string; damage: { dice: number; die: string; type: string }; range?: number; reload?: string;
             ammo?: { type?: string; capacity?: number }; expend?: number; grade?: string; splash?: number }   // SF2e: grade/expend/ammo
  armor?:  { category: string; group?: string; acBonus: number; dexCap: number|null; checkPenalty: number; speedPenalty: number; strength: number|null; grade?: string }
  shield?: { acBonus: number; hardness: number; hp: number; bt: number }
  container?: { capacity: BulkTenths; bulkReduction: BulkTenths }
  material?: { type: string; grade: string } | null
}

interface Creature extends RulesEntityBase {
  kind: 'creature'
  size: Size
  perception: number; senses: { type: string; acuity?: string; range?: number }[]; languages: string[]
  skills: Record<string, number>; lore?: Record<string, number>
  abilities: Record<'str'|'dex'|'con'|'int'|'wis'|'cha', number>
  ac: number; acNote?: string; saves: { fort: number; ref: number; will: number }; saveNote?: string
  hp: number; hpNote?: string; hardness?: number
  immunities: string[]; weaknesses: { type: string; value: number; note?: string }[]; resistances: { type: string; value: number; except?: string[]; note?: string }[]
  speeds: Record<string, number>
  strikes: { name: string; range: 'melee'|'ranged'; bonus: number; traits: string[]; damage: { formula: string; type: string }[]; effects?: string[] }[]
  actions: { name: string; cost: ActionCost; section: 'interaction'|'defensive'|'offensive'; traits: string[]; text: string }[]
  spellcasting: { name: string; tradition: string; type: 'prepared'|'spontaneous'|'innate'|'focus'|'ritual'; dc: number; attack?: number;
                  spells: { spellId: string; rank: number; heightenedTo?: number; uses?: number }[] }[]
  inventory: { itemId: string; quantity: number }[]   // embedded weapons/armor/consumables → loot for the party tab
  tokenImg?: string | null
}

interface Hazard extends RulesEntityBase {
  kind: 'hazard'; complex: boolean
  stealth: { bonus: number | null; note?: string }; disable: string
  ac?: number; saves?: Partial<{ fort: number; ref: number; will: number }>; hardness?: number; hp?: number; bt?: number
  immunities?: string[]; weaknesses?: Creature['weaknesses']; resistances?: Creature['resistances']
  actions: Creature['actions']; routine?: string; reset?: string
}

interface Spell extends RulesEntityBase {   // level = rank; cantrips: level 1 + trait 'cantrip'
  kind: 'spell'; spellType: 'spell'|'focus'|'ritual'; traditions: string[]
  cast: ActionCost; range?: string; area?: { type: string; value: number }; targets?: string; duration?: string; sustained?: boolean
  defense?: { save: 'fort'|'ref'|'will'; basic: boolean } | { ac: true } | null
  damage?: { formula: string; type: string }[]
  heightening?: { type: 'interval'; interval: number; damage?: Record<string, string> } | { type: 'fixed'; levels: Record<number, string> }
}

interface Feat extends RulesEntityBase { kind: 'feat'; category: string; cost: ActionCost; prerequisites: string[]; trigger?: string; frequency?: string; requirements?: string }
interface Action extends RulesEntityBase { kind: 'action'; cost: ActionCost; category?: string }   // Foundry actions + bestiary ability glossary
interface Condition extends RulesEntityBase { kind: 'condition'; group?: string; valued: boolean; overrides: string[]; aliases?: string[] }
// ancestry / heritage / background / class / deity: reference kinds mapped from their Foundry `system` blocks.
```

### 4.3 Campaign-scoped entities

```ts
interface Character {
  id: string; campaignId: number; game: GameId
  name: string; level: number; xp: number
  ancestry?: string; heritage?: string; class?: string; background?: string     // display text + optional rules ids
  ac?: number; hp?: { max: number; current?: number }; perception?: number
  saves?: { fort: number; ref: number; will: number }; skills?: Record<string, number>
  classDc?: number; spellDc?: number; speed?: number; conditions?: { name: string; value?: number }[]
  img?: string | null; tokenImg?: string | null; npcEntityId?: number | null
  link?: { adapter: 'playbuddy'; playerId: string; characterRef: string; sharedLevels: string[]; statusAt?: string }
}

interface ItemInstance {
  id: string; campaignId: number
  itemId: string | null; nameOverride?: string; quantity: number
  holder: { type: 'character'; id: string } | { type: 'party' } | { type: 'stash'; label: string } | { type: 'container'; instanceId: string }
  identified: boolean; equipped?: boolean; invested?: boolean
  priceOverride?: Money | null; notes?: string
  origin?: { type: 'loot'|'purchase'|'start'|'quest'|'craft'; refId?: string|number; at?: string }
  delivery?: { adapter: 'playbuddy'; offerId: string; state: OfferState; updatedAt: string }
  mirrored?: boolean
}

interface Purse { id: string; campaignId: number; holder: ItemInstance['holder']; coins: Coins }
```

When a character is linked to Play Buddy, the player's app is authoritative for that character's sheet and inventory, and StarTome only holds mirrors. Party loot, stash, XP and notes stay local to StarTome.

### 4.4 Room for later features

| Feature | Already provided |
|---|---|
| Party tab | `ItemInstance`, `Purse`, `Money` integers, item level/price/bulk, treasure-by-level registry, mirrored inventories. **`Creature.inventory` gives real loot lists per creature.** |
| GM-hidden item names | `Item.unidentified`, `ItemInstance.identified`, `stripGmOnly()`. |
| Encounter planner → deploy | Creature/hazard level, size, token image; the budget registry. A later `encounterPlans` table. Deploy via `encounterTokens.add` + `linked_ref`. |
| XP / milestones | `Character.xp/level`, `campaigns.rules.advancement`. A later `xpAwards` table. |

---

## 5. PF2e vs SF2e in one model

Registries `rules/pf2e.ts` and `rules/sf2e.ts`:
- **currency**: PF pp/gp/sp/cp. SF credits (+UPB). Both store base cp, with 1 credit = 1 sp = 10 cp, following Foundry's storage.
- **treasureByLevel**
- **encounterBudget**: 40/60/80/120/160; ±10/20/20/30/40 per PC; creature XP by level difference −4…+4 = 10, 15, 20, 30, 40, 60, 80, 120, 160; simple hazard ⅕.
- **xpTable**
- **terminology**
- **label maps** for Foundry slugs (usage, weapon groups, traits; taken from the synced `lang/en.json`)

SF2e tables are marked `verified: false` until checked against the books. Compendium views filter to `campaign.game` + `'both'`. Play Buddy is PF2e-only.

---

## 6. Fork mechanics

### 6.1 Repo
Clone with history into a new repo (e.g. `DarthAmun/StarTome`) with an `upstream` remote. Optionally land the namespacing refactor (§6.3) in DmsTome first.

### 6.2 Identity
`package.json`, `nuxt.config.ts` (title, meta, PWA manifest incl. `id`, icons), README, seed, GM wording (`dm-screen` → `gm-screen` + redirect), CI base path `/StarTome/`. No Paizo trademarks in the app name.

### 6.3 Separate storage namespace
`darthamun.github.io/DmsTome/` and `/StarTome/` share an origin. Route everything through `utils/appNamespace.ts`:

| Thing | DM's Tome | StarTome |
|---|---|---|
| Dexie DB | `dmforge` v13 | `startome` v1 |
| localStorage | `dmstome.*`, `sb-collapsed`, `dmscreen-*`, … | `startome.*` |
| BroadcastChannels / window names | `dmforge-*` | `startome-*` |
| PWA | | own scope + `manifest.id` |
| Dev port | 3000 | 3001 |
| Exports | `dmstome-*.json` | `startome-*.json` + `app: 'startome'` |
| Integration secrets | — | `startome.integrations.*`, never exported |

---

## 7. Conversion layer A: Foundry PF2e/SF2e sync

### 7.1 What the source offers (measured)

| | PF2e | SF2e |
|---|---|---|
| Release | `pf2e-8.6.1` (2026-10-12) | `sf2e-1.6.1` (2026-10-12) |
| `json-assets.zip` | 34 MB zipped / 180 MB, 160 files (one JSON array per pack + `_folders`) + `lang/*.json` | same layout |
| Source files on `v14-dev` | 30,123 JSON files | 5,774 JSON files |
| Useful packs (no macros/effects/journals/pregens) | items 5,956 · feats 6,366 · spells 2,018 · creatures/NPCs 8,311 (in ~80 bestiary packs) · hazards 53 · conditions 43 · actions & ability glossaries 791 · character options 2,373 · rollable tables 69 · vehicles 100 | items 1,160 · feats 2,236 · spells 259 · creatures 704 · character options 827 · actions 178 |

Quality versus your current data:
- Size is a real field (`sm`, `huge`, …).
- Hazard stealth is set on all 53 core hazards.
- Spellcasting entries carry DC/attack/tradition, and spells are embedded with `compendiumSource` IDs and heightened levels.
- Strikes have per-type damage rolls.
- Actions are categorised offensive/defensive/interaction.
- Senses carry acuity/range. Immunities, weaknesses and resistances are typed.
- Price comes per denomination, bulk as a number (0.1 = L).
- Every document carries `publication {title, remaster, license}` and `_stats {systemVersion, compendiumSource}`.

Things to handle:
- **Text is HTML with Foundry enrichers.** In a 679-document sample: `@UUID` 2,118, `@Check` 476, `@Damage` 309, `@Localize` 207 (needs the lang files), `@Template` 139, inline `[[/r …]]`/`[[/act …]]`, and `<span class="action-glyph">`.
- **No art.** `img` paths point inside a Foundry install. Only the generic `systems/<id>/icons/…` icons exist in the repo, under `static/icons`. **Your portraits remain the only creature art** (§8).
- **Legacy and remaster entries coexist.** In the sample, 153 PF2e documents were legacy (`remaster: false`), and the licenses split 517 ORC / 162 OGL.
- **Creature documents embed full copies of their spells and gear.** That's why bestiaries are 216 MB raw. We store references only.

### 7.2 Getting the data into the browser (checked)

| Route | Browser-fetchable? | Use |
|---|---|---|
| `api.github.com` (trees, releases list) | yes (`ACAO: *`), 60 requests/h unauthenticated | version/tree lookup (1–2 calls per sync) |
| `raw.githubusercontent.com/<sha>/…` | yes (`ACAO: *`) | manifests (`system.pf2e.json`, `system.sf2e.json`), lang files, per-file dev sync |
| `cdn.jsdelivr.net/gh/…@<sha>/…` | yes | fallback mirror for per-file sync |
| Release asset `json-assets.zip` | **no**: the final host sends no CORS header | must be dropped in by the user, or re-hosted |
| `codeload` ZIP of the repo | no (CORS limited to GitHub's own renderer), and the repo is 2 GB | — |

So, three sources implementing one `FoundrySource` interface (`listPacks()`, `readPack(name) → AsyncIterable<FoundryDoc>`, `version`, `lang()`):

1. **`ReleaseZipFile`** (manual). The user downloads `json-assets.zip` for PF2e and/or SF2e from the releases page (the app links straight to it) and drops it in. It always works and needs no infrastructure. **Decided (2026-10-28): this is the only route built in Phase 3.**
   - Drop zone (or file picker) on the compendium sync page, accepting one or both ZIPs.
   - The game is detected from `_stats.systemId` and the version from `_stats.systemVersion`, never from the filename.
   - A ZIP older than the installed version, or of an unexpected layout, is refused with a clear message.
   - The update check (below) shows "new version available" with a direct link to that release's `json-assets.zip`.
2. **`ReleaseZipMirror`** (automatic). **Deferred.** Decide after Phase 3 is in use. The `FoundrySource` interface keeps it a drop-in addition.
   - A scheduled GitHub Action in the StarTome repo checks the `pf2e-*`/`sf2e-*` releases daily and downloads `json-assets.zip`.
   - It splits the ZIP into per-pack `.json.gz` files plus a `manifest.json` (version, per-pack sha256, counts, license summary), and publishes them with the app under `/data/foundry/<game>/<version>/`.
   - The app fetches them **from its own origin**, so there's no CORS problem, and downloads only the packs whose hash changed.
   - This republishes ORC/OGL content on your Pages site, as the Foundry repo itself does (Q15, §10).
3. **`GitTreeDev`** (optional "dev channel" for unreleased fixes). **Deferred**, same as the mirror. One tree call on `v14-dev`, then per-file downloads of files whose git blob sha changed (raw, falling back to jsDelivr; 8–16 parallel, retries, resumable). In this route links are **name-based** (`@UUID[Compendium.pf2e.spells-srd.Item.Fireball]`), so the converter resolves names using `system.*.json` pack names + `build/uuid-redirects/*.json`. The first full download is ~31k files, so this is opt-in only.

**Update check (all routes):** fetch `raw…/v14-dev/system.pf2e.json` / `system.sf2e.json` → `version`. If newer than `syncState.version`, show "PF2e 8.6.2 available" with the matching action (link to the release, auto-download from the mirror, or run dev sync).

### 7.3 Sync pipeline (Web Worker)

1. **Pick packs.** Defaults:
   - Core rules: equipment, spells, feats, conditions, actions, ancestries/heritages/backgrounds/classes/deities, hazards, the bestiary ability glossaries.
   - Monster Core 1 & 2, NPC Core, Bestiaries 1–3.
   - The SF2e equivalents, if the campaign game is SF2e.
   - Adventure-path bestiaries are opt-in per AP.
   - Show the size estimate per pack.
2. **Read** packs from the source and load `lang/en.json` + `re-en.json` + `action-en.json` (+ `sf2e-overrides-en.json`) for `@Localize`.
3. **Index pass**: `compendiumSource → { id, kind, name }` for every document in the selected packs, plus uuid redirects. Needed to resolve links in text.
4. **Convert** each document (pure, §7.4) → `RulesEntity` + `issues[]`.
5. **Merge** into Dexie per pack in one transaction (§7.6). Skip packs whose hash is unchanged.
6. **Post-pass**:
   - Pair legacy entries with their remaster versions (`supersededBy`): same kind, normalised name, one remaster and one legacy.
   - Resolve creature spell/gear references.
   - Mark entries missing upstream as `upstream.removed` (kept if referenced; follow redirects).
7. **Report**: counts per pack, issues by rule, duration. Stored in `syncState`.

Progress UI with pause/resume. Everything is idempotent: re-running the same version is a no-op.

### 7.4 Converter rules (`converters/foundry/`)

| Foundry | Ours |
|---|---|
| `type` weapon/armor/shield/equipment/consumable/treasure/backpack/ammo/kit | `item` with `category`. `system.category` → `subcategory` |
| `type` npc | `creature`. `items[]` split by type: `melee` → strikes; `action` → actions (`category` → section); `spellcastingEntry` + `spell` → spellcasting (spell → `spellId` via `_stats.compendiumSource`, `location.heightenedLevel`); `weapon`/`armor`/`consumable`/`equipment`/`treasure` → `inventory` refs; `lore` → lore skills; effects/conditions dropped |
| `type` hazard / spell / feat / action / condition / ancestry / heritage / background / class / deity | the matching kind |
| `system.level.value` / `details.level.value` | `level` |
| `traits.rarity`, `traits.value`, `traits.size.value` | `rarity`, `traits`, `size` |
| `price.value {pp,gp,sp,cp}` | `Money.cp` (pp×1000, gp×100, sp×10) |
| `bulk.value` | tenths (0.1 → 1) |
| `damage {dice, die, damageType}` / `damageRolls{}` | typed damage |
| `perception {mod, senses}`, `saves.*.value`, `abilities.*.mod`, `skills.*.base`, `attributes.{ac,hp,speed,immunities,weaknesses,resistances}` | creature fields |
| `defense.save {statistic, basic}`, `time.value`, `area`, `heightening` | spell fields |
| `publication`, `_stats.systemVersion`, `_stats.compendiumSource` | `publication`, `upstream.version`, `id` + `sourceRefs` |
| `rules`, `effects`, flags, `sort`, `folder` | dropped (folder → optional browse grouping) |

**Text (HTML → markdown)**: a small converter for the tag set actually used (`p`, `strong`, `em`, `hr`, `ul/ol/li`, `table/thead/tbody/tr/th/td`, `h2/h3`, `span`). Or `turndown` + GFM tables (one dependency; decide in the spike). Enrichers:

| Enricher | Becomes |
|---|---|
| `@UUID[Compendium.pf2e.<pack>.<Type>.<id>]{Label}` | `{{kind: Name}}` if the target is synced, else the label text |
| `@Check[reflex\|dc:22\|basic]` | `DC 22 basic Reflex` (a future `::check[]` widget can take over) |
| `@Damage[6d6[fire]]` | `::dice[6d6] fire` |
| `@Template[burst\|distance:20]` | `20-foot burst` |
| `@Localize[KEY]` | text looked up in the lang files, enriched recursively |
| `[[/r 1d4]]` / `[[/act x]]{Label}` | `::dice[1d4]` / `Label` |
| `<span class="action-glyph">A/1, D/2, T/3, R/r, F/f</span>` | ◆, ◆◆, ◆◆◆, ↺, ◇ |

Item **activation** lines (`<strong>Activate</strong> <glyph> (traits)`) are additionally parsed into `activation[]`.

**Golden tests**: ~50 Foundry documents per kind (pinned to a release), each with expected output. The hard cases are included: complex hazards, spontaneous + innate casters, items with variants, SF2e weapons with ammo/grade, legacy/remaster pairs, `@Localize`-heavy creatures.

### 7.5 Identity and versioning
- `id = 'fvtt:' + game + ':' + pack + ':' + _id`, taken from `_stats.compendiumSource`. Stable across releases, devices and exports.
- `upstream.hash` = hash of the converted upstream fields, used to detect changes cheaply.
- `syncState[game] = { channel, version, commit?, packs: { [name]: { sha256, count } }, syncedAt }`. The version string (e.g. `pf2e-8.6.1`) is also what we'd compare with Play Buddy's `rulesVersion` if they align (§9.7).

### 7.6 Merge policy (re-sync never destroys user work)
- **Upstream-owned fields** (everything the converter produces) are replaced on every sync.
- **User-owned fields** (`img`, `tokenImg`, `gmNotes`, `tags`, `isFavorite`, `unidentified`, `legacy`) are never written by sync.
- **Edits to upstream fields**: the editor saves them to `localEdits` (a field → value overlay). The UI shows the effective value with an "edited" marker and a "reset to Foundry" button. After a sync, if upstream changed a field you also edited, it's flagged as a conflict in the report ("upstream changed X; your edit kept").
- **"Duplicate as homebrew"** creates a `user` entry for bigger changes.
- **Removed upstream**: `upstream.removed = true`. Hidden from browse but kept, so links, tokens and encounter plans don't break. Redirects are followed when available.

### 7.7 Size and performance
- 180 MB of PF2e JSON becomes much smaller after conversion, because embedded spell and gear copies become references. The exact figure is measured in the spike.
- Converting runs in a worker, pack by pack. JSZip (already a dependency) streams files from the ZIP.
- The first PF2e sync is expected to take minutes, not seconds. Later syncs only touch changed packs.
- Storage: request `navigator.storage.persist()` so the browser doesn't evict the compendium.

---

## 8. Conversion layer B: your legacy DM's Tome data

With Foundry as the source, the old records **don't need to be converted field by field**. The importer reconciles them instead.

### 8.1 Lore and campaign data
Import 1:1 with ids remapped: 1 campaign, 154 entities, 144 links, 7 connections, 5 graphs, 1 snapshot, 19 encounters, 172 placements, 25 walls, 38 tokens. `system_id 1` → `game 'pf2e'`. The reader runs in a worker (the file is 238 MB), from the file or the same-origin `dmforge` DB opened read-only.

### 8.2 Records → match against the synced compendium — ⤴ removed 2026-10-29 (v0.16.0)
> **Superseded:** DM's Tome's rules library isn't imported any more (only its campaigns, §8.5). Record matching, the review list, `legacy` entries from records and the old-library backup (`legacyLibrary`, dropped in Dexie v14) are gone. Entry images (NPC portraits, faction and location images) come with the entries; monster tokens are left out and their placements keep their name and picture. Kept below as history.

Run after a Foundry sync. Matching is by kind + normalised name, with `source` and level as tie-breakers (legacy vs remaster twins). Name-only match rates measured against `v14-dev`:

| Kind | Matched | Unmatched examples |
|---|---|---|
| class | 23/23 | — |
| background | 468/472 | Press-ganged, Wishes for Riches |
| feat | 2,166/2,250 (96%) | Exude Abyssal Corruption, Deepest Wellspring |
| condition | 57/59 | Flat-Footed (→ alias of Off-guard), Malevolence |
| deity | 300/309 | Chinostes variants, Atheism, Dwarven Pantheon |
| hazard | 382/399 | Chernasardo Chompers, Puncturing Spire |
| ancestry | 34/36 | Gnoll, Grippli (renamed in remaster) |
| spell | 1,902/2,059 (92%) | Animate Dead, Force Cage, Ki Form (legacy names renamed in remaster) |
| item | 2,177/2,412 (90%) | **Sturmperle, Bluttrinker, Wundmal der Wachen, Eiserne Schneide** (your homebrew), Khakkara |
| creature | 2,259/2,598 (86%) | Glimmer, leshy variants |

For a **matched** record:
- carry over user-owned data: **creature portraits (973 of 1,104 match automatically)** → `img`/`tokenImg`, the 4 item images;
- re-point references: token `linked_record_id` (6 library tokens + 62 placements), `{{item:}}`/`{{creature:}}` refs (11);
- discard the old field data, since Foundry's is better.

The match uses fuzzy rules (remaster renames via Foundry's redirect files + a small alias table, slug variants, parenthetical suffixes). The rest goes to a **review list**: candidate picker / "keep as homebrew" / "drop".

For an **unmatched, kept** record: the legacy converter turns it into a `user`/`legacy` entry. It uses the rules worked out in revision 2:
- creature size taken from the traits, alignment traits dropped;
- strikes parsed from the abilities text;
- weaknesses/resistances parsed (`type N`);
- price → cp, bulk → tenths;
- action glyphs → ActionCost;
- pf2etools `{@tag}` markup → `{{kind: name}}`;
- Python-repr deity weapons parsed;
- placeholder zeros dropped.

Since this applies to only ~1,000 records (mostly legacy duplicates you may not want), the converter can stay small.

Your 4 items with `carried: "Me"` are offered as `ItemInstance`s for a character (Q13). The 5 PC NPCs become `Character`s.

### 8.3 Duplicates
Your 854 legacy/remaster name pairs collapse naturally, because Foundry has its own `remaster` flags and the post-pass pairs them (`supersededBy`). Browse hides superseded legacy entries by default (Q3).

### 8.4 Broken links
The 6 placements that point at deleted records get their link cleared and appear in the report.

### 8.5 Export compatibility / quest board
- **One direction only (decided 2026-10-29):** DM's Tome → StarTome. Only DM's Tome's **campaign** data has to come in (its rules library/systems don't); StarTome files don't have to be readable by DM's Tome.
- StarTome writes `version: 2` files (`type: 'all'|'campaigns'|'tokens'`): rows as the database keeps them (structured columns as values, maps as `img:` refs), `images` for every stored image they point at, `rules`/`rulesOverlays` and `syncState`. The import also reads DM's Tome's `version: 1` files and StarTome's older ones: JSON text becomes values, inline maps become images, 5e wall cover becomes PF2e cover. ~~Lore shapes stay byte-compatible~~ (superseded).
- **Synced Foundry content isn't exported in full.** The export records the sync version and pack list, and an import re-syncs. Exports stay small and don't redistribute the compendium.
- The quest board breaks only if it reads `systems`/`records` (Q4). Recommended: a dedicated `type: 'questboard'` export with GM text stripped and reward items resolved.

---

## 9. Conversion layer C: Pf2e Play Buddy (GM API)

### 9.1 What the draft spec says (as it affects us)
- Topology: the Play Buddy GM client (Tauri/Rust) ⇄ players over iroh P2P. StarTome is an **external tool** using the GM client's **local HTTP API** (`127.0.0.1`, Bearer token, desktop only, only while a game is open and the API is switched on).
- Players own their characters. The API never modifies them. It only queues **offers** that the player accepts.
- Draft endpoints: `GET /v1/game`, `GET /v1/players`, `GET /v1/players/{id}/status?fields=basic,stats,inventory,spells` (403 `notShared`), `POST /v1/offers`, `GET/DELETE /v1/offers/{id}`, `GET /v1/items/search?q=`, `GET /v1/rolls?since=`. Webhook/SSE later.
- Offer items: `{kind:'catalog', itemId}` (needs the same `rulesVersion`), `{kind:'custom', definition: entry_definition (INV-5)}`, `{kind:'coins', pp,gp,sp,cp}`. Offer states run `draft → queued → delivered → accepted|declined|withdrawn|expired|failed`.
- Status levels: basic / stats / inventory / spells, opt-in per game. Schema `docs/api/gm-api-v1.json` comes with golden tests (their package G-4).

### 9.2 Port

```ts
interface PartyLink {
  readonly id: 'playbuddy' | 'none'
  readonly capabilities: { status: boolean; offers: boolean; catalog: boolean; rolls: boolean; live: boolean }
  probe(): Promise<LinkHealth>
  listPlayers(): Promise<LinkedPlayer[]>
  getStatus(playerId: string, levels: StatusLevel[]): Promise<StatusResult>
  sendOffer(to: string[] | 'all', payload: OfferPayload, note?: string): Promise<{ offerId: string }>
  getOffer(offerId: string): Promise<{ state: OfferState; reason?: string }>
  withdrawOffer(offerId: string): Promise<void>
  searchCatalog(q: string): Promise<CatalogHit[]>
  rollsSince(since: string): Promise<RollEntry[]>
}
```

- `NoneLink` is the default.
- `PlayBuddyLink` = `transport/http.ts` + `wire/v1.ts` (generated from their JSON Schema once it exists) + `convert/*` (pure).
- Responses are schema-validated at the boundary.
- Enabled only for PF2e campaigns.

### 9.3 Converters

| Converter | Direction | Notes |
|---|---|---|
| `statusToCharacter` | PB → ours | Merges only the levels received. Marks staleness. |
| `inventoryToInstances` | PB → ours | Mirrored instances + purse. Items matched via §9.5. |
| `toOfferPayload` | ours → PB | Catalog if a ref for the current `rulesVersion` is known, else custom. |
| `itemToEntryDefinition` | ours → PB | **Blocked on INV-5.** Provisional mapping of name/level/rarity/traits/price/bulk/usage/description. |
| `coinsToOffer` | ours → PB | Near-identity (`Coins` uses their keys). |
| `rollToEntry`, `offerStateFromWire` | PB → ours | |

### 9.4 Offer flow
"Send to …" from party loot → `POST /v1/offers` → `delivery {offerId, state}`. State is polled while offers are open. Accepted → the instance moves to the character (mirrored). Declined → back to the stash with the reason. The `offerId` is stored before showing success, so a retry never double-sends.

### 9.5 Item matching with the Play Buddy catalog
1. Stored `sourceRef {system:'playbuddy'}` for the current `rulesVersion`.
2. **Shared upstream identity.** If Carl's catalog is built from the same Foundry packs, the Foundry `compendiumSource` / `_id` is a shared key and matching is automatic. **This is now the most important question for Carl** (§9.7 #2).
3. `items/search` by name, auto-accepted on an exact name + level (+ price) match, otherwise the GM picks once.
4. Otherwise send as `custom`.

### 9.6 Browser realities (spike before building)
- https → `http://127.0.0.1`: allowed in Chrome/Firefox; Safari may block it. Chrome's Local Network Access shows a permission prompt (older Chromium: a PNA preflight that needs `Access-Control-Allow-Private-Network: true`).
- CORS for our origins + `Authorization` header.
- A fixed or configurable port.
- `EventSource` can't send `Authorization` headers (relevant to their later SSE).
- Fallback: manual JSON copy/paste through the same converters.

### 9.7 What I still need from Carl
1. `gm-api-v1.json`, or until then, draft example payloads for every endpoint (status with each level + `notShared`, offers, search, rolls).
2. **Catalog source and `itemId`**: is it built from Foundry's pf2e packs? If so, which id (`_id`, `compendiumSource`, slug)? Is `rulesVersion` the Foundry system version (`pf2e-8.6.1`)?
3. The `entry_definition` (INV-5) schema incl. relics, `schemaVersion`, size limits.
4. CORS/PNA/LNA headers, a fixed port option, token lifetime, the SSE auth plan.
5. Inventory representation: bulk, price, coins, containers, equipped/invested, catalog ids on inventory items.
6. Player and character identity stability; what happens on `characterChanged`.
7. Unidentified items in offers (a display name different from the real item, or a later reveal).
8. XP/level hints and negative coins (their open points).
9. Remaster vs legacy entries in their catalog.
10. Error-code list.
11. Content licensing of definitions sent through the API.

---

## 10. Licensing
- **Foundry pf2e repo**: code is Apache-2.0. Game content is ORC (remaster) or OGL 1.0a (legacy), **declared per document** in `publication.license`. The repo ships license texts in `static/licenses`.
- **StarTome**:
  - Never bundle the compendium in the app build.
  - Store `publication.license` per entry.
  - Show license notices plus the OGL section 15 attribution on an "About / Licenses" page once synced content is present.
  - Exports reference the sync version instead of embedding content.
- **The `ReleaseZipMirror` route republishes ORC/OGL content** on your Pages site. That's permitted with notices (the Foundry repo does the same), but it's your call (Q15). The manual ZIP route republishes nothing.
- No Paizo trademarks in the app name. Your pf2etools-derived records stay in your browser and your private exports.
- Foundry's own art/icons: only reference `systems/*/icons` paths from the repo (Apache/ORC); never copy premium module art.

---

## 11. Phases
Each phase ends with a working, deployable app.

### Phase 0: Fork, namespace, test runner (small) — ✅ done 2026-10-28 (`8fdc075`)
Repo + upstream remote. Identity. `appNamespace.ts`. Dexie `startome` v1. Port 3001. **Vitest.**
**Done when:** both apps run side by side on one origin.

### Phase 1: Game identity & basics (small) — ✅ done 2026-10-28
`campaigns.game/rules`. `stripGmOnly()` (+ tests) in the exports. GM wording. New seed. A temporary built-in remaster condition list (replaced by synced conditions in phase 3).
**Done when:** a PF2e campaign works end to end; the old library is untouched.

### Phase 2: Typed compendium core (large) — ✅ done 2026-10-28
`types/rules.ts`. `rules`/`images`/`syncState` tables. `useRules()`. Registries. Compendium section with overview columns (level, price, bulk, rarity, traits, remaster). Typed stat-block views for item, creature, hazard, spell, feat, action, condition. Simple views for the reference kinds. Editors write `localEdits` for synced entries and full fields for user entries. Search/palette/`{{kind:}}` refs/rules-lookup widget.
**Done when:** user entries can be authored and found, and the old library still works alongside.

### Phase 3: Foundry sync (large), the main new work — ✅ 3a done 2026-10-28
- **3a (in scope)**: `converters/foundry/*` + HTML/enricher converter + golden tests pinned to `pf2e-8.6.1`/`sf2e-1.6.1`. **`ReleaseZipFile` source (ZIP drop)**. Worker pipeline. Merge policy. Report. Update check via raw manifests with a release link. Pack picker. License page.
- **Deferred, not part of Phase 3**: `ReleaseZipMirror` (GitHub Action + auto-update) and the `GitTreeDev` dev channel. Revisit after using the ZIP drop for a while.
**Done when:** a fresh browser goes from empty to a full PF2e + SF2e compendium from the release ZIP. A second sync of the same version is a no-op. A sync of a newer version keeps portraits, notes and local edits and reports conflicts.

### Phase 4: Legacy reconcile (medium) — ✅ done 2026-10-28 (v0.5.0)
Worker reader for your export / the `dmforge` DB. Lore import with id remapping. Record matching (§8.2) with a review list. Portrait/link carry-over. Small legacy converter for kept unmatched records. ~~PCs → characters~~ (moved to phase 7: the `characters` table doesn't exist yet; the PC NPCs and the 4 carried items come over as lore entries / `legacy` items with `legacy.carried`).
**Done when:** your campaign works in StarTome, ≥973 creature portraits are attached, all 62 valid placement links point at Foundry creatures, and your homebrew items exist as user entries.

Built: `converters/legacy/{match,records,lore}.ts` (pure), `sync/legacyImport.ts` + a long-lived worker that keeps the parsed export between analysis and apply, `composables/useLegacyImport.ts`, `pages/compendium/legacy.vue` (file drop or the same-origin `dmforge` DB, per-kind match table, review list with candidate picker / keep / leave out, report), `rules/images.ts` (portrait blobs in `images`, `img:<id>` refs, shown in the stat block). Tokens and placements get `linked_rules_id` next to the remapped `linked_record_id`; the old library can be carried over so encounters keep working until phase 5.

Measured against `pf2e-8.6.1` + `sf2e-1.6.1` (all syncable packs) and your 2026-10-28 export:
- **Portraits:** 973 of 1,108 match exactly, ~75 more through fuzzy matches (dragons, "Snake, Viper", "(BB p.57)" suffixes); the rest stay on kept `legacy` entries. ✅
- **Placements:** 52 of 62 exact, 5 fuzzy (Manticore → Manticore (Quill Tail), Vampire Spawn Rogue → Vampire Servitor, …) = **57 → Foundry**. The other **5 (Winter Wolf ×2, Frost Troll ×3) can't**: Foundry no longer ships these creatures, so they link to kept `legacy` entries with your stats and portraits. ⚠️ criterion met as far as the data allows.
- **Homebrew:** Sturmperle, Bluttrinker, Wundmal der Wachen, Eiserne Schneide, Ambosskette des Wächters → `legacy` item entries. ✅
- 148 fuzzy matches go to review (57 remaster spell renames, all at the same rank); 60 unmatched records are kept by default (in use or homebrew); ~1,950 unused unmatched records are left out by default.
- Matching runs in ~10 s on the 250 MB export in the browser, the import in ~4 s. Checked in the browser: campaign, banner, library tokens and compendium portraits. Not yet checked by eye: an imported encounter's map canvas.
- Adventure-path creatures/hazards only match when that bestiary is synced; the page says so when the match rate is low.

### Phase 5: Switch consumers (medium) — ✅ done 2026-10-28 (v0.6.0)
Tokens `linked_ref` + weak/elite. Typed stat panel. Perception initiative. Conditions modal reads synced conditions. Image import/recompress. Exports v1-compatible with the new keys + the quest-board export.
**Done when:** nothing reads `records`/`systems` at runtime.

Built: Dexie v3 indexes `linked_rules_id` on tokens and placements, plus `rules_adjustment` (`'weak' | 'elite'`). The link stays a plain rules id: the kind is part of the entry, so a separate `linked_ref {kind,id}` wasn't needed. `rules/combat.ts` (pure, tested) holds the GM Core weak/elite adjustments, token stats (HP/AC/size from the stat block) and the initiative scope. Initiative rolls d20 + Perception by default (Stealth for hazards), and custom formulas get `perception`, `level`, saves, abilities and skills. On the encounter page, the Creatures tab, the "Link to Stat Block?" dialog and the token modals search creatures and hazards of the campaign's game, with a Normal/Weak/Elite choice. "View Entry" shows the typed stat block with the adjustment applied. Changing the link or the adjustment keeps damage already taken. Conditions (modal, reference panel, GM-screen grid) come from the synced entries, topped up by the built-in list. Badge colours/icons are saved on the entry (`style`, a user-owned field). The GM screen pins compendium entries (`rules-entry` widget). The NPC generator draws from ancestries/heritages/classes/backgrounds. Search, palette, bookmarks, ref links and autocomplete use only the compendium now. The image folder import sets portraits/token art, and recompress also covers the portrait blobs. The full backup exports `rules` (user/legacy entries), `rulesOverlays` (user-owned fields of synced entries), `images` and `syncState`, and no longer exports `systems`/`records`. The quest board export (`type: 'questboard'`) strips GM-only text and resolves `{{item:}}` rewards. The legacy import no longer carries the old library over.

Checked in the browser on the imported Codex data: encounter map and tokens, elite placement (Goblin Warrior AC 16→18, HP 6→16, portrait), weak switch, initiative, synced Off-Guard text, Fireball widget, backup export (235 MB: 76 own entries, 1,032 overlays, 1,098 portraits). Not checked in the browser: re-importing a backup file (covered by unit tests only).

Left for phase 6: `pages/system/*`, `useSystems`, `FieldRenderer` + field components still read `systems`/`records`. Nothing links to them any more (sidebar, home, palette and search are switched), so they only run when someone types their URL.

### Phase 6: Remove the generic system (medium, mostly deletion) — ✅ done 2026-10-28 (v0.7.0)
Builder, record pages, `useSystems`, `useStatBlockLinker`, `FieldRenderer` + unused fields, schema types, `system_id`, `window.dmstome`. Dexie drops `systems`/`records` after an automatic backup.

Built: deleted `pages/system/*`, `useSystems`, `FieldRenderer`, `EntityLayout`, `IconPicker`, all 27 `components/fields/*`, the builder types in `types/entities.ts`, `dataToScope`, the `window.dmstome` plugin (WorldMap, the attribute editor and both player windows import `dbApi`), and the record-type rows of the import modal. Dexie v4 copies every `systems`/`records` row into `legacyLibrary` (one row per record, in chunks of 500), then drops both tables plus `campaigns.system_id` and `linked_record_id` on tokens/placements. Settings › Import & Export can download that backup (DM's Tome `systems-full` shape) or delete it. The legacy converter types DM's Tome rows on their own (`LegacyLoreTables`), so StarTome's row types no longer carry the record link. Checked in headless Chrome on a v3 database with 10,617 records (~90 MB of images): the upgrade takes about 1 s, 10,618 backup rows, link fields gone, the Settings backup row shows. Opt-in scale test: `LIB_SCALE=1 npx vitest run tests/dbMigration.scale.test.ts`.

### Phase 7: Characters, inventory, `PartyLink` + Play Buddy converters offline (medium) — ⤴ superseded by FEATURES_PLAN.md §8 (P1–P5 done, P6 parked)
`characters`/`itemInstances`/`purses` tables. Minimal character UI. PC tokens → characters. `NoneLink`. Play Buddy `wire`/`convert` built against fixtures from the PDF draft, plus a manual JSON paste mode.

### Phase 8: Play Buddy live adapter (after their G-4 local API exists) — ⤴ superseded by FEATURES_PLAN.md §8 P7 (parked)
Spike (§9.6) → transport, settings (port/token/test), players view, offers with state tracking, catalog matching (ideally by Foundry id), roll feed. Regenerate the wire types from `gm-api-v1.json`.

### Later (not planned here)
Party tab, GM-hidden item names, encounter planner + deploy (Foundry creatures come with embedded gear, so planned encounters can also produce loot), XP/milestones, Play Buddy initiative rolls → turn order.

---

## 12. Risks

| Risk | Mitigation |
|---|---|
| Same-origin collision with DM's Tome | Phase 0 namespacing first. |
| **Foundry data model changes between releases** (fields renamed, new item types) | Converters pinned per major version with golden tests. Unknown types/fields → issues, not crashes. Release channel by default (the dev branch is opt-in). |
| **Sync overwrites user work** | Strict ownership split (§7.6). `localEdits` overlay. Conflict report. A backup prompt before the first sync of a new major version. |
| **Large first sync** (35 MB download, 180 MB JSON, ~30k docs) freezes or gets evicted | Worker, pack-by-pack transactions, references instead of embedded copies, `storage.persist()`, resumable state. Adventure bestiaries opt-in. |
| GitHub limits (60/h API; raw abuse limits for per-file sync) | Release ZIP routes need ≤2 API calls. The dev channel throttles, retries and falls back to jsDelivr. |
| Enricher/HTML conversion loses meaning | Golden tests on enricher-heavy docs. Unresolved enrichers fall back to their label text and are counted in the report. |
| Legacy reconcile mis-matches (e.g. legacy vs remaster twins, renamed spells) | Tie-breaks on source/level. Review list for anything ambiguous. Nothing is discarded without confirmation. |
| Play Buddy spec drift | Only `wire/` + `convert/` change. `NoneLink` default. Phase 8 waits for their G-4. |
| Browser blocks loopback access | Spike first, manual JSON fallback. |
| Licensing of republished content | Manual ZIP needs no republishing. The mirror is opt-in (Q15). Licenses are stored and shown. |
| Upstream DmsTome fixes become hard to port | Shared namespace code. VTT/editor structurally unchanged. Cherry-pick. |
| Quest board breaks | Byte-compatible lore. Dedicated contract export. |

---

## 13. Open questions for you

1. ~~Name & repo~~ → **resolved: StarTome**, deployed at `darthamun.github.io/StarTome/`.
2. **Mixed games** per campaign, or strictly one? → *built as strictly one (`campaigns.game`); the compendium can still show both games.* Confirm.
3. **Legacy (pre-remaster) entries**: sync them but hide superseded ones by default, or skip legacy packs/entries entirely? → *built as sync + hide superseded by default ("Show superseded legacy" filter).* Confirm.
4. ~~**Quest board**~~ → **resolved:** dedicated `questboard` export (phase 5). Was: which file and fields, and does it read `records`/`systems`? OK to move it to a dedicated export?
5. ~~Cleaner data source~~ → **resolved: Foundry sync.**
6. ~~Bulk content importer~~ → **resolved: Foundry sync.**
7. ~~**Drop the schema builder**~~ → **resolved:** removed in phase 6.
8. **Repo visibility**: Foundry fixtures are ORC/OGL and fine in public. Fixtures from your pf2etools export should stay private or be synthetic.
9. **Upstream future** of DM's Tome (where the namespacing commit lands).
10. ~~**`window.dmstome`**~~ → **resolved:** removed in phase 6.
11. **SF2e money**: OK to treat 1 credit = 1 sp, as Foundry stores it? Do you track UPBs? → *built as 1 credit = 10 cp; UPBs not tracked.* Confirm UPBs.
12. ~~**First typed kinds**~~ → **resolved:** all kinds have views (phase 2/5). Was: since Foundry provides all kinds, OK to do item/creature/hazard/spell/condition views first and the reference kinds after?
13. **The 4 `carried: "Me"` items**: a PC's inventory? → *imported as `legacy` items with `legacy.carried`; they can now be moved into a character's inventory by hand.* Confirm.
14. **Play Buddy hosting** (parked with P6/P7): the GM client on the same machine as your browser?
15. ~~Sync route~~ → **resolved: ZIP drop first.** Mirror and dev channel deferred. (The mirror would republish ORC/OGL content on your Pages site, so the licensing question comes back if it's ever revived.)
16. **Default packs**: which adventure-path bestiaries do you actually use (Abomination Vaults, given "AV2" sources in your data?), so they can be on by default?

---

## 14. Code review findings (2026-10-29, at `0d7889b` / v0.12.1)

Analysis only: no code was changed. The 221 unit tests pass. Confidence is given for each bug. Effort: **S** < ½ day, **M** 1–3 days, **L** > 3 days. *Plan:* notes mark findings that change or conflict with a step above or in FEATURES_PLAN.md.

### 14.0 Fix these five first
1. **BUG-01: import overwrites existing rows.** Importing into a browser that already has data silently replaces campaigns, entities and encounters with the same ids and cross-wires their links. This is the only finding here that destroys data in normal use.
2. **BUG-02: the full backup is built as one string.** At ~235 MB today it is about halfway to the browser's string limit. When it fails there is no backup, and the backup is the safety net for every other risk.
3. **PERF-01: the player window gets the whole map on every change.** Each pan frame, token move or fog cell sends the base64 map (several MB) through a JSON round-trip. This is the main cause of VTT lag with the player window open.
4. **PERF-02: all ~4,000 game-icons load at startup.** They make up a 7.1 MB chunk that every page load parses before the app shows.
5. **PERF-03 / ARCH-03: images are stored inside rows.** Maps, banners and portraits are base64 inside encounter, campaign and entity rows, so every list, search and wealth readout reads them all. Fixing this also makes BUG-02 and PERF-01 much smaller.

### 14.1 Performance
- [x] **PERF-01** (high) `stores/encounter.ts` `syncToPlayer()` + `useDb.ts` `window.syncEncounter`: every call sends `mapSource` (a multi-MB data URL), all token portraits as data URLs, fog and shapes, after a `JSON.parse(JSON.stringify())` round-trip. It runs on every viewport pan frame (`updateViewport`), token move, fog cell and HP change, even when no player window is open. **Fix:** send the map only when it changes (by id/hash), send deltas for tokens/fog, skip when `playerWindowOpen` is false, use `structuredClone`/`toRaw`, and throttle the viewport. **M**
  - ✅ Done: whitelisted player DTO (`utils/playerPayload.ts`), map and images once per connection, one message per frame, nothing without a player view; measured 765 bytes per token move.
- [x] **PERF-02** (high) `plugins/oh-vue-icons.client.ts`: `import * as GiIcons` + `addIcons(...Object.values(GiIcons))` puts every game-icon into a 7.1 MB startup chunk (`.output/public/_nuxt`, largest file). The `maximumFileSizeToCacheInBytes: 10 MB` workbox setting exists only for this. **Fix:** register the icons in use statically, and load the full set lazily only in the icon picker / condition style dialog (`GI_ICON_NAMES` from a generated name list). **S–M**
  - ✅ Done: game icons load in their own chunk after startup; an `OhVueIcon` wrapper renders gi-* icons once they arrive.
- [x] **PERF-03** (high) `DbEncounter.map_source`, `DbCampaign.banner_source`, entity `portraitSource`, `DbToken.image_source`: inline base64. `encounters.list`, `encounters.search` (every search keystroke), `useResolution.loadPacing`, `useWealth.awardHistory` and `loadWealth` (twice per readout) load every encounter row with its map. **Fix:** move these images to the `images` table with `img:` refs, as the compendium already does (`rules/images.ts`), in a Dexie version upgrade. Exports stay v1-compatible by inlining at export. **L** *Plan:* same direction as §1.2/§7.7. Do it before ARCH-03, or as part of it.
  - ✅ Done where it mattered: encounter maps live in `images` (Dexie v10). The other whole-row reads that carried images nobody looked at are gone: the home page uses `entities.overview` (index keys + a few rows, Dexie v11 `[campaign_id+updated_at]`), the search reads campaign names once per opening. ⊘ Banners, NPC portraits and token images stay in their rows: every reader displays them, so moving them would only add an async step to ~20 components.
- [x] **PERF-04** (medium) `components/GlobalSearch.vue` `runSearch`: per keystroke (150 ms debounce) it awaits five queries **one after another**. `entities.search` is a full scan across all campaigns, `searchByTag` loads and parses every entity, `encounters.search` scans encounters including maps, and `rulesSearch` does a `.filter()` contains-scan over ~30k rules rows. **Fix:** `Promise.all`, scope to the current campaign first, match encounter names from a name-only index, and run the compendium contains-match against the in-memory name index (`useRulesIndex`). **M**
  - ✅ Done: parallel queries, index-only scans for entities and encounters, contains-matches from the name index, tag search stops early.
- [x] **PERF-05** (medium) `composables/useRules.ts` `rulesQuery`: the filter runs over the whole kind **twice** (`count()` and the page), applying `withLocalEdits` per row each time. Text matching isn't indexed. Every page change or filter keystroke repeats the work on ~5k items / ~3k creatures. **Fix:** one pass that collects matching keys and is cached per filter set, then `bulkGet` the page. **M**
  - ✅ Done: one scan per filter set, cached matching ids, `bulkGet` for the page.
- [x] **PERF-06** (medium) `sync/foundrySync.ts`: each selected pack is unzipped and `JSON.parse`d twice (pass 1 index, pass 2 convert). All existing Foundry rows of the game are held in memory (`existing`, ~30k full entities). `inspect` and `run` each unzip the file from scratch in a new worker. **Fix:** in pass 1, read with a lightweight parse or keep the parsed docs of small packs; load only `id → upstream.hash/localEdits` for the merge decision; keep the opened ZIP in one long-lived worker, as the legacy import does. **M** *Plan:* §7.7 says JSZip streams files. It doesn't: `f.async('string')` loads whole packs.
  - ✅ Done: small packs parsed once, only hash/pack kept per row, full rows read per changed pack, one worker from inspect to run.
- [x] **PERF-07** (medium) `useDb.ts` `_resolveTokenDisplay` / `linkedImages.get`, `stores/encounter.ts` `normalizeLibraryToken`: N+1 reads per token (token, entity, rules row), and a FileReader blob → data URL conversion per synced image on every encounter load and library load. **Fix:** `bulkGet` tokens/entities/rules once per load, and cache data URLs per image id, like `resolveImage` does for object URLs. **S–M**
  - ✅ Done: `_resolveTokenDisplays` batches tokens, entries and synced images.
- [x] **PERF-08** (medium) `composables/useEncounterCanvas.ts` `loadMap` / token sprites: `PIXI.Assets.load(dataUrl)` caches textures keyed by multi-MB strings and nothing calls `Assets.unload`. `app.destroy(true)` doesn't clear the Assets cache, so GPU and JS memory grow with every encounter opened in a session. **Fix:** unload on token removal, map change and `destroy()`, or build textures from `ImageBitmap` with an owned cache. **S**
  - ✅ Done: textures tracked and unloaded on map change and `destroy()`.
- [x] **PERF-09** (medium) `useInventory.ts`, `useParty.ts`, `useWealth.ts`: every write calls `reloadIfLoaded`, which re-reads the whole campaign inventory (+ `rulesGetMany`) or roster (+ `adoptFlaggedNpcs` scanning all NPCs). `releaseOwner` runs `move()` per row, so N full reloads. **Fix:** patch local state from the write result, batch `releaseOwner` in one transaction with one reload, or move to liveQuery (ARCH-04). **M**
  - ✅ Done: `releaseOwner` in one transaction with one reload; party reloads skip NPC adoption.
- [x] **PERF-10** (low) `stores/encounter.ts` `setFogCell`: every painted cell stringifies and writes the whole fog object. **Fix:** debounce `persistFog` (flush on unmount, see the debounced-saves rule). **S**
  - ✅ Done: fog saves debounced 400 ms, flushed on encounter switch and page leave.
- [x] **PERF-11** (low) `useRules.ts` `useRulesIndex`: every compendium write (each field edit) reloads all ~30k index keys. **Fix:** update the set for the changed id. Reload fully only after sync/import. **S**
  - ✅ Done: name index patched per write (counts, since twins share names); full reload only after sync/import.
- [x] **PERF-12** (low) `useDb.ts` schema: no compound indexes for the hot queries. `inventory`/`purses` `where('owner')` scans every campaign's `stash`; entities by `[campaign_id+type]` (NPC adoption, quest board); encounters by `[campaign_id+status]`. **Fix:** add them in the next schema version. **S**
  - ✅ Done: Dexie v9: `[campaign_id+owner]`, `[campaign_id+type]`, `[campaign_id+status]`, `[campaign_id+name]`.
- [x] **PERF-13** (low) Startup/offline: `plugins/seed.client.ts` awaits seeding before mount, and the Google Fonts stylesheet is runtime-cached only, so a first start offline shows fallback fonts. **Fix:** bundle the fonts (woff2 in `public/`, already in the precache glob). **S**
  - ✅ Done: fonts bundled via `@fontsource/*` (latin subsets); Google Fonts links and runtime cache removed.

### 14.2 Reusability
- [x] **REUSE-01** (medium) JSON parsing exists in 7+ variants: `tryParseJson` (`stores/encounter.ts`), `parseRecordData` (`useDb.ts`), `parseResolution`, `parseDefeated`, the inline try/catch in `toXpAward`/`toLevelUp`, and `normalize()` in `useEntities.ts`. That last one **throws** on a corrupt row, so one bad entity fails `loadAll` for the whole campaign. **Fix:** one `parseJson<T>(raw, fallback)` in `utils/`, used everywhere. **S**
  - ✅ Done: `utils/json.ts` `parseJson`; `parseRecordData` renamed `parseJsonObject`; a corrupt row no longer breaks `loadAll`.
- [x] **REUSE-02** (medium) `components/editors/{Npc,Faction,Location,Quest}Editor.vue` (+ parts of Event/Session) repeat the same draft state, snapshot view/edit and debounced save logic (~30 references each). **Fix:** a `useEntityEditor(entityId)` composable. It also fixes BUG-08 in one place. **M**
  - ✅ Done: `useAttributeDraft` in the Npc/Faction/Location/Quest/Event/Session editors.
- [x] **REUSE-03** (medium) The campaign-scoped repository pattern (`loadedCampaign`, `reloadIfLoaded`, module-level refs, `revision` counters) is copied in `useParty`, `useInventory`, `useWealth` and `useRules`. **Fix:** a small shared helper, or replace all of them with ARCH-04. **M**
  - ✅ Done with ARCH-04: the refresh logic is the one `onTablesChanged` helper; the `loadedCampaign`/`reloadIfLoaded` lines that remain are three lines per repository.
- [x] **REUSE-04** (low) "Resolved encounters of a campaign" and "last level-up not undone" are queried in `useResolution.loadPacing`, `useWealth.awardHistory`, `loadWealth` and `lastLevelUp`. **Fix:** one query module. **S**
  - ✅ Done: `resolvedEncounters` / `lastLevelUpAt` in `useResolution`, used by wealth and pacing.
- [x] **REUSE-05** (low) `composables/useCommandPalette.ts` repeats `dbApi.entities.search(namePart, 8)` + filtering in 8 commands. `GlobalSearch.vue` rebuilds an `Entity` from a raw row twice, duplicating `useEntities.normalize`. **Fix:** one `findEntities(name, {type, campaignId})` and export `normalize`. **S**
  - ✅ Done: `findEntities(name, type, campaignId)` in the palette (also fixes other types crowding out the wanted one).
- [x] **REUSE-06** (low) Duplicate helpers: `now()` (`useDb`, `useRules`), `blobToDataUrl` (`settings.vue`, `rules/images.ts`), the image compression (`fileToDataUrl`/`compressDataUrl`, DOM canvas code inside the DB module), the base-URL building in `openPlayer`/`openMapPlayer`. **Fix:** move to `utils/`. **S**
  - ✅ Done: `utils/image.ts`, `utils/windowChannel.ts`, one `now()`, one `blobToDataUrl`.
- [x] **REUSE-07** (low) `where('owner').equals(o).filter(r => r.campaign_id === c)` appears ~8× in `useInventory.ts`. **Fix:** a helper on the compound index from PERF-12. **S**
  - ✅ Done: `ownerRows` / `purseRow` helpers on the compound index.

### 14.3 Code quality
- [x] **QUAL-01** (high) No type checking: `package.json` has no `nuxi typecheck`/`vue-tsc` script, and the codebase has 314 `any`/`as any`. `dbApi.encounterTokens.add(data: any)` and `update()` convert any camelCase key to snake_case, so a typo silently writes a new column. `encounters.update({[key]: any})` has the same problem. **Fix:** add `typecheck` to the scripts/CI, and type the token/encounter patches against the row types. **M**
  - ✅ Done: `tsconfig.json`, `vue-tsc`, `pnpm typecheck` passes (79 errors fixed, several were real bugs, see BUG-20–24).
- [x] **QUAL-02** (medium) Write failures are swallowed. Stores `console.error` and continue (`persistFog`, `persistCombatLog`, `persistTurnState`, `loadEncounter`, all of `useEntities`). Timer writes (`tickTurnStartTimers`/`untick`) are fire-and-forget without `catch`. In an offline-only app, a `QuotaExceededError` is silent data loss. **Fix:** a central error reporter with a toast, plus a storage-quota warning (`navigator.storage.estimate`). **M**
  - ✅ Done: `useNotices` + `AppNotices`: failed saves show a notice (quota errors say what to do); store and lore errors go there.
- [x] **QUAL-03** (medium) Oversized files: `pages/encounter/[id]/index.vue` 3,989 lines, `MarkdownEditor.vue` 2,084, `useEncounterCanvas.ts` 1,691, `pages/settings.vue` 1,422 (export, import and recompress logic live in the page), `gm-screen.vue` 1,390, `useDb.ts` 1,122. **Fix:** split by feature (ARCH-02, ARCH-06). Start with settings → `backup/` module. **L**, incremental.
  - ◐ Partly: see ARCH-02 and ARCH-06; `settings.vue` lost import/export to `sync/backup.ts`. MarkdownEditor (2,084) and the canvas (1,691) are unchanged.
- [x] **QUAL-04** (medium) Test gaps on critical paths: `runImport`/`exportAll` (in a page, untested; §11 phase 5 notes "re-importing a backup file covered by unit tests only", but those test the pure helpers), `dbApi` cascades and `clone`, the encounter store (turn order, timers, the player payload), and `useEntities`. **Fix:** a backup round-trip test, a test that the player payload has no GM fields, and cascade tests. **M**
  - ✅ Done: backup, cascades, overview, player payload, renames/removed entries, image release, container re-open, concurrency, PC source and the encounter store (turn order, rounds, removal, timers, hidden turns, fog flush, combat log) — 221 → 258 tests.
- [x] **QUAL-05** (low) Dead code and leftovers: `dbApi.isElectron`, `dbApi.system.readImage`, the "replaces Electron" comments, a `// ── Systems ──` header over snapshots, `useEntities.getGraphData` (Cytoscape-shaped, unused), `composables/useWidgetMarkdown.ts` (unused), the `cytoscape` + `cytoscape-cose-bilkent` dependencies (not imported anywhere), `@types/jszip`/`@types/dompurify` (both packages ship their own types), `graphLayouts.hidden_nodes`, `tokens.is_template` (always 1), the name `parseRecordData`. **Fix:** delete. **S** *Plan:* §1.1 still lists Cytoscape and "No test runner".
  - ✅ Done: removed `isElectron`, `dbApi.system`, `getGraphData`, `useWidgetMarkdown`, the dead FoV broadcast, cytoscape deps, `@types/jszip`/`@types/dompurify`.
- [x] **QUAL-06** (low) Mixed conventions: snake_case rows next to camelCase domain types, `0 | 1` integers next to booleans (`walls.isOpen`), `status?: string` instead of a union, `'file' | 'url'` stored next to sniffing `startsWith('http')`. **Fix:** clean up during the ARCH-03 migration. **M**
  - ⊘ Left as is on purpose: `0 | 1` flags stay because IndexedDB can't index booleans (`tokens.is_template`, and the flags must stay one type); renaming every snake_case column would touch nearly every file for no change in behaviour. Each repository maps rows to camelCase/booleans at its edge (`toCharacter`, `toEntry`, `normalizeToken`).
- [x] **QUAL-07** (low) `pages/settings.vue` uses `alert`/`confirm`, while the rest of the app uses `useAppDialogs`. **S**
  - ⊘ no change: native `confirm`/`alert` is the app-wide pattern (the finding was wrong about `useAppDialogs`).

### 14.4 Bugs
- [x] **BUG-01** (high, confidence high) `pages/settings.vue` `runImport`: rows are written with `table.put(row)` and their original primary keys, 50 at a time with `allSettled`, and no transaction. **Repro:** in a browser with the demo campaign (id 1), import a campaign export from another browser. Campaign 1 and entities/encounters with matching ids are replaced, links and `campaign_id`s now mix both datasets, and a failure halfway leaves a partial import. **Fix:** offer **Restore** (clear, then write with ids in one transaction) and **Merge** (new ids, remapped like `campaigns.clone`). **M** *Plan:* §1.7 already flagged "Import writes with the original ids". It is still open.
  - ✅ Done: `sync/backup.ts`: Merge (new ids, every reference remapped) or Replace (clear, then restore ids), one transaction; tested.
- [x] **BUG-02** (high, confidence medium-high) `pages/settings.vue` `exportAll`/`download`: the whole database becomes one `JSON.stringify(data, null, 2)` string (pretty-printed, ~235 MB measured in §11 phase 5), then a Blob. V8 caps strings at ~512 MB, so growth in maps/portraits ends in "Invalid string length" and no backup. Import reads the file with `file.text()` + `JSON.parse` (same limit, ×2 memory). **Fix:** no indentation; build the Blob from parts per table/row, or a ZIP with images as files (JSZip is there); stream on import. **M**
  - ✅ Done: files are built from one string per row (`jsonBlob`); downloads revoke their URL later.
- [x] **BUG-03** (medium, high) `exportCampaigns`: library `tokens` aren't included, so placements (`encounterTokens.token_id`) lose name, image and links when imported into another browser. The export also always contains **all** campaigns. **Fix:** include the referenced tokens, and add a campaign picker (like the quest board). **S**
  - ✅ Done: campaign export includes the library tokens it places, and has a campaign picker.
- [x] **BUG-04** (medium, high) `useDb.ts` cascades leave orphans. `encounters.delete` leaves `encounterWalls`; `campaigns.delete` leaves `encounterWalls`, `entitySnapshots` and `graphLayouts`; `entities.delete` leaves `characters.npc_entity_id`, token `linked_entity_id`, map pins and snapshot `event_id`. None of the cascades, nor `clone`, run in a transaction, so a crash mid-way leaves a half-deleted or half-cloned campaign. **Fix:** one `rw` transaction per cascade, cover the missing tables, add tests. **S–M**
  - ✅ Done: cascades in one transaction, walls/snapshots/graphs/references covered; tested.
- [x] **BUG-05** (medium, high) `useRules.rulesUpdate` + `rules/edits.ts`: renaming a synced entry stores `localEdits.name`, but `sortName` is a system field and keeps the upstream name. Search, sorting, the ref index, `rulesFindByName`, `{{item: New name}}` refs and the quest board's reward lookup all use the old name. **Repro:** rename a synced Longsword to "Sturmklinge" and search "sturm": no hit. **Fix:** when the effective name changes, also store the effective `sortName` (and recompute it in `merge()` after a sync). **S** *Plan:* §7.6 doesn't mention name edits; add them there.
  - ✅ Done: `sortName` follows the effective name, kept across syncs; pairing uses the upstream name; tested.
- [x] **BUG-06** (medium, high) `useRules.ts` `matcher`/`rulesSearch`/`rulesNameList`: entries flagged `upstream.removed` are still listed. Only `supersededBy` is filtered. **Fix:** hide removed entries by default and add a "show removed" filter. **S** *Plan:* contradicts §7.6 ("Hidden from browse but kept").
  - ✅ Done: removed entries hidden by default, "Show removed upstream" filter; tested.
- [x] **BUG-07** (medium, medium-high) `useInventory.restoreSnapshot` (encounter re-open): a container that held items is matched by `sameStack` and deleted from the stash, then re-added with a **new** id, while its contents come back pointing at the old `container_id`. **Repro:** encounter loot = backpack with 2 potions stored inside → resolve → re-open: the potions point at a missing container, and the backpack's Bulk reduction no longer applies. **Fix:** record row ids in the snapshot, restore by id when the row still exists, and remap container ids. Extend `containers.test.ts` with resolve/re-open. **M**
  - ✅ Done: snapshot records row ids, restore moves rows back by id and remaps containers; tested.
- [x] **BUG-08** (medium, medium-high) `components/editors/NpcEditor.vue` (and the other editors): `draftAttributes` is copied once on load and merged **over** the stored attributes. A level-up or PC toggle made while the page is open (the level-up/XP dialogs live in `app.vue`) shows stale values and is written back on the next attribute edit, so the NPC's `level` drifts from `characters.level`. **Fix:** patch-based attribute saves (only changed keys), or re-sync the draft when the store's entity changes. **S–M** (with REUSE-02)
  - ✅ Done: `useAttributeDraft`: the draft follows the entity, saves write only edited keys.
- [x] **BUG-09** (medium, medium) `useEntities.loadAll`: `if (isLoading) return` returns without awaiting the running load. The layout (`campaign/[id].vue`) and child pages (`index`, `chronicle`, `graphs`, `gm-screen`) call it at the same time, and the second caller continues with old data. `NotesGraph`/`events/timeline` load only `if (!store.entities.length)`, so after switching campaigns they can show the previous campaign. **Fix:** keep the in-flight promise per campaign id and return it; track `loadedCampaign` as the other repos do. **S**
  - ✅ Done: in-flight load per campaign, `loadedCampaign`, `invalidateEntities()` after imports.
- [x] **BUG-10** (medium, medium) `useParty.adoptFlaggedNpcs`: read-then-`bulkAdd` outside a transaction. The encounter page, the resolve dialog and the party page can call `load()` concurrently and create duplicate characters for the same PC NPC. **Fix:** run it in an `rw` transaction and re-check inside. **S**
  - ✅ Done: adoption in one rw transaction; tested.
- [x] **BUG-11** (medium, high that the data is sent) `stores/encounter.ts` `syncToPlayer`: visible tokens are spread whole, so `notes` (GM notes), `ac`, `initiative`, `linkedRulesId`, `linkedEntityId` and `adjustment` reach the player tab. Only conditions, timers and HP are stripped. That's weaker than the `toPlayerView` standard for inventory. **Fix:** an explicit player DTO whitelist and a test (QUAL-04). **S**
  - ✅ Done: see PERF-01; tested in `playerPayload.test.ts` and checked in the browser.
- [x] **BUG-12** (low, high) `useRules.rulesSetImage` / `rules/images.ts`: replacing a portrait stores a new blob and never deletes the old one; `rulesDelete` leaves the entry's blobs. The `images` table only grows. **Fix:** delete the previous `img:` ref on replace and delete; add a "clean up unused images" action. **S**
  - ✅ Done: replaced/deleted blobs are released, homebrew copies get their own blob, Settings › "Clean up unused images".
- [x] **BUG-13** (low, medium) `useResolution.resolveEncounter`: the `status === 'resolved'` check runs before the transaction. Two triggers (toolbar + encounters list, or a double fire) could both award XP. The dialog's `busy` flag covers the common case. **Fix:** re-read the status inside the transaction. **S**
  - ✅ Done: status re-checked inside the transaction; tested with two concurrent resolves.
- [x] **BUG-14** (low, medium) `useDb.ts` `dbApi.window`: one handler per message type, so a second subscriber silently replaces the first. `encounter/[id]/index.vue` never calls `offPlayerClosed`, and `player.vue` never removes its `beforeunload` listener. **Fix:** multi-listener channel helpers that return an unsubscribe function. **S**
  - ✅ Done: multi-listener channels returning unsubscribe functions.
- [x] **BUG-15** (low, medium) `GlobalSearch.vue`: there's no stale-response guard, so a slow earlier query can overwrite newer results. **Fix:** a sequence counter. **S**
  - ✅ Done: sequence counter.
- [x] **BUG-16** (low, medium) `useEncounterCanvas.loadMap`: two quick map changes can finish out of order and leave the older texture. **Fix:** a generation check after `await`. **S**
  - ✅ Done: generation check after `await`.
- [x] **BUG-17** (low, low-medium) `sync/foundrySync.ts` `openReleaseZip`: the pack checksum reads JSZip's private `_data.crc32`. If that's missing, the checksum is the size alone, and a changed pack of the same size is skipped as unchanged. **Fix:** hash the pack text (already read in pass 1), or use `contentHash` per pack. **S**
  - ✅ Done: falls back to a hash of the pack content.
- [x] **BUG-18** (low, medium) No `versionchange`/`blocked` handling on the Dexie instance. With PWA `autoUpdate`, an old tab or the player window can block a schema upgrade, and nothing tells the user. **Fix:** close and offer a reload on `versionchange`, and show a message on `blocked`. **S**
  - ✅ Done: `versionchange` closes and offers a reload; `blocked` explains.
- [x] **BUG-19** (low, high) `useWealth.ts` `priceCache`: the consumable medians are cached per session and not cleared after a sync or import. **Fix:** clear on `useRulesRevision`. **S**
  - ✅ Done: cleared on compendium revision.

### 14.5 Architecture
- [x] **ARCH-01** (high) Four sources of truth for "player character": `entities.attributes.isPlayerCharacter`, `tokens.is_player_character`, `encounterTokens.is_player_token` and `characters.role`, plus the NPC's free-text `level` mirrored from `characters.level`. They're synced by hand in `useParty.patchNpc`, `updateLibraryToken` → `setPlayerFlagForLibraryToken` and the adoption on load (BUG-08 and BUG-10 come from this). **Fix:** `characters` is the only source; tokens get a `character_id`, and the NPC page reads level and PC status from the character. Migrate and drop the mirrors. **L** *Plan:* do this **before FEATURES_PLAN P6** (Play Buddy mirrors characters and would add a fifth path). It reverses the P1 decision to mirror the level to the NPC entry.
  - ✅ Done: the party (`characters`) is the only writer. The NPC flag, library token flag and placement flag are caches written only by `syncPcFlags`; the NPC page's toggle goes through `setNpcPlayerCharacter` (adds or removes the character, asks before removing); the token library can't set a flag the party contradicts (`partyPcFlag`). The cached columns stay because DM's Tome files carry them. Tested, checked in the browser.
- [x] **ARCH-02** (high) `composables/useDb.ts` is a god module: schema and migrations, the Electron-era `dbApi` (snake_case API, cascades), DOM image compression and the BroadcastChannel player/map IPC. New code (`useParty`, `useInventory`, `useRules`) goes around `dbApi` via `getDb()`, and pages call `getDb()` directly (`settings.vue`, `encounters.vue`, `compendium/sync.vue`, `compendium/legacy.vue`). **Fix:** `db/schema.ts`, one repository per aggregate (campaign, encounter, lore, party, inventory, compendium), `ipc/playerChannel.ts`, `utils/image.ts`; pages talk only to repositories. **L**, incremental.
  - ✅ Done: row types, schema history and `getDb` in `db/schema.ts`, table-change events in `db/changes.ts`; `useDb.ts` holds `dbApi` and re-exports the schema; IPC, image helpers and backups live in their own modules.
- [x] **ARCH-03** (medium) The storage shape still mirrors SQLite: JSON strings in columns (`attributes`, `conditions`, `timers`, `fog_data`, `viewport`, `combat_log`, `defeated`, `resolution`, `changes`, `character_ids`, `metadata`, `positions`), `0 | 1` integers, inline images (PERF-03). IndexedDB stores objects natively. Today every read parses and every write re-stringifies whole blobs. **Fix:** one Dexie version that converts these to structured values, with the v1 export format produced at the export edge. **L** *Plan:* keep §8.5's quest-board byte compatibility by converting in `buildQuestBoard`, not in storage.
  - ✅ Done: Dexie v12 (combat state) and v13 (everything else: entity and snapshot attributes, link metadata, graph layouts, level-up and XP logs, `defeated`/`resolution`, wall points, sound tags and playlists) store values. One column map (`VALUE_COLUMNS`) drives the upgrades, the import (`rowValues`) and the DM's Tome import (`structureColumns`); files keep the values too (§8.5).
- [x] **ARCH-04** (medium) Three state patterns: module-level singletons exposed as `useX()` (`useEntities`, `useParty`, `useInventory`, `useWealth`; each `useParty()` call also creates new computeds), one Pinia store (encounter) and component-local loads. Freshness is handled with manual reloads and `revision` counters, so the player window, a second tab and the sync worker never see each other's writes except through `notifyRulesChanged`. **Fix:** Pinia stores per aggregate backed by Dexie `liveQuery`. This also removes PERF-09 and REUSE-03. **L**
  - ✅ Done the narrow way: `db/changes.ts` `onTablesChanged` (Dexie's cross-tab/worker change event) refreshes party, inventory, wealth and compendium lists when another window, tab or the sync worker writes; checked with two tabs. Own writes keep their awaited reload, so callers and tests stay deterministic. ⊘ Not done: moving every repository onto `liveQuery`/Pinia — it would make every write's effect asynchronous for no visible gain now.
- [x] **ARCH-05** (medium) Circular, side-effecting coupling: `useEntities.updateEntity` → `useParty` (quest milestone/XP prompts) → `useEntities.updateEntity` (`patchNpc`), plus `useInventory`. `useResolution` reaches into both. Game rules ("a completed quest prompts a level-up") live in the lore repository. **Fix:** a small domain-event layer (`questCompleted`, `characterLevelChanged`) or a service layer above the repositories. **M**
  - ✅ Done: `useDomainEvents` (`questCompleted`); lore no longer imports the party.
- [x] **ARCH-06** (medium) The encounter page (3,989 lines) holds the VTT shell, prepare/run modes, creatures tab, link dialogs, loot, meter and resolve. The store mixes persistence, player sync, turn logic and timers. **Fix:** feature components (toolbar, creature panel, prepare sidebar, turn controls), and move player DTO/sync (BUG-11, PERF-01) and timers into their own modules. **L**
  - ◐ Partly: player sync (`utils/playerPayload.ts`), the library token form (`LibraryTokenModal`, was two copies), the combat log (`CombatLogPanel`, with its CSS) moved out: 3,989 → 3,687 lines. The prepare sidebar, creature tab and turn order are next if it keeps growing.
- [x] **ARCH-07** (low) Leftovers from the generic design that don't fit PF2e/SF2e. Wall `coverType` is 5e cover (`three-quarter`/`half`/`quarter`); PF2e has lesser/standard/greater. The custom initiative formula evaluator (`useFormulaEvaluator`) now sits next to fixed Perception/Stealth initiative. The condition catalog is still "topped up by the built-in list", and tokens copy colour/icon at add time. The `_allHidden` fog sentinel is a hack. **Fix:** map cover to PF2e degrees (FoV/cover UI), reduce the formula to modifiers, and resolve condition styling from the synced entry. **S–M**
  - ✅ Done: walls store PF2e cover degrees (`greater`/`standard`/`lesser`) since Dexie v13; DM's Tome's 5e names are converted on upgrade and import. The dead FoV broadcast is gone.
- [x] **ARCH-08** (low) Plan drift: §11 phases 7–8 still describe `itemInstances`, a minimal character UI and `NoneLink`, which FEATURES_PLAN P1–P5 and v0.12.1 have replaced or done. §1.1 and §7.7 are out of date (see QUAL-05, PERF-06). **Fix:** mark phases 7–8 as superseded by FEATURES_PLAN §8. **S**
  - ✅ Done: phases 7–8 marked superseded.

### 14.6 Progress (2026-10-29)
Worked through in groups by area (backup → database → compendium → VTT → party/inventory → lore/search → app shell → storage). 244 tests pass, `pnpm typecheck` passes, checked in the browser (map storage and reload, player view payload and size, icons, fonts, logo). Nothing committed yet.

**Second pass (2026-10-29, v0.14.0):** ARCH-01, ARCH-02, ARCH-03, ARCH-04, PERF-03, QUAL-04 done; ARCH-06/QUAL-03 further along; QUAL-06 and parts of ARCH-03/PERF-03 left on purpose (reasons above). Dexie v11 (overview index) and v12 (combat columns as values). 258 tests, typecheck and build pass; checked in the browser (upgrade on the demo data, token modal, combat log, cross-tab refresh, NPC PC toggle).

**Third pass (2026-10-29, v0.15.0):** with DM's Tome → StarTome as the only direction (§8.5), the rest of ARCH-03 (Dexie v13) and the PF2e cover names are done, and files are `version: 2` with images alongside instead of inline.

**Fourth pass (2026-10-29, v0.16.0):** the DM's Tome import is campaign-only (§8.2 superseded). Checked against the real 2026-10-28 export in the in-app browser: The Codex with 154 entries (33 NPC portraits, 9 faction and 13 location images), 19 encounters with their maps, 172 placements and 32 of 38 library tokens (6 monster tokens left out) in 0.8 s; 30 of the 47 token-less placements get a name from their old token or record, the other 17 pointed at tokens already deleted in DM's Tome.

**Still open:** only what depends on Play Buddy (FEATURES_PLAN P6/P7), the parked party handout and Foundry ZIP mirror, and the questions in §13 that need your answer.

**Found and fixed while fixing the above:**
- [x] **BUG-20** (medium) "Close Player View" did nothing: the player window never listened for `close`. It now closes; a player view left open answers the GM's hello after a GM reload.
- [x] **BUG-21** (medium) The quest-giver picker on quests never opened: `openGiverPicker` / `giverDropdownStyle` didn't exist (inherited from DM's Tome, which has the same bug).
- [x] **BUG-22** (low) The Claude export never listed related entries: it read `target_id`, which links don't have; it now resolves links by type and name.
- [x] **BUG-23** (low) The GM-screen session widget showed a `status` sessions don't have; it shows the session's mode.
- [x] **BUG-25** (low) The command palette's "add encounter" wrote a raw row with stale fields (`tokens_json`, `fog_enabled`, no viewport or `updated_at`); it uses `dbApi.encounters.create` now.
- [x] **BUG-24** (low) The global search had no entry card for regions (falls back to the plain row now, typed as optional); the palette's find/edit/delete could miss an entity when 8 entities of other types matched first.
- [x] **App logo and favicon** replaced (detailed book → logo, PWA and Apple icons incl. a maskable one; pixel-art book → favicon). The sidebar/spine logos now respect the `/StarTome/` base URL.

---

## Appendix A: Your export (2026-10-28)

| Table | Rows | Notes |
|---|---|---|
| campaigns | 1 | "The Codex", `system_id 1` |
| entities | 154 | npc 35, session 35, location 25, note 18, rumor 18, faction 12, quest 7, event 3, random-table 1. 0 `[!hidden]` blocks |
| links / connections / graphs / snapshots | 144 / 7 / 5 / 1 | Refs: npc 94, location 46, faction 36, item 8, note 6, encounter 6, creature 3 |
| encounters / placements / walls / tokens | 19 / 172 / 25 / 38 | 62 placements + 6 tokens link creatures, 6 dangling |
| records | 10,617 | creature 2,598 · item 2,412 · feat 2,250 · spell 2,059 · background 472 · hazard 399 · deity 309 · condition 59 · ancestry 36 · class 23 (pf2etools-derived) |

## Appendix B: Foundry source facts (checked 2026-10-28)
- Repo `foundryvtt/pf2e`, branch `v14-dev` @ `cc6d069`. Releases `pf2e-8.6.1`, `sf2e-1.6.1` (2026-10-12), each with `json-assets.zip` (34 MB), `system.zip`, `system.json`. Repo size ~2 GB. Code license Apache-2.0.
- Source layout `packs/{pf2e,sf2e}/<pack>/**.json` (35,897 files, 310 MB). Pack names/paths in `system.pf2e.json` (99 packs) / `system.sf2e.json` (30 packs). Rename maps in `build/uuid-redirects/{pf2e,sf2e}.json`. Localisation in `static/lang/{en,re-en,action-en,sf2e-overrides-en}.json`.
- CORS: `api.github.com` ✓, `raw.githubusercontent.com` ✓, `cdn.jsdelivr.net` ✓, release asset download ✗, codeload ✗.

Profiling scripts and samples are in the session scratchpad. Nothing from either source was copied into the repo.

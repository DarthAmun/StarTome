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

### 8.2 Records → match against the synced compendium
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
- Lore shapes stay byte-compatible. StarTome keeps `version: 1`, `type: 'all'|'campaigns'` and adds keys (`rules` = user/legacy entries + user-owned fields of synced ones, `characters`, `itemInstances`, `purses`, `syncState`, `app`).
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

### Phase 2: Typed compendium core (large)
`types/rules.ts`. `rules`/`images`/`syncState` tables. `useRules()`. Registries. Compendium section with overview columns (level, price, bulk, rarity, traits, remaster). Typed stat-block views for item, creature, hazard, spell, feat, action, condition. Simple views for the reference kinds. Editors write `localEdits` for synced entries and full fields for user entries. Search/palette/`{{kind:}}` refs/rules-lookup widget.
**Done when:** user entries can be authored and found, and the old library still works alongside.

### Phase 3: Foundry sync (large), the main new work
- **3a (in scope)**: `converters/foundry/*` + HTML/enricher converter + golden tests pinned to `pf2e-8.6.1`/`sf2e-1.6.1`. **`ReleaseZipFile` source (ZIP drop)**. Worker pipeline. Merge policy. Report. Update check via raw manifests with a release link. Pack picker. License page.
- **Deferred, not part of Phase 3**: `ReleaseZipMirror` (GitHub Action + auto-update) and the `GitTreeDev` dev channel. Revisit after using the ZIP drop for a while.
**Done when:** a fresh browser goes from empty to a full PF2e + SF2e compendium from the release ZIP. A second sync of the same version is a no-op. A sync of a newer version keeps portraits, notes and local edits and reports conflicts.

### Phase 4: Legacy reconcile (medium)
Worker reader for your export / the `dmforge` DB. Lore import with id remapping. Record matching (§8.2) with a review list. Portrait/link carry-over. Small legacy converter for kept unmatched records. PCs → characters.
**Done when:** your campaign works in StarTome, ≥973 creature portraits are attached, all 62 valid placement links point at Foundry creatures, and your homebrew items exist as user entries.

### Phase 5: Switch consumers (medium)
Tokens `linked_ref` + weak/elite. Typed stat panel. Perception initiative. Conditions modal reads synced conditions. Image import/recompress. Exports v1-compatible with the new keys + the quest-board export.
**Done when:** nothing reads `records`/`systems` at runtime.

### Phase 6: Remove the generic system (medium, mostly deletion)
Builder, record pages, `useSystems`, `useStatBlockLinker`, `FieldRenderer` + unused fields, schema types, `system_id`, `window.dmstome`. Dexie drops `systems`/`records` after an automatic backup.

### Phase 7: Characters, inventory, `PartyLink` + Play Buddy converters offline (medium)
`characters`/`itemInstances`/`purses` tables. Minimal character UI. PC tokens → characters. `NoneLink`. Play Buddy `wire`/`convert` built against fixtures from the PDF draft, plus a manual JSON paste mode.

### Phase 8: Play Buddy live adapter (after their G-4 local API exists)
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
2. **Mixed games** per campaign, or strictly one?
3. **Legacy (pre-remaster) entries**: sync them but hide superseded ones by default, or skip legacy packs/entries entirely?
4. **Quest board**: which file and fields, and does it read `records`/`systems`? OK to move it to a dedicated export?
5. ~~Cleaner data source~~ → **resolved: Foundry sync.**
6. ~~Bulk content importer~~ → **resolved: Foundry sync.**
7. **Drop the schema builder** entirely? (Recommended. Homebrew uses the typed kinds.)
8. **Repo visibility**: Foundry fixtures are ORC/OGL and fine in public. Fixtures from your pf2etools export should stay private or be synthetic.
9. **Upstream future** of DM's Tome (where the namespacing commit lands).
10. **`window.dmstome`**: used by anything external?
11. **SF2e money**: OK to treat 1 credit = 1 sp, as Foundry stores it? Do you track UPBs?
12. **First typed kinds**: since Foundry provides all kinds, OK to do item/creature/hazard/spell/condition views first and the reference kinds after?
13. **The 4 `carried: "Me"` items**: a PC's inventory?
14. **Play Buddy hosting**: the GM client on the same machine as your browser?
15. ~~Sync route~~ → **resolved: ZIP drop first.** Mirror and dev channel deferred. (The mirror would republish ORC/OGL content on your Pages site, so the licensing question comes back if it's ever revived.)
16. **Default packs**: which adventure-path bestiaries do you actually use (Abomination Vaults, given "AV2" sources in your data?), so they can be on by default?

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

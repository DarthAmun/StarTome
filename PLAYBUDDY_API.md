# Play Buddy GM API — v1 (draft)

Status: **draft for review** by Carl (Play Buddy) and Amon (StarTome), 2026-10-31.
This document is the contract. Play Buddy implements the server; StarTome is the first client.
Everything here can change until both sides sign off; after that, v1 only grows by **additive** changes.

## 1. Purpose and principles

StarTome is a browser-based GM tool (campaigns, encounters/VTT, loot, XP). Play Buddy is the players' character app. Phase 2 of Play Buddy lets players join a game run by a GM. This API lets the GM's tool see what players share and send them things, without ever owning their characters.

1. **Players own their characters.** Nothing in this API writes a character directly. The GM sends **offers** (items, coins, level-ups) and **requests** (roll this, take this damage); the player's app applies them, by the player's accept or by an auto-accept the player switched on.
2. **Sharing is the player's choice.** Status comes in **share levels** (§5). A level the player didn't share answers `notShared`, never an error page.
3. **Rules stay in Play Buddy.** The API returns computed values (AC, skill modifiers, max HP), never formulas. StarTome doesn't recompute a character.
4. **Everything is optional for StarTome.** It works fully without Play Buddy, so every field the GM tool can live without is optional.
5. **Offline-friendly.** All writes are idempotent (`Idempotency-Key`), all reads are snapshots with a timestamp, events have a sequence number so a client can catch up.

## 2. Topology

```
 player phones/laptops ──(Play Buddy game, iroh P2P — Carl's design)──▶ GM's Play Buddy (desktop, "GM mode")
                                                                              │
                                                    HTTP on 127.0.0.1:<port>  │  this API
                                                                              ▼
                                                               StarTome in the GM's browser
```

- The **GM runs Play Buddy in GM mode on the same computer** as StarTome. That instance is the hub for the game and serves this API on the loopback interface only.
- How players reach the hub (iroh, local network, later remote) is Play Buddy's business and not part of this contract.
- The API is available only while a game is open in GM mode and the GM has switched the API on.

## 3. Transport, security, browser access

| Topic | Rule |
|---|---|
| Address | `http://127.0.0.1:<port>`; default port **47110**, configurable in Play Buddy. Bind to loopback only. |
| Base path | `/v1`. Breaking changes go to `/v2`. |
| Format | JSON, UTF-8, `camelCase` keys. Timestamps ISO 8601 UTC (`2026-10-31T19:04:05Z`). Ids are opaque strings. |
| Auth | `Authorization: Bearer <token>` on every endpoint except `GET /v1/health` and `POST /v1/pair`. |
| Pairing | Play Buddy shows a 6-digit **pair code** in GM mode. StarTome posts it to `/v1/pair` and gets a token. Tokens last until the GM revokes them in Play Buddy (a list of paired clients with "revoke"). Wrong codes: rate-limited (5 per minute). |
| CORS | Allow the configured origins (defaults: `https://darthamun.github.io`, `http://localhost:3001`). Methods `GET, POST, DELETE, OPTIONS`; headers `Authorization, Content-Type, Idempotency-Key`. Answer preflights with `Access-Control-Allow-Private-Network: true` (Chrome's Private/Local Network Access). |
| Live updates | **Long-polling** on `GET /v1/events` (§8). No SSE/WebSocket needed: `fetch` can send the `Authorization` header, `EventSource` can't. |
| Limits | Request bodies ≤ 256 KB. |

Browsers allow an `https` page to call `http://127.0.0.1` (it counts as a secure context); Chrome may show a one-time "access devices on your local network" prompt.

## 4. Conventions shared by all payloads

```ts
type Iso = string                      // ISO 8601 UTC
type Coins = { pp: number; gp: number; sp: number; cp: number }   // as Play Buddy stores them
type Cp = number                       // money in copper: 1 gp = 100 cp

/** How an item is identified across both apps. Both come from foundryvtt/pf2e. */
interface ItemRef {
  slug: string                         // Play Buddy catalog id, e.g. "longsword" (Foundry's system.slug / slugified name)
  foundryId?: string                   // Foundry document _id, e.g. "00gDg8WcPv3TKC9N" — SHOULD be included when known
  pack?: string                        // Foundry pack, e.g. "equipment-srd"
}

interface ApiError { error: { code: ErrorCode; message: string; details?: unknown } }
type ErrorCode =
  | 'unauthorized' | 'pairCodeInvalid' | 'rateLimited'
  | 'noGame' | 'apiDisabled'
  | 'playerNotFound' | 'offerNotFound' | 'notShared'
  | 'invalidPayload' | 'unknownItem' | 'conflict' | 'internal'
```

- **Matching items:** StarTome stores Foundry ids (`fvtt:pf2e:<pack>:<_id>`). With `foundryId` in `ItemRef`, matching is exact. Without it, StarTome falls back to the slug (both apps derive it from the same Foundry data). **Request to Carl:** keep Foundry's `_id` (and pack) in the importer output for equipment, magic items, spells and runes.
- **Bulk** is a number in Bulk: `0.1` = L, `0` = negligible (Play Buddy's native form).
- **HTTP status:** `200` ok, `201` created, `204` no body, `400 invalidPayload`, `401 unauthorized`, `403 notShared`, `404 *NotFound`, `409 conflict`/`noGame`, `429 rateLimited`, `503 apiDisabled`.

## 5. Share levels

The player chooses per game which levels the GM may read. Defaults suggested to Play Buddy: `basic` and `defenses` on, others off.

| Level | Contents | StarTome uses it for |
|---|---|---|
| `basic` | name, level, ancestry/heritage/class, HP (current/max/temp), conditions, hero points | party page, encounter tokens, HP bars, conditions on tokens, hero point tracking |
| `defenses` | AC, saves, Perception, speed(s), resistances/weaknesses/immunities | encounter tokens, hidden Perception/save rolls, encounter math |
| `skills` | all skill modifiers + lores, class DC, spell DCs/attacks, attribute modifiers | secret skill rolls, Recall Knowledge, DCs |
| `inventory` | items, coins, invested count, bulk | party wealth and gear check, loot hand-out, identification |

(`spells` is left out of v1 on purpose: StarTome has no use for it yet.)

## 6. Endpoints

### 6.1 Health and pairing

**`GET /v1/health`** (no auth)
```json
{ "app": "playbuddy", "appVersion": "0.9.0", "apiVersion": "1.0", "rulesVersion": "pf2e@4cf4c97", "game": { "open": true, "apiEnabled": true } }
```
`rulesVersion` identifies the catalog (e.g. the Foundry commit the data was imported from).

**`POST /v1/pair`** (no auth) `{ "code": "482913", "client": "StarTome", "clientVersion": "0.9.1" }`
→ `201 { "token": "…", "clientId": "c_7Hx…" }` · `400 pairCodeInvalid` · `429 rateLimited`

**`DELETE /v1/pair`** — the client forgets itself (revokes its own token) → `204`.

### 6.2 Game and players

**`GET /v1/game`**
```json
{
  "gameId": "g_01J…",
  "name": "The Codex",
  "startedAt": "2026-10-31T18:00:00Z",
  "players": [
    {
      "playerId": "p_01J…",
      "displayName": "Carl",
      "online": true,
      "lastSeenAt": "2026-10-31T19:04:05Z",
      "character": { "characterId": "c_01J…", "name": "Groknar", "level": 7, "ancestry": "Orc", "class": "Magus", "class2": "Psychic" },
      "shares": ["basic", "defenses"],
      "autoAccept": { "items": false, "coins": true, "levelUp": false, "heroPoints": true, "requests": false }
    }
  ],
  "eventSeq": 1284
}
```
- `playerId` is stable for this player across sessions of the same game. `characterId` is the Play Buddy character id; if the player switches characters, a `characterChanged` event follows.
- `autoAccept` tells the GM what will apply without a tap (purely informative).

### 6.3 Status

**`GET /v1/players/{playerId}/status?levels=basic,defenses,skills,inventory`**

Returns the requested levels the player shares, and lists the rest in `notShared`. Asking only for unshared levels → `403 notShared` (body as below with no level blocks).

```ts
interface StatusResponse {
  playerId: string
  characterId: string
  at: Iso                               // when Play Buddy last received this character from the player
  notShared: ShareLevel[]
  basic?: {
    name: string; level: number
    ancestry: string; heritage?: string; background?: string; class: string; class2?: string
    hp: { current: number; max: number; temp: number }
    conditions: { id: string; name: string; value?: number }[]   // ids are Foundry condition slugs: "frightened", "dying", "wounded", "off-guard"
    heroPoints: number                                           // 0–3
    size?: 'tiny' | 'sm' | 'med' | 'lg' | 'huge' | 'grg'
  }
  defenses?: {
    ac: number
    saves: { fortitude: number; reflex: number; will: number }
    perception: number
    speeds: { land: number; [kind: string]: number }           // feet
    resistances?: { type: string; value: number }[]
    weaknesses?: { type: string; value: number }[]
    immunities?: string[]
  }
  skills?: {
    attributes: { str: number; dex: number; con: number; int: number; wis: number; cha: number }   // modifiers
    skills: Record<string, number>                             // "athletics": 12, lores as "warfare-lore": 9
    classDc?: number
    spellcasting?: { source: string; tradition: string; dc: number; attack: number }[]
  }
  inventory?: {
    coins: Coins
    bulk: { carried: number; encumberedAt: number; limit: number }
    invested: { count: number; limit: number }
    items: InventoryItem[]
  }
}

interface InventoryItem {
  entryId: string                       // Play Buddy inventory entry id ("i12"), stable for that character
  ref: ItemRef                          // catalog identity; for custom items the item it was duplicated from, if any
  custom: boolean                       // true = player/GM-made definition (Play Buddy INV-5)
  name: string
  quantity: number
  level: number
  rarity: 'common' | 'uncommon' | 'rare' | 'unique'
  type: string                          // weapon, armor, shield, gear, consumable, ammo, treasure, container, kit
  price: Cp                             // per `priceFor` units, as in the catalog
  priceFor: number
  bulk: number
  location: 'held' | 'worn' | 'stowed'
  container?: string                    // entryId of the container
  invested?: boolean
  attachments?: Attachment[]            // runes, talismans, upgrades, accessories, relic gifts on this item
  relic?: { aspects: string[] }         // a relic (GMG p. 94); its gifts are attachments of kind 'gift'
  identified: boolean                   // false: only `name` (the unidentified name) is shown to the player
}

/** Something etched onto, affixed to or installed in an item, or a relic's gift. */
interface Attachment {
  entryId?: string                      // in a status: Play Buddy's id for it, what an `identify` offer reveals
  kind: 'rune' | 'talisman' | 'upgrade' | 'accessory' | 'gift'
  ref?: ItemRef                         // catalog item (runes, talismans, upgrades)
  definition?: CustomItemDefinition     // otherwise: relic gifts (type "relic-gift") and homebrew
  name: string
  level?: number
  price?: Cp
  identified?: boolean                  // false: an unidentified rune, or a relic gift that hasn't awakened
  tier?: 'minor' | 'major' | 'grand'    // relic gifts
}
```

- **Attachments replace the earlier `runes` list.** They cover property runes beyond potency/striking, shield runes, talismans, SF2e upgrades and relic gifts, and each carries its own price, so both apps count an item's value the same way.
- A talisman that was spent, or a rune the player moved to another item, simply shows up differently in the next status: StarTome mirrors what it reads, so no event is needed.
- **Unidentified items:** everything attached to them is sent with `identified: false` and stays hidden with the item. An `identify` offer for the item reveals it with its attachments; an `identify` offer naming an attachment's `entryId` reveals that one only (a relic gift awakening).

**`GET /v1/status?levels=…`** — the same for every player in one call: `{ "players": StatusResponse[] }` (players who share none of the levels appear with only `notShared`).

### 6.4 Offers (GM → player, the player's app applies them)

**`POST /v1/offers`** with header `Idempotency-Key: <uuid>` (required). Re-posting the same key returns the original offer (`200`) instead of creating a second one.

```ts
interface OfferRequest {
  to: string[]                          // playerIds
  note?: string                         // shown to the player, e.g. "From the dragon's hoard"
  expiresAt?: Iso
  payload: OfferPayload
}

type OfferPayload =
  | { kind: 'item'; items: OfferItem[] }
  | { kind: 'coins'; coins: Coins }
  | { kind: 'levelUp'; toLevel: number }                      // the player levels up in their own app
  | { kind: 'heroPoint'; amount: number; reason?: string }    // award hero points; the player's app caps the total at 3
  | { kind: 'identify'; entryId: string; playerId: string }   // reveal an unidentified item the player holds

interface OfferItem {
  ref?: ItemRef                         // catalog item (preferred)
  definition?: CustomItemDefinition     // a homebrew item; Play Buddy's custom-item shape (ItemEntry)
  quantity: number
  attachments?: Attachment[]            // §6.3; StarTome sends them with the item they're on
  relic?: { aspects: string[] }
  identified?: boolean                  // default true
  unidentifiedName?: string             // shown while unidentified, e.g. "Glowing Longsword"
  unidentifiedDescription?: string
}
```
Exactly one of `ref` / `definition` per item. If `ref` is unknown to Play Buddy's catalog and no `definition` is given → `400 unknownItem` (StarTome then retries with a `definition`).

`CustomItemDefinition` is Play Buddy's existing custom-item shape (`ItemEntry`: id, name, type, level, price, priceFor, bulk, rarity, traits, usage, summary, category, weapon/armor/shield/container data). The GM may set `source: "StarTome homebrew"`.

→ `201 Offer`

```ts
interface Offer {
  offerId: string
  idempotencyKey: string
  createdAt: Iso
  to: string[]
  payload: OfferPayload
  note?: string
  /** One state per recipient. */
  deliveries: { playerId: string; state: OfferState; at: Iso; reason?: string }[]
}
type OfferState = 'queued' | 'delivered' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'failed'
```
- `queued`: player offline, will be delivered on reconnect. `delivered`: on the player's device, waiting for them. `failed`: the player's app couldn't apply it (`reason` says why).
- An item offer to several players means **each** gets the items (use one offer per player to split loot).

**`GET /v1/offers?open=true`** → `{ "offers": Offer[] }` (open = any delivery still `queued`/`delivered`).
**`GET /v1/offers/{offerId}`** → `Offer`.
**`DELETE /v1/offers/{offerId}`** → withdraws all not-yet-answered deliveries → `200 Offer`.

### 6.5 Requests (GM asks, the player acts)

Requests don't change anything by themselves; the result comes back as events.

**`POST /v1/requests`** (`Idempotency-Key` required)
```ts
interface RollRequest {
  to: string[]
  kind: 'roll'
  check: string                         // "perception" | "fortitude" | "reflex" | "will" | "skill:stealth" | "skill:warfare-lore" | "flat"
  dc?: number                           // flat checks: required
  secret?: boolean                      // the player sees that they rolled, not the result (Play Buddy decides how)
  purpose?: 'initiative' | 'check'      // initiative rolls are ordered by StarTome
  label?: string                        // "Initiative — Goblin ambush"
}

interface DamageRequest {               // apply damage/conditions in the player's app
  to: string[]
  kind: 'damage'
  damage?: { amount: number; type: string; persistent?: boolean }[]   // the player's app applies its own resistances
  conditions?: { id: string; value?: number }[]
  label?: string
}
```
→ `201 { "requestId": "r_…", "deliveries": [ … same shape as offers … ] }`. Roll results arrive as `roll` events carrying `requestId`; a damage request ends `accepted` (applied) or `declined`, and the new HP arrive as `statusChanged`.

A request may also be withdrawn: **`DELETE /v1/requests/{requestId}`** → `200`.

### 6.6 Catalog

**`GET /v1/catalog/items?q=long&limit=20`** and **`GET /v1/catalog/items?slugs=longsword,healing-potion-minor`**
→ `{ "items": { ref: ItemRef, name, level, price, priceFor, rarity, type }[] }`

Used once per unmatched item; the GM confirms a match, StarTome remembers it.

## 7. Rolls

Every roll a player makes during the game is reported (GM-2), whether asked for or not.

```ts
interface Roll {
  rollId: string
  playerId: string
  characterId: string
  at: Iso
  requestId?: string                    // set when it answers a request
  kind: 'check' | 'save' | 'perception' | 'initiative' | 'skill' | 'attack' | 'damage' | 'flat' | 'spell' | 'custom'
  label: string                         // "Athletics", "Longsword +1 (MAP −5)", "Fireball damage"
  formula: string                       // "1d20+12", "2d8+4"
  dice: { die: number; result: number }[]
  modifier: number
  total: number
  dc?: number
  degree?: 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure'
  damageTypes?: { type: string; amount: number }[]   // damage rolls
  secret: boolean                       // rolled secretly: the player didn't see the result
}
```

## 8. Events

**`GET /v1/events?after=<seq>&wait=25`** — long poll. Returns at once if events newer than `after` exist, else holds up to `wait` seconds (max 30) and returns `{ events: [] }`.

```ts
interface EventsResponse { events: GameEvent[]; lastSeq: number; resetRequired?: boolean }
type GameEvent = { seq: number; at: Iso } & (
  | { type: 'roll'; roll: Roll }
  | { type: 'statusChanged'; playerId: string; levels: ShareLevel[] }      // fetch status again for those levels
  | { type: 'sharesChanged'; playerId: string; shares: ShareLevel[] }
  | { type: 'offerChanged'; offerId: string; playerId: string; state: OfferState; reason?: string }
  | { type: 'requestChanged'; requestId: string; playerId: string; state: OfferState; reason?: string }
  | { type: 'itemReturned'; playerId: string; item: InventoryItem; note?: string }   // "give to party stash" in Play Buddy
  | { type: 'playerJoined' | 'playerLeft' | 'playerOnline' | 'playerOffline'; playerId: string }
  | { type: 'characterChanged'; playerId: string; characterId: string }
  | { type: 'gameClosed' }
)
```
- `seq` increases by 1 per event within a game. Play Buddy keeps at least the last 1,000 events; if `after` is older than that, the response has `resetRequired: true` and the client re-reads `/game` and `/status`.
- `statusChanged` carries no data on purpose: the client re-reads only what it needs, and sharing rules are checked in one place (`/status`).
- **`itemReturned`** needs a small Play Buddy feature: a "Give to party" action on an inventory entry that removes it and emits this event. StarTome puts the item in the party stash.

## 9. Manual fallback: the share file

For play without the live API (or before Phase 2 exists), Play Buddy can **export a share file** that StarTome imports by drop or paste on its Import & Export page:

```json
{
  "format": "playbuddy-share",
  "formatVersion": 1,
  "exportedAt": "2026-10-31T19:00:00Z",
  "rulesVersion": "pf2e@4cf4c97",
  "status": { /* StatusResponse with the levels the player chose to include; playerId may be "" */ }
}
```
Same types as the live API, so StarTome uses one converter for both.

## 10. What StarTome does with it (for context)

| StarTome feature | Uses |
|---|---|
| Link a campaign to a game, link party characters to players | `/game` (once), stored as `gameId` + `playerId` on the character |
| Party page: HP, conditions, level | `basic`, refreshed on `statusChanged` (XP stays in StarTome) |
| Encounter tokens for PCs (AC, saves, Perception, HP) | `basic` + `defenses` |
| Initiative | `roll` request with `purpose: 'initiative'`; results fill the turn order |
| Secret checks (Perception, Stealth, Recall Knowledge) | rolled locally from `skills`, or `roll` request with `secret` |
| Roll log | `roll` events into the encounter combat log |
| Loot hand-out, coins | offers; pending until accepted; declined items go back to the stash |
| Level-ups (milestones, quests, 1,000 XP) | `levelUp` offers from the party's level-up: StarTome records them as pending, the level moves when the player accepts, a decline refunds the XP, undo withdraws the offer |
| Hero points (start of session, good play) | `heroPoint` offers; the count shows on the party page from `basic` |
| Identification | unidentified item offers, later an `identify` offer |
| Wealth and gear check | `inventory` |
| Items given back | `itemReturned` → party stash |

## 11. Out of scope for v1

Spells and spell slots, feats, the full sheet, editing characters, the GM's own NPCs in Play Buddy, chat, maps, remote (non-loopback) access. (Starfinder 2e is no longer out of scope: see §11a.)

## 11a. Starfinder 2e (asked for 2026-11-07)

StarTome runs Starfinder 2e campaigns with tactical starship combat (STARFINDER_PLAN.md). Its side is built and tested against the mock (`--system sf2e`); everything here is **additive**, so a PF2e Play Buddy keeps working unchanged. What a Starfinder-capable Play Buddy should send:

| Where | Field | Meaning |
|---|---|---|
| `GET /v1/game` | `system: 'sf2e'` | The game's system. Absent means `pf2e`. StarTome warns when it differs from the campaign's game. |
| `ItemRef` (everywhere) | `system: 'sf2e'` | The Foundry system of `pack`/`foundryId`; StarTome resolves `fvtt:sf2e:<pack>:<_id>`. Absent means `pf2e`. StarTome sends it on SF2e items too. |
| status `skills.skills` | SF2e slugs | `computers`, `piloting`, `crafting`, `athletics` … as in the SF2e Player Core. The starship crew cards use Piloting, Computers, Crafting and Perception (`defenses.perception`). |
| status `skills.classDc` | number | Area Fire / Auto-Fire DCs (class DC + tracking). |
| status `skills.attacks` | `{ ranged?, melee? }` | Weapon attack bonuses; gunnery Strikes use the ranged one. |
| status `inventory.items[]` | `grade?` | `commercial` … `paragon`; StarTome's upgrade-slot check reads it. |
| status `inventory.items[]` | `implanted?: true` | An augmentation implanted in the character (counts toward the four-implant limit). |
| status `inventory.items[].attachments[]` | `kind: 'upgrade'` | Armor and weapon upgrades, and installed weapons. |
| coins / `Cp` | — | Unchanged: SF2e prices and coins travel in copper too (1 credit = 10 cp, as Foundry stores them in silver). |
| status `basic.heroPoints` | — | As in PF2e; a crew member can spend one to reroll the starship's save. |

Optional, later: show the player the battle station they helm and its station actions (StarTome could push them as an offer-like notice).

## 12. Open questions

Checked against Play Buddy at `7606e23`: it has no XP, no hero points and no unidentified items; condition ids are already Foundry slugs; the importer drops Foundry's `_id`.

1. **Foundry ids in the catalog** (§4): can the importer keep `_id` and pack for equipment, magic items and runes? Until then StarTome matches by slug (fine for most items, ambiguous for same-named variants).
2. **XP** stays in StarTome (the GM awards it; Play Buddy only has levels). The GM sends a `levelUp` offer when a character reaches the next level. OK?
3. **Port and origins:** is 47110 fine, and should the origin list be editable in Play Buddy's settings?
4. **Sharing defaults:** `basic` + `defenses` on by default, or everything off?
5. **Event retention** (1,000 events) and long-poll `wait` (≤ 30 s) OK for the hub?

### New Play Buddy features this spec asks for (agreed on StarTome's side for v1)
- **Unidentified items:** `identified` + unidentified name/description on inventory entries; the player sees only those until an `identify` offer arrives (§6.4).
- **Give to party:** an inventory action that removes the item and emits `itemReturned` (§8).
- **Damage requests:** apply damage (with the character's own resistances/weaknesses) and conditions from the GM, after the player's accept or auto-accept (§6.5).
- **Hero points:** track 0–3 hero points on the character (spend to reroll, or all of them to avoid death), share the count in `basic`, and apply `heroPoint` offers (auto-accept by default; the total never goes above 3).
- **Roll requests:** prompt the player to roll a check, save, Perception, initiative or flat check; the result comes back as a `roll` with the `requestId` (§6.5).

## 13. Reference mock

`scripts/playbuddy-mock.mjs` in the StarTome repo implements this spec in memory (two players, pair code `123456`):

```
node scripts/playbuddy-mock.mjs [--port 47110] [--manual]
```

Without `--manual` the mock players answer by themselves (accept offers, roll requested checks, apply damage). `/mock/*` endpoints play the player side by hand (`/mock/offers/{id}/answer`, `/mock/requests/{id}/answer`, `/mock/roll`, `/mock/return`, `/mock/hp`, `/mock/shares`, `/mock/reset`, `GET /mock/state`). StarTome's tests run against it, so its responses double as example payloads for every endpoint.

## 14. Change log

- 2026-11-07: Starfinder 2e additions (§11a): `game.system`, `ItemRef.system`, `skills.attacks`, item `grade` / `implanted`. The mock has `--system sf2e`.
- 2026-10-31: hero points (`basic.heroPoints`, `heroPoint` offers) added.
- 2026-10-31: first draft (Amon/StarTome), based on Play Buddy's data model at `7606e23` and StarTome's FORK_PLAN §9 / FEATURES_PLAN §6.

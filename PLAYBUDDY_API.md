# Play Buddy GM API — v1 (draft 2)

Status: **draft 2, 2026-11-14**, written by StarTome for Carl (Play Buddy). Nothing of draft 1 was built on Play Buddy's side, so draft 2 replaces it under the same base path `/v1`. What changed and why is in §13.

This document is the contract. Play Buddy implements the server; StarTome is the first client. `scripts/playbuddy-mock.mjs` in the StarTome repo implements every endpoint in memory and StarTome's tests run against it, so its answers double as example payloads (§12).

## 1. Purpose and principles

StarTome is the GM's tool (campaigns, encounters, loot, XP), running in the GM's browser. Play Buddy is the players' character app. This API lets the GM's tool see what players share and send them things, without ever owning their characters.

1. **Players own their characters.** Nothing here writes a character. The GM sends **messages** (gifts, level-ups, "roll this", "take this damage"); the player's app applies them, by the player's tap or by an auto-accept the player switched on.
2. **Sharing is the player's choice,** in four share levels (§5). What a player does not share is simply absent.
3. **Rules stay in Play Buddy.** The API returns computed values (AC, skill modifiers, maximum HP), never formulas.
4. **Three moving parts.** One snapshot (`GET /game`), one stream of changes (`GET /events`), one way to send something to a player (`POST /messages`). There is nothing else to keep in step.
5. **Whole numbers.** Money is always copper pieces. Bulk is always tenths (L = 1, 1 Bulk = 10).
6. **Safe to repeat.** Every message carries an idempotency key; events carry a sequence number, so a client that was closed catches up.

## 2. Topology

```
 player phones/laptops ──(Play Buddy game, Carl's design)──▶ GM's Play Buddy (desktop, "GM mode")
                                                                    │
                                          HTTP on 127.0.0.1:<port>  │  this API
                                                                    ▼
                                                     StarTome in the GM's browser
```

The GM runs Play Buddy in GM mode on the same computer as StarTome. That instance serves this API on the loopback interface only, while a game is open and the GM has switched the API on. How players reach it is Play Buddy's business.

## 3. Transport and security

| Topic | Rule |
|---|---|
| Address | `http://127.0.0.1:<port>`, default port **47110**, configurable in Play Buddy. Loopback only. |
| Base path | `/v1`. After sign-off v1 only grows by additions; breaking changes go to `/v2`. |
| Format | JSON, UTF-8, `camelCase`. Timestamps ISO 8601 UTC. Ids are opaque strings. Unknown fields are ignored by both sides. |
| Auth | `Authorization: Bearer <token>` on everything except `GET /v1/health` and `POST /v1/pair`. |
| Pairing | Play Buddy shows a 6-digit pair code in GM mode. The client posts it and gets a token that lasts until the GM revokes it in Play Buddy. Wrong codes are rate-limited (5 per minute). |
| CORS | Allow the configured origins (defaults `https://darthamun.github.io`, `http://localhost:3001`; editable in Play Buddy's settings). Methods `GET, POST, DELETE, OPTIONS`; headers `Authorization, Content-Type, Idempotency-Key`. Answer preflights with `Access-Control-Allow-Private-Network: true`. |
| Live updates | Long polling on `GET /v1/events`. |
| Limits | Request bodies up to 256 KB. |

Errors are `{ "error": { "code": ErrorCode, "message": string } }`:

| Status | Code | When |
|---|---|---|
| 400 | `invalidPayload` | The body does not match this document. |
| 400 | `pairCodeInvalid` | Wrong pair code. |
| 401 | `unauthorized` | Missing or revoked token. |
| 404 | `playerNotFound`, `messageNotFound` | |
| 409 | `noGame` | No game is open in GM mode. |
| 409 | `conflict` | The idempotency key was used with a different body. |
| 429 | `rateLimited` | |
| 503 | `apiDisabled` | The GM switched the API off. |

## 4. Shared types

```ts
type Iso = string                  // "2026-11-14T19:04:05Z"
type Cp = number                   // money in copper: 1 gp = 100 cp, 1 credit = 10 cp
type Bulk = number                 // tenths of Bulk: L = 1, 1 Bulk = 10, negligible = 0
type System = 'pf2e' | 'sf2e'
type ShareLevel = 'basic' | 'defenses' | 'skills' | 'inventory'

/** A catalog item both apps know from Foundry's data. */
interface ItemRef {
  slug: string                     // Foundry's slug of the name: "healing-potion-minor"
  foundryId?: string               // Foundry document _id: SHOULD be sent when known
  pack?: string                    // Foundry pack, "equipment-srd"
  system?: System                  // absent = pf2e
}

/** Everything needed to show and count an item without a catalog. */
interface ItemFacts {
  name: string
  type: string                     // weapon, armor, shield, gear, consumable, ammo, treasure, container, kit, relic-gift
  level: number
  price: Cp                        // for `priceFor` units
  priceFor: number
  bulk: Bulk
  rarity: string
  traits: string[]
  summary?: string
}
```

**Matching items.** StarTome's compendium ids are `fvtt:<system>:<pack>:<foundryId>`, so a ref with `foundryId` and `pack` matches exactly; without them StarTome matches by name. Request to Carl: keep Foundry's `_id` and pack in the importer for equipment, runes, upgrades and augmentations.

## 5. Share levels

The player chooses per game what the GM may read. Suggested defaults: `basic` and `defenses` on.

| Level | Contents | StarTome uses it for |
|---|---|---|
| `basic` | name, level, ancestry, class, HP, conditions, hero points | party page, table bar, tokens, the recap |
| `defenses` | AC, saves, Perception, speeds, resistances | tokens, area saves, initiative |
| `skills` | attribute modifiers, skills and lores, class DC, spell DCs, attack bonuses | secret checks, starship crew |
| `inventory` | items, coins, Bulk carried, invested count | the party's inventory and wealth readout, identifying |

## 6. The snapshot: `GET /v1/game`

Everything the client needs to start, in one call.

```ts
interface Game {
  gameId: string
  name: string
  system: System
  eventSeq: number                 // where /events continues
  players: Player[]
}

interface Player {
  playerId: string                 // stable for this player across sessions of the game
  displayName: string
  online: boolean
  shares: ShareLevel[]
  autoAccept: { items: boolean; coins: boolean; levelUp: boolean; heroPoints: boolean; rolls: boolean; damage: boolean }
  sheet: Sheet | null              // null: no character chosen yet
}

/** What the player shares of their character. A block is present exactly when its level is shared. */
interface Sheet {
  characterId: string
  at: Iso                          // when Play Buddy last heard from the player's device
  basic?: {
    name: string; level: number
    ancestry: string; heritage?: string; class: string; class2?: string
    hp: { current: number; max: number; temp: number }
    conditions: { id: string; name: string; value?: number }[]   // ids are Foundry condition slugs
    heroPoints: number             // 0–3
  }
  defenses?: {
    ac: number
    saves: { fortitude: number; reflex: number; will: number }
    perception: number
    speeds: { land: number; [kind: string]: number }             // feet
    resistances?: { type: string; value: number }[]
    weaknesses?: { type: string; value: number }[]
    immunities?: string[]
  }
  skills?: {
    attributes: { str: number; dex: number; con: number; int: number; wis: number; cha: number }   // modifiers
    skills: Record<string, number>                               // "athletics": 12, "piloting": 9, "warfare-lore": 9
    classDc?: number
    spellDc?: number                                             // the highest, if a caster
    attacks?: { melee?: number; ranged?: number }                // best weapon attack bonuses
  }
  inventory?: {
    coins: Cp
    bulk: Bulk                     // carried
    invested: number
    items: HeldItem[]
  }
}

interface HeldItem {
  entryId: string                  // Play Buddy's inventory entry, stable for that character
  ref?: ItemRef                    // absent for items the player or GM made up
  facts: ItemFacts                 // always present; while unidentified, `facts.name` is the unidentified name
  quantity: number
  identified: boolean
  invested?: boolean
  container?: string               // entryId of the container it is in
  attachments?: HeldAttachment[]   // runes, talismans, upgrades, installed weapons, relic gifts
  relic?: { aspects: string[] }
  grade?: string                   // SF2e: commercial … paragon
  implanted?: boolean              // SF2e: an augmentation in the character's body
}

interface HeldAttachment {
  entryId: string                  // what an `identify` message can name
  kind: 'rune' | 'talisman' | 'upgrade' | 'installed' | 'accessory' | 'gift'
  ref?: ItemRef
  facts: ItemFacts
  identified: boolean              // false: an unidentified rune, or a relic gift that has not awakened
  tier?: 'minor' | 'major' | 'grand'   // relic gifts
}
```

Everything attached to an unidentified item is sent with `identified: false` and stays hidden with it.

## 7. Messages: `POST /v1/messages`

One message goes to one player. Header `Idempotency-Key: <uuid>` is required: posting the same key again returns the message as it stands now (`200`) instead of making a second one.

```ts
interface MessageRequest {
  to: string                       // playerId
  note?: string                    // shown to the player: "From the dragon's hoard"
  body: MessageBody
}

type MessageBody =
  | { kind: 'items'; items: GivenItem[] }
  | { kind: 'coins'; cp: Cp }
  | { kind: 'levelUp'; toLevel: number }                    // the player levels up in their own app
  | { kind: 'heroPoints'; amount: number; reason?: string } // the player's app keeps the total at 3 or less
  | { kind: 'identify'; entryId: string }                   // reveal an item or attachment the player holds
  | { kind: 'roll'; check: string; dc?: number; secret?: boolean; initiative?: boolean; label?: string }
  | { kind: 'damage'; damage?: { amount: number; type: string; persistent?: boolean }[]; healing?: number; conditions?: { id: string; value?: number }[]; label?: string }

interface GivenItem {
  ref?: ItemRef                    // sent whenever StarTome's item came from Foundry
  facts: ItemFacts                 // always sent: Play Buddy uses its catalog entry when it knows `ref`, else these facts
  quantity: number
  identified?: boolean             // default true
  unidentifiedName?: string        // shown while unidentified: "Glowing longsword"
  unidentifiedDescription?: string
  attachments?: { kind: HeldAttachment['kind']; ref?: ItemRef; facts: ItemFacts; identified?: boolean; tier?: 'minor' | 'major' | 'grand' }[]
  relic?: { aspects: string[] }
  grade?: string
}
```

- `roll.check`: `perception`, `fortitude`, `reflex`, `will`, `skill:<slug>` (`skill:stealth`, `skill:warfare-lore`), or `flat` (then `dc` is required). `secret`: the player sees that they rolled, not the result. `initiative`: Play Buddy shows it as an initiative roll.
- `damage`: the player's app applies its own resistances and weaknesses, then the conditions. `type` is a Foundry damage type slug (`fire`, `slashing`) or `untyped` when the GM gave none. `healing` (added 2026-11-14) is Hit Points given back, up to the character's maximum; a message may carry only `healing`, only `conditions`, or any mix. Conditions are only ever added this way: the GM cannot take a condition off a player's character.

Answer: `201 Message`.

```ts
interface Message {
  messageId: string
  to: string
  createdAt: Iso
  note?: string
  body: MessageBody
  state: MessageState
  at: Iso                          // when it reached this state
  reason?: string                  // why it failed, or the player's words on declining
  roll?: Roll                      // `roll` messages once answered
}
type MessageState = 'queued' | 'delivered' | 'accepted' | 'declined' | 'withdrawn' | 'expired' | 'failed'
```

| State | Meaning |
|---|---|
| `queued` | The player is offline; it is delivered when they reconnect. |
| `delivered` | On the player's device, waiting for them. |
| `accepted` | Applied: items and coins added, level-up started, hero points added, item revealed, roll made (see `roll`), damage taken. |
| `declined` | The player said no. |
| `withdrawn` | The GM took it back before it was answered. |
| `expired` | Play Buddy gave up on it (the game was closed, the player left). |
| `failed` | The player's app could not apply it; `reason` says why. |

The last five are final. Changes arrive as `message` events (§8); the sheet changes they cause arrive as `sheet` events.

**`GET /v1/messages?ids=m_1,m_2`** → `{ "messages": Message[], "unknown": string[] }`. For catching up on answers given while the client was closed. Ids Play Buddy no longer knows come back in `unknown`.

**`DELETE /v1/messages/{messageId}`** → `200 Message`, now `withdrawn` if it was not final yet (a final message is returned unchanged).

## 8. Events: `GET /v1/events?after=<seq>&wait=25`

Long poll. Answers at once when events newer than `after` exist, otherwise holds for up to `wait` seconds (at most 30) and answers with an empty list.

```ts
interface EventsResponse { events: GameEvent[]; lastSeq: number; resetRequired?: boolean }

type GameEvent = { seq: number; at: Iso } & (
  | { type: 'sheet'; playerId: string; characterId: string; sheetAt: Iso; blocks: Partial<Pick<Sheet, ShareLevel>>; unshared?: ShareLevel[] }
  | { type: 'player'; player: Omit<Player, 'sheet'> }      // joined, came online, went offline, changed shares or auto-accept
  | { type: 'playerLeft'; playerId: string }
  | { type: 'message'; message: Message }
  | { type: 'roll'; roll: Roll }
  | { type: 'itemReturned'; playerId: string; item: HeldItem; note?: string }
  | { type: 'gameClosed' }
)

interface Roll {
  rollId: string
  playerId: string
  at: Iso
  messageId?: string               // set when it answers a `roll` message
  kind: 'check' | 'save' | 'perception' | 'initiative' | 'skill' | 'attack' | 'damage' | 'flat' | 'spell' | 'custom'
  label: string                    // "Athletics", "Longsword +1 (MAP −5)"
  formula: string                  // "1d20+12"
  total: number
  dc?: number
  degree?: 'criticalSuccess' | 'success' | 'failure' | 'criticalFailure'
  secret: boolean
}
```

- **`sheet`** carries the blocks that changed, whole. The client replaces those blocks and keeps the others. `unshared` lists levels the player stopped sharing: the client forgets them. A player switching to another character sends all shared blocks with the new `characterId`.
- **`roll`**: every roll a player makes during the game is reported, asked for or not. A roll that answers a message is also on that message.
- **`itemReturned`**: a "Give to party" action on an inventory entry in Play Buddy removes it there and emits this; StarTome puts the item in the party stash.
- `seq` rises by 1 per event within a game. Play Buddy keeps at least the last 1,000 events. If `after` is older than that, or belongs to another game, the answer has `resetRequired: true`: the client reads `/game` again and asks `/messages?ids=` for what it still waits on.

## 9. Health and pairing

**`GET /v1/health`** (no auth)

```json
{ "app": "playbuddy", "appVersion": "0.9.0", "apiVersion": "1.0", "rulesVersion": "pf2e@4cf4c97", "game": { "open": true, "apiEnabled": true } }
```

**`POST /v1/pair`** (no auth) `{ "code": "482913", "client": "StarTome", "clientVersion": "1.0.0" }` → `201 { "token": "…", "clientId": "c_7Hx…" }`

**`DELETE /v1/pair`** → `204`. The client gives its own token back.

## 10. The share file (manual fallback)

For play without the live API, Play Buddy exports a file that StarTome imports by drop or from the Party page:

```json
{
  "format": "playbuddy-share",
  "formatVersion": 2,
  "exportedAt": "2026-11-14T19:00:00Z",
  "system": "pf2e",
  "displayName": "Carl",
  "sheet": { "characterId": "c_01J…", "at": "…", "basic": { }, "inventory": { } }
}
```

`sheet` is the `Sheet` of §6 with the levels the player chose to include, so both apps use one converter for file and API.

## 11. What StarTome does with it

| StarTome | Uses |
|---|---|
| Pair, link a campaign to the open game, link party members to players | `/pair`, `/game` |
| Party page and table bar: HP, conditions, hero points, level | `sheet.basic` (XP stays in StarTome) |
| Tokens of linked characters follow HP, conditions and AC; their saves fill the area save prompt; Perception rolls their initiative | `basic`, `defenses` |
| Starship crew: Piloting, Computers, Crafting, Perception; Area Fire DCs; gunnery | `skills` (`classDc`, `attacks.ranged`) |
| The character's inventory, read-only, in the party's wealth and gear check | `inventory` |
| Loot hand-out | `items` and `coins` messages; the stack stays in the stash marked "offered" until accepted; declined coins come back |
| Level-ups (milestone, quest, 1,000 XP) | `levelUp` messages; the level moves when the player accepts; a decline refunds the XP; undo withdraws |
| Hero points (start of session, a great moment) | `heroPoints` messages |
| Identifying | items given with `identified: false`, later an `identify` message |
| Initiative | `roll` messages with `initiative: true`; results fill the turn order |
| Secret checks | `roll` messages with `secret` |
| Damage and conditions from the encounter | `damage` messages |
| Combat log | `roll` events |
| Items given back | `itemReturned` → party stash |

## 12. Reference mock

```
node scripts/playbuddy-mock.mjs [--port 47110] [--manual] [--system sf2e]
```

Two players (Carl with Groknar, Mira with Sel), pair code `123456`. Without `--manual` the mock players answer by themselves: accept gifts, roll what they are asked, take the damage. `/mock/*` plays the player side by hand: `POST /mock/messages/{id}/answer` (`{ "state": "accepted" | "declined" | "failed", "reason"? }`), `POST /mock/roll`, `POST /mock/return`, `POST /mock/hp`, `POST /mock/shares`, `POST /mock/online`, `POST /mock/reset`, `GET /mock/state`.

## 13. Changes from draft 1

Draft 1 was written on 2026-10-31 around what Play Buddy stored at the time. Draft 2 is written around what the GM's tool needs, after StarTome's own rework. Nothing in it needs data Play Buddy did not already have to provide for draft 1.

| Draft 1 | Draft 2 | Why |
|---|---|---|
| `GET /game` + `GET /status` + `GET /players/{id}/status?levels=` + `statusChanged` events that said "read again" | `GET /game` carries every player's shared sheet; `sheet` events carry the changed blocks | One read to start, no read per change, and no `notShared` errors to handle: an unshared block is absent. |
| Offers (`/offers`) and requests (`/requests`), each with create, read, withdraw and its own event | Messages (`/messages`): one resource, one event | They had the same lifecycle; StarTome kept them in one outbox anyway. |
| `to: string[]` with a list of deliveries | `to` is one player, the message has one state | StarTome always tracked them per player; a gift "to several" was ambiguous. |
| Roll results only as `roll` events | The answered `roll` message carries its roll as well | A result given while StarTome was closed could not be recovered. |
| `ref` *or* `definition`; `400 unknownItem` and a retry with a definition | Always `facts`, plus `ref` when there is one | No error path, no second request, and no catalog search endpoint. |
| `GET /catalog/items` | Removed | Only existed for the retry above. |
| `Coins { pp, gp, sp, cp }` | `Cp` everywhere | One number; each app shows it its own way. |
| Bulk as a fraction (`0.1` = L) | Tenths (`1` = L) | Whole numbers. |
| `playerJoined`, `playerLeft`, `playerOnline`, `playerOffline`, `sharesChanged`, `characterChanged` | `player` (the player's line as it is now), `playerLeft`; a character switch is a `sheet` event | The client replaces a row instead of interpreting six events. |
| `identify` named `playerId` and `entryId` | `entryId`; the player is `to` | Said twice. |
| Attachment kind `upgrade` also for installed weapons | Kind `installed` | StarTome's upgrade-slot check tells them apart. |
| `autoAccept.requests` | `autoAccept.rolls`, `autoAccept.damage` | A player may let rolls through but want to see damage. |
| Damage messages carried damage and conditions | Also `healing` (2026-11-14) | Healing typed for a linked character's token in an encounter had no way to reach their app. |
| Starfinder additions in a separate section | Part of the types (`system`, `skills.attacks`, `grade`, `implanted`) | |
| Share file `formatVersion: 1` with `status` | `formatVersion: 2` with `sheet` | Same type as the API. |

Still asked of Play Buddy, as in draft 1: unidentified items (name and description shown until an `identify` message), "Give to party", applying damage with the character's own resistances, hero points (0–3) on the character, and prompting the player to roll.

## 14. Open questions for Carl

1. Can the importer keep Foundry's `_id` and pack (§4)?
2. Is 47110 fine as the default port?
3. Sharing defaults: `basic` and `defenses` on, or everything off?
4. Is keeping 1,000 events and holding a poll for up to 30 seconds fine for the hub?
5. Later, if wanted: showing a player the battle station they helm and its actions (a new message kind, additive).

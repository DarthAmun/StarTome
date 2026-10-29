# Features Plan: party, loot, encounters, progress

Status: **reviewed** (2026-10-28); §10 (P8–P11, next features; P12 dropped) added and reviewed 2026-10-29. All open questions answered (§9). No code has changed. It is based on the feature goals you gave me (party tab, identification, wealth check, encounter builder, resolution loop, character app), the code at `e0bfb79` (v0.7.0), and FORK_PLAN.md (§4.3/§4.4 model sketches, §9 Play Buddy, phases 7–8).

It replaces FORK_PLAN phases 7–8 once agreed.

---

## 0. TL;DR

- **The loop fits the code well.** These parts exist and are tested:
  - XP budget and creature-XP tables (`rules/registry.ts`)
  - weak/elite handling, token placement and Perception initiative (`rules/combat.ts`, `stores/encounter.ts`)
  - compendium search with level, trait and rarity filters (`useRules.rulesQuery`)
  - GM-only text stripping (`utils/gmContent.ts`)
  - the XP/milestone campaign setting (`types/game.ts`)
  - the quest board export (`converters/export.ts`)
- **Seven things should change** before building:
  1. **The VTT encounter *is* the encounter** (decided 2026-10-28). The builder is a tool that creates a VTT encounter with the party's and the enemies' tokens; you then set the map and grid as usual. Loot, XP and "resolved" live on that encounter, with no separate plan entity. The difficulty meter is computed from the encounter's tokens, so it stays right when you add or remove creatures later (§4).
  2. **The wealth % compares against the wrong table.** GM Core's *Party Treasure by Level* is what a party *earns during* one level, not what it should *own*. Compare against cumulative treasure, or *Character Wealth* × party size (§3).
  3. **Planned loot should be ordinary inventory entries** owned by the encounter. Then "resolve → stash" is one owner change, matching your "one item list with owners" rule. No second loot model is needed (§1, §5).
  4. **The gear check needs data we don't keep yet.** The Foundry converter drops `system.runes`. SF2e has no fundamental runes at all: its weapons and armor have **grades** (commercial → paragon) plus potency/striking crystals. The check must therefore be a per-game function, not just a per-game table (§3).
  5. **GM-locked paragraphs don't cover identification for linked items.** A linked item's description is synced Foundry text with no `[!hidden]` blocks. Unidentified means hiding the whole linked description and showing a player-facing one (§2).
  6. **The character app API is ours to extend** (decided 2026-10-28). Keep its "players own their characters" design: GM → player changes are offers (optionally auto-accepted), player → GM changes are events. §6 lists the endpoints to add: hidden fields + reveal, Foundry ids, return-to-stash, level-up offers, an event stream.
  7. **Reorder the goals.** Start with the party roster and the encounter builder, which need no inventory and give quick wins. Do the wealth and gear check last, since it needs everything else (§8).

---

## 1. Goal 1: Party tab, inventory and currency

### What exists
- PCs are campaign NPC entries with `isPlayerCharacter` (`types/entities.ts` `NpcAttributes`). Their `level` is a **free-text string**. Library tokens carry their own PC flag, mirrored onto placements.
- `Item` has `price: Money { cp }`, `bulk` (tenths) and `unidentified { name, description }` (`types/rules.ts`). `formatMoney` / `coinsToCp` live in `rules/format.ts`, and the denominations in `GAME_RULES[game].currency`.
- FORK_PLAN §4.3 already sketches `Character`, `ItemInstance` (holder, quantity, overrides, identified, delivery) and `Purse`. None of these tables exists yet.

### Fit and changes
- **Add a `characters` table instead of reading PC/companion data from NPC attributes.** Budget, level, XP and links need typed fields. Each character keeps an optional `npcEntityId`, so the lore page, portrait and token link keep working.
  - It needs a `role: 'pc' | 'companion'` and a toggle **`treatAsPc`** (always on for PCs, off by default for companions). On means the companion counts for **both party size and party level**, e.g. a capable NPC the GM sends along for a fight. Off means it counts for neither (§9.4).
  - Migration: one character per NPC with `isPlayerCharacter`, parsing the level string where possible.
- **One `inventory` table** (FORK_PLAN's `ItemInstance`). Its owner is a character, the party stash or a VTT encounter (its planned loot, §5); containers can come later.
  - Linked entries inherit name and price unless overridden; unlinked ones have a name and a manual price. This matches the goal as written.
- **The party view is a query** (all owners of the campaign), never a stored copy, as the goal says.
  - **Caveat for linked PCs**: their inventory is a read-only *mirror* of what Play Buddy shares (§6). It's a cache with a timestamp, not a second source of truth, and the UI must say "as of …".
- **Move / split**: one store action, `move(entryId, toOwner, qty?)`. A partial quantity splits the stack. Moving to a Play Buddy-linked PC creates an offer instead (§6).
- **Currency: keep integer cp for both games.**
  - The goal says "credits for SF2e" as the stored unit. The code already stores SF2e prices as cp, with 1 credit = 10 cp (Foundry stores SF2e prices in sp).
  - A second base unit would fork every price, sum and test. Credits are a display concern (`formatMoney(…, 'sf2e')` already prints "30 cr").
  - One `purses` row per owner holds `{ cp }`.
  - "Split evenly" gives each player `floor(total / n)`; the remainder stays in the stash and is shown.
  - Dropping coin denominations loses which coins are carried. That only matters for coin bulk (open question 3) and Play Buddy coin offers, which convert back to pp/gp/sp/cp.
- **Party total** = Σ(price × quantity, or the override) + Σ purses. Compute it with one pure function, `partyTotals(entries, purses, view: 'gm' | 'player')`, which Goal 2 needs anyway.

---

## 2. Goal 2: GM view, player view and identification

### What exists
- `Item.unidentified` is a user-owned field on the **definition**, with an editor field and a stat-block line (`RulesEditor.vue`, `RulesStatBlock.vue`).
- `stripGmOnly()` is used by every export and is tested.
- Foundry's packs carry no identification data (checked: 0 of 5,913 PF2e equipment documents). In Foundry, identification is an instance-level thing.

### Fit and changes
- **Put `identified` and `playerName` on the inventory entry, as the goal says.** The definition's `unidentified.name` is only the default suggestion.
  - The same ring can be identified in one PC's pack and not in the stash, so the state must live on the entry.
- **Add `playerDescription` too.** The goal says "description uses the existing GM-locked paragraphs". That works for the entry's own notes, but not for a linked item, whose description is synced Foundry text.
  - While unidentified, the player sees `playerDescription` (or the definition's `unidentified.description`, or nothing) and never the linked text.
- **Hide the price, level, rarity and traits while unidentified.** Level and the `magical`/`invested` traits give an item away just like its price.
- **Identify** = one action flipping `identified` (undoable).
- **One projection for everything player-facing**: `toPlayerView(entry, item)` returns only player-safe fields. It feeds the party tab's player total, every player-facing export, the quest board, and Play Buddy offers (§6).
  - **The test asserts on the projection**: no true name, price or GM text leaks for unidentified entries. Exports then use the projection and get a smaller test each.
- **Quest board**: today it resolves `{{item: Name}}` refs in quest rewards to the *true* compendium entry (`converters/export.ts`).
  - Once encounters hold loot, quest rewards should come from the linked encounter's loot entries through `toPlayerView`. Plain `{{item:}}` refs keep working for things the GM writes openly.
- **No player-facing view of the party tab for now** (§9.7). A later party window would reuse the BroadcastChannel player window (`dbApi.window`) and `toPlayerView`.

---

## 3. Goal 3: Wealth and equipment check

### What exists
- `GAME_RULES` has currency, encounter and XP tables. **There is no treasure table** (FORK_PLAN §5 listed `treasureByLevel`, but it was never built).
- `CampaignRules` has `advancement` only.

### Challenges
1. **Wealth % against "expected party treasure for that level" is the wrong comparison.**
   - *Party Treasure by Level* (GM Core) is the treasure the party *gains while at* a level: about 175 gp at level 1, 1,350 gp at level 5. A level-5 party owns far more than 1,350 gp worth of gear, so the % would read 300–500% and mean nothing.
   - Use either:
     - **(a) cumulative party treasure**: Σ treasure for levels 1…L−1, plus a share of level L by XP progress; or
     - **(b) Character Wealth × party size**: what a new character of that level gets.
   - **Recommendation**: (a) for parties that played from level 1, and (b) as the reference for parties that started higher. It's a campaign setting, "started at level N", defaulting to 1.
   - Both tables go into the registry with `verified: false` until checked against GM Core.
   - **Readout**: show "the party's treasure matches level X, Y% of the way through" next to the actual level, as your sheet's % columns do, rather than a bare %.
2. **Consumables (open question 1, decided)**: the % compares **treasure awarded** with the expected running total. Consumables count when awarded, with a campaign option to leave them out entirely (then the expected side is an estimate). See §9.1.
3. **The per-character gear check needs data first.**
   - The Foundry converter drops `system.runes` (`converters/foundry/items.ts`). Foundry has `{ potency, striking }` on weapons and `{ potency, resilient }` on armor, including specific magic items and the iconic PCs' gear.
   - Runes also belong on the **inventory entry** (a +1 striking longsword is a Longsword entry with runes), not only on the definition.
   - **SF2e has no fundamental runes.** Its weapons and armor carry a **grade** (commercial, tactical, advanced, superior, elite, ultimate, paragon), which we already keep as `weapon.grade` / `armor.grade`, plus potency/striking **crystals**.
   - So per-system "tables" aren't enough: the registry needs a per-game `gearCheck(character, entries, level)` function. PF2e compares runes against the expected-by-level schedule; SF2e compares grades.
4. **ABP**: a campaign toggle that skips the rune part of the check, as the goal says. It must also switch the treasure reference to GM Core's ABP-reduced values, or the % drifts the other way.
5. **"Party level = level of the PCs"** comes from `characters` (§1). Mixed levels show a warning, and the budget then uses the GM Core guidance for mixed parties (the lower level, or a chosen one).

### Order
This goal consumes the inventory (Goal 1), identification (2) and loot flow (5). Building it first would show 0% until loot exists. **Do it last** (§8). Only the registry tables and the converter's rune/grade fields belong in the first, foundation step.

---

## 4. Goal 4: Encounter builder and token deploy

### What exists
- Budget and XP: `encounterBudget(game, threat, partySize)`, `creatureXp(game, level, partyLevel)` and `simpleHazardXp` are tested in `tests/rules.test.ts`, and the per-PC adjustment is built in.
- Placement: `store.addCreatureToEncounter(rulesId, x, y, adjustment)` spawns compendium creatures and hazards with stats, art and weak/elite. `addCreatureToEncounterAuto` finds a free square.
- Search: `rulesQuery({ kind, games, levelMin, levelMax, traits, rarities })` exists, plus `useCreatureSearch`.
- `Creature.inventory` lists each creature's gear with compendium ids.

### Decided design (2026-10-28)
The builder is a **tool, not a saved thing**. The VTT encounter remains the one "encounter" in the app.

1. **Builder** (opened from the party tab or the encounters list):
   - Shows the party's budget from the party tab (members, party level, threat thresholds).
   - You add and remove creatures and hazards with a count each and Normal/Weak/Elite each, using the compendium search with level, trait and rarity filters.
   - A **live meter** shows the XP spent and the resulting threat (trivial … extreme, or beyond), with a warning for any creature more than +4 above the lowest party member.
   - Switching a creature to weak or elite updates the meter at once.
   - The unfinished selection is kept per campaign in the browser, so closing the builder doesn't lose it.
2. **"Create encounter"**:
   - Makes a **new VTT encounter**, with no map yet and status `prepared`.
   - Places the party's tokens and every enemy (slot × count, weak/elite applied) on free squares, using the existing `addCreatureToEncounter`.
   - Opens it. You set the map, grid and so on as you do today, and move the tokens into place.
3. **The meter also lives on the encounter page** (prepare mode), computed from the encounter's tokens. Enemies are tokens linked to a compendium creature or hazard that aren't party tokens. Adding or removing creatures later keeps the difficulty visible, and no second list can go stale.

### What the code already gives
- Budget and XP: `encounterBudget(game, threat, partySize)`, `creatureXp(game, level, partyLevel)` and `simpleHazardXp` are tested in `tests/rules.test.ts`, and the per-PC adjustment is built in.
- Placement: `store.addCreatureToEncounter(rulesId, x, y, adjustment)` spawns compendium creatures and hazards with stats, art and weak/elite. `addCreatureToEncounterAuto` finds a free square.
- Search: `rulesQuery({ kind, games, levelMin, levelMax, traits, rarities })` exists, plus `useCreatureSearch`.
- Lore integration already exists for VTT encounters: `{{encounter: X}}` refs, global search, the GM-screen encounter widget, and `status` (`prepared` / `active`) with a filter in the encounters list. Nothing is lost by not having a separate entity.

### Points to watch (challenges)
1. **Elite/weak in XP**: GM Core counts elite as one level higher and weak as one lower *for XP*. `rules/combat.ts adjustedLevel` jumps two steps across level 0 (that's the stat-block rule). The XP code must use a plain level ±1. Add a test for exactly this.
2. **Hazards**: complex hazards count like creatures and simple hazards at ⅕ (`Hazard.complex` and both tables already exist).
3. **Allies on the map**: a compendium-linked token fighting *with* the party (a town guard, a summoned creature) would count as an enemy. Add a per-token **"ally"** toggle in the token menu that leaves it out of XP and the meter. A companion who should count for the party uses its `treatAsPc` toggle instead (§9.4).
4. **Party tokens**: "Create encounter" needs a token per party member. Characters link to their NPC entry and its library token (§1). A member without a token gets a plain one from their name and portrait, saved to the library so it's reused next time.
5. **Tokens without a compendium link** (e.g. a homebrew token with hand-typed HP) add no XP. The meter shows "+ N enemies without a stat block" so the number doesn't silently read low.
6. **Defeated enemies deleted during play** would lose their XP before resolving. In Run mode, removing an enemy token keeps its XP on the encounter (a small `defeated` list), and the resolve dialog shows it. Marking tokens dead instead of deleting them also works today.
7. **Extra worth adding**: on the encounter's loot tab, "Suggest loot from creatures' gear" lists the enemies' compendium inventory (`Creature.inventory` already carries item ids).
8. **Encounter notes**: VTT encounters have no description field. If you want prep notes ("ambush from the trees") next to the loot, add a markdown notes field to the encounter. Small and optional.

---

## 5. Goal 5: Resolution loop, loot and advancement

### Fit and changes
- **Loot lives on the encounter**: inventory entries owned by the VTT encounter (with identification fields from §2), plus currency. You add them on a **Loot** tab of the encounter page in prepare mode.
  - **"Resolve encounter"** (run mode, or from the encounters list) sets status `resolved`, moves the loot to the stash in one transaction, and records the XP. It can be undone, and the loot stays editable.
  - The encounter can be re-opened as `prepared`.
- **XP award as for four PCs.** GM Core keeps the award per character equal to what a four-PC group would get; a fifth PC raises the budget, not the award. Awarding raw creature XP to a larger party over-levels it.
  - The award should be the threat's four-PC value scaled to the actual XP, added to each **participating** character. The default is the party members whose tokens are on the encounter, editable in the resolve dialog.
  - Store XP per character, since late joiners and absent players are common.
- **Prompt to level up** when a character reaches 1,000 XP. Leveling subtracts 1,000 and raises the level, which feeds Goals 3 and 4.
- **Milestone mode** (what The Codex uses, so it ships first, in P1):
  - No XP is awarded or shown on the party tab.
  - **"Level up party"** raises every party member (PCs + companions with `treatAsPc`) by one level in one action. Each member has a checkbox, ticked by default, so someone who missed the arc can stay behind. It can be undone.
  - A single character can also be levelled on their own.
  - Every level-up is recorded (date, from → to, what triggered it: manual, a quest, or an encounter) in a small `levelUps` log. The pacing hint and the wealth readout use the date of the last level-up.
  - Quests get a `milestone` flag (`QuestAttributes`); setting status to `completed` on a flagged quest prompts "Level up the party?".
- **Pacing hint**: Σ XP of encounters resolved since the last level-up, against 1,000, GM-only. Each resolved encounter records `resolvedAt`, the XP and the party level it was resolved at.
- **Missing from the goals**: **accomplishment XP** (minor 10 / moderate 30 / major 80 in GM Core). XP campaigns hand it out for quests and story beats. Add an "Award XP" action on quests and encounters, plus a manual one in the party tab.
- **Treasure-pace hint in the builder and on the loot tab** (goal 5.6): compare loot resolved during the current level against that level's Party Treasure row.
  - That is the correct use of the per-level table. The "behind / ahead" hint should come from here, not from the cumulative % in §3.

---

## 6. Integration with the character app (Play Buddy)

**Changed 2026-10-28:** you have access to Play Buddy's repo and can extend its GM API as needed, short of rewriting the app. So the draft API's gaps become **API additions we write**, not blockers. The repo isn't on this machine yet, so everything below must be checked against its code before it's built.

FORK_PLAN §9's adapter stays: a `PartyLink` port, `NoneLink` as the default (the app works fully without Play Buddy), `wire/` + `convert/` as pure converters, offers, and manual JSON paste as the fallback.

### Keep one principle: players own their characters
Play Buddy's core design is that the player's app is authoritative for their sheet and inventory. A GM endpoint that edits a PC's inventory directly would turn that around, which is close to "changing his app entirely", and two apps writing the same inventory is where sync bugs live.

✅ **Decided 2026-10-28**: StarTome never writes a PC's data. Every GM → player change is an **offer** the player's app applies, and every player → GM change is an **event** StarTome receives. Gifts still feel like one click: an offer can be auto-accepted if the player turns that on.

### API additions we'd write (versioned as `gm-api` v1 additions)

| Need (feature goal) | Addition in Play Buddy | StarTome side |
|---|---|---|
| Shared item format, stable IDs | Catalog items carry the Foundry id (`compendiumSource` / `_id`) and `rulesVersion`. Custom entries carry `sourceRef` | Our ids `fvtt:<game>:<pack>:<_id>` map 1:1, so gifts match automatically |
| Unidentified gifts | Inventory entries get `identified`, `playerName`, `playerDescription`, plus GM-only fields (true item ref, description) the player's app **never displays** while unidentified. New `POST /v1/offers/{id}/reveal` or `POST /v1/items/{entryId}/identify` | `toPlayerView` (§2) builds the offer. "Identify" in the party tab calls reveal |
| Gifts (items + currency) | Exists in the draft (`POST /v1/offers`). Add optional auto-accept per player and `toOwner` for the party stash | Offer from the stash or encounter loot. Pending until accepted |
| Moving items **back** to the stash | Player action "give to party stash" in their app → event `itemReturned` | Event creates a stash entry; the mirror drops it |
| Seeing PC inventories | `GET /players/{id}/status?fields=inventory` exists; sharing stays the player's choice | Mirror with `statusAt`. Wealth % and gear check say "incomplete" when not shared |
| Hidden rolls with PC stats | `fields=stats` exists. Make sure it includes skills, saves, Perception and class/spell DC | Roll locally with the existing dice code: "secret roll" in the party tab and the token menu |
| Runes / grade for the gear check | Inventory entries expose `runes` / `grade` | Feeds the per-character gear check (§3) |
| Level / XP sync | `xp` and `level` in `basic` status; offer kind `levelUp` (the player accepts and levels up in their app) | "Level up party" (§5) sends `levelUp` offers to linked PCs |
| Offline / queued writes | Offers are idempotent by a client-chosen key (`Idempotency-Key`) | Local `outbox`; the key is stored before sending |
| Live updates | An event stream (SSE or long-poll) for offer states, `itemReturned`, status changes. Auth via query token, since `EventSource` can't send headers | Falls back to polling |
| Browser access | CORS for StarTome's origins, `Access-Control-Allow-Private-Network`, fixed or configurable port | A spike first (§9.6 of FORK_PLAN); manual JSON paste as the fallback |

Play Buddy is PF2e-only, so SF2e campaigns always use `NoneLink`.

---

## 7. Data model (proposal)

| Table / field | Holds | Notes |
|---|---|---|
| `characters` | campaignId, name, role `pc\|companion`, level, xp, treatAsPc, strMod? (manual, for encumbrance), npcEntityId?, tokenId?, link? (Play Buddy), cached stats + `statusAt` | Created from NPC entries with `isPlayerCharacter`. |
| `inventory` | campaignId, owner `{character\|stash\|encounter}`, itemId?, quantity, nameOverride?, priceOverride?, bulkOverride?, notes, identified, playerName?, playerDescription?, runes? `{potency, striking\|resilient, property[]}`, grade?, mirrored?, delivery? | One list for everyone; the party view is a query. |
| `purses` | campaignId, owner, cp | Integer cp for both games. |
| `encounters` (existing VTT table) | + status `resolved`, `resolvedAt`, `xpAwarded`, `partyLevelAtResolve`, `defeated` (XP of enemies removed in run mode), `notes?` | No new entity. Budget/meter computed from its tokens. |
| `encounterTokens` (existing) | + `is_ally` | Leaves a linked token out of XP. |
| `QuestAttributes.milestone` | flag | Prompts a level-up on completion. |
| `levelUps` | campaignId, characterIds, from, to, at, trigger `manual\|quest\|encounter`, refId? | Undo, pacing hint, wealth readout. |
| `CampaignRules` | + `abp`, `startingLevel`, `startingTreasure` (cp), `baselineAt`, `countConsumables` (default on) | Next to the existing `advancement`. |
| treasure awarded | Derived from resolved encounters' loot + currency awards (value at award time) | The wealth % input (§9.1). Not a second copy: computed from the resolve records. |
| `GAME_RULES[game]` | + `partyTreasure[level]`, `characterWealth[level]`, `abpTreasure?`, `gearCheck()` | SF2e `verified: false`. |
| Foundry converter | keep `system.runes`, keep `grade` (already kept) | Takes effect after a re-sync. |
| `outbox` | queued Play Buddy writes | Phase P8 only. |

All new tables join the full backup and the campaign export (`converters/export.ts`). Player-facing exports go through `toPlayerView`.

---

## 8. Proposed order (replaces FORK_PLAN phases 7–8)

Each step ends with a working app, as before.

| # | Step | Goals | Why here |
|---|---|---|---|
| P1 | **Foundations + milestones**: `characters` table + migration; party roster (Goal 1.1 incl. the "treat as PC" toggle); **milestone levelling**: "Level up party", single level-up, `levelUps` log, quest `milestone` flag with the "Level up the party?" prompt on completion; registry treasure / wealth tables (PF2e from your sheet, SF2e from AoN); keep runes in the converter; `CampaignRules` additions | 1.1, 3.5, 5.3–5.4 (milestone) | Everything below needs party size and level. Milestones are what The Codex uses and need only characters + quests, both there by P1. |
| P2 | **Encounter builder**: builder with the party's budget, live meter (±1 XP rule, hazards ⅕, warnings), filters, "Create encounter" with party + enemy tokens; the meter on the encounter page; ally toggle | 4 | Only needs P1. Uses existing tested code. The first visible win. |
| P3 | **Inventory, purses, identification**: one inventory list, moves/splits, currency, party/GM/player totals, `toPlayerView` + its tests | 1.2–1.6, 2 | Identification ships with the model, not on top of it, so no migration later. |
| P4 | **Resolution loop**: encounter loot tab (= encounter-owned entries), resolve → stash, `defeated` XP, XP mode (award as for four PCs to participants, 1,000 XP level-up prompt, accomplishment XP), milestone pacing hint | 5 | Needs P2 + P3. Closes the loop except for the wealth readout. |
| P5 | **Wealth and gear check**: cumulative/wealth reference, permanent vs consumable, per-game gear check (PF2e runes, SF2e grades), ABP, the builder's treasure-pace hint | 3, 5.6 | Consumes P1–P4. Only meaningful once loot flows. |
| P6 | **Play Buddy API additions** (in his repo, §6) + **offline side here**: wire types from the schema, converters with golden fixtures, manual JSON paste, mirrors, offer flow with outbox | Integration | Was phase 7. Needs the P3 model. Can start any time after P3, since the API is now ours to shape. |
| P7 | **Play Buddy live**: transport spike (CORS / local network access), event stream, status, offers incl. reveal and level-up, hidden rolls from shared stats | Integration | Was phase 8. Needs P6's endpoints running in his GM client. |

P2 and P3 don't depend on each other and could swap if the party tab matters more to you than the builder.

---

### Progress
- **P1 done 2026-10-29 (v0.8.0)**:
  - `characters` + `levelUps` tables (Dexie v5). PC-flagged NPCs are adopted on first load, and a character's level is mirrored to its NPC entry.
  - Party page (`/campaign/:id/party`): roster, "treat as player character" toggle, Str modifier, party level with the mixed warning, add from NPCs or by name.
  - Milestones: the "Level up party" dialog with per-member opt-out, undo, and the level-up history. Quests have a "Level-up milestone" toggle, and completing one in a milestone campaign opens the dialog.
  - Treasure tables for both games plus `levelTreasure` / `expectedTreasure`, and the new `CampaignRules` fields (no UI yet).
  - The converter keeps weapon/armor runes. `CONVERTER_VERSION` makes the next sync re-convert packs converted by an older converter, so **drop the release ZIP once more** to get runes on existing entries.
  - Party tables are in the full backup, the campaign export and the import.
- **P2 done 2026-10-29 (v0.9.0)**:
  - `rules/encounter.ts`: XP per entry with weak/elite as plain level ±1 (tested across level 0), simple hazards at ⅕, threat rating against the party-size budgets (`beyond` above extreme), the +4-over-lowest-member warning, and `tokenSides` (party, allies, enemies, enemies without a stat block).
  - Builder page (`/campaign/:id/encounter-builder`, linked from the party page and the encounters list): compendium search with level (defaults to party level −4…+4), kind, rarity and trait filters; slots with count and Weak/Normal/Elite; live meter; party-level override. The selection is kept per campaign in localStorage.
  - "Create encounter" makes a new `prepared` VTT encounter with the party's tokens on the left and the enemies on the right (numbered labels, sizes respected, no overlap) and opens it. A party member without a token gets one from name and portrait, saved to the library and remembered as `characters.token_id`.
  - The encounter page shows the meter in Prepare mode (left sidebar), computed from the tokens, with its own party-level override (`encounters.party_level`).
  - Token menu: "Mark as Ally" (`encounterTokens.is_ally`) leaves a token out of XP. All new fields are non-indexed, so no Dexie version bump.
  - Not in P2: the `defeated` list for enemies removed in Run mode moves to P4, where the resolve dialog uses it.
- **P3 done 2026-10-29 (v0.10.0)**:
  - `inventory` + `purses` tables (Dexie v6). The owner is one indexed string: `stash`, `character:<id>` or `encounter:<id>`.
  - `rules/inventory.ts`: effective values (linked entries inherit name, price, Bulk, level, rarity and traits unless overridden; ammunition prices and weighs per batch), `planMove` (whole stack or split), `splitCoins`, Bulk with coins at 1 per 1,000 (PF2e only; credits weigh nothing), the encumbrance warning, `partyTotals` for the GM and player views (encounter loot is left out of the party sum), and `toPlayerView`, whose tests assert that no true name, price, level, rarity, traits or GM text leaks for unidentified entries.
  - `useInventory` is the only writer: add (an identical stack grows), edit, delete at quantity 0, identify / un-identify, move with split and merge, coins (add, remove, give, split evenly with the remainder left in the stash). A character removed from the party hands their items and coins to the stash. Encounter loot is deleted with its encounter, and a cloned campaign gets a copy with the owners remapped.
  - Party page **Inventory** section: an owner per tab (stash + every character) with totals and the Bulk/encumbrance warning, a GM/Player view toggle, compendium or free-text add (optionally unidentified), per-entry details (name, price, Bulk overrides, GM notes, player name and description, PF2e potency/striking/resilient or SF2e grade), typed money such as `12 gp 5 sp` or `250 cr`.
  - **Set treasure baseline** stores the GM total, the party level and the date in `CampaignRules` (§9.6).
  - Inventory and purses are in the full backup, the campaign export and the import.
  - Not in P3: Play Buddy-linked moves (offers, P6), containers, and the "award or correction?" question when adding after the baseline (P5, where the wealth % reads it).
- **P4 done 2026-10-29 (v0.11.0)**:
  - `rules/advancement.ts`: the award per participant as for four PCs (the XP scaled by the four-PC budget of the threat it reached over the group's budget; tested for 1, 3, 5 and 6 PCs), default participants (characters whose NPC entry or library token is on the map, else the party members), 1,000 XP per level, the milestone pacing sum, and the `defeated` list.
  - Encounters gain `resolved` status, `resolved_at`, `xp_total`, `xp_awarded`, `party_level_at_resolve`, `defeated` and a `resolution` record (non-indexed). New `xpAwards` log (Dexie v7), in the backup, campaign export and import.
  - **Loot**: the encounter page's Prepare sidebar shows the planned loot and opens a loot dialog (the inventory editor locked to the encounter owner, with the stash and characters as move targets) with "From the enemies' gear" suggestions from `Creature.inventory`.
  - **Resolve** (toolbar, or the encounters list): enemies with their XP (untick any that don't count), the meter, participants, accomplishment XP (none/10/30/80 or typed), the award, and the loot list. One transaction moves loot and coins to the stash (merging stacks), writes the XP award (XP campaigns) and the record. **Re-open** takes back what is still in the stash, undoes the award and says what couldn't come back; level-ups stay.
  - In Run mode, removing enemy tokens (context menu or bulk remove) keeps their XP in `defeated`; the meter and the resolve dialog count it, and the meter can clear it.
  - XP campaigns: XP per character on the roster, **Award XP** (party page; also offered when a quest is completed), the XP log with undo for accomplishments, and a level-up prompt for whoever reaches 1,000. A level-up there costs 1,000 XP, and its undo gives it back.
  - Milestone campaigns: resolving records the XP without awarding it; the party page shows "since the last level-up: N encounters, X / 1,000 XP".
  - Not in P4: the treasure-pace hint on the loot tab (P5, with the wealth readout), and "award or correction?" when adding after the baseline (P5).
- **P5 done 2026-10-29 (v0.12.0)**:
  - `rules/wealth.ts`: loot value (consumables split off), expected treasure per level adjusted for party size, the running total from level 1, "matches level X, Y% through", the wealth readout, the treasure pace and the per-game gear check. `GAME_RULES[game].gear` holds the schedule: PF2e fundamental runes (potency 2/10/16, striking 4/12/19, armor potency 5/11/18, resilient 8/14/20), SF2e grades at the same levels (`verified: false`).
  - Treasure awarded = the baseline + resolved encounter loot + manual awards after it. Each resolve stores the loot's GM value in its resolution record (`treasure`); records from P4 are valued at today's prices. New `treasureAwards` log (Dexie v8) for awards outside encounters, in the backup, campaign export and import. The baseline also stores its consumable share (`CampaignRules.startingConsumables`).
  - "Award or correction?" is an **as treasure** checkbox (default off = correction) when adding items or coins outside an encounter, plus **Record award** for a value without an item (e.g. an unpriced free-text item).
  - Party page **Wealth** section: the % of the expected running total (progress through the level from XP, or the milestone pacing), the matched level, the baseline/encounters/awards breakdown, what the party owns now, this level's pace, **Count consumables** and **ABP** toggles, the gear check per party member, the award log with undo.
  - "Count consumables" off leaves consumables out of what was awarded and subtracts the rows' consumable counts priced at the compendium's median consumable price per level, labelled as an estimate.
  - Pace hint ("treasure this level: X of Y") in the encounter builder header and the loot dialog, which also shows where this loot takes the level.
  - Checked 2026-10-29 on Archives of Nethys: the PF2e consumable counts (GM Core Table 10-9) and the SF2e grade levels (Permanent Item Price table) match, both now `verified`. GM Core has **no** ABP-reduced treasure table: its ABP rules say to ignore as much of Party Treasure by Level as you like while keeping currency steady. So ABP skips the rune check and the expected side stays the standard table.
- **Follow-ups done 2026-10-29 (v0.12.1)**:
  - **Containers** (§9.3): an entry can be stored in a container entry of the same owner (`inventory.container_id`, non-indexed). The container's `bulkReduction` comes off its contents (backpack: the first 2 Bulk; bag of holding: everything up to capacity), with an "over capacity" warning. A container moves with its contents and is never merged while it holds something; deleting it drops the contents loose; moving a stored stack to another owner takes it out. Containers don't nest. "Stored in" sits in an entry's details, and stored stacks are listed indented under their container.
  - **`PartyLink` stub** (`partylink/`): the port from FORK_PLAN §9.2 in our own vocabulary plus `NoneLink` (empty reads, refused writes). P6/P7 stay parked until the Play Buddy API is settled and its repo has been looked at.
- **P8 done 2026-10-29 (v0.17.0)**:
  - `rules/dcs.ts`: `levelDc` (−1…25), `simpleDc`, `adjustDc`, `rarityStep`, `recallKnowledge` and the palette parser. `GAME_RULES[game].dcByLevel` and `.identification` hold the tables, checked on Archives of Nethys 2026-10-29 (GM Core Tables 10-4/10-5/10-6 and Creature Identification Skills; SF2e's are the same plus robot → Computers/Crafting). Level −1 (DC 13) isn't in the book's table and continues its step.
  - Lore DCs are the book's "easy or very easy" after the rarity step. Traits with no skill in the table show "GM's choice"; there are no guessed SF2e tech mappings.
  - "Recall Knowledge" line (GM-styled) on creature and hazard stat blocks, so also in the VTT stat panel and the GM screen's compendium widgets, and under the "Link to Stat Block?" list for the picked entry (weak/elite applied). Stat blocks never reach the player payload.
  - GM screen **DC Table** widget: level picker, the six adjustments with their rarity, the simple DCs, and a source picker listing the pinned creatures/hazards for their Recall Knowledge.
  - Command palette: `dc 7`, `dc level 7 hard`, `dc 7 rare`, `dc trained` (without a difficulty it lists all six adjustments).
  - `tests/dcs.test.ts`.
- **P9 done 2026-10-29 (v0.18.0)**:
  - `rules/turnEffects.ts` (pure): `endOfTurn` (frightened −1; a prompt per persistent damage), `startOfTurn` (recovery check prompt at DC 10 + dying; stunned used up by the actions it takes; reminders for stunned, slowed and quickened), `recoveryCheck`, `persistentCheck`, `hpChangeEffects` and `revertChanges`. Dying rules checked on Archives of Nethys 2026-10-29 (Player Core p. 410): knocked out = dying 1 (2 on a critical) + wounded, unconscious; death at 4 − doomed; losing dying adds wounded 1; healing above 0 ends dying and unconscious; a hit at 0 HP raises dying by 1 (2 on a critical).
  - Persistent damage is a condition named `Persistent <type>` with a `formula` (typed as "Persistent fire 2d6" in the condition dialog, or edited there). The formula stays in the GM window; the player payload already whitelists condition fields.
  - Encounter store: `nextTurn` records a turn record (timer ticks, condition changes, HP from persistent damage, deaths, log entries, prompts) and `prevTurn` reverts exactly that, putting conditions back where they stood. Prompt results are recorded with the turn that raised them. Automatic log entries carry `auto` and show it.
  - Per-token **Uses dying rules** (`encounterTokens.uses_dying`, non-indexed; null = on for player tokens, off for the rest) and a **Critical hit** box in the token dialog. Tokens without dying rules are defeated at 0 HP and come back when healed.
  - `TurnPrompts` over the map in Run mode: recovery check (roll d20 or pick the result rolled at the table), persistent damage (roll the formula or type the damage, flat check DC 15 or 10 assisted, roll or tick "Ends"), dismiss without doing anything; reminders for the token whose turn it is.
  - Campaign setting `CampaignRules.automation` with three switches (tick-down/reminders, dying, persistent prompts), all on by default, in the campaign edit dialog.
  - Not done: moving a knocked-out PC's initiative to just before the turn that dropped it, heroic recovery (hero points) and nonlethal damage.
- **P10 done 2026-10-29 (v0.19.0)**:
  - `rules/creatureBuilding.ts`: GM Core Tables 2-1 to 2-11 for levels −1…24 (attributes, Perception, skills, AC, saves, HP, Strike attack and damage, spell DC and attack), checked on Archives of Nethys 2026-10-29. HP uses the range midpoint; a column a table lacks falls back to the nearest one (no extreme attributes below level 1, AC without terrible, HP without extreme; terrible attributes are −5). SF2e uses the same tables.
  - Road maps (brute, magical striker, skill paragon, skirmisher, sniper, soldier, spellcaster, custom = all moderate) as presets of columns. They come from GM Core's sidebar, which AoN doesn't carry, so `ROADMAPS_VERIFIED` is false and the dialog says so.
  - **Build creature** dialog (`components/rules/BuildCreatureDialog.vue`) from the compendium's creature list and the encounter builder (where the new creature goes straight into the encounter, at the party level): basics and road map, the stat grid with every column's number and a field to type over it, skills, Strikes (attack and damage columns, dice typed over), spellcasting (DC and attack; spells keep their list), abilities as free text or copied from a compendium creature.
  - Saving writes a plain `user` creature (`rulesSaveUser`) with its `build` (road map, columns, typed-over values). **Rebuild at level…** on such a creature keeps the id, the columns and the typed-over values, recomputes the rest and lists what was kept. "Save and edit" continues in the RulesEditor.
  - Tests: `tests/creatureBuilding.test.ts` (table edges and spot checks against AoN, fallbacks, a road map's stat block, rebuild) and `tests/creatureBuildRepo.test.ts` (found by `rulesQuery` at its level; rebuild keeps the id). The plan's "rebuild a GM Core example creature within ±1" test was replaced by the AoN table checks: book creatures mix columns freely, so no example maps cleanly to one road map.

## 9. Open questions

From your list, with proposals:

1. **Consumables in the wealth %?** ✅ **Decided 2026-10-28:**
   - The wealth % measures **treasure awarded** (resolved loot + currency awards + one "starting treasure" value for campaigns already running) against the **running total expected from the starting level**, as in your Wealth_by_Level sheet (columns C/D).
   - Each level's step is adjusted for party size (B + (n − 4) × J). Your sheet divides by B, the 4-PC value.
   - Consumables count when awarded, so using them doesn't lower the number.
   - **Campaign option "count consumables": on (default) / off.** Off leaves consumables out of the awarded side. The expected side then subtracts GM Core's consumable share per level, which the book gives as item counts by level and we price with the median compendium price of a consumable of that level. That expected value is an **estimate** and labelled so.
   - What the party **owns** right now is shown next to it as information, not as the %.
   - The table values in the sheet match GM Core *Party Treasure by Level* and become the PF2e registry rows. The consumable counts per level come from the SF2e table (§9.2), whose layout matches PF2e GM Core; check the PF2e counts against the PF2e book.
2. **SF2e treasure and credits in the rules table?** ✅ **Decided 2026-10-28:**
   - Source: Starfinder 2e *Party Treasure by Level* (GM Core p. 58, party size p. 60), on Archives of Nethys: https://2e.aonsrd.com/rules/731-treasure-by-level.
   - Every value is the PF2e gp value × 10 in credits (level 1: 1,750 cr total, 400 cr currency, 100 cr per extra PC; level 20: 4,900,000 cr). That confirms 1 credit = 1 sp = 10 cp, so prices stay integer cp in both games and credits remain a display format.
   - The SF2e registry rows are entered from that table and marked `verified: true`. The code doesn't derive them from the PF2e rows: they match today, but they're separate books.
   - The table also gives the permanent-item and consumable counts per level (e.g. level 1: permanent 2nd ×2, 1st ×2; consumables 2nd ×2, 1st ×3; level 20: permanent 20th ×4, consumables 20th ×4, 19th ×2). These feed the "count consumables: off" estimate (§9.1). PF2e GM Core p. 58 has the same layout; its counts still need checking against the PF2e book before they're marked verified.
   - The SF2e gear check stays grade-based (commercial → paragon + crystals), from synced data.
3. **Bulk / encumbrance?** ✅ **Decided 2026-10-28:**
   - Show Σ Bulk per owner: characters and the stash, from `Item.bulk` (tenths) × quantity. The unlinked-entry Bulk override is used for free-text entries, and coins count 1 Bulk per 1,000.
   - Encumbrance warning (Encumbered at 5 + Str mod, over the limit at 10 + Str mod) only where the Strength modifier is known: shared Play Buddy stats or a manually entered value on the character.
   - It's a warning only and never blocks a move.
   - Containers (backpack, bag of holding) come later. Same rules in both games.

New:

4. **Party level for mixed levels?** ✅ **Decided 2026-10-28:**
   - Party level = the **average of the party members, rounded down**, shown as "party level 5 (mixed: 4–6)" with a warning when the levels differ.
   - The builder (and each encounter) can override the level. The builder warns about any creature more than 4 levels above the **lowest** member.
   - The treasure expectations (§3) use the same level.
   - **Party members** = PCs + companions with `treatAsPc` on. Companions are off by default and then count for neither size nor level.
   - Who took part is decided by the tokens: the builder adds the party members' tokens, and you can add a companion's token for one fight. The resolve dialog's participant list starts from the party tokens on the map and can be edited. That covers "this NPC joins just this fight" without changing the companion's toggle.
5. **XP per character or one party pool?** ✅ **Decided 2026-10-28:**
   - XP mode: per character, awarded to the encounter's participants.
   - **Milestone mode has priority** (The Codex uses it) and ships in P1: "Level up party" with per-member opt-out, single level-ups, the `levelUps` log, and milestone quests with the level-up prompt (§5).
   - Note: The Codex came over from DM's Tome with the default advancement **XP**. Switch it to Milestone in the campaign's edit dialog on the home page (the setting already exists), or have P1's migration ask once.
6. **Starting point for treasure tracking?** ✅ **Decided 2026-10-28:**
   - For a running campaign, the baseline is **what the party owns once its inventory is entered**. Players hand over their item lists, the GM enters them (P3), then presses **"Set treasure baseline"**.
   - That stores the current GM total (all owners + purses), the party level and the date in `CampaignRules` (`startingTreasure`, `startingLevel`, `baselineAt`).
   - From then on only *awards* count: resolved encounter loot and currency awards.
   - Items entered by hand after the baseline (e.g. a forgotten potion) are corrections, not awards. Adding an entry asks "award or correction?", defaulting to correction outside a resolve.
   - The baseline can be re-set at any time, e.g. after a big shopping trip.
   - New campaigns start at level 1 with a baseline of 0.
7. **Should players see the party inventory live?** ✅ **Decided 2026-10-28: not for now.**
   - No party player window and no handout export. Players see their own inventories in Play Buddy once it's linked; the party stash stays GM-only.
   - `toPlayerView` (§2) is still built in P3, because offers and the quest board need it. A party window or handout can be added later on top of it.
8. **Plans as a lore entity type or a separate table?** ✅ **Decided 2026-10-28: neither.**
   - The builder is a creation tool, and the VTT encounter carries loot, XP and status (§4).
   - The app keeps calling VTT maps "Encounters"; no rename.
9. **For Carl?** ✅ **Decided 2026-10-28:** no questions needed. You can extend Play Buddy's GM API yourself (§6 lists the additions). Decided: keep "players own their characters", with offers and events only and no direct GM writes. Still to do: check §6 against his repo once it's on this machine.

---

## 10. Next features (proposed 2026-10-29, not reviewed)

Five GM tools that StarTome doesn't have yet. Each one builds on typed data that is already stored (creature level, rarity, traits, conditions, turn timers, treasure rows, purses), so none needs a new data source. They continue the step numbering after the parked Play Buddy steps (P6/P7). Each step ends with a working app and its own version, as before.

The rule numbers in this section (DCs, income, creature-building values) come from GM Core / Player Core (PF2e) and the SF2e books. **Every table is entered from Archives of Nethys and marked `verified` only after it was checked there**, as was done for the treasure rows (§9.2). The values quoted below are for orientation, not a source.

### 10.1 P8: DC table and Recall Knowledge helper (small)

**What exists:** the compendium knows each creature's and hazard's `level`, `rarity` and `traits`. The stat block (`components/rules/RulesStatBlock.vue`) shows them. The GM screen has a `rules-entry` widget and a dice widget, but no DC tables.

**Plan:**
- `rules/dcs.ts` (pure, per game in the registry like `creatureXp`):
  - `levelDc(level)`: DC by level, levels −1…25 (e.g. level 1 → 15, 10 → 27, 20 → 40).
  - `simpleDc(rank)`: untrained 10, trained 15, expert 20, master 30, legendary 40.
  - `adjustDc(dc, step)`: incredibly easy −10, very easy −5, easy −2, hard +2, very hard +5, incredibly hard +10.
  - `rarityStep(rarity)`: common none, uncommon hard, rare very hard, unique incredibly hard.
  - `recallKnowledge(entry)`: `{ dc, skills, loreDcs }`. The DC is the level DC adjusted for rarity. The skills come from a trait → skill map (aberration → Occultism, animal → Nature, construct → Arcana/Crafting, undead → Religion, …). Specific Lore is easy and very specific Lore very easy (shown as two lower DCs).
  - SF2e gets its own trait map in the registry (tech-related traits, aeon, …), checked against the SF2e books. Traits that aren't mapped show "GM's choice" instead of guessing.
- **Stat block:** a "Recall Knowledge" line on creatures and hazards (DC, skills, Lore DCs). It's GM-only and so never reaches the player payload (`utils/playerPayload.ts`).
- **VTT:** the same line in the token's stat panel, and in the "Link to Stat Block?" preview.
- **GM screen:** a new `dc-table` widget showing a level picker → level DC with the six adjustments, the simple DCs, and a "for this creature" mode when a `rules-entry` widget is pinned next to it.
- **Command palette:** "DC 7" or "DC level 7 hard" answers inline.
- **Tests:** `tests/dcs.test.ts` for the table edges (−1, 25), rarity steps, the trait map (multi-trait creatures list each skill once), and unknown traits.

### 10.2 P9: Automatic condition tick-down in combat (small–medium)

**What exists:** tokens carry `conditions: TokenCondition[]` (`name`, `value`, `hidden`), `hpCurrent/hpMax` and `timers`. `stores/encounter.ts` `nextTurn()` ticks turn-start timers, `prevTurn()` unticks exactly those ticks, and `updateToken` writes condition changes to the combat log. Nothing changes a condition by itself.

**Plan:** one pure module, `rules/turnEffects.ts`, which `nextTurn`/`prevTurn` call:
- `endOfTurn(token)` for the token whose turn ends:
  - **Frightened** goes down by 1 (and is removed at 0).
  - **Persistent damage** (a valued condition per damage type, e.g. "Persistent fire 2d6") raises a prompt: roll the damage (via `useDiceRoll`), apply it to HP, then the DC 15 flat check with an "assisted" toggle (DC 10) that removes it on success.
  - Other end-of-turn conditions from a small per-game table (e.g. sickened is **not** on it: it only ends by retching).
- `startOfTurn(token)` for the token whose turn starts:
  - **Dying**: a recovery-check prompt (flat check DC 10 + dying value) with the four results, which adjusts dying. Reaching dying 0 removes it, adds or raises **wounded** by 1 and leaves the token unconscious. Dying reaching 4 − doomed marks the token dead.
  - **Stunned / slowed / quickened**: a reminder of the actions lost or gained this turn. Stunned goes down by the actions it takes.
- **HP hooks in `updateToken`:** dropping to 0 HP on a token that uses dying rules adds dying 1 + wounded (dying 2 + wounded on a "critical hit" checkbox in the HP dialog). A per-token "uses dying rules" toggle is on for party tokens (PC or `treat_as_pc` companion) and off for the rest, which are marked defeated at 0 (§10.7 Q1). Healing above 0 ends dying and adds wounded 1.
- **Undo:** like the timers, each turn change records its condition changes (session-only), and `prevTurn` reverts exactly those. Every automatic change is written to the combat log as "auto".
- **Opt-out:** a campaign setting "Automate conditions" (on by default) with separate switches for tick-down, dying and persistent prompts. A prompt can always be dismissed without doing anything.
- **Player view:** unchanged except that conditions update. The prompts are GM-only.
- **Tests:** `tests/turnEffects.test.ts` (frightened, dying ladder with wounded/doomed, the persistent-damage flat check, critical drop to 0, healing) and an encounter-store test that next → prev leaves the conditions exactly as they were.

### 10.3 P10: Creature builder (medium)

**What exists:** `rules/factory.ts` `newRulesEntity(kind, { name, game, origin })` and the compendium editor (`components/rules/RulesEditor.vue`) can already make a `user`-origin creature by hand. Weak/elite adjustments live in `rules/combat.ts`. The `Creature` type has every stat field the builder needs.

**Plan:**
- `rules/creatureBuilding.ts` (data per game in the registry): GM Core's "Building Creatures" tables by level −1…24: ability modifiers, Perception, skills, AC, saves, HP, strike attack bonus, strike damage, spell DC and spell attack, each with its extreme/high/moderate/low (or terrible) column. HP is a range, and the midpoint is used.
- **Roadmaps:** brute, skirmisher, sniper, soldier, spellcaster, skill paragon, magical striker. Each roadmap is a preset of which column every stat uses. A custom roadmap starts from "all moderate".
- **UI:** a "Build creature" dialog from the compendium's creature list and from the encounter builder:
  1. Level, size, traits, rarity and a roadmap.
  2. A grid of every stat with its column (extreme…low), showing the resulting number. Clicking a column changes it, and the number can still be typed over (then marked "custom").
  3. Strikes: name, traits, the attack column and the damage column, with damage written as dice (e.g. 2d8+9 from the table).
  4. Abilities: free text, plus "copy from" a compendium creature's actions.
- **Saving** makes a normal `user` creature (`origin: 'user'`), so it shows up in the compendium, the encounter builder, the VTT and the XP math with no special case. An "Open in editor" button continues in the existing `RulesEditor`.
- **Level shift:** "Rebuild at level N" on a `user` creature rebuilt from its roadmap. It keeps the chosen columns and recomputes the numbers. Edits that were typed over are kept and listed.
- **Tests:** a known GM Core example creature rebuilt from its roadmap within ±1 of the book; level shift; the user creature appears in `rulesQuery` with the right level.

### 10.4 P11: Treasure rolls and earn income (small–medium)

**What exists:** `TreasureRow` in `rules/registry.ts` holds the per-level counts of permanent items and consumables (`permanent`, `consumables` keyed by item level) and the currency. Encounter loot is the inventory owner `encounter:<id>`, edited through `EncounterLootDialog` / `useInventory`. Purses exist per character and for the stash. The wealth check counts awarded treasure (§9.1).

**Treasure rolls:**
- `rules/treasureRoll.ts` (pure, with an injectable random source): given a level, the party size and how much of the level's treasure to hand out (a share or "the rest of this level"), it picks the item slots from the level's counts and fills each slot with a random compendium item of that level and kind.
- Filters: common only (default), uncommon allowed, item kinds (weapons/armor/worn/consumables), game. Items that a party member already owns can be skipped.
- **Remaining budget:** a level's treasure is shared across that level's encounters. The roll shows what is still unawarded at this level from the wealth data (`useWealth`) and suggests the share for this encounter.
- **UI:** a "Roll treasure" button in the encounter loot dialog. It shows the rolled list where you can re-roll, swap or remove single slots, then "Add to loot" adds them as encounter-owned entries, like the "From the enemies' gear" suggestions. Currency goes in as one coin entry. Nothing is awarded until the encounter is resolved, so the wealth % stays honest.
- SF2e uses the same slot counts with grade-based gear. Credits come from the SF2e row.

**Earn income:**
- `rules/income.ts`: the Earn Income table by task level 0…20 with the failure / trained / expert / master / legendary per-day amounts (critical success uses task level + 1). The task DC comes from `levelDc` (P8).
- **UI:** an "Earn income" action on a party member (party page): task level, proficiency, days and the check result (or "roll" with the character's modifier typed in). The total goes into that character's purse in one write, as a **correction** (not an award), since downtime income isn't treasure from play. The wealth readout then shows it as owned, not as awarded. A day-by-day mode is available for mixed results.
- **Tests:** `tests/treasureRoll.test.ts` with a seeded RNG (slot counts match the row, filters hold, nothing above the level), `tests/income.test.ts` (table edges, critical success, days × rate, credits in SF2e).

### 10.5 P12: Exploration, travel and the in-game date — ✗ dropped 2026-10-29 (§10.7 Q5), kept for reference

**What exists:** sessions, events and the chronicle carry an in-world `date` as **free text**, with no calendar. Regions and locations are on the world map. Quests have status. There's no notion of travel or exploration activities.

**Plan (only worth it if travel matters at your table):**
- **Calendar:** `rules/calendar.ts`, a campaign-level calendar with a current date and "advance by hours/days". It has a Golarion preset (Absalom Reckoning months and weekdays) and a plain "Day N" preset. The SF2e preset is checked against the SF2e books before it's offered. The old free-text dates stay as they are, and new sessions/events can pick a date from the calendar instead.
- **Travel:** a travel calculator from the party's slowest Speed (travel speed table, e.g. Speed 25 → 20 miles per 8-hour day), terrain (difficult ×½, greater difficult ×⅓) and the distance. It optionally takes the distance from a path drawn on the world map (using the map scale). "Travel" advances the calendar by the result and writes an event entry.
- **Exploration activities:** a GM-screen widget listing each PC's current activity (Avoid Notice, Defend, Detect Magic, Follow the Expert, Investigate, Scout, Search, Hustle, …) with its rule summary from the synced `action` entries. Their effect on initiative (e.g. Avoid Notice → Stealth for initiative) is shown when an encounter starts.
- **Out of scope:** hex-crawl maps, random encounter tables per terrain (the existing random tables can do that) and weather simulation (a weather widget exists).
- **Tests:** calendar arithmetic (month and year rollover in each preset), the travel table and terrain multipliers.

### 10.6 Proposed order

| Step | What | Size | Why here |
|---|---|---|---|
| P8 | DC table + Recall Knowledge | S | Used every session; P9 and P11 reuse `levelDc`. |
| P9 | Condition tick-down | S–M | Saves the most mistakes in combat. Touches only the encounter store and a new pure module. |
| P10 | Creature builder | M | Self-contained; output is a plain `user` creature. |
| P11 | Treasure rolls + earn income | S–M | Builds on the wealth data (P5) and `levelDc` (P8). |
| ~~P12~~ | ~~Exploration, travel, calendar~~ | — | Dropped (§10.7 Q5). |

### 10.7 Open questions

All answered 2026-10-29:

1. **P9, monsters at 0 HP:** ✅ a per-token "uses dying rules" toggle, on for party tokens and off for the rest (those are marked defeated at 0 HP). Turn it on for a named NPC.
2. **P9, persistent damage:** ✅ a prompt with the formula, a Roll button and a field for a physical roll, then the DC 15 flat check (10 if assisted).
3. **P11, earn income:** ✅ not counted as awarded. It goes in as a correction, so it shows in what the party owns but not in the wealth %.
4. **P11, treasure filters:** ✅ common only by default; uncommon and rare can be ticked per roll.
5. **P12:** ✅ **dropped.** Travel doesn't matter enough at the table; in-world dates stay free text.
6. **P8, player side:** ✅ not now. Recall Knowledge stays GM-only; a player-side reveal can come later through the existing reveal path.

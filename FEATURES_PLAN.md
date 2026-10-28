# Features Plan: party, loot, encounters, progress

Status: **reviewed** (2026-10-28). All open questions answered (§9). No code has changed. It is based on the feature goals you gave me (party tab, identification, wealth check, encounter builder, resolution loop, character app), the code at `e0bfb79` (v0.7.0), and FORK_PLAN.md (§4.3/§4.4 model sketches, §9 Play Buddy, phases 7–8).

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

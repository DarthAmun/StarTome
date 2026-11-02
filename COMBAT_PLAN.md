# Combat Plan: temp HP, stat blocks, rolls, areas, quick add

Status: **approved** (2026-11-02). Your answers are in §7, including the two defaults marked *(default)*. No code has changed. It is based on the five items you listed and the code at `0c45856`.

---

## 0. TL;DR

- **Most of the plumbing exists.** These parts are already there and tested:
  - token HP changes with dying/wounded automation (`stores/encounter.ts` `updateToken` → `withHpEffects` → `rules/turnEffects.ts` `hpChangeEffects`)
  - a stat-block slide-in on the VTT, opened from the token context menu ("View record", `openRecordPanel`)
  - weak/elite stat blocks (`rules/combat.ts` `applyAdjustment`)
  - roll chips in stat-block text (`::dice[…]`) feeding the global dice roller (`useDiceRoll` → `DiceRoller.vue`)
  - degree of success (`rules/dcs.ts` `checkDegree`) and a GM prompt pattern (`TurnPrompts.vue`, `TurnPromptSeed`)
  - circle/square/cone shapes on the map (`useEncounterCanvas.ts`)
  - placing a compendium creature without a library token (`addCreatureToEncounter`, `addCreatureToEncounterAuto`)
- **What's missing, per item:**
  1. **Temp HP**: no field anywhere on tokens. Play Buddy already reports `hp.temp` for linked PCs (`partylink/port.ts` `CharacterMirror`).
  2. **Stat blocks**: reachable only by right-click → "View record". The initiative list (`TurnRail`) has no click at all.
  3. **Rolls**: stat-block numbers (Strikes, saves, skills, Perception, spell DC/attack) are plain text. The dice roller takes only an expression: no label, no MAP, no target, no degree, nothing in the combat log.
  4. **Areas**: shapes are drawings. They aren't saved, they're measured in pixels, not squares, and nothing knows which tokens are inside.
  5. **Quick add**: the creature search is a tab of the right sidebar **that only shows in Prepare mode** (Run mode shows Order | Log there). In Run mode, right-click → "Add token here" only offers library tokens. There's no "empty" token at all.
- **Order** (dependency, then size): **1 Temp HP → 5 Run-mode quick add → 2 Stat blocks from the initiative list → 3 Rolls → 4 Areas + DC effects.** Temp HP is small and every later "apply damage" goes through it. Quick add and stat-block access are small and stand alone. Rolls need the stat block next to the turn order. Areas reuse the roll engine (saves, damage, degree) and the damage path, so they come last.

---

## 1. Item 1: Temp hit points for tokens  *(S)*

### What exists
- `DbEncounterToken` has `hp_current` / `hp_max`; `EncounterToken` has `hpCurrent` / `hpMax`.
- HP goes down in four places: `applyDamage` (context menu), `TokenEditModal` (damage/heal row, and the HP field sent as an absolute `hpCurrent`), `resolvePersistent` (persistent damage prompt) and `applyEffects` (`fx.hpDelta`).
- The player window gets `hpCurrent`/`hpMax` only for party tokens (`utils/playerPayload.ts` `toPlayerToken`); others get `playerHealthState`.

### Rules (both games)
PF2e and SF2e share the rule: temp HP are lost first when you take damage. Healing doesn't restore them, and they **don't stack**: you keep the higher value. Damage that temp HP soak completely leaves real HP alone, so it can't trigger dying or count as a hit at 0 HP. There's no game difference, so no per-game table.

### Changes
- **Schema**: `temp_hp?: number | null` on `DbEncounterToken`. It isn't indexed, so **no Dexie version bump** (same pattern as `is_ally` and `uses_dying`). Old rows read as `null`, i.e. 0.
  - `useDb.encounterTokens.add` passes `temp_hp`; `update` already snake-cases keys.
  - `normalizeToken`: `tempHp: raw.temp_hp ?? 0`. `EncounterToken.tempHp: number`.
  - Writes go through `updateToken`, which builds a fresh `dbUpdates` object. Temp HP is a plain number, but it must stay out of objects that carry reactive arrays (the DataCloneError lesson).
- **Pure functions** in a new `rules/hp.ts`:
  - `damageWithTemp({ hp, temp }, amount) → { hp, temp, absorbed }`
  - `grantTemp(current, amount) → max(current, amount)`
- **Store**:
  - `applyDamage` uses `damageWithTemp`; `hitsAtZero` counts only when real HP took damage.
  - New `setTempHp(tokenId, value)` (direct set) and `grantTempHp(tokenId, amount)` (keeps the higher).
  - `resolvePersistent` and the `applyEffects` hpDelta use the same function, so persistent damage eats temp HP first too.
- **Combat log**: the `damage` entry keeps the total in `value` and gains `absorbed?: number` ("took 12, 5 by temp HP"). New type `'temp-hp'` for gains.
- **UI**:
  - `TokenEditModal`: a "Temp" field beside HP (typing sets it directly). The damage row goes through temp HP. The absolute HP field stays absolute.
  - `EncounterContextMenu`: a "+Temp" input next to "Damage" (keeps the higher).
  - Canvas (`useEncounterCanvas.ts`, the HP ring near line 1127): a second, outer arc in a fixed blue for temp HP.
  - `TurnRail`: a "+5" badge next to HP.
  - Player window: party tokens get `tempHp` in `toPlayerToken`; others don't, and their health state ignores temp HP.
- **Play Buddy PCs** *(default)*: the token's temp HP is set by the GM. When the linked character's mirror reports `hp.temp`, the edit modal shows it as a hint ("Play Buddy: 6") with a one-click "use". No automatic overwrite.
- **Formula scope**: add `temphp` to `buildTokenScope`.

### Tests
- `tests/hp.test.ts` (new): soak fully, soak partly, overflow into HP, healing leaves temp alone, `grantTemp` keeps the higher, a 0-HP token with temp HP takes a hit → no `hitsAtZero`.
- `tests/encounterStore.test.ts`: `applyDamage` with temp HP writes both columns; the log entry carries `absorbed`; dying starts only when real HP reaches 0; persistent damage eats temp HP first.
- `tests/playerPayload.test.ts`: a party token carries `tempHp`, an enemy doesn't.
- `tests/backup.test.ts`: a row with `temp_hp` round-trips; a row without it loads as 0.

---

## 2. Item 5: Add a creature (or an empty token) mid-fight  *(S–M)*

### What exists
- `addCreatureToEncounter(rulesId, x, y, adjustment)` writes a creature-direct token (`token_id = null`) with HP/AC/size from `tokenStats` and the linked image. `addCreatureToEncounterAuto` picks a free square near (5,5).
- The creature search with the weak/normal/elite switch is the right sidebar's Creatures tab, which only exists in Prepare mode.
- Run mode's right-click "Add token here" (`onCtxAddTokenHere`) opens the library-token picker only.
- `rollAllInitiative` rolls for everyone; there's no single-token roll.
- A token with neither `token_id` nor `linked_rules_id` already works: `_resolveTokenDisplays` gives it an empty name, and the label shows instead.

### Changes
- **Extract the creature search** from the sidebar into `components/CreatureSearchList.vue` (search box, weak/elite switch, results, "Place" button). The Prepare sidebar keeps using it.
- **New `components/QuickAddDialog.vue`**, opened in Run mode:
  - from the right-click menu ("Add creature here…"), which places on that square
  - from a "+" button on the initiative list (`TurnRail`), which places on the nearest free square to the active-turn token (the summoner is usually the one acting)
  - from the keyboard: `A`
- The dialog has two tabs:
  - **Creature**: `CreatureSearchList`, a count (1–8, placed on adjacent free squares) and an **Ally** toggle (for summons: `is_ally = 1`, no XP).
  - **Empty token**: name, HP, AC, size, initiative modifier, ally toggle, and an optional image. It writes a token with no library or compendium link. It can later be linked to a stat block with the existing link modal.
- **Initiative**: new tokens **roll** on add. Creatures roll with the encounter's initiative formula (`initiative_formula`, Perception by default) through the existing formula scope. Empty tokens roll d20 + the typed modifier. The value is editable as before. A new store action, `rollInitiativeFor(tokenIds)`, shares the code with `rollAllInitiative`.
  - Adding mid-round mustn't move the turn pointer: `initiativeOrder` re-sorts. The existing watcher keeps `_activeTurnTokenId`, and a test pins that.
- **Visibility**: tokens added in Run mode arrive **visible** (you place them when they appear). Prepare-mode adds stay as today.
- **Store**: `addCreatureToEncounter` gains `{ count, ally, rollInitiative }` options and returns the new tokens. A new `addBlankToken(data, gridX, gridY)` covers empty tokens. Both log a `note` entry ("Wolf joined the fight").

### PF2e vs SF2e
None in the logic. The search shows the campaign's game first, as today (`otherGameTag`).

### Tests
- `tests/encounterStore.test.ts`:
  - adding N creatures places them on distinct free squares near the anchor
  - weak/elite HP; `ally` sets `isAlly`
  - initiative is rolled with the formula (seeded RNG)
  - the active turn stays on the same token after an add with a higher initiative
  - empty tokens get label/HP/AC and no links
- `tests/combat.test.ts`: single-token initiative uses the same scope as `rollAllInitiative`.

---

## 3. Item 2: Stat blocks from the initiative list  *(S)*

### What exists
- `recordPanel` in `pages/encounter/[id]/index.vue` (around line 1191): one slide-in, opened from the context menu's "View record". The page is 3,700 lines, so new UI goes into components.
- `RulesStatBlock` renders any entry; `applyAdjustment` gives weak/elite numbers.
- `NpcCard` exists for tokens linked to a campaign NPC.

### Changes
- **Extract the slide-in** into `components/StatBlockPanel.vue`. It takes a token id (not just a rules id), so it can show live state.
  - **Header**: the token's label, HP / temp HP, AC and conditions, updated live from the store.
  - Under it: the adjusted `RulesStatBlock`.
- **Click a name in the initiative list** (`TurnRail`) to open that token's block. Clicking the same name again closes it; clicking another switches. One block at a time, as you picked; no tabs.
- The context-menu "View record" opens the same panel.
- **Tokens without a stat block**:
  - NPC-linked → `NpcCard` in the panel
  - Play Buddy PC → its mirror (AC, saves, Perception, HP) when shared
  - otherwise → a "Link a stat block" button (the existing link modal)
- GM-only; nothing goes to the player window.

### Tests
- A small unit test for picking the panel content (rules entry / NPC / PC mirror / nothing).
- Manual check in the dev server (`startome-dev`, port 3001): open from the rail, switch tokens, HP updates live after damage.

---

## 4. Item 3: Rolling from stat blocks  *(M–L)*

### What exists
- `DiceRoller.vue` parses an expression into a pool (d4…d100 + flat), rolls, and keeps 8 results. The caller can't pass a label; it has no crit doubling and no "vs AC".
- `useFormulaEvaluator.ts` and `useCommandPalette.ts` each have their own dice roller as well.
- `RulesStatBlock` turns `::dice[...]` chips into `.roll-ref` spans.
- `Strike { name, range, bonus, traits, damage[{formula, type}], effects }`. Saves, skills, Perception and spellcasting DC/attack are numbers on `Creature`. Hazards have strikes and saves too.

### Changes
- **One roll engine**, pure and testable: `rules/rolls.ts`
  - `rollExpression(expr, rng)` → `{ total, terms }`. DiceRoller, the formula evaluator and the command palette move onto it.
  - `check({ label, modifier, dc?, rng })` → `{ d20, total, degree? }` using `checkDegree`.
  - `strikeModifier(strike, mapStep: 0 | 1 | 2)`: MAP −5/−10, **agile −4/−8**.
  - `strikeDamage(strike, degree, rng)`: success = normal, critical success = **doubled**, with `deadly-dX` / `fatal-dX` on crits.
- **Clickable numbers in `RulesStatBlock.vue`**:
  - The Strike bonus becomes three small buttons (`+12 / +7 / +2`) and the damage becomes a roll.
  - Each save, Perception, each skill and the spell attack are clickable too.
  - They carry structured data (`data-roll-kind="strike" data-index="0"`), not just an expression.
  - Off the VTT (compendium, GM screen) the same clicks make plain labeled rolls.
- **Roll requests**: `useDiceRoll` grows from a `pendingRoll` string into `requestRoll(RollRequest)` with `{ label, kind, modifier | expr, sourceTokenId?, targetTokenId? }`. The dice panel shows the label.
- **Targets on the VTT**: the selected token(s) other than the roller are the targets.
  - An attack shows "Critical hit / Hit / Miss / Critical miss" against the target's AC, then a **Roll damage** button, doubled on a crit.
  - The damage result has **Apply**, plus **½** and **×2** (through temp HP, logged). Nothing applies without that click.
- **Weak/elite**: the panel shows the adjusted block, so clicks use the adjusted numbers (`applyAdjustment` already bumps strikes and saves).
- **Combat log**: new entry type `'roll'` with `{ label, total, degree?, targetName? }`. Rolls are GM-only: the player window never gets them.
- **Resistances and weaknesses**: not applied in v1. The GM adjusts the number before clicking Apply. The damage type is shown next to the result to help.

### PF2e vs SF2e
- MAP, degrees and crit doubling are the same.
- Crit traits live per game in `rules/registry.ts` (`GAME_RULES[game].critTraits`): PF2e `deadly`, `fatal`. SF2e shares both; the per-game list lets it diverge.
- Spellcasting DC/attack: same in both games.

### Tests
- `tests/rolls.test.ts` (new, seeded RNG):
  - expression parsing (`2d6+1d4-1`, `d20`, `D8`)
  - MAP and agile
  - degree vs AC incl. natural 1/20
  - crit doubling, deadly and fatal
  - weak/elite strike numbers
- `tests/encounterStore.test.ts`: applied damage goes through temp HP and logs `'roll'` and `'damage'`.
- One component test: a Strike renders its three MAP buttons with the right numbers (agile and non-agile).

---

## 5. Item 4: Areas with DC effects, incl. lingering areas  *(L, two commits)*

### What exists
- `ShapeOverlay { id, type: circle | square | cone, anchorCol/Row, endCol/Row, colorHex }`, drawn and hit-tested in pixels in `useEncounterCanvas.ts`. Shapes live only in the page's `shapes` ref and the player window; **they're gone on reload**.
- Foundry text converts `@Template[burst|distance:20]` to "20-foot burst" and `@Check[reflex|dc:22|basic]` to "DC 22 basic Reflex" (`converters/foundry/text.ts`), so the structure is lost before it reaches a stat block.
- `Spell.area` (string) and `Spell.defense { save, basic } | { ac }`.
- Turn automation already raises prompts at turn start (`tickTurnStartTimers`, `TurnPrompts`).

### What it does
An **area** is a new map tool next to the existing shapes, which stay as free drawings, as you chose. An area can carry an **effect**:
- a save (Fort/Ref/Will) and a DC
- optional damage (formula + type), **basic** or not
- optional conditions per degree (e.g. critical failure → frightened 2)

The flow:
1. **Place it** by hand (area tool) or from a stat block: a spell or ability with an area and a save gets a **Place area** button that fills in shape, size, DC and damage.
2. StarTome **lists the tokens inside**.
3. **Save prompt**: one row per token with its save modifier, taken from the linked stat block, the Play Buddy mirror, or blank. **Roll all** rolls the NPCs; for PCs you type the d20 or the total the player tells you.
4. Each row shows the degree. Damage is rolled **once** for all targets (the PF2e rule) and split by degree for basic saves: crit success 0, success ½ (rounded down), failure full, crit fail ×2. Per-degree conditions are added. **Apply all** goes through temp HP and is logged.
5. **Lingering**: an area can stay with its effect and a trigger, *enters*, *starts its turn in* or *ends its turn in*, plus an optional end round. The turn automation then raises the same save prompt for that token. A token moved into the area raises an "enters" prompt.

### Changes
- **First commit: grid-correct area math and persistence**
  - **`rules/areas.ts`** (pure, canvas-free, unit-tested):
    - shapes: **burst** (from a grid intersection, radius in feet), **emanation** (from a creature's edges, so size matters; can follow a token), **cone** (quarter circle from a corner or edge, in 8 directions), **line** (5 ft wide)
    - distance with **alternating diagonals** (5/10/5), as PF2e movement
    - `cellsInArea(area)` → set of `col,row`
    - `tokensInArea(area, tokens)`: a token is in if **any** of its squares is
    - a square counts when its center is inside the area *(default; matches Foundry's targeting)*
  - **Canvas**: areas draw as shaded squares from `cellsInArea`, so what you see is exactly who's affected. The old shapes keep their own tool and code.
  - **Persistence**: a non-indexed `areas?: AreaOverlay[]` on `DbEncounter`, added to `VALUE_COLUMNS.encounters` with fallback `[]` (no version bump; `rowValues` handles old JSON text). Write it with `toPlain(...)`, as `updateToken` does for conditions, to avoid DataCloneError.
    - `AreaOverlay { id, kind, origin, sizeFt, direction?, attachedTokenId?, color, label, effect?: AreaEffect, lingering?: { trigger: 'enter' | 'turn-start' | 'turn-end'; untilRound?: number } }`
    - `AreaEffect { save: 'fort' | 'ref' | 'will', dc, basic, damage?: { formula, type }[], onDegree?: Partial<Record<Degree, { condition: string; value: number | null }[]>> }`
  - **Player window**: areas show as shapes only. Effect, DC and results stay GM-only, through a new `toPlayerArea()` in `utils/playerPayload.ts`.
- **Second commit: effects, prompts and lingering**
  - **`components/AreaSavePrompt.vue`**, a panel beside `TurnPrompts` in the same visual language. It uses `rules/rolls.ts` (item 3) and `damageWithTemp` (item 1).
  - **`rules/turnEffects.ts`**: a new `TurnPromptSeed` kind, `{ kind: 'area-save', areaId }`, raised at turn start/end for tokens inside a lingering area. `moveToken` raises it for "enters". Expired areas (`untilRound`) are removed when the round advances.
  - **From stat blocks**:
    - Spells: parse "20-foot burst", "30-foot cone", "60-foot line" and "10-foot emanation" from `Spell.area`; the DC comes from the caster's spellcasting entry.
    - Ability text: `converters/foundry/text.ts` keeps `@Template` / `@Check` as a structured chip (e.g. `::area[burst 20|reflex 22 basic]`), which renders as the same text plus a button. **Existing data needs a Foundry re-sync** to show the chips *(default: do it; the text reads the same without a re-sync)*.

### PF2e vs SF2e
- Area shapes, saves and degrees are the same.
- SF2e weapons have area traits (`area-burst`, `area-cone`, `area-line` with a size) and `automatic`. **Place area** also appears on SF2e Strikes with such a trait, using the Strike damage as a basic Reflex save. Confirm the save-DC rule against SF2e Player Core while building it (class DC vs. a weapon-based DC; creature stat blocks state it in the ability text). PF2e Strikes never get the button.
- These traits live per game in `GAME_RULES[game].areaWeaponTraits` (empty for PF2e).

### Tests
- `tests/areas.test.ts` (new):
  - burst radius 10/15/20 ft (exact cell counts against the PF2e area diagrams)
  - cones in 8 directions; lines incl. diagonals
  - emanation for a Medium and a Large token, following the token
  - a Large token partly inside counts
  - alternating diagonals
- `tests/rolls.test.ts`: basic save damage per degree, halving rounds down (check the minimum-damage rule against Player Core while implementing), one damage roll shared by all targets.
- `tests/turnEffects.test.ts`: lingering turn-start/turn-end prompts only for tokens inside; expiry by round.
- `tests/encounterStore.test.ts`:
  - areas persist and reload
  - moving a token into a lingering "enters" area raises the prompt
  - results apply through temp HP and add per-degree conditions
- `tests/foundryText.test.ts`: `@Template` / `@Check` become `::area[...]` chips, and the rendered text is unchanged.
- `tests/playerPayload.test.ts`: player areas carry no effect data.
- `tests/backup.test.ts` / `tests/dbMigration.test.ts`: old encounters without `areas` load as `[]`; JSON-text `areas` from files is parsed.

---

## 6. Order and size

| # | Item | Size | Needs |
|---|------|------|-------|
| 1 | Temp HP | S | — |
| 2 | Run-mode quick add (creature or empty token) | S–M | — |
| 3 | Stat blocks from the initiative list | S | — |
| 4 | Rolls from stat blocks | M–L | 1 (apply damage), 3 (panel next to the turn order) |
| 5 | Areas + DC effects + lingering | L | 1, 4 (roll engine, degrees, damage) |

Items 1–3 are independent and could run in parallel (2 and 3 both touch `TurnRail.vue` and the encounter page, so not at the same time in one checkout). Items 4 and 5 are sequential. One commit per item; item 5 is two.

---

## 7. Decisions (2026-11-02)

1. **Temp HP**: gaining more keeps the higher (RAW); typing in the Temp field sets it directly. Damage eats temp HP first.
   - Play Buddy PCs *(default)*: the GM sets it; the mirror's value is offered as a hint, never auto-applied.
2. **Stat-block access**: click a name in the initiative list. One block at a time, with a live HP/conditions header. The context-menu entry stays.
3. **Rolls**: in the dice panel and the combat log, GM-only. With a selected target: degree vs AC, "Roll damage", then an explicit **Apply** (½ / ×2 available).
4. **Resistances/weaknesses**: by hand for now; the damage type is shown.
5. **Quick add** (your own wording): mid-fight, search the creature list and add the new enemy or summon, or add an empty token. Done from Run mode on the VTT, not from the compendium. New tokens roll initiative on add.
6. **Areas + DC**: save prompt with damage by degree, **plus lingering areas** that prompt on enter / turn start / turn end.
7. **Old shapes**: kept as free drawings; areas are a separate tool.
8. **Foundry chips** *(default)*: `@Check` / `@Template` become clickable area chips; needs a re-sync to show up in existing data.

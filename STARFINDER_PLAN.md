# Starfinder 2e Plan: Tech Core, starships and space combat

Goal: StarTome covers everything a GM needs for an SF2e campaign that uses **Tech Core**: tech gear, augmentations, vehicles, a crew starship and **tactical starship combat**, including putting characters on the ship's battle stations.

Measured on 2026-11-07 against the SF2e Foundry release in `json-assets.zip` (Nov 7 build) and the Tech Core PDF (266 pages).

---

## 1. Where we stand

### Already covered by the Foundry sync

Foundry ships **1,109 Tech Core documents**. The converter already handles all of these:

| Content | Count | Notes |
|---|---|---|
| Classes | 2 | Mechanic and Technomancer, with class features and subclass choices |
| Ancestries / heritages / backgrounds | 3 / 19 / 16 | Sro, verthani, cyborg (+ living hologram heritages) |
| Feats | 323 | Includes the augmented, vehicle pilot, grenadier and other archetypes |
| Spells | 98 | |
| Equipment | ~480 | 131 augmentations (`usage: implanted`), 58 armor and 33 weapon upgrades, 45 grenades, 95 weapons, 21 armor, 19 shields |
| Actions | 34 | Including Hack and Reposition Exocortex |
| Starship hazards | 24 | Black Hole, Asteroid Field, Orbital Mine Field …, all with the `starship` trait. They come in as normal hazards. |

### Not covered

| Gap | Why it's missing |
|---|---|
| **Vehicles** (41 in Foundry, 29 from Tech Core) | The `vehicle` actor type isn't converted ([packs.ts](converters/foundry/packs.ts) `CONVERTED_TYPES`). |
| **Augmentations as installed body gear** | They're plain equipment. Nothing marks them as implanted in a character, and the Player Core limits (p. 288) aren't checked. |
| **Upgrade slots by grade** | Open since [FEATURES_PLAN.md](FEATURES_PLAN.md) (attachments): upgrades attach without a limit. The rules are in Player Core (p. 236, p. 267). |
| **Installed weapons** | One per host item, can't go above the host's grade. Not modelled. |
| **Area Fire / Auto-Fire** | No shortcut from a weapon or strike to the area tool and save prompt. |
| **Drones and robot companions** | A party member can be a "companion", but there's no companion stat block that levels with the Mechanic. |
| **Everything about starships** | Foundry has **no** frames, battle stations, station actions, starship weapons, station upgrades, expansion bays, starship conditions or enemy starships (~70 in the book). All of it has to come from the book. |

### Rules sources

- Tech Core ch. 6 "Tactical Starship Combat" (pp. 164–199) and ch. 7 "GM's Arsenal" (pp. 200–255). Page 260 has the starship sheet.
- Player Core for upgrade slots, installed weapons, augmentations and the weapon improvement table.
- As before ([FEATURES_PLAN.md](FEATURES_PLAN.md) §9): **every rules table is checked against Archives of Nethys** and marked `verified` only after that. Tables that AoN doesn't have yet are entered from the book and stay `verified: false`.

### Data and copyright

Book content (enemy starships, station actions, upgrades, expansion bays) is **not committed to the repo**. It's imported locally as a homebrew pack (`publication.title: "Tech Core (local)"`) with the `startome-homebrew-import` skill, the same way other homebrew is imported. The repo only gets:
- the types, converters and UI,
- the numeric rules tables the engine needs (frame stats by level, battle station grades), entered like the GM Core tables already are,
- test fixtures with invented sample ships.

---

## 2. Phase overview

| Phase | What | Depends on | Size |
|---|---|---|---|
| ~~**P0**~~ | ✅ Done 2026-11-07: re-synced and checked the Tech Core content | — | S |
| ~~**P1**~~ | ✅ Done 2026-11-07 (0.29.0): upgrade slots, installed weapons, augmentations, Area Fire / Auto-Fire | P0 | M |
| ~~**P2**~~ | ✅ Done 2026-11-07 (0.30.0): vehicles and companions (drones, robot and animal companions) | P0 | M |
| ~~**P3**~~ | ✅ Done 2026-11-07 (0.31.0): starship data model, homebrew format, book import | — | L |
| ~~**P4**~~ | ✅ Done 2026-11-07 (0.32.0): player starship sheet and crew roster (station assignments) | P3 | M |
| ~~**P5**~~ | ✅ Done 2026-11-07 (0.33.0): ship interior map, battle stations on the map, helming, station actions | P4 | M |
| ~~**P6**~~ | ✅ Done 2026-11-07 (0.34.0): sensor map (a row of zones), headings, ship tokens, zone areas | P3 | L |
| ~~**P7**~~ | ✅ Done 2026-11-07 (0.35.0): starship combat engine: damage, shields, conditions, compromised, hull integrity | P5, P6 | L |
| ~~**P8**~~ | ✅ Done 2026-11-07 (0.36.0): encounter builder and resolution for starship encounters | P7 | S |
| ~~**P9**~~ | ✅ Done 2026-11-07 (0.37.0): starship exploration and downtime | P4 | S–M |
| **P10** | Play Buddy SF2e support (StarTome side + the spec for Play Buddy) | P4, Play Buddy | M |

P1/P2 and P3 don't depend on each other and can run side by side. P5 and P6 can also run side by side once P3/P4 are in.

---

## P0. Re-sync and check (S) ✅ done 2026-11-07

- Sync the Nov 7 SF2e release ZIP.
- Check in the compendium:
  - Mechanic and Technomancer class pages show features by level and the subclass choices (Mechanic: drone / exocortex; Technomancer: programming paths).
  - Augmentations, upgrades and grenades show their grade variants and prices in credits.
  - The 24 starship hazards show up and are tagged `starship`.
- Fix whatever the converter report flags. Bump `CONVERTER_VERSION` if a fix changes the output.
- **Done when:** the sync report has no new Tech Core issues, and `foundryFull.smoke.test.ts` passes on the new release.

---

## P1. Gear gaps (M) ✅ done 2026-11-07 (0.29.0)

**Built:** `rules/sf2eGear.ts` (pure) holds the improvement tables (extra slots and tracking by grade), the armor table's base slots (weapons default to 1, archaic to 0; the GM can set any host's base under Details), "one fewer upgrade slot" fusions, the four-augmentation limit (apex and exempt ones free) and the Area Fire / Auto-Fire shapes. Slot limits **warn instead of blocking**, like the rune warnings (the GM decides). Installed weapons are a new attachment kind (`installed`, sent to Play Buddy as `upgrade`). Augmentations are implanted with `inventory.implanted` (non-indexed, no Dexie bump); an implanted entry can't move or stack. Creature strikes keep `rangeIncrement` (converter v6, also in the homebrew format), and creature Area Fire / Auto-Fire use DC 10 + the Strike bonus (= class DC + tracking). Tables are from the Player Core PDF, `SF2E_GEAR_VERIFIED = false`. Checked in the browser on homebrew test items. Tests: `tests/sf2eGear.test.ts`.


### P1.1 Upgrade slots by grade
- `GAME_RULES.sf2e.upgradeSlots`: slots per grade for weapons and armor (Player Core p. 236 / p. 267), checked on AoN.
- `rules/attachments.ts`: `upgradeSlotsOf(host)` and `canAttach` refuse a new upgrade when the host is full. Items whose text says "using no upgrade slot" (built-in upgrades such as Hellknight plate's spikes) don't count.
- Items whose description says "one fewer upgrade slot than usual" get a slot modifier when converted.
- The inventory shows "Upgrades 1/2" on the host.

### P1.2 Installed weapons
- Weapons with the `installed` trait attach to the host type named in the trait, one per host.
- Their grade can't go above the host's grade. Show a warning instead of blocking, since the GM decides.

### P1.3 Augmentations
- New attach target: a **character** (not an item). An `implanted` item can be installed in a character from the party inventory.
- Store it as an inventory entry with `attachKind: 'augmentation'` and `attachedTo: <character>`. It keeps its own price, so wealth totals need no special case.
- Show the character's augmentations on the party page with the Player Core limit check (p. 288; read the exact rule there before building it). The limit is a warning, not a block.
- Biotech, cybernetic, necrograft and magitech are just traits to filter by.

### P1.4 Area Fire and Auto-Fire
- On a stat block or inventory weapon with the `area-*` or `automatic` traits, add an **Area Fire** / **Auto-Fire** button.
- It opens the existing area tool (`rules/areas.ts`) with the shape and size from the trait (burst, cone, line), and the save prompt (`AreaSavePrompt`) with a basic Reflex save against the class DC (PCs) or the listed DC (creatures).
- Damage comes from the weapon's damage; the `unwieldy` trait limits it to once per round (reminder only).

**Tests:** slot counting with built-in and "one fewer slot" upgrades, installed weapon rules, augmentation limit warnings, Area Fire shape parsing from traits.

---

## P2. Vehicles and companions (M) ✅ done 2026-11-07 (0.30.0)

**Built:**
- **Vehicles:** compendium kind `vehicle` (segment `vehicles`), converted from Foundry `vehicle` actors (converter v7; price is a plain number in credits for SF2e, gold for PF2e), homebrew shape, editor section and stat block. Vehicles stand on the map with their AC, HP, size and Fortitude (area saves), and are left out of the XP meter and resolution (their crew counts). Golden test on Talon Strike Craft. **Not done:** vehicles in the party inventory (the inventory links `item` entries only); add one as a free-text entry with its price for now.
- **Companions:** `rules/companions.ts` (pure) builds a stat block from a type's base statistics and its stage (young/commercial → mature/tactical → burly or deft/advanced → specialized/superior, the six specializations, the robot construct rules and the customizations that change numbers). The type's base numbers are entered by the GM in the companion dialog on the party page (no book data in the repo). `useParty` writes the stat block as a homebrew creature in the "Companions" pack, keeps it at the character's level on every load, and links the character's library token to it. `COMPANIONS_VERIFIED = false`. Tests: `tests/companions.test.ts`.


### P2.1 Vehicles
- New compendium kind `vehicle` (segment `vehicles`) with these fields:
  - AC, Fortitude, Hardness, HP, immunities, resistances and weaknesses
  - collision DC and collision damage
  - crew, passengers, piloting check, space (long × wide × high), speed text, price
- Converter: the Foundry `vehicle` actor → `vehicle`. Add `vehicle` to `CONVERTED_TYPES` (the separate `vehicles` pack name stays skipped). Bump `CONVERTER_VERSION`.
- A vehicle can be a VTT token with HP and AC like a hazard. It counts for no XP unless the GM sets it as an enemy.
- Vehicles can go into the party inventory as owned gear (price and level).
- Chases stay as they are in GM Core and aren't part of this plan.

### P2.2 Drones and robot companions
- A companion character gets an optional **companion type**: `drone` (Mechanic) or `robot` (Tech Core "Companions", p. 72).
- The companion stat block is computed from the owner's level and the companion's chosen upgrades, using the base tables in Tech Core (entered as rules tables and checked).
- Its token in the VTT uses that stat block. Upgrades are taken from the synced class features and feats, like Advanced / Tactical / Superior Drone.

**Tests:** vehicle golden test against a pinned Foundry document; drone stats at levels 1, 5, 10 and 20.

---

## P3. Starship data model (L) ✅ done 2026-11-07 (0.31.0)

**Built:**
- Five compendium kinds in a "Starships" sidebar group: `starship`, `starshipFrame`, `battleStation`, `stationUpgrade` (also starship weapons and drones), `expansionBay`, with factory defaults, homebrew shapes (zones as numbers or "3 zones"), stat blocks and editor sections (JSON fields for the tables). **Change from the plan:** station actions live inside their battle station entry (`actions[]` with a `grade`), not as separate `action` entries, so a station is one self-contained entry; the two actions any station can use (Jump Start, Repair Station) are `action` entries with the `station` trait. Starship spells (magic conduit) are `spell` entries.
- `rules/starships.ts`: frame statistics by level, station grade and actions by level, helmed bonuses, sensor range, starship immunities, zone parsing. The tables themselves live in the imported entries.
- Starship conditions (compromised, wrecked, inoperable, off-kilter, malfunctioning) are built-in SF2e conditions (group `starship`).
- **Book import:** `scripts/techcore/build.sh "<Tech Core PDF>"` reads the PDF (column-aware via `pdftotext -bbox-layout`) and writes `local/tech-core-startome.json` (git-ignored): 71 starships, 3 frames, 6 battle stations, 54 upgrades/weapons/drones, 9 expansion bays, 4 starship spells, 2 station actions. It imports with 2 small fixes. The Bulwark table was compared with Archives of Nethys (it has Tech Core since 2026-10-07) and matches; the rest is parsed text and may need small edits in the editor (a few captions and sidebar fragments end up in action texts).
- Tests: `tests/starships.test.ts`.


### P3.1 New compendium kinds (types/rules.ts)

| Kind | Segment | What it holds |
|---|---|---|
| `starship` | `starships` | Enemy and NPC starships (stat block, below) |
| `starshipFrame` | `starship-frames` | Bulwark, explorer, skirmisher: size, traits, default battle stations with built-in upgrades, slots, stats by level |
| `battleStation` | `battle-stations` | Pilot's console, gunnery, generator, scanners, magic conduit, drone console, engine room …: helmed bonus and upgrade limit by grade, station actions by grade |
| `stationUpgrade` | `station-upgrades` | Upgrades for one station type, and **starship weapons** (martial/advanced ranged starship weapons) with zone range, damage, traits |
| `expansionBay` | `expansion-bays` | Medical bay, science lab, holo den, crew quarters (bunks → extravagant), escape pods …: downtime and exploration benefits, whether it takes a bay slot |

Station actions are ordinary `action` entries with the `station` trait plus a `station` field (which battle station grants them, from which grade). That way they work in the existing action views and search.

```ts
interface Starship extends RulesEntityBase {
  kind: 'starship'
  size: Size
  perception: number
  sensorRange: number              // zones
  skills: Record<string, number>
  abilities: Record<AbilityKey, number>
  ac: number
  saves: { fort: number; ref: number; will: number }
  hp: number                       // Hull Points
  shields?: { max: number; fortify: number }   // SP and the generator's restore value
  immunities: string[]             // 'starship immunities' expands via the registry
  weaknesses: Weakness[]; resistances: Resistance[]
  speed: number                    // zones
  battleStations: { station: string; actions: string[]; weapons?: string[] }[]
  strikes: StarshipStrike[]        // range in zones, range increment, area fire / auto fire DCs
  actions: StatAction[]            // abilities, linked to a station where the book does
  living?: boolean                 // living starships: organs as stations, other immunities
}
```

- `starship` levels use the creature XP table (Tech Core p. 206: treat starships as creatures).
- `GAME_RULES.sf2e.starshipImmunities`: bleed, death effects, disease, drained, fatigued, paralyzed, poison, sickened, spirit, vitality, void; never doomed or unconscious.
- **Starship conditions** become built-in SF2e conditions with the `starship` group: compromised (valued), wrecked (valued), inoperable, off-kilter, malfunctioning (on stations). They're seeded like the condition catalog's built-ins, since Foundry doesn't have them.
- New trait descriptions: `bypassing`, `starship`, `station`.

### P3.2 Homebrew format and import
- Extend [HOMEBREW_FORMAT.md](HOMEBREW_FORMAT.md) and `rules/homebrew.ts` with the five new kinds and their validation and fixes, e.g. "3 zones" → `3`, "HP 32; SP 10 (fortify 5)" → `hp` / `shields`.
- Update the `startome-homebrew-import` skill so it can turn Tech Core chapter 6 and 7 pages into a `Tech Core (local)` pack.
- The compendium gets a **Starships** group in the sidebar with the five kinds. The stat block renders like the book's (Perception; Sensor Range, Battle Stations line, HP; SP (fortify), Speed in zones).

### P3.3 Rules tables
- `rules/starships.ts` (pure): frame stats by level (HP, SP, AC, saves, Speed, sensor range), battle station grade by starship level, helmed bonuses and upgrade limits. These are entered from the book or AoN and marked `verified` per §1.
- `starshipStatsAt(frame, level)` and `stationGradeAt(level)`.

**Tests:** homebrew validation for each new kind (good file, file with fixable slips, unreadable entry); stats-by-level edge cases (levels 1 and 20); a stat block snapshot for an invented sample starship.

**Done when:** the book's ships, frames, stations, upgrades and bays are in the local pack and readable in the compendium.

---

## P4. Player starship sheet and crew roster (M) ✅ done 2026-11-07 (0.32.0)

**Built:** Dexie v18 `starships` table (in campaign delete, export/import with crew, presets and interior encounter remapped; `useStarship` is its only writer), `rules/playerStarship.ts` (sheet at a level, slots from a frame, crew assignment rules, exploration activities, suggested initiative skill per station, level-up changes) and the **Starship** page (sidebar link in SF2e campaigns). A new ship gets the frame's default stations with their built-in upgrades and the three universal bays. Station weapons don't use upgrade slots; a gunnery holds one (two with Secondary Armaments). Party members get optional `sf_skills` (decision 3). **Not done here:** the level-up dialog doesn't list the ship's changes; the Starship page shows them under "New at level N" instead. Tests: `tests/playerStarship.test.ts`, backup round-trip.


### P4.1 The campaign's starship
- New table `starships` (Dexie v18): `campaign_id, name, frame_id, level_mode ('party' | number), stations[], expansion_bays[], hp_current, sp_current, conditions[], interior_encounter_id?, notes, img`.
  - `stations[]`: `{ slot: 1..6, station_id, default: boolean, upgrades: string[], marker?: { x, y } }`. The default stations come from the frame and can't be removed.
- A campaign can have more than one starship (the crew might steal one). One is marked **active**.
- New campaign page **Starship** (`pages/campaign/[id]/starship.vue`), shown only in SF2e campaigns. It mirrors the book's starship sheet (p. 260):
  - name, frame, level (follows the party level unless pinned), HP / SP / AC / saves / Speed / sensor range, all computed from the frame
  - 6 station slots with their grade, helmed bonus and upgrades, checked against the upgrade limit
  - 4 expansion bays (crew quarters, lounge and mess bay are free for Medium+ ships)
  - current HP / SP and conditions, editable outside combat
- When the party levels up (the existing LevelUpDialog), the ship levels up too and the sheet lists what changed (new grade, new upgrade slots), like the class "what's new" list.
- The ship is in the campaign export/import and the backup ([CAMPAIGN_FORMAT.md](CAMPAIGN_FORMAT.md)).

### P4.2 Crew roster: putting characters on stations
This is the "characters on stations" feature. It has two parts: a standing assignment outside combat, and the live position during combat (P5).

- On the Starship page, a **Crew** panel shows each battle station as a card. Drag a party member (PC or companion, from the party roster) onto a station card, or pick one from a dropdown on the card.
  - One character per station; a character is on at most one station.
  - Characters not on a station are listed as "Free crew" (boarding defense, repairs, anything else).
- Each assignment also stores the character's **starship exploration activity** (Active Maneuvers, Lock and Load, Power Up, Scan for Magic, Operate Drone …), because that decides where they start a starship encounter and what bonus they start with (Tech Core p. 174).
- The card shows what the character gets there: the station's actions at its current grade, its helmed bonus, and the skill they'd roll for initiative from that station.
- Suggestions only, no blocking: the card can show the relevant skill modifier when the character is linked to Play Buddy or has it entered.
- **Station presets**: save the current assignment as a named preset ("Dogfight", "Stealth run") and switch between them in one click.

**Tests:** ship stats follow the party level, default stations can't be removed, upgrade limits per grade, one-character-per-station rule, presets round-trip through export/import.

---

## P5. Ship interior map and helming (M) ✅ done 2026-11-07 (0.33.0)

**Built:** encounters get a `starship` record (`role: 'interior' | 'battle'`, station markers). The ship's interior is an encounter (create one or use an existing one from the Starship page); its markers live on the ship (decision 2). **Change from the plan:** stations are placed in the VTT's **Stations panel** (click Place, then a square; it borrows the area tool's click) rather than in the map maker, so the map maker stays a pure tile editor; markers are drawn as coloured squares through the area overlay. `useStarshipEncounter.startStarshipBattle` copies map, map maker tiles, walls and non-PC tokens, copies the markers, and puts each crew member's token on their station (free crew next to the first station; a character without a library token gets one). Helming is derived from positions (`helmingTokens`: on the square, not dead or unconscious, first wins), so moving a token on or off a station is the live assignment; "Save positions as crew" writes it back to the roster. In Run mode the panel shows the current turn's station, grade, actions and suggested initiative skill, and the ship's AC/saves with helmed bonuses. **Not done:** initiative isn't rolled with the station skill automatically (the panel names the skill; enter the roll by hand). The pack builder now splits Frequency/Requirements from the text and drops image captions.


### P5.1 Battle stations on the battle map
- The map maker gets a **Battle station** marker: place a marker per station slot on the ship's interior map. It's stored in `starships.stations[].marker` and drawn as a labeled square (number + station icon) on the map and in the player window.
- The ship's interior map is a normal encounter map (`interior_encounter_id`), so walls, doors, fog and assets all keep working. A starship encounter copies it.

### P5.2 Starting positions from the crew roster
- When a starship encounter starts, each assigned character's token is placed **on their station's square**, and unassigned crew in a free spot near the pilot's console or wherever the GM drags them.
- In the encounter's crew sidebar, drag a character onto a station to move their token there. Moving a token onto or off a station square in the VTT updates the live assignment the same way.
- At the end of the encounter, the GM can keep the live positions as the new standing assignment or go back to the preset.

### P5.3 Helming
- A token **helms** a station while it stands on the station square, has a free hand (reminder only) and isn't unconscious. Only one token per station.
- On the helming token's turn, the turn rail shows a **Station actions** panel with the station's actions at its grade, plus its passive helmed bonus. Malfunctioning stations show their actions greyed out, with the Repair Station action highlighted.
- The ship's AC and saves include the helmed bonuses of the stations that are helmed right now (e.g. a superior pilot's console gives +1 to Reflex).
- **Initiative:** a token starting at a station can roll that station's skill instead of Perception, shown as a choice in the initiative roll.

**Tests:** helming detection (on/off the square, unconscious, two tokens), bonuses summed only from helmed stations, start positions from the roster.

---

## P6. Sensor map (L) ✅ done 2026-11-07 (0.34.0)

**Built — and a correction to the plan below:** the book's sensor map (Tech Core pp. 170–171, its area diagrams) is a **row of zones**, not a 2D graph; headings point left or right, cones and lines run along the row, emanations spread both ways and bursts start on the border between two zones. (The "12-zone / 15-zone" captions on p. 168 belong to the starship *interior* map examples.) So there are no built-in layouts or layout editor: a battle has `sensor_map.zones` (12 by default, 3–30).
- `rules/sensorMap.ts` (pure): distance, range, off-guard from behind, cone / line / emanation / burst zones (burst range check), targets (a cone never hits its source), and "3-zone cone" parsing.
- Ships and hazards on the sensor map are **encounter tokens with a zone** (`sensor_zone`, `sensor_heading`, `sensor_role`, `shield_points`, `shield_max`), so initiative, HP, conditions, the stat panel and the combat log work unchanged; the battle map, FOV, map areas and helming skip them. The party's ship is one too (no initiative of its own, left out of the turn order and "roll all initiative"); a new battle puts it in zone 3.
- `SensorMapPanel` (GM) above the interior: zone count, add starships and starship hazards from the compendium, drag between zones, turn, ◀ ▶, HP/SP, hide, stat block, remove; the selected ship's sensor range and rear zones are tinted; zone areas list their targets and open the existing save prompt (a hidden area carries the effect). `SensorTrack` is shared with the player view, which gets visible sensor tokens with a health word for enemies and the party ship's HP/SP. Tests: `tests/sensorMap.test.ts`.
- **Not done:** zone terrain (cover from asteroids) is GM narration for now; line areas list every ship in the covered zones and the GM unticks extra ones in the save prompt.


The sensor map is a second view of the same encounter, next to the interior map.

### P6.1 Model
- New encounter fields: `mode: 'character' | 'starship'` and `sensor_map: { layout: '12' | '15' | 'custom', zones: Zone[], adjacency, ships: SensorToken[], areas: ZoneArea[] }`.
- `Zone`: id, label, position on the drawing, optional terrain (asteroids → cover, nebula …).
- `SensorToken`: a ship or starship hazard in a zone, with a **heading** (one of the zone directions), HP/SP, conditions, and `side: 'party' | 'enemy' | 'neutral'`. Any number of tokens can share a zone.
- `rules/sensorMap.ts` (pure): zone distance, whether a target is in range, whether an attack comes from behind (opposite the heading → off-guard; same zone always counts as in front), and the zones a cone, burst, line or emanation covers (Tech Core p. 171).

### P6.2 UI
- In the encounter page, a split or tab view: **Interior** (the existing VTT) and **Sensors** (the zone map). On a wide screen they sit side by side.
- The 12- and 15-zone layouts from the book are built in, plus a simple custom layout editor (add zones, connect them).
- Drag ship tokens between zones, rotate their heading, see sensor range as a highlight.
- Zone areas: pick shape and size and the origin zone; the covered zones light up, and targets in them get the save prompt. A line picks one target per zone.
- The player window shows the sensor map too, with hidden or undetected ships left out (same rules as hidden tokens today).

**Tests:** distance and range on both built-in layouts, the off-guard heading rule, each area shape, a line choosing one target per zone.

---

## P7. Starship combat engine (L) ✅ done 2026-11-07 (0.35.0)

**Built:** `rules/starshipCombat.ts` (pure: SP-first damage with bypassing, the player ship's 0-HP → compromised/inoperable, hull damage while compromised, hull integrity check, repairs ending compromised with wrecked +1, ship state ↔ conditions, Generate Shields dice, Repair Self). The store's `applyDamage` uses it for every sensor-map token; the player ship skips the dying/defeated automation (`withPlayerShipEffects`), enters initiative right before the active turn (+0.5) and leaves it again, and marks every station malfunctioning (`starship.malfunctioning` on the encounter). The Stations panel shows the ship's live AC and saves (helmed item bonuses, the pilot's Piloting DC from their hand-entered Piloting, inoperable −4, off-kilter −2 Reflex), hands them to the save prompt (`playerShipDefenses`), runs the hull integrity check on the ship's turn (roll or pick a degree), toggles malfunctioning stations and greys out their actions, and writes HP, SP and compromised/wrecked/inoperable/off-kilter back to the ship. The sensor panel has damage (crit, bypassing, nonlethal), Repair HP, Generate Shields (player ship, rolled) / Fortify (enemies) and Repair Self. Starship abilities with a zone area get a "Zone area" button that preloads the sensor panel's area tool with its DC, save and damage. Turn reminders for compromised, inoperable and off-kilter. Enemy ships at 0 HP are defeated as usual (XP kept). Tests: `tests/starshipCombat.test.ts`.
**Not done:** no warning when a creature-scale attack targets a starship (or the other way round); station actions are reminders, not one-click rolls; Strikes from a gunnery use the crew member's own attack roll.


Builds on the existing combat store (`stores/encounter.ts`), combat log and undo.

- **Initiative:** crew tokens roll as in P5.3. Enemy ships and starship hazards roll their own initiative. The player ship doesn't roll.
- **Damage to ships:** reduce SP first, then HP. The `bypassing` trait goes straight to HP. Effects that restore HP don't restore SP. Logged and undoable like token damage.
- **Generator:** Generate / Fortify Shield Points restores SP by the fortify value, up to the maximum.
- **Station actions as actions:** Strikes from the gunnery use the ship's weapon and the helming character's attack bonus. Auto-Fire and Area Fire use the zone area tool (P6). MAP and once-per-round limits (Boost Thrusters) are tracked per crew member, as for other actions.
- **Player ship at 0 HP:**
  - It becomes **compromised 1** (2 on a critical hit or critical failure; plus its wrecked value), unless the damage was nonlethal, in which case it's just inoperable.
  - Every battle station becomes malfunctioning.
  - The ship **enters initiative** right before the turn that dropped it. On its turn it gets a **hull integrity check** prompt: a flat check against DC 10 + the compromised value. Crit success −2, success −1, failure +1, crit failure +2. At compromised 10 it's destroyed.
  - Damage that gets past SP while compromised: +1 (+2 on a crit), and all stations malfunction again.
  - Back at 1+ HP or compromised 0: compromised goes away, wrecked goes up by 1, and the ship leaves initiative.
- **Enemy ships at 0 HP** are destroyed and removed, with their XP kept (same as defeated enemies today). They get the free **Repair Self** (3 actions: repair a malfunctioning station, regain HP equal to level) and **Seek Starships** actions on their stat block panel.
- **Conditions:** inoperable (−4 to AC, Perception and Reflex, off-guard, no actions or moves), off-kilter (−2 to attacks, Area Fire / Auto-Fire DCs and Reflex; can't move until Change Heading). Both show as condition chips on the sensor token and are added to the turn reminders.
- **Boarding and deck hazards:** creatures and on-deck hazards (Boarding Pod and similar) are placed on the interior map and fight in the same initiative. That already works; the encounter only needs to allow both maps' tokens in one turn order.
- **Ships vs creatures:** starship-trait effects only hit starship-trait targets. The damage dialog warns when a creature-scale attack targets a ship, or the other way round.

**Tests:** SP/HP split and bypassing, generator restore cap, the full compromised → hull integrity → wrecked cycle (including nonlethal and crit cases), enemy destruction and XP, undo for each step.

---

## P8. Encounter builder and resolution (S) ✅ done 2026-11-07 (0.36.0)

**Built:** `starshipBudgets` in `rules/encounter.ts` (crew of ≤3: −10 trivial/low, −20 moderate and up; the concierge upgrade switches it off), used by the builder, the encounter meter and the resolve dialog of starship battles. The builder (SF2e) has a "Starship encounter" toggle with a concierge option and the active ship's name; its search adds starships. "Create encounter" in starship mode calls `startStarshipBattle` on the active ship, puts starships and starship-trait hazards on the sensor map at the far end facing the party, and creatures and other hazards on the interior; the encounter remembers the concierge choice. Starships count as creatures for XP (the player ship is an ally and counts for nothing). Battles now start with full Shield Points when the ship has a generator, and carry the ship's lasting conditions (wrecked …). Test in `tests/encounter.test.ts`.


- The encounter builder gets a **Starship encounter** toggle. It adds the Starships and starship hazards lists next to creatures.
- XP: starships count as creatures of their level; hazards as hazards; boarders as creatures. With a crew of 3 or fewer, the budget is 20 lower for moderate or harder and 10 lower for trivial or low (Tech Core, GM's Arsenal, pp. 206–209), shown as a note on the meter. The **concierge upgrade** variant switches this off.
- Resolution and XP awards work as for any encounter. Destroyed or surrendered ships count as defeated.
- Starship hazards that belong on the sensor map are placed there; deck hazards go on the interior map.

**Tests:** XP with mixed starships, hazards and boarders; the small-crew adjustment and the concierge override.

---

## P9. Starship exploration and downtime (S–M) ✅ done 2026-11-07 (0.37.0)

**Built:** `emergencyRepairs` / `emergencyRepairsDc` in `rules/starshipCombat.ts` (DC 15/20 at a port / far away, 20/25, 30/35, 40/45 for expert, master, legendary with +10/+30/+50 HP; 2d8 / 4d8, a day doubles, wrecked removed on a success, 1d8 damage on a critical failure). The Starship page's **Exploration & downtime** section rolls Emergency Repairs for a crew member (their hand-entered Crafting or a typed modifier) and applies it, lists the crew's exploration activities as start-of-encounter effects (the battle's Stations panel shows them in round 1 too), and lists each installed bay's downtime benefit. **Change from the plan:** the book has no separate "Repair Starship" activity: rebuilding at a major port takes a week and may change anything, which the Starship page already allows, so there's a note instead of a button. **Not done:** bay reminders inside the income and downtime dialogs, and a Drift travel log. The pack builder now reads the lounge and mess bay texts column-aware.


- **Exploration activities** from the crew roster (P4.2) show as a list on the GM screen with their effect at the start of an encounter.
- **Emergency Repairs** (exploration): restores HP and lowers wrecked. **Repair Starship** (downtime, in port): change stations, upgrades and bays for free, as the book allows. Both are buttons on the Starship page that log what was done.
- **Expansion bay benefits** (science lab +1 to Recall Knowledge, holo den, medical bay …) show as reminders on the downtime and income dialogs where they apply.
- Optional: travel log entries for Drift travel, using the existing calendar once it exists ([FEATURES_PLAN.md](FEATURES_PLAN.md)).

---

## P10. Play Buddy SF2e support (M)

Play Buddy is PF2e only today, so SF2e campaigns use `NoneLink`. Its creator plays in this campaign and will build the Play Buddy side. This phase is the StarTome side plus a spec in [PLAYBUDDY_API.md](PLAYBUDDY_API.md) they can build against.

**What StarTome needs from Play Buddy for SF2e** (a new `game: 'sf2e'` flag on the handshake; everything else as in the PF2e API):
- **Skills and Perception** with SF2e skill names (Computers, Piloting …), so station cards and initiative from a station use the real modifiers.
- **Class DC** (Area Fire / Auto-Fire DCs) and the **ranged attack bonus** (gunnery Strikes).
- **Credits** in the coins offer (`credits`; UPBs stay a plain item).
- **Inventory** with grades, installed upgrades and augmentations, so P1's slot checks see the player's real gear.
- Optional: **Hero Points**, since a crew member can spend one to reroll the ship's save.
- Optional, later: Play Buddy shows the player's current station and its actions, pushed from StarTome's crew roster.

**StarTome side:**
- `partylink`: accept SF2e characters and map the SF2e skills into `CharacterMirror`.
- The station cards and the station initiative roll prefer Play Buddy values, then the manual `sf_skills`, then the skill name alone.
- `tests/playbuddy.test.ts`: an SF2e handshake and status read against the mock (`scripts/playbuddy-mock.mjs` gets an SF2e character).

---

## 3. Decisions (2026-11-07)

1. **One player ship per encounter.** Other friendly ships are ally tokens on the sensor map that the GM runs: no interior map, no crew stations. `SensorToken.side: 'party'` marks the one player ship; allies are `side: 'party'` with `ally: true`.
2. **The ship keeps its interior map, and each encounter copies it.** The ship has one interior map with its station markers (`interior_encounter_id` points at a template encounter). A new starship encounter copies the map, walls, assets and markers, so damage, fog and boarders stay with that encounter.
3. **Crew skills: optional manual entry now, Play Buddy later.**
   - Now: optional SF2e skill fields on a party member (`sf_skills: Record<string, number>`, e.g. Piloting, Computers, Engineering, Perception). A blank field shows only the skill's name on the station card.
   - Later: Play Buddy gets SF2e support (its creator plays in the campaign). Phase **P10** below specifies what StarTome needs from it, so the manual fields become the fallback for characters that aren't linked.
4. **Rules tables: check Archives of Nethys first.** Every starship table (frame stats by level, battle station advancement, starship weapons) is looked up on AoN first. If it's there, it's entered from AoN and marked `verified: true`. If not, it's entered from the book with `verified: false` and rechecked when AoN adds it.
5. **Station grades: one table per station** (checked in the book, pp. 179–183). Each battle station has its own advancement table: grade → level, upgrade slots, and a station-specific column (helmed AC / Reflex / Fortitude / Will bonus, drones, damage dice, tracking). The grade levels follow one of two schedules, so `SF2E_GEAR` can't simply be reused:
   - **Weapon schedule** 1 / 2 / 4 / 10 / 12 / 16 / 19 (gunnery, drone console, …)
   - **Armor schedule** 1 / 2 / 5 / 8 / 11 / 14 / 18 (generator, magic conduit, pilot's console, …)

   `battleStation.advancement[]` stores the full table per station, and `stationGradeAt(station, level)` reads it.

## 4. Test data

The newest release ZIPs are in `~/Downloads`: `json-assets (1).zip` is PF2e and `json-assets (2).zip` is SF2e (both from 2026-11-07). Use them for the opt-in full-release smoke tests and for the vehicle golden tests (P2). Don't commit them.

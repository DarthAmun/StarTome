# StarTome homebrew import format

You are helping me homebrew content for **Starfinder 2e** (or Pathfinder 2e). When I ask for an importable file, output **one JSON file** in the format below, in a single ```json code block, nothing omitted. I import it in StarTome on the **Import & Export** page, by dropping the file or pasting your answer; it opens the homebrew import.

The importer checks every entry: it fixes small slips (text numbers, "350 credits", missing optional lists) and lists each fix, and leaves out entries it can't read. When I paste back its "problems" list, send a corrected file with the **same ids**. Aim for zero fixes: follow the shapes exactly.

## File wrapper

```json
{
  "version": 2,
  "app": "startome",
  "type": "campaigns",
  "exportedAt": "2026-10-30T12:00:00.000Z",
  "rules": [ /* entries, see below */ ]
}
```

Only `rules` is needed. (A bare array of entries also works.)

## Common fields (every entry)

| Field | Type | Notes |
|---|---|---|
| `id` | string | A random UUID v4. **Keep the same id** when I ask you to revise an entry: re-importing replaces the row with that id. New entry → new UUID. |
| `origin` | `"user"` | Always `"user"`. |
| `kind` | string | `item`, `creature`, `hazard`, `spell`, `feat`, `action`, `condition`, `ancestry`, `heritage`, `background`, `class`, `deity`, `relicGift`, `vehicle`, `starship`, `starshipFrame`, `battleStation`, `stationUpgrade`, `expansionBay` |
| `game` | `"sf2e"` \| `"pf2e"` \| `"both"` | `"sf2e"` unless I say otherwise. |
| `name` | string | Title Case. |
| `sortName` | string | `name` lower-cased. |
| `level` | number | Item/creature/hazard/feat level. **Spells: the rank**; cantrips use `1` plus trait `"cantrip"`. `0` for kinds without a level. |
| `rarity` | `"common"` \| `"uncommon"` \| `"rare"` \| `"unique"` | |
| `traits` | string[] | Lower-case slugs: `"fire"`, `"tech"`, `"analog"`, `"two-hand-d10"`, `"versatile-p"`. Do **not** put rarity or size in traits. Can be `[]`. |
| `description` | string | Markdown (see "Text"). Can be `""`. |
| `sourceRefs` | `[]` | Always an empty array. |
| `publication` | object, optional | `{ "title": "Homebrew: <pack>", "remaster": true }`: the **pack** the entry belongs to. Use the same title for everything in one set (a class with its feats and subclasses, a setting's gear) and ask me which pack if unsure. |
| `tags` | string[], optional | My own labels, e.g. `["homebrew", "act-2"]`. |
| `createdAt`, `updatedAt` | string | ISO timestamp, e.g. `"2026-10-30T12:00:00.000Z"`. |

Never set `img`, `tokenImg`, `localEdits`, `upstream`, `legacy` or `build`.

## Units

- **Money** (`price`): `{ "cp": number }` in copper. **SF2e: 1 credit = 10 cp** → 350 credits = `{ "cp": 3500 }`. PF2e: 1 gp = 100 cp, 1 sp = 10 cp. `null` = no price.
- **Bulk** (`bulk`, container `capacity`/`bulkReduction`): tenths. `—` = `0`, `L` = `1`, `1` = `10`, `2` = `20`. `null` = varies (then set `bulkNote`).
- **Distances** (speeds, ranges, senses): feet as numbers (`30`, not `"30 feet"`).
- **Action cost** (`cost`, `cast`): `1`, `2`, `3`, `"free"`, `"reaction"`, `"passive"`, a range `{ "min": 1, "max": 3 }`, text `{ "text": "1 minute" }`, or `null` (no cost shown, e.g. a passive feat).
- **Damage formula**: dice + flat, no spaces: `"2d8+6"`. Damage types lower-case: `"piercing"`, `"fire"`, `"electricity"`, `"sonic"`, `"bludgeoning"`, `"mental"`, `"poison"`, `"force"`, `"spirit"`, `"vitality"`, `"void"`, …

## Text (description and other prose fields)

Markdown, plus:

- `{{spell: Name}}`, `{{item: Name}}`, `{{creature: Name}}`, `{{condition: Frightened}}`, `{{feat: Name}}`, `{{action: Name}}` … link to compendium entries by name (any kind above).
- `::dice[2d6+4]` → clickable roll. `::button[Label|2d6+4]` → roll with its own label.
- GM-only text (hidden from players):
  ```
  > [!hidden] GM notes
  > The vendor is a spy for the Azlanti.
  ```
- Action glyphs in prose: `◆` `◆◆` `◆◆◆` `◇` (free) `↺` (reaction).
- Use **Success / Failure** degree blocks as bold lines: `**Critical Success** …`.

## Kinds

### item

```json
{
  "kind": "item",
  "category": "weapon",
  "price": { "cp": 3500 },
  "bulk": 10,
  "usage": "held in 2 hands",
  "hands": "2"
}
```

- `category`: `weapon`, `armor`, `shield`, `equipment`, `consumable`, `treasure`, `container`, `ammunition`, `kit`
- optional: `subcategory` (consumables/treasure: `"grenade"`, `"drug"`, `"serum"`, `"gem"`…), `baseItem`, `priceFor` (ammo bought in lots, e.g. `10`), `bulkNote`, `usage`, `hands` (`"1"`, `"2"`, `"1+"`), `uses: { "max": 3 }`
- `activation`: `[{ "cost": 1, "traits": ["manipulate"], "text": "Interact" }]`
- `weapon`: `{ "category": "simple"|"martial"|"advanced"|"unarmed", "group": "laser", "damage": { "dice": 1, "die": "d8", "type": "fire" }, "range": 60, "reload": "0", "ammo": { "type": "battery", "capacity": 10 }, "expend": 1, "grade": "commercial", "splash": 1 }` — only `category` and `damage` required.
- `armor`: `{ "category": "light"|"medium"|"heavy"|"unarmored", "group": "composite", "acBonus": 2, "dexCap": 3, "checkPenalty": -1, "speedPenalty": 0, "strength": 1, "grade": "commercial" }` — `dexCap`/`strength` may be `null`.
- `shield`: `{ "acBonus": 2, "hardness": 5, "hp": 20, "bt": 10 }`
- `container`: `{ "capacity": 40, "bulkReduction": 10 }`

#### SF2e gear

StarTome checks these rules from the item's fields and text, so write them the way it reads them:

- **Grades** (`commercial`, `tactical`, `advanced`, `superior`, `elite`, `ultimate`, `paragon`): set `weapon.grade` / `armor.grade`. A weapon or armor gets extra upgrade slots and tracking from its grade (Player Core improvement tables). Gear with fixed grade versions (grenades, augmentations, many tech items) is **one entry per grade**, named `"Name (Tactical)"`, each with its own level and price.
- **Upgrade slots:** armor has 1 base slot unless its table says otherwise; weapons have 1, archaic weapons 0. Write "starts with 0 upgrade slots" in a weapon's description when it has none, and "one fewer upgrade slot" in a fusion's or item's description when it costs one; StarTome counts both.
- **Upgrades:** `category: "equipment"`, trait `"upgrade"`, and `usage` saying where they go: `"installed in armor"`, `"installed in a weapon"`, `"installed in a weapon that uses projectiles"`. The usage decides what the inventory lets you attach it to.
- **Installed weapons:** a `weapon` item with a trait `installed-<host>`, e.g. `"installed-two-handed-melee-weapon"`, `"installed-armor"`. One per host; its grade can't exceed the host's.
- **Augmentations:** `usage: "implanted"` (body part in the description). A character can have four; give apex augmentations the trait `"apex"`, and write "doesn't count against your implant limit" in the description of others that don't count.
- **Area and automatic weapons:** traits `"area-cone"`, `"area-line"`, `"area-burst-10"` (the number is the burst's size in feet) and `"automatic"`. Cones and lines reach the range increment, so set `weapon.range`; Auto-Fire is a cone of half of it. On a creature, the same traits go on the Strike, with `rangeIncrement` (see creature).
- **Grenades:** `category: "weapon"`, `weapon.group: "grenade"`, trait `"grenade"`, `expend: 1`, one entry per grade.

### creature

All of these are required:

```json
{
  "kind": "creature",
  "size": "med",
  "perception": 12,
  "senses": [{ "type": "darkvision" }, { "type": "tremorsense", "acuity": "imprecise", "range": 30 }],
  "languages": ["Common", "Vesk"],
  "skills": { "athletics": 14, "intimidation": 11, "computers lore": 9 },
  "abilities": { "str": 4, "dex": 2, "con": 3, "int": 0, "wis": 1, "cha": -1 },
  "ac": 22,
  "saves": { "fort": 15, "ref": 11, "will": 9 },
  "hp": 75,
  "immunities": [],
  "weaknesses": [{ "type": "cold", "value": 5 }],
  "resistances": [{ "type": "physical", "value": 5, "except": ["adamantine"] }],
  "speeds": { "land": 25, "fly": 30 },
  "strikes": [
    { "name": "plasma claw", "range": "melee", "bonus": 15, "traits": ["agile"], "damage": [{ "formula": "2d8+6", "type": "slashing" }, { "formula": "1d6", "type": "fire" }], "effects": ["Grab"] }
  ],
  "actions": [
    { "name": "Shield Burst", "cost": "reaction", "section": "defensive", "traits": [], "text": "**Trigger** An enemy hits the creature with a ranged Strike.\n\n**Effect** …" }
  ],
  "spellcasting": [],
  "inventory": [{ "name": "Laser Pistol", "quantity": 1 }]
}
```

- `strikes[].rangeIncrement`: feet per range increment for ranged Strikes (optional). SF2e weapons with `area-cone`, `area-line` or `automatic` need it for the Area Fire / Auto-Fire buttons; `area-burst-10` carries its own size.
- `size`: `tiny`, `sm`, `med`, `lg`, `huge`, `grg`
- `skills` keys: lower-case skill names; lores as `"<topic> lore"`.
- `abilities` are modifiers, not scores.
- `actions[].section`: `interaction` (top: auras, languages-like passives), `defensive` (reactions, defensive passives), `offensive` (everything used on its turn). Optional `frequency`.
- `spellcasting`: `[{ "name": "Arcane Innate Spells", "tradition": "arcane", "type": "innate", "dc": 22, "attack": 14, "spells": [{ "name": "Force Barrage", "rank": 2, "uses": 2 }] }]` — `type`: `prepared`, `spontaneous`, `innate`, `focus`, `ritual`. Name spells exactly as in the compendium so they link.
- optional: `acNote`, `saveNote` (e.g. `"+1 status to all saves vs. tech"`), `hpNote` (e.g. `"regeneration 10 (deactivated by cold)"`), `hardness`.
- Build numbers from GM Core's creature-building tables for the creature's level (moderate/high/extreme as fits its role).

### hazard

```json
{
  "kind": "hazard",
  "complex": false,
  "stealth": { "bonus": 18, "note": "expert" },
  "disable": "DC 20 Computers (expert) to hack the turret's targeting array",
  "ac": 21, "saves": { "fort": 12, "ref": 8 }, "hardness": 10, "hp": 40, "bt": 20,
  "immunities": ["critical-hits", "precision"],
  "actions": [{ "name": "Lock On", "cost": "reaction", "section": "offensive", "traits": [], "text": "…" }],
  "routine": "(1 action) The turret makes one laser Strike.",
  "reset": "The turret resets after 1 hour."
}
```

Required: `complex`, `stealth`, `disable`, `actions`. The rest optional (`strikes` uses the creature strike shape).

### spell

```json
{
  "kind": "spell",
  "level": 3,
  "spellType": "spell",
  "traditions": ["arcane", "occult"],
  "cast": 2,
  "range": "120 feet",
  "area": "20-foot burst",
  "targets": "1 creature",
  "duration": "1 minute",
  "sustained": false,
  "defense": { "save": "ref", "basic": true },
  "damage": [{ "formula": "6d6", "type": "electricity" }],
  "heightened": [{ "trigger": "+1", "text": "The damage increases by 2d6." }]
}
```

- `spellType`: `spell`, `focus`, `ritual`. Required: `spellType`, `traditions`, `cast`.
- `defense`: `{ "save": "fort"|"ref"|"will", "basic": true|false }`, `{ "ac": true }`, or `null`.
- Heightened `trigger`: `"+1"`, `"+2"`, `"5th"`.

### feat

```json
{ "kind": "feat", "level": 4, "category": "class", "cost": 1, "prerequisites": ["trained in Computers"], "trigger": "…", "frequency": "once per hour", "requirements": "…" }
```

`category`: `ancestry`, `class`, `general`, `skill`, `archetype`, `classfeature`. Put the class/ancestry name in `traits` (e.g. `["operative"]`). Required: `category`, `cost`, `prerequisites`.

Optional for class features: `choices` and `optionOf` (see "Classes and subclasses").

### action

```json
{ "kind": "action", "cost": 2, "category": "offensive", "trigger": "…", "frequency": "…", "requirements": "…" }
```

### condition

```json
{ "kind": "condition", "valued": true, "overrides": [], "group": "detection", "aliases": [] }
```

### relicGift

A relic gift (GMG p. 96), PF2e only. In the party inventory it attaches to an item marked as a relic, like a rune. Put its activations in `description` too (as `**Activate** ◆◆ …` lines); `activation` keeps them structured.

```json
{ "kind": "relicGift", "game": "pf2e", "tier": "minor", "aspects": ["fire"], "prerequisites": [], "grantsRune": "Flaming",
  "activation": [{ "cost": 2, "traits": ["manipulate"], "frequency": "once per day", "trigger": "…", "text": "…" }] }
```

- `tier`: `minor`, `major` or `grand`.
- `aspects`: the relic aspects it belongs to, lower case (`any` for every aspect).
- `grantsRune`: for gifts that give the relic a rune, the rune's name.

The import page also reads [pf2ools-data](https://github.com/Pf2ools/pf2ools-data)'s relic gifts as they are (MIT): the bundle `bundles/byDatatype/core/relicGift.json` or single files from `data/core/<book>/relicGift/`. They land in the pack "Relic Gifts (pf2ools)", and importing a newer bundle updates them.

### vehicle

A vehicle (SF2e Tech Core "Vehicles", PF2e GM Core). It can stand on the map as a token with its AC and HP; it's worth no XP (its crew is).

```json
{ "kind": "vehicle", "level": 9, "size": "lg", "price": "25,000 credits", "ac": 24, "fort": 18, "hardness": 15, "hp": 120,
  "immunities": [], "weaknesses": [], "resistances": [],
  "collision": { "dc": 24, "damage": "6d10" }, "crew": "1 pilot, 1 crew", "passengers": "",
  "pilotingCheck": "Piloting (DC 25)", "space": { "long": 10, "wide": 15, "high": 5 },
  "speed": "40 feet (motorized), fly 60 feet (motorized)",
  "actions": [{ "name": "Laser Cannon", "cost": 2, "section": "offensive", "traits": ["fire"], "text": "…" }] }
```

- Required: `ac`, `fort`, `hp`. The rest has defaults (`size` `lg`, `hardness` 0, empty lists and text).
- `space` in feet, or leave it out. `bt` is optional.

### Starships (SF2e Tech Core)

Foundry has no starship data, so tactical starship combat (Tech Core ch. 6–7) comes from homebrew files: put everything from the book in one pack, e.g. `"publication": { "title": "Tech Core (local)" }`, and keep that file to yourself. Distances are **zones** (a number; `"3 zones"` is read as 3). Grades are `commercial`, `tactical`, `advanced`, `superior`, `elite`, `ultimate`, `paragon`. Battle stations and upgrades are referred to by name, lower case (`"gunnery"`, `"pilot's console"`).

**`starship`** — an enemy or NPC starship (Starship Archive). `level` is its STARSHIP level.

```json
{ "kind": "starship", "level": 3, "traits": ["tech"], "size": "med", "perception": 9, "sensorRange": 4,
  "skills": { "computers": 8, "piloting": 11 }, "abilities": { "str": 0, "dex": 4, "con": 2, "int": 3, "wis": 2, "cha": 1 },
  "ac": 18, "saves": { "fort": 9, "ref": 11, "will": 7 }, "hp": 32, "shields": { "max": 10, "fortify": 5 },
  "immunities": ["starship immunities"], "weaknesses": [], "resistances": [], "speed": 3,
  "battleStations": [{ "station": "gunnery", "actions": [], "weapons": ["magnetar rail"] }, { "station": "pilot's console", "actions": ["Boost Thrusters", "Change Heading"] }],
  "strikes": [{ "name": "magnetar rail", "range": "ranged", "bonus": 10, "traits": ["analog", "automatic", "ordnance"], "rangeZones": 6, "damage": [{ "formula": "1d12+3", "type": "piercing" }] }],
  "actions": [{ "name": "Auto Fire", "cost": 2, "section": "offensive", "traits": [], "text": "magnetar rail (3-zone cone) 1d12+3 piercing, DC 16 basic Reflex save" }] }
```

- `shields`: `null` for a ship without a generator. `immunities`: `"starship immunities"` stands for the standard list.
- Every NPC starship can Repair Self and Seek Starships; leave those out.

**`starshipFrame`** — a player starship frame (bulwark, explorer, skirmisher) with its table "Statistics by Level".

```json
{ "kind": "starshipFrame", "traits": ["tech"], "size": "med", "sensorRange": 5, "expansionBays": 4, "customSlots": 4,
  "defaultStations": [{ "station": "pilot's console", "upgrades": ["ramming prow"] }, { "station": "generator", "upgrades": [] }],
  "stats": [{ "level": 1, "hp": 27, "sp": 10, "ac": 17, "fort": 9, "ref": 6, "will": 8, "speed": 2 }] }
```

- `stats`: one row per level 1–20; `speed` in zones.

**`battleStation`** — pilot's console, gunnery, generator, scanners, magic conduit, drone console …, with its advancement table and its station actions.

```json
{ "kind": "battleStation", "name": "Pilot's Console",
  "helmedBenefits": "The starship's AC is equal to your Piloting DC if it's higher. …",
  "advancement": [{ "grade": "commercial", "level": 1, "upgrades": 0, "helmed": { "ac": 0, "ref": 0 } },
                  { "grade": "superior", "level": 8, "upgrades": 2, "helmed": { "ac": 1, "ref": 1 } }],
  "actions": [{ "name": "Boost Thrusters", "cost": 1, "section": "offensive", "traits": ["concentrate", "manipulate", "station"], "frequency": "once per round", "text": "The starship moves up to its Speed …", "grade": "commercial" }] }
```

- `advancement[]`: `grade`, `level`, `upgrades` and the station's own columns: `helmed` (`ac`, `fort`, `ref`, `will`), `sensors` (zones added to sensor range), `damageDice` and `tracking` (gunnery), `drones` (drone console).
- `actions[].grade`: the lowest grade that grants the action.

**`stationUpgrade`** — a battle station upgrade, or a starship weapon (installed in a gunnery).

```json
{ "kind": "stationUpgrade", "name": "Tractor Beam", "level": 4, "traits": ["starship", "tech"], "station": "generator",
  "actions": [{ "name": "Pull Starship", "cost": 1, "section": "offensive", "traits": ["attack", "manipulate", "station"], "text": "…" }] }
{ "kind": "stationUpgrade", "name": "Magnetar Rail", "level": 0, "traits": ["analog", "automatic", "ordnance"], "station": "gunnery",
  "actions": [], "weapon": { "category": "advanced", "damage": { "dice": 1, "die": "d12", "type": "piercing" }, "range": 6, "upgrades": 1, "group": "projectile" } }
```

- `grades`: for upgrades with "Type commercial; Level 1" lines: `[{ "grade": "commercial", "level": 1, "text": "…" }]`.

**`expansionBay`**

```json
{ "kind": "expansionBay", "name": "Crew Quarters", "takesSlot": false, "description": "…",
  "options": [{ "name": "Bunks", "text": "+1 item bonus to Perception checks for initiative …" }] }
```

### Companions (animal, robot, drone)

Not a kind: a companion's type or chassis (size, attacks, attribute modifiers, HP, skill, senses, speeds, support benefit, advanced maneuver) is typed into the **companion dialog on the party page**, which builds and levels the stat block itself. For a fixed NPC companion, write a `creature`. Feats that improve companions (Tactical Drone, robot customizations …) are ordinary `feat` entries.

### ancestry, heritage, background, class, deity

Reference entries: rules text in `description`, quick facts in `facts` (string, number or string[] values; keys are shown as labels). Use these keys:

- ancestry: `"HP"`, `"Size"`, `"Speed"` (`"25 feet"`), `"Attribute boosts"`, `"Attribute flaw"`, `"Languages"`, `"Additional languages"`, `"Vision"`
- heritage: `"Ancestry"`
- background: `"Attribute boosts"`, `"Trained skills"`, `"Feat"`
- class: `"HP per level"`, `"Key attribute"`, `"Perception"`, `"Fortitude"`, `"Reflex"`, `"Will"`, `"Trained skills"`
- deity: `"Category"`, `"Divine attribute"`, `"Divine font"`, `"Divine skill"`, `"Sanctification"`, `"Domains"`, `"Alternate domains"`, `"Favored weapon"`, `"Cleric spells"`

Class only, optional: `features`, the class features by level: `[{ "level": 1, "name": "Domain" }, { "level": 7, "name": "Expert Spellcaster" }]`. Each name should match a `classfeature` feat in the file.

Class only, optional: `progression`, the levels the class gets its feats and skill increases at. Leave out what follows the usual table: class feats at 1 and every even level, skill feats at every even level, general feats at 3, 7, 11, 15, 19, ancestry feats at 1, 5, 9, 13, 17, skill increases at 3, 5 … 19. A class with a skill feat every level: `"progression": { "skillFeats": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] }`.

```json
{ "kind": "ancestry", "facts": { "HP": 8, "Size": "Medium", "Speed": "25 feet", "Attribute boosts": ["Constitution", "Wisdom", "Free"], "Languages": ["Common", "Ysoki"] } }
```

## Classes and subclasses

Subclasses (domains, connections, muses, fighting styles …) are **not** classes. Build them the way the official data does, as three parts:

1. **The class** (`kind: "class"`): facts, description and `features` by level, including the feature where the choice is made.
2. **The choosing feature**: a `feat` with `category: "classfeature"`, the class's trait, and `choices` naming the group: `["conduit-domain"]`. Its description explains the choice.
3. **Each option**: a `feat` with `category: "classfeature"`, the class's trait, the same level as the choosing feature, and `optionOf: ["conduit-domain"]`. Its **name is the option alone** ("Fire Domain"), never "Conduit: Fire Domain".

The group tag is `<class trait>-<choice>`, lower-case: `conduit-domain`, `envoy-leadership-style`. The class's trait is its name as a slug (`"conduit"`), and every class feature and class feat carries it in `traits`.

```json
[
  { "kind": "class", "name": "Conduit", "facts": { "HP per level": 8, "Key attribute": "Wisdom" },
    "features": [{ "level": 1, "name": "Domain" }, { "level": 1, "name": "Conduit Spellcasting" }] },
  { "kind": "feat", "name": "Domain", "category": "classfeature", "level": 1, "traits": ["conduit"], "cost": null,
    "prerequisites": [], "choices": ["conduit-domain"], "description": "Choose one domain …" },
  { "kind": "feat", "name": "Fire Domain", "category": "classfeature", "level": 1, "traits": ["conduit"], "cost": null,
    "prerequisites": [], "optionOf": ["conduit-domain"], "description": "…" }
]
```

(Common fields left out above for brevity; real entries need all of them.) Granted spells, skills and focus spells of an option go in its description, with `{{spell: Name}}` links.

## Checklist before you answer

1. Valid JSON (no comments, no trailing commas).
2. Every entry has all common fields **and** its kind's required fields, arrays as `[]` when empty.
3. `sortName` = lower-cased `name`; fresh UUIDs for new entries, same id for revisions.
4. Prices in cp (credits × 10), bulk in tenths, distances in feet as numbers; starship distances in zones as numbers.
5. Numbers are balanced for the stated level (GM Core tables for creatures/hazards, treasure-by-level for item prices).
6. Subclasses are `classfeature` feats with `optionOf`, named without the class; the class lists its features by level.
7. SF2e gear: grades set, one entry per fixed grade, upgrades with trait `upgrade` and an `installed in …` usage, augmentations `implanted`, area/automatic weapons with a `range`.
8. Starship content: station actions carry their `grade`; frames have 20 `stats` rows; no book text from Paizo's starship chapters (build that pack with `scripts/techcore/build.sh` instead).
9. After the JSON, list each entry as `name — kind, level` and anything you assumed.

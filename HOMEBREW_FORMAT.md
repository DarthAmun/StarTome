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
| `kind` | string | `item`, `creature`, `hazard`, `spell`, `feat`, `action`, `condition`, `ancestry`, `heritage`, `background`, `class`, `deity` |
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

### ancestry, heritage, background, class, deity

Reference entries: rules text in `description`, quick facts in `facts` (string, number or string[] values; keys are shown as labels). Use these keys:

- ancestry: `"HP"`, `"Size"`, `"Speed"` (`"25 feet"`), `"Attribute boosts"`, `"Attribute flaw"`, `"Languages"`, `"Additional languages"`, `"Vision"`
- heritage: `"Ancestry"`
- background: `"Attribute boosts"`, `"Trained skills"`, `"Feat"`
- class: `"HP per level"`, `"Key attribute"`, `"Perception"`, `"Fortitude"`, `"Reflex"`, `"Will"`, `"Trained skills"`
- deity: `"Category"`, `"Divine attribute"`, `"Divine font"`, `"Divine skill"`, `"Sanctification"`, `"Domains"`, `"Alternate domains"`, `"Favored weapon"`, `"Cleric spells"`

Class only, optional: `features`, the class features by level: `[{ "level": 1, "name": "Domain" }, { "level": 7, "name": "Expert Spellcaster" }]`. Each name should match a `classfeature` feat in the file.

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
4. Prices in cp (credits × 10), bulk in tenths, distances in feet as numbers.
5. Numbers are balanced for the stated level (GM Core tables for creatures/hazards, treasure-by-level for item prices).
6. Subclasses are `classfeature` feats with `optionOf`, named without the class; the class lists its features by level.
7. After the JSON, list each entry as `name — kind, level` and anything you assumed.

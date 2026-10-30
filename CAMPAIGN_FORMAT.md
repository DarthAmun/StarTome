# StarTome campaign & setting import format

You are helping me build a **Starfinder 2e** campaign and its setting: NPCs, locations, factions, quests, events, rumors, random tables, session prep and lore notes. When I ask for an importable file, output **one JSON file** in the format below, in a single ```json code block, nothing omitted. I import it in StarTome on the **Import & Export** page, by dropping the file or pasting your answer (mode "merge": it is added next to my other campaigns, nothing is overwritten).

The campaign importer does **not** check fields. A wrong type can break the page that shows the entry, so follow the shapes exactly.

New compendium content (creatures, items, spells, hazards …) does **not** go in this file. Put it in a second file in the compendium format (HOMEBREW_FORMAT.md), which I import the same way. The campaign text can link to those entries by name.

## File wrapper

```json
{
  "version": 2,
  "app": "startome",
  "type": "campaigns",
  "exportedAt": "2026-10-30T12:00:00.000Z",
  "campaigns": [ /* exactly one campaign */ ],
  "entities": [ /* NPCs, locations, factions, quests … */ ],
  "entityConnections": [ /* optional: relationship lines for the graph */ ]
}
```

Leave out every other key (`encounters`, `tokens`, `characters`, `entityLinks`, `images` …). Encounters, maps and tokens are built in the app.

## Ids

Ids are **numbers local to this file**: the campaign is `1`; entities count up from `1` (`1, 2, 3 …`). Every reference (`campaign_id`, `questGiverId`, connection ends) uses these numbers. The import gives everything new ids and rewrites the references, so they never collide with my data. When you revise a file, keep the same numbers.

## Timestamps

`created_at` and `updated_at` are ISO strings, e.g. `"2026-10-30T12:00:00.000Z"`. Use the same value everywhere.

## Campaign

```json
{
  "id": 1,
  "name": "Embers of the Pact Worlds",
  "description": "One or two sentences that show on the campaign card.",
  "game": "sf2e",
  "rules": { "advancement": "milestone" },
  "created_at": "2026-10-30T12:00:00.000Z",
  "updated_at": "2026-10-30T12:00:00.000Z"
}
```

`game` is `"sf2e"` (or `"pf2e"`). `rules.advancement` is `"xp"` or `"milestone"`; leave out `rules` for the defaults.

## Entities

Every entity has these fields:

```json
{
  "id": 3,
  "campaign_id": 1,
  "type": "npc",
  "name": "Captain Ilsa Varn",
  "content": "Markdown body …",
  "attributes": { },
  "is_favorite": 0,
  "created_at": "2026-10-30T12:00:00.000Z",
  "updated_at": "2026-10-30T12:00:00.000Z"
}
```

- `type`: `npc`, `location`, `faction`, `quest`, `event`, `rumor`, `random-table`, `session`, `note`. (Do not make `region`s: they are drawn on a map in the app.)
- `name`: unique within its type. Links match by type + name.
- `attributes`: an **object** (not a JSON string), with the fields for the type, below. Every field is optional; leave out what you don't know. `{}` is fine.
- `is_favorite`: `1` stars the entry in the overview, otherwise `0`.

### Attributes by type

**npc**
```json
{ "title": "Captain of the Dawnrunner", "level": "6", "race": "vesk", "role": "ally", "status": "on Absalom Station", "isAlive": true }
```
`level` is text. `isPlayerCharacter: true` only for the players' characters.

**location**
```json
{ "locationType": "city", "status": "discovered" }
```
`locationType`: `city`, `dungeon`, `wilderness`, `building`, `region`, `other`. `status`: `discovered`, `undiscovered`, `destroyed`. Use `city` for stations and settlements, `building` for ships and facilities, `region` for planets and systems.

**faction**
```json
{ "factionType": "mercenary", "size": "medium", "isSecret": false, "headquartersName": "Kreiger's Rest" }
```
`factionType`: `criminal`, `religious`, `political`, `mercenary`, `arcane`, `other`. `size`: `small`, `medium`, `large`, `massive`.

**quest**
```json
{ "status": "active", "questGiver": "Captain Ilsa Varn", "questGiverId": 3, "questGiverType": "npc", "reward": "2,000 credits and a {{item: Arc Rifle}}", "milestone": true }
```
`status`: `active`, `completed`, `failed`, `dormant`. `questGiverId` is the file id of an `npc` or `faction` entity; `questGiver` repeats its name. `milestone: true` offers a party level-up when the quest is completed (milestone campaigns). The reward is shown on the players' quest board, so keep secrets out of it.

**event** (timeline)
```json
{ "date": "0322-04-17", "location": "Absalom Station", "significance": "major" }
```
The timeline sorts `date` as text, so use zero-padded `YYYY-MM-DD` (Starfinder years AG, e.g. `0322` for 322 AG). `significance`: `minor`, `major`, `critical`.

**rumor**
```json
{ "statuses": ["unheard"], "source": "dock workers on Castrovel", "tags": ["act-1"] }
```
`statuses`: any of `unheard`, `heard`, `revealed`, `false` (`false` = the rumor is untrue).

**random-table**
```json
{ "die": "d20", "rows": [{ "min": 1, "max": 5, "result": "A patrol of {{creature: Security Robot}}s" }, { "min": 6, "max": 20, "result": "Nothing" }], "tags": ["encounters"] }
```
`die`: `d4`, `d6`, `d8`, `d10`, `d12`, `d20`, `d100`. Rows cover the whole range, no gaps or overlaps.

**session**
```json
{ "mode": "planning", "sessionNumber": "1", "date": "2026-11-07", "scriptContent": "## Opening\n…" }
```
Session prep goes in `scriptContent`; leave `content` as `""` (it holds my notes from play). `mode`: `planning`, `running`, `finished`.

**note** (lore, history, setting primers)
```json
{ "icon": "gi-book-aura", "tags": ["lore"] }
```
`icon`: `gi-scroll-unfurled`, `gi-book-aura`, `gi-death-note` (secret), `gi-magic-hat`, `gi-house-keys`, `gi-sands-of-time`, `gi-all-seeing-eye`, `gi-castle`, `gi-coins`, `gi-broadsword`.

## Text (`content`, `scriptContent`, `reward`, table results)

Markdown, plus:

- **Links to other entries:** `{{npc: Captain Ilsa Varn}}`, `{{location: Absalom Station}}`, `{{faction: …}}`, `{{quest: …}}`, `{{event: …}}`, `{{rumor: …}}`, `{{note: …}}`, `{{session: …}}`, `{{table: …}}` (random table). The name must match an entity's name exactly. Links build the backlinks and the graph, so link generously: an NPC's page links to their faction and home, a location to who lives there.
- **Links to the compendium:** `{{creature: Name}}`, `{{item: Name}}`, `{{spell: Name}}`, `{{hazard: Name}}`, `{{feat: Name}}`, `{{condition: Name}}`. Use names from the Starfinder 2e rules or from the homebrew file you made with this one.
- **Embedded card:** `{{npc: Captain Ilsa Varn | entry}}` shows the NPC's card inline (good in session prep).
- **Roll:** `{{roll: 2d6+3}}`.
- **GM-only text** (hidden from the player view and the quest board):
  ```
  > [!hidden] Secret
  > Varn is selling the crew out to the Azlanti.
  ```

Keep the player-safe part of each entry outside `[!hidden]` blocks and the secrets inside them.

## Connections (optional)

Labelled lines between entries. They show on a relationship graph once I add both entries to it (Graphs › New):

```json
{ "id": 1, "campaign_id": 1, "source_entity_id": 3, "target_entity_id": 5, "label": "owes money to", "direction": "one-way", "color": null }
```

`direction`: `one-way`, `two-way`, `none`. `color`: `null` or a hex color like `"#e05555"` (rivalry, for example). Number connections `1, 2, 3 …`. Add them for the relationships that matter (allegiances, rivalries, debts, family), not for every link.

## Checklist before you answer

1. Valid JSON (no comments, no trailing commas); `attributes` are objects.
2. One campaign with `id: 1`; every entity has `campaign_id: 1` and a unique numeric `id`.
3. Every `{{type: Name}}` link points at an entity in the file (or a compendium entry), spelled exactly the same.
4. `questGiverId` and connection ends are ids of entities in the file.
5. Secrets are in `> [!hidden]` blocks; quest rewards and rumor text read fine for players.
6. After the JSON, list the entities by type (`name — type`) and any compendium entries the text links to that still need a homebrew file.

# Floors Plan: encounter maps with more than one level

Goal: an encounter map can have several floors (cellar, ground floor, tower …). Tokens stand on one floor, stairs take them up or down, the map maker paints every floor, and uploading map images accepts several at once in the right order.

Written 2026-11-17 against `main` at `6e860b0`.

---

## 0. Decisions (user, 2026-11-17)

| # | Question | Decision |
|---|---|---|
| D1 | How does a token change floors? | **Stair links + menu.** Linked stair points (map maker stair tiles make them by themselves; on uploaded images the GM places two linked points). A token stepping onto one is offered "Go up / Go down" and lands on the linked spot. The token menu can always move a token a floor up or down. |
| D2 | What does the GM see of other floors? | **The floor below shows faded only where the current floor is empty**: void squares on map-maker floors, transparent pixels on uploaded images. Never under painted tiles. Tokens below show faded in those gaps too. GM view only; tokens do not see down through gaps. |
| D3 | Which floor do the players see? | **The GM's floor.** The GM can lock the players' window to one floor. |
| D4 | Floor sizes in the map maker | **One size for all floors** of a map, so stairs and the faded floor below line up square for square. |
| D5 | Players' window and the faded floor below (proposed, not confirmed) | Shows it too, but only where their tokens' sight already reaches. |

---

## 1. Where we stand

| Piece | Today |
|---|---|
| `Encounter.map`, `Encounter.grid` ([schema/encounter.ts](src/domain/schema/encounter.ts)) | The one map image and its grid |
| `EncounterMap.walls`, `.fog`, `.battlemap`, `.areas`, `.viewport` | Walls, fog, the map maker's tiles and assets, areas, the GM's view; one set |
| `Combatant.elevation` | Height above the floor (flying); not a floor |
| [MapMakerPage.vue](src/features/encounters/mapmaker/MapMakerPage.vue) + [editor.ts](src/features/encounters/mapmaker/editor.ts) | One `BattleMap`; "Use as encounter map" renders one PNG, makes walls (`applyBattleMap`) |
| [PreparePanel.vue](src/features/encounters/vtt/PreparePanel.vue), drop on [EncounterPage.vue](src/features/encounters/EncounterPage.vue) | One image (file, drop or web address) |
| [MapCanvas.vue](src/features/encounters/vtt/MapCanvas.vue), [scene.ts](src/features/encounters/vtt/scene.ts), [playerSync.ts](src/features/encounters/vtt/playerSync.ts) | Read `live.encounter.map/grid` and `live.map.walls/fog` directly |
| Starship interiors ([data/starships.ts](src/data/starships.ts)) | One interior map; station markers `{slot, x, y}`; a battle copies map, grid, walls, tiles |
| Backups, image cleanup | `collectImageIds` walks every field, so floor images need nothing extra |

## 2. Storage

No database migration. What a one-floor map stores today **stays where it is and is the "main floor"**. Further floors go in a list on the map row:

```ts
EncounterMap.mainFloor: { name: string; level: number }        // default { name: 'Ground floor', level: 0 }
EncounterMap.floors: Floor[]                                    // default []: the other floors
Floor = { id, name, level, image: ImageRef | null, grid, walls, fog, battlemap }
Combatant.floorId: string | null                               // null = the main floor
AreaOverlay.floorId?: string | null                            // null/missing = the main floor
```

- `level` orders the floors (lower = further down); levels are unique. The floor with level 0 is called the ground floor in names; nothing else depends on it.
- The main floor's id is the constant `MAIN_FLOOR` (`'main'`). Reordering only changes levels, so no data moves.
- Removing the main floor while others are left moves the lowest remaining floor's data into the main fields (and its tokens and areas to `null`).
- All reading and writing of per-floor data goes through [domain/rules/floors.ts](src/domain/rules/floors.ts): `floorsOf`, `floorById`, `floorWrite` (says which row and field a change goes to), `addFloor`, `removeFloor`, `orderFloors`.
- Areas and the viewport: areas carry `floorId`; the viewport stays one per encounter.

## 3. Steps

Each step can ship on its own.

### Step 1: data model (no visible change)
- Schema fields from §2, `floors.ts` with tests.
- Copying an encounter and starting a starship battle carry every floor; tokens and areas keep their floor.

### Step 2: game table
- `live.floorId` (the floor the GM looks at). MapCanvas, sight, fog painting, walls, areas and the right-click menu all use the current floor; tokens of other floors are not drawn and do not block.
- Floor switcher on the map (▲ name ▼, PgUp / PgDn), with a token count per floor.
- When the turn passes to a token on another floor, the view follows.
- Token menu: Move up / down a floor (same square, clamped to the map).
- Faded floor below through empty squares and transparent pixels (D2).
- Stair links: `EncounterMap.stairs: { id, a: { floorId, x, y }, b: { floorId, x, y } }[]`; a stairs tool places them; a token ending a move on one gets "Go up / Go down" (D1).
- Players' window follows the GM's floor, with a lock (D3).

### Step 3: uploading several images
- "Choose image…" and dropping accept several files.
- Order dialog: thumbnail + name per image, drag or ↑/↓, mark the ground floor. First guess from the file names (natural sort plus `B1`, `basement`, `cellar`, `keller`, `UG`, `-1`, `ground`, `EG`, `OG1`, `1st`, `2F` …), as a tested function.
- The first floor's grid is copied to the others; each stays adjustable.
- Prepare panel: a floor list (add, rename, reorder, replace image, remove).

### Step 4: map maker
- Floor tabs (add blank / add copy, rename, reorder, delete); one size for all (D4).
- The floor below shows faintly while painting.
- New tiles: Stairs up, Stairs down; saving pairs them into stair links between neighbouring floors.
- "Use as encounter map" renders every floor and makes walls per floor. Undo is per floor.

### Step 5: starships and the rest
- Interior decks: station markers get a floor; battles copy all floors.
- Player window gets the faded floor below (D5, if confirmed).
- Browser test: three images uploaded and reordered, floor switch, a token up the stairs.

## 4. Progress

- [x] Step 1: data model (2026-11-17). Schema, [floors.ts](src/domain/rules/floors.ts), `patchFloor` / `addFloorTo` / `reorderFloors` / `removeFloorFrom` in [data/encounters.ts](src/data/encounters.ts) (removing a floor deletes its tokens and areas), starship battles copy every deck. Tests: [floors.test.ts](tests/rules/floors.test.ts), floors in [encounters.test.ts](tests/encounters.test.ts) and [starships.test.ts](tests/starships.test.ts). Nothing in the UI uses floors yet.
- [ ] Step 2: game table
- [ ] Step 3: uploading several images
- [ ] Step 4: map maker
- [ ] Step 5: starships and the rest

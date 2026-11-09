# Session Board Plan: sessions as a canvas of panels

Goal: a session stops being two markdown editors (Prep / Notes) and becomes a **board**: a canvas of panels (scenes, beats, clues, encounters, log entries …) that you arrange, connect and run from. What actually happened lives on the board next to what was planned. Unused panels go to the next session or to a campaign-wide drawer.

Written 2026-11-09 against `main` at `3f0f95c`. **P1–P3 built 2026-11-09** (see §12–§14 for what differs from this plan).

---

## 1. Where we stand

| Piece | Today | What changes |
|---|---|---|
| [SessionEditor.vue](components/editors/SessionEditor.vue) | Two `MarkdownEditor`s side by side: `attributes.scriptContent` (prep) and `attributes.notesContent` (notes, also copied into `content`). Mode only through the Attributes pane. | Replaced by the board (`SessionBoard.vue`) with a mode switch in the header. |
| `SessionAttributes` ([types/entities.ts](types/entities.ts)) | `mode`, `sessionNumber`, `date`, `scriptContent`, `notesContent` | Gains `board` (edges, viewport). `scriptContent` / `notesContent` are only read by the migration. |
| [sessions/log.vue](pages/campaign/[id]/sessions/log.vue) | Shows **prep** (`scriptContent`), not what happened | Shows Log panels in the order they happened, plan collapsed below. |
| [WidgetSession.vue](components/widgets/WidgetSession.vue) (GM screen) | Notes / Prep tabs | Removed from the widget list (see §9). The GM screen isn't used; its rework is a separate task. |
| [LinkBar.vue](components/LinkBar.vue) | Session links come from `scriptContent` | Links come from every panel's text. |
| [CAMPAIGN_FORMAT.md](CAMPAIGN_FORMAT.md) + import in [sync/backup.ts](sync/backup.ts) | Session prep goes in `scriptContent` | Still accepted and converted to panels; the format gains a `panels` list. |
| [useSeedData.ts](composables/useSeedData.ts) | Sample session with script + notes | Sample session as a board. |
| Vue Flow | Already used by [NotesGraph.vue](components/NotesGraph.vue) (`@vue-flow/core`, `node-toolbar`, `background`, `controls`) | Reused for the board. The relationship graph component itself is not reused; the board is its own component. |
| Encounters ([stores/encounter.ts](stores/encounter.ts)) | `status: prepared / active / resolved`, `resolution`, `combatLog` | Encounter panels read these to write their result. No change in the encounter code. |
| Player views (encounter, map, graph player pages) | None shows session text | Stays that way: nothing from the board ever goes there. |

---

## 2. Panel types

Every panel has: a **headline**, a **colour/icon by type**, a **status** where it makes sense, a **toolbar** (Vue Flow node toolbar) with its toggles and actions, and **tags**. Panels with text open the full `MarkdownEditor` in a side drawer (§5).

| Type | For | Shows on the board | Status / toggles | Actions |
|---|---|---|---|---|
| **Scene** | Detailed prep: read-aloud, NPC lines, maps | Headline, text preview, linked-entity chips | planned · played · continued · skipped | Open, Move to drawer, Move to next session |
| **Beat** | Quick prep: one line | Headline only, compact | Done tick | Move to drawer / next session |
| **Clue** | A secret or clue that can come up in any scene | Headline, short text | Revealed tick | Unrevealed ones are offered for carry-over |
| **Encounter** | Link to an existing encounter | Name, difficulty, status (prepared / active / resolved) | – | Run (opens the encounter), pick encounter |
| **Log** | What actually happened | Text, type badge, time on hover | Type: happened · changed · improvised · consequence; **Players should know** flag | Attach to panel, Detach |
| **Note** | Session-wide GM text: strong start, reminders, recap to read out | Headline, preview | – | Open |
| **Entity** | Reference card for an NPC, location, faction, quest, rumor … | Portrait/icon, name, one-line summary | – | Open entry, Quick panel |
| **Random table** | A random table to roll on | Table name, die, last result | – | Roll; *Log it* turns the result into a Log panel |
| **Reward** | Loot and XP planned for the session | XP amount, item list | Awarded tick | Award XP / Award treasure (existing dialogs, prefilled) |
| **Frame** | Groups panels visually: "Act 1", "The Docks" | Coloured box with a title, behind its panels | – | Rename, colour |

### Connections

| Kind | Drawn by | Looks | Meaning |
|---|---|---|---|
| **Plan** | You | Dashed, grey | "Leads to", branches, "if they go left" |
| **Sequence** | Automatically, when a panel is marked played / done / revealed in running mode | Solid, accent colour, numbered | The order things actually happened. You can drag to fix it. |
| **Attach** | Automatically, when a Log is added to a panel (or by dragging a Log onto one) | Short, dotted, Log colour | This Log belongs to that panel. |

A Log without an attach connection counts as improvised play.

---

## 3. Data model

### Why panels are their own table, not entities

I first suggested scenes as a new entity type. With ten panel types, every Beat and Log line would be an entity: it would show up in the entity sidebar lists, global search results, the relationship graph and the chronicle, and flood them. A separate table keeps the board self-contained, while links and search still reach into it (§7).

### New table `sessionPanels` (Dexie v19)

```ts
export interface DbSessionPanel {
  id?: number
  campaign_id: number
  session_id: number | null      // null = in the campaign drawer
  kind: 'scene' | 'beat' | 'clue' | 'encounter' | 'log' | 'note' | 'entity' | 'random-table' | 'reward' | 'frame'
  title: string
  content: string                // markdown; empty for link-only kinds
  status?: string                // per kind: planned/played/continued/skipped, done, revealed, awarded
  attrs: Record<string, unknown> // per kind, see below
  tags: string[]
  x: number; y: number           // position on the board
  w?: number; h?: number         // frames (and resized panels)
  parent_id?: number | null      // the frame it sits in
  origin_session_id?: number     // where it was first planned (drawer and carry-over show this)
  created_at: string
  updated_at: string
}
```

Index: `'++id, campaign_id, session_id, [campaign_id+session_id], kind'`.

`attrs` per kind:
- **log**: `logType`, `playersShouldKnow`, `recapChecked`, `at` (ISO time), `fromEncounterId?`
- **encounter**: `encounterId`, `resultLogged` (so the result is written once)
- **entity**: `entityId`
- **random-table**: `entityId`, `lastResult?`
- **reward**: `xp?`, `items` (text or item refs), `awardIds?` (the XP/treasure award rows it created)
- **frame**: `color`
- **scene**: `playedIn: number[]` (session ids, for scenes continued across sessions)

### On the session entity

`SessionAttributes` gains:

```ts
board?: {
  edges: { id: string; source: number; target: number; kind: 'plan' | 'sequence' | 'attach'; label?: string }[]
  viewport: { x: number; y: number; zoom: number }
  selectedPanelId?: number       // restored when you come back from an encounter
  migrated?: true
}
```

Edges live on the session because they only make sense on one board. When a panel leaves the board (drawer or next session), its edges are removed.

### Wiring

- Add `sessionPanels` to `VALUE_COLUMNS` (`attrs: {}`, `tags: []`), to the backup table list and write order in [backup.ts](sync/backup.ts), and to campaign/entity deletion in [useDb.ts](composables/useDb.ts) (deleting a session deletes its panels; deleting a campaign deletes all).
- New `dbApi.sessionPanels` (list by session, list drawer, add, update, move, delete) and a composable `useSessionBoard(sessionId)` that loads panels + edges and saves debounced, like the attribute draft.

---

## 4. Modes

The mode switch moves out of Attributes into the **header**: a segmented control **Planning · Running · Finished**. The Attributes pane keeps number and date.

| | Planning | Running | Finished |
|---|---|---|---|
| Board | Everything editable; add panels from the toolbar or the right-click menu | Still editable. Status toggles are larger, quick capture bar is shown | Read-mostly; panels can still be opened and fixed |
| Sequence links | – | Created as you mark panels | Kept |
| On switching in | – | Sets `date` to today if empty. Shows the **recap check** (§6) if the previous session has "players should know" Logs | Opens the **finish review** (§6) |

---

## 5. Editing a panel

- On the board a panel shows its headline, a preview (first lines, rendered) and linked-entity chips. Double-click or *Open* opens the **side drawer**.
- The drawer holds the full `MarkdownEditor` with its tab bar (**edit / mixed / preview**) and the **linked-entities bar** below it, plus the panel's headline, kind-specific fields (log type, encounter picker, XP …) and tags.
- Editing is not done inside the node on the canvas: typing there fights with dragging and zooming, and the links bar doesn't fit.

**Code that needs to change:** `LinkBar` is tied to an `entityId` and reads from the entity. It needs a mode that takes the text it should list links from (the panel's content), while still offering "open" / "create" for each link.

---

## 6. Running and finishing

### Quick capture bar (running mode)

A bar at the bottom of the session screen (not on the canvas): type a line, Enter creates a **Log** panel.
- It attaches to the **selected panel** (the one you last clicked or ticked). With nothing selected, it's an improvised Log placed near the last Log.
- `{{type: Name}}` links with the same autocomplete as the editor, and a type picker (happened / changed / improvised / consequence) plus the "players should know" flag on the bar.
- **Code that needs to change:** the autocomplete lives inside [MarkdownEditor.vue](components/MarkdownEditor.vue) (~2,000 lines). It has to move into a composable (`useEntityAutocomplete`) so the bar can use it.

### Encounter results

- *Run* on an Encounter panel saves the board's viewport and selected panel, then opens `/encounter/<id>?from=session-<sessionId>`. The encounter page shows a "Back to session" button when that query is present.
- When the session board loads (or the tab regains focus), every Encounter panel whose encounter is `resolved` and has `resultLogged` false gets a **Log** panel attached: outcome from `resolution` / `combatLog` (winner, defeated enemies, rounds, XP). Then `resultLogged` is set.
- This keeps the encounter code unaware of sessions.

### Recap check (switching to running)

A small dialog (or a strip at the top of the board) listing the previous session's Logs flagged **players should know**, each with a tick. Ticks are stored as `recapChecked` on those Logs.

### Finish review (switching to finished)

A dialog listing everything on the board that wasn't touched, with a choice per row and sensible defaults:

| Panel | Untouched means | Default | Other choices |
|---|---|---|---|
| Scene | status `planned` | Drawer | Next session, Drop (= skipped) |
| Scene | status `continued` | Next session | Drawer |
| Beat | not done | Next session | Drawer, Drop |
| Clue | not revealed | Next session | Drawer, Drop |
| Reward | not awarded | Next session | Drop |
| Encounter | not resolved | Next session | Drawer, Drop |

"Next session" = the session with the next `sessionNumber`. If there is none, it's created automatically in planning mode. Moved panels keep `origin_session_id`; a continued scene appears on both boards via `playedIn`.

### The drawer

A collapsible side panel on the session screen listing all panels with `session_id = null`, campaign-wide. Searchable by text and tag, filterable by kind, shows the origin session and linked entities. Drag a panel onto the board to place it. Any panel can be sent to the drawer from its toolbar.

---

## 7. Links, search, Session Log

- **Links**: when a panel's content changes, the session's `entityLinks` rows are rebuilt from the session's panels (source = session entity). Backlinks on an NPC then show "Session 4", as they do today.
- **Search**: global search also searches panel titles and content and opens the session with that panel selected. The session's own `content` field is no longer written.
- **Session Log page**: per session, the Logs in sequence order (falling back to time), each with the headline of the panel it's attached to. Below that, a collapsed "Plan" section listing the scenes with their status. Fixes the current bug that shows prep instead of notes.
- **Inspiration search** (low priority, last phase): a search across all campaigns' Scenes, with "copy to this campaign's drawer."

---

## 8. Migration

One Dexie upgrade (v19), plus the same converter (`sessionToBoard()` in `utils/`) used by every import path.

For each session entity that has no `board.migrated`:
1. Split `scriptContent` at headings (`#`, `##`, `###`). Each heading and its text becomes a **Scene** with status `planned`, or `played` if the session's mode was `finished` or `running`. Text before the first heading becomes a **Note** titled "Prep".
2. Scenes are laid out left to right in a row, joined by **plan** connections in their original order.
3. `notesContent` (or `content` if that's set and `notesContent` isn't) becomes one **Log** of type `happened`, titled "Notes (from the old editor)", placed below the row, not attached.
4. Set `board.migrated`. `scriptContent` and `notesContent` are **kept** for one release as a fallback and removed in the release after.

Import paths that need the converter:
- Backups from before v19 ([backup.ts](sync/backup.ts) import).
- Hand-written campaign files ([CAMPAIGN_FORMAT.md](CAMPAIGN_FORMAT.md)): `scriptContent` keeps working. The format additionally documents a `panels` list for sessions (kind, title, content, status), so Claude-generated campaigns can bring scenes, beats and clues directly.
- DM's Tome campaign import ([legacyImport.ts](sync/legacyImport.ts)), if it brings sessions.
- Seed data.

---

## 9. Party panel

A small floating panel on the **session screen** (not the canvas), toggled from the header, that can be collapsed or moved to a corner.

Per player character (role `pc`):
- **Name and level**, linking to the character's NPC entry.
- **Perception, Fortitude, Reflex, Will** modifiers, for rolling secret checks behind the screen.
- **Hero points**, with a **+1** button.

**Where the numbers come from:** StarTome doesn't keep Perception, saves or hero points itself. They come from the Play Buddy mirror (`pb_status` on the character: `defenses.perception/fort/ref/will`, `basic.heroPoints`, see [partylink/port.ts](partylink/port.ts)). So:
- Characters not linked to Play Buddy, or whose player doesn't share defenses, show "–" with a hint.
- **+1 hero point** sends a Play Buddy offer (`offerHeroPoint` in [usePlayBuddy.ts](composables/usePlayBuddy.ts)). It doesn't set the number directly, because the player's app owns it. There's no −1: players spend hero points themselves.
- A "+1 to all" button (`heroPointsForAll`, reason "Start of session") fits next to the recap check when you switch to running.

Later candidates: HP and conditions (also in the mirror), party wealth, starship status for SF2e.

---

## 10. Phases

| Phase | Contents | Done when |
|---|---|---|
| **P1 Board and data** ✅ done | `sessionPanels` table, v19 migration + converter, backup/delete wiring, `SessionBoard.vue` with all ten panel types and three connection kinds, palette to add panels, side drawer editor with tab bar and LinkBar, mode switch in the header, link rebuilding, Session Log page | Old sessions open as boards with their scenes and notes; you can prep a new session entirely on the board |
| **P2 Running** ✅ done | Status toggles per kind, automatic sequence connections, quick capture bar (autocomplete as composable), encounter Run + back + automatic result Logs, random table Roll / Log it, Reward award buttons, recap check | A session can be run from the board without opening another editor |
| **P3 Finishing** ✅ done | Finish review, campaign drawer with search, next-session creation, continued scenes across boards | Unused prep flows into the next session or the drawer |
| **P4 Extras** | Party floating panel (§9), remove the GM screen session widget, campaign-format `panels` docs, global search into panels, inspiration search across campaigns | – |

Tests (vitest): the migration converter (heading splitting, edge cases: no headings, empty prep, notes only), finish-review defaults, link rebuilding from panels, encounter result detection.

---

## 11. Risks and open questions

**Risks**
1. **Big component.** The board with ten panel types, three edge kinds, frames, drawer, capture bar and side editor is a lot for one file. Plan: `SessionBoard.vue` (canvas + state), one small component per panel kind under `components/session/`, `SessionPanelDrawer.vue`, `SessionCaptureBar.vue`, `SessionFinishDialog.vue`.
2. **Frames in Vue Flow.** Parent nodes move their children with them, but dragging a panel into or out of a frame needs custom handling (detect drop inside a frame, switch to relative coordinates).
3. **Autocomplete extraction** from `MarkdownEditor.vue` touches the editor every entry type uses. It needs care and a manual check of all editors afterwards.
4. **LinkBar for panel text** changes a component used by every entry type.
5. **Migration is one-way in practice.** Keeping `scriptContent` / `notesContent` for one release lets us recover if the converter gets something wrong.
6. **Performance.** Boards with 50+ panels and rendered previews: previews should render lazily and only for visible nodes.

7. **Party panel depends on Play Buddy.** Without linked players it only shows names and levels.

**Decisions (2026-11-09)**
1. **Party panel**: PC name and level, Perception and saves, hero points with +1 (§9).
2. **Log types**: happened, changed, improvised, consequence.
3. **Migrated scenes**: `played` for sessions in running or finished mode, `planned` otherwise.
4. **Reward panels award for real**: *Award XP* / *Award treasure* open the existing dialogs prefilled. Confirming creates the award, stores its ids in `awardIds` and ticks the panel.
5. **Next session**: created automatically (next `sessionNumber`, planning mode) when the finish review moves panels to it.
6. **Panel palette**: both. A toolbar along the top of the board (new panels land in the middle of the view) and a right-click menu on the canvas (the panel lands where you clicked).

---

## 12. P1 as built

- **Conversion runs when the database opens, not as a Dexie upgrade function.** An upgrade from an old version runs in a transaction that doesn't include tables created on the way (`sessionPanels`). `convertLegacySessions` in [utils/sessionBoard.ts](utils/sessionBoard.ts) runs in `db.on('ready')`, after every import ([backup.ts](sync/backup.ts) `convertSessions`), after the DM's Tome import and after seeding. It only touches sessions without `board.migrated`.
- **Panels have a `uid`** (besides the numeric id). Connections and frames point at uids, so imports and clones don't have to remap them.
- **The session's `content` is the board's text** (`boardText`: every panel's title, text and the `{{type: Name}}` of link panels, top to bottom). Global search and the session's links (backlinks on NPCs …) come from it, with no extra search code.
- **Status toggles** (planned/played/…, done, revealed, awarded) and the *players should know* flag are already in P1, on the panel toolbar and in the side editor. Sequence connections can be set by hand (click a connection); creating them automatically is still P2.
- **Frames resize** with a corner handle, not `@vue-flow/node-resizer` (no new dependency).
- Not done yet from P1's list: nothing. The GM screen session widget still shows the old fields (removal is P4).

## 13. P2 as built

- **"Happened next" chain**: in running mode, marking a Scene, Beat, Clue or Encounter as played / continued / done / revealed (or logging on it) links it after the panel that came up before. Notes, Logs, references and Rewards stay out of the chain. Sequence connections are numbered.
- **Capture bar** (running mode, below the board): logs attach to the selected panel (or are improvised), with the four log types, the *players should know* flag, and `{{type: …}}` plus `@name` autocomplete. Logging on an untouched Scene, Beat or Clue marks it played / done / revealed. The link search moved from MarkdownEditor into [useLinkAutocomplete.ts](composables/useLinkAutocomplete.ts), which both use.
- **Encounters**: *Run* opens `/encounter/<id>?from=session-<id>`; the encounter page's Back button then says "Back to session". When the board opens (or the window regains focus) in running mode, every resolved encounter on it gets a result Log once (`encounterOutcome`: rounds, defeated, who went down, XP, loot). The panel you ran from is selected again.
- **Random tables**: *Roll* shows the result on the panel; *Log it* turns it into a Log.
- **Rewards**: *Award XP* opens the existing Award XP dialog prefilled; a confirmed award is remembered in `awardIds` and ticks the panel. **Treasure is not awarded from the panel**: the treasure tools live in the Party page's wealth section, which isn't a standalone dialog yet.
- **Recap** opens when a session switches to running (only if there is something to show) and from the *Recap* button: the previous session's *players should know* Logs to tick off, and *+1 hero point to everyone* for players on Play Buddy.

## 14. P3 as built

- **Finish review** opens when a session switches to finished, and from the *Review* button on a finished board. Rows and defaults come from `finishReviewRows` ([utils/sessionBoard.ts](utils/sessionBoard.ts)); choices are *Next*, *Drawer* and *Leave* (a scene left behind is marked skipped).
- **Next session**: the session after this one by number (else by creation). If there is none it's created as "Session N+1" in planning mode.
- **Carried-over panels** land in a new frame "Carried over from …" below the next board's content (`carryOverLayout`). Their connections on the old board go. The next session's text (search, links) is rebuilt.
- **Continued scenes are copied, not shared**: the scene stays on the old board as *continued*, and a *planned* copy goes to the next board with `attrs.continuedFrom` (shown as "continued from …"). One row per board keeps every board self-contained; `playedIn` from §3 isn't used.

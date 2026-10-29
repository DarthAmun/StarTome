/**
 * First-run seed data — creates a guided PF2e demo campaign.
 * Only runs once (guarded by localStorage flag) and only if the DB is empty.
 */
import { getDb } from '~/composables/useDb'
import { extractLinks } from '~/composables/useEntityParser'
import { lsKey } from '~/utils/appNamespace'

const SEED_KEY = lsKey('seeded')

// ── Entity content — written as guided tutorials ──────────────────────────

const ENTITIES: Array<{ type: string; name: string; attributes: object; content: string }> = [
  {
    type: 'note',
    name: 'The Chronicle — Notes & Lore',
    attributes: { icon: 'gi-book-aura', tags: ['tutorial'] },
    content: `# Welcome to the Chronicle

The **Chronicle** is where you document the living world of your campaign. Every NPC, location, faction, quest, event, and session lives here as its own entry.

## Writing in Markdown

The editor supports full markdown:

- **Bold**, *italic*, ~~strikethrough~~
- # H1 / ## H2 / ### H3 headings
- Bullet lists (with ✦ symbols) and 1. numbered lists
- \`inline code\` and fenced code blocks
- > Blockquotes

## Callout Boxes

Use Obsidian-style callouts for tips, warnings, and lore:

> [!NOTE]
> This is a note callout. Great for GM reminders or boxed text.

> [!WARNING]
> Use this for important warnings your future self needs to see.

> [!TIP]
> Helpful tips or player-facing hints.

## Linking Entries Together

Reference any other entry using double curly braces:

{{npc: Aldric Vane}} {{location: The Shattered Vale}}

These become **clickable links** in preview mode. Open either linked entry and you'll see this note listed under *Linked From* — forming a bidirectional knowledge graph.

The **network icon** in the toolbar opens the full graph view showing how all your entries connect.

## GM-only Blocks

In **mixed** view, hover a paragraph and click the **lock** icon to mark it as GM-only. It becomes a hidden callout:

> [!hidden]
> Players never see this. It is left out of printouts, and exports can strip it too.

Use it for secrets inside otherwise player-safe text — like the one in {{npc: Aldric Vane}}'s entry.

## View Modes

Use the toolbar icons (top-right of the editor) to switch between:
- **Edit** — full-screen text editor
- **Split** — editor on the left, live preview on the right
- **Preview** — rendered output only`,
  },
  {
    type: 'npc',
    name: 'Aldric Vane',
    attributes: { title: 'Wandering Sellsword', race: 'Human', role: 'Ally / Guide', isAlive: true, status: 'Friendly' },
    content: `# NPC Entries

Use NPC entries to track every character your players might meet — allies, enemies, merchants, quest givers, and bystanders.

## Sidebar Fields

Fill in the panel on the right side of the editor:

- **Portrait** — upload an image file or paste a direct URL
- **Title** — e.g. *Captain of the Watch*, *Exiled Archmage*
- **Level / Race / Role** — quick-reference info shown in the list
- **Alive toggle** — when an NPC dies, flip this off; a skull icon appears in the list view so you never have to wonder
- **Status** — free text for relationship state: *Friendly*, *Hostile*, *Unknown*

## Aldric Vane

A weathered sellsword who has operated in the eastern territories for two decades. He knows {{location: The Shattered Vale}} better than anyone — and has reasons to keep some of that knowledge to himself.

**Personality:** Laconic, observant, drinks too much. Fiercely loyal once trust is established.

> [!hidden] Secret
> Aldric was once a junior member of {{faction: The Obsidian Circle}}. He fled after witnessing their first ritual and has been running from them ever since.

**Roleplaying Hook:** He'll initially deny knowing anything about the Circle. Sense Motive (DC 20 Perception) reveals he's lying. Making an Impression with Diplomacy (DC 18, after buying him a drink) gets him talking.`,
  },
  {
    type: 'location',
    name: 'The Shattered Vale',
    attributes: { locationType: 'wilderness', status: 'discovered' },
    content: `# Location Entries

Locations are places in your world — cities, dungeons, wilderness regions, buildings, or anything else that has a *where*.

## Sidebar Fields

- **Map Image** — upload a map specific to this location (battle map, regional map, floor plan)
- **Logo / Banner** — a heraldic symbol, city seal, or establishing image
- **Type** — City, Dungeon, Wilderness, Building, Region, or Other
- **Status** — Discovered, Undiscovered (hidden from players), or Destroyed

## Map Pins

Once you add a map image, you can **pin entities onto it**. Click anywhere on the map in preview mode to place a pin, then select which NPC, faction, or other entry to attach. This builds a spatial index — every pinned entity gets a *"Pinned at: [Location]"* backlink on its own entry.

## The World Atlas

The **Atlas** tab (globe icon on the spine) is your campaign-wide world map. Pin *Location* entries onto it to build your world geography visually.

## The Shattered Vale

A wind-scoured ravine three days east of the capital. The ground is fractured by a dozen deep chasms — remnants of an ancient cataclysm that split the earth and left the rock stained black.

**Notable Features:**
- The **Whispering Stones** — monoliths carved with a dead language no sage can fully translate
- **Echo Bridge** — a natural stone arch 40 ft above the canyon floor; the only safe crossing
- The **Glass Fields** — a quarter-mile radius of fused obsidian earth, epicenter of the {{event: The Night of Ash}}
- Hidden cave networks used by {{faction: The Obsidian Circle}} as a meeting point`,
  },
  {
    type: 'faction',
    name: 'The Obsidian Circle',
    attributes: { factionType: 'arcane', size: 'small', isSecret: true, headquartersName: 'The Shattered Vale' },
    content: `# Faction Entries

Factions represent guilds, cults, political bodies, mercenary companies, noble houses, or any organized group with shared goals.

## Sidebar Fields

- **Image** — banner, seal, coat of arms, or symbol
- **Type** — Criminal, Religious, Political, Mercenary, Arcane, or Other
- **Size** — Small (a handful of members) through Massive (nation-state level)
- **Secret** — marks the faction as hidden; a veil icon appears in the list so you remember players don't know this exists
- **Headquarters** — free text; can reference a location name

## The Obsidian Circle

A clandestine order of mages who believe the current reality is a mistake — a flawed draft written by gods who lost control. Their doctrine: the six Sealing Stones must be destroyed to allow the world to be rewritten correctly.

**Size:** ~12 active members (small)
**Known Goals:**
- Locate and destroy all six Sealing Stones
- Prevent any divine institution from learning of their work
- Recruit individuals who have been "failed by the gods"

**Known Members:**
- Magistra Serel — the Circle's founder, officially listed as deceased
- {{npc: Aldric Vane}} — former junior member, now a fugitive from the Circle

**Relations:**
- Hostile toward the Church of the Binding Flame (their direct theological opposite)
- Unknown relationship with the Crown's intelligence service`,
  },
  {
    type: 'quest',
    name: 'The Lost Seal',
    attributes: { status: 'active', questGiver: 'Elder Maren of the Council', reward: '300 gp + a formal favor from the Council' },
    content: `# Quest Entries

Track every mission, contract, rumor, and obligation the party has taken on — active investigations, side quests, completed storylines, and dormant hooks.

## Sidebar Fields

- **Status** — Active, Completed, Failed, or Dormant
- **Quest Giver** — who assigned or offered the task
- **Reward** — what's promised on completion (or what was actually given)

The **status badge** is visible in the quest list without opening the entry, so you always know what's in flight at a glance.

## The Lost Seal

Elder Maren has tasked the party with locating the Fourth Sealing Stone before {{faction: The Obsidian Circle}} reaches it. The Stone was last seen at {{location: The Shattered Vale}} in the aftermath of {{event: The Night of Ash}}.

**Urgency:** The Circle has a two-day head start.

**Complications:**
- The Glass Fields around the epicenter are magically unstable (spells cast there need a DC 5 flat check or fizzle)
- {{npc: Aldric Vane}} knows the cave routes but won't go inside

**Objective Tracker:**
- [x] Accepted the quest from Elder Maren
- [x] Traveled to the Shattered Vale
- [ ] Located the hidden cave entrance beneath Echo Bridge
- [ ] Retrieved the Fourth Seal
- [ ] Returned to Elder Maren safely`,
  },
  {
    type: 'event',
    name: 'The Night of Ash',
    attributes: { date: 'Year 412, 14th of Ember-Month', location: 'The Shattered Vale', significance: 'critical' },
    content: `# Event Entries

Events are moments in the **timeline** — battles, disasters, deaths, political shifts, magical catastrophes, and revelations. They give your world a sense of history.

## Sidebar Fields

- **Date** — in-world date in whatever format your calendar uses (free text; no parsing is done)
- **Location** — where it occurred (free text or a reference name)
- **Significance** — Minor, Major, or Critical — shown as a colored badge in the event list

## Using Events

Events work best when cross-referenced: write them into NPC backstories, location histories, and quest contexts. The {{event: The Night of Ash}} reference in other entries creates a web of cause and effect that makes your world feel cohesive.

## The Night of Ash

On the 14th of Ember-Month, Year 412, a column of black flame erupted from the depths of {{location: The Shattered Vale}}. Visible for fifty miles. By morning, a quarter-mile radius had been reduced to fused obsidian glass. Three villages evacuated. Forty-seven confirmed dead.

**Official Explanation:** "Naturally occurring geothermal release." (Widely disbelieved.)

**Actual Cause:** The Obsidian Circle performed their first Unsealing ritual here, partially activating the Fourth Seal before losing control of the energy cascade.

**Aftermath:**
- Royal investigators visited, filed a sealed report, and left
- {{faction: The Obsidian Circle}} activity in the region increased by all accounts
- {{npc: Aldric Vane}} was present and was the first to raise the alarm to local authorities`,
  },
  {
    type: 'session',
    name: 'Session 1: The Road to Ember',
    attributes: {
      mode: 'finished',
      sessionNumber: '1',
      date: '2024-01-15',
      scriptContent: `## Pre-Session Prep

Review the quest hook: the party has accepted Elder Maren's commission and are three days' travel from the Vale.

**Encounters to prep:**
- Road ambush (3 goblins + 1 hobgoblin sergeant) — use the Battlefield tab
- Optional: Travelling merchant (rumor source)

**NPCs ready:**
- {{npc: Aldric Vane}} — stats: AC 14, HP 45, attack +5 (1d8+3)

---

## Scene 1 — The Road (travel montage)

*Weather: overcast, cold wind from the east.*

Read aloud when they crest the hill:
> *"The road ahead cuts through open farmland, the kind of flat country where you can see trouble coming — or be seen. Smoke rises in thin columns from somewhere beyond the next ridge."*

**Hook:** A merchant cart is racing toward them from the east. The merchant is pale and won't stop. A DC 15 Perception check spots blood on the cart wheel.

---

## Scene 2 — The Ambush

**Trigger:** Halfway along the ridge road, the goblins attack from both sides.

*Use the Encounter tab (sword icon on the spine) to run this on a tactical map.*

The hobgoblin's goal: capture one party member for ransom. They'll retreat at 50% casualties.

**Loot:** 12 sp, a torn letter in Goblin mentioning "the glass fields."

---

## Scene 3 — Arrival at the Vale

Arrive at dusk. The air smells of sulfur. The black glass fields catch the last light strangely.

{{npc: Aldric Vane}} is camped here. He's already lit a fire and is pretending he doesn't know who they are.`,
      notesContent: `## What Actually Happened

**Players:** Alice (Sable the Ranger), Bob (Brother Aldous the Cleric), Carol (Zix the Wizard)

The merchant encounter worked perfectly — they chased the cart down and got the backstory hook.

The ambush went badly for the party. Carol cast Fear and sent 2 goblins fleeing, but the hobgoblin caught her off-guard and dropped her to 3 HP. Aldous spent two actions on a 2nd-rank Heal mid-combat.

They found the letter. Carol spent 10 minutes translating the Goblin — turns out she didn't know the language, so she had to Decipher Writing with Society (DC 15, barely passed).

**The Aldric Scene:** Bob immediately suspected him of being a plant. The whole table got paranoid. We ended the session there — great cliffhanger.

**For Next Session:**
- Bob wants to cast Detect Thoughts on Aldric; prep the mental landscape for that
- The cave entrance under Echo Bridge needs a proper description
- Carol is at 3 HP — do they short rest before continuing?`,
    },
    content: `# Session Entries

Session entries track individual play sessions — your prep notes beforehand and what actually happened during play.

## Two Documents Per Session

Each session has **two separate markdown areas** accessible from the sidebar:

- **Script / Prep** — written before the session: scenes, NPC stats, boxed read-aloud text, encounter triggers, potential hooks. Only the GM ever sees this.
- **Live Notes** — written during or after: what the players actually did, surprising decisions, notes for next time.

Keeping them separate means your prep isn't cluttered with in-session chaos, and your session record isn't buried in prep you never used.

## The Status Toggle

Use the **Mode** dropdown in the sidebar to move sessions through states:
- *Planning* — you're still prepping; shown with a quill icon
- *Running* — the session is live; shown with a sword icon
- *Finished* — archived; shown with a book icon

## Tips for Good Session Notes

- Reference entries liberally: {{npc: Aldric Vane}}, {{quest: The Lost Seal}}, {{location: The Shattered Vale}} — these backlinks let you reconstruct context later
- Use checklists in your script to track scene progress during play
- In live notes, record *surprising* player decisions first — those are the ones you'll forget
- Note what prep you didn't use; it might fit next session

## The Battlefield Tab

For tactical encounters, use the **Encounters** section (sword icon on the campaign spine). Each encounter gets its own map, token grid, fog of war, and HP tracker — completely separate from these session notes.`,
  },
]

// ── Main seed function ─────────────────────────────────────────────────────

export async function seedIfEmpty() {
  if (!import.meta.client) return
  if (localStorage.getItem(SEED_KEY)) return

  const db = getDb()

  // Don't overwrite a real user's data
  const campaignCount = await db.campaigns.count()
  if (campaignCount > 0) {
    localStorage.setItem(SEED_KEY, '1')
    return
  }

  const ts = new Date().toISOString()

  // ── Demo Campaign ──────────────────────────────────────────────────────
  const campaignId = await db.campaigns.add({
    name: 'Welcome to StarTome',
    description: "A guided tour of every feature. Each entry below explains how that section works. Delete this campaign whenever you're ready to start your real adventure.",
    game: 'pf2e',
    rules: { advancement: 'xp' },
    created_at: ts,
    updated_at: ts,
  }) as number

  // ── Notes (one per entity type) ───────────────────────────────────────
  const insertedIds: number[] = []
  for (const e of ENTITIES) {
    const id = await db.entities.add({
      campaign_id: campaignId,
      type: e.type,
      name: e.name,
      content: e.content,
      attributes: e.attributes,
      created_at: ts,
      updated_at: ts,
    }) as number
    insertedIds.push(id)
  }

  // ── Entity links — parse {{type: name}} refs from each entry's content ─
  for (let i = 0; i < ENTITIES.length; i++) {
    const sourceId = insertedIds[i]
    const content = ENTITIES[i].content
    // Also scan session scriptContent / notesContent if present
    const attrs = ENTITIES[i].attributes as any
    const extra = [attrs.scriptContent, attrs.notesContent].filter(Boolean).join('\n')
    const links = extractLinks(content + '\n' + extra)
    for (const link of links) {
      await db.entityLinks.add({
        source_id: sourceId,
        target_type: link.type,
        target_name: link.name,
        metadata: link.metadata ?? {},
      })
    }
  }

  // ── Demo Encounter ─────────────────────────────────────────────────────
  await db.encounters.add({
    campaign_id: campaignId,
    name: 'The Goblin Ambush — Demo Encounter',
    map_source: null,
    map_type: 'url',
    grid_size: 40,
    grid_offset_x: 0,
    grid_offset_y: 0,
    fog_data: {},
    viewport: { x: 0, y: 0, scale: 1 },
    combat_log: [],
    created_at: ts,
    updated_at: ts,
  })

  localStorage.setItem(SEED_KEY, '1')
}

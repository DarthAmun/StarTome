import { computed, ref, toRaw, watch } from 'vue'
import { defineStore } from 'pinia'
import { dbApi, parseJsonObject } from '~/composables/useDb'
import { isDoorWall } from '~/db/schema'
import { imageTypeOf } from '~/utils/image'
import { useEntities } from '~/composables/useEntities'
import type { DbEncounterWall, DbToken } from '~/composables/useDb'
import type { ShapeOverlay } from '~/composables/useEncounterCanvas'
import { rulesGet, rulesGetMany, rulesSetImage } from '~/composables/useRules'
import { isImageRef, resolveImageDataUrl, storeInlineImage } from '~/rules/images'
import { evaluateFormula } from '~/composables/useFormulaEvaluator'
import { freeSpots, rollInitiative, rulesScope, tokenStats, type Adjustment } from '~/rules/combat'
import { damageWithTemp, grantTemp } from '~/rules/hp'
import { cellsInArea, tokenInCells, type AreaOverlay, type AreaTrigger } from '~/rules/areas'
import type { EncounterStarship } from '~/rules/playerStarship'
import type { Heading, SensorMap, SensorRole } from '~/rules/sensorMap'
import type { Hazard, RulesEntity } from '~/types/rules'
import { parseDefeated, type DefeatedEnemy } from '~/rules/advancement'
import { healthState, type HealthState } from '~/composables/useConditions'
import { lsKey } from '~/utils/appNamespace'
import { campaignRules, DEFAULT_AUTOMATION, type AutomationSettings } from '~/types/game'
import {
  endOfTurn, hpChangeEffects, persistentCheck, recoveryCheck, revertChanges, startOfTurn,
  type ConditionChange, type Degree, type EffectResult, type TurnPromptSeed,
} from '~/rules/turnEffects'
import { playerWindow } from '~/utils/windowChannel'
import { parseJson, toPlain } from '~/utils/json'

const plain = toPlain
import { reportError } from '~/composables/useNotices'
import { ImageChannel, toPlayerToken } from '~/utils/playerPayload'

function buildTokenScope(token: EncounterToken, entry?: RulesEntity): Record<string, number> {
  return {
    ...rulesScope(entry, token.adjustment),
    ac: token.ac ?? 0,
    hp: token.hpCurrent ?? 0,
    hpmax: token.hpMax ?? 0,
    temphp: token.tempHp ?? 0,
  }
}

export interface CombatLogEntry {
  id: number
  round: number
  timestamp: number
  tokenId: number
  tokenName: string
  type: 'damage' | 'healing' | 'temp-hp' | 'roll' | 'condition-added' | 'condition-removed' | 'condition-changed' | 'death' | 'revival' | 'note' | 'timer-up'
  value?: number
  /** Part of a damage entry's value taken by temporary HP. */
  absorbed?: number
  /** A roll's degree of success against the target (COMBAT_PLAN.md §4). */
  degree?: Degree
  targetName?: string
  /** The roll was an attack: its degree reads Hit / Miss. */
  attack?: boolean
  conditionName?: string
  note?: string
  /** Made by the condition automation, not by hand. */
  auto?: boolean
}

/** A question the automation asks the GM (recovery check, persistent damage). Session-only. */
export type TurnPrompt = TurnPromptSeed & { id: number; tokenId: number; tokenName: string }

/** Options for an HP change: a critical hit, or hits taken while already at 0 HP. */
/** An area's saves to resolve: everyone inside, or the tokens a lingering area caught. */
export interface AreaPrompt {
  id: number
  areaId: string
  /** null = every token in the area when the prompt opens. */
  tokenIds: number[] | null
  /** Why it came up, e.g. "Goblin ends its turn in Cloudkill". */
  reason: string | null
}

/** How tokens join an encounter (COMBAT_PLAN.md §2). */
export interface PlaceOptions {
  /** How many to place, on free squares nearest the given one. */
  count?: number
  /** Look for free squares even for one token. */
  spread?: boolean
  /** Fights with the party (summons): no XP. */
  ally?: boolean
  /** Roll initiative right away (mid-fight adds). */
  rollInitiative?: boolean
  /** Log "joined the fight". */
  announce?: boolean
}

/** A token without a library or compendium link, typed in by hand. */
export interface BlankTokenInput {
  label: string
  hpMax: number | null
  ac: number | null
  size: number
  /** Added to the d20 for initiative (or `perception` in the encounter's formula). */
  initiativeModifier: number
}

export interface HpChangeOptions {
  critical?: boolean
  hitsAtZero?: number
  /** Damage taken by temporary HP in this change, logged as part of the damage. */
  absorbed?: number
}

/** What one turn change did by itself, so prevTurn can take exactly that back (session-only). */
interface TurnRecord {
  tokenId: number | null
  timerTokenId: number | null
  timerIds: string[]
  logIds: number[]
  effects: { tokenId: number; changes: ConditionChange[]; hpDelta: number; tempDelta?: number; died: boolean }[]
  promptIds: number[]
}

export interface Token {
  id: number
  name: string
  imageSource: string | null
  imageType: 'file' | 'url'
  linkedRulesId: string | null   // compendium creature/hazard
  adjustment: Adjustment | null  // weak/elite version of it
  linkedEntityId: number | null  // NPC entity this token represents
  isPlayerCharacter: boolean
  syncImage: boolean             // image mirrors the linked NPC portrait / creature token art
}

export interface LibraryTokenInput {
  name: string
  imageSource: string | null
  imageType: 'file' | 'url'
  linkedRulesId: string | null
  adjustment: Adjustment | null
  linkedEntityId: number | null
  isPlayerCharacter: boolean
  syncImage: boolean
}

export interface TokenCondition {
  name: string
  value: number | null  // null = no value (e.g. Prone), number = stage (e.g. Poisoned 2)
  hidden?: boolean      // DM-only; players never see it
  color?: string        // hex color resolved at add-time; falls back to catalog/hash
  icon?: string         // gi-* icon name resolved at add-time
  formula?: string      // persistent damage per turn, e.g. "2d6" (GM only)
}

/** Countdown on a token (e.g. a breath weapon recharge). Ticks down by one at
 *  the start of the token's turn; 0 means it is up. */
export interface TokenTimer {
  id: string
  name: string
  remaining: number
  duration: number             // value "Reset" restores
  visibleToPlayers?: boolean   // DM-only unless set
}

export type TurnRailPosition = 'top' | 'left' | 'right'
export type TurnRailSize = 'small' | 'medium' | 'large'
export interface PlayerViewPrefs {
  turnRailPosition: TurnRailPosition
  turnRailSize: TurnRailSize
  turnRailShowNames: boolean   // names beside portraits in the side docks
  hiddenTurns: 'omit' | 'mystery'  // hidden combatants: left out, or shown as "?"
}

/** Player-safe turn-rail entry; `isMystery` entries are hidden combatants shown as "?". */
export interface TurnOrderEntry {
  id: number
  name: string
  label: string | null
  imageSource: string | null
  initiative: number | null
  isDead: boolean
  isPlayerToken: boolean
  isMystery?: boolean
}

const PLAYER_VIEW_PREFS_KEY = lsKey('playerView')
const DEFAULT_PLAYER_VIEW_PREFS: PlayerViewPrefs = { turnRailPosition: 'right', turnRailSize: 'medium', turnRailShowNames: true, hiddenTurns: 'omit' }

export interface EncounterToken {
  id: number
  encounterId: number
  tokenId: number | null
  // From token join
  name: string
  imageSource: string | null
  imageType: 'file' | 'url'
  // Position
  gridX: number
  gridY: number
  size: number // 1 = 1x1, 2 = 2x2, etc.
  // State
  isVisible: boolean
  actsWhileHidden: boolean    // stays in the turn order while hidden from players
  isDead: boolean
  label: string | null
  conditions: TokenCondition[]
  hpCurrent: number | null
  hpMax: number | null
  tempHp: number              // temporary HP, 0 = none
  ac: number | null
  initiative: number | null
  notes: string | null
  linkedRulesId: string | null
  adjustment: Adjustment | null
  linkedEntityId: number | null
  visionRange: number | null  // tiles, null = infinite
  isPlayerToken: boolean      // default false
  isAlly: boolean             // fights with the party; no XP
  elevation: number | null
  timers: TokenTimer[]
  usesDying: boolean | null   // null = the default: party tokens do, others are defeated at 0 HP
  playerHealthState?: HealthState  // set only in player-sync payload; undefined in DM view
  /** On the sensor map (P6): its zone (null = on the battle map), heading and role, and Shield Points. */
  sensorZone: number | null
  sensorHeading: Heading | null
  sensorRole: SensorRole | null
  shieldPoints: number | null
  shieldMax: number | null
}

export interface Encounter {
  id: number
  campaignId: number
  name: string
  /** What the canvas loads: a data URL or http URL, resolved from `mapRef`. */
  mapSource: string | null
  /** What the row stores: an "img:<id>" ref or http URL. */
  mapRef: string | null
  mapType: 'file' | 'url'
  gridSize: number
  gridOffsetX: number
  gridOffsetY: number
  fogData: Record<string, 'hidden' | 'revealed' | 'partial'>
  viewport: { x: number; y: number; scale: number }
  tokens: EncounterToken[]
  combatLog: CombatLogEntry[]
  fovEnabled: boolean
  soundPlaylistId?: number
  initiativeFormula: string | null
  partyLevel: number | null   // override of the party tab's level for the meter
  status: string              // 'prepared' | 'active' | 'resolved'
  defeated: DefeatedEnemy[]   // enemies removed in Run mode; their XP counts at resolve
  areas: AreaOverlay[]        // bursts, cones … with their save effects (COMBAT_PLAN.md §5)
  /** A starship's interior or a starship battle (STARFINDER_PLAN.md P5); null otherwise. */
  starship: EncounterStarship | null
  /** The sensor map of a starship battle (P6). */
  sensorMap: SensorMap | null
}

export const useEncounterStore = defineStore('encounter', () => {
  // ── State ──────────────────────────────────────────────────────────────────
  const current = ref<Encounter | null>(null)
  const tokenLibrary = ref<Token[]>([])
  const isLoading = ref(false)
  const playerWindowOpen = ref(false)
  const shapeOverlays = ref<ShapeOverlay[]>([])
  const _activeTurnTokenId = ref<number | null>(null)
  const roundNumber = ref(1)
  const walls = ref<DbEncounterWall[]>([])
  const fovMode = ref<'gm' | 'active' | 'group'>('gm')
  const wallUndoStack = ref<number[]>([])
  const fovRecomputeTrigger = ref(0)
  const playerViewPrefs = ref<PlayerViewPrefs>(loadPlayerViewPrefs())
  let offPlayerReady: (() => void) | null = null
  // Timer ticks and condition changes made by nextTurn, so prevTurn can undo exactly those (session-only)
  const turnHistory: TurnRecord[] = []
  const automation = ref<AutomationSettings>({ ...DEFAULT_AUTOMATION })
  const turnPrompts = ref<TurnPrompt[]>([])
  /** Reminders for the token whose turn it is (actions lost or gained). */
  const turnNotes = ref<{ tokenId: number; text: string }[]>([])
  /** Save prompts of areas, oldest first (COMBAT_PLAN.md §5). Session-only. */
  const areaPrompts = ref<AreaPrompt[]>([])
  let nextAreaPromptId = 1
  let nextPromptId = 1

  // ── Computed ───────────────────────────────────────────────────────────────
  const allTokens = computed(() => current.value?.tokens ?? [])

  // Tokens that participate in turn order: alive and visible (or hidden but marked
  // to keep acting), sorted by initiative descending
  const initiativeOrder = computed(() =>
    (current.value?.tokens ?? [])
      .filter(t => (t.isVisible || t.actsWhileHidden) && !t.isDead)
      // The player starship acts through its crew; it takes a turn only once compromised (it has an initiative then)
      .filter(t => !(t.sensorRole === 'player-ship' && t.initiative === null))
      .sort((a, b) => {
        if (a.initiative === null && b.initiative === null) return 0
        if (a.initiative === null) return 1
        if (b.initiative === null) return -1
        return b.initiative - a.initiative
      })
  )

  // Index derived from the active token ID so it stays stable when the order
  // changes (tokens added, removed, hidden, initiative updated).
  const currentTurnIndex = computed(() => {
    if (_activeTurnTokenId.value === null) return 0
    const idx = initiativeOrder.value.findIndex(t => t.id === _activeTurnTokenId.value)
    return idx >= 0 ? idx : 0
  })

  // When the active token itself is hidden/removed/killed, advance to the same
  // position (clamped) in the new order rather than jumping to index 0.
  watch(initiativeOrder, (newOrder, oldOrder) => {
    if (_activeTurnTokenId.value === null) return
    if (newOrder.some(t => t.id === _activeTurnTokenId.value)) return
    if (!newOrder.length) { _activeTurnTokenId.value = null; return }
    const oldIdx = oldOrder.findIndex(t => t.id === _activeTurnTokenId.value)
    const next = Math.min(oldIdx >= 0 ? oldIdx : 0, newOrder.length - 1)
    _activeTurnTokenId.value = newOrder[next].id
  }, { flush: 'sync' })

  // ── Actions — Loading ──────────────────────────────────────────────────────
  /** `asPlayer`: the player view loads the same encounter, but never talks to player views itself. */
  async function loadEncounter(id: number, { asPlayer = false }: { asPlayer?: boolean } = {}) {
    await flushPendingSaves()
    isLoading.value = true
    try {
      const data = await dbApi.encounters.get(id)
      if (!data) return
      current.value = {
        ...data,
        id: data.id!,
        fogData: parseJson(data.fog_data, {} as Record<string, 'hidden' | 'revealed' | 'partial'>),
        viewport: parseJson(data.viewport, { x: 0, y: 0, scale: 1 }),
        combatLog: parseJson(data.combat_log || '[]', [] as CombatLogEntry[]),
        gridSize: data.grid_size,
        gridOffsetX: data.grid_offset_x,
        gridOffsetY: data.grid_offset_y,
        mapSource: await resolveImageDataUrl(data.map_source),
        mapRef: data.map_source,
        mapType: data.map_type,
        campaignId: data.campaign_id,
        fovEnabled: data.fov_enabled ?? false,
        soundPlaylistId: data.sound_playlist_id ?? undefined,
        initiativeFormula: data.initiative_formula ?? null,
        partyLevel: data.party_level ?? null,
        status: data.status ?? 'prepared',
        defeated: parseDefeated(data.defeated),
        areas: parseJson<AreaOverlay[]>(data.areas, []),
        starship: data.starship ?? null,
        sensorMap: data.sensor_map ?? null,
        tokens: ((data as any).tokens || []).map(normalizeToken),
      }
      roundNumber.value = data.round_number ?? 1
      const storedIndex = data.current_turn_index ?? 0
      _activeTurnTokenId.value = initiativeOrder.value[storedIndex]?.id ?? null
      walls.value = await dbApi.walls.list(id)
      wallUndoStack.value = []
      automation.value = campaignRules(await dbApi.campaigns.get(data.campaign_id)).automation
      turnHistory.length = 0
      turnPrompts.value = []
      turnNotes.value = []
      // One listener for the store's lifetime, whichever encounter is loaded.
      // A player view left open from before (GM reloaded) answers the hello.
      if (!asPlayer && !offPlayerReady) {
        offPlayerReady = playerWindow.onReady(() => resyncPlayer())
        playerWindow.onClosed(() => { playerWindowOpen.value = false })
      }
      if (!asPlayer) playerWindow.sendHello()
    } catch (err) {
      reportError('Loading the encounter', err)
    } finally {
      isLoading.value = false
    }
  }

  async function loadTokenLibrary() {
    try {
      const items = await dbApi.tokens.list()
      tokenLibrary.value = await Promise.all(items.map(normalizeLibraryToken))
    } catch (err) {
      reportError('Loading the token library', err)
    }
  }

  // ── Actions — Map ──────────────────────────────────────────────────────────
  async function setMap(source: string, type: 'file' | 'url') {
    if (!current.value) return
    current.value.mapSource = source
    current.value.mapRef = await storeInlineImage(source)
    current.value.mapType = type
    await persistEncounter()
    syncToPlayer()
  }

  async function updateGrid(gridSize: number, offsetX: number, offsetY: number) {
    if (!current.value) return
    current.value.gridSize = gridSize
    current.value.gridOffsetX = offsetX
    current.value.gridOffsetY = offsetY
    await persistEncounter()
    syncToPlayer()
  }

  async function updateViewport(viewport: { x: number; y: number; scale: number }) {
    if (!current.value) return
    // Kept for this session only; the player view has its own viewport
    current.value.viewport = viewport
  }

  // ── Actions — Fog of War ───────────────────────────────────────────────────
  async function setFogCell(key: string, state: 'hidden' | 'revealed' | 'partial') {
    if (!current.value) return
    current.value.fogData[key] = state
    syncToPlayer()
    // Painting fog touches many cells in a row: write the whole map once it pauses (PERF-10)
    scheduleFogSave()
  }

  async function hideAllFog() {
    if (!current.value) return
    current.value.fogData = { _allHidden: 'hidden' } as any
    syncToPlayer()
    await persistFog()
  }

  async function clearAllFog() {
    if (!current.value) return
    current.value.fogData = {}
    syncToPlayer()
    await persistFog()
  }

  let fogTimer: ReturnType<typeof setTimeout> | null = null
  let fogPending: { id: number; data: Record<string, string> } | null = null
  function scheduleFogSave() {
    if (!current.value) return
    fogPending = { id: current.value.id, data: plain(current.value.fogData) }
    if (fogTimer) clearTimeout(fogTimer)
    fogTimer = setTimeout(() => { void flushFog() }, 400)
  }
  async function flushFog() {
    if (fogTimer) { clearTimeout(fogTimer); fogTimer = null }
    const pending = fogPending
    fogPending = null
    if (!pending) return
    try {
      await dbApi.encounters.update({ id: pending.id, fog_data: pending.data })
    } catch (err) {
      reportError('Saving the fog of war', err)
    }
  }
  async function persistFog() {
    scheduleFogSave()
    await flushFog()
  }
  /** Writes anything still waiting (leaving the page, switching encounters). Never drops a save. */
  async function flushPendingSaves() {
    await flushFog()
  }

  // ── Actions — Tokens ──────────────────────────────────────────────────────
  /** Places a library token. `needsLinkPrompt` is true only for a plain token
   *  with no creature, NPC or PC association — the caller then offers the
   *  "Link to Stat Block?" dialog for the returned instance. */
  async function addTokenToEncounter(tokenId: number, gridX: number, gridY: number): Promise<{ token: EncounterToken | null; needsLinkPrompt: boolean }> {
    if (!current.value) return { token: null, needsLinkPrompt: false }
    const libToken = tokenLibrary.value.find(t => t.id === tokenId)
    const linkedRulesId = libToken?.linkedRulesId ?? null
    const adjustment = libToken?.adjustment ?? null
    const linkedEntityId = libToken?.linkedEntityId ?? null

    // A broken link (entry gone after a re-sync) must not block placement.
    const entry = linkedRulesId ? await rulesGet(linkedRulesId).catch(() => undefined) : undefined
    const stats = tokenStats(entry, adjustment)

    try {
      const result = await dbApi.encounterTokens.add({
        encounterId: current.value.id,
        tokenId,
        gridX,
        gridY,
        size: stats.size,
        isVisible: 1,
        hpCurrent: stats.hpMax,
        hpMax: stats.hpMax,
        ac: stats.ac,
        linkedRulesId,
        adjustment,
        linkedEntityId,
        isPlayerToken: libToken?.isPlayerCharacter ?? false,
      })
      current.value.tokens.push(normalizeToken(result))
      syncToPlayer()
      const needsLinkPrompt = !linkedRulesId && !linkedEntityId && !libToken?.isPlayerCharacter
      // Return the reactive instance from the array, not the raw object
      return { token: current.value.tokens[current.value.tokens.length - 1], needsLinkPrompt }
    } catch (err) {
      reportError('Placing the token', err)
      return { token: null, needsLinkPrompt: false }
    }
  }

  // ── Sensor map (STARFINDER_PLAN.md P6) ─────────────────────────────────────
  /**
   * Puts a starship or starship hazard from the compendium on the sensor map,
   * or the party's own ship (`rulesId` null, with its name and HP/SP). It's an
   * encounter token with a zone: the turn order, HP, conditions and the stat
   * panel work as for any token; the battle map doesn't show it.
   */
  async function addSensorToken(input: {
    rulesId: string | null; zone: number; heading: Heading; role: SensorRole; ally?: boolean
    name?: string; hp?: number | null; hpMax?: number | null; sp?: number | null; spMax?: number | null; ac?: number | null
  }): Promise<EncounterToken | null> {
    if (!current.value) return null
    try {
      const entry = input.rulesId ? await rulesGet(input.rulesId) : null
      const stats = tokenStats(entry ?? null)
      const shields = entry?.kind === 'starship' ? (entry as { shields?: { max: number } | null }).shields?.max ?? null : null
      const img = input.rulesId ? await dbApi.linkedImages.get(null, input.rulesId) : null
      keepTurnPointer()
      const result = await dbApi.encounterTokens.add({
        encounterId: current.value.id, tokenId: null, gridX: -1000, gridY: -1000, size: 1, isVisible: 1,
        label: input.name ?? null,
        hpCurrent: input.hp ?? stats.hpMax, hpMax: input.hpMax ?? stats.hpMax, ac: input.ac ?? stats.ac,
        linkedRulesId: input.rulesId, isAlly: input.ally || input.role === 'player-ship',
        imageSource: img?.source ?? null, imageType: img?.type ?? 'file',
      })
      const sp = input.sp ?? shields
      const fields = {
        sensor_zone: input.zone, sensor_heading: input.heading, sensor_role: input.role,
        shield_points: sp, shield_max: input.spMax ?? sp,
        // The player starship has no initiative of its own (it joins only when compromised)
        acts_while_hidden: 0,
      }
      await dbApi.encounterTokens.update({ id: result.id!, sensorZone: fields.sensor_zone, sensorHeading: fields.sensor_heading, sensorRole: fields.sensor_role, shieldPoints: fields.shield_points, shieldMax: fields.shield_max })
      const token = normalizeToken({ ...result, ...fields })
      current.value.tokens.push(token)
      syncToPlayer()
      return token
    } catch (err) {
      reportError('Placing the starship', err)
      return null
    }
  }

  /** Moves a sensor-map token to another zone and/or turns it. */
  async function moveSensorToken(id: number, zone: number | null, heading?: Heading) {
    const t = current.value?.tokens.find(x => x.id === id)
    if (!t || t.sensorZone == null) return
    const zones = current.value?.sensorMap?.zones ?? 12
    const changes: Partial<EncounterToken> = {}
    if (zone != null) changes.sensorZone = Math.max(0, Math.min(zones - 1, zone))
    if (heading) changes.sensorHeading = heading
    await updateToken(id, changes)
  }

  /** Shield Points of a sensor-map token (clamped to 0…max). */
  async function setShields(id: number, value: number) {
    const t = current.value?.tokens.find(x => x.id === id)
    if (!t) return
    await updateToken(id, { shieldPoints: Math.max(0, Math.min(t.shieldMax ?? value, Math.round(value))) })
  }

  /** Places a compendium creature (or hazard) directly, without a library token. */
  async function addCreatureToEncounter(rulesId: string, gridX: number, gridY: number, adjustment: Adjustment | null = null, opts: PlaceOptions = {}): Promise<EncounterToken[]> {
    if (!current.value) return []
    try {
      const entry = await rulesGet(rulesId)
      if (!entry) return []
      const stats = tokenStats(entry, adjustment)
      const img = await dbApi.linkedImages.get(null, rulesId)
      const spots = placeSpots(gridX, gridY, stats.size, opts)
      keepTurnPointer()
      const added: EncounterToken[] = []
      for (const spot of spots) {
        const result = await dbApi.encounterTokens.add({
          encounterId: current.value.id,
          tokenId: null,
          gridX: spot.x,
          gridY: spot.y,
          size: stats.size,
          isVisible: 1,
          hpCurrent: stats.hpMax,
          hpMax: stats.hpMax,
          ac: stats.ac,
          linkedRulesId: rulesId,
          adjustment,
          isAlly: opts.ally,
          initiative: opts.rollInitiative ? rollFor({ adjustment, ac: stats.ac, hpCurrent: stats.hpMax, hpMax: stats.hpMax } as EncounterToken, entry) : null,
          imageSource: img?.source ?? null,
          imageType: img?.type ?? 'file',
        })
        const token = normalizeToken(result)
        current.value.tokens.push(token)
        added.push(token)
      }
      if (opts.announce) announce(added)
      syncToPlayer()
      return added
    } catch (err) {
      reportError('Placing the creature', err)
      return []
    }
  }

  /** Places tokens typed in by hand (name, HP, AC), with no library or compendium link. */
  async function addBlankToken(input: BlankTokenInput, gridX: number, gridY: number, opts: PlaceOptions = {}): Promise<EncounterToken[]> {
    if (!current.value) return []
    try {
      const size = Math.max(1, Math.floor(input.size) || 1)
      const spots = placeSpots(gridX, gridY, size, opts)
      keepTurnPointer()
      const label = input.label.trim() || 'Token'
      const added: EncounterToken[] = []
      for (const [i, spot] of spots.entries()) {
        const result = await dbApi.encounterTokens.add({
          encounterId: current.value.id,
          tokenId: null,
          gridX: spot.x,
          gridY: spot.y,
          size,
          isVisible: 1,
          label: spots.length > 1 ? `${label} ${i + 1}` : label,
          hpCurrent: input.hpMax,
          hpMax: input.hpMax,
          ac: input.ac,
          isAlly: opts.ally,
          initiative: opts.rollInitiative ? rollFor({ hpCurrent: input.hpMax, hpMax: input.hpMax, ac: input.ac } as EncounterToken, undefined, input.initiativeModifier) : null,
        })
        const token = normalizeToken(result)
        current.value.tokens.push(token)
        added.push(token)
      }
      if (opts.announce) announce(added)
      syncToPlayer()
      return added
    } catch (err) {
      reportError('Placing the token', err)
      return []
    }
  }

  /** Where new tokens go: the square itself, or free squares nearest it. */
  function placeSpots(gridX: number, gridY: number, size: number, opts: PlaceOptions) {
    const count = Math.max(1, Math.min(20, Math.floor(opts.count ?? 1)))
    if (count === 1 && !opts.spread) return [{ x: gridX, y: gridY }]
    return freeSpots({ x: gridX, y: gridY }, current.value?.tokens ?? [], count, size)
  }

  /** A token joining mid-fight with a higher initiative mustn't take over the turn of whoever is acting. */
  function keepTurnPointer() {
    if (_activeTurnTokenId.value === null && initiativeOrder.value.length && current.value?.status === 'active') {
      _activeTurnTokenId.value = initiativeOrder.value[currentTurnIndex.value].id
    }
  }

  function announce(tokens: EncounterToken[]) {
    for (const t of tokens) appendLogEntry({ tokenId: t.id, tokenName: t.label || t.name, type: 'note', note: 'joined the fight' })
  }

  /** Links a placed token to a compendium entry (or switches weak/elite) and
   *  takes over its HP, AC and size. Damage already taken carries over. */
  async function setTokenRulesLink(instanceId: number, rulesId: string | null, adjustment: Adjustment | null = null) {
    const token = getToken(instanceId)
    if (!token) return
    const entry = rulesId ? await rulesGet(rulesId) : undefined
    if (!entry) {
      await updateToken(instanceId, { linkedRulesId: null, adjustment: null })
      return
    }
    const stats = tokenStats(entry, adjustment)
    const damage = token.hpMax !== null && token.hpCurrent !== null ? token.hpMax - token.hpCurrent : 0
    const updates: Partial<EncounterToken> = { linkedRulesId: rulesId, adjustment, size: stats.size }
    if (stats.hpMax !== null) {
      Object.assign(updates, { hpMax: stats.hpMax, hpCurrent: Math.max(0, stats.hpMax - damage) })
      token.hpCurrent = updates.hpCurrent!  // a stat change, not damage or healing: keep it out of the combat log
    }
    if (stats.ac !== null) updates.ac = stats.ac
    await updateToken(instanceId, updates)
  }

  async function moveToken(instanceId: number, gridX: number, gridY: number) {
    if (!current.value) return
    const token = current.value.tokens.find(t => t.id === instanceId)
    if (!token) return
    // Lingering areas that trigger on entering: inside now, not before
    const entered = lingeringAreas('enter').filter(a => !tokenInCells(areaCells(a), token))
    token.gridX = gridX
    token.gridY = gridY
    for (const a of entered) {
      if (tokenInCells(areaCells(a), token)) openAreaPrompt(a.id, [token.id], `${token.label || token.name} enters ${a.label}`)
    }
    await dbApi.encounterTokens.update({ id: instanceId, gridX, gridY })
    syncToPlayer()
  }

  async function updateToken(instanceId: number, updates: Partial<EncounterToken>, hpOpts: HpChangeOptions = {}) {
    if (!current.value) return
    const token = current.value.tokens.find(t => t.id === instanceId)
    if (!token) return
    updates = withHpEffects(token, updates, hpOpts)

    // ── Detect log-worthy changes before mutating ──────────────────────────
    const tokenName = token.label || token.name
    const absorbed = hpOpts.absorbed ?? 0
    const hpDiff = 'hpCurrent' in updates && updates.hpCurrent !== null && token.hpCurrent !== null && token.hpCurrent !== undefined
      ? (updates.hpCurrent as number) - token.hpCurrent : 0
    if (hpDiff < 0 || absorbed > 0) {
      appendLogEntry({ tokenId: instanceId, tokenName, type: 'damage', value: Math.max(0, -hpDiff) + absorbed, ...(absorbed ? { absorbed } : {}) })
    } else if (hpDiff > 0) appendLogEntry({ tokenId: instanceId, tokenName, type: 'healing', value: hpDiff })
    // Temp HP set by hand (not lost to damage) is logged as a gain only
    if ('tempHp' in updates && (updates.tempHp ?? 0) > token.tempHp) {
      appendLogEntry({ tokenId: instanceId, tokenName, type: 'temp-hp', value: updates.tempHp ?? 0 })
    }
    if ('isDead' in updates) {
      if (updates.isDead && !token.isDead) appendLogEntry({ tokenId: instanceId, tokenName, type: 'death' })
      else if (!updates.isDead && token.isDead) appendLogEntry({ tokenId: instanceId, tokenName, type: 'revival' })
    }
    if ('conditions' in updates && updates.conditions) {
      const oldNames = new Set(token.conditions.map(c => c.name))
      const newNames = new Set(updates.conditions.map(c => c.name))
      for (const n of newNames) if (!oldNames.has(n)) appendLogEntry({ tokenId: instanceId, tokenName, type: 'condition-added', conditionName: n })
      for (const n of oldNames) if (!newNames.has(n)) appendLogEntry({ tokenId: instanceId, tokenName, type: 'condition-removed', conditionName: n })
    }

    Object.assign(token, updates)
    const dbUpdates: Record<string, any> = { id: instanceId }
    if ('isVisible' in updates) dbUpdates.isVisible = updates.isVisible ? 1 : 0
    if ('actsWhileHidden' in updates) dbUpdates.actsWhileHidden = updates.actsWhileHidden ? 1 : 0
    if ('isDead' in updates) dbUpdates.isDead = updates.isDead ? 1 : 0
    if ('size' in updates) dbUpdates.size = updates.size
    if ('hpCurrent' in updates) dbUpdates.hpCurrent = updates.hpCurrent
    if ('hpMax' in updates) dbUpdates.hpMax = updates.hpMax
    if ('tempHp' in updates) dbUpdates.tempHp = Math.max(0, updates.tempHp ?? 0)
    if ('ac' in updates) dbUpdates.ac = updates.ac
    if ('initiative' in updates) dbUpdates.initiative = updates.initiative
    if ('label' in updates) dbUpdates.label = updates.label
    if ('notes' in updates) dbUpdates.notes = updates.notes
    if ('conditions' in updates) dbUpdates.conditions = plain(updates.conditions)
    if ('linkedRulesId' in updates) dbUpdates.linkedRulesId = updates.linkedRulesId
    if ('adjustment' in updates) dbUpdates.rulesAdjustment = updates.adjustment
    if ('linkedEntityId' in updates) dbUpdates.linkedEntityId = updates.linkedEntityId
    if ('visionRange' in updates) dbUpdates.visionRange = updates.visionRange
    if ('isPlayerToken' in updates) dbUpdates.isPlayerToken = updates.isPlayerToken ? 1 : 0
    if ('isAlly' in updates) dbUpdates.isAlly = updates.isAlly ? 1 : 0
    if ('elevation' in updates) dbUpdates.elevation = updates.elevation
    if ('timers' in updates) dbUpdates.timers = plain(updates.timers)
    if ('usesDying' in updates) dbUpdates.usesDying = updates.usesDying
    if ('sensorZone' in updates) dbUpdates.sensorZone = updates.sensorZone
    if ('sensorHeading' in updates) dbUpdates.sensorHeading = updates.sensorHeading
    if ('sensorRole' in updates) dbUpdates.sensorRole = updates.sensorRole
    if ('shieldPoints' in updates) dbUpdates.shieldPoints = updates.shieldPoints
    if ('shieldMax' in updates) dbUpdates.shieldMax = updates.shieldMax
    await dbApi.encounterTokens.update(dbUpdates as { id: number })
    if ('isPlayerToken' in updates && fovMode.value === 'group') {
      fovRecomputeTrigger.value++
    }
    syncToPlayer()
  }

  // ── Actions — Combat Log ──────────────────────────────────────────────────
  async function appendLogEntry(partial: Omit<CombatLogEntry, 'id' | 'round' | 'timestamp'>) {
    if (!current.value) return
    const log = current.value.combatLog
    const entry: CombatLogEntry = {
      id: log.length > 0 ? log[log.length - 1].id + 1 : 1,
      round: roundNumber.value,
      timestamp: Date.now(),
      ...partial,
    }
    log.push(entry)
    await persistCombatLog()
  }

  /** A roll from a token's stat block: what was rolled (note), the total and, against a target, the degree. */
  function logRoll(tokenId: number, roll: { label: string; total: number; degree?: Degree | null; targetName?: string | null; attack?: boolean }) {
    const token = getToken(tokenId)
    if (!token) return
    return appendLogEntry({
      tokenId, tokenName: token.label || token.name, type: 'roll', note: roll.label, value: roll.total,
      ...(roll.degree ? { degree: roll.degree } : {}), ...(roll.targetName ? { targetName: roll.targetName } : {}),
      ...(roll.attack ? { attack: true } : {}),
    })
  }

  async function addLogNote(tokenId: number, note: string) {
    if (!current.value) return
    const token = current.value.tokens.find(t => t.id === tokenId)
    if (!token) return
    appendLogEntry({ tokenId, tokenName: token.label || token.name, type: 'note', note })
  }

  async function clearCombatLog() {
    if (!current.value) return
    current.value.combatLog = []
    await persistCombatLog()
  }

  async function persistCombatLog() {
    if (!current.value) return
    try {
      await dbApi.encounters.update({ id: current.value.id, combat_log: plain(current.value.combatLog) })
    } catch (err) {
      reportError('Saving the combat log', err)
    }
  }

  async function removeToken(instanceId: number) {
    if (!current.value) return
    try {
      current.value.tokens = current.value.tokens.filter(t => t.id !== instanceId)
      await dbApi.encounterTokens.remove(instanceId)
      syncToPlayer()
    } catch (err) {
      reportError('Removing the token', err)
    }
  }

  /** With image sync on, the token and its linked entry share one image: a token
   *  image that differs is written to the entry (the NPC portrait when an NPC is
   *  linked, else the compendium entry's token art); an empty one adopts the
   *  entry's image. Returns the input with the resolved image. */
  async function syncLinkedImage(data: LibraryTokenInput): Promise<LibraryTokenInput> {
    if (!data.syncImage || (!data.linkedEntityId && !data.linkedRulesId)) return data
    const own = data.imageSource?.trim() || null
    if (!own) {
      const linked = await dbApi.linkedImages.get(data.linkedEntityId, data.linkedRulesId)
      return linked ? { ...data, imageSource: linked.source, imageType: linked.type } : data
    }
    if (data.linkedEntityId) {
      const entities = useEntities()
      const ent = entities.entities.find(e => e.id === data.linkedEntityId)
      const attrs = (ent?.attributes ?? parseJsonObject((await dbApi.entities.get(data.linkedEntityId))?.attributes)) as Record<string, any>
      // A stored portrait is a ref: compare the image itself, or every save would store it again
      const current = isImageRef(attrs.portraitSource) ? await resolveImageDataUrl(attrs.portraitSource) : attrs.portraitSource
      if (current !== own) {
        await entities.updateEntity(data.linkedEntityId, { attributes: { ...attrs, portraitSource: own, portraitType: imageTypeOf(own) } as any })
      }
    } else if (data.linkedRulesId) {
      const current = await dbApi.linkedImages.get(null, data.linkedRulesId)
      if (current?.source !== own) await rulesSetImage(data.linkedRulesId, 'tokenImg', own)
    }
    return { ...data, imageSource: own, imageType: imageTypeOf(own) }
  }

  /** A token that stands for a party member is a PC exactly when the party says so (ARCH-01). */
  async function withPartyPcFlag(id: number | null, input: LibraryTokenInput): Promise<LibraryTokenInput> {
    const { partyPcFlag } = await import('~/composables/useParty')
    const fromParty = await partyPcFlag(id, input.linkedEntityId)
    return fromParty == null ? input : { ...input, isPlayerCharacter: fromParty }
  }

  async function updateLibraryToken(id: number, input: LibraryTokenInput) {
    try {
      const data = await syncLinkedImage(await withPartyPcFlag(id, input))
      await dbApi.tokens.update(id, data)
      const token = tokenLibrary.value.find(t => t.id === id)
      const pcChanged = !!token && token.isPlayerCharacter !== data.isPlayerCharacter
      if (token) Object.assign(token, data)
      // A changed PC flag carries over to every placement of this token
      if (pcChanged) await dbApi.encounterTokens.setPlayerFlagForLibraryToken(id, data.isPlayerCharacter)
      // Placed instances of this token read their image through the library entry
      for (const t of current.value?.tokens ?? []) {
        if (t.tokenId !== id) continue
        Object.assign(t, { name: data.name, imageSource: data.imageSource, imageType: data.imageType })
        if (pcChanged) t.isPlayerToken = data.isPlayerCharacter
      }
      if (pcChanged) fovRecomputeTrigger.value++
      syncToPlayer()
    } catch (err) {
      reportError('Saving the library token', err)
    }
  }

  async function addToLibrary(input: LibraryTokenInput): Promise<Token | null> {
    try {
      const row = await dbApi.tokens.create(await syncLinkedImage(await withPartyPcFlag(null, input)))
      if (!row) return null
      const token = await normalizeLibraryToken(row)
      tokenLibrary.value.push(token)
      return tokenLibrary.value[tokenLibrary.value.length - 1]
    } catch (err) {
      reportError('Adding the token to the library', err)
      return null
    }
  }

  async function normalizeLibraryToken(t: DbToken): Promise<Token> {
    const token: Token = {
      id: t.id!,
      name: t.name,
      imageSource: t.image_source,
      imageType: t.image_type,
      linkedRulesId: t.linked_rules_id ?? null,
      adjustment: t.rules_adjustment ?? null,
      linkedEntityId: t.linked_entity_id ?? null,
      isPlayerCharacter: Boolean(t.is_player_character),
      syncImage: Boolean(t.sync_image),
    }
    if (token.syncImage) {
      const img = await dbApi.linkedImages.get(token.linkedEntityId, token.linkedRulesId).catch(() => null)
      if (img) { token.imageSource = img.source; token.imageType = img.type }
    }
    return token
  }

  // ── Actions — Windows ─────────────────────────────────────────────────────
  async function openPlayerWindow() {
    if (!current.value) return
    playerWindow.open(current.value.id)
    // The new window says "ready" once loaded; that triggers the first full sync
  }

  async function closePlayerWindow() {
    playerWindow.close()
    playerWindowOpen.value = false
  }

  function setShapeOverlays(shapes: ShapeOverlay[]) {
    shapeOverlays.value = shapes
    syncToPlayer()
  }

  function nextTurn() {
    const order = initiativeOrder.value
    if (!order.length) return
    const idx = currentTurnIndex.value
    const ending = order[idx]
    if (idx + 1 >= order.length) {
      _activeTurnTokenId.value = order[0].id
      roundNumber.value++
      expireAreas()
    } else {
      _activeTurnTokenId.value = order[idx + 1].id
    }
    const record: TurnRecord = { tokenId: _activeTurnTokenId.value, timerTokenId: null, timerIds: [], logIds: [], effects: [], promptIds: [] }
    if (ending) applyEffects(ending, endOfTurn(ending.conditions, automation.value), record)
    tickTurnStartTimers(_activeTurnTokenId.value, record)
    const starting = _activeTurnTokenId.value !== null ? getToken(_activeTurnTokenId.value) : undefined
    turnNotes.value = []
    if (starting) {
      const fx = startOfTurn(starting.conditions, automation.value, usesDying(starting))
      applyEffects(starting, fx, record)
      turnNotes.value = fx.notes.map(text => ({ tokenId: starting.id, text }))
    }
    if (ending) lingerFor(ending, 'turn-end', 'ends its turn in')
    if (starting) lingerFor(starting, 'turn-start', 'starts its turn in')
    turnHistory.push(record)
    if (turnHistory.length > 200) turnHistory.shift()
    syncToPlayer()
    persistTurnState()
  }

  function prevTurn() {
    const order = initiativeOrder.value
    if (!order.length) return
    const idx = currentTurnIndex.value
    if (idx === 0 && roundNumber.value <= 1) return
    undoTurn(_activeTurnTokenId.value)
    turnNotes.value = []
    if (idx === 0) {
      if (roundNumber.value > 1) {
        roundNumber.value--
        _activeTurnTokenId.value = order[order.length - 1].id
      }
    } else {
      _activeTurnTokenId.value = order[idx - 1].id
    }
    syncToPlayer()
    persistTurnState()
  }

  // ── Actions — Timers ──────────────────────────────────────────────────────
  function setTimers(tokenId: number, timers: TokenTimer[]) {
    return updateToken(tokenId, { timers })
  }

  function addTimer(tokenId: number, name: string, turns: number, visibleToPlayers = false) {
    const token = getToken(tokenId)
    if (!token || !name.trim() || turns < 1) return
    const timer: TokenTimer = { id: `tmr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: name.trim(), remaining: turns, duration: turns, visibleToPlayers }
    return setTimers(tokenId, [...token.timers, timer])
  }

  function resetTimer(tokenId: number, timerId: string) {
    const token = getToken(tokenId)
    if (!token) return
    return setTimers(tokenId, token.timers.map(t => t.id === timerId ? { ...t, remaining: t.duration } : t))
  }

  function removeTimer(tokenId: number, timerId: string) {
    const token = getToken(tokenId)
    if (!token) return
    return setTimers(tokenId, token.timers.filter(t => t.id !== timerId))
  }

  /** Start of `tokenId`'s turn: count its running timers down by one. Callers sync. */
  function tickTurnStartTimers(tokenId: number | null, record: TurnRecord) {
    const token = tokenId !== null ? getToken(tokenId) : undefined
    if (!token?.timers.length) return
    record.timerTokenId = token.id
    token.timers = token.timers.map(t => {
      if (t.remaining <= 0) return t
      record.timerIds.push(t.id)
      if (t.remaining === 1) {
        const id = logNow({ tokenId: token.id, tokenName: token.label || token.name, type: 'timer-up', note: t.name })
        if (id !== undefined) record.logIds.push(id)
      }
      return { ...t, remaining: t.remaining - 1 }
    })
    if (record.timerIds.length) dbApi.encounterTokens.update({ id: token.id, timers: plain(token.timers) }).catch(err => reportError('Saving the timers', err))
  }

  /** Stepping back out of `tokenId`'s turn reverts what its turn change did by itself. */
  function undoTurn(tokenId: number | null) {
    const last = turnHistory[turnHistory.length - 1]
    if (!last || last.tokenId !== tokenId) return
    turnHistory.pop()
    if (last.promptIds.length) {
      const drop = new Set(last.promptIds)
      turnPrompts.value = turnPrompts.value.filter(p => !drop.has(p.id))
    }
    for (const fx of [...last.effects].reverse()) revertEffect(fx)
    if (last.logIds.length && current.value) {
      const drop = new Set(last.logIds)
      current.value.combatLog = current.value.combatLog.filter(e => !drop.has(e.id))
      persistCombatLog()
    }
    const token = last.timerTokenId !== null ? getToken(last.timerTokenId) : undefined
    if (!token || !last.timerIds.length) return
    const ids = new Set(last.timerIds)
    token.timers = token.timers.map(t => ids.has(t.id) ? { ...t, remaining: Math.min(t.duration, t.remaining + 1) } : t)
    dbApi.encounterTokens.update({ id: token.id, timers: plain(token.timers) }).catch(err => reportError('Saving the timers', err))
  }

  // ── Actions — Condition automation (FEATURES_PLAN §10.2) ──────────────────
  function usesDying(token: EncounterToken): boolean {
    return token.usesDying ?? token.isPlayerToken
  }

  /** Appends a log entry and returns its id (appendLogEntry pushes synchronously). */
  function logNow(partial: Omit<CombatLogEntry, 'id' | 'round' | 'timestamp'>): number | undefined {
    appendLogEntry(partial)
    return current.value?.combatLog.at(-1)?.id
  }

  function logChanges(token: EncounterToken, changes: ConditionChange[]): number[] {
    const tokenName = token.label || token.name
    const ids: (number | undefined)[] = changes.map(ch => logNow({
      tokenId: token.id, tokenName, auto: true, conditionName: ch.name,
      ...(ch.to === undefined ? { type: 'condition-removed' as const }
        : ch.from === undefined ? { type: 'condition-added' as const, value: ch.to ?? undefined }
        : { type: 'condition-changed' as const, value: ch.to ?? undefined }),
    }))
    return ids.filter((id): id is number => id !== undefined)
  }

  /** Applies a result to the token, logs it as automatic and records it for undo. */
  function applyEffects(token: EncounterToken, fx: EffectResult, record: TurnRecord | null, hpDelta = 0, tempDelta = 0) {
    if (fx.changes.length) {
      token.conditions = fx.conditions
      dbApi.encounterTokens.update({ id: token.id, conditions: plain(token.conditions) }).catch(err => reportError('Saving the conditions', err))
    }
    const logIds = logChanges(token, fx.changes)
    const died = fx.dead && !token.isDead
    if (died) {
      token.isDead = true
      dbApi.encounterTokens.update({ id: token.id, isDead: 1 }).catch(err => reportError('Saving the token', err))
      const id = logNow({ tokenId: token.id, tokenName: token.label || token.name, type: 'death', auto: true })
      if (id !== undefined) logIds.push(id)
    }
    for (const seed of fx.prompts) {
      const prompt: TurnPrompt = { ...seed, id: nextPromptId++, tokenId: token.id, tokenName: token.label || token.name }
      turnPrompts.value = [...turnPrompts.value, prompt]
      record?.promptIds.push(prompt.id)
    }
    if (!record) return
    record.logIds.push(...logIds)
    if (fx.changes.length || died || hpDelta || tempDelta) record.effects.push({ tokenId: token.id, changes: fx.changes, hpDelta, tempDelta, died })
  }

  function revertEffect(fx: TurnRecord['effects'][number]) {
    const token = getToken(fx.tokenId)
    if (!token) return
    const dbUpdates: Record<string, any> = { id: token.id }
    if (fx.changes.length) {
      token.conditions = revertChanges(token.conditions, fx.changes)
      dbUpdates.conditions = plain(token.conditions)
    }
    if (fx.hpDelta && token.hpCurrent !== null) {
      token.hpCurrent = Math.max(0, Math.min(token.hpMax ?? Infinity, token.hpCurrent - fx.hpDelta))
      dbUpdates.hpCurrent = token.hpCurrent
    }
    if (fx.tempDelta) {
      token.tempHp = Math.max(0, token.tempHp - fx.tempDelta)
      dbUpdates.tempHp = token.tempHp
    }
    if (fx.died) {
      token.isDead = false
      dbUpdates.isDead = 0
    }
    dbApi.encounterTokens.update(dbUpdates as { id: number }).catch(err => reportError('Saving the token', err))
  }

  /** Adds dying/wounded/unconscious (or defeat) to an HP change made by hand. */
  function withHpEffects(token: EncounterToken, updates: Partial<EncounterToken>, opts: HpChangeOptions): Partial<EncounterToken> {
    if (!('hpCurrent' in updates)) return updates
    const usesDyingNow = updates.usesDying !== undefined ? (updates.usesDying ?? token.isPlayerToken) : usesDying(token)
    const fx = hpChangeEffects(updates.conditions ?? token.conditions, { from: token.hpCurrent, to: updates.hpCurrent ?? null, ...opts }, usesDyingNow, automation.value)
    const out = { ...updates }
    if (fx.changes.length) {
      // Logged as automatic here; the diff in updateToken then sees no change
      logChanges(token, fx.changes)
      token.conditions = fx.conditions
      out.conditions = fx.conditions
    }
    if (fx.dead && !token.isDead) out.isDead = true
    if (fx.revived && token.isDead) out.isDead = false
    return out
  }

  /** Resolves a recovery check prompt. */
  function resolveRecovery(promptId: number, degree: Degree) {
    const prompt = takePrompt(promptId)
    const token = prompt && getToken(prompt.tokenId)
    if (!token) return
    const tokenName = token.label || token.name
    const id = logNow({ tokenId: token.id, tokenName, type: 'note', auto: true, note: `Recovery check: ${degree.replace('-', ' ')}` })
    const record = recordFor(promptId)
    if (record && id !== undefined) record.logIds.push(id)
    applyEffects(token, recoveryCheck(token.conditions, degree), record)
    syncToPlayer()
  }

  /** Resolves a persistent damage prompt: the damage taken (0 for none) and whether the flat check ended it. */
  function resolvePersistent(promptId: number, damage: number, recovered: boolean) {
    const prompt = takePrompt(promptId)
    const token = prompt && getToken(prompt.tokenId)
    if (!token || prompt.kind !== 'persistent') return
    const record = recordFor(promptId)
    let hpDelta = 0
    if (damage > 0 && token.hpCurrent !== null) {
      const from = token.hpCurrent
      const r = damageWithTemp({ hp: from, temp: token.tempHp }, damage)
      const to = r.hp
      hpDelta = to - from
      const id = logNow({ tokenId: token.id, tokenName: token.label || token.name, type: 'damage', value: damage, auto: true, conditionName: prompt.condition, ...(r.absorbed ? { absorbed: r.absorbed } : {}) })
      if (id !== undefined) record?.logIds.push(id)
      token.hpCurrent = to
      token.tempHp = r.temp
      dbApi.encounterTokens.update({ id: token.id, hpCurrent: to, tempHp: r.temp }).catch(err => reportError('Saving the token', err))
      const hpFx = hpChangeEffects(token.conditions, { from, to, hitsAtZero: from <= 0 && damage > r.absorbed ? 1 : 0 }, usesDying(token), automation.value)
      applyEffects(token, hpFx, record, hpDelta, -r.absorbed)
      if (hpFx.revived) token.isDead = false
    }
    applyEffects(token, persistentCheck(token.conditions, prompt.condition, recovered), record)
    syncToPlayer()
  }

  function dismissPrompt(promptId: number) {
    takePrompt(promptId)
  }

  function takePrompt(promptId: number): TurnPrompt | undefined {
    const prompt = turnPrompts.value.find(p => p.id === promptId)
    turnPrompts.value = turnPrompts.value.filter(p => p.id !== promptId)
    return prompt
  }

  /** The turn record that raised a prompt, so its result is undone with that turn. */
  function recordFor(promptId: number): TurnRecord | null {
    return turnHistory.find(r => r.promptIds.includes(promptId)) ?? null
  }

  // ── Actions — Player view ─────────────────────────────────────────────────
  function loadPlayerViewPrefs(): PlayerViewPrefs {
    try {
      const raw = import.meta.client ? localStorage.getItem(PLAYER_VIEW_PREFS_KEY) : null
      if (raw) return { ...DEFAULT_PLAYER_VIEW_PREFS, ...JSON.parse(raw) }
    } catch { /* storage unavailable or corrupt */ }
    return { ...DEFAULT_PLAYER_VIEW_PREFS }
  }

  function setPlayerViewPrefs(changes: Partial<PlayerViewPrefs>) {
    playerViewPrefs.value = { ...playerViewPrefs.value, ...changes }
    try { localStorage.setItem(PLAYER_VIEW_PREFS_KEY, JSON.stringify(playerViewPrefs.value)) } catch { /* ignore */ }
    syncToPlayer()
  }

  /** Pings a grid position on the player view; `focus` also pans the player view there. */
  function sendPing(col: number, row: number, focus = false) {
    playerWindow.sendPing({ col, row, focus })
  }

  async function persistTurnState() {
    if (!current.value) return
    try {
      await dbApi.encounters.update({
        id: current.value.id,
        current_turn_index: currentTurnIndex.value,
        round_number: roundNumber.value,
      })
    } catch (err) {
      reportError('Saving the turn order', err)
    }
  }

  /** The turn order as players may see it: hidden combatants are dropped, or
   *  reduced to an anonymous "?" entry when the player view asks for that. */
  function playerTurnOrder(): TurnOrderEntry[] {
    const mystery = playerViewPrefs.value.hiddenTurns === 'mystery'
    const entries: TurnOrderEntry[] = []
    for (const t of initiativeOrder.value) {
      if (t.isVisible) {
        entries.push({ id: t.id, name: t.name, label: t.label, imageSource: t.imageSource, initiative: t.initiative, isDead: t.isDead, isPlayerToken: t.isPlayerToken })
      } else if (mystery) {
        entries.push({ id: t.id, name: '?', label: null, imageSource: null, initiative: t.initiative, isDead: false, isPlayerToken: false, isMystery: true })
      }
    }
    return entries
  }

  // ── Player view sync ───────────────────────────────────────────────────────
  // At most one message per frame; images and the map go once per player
  // connection (utils/playerPayload.ts). Nothing is sent without a player view.
  const playerImages = new ImageChannel()
  let sentMap: string | null = null
  let syncQueued = false

  function syncToPlayer() {
    if (!current.value || !playerWindowOpen.value || syncQueued) return
    syncQueued = true
    const run = () => { syncQueued = false; sendToPlayer() }
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run)
    else setTimeout(run, 0)
  }

  /** A (re)connected player view: start over with the map and every image. */
  function resyncPlayer() {
    playerWindowOpen.value = true
    playerImages.reset()
    sentMap = null
    sendToPlayer()
  }

  function sendToPlayer() {
    const enc = current.value
    if (!enc) return
    const mapChanged = enc.mapSource !== sentMap
    sentMap = enc.mapSource
    const tokens = enc.tokens.filter(t => t.isVisible && t.sensorZone == null).map(t => toPlayerToken(t, playerImages))
    // The sensor map: visible ships and hazards, with a health word instead of the enemies' numbers
    const sensor = enc.sensorMap || enc.tokens.some(t => t.sensorZone != null)
      ? {
          zones: enc.sensorMap?.zones ?? 12,
          tokens: enc.tokens.filter(t => t.isVisible && t.sensorZone != null).map(t => {
            const own = t.sensorRole === 'player-ship'
            return {
              id: t.id, name: t.label || t.name, zone: t.sensorZone!, heading: t.sensorHeading ?? 1,
              side: own ? 'party' : t.sensorRole === 'hazard' ? 'hazard' : t.isAlly ? 'ally' : 'enemy',
              ...(own ? { hp: t.hpCurrent, hpMax: t.hpMax, sp: t.shieldPoints, spMax: t.shieldMax } : { health: t.isDead ? 'destroyed' : healthState(t) }),
              conditions: t.conditions.filter(c => !c.hidden).map(c => (c.value != null ? `${c.name} ${c.value}` : c.name)),
            }
          }),
        }
      : null
    const turnOrder = playerTurnOrder().map(e => ({ ...e, imageSource: playerImages.ref(e.imageSource) }))
    playerWindow.sync({
      tokens,
      images: playerImages.take(),
      fogData: { ...toRaw(enc.fogData) },
      ...(mapChanged ? { mapSource: enc.mapSource, mapType: enc.mapType } : {}),
      gridSize: enc.gridSize,
      gridOffsetX: enc.gridOffsetX,
      gridOffsetY: enc.gridOffsetY,
      shapes: shapeOverlays.value.map(s => structuredClone(toRaw(s))),
      areas: playerAreas(),
      currentTurnIndex: currentTurnIndex.value,
      activeTurnTokenId: _activeTurnTokenId.value,
      roundNumber: roundNumber.value,
      turnOrder,
      wallDoorStates: walls.value.map(w => ({ id: w.id, isOpen: w.isOpen })),
      sensor,
      playerViewPrefs: { ...playerViewPrefs.value },
    })
  }

  // ── Actions — Areas (COMBAT_PLAN.md §5) ───────────────────────────────────
  function areaCells(area: AreaOverlay): Set<string> {
    return cellsInArea(area, current.value?.tokens ?? [])
  }

  /** Players see where an area is, never its effect or DC; hidden ones not at all. */
  function playerAreas() {
    return (current.value?.areas ?? []).filter(a => !a.hidden).map(a => ({ id: a.id, color: a.color, cells: [...areaCells(a)] }))
  }

  async function persistAreas() {
    if (!current.value) return
    await dbApi.encounters.update({ id: current.value.id, areas: plain(current.value.areas) })
  }

  async function addArea(area: AreaOverlay) {
    if (!current.value) return
    current.value.areas.push(area)
    syncToPlayer()
    await persistAreas()
  }

  async function updateArea(id: string, changes: Partial<AreaOverlay>) {
    const area = current.value?.areas.find(a => a.id === id)
    if (!area) return
    Object.assign(area, changes)
    syncToPlayer()
    await persistAreas()
  }

  async function removeArea(id: string) {
    if (!current.value) return
    current.value.areas = current.value.areas.filter(a => a.id !== id)
    syncToPlayer()
    await persistAreas()
  }

  /** Opens an area's save prompt: for the given tokens, or everyone inside. */
  function openAreaPrompt(areaId: string, tokenIds: number[] | null = null, reason: string | null = null) {
    // One prompt per area and token set is enough
    const same = areaPrompts.value.find(p => p.areaId === areaId && JSON.stringify(p.tokenIds) === JSON.stringify(tokenIds))
    if (same) return same.id
    const prompt: AreaPrompt = { id: nextAreaPromptId++, areaId, tokenIds, reason }
    areaPrompts.value = [...areaPrompts.value, prompt]
    return prompt.id
  }

  function closeAreaPrompt(id: number) {
    areaPrompts.value = areaPrompts.value.filter(p => p.id !== id)
  }

  function lingeringAreas(trigger: AreaTrigger): AreaOverlay[] {
    return (current.value?.areas ?? []).filter(a => a.effect && a.lingering?.trigger === trigger)
  }

  function lingerFor(token: EncounterToken, trigger: AreaTrigger, verb: string) {
    for (const a of lingeringAreas(trigger)) {
      if (tokenInCells(areaCells(a), token)) openAreaPrompt(a.id, [token.id], `${token.label || token.name} ${verb} ${a.label}`)
    }
  }

  /** Areas whose last round has passed go away at the start of a round. */
  function expireAreas() {
    if (!current.value) return
    const done = current.value.areas.filter(a => a.lingering?.untilRound != null && roundNumber.value > a.lingering.untilRound)
    if (!done.length) return
    const ids = new Set(done.map(a => a.id))
    current.value.areas = current.value.areas.filter(a => !ids.has(a.id))
    areaPrompts.value = areaPrompts.value.filter(p => !ids.has(p.areaId))
    void persistAreas()
  }

  /** Adds conditions from an area's save; a condition the token has keeps the higher value. */
  async function addConditions(tokenId: number, conds: { name: string; value: number | null }[]) {
    const token = getToken(tokenId)
    if (!token || !conds.length) return
    const next = token.conditions.map(c => ({ ...c }))
    for (const add of conds) {
      const have = next.find(c => c.name === add.name)
      if (!have) next.push({ name: add.name, value: add.value })
      else if (add.value !== null && (have.value ?? 0) < add.value) have.value = add.value
    }
    await updateToken(tokenId, { conditions: next })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  /** Replaces the sensor map settings (number of zones …) and saves them. */
  async function setSensorMap(map: SensorMap | null) {
    if (!current.value) return
    current.value.sensorMap = map
    try {
      await dbApi.encounters.update({ id: current.value.id, sensor_map: map ? toPlain(map) : null })
    } catch (err) {
      reportError('Saving the sensor map', err)
    }
  }

  /** Replaces the encounter's starship record (station markers …) and saves it. */
  async function setStarship(starship: EncounterStarship | null) {
    if (!current.value) return
    current.value.starship = starship
    try {
      await dbApi.encounters.update({ id: current.value.id, starship: starship ? toPlain(starship) : null })
    } catch (err) {
      reportError('Saving the starship stations', err)
    }
  }

  async function persistEncounter() {
    if (!current.value) return
    try {
      await dbApi.encounters.update({
        id: current.value.id,
        map_source: current.value.mapRef,
        map_type: current.value.mapType,
        grid_size: current.value.gridSize,
        grid_offset_x: current.value.gridOffsetX,
        grid_offset_y: current.value.gridOffsetY,
      })
    } catch (err) {
      reportError('Saving the encounter', err)
    }
  }

  // ── Actions — Walls ────────────────────────────────────────────────────────
  async function addWall(
    points: Array<{ x: number; y: number }>,
    coverType: DbEncounterWall['coverType']
  ): Promise<void> {
    if (!current.value) return
    const wallData = {
      encounter_id: current.value.id,
      points: toPlain(points),
      coverType,
      isOpen: false,
    }
    const id = await dbApi.walls.add(wallData)
    walls.value.push({ id, ...wallData })
    wallUndoStack.value.push(id)
  }

  async function undoLastWall(): Promise<void> {
    const id = wallUndoStack.value.pop()
    if (id === undefined) return
    await dbApi.walls.delete(id)
    walls.value = walls.value.filter(w => w.id !== id)
  }

  async function updateWall(
    id: number,
    changes: Partial<Pick<DbEncounterWall, 'coverType' | 'isOpen' | 'points'>>
  ): Promise<void> {
    await dbApi.walls.update(id, changes)
    const idx = walls.value.findIndex(w => w.id === id)
    if (idx !== -1) Object.assign(walls.value[idx], changes)
  }

  async function deleteWall(id: number): Promise<void> {
    await dbApi.walls.delete(id)
    walls.value = walls.value.filter(w => w.id !== id)
    wallUndoStack.value = wallUndoStack.value.filter(uid => uid !== id)
  }

  async function toggleDoor(id: number): Promise<void> {
    const wall = walls.value.find(w => w.id === id)
    if (!wall || !isDoorWall(wall.coverType)) return
    await updateWall(id, { isOpen: !wall.isOpen })
    syncToPlayer()
  }

  async function setFovEnabled(enabled: boolean): Promise<void> {
    if (!current.value) return
    current.value.fovEnabled = enabled
    await dbApi.encounters.update({ id: current.value.id, fov_enabled: enabled })
  }

  async function setSoundPlaylistId(id: number | null): Promise<void> {
    if (!current.value) return
    current.value.soundPlaylistId = id ?? undefined
    await dbApi.encounters.update({ id: current.value.id, sound_playlist_id: id })
  }

  async function updateName(name: string) {
    if (!current.value) return
    current.value.name = name
    await dbApi.encounters.update({ id: current.value.id, name })
  }

  function normalizeToken(raw: any): EncounterToken {
    return {
      id: raw.id,
      encounterId: raw.encounter_id,
      tokenId: raw.token_id ?? null,
      name: raw.name,
      imageSource: raw.image_source,
      imageType: raw.image_type ?? 'file',
      gridX: raw.grid_x ?? 0,
      gridY: raw.grid_y ?? 0,
      size: raw.size ?? 1,
      isVisible: Boolean(raw.is_visible),
      actsWhileHidden: Boolean(raw.acts_while_hidden),
      isDead: Boolean(raw.is_dead),
      label: raw.label,
      conditions: parseJson<TokenCondition[]>(raw.conditions, []),
      hpCurrent: raw.hp_current,
      hpMax: raw.hp_max,
      tempHp: raw.temp_hp ?? 0,
      ac: raw.ac ?? null,
      initiative: raw.initiative,
      notes: raw.notes,
      linkedRulesId: raw.linked_rules_id ?? null,
      adjustment: raw.rules_adjustment ?? null,
      linkedEntityId: raw.linked_entity_id ?? null,
      visionRange: raw.vision_range ?? null,
      isPlayerToken: Boolean(raw.is_player_token),
      isAlly: Boolean(raw.is_ally),
      elevation: raw.elevation ?? null,
      timers: parseJson<TokenTimer[]>(raw.timers, []),
      usesDying: raw.uses_dying == null ? null : Boolean(raw.uses_dying),
      sensorZone: raw.sensor_zone ?? null,
      sensorHeading: raw.sensor_heading === -1 ? -1 : raw.sensor_heading === 1 ? 1 : null,
      sensorRole: raw.sensor_role ?? null,
      shieldPoints: raw.shield_points ?? null,
      shieldMax: raw.shield_max ?? null,
    }
  }

  function getToken(id: number): EncounterToken | undefined {
    return current.value?.tokens.find(t => t.id === id)
  }

  /** Damage through temporary HP first; only damage that reaches HP can raise dying. */
  function applyDamage(tokenId: number, amount: number, opts: HpChangeOptions = {}) {
    const token = getToken(tokenId)
    if (!token || token.hpCurrent === null || !amount) return
    // A negative amount heals; temporary HP stay as they are
    if (amount < 0) return updateToken(tokenId, { hpCurrent: token.hpCurrent - amount }, opts)
    const r = damageWithTemp({ hp: token.hpCurrent, temp: token.tempHp }, amount)
    const hitsAtZero = token.hpCurrent <= 0 && amount > r.absorbed ? 1 : 0
    const updates: Partial<EncounterToken> = { hpCurrent: r.hp }
    if (r.absorbed) updates.tempHp = r.temp
    return updateToken(tokenId, updates, { ...opts, hitsAtZero, absorbed: r.absorbed })
  }

  /** Sets a token's temporary HP directly (the edit field). */
  function setTempHp(tokenId: number, value: number) {
    return updateToken(tokenId, { tempHp: Math.max(0, Math.floor(value) || 0) })
  }

  /** Grants temporary HP; they don't stack, so the higher value stays. */
  function grantTempHp(tokenId: number, amount: number) {
    const token = getToken(tokenId)
    if (!token) return
    const next = grantTemp(token.tempHp, amount)
    if (next !== token.tempHp) return updateToken(tokenId, { tempHp: next })
  }

  async function setPartyLevel(level: number | null) {
    if (!current.value) return
    current.value.partyLevel = level
    await dbApi.encounters.update({ id: current.value.id, party_level: level })
  }

  async function setInitiativeFormula(formula: string | null) {
    if (!current.value) return
    current.value.initiativeFormula = formula
    await dbApi.encounters.update({ id: current.value.id, initiative_formula: formula })
  }

  async function rollAllInitiative() {
    if (!current.value) return
    // Linked compendium entries give Perception (Stealth for hazards) and the formula scope
    const tokensToRoll = current.value.tokens.filter(t => t.initiative === null && t.sensorRole !== 'player-ship')
    const ids = [...new Set(tokensToRoll.map(t => t.linkedRulesId).filter((id): id is string => !!id))]
    const entries = new Map((await rulesGetMany(ids)).map(e => [e.id, e]))

    const toUpdate: { id: number; initiative: number }[] = []
    for (const token of tokensToRoll) {
      const entry = token.linkedRulesId ? entries.get(token.linkedRulesId) : undefined
      const roll = rollFor(token, entry)
      token.initiative = roll
      toUpdate.push({ id: token.id, initiative: roll })
    }
    if (!toUpdate.length) return
    syncToPlayer()
    await Promise.all(toUpdate.map(({ id, initiative }) => dbApi.encounterTokens.update({ id, initiative })))
  }

  /**
   * One token's initiative: the encounter's formula when set, else Perception
   * (Stealth for hazards) of the linked entry. `modifier` stands in for
   * Perception on tokens without one (typed in by hand).
   */
  function rollFor(token: EncounterToken, entry: RulesEntity | undefined, modifier = 0): number {
    const formula = current.value?.initiativeFormula?.trim()
    if (formula) {
      const scope = buildTokenScope(token, entry)
      if (!entry) scope.perception = modifier
      return evaluateFormula(formula, scope)
    }
    return entry ? rollInitiative(entry, token.adjustment) : Math.floor(Math.random() * 20) + 1 + modifier
  }

  /** Keeps the XP of enemy tokens that are about to be removed during play (FEATURES_PLAN.md §4.6). */
  async function rememberDefeated(tokens: EncounterToken[]) {
    if (!current.value) return
    const linked = tokens.filter(t => t.linkedRulesId)
    if (!linked.length) return
    const entries = new Map((await rulesGetMany([...new Set(linked.map(t => t.linkedRulesId!))])).map(e => [e.id, e]))
    const added: DefeatedEnemy[] = []
    for (const t of linked) {
      const e = entries.get(t.linkedRulesId!)
      if (!e || (e.kind !== 'creature' && e.kind !== 'hazard')) continue
      added.push({
        name: t.label || e.name, rulesId: e.id, level: e.level, kind: e.kind,
        complex: e.kind === 'hazard' ? (e as Hazard).complex : undefined, adjustment: t.adjustment,
      })
    }
    if (!added.length || !current.value) return
    current.value.defeated = [...current.value.defeated, ...added]
    await dbApi.encounters.update({ id: current.value.id, defeated: toPlain(current.value.defeated) })
  }

  async function clearDefeated() {
    if (!current.value) return
    current.value.defeated = []
    await dbApi.encounters.update({ id: current.value.id, defeated: [] })
  }

  /** The encounter was resolved or re-opened elsewhere (the resolve dialog writes the database). */
  function setStatus(status: string) {
    if (current.value) current.value.status = status
  }

  async function bulkRemoveTokens(ids: Set<number>) {
    if (!current.value || !ids.size) return
    current.value.tokens = current.value.tokens.filter(t => !ids.has(t.id))
    syncToPlayer()
    await Promise.all([...ids].map(id => dbApi.encounterTokens.remove(id)))
  }

  async function bulkSetTokenVisibility(ids: Set<number>, visible: boolean) {
    if (!current.value || !ids.size) return
    for (const token of current.value.tokens) {
      if (ids.has(token.id)) token.isVisible = visible
    }
    syncToPlayer()
    const v = visible ? 1 : 0
    await Promise.all([...ids].map(id => dbApi.encounterTokens.update({ id, isVisible: v })))
  }

  function toggleCondition(tokenId: number, name: string) {
    const token = getToken(tokenId)
    if (!token) return
    const existing = token.conditions ?? []
    const next = existing.some(c => c.name === name)
      ? existing.filter(c => c.name !== name)
      : [...existing, { name, value: null }]
    updateToken(tokenId, { conditions: next })
  }

  async function addCreatureToEncounterAuto(rulesId: string, adjustment: Adjustment | null = null) {
    return addCreatureToEncounter(rulesId, 5, 5, adjustment, { spread: true })
  }

  return {
    current, tokenLibrary, isLoading, playerWindowOpen, flushPendingSaves,
    currentTurnIndex, roundNumber, initiativeOrder,
    allTokens,
    walls, fovMode, wallUndoStack, fovRecomputeTrigger, playerViewPrefs,
    loadEncounter, loadTokenLibrary,
    setMap, updateGrid, updateViewport, updateName,
    setFogCell, hideAllFog, clearAllFog,
    addWall, undoLastWall, updateWall, deleteWall, toggleDoor,
    setFovEnabled,
    setSoundPlaylistId,
    addTokenToEncounter, addCreatureToEncounter, addCreatureToEncounterAuto, addBlankToken, setTokenRulesLink, moveToken, updateToken, removeToken, rememberDefeated, clearDefeated, setStatus, addToLibrary, updateLibraryToken,
    openPlayerWindow, closePlayerWindow, setShapeOverlays,
    addArea, updateArea, removeArea, areaCells, areaPrompts, openAreaPrompt, closeAreaPrompt, addConditions, setStarship, setSensorMap,
    addSensorToken, moveSensorToken, setShields,
    nextTurn, prevTurn,
    automation, turnPrompts, turnNotes, usesDying, resolveRecovery, resolvePersistent, dismissPrompt,
    getToken, applyDamage, setTempHp, grantTempHp, rollAllInitiative, setInitiativeFormula, setPartyLevel, bulkRemoveTokens, bulkSetTokenVisibility, toggleCondition,
    addLogNote, logRoll, clearCombatLog,
    addTimer, resetTimer, removeTimer, setTimers,
    setPlayerViewPrefs, sendPing, playerTurnOrder,
  }
})

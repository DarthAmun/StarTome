import { defineStore } from 'pinia'
import { dbApi, parseRecordData, imageTypeOf } from '~/composables/useDb'
import { useEntities } from '~/composables/useEntities'
import type { DbEncounterWall, DbToken } from '~/composables/useDb'
import type { ShapeOverlay } from '~/composables/useEncounterCanvas'
import { useStatBlockLinker } from '~/composables/useStatBlockLinker'
import { evaluateFormula, dataToScope } from '~/composables/useFormulaEvaluator'
import { healthState, type HealthState } from '~/composables/useConditions'
import { lsKey } from '~/utils/appNamespace'

function tryParseJson<T>(s: unknown, fallback: T): T {
  if (typeof s !== 'string') return fallback
  try { return JSON.parse(s) } catch { return fallback }
}

function buildTokenScope(token: EncounterToken, recordData: Record<string, any> = {}): Record<string, number> {
  return {
    ...dataToScope(recordData),
    ac: token.ac ?? 0,
    hp: token.hpCurrent ?? 0,
    hpmax: token.hpMax ?? 0,
  }
}

export interface CombatLogEntry {
  id: number
  round: number
  timestamp: number
  tokenId: number
  tokenName: string
  type: 'damage' | 'healing' | 'condition-added' | 'condition-removed' | 'death' | 'revival' | 'note' | 'timer-up'
  value?: number
  conditionName?: string
  note?: string
}

export interface Token {
  id: number
  name: string
  imageSource: string | null
  imageType: 'file' | 'url'
  linkedRecordId: number | null
  linkedEntityId: number | null  // NPC entity this token represents
  isPlayerCharacter: boolean
  syncImage: boolean             // image mirrors the linked NPC portrait / creature image
}

export interface LibraryTokenInput {
  name: string
  imageSource: string | null
  imageType: 'file' | 'url'
  linkedRecordId: number | null
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
  ac: number | null
  initiative: number | null
  notes: string | null
  linkedRecordId: number | null
  linkedEntityId: number | null
  visionRange: number | null  // tiles, null = infinite
  isPlayerToken: boolean      // default false
  elevation: number | null
  timers: TokenTimer[]
  playerHealthState?: HealthState  // set only in player-sync payload; undefined in DM view
}

export interface Encounter {
  id: number
  campaignId: number
  name: string
  mapSource: string | null
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
}

export const useEncounterStore = defineStore('encounter', () => {
  const { extractStatsFromData, extractAllFromRecord, linkRecordToToken } = useStatBlockLinker()

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
  // Timers ticked by nextTurn, so prevTurn can undo exactly those ticks (session-only)
  const timerTickHistory: Array<{ tokenId: number; timerIds: string[]; logIds: number[] }> = []

  // ── Computed ───────────────────────────────────────────────────────────────
  const allTokens = computed(() => current.value?.tokens ?? [])

  // Tokens that participate in turn order: alive and visible (or hidden but marked
  // to keep acting), sorted by initiative descending
  const initiativeOrder = computed(() =>
    (current.value?.tokens ?? [])
      .filter(t => (t.isVisible || t.actsWhileHidden) && !t.isDead)
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
  async function loadEncounter(id: number) {
    isLoading.value = true
    try {
      const data = await dbApi.encounters.get(id)
      if (!data) return
      current.value = {
        ...data,
        fogData: tryParseJson(data.fog_data, {} as Record<string, 'hidden' | 'revealed' | 'partial'>),
        viewport: tryParseJson(data.viewport, { x: 0, y: 0, scale: 1 }),
        combatLog: tryParseJson(data.combat_log || '[]', [] as CombatLogEntry[]),
        gridSize: data.grid_size,
        gridOffsetX: data.grid_offset_x,
        gridOffsetY: data.grid_offset_y,
        mapSource: data.map_source,
        mapType: data.map_type,
        campaignId: data.campaign_id,
        fovEnabled: data.fov_enabled ?? false,
        soundPlaylistId: data.sound_playlist_id ?? undefined,
        initiativeFormula: data.initiative_formula ?? null,
        tokens: ((data as any).tokens || []).map(normalizeToken),
      }
      roundNumber.value = data.round_number ?? 1
      const storedIndex = data.current_turn_index ?? 0
      _activeTurnTokenId.value = initiativeOrder.value[storedIndex]?.id ?? null
      walls.value = await dbApi.walls.list(id)
      wallUndoStack.value = []
      dbApi.window.onPlayerReady(syncToPlayer)
    } catch (err) {
      console.error('[EncounterStore] loadEncounter:', err)
    } finally {
      isLoading.value = false
    }
  }

  async function loadTokenLibrary() {
    try {
      const items = await dbApi.tokens.list()
      tokenLibrary.value = await Promise.all(items.map(normalizeLibraryToken))
    } catch (err) {
      console.error('[EncounterStore] loadTokenLibrary:', err)
    }
  }

  // ── Actions — Map ──────────────────────────────────────────────────────────
  async function setMap(source: string, type: 'file' | 'url') {
    if (!current.value) return
    current.value.mapSource = source
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
    current.value.viewport = viewport
    // Debounced — don't hit DB on every pan frame
    syncToPlayer()
  }

  // ── Actions — Fog of War ───────────────────────────────────────────────────
  async function setFogCell(key: string, state: 'hidden' | 'revealed' | 'partial') {
    if (!current.value) return
    current.value.fogData[key] = state
    syncToPlayer()
    await persistFog()
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

  async function persistFog() {
    if (!current.value) return
    try {
      await dbApi.encounters.update({ id: current.value.id, fog_data: JSON.stringify(current.value.fogData) })
    } catch (err) {
      console.error('[EncounterStore] persistFog:', err)
    }
  }

  // ── Actions — Tokens ──────────────────────────────────────────────────────
  /** Places a library token. `needsLinkPrompt` is true only for a plain token
   *  with no creature, NPC or PC association — the caller then offers the
   *  "Link to Stat Block?" dialog for the returned instance. */
  async function addTokenToEncounter(tokenId: number, gridX: number, gridY: number): Promise<{ token: EncounterToken | null; needsLinkPrompt: boolean }> {
    if (!current.value) return { token: null, needsLinkPrompt: false }
    const libToken = tokenLibrary.value.find(t => t.id === tokenId)
    const linkedRecordId = libToken?.linkedRecordId ?? null
    const linkedEntityId = libToken?.linkedEntityId ?? null

    let stats = { hpCurrent: null as number | null, hpMax: null as number | null, ac: null as number | null, size: 1 }
    if (linkedRecordId) {
      // A broken link (deleted record, missing system) must not block placement.
      try { stats = await linkRecordToToken(linkedRecordId) }
      catch (err) { console.warn('[EncounterStore] linked record lookup failed:', err) }
    }

    try {
      const result = await dbApi.encounterTokens.add({
        encounterId: current.value.id,
        tokenId,
        gridX,
        gridY,
        size: stats.size,
        isVisible: 1,
        hpCurrent: stats.hpCurrent,
        hpMax: stats.hpMax,
        ac: stats.ac,
        linkedRecordId,
        linkedEntityId,
        isPlayerToken: libToken?.isPlayerCharacter ?? false,
      })
      current.value.tokens.push(normalizeToken(result))
      syncToPlayer()
      const needsLinkPrompt = !linkedRecordId && !linkedEntityId && !libToken?.isPlayerCharacter
      // Return the reactive instance from the array, not the raw object
      return { token: current.value.tokens[current.value.tokens.length - 1], needsLinkPrompt }
    } catch (err) {
      console.error('[EncounterStore] addTokenToEncounter:', err)
      return { token: null, needsLinkPrompt: false }
    }
  }

  async function addCreatureToEncounter(recordId: number, gridX: number, gridY: number) {
    if (!current.value) return
    try {
      const extracted = await extractAllFromRecord(recordId)
      const result = await dbApi.encounterTokens.add({
        encounterId: current.value.id,
        tokenId: null,
        gridX,
        gridY,
        size: extracted.size,
        isVisible: 1,
        hpCurrent: extracted.hpCurrent,
        hpMax: extracted.hpMax,
        ac: extracted.ac,
        linkedRecordId: recordId,
        imageSource: extracted.imageSource,
        imageType: extracted.imageType,
      })
      current.value.tokens.push(normalizeToken(result))
      syncToPlayer()
    } catch (err) {
      console.error('[EncounterStore] addCreatureToEncounter:', err)
    }
  }

  async function moveToken(instanceId: number, gridX: number, gridY: number) {
    if (!current.value) return
    const token = current.value.tokens.find(t => t.id === instanceId)
    if (!token) return
    token.gridX = gridX
    token.gridY = gridY
    await dbApi.encounterTokens.update({ id: instanceId, gridX, gridY })
    syncToPlayer()
  }

  async function updateToken(instanceId: number, updates: Partial<EncounterToken>) {
    if (!current.value) return
    const token = current.value.tokens.find(t => t.id === instanceId)
    if (!token) return

    // ── Detect log-worthy changes before mutating ──────────────────────────
    const tokenName = token.label || token.name
    if ('hpCurrent' in updates && updates.hpCurrent !== null && token.hpCurrent !== null && token.hpCurrent !== undefined) {
      const diff = (updates.hpCurrent as number) - token.hpCurrent
      if (diff < 0) appendLogEntry({ tokenId: instanceId, tokenName, type: 'damage', value: Math.abs(diff) })
      else if (diff > 0) appendLogEntry({ tokenId: instanceId, tokenName, type: 'healing', value: diff })
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
    if ('ac' in updates) dbUpdates.ac = updates.ac
    if ('initiative' in updates) dbUpdates.initiative = updates.initiative
    if ('label' in updates) dbUpdates.label = updates.label
    if ('notes' in updates) dbUpdates.notes = updates.notes
    if ('conditions' in updates) dbUpdates.conditions = JSON.stringify(updates.conditions)
    if ('linkedRecordId' in updates) dbUpdates.linkedRecordId = updates.linkedRecordId
    if ('linkedEntityId' in updates) dbUpdates.linkedEntityId = updates.linkedEntityId
    if ('visionRange' in updates) dbUpdates.visionRange = updates.visionRange
    if ('isPlayerToken' in updates) dbUpdates.isPlayerToken = updates.isPlayerToken ? 1 : 0
    if ('elevation' in updates) dbUpdates.elevation = updates.elevation
    if ('timers' in updates) dbUpdates.timers = JSON.stringify(updates.timers)
    await dbApi.encounterTokens.update(dbUpdates)
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
      await dbApi.encounters.update({ id: current.value.id, combat_log: JSON.stringify(current.value.combatLog) })
    } catch (err) {
      console.error('[EncounterStore] persistCombatLog:', err)
    }
  }

  async function removeToken(instanceId: number) {
    if (!current.value) return
    try {
      current.value.tokens = current.value.tokens.filter(t => t.id !== instanceId)
      await dbApi.encounterTokens.remove(instanceId)
      syncToPlayer()
    } catch (err) {
      console.error('[EncounterStore] removeToken:', err)
    }
  }

  /** With image sync on, the token and its linked entry share one image: a token
   *  image that differs is written to the entry (the NPC portrait when an NPC is
   *  linked, else the creature record's image field); an empty one adopts the
   *  entry's image. Returns the input with the resolved image. */
  async function syncLinkedImage(data: LibraryTokenInput): Promise<LibraryTokenInput> {
    if (!data.syncImage || (!data.linkedEntityId && !data.linkedRecordId)) return data
    const own = data.imageSource?.trim() || null
    if (!own) {
      const linked = await dbApi.linkedImages.get(data.linkedEntityId, data.linkedRecordId)
      return linked ? { ...data, imageSource: linked.source, imageType: linked.type } : data
    }
    if (data.linkedEntityId) {
      const entities = useEntities()
      const ent = entities.entities.find(e => e.id === data.linkedEntityId)
      const attrs = (ent?.attributes ?? parseRecordData((await dbApi.entities.get(data.linkedEntityId))?.attributes)) as Record<string, any>
      if (attrs.portraitSource !== own) {
        await entities.updateEntity(data.linkedEntityId, { attributes: { ...attrs, portraitSource: own, portraitType: imageTypeOf(own) } as any })
      }
    } else if (data.linkedRecordId) {
      const current = await dbApi.linkedImages.get(null, data.linkedRecordId)
      if (current?.source !== own) await dbApi.linkedImages.setOnRecord(data.linkedRecordId, own)
    }
    return { ...data, imageSource: own, imageType: imageTypeOf(own) }
  }

  async function updateLibraryToken(id: number, input: LibraryTokenInput) {
    try {
      const data = await syncLinkedImage(input)
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
      console.error('[EncounterStore] updateLibraryToken:', err)
    }
  }

  async function addToLibrary(input: LibraryTokenInput): Promise<Token | null> {
    try {
      const row = await dbApi.tokens.create(await syncLinkedImage(input))
      if (!row) return null
      const token = await normalizeLibraryToken(row)
      tokenLibrary.value.push(token)
      return tokenLibrary.value[tokenLibrary.value.length - 1]
    } catch (err) {
      console.error('[EncounterStore] addToLibrary:', err)
      return null
    }
  }

  async function normalizeLibraryToken(t: DbToken): Promise<Token> {
    const token: Token = {
      id: t.id!,
      name: t.name,
      imageSource: t.image_source,
      imageType: t.image_type,
      linkedRecordId: t.linked_record_id ?? null,
      linkedEntityId: t.linked_entity_id ?? null,
      isPlayerCharacter: Boolean(t.is_player_character),
      syncImage: Boolean(t.sync_image),
    }
    if (token.syncImage) {
      const img = await dbApi.linkedImages.get(token.linkedEntityId, token.linkedRecordId).catch(() => null)
      if (img) { token.imageSource = img.source; token.imageType = img.type }
    }
    return token
  }

  // ── Actions — Windows ─────────────────────────────────────────────────────
  async function openPlayerWindow() {
    if (!current.value) return
    await dbApi.window.openPlayer(current.value.id)
    playerWindowOpen.value = true
    syncToPlayer()
  }

  async function closePlayerWindow() {
    await dbApi.window.closePlayer()
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
    if (idx + 1 >= order.length) {
      _activeTurnTokenId.value = order[0].id
      roundNumber.value++
    } else {
      _activeTurnTokenId.value = order[idx + 1].id
    }
    tickTurnStartTimers(_activeTurnTokenId.value)
    syncToPlayer()
    persistTurnState()
  }

  function prevTurn() {
    const order = initiativeOrder.value
    if (!order.length) return
    const idx = currentTurnIndex.value
    if (idx === 0 && roundNumber.value <= 1) return
    untickTurnStartTimers(_activeTurnTokenId.value)
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
  function tickTurnStartTimers(tokenId: number | null) {
    const token = tokenId !== null ? getToken(tokenId) : undefined
    const ticked: string[] = []
    const logIds: number[] = []
    if (token?.timers.length) {
      token.timers = token.timers.map(t => {
        if (t.remaining <= 0) return t
        ticked.push(t.id)
        if (t.remaining === 1) {
          // appendLogEntry pushes synchronously, so the new entry is last
          appendLogEntry({ tokenId: token.id, tokenName: token.label || token.name, type: 'timer-up', note: t.name })
          const entry = current.value?.combatLog.at(-1)
          if (entry) logIds.push(entry.id)
        }
        return { ...t, remaining: t.remaining - 1 }
      })
      if (ticked.length) dbApi.encounterTokens.update({ id: token.id, timers: JSON.stringify(token.timers) })
    }
    if (tokenId !== null) timerTickHistory.push({ tokenId, timerIds: ticked, logIds })
    if (timerTickHistory.length > 200) timerTickHistory.shift()
  }

  /** Stepping back out of `tokenId`'s turn reverts the tick its turn start applied. */
  function untickTurnStartTimers(tokenId: number | null) {
    const last = timerTickHistory[timerTickHistory.length - 1]
    if (!last || last.tokenId !== tokenId) return
    timerTickHistory.pop()
    if (last.logIds.length && current.value) {
      const drop = new Set(last.logIds)
      current.value.combatLog = current.value.combatLog.filter(e => !drop.has(e.id))
      persistCombatLog()
    }
    const token = getToken(last.tokenId)
    if (!token || !last.timerIds.length) return
    const ids = new Set(last.timerIds)
    token.timers = token.timers.map(t => ids.has(t.id) ? { ...t, remaining: Math.min(t.duration, t.remaining + 1) } : t)
    dbApi.encounterTokens.update({ id: token.id, timers: JSON.stringify(token.timers) })
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
    dbApi.window.sendPing({ col, row, focus })
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
      console.error('[EncounterStore] persistTurnState:', err)
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

  function syncToPlayer() {
    if (!current.value) return
    dbApi.window.syncEncounter({
      tokens: current.value.tokens
        .filter(t => t.isVisible)
        .map(t => {
          const raw = { ...toRaw(t) }
          // Strip hidden conditions and DM-only timers from player view
          raw.conditions = raw.conditions.filter(c => !c.hidden)
          raw.timers = raw.timers.filter(t => t.visibleToPlayers)
          // Replace exact HP with health state for non-PC tokens
          if (!raw.isPlayerToken) {
            raw.playerHealthState = healthState(raw)
            raw.hpCurrent = null
            raw.hpMax = null
          }
          return raw
        }),
      fogData: { ...toRaw(current.value.fogData) },
      mapSource: current.value.mapSource,
      mapType: current.value.mapType,
      gridSize: current.value.gridSize,
      gridOffsetX: current.value.gridOffsetX,
      gridOffsetY: current.value.gridOffsetY,
      shapes: shapeOverlays.value.map(s => ({ ...toRaw(s) })),
      currentTurnIndex: currentTurnIndex.value,
      activeTurnTokenId: _activeTurnTokenId.value,
      roundNumber: roundNumber.value,
      turnOrder: playerTurnOrder(),
      wallDoorStates: walls.value.map(w => ({ id: w.id, isOpen: w.isOpen })),
      playerViewPrefs: { ...playerViewPrefs.value },
    })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function persistEncounter() {
    if (!current.value) return
    try {
      await dbApi.encounters.update({
        id: current.value.id,
        map_source: current.value.mapSource,
        map_type: current.value.mapType,
        grid_size: current.value.gridSize,
        grid_offset_x: current.value.gridOffsetX,
        grid_offset_y: current.value.gridOffsetY,
      })
    } catch (err) {
      console.error('[EncounterStore] persistEncounter:', err)
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
      points: JSON.stringify(points),
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
    if (!wall || wall.coverType !== 'door') return
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
      conditions: tryParseJson<TokenCondition[]>(raw.conditions, []),
      hpCurrent: raw.hp_current,
      hpMax: raw.hp_max,
      ac: raw.ac ?? null,
      initiative: raw.initiative,
      notes: raw.notes,
      linkedRecordId: raw.linked_record_id ?? null,
      linkedEntityId: raw.linked_entity_id ?? null,
      visionRange: raw.vision_range ?? null,
      isPlayerToken: Boolean(raw.is_player_token),
      elevation: raw.elevation ?? null,
      timers: tryParseJson<TokenTimer[]>(raw.timers, []),
    }
  }

  function getToken(id: number): EncounterToken | undefined {
    return current.value?.tokens.find(t => t.id === id)
  }

  function applyDamage(tokenId: number, amount: number) {
    const token = getToken(tokenId)
    if (!token || token.hpCurrent === null) return
    updateToken(tokenId, { hpCurrent: Math.max(0, token.hpCurrent - amount) })
  }

  async function setInitiativeFormula(formula: string | null) {
    if (!current.value) return
    current.value.initiativeFormula = formula
    await dbApi.encounters.update({ id: current.value.id, initiative_formula: formula })
  }

  async function rollAllInitiative() {
    if (!current.value) return
    const formula = current.value.initiativeFormula?.trim()
    const useFormula = !!formula

    // Pre-fetch linked record data for all tokens that need a roll
    const tokensToRoll = current.value.tokens.filter(t => t.initiative === null)
    const recordIds = [...new Set(tokensToRoll.map(t => t.linkedRecordId).filter((id): id is number => id !== null))]
    const recordScopes: Map<number, Record<string, number>> = new Map()

    if (useFormula && recordIds.length) {
      const records = await Promise.all(recordIds.map(id => dbApi.records.get(id)))
      for (const rec of records) {
        if (!rec?.id) continue
        const data: Record<string, any> = parseRecordData(rec.data)
        recordScopes.set(rec.id, dataToScope(data))
      }
    }

    const toUpdate: { id: number; initiative: number }[] = []
    for (const token of tokensToRoll) {
      let roll: number
      if (useFormula) {
        const recordData = token.linkedRecordId ? (recordScopes.get(token.linkedRecordId) ?? {}) : {}
        roll = evaluateFormula(formula!, buildTokenScope(token, recordData))
      } else {
        roll = Math.floor(Math.random() * 20) + 1
      }
      token.initiative = roll
      toUpdate.push({ id: token.id, initiative: roll })
    }
    if (!toUpdate.length) return
    syncToPlayer()
    await Promise.all(toUpdate.map(({ id, initiative }) => dbApi.encounterTokens.update({ id, initiative })))
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

  async function addCreatureToEncounterAuto(recordId: number) {
    const occupied = new Set((current.value?.tokens ?? []).map(t => `${t.gridX},${t.gridY}`))
    let gx = 5, gy = 5
    for (let i = 0; i < 30 && occupied.has(`${gx},${gy}`); i++) {
      gx = 4 + (i % 6)
      gy = 4 + Math.floor(i / 6)
    }
    return addCreatureToEncounter(recordId, gx, gy)
  }

  return {
    current, tokenLibrary, isLoading, playerWindowOpen,
    currentTurnIndex, roundNumber, initiativeOrder,
    allTokens,
    walls, fovMode, wallUndoStack, fovRecomputeTrigger, playerViewPrefs,
    loadEncounter, loadTokenLibrary,
    setMap, updateGrid, updateViewport, updateName,
    setFogCell, hideAllFog, clearAllFog,
    addWall, undoLastWall, updateWall, deleteWall, toggleDoor,
    setFovEnabled,
    setSoundPlaylistId,
    addTokenToEncounter, addCreatureToEncounter, addCreatureToEncounterAuto, moveToken, updateToken, removeToken, addToLibrary, updateLibraryToken,
    openPlayerWindow, closePlayerWindow, setShapeOverlays,
    nextTurn, prevTurn,
    getToken, applyDamage, rollAllInitiative, setInitiativeFormula, bulkRemoveTokens, bulkSetTokenVisibility, toggleCondition,
    addLogNote, clearCombatLog,
    addTimer, resetTimer, removeTimer, setTimers,
    setPlayerViewPrefs, sendPing, playerTurnOrder,
  }
})

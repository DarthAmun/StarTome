<template>
  <div class="player-view">
    <div id="pixi-canvas-player" ref="canvasContainer" class="w-full h-full" />

    <!-- Condition chips overlay -->
    <ConditionChipsOverlay
      v-if="store.current && canvasViewport"
      :tokens="store.current.tokens"
      :is-d-m="false"
      :hovered-token-id="hoveredTokenId"
      :selected-token-id="null"
      :viewport="canvasViewport"
      :grid-size="store.current.gridSize"
      :grid-offset-x="store.current.gridOffsetX"
      :grid-offset-y="store.current.gridOffsetY"
    />

    <!-- Initiative turn rail — docked where the DM chose (top / left / right) -->
    <TurnRail
      v-if="playerInitiativeOrder.length"
      :tokens="playerInitiativeOrder"
      :active-turn-token-id="playerActiveTurnTokenId"
      :round-number="playerRoundNumber"
      :position="store.playerViewPrefs.turnRailPosition"
      :size="store.playerViewPrefs.turnRailSize"
      :show-names="store.playerViewPrefs.turnRailShowNames"
    />

    <div class="player-overlay">
      <div class="font-display text-forge-gold-l/70 text-sm tracking-widest uppercase">
        {{ store.current?.name }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { channelName } from '~/utils/appNamespace'
import { dbApi } from '~/composables/useDb'
import { useEncounterCanvas, type ShapeOverlay } from '../../../composables/useEncounterCanvas'
import { useEncounterStore } from '~/stores/encounter'

const route = useRoute()
const store = useEncounterStore()
const canvasContainer = ref<HTMLElement | null>(null)
let canvas: ReturnType<typeof useEncounterCanvas> | null = null

// Condition chips overlay state
const hoveredTokenId = ref<number | null>(null)
const canvasViewport = ref<{ x: number; y: number; scale: number } | null>(null)

// Initiative tracker state (updated via encounter sync)
const playerRoundNumber = ref(1)
const playerInitiativeOrder = ref<any[]>([])
const playerActiveTurnTokenId = ref<number | null>(null)

function sortInitiative(tokens: any[]): any[] {
  return tokens.filter((t) => !t.isDead && t.isVisible !== false).slice().sort((a, b) => {
    if (a.initiative === null && b.initiative === null) return 0
    if (a.initiative === null) return 1
    if (b.initiative === null) return -1
    return b.initiative - a.initiative
  })
}

onMounted(async () => {
  const id = Number(route.params.id)
  await store.loadEncounter(id)

  // Player window always stays in group mode regardless of DM's current mode
  store.fovMode = 'group'

  if (!canvasContainer.value) return

  canvas = useEncounterCanvas({
    container: canvasContainer.value,
    isDmMode: false,
    getActiveTool: () => 'select',
    getActiveTurnTokenId: () => playerActiveTurnTokenId.value,
    onTokenMoved: undefined,
    onFogToggle: undefined,
    onTokenPointerEnter: (tokenId) => {
      hoveredTokenId.value = tokenId
      canvasViewport.value = canvas?.getViewport() ?? null
    },
    onTokenPointerLeave: (tokenId) => {
      if (hoveredTokenId.value === tokenId) hoveredTokenId.value = null
    },
  })

  await canvas.init()

  if (store.current?.mapSource) {
    await canvas.loadMap(store.current.mapSource, store.current.mapType)
  }
  await canvas.renderTokens()
  canvas.redrawFog()
  canvas.recomputeFov()

  // Seed initiative state from the store so the turn rail shows immediately. Goes
  // through playerTurnOrder: the store loaded hidden tokens with their real names.
  playerInitiativeOrder.value = store.playerTurnOrder()
  playerActiveTurnTokenId.value = store.initiativeOrder[store.currentTurnIndex]?.id ?? null
  playerRoundNumber.value = store.roundNumber

  // Tell DM window to re-sync so active token and order are authoritative immediately
  dbApi.window.sendPlayerReady()

  let renderedShapeIds = new Set<string>()

  dbApi.window.onEncounterSync(async (data: any) => {
    if (!store.current) return

    store.current.tokens = data.tokens
    store.current.fogData = data.fogData
    store.current.gridSize = data.gridSize
    store.current.gridOffsetX = data.gridOffsetX
    store.current.gridOffsetY = data.gridOffsetY

    if (data.mapSource && data.mapSource !== store.current.mapSource) {
      store.current.mapSource = data.mapSource
      store.current.mapType = data.mapType
      await canvas?.loadMap(data.mapSource, data.mapType)
    }

    // Apply door-open states so FOV computation sees current wall config
    if (data.wallDoorStates) {
      for (const state of data.wallDoorStates) {
        const wall = store.walls.find(w => w.id === state.id)
        if (wall) wall.isOpen = state.isOpen
      }
    }

    // Update initiative state before rendering so the active-turn ring lands on
    // the correct token when renderTokens reads getActiveTurnTokenId()
    playerRoundNumber.value = data.roundNumber ?? 1
    playerActiveTurnTokenId.value = data.activeTurnTokenId ?? null
    playerInitiativeOrder.value = data.turnOrder ?? sortInitiative(data.tokens ?? [])
    if (data.playerViewPrefs) store.playerViewPrefs = data.playerViewPrefs

    canvas?.drawGrid()
    canvas?.redrawFog()
    await canvas?.renderTokens()
    canvasViewport.value = canvas?.getViewport() ?? null

    // Sync shape overlays
    const incoming: ShapeOverlay[] = data.shapes ?? []
    const incomingIds = new Set(incoming.map((s: ShapeOverlay) => s.id))
    for (const id of renderedShapeIds) {
      if (!incomingIds.has(id)) canvas?.removeShapeOverlay(id)
    }
    for (const shape of incoming) {
      if (!renderedShapeIds.has(shape.id)) canvas?.addShapeOverlay(shape)
    }
    renderedShapeIds = incomingIds

    // Recompute FOV with the fully updated state
    canvas?.recomputeFov()
  })

  dbApi.window.onPing(({ col, row, focus }) => {
    if (focus) canvas?.centerOn(col, row)
    canvas?.showPing(col, row)
  })

  // Notify DM window when this tab closes
  window.addEventListener('beforeunload', () => {
    const ch = new BroadcastChannel(channelName('player'))
    ch.postMessage({ type: 'player-closed' })
    ch.close()
  })
})

onUnmounted(() => {
  dbApi.window.offEncounterSync()
  dbApi.window.offPing()
  canvas?.destroy()
})
</script>

<style scoped>
.player-view {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--void);
}

.player-overlay {
  position: absolute;
  bottom: 16px;
  right: 16px;
  pointer-events: none;
}

</style>
<template>
  <div
    class="encounter-page"
    :class="{ 'fog-paint-mode': activeTool === 'fog' || activeTool === 'measure' || activeTool === 'shapes' || activeTool === 'ping' }"
  >
      <!-- ── Top toolbar ─────────────────────────────────────────────────────── -->
      <header class="encounter-toolbar">
        <!-- Back -->
        <NuxtLink
          :to="encounter?.campaignId ? `/campaign/${encounter.campaignId}/encounters` : '/'"
          class="back-btn"
        >
          <OhVueIcon name="md-arrowback" scale="0.75" /> Back
        </NuxtLink>

        <!-- Editable encounter name -->
        <div class="encounter-title">
          <span
            v-if="!nameEditing"
            class="encounter-name-display"
            @click="startNameEdit"
          >{{ encounter?.name }}</span>
          <input
            v-else
            ref="nameInputEl"
            class="encounter-name-input"
            :value="encounter?.name"
            @blur="commitNameEdit"
            @keyup.enter="($event.target as HTMLInputElement).blur()"
          />
        </div>

        <!-- Mode toggle -->
        <div class="enc-mode-toggle">
          <button :class="{ active: mode === 'prepare' }" @click="setMode('prepare')">
            <OhVueIcon name="md-editnote" scale="0.85" /> Prepare
          </button>
          <button :class="{ active: mode === 'run' }" @click="setMode('run')">
            <OhVueIcon name="gi-broadsword" scale="0.85" /> Run
          </button>
        </div>

        <!-- FOV mode toggle (run mode only; grayed when FOV disabled) -->
        <div v-if="mode === 'run'" class="enc-fov-mode-toggle" :class="{ 'enc-fov-mode-toggle--off': !encounter?.fovEnabled }" :title="encounter?.fovEnabled ? '' : 'Enable FOV & Walls in Prepare mode to use vision control'">
          <button class="fov-mode-btn" :class="{ active: store.fovMode === 'gm' }" :disabled="!encounter?.fovEnabled" title="DM sees all" @click="setFovMode('gm')">
            GM
          </button>
          <button class="fov-mode-btn" :class="{ active: store.fovMode === 'active' }" :disabled="!encounter?.fovEnabled" title="Active turn token's vision" @click="setFovMode('active')">
            Active
          </button>
          <button class="fov-mode-btn" :class="{ active: store.fovMode === 'group' }" :disabled="!encounter?.fovEnabled" title="All player tokens' vision" @click="setFovMode('group')">
            Group
          </button>
        </div>

        <!-- Player window toggle -->
        <button
          class="back-btn"
          :class="{ 'back-btn--active': playerWindowOpen }"
          @click="togglePlayerWindow"
        >
          <OhVueIcon name="md-desktopmac" scale="0.85" />
          {{ playerWindowOpen ? "Close Player View" : "Open Player View" }}
        </button>
        <div class="pv-prefs-wrap">
          <button
            class="back-btn pv-prefs-btn"
            :class="{ 'back-btn--active': showPlayerViewPrefs }"
            title="Player view layout"
            @click="showPlayerViewPrefs = !showPlayerViewPrefs"
          >
            <OhVueIcon name="md-tune" scale="0.85" />
          </button>
          <template v-if="showPlayerViewPrefs">
            <div class="ctx-back" @click="showPlayerViewPrefs = false" />
            <div class="pv-prefs-pop">
              <div class="pv-prefs-label">Turn order position</div>
              <div class="pv-prefs-seg">
                <button
                  v-for="opt in TURN_RAIL_POSITIONS"
                  :key="opt.value"
                  :class="{ active: store.playerViewPrefs.turnRailPosition === opt.value }"
                  @click="store.setPlayerViewPrefs({ turnRailPosition: opt.value })"
                >{{ opt.label }}</button>
              </div>
              <div class="pv-prefs-label">Turn order size</div>
              <div class="pv-prefs-seg">
                <button
                  v-for="opt in TURN_RAIL_SIZES"
                  :key="opt.value"
                  :class="{ active: store.playerViewPrefs.turnRailSize === opt.value }"
                  @click="store.setPlayerViewPrefs({ turnRailSize: opt.value })"
                >{{ opt.label }}</button>
              </div>
              <div class="pv-prefs-label">Token names</div>
              <div class="pv-prefs-seg">
                <button
                  :class="{ active: store.playerViewPrefs.turnRailShowNames }"
                  @click="store.setPlayerViewPrefs({ turnRailShowNames: true })"
                >Show</button>
                <button
                  :class="{ active: !store.playerViewPrefs.turnRailShowNames }"
                  @click="store.setPlayerViewPrefs({ turnRailShowNames: false })"
                >Hide</button>
              </div>
              <div class="pv-prefs-label">Hidden combatants' turns</div>
              <div class="pv-prefs-seg">
                <button
                  :class="{ active: store.playerViewPrefs.hiddenTurns === 'omit' }"
                  title="Players don't see hidden tokens' turns at all"
                  @click="store.setPlayerViewPrefs({ hiddenTurns: 'omit' })"
                >Leave out</button>
                <button
                  :class="{ active: store.playerViewPrefs.hiddenTurns === 'mystery' }"
                  title="Players see an anonymous “?” entry when a hidden token acts"
                  @click="store.setPlayerViewPrefs({ hiddenTurns: 'mystery' })"
                >Show “?”</button>
              </div>
              <p class="pv-prefs-hint">Names appear in the Left/Right docks. Scales with the player screen; applies live.</p>
            </div>
          </template>
        </div>
      </header>

      <!-- ── Main layout ─────────────────────────────────────────────────────── -->
      <div class="encounter-layout">
        <!-- Left sidebar: Prepare mode only — map & grid -->
        <aside v-if="mode === 'prepare'" class="encounter-sidebar left-sidebar">
          <!-- Battle Map -->
          <div class="sidebar-section">
            <div class="sidebar-header">
              <span class="f-label">Battle Map</span>
            </div>
            <div v-if="encounter?.mapSource" class="map-thumb-wrap">
              <img :src="encounter.mapSource" class="map-thumb-img" alt="Map thumbnail" />
            </div>
            <div v-else class="map-drop-hint">
              <OhVueIcon name="md-map" scale="2.5" style="opacity:0.12;margin-bottom:8px" />
              <p class="enc-hint">Drop a map image on the canvas, or load one below.</p>
            </div>
            <Button
              severity="secondary"
              style="width:100%;justify-content:center;margin-top:6px"
              @click="onSetMap"
            >
              <OhVueIcon name="md-map" scale="0.85" />
              {{ encounter?.mapSource ? 'Change Map' : 'Load Map' }}
            </Button>
          </div>

          <!-- Grid Settings -->
          <div class="sidebar-section">
            <div class="sidebar-header">
              <span class="f-label">Grid Settings</span>
            </div>
            <div class="enc-grid-col">
              <label class="f-label">Cell Size (px)</label>
              <input
                type="range"
                min="1"
                max="200"
                step="0.05"
                :value="encounter?.gridSize ?? 70"
                class="enc-range"
                @input="onGridSizeChange"
              />
              <div class="enc-grid-range-labels">
                <span>1px</span>
                <span style="color: var(--ink)">{{ encounter?.gridSize ?? 70 }}px</span>
                <span>200px</span>
              </div>
              <input
                type="number"
                min="1"
                max="200"
                step="0.01"
                class="enc-grid-fine-input"
                :value="encounter?.gridSize ?? 70"
                @change="onGridSizeInput"
              />
              <label class="f-label enc-offset-label">Offset X</label>
              <InputNumber
                :model-value="encounter?.gridOffsetX ?? 0"
                @update:model-value="(val) => onOffsetChange('x', val)"
              />
              <label class="f-label">Offset Y</label>
              <InputNumber
                :model-value="encounter?.gridOffsetY ?? 0"
                @update:model-value="(val) => onOffsetChange('y', val)"
              />
            </div>
          </div>
          <!-- FOV Settings -->
          <div class="sidebar-section">
            <div class="sidebar-header">
              <span class="f-label">Field of View</span>
            </div>
            <label class="fov-enable-row">
              <input
                type="checkbox"
                class="fov-enable-check"
                :checked="encounter?.fovEnabled"
                @change="toggleFovEnabled"
              />
              <span>Enable FOV &amp; Walls</span>
            </label>
            <p class="enc-hint">Draw walls to block line of sight for players.</p>
          </div>

          <!-- Music -->
          <div class="sidebar-section">
            <div class="sidebar-header">
              <span class="f-label">Music</span>
            </div>
            <select
              class="enc-playlist-select"
              :value="encounter?.soundPlaylistId ?? ''"
              @change="onPlaylistLinkChange"
            >
              <option value="">— none —</option>
              <option v-for="pl in soundPlaylists" :key="pl.id" :value="pl.id">{{ pl.name }}</option>
            </select>
            <p class="enc-hint">Link a playlist to prompt auto-play when this encounter starts.</p>
          </div>
        </aside>

        <!-- Centre: PixiJS Canvas -->
        <main
          class="encounter-canvas-wrapper"
          @dragover.prevent
          @drop="onCanvasDrop"
          @contextmenu.prevent="onCanvasRightClick"
        >
          <div
            id="pixi-canvas"
            ref="canvasContainer"
            style="width: 100%; height: 100%"
          />

          <!-- Condition chips overlay -->
          <ConditionChipsOverlay
            v-if="encounter && canvasViewport"
            :tokens="encounter.tokens"
            :is-d-m="true"
            :hovered-token-id="hoveredTokenId"
            :selected-token-id="editingToken?.id ?? null"
            :viewport="canvasViewport"
            :grid-size="encounter.gridSize"
            :grid-offset-x="encounter.gridOffsetX"
            :grid-offset-y="encounter.gridOffsetY"
          />

          <!-- Drop hint when no map -->
          <div v-if="!encounter?.mapSource" class="canvas-empty-state">
            <OhVueIcon name="md-map" scale="4" class="enc-empty-icon" />
            <p class="enc-empty-text">
              Drop a map image here or use the sidebar to load one
            </p>
          </div>

          <!-- Wall tool submenu -->
          <div v-if="activeTool === 'wall'" class="wall-submenu">
            <button
              v-for="ct in COVER_TYPES"
              :key="ct.value"
              class="map-tool-btn wall-type-btn"
              :class="{ active: activeCoverType === ct.value }"
              :style="{ '--wt-color': ct.color }"
              :title="ct.label"
              @click="activeCoverType = ct.value; canvas?.setActiveCoverType(ct.value)"
            >
              <span class="wall-type-swatch" />
              {{ ct.label }}
            </button>
            <div class="fog-sep" />
            <button
              class="map-tool-btn"
              title="Undo last wall point (Backspace) or last wall (Ctrl+Z)"
              @click="store.undoLastWall().then(() => canvas?.redrawWalls())"
            >
              <OhVueIcon name="md-autorenew" scale="0.9" />
            </button>
          </div>

          <!-- Fog tool submenu -->
          <div v-if="activeTool === 'fog'" class="fog-submenu">
            <button
              class="map-tool-btn"
              :class="{ active: fogMode === 'add' }"
              title="Add fog (paint hidden)"
              @click="fogMode = 'add'"
            ><OhVueIcon name="gi-fog" scale="0.9" /></button>
            <button
              class="map-tool-btn"
              :class="{ active: fogMode === 'remove' }"
              title="Reveal (erase fog)"
              @click="fogMode = 'remove'"
            ><OhVueIcon name="md-visibility" scale="0.9" /></button>

            <div class="fog-sep" />

            <button
              class="map-tool-btn fog-size-btn"
              title="Decrease brush size"
              @click="fogBrushSize = Math.max(1, fogBrushSize - 1)"
            >−</button>
            <span class="fog-brush-label">{{ fogBrushSize }}</span>
            <button
              class="map-tool-btn fog-size-btn"
              title="Increase brush size"
              @click="fogBrushSize = Math.min(10, fogBrushSize + 1)"
            >+</button>

            <div class="fog-sep" />

            <button
              class="map-tool-btn fog-text-btn"
              title="Cover entire map with fog"
              @click="store.hideAllFog()"
            ><OhVueIcon name="md-visibilityoff" scale="0.9" /></button>
            <button
              class="map-tool-btn fog-text-btn"
              title="Remove all fog"
              @click="store.clearAllFog()"
            ><OhVueIcon name="md-autorenew" scale="0.9" /></button>
          </div>

          <!-- Shape tool submenu — pops up above the shapes button -->
          <div v-if="activeTool === 'shapes'" class="shape-submenu">
            <button
              class="map-tool-btn"
              :class="{ active: shapeType === 'circle' }"
              title="Circle"
              @click="shapeType = 'circle'"
            ><span class="shape-icon shape-icon--circle" /></button>
            <button
              class="map-tool-btn"
              :class="{ active: shapeType === 'square' }"
              title="Square"
              @click="shapeType = 'square'"
            ><span class="shape-icon shape-icon--square" /></button>
            <button
              class="map-tool-btn"
              :class="{ active: shapeType === 'cone' }"
              title="Cone"
              @click="shapeType = 'cone'"
            ><span class="shape-icon shape-icon--cone" /></button>
            <label class="shape-color-swatch" :style="{ background: shapeColor }" title="Pick color">
              <input v-model="shapeColor" type="color" class="shape-color-input" />
            </label>
          </div>

          <!-- Floating tool buttons -->
          <div class="map-tool-dock">
            <button
              class="map-tool-btn"
              :class="{ active: activeTool === 'ping' }"
              title="Ping — click to ping the player view, Shift+click to also center it there. Tip: long-press the map to ping with any tool off."
              @click="toggleTool('ping')"
            >
              <OhVueIcon name="gi-echo-ripples" scale="1.1" />
            </button>
            <button
              class="map-tool-btn"
              :class="{ active: activeTool === 'fog' }"
              title="Fog of War"
              @click="toggleTool('fog')"
            >
              <OhVueIcon name="gi-fog" scale="1.1" />
            </button>
            <button
              class="map-tool-btn"
              :class="{ active: activeTool === 'measure' }"
              title="Ruler"
              @click="toggleTool('measure')"
            >
              <OhVueIcon name="gi-pencil-ruler" scale="1.1" />
            </button>
            <button
              class="map-tool-btn"
              :class="{ active: activeTool === 'shapes' }"
              title="Shape Overlays"
              @click="toggleTool('shapes')"
            >
              <OhVueIcon name="fa-shapes" scale="1.0" />
            </button>
            <button
              v-if="encounter?.fovEnabled"
              class="map-tool-btn"
              :class="{ active: activeTool === 'wall' }"
              title="Draw Walls"
              @click="toggleTool('wall')"
            >
              <OhVueIcon name="gi-brick-wall" scale="0.9" />
            </button>
          </div>
        </main>

        <!-- Right sidebar: mode-conditional -->
        <aside class="encounter-sidebar right-sidebar">

          <!-- ══ PREPARE: Token Library ══ -->
          <template v-if="mode === 'prepare'">
            <!-- Tab toggle -->
            <div class="lib-tab-bar">
              <button class="lib-tab" :class="{ 'lib-tab--active': libSidebarTab === 'tokens' }" @click="libSidebarTab = 'tokens'">Tokens</button>
              <button class="lib-tab" :class="{ 'lib-tab--active': libSidebarTab === 'creatures' }" @click="libSidebarTab = 'creatures'">Creatures</button>
            </div>

            <!-- ── Tokens tab ── -->
            <template v-if="libSidebarTab === 'tokens'">
            <div class="sidebar-section" style="flex:1;display:flex;flex-direction:column;overflow:hidden;border-bottom:none">
              <div class="token-search">
                <InputText ref="searchInputRef" v-model="tokenSearch" placeholder="Search tokens…" />
              </div>
              <div class="token-list" style="flex:1;overflow-y:auto">
                <!-- PC separator -->
                <template v-if="filteredLibraryPCs.length">
                  <div class="tok-section-label">Player Characters</div>
                  <div
                    v-for="token in filteredLibraryPCs"
                    :key="token.id"
                    class="token-chip token-chip--pc"
                    draggable="true"
                    @dragstart="onTokenDragStart($event, token)"
                    @dragend="onLibraryDragEnd"
                  >
                    <div class="token-thumb">
                      <img v-if="token.imageSource" :src="getImageUrl(token)" class="enc-token-img" />
                      <span v-else class="enc-token-initial">{{ token.name.charAt(0) }}</span>
                    </div>
                    <span class="token-lib-name">{{ token.name }}</span>
                    <button class="icon-btn-sq" @click.stop="openEditLibraryToken(token)">
                      <OhVueIcon name="md-edit" scale="0.75" />
                    </button>
                    <button class="icon-btn-sq icon-btn-sq--danger" @click.stop="removeFromLibrary(token.id)">
                      <OhVueIcon name="md-close" scale="0.75" />
                    </button>
                  </div>
                  <div v-if="filteredLibraryOthers.length" class="tok-section-label tok-section-label--others">Others</div>
                </template>
                <div
                  v-for="token in filteredLibraryOthers"
                  :key="token.id"
                  class="token-chip"
                  draggable="true"
                  @dragstart="onTokenDragStart($event, token)"
                    @dragend="onLibraryDragEnd"
                >
                  <div class="token-thumb">
                    <img v-if="token.imageSource" :src="getImageUrl(token)" class="enc-token-img" />
                    <span v-else class="enc-token-initial">{{ token.name.charAt(0) }}</span>
                  </div>
                  <span class="token-lib-name">{{ token.name }}</span>
                  <button class="icon-btn-sq" @click.stop="openEditLibraryToken(token)">
                    <OhVueIcon name="md-edit" scale="0.75" />
                  </button>
                  <button class="icon-btn-sq icon-btn-sq--danger" @click.stop="removeFromLibrary(token.id)">
                    <OhVueIcon name="md-close" scale="0.75" />
                  </button>
                </div>
                <p v-if="filteredLibrary.isEmpty" class="enc-hint" style="padding:12px 0">No tokens yet</p>
              </div>
            </div>
            <div class="sidebar-section" style="flex-shrink:0">
              <Button severity="secondary" style="width:100%;justify-content:center" @click="openAddTokenModal">
                <OhVueIcon name="md-add" scale="0.8" /> Add Token
              </Button>
            </div>
            </template><!-- end tokens tab -->

            <!-- ── Creatures tab ── -->
            <template v-if="libSidebarTab === 'creatures'">
            <div class="sidebar-section" style="flex:1;display:flex;flex-direction:column;overflow:hidden;border-bottom:none">
              <div class="token-search">
                <InputText ref="searchInputRef" v-model="creatureSearch" placeholder="Search creatures…" />
              </div>
              <div class="token-list" style="flex:1;overflow-y:auto">
                <div
                  v-for="rec in filteredCreatures"
                  :key="rec.id"
                  class="token-chip creature-chip"
                  draggable="true"
                  @dragstart="onCreatureDragStart($event, rec)"
                  @dragend="onLibraryDragEnd"
                >
                  <div class="token-thumb">
                    <img v-if="rec.imageSource" :src="rec.imageSource" class="enc-token-img" />
                    <span v-else class="enc-token-initial enc-token-initial--creature">{{ rec.name.charAt(0) }}</span>
                  </div>
                  <div class="creature-chip-info">
                    <span class="token-lib-name">{{ rec.name }}</span>
                    <span class="creature-chip-type">{{ rec.entityTypeId }}</span>
                  </div>
                  <button class="icon-btn-sq" title="Place on map" @click.stop="store.addCreatureToEncounterAuto(rec.id)">
                    <OhVueIcon name="md-add" scale="0.75" />
                  </button>
                </div>
                <p v-if="filteredCreatures.length === 0" class="enc-hint" style="padding:12px 0">
                  {{ creatureSearch ? 'No matches' : 'No creature records found. Link a system to this campaign first.' }}
                </p>
              </div>
            </div>
            </template><!-- end creatures tab -->

          </template>

          <!-- ══ RUN: ORDER | LOG tabs ══ -->
          <template v-else>
            <div class="rsb-tabs">
              <button class="rsb-tab" :class="{ 'rsb-tab--active': activeTab === 'order' }" @click="activeTab = 'order'">Order</button>
              <button class="rsb-tab" :class="{ 'rsb-tab--active': activeTab === 'log' }" @click="activeTab = 'log'">Log</button>
            </div>

            <!-- ── ORDER tab ──────────────────────────────────────────── -->
            <template v-if="activeTab === 'order'">
              <div class="sidebar-section" style="flex:1;display:flex;flex-direction:column;overflow:hidden;border-bottom:none">
                <div class="initiative-bar">
                  <button class="init-nav-btn" @click="store.prevTurn()">
                    <OhVueIcon name="md-chevronleft" scale="0.8" />
                  </button>
                  <span class="init-round-label">Round {{ store.roundNumber }}</span>
                  <button class="init-nav-btn" @click="store.nextTurn()">
                    <OhVueIcon name="md-chevronright" scale="0.8" />
                  </button>
                  <button
                    class="init-nav-btn init-roll-all-btn"
                    :title="store.current?.initiativeFormula ? `Roll initiative: ${store.current.initiativeFormula}` : 'Roll d20 for all tokens without initiative'"
                    @click="store.rollAllInitiative()"
                  ><OhVueIcon name="gi-dice-six-faces-six" scale="0.85" /></button>
                  <button
                    class="init-nav-btn init-formula-btn"
                    :class="{ active: showInitFormula }"
                    title="Configure initiative formula"
                    @click="showInitFormula = !showInitFormula"
                  >
                    <OhVueIcon name="md-settings" scale="0.75" />
                  </button>
                </div>

                <!-- Bulk action bar -->
                <div v-if="selectedTokenIds.size > 0" class="order-bulk-bar">
                  <span class="order-bulk-count">{{ selectedTokenIds.size }} selected</span>
                  <button class="order-bulk-btn" title="Show all selected" @click="bulkSetVisibility(true)">Show</button>
                  <button class="order-bulk-btn" title="Hide all selected" @click="bulkSetVisibility(false)">Hide</button>
                  <button class="order-bulk-btn order-bulk-btn--danger" title="Remove selected tokens" @click="bulkRemove">Remove</button>
                  <button class="order-bulk-btn order-bulk-btn--clear" title="Clear selection" @click="clearSelection()">✕</button>
                </div>
                <div class="order-token-list">
                  <div
                    v-for="token in sortedEncounterTokens"
                    :key="token.id"
                    class="order-token-row"
                    :class="{
                      'order-token-row--active': token.id === currentTurnTokenId,
                      'order-token-row--selected': editingToken?.id === token.id || selectedTokenIds.has(token.id),
                      'order-token-row--dead': token.isDead,
                      'order-token-row--bulk': selectedTokenIds.has(token.id),
                      'order-token-row--skipped': !token.isVisible && !token.actsWhileHidden && !token.isDead,
                    }"
                    @click="onOrderRowClick($event, token)"
                    @contextmenu.prevent="onTokenRowRightClick($event, token)"
                  >
                    <!-- Row 1: thumb | name | initiative | gear (hover-only) -->
                    <div class="order-row-1">
                      <div class="token-thumb-sm">
                        <img v-if="token.imageSource" :src="getImageUrl(token)" class="enc-token-img" />
                        <span v-else class="enc-token-initial">{{ token.name.charAt(0) }}</span>
                      </div>
                      <div class="order-token-name">{{ token.label || token.name }}</div>
                      <span class="order-init" :class="{ 'order-init--set': token.initiative !== null }">
                        {{ token.initiative !== null ? token.initiative : '—' }}
                      </span>
                      <div class="order-token-actions">
                        <button
                          class="icon-btn-sq"
                          title="Edit token"
                          @click.stop="selectToken(token)"
                        >
                          <OhVueIcon name="md-settings" scale="0.75" />
                        </button>
                      </div>
                    </div>
                    <!-- Row 2: HP bar + HP text + quick damage input | visibility toggle -->
                    <div class="order-row-2">
                      <template v-if="token.hpMax">
                        <div class="order-hp-track">
                          <div
                            class="order-hp-fill"
                            :style="{
                              width: hpPercent(token) + '%',
                              background: hpBarColor(token),
                            }"
                          />
                        </div>
                        <span class="order-hp-text">{{ token.hpCurrent ?? 0 }}/{{ token.hpMax }}</span>
                        <input
                          class="order-hp-quick-input"
                          type="number"
                          placeholder="dmg"
                          title="Damage (positive) or heal (negative), Enter to apply"
                          @click.stop
                          @keyup.enter="applyQuickHp($event, token.id)"
                          @keyup.esc="($event.target as HTMLInputElement).value = ''"
                        />
                      </template>
                      <button
                        v-if="!token.isVisible"
                        class="order-vis-btn order-turn-btn"
                        :class="{ 'order-turn-btn--on': token.actsWhileHidden }"
                        :title="token.actsWhileHidden ? 'Hidden, but takes its turn — click to skip it' : 'Hidden and skipped in the turn order — click to keep its turn'"
                        @click.stop="store.updateToken(token.id, { actsWhileHidden: !token.actsWhileHidden })"
                      >
                        <OhVueIcon name="gi-sands-of-time" scale="0.75" />
                      </button>
                      <button
                        class="order-vis-btn"
                        :class="{ 'order-vis-btn--hidden': !token.isVisible }"
                        :title="token.isVisible ? 'Hide token' : 'Show token'"
                        @click.stop="store.updateToken(token.id, { isVisible: !token.isVisible })"
                      >
                        <OhVueIcon :name="token.isVisible ? 'md-visibility' : 'md-visibilityoff'" scale="0.85" />
                      </button>
                    </div>
                    <!-- Row 3: timers (tick down at the start of this token's turn) -->
                    <div v-if="token.timers.length" class="order-row-3">
                      <span
                        v-for="tmr in token.timers"
                        :key="tmr.id"
                        class="order-timer"
                        :class="{ 'order-timer--up': tmr.remaining <= 0 }"
                        :title="tmr.remaining <= 0
                          ? `${tmr.name} is up — click to reset to ${tmr.duration}`
                          : `${tmr.name}: ${tmr.remaining} of ${tmr.duration} turns left — click to reset`"
                        @click.stop="store.resetTimer(token.id, tmr.id)"
                      >
                        <OhVueIcon name="gi-hourglass" scale="0.6" />
                        <span class="order-timer-name">{{ tmr.name }}</span>
                        <b>{{ tmr.remaining <= 0 ? '✓' : tmr.remaining }}</b>
                        <OhVueIcon v-if="tmr.visibleToPlayers" name="md-visibility" scale="0.55" class="order-timer-vis" />
                        <button class="order-timer-x" title="Remove timer" @click.stop="store.removeTimer(token.id, tmr.id)">✕</button>
                      </span>
                    </div>
                  </div>
                  <p v-if="!encounterTokens.length" class="enc-hint" style="padding:12px 0;text-align:center">No tokens on map</p>
                </div>
              </div>

            </template>

            <!-- ── LOG tab ────────────────────────────────────────────── -->
            <template v-else-if="activeTab === 'log'">
              <div class="log-note-bar">
                <select v-model="logNoteTokenId" class="log-note-select">
                  <option :value="null" disabled>Token…</option>
                  <option v-for="t in encounterTokens" :key="t.id" :value="t.id">{{ t.label || t.name }}</option>
                </select>
                <input v-model="logNoteText" class="log-note-input" placeholder="Note…" @keyup.enter="submitLogNote" />
                <button class="log-note-add" :disabled="!logNoteTokenId || !logNoteText.trim()" @click="submitLogNote">+</button>
              </div>
              <div class="log-entries">
                <div v-if="!store.current?.combatLog.length" class="log-empty">No events yet this session.</div>
                <div v-for="entry in reversedLog" :key="entry.id" class="log-row">
                  <span class="log-round-badge">R{{ entry.round }}</span>
                  <span class="log-token-name">{{ entry.tokenName }}</span>
                  <span class="log-event" :class="`log-event--${entry.type}`">
                    <template v-if="entry.type === 'damage'">took {{ entry.value }} damage</template>
                    <template v-else-if="entry.type === 'healing'">healed {{ entry.value }} HP</template>
                    <template v-else-if="entry.type === 'condition-added'">gained {{ entry.conditionName }}</template>
                    <template v-else-if="entry.type === 'condition-removed'">lost {{ entry.conditionName }}</template>
                    <template v-else-if="entry.type === 'death'">fell unconscious ☠</template>
                    <template v-else-if="entry.type === 'revival'">revived</template>
                    <template v-else-if="entry.type === 'note'">{{ entry.note }}</template>
                    <template v-else-if="entry.type === 'timer-up'">⏳ {{ entry.note }} is up</template>
                  </span>
                </div>
              </div>
              <div class="log-footer">
                <button class="log-clear-btn" @click="confirmClearLog">Clear Log</button>
              </div>
            </template>

          </template>

        </aside>
      </div>

      <!-- ── Log clear confirmation ─────────────────────────────────────────── -->
      <Teleport to="body">
        <div v-if="clearLogConfirm" class="pv-dialog-mask" @click.self="clearLogConfirm = false">
          <div class="pv-dialog" style="max-width:360px">
            <div class="link-modal-header">
              <span class="link-modal-title">Clear Combat Log?</span>
              <button class="link-modal-close" @click="clearLogConfirm = false">✕</button>
            </div>
            <p class="link-modal-hint">This cannot be undone.</p>
            <div class="link-modal-footer">
              <button class="link-btn link-btn--skip" @click="clearLogConfirm = false">Cancel</button>
              <button class="link-btn link-btn--link" style="background:var(--blood)" @click="doClearLog">Clear</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ── Link to Stat Block Modal ───────────────────────────────────────────── -->
      <Teleport to="body">
        <div v-if="linkModalOpen" class="pv-dialog-mask" @click.self="linkModalOpen = false">
          <div class="pv-dialog link-modal">
            <div class="link-modal-header">
              <span class="link-modal-title">Link to Stat Block?</span>
              <button class="link-modal-close" @click="linkModalOpen = false">✕</button>
            </div>
            <p class="link-modal-hint">Auto-fill HP, AC and conditions from a system record.</p>
            <div class="link-modal-search">
              <OhVueIcon name="fa-search" scale="0.75" style="color:var(--ink-ghost)" />
              <input v-model="linkSearch" class="link-search-input" placeholder="Search records…" autocomplete="off" />
            </div>
            <div class="link-record-list">
              <button v-for="rec in filteredLinkRecords" :key="rec.id"
                class="link-record-row"
                :class="{ 'link-record-row--selected': linkSelectedId === rec.id }"
                @click="linkSelectedId = rec.id">
                {{ rec.name }}
              </button>
              <div v-if="linkRecordsLoading" class="link-record-empty">Loading creatures…</div>
              <div v-else-if="!filteredLinkRecords.length" class="link-record-empty">
                {{ linkSearch ? 'No matches' : 'No creature records found' }}
              </div>
            </div>
            <div class="link-modal-footer">
              <button class="link-btn link-btn--skip" @click="linkModalOpen = false">Skip</button>
              <button class="link-btn link-btn--link" :disabled="!linkSelectedId" @click="confirmLink">Link</button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ── Record Slide-In Panel ───────────────────────────────────────────── -->
      <Teleport to="body">
        <Transition name="record-panel-slide">
          <div v-if="recordPanel?.open" class="record-panel">
            <button class="record-panel-close" @click="recordPanel = null">✕</button>
            <div class="record-panel-inner">
              <div v-if="recordPanel.entityType" class="record-panel-title">
                {{ recordPanel.record?.name }}
              </div>
              <EntityLayout v-if="recordPanel.entityType"
                :entity-type="recordPanel.entityType"
                :data="recordPanel.record.data"
                mode="view"
                :system-id="recordPanel.systemId"
                :accent-color="recordPanel.entityType?.color"
              />
              <div v-else class="record-panel-fallback">
                <pre class="record-panel-raw">{{ JSON.stringify(recordPanel.record?.data, null, 2) }}</pre>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

      <!-- ── Token Edit Modal ──────────────────────────────────────────────────── -->
      <TokenEditModal
        :token="editingToken"
        :system-id="linkCampaignSystemId"
        :open="!!editingToken"
        @close="editingToken = null; selectedToken = null"
        @update="onTokenEdit"
        @open-conditions="conditionToken = editingToken"
      />

      <!-- ── Condition Modal (declared after TokenEditModal so it stacks on top) ── -->
      <ConditionModal
        :token="conditionToken"
        :system-id="linkCampaignSystemId"
        :open="!!conditionToken"
        @close="conditionToken = null"
        @update="onConditionUpdate"
        @show-condition-panel="(name, value) => openConditionPanel(name, value)"
      />

      <!-- ── Shape Context Menu ────────────────────────────────────────────────── -->
      <Teleport to="body">
        <template v-if="shapeCtxMenu.open">
          <div class="ctx-back" @click="shapeCtxMenu.open = false" @contextmenu.prevent="shapeCtxMenu.open = false" />
          <div class="sh-ctx-menu" :style="{ left: shapeCtxMenu.x + 'px', top: shapeCtxMenu.y + 'px' }">
            <button class="sh-ctx-item sh-ctx-item--danger" @click="onCtxRemoveShape">
              <OhVueIcon name="md-delete" scale="0.85" style="opacity:0.7;flex-shrink:0" />
              Remove Shape
            </button>
          </div>
        </template>
      </Teleport>

      <!-- ── Wall Context Menu ────────────────────────────────────────────────────── -->
      <Teleport to="body">
        <template v-if="wallCtxMenu.open">
          <div class="ctx-back" @click="wallCtxMenu.open = false" @contextmenu.prevent="wallCtxMenu.open = false" />
          <div class="sh-ctx-menu" :style="{ left: wallCtxMenu.x + 'px', top: wallCtxMenu.y + 'px' }">
            <button v-if="wallCtxMenu.isDoor" class="sh-ctx-item" @click="onWallCtxToggleDoor">
              {{ wallCtxMenu.isOpen ? 'Close Door' : 'Open Door' }}
            </button>
            <button class="sh-ctx-item sh-ctx-item--danger" @click="onWallCtxDelete">
              <OhVueIcon name="md-delete" scale="0.85" style="opacity:0.7;flex-shrink:0" />
              Delete Wall
            </button>
          </div>
        </template>
      </Teleport>

      <!-- ── Canvas Context Menu ───────────────────────────────────────────────── -->
      <EncounterContextMenu
        :open="ctxMenu.open"
        :x="ctxMenu.x"
        :y="ctxMenu.y"
        :grid-x="ctxMenu.gridX"
        :grid-y="ctxMenu.gridY"
        :target-token="ctxMenu.targetToken"
        @close="ctxMenu.open = false"
        @add-token-here="onCtxAddTokenHere"
        @edit-token="onCtxEditToken"
        @add-condition="onCtxAddCondition"
        @quick-condition="onCtxQuickCondition"
        @set-initiative="onCtxSetInitiative"
        @apply-damage="onCtxApplyDamage"
        @view-record="onCtxViewRecord"
        @view-npc="onCtxViewNpc"
        @toggle-visibility="onCtxToggleVisibility"
        @toggle-dead="onCtxToggleDead"
        @toggle-player-token="onCtxTogglePlayerToken"
        @toggle-acts-while-hidden="onCtxToggleActsWhileHidden"
        @add-timer="onCtxAddTimer"
        @remove-token="onCtxRemoveToken"
      />

      <EntityQuickPanel
        v-if="store.current"
        type="npc"
        :name="npcPanel.name"
        :campaign-id="store.current.campaignId"
        :open="npcPanel.open"
        @close="npcPanel.open = false"
      />

      <!-- ── Condition Reference Panel ─────────────────────────────────────────── -->
      <ConditionPanel
        :condition-name="conditionPanelName"
        :system-id="linkCampaignSystemId"
        :value="conditionPanelValue"
        :open="conditionPanelOpen"
        @close="conditionPanelOpen = false"
      />

      <!-- ── Add Token Modal ──────────────────────────────────────────────────── -->
      <Teleport to="body">
        <div
          v-if="showAddToken"
          class="modal-overlay"
          @click.self="showAddToken = false"
        >
          <div class="modal-box">
            <div class="modal-title">Add Token to Library</div>
            <div class="space-y-3">
              <div>
                <label class="f-label">Name</label>
                <InputText
                  v-model="newToken.name"
                  placeholder="Goblin, Wizard, etc."
                  autofocus
                />
              </div>
              <div>
                <label class="f-label">Image</label>
                <div class="enc-add-condition">
                  <InputText
                    v-model="newToken.imageSource"
                    placeholder="URL or file path"
                    class="flex-1"
                  />
                  <Button class="icon-btn-sq" @click="browseTokenImage">
                    <OhVueIcon name="fa-folder-open" scale="0.9" />
                  </Button>
                </div>
                <div v-if="newToken.imageSource" class="mt-2" style="text-align:center">
                  <img :src="newToken.imageSource" style="max-height:80px;border-radius:6px;object-fit:contain" />
                </div>
              </div>
              <TokenLinkPicker
                label="Linked Creature" hint="auto-fills HP & AC on placement" placeholder="Search records…"
                :selected="newToken.linkedRecordName" :results="recordPickerResults"
                v-model:search="tokenModalRecordSearch"
                @focus="filterTokenModalRecords" @select="selectTokenModalRecord($event, 'new')" @clear="clearTokenModalRecord('new')"
              />
              <TokenLinkPicker
                label="Linked NPC" hint="campaign character this token represents" placeholder="Search NPCs…"
                :selected="newToken.linkedEntityName" :results="tokenModalNpcResults" accent="#7cc44e"
                v-model:search="tokenModalNpcSearch"
                @select="selectTokenModalNpc($event, 'new')" @clear="clearTokenModalNpc('new')"
              />
              <!-- Image sync -->
              <label v-if="newToken.linkedEntityId || newToken.linkedRecordId" class="tok-pc-row">
                <input type="checkbox" v-model="newToken.syncImage" class="tem-checkbox" @change="pullLinkedImage('new')" />
                <span>Sync image with linked entry <span class="f-hint">{{ newToken.linkedEntityId ? 'NPC portrait' : 'creature image' }} ↔ token — uncheck for a separate token image</span></span>
              </label>
              <!-- PC flag -->
              <label class="tok-pc-row">
                <input type="checkbox" v-model="newToken.isPlayerCharacter" class="tem-checkbox" />
                <span>Player Character <span class="f-hint">pinned at top of token list</span></span>
              </label>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <Button severity="secondary" @click="showAddToken = false">Cancel</Button>
              <Button @click="confirmAddToken">Add Token</Button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ── Edit Library Token Modal ─────────────────────────────────────── -->
      <Teleport to="body">
        <div
          v-if="showEditLibraryToken"
          class="modal-overlay"
          @click.self="showEditLibraryToken = false"
        >
          <div class="modal-box">
            <div class="modal-title">Edit Token</div>
            <div class="space-y-3">
              <div>
                <label class="f-label">Name</label>
                <InputText
                  v-model="editLibraryTokenForm.name"
                  placeholder="Goblin, Wizard, etc."
                  autofocus
                />
              </div>
              <div>
                <label class="f-label">Image</label>
                <div class="enc-add-condition">
                  <InputText
                    v-model="editLibraryTokenForm.imageSource"
                    placeholder="URL or file path"
                    class="flex-1"
                  />
                  <Button class="icon-btn-sq" @click="browseEditTokenImage">
                    <OhVueIcon name="fa-folder-open" scale="0.9" />
                  </Button>
                </div>
                <div v-if="editLibraryTokenForm.imageSource" class="mt-2" style="text-align:center">
                  <img :src="editLibraryTokenForm.imageSource" style="max-height:80px;border-radius:6px;object-fit:contain" />
                </div>
              </div>
              <TokenLinkPicker
                label="Linked Creature" hint="auto-fills HP & AC on placement" placeholder="Search records…"
                :selected="editLibraryTokenForm.linkedRecordName" :results="recordPickerResults"
                v-model:search="tokenModalRecordSearch"
                @focus="filterTokenModalRecords" @select="selectTokenModalRecord($event, 'edit')" @clear="clearTokenModalRecord('edit')"
              />
              <TokenLinkPicker
                label="Linked NPC" hint="campaign character this token represents" placeholder="Search NPCs…"
                :selected="editLibraryTokenForm.linkedEntityName" :results="tokenModalNpcResults" accent="#7cc44e"
                v-model:search="tokenModalNpcSearch"
                @select="selectTokenModalNpc($event, 'edit')" @clear="clearTokenModalNpc('edit')"
              />
              <!-- Image sync -->
              <label v-if="editLibraryTokenForm.linkedEntityId || editLibraryTokenForm.linkedRecordId" class="tok-pc-row">
                <input type="checkbox" v-model="editLibraryTokenForm.syncImage" class="tem-checkbox" @change="pullLinkedImage('edit')" />
                <span>Sync image with linked entry <span class="f-hint">{{ editLibraryTokenForm.linkedEntityId ? 'NPC portrait' : 'creature image' }} ↔ token — uncheck for a separate token image</span></span>
              </label>
              <!-- PC flag -->
              <label class="tok-pc-row">
                <input type="checkbox" v-model="editLibraryTokenForm.isPlayerCharacter" class="tem-checkbox" />
                <span>Player Character <span class="f-hint">pinned at top of token list</span></span>
              </label>
            </div>
            <div class="flex justify-end gap-2 mt-4">
              <Button severity="secondary" @click="showEditLibraryToken = false">Cancel</Button>
              <Button @click="confirmEditLibraryToken">Save</Button>
            </div>
          </div>
        </div>
      </Teleport>

      <!-- ── Token Picker Modal (right-click → place from library) ─────────── -->
      <Teleport to="body">
        <div
          v-if="showTokenPicker"
          class="modal-overlay"
          @click.self="showTokenPicker = false"
        >
          <div class="modal-box token-picker-box">
            <div class="modal-title">Place Token</div>
            <InputText
              v-model="tokenPickerSearch"
              placeholder="Search library…"
              autofocus
              style="width:100%;margin-bottom:10px"
            />
            <div class="token-picker-list">
              <div
                v-for="token in filteredPickerTokens"
                :key="token.id"
                class="token-picker-row"
                @click="pickTokenForPlacement(token)"
              >
                <div class="token-thumb token-thumb--sm">
                  <img v-if="token.imageSource" :src="getImageUrl(token)" class="enc-token-img" />
                  <span v-else class="enc-token-initial">{{ token.name.charAt(0) }}</span>
                </div>
                <span class="token-picker-name">{{ token.name }}</span>
                <OhVueIcon name="md-add" scale="0.85" class="token-picker-add-icon" />
              </div>
              <p v-if="filteredPickerTokens.length === 0" class="enc-hint" style="padding:12px 0;text-align:center">
                No tokens in library
              </p>
            </div>
            <div class="token-picker-footer">
              <button class="link-btn link-btn--link" @click="openCreateTokenFromPicker">
                + Create new token
              </button>
              <Button severity="secondary" @click="showTokenPicker = false">Cancel</Button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
    <!-- end encounter-page -->

    <!-- ── Initiative formula modal ── -->
    <Teleport to="body">
      <div v-if="showInitFormula" class="pv-dialog-mask" @click.self="showInitFormula = false" @keyup.esc="showInitFormula = false">
        <div class="pv-dialog init-formula-modal">
          <div class="pv-dialog-header">
            <span class="pv-dialog-title">Initiative Formula</span>
            <button class="pv-dialog-close" @click="showInitFormula = false">✕</button>
          </div>
          <div class="pv-dialog-content">
            <div class="init-formula-label">Formula expression</div>
            <div class="init-formula-row">
              <input
                v-model="initFormulaInput"
                class="init-formula-input"
                placeholder="e.g. d20 + floor(dex / 2)"
                @keyup.enter="saveInitFormula"
                @keyup.esc="showInitFormula = false"
              />
            </div>
            <div class="init-formula-label" style="margin-top:8px">Presets</div>
            <div class="init-formula-presets">
              <button class="init-preset-chip" @click="initFormulaInput = 'd20'">d20</button>
              <button class="init-preset-chip" @click="initFormulaInput = 'd20 + dexmod'">d20 + dexmod</button>
              <button class="init-preset-chip" @click="initFormulaInput = 'd20 + floor((dex - 10) / 2)'">d20 + DEX mod</button>
              <button class="init-preset-chip" @click="initFormulaInput = 'd20 + floor(perception / 2)'">d20 + perc/2</button>
            </div>
            <div v-if="initFormulaError" class="init-formula-error">{{ initFormulaError }}</div>
            <div v-else-if="store.current?.initiativeFormula" class="init-formula-active">
              Active: <code>{{ store.current.initiativeFormula }}</code>
            </div>
          </div>
          <div class="pv-dialog-footer">
            <button v-if="store.current?.initiativeFormula" class="init-formula-clear" @click="clearInitFormula">Clear</button>
            <button class="init-formula-save" @click="saveInitFormula">Save</button>
          </div>
        </div>
      </div>
    </Teleport>
</template>

<script setup lang="ts">
import { lsKey } from '~/utils/appNamespace'
import { useEncounterStore } from "~/stores/encounter";
import type { EncounterToken } from "~/stores/encounter";
import { useEncounterCanvas, type ShapeType, type ShapeOverlay } from "../../../composables/useEncounterCanvas";
import { dbApi, parseRecordData, imageTypeOf } from "~/composables/useDb";
import { hexColorToNumber } from "~/composables/useConditions";
import { useSystems } from "~/composables/useSystems";
import { useConditionPanel } from "~/composables/useConditionPanel";
import { useStatBlockLinker } from "~/composables/useStatBlockLinker";
import { useSounds } from "~/composables/useSounds";
import { useEntities } from "~/composables/useEntities";

const { extractStatsFromData, getCombatantTypes, extractImageFromRecord } = useStatBlockLinker();

const route = useRoute();
const store = useEncounterStore();
const entitiesStore = useEntities();
const systemsStore = useSystems();
const canvasContainer = ref<HTMLElement | null>(null);

const activeTool = ref<"select" | "fog" | "measure" | "shapes" | "wall" | "ping">("select");

// ── Player view layout ────────────────────────────────────────────────────
const showPlayerViewPrefs = ref(false);
const TURN_RAIL_POSITIONS = [
  { value: 'top', label: 'Top' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
] as const;
const TURN_RAIL_SIZES = [
  { value: 'small', label: 'S' },
  { value: 'medium', label: 'M' },
  { value: 'large', label: 'L' },
] as const;

const COVER_TYPES = [
  { value: 'full',           label: 'Full',  color: 'rgba(255,255,255,0.9)' },
  { value: 'three-quarter',  label: '¾',     color: 'rgba(184,134,11,0.85)' },
  { value: 'half',           label: '½',     color: 'rgba(200,100,20,0.85)' },
  { value: 'quarter',        label: '¼',     color: 'rgba(200,50,20,0.75)'  },
  { value: 'door',           label: 'Door',  color: 'rgba(100,200,220,0.9)' },
] as const
const activeCoverType = ref<'full' | 'three-quarter' | 'half' | 'quarter' | 'door'>('full')

// ── Mode ───────────────────────────────────────────────────────────────────
const mode = ref<'prepare' | 'run'>('prepare');
const MODE_KEY = computed(() => lsKey(`enc.mode.${route.params.id}`));

function setMode(next: 'prepare' | 'run') {
  if (next === 'prepare' && mode.value === 'run' && store.roundNumber > 0) {
    const ok = window.confirm(
      `Return to Prepare mode? The current round (Round ${store.roundNumber}) will still be saved when you return.`
    );
    if (!ok) return;
  }
  mode.value = next;
  if (store.current?.id) {
    dbApi.encounters.update({ id: store.current.id, status: next === 'run' ? 'active' : 'prepared' });
  }
}

watch(mode, async v => {
  localStorage.setItem(MODE_KEY.value, v)
  await nextTick()
  canvas?.forceResize()
});

// ── Editable encounter name ─────────────────────────────────────────────────
const nameEditing = ref(false);
const nameInputEl = ref<HTMLInputElement | null>(null);

function startNameEdit() {
  nameEditing.value = true;
  nextTick(() => nameInputEl.value?.select());
}

function commitNameEdit() {
  const val = nameInputEl.value?.value?.trim();
  if (val) store.updateName(val);
  nameEditing.value = false;
}

// Fog tool state
const fogMode = ref<"add" | "remove">("add");
const fogBrushSize = ref(1);

// Shape tool state
const shapeType = ref<ShapeType>("circle");
const shapeColor = ref("#e84040");
const shapes = ref<ShapeOverlay[]>([]);

const hexToPixi = hexColorToNumber;

const selectedToken = ref<any>(null);
const editingToken = ref<EncounterToken | null>(null);

// ── Stat-block link modal ──────────────────────────────────────────────────
const linkModalOpen = ref(false);
const linkPendingTokenId = ref<number | null>(null);
const linkCampaignSystemId = ref<number | null>(null);
const linkRecordsLoading = ref(false);
const linkSelectedId = ref<number | null>(null);
const linkSearch = ref('');

const filteredLinkRecords = computed(() =>
  creatureRecords.value.filter(r =>
    r.name.toLowerCase().includes(linkSearch.value.toLowerCase())
  )
);

async function openLinkModal(tokenId: number) {
  if (!linkCampaignSystemId.value) return;
  linkSelectedId.value = null;
  linkSearch.value = '';
  linkPendingTokenId.value = tokenId;
  linkModalOpen.value = true;
  linkRecordsLoading.value = !creatureRecords.value.length;
  await ensureCreatureRecords();
  linkRecordsLoading.value = false;
  if (linkModalOpen.value && linkPendingTokenId.value === tokenId && !creatureRecords.value.length) {
    linkModalOpen.value = false;
  }
}

/** Places a library token and, only when the token has no link of its own,
 *  asks which stat block it should use. */
async function placeLibraryToken(tokenId: number, gridX: number, gridY: number) {
  const { token, needsLinkPrompt } = await store.addTokenToEncounter(tokenId, gridX, gridY);
  if (token && needsLinkPrompt) await openLinkModal(token.id);
}

async function confirmLink() {
  if (!linkSelectedId.value || !linkPendingTokenId.value) return;
  const rec = await dbApi.records.get(linkSelectedId.value);
  if (!rec) return;

  const data: Record<string, any> = parseRecordData(rec.data);

  if (!systemsStore.getSystem(rec.systemId)) await systemsStore.loadAll();
  const recSys = systemsStore.getSystem(rec.systemId);
  const recEt: any = recSys?.entityTypes?.find((et: any) => et.id === rec.entityTypeId);
  const stats = extractStatsFromData(data, recEt?.fields ?? []);

  const token = store.current?.tokens.find(t => t.id === linkPendingTokenId.value);
  const updates: Record<string, any> = { linkedRecordId: rec.id };
  if (stats.hpMax !== null) { updates.hpMax = stats.hpMax; updates.hpCurrent = stats.hpCurrent; }
  // Note: ac is intentionally not synced here — matches prior behavior.
  if (!token?.label) updates.label = rec.name;

  if (Array.isArray(data.conditions) && data.conditions.length) {
    updates.conditions = data.conditions.map((c: any) =>
      typeof c === 'string' ? { name: c, value: null } : c
    );
  }

  await store.updateToken(linkPendingTokenId.value, updates as any);
  linkModalOpen.value = false;
  linkPendingTokenId.value = null;
}

// ── Record slide-in panel ──────────────────────────────────────────────────
const recordPanel = ref<{ open: boolean; record: any; entityType: any; systemId: number } | null>(null);

async function openRecordPanel(recordId: number) {
  const rec = await dbApi.records.get(recordId);
  if (!rec) return;
  if (!systemsStore.getSystem(rec.systemId)) await systemsStore.loadAll();
  const sys = systemsStore.getSystem(rec.systemId);
  const entityType = sys?.entityTypes?.find((et: any) => et.id === rec.entityTypeId) ?? null;
  recordPanel.value = {
    open: true,
    record: { ...rec, data: parseRecordData(rec.data) },
    entityType,
    systemId: rec.systemId,
  };
}

// ── Condition modal ────────────────────────────────────────────────────────
const conditionToken = ref<EncounterToken | null>(null);

function onConditionUpdate(tokenId: number, conditions: any[]) {
  store.updateToken(tokenId, { conditions });
}

// ── Condition reference panel ──────────────────────────────────────────────
const {
  conditionPanelOpen,
  conditionPanelName,
  conditionPanelValue,
  openCondition: openConditionPanel,
} = useConditionPanel();

// ── Context menu ──────────────────────────────────────────────────────────
const ctxMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  gridX: 0,
  gridY: 0,
  targetToken: null as EncounterToken | null,
})

const shapeCtxMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  shapeId: null as string | null,
})

const wallCtxMenu = reactive({
  open: false,
  x: 0,
  y: 0,
  wallId: null as number | null,
  segmentIndex: 0,
  isDoor: false,
  isOpen: false,
})

function onCanvasRightClick(e: MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
  if (!canvas || activeTool.value !== 'select') return

  const { gridX, gridY } = canvas.getGridPosFromScreen(e.offsetX, e.offsetY)
  const hit = store.allTokens.find((t: EncounterToken) => {
    const b = canvas!.getTokenScreenBounds(t.id)
    if (!b) return false
    return e.offsetX >= b.x && e.offsetX <= b.x + b.w
        && e.offsetY >= b.y && e.offsetY <= b.y + b.h
  }) ?? null

  // If no token was hit, check for a shape overlay at the click position
  if (!hit) {
    const hitShape = canvas.getShapeAtScreen(e.offsetX, e.offsetY)
    if (hitShape) {
      shapeCtxMenu.x = e.clientX
      shapeCtxMenu.y = e.clientY
      shapeCtxMenu.shapeId = hitShape.id
      shapeCtxMenu.open = true
      return
    }

    // Check for a wall segment at the click position
    const wallHit = canvas.getWallAtPoint(e.offsetX, e.offsetY)
    if (wallHit) {
      wallCtxMenu.x = e.clientX
      wallCtxMenu.y = e.clientY
      wallCtxMenu.wallId = wallHit.wall.id ?? null
      wallCtxMenu.segmentIndex = wallHit.segmentIndex
      wallCtxMenu.isDoor = wallHit.wall.coverType === 'door'
      wallCtxMenu.isOpen = wallHit.wall.isOpen
      wallCtxMenu.open = true
      return
    }
  }

  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.gridX = gridX
  ctxMenu.gridY = gridY
  ctxMenu.targetToken = hit
  ctxMenu.open = true
}

function onTokenRowRightClick(e: MouseEvent, token: EncounterToken) {
  e.preventDefault()
  e.stopPropagation()
  ctxMenu.x = e.clientX
  ctxMenu.y = e.clientY
  ctxMenu.gridX = token.gridX
  ctxMenu.gridY = token.gridY
  ctxMenu.targetToken = token
  ctxMenu.open = true
}

// Pending drop position for "Add Token Here"
const pendingDropPos = ref<{ gridX: number; gridY: number } | null>(null)

function onCtxAddTokenHere(gridX: number, gridY: number) {
  pendingDropPos.value = { gridX, gridY }
  tokenPickerSearch.value = ''
  showTokenPicker.value = true
}

async function pickTokenForPlacement(token: any) {
  if (!pendingDropPos.value) return
  const { gridX, gridY } = pendingDropPos.value
  pendingDropPos.value = null
  showTokenPicker.value = false
  await placeLibraryToken(token.id, gridX, gridY)
}

function openCreateTokenFromPicker() {
  showTokenPicker.value = false
  showAddToken.value = true
}

function onCtxEditToken(tokenId: number) {
  const token = store.getToken(tokenId)
  if (token) { selectedToken.value = token; editingToken.value = token }
}

function onCtxAddCondition(tokenId: number) {
  const token = store.getToken(tokenId)
  if (token) { conditionToken.value = token }
}

function onCtxQuickCondition(tokenId: number, name: string) {
  store.toggleCondition(tokenId, name)
}

function applyQuickHp(e: KeyboardEvent, tokenId: number) {
  const input = e.target as HTMLInputElement
  const val = Number(input.value)
  if (!val) return
  store.applyDamage(tokenId, val)
  input.value = ''
  input.blur()
}

// ── Multi-select (Order tab) ──────────────────────────────────────────────────
const selectedTokenIds = shallowRef<Set<number>>(new Set())

function clearSelection() { selectedTokenIds.value = new Set() }

function onOrderRowClick(event: MouseEvent, token: any) {
  if (event.shiftKey) {
    const s = new Set(selectedTokenIds.value)
    s.has(token.id) ? s.delete(token.id) : s.add(token.id)
    selectedTokenIds.value = s
    return
  }
  clearSelection()
  selectToken(token)
}

function bulkSetVisibility(visible: boolean) {
  store.bulkSetTokenVisibility(selectedTokenIds.value, visible)
  clearSelection()
}

function bulkRemove() {
  store.bulkRemoveTokens(selectedTokenIds.value)
  clearSelection()
}


function onCtxSetInitiative(tokenId: number, value: number | null) {
  if (value !== null) store.updateToken(tokenId, { initiative: value })
}

function onCtxApplyDamage(tokenId: number, amount: number) {
  store.applyDamage(tokenId, amount)
}

const npcPanel = ref<{ open: boolean; name: string }>({ open: false, name: '' })

function onCtxViewNpc(tokenId: number) {
  const token = store.getToken(tokenId)
  if (!token?.linkedEntityId) return
  const ent = entitiesStore.entities.find(e => e.id === token.linkedEntityId)
  if (ent) npcPanel.value = { open: true, name: ent.name }
}

function onCtxViewRecord(tokenId: number) {
  const token = store.getToken(tokenId)
  if (token?.linkedRecordId) openRecordPanel(token.linkedRecordId)
}

function onCtxToggleVisibility(tokenId: number) {
  const token = store.getToken(tokenId)
  if (token) store.updateToken(tokenId, { isVisible: !token.isVisible })
}

function onCtxToggleDead(tokenId: number) {
  const token = store.getToken(tokenId)
  if (token) store.updateToken(tokenId, { isDead: !token.isDead })
}

function onCtxToggleActsWhileHidden(tokenId: number) {
  const token = store.getToken(tokenId)
  if (token) store.updateToken(tokenId, { actsWhileHidden: !token.actsWhileHidden })
}

function onCtxTogglePlayerToken(tokenId: number) {
  const token = store.getToken(tokenId)
  if (token) store.updateToken(tokenId, { isPlayerToken: !token.isPlayerToken })
}

function onCtxAddTimer(tokenId: number, name: string, turns: number) {
  store.addTimer(tokenId, name, turns)
}

function onCtxRemoveToken(tokenId: number) {
  store.removeToken(tokenId)
}

function onCtxRemoveShape() {
  if (shapeCtxMenu.shapeId) removeShape(shapeCtxMenu.shapeId)
  shapeCtxMenu.open = false
}

function setFovMode(mode: 'gm' | 'active' | 'group') {
  store.fovMode = mode
  canvas?.recomputeFov()
}

async function toggleFovEnabled() {
  await store.setFovEnabled(!encounter.value?.fovEnabled)
}

async function onWallCtxToggleDoor() {
  if (wallCtxMenu.wallId !== null) {
    await store.toggleDoor(wallCtxMenu.wallId)
    canvas?.redrawWalls()
    canvas?.recomputeFov()
  }
  wallCtxMenu.open = false
}

async function onWallCtxDelete() {
  if (wallCtxMenu.wallId !== null) {
    await store.deleteWall(wallCtxMenu.wallId)
    canvas?.redrawWalls()
    canvas?.recomputeFov()
  }
  wallCtxMenu.open = false
}

async function onTokenEdit(tokenId: number, changes: Partial<EncounterToken>) {
  await store.updateToken(tokenId, changes)
  editingToken.value = null
  selectedToken.value = null
}

// ── Right sidebar tab ─────────────────────────────────────────────────────
const rightTab = ref<'tokens' | 'log'>('tokens');
const activeTab = ref<'order' | 'log'>('order');

// ── Initiative formula settings ────────────────────────────────────────────
const showInitFormula = ref(false)
const initFormulaInput = ref('')
const initFormulaError = ref('')

watch(() => store.current?.initiativeFormula, (f) => {
  initFormulaInput.value = f ?? ''
}, { immediate: true })

function saveInitFormula() {
  const formula = initFormulaInput.value.trim()
  if (!formula) {
    clearInitFormula()
    return
  }
  // evaluateFormula returns 0 on error (never throws), so any formula string is valid
  // we just persist it; if the result is nonsensical the DM will see 0 rolls
  store.setInitiativeFormula(formula)
  initFormulaError.value = ''
  showInitFormula.value = false
}

function clearInitFormula() {
  store.setInitiativeFormula(null)
  initFormulaInput.value = ''
  initFormulaError.value = ''
}

function hpPercent(token: any): number {
  return token.hpMax
    ? Math.max(0, Math.min(100, Math.round((token.hpCurrent ?? 0) / token.hpMax * 100)))
    : 0;
}

function hpBarColor(token: any): string {
  const pct = hpPercent(token);
  if (!token.hpMax || pct >= 50) return 'var(--grass)';
  if (pct >= 25) return 'var(--gold)';
  return 'var(--blood)';
}

// ── Combat log UI ─────────────────────────────────────────────────────────
const logNoteTokenId = ref<number | null>(null);
const logNoteText = ref('');
const clearLogConfirm = ref(false);

const reversedLog = computed(() =>
  store.current ? [...store.current.combatLog].reverse() : []
);

function submitLogNote() {
  if (!logNoteTokenId.value || !logNoteText.value.trim()) return;
  store.addLogNote(logNoteTokenId.value, logNoteText.value.trim());
  logNoteText.value = '';
}

function confirmClearLog() { clearLogConfirm.value = true; }

async function doClearLog() {
  await store.clearCombatLog();
  clearLogConfirm.value = false;
}

const showAddToken = ref(false);
const showEditLibraryToken = ref(false);
const editLibraryTokenId = ref<number | null>(null);
type LibraryTokenForm = {
  name: string
  imageSource: string
  imageType: 'file' | 'url'
  linkedRecordId: number | null
  linkedRecordName: string | null
  linkedEntityId: number | null
  linkedEntityName: string | null
  isPlayerCharacter: boolean
  syncImage: boolean
}
function emptyTokenForm(): LibraryTokenForm {
  return {
    name: '', imageSource: '', imageType: 'file',
    linkedRecordId: null, linkedRecordName: null,
    linkedEntityId: null, linkedEntityName: null,
    isPlayerCharacter: false, syncImage: true,
  }
}
const editLibraryTokenForm = ref<LibraryTokenForm>(emptyTokenForm());
const showTokenPicker = ref(false);
const tokenPickerSearch = ref("");

function sortPcFirst(tokens: typeof store.tokenLibrary) {
  return [...tokens].sort((a, b) => {
    if (a.isPlayerCharacter === b.isPlayerCharacter) return 0
    return a.isPlayerCharacter ? -1 : 1
  })
}

const filteredPickerTokens = computed(() => {
  const filtered = store.tokenLibrary.filter((t: any) =>
    t.name.toLowerCase().includes(tokenPickerSearch.value.toLowerCase())
  )
  return sortPcFirst(filtered)
});
const tokenSearch = ref("");
const newToken = ref<LibraryTokenForm>(emptyTokenForm());

// ── Token library sidebar tab (Tokens | Creatures) ────────────────────────
const libSidebarTab = ref<'tokens' | 'creatures'>('tokens')
const creatureRecords = ref<Array<{ id: number; name: string; entityTypeId: string; imageSource: string | null }>>([])
const creatureSearch = ref('')
const filteredCreatures = computed(() =>
  creatureRecords.value.filter(r =>
    r.name.toLowerCase().includes(creatureSearch.value.toLowerCase()) ||
    r.entityTypeId.toLowerCase().includes(creatureSearch.value.toLowerCase())
  )
)

// Creature records back the Creatures tab, the "Link to Stat Block?" dialog and
// the token modals' record search. They rarely change while an encounter is
// open, so they're loaded once, in a single scan of the system's records.
let creaturesPromise: Promise<void> | null = null
function ensureCreatureRecords(): Promise<void> {
  if (!creaturesPromise) {
    creaturesPromise = (async () => {
      const systemId = linkCampaignSystemId.value
      if (!systemId) return
      const typeIds = new Set(await getCombatantTypes(systemId))
      const sys = systemsStore.getSystem(systemId)
      const fieldsByType = new Map<string, any[]>((sys?.entityTypes ?? []).map((et: any) => [et.id, et.fields ?? []]))
      const recs = await dbApi.records.list(systemId)
      creatureRecords.value = recs
        .filter(r => typeIds.has(r.entityTypeId))
        .map(r => ({
          id: r.id!, name: r.name, entityTypeId: r.entityTypeId,
          imageSource: extractImageFromRecord(parseRecordData(r.data), fieldsByType.get(r.entityTypeId)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name))
    })().catch(err => {
      console.error('[Encounter] loading creature records:', err)
      creaturesPromise = null
    })
  }
  return creaturesPromise
}

const searchInputRef = ref<any>(null)

watch(libSidebarTab, async (tab) => {
  if (tab === 'creatures') ensureCreatureRecords()
  await nextTick()
  searchInputRef.value?.$el?.focus()
})

// ── Shared record search for Add/Edit Library Token modals ────────────────
const tokenModalRecordSearch = ref('')
const tokenModalRecordResults = ref<Array<{ id: number; name: string; entityTypeId: string }>>([])

async function filterTokenModalRecords() {
  if (!linkCampaignSystemId.value) return
  const q = tokenModalRecordSearch.value.toLowerCase()
  if (!q) { tokenModalRecordResults.value = []; return }
  await ensureCreatureRecords()
  tokenModalRecordResults.value = creatureRecords.value
    .filter(r => r.name.toLowerCase().includes(q) || r.entityTypeId.toLowerCase().includes(q))
    .slice(0, 8)
}

function tokenForm(target: 'new' | 'edit') {
  return target === 'new' ? newToken.value : editLibraryTokenForm.value
}

const recordPickerResults = computed(() =>
  tokenModalRecordResults.value.map(r => ({ id: r.id, name: r.name, tag: r.entityTypeId }))
)
watch(tokenModalRecordSearch, filterTokenModalRecords)

function selectTokenModalRecord(id: number, target: 'new' | 'edit') {
  const rec = creatureRecords.value.find(r => r.id === id)
  if (!rec) return
  const form = tokenForm(target)
  form.linkedRecordId = rec.id
  form.linkedRecordName = rec.name
  if (!form.name.trim()) form.name = rec.name
  tokenModalRecordSearch.value = ''
  tokenModalRecordResults.value = []
  pullLinkedImage(target)
}

function clearTokenModalRecord(target: 'new' | 'edit') {
  const form = tokenForm(target)
  form.linkedRecordId = null
  form.linkedRecordName = null
}

// ── NPC linking for library tokens ────────────────────────────────────────
const campaignNpcs = computed(() => entitiesStore.byType.npc ?? [])
const tokenModalNpcSearch = ref('')
const tokenModalNpcResults = computed(() => {
  const q = tokenModalNpcSearch.value.trim().toLowerCase()
  if (!q) return []
  return campaignNpcs.value
    .filter(n => n.name.toLowerCase().includes(q))
    .slice(0, 8)
    .map(n => ({ id: n.id, name: n.name, tag: (n.attributes as any).isPlayerCharacter ? 'PC' : 'NPC' }))
})

function selectTokenModalNpc(id: number, target: 'new' | 'edit') {
  const npc = campaignNpcs.value.find(n => n.id === id)
  if (!npc) return
  const form = tokenForm(target)
  form.linkedEntityId = npc.id
  form.linkedEntityName = npc.name
  if (!form.name.trim()) form.name = npc.name
  if ((npc.attributes as any).isPlayerCharacter) form.isPlayerCharacter = true
  tokenModalNpcSearch.value = ''
  pullLinkedImage(target)
}

function clearTokenModalNpc(target: 'new' | 'edit') {
  const form = tokenForm(target)
  form.linkedEntityId = null
  form.linkedEntityName = null
}

/** With sync on, show the linked entry's image in the form right away, so the
 *  preview reflects what the token will look like after saving. */
async function pullLinkedImage(target: 'new' | 'edit') {
  const form = tokenForm(target)
  if (!form.syncImage) return
  const img = await dbApi.linkedImages.get(form.linkedEntityId, form.linkedRecordId)
  if (img) { form.imageSource = img.source; form.imageType = img.type }
}

function formToLibraryInput(form: LibraryTokenForm) {
  const img = form.imageSource.trim()
  return {
    name: form.name.trim(),
    imageSource: img || null,
    imageType: imageTypeOf(img),
    linkedRecordId: form.linkedRecordId,
    linkedEntityId: form.linkedEntityId,
    isPlayerCharacter: form.isPlayerCharacter,
    syncImage: form.syncImage,
  }
}

/** Image sync may have written the token image to the linked creature record. */
function patchCreatureImage(form: LibraryTokenForm) {
  if (!form.syncImage || form.linkedEntityId || !form.linkedRecordId || !form.imageSource.trim()) return
  const rec = creatureRecords.value.find(r => r.id === form.linkedRecordId)
  if (rec) rec.imageSource = form.imageSource.trim()
}

function resetTokenModalSearch() {
  tokenModalRecordSearch.value = ''
  tokenModalRecordResults.value = []
  tokenModalNpcSearch.value = ''
}

function openAddTokenModal() {
  pendingDropPos.value = null
  newToken.value = emptyTokenForm()
  resetTokenModalSearch()
  showAddToken.value = true
}

// Dragging type: 'token' or 'creature'
let draggingPayload: { type: 'token'; tokenId: number } | { type: 'creature'; recordId: number } | null = null

function toggleTool(tool: "fog" | "measure" | "shapes" | "wall" | "ping") {
  activeTool.value = activeTool.value === tool ? "select" : tool;
}

const encounter = computed(() => store.current);
const encounterTokens = computed(() => store.allTokens);

// ── Music ──────────────────────────────────────────────────────────────────
const { playlists: soundPlaylists, load: loadSounds } = useSounds();

async function onPlaylistLinkChange(e: Event) {
  const val = (e.target as HTMLSelectElement).value;
  await store.setSoundPlaylistId(val ? Number(val) : null);
}
const sortedEncounterTokens = computed(() =>
  store.allTokens.sort((a, b) => {
    // Tokens with initiative set come first, sorted descending
    if (a.initiative === null && b.initiative === null) return 0;
    if (a.initiative === null) return 1;
    if (b.initiative === null) return -1;
    return b.initiative - a.initiative;
  }),
);
const playerWindowOpen = computed(() => store.playerWindowOpen);
const filteredLibrary = computed(() => {
  const q = tokenSearch.value.toLowerCase()
  const pcs: typeof store.tokenLibrary = []
  const others: typeof store.tokenLibrary = []
  for (const t of store.tokenLibrary) {
    if (!t.name.toLowerCase().includes(q)) continue
    t.isPlayerCharacter ? pcs.push(t) : others.push(t)
  }
  return { pcs, others, isEmpty: pcs.length === 0 && others.length === 0 }
})
const filteredLibraryPCs = computed(() => filteredLibrary.value.pcs)
const filteredLibraryOthers = computed(() => filteredLibrary.value.others)

let canvas: ReturnType<typeof useEncounterCanvas> | null = null;

// ── Condition chips overlay state ──────────────────────────────────────────
const hoveredTokenId = ref<number | null>(null);
const canvasViewport = ref<{ x: number; y: number; scale: number } | null>(null);

const currentTurnTokenId = computed(
  () => store.initiativeOrder[store.currentTurnIndex]?.id ?? null
);

// ── Lifecycle ──────────────────────────────────────────────────────────────
onMounted(async () => {
  const id = Number(route.params.id);
  await Promise.all([store.loadEncounter(id), store.loadTokenLibrary(), loadSounds()]);

  mode.value = (localStorage.getItem(MODE_KEY.value) as any) ?? 'prepare';

  // Load campaign's linked system id for the token edit modal
  const camp = await dbApi.campaigns.get(store.current!.campaignId);
  if ((camp as any)?.system_id) {
    linkCampaignSystemId.value = (camp as any).system_id;
    // Warm the creature list so the "Link to Stat Block?" dialog opens instantly
    ensureCreatureRecords();
  }
  // NPCs for token linking and the "View NPC" panel
  entitiesStore.loadAll(store.current!.campaignId);

  if (!canvasContainer.value) return;

  canvas = useEncounterCanvas({
    container: canvasContainer.value,
    isDmMode: true,
    getActiveTool: () => activeTool.value,
    getActiveTurnTokenId: () => currentTurnTokenId.value,
    getFogMode: () => fogMode.value,
    getFogBrushSize: () => fogBrushSize.value,
    getShapeType: () => shapeType.value,
    getShapeColor: () => hexToPixi(shapeColor.value),
    onTokenMoved: (instanceId, gridX, gridY) => {
      store.moveToken(instanceId, gridX, gridY);
    },
    onFogToggle: (cellKey, newState) => {
      store.setFogCell(cellKey, newState);
      canvas?.redrawFog();
    },
    onShapeCommit: (anchorCol, anchorRow, endCol, endRow) => {
      addShape(anchorCol, anchorRow, endCol, endRow);
    },
    onWallComplete: async ({ points, coverType }) => {
      await store.addWall(points, coverType);
      canvas?.redrawWalls();
    },
    onTokenPointerEnter: (tokenId) => {
      hoveredTokenId.value = tokenId;
      canvasViewport.value = canvas?.getViewport() ?? null;
    },
    onTokenPointerLeave: (tokenId) => {
      if (hoveredTokenId.value === tokenId) hoveredTokenId.value = null;
    },
    onPing: (col, row, focus) => {
      store.sendPing(col, row, focus);
    },
  });

  await canvas.init();

  if (store.current?.mapSource) {
    await canvas.loadMap(store.current.mapSource, store.current.mapType);
  }
  await canvas.renderTokens();
  canvas.redrawWalls();
  canvas.recomputeFov();

  // Listen for player window close
  dbApi.window.onPlayerClosed(() => {
    store.playerWindowOpen = false;
  });

  document.addEventListener('keydown', handleWallUndo)
  document.addEventListener('dragend', handleDragEnd)
});

watch(
  () => store.current?.mapSource,
  async (src, old) => {
    if (src && src !== old && canvas) {
      await canvas.loadMap(src, store.current!.mapType);
    }
  },
);

watch(
  () => store.current?.tokens,
  async () => {
    await canvas?.renderTokens();
    canvas?.recomputeFov();
    canvasViewport.value = canvas?.getViewport() ?? null;
  },
  { deep: true },
);

watch(
  () => store.current?.viewport,
  () => { canvasViewport.value = canvas?.getViewport() ?? null; },
  { deep: true },
);

watch(currentTurnTokenId, async () => {
  await canvas?.renderTokens();
  canvas?.recomputeFov();
});

watch(
  () => store.current?.fogData,
  () => {
    canvas?.redrawFog();
  },
  { deep: true },
);

watch(
  () => [
    store.current?.gridSize,
    store.current?.gridOffsetX,
    store.current?.gridOffsetY,
  ],
  () => {
    canvas?.drawGrid();
    canvas?.redrawFog();
  },
);

const handleDragEnd = () => { draggingPayload = null }

onUnmounted(() => {
  document.removeEventListener('keydown', handleWallUndo);
  document.removeEventListener('dragend', handleDragEnd);
  canvas?.destroy();
});

// ── Handlers ───────────────────────────────────────────────────────────────
async function onSetMap() {
  const dataUrl = await dbApi.system.openFileDialog();
  if (dataUrl) await store.setMap(dataUrl, "file");
}

async function onGridSizeChange(e: Event) {
  const size = Number((e.target as HTMLInputElement).value);
  const enc = store.current;
  if (!enc) return;
  await store.updateGrid(size, enc.gridOffsetX, enc.gridOffsetY);
}

async function onGridSizeInput(e: Event) {
  const val = Number((e.target as HTMLInputElement).value);
  const enc = store.current;
  if (!enc || Number.isNaN(val)) return;
  const clamped = Math.min(200, Math.max(1, val));
  await store.updateGrid(clamped, enc.gridOffsetX, enc.gridOffsetY);
}

async function onOffsetChange(axis: "x" | "y", val: number | null) {
  if (val === null) return;
  const enc = store.current;
  if (!enc) return;
  if (axis === "x") await store.updateGrid(enc.gridSize, val, enc.gridOffsetY);
  else await store.updateGrid(enc.gridSize, enc.gridOffsetX, val);
}

function onTokenDragStart(e: DragEvent, token: any) {
  draggingPayload = { type: 'token', tokenId: token.id }
  e.dataTransfer?.setData("tokenId", String(token.id))
}

function onCreatureDragStart(e: DragEvent, record: any) {
  draggingPayload = { type: 'creature', recordId: record.id }
  e.dataTransfer?.setData("creatureId", String(record.id))
}

async function onCanvasDrop(e: DragEvent) {
  const payload = draggingPayload
  draggingPayload = null
  if (!canvas || !payload || !canvasContainer.value) return
  // offsetX/Y are relative to whichever element was under the cursor (overlays,
  // chips, …), so measure against the canvas container itself.
  const rect = canvasContainer.value.getBoundingClientRect()
  const { gridX, gridY } = canvas.getGridPosFromScreen(e.clientX - rect.left, e.clientY - rect.top)
  if (payload.type === 'creature') {
    await store.addCreatureToEncounter(payload.recordId, gridX, gridY)
  } else {
    await placeLibraryToken(payload.tokenId, gridX, gridY)
  }
}

function onLibraryDragEnd() {
  draggingPayload = null
}

async function togglePlayerWindow() {
  if (playerWindowOpen.value) await store.closePlayerWindow();
  else await store.openPlayerWindow();
}

function selectToken(token: any) {
  selectedToken.value = token;
  editingToken.value = token;
}

async function browseTokenImage() {
  const dataUrl = await dbApi.system.openFileDialog();
  if (dataUrl) {
    newToken.value.imageSource = dataUrl;
    newToken.value.imageType = "file";
  }
}

async function openEditLibraryToken(token: any) {
  editLibraryTokenId.value = token.id
  const rec = token.linkedRecordId ? await dbApi.records.get(token.linkedRecordId) : null
  const ent = token.linkedEntityId ? await dbApi.entities.get(token.linkedEntityId) : null
  editLibraryTokenForm.value = {
    name: token.name,
    imageSource: token.imageSource ?? '',
    imageType: token.imageType ?? 'file',
    linkedRecordId: rec ? token.linkedRecordId : null,
    linkedRecordName: rec?.name ?? null,
    linkedEntityId: ent ? token.linkedEntityId : null,
    linkedEntityName: ent?.name ?? null,
    isPlayerCharacter: token.isPlayerCharacter ?? false,
    syncImage: token.syncImage ?? false,
  }
  resetTokenModalSearch()
  showEditLibraryToken.value = true
}

async function browseEditTokenImage() {
  const dataUrl = await dbApi.system.openFileDialog();
  if (dataUrl) {
    editLibraryTokenForm.value.imageSource = dataUrl;
    editLibraryTokenForm.value.imageType = 'file';
  }
}

async function confirmEditLibraryToken() {
  const form = editLibraryTokenForm.value
  if (!editLibraryTokenId.value || !form.name.trim()) return
  await store.updateLibraryToken(editLibraryTokenId.value, formToLibraryInput(form))
  showEditLibraryToken.value = false
  patchCreatureImage(form)
}

async function confirmAddToken() {
  const form = newToken.value
  if (!form.name.trim()) return
  const libraryToken = await store.addToLibrary(formToLibraryInput(form))
  patchCreatureImage(form)
  const pos = pendingDropPos.value
  pendingDropPos.value = null
  newToken.value = emptyTokenForm()
  resetTokenModalSearch()
  showAddToken.value = false
  if (libraryToken && pos) await placeLibraryToken(libraryToken.id, pos.gridX, pos.gridY)
}

function addShape(anchorCol: number, anchorRow: number, endCol: number, endRow: number) {
  const id = `shape-${Date.now()}`;
  const shape: ShapeOverlay = {
    id,
    type: shapeType.value,
    anchorCol,
    anchorRow,
    endCol,
    endRow,
    colorHex: hexToPixi(shapeColor.value),
  };
  shapes.value.push(shape);
  canvas?.addShapeOverlay(shape);
}

function removeShape(id: string) {
  shapes.value = shapes.value.filter((s: ShapeOverlay) => s.id !== id);
  canvas?.removeShapeOverlay(id);
}

// Clear ruler when switching away from measure tool
watch(activeTool, (tool: string) => {
  if (tool !== "measure") canvas?.clearRuler();
  if (tool !== "shapes") canvas?.clearShapeAnchor();
});

// Redraw walls reactively when the store's wall list changes
watch(() => store.walls, () => { canvas?.redrawWalls(); canvas?.recomputeFov() }, { deep: true });

// Recompute FOV when isPlayerToken changes on any token
watch(() => store.fovRecomputeTrigger, () => { canvas?.recomputeFov() });

// Ctrl+Z — undo last wall when wall tool is active
const handleWallUndo = async (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && activeTool.value === 'wall') {
    e.preventDefault();
    await store.undoLastWall();
    canvas?.redrawWalls();
  }
};

watch(shapes, () => {
  store.setShapeOverlays(shapes.value);
}, { deep: true });

async function removeFromLibrary(id: number) {
  await dbApi.tokens.delete(id);
  store.tokenLibrary = store.tokenLibrary.filter((t) => t.id !== id);
}

function getImageUrl(token: any): string {
  if (!token.imageSource) return "";
  if (token.imageType === "url") return token.imageSource;
  return `${token.imageSource}`;
}
</script>

<style scoped>
/* ── Encounter VTT — parchment sidebars + dark canvas ── */

.encounter-page {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}

/* ── Toolbar ── */
.encounter-toolbar {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  height: 52px;
  flex-shrink: 0;
  background: var(--parch-dark);
  border-bottom: 1px solid var(--parch-line);
}


.encounter-title {
  flex: 1;
  padding: 0 12px;
  border-left: 1px solid var(--parch-line);
  border-right: 1px solid var(--parch-line);
  min-width: 0;
}

.encounter-name-display {
  display: inline-block;
  font-family: var(--font-head);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
  cursor: pointer;
  padding: 2px 4px;
  border-bottom: 1px solid transparent;
  transition: border-color 0.15s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 100%;
}
.encounter-name-display:hover {
  border-bottom-color: var(--parch-line);
}

.encounter-name-input {
  font-family: var(--font-head);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink);
  background: var(--parch-dark);
  border: 1px solid var(--ink-ghost);
  border-radius: 2px;
  padding: 2px 6px;
  outline: none;
  width: 100%;
}

/* ── Mode toggle ── */
.enc-mode-toggle {
  display: flex;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  overflow: hidden;
  background: var(--parch-dark);
  flex-shrink: 0;
}
.enc-mode-toggle button {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 10px;
  background: none;
  border: none;
  border-radius: 0;
  cursor: pointer;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  transition: color 0.15s, background 0.15s;
  white-space: nowrap;
}
.enc-mode-toggle button + button {
  border-left: 1px solid var(--parch-line);
}
.enc-mode-toggle button:hover { color: var(--ink); }
.enc-mode-toggle button.active {
  background: rgba(139, 0, 0, 0.12);
  color: var(--blood);
  border-color: var(--blood);
}

/* ── Main layout ── */
.encounter-layout {
  display: flex;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

/* ── Parchment sidebars ── */
.encounter-sidebar {
  width: 220px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--parch);
  background-image: var(--paper);
  background-blend-mode: multiply;
  overflow-y: auto;
}

.left-sidebar {
  border-right: 1px solid var(--parch-line);
}

.right-sidebar {
  border-left: 1px solid var(--parch-line);
}

/* overrides main.css — intentional: dark-chrome defaults swapped for parchment theme */
.sidebar-section {
  padding: 12px 14px;
  border-bottom: 1px dashed var(--parch-line);
}

.sidebar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.f-label {
  display: block;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  margin-bottom: 5px;
}

/* Range labels row */
.enc-grid-range-labels {
  display: flex;
  justify-content: space-between;
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--ink-ghost);
}

/* ── Token chip — unified style for both left and right sidebars ── */
.token-search {
  margin-bottom: 8px;
}

.token-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.enc-token-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

/* ── Token cards (right sidebar) ── */
.enc-token-cards {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.token-card {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 7px 8px;
  border-radius: 3px;
  border: 1px solid var(--parch-line);
  border-left: 3px solid transparent;
  background: rgba(28, 20, 16, 0.03);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.token-card:hover {
  border-color: var(--parch-line);
  border-left-color: var(--ink-ghost);
  background: rgba(28, 20, 16, 0.06);
}
.token-card--selected {
  border-left-color: var(--blood) !important;
  background: rgba(139, 26, 26, 0.06) !important;
}
.token-card--active {
  border-left-color: var(--gold) !important;
  background: rgba(184, 134, 11, 0.08) !important;
}
.token-card--dead { opacity: 0.45; }
.token-card--hidden { opacity: 0.55; }

/* Top row: avatar + name + initiative */
.token-card-top {
  display: flex;
  align-items: center;
  gap: 7px;
}
.token-card-name {
  flex: 1;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.token-card-init {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-ghost);
  flex-shrink: 0;
}
.token-card-init--set { color: var(--gold); }

/* Bottom row: HP + buttons */
.token-card-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding-left: 33px; /* align with name, past avatar */
}
.token-card-btns {
  display: flex;
  gap: 0;
}

/* Ghost icon buttons inside cards — no border, smaller, always visible */
.token-card-btns .icon-btn-sq {
  width: 22px;
  height: 22px;
  background: none;
  border: none;
  color: var(--ink-ghost);
  opacity: 0.5;
  transition: opacity 0.15s, color 0.15s;
}
.token-card-btns .icon-btn-sq:hover {
  background: none;
  border: none;
  color: var(--ink);
  opacity: 1;
}
.token-card-btns .icon-btn-sq--danger:hover {
  background: none;
  color: var(--blood);
  opacity: 1;
}
.token-card-btns .icon-btn-sq.init-roll-btn { color: var(--gold); opacity: 0.5; }
.token-card-btns .icon-btn-sq.init-roll-btn:hover { opacity: 1; }

/* overrides main.css — intentional: parchment theme (main.css has dark-chrome variant) */
.token-chip,
.encounter-token-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  background: transparent;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;
}

/* Left bar: draggable */
.token-chip {
  border: none;
  cursor: grab;
}

.token-chip:active {
  cursor: grabbing;
}

.token-chip:hover,
.encounter-token-row:hover {
  background: rgba(28, 20, 16, 0.04);
  padding-left: 10px;
  border-left-color: var(--ink-ghost);
}

.encounter-token-row.selected {
  background: rgba(139, 26, 26, 0.05);
  border-left-color: var(--blood);
  padding-left: 10px;
}

/* Unified token thumbnail */
.token-thumb,
.token-thumb-sm {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: var(--parch-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

/* Token name — ink dark, IM Fell English */
.token-lib-name {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.enc-token-info {
  flex: 1;
  min-width: 0;
}

.enc-token-name {
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.enc-token-sub {
  display: flex;
  align-items: center;
  gap: 6px;
}

.enc-token-hp {
  font-family: var(--font-head);
  font-size: 9px;
  color: var(--ink);
}

.enc-token-btns {
  display: flex;
  gap: 3px;
}

.enc-token-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}

.enc-token-initial {
  font-family: var(--font-head);
  font-size: 11px;
  color: var(--gold);
}
.enc-token-initial--creature {
  color: var(--blood);
}

/* ── Library sidebar tabs ── */
.lib-tab-bar {
  display: flex;
  border-bottom: 1px solid var(--parch-line);
  flex-shrink: 0;
}
.lib-tab {
  flex: 1;
  padding: 8px 0;
  background: none;
  border: none;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}
.lib-tab:hover { color: var(--ink); }
.lib-tab--active {
  color: var(--blood);
  border-bottom: 2px solid var(--blood);
}

/* ── PC / section separators in token list ── */
.tok-section-label {
  font-family: var(--font-head);
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  padding: 6px 8px 2px;
}
.tok-section-label--others {
  border-top: 1px dashed var(--parch-line);
  margin-top: 4px;
  padding-top: 8px;
}
.token-chip--pc {
  background: rgba(184,134,11,0.05);
}

/* ── Creature chip ── */
.creature-chip { cursor: grab; }
.creature-chip:active { cursor: grabbing; }
.creature-chip-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}
.creature-chip-type {
  font-family: var(--font-head);
  font-size: 8px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-ghost);
}

/* ── Token modal: linked record row ── */
.tok-pc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
}
.f-hint {
  font-family: var(--font-body);
  font-size: 10px;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
  color: var(--ink-ghost);
  font-style: italic;
}

/* ── Canvas — dark, full remaining height ── */
.encounter-canvas-wrapper {
  flex: 1;
  min-width: 0;
  min-height: 0;
  /* crucial: flex children need min-height:0 to shrink */
  position: relative;
  overflow: hidden;
  background: #050310;
}

.canvas-empty-state {
  position: absolute;
  inset: 0;
  pointer-events: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.enc-empty-icon {
  opacity: 0.12;
  margin-bottom: 14px;
}

.enc-empty-text {
  font-family: var(--font-body);
  font-size: 15px;
  color: #4a3a5a;
  font-style: italic;
}

/* ── Grid helpers ── */
.enc-grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.enc-offset-label {
  margin-top: 6px;
}

/* ── Conditions ── */
.enc-conditions-list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.enc-no-conditions {
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-ghost);
  font-style: italic;
}

.enc-add-condition {
  display: flex;
  gap: 6px;
  align-items: center;
}

.enc-hint {
  font-family: var(--font-ui);
  font-size: 10px;
  color: var(--ink-ghost);
  margin-top: 4px;
  line-height: 1.5;
}

.enc-grid-col { display: flex; flex-direction: column; gap: 8px; }
.enc-range { width: 100%; accent-color: var(--gold); }
.enc-grid-fine-input {
  width: 100%;
  background: var(--surface-hi);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--r1);
  padding: 5px 8px;
  font-size: 12px;
}
.enc-token-detail { display: flex; flex-direction: column; gap: 8px; font-size: 13px; color: var(--ink); }

/* ── Add Token modal ── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(4, 3, 8, 0.7);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
}

.modal-box {
  background-color: var(--parch);
  background-image: var(--paper);
  background-blend-mode: multiply;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  padding: 24px;
  width: 420px;
  max-width: 92vw;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
}

.modal-title {
  font-family: var(--font-head);
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink);
  margin-bottom: 20px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--parch-line);
}

.token-picker-box {
  width: 380px;
  padding: 20px;
}

.token-picker-list {
  max-height: 320px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 12px;
}

.token-picker-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  border-radius: 3px;
  cursor: pointer;
  transition: background 0.12s;
}

.token-picker-row:hover {
  background: var(--parch-dark);
}

.token-thumb--sm {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--parch-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}

.token-picker-name {
  flex: 1;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--ink);
}

.token-picker-add-icon {
  color: var(--ink-faded);
  opacity: 0;
  transition: opacity 0.12s;
}

.token-picker-row:hover .token-picker-add-icon {
  opacity: 1;
}

.token-picker-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 10px;
  border-top: 1px solid var(--parch-line);
}

/* Fog / measure / shapes cursor */
.fog-paint-mode { cursor: crosshair; }

/* ── Floating tool dock ── */
.map-tool-dock {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(12, 8, 4, 0.72);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(232, 220, 197, 0.12);
  border-radius: 40px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  pointer-events: all;
  z-index: var(--z-overlay);
}

.map-tool-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 1px solid rgba(232, 220, 197, 0.15);
  background: rgba(232, 220, 197, 0.06);
  color: rgba(232, 220, 197, 0.55);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}
.map-tool-btn:hover {
  background: rgba(232, 220, 197, 0.14);
  color: rgba(232, 220, 197, 0.9);
  border-color: rgba(232, 220, 197, 0.35);
}
.map-tool-btn.active {
  background: rgba(184, 134, 11, 0.25);
  color: var(--gold);
  border-color: var(--gold);
  box-shadow: 0 0 10px rgba(184,134,11,0.3);
}

/* Tool option buttons (fog mode, shape type) */
.tool-option-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  flex: 1;
  padding: 4px 6px;
  border-radius: 2px;
  border: 1px solid var(--parch-line);
  background: rgba(28,20,16,0.04);
  color: var(--ink-ghost);
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s;
}
.tool-option-btn:hover { border-color: var(--ink-faded); color: var(--ink); }
.tool-option-btn.active { border-color: var(--gold); color: var(--gold); background: rgba(184,134,11,0.08); }

/* Shape type row — 3 buttons */
.enc-shape-types { display: flex; gap: 4px; margin-bottom: 2px; }

/* Color picker */
.enc-color-input {
  width: 100%;
  height: 28px;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  padding: 2px;
  background: transparent;
  cursor: pointer;
}

/* Placed shapes list */
.enc-shape-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 0;
  border-bottom: 1px solid var(--parch-line);
}
.enc-shape-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
  opacity: 0.8;
}
.enc-shape-label {
  flex: 1;
  font-family: var(--font-head);
  font-size: 10px;
  color: var(--ink);
  text-transform: capitalize;
}

/* ── Base border for token rows (enables hover + current-turn colour) ── */
.token-chip,
.encounter-token-row {
  border-left: 2px solid transparent;
}

/* ── Initiative tracker bar ── */
.initiative-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 6px 7px;
  border-bottom: 1px solid var(--parch-line);
  margin-bottom: 2px;
}
.init-round-label {
  font-family: 'Cinzel', var(--font-head);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--gold);
}
.init-nav-btn {
  width: 22px;
  height: 22px;
  border-radius: 2px;
  border: 1px solid var(--parch-line);
  background: none;
  color: var(--ink-ghost);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
  flex-shrink: 0;
}
.init-nav-btn:hover { border-color: var(--gold); color: var(--gold); }

/* ── Current-turn highlight ── */
.encounter-token-row.current-turn {
  border-left-color: var(--gold) !important;
  background: rgba(184, 134, 11, 0.07) !important;
}

/* ── Initiative badge ── */
.enc-initiative-badge {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--gold);
  letter-spacing: 0.04em;
}

/* ── Roll-initiative button ── */
.init-roll-btn {
  font-size: 11px;
  line-height: 1;
}
.init-roll-all-btn {
  font-size: 14px;
  margin-left: auto;
}
.init-formula-btn { margin-left: 2px; }
.init-formula-btn.active { border-color: var(--accent); color: var(--accent-l); }

/* ── Initiative formula modal ── */
.init-formula-modal { width: 420px; }
.init-formula-label {
  font-size: 9px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--ink-ghost); font-family: 'Cinzel', var(--font-head);
}
.init-formula-row { display: flex; gap: 4px; align-items: center; }
.init-formula-input {
  flex: 1; min-width: 0; padding: 6px 10px; border-radius: 4px;
  border: 1px solid var(--parch-line); background: var(--parch-dark);
  color: var(--ink); font-size: 13px; font-family: 'DM Mono', monospace;
  outline: none; box-sizing: border-box; width: 100%;
}
.init-formula-input:focus { border-color: var(--accent); }
.init-formula-save {
  padding: 6px 16px; border-radius: 4px; font-size: 12px; font-weight: 700;
  border: 1px solid var(--accent); background: var(--accent-bg); color: var(--accent-l);
  cursor: pointer; white-space: nowrap;
}
.init-formula-save:hover { background: var(--accent); color: #fff; }
.init-formula-clear {
  padding: 6px 12px; border-radius: 4px; font-size: 12px;
  border: 1px solid var(--parch-line); background: none;
  color: var(--ink-ghost); cursor: pointer;
}
.init-formula-clear:hover { border-color: var(--blood); color: var(--blood); }
.init-formula-presets { display: flex; gap: 6px; flex-wrap: wrap; }
.init-preset-chip {
  padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600;
  font-family: 'DM Mono', monospace; letter-spacing: 0.02em;
  border: 1px solid var(--parch-line); background: var(--parch-dark);
  color: var(--ink-ghost); cursor: pointer; transition: all 0.1s; white-space: nowrap;
}
.init-preset-chip:hover { border-color: var(--gold); color: var(--gold); }
.init-formula-error { font-size: 11px; color: var(--blood); font-style: italic; }
.init-formula-active { font-size: 11px; color: var(--ink-ghost); }
.init-formula-active code {
  font-family: 'DM Mono', monospace; color: var(--accent-l);
  background: var(--accent-bg); padding: 1px 5px; border-radius: 3px;
}

/* ── Inline HP quick-damage input ── */
.order-hp-quick-input {
  width: 44px;
  padding: 1px 4px;
  background: rgba(0,0,0,0.05);
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink);
  text-align: center;
  outline: none;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.order-token-row:hover .order-hp-quick-input,
.order-hp-quick-input:focus { opacity: 1; }
.order-hp-quick-input:focus { border-color: var(--gold); background: rgba(0,0,0,0.03); }
.order-hp-quick-input::-webkit-inner-spin-button,
.order-hp-quick-input::-webkit-outer-spin-button { opacity: 0.4; }

/* ── Multi-select bulk bar ── */
.order-token-row--bulk { background: rgba(184,134,11,0.08) !important; }
.order-bulk-bar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: rgba(184,134,11,0.1);
  border-bottom: 1px solid rgba(184,134,11,0.25);
  flex-shrink: 0;
}
.order-bulk-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--gold);
  flex: 1;
}
.order-bulk-btn {
  padding: 2px 7px;
  border-radius: 2px;
  border: 1px solid var(--parch-line);
  background: var(--parch);
  font-family: var(--font-body);
  font-size: 11px;
  color: var(--ink);
  cursor: pointer;
  transition: all 0.12s;
}
.order-bulk-btn:hover { border-color: var(--gold); }
.order-bulk-btn--danger { color: var(--blood); }
.order-bulk-btn--danger:hover { border-color: var(--blood); background: rgba(139,0,0,0.06); }
.order-bulk-btn--clear { color: var(--ink-ghost); }

/* ── Linked record badge ── */
.enc-linked-record {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 5px 8px;
  background: color-mix(in srgb, var(--gold) 8%, transparent);
  border: 1px solid color-mix(in srgb, var(--gold) 30%, transparent);
  border-radius: 4px;
  margin-bottom: 6px;
}
.enc-linked-btn {
  flex: 1;
  background: none;
  border: none;
  font-family: var(--font-head);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: var(--gold);
  cursor: pointer;
  text-align: left;
  padding: 0;
  transition: color 0.15s;
}
.enc-linked-btn:hover { color: var(--ink); }
.enc-linked-unlink {
  background: none;
  border: none;
  font-size: 10px;
  color: var(--ink-ghost);
  cursor: pointer;
  padding: 0 2px;
  line-height: 1;
  transition: color 0.15s;
}
.enc-linked-unlink:hover { color: var(--blood); }

/* ── Link to Stat Block modal ── */
.link-modal {
  width: 420px;
  max-width: 94vw;
  padding: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.link-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px 10px;
  border-bottom: 1px solid var(--parch-line);
}
.link-modal-title {
  font-family: var(--font-head);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ink);
}
.link-modal-close {
  background: none;
  border: none;
  color: var(--ink-ghost);
  cursor: pointer;
  font-size: 12px;
  padding: 0;
  line-height: 1;
  transition: color 0.15s;
}
.link-modal-close:hover { color: var(--blood); }
.link-modal-hint {
  font-family: var(--font-body);
  font-size: 12px;
  color: var(--ink-ghost);
  font-style: italic;
  padding: 8px 16px 4px;
}
.link-modal-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 16px;
  border-bottom: 1px solid var(--parch-line);
}
.link-search-input {
  flex: 1;
  background: none;
  border: none;
  outline: none;
  font-family: var(--font-ui);
  font-size: 13px;
  color: var(--ink);
}
.link-search-input::placeholder { color: var(--ink-ghost); font-style: italic; }
.link-record-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px 0;
}
.link-record-row {
  display: block;
  width: 100%;
  padding: 7px 16px;
  background: none;
  border: none;
  text-align: left;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  transition: background 0.1s;
}
.link-record-row:hover { background: rgba(184,134,11,0.06); }
.link-record-row--selected {
  background: rgba(184,134,11,0.12);
  color: var(--ink);
  font-weight: 600;
  border-left: 2px solid var(--gold);
  padding-left: 14px;
}
.link-record-empty {
  padding: 16px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink-ghost);
  font-style: italic;
  text-align: center;
}
.link-modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px 16px 14px;
  border-top: 1px solid var(--parch-line);
}
/* ── Record slide-in panel ── */
.record-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 360px;
  z-index: var(--z-modal);
  background-color: var(--parch);
  background-image: var(--paper);
  background-blend-mode: multiply;
  box-shadow: -4px 0 32px rgba(28, 20, 16, 0.35);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.record-panel-close {
  position: absolute;
  top: 12px;
  right: 14px;
  background: none;
  border: none;
  font-size: 14px;
  color: var(--ink-ghost);
  cursor: pointer;
  z-index: 1;
  line-height: 1;
  padding: 4px;
  transition: color 0.15s;
}
.record-panel-close:hover { color: var(--blood); }
.record-panel-inner {
  flex: 1;
  overflow-y: auto;
  padding: 16px 18px 24px;
}
.record-panel-title {
  font-family: 'Cinzel', var(--font-deco);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--parch-line);
}
.record-panel-raw {
  font-family: var(--font-mono);
  font-size: 11px;
  color: var(--ink-faded);
  white-space: pre-wrap;
  word-break: break-all;
}
.record-panel-slide-enter-active,
.record-panel-slide-leave-active { transition: transform 0.25s ease; }
.record-panel-slide-enter-from,
.record-panel-slide-leave-to { transform: translateX(100%); }

/* ── Right sidebar tabs ── */
.rsb-tabs {
  display: flex;
  border-bottom: 1px solid var(--parch-line);
  flex-shrink: 0;
}
.rsb-tab {
  flex: 1;
  padding: 7px 0;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  font-family: 'Cinzel', serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  transition: color 0.15s, border-color 0.15s;
  margin-bottom: -1px;
}
.rsb-tab:hover { color: var(--ink); }
.rsb-tab--active { color: var(--blood); border-bottom-color: var(--blood); }

/* ── Log tab layout ── */
.log-note-bar {
  display: flex;
  gap: 4px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--parch-line);
  flex-shrink: 0;
}
.log-note-select {
  flex: 0 0 90px;
  font-size: 11px;
  padding: 3px 4px;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  background: var(--parch);
  color: var(--ink);
  font-family: var(--font-ui);
}
.log-note-input {
  flex: 1;
  font-size: 11px;
  padding: 3px 6px;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  background: var(--parch);
  color: var(--ink);
  font-family: var(--font-ui);
}
.log-note-input::placeholder { color: var(--ink-ghost); }
.log-note-add {
  flex: 0 0 26px;
  height: 26px;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  background: var(--parch);
  color: var(--ink-ghost);
  font-size: 16px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.log-note-add:not(:disabled):hover { color: var(--ink); border-color: var(--gold); }
.log-note-add:disabled { opacity: 0.35; cursor: not-allowed; }

.log-entries {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}
.log-empty {
  padding: 24px 12px;
  text-align: center;
  font-size: 11px;
  color: var(--ink-ghost);
  font-style: italic;
}
.log-row {
  display: flex;
  align-items: baseline;
  gap: 5px;
  padding: 3px 10px;
  font-size: 11px;
  line-height: 1.4;
  border-bottom: 1px solid rgba(28,20,16,0.04);
}
.log-row:last-child { border-bottom: none; }
.log-round-badge {
  flex: 0 0 auto;
  background: var(--parch-dark, rgba(28,20,16,0.08));
  color: var(--ink-ghost);
  font-family: 'Cinzel', serif;
  font-size: 8px;
  font-weight: 600;
  padding: 1px 4px;
  border-radius: 2px;
  letter-spacing: 0.04em;
}
.log-token-name {
  flex: 0 0 auto;
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--ink-faded);
  font-style: italic;
  font-size: 10px;
}
.log-event { flex: 1; }
.log-event--damage        { color: var(--blood); }
.log-event--healing       { color: var(--grass); }
.log-event--condition-added  { color: var(--arcane-l, #9f7abf); }
.log-event--condition-removed { color: var(--ink-ghost); }
.log-event--death         { color: var(--blood); font-weight: 700; }
.log-event--revival       { color: var(--grass); }
.log-event--note          { color: var(--ink-faded); font-style: italic; }

.log-footer {
  padding: 8px 10px;
  border-top: 1px solid var(--parch-line);
  display: flex;
  justify-content: center;
  flex-shrink: 0;
}
.log-clear-btn {
  background: none;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  padding: 3px 12px;
  font-family: 'Cinzel', serif;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  cursor: pointer;
}
.log-clear-btn:hover { border-color: var(--blood); color: var(--blood); }

/* ── Map thumbnail (prepare sidebar) ── */
.map-thumb-wrap {
  width: 100%;
  aspect-ratio: 16/9;
  border-radius: 2px;
  overflow: hidden;
  border: 1px solid var(--parch-line);
  margin-bottom: 8px;
}
.map-thumb-img { width: 100%; height: 100%; object-fit: cover; display: block; }
.map-drop-hint {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 0 12px;
  color: var(--ink-ghost);
}

/* ── ORDER tab token list ── */
.order-token-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 4px 0;
}

.order-token-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  padding: 5px 10px 6px;
  border-left: 3px solid transparent;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}
.order-token-row:hover { background: rgba(28,20,16,0.05); }
.order-token-row--active {
  border-left-color: var(--gold) !important;
  background: rgba(184,134,11,0.08) !important;
}
.order-token-row--selected {
  border-left-color: var(--blood) !important;
  background: rgba(139,26,26,0.06) !important;
}
.order-token-row--dead { opacity: 0.4; }

/* Row 1: thumb + name + initiative + gear */
.order-row-1 {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
}

/* Row 2: HP bar + HP text + visibility toggle */
.order-row-2 {
  display: flex;
  align-items: center;
  gap: 6px;
  padding-left: 33px; /* 26px thumb + 7px gap */
  width: 100%;
  margin-top: 4px;
}

.order-token-name {
  flex: 1;
  min-width: 0;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* HP bar */
.order-hp-track {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: rgba(28,20,16,0.1);
  overflow: hidden;
  min-width: 0;
}
.order-hp-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.3s ease, background 0.3s ease;
}
.order-hp-text {
  font-family: var(--font-mono);
  font-size: 9px;
  color: var(--ink-ghost);
  white-space: nowrap;
  flex-shrink: 0;
}

.order-init {
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--ink-ghost);
  flex-shrink: 0;
  min-width: 18px;
  text-align: right;
}
.order-init--set { color: var(--gold); font-weight: 600; }

.order-token-actions {
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.order-token-row:hover .order-token-actions { opacity: 1; }
.order-token-actions .icon-btn-sq {
  width: 24px;
  height: 24px;
  background: none;
  border: none;
  color: var(--ink-ghost);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  transition: color 0.15s, background 0.15s;
}
.order-token-actions .icon-btn-sq:hover { color: var(--ink); background: rgba(28,20,16,0.07); }
.order-token-actions .icon-btn-sq--danger:hover { color: var(--blood); }

/* Visibility toggle — always shown in row 2 */
.order-vis-btn {
  margin-left: auto;
  width: 20px;
  height: 20px;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--ink-ghost);
  flex-shrink: 0;
  transition: color 0.15s;
}
.order-vis-btn--hidden { color: var(--blood); }
.order-turn-btn { margin-left: auto; color: var(--ink-ghost); opacity: 0.6; }
.order-turn-btn + .order-vis-btn { margin-left: 0; }
.order-turn-btn--on { color: var(--gold); opacity: 1; }
/* Hidden and not acting — listed for the GM but skipped by Next Turn */
.order-token-row--skipped .order-row-1,
.order-token-row--skipped .order-row-3 { opacity: 0.5; }
.order-token-row--skipped .order-token-name { font-style: italic; }

/* Row 3: timer chips */
.order-row-3 {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding-left: 33px;
  margin-top: 4px;
}
.order-timer {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 1px 4px 1px 5px;
  border: 1px solid rgba(160, 110, 40, 0.45);
  border-radius: 9px;
  background: rgba(160, 110, 40, 0.08);
  font-family: var(--font-mono);
  font-size: 9.5px;
  color: var(--ink-faded, var(--ink-ghost));
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.order-timer:hover { background: rgba(160, 110, 40, 0.16); }
.order-timer b { color: var(--ink); }
.order-timer-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 110px;
}
.order-timer--up {
  border-color: var(--gold);
  background: rgba(184, 134, 11, 0.22);
  color: var(--ink);
  box-shadow: 0 0 6px rgba(184, 134, 11, 0.35);
}
.order-timer--up b { color: var(--gold); }
.order-timer-vis { opacity: 0.6; }
.order-timer-x {
  background: none;
  border: none;
  padding: 0 1px;
  font-size: 9px;
  line-height: 1;
  color: var(--ink-ghost);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}
.order-timer:hover .order-timer-x { opacity: 1; }
.order-timer-x:hover { color: var(--blood); }

/* ── Player view layout popover ── */
.pv-prefs-wrap { position: relative; }
.pv-prefs-btn { padding-left: 8px; padding-right: 8px; }
.pv-prefs-pop {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  width: 210px;
  padding: 10px 12px;
  background: var(--parch, #f2e8d4);
  border: 1px solid var(--parch-line);
  border-radius: 4px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  z-index: var(--z-modal-top);
}
.pv-prefs-label {
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ink-ghost);
  margin: 2px 0 5px;
}
.pv-prefs-seg {
  display: flex;
  margin-bottom: 10px;
  border: 1px solid var(--parch-line);
  border-radius: 3px;
  overflow: hidden;
}
.pv-prefs-seg button {
  flex: 1;
  padding: 4px 0;
  background: none;
  border: none;
  border-right: 1px solid var(--parch-line);
  font-size: 12px;
  color: var(--ink);
  cursor: pointer;
}
.pv-prefs-seg button:last-child { border-right: none; }
.pv-prefs-seg button.active {
  background: rgba(184, 134, 11, 0.22);
  color: var(--ink);
  font-weight: 700;
}
.pv-prefs-hint {
  margin: 0;
  font-size: 11px;
  color: var(--ink-ghost);
}
.order-vis-btn:hover { color: var(--ink); }
.order-vis-btn--hidden:hover { opacity: 0.7; }

/* ── Shape context menu (right-click on a placed shape) ── */
.ctx-back {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
}

.sh-ctx-menu {
  position: fixed;
  z-index: var(--z-modal-top);
  min-width: 160px;
  background-color: var(--parch);
  background-image: var(--paper);
  background-blend-mode: multiply;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  overflow: hidden;
  padding: 4px 0;
}

.sh-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 14px;
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: 14px;
  cursor: pointer;
  text-align: left;
  white-space: nowrap;
  transition: background 0.1s;
}
.sh-ctx-item:hover { background: rgba(28,20,16,0.06); color: var(--ink); }
.sh-ctx-item--danger { color: var(--blood); }
.sh-ctx-item--danger:hover { background: rgba(139,0,0,0.07); }

/* ── FOV enable toggle (prepare sidebar) ── */
.fov-enable-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--ink);
  cursor: pointer;
  margin-bottom: 4px;
}
.fov-enable-check { accent-color: var(--gold); cursor: pointer; }

/* ── Music sidebar ── */
.enc-playlist-select {
  width: 100%;
  background: var(--surface-hi);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--r1);
  padding: 5px 8px;
  font-family: var(--font-body);
  font-size: 13px;
  cursor: pointer;
}
.enc-playlist-select:focus { outline: none; border-color: var(--accent-l); }

/* ── Shape tool submenu ── */
.wall-submenu {
  position: absolute;
  bottom: 76px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(12, 8, 4, 0.72);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(232, 220, 197, 0.12);
  border-radius: 40px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  pointer-events: all;
  z-index: var(--z-overlay);
  animation: submenu-pop 0.12s ease;
}

.wall-type-btn {
  display: flex;
  align-items: center;
  gap: 5px;
  font-family: var(--font-head);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: rgba(232, 220, 197, 0.7);
  border-top: 2px solid var(--wt-color, rgba(255,255,255,0.3)) !important;
}
.wall-type-btn.active {
  color: rgba(232, 220, 197, 1);
  background: rgba(255,255,255,0.1);
}

.wall-type-swatch {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--wt-color, rgba(255,255,255,0.5));
  flex-shrink: 0;
}

.fog-submenu {
  position: absolute;
  bottom: 76px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(12, 8, 4, 0.72);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(232, 220, 197, 0.12);
  border-radius: 40px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  pointer-events: all;
  z-index: var(--z-overlay);
  animation: submenu-pop 0.12s ease;
}

.fog-sep {
  width: 1px;
  height: 22px;
  background: rgba(232, 220, 197, 0.15);
  flex-shrink: 0;
  margin: 0 2px;
}

.fog-brush-label {
  font-family: var(--font-head);
  font-size: 13px;
  font-weight: 700;
  color: rgba(232, 220, 197, 0.85);
  min-width: 18px;
  text-align: center;
}

.fog-size-btn,
.fog-text-btn {
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
}

.shape-submenu {
  position: absolute;
  bottom: 76px; /* sits above .map-tool-dock (bottom:20 + 48px height + 8px gap) */
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 8px;
  padding: 6px 10px;
  background: rgba(12, 8, 4, 0.72);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(232, 220, 197, 0.12);
  border-radius: 40px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  pointer-events: all;
  z-index: var(--z-overlay);
  animation: submenu-pop 0.12s ease;
}

@keyframes submenu-pop {
  from { opacity: 0; transform: translateX(-50%) translateY(6px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* CSS-drawn shape icons inside the submenu buttons */
.shape-icon {
  display: block;
  flex-shrink: 0;
}
.shape-icon--circle {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2.5px solid currentColor;
}
.shape-icon--square {
  width: 14px;
  height: 14px;
  border: 2.5px solid currentColor;
}
.shape-icon--cone {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-bottom: 15px solid currentColor;
}

/* Color picker swatch button */
.shape-color-swatch {
  position: relative;
  width: 38px;
  height: 38px;
  border-radius: 50%;
  border: 2px solid rgba(232, 220, 197, 0.35);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.15s;
  flex-shrink: 0;
}
.shape-color-swatch:hover { border-color: rgba(232, 220, 197, 0.7); }
.shape-color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  border: none;
  padding: 0;
}

/* ── FOV mode toggle (toolbar) ── */
.enc-fov-mode-toggle {
  display: flex;
  border: 1px solid var(--parch-line);
  border-radius: 2px;
  overflow: hidden;
  background: var(--parch-dark);
  flex-shrink: 0;
}

.fov-mode-btn {
  padding: 4px 10px;
  background: none;
  border: none;
  border-radius: 0;
  border-right: 1px solid var(--parch-line);
  color: var(--ink-ghost);
  cursor: pointer;
  font-family: var(--font-head);
  font-size: 9px;
  font-weight: 600;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  transition: color 0.15s, background 0.15s;
  white-space: nowrap;
  display: flex;
  align-items: center;
}
.fov-mode-btn:last-child { border-right: none; }
.fov-mode-btn:hover:not(:disabled) { background: rgba(184,134,11,0.1); color: var(--ink); }
.fov-mode-btn.active {
  background: rgba(184,134,11,0.15);
  color: var(--gold);
}
.fov-mode-btn:disabled { cursor: default; }
.enc-fov-mode-toggle--off { opacity: 0.4; }
.enc-fov-mode-toggle--off:hover { opacity: 0.6; }

/* ── Wall type sub-toolbar (sidebar / non-floating use) ── */
.wall-type-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  background: var(--parch-dark);
  border-top: 1px solid var(--parch-line);
  flex-shrink: 0;
}
</style>

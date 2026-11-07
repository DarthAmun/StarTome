<template>
  <div class="ss screen-in">
    <header class="ss-head">
      <div>
        <h1 class="page-title">Starship</h1>
        <div class="ss-sub">
          <template v-if="ship">{{ frame?.name ?? 'No frame' }} · level {{ level }}<template v-if="ship.level_pinned == null"> (party level)</template></template>
          <template v-else>Your crew's ship: frame, battle stations, upgrades, expansion bays and who is at which station.</template>
        </div>
      </div>
      <div class="ss-head-actions">
        <select v-if="ships.length > 1" class="ss-input" :value="ship?.id" @change="pick(Number(val($event)))">
          <option v-for="s in ships" :key="s.id" :value="s.id">{{ s.name }}{{ s.active ? ' (active)' : '' }}</option>
        </select>
        <button v-if="ship && !ship.active" class="ghost-btn" title="The party flies this ship now; starship encounters use it" @click="setActive(ship.id!)">Make active</button>
        <button class="ghost-btn" @click="creating = !creating">+ New starship</button>
      </div>
    </header>

    <div v-if="!catalog.frames.length" class="ss-note">
      No starship frames in the compendium yet. Foundry has no starship data: build the Tech Core pack with
      <code>scripts/techcore/build.sh "&lt;your Tech Core PDF&gt;"</code> and import <code>local/tech-core-startome.json</code>
      under <NuxtLink to="/compendium/homebrew">Import &amp; Export → Homebrew</NuxtLink>, or make frames and stations by hand.
    </div>

    <section v-if="creating || (!ships.length && catalog.frames.length)" class="party-section ss-create">
      <div class="party-section-title">New starship</div>
      <div class="ss-row">
        <input v-model="newName" class="ss-input ss-wide" placeholder="Name your starship" />
        <select v-model="newFrame" class="ss-input">
          <option value="">Frame…</option>
          <option v-for="f in catalog.frames" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
        <button class="seal-btn" :disabled="!newFrame" @click="doCreate">Create</button>
      </div>
    </section>

    <template v-if="ship">
      <!-- ── Sheet ── -->
      <section class="party-section">
        <div class="ss-sheet-head">
          <input class="ss-name" :value="ship.name" @change="update(ship.id!, { name: val($event) })" />
          <select class="ss-input" :value="ship.frame_id ?? ''" title="Changing the frame rebuilds its default stations" @change="setFrame(ship.id!, val($event))">
            <option v-for="f in catalog.frames" :key="f.id" :value="f.id">{{ f.name }}</option>
          </select>
          <label class="ss-field" title="Follows the party level unless you pin it">
            <span>Level</span>
            <input class="ss-input ss-num" type="number" min="1" max="20" :value="ship.level_pinned ?? ''" :placeholder="String(partyLevelValue)"
              @change="update(ship.id!, { level_pinned: val($event) === '' ? null : Number(val($event)) })" />
          </label>
        </div>
        <div class="ss-stats">
          <div class="ss-stat"><span>HP</span>
            <input class="ss-input ss-num" type="number" min="0" :max="sheet.hp" :value="ship.hp_current ?? sheet.hp" @change="update(ship.id!, { hp_current: clamp(val($event), sheet.hp) })" /> / {{ sheet.hp }}
          </div>
          <div class="ss-stat"><span>SP</span>
            <input class="ss-input ss-num" type="number" min="0" :max="sheet.sp" :value="ship.sp_current ?? sheet.sp" @change="update(ship.id!, { sp_current: clamp(val($event), sheet.sp) })" /> / {{ sheet.sp }}
          </div>
          <div class="ss-stat" title="Without helmed bonuses; the pilot's Piloting DC replaces it if higher"><span>AC</span> <b>{{ sheet.ac }}</b></div>
          <div class="ss-stat"><span>Fort</span> <b>{{ signed(sheet.saves.fort) }}</b></div>
          <div class="ss-stat"><span>Ref</span> <b>{{ signed(sheet.saves.ref) }}</b></div>
          <div class="ss-stat"><span>Will</span> <b>{{ signed(sheet.saves.will) }}</b></div>
          <div class="ss-stat"><span>Speed</span> <b>{{ sheet.speed }} zones</b></div>
          <div class="ss-stat"><span>Sensors</span> <b>{{ sheet.sensorRange }} zones</b></div>
        </div>
        <div class="ss-row ss-conditions">
          <span class="ss-dim">Conditions</span>
          <span v-for="(c, i) in ship.conditions" :key="c.name" class="ss-chip">
            {{ c.name }}<template v-if="c.value != null"> {{ c.value }}</template>
            <button v-if="c.value != null" title="Lower" @click="setCondition(i, (c.value ?? 1) - 1)">−</button>
            <button v-if="c.value != null" title="Raise" @click="setCondition(i, (c.value ?? 0) + 1)">+</button>
            <button title="Remove" @click="setCondition(i, null, true)">×</button>
          </span>
          <select class="ss-input" value="" @change="addCondition(val($event)); ($event.target as HTMLSelectElement).value = ''">
            <option value="">+ condition</option>
            <option v-for="c in shipConditions" :key="c.name" :value="c.name" :title="c.desc">{{ c.name }}</option>
          </select>
        </div>
        <div v-for="w in sheet.warnings" :key="w" class="ss-warn">{{ w }}</div>
        <details v-if="levelChanges.length" class="ss-actions ss-new">
          <summary>New at level {{ level }}</summary>
          <div v-for="c in levelChanges" :key="c" class="ss-action">{{ c }}</div>
        </details>
      </section>

      <!-- ── Battle stations & crew ── -->
      <section class="party-section">
        <div class="party-section-title">Battle stations &amp; crew</div>
        <p class="ss-dim">Drag a crew member onto a station, or pick one on the card. One per station; the exploration activity decides where they start a starship encounter.</p>

        <div class="ss-crew-bar" :class="{ 'ss-drop': dragging }" @dragover.prevent @drop.prevent="dropOn(null)">
          <span class="ss-dim">Free crew</span>
          <span v-for="c in freeCrew" :key="c.id" class="ss-crew-chip" draggable="true" @dragstart="dragStart(c.id)" @dragend="dragging = null">
            {{ c.name }}
          </span>
          <span v-if="!freeCrew.length" class="ss-dim">— everyone is at a station</span>
        </div>

        <div class="ss-grid">
          <div v-for="r in sheet.stations" :key="r.slot.slot" class="ss-card" :class="{ 'ss-drop': dragging }"
            @dragover.prevent @drop.prevent="dropOn(r.slot.slot)">
            <div class="ss-card-head">
              <span class="ss-slot">{{ r.slot.slot }}</span>
              <template v-if="r.slot.isDefault"><b>{{ r.station?.name ?? 'Missing station' }}</b><span class="ss-dim">default</span></template>
              <select v-else class="ss-input" :value="r.slot.stationId ?? ''" @change="setStation(ship.id!, r.slot.slot, val($event) || null)">
                <option value="">Empty slot</option>
                <option v-for="s in catalog.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
              </select>
              <span v-if="r.grade" class="ss-grade">{{ r.grade.grade }}</span>
            </div>

            <template v-if="r.station">
              <div class="ss-dim">{{ helmedText(r) }}</div>

              <!-- Crew -->
              <div class="ss-at">
                <template v-if="crewAt(r.slot.slot)">
                  <span class="ss-crew-chip" draggable="true" @dragstart="dragStart(crewAt(r.slot.slot)!.characterId)" @dragend="dragging = null">
                    {{ nameOf(crewAt(r.slot.slot)!.characterId) }}
                  </span>
                  <span class="ss-skill" :title="`Suggested initiative skill at this station (the book leaves it to the station)`">
                    {{ skillFor(r) }}<template v-if="skillValue(crewAt(r.slot.slot)!.characterId, r) != null"> {{ signed(skillValue(crewAt(r.slot.slot)!.characterId, r)) }}</template>
                  </span>
                  <select class="ss-input" :value="crewAt(r.slot.slot)!.activity ?? ''" title="Exploration activity" @change="setActivity(ship.id!, crewAt(r.slot.slot)!.characterId, val($event) || null)">
                    <option value="">No activity</option>
                    <option v-for="a in activitiesFor(r.station.name)" :key="a.key" :value="a.key" :title="a.summary">{{ a.name }}</option>
                  </select>
                </template>
                <select v-else class="ss-input" value="" @change="assign(ship.id!, Number(val($event)), r.slot.slot)">
                  <option value="">Nobody helming</option>
                  <option v-for="c in members" :key="c.id" :value="c.id">{{ c.name }}</option>
                </select>
              </div>

              <!-- Upgrades -->
              <div class="ss-upgrades">
                <span class="ss-dim">Upgrades {{ r.upgradesUsed }}/{{ r.upgradeLimit }}</span>
                <span v-for="u in builtIn(r)" :key="u.id" class="ss-chip ss-chip--builtin" title="Built into the frame's default station; doesn't count">{{ u.name }}</span>
                <span v-for="id in r.slot.upgradeIds" :key="id" class="ss-chip">
                  {{ upgradeName(id) }} <button title="Remove" @click="removeUpgrade(ship.id!, r.slot.slot, id)">×</button>
                </span>
                <select class="ss-input" value="" @change="addUpgrade(ship.id!, r.slot.slot, val($event)); ($event.target as HTMLSelectElement).value = ''">
                  <option value="">+ upgrade</option>
                  <option v-for="u in upgradesFor(r)" :key="u.id" :value="u.id">{{ u.name }} ({{ u.level }}){{ u.weapon ? ' · weapon' : '' }}</option>
                </select>
              </div>
              <div v-for="w in r.warnings" :key="w" class="ss-warn">{{ w }}</div>

              <details class="ss-actions">
                <summary>{{ r.actions.length }} station actions</summary>
                <div v-for="a in r.actions" :key="a.name" class="ss-action">
                  <b>{{ a.name }}</b> <span class="ss-glyph">{{ formatActionCost(a.cost) }}</span>
                  <span class="ss-dim">{{ a.grade ?? '' }}</span>
                </div>
              </details>
            </template>
          </div>
        </div>

        <!-- Presets -->
        <div class="ss-row ss-presets">
          <span class="ss-dim">Presets</span>
          <span v-for="p in ship.presets" :key="p.name" class="ss-chip">
            <button class="ss-chip-main" :title="`Put everyone where '${p.name}' says`" @click="applyPreset(ship.id!, p.name, memberIds)">{{ p.name }}</button>
            <button title="Delete preset" @click="deletePreset(ship.id!, p.name)">×</button>
          </span>
          <input v-model="presetName" class="ss-input" placeholder="Dogfight, Stealth run…" @keydown.enter="savePresetNow" />
          <button class="ghost-btn ss-small" :disabled="!presetName.trim()" @click="savePresetNow">Save current</button>
        </div>
      </section>

      <!-- ── Crew skills ── -->
      <section class="party-section">
        <div class="party-section-title">Crew skills</div>
        <p class="ss-dim">Optional: SF2e skill modifiers for the station cards. Play Buddy will fill these once it supports Starfinder.</p>
        <div class="ss-skills">
          <div class="ss-skill-row ss-skill-head"><span /><span v-for="k in SKILL_KEYS" :key="k">{{ k }}</span></div>
          <div v-for="c in members" :key="c.id" class="ss-skill-row">
            <span>{{ c.name }}</span>
            <input v-for="k in SKILL_KEYS" :key="k" class="ss-input ss-num" type="number" :value="c.sfSkills[k.toLowerCase()] ?? ''" placeholder="—"
              @change="setSkill(c, k.toLowerCase(), val($event))" />
          </div>
        </div>
      </section>

      <!-- ── Expansion bays ── -->
      <section class="party-section">
        <div class="party-section-title">Expansion bays <span class="ss-dim">{{ sheet.baysUsed }}/{{ sheet.baysLimit }} slots</span></div>
        <div class="ss-bays">
          <div v-for="(b, i) in ship.bays" :key="i" class="ss-bay">
            <b>{{ bayOf(b.bayId)?.name ?? 'Missing bay' }}</b>
            <span v-if="bayOf(b.bayId) && !bayOf(b.bayId)!.takesSlot" class="ss-dim">no slot</span>
            <select v-if="bayOf(b.bayId)?.options?.length" class="ss-input" :value="b.option ?? ''" @change="setBayOption(ship.id!, i, val($event) || null)">
              <option v-for="o in bayOf(b.bayId)!.options" :key="o.name" :value="o.name" :title="o.text">{{ o.name }}</option>
            </select>
            <button class="party-icon-btn party-icon-btn--danger" title="Remove" @click="removeBay(ship.id!, i)"><OhVueIcon name="md-close" scale="0.7" /></button>
          </div>
          <select class="ss-input" value="" @change="addBay(ship.id!, val($event)); ($event.target as HTMLSelectElement).value = ''">
            <option value="">+ expansion bay</option>
            <option v-for="b in catalog.bays" :key="b.id" :value="b.id">{{ b.name }}</option>
          </select>
        </div>
      </section>

      <section class="party-section">
        <div class="party-section-title">Notes</div>
        <textarea class="ss-input ss-notes" rows="3" :value="ship.notes" placeholder="Registry, history, cargo…" @change="update(ship.id!, { notes: val($event) })" />
        <div class="ss-row">
          <span class="ss-spacer" />
          <button class="ghost-btn party-icon-btn--danger" @click="removeShip">Delete starship</button>
        </div>
      </section>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { dbApi } from '~/composables/useDb'
import { useParty, type Character } from '~/composables/useParty'
import { useStarship } from '~/composables/useStarship'
import { builtinConditions } from '~/composables/useConditions'
import { activitiesFor, starshipLevel, starshipLevelChanges, starshipSheet, STATION_INITIATIVE_SKILL, stationKey, type StationRow } from '~/rules/playerStarship'
import { formatActionCost, signed } from '~/rules/format'
import { isPartyMember } from '~/rules/party'
import { campaignGame } from '~/types/game'

const route = useRoute()
const campaignId = Number(route.params.id)
const party = useParty()
const st = useStarship()
const { ships, catalog, load, lookupFor, create, update, setFrame, setStation, addUpgrade, removeUpgrade, addBay, removeBay, setBayOption, assign, setActivity, savePreset, applyPreset, deletePreset, setActive, remove } = st

const picked = ref<number | null>(null)
const ship = computed(() => ships.value.find(s => s.id === picked.value) ?? st.active.value)
const pick = (id: number) => { picked.value = id }

onMounted(async () => {
  const campaign = await dbApi.campaigns.get(campaignId)
  if (campaignGame(campaign) !== 'sf2e') await navigateTo(`/campaign/${campaignId}/party`)
  await Promise.all([party.load(campaignId), load(campaignId)])
})

const val = (ev: Event) => (ev.target as HTMLInputElement).value
const clamp = (v: string, max: number) => (v === '' ? null : Math.max(0, Math.min(max, Number(v))))

const partyLevelValue = computed(() => party.party.value.level ?? 1)
const level = computed(() => starshipLevel(ship.value?.level_pinned, party.party.value.level))
const lookup = computed(() => lookupFor(ship.value))
const frame = computed(() => lookup.value.frame)
const sheet = computed(() => starshipSheet({ stations: ship.value?.stations ?? [], bays: ship.value?.bays ?? [] }, lookup.value, level.value))
const levelChanges = computed(() => level.value <= 1 ? [] : starshipLevelChanges(
  starshipSheet({ stations: ship.value?.stations ?? [], bays: ship.value?.bays ?? [] }, lookup.value, level.value - 1), sheet.value))

// ── New ship ──
const creating = ref(false)
const newName = ref('')
const newFrame = ref('')
async function doCreate() {
  const id = await create(campaignId, newName.value, newFrame.value || null)
  picked.value = id
  creating.value = false
  newName.value = ''
}

// ── Conditions ──
const shipConditions = builtinConditions('sf2e').filter(c => c.group === 'starship' && c.name !== 'Malfunctioning')
function addCondition(name: string) {
  if (!ship.value || !name || ship.value.conditions.some(c => c.name === name)) return
  const valued = shipConditions.find(c => c.name === name)?.valued
  update(ship.value.id!, { conditions: [...ship.value.conditions, { name, value: valued ? 1 : null }] })
}
function setCondition(i: number, value: number | null, removeIt = false) {
  if (!ship.value) return
  const list = [...ship.value.conditions]
  if (removeIt || (value != null && value <= 0)) list.splice(i, 1)
  else list[i] = { ...list[i], value }
  update(ship.value.id!, { conditions: list })
}

// ── Crew ──
const members = computed(() => party.characters.value.filter(c => isPartyMember(c) || c.role === 'companion'))
const memberIds = computed(() => new Set(members.value.map(c => c.id)))
const nameOf = (id: number) => party.characters.value.find(c => c.id === id)?.name ?? 'Gone'
const crewAt = (slot: number) => ship.value?.crew.find(c => c.slot === slot) ?? null
const freeCrew = computed(() => members.value.filter(c => !ship.value?.crew.some(x => x.characterId === c.id && x.slot != null)))
const dragging = ref<number | null>(null)
function dragStart(characterId: number) { dragging.value = characterId }
function dropOn(slot: number | null) {
  if (dragging.value == null || !ship.value) return
  assign(ship.value.id!, dragging.value, slot)
  dragging.value = null
}
function skillFor(r: StationRow) {
  return STATION_INITIATIVE_SKILL[stationKey(r.station?.name ?? '')] ?? 'Perception'
}
function skillValue(characterId: number, r: StationRow): number | null {
  const c = party.characters.value.find(x => x.id === characterId)
  const key = skillFor(r).toLowerCase()
  const v = c?.sfSkills[key]
  return typeof v === 'number' ? v : null
}
const SKILL_KEYS = ['Perception', 'Piloting', 'Computers', 'Crafting', 'Arcana', 'Nature', 'Occultism', 'Religion']
function setSkill(c: Character, key: string, raw: string) {
  const next = { ...c.sfSkills }
  if (raw === '') delete next[key]
  else next[key] = Number(raw)
  party.updateCharacter(c.id, { sfSkills: next })
}

// ── Stations ──
function helmedText(r: StationRow) {
  const h = r.grade?.helmed ?? {}
  const parts = [h.ac ? `AC +${h.ac}` : '', h.fort ? `Fort +${h.fort}` : '', h.ref ? `Ref +${h.ref}` : '', h.will ? `Will +${h.will}` : ''].filter(Boolean)
  const extra = [r.grade?.sensors ? `sensors +${r.grade.sensors}` : '', r.grade?.damageDice ? `${r.grade.damageDice} damage dice` : '', r.grade?.tracking ? `tracking +${r.grade.tracking}` : '', r.grade?.drones ? `${r.grade.drones} drones` : ''].filter(Boolean)
  return [parts.length ? `Helmed: ${parts.join(', ')}` : 'No helmed bonus at this grade', ...extra].join(' · ')
}
const upgradeName = (id: string) => lookup.value.upgrades.get(id)?.name ?? 'Missing upgrade'
const builtIn = (r: StationRow) => (r.slot.builtInUpgradeIds ?? []).map(id => lookup.value.upgrades.get(id)).filter((u): u is NonNullable<typeof u> => !!u)
function upgradesFor(r: StationRow) {
  const key = stationKey(r.station?.name ?? '')
  return catalog.value.upgrades.filter(u => (u.station === 'any' || stationKey(u.station) === key) && !r.slot.upgradeIds.includes(u.id))
}
const bayOf = (id: string) => lookup.value.bays.get(id) ?? null

// ── Presets & delete ──
const presetName = ref('')
function savePresetNow() {
  if (!ship.value || !presetName.value.trim()) return
  savePreset(ship.value.id!, presetName.value)
  presetName.value = ''
}
async function removeShip() {
  if (!ship.value || !confirm(`Delete ${ship.value.name}? Its stations, crew assignments and presets go with it.`)) return
  await remove(ship.value.id!)
  picked.value = null
}
</script>

<style scoped>
.ss { padding: 24px 28px 60px; max-width: 1200px; display: flex; flex-direction: column; gap: 14px; }
.ss-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; }
.ss-head-actions { display: flex; gap: 8px; align-items: center; }
.ss-sub, .ss-dim { font-size: 12px; color: var(--text3); }
.ss-note { border: 1px dashed var(--border); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--text2); }
.ss-note code { font-size: 12px; }
.ss-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.ss-input { background: var(--surface); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 3px 6px; font-size: 13px; }
.ss-num { width: 64px; }
.ss-wide { width: 260px; }
.ss-small { padding: 3px 10px; font-size: 12px; }
.ss-spacer { flex: 1; }
.ss-sheet-head { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 8px; }
.ss-name { font-family: var(--fh); font-size: 18px; font-weight: 700; background: transparent; border: none; color: var(--text); min-width: 200px; }
.ss-field { display: flex; align-items: center; gap: 6px; font-size: 12px; color: var(--text2); }
.ss-stats { display: flex; gap: 18px; flex-wrap: wrap; font-size: 13.5px; }
.ss-stat span { color: var(--text3); font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; margin-right: 4px; }
.ss-conditions { margin-top: 8px; }
.ss-chip { display: inline-flex; align-items: center; gap: 3px; border: 1px solid var(--border); border-radius: 999px; padding: 1px 8px; font-size: 12px; }
.ss-chip button { background: none; border: none; color: var(--text3); cursor: pointer; padding: 0 2px; }
.ss-chip .ss-chip-main { color: var(--text); }
.ss-chip--builtin { opacity: 0.75; font-style: italic; }
.ss-warn { color: #e0a040; font-size: 12px; }
.ss-crew-bar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 8px; border: 1px dashed var(--border); border-radius: 8px; margin: 8px 0 12px; min-height: 38px; }
.ss-crew-chip { background: var(--surface2, #2a2f3a); border: 1px solid #4ab8e866; color: var(--text); border-radius: 999px; padding: 2px 10px; font-size: 12.5px; cursor: grab; }
.ss-drop { outline: 1px dashed #4ab8e8aa; outline-offset: 2px; }
.ss-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.ss-card { border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; }
.ss-card-head { display: flex; align-items: center; gap: 8px; }
.ss-slot { width: 22px; height: 22px; border-radius: 50%; background: #4ab8e833; color: #4ab8e8; display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
.ss-grade { margin-left: auto; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6bc0c8; }
.ss-at { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ss-skill { font-size: 12px; color: var(--text2); }
.ss-upgrades { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.ss-actions summary { cursor: pointer; font-size: 12px; color: var(--text2); }
.ss-action { font-size: 12.5px; }
.ss-glyph { font-family: var(--fg, inherit); }
.ss-presets { margin-top: 10px; }
.ss-skills { display: grid; gap: 4px; }
.ss-skill-row { display: grid; grid-template-columns: 160px repeat(8, 72px); gap: 6px; align-items: center; font-size: 12.5px; }
.ss-skill-head span { font-size: 11px; color: var(--text3); }
.ss-bays { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.ss-bay { display: flex; gap: 6px; align-items: center; border: 1px solid var(--border); border-radius: 6px; padding: 4px 8px; font-size: 13px; }
.ss-notes { width: 100%; }
</style>

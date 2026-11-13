<script setup lang="ts">
/**
 * The party's starships: one is active, the others wait in the hangar. The
 * sheet follows the ship's level (the party's, or one you pin): Hull and
 * Shield Points, defenses, stations, bays and crew. Its interior is an
 * encounter map; a starship battle is a copy of it with the crew at their posts.
 */
import { computed, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Plus, Trash2 } from 'lucide-vue-next'
import { checkDegree, type Degree } from '@/domain/rules/dcs'
import { signed } from '@/domain/rules/format'
import { starshipLevelChanges, starshipSheet } from '@/domain/rules/playerStarship'
import { DEGREE_LABEL, rollExpression } from '@/domain/rules/rolls'
import { emergencyRepairs, emergencyRepairsDc, type RepairRank } from '@/domain/rules/starshipCombat'
import type { Starship } from '@/domain/schema'
import { partyOf } from '@/data/party'
import { baysOf, createInterior, createStarship, loadCatalog, lookupFor, removeStarship, setActive, setFrame, sheetOf, starships, startStarshipBattle, stationsOf, updateStarship } from '@/data/starships'
import { pickImage, storeImage } from '@/services/images'
import AppDialog from '@/ui/components/AppDialog.vue'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { useImageUrl } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'
import CrewEditor from './CrewEditor.vue'
import StationsEditor from './StationsEditor.vue'

const props = defineProps<{ campaignId: string }>()
const router = useRouter()
const SHIP_CONDITIONS = ['Compromised', 'Wrecked', 'Inoperable', 'Off-Kilter']
const RANKS: RepairRank[] = ['trained', 'expert', 'master', 'legendary']

const ships = useLive(() => starships.ofCampaign(props.campaignId), [], [() => props.campaignId])
const catalog = useLive(() => loadCatalog(), { frames: [], stations: [], upgrades: [], bays: [] })
const characters = useLive(() => partyOf(props.campaignId), [], [() => props.campaignId])
const pickedId = ref<string | null>(null)
const ship = computed<Starship | null>(() => ships.value.find(s => s.id === pickedId.value) ?? ships.value[0] ?? null)
const built = useLive(async () => (ship.value ? sheetOf(ship.value) : null), null, [ship, characters, catalog])
const lookup = useLive(async () => lookupFor(ship.value, catalog.value), null, [ship, catalog])
const sheet = computed(() => built.value?.sheet ?? null)
const level = computed(() => built.value?.level ?? 1)
/** What the last level brought: the sheet one level lower against this one. */
const fresh = computed(() => (ship.value && lookup.value && sheet.value && level.value > 1 ? starshipLevelChanges(starshipSheet({ stations: stationsOf(ship.value), bays: baysOf(ship.value) }, lookup.value, level.value - 1), sheet.value) : []))
const img = useImageUrl(() => ship.value?.image, true)
const act = (what: string, work: () => Promise<unknown>) => work().catch(err => reportError(what, err))

const fresh0 = reactive({ open: false, name: '', frameId: '' })
const create = () => act('Creating the starship', async () => { const s = await createStarship(props.campaignId, fresh0.name, fresh0.frameId || null); pickedId.value = s.id; Object.assign(fresh0, { open: false, name: '', frameId: '' }) })
const remove = (s: Starship) => act('Deleting the starship', async () => {
  if (await confirmDialog({ title: `Delete “${s.name}”?`, body: 'The ship, its stations and crew roster are deleted. Its interior map and past battles stay as encounters.', confirmLabel: 'Delete', danger: true })) await removeStarship(s.id)
})
const numOrNull = (e: Event): number | null => { const v = (e.target as HTMLInputElement).value.trim(); return v === '' || !Number.isFinite(Number(v)) ? null : Number(v) }
function condition(name: string, e: Event) {
  const s = ship.value
  if (!s) return
  const v = (e.target as HTMLInputElement), rest = s.conditions.filter(c => c.name !== name)
  const valued = name === 'Compromised' || name === 'Wrecked'
  const on = valued ? Number(v.value) > 0 : v.checked
  void updateStarship(s.id, { conditions: on ? [...rest, { name, value: valued ? Number(v.value) : null }] : rest })
}
const condValue = (name: string) => ship.value?.conditions.find(c => c.name === name)
async function setImage() { const f = await pickImage(); if (f && ship.value) await updateStarship(ship.value.id, { image: await storeImage(f) }) }

// ── On the map ──
const interior = () => act('Opening the interior map', async () => { const s = ship.value; if (s) await router.push({ name: 'encounter', params: { campaignId: props.campaignId, encounterId: s.interiorEncounterId ?? await createInterior(s) } }) })
const battle = () => act('Starting the starship battle', async () => { const s = ship.value; if (s) await router.push({ name: 'encounter', params: { campaignId: props.campaignId, encounterId: await startStarshipBattle(s) } }) })

// ── Emergency Repairs (an hour or a day of Crafting while travelling) ──
const repair = reactive({ open: false, rank: 'trained' as RepairRank, remote: false, fullDay: false, modifier: 0, result: '' })
function rollRepair() {
  const s = ship.value, sh = sheet.value
  if (!s || !sh) return
  const dc = emergencyRepairsDc(repair.rank, repair.remote), d20 = Math.floor(Math.random() * 20) + 1
  const degree: Degree = checkDegree(d20, Number(repair.modifier) || 0, dc)
  const out = emergencyRepairs(degree, repair.rank, repair.fullDay)
  const rolled = out.dice ? (rollExpression(out.dice)?.total ?? 0) * out.multiplier : 0
  const hp = s.hpCurrent ?? sh.hp
  const next = out.damage ? Math.max(0, hp - rolled) : Math.min(sh.hp, hp + rolled + (rolled ? out.bonus : 0))
  void updateStarship(s.id, { hpCurrent: next, conditions: out.clearsWrecked ? s.conditions.filter(c => c.name !== 'Wrecked') : s.conditions })
  repair.result = `${d20} ${signed(Number(repair.modifier) || 0)} vs DC ${dc}: ${DEGREE_LABEL[degree]}. ${out.damage ? `The work goes wrong: ${rolled} damage.` : rolled ? `${next - hp} Hull Points regained${out.clearsWrecked && condValue('Wrecked') ? '; no longer wrecked' : ''}.` : 'Nothing regained.'}`
  notify(repair.result)
}
</script>

<template>
  <div class="page">
    <div class="page-head"><h1>Starship</h1><RouterLink class="btn" :to="{ name: 'party', params: { campaignId } }">Party</RouterLink><button class="btn btn-primary" data-test="new-ship" @click="fresh0.open = true"><Plus :size="15" /> New starship</button></div>
    <nav v-if="ships.length > 1" class="hangar">
      <button v-for="s in ships" :key="s.id" class="chip" :class="{ on: s.id === ship?.id }" @click="pickedId = s.id">{{ s.name }}{{ s.active ? ' · active' : '' }}</button>
    </nav>
    <p v-if="!catalog.frames.length" class="faint">The compendium has no starship frames. They come with your Tech Core pack (Compendium → Homebrew) or a homebrew file; a ship can be made without one, but its sheet stays empty.</p>

    <template v-if="ship && sheet">
      <section class="panel sheet" data-test="ship-sheet">
        <img v-if="img" :src="img" alt="" class="pic" />
        <div class="main">
          <div class="row">
            <input class="title" :value="ship.name" aria-label="Starship name" @change="updateStarship(ship.id, { name: ($event.target as HTMLInputElement).value.trim() || ship.name })" />
            <select class="input auto" :value="ship.frameId ?? ''" aria-label="Frame" @change="setFrame(ship.id, ($event.target as HTMLSelectElement).value)"><option value="" disabled>No frame</option><option v-for="f in catalog.frames" :key="f.id" :value="f.id">{{ f.name }}</option></select>
            <label class="faint">Level <input class="input num" :value="ship.levelPinned ?? ''" :placeholder="String(level)" aria-label="Pinned level" title="Empty follows the party's level" @change="updateStarship(ship.id, { levelPinned: numOrNull($event) })" /></label>
            <span class="grow" />
            <button v-if="!ship.active" class="btn" @click="setActive(ship.id)">Make it the party's ship</button><span v-else class="chip on">the party's ship</span>
            <button class="btn btn-ghost" @click="setImage">{{ ship.image ? 'Change picture' : 'Picture' }}</button>
            <button class="btn btn-icon btn-danger" :aria-label="`Delete ${ship.name}`" @click="remove(ship)"><Trash2 :size="14" /></button>
          </div>
          <div class="stats">
            <label>Hull Points <span><input class="input num" :value="ship.hpCurrent ?? sheet.hp" aria-label="Hull Points" @change="updateStarship(ship.id, { hpCurrent: numOrNull($event) })" /> / <b class="num" data-test="ship-hp-max">{{ sheet.hp }}</b></span></label>
            <label>Shield Points <span><input class="input num" :value="ship.spCurrent ?? sheet.sp" aria-label="Shield Points" @change="updateStarship(ship.id, { spCurrent: numOrNull($event) })" /> / <b class="num">{{ sheet.sp }}</b></span></label>
            <span>AC <b class="num">{{ sheet.ac }}</b></span><span>Fort <b class="num">{{ signed(sheet.saves.fort) }}</b></span><span>Ref <b class="num">{{ signed(sheet.saves.ref) }}</b></span><span>Will <b class="num">{{ signed(sheet.saves.will) }}</b></span>
            <span>Speed <b class="num">{{ sheet.speed }}</b> zones</span><span>Sensors <b class="num">{{ sheet.sensorRange }}</b> zones</span>
          </div>
          <div class="row conds">
            <label v-for="c in SHIP_CONDITIONS" :key="c" class="dim">{{ c }}
              <input v-if="c === 'Compromised' || c === 'Wrecked'" class="input num" type="number" min="0" max="10" :value="condValue(c)?.value ?? 0" :aria-label="c" @change="condition(c, $event)" />
              <input v-else type="checkbox" :checked="!!condValue(c)" :aria-label="c" @change="condition(c, $event)" />
            </label>
          </div>
          <p v-for="w in sheet.warnings" :key="w" class="warn">{{ w }}</p>
          <p v-if="fresh.length" class="faint">New at level {{ level }}: {{ fresh.join(' · ') }}</p>
          <div class="row">
            <button class="btn" data-test="ship-interior" @click="interior">{{ ship.interiorEncounterId ? 'Open the interior map' : 'Make an interior map' }}</button>
            <button class="btn btn-primary" data-test="ship-battle" @click="battle">Start a starship battle</button>
            <button class="btn" @click="repair.open = true; repair.result = ''">Emergency Repairs…</button>
            <span class="faint">Place the stations on the interior map (its Stations panel); a battle copies the map and seats the crew.</span>
          </div>
          <textarea class="input" rows="2" placeholder="Notes" :value="ship.notes" aria-label="Starship notes" @change="updateStarship(ship.id, { notes: ($event.target as HTMLTextAreaElement).value })" />
        </div>
      </section>
      <StationsEditor v-if="lookup" :ship="ship" :sheet="sheet" :lookup="lookup" :catalog="catalog" />
      <CrewEditor :ship="ship" :sheet="sheet" :characters="characters" />
    </template>
    <p v-else-if="!ships.length" class="empty">No starship yet. The first one you make is the party's ship.</p>

    <AppDialog v-if="fresh0.open" title="New starship" @close="fresh0.open = false">
      <label><span class="label">Name</span><input v-model="fresh0.name" class="input" aria-label="New starship name" /></label>
      <label><span class="label">Frame</span><select v-model="fresh0.frameId" class="input" aria-label="New starship frame"><option value="">None yet</option><option v-for="f in catalog.frames" :key="f.id" :value="f.id">{{ f.name }} ({{ f.size }})</option></select></label>
      <template #footer><button class="btn" @click="fresh0.open = false">Cancel</button><button class="btn btn-primary" data-test="create-ship" @click="create">Create</button></template>
    </AppDialog>
    <AppDialog v-if="repair.open && ship" title="Emergency Repairs" @close="repair.open = false">
      <p class="dim">An hour of work (or a day, for double), Crafting against a DC set by the rank you attempt.</p>
      <div class="row">
        <label><span class="label">Attempted at</span><select v-model="repair.rank" class="input"><option v-for="r in RANKS" :key="r" :value="r">{{ r }}</option></select></label>
        <label><span class="label">Crafting</span><input v-model.number="repair.modifier" type="number" class="input num" aria-label="Crafting modifier" /></label>
        <b class="num">DC {{ emergencyRepairsDc(repair.rank, repair.remote) }}</b>
      </div>
      <label class="dim"><input v-model="repair.remote" type="checkbox" /> Far from a port</label>
      <label class="dim"><input v-model="repair.fullDay" type="checkbox" /> A full day of work</label>
      <p v-if="repair.result"><b>{{ repair.result }}</b></p>
      <template #footer><button class="btn" @click="repair.open = false">Close</button><button class="btn btn-primary" @click="rollRepair">Roll</button></template>
    </AppDialog>
  </div>
</template>

<style scoped>
.hangar { display: flex; gap: .4rem; margin-bottom: .8rem; } .hangar .chip { background: none; cursor: pointer; } .chip.on { color: var(--accent); border-color: var(--accent); }
.sheet { display: flex; gap: 1rem; padding: 1rem 1.2rem; margin-bottom: 1rem; } .pic { width: 180px; height: 180px; object-fit: cover; border-radius: var(--radius); flex: none; } .main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: .6rem; }
.row { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; } .grow { flex: 1; } .auto { width: auto; } .num.input { width: 4.4rem; display: inline-block; padding: .2em .4em; }
.title { font-family: var(--font-title); font-size: 1.4rem; background: none; border: 1px solid transparent; border-radius: var(--radius); padding: .1rem .3rem; min-width: 14rem; } .title:hover, .title:focus { border-color: var(--line-strong); outline: none; }
.stats { display: flex; flex-wrap: wrap; gap: .5rem 1.6rem; align-items: end; } .stats label { display: flex; flex-direction: column; font-size: .8rem; color: var(--text-faint); } .stats > span { color: var(--text-dim); } .stats b { color: var(--text); font-size: 1.1rem; }
.conds label { display: flex; align-items: center; gap: .35rem; } .warn { color: var(--warn); margin: 0; } p { margin: 0; }
section + section, .sheet + section { margin-bottom: 1rem; }
</style>

<script setup lang="ts">
/** The ship's battle stations and expansion bays: what is installed, at which grade, with which upgrades, and what each lets its crew do. */
import { computed, ref } from 'vue'
import { X } from 'lucide-vue-next'
import { formatActionCost } from '@/domain/rules/format'
import type { Lookup, StarshipSheet } from '@/domain/rules/playerStarship'
import { stationKey } from '@/domain/rules/playerStarship'
import type { Starship } from '@/domain/schema'
import { addBay, addUpgrade, baysOf, removeBay, removeUpgrade, setBayOption, setStation, type StarshipCatalog } from '@/data/starships'
import ProseText from '@/features/shared/ProseText.vue'
import { peek } from '@/ui/workbench'

const props = defineProps<{ ship: Starship; sheet: StarshipSheet; lookup: Lookup; catalog: StarshipCatalog }>()
const open = ref(new Set<number>())
const toggle = (slot: number) => { const s = new Set(open.value); if (s.has(slot)) s.delete(slot); else s.add(slot); open.value = s }
const bays = computed(() => baysOf(props.ship).map((b, i) => ({ ...b, i, entry: props.lookup.bays.get(b.bayId) ?? null })))
/** Upgrades that fit this station and are not in it yet. */
const fitting = (row: StarshipSheet['stations'][number]) => props.catalog.upgrades.filter(u => row.station && (u.station === 'any' || stationKey(u.station) === stationKey(row.station.name)) && !row.slot.upgradeIds.includes(u.id) && !(row.slot.builtInUpgradeIds ?? []).includes(u.id))
const helmedText = (h: Partial<Record<string, number>> | undefined) => Object.entries(h ?? {}).filter(([, v]) => v).map(([k, v]) => `+${v} ${k === 'ac' ? 'AC' : k}`).join(', ')
</script>

<template>
  <section class="panel block" data-test="ship-stations">
    <span class="eyebrow">Battle stations</span>
    <div v-for="r in sheet.stations" :key="r.slot.slot" class="station" :data-station="r.station?.name ?? `Slot ${r.slot.slot}`">
      <header>
        <b class="num n">{{ r.slot.slot }}</b>
        <button v-if="r.station && r.slot.isDefault" class="name" @click="peek({ kind: 'rules', id: r.station.id })">{{ r.station.name }}</button>
        <select v-else class="input pick" :value="r.slot.stationId ?? ''" :aria-label="`Station in slot ${r.slot.slot}`" @change="setStation(ship.id, r.slot.slot, ($event.target as HTMLSelectElement).value || null)">
          <option value="">Empty slot</option><option v-for="s in catalog.stations" :key="s.id" :value="s.id">{{ s.name }}</option>
        </select>
        <span v-if="r.slot.isDefault" class="chip">frame</span>
        <span v-if="r.grade" class="chip grade">{{ r.grade.grade }}</span>
        <span v-if="helmedText(r.grade?.helmed)" class="faint">helmed {{ helmedText(r.grade?.helmed) }}</span>
        <span class="grow" />
        <span v-if="r.station" class="faint">{{ r.upgradesUsed }}/{{ r.upgradeLimit }} upgrades</span>
        <button v-if="r.station" class="btn btn-ghost" @click="toggle(r.slot.slot)">{{ open.has(r.slot.slot) ? 'Less' : `${r.actions.length} actions` }}</button>
      </header>
      <p v-for="w in r.warnings" :key="w" class="warn">{{ w }}</p>
      <div v-if="r.station" class="ups">
        <span v-for="id in r.slot.builtInUpgradeIds ?? []" :key="id" class="chip" title="Built into the frame's station; does not use a slot">{{ lookup.upgrades.get(id)?.name ?? 'Upgrade' }}</span>
        <span v-for="id in r.slot.upgradeIds" :key="id" class="chip on"><button class="linkish" @click="peek({ kind: 'rules', id })">{{ lookup.upgrades.get(id)?.name ?? 'Missing upgrade' }}</button><button class="x" :aria-label="`Remove ${lookup.upgrades.get(id)?.name}`" @click="removeUpgrade(ship.id, r.slot.slot, id)"><X :size="11" /></button></span>
        <select v-if="fitting(r).length" class="input add" :aria-label="`Add an upgrade to ${r.station.name}`" @change="addUpgrade(ship.id, r.slot.slot, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''">
          <option value="">+ upgrade</option><option v-for="u in fitting(r)" :key="u.id" :value="u.id">{{ u.name }} ({{ u.level }}){{ u.weapon ? ' · weapon' : '' }}</option>
        </select>
      </div>
      <div v-if="open.has(r.slot.slot)" class="actions">
        <div v-for="a in r.actions" :key="a.name"><b>{{ a.name }}</b> <span class="faint">{{ formatActionCost(a.cost) }}</span><ProseText :text="a.text" :campaign-id="ship.campaignId" /></div>
        <ProseText v-if="r.station?.helmedBenefits" :text="`**Helmed:** ${r.station.helmedBenefits}`" :campaign-id="ship.campaignId" />
      </div>
    </div>
    <p v-if="!sheet.stations.length" class="faint">Choose a frame: it brings its stations.</p>

    <span class="eyebrow bays">Expansion bays <span class="faint">{{ sheet.baysUsed }}/{{ sheet.baysLimit }} slots</span></span>
    <div v-for="b in bays" :key="b.i" class="bay">
      <button class="name" @click="peek({ kind: 'rules', id: b.bayId })">{{ b.entry?.name ?? 'Missing bay' }}</button>
      <span v-if="b.entry && !b.entry.takesSlot" class="faint">no slot</span>
      <select v-if="b.entry?.options?.length" class="input pick" :value="b.option ?? ''" :aria-label="`Option of ${b.entry.name}`" @change="setBayOption(ship.id, b.i, ($event.target as HTMLSelectElement).value || null)"><option v-for="o in b.entry.options" :key="o.name" :value="o.name">{{ o.name }}</option></select>
      <span class="grow" /><button class="btn btn-ghost btn-icon" :aria-label="`Remove ${b.entry?.name}`" @click="removeBay(ship.id, b.i)"><X :size="13" /></button>
      <small v-if="b.entry?.options?.find(o => o.name === b.option)?.text" class="faint note">{{ b.entry.options.find(o => o.name === b.option)?.text }}</small>
    </div>
    <select class="input add" aria-label="Add an expansion bay" @change="addBay(ship.id, ($event.target as HTMLSelectElement).value); ($event.target as HTMLSelectElement).value = ''"><option value="">+ expansion bay</option><option v-for="b in catalog.bays" :key="b.id" :value="b.id">{{ b.name }}</option></select>
  </section>
</template>

<style scoped>
.block { padding: .9rem 1.1rem; display: flex; flex-direction: column; gap: .5rem; } .eyebrow { color: var(--accent); } .bays { margin-top: .8rem; }
.station { border-top: var(--frame); padding-top: .45rem; } header, .ups, .bay { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; } .grow { flex: 1; }
.n { color: var(--accent); width: 1.2rem; } .name, .linkish { background: none; border: 0; padding: 0; color: var(--text); font-weight: 600; } .name:hover, .linkish:hover { color: var(--accent); } .linkish { font-weight: 400; color: inherit; }
.pick, .add { width: auto; padding: .2em .4em; } .grade { text-transform: capitalize; color: var(--accent-2); } .ups { margin: .35rem 0 0 1.7rem; } .chip.on { color: var(--text); }
.x { background: none; border: 0; padding: 0 0 0 .2rem; color: var(--text-faint); } .x:hover { color: var(--danger); }
.warn { margin: .2rem 0 0 1.7rem; color: var(--warn); font-size: .85rem; } .actions { margin: .5rem 0 0 1.7rem; display: flex; flex-direction: column; gap: .5rem; } .note { width: 100%; } p { margin: 0; }
</style>

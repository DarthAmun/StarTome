<script setup lang="ts">
/** The typed fields of an entry. Every change saves just that field. */
import { reactive, ref } from 'vue'
import { ImagePlus, X } from 'lucide-vue-next'
import { npcFactions, type Entry, type ImageRef } from '@/domain/schema'
import { entriesNamed } from '@/data/entries'
import { rulesNameList } from '@/data/rules'
import { campaign } from '@/ui/workbench'
import { pickImage, storeImage } from '@/services/images'
import { reportError } from '@/ui/dialogs'
import { useImageUrl } from '@/ui/imageUrl'
import GameIcon from '@/ui/components/GameIcon.vue'
import { NOTE_ICONS } from '@/features/shared/facts'
import { FIELDS, type Field } from './fields'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ change: [data: Record<string, unknown>] }>()

const data = () => props.entry.data as Record<string, unknown>
const text = (key: string) => String(data()[key] ?? '')
const set = (key: string, value: unknown) => emit('change', { [key]: value })
const value = (e: Event) => (e.target as HTMLInputElement).value
/**
 * What is being typed into a text field, until it is saved. Without it a redraw while typing (the
 * suggestions of Ancestry and Class arrive a moment after the field is entered) put the stored value back.
 */
const typing = reactive<Record<string, string>>({})
function commitText(key: string, v: string) { set(key, v); delete typing[key] }

// Images: one small component-local helper per image field
function imageUrl(key: string) { return useImageUrl(() => data()[key] as ImageRef | null) }
const urls = Object.fromEntries(FIELDS[props.entry.type].filter(f => f.kind === 'image').map(f => [f.key, imageUrl(f.key)]))

async function upload(key: string, keepOriginal: boolean) {
  const file = await pickImage()
  if (!file) return
  try { set(key, await storeImage(file, { keepOriginal })) } catch (err) { reportError('Storing the image', err) }
}
function fromUrl(key: string, url: string) { if (url.trim()) set(key, { url: url.trim() }) }

function toggleStatus(key: string, v: string) {
  const list = (data()[key] as string[] | undefined) ?? []
  set(key, list.includes(v) ? list.filter(s => s !== v) : [...list, v])
}

// Quest giver: an NPC or faction of the campaign, or just a typed name
const givers = ref<{ id: string; name: string; type: string }[]>([])
async function loadGivers() { givers.value = await entriesNamed(props.entry.campaignId, ['npc', 'faction']) }
function setGiver(name: string) {
  const hit = givers.value.find(g => g.name.toLowerCase() === name.trim().toLowerCase())
  set('giver', hit ? { entryId: hit.id, kind: hit.type, name: hit.name } : { entryId: null, kind: null, name: name.trim() })
}
const giverName = () => (props.entry.type === 'quest' ? props.entry.data.giver.name : '')
// An NPC's factions: picked from the campaign's factions by name
const factions = ref<{ id: string; name: string }[]>([])
async function loadFactions() { factions.value = await entriesNamed(props.entry.campaignId, ['faction']) }
void loadFactions()
const memberOf = () => npcFactions(props.entry)
const factionName = (id: string) => factions.value.find(f => f.id === id)?.name ?? '…'
function addFaction(input: HTMLInputElement) {
  const hit = factions.value.find(f => f.name.toLowerCase() === input.value.trim().toLowerCase())
  if (hit && !memberOf().includes(hit.id)) set('factions', [...memberOf(), hit.id])
  if (hit) input.value = ''
}
// Ancestry and class: names from the compendium, for the campaign's game
const names = ref<Record<string, string[]>>({})
async function loadNames(kind: 'ancestry' | 'class') {
  if (names.value[kind]) return
  const game = campaign.value?.game
  names.value = { ...names.value, [kind]: [...new Set((await rulesNameList(kind, game ? [game] : undefined)).map(r => r.name))] }
}
const isWide = (f: Field) => f.kind === 'image' || f.kind === 'factions' || f.kind === 'statuses' || f.kind === 'icon' || (f.kind === 'text' && f.wide)
</script>

<template>
  <div class="fields">
    <div v-for="f in FIELDS[entry.type]" :key="f.key" class="field" :class="{ wide: isWide(f) }">
      <label class="label" :for="`f-${f.key}`">{{ f.label }}</label>
      <template v-if="f.kind === 'text'">
        <input :id="`f-${f.key}`" class="input" :list="f.suggest ? `rules-${f.suggest}` : undefined" :value="typing[f.key] ?? text(f.key)" :placeholder="f.placeholder" @focus="f.suggest && loadNames(f.suggest)" @input="typing[f.key] = value($event)" @change="commitText(f.key, value($event))" />
        <datalist v-if="f.suggest" :id="`rules-${f.suggest}`"><option v-for="n in names[f.suggest] ?? []" :key="n" :value="n" /></datalist>
      </template>
      <select v-else-if="f.kind === 'select'" :id="`f-${f.key}`" class="input" :value="text(f.key)" @change="set(f.key, value($event) || null)">
        <option v-if="!text(f.key)" value="">—</option>
        <option v-for="[v, l] in f.options" :key="v" :value="v">{{ l }}</option>
      </select>
      <label v-else-if="f.kind === 'check'" class="check"><input :id="`f-${f.key}`" type="checkbox" :checked="!!data()[f.key]" @change="set(f.key, ($event.target as HTMLInputElement).checked)" /> {{ f.on }}</label>
      <div v-else-if="f.kind === 'statuses'" class="pills">
        <button v-for="[v, l] in f.options" :key="v" class="chip pill" :class="{ on: ((data()[f.key] as string[]) ?? []).includes(v) }" @click="toggleStatus(f.key, v)">{{ l }}</button>
      </div>
      <div v-else-if="f.kind === 'color'" class="row"><input :id="`f-${f.key}`" type="color" :value="text(f.key)" @change="set(f.key, value($event))" /> <span class="faint num">{{ text(f.key) }}</span></div>
      <div v-else-if="f.kind === 'icon'" class="pills">
        <button v-for="[name, label] in NOTE_ICONS" :key="name" class="chip pill icon" :class="{ on: text(f.key) === name }" :title="label" @click="set(f.key, text(f.key) === name ? '' : name)"><GameIcon :name="name" :size="18" /></button>
      </div>
      <template v-else-if="f.kind === 'giver'">
        <input :id="`f-${f.key}`" class="input" list="givers" :value="giverName()" placeholder="An NPC, a faction, or any name" @focus="loadGivers" @change="setGiver(value($event))" />
        <datalist id="givers"><option v-for="g in givers" :key="g.id" :value="g.name">{{ g.type }}</option></datalist>
      </template>
      <div v-else-if="f.kind === 'factions'" class="pills" data-test="npc-factions">
        <span v-for="id in memberOf()" :key="id" class="chip pill on">{{ factionName(id) }}<button class="unpick" :title="`Not in ${factionName(id)}`" @click="set('factions', memberOf().filter(x => x !== id))"><X :size="12" /></button></span>
        <input :id="`f-${f.key}`" class="input faction-pick" list="factions" :placeholder="factions.length ? 'Add a faction…' : 'No factions in this campaign yet'" :disabled="!factions.length" @focus="loadFactions" @change="addFaction($event.target as HTMLInputElement)" />
        <datalist id="factions"><option v-for="x in factions.filter(x => !memberOf().includes(x.id))" :key="x.id" :value="x.name" /></datalist>
      </div>
      <div v-else-if="f.kind === 'image'" class="image">
        <img v-if="urls[f.key]?.value" :src="urls[f.key]?.value ?? ''" alt="" />
        <button class="btn" @click="upload(f.key, false)"><ImagePlus :size="14" /> {{ data()[f.key] ? 'Replace' : 'Upload' }}</button>
        <button class="btn btn-ghost" title="Stores the file exactly as it is, however large" @click="upload(f.key, true)">Keep original size</button>
        <input class="input url" placeholder="…or an image address" @change="fromUrl(f.key, value($event)); ($event.target as HTMLInputElement).value = ''" />
        <button v-if="data()[f.key]" class="btn btn-ghost btn-icon" title="Remove the image" @click="set(f.key, null)"><X :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: .7rem 1rem; padding: .9rem 1rem; background: var(--bg-sunken); border: var(--frame); border-radius: var(--radius); margin-bottom: 1rem; }
.field.wide { grid-column: 1 / -1; }
.check, .row { display: flex; align-items: center; gap: .5rem; min-height: 2.2em; }
.pills { display: flex; gap: .35rem; flex-wrap: wrap; }
.pill { background: none; cursor: pointer; }
.pill.icon { padding: .3em .45em; }
.pill.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.unpick { display: inline-grid; place-items: center; margin-left: .3rem; padding: 0; background: none; border: 0; color: inherit; cursor: pointer; opacity: .7; } .unpick:hover { opacity: 1; }
.faction-pick { flex: 1; min-width: 180px; max-width: 280px; }
.image { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.image img { width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius); border: var(--frame); }
.url { flex: 1; min-width: 160px; }
</style>

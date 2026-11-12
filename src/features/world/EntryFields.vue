<script setup lang="ts">
/** The typed fields of an entry. Every change saves just that field. */
import { ref } from 'vue'
import { ImagePlus, X } from 'lucide-vue-next'
import type { Entry, ImageRef } from '@/domain/schema'
import { entriesNamed } from '@/data/entries'
import { pickImage, storeImage } from '@/services/images'
import { reportError } from '@/ui/dialogs'
import { useImageUrl } from '@/ui/imageUrl'
import { FIELDS, type Field } from './fields'

const props = defineProps<{ entry: Entry }>()
const emit = defineEmits<{ change: [data: Record<string, unknown>] }>()

const data = () => props.entry.data as Record<string, unknown>
const text = (key: string) => String(data()[key] ?? '')
const set = (key: string, value: unknown) => emit('change', { [key]: value })
const value = (e: Event) => (e.target as HTMLInputElement).value

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
const isWide = (f: Field) => f.kind === 'image' || f.kind === 'statuses' || (f.kind === 'text' && f.wide)
</script>

<template>
  <div class="fields">
    <div v-for="f in FIELDS[entry.type]" :key="f.key" class="field" :class="{ wide: isWide(f) }">
      <label class="label" :for="`f-${f.key}`">{{ f.label }}</label>
      <input v-if="f.kind === 'text'" :id="`f-${f.key}`" class="input" :value="text(f.key)" :placeholder="f.placeholder" @change="set(f.key, value($event))" />
      <select v-else-if="f.kind === 'select'" :id="`f-${f.key}`" class="input" :value="text(f.key)" @change="set(f.key, value($event) || null)">
        <option v-if="!text(f.key)" value="">—</option>
        <option v-for="[v, l] in f.options" :key="v" :value="v">{{ l }}</option>
      </select>
      <label v-else-if="f.kind === 'check'" class="check"><input :id="`f-${f.key}`" type="checkbox" :checked="!!data()[f.key]" @change="set(f.key, ($event.target as HTMLInputElement).checked)" /> {{ f.on }}</label>
      <div v-else-if="f.kind === 'statuses'" class="pills">
        <button v-for="[v, l] in f.options" :key="v" class="chip pill" :class="{ on: ((data()[f.key] as string[]) ?? []).includes(v) }" @click="toggleStatus(f.key, v)">{{ l }}</button>
      </div>
      <div v-else-if="f.kind === 'color'" class="row"><input :id="`f-${f.key}`" type="color" :value="text(f.key)" @change="set(f.key, value($event))" /> <span class="faint num">{{ text(f.key) }}</span></div>
      <template v-else-if="f.kind === 'giver'">
        <input :id="`f-${f.key}`" class="input" list="givers" :value="giverName()" placeholder="An NPC, a faction, or any name" @focus="loadGivers" @change="setGiver(value($event))" />
        <datalist id="givers"><option v-for="g in givers" :key="g.id" :value="g.name">{{ g.type }}</option></datalist>
      </template>
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
.pill.on { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.image { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.image img { width: 44px; height: 44px; object-fit: cover; border-radius: var(--radius); border: var(--frame); }
.url { flex: 1; min-width: 160px; }
</style>

<script setup lang="ts">
/**
 * Edits any compendium entry. Each field writes on its own; an edit to a
 * synced entry is kept as a local edit that the next sync leaves alone.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { ImagePlus, Plus, Trash2 } from 'lucide-vue-next'
import { getPath, setPath } from '@/domain/rules/edits'
import { summarizePacks, withPack } from '@/domain/rules/packs'
import { RULES_KIND_CONFIG, type RulesEntity } from '@/domain/rules/types'
import { rulesUpdate, rulesUserEntries } from '@/data/rules'
import { pickImage, storeImage } from '@/services/images'
import { reportError } from '@/ui/dialogs'
import { COMMON_FIELDS, KIND_SECTIONS, SUB_DEFAULTS, type Field, type RowsField } from './editorFields'
import FieldInput from './FieldInput.vue'

const props = defineProps<{ entity: RulesEntity }>()
const emit = defineEmits<{ saved: [entity: RulesEntity] }>()

const plain = (e: RulesEntity) => JSON.parse(JSON.stringify(e)) as RulesEntity
// The local copy is what you see while editing, so a save coming back never moves the cursor
const local = ref<RulesEntity>(plain(props.entity))
watch(() => props.entity.id, () => { void flush(); local.value = plain(props.entity) })

const bag = computed(() => local.value as unknown as Record<string, unknown>)
const cfg = computed(() => RULES_KIND_CONFIG[local.value.kind])
const sections = computed(() => KIND_SECTIONS[local.value.kind].map(s => ({ ...s, fields: s.fields.filter(f => !f.when || f.when(bag.value)) })).filter(s => s.fields.length || s.rows?.length))
const common = computed(() => COMMON_FIELDS.map(f => (f.path === 'level' ? { ...f, label: cfg.value.levelLabel } : f)))
const hasTokenArt = computed(() => local.value.kind === 'creature')

// ── Saving: every changed path is queued; nothing is lost when the editor closes ──
const pending = new Map<string, unknown>()
let timer: ReturnType<typeof setTimeout> | null = null

function set(path: string, value: unknown) {
  // A sub-object's first field brings the rest of it along (weapon, armor, shield)
  const [head = '', ...rest] = path.split('.')
  const defaults = SUB_DEFAULTS[head]
  if (defaults && rest.length && bag.value[head] === undefined) { set(head, setPath(defaults, rest.join('.'), value)); return }
  local.value = setPath(local.value, path, value)
  // A field inside an object (saves.fort, hp.max) is written by itself, so a synced entry keeps following
  // Foundry for its siblings; lists (strikes, abilities) are written whole, since their rows have no identity
  if (rest.length && !pending.has(head) && !Array.isArray(bag.value[head]) && !rest.some(k => /^\d+$/.test(k))) pending.set(path, value)
  else {
    for (const key of [...pending.keys()]) if (key.startsWith(`${head}.`)) pending.delete(key)
    pending.set(head, bag.value[head])
  }
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { void flush() }, 350)
}

async function flush() {
  if (timer) { clearTimeout(timer); timer = null }
  const id = local.value.id
  const changes = [...pending.entries()]
  pending.clear()
  try {
    let saved: RulesEntity | undefined
    for (const [path, value] of changes) saved = await rulesUpdate(id, path, value)
    if (saved) emit('saved', saved)
  } catch (err) { reportError('Saving the entry', err) }
}
onBeforeUnmount(() => { void flush() })
defineExpose({ flush })

function setField(field: Field, value: unknown) {
  if (field.codec === 'bulk') { set('bulkNote', undefined) }
  set(field.path, value)
}

// ── Rows ───────────────────────────────────────────────────────────────────
const rowsOf = (r: RowsField) => (getPath(local.value, r.path) as Record<string, unknown>[] | undefined) ?? []
function setRow(r: RowsField, i: number, field: Field, value: unknown) {
  set(r.path, rowsOf(r).map((row, j) => (j === i ? setPath(row, field.path, value) : row)))
}
const addRow = (r: RowsField) => set(r.path, [...rowsOf(r), JSON.parse(JSON.stringify(r.blank))])
const removeRow = (r: RowsField, i: number) => set(r.path, rowsOf(r).filter((_x, j) => j !== i))

// ── Pack and art ───────────────────────────────────────────────────────────
const packNames = ref<string[]>([])
async function loadPacks() { packNames.value = summarizePacks(await rulesUserEntries()).map(p => p.title).filter(Boolean) }
function setPack(title: string) {
  if (title.trim() !== (local.value.publication?.title ?? '')) set('publication', withPack(local.value, title.trim()).publication)
}
async function upload(path: 'img' | 'tokenImg') {
  const file = await pickImage()
  if (!file) return
  try { set(path, `img:${(await storeImage(file) as { imageId: string }).imageId}`) } catch (err) { reportError('Storing the image', err) }
}
const text = (e: Event) => (e.target as HTMLInputElement).value
</script>

<template>
  <div class="editor">
    <p v-if="entity.origin === 'foundry'" class="note dim">This entry comes from the Foundry compendium. Your changes are kept as local edits and survive re-syncs.</p>

    <section>
      <div class="grid">
        <FieldInput v-for="f in common" :key="f.path" :field="f" :value="getPath(local, f.path)" :game="local.game" @set="set(f.path, $event)" />
        <label v-if="local.origin === 'user'" class="span-3" title="Groups your homebrew: filter by it in the list, export it as a file">
          <span class="label">Pack <em>e.g. Homebrew: Conduit · empty = no pack</em></span>
          <input class="input" list="pack-names" :value="local.publication?.title ?? ''" @focus="loadPacks" @change="setPack(text($event))" />
          <datalist id="pack-names"><option v-for="p in packNames" :key="p" :value="p" /></datalist>
        </label>
      </div>
    </section>

    <section v-for="s in sections" :key="s.title">
      <h3>{{ s.title }}</h3>
      <div class="grid">
        <FieldInput v-for="f in s.fields" :key="f.path" :field="f" :value="getPath(local, f.path)" :game="local.game" @set="setField(f, $event)" />
      </div>
      <div v-for="r in s.rows ?? []" :key="r.path" class="rows">
        <div class="rows-head"><span class="eyebrow">{{ r.label }}</span><button class="btn" @click="addRow(r)"><Plus :size="13" /> {{ r.add }}</button></div>
        <div v-for="(row, i) in rowsOf(r)" :key="i" class="row panel">
          <div class="grid">
            <FieldInput v-for="f in r.columns" :key="f.path" :field="f" :value="getPath(row, f.path)" :game="local.game" @set="setRow(r, i, f, $event)" />
          </div>
          <button class="btn btn-ghost btn-icon remove" :title="`Remove this from ${r.label}`" @click="removeRow(r, i)"><Trash2 :size="14" /></button>
        </div>
      </div>
    </section>

    <section>
      <h3>Text and art</h3>
      <div class="grid">
        <FieldInput :field="{ path: 'description', label: 'Description', codec: 'area', span: 3, hint: 'markdown · {{spell: Fireball}} links · ::dice[2d6] rolls · > [!hidden] for GM-only' }" :value="local.description" :game="local.game" @set="set('description', $event)" />
        <FieldInput :field="{ path: 'gmNotes', label: 'GM notes', codec: 'area', span: 3, hint: 'only you see these; a sync never touches them' }" :value="local.gmNotes" :game="local.game" @set="set('gmNotes', $event || undefined)" />
        <label class="span-2">
          <span class="label">Portrait <em>a web address, or upload</em></span>
          <span class="art"><input class="input" :value="local.img ?? ''" @change="set('img', text($event).trim() || null)" /><button class="btn" @click="upload('img')"><ImagePlus :size="14" /> Upload</button></span>
        </label>
        <label v-if="hasTokenArt" class="span-2">
          <span class="label">Token art</span>
          <span class="art"><input class="input" :value="bag.tokenImg ?? ''" @change="set('tokenImg', text($event).trim() || null)" /><button class="btn" @click="upload('tokenImg')"><ImagePlus :size="14" /> Upload</button></span>
        </label>
      </div>
    </section>
  </div>
</template>

<style scoped>
.editor { display: flex; flex-direction: column; gap: 1.3rem; }
.note { margin: 0; padding: .5rem .7rem; border-left: 3px solid var(--accent-2); background: color-mix(in srgb, var(--accent-2) 8%, transparent); }
h3 { margin-bottom: .6rem; color: var(--accent); }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: .6rem .8rem; }
.span-2 { grid-column: span 2; } .span-3 { grid-column: 1 / -1; }
.label em { text-transform: none; letter-spacing: 0; font-style: normal; opacity: .75; margin-left: .4em; }
.rows { margin-top: .9rem; display: flex; flex-direction: column; gap: .5rem; }
.rows-head { display: flex; align-items: center; justify-content: space-between; }
.row { position: relative; padding: .6rem 2.4rem .6rem .7rem; background: var(--bg-sunken); }
.remove { position: absolute; top: .3rem; right: .3rem; }
.art { display: flex; gap: .4rem; }
</style>

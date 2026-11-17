<script setup lang="ts">
/**
 * Several map images at once: one floor each. The order is guessed from the
 * file names (domain/rules/floorNames.ts); the GM fixes it by dragging or with
 * the arrows, names the floors and marks the ground floor.
 */
import { computed, onBeforeUnmount, ref } from 'vue'
import { ArrowDown, ArrowUp } from 'lucide-vue-next'
import { guessFloorOrder } from '@/domain/rules/floorNames'
import { defaultFloorName } from '@/domain/rules/floors'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'
import { applyImages } from './floorImages'
import { floors } from './live'

const props = defineProps<{ files: File[] }>()
const emit = defineEmits<{ close: [] }>()

interface Row { file: File; url: string; guessed: string; name: string | null }
const guess = guessFloorOrder(props.files.map(f => f.name))
/** Bottom to top. */
const rows = ref<Row[]>(guess.order.map(i => ({ file: props.files[i]!, url: URL.createObjectURL(props.files[i]!), guessed: guess.names[i]!, name: null })))
const ground = ref<File>(props.files[guess.ground]!)
const groundAt = computed(() => Math.max(0, rows.value.findIndex(r => r.file === ground.value)))
const saving = ref(false)
const dragging = ref<number | null>(null)
onBeforeUnmount(() => rows.value.forEach(r => URL.revokeObjectURL(r.url)))

/** The floor a row lands on now: there already (its name) or new. */
const anchorLevel = computed(() => (floors().find(f => f.level === 0) ?? floors().find(f => f.main))?.level ?? 0)
function target(i: number) {
  const level = anchorLevel.value + i - groundAt.value
  return { level, there: floors().find(f => f.level === level) }
}
/** The name a row gets unless typed: the floor's own, a word from the file (Attic), or by its level. */
function suggested(i: number): string {
  const { level, there } = target(i)
  const row = rows.value[i]!
  if (there) return there.name
  return /^(Ground floor|Basement( \d+)?|Floor \d+)$/.test(row.guessed) ? defaultFloorName(level - anchorLevel.value) : row.guessed
}

function move(i: number, by: number) {
  const j = i + by
  if (j < 0 || j >= rows.value.length) return
  const list = [...rows.value]
  ;[list[i], list[j]] = [list[j]!, list[i]!]
  rows.value = list
}
function drop(to: number) {
  const from = dragging.value
  dragging.value = null
  if (from === null || from === to) return
  const list = [...rows.value]
  const [row] = list.splice(from, 1)
  list.splice(to, 0, row!)
  rows.value = list
}

async function apply() {
  saving.value = true
  try {
    await applyImages(rows.value.map((r, i) => ({ file: r.file, name: r.name?.trim() || suggested(i) })), groundAt.value)
    emit('close')
  } catch (err) { reportError('Putting the images on the floors', err) } finally { saving.value = false }
}
</script>

<template>
  <AppDialog :title="`${files.length} map images: one floor each`" wide @close="emit('close')">
    <p class="faint">Top floor first. Drag a row or use the arrows to fix the order, and mark the ground floor. Floors that are there keep their walls, fog and tokens and get the new image.</p>
    <ol class="rows" data-test="floor-images">
      <li
        v-for="i in [...rows.keys()].reverse()" :key="rows[i]!.url" draggable="true" :class="{ ground: rows[i]!.file === ground }" :data-row="rows[i]!.file.name"
        @dragstart="dragging = i" @dragover.prevent @drop.prevent="drop(i)"
      >
        <img :src="rows[i]!.url" alt="" />
        <div class="what">
          <input class="input" :value="rows[i]!.name ?? ''" :placeholder="suggested(i)" :aria-label="`Floor name for ${rows[i]!.file.name}`" @input="rows[i]!.name = ($event.target as HTMLInputElement).value" />
          <span class="faint">{{ rows[i]!.file.name }} · {{ target(i).there ? `on “${target(i).there!.name}”` : 'new floor' }}</span>
        </div>
        <label class="dim"><input type="radio" name="ground" :checked="rows[i]!.file === ground" :aria-label="`Ground floor: ${rows[i]!.file.name}`" @change="ground = rows[i]!.file" /> Ground</label>
        <button class="btn btn-icon" title="Up a floor" :disabled="i === rows.length - 1" :aria-label="`Move ${rows[i]!.file.name} up`" @click="move(i, 1)"><ArrowUp :size="14" /></button>
        <button class="btn btn-icon" title="Down a floor" :disabled="i === 0" :aria-label="`Move ${rows[i]!.file.name} down`" @click="move(i, -1)"><ArrowDown :size="14" /></button>
      </li>
    </ol>
    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" :disabled="saving" data-test="floor-images-apply" @click="apply">{{ saving ? 'Saving…' : 'Use as floors' }}</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.rows { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: .35rem; }
.rows li { display: flex; align-items: center; gap: .6rem; padding: .35rem .5rem; border: var(--frame); border-radius: var(--radius); background: var(--bg-sunken); cursor: grab; }
.rows li.ground { border-color: var(--accent); }
.rows img { width: 72px; height: 48px; object-fit: cover; border-radius: 3px; background: #0e0e1a; flex: none; }
.what { flex: 1; display: flex; flex-direction: column; gap: .15rem; min-width: 0; } .what span { font-size: .78rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>

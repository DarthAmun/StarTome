<script setup lang="ts">
/**
 * A new image tile for the map maker: a picture (uploaded, or an asset from
 * the library), a name, and what it does on the map: floor, wall, door,
 * window or hidden door. Walls and doors are made from it like from the
 * built-in tiles.
 */
import { onBeforeUnmount, ref } from 'vue'
import { IMAGE_TILE_ROLES, ROLE_LABEL, type ImageTileRole } from '@/domain/rules/battlemap'
import { assetName } from '@/domain/rules/mapAssets'
import type { MapAsset } from '@/domain/schema'
import { mapAssets } from '@/data/encounters'
import { importAsset, pickAssetFiles } from '@/services/assetFiles'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'
import { imageUrlOf } from '@/ui/imageUrl'

const props = defineProps<{ asset?: MapAsset | null }>()
const emit = defineEmits<{ close: []; made: [tile: MapAsset] }>()

const file = ref<File | null>(null)
const preview = ref<string | null>(null)
const name = ref(props.asset?.name ?? '')
const role = ref<ImageTileRole>('floor')
const saving = ref(false)
if (props.asset) void imageUrlOf({ imageId: props.asset.imageId }).then((u) => { preview.value = u })
onBeforeUnmount(() => { if (file.value && preview.value) URL.revokeObjectURL(preview.value) })

async function choose() {
  const [picked] = await pickAssetFiles()
  if (!picked) return
  if (file.value && preview.value) URL.revokeObjectURL(preview.value)
  file.value = picked.file
  preview.value = URL.createObjectURL(picked.file)
  if (!name.value.trim()) name.value = assetName(picked.file.name)
}

async function save() {
  const label = name.value.trim() || 'Tile'
  saving.value = true
  try {
    const a = props.asset
    const tile = file.value
      ? await importAsset({ file: file.value, path: file.value.name }, { name: label, role: role.value })
      : a ? await mapAssets.add({ name: label, imageId: a.imageId, pxWidth: a.pxWidth, pxHeight: a.pxHeight, folder: null, tileRole: role.value }) : null
    if (tile) emit('made', tile)
    emit('close')
  } catch (err) { reportError('Making the tile', err) } finally { saving.value = false }
}
</script>

<template>
  <AppDialog title="New image tile" @close="emit('close')">
    <div class="row">
      <div class="pic"><img v-if="preview" :src="preview" alt="" /><span v-else class="faint">No image</span></div>
      <div class="fields">
        <button class="btn" data-test="tile-image" @click="choose">{{ preview ? 'Another image…' : 'Choose image…' }}</button>
        <label><span class="label">Name</span><input v-model="name" class="input" aria-label="Tile name" /></label>
        <label><span class="label">On the map it is</span>
          <select v-model="role" class="input" aria-label="Tile role"><option v-for="r in IMAGE_TILE_ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option></select>
        </label>
      </div>
    </div>
    <p class="faint">The image fills one square and repeats on every square painted with it. Walls block sight, doors and windows get a wall of that kind across them when the map makes its walls.</p>
    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" :disabled="saving || !preview" data-test="tile-save" @click="save">Make tile</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.row { display: flex; gap: .8rem; }
.pic { width: 96px; height: 96px; flex: none; display: grid; place-items: center; border: var(--frame); border-radius: var(--radius); background: var(--bg-sunken); overflow: hidden; }
.pic img { width: 100%; height: 100%; object-fit: cover; }
.fields { flex: 1; display: flex; flex-direction: column; gap: .45rem; align-items: flex-start; } .fields label { width: 100%; }
p { margin: 0; font-size: .8rem; }
</style>

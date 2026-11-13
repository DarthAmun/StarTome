<script setup lang="ts">
/** A token of the library: its name and picture, and what it stands for (a compendium stat block, an NPC, or nothing). */
import { reactive, ref } from 'vue'
import { ADJUSTMENT_LABEL, type Adjustment } from '@/domain/rules/combat'
import type { Actor, ActorRef, ImageRef } from '@/domain/schema'
import { actors } from '@/data/encounters'
import { entriesNamed } from '@/data/entries'
import { rulesGet } from '@/data/rules'
import { pickImage, storeImage } from '@/services/images'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'
import { useImageUrl } from '@/ui/imageUrl'
import { useLive } from '@/ui/useLive'
import { campaign, campaignId } from '@/ui/workbench'
import CreaturePicker from './CreaturePicker.vue'

const props = defineProps<{ actor: Actor | null }>()
const emit = defineEmits<{ close: []; saved: [actor: Actor] }>()

const a = props.actor
const stat = a?.ref.kind === 'rules' ? a.ref : a?.statBlock ?? null
const f = reactive({
  name: a?.name ?? '', image: (a?.image ?? null) as ImageRef | null, url: a?.image && 'url' in a.image ? a.image.url : '',
  entryId: a?.ref.kind === 'entry' ? a.ref.entryId : '', rulesId: stat?.rulesId ?? '', adjustment: (stat?.adjustment ?? '') as Adjustment | '',
  syncImage: a?.syncImage ?? false, pinned: a?.pinned ?? false,
})
const character = a?.ref.kind === 'character' ? a.ref : null
const npcs = useLive(() => (campaignId.value ? entriesNamed(campaignId.value, ['npc']) : Promise.resolve([])), [])
const linked = useLive(async () => (f.rulesId ? (await rulesGet(f.rulesId))?.name ?? 'Not in the compendium' : ''), '', [() => f.rulesId])
const preview = useImageUrl(() => f.image)
const picking = ref(false)

async function upload() {
  const file = await pickImage()
  if (file) { f.image = await storeImage(file); f.url = '' }
}
function setUrl() { f.image = f.url.trim() ? { url: f.url.trim() } : null }

async function save() {
  const statBlock = f.rulesId ? { rulesId: f.rulesId, adjustment: f.adjustment || null } : null
  const ref: ActorRef = character ?? (f.entryId ? { kind: 'entry', entryId: f.entryId } : statBlock ? { kind: 'rules', ...statBlock } : { kind: 'none' })
  try {
    emit('saved', await actors.save({ id: a?.id, name: f.name.trim() || linked.value || 'Token', image: f.image, ref, statBlock: ref.kind === 'rules' ? null : statBlock, syncImage: f.syncImage, pinned: f.pinned }))
    emit('close')
  } catch (err) { reportError('Saving the token', err) }
}
</script>

<template>
  <AppDialog :title="actor ? `Token · ${actor.name}` : 'New library token'" @close="emit('close')">
    <label><span class="label">Name</span><input v-model="f.name" class="input" :placeholder="linked || 'Token'" aria-label="Token name" /></label>
    <div class="img">
      <img v-if="preview" :src="preview" alt="" />
      <button class="btn" @click="upload">Choose picture…</button>
      <input v-model="f.url" class="input" placeholder="…or a web address" @change="setUrl" />
      <button v-if="f.image" class="btn btn-ghost" @click="f.image = null; f.url = ''">Remove</button>
    </div>
    <p v-if="character" class="dim">This is a party member's token.</p>
    <label v-else><span class="label">NPC of {{ campaign?.name ?? 'the open campaign' }}</span>
      <select v-model="f.entryId" class="input"><option value="">None</option><option v-for="n in npcs" :key="n.id" :value="n.id">{{ n.name }}</option></select>
    </label>
    <div>
      <span class="label">Stat block</span>
      <p v-if="f.rulesId" class="stat"><b>{{ linked }}</b>
        <select v-model="f.adjustment" class="input adj" aria-label="Weak or elite"><option value="">Normal</option><option v-for="(l, k) in ADJUSTMENT_LABEL" :key="k" :value="k">{{ l }}</option></select>
        <button class="btn btn-ghost" @click="f.rulesId = ''">Unlink</button></p>
      <button v-else-if="!picking" class="btn" @click="picking = true">Link a creature, hazard or vehicle…</button>
      <CreaturePicker v-else :game="campaign?.game ?? 'pf2e'" @pick="e => { f.rulesId = e.id; picking = false; if (!f.name.trim()) f.name = e.name }" />
    </div>
    <label class="dim" title="The picture is the NPC's portrait or the creature's token art, and changes with it"><input v-model="f.syncImage" type="checkbox" :disabled="!f.entryId && !f.rulesId && !character" /> Picture follows the linked entry</label>
    <label v-if="!character" class="dim" title="Listed first; placed as a player token"><input v-model="f.pinned" type="checkbox" /> Player character</label>
    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" data-test="save-actor" @click="save">Save</button>
    </template>
  </AppDialog>
</template>

<style scoped>
.img, .stat { display: flex; gap: .5rem; align-items: center; margin: 0; } .img img { width: 44px; height: 44px; border-radius: 50%; object-fit: cover; } .adj { width: auto; } p { margin: 0; }
</style>

<script setup lang="ts">
/**
 * One compendium entry with its tools: favourite, edit, copy as homebrew,
 * rebuild, reset edits, delete. Shown in the dock and beside the compendium list.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { Copy, Hammer, Pencil, RotateCcw, Star, Trash2 } from 'lucide-vue-next'
import type { GameId } from '@/domain/game'
import { applyAdjustment } from '@/domain/rules/combat'
import type { Creature, RulesEntity } from '@/domain/rules/types'
import { rulesDelete, rulesDuplicate, rulesGet, rulesResetEdits, rulesUpdate } from '@/data/rules'
import { confirmDialog, reportError } from '@/ui/dialogs'
import { rulesRevision } from '@/ui/rulesLive'
import { campaign, peek } from '@/ui/workbench'
import CreatureBuilder from './CreatureBuilder.vue'
import RulesEditor from './RulesEditor.vue'
import StatBlock from './StatBlock.vue'

const props = defineProps<{ rulesId: string; startEditing?: boolean; inPage?: boolean; /** Shown as its weak or elite version (a token in an encounter). */ adjustment?: 'weak' | 'elite' | null }>()
/** `open`: another entry was asked for (only beside the list; in the dock it opens as a tab). */
const emit = defineEmits<{ open: [id: string, edit?: boolean]; gone: [] }>()

const entity = shallowRef<RulesEntity | null | undefined>(undefined)
const editing = ref(!!props.startEditing)
const rebuilding = ref(false)
const editor = ref<{ flush: () => Promise<void> } | null>(null)
const game = computed<GameId | undefined>(() => campaign.value?.game)

watch(() => [props.rulesId, rulesRevision.value] as const, async ([id], old) => {
  if (old && old[0] !== id) editing.value = !!props.startEditing
  entity.value = (await rulesGet(id)) ?? null
}, { immediate: true })

const edited = computed(() => !!entity.value?.localEdits && Object.keys(entity.value.localEdits).length > 0)
const own = computed(() => entity.value?.origin !== 'foundry')
const built = computed(() => (entity.value?.kind === 'creature' && entity.value.origin === 'user' && entity.value.build ? entity.value as Creature : null))

function open(id: string, edit = false) {
  // Beside the list the page follows; in the dock the entry opens as another tab
  if (props.inPage) emit('open', id, edit)
  else peek({ kind: 'rules', id })
}

async function act(what: string, work: () => Promise<void>) {
  try { await work() } catch (err) { reportError(what, err) }
}
const toggleFavorite = () => act('Changing the favourite', async () => { if (entity.value) await rulesUpdate(entity.value.id, 'isFavorite', !entity.value.isFavorite) })
const toggleEdit = async () => { if (editing.value) await editor.value?.flush(); editing.value = !editing.value }
const duplicate = () => act('Copying the entry', async () => {
  const copy = entity.value && await rulesDuplicate(entity.value.id)
  if (copy) open(copy.id, true)
})
const reset = () => act('Dropping the edits', async () => {
  if (!entity.value || !await confirmDialog({ title: 'Drop your edits?', body: `“${entity.value.name}” goes back to the Foundry version.`, confirmLabel: 'Drop edits', danger: true })) return
  editing.value = false
  await rulesResetEdits(entity.value.id)
})
const remove = () => act('Deleting the entry', async () => {
  if (!entity.value || !await confirmDialog({ title: `Delete “${entity.value.name}”?`, body: 'The entry is removed from the compendium. Text that names it keeps the name.', confirmLabel: 'Delete', danger: true })) return
  await rulesDelete(entity.value.id)
  emit('gone')
})
</script>

<template>
  <div v-if="entity" class="view">
    <div class="tools">
      <button class="btn btn-ghost btn-icon" :class="{ fav: entity.isFavorite }" :title="entity.isFavorite ? 'Remove from favourites' : 'Add to favourites'" @click="toggleFavorite"><Star :size="15" :fill="entity.isFavorite ? 'currentColor' : 'none'" /></button>
      <span v-if="edited" class="chip edited" title="You changed this synced entry; your edits survive a sync">edited</span>
      <span v-if="entity.upstream?.removed" class="chip edited" title="No longer in its Foundry pack; kept so links to it still work">removed upstream</span>
      <span class="grow" />
      <button v-if="built" class="btn" title="Rebuild with the creature builder, for example at another level" @click="rebuilding = true"><Hammer :size="14" /> Rebuild</button>
      <button v-if="edited" class="btn" title="Drop your edits and show the Foundry version" @click="reset"><RotateCcw :size="14" /> Reset</button>
      <button class="btn" title="Copy as a homebrew entry of your own" @click="duplicate"><Copy :size="14" /> Duplicate</button>
      <button v-if="own" class="btn btn-danger btn-icon" title="Delete" @click="remove"><Trash2 :size="14" /></button>
      <button class="btn" :class="{ 'btn-primary': editing }" data-test="rules-edit" @click="toggleEdit"><Pencil :size="14" /> {{ editing ? 'Done' : 'Edit' }}</button>
    </div>
    <RulesEditor v-if="editing" ref="editor" :key="entity.id" :entity="entity" />
    <StatBlock v-else :entity="adjustment ? applyAdjustment(entity, adjustment) : entity" :game="game" @open="open($event)" />
    <CreatureBuilder v-if="built" :open="rebuilding" :game="built.game === 'sf2e' ? 'sf2e' : 'pf2e'" :base="built" @close="rebuilding = false" @saved="rebuilding = false" />
  </div>
  <p v-else-if="entity === null" class="empty">Not in the compendium.</p>
</template>

<style scoped>
.view { padding: .9rem 1.3rem 2.5rem; }
.tools { display: flex; align-items: center; gap: .35rem; margin-bottom: .9rem; flex-wrap: wrap; }
.grow { flex: 1; }
.fav { color: var(--accent); }
.edited { color: var(--accent-2); border-color: color-mix(in srgb, var(--accent-2) 50%, var(--line)); }
</style>

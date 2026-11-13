<script setup lang="ts">
/** A campaign's settings: name, description, game, how characters advance, and what the encounter changes by itself. */
import { reactive } from 'vue'
import type { Campaign } from '@/domain/schema'
import { updateCampaign } from '@/data/campaigns'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'

const props = defineProps<{ campaign: Campaign }>()
const emit = defineEmits<{ close: [] }>()
const c = props.campaign
const f = reactive({ name: c.name, description: c.description, game: c.game, advancement: c.rules.advancement, ...c.rules.automation })

async function save() {
  try {
    await updateCampaign(c.id, { name: f.name, description: f.description, game: f.game, rules: { advancement: f.advancement, automation: { tickDown: f.tickDown, dying: f.dying, persistent: f.persistent } } })
    emit('close')
  } catch (err) { reportError('Saving the campaign', err) }
}
</script>

<template>
  <AppDialog :title="`Campaign · ${campaign.name}`" @close="emit('close')">
    <label><span class="label">Name</span><input v-model="f.name" class="input" aria-label="Campaign name" /></label>
    <label><span class="label">Description</span><textarea v-model="f.description" class="input" rows="3" aria-label="Campaign description" /></label>
    <div class="row">
      <label><span class="label">Game</span><select v-model="f.game" class="input"><option value="pf2e">Pathfinder 2e</option><option value="sf2e">Starfinder 2e</option></select></label>
      <label><span class="label">Characters advance by</span><select v-model="f.advancement" class="input" aria-label="Advancement"><option value="xp">Experience points</option><option value="milestone">Milestones</option></select></label>
    </div>
    <span class="label">In encounters, by itself</span>
    <label class="dim"><input v-model="f.tickDown" type="checkbox" /> Frightened and stunned go down; reminders for lost and extra actions</label>
    <label class="dim"><input v-model="f.dying" type="checkbox" /> Dying, wounded and recovery checks; others are defeated at 0 HP</label>
    <label class="dim"><input v-model="f.persistent" type="checkbox" /> Persistent damage asks for its roll at the end of the turn</label>
    <template #footer><button class="btn" @click="emit('close')">Cancel</button><button class="btn btn-primary" data-test="save-campaign" @click="save">Save</button></template>
  </AppDialog>
</template>

<style scoped>
.row { display: flex; gap: .8rem; } .row label { flex: 1; } .label { margin-bottom: 0; }
</style>

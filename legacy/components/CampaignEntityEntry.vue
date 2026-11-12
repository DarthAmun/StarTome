<template>
  <!-- Keyed per entry: switching entries remounts the editor, which flushes its pending saves -->
  <component
    :is="EDITORS[props.type] ?? NoteEditorSimple"
    v-if="currentEntry"
    :key="currentEntry.id"
    :entity-id="currentEntry.id"
    :campaign-id="campaignId"
    @navigate="onNavigate"
    @deleted="goToList()"
  />
  <div v-else class="edetail-empty">
    <span>Entry not found.</span>
    <button class="btn-accent-sm" @click="goToList()">← Back</button>
  </div>
</template>

<script setup lang="ts">
import { rulesRefRoute } from '~/composables/useRules'
import type { Component } from 'vue'
import { useCampaignEntity } from '~/composables/useCampaignEntity'
import { ENTITY_TYPE_ROUTE } from '~/types/entities'
import type { EntityType } from '~/types/entities'
import NpcEditor from '~/components/editors/NpcEditor.vue'
import LocationEditor from '~/components/editors/LocationEditor.vue'
import FactionEditor from '~/components/editors/FactionEditor.vue'
import QuestEditor from '~/components/editors/QuestEditor.vue'
import EventEditor from '~/components/editors/EventEditor.vue'
import SessionEditor from '~/components/editors/SessionEditor.vue'
import RandomTableEditor from '~/components/editors/RandomTableEditor.vue'
import RumorEditor from '~/components/editors/RumorEditor.vue'
import RegionEditor from '~/components/editors/RegionEditor.vue'
import NoteEditorSimple from '~/components/editors/NoteEditorSimple.vue'

const EDITORS: Partial<Record<EntityType, Component>> = {
  npc: NpcEditor, location: LocationEditor, faction: FactionEditor, quest: QuestEditor,
  event: EventEditor, session: SessionEditor, 'random-table': RandomTableEditor,
  rumor: RumorEditor, region: RegionEditor, note: NoteEditorSimple,
}

const props = defineProps<{ type: EntityType }>()

const route = useRoute()
const router = useRouter()
const campaignId = Number(route.params.id)

const { currentEntry, goToList, ensureLoaded, store } = useCampaignEntity(props.type)

async function onNavigate(type: string, name: string) {
  const entry = store.findByTypeAndName(type, name)
  if (!entry) {
    const rulesRoute = await rulesRefRoute(type, name)
    if (rulesRoute) router.push(rulesRoute)
    return
  }
  router.push(`/campaign/${campaignId}/${ENTITY_TYPE_ROUTE[type as keyof typeof ENTITY_TYPE_ROUTE] ?? type + 's'}/${entry.id}`)
}

onMounted(() => ensureLoaded())
</script>

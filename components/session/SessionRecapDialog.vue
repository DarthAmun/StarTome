<template>
    <AppDialog :open="!!(ready)" class="srd" @close="$emit('close')">
          <template #title>Recap{{ previous ? ` · ${previous.name}` : '' }}</template>
                <div class="pv-dialog-content">
                    <p v-if="!previous" class="srd-dim">No earlier session to recap.</p>
                    <template v-else>
                        <p class="srd-dim">What the players should know from last time. Tick what you've covered.</p>
                        <label v-for="log in logs" :key="log.id" class="srd-row" :class="{ 'srd-row--done': !!log.attrs.recapChecked }">
                            <input type="checkbox" :checked="!!log.attrs.recapChecked" @change="toggle(log)" />
                            <div class="srd-body">
                                <div v-if="log.title" class="srd-title">{{ log.title }}</div>
                                <div v-if="log.content" class="srd-text md-content" v-html="render(log.content)" />
                            </div>
                        </label>
                        <p v-if="!logs.length" class="srd-dim">
                            Nothing from that session is flagged <i>players should know</i>. Flag Logs with the eye button while you play.
                        </p>
                    </template>

                    <div v-if="linked.length" class="srd-hero">
                        <span>{{ linked.length }} player{{ linked.length === 1 ? '' : 's' }} on Play Buddy</span>
                        <button class="srd-btn" :disabled="heroSent" @click="heroPoints">
                            {{ heroSent ? 'Hero points offered' : '+1 hero point to everyone' }}
                        </button>
                    </div>
                </div>
                <div class="pv-dialog-footer">
                    <button class="srd-btn srd-btn--primary" @click="$emit('close')">Start the session</button>
                </div>
        </AppDialog>
</template>

<script setup lang="ts">
import { getDb, type DbSessionPanel } from '~/composables/useDb'
import { useEntities, type Entity } from '~/composables/useEntities'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { useEntityRendering } from '~/composables/useEntityRendering'
import { useParty } from '~/composables/useParty'
import { usePlayBuddy } from '~/composables/usePlayBuddy'
import { isPartyMember } from '~/rules/party'
import { logsInOrder } from '~/utils/sessionBoard'
import type { SessionBoardEdge } from '~/db/schema'
import { toPlain } from '~/utils/json'
import type { SessionAttributes } from '~/types/entities'

const props = defineProps<{ sessionId: number; campaignId: number; /** Opened by starting the session: stays closed when there's nothing to show */ auto?: boolean }>()
const emit = defineEmits<{ close: [] }>()

const store = useEntities()
const party = useParty()
const playBuddy = usePlayBuddy()
const { renderMarkdown } = useEntityMarkdown()
const { entityLookup } = useEntityRendering(() => props.campaignId)

const num = (e: Entity) => parseInt((e.attributes as SessionAttributes).sessionNumber ?? '', 10)

/** The session before this one: by session number, else by creation. */
const previous = computed(() => {
    const sessions = [...(store.byType.session ?? [])].filter(s => s.campaignId === props.campaignId).sort((a, b) => {
        const na = num(a), nb = num(b)
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb
        return a.id - b.id
    })
    const i = sessions.findIndex(s => s.id === props.sessionId)
    return i > 0 ? sessions[i - 1] : null
})

const logs = ref<DbSessionPanel[]>([])
const ready = ref(false)
async function load() {
    const prev = previous.value
    if (!prev) { logs.value = []; return }
    const panels = await getDb().sessionPanels.where('session_id').equals(prev.id).toArray()
    const edges = ((prev.attributes as { board?: { edges?: SessionBoardEdge[] } }).board?.edges) ?? []
    logs.value = logsInOrder(panels, edges).map(o => o.log).filter(p => p.attrs.playersShouldKnow)
}

async function toggle(log: DbSessionPanel) {
    log.attrs = { ...log.attrs, recapChecked: !log.attrs.recapChecked }
    await getDb().sessionPanels.update(log.id!, { attrs: toPlain(log.attrs), updated_at: new Date().toISOString() })
}

function render(content: string) {
    return renderMarkdown(content, { rich: true, entityLookup })
}

// ── Hero points (Play Buddy) ────────────────────────────────────────────
const linked = computed(() => party.characters.value.filter(c => c.campaignId === props.campaignId && isPartyMember(c) && c.pbPlayerId))
const heroSent = ref(false)
async function heroPoints() {
    heroSent.value = true
    await playBuddy.heroPointsForAll(props.campaignId, linked.value, 'Start of session')
}

onMounted(async () => {
    await Promise.all([store.loadAll(props.campaignId), party.load(props.campaignId)])
    await load()
    if (props.auto && !logs.value.length && !linked.value.length) emit('close')
    else ready.value = true
})
</script>

<style scoped>
.srd { width: 520px; max-width: 92vw; }
.srd-dim { font-size: 12.5px; color: var(--text3); margin: 0 0 10px; }
.srd-row { display: flex; gap: 10px; align-items: flex-start; padding: 8px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.srd-row input { margin-top: 3px; }
.srd-row--done .srd-body { opacity: 0.5; }
.srd-body { flex: 1; min-width: 0; }
.srd-title { font-weight: 600; font-size: 13.5px; color: var(--text); }
.srd-text { font-size: 13px; color: var(--text2); line-height: 1.5; }
.srd-text :deep(p) { margin: 0 0 4px; }
.srd-hero { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 14px; padding-top: 10px; border-top: 1px dashed var(--border); font-size: 12.5px; color: var(--text2); }
.srd-btn { padding: 5px 12px; border-radius: var(--r1); font-size: 12.5px; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
.srd-btn:disabled { opacity: 0.5; cursor: default; }
.srd-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
</style>

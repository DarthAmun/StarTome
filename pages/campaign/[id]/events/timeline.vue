<template>
    <div class="sv-timeline">
        <div v-if="!timelineEvents.length" class="sv-empty">
            <OhVueIcon name="gi-sands-of-time" scale="2.5" style="opacity:0.1" />
            <span>No events yet.</span>
        </div>
        <div v-else class="tl-outer">
            <div class="tl-track">
                <div
                    v-for="ev in timelineEvents"
                    :key="ev.id"
                    class="tl-event"
                    @click="openEntry(ev)"
                >
                    <div class="tl-spine">
                        <div
                            class="tl-node"
                            :style="{ background: sigNodeColor((ev.attributes as any)?.significance), boxShadow: `0 0 0 3px ${sigNodeColor((ev.attributes as any)?.significance)}22` }"
                        />
                        <div class="tl-line" />
                    </div>
                    <div class="tl-card">
                        <div class="tl-card-top">
                            <span class="tl-card-name">{{ ev.name }}</span>
                            <span
                                v-if="(ev.attributes as any)?.significance"
                                class="tl-card-sig"
                                :style="{ color: sigNodeColor((ev.attributes as any)?.significance), borderColor: sigNodeColor((ev.attributes as any)?.significance) + '55' }"
                            >{{ (ev.attributes as any).significance }}</span>
                        </div>
                        <div class="tl-card-meta">
                            <span class="tl-card-date">{{ (ev.attributes as any)?.date || '— undated —' }}</span>
                            <template v-if="(ev.attributes as any)?.location">
                                <span class="tl-sep">·</span>
                                <span class="tl-card-loc">{{ (ev.attributes as any).location }}</span>
                            </template>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useEntities } from '~/composables/useEntities'

const route = useRoute()
const router = useRouter()
const store = useEntities()

const campaignId = computed(() => Number(route.params.id))

const timelineEvents = computed(() => {
    const events = store.byType.event ?? []
    return [...events].sort((a, b) => {
        const da = (a.attributes as any)?.date ?? ''
        const db = (b.attributes as any)?.date ?? ''
        if (!da && !db) return a.id - b.id
        if (!da) return 1; if (!db) return -1
        return da.localeCompare(db)
    })
})

function sigNodeColor(sig: string | undefined): string {
    return ({ critical: 'var(--danger)', major: '#ebbd34', minor: 'var(--text3)' } as any)[sig ?? ''] ?? 'var(--text3)'
}

function openEntry(ev: any) {
    router.push(`/campaign/${campaignId.value}/events/${ev.id}`)
}

onMounted(async () => {
    await store.loadAll(campaignId.value)
})
</script>

<style scoped>
.sv-timeline {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    min-height: 0;
}

.sv-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    color: var(--text3);
    font-size: 13px;
    font-style: italic;
}

.tl-outer {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 20px 24px 40px;
}

.tl-track {
    display: flex;
    flex-direction: column;
    max-width: 580px;
}

.tl-event {
    display: flex;
    gap: 14px;
    cursor: pointer;
}

.tl-spine {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 14px;
    padding-top: 3px;
}

.tl-node {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--bg);
    flex-shrink: 0;
    transition: transform 0.15s;
    z-index: 1;
}
.tl-event:hover .tl-node { transform: scale(1.3); }

.tl-line {
    flex: 1;
    width: 1px;
    background: var(--border-hi);
    margin-top: 4px;
    min-height: 12px;
}
.tl-event:last-child .tl-line { display: none; }

.tl-card {
    flex: 1;
    padding: 0 0 20px;
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.tl-card-top {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
}

.tl-card-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--text);
    line-height: 1.3;
    transition: color 0.12s;
}
.tl-event:hover .tl-card-name { color: var(--accent-l); }

.tl-card-sig {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    border: 1px solid;
    border-radius: var(--r4);
    padding: 1px 7px;
    flex-shrink: 0;
}

.tl-card-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
}

.tl-card-date {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.06em;
    color: var(--text3);
}

.tl-sep { font-size: 10px; color: var(--text3); }

.tl-card-loc {
    font-size: 11px;
    color: var(--text3);
    font-style: italic;
}
</style>

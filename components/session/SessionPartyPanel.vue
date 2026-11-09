<template>
    <div class="spp" :class="`spp--${corner}`">
        <div class="spp-head">
            <OhVueIcon name="gi-meeple-group" scale="0.75" />
            <span class="spp-title">Party</span>
            <span class="spp-spacer" />
            <button class="spp-icon" title="Move to another corner" @click="nextCorner"><OhVueIcon name="md-openinfull" scale="0.65" /></button>
            <button class="spp-icon" :title="collapsed ? 'Expand' : 'Collapse'" @click="collapsed = !collapsed">
                <OhVueIcon :name="collapsed ? 'md-arrowdropdown' : 'md-close'" scale="0.7" />
            </button>
        </div>
        <template v-if="!collapsed">
            <p v-if="!pcs.length" class="spp-empty">
                No player characters yet. Add them on the <NuxtLink :to="`/campaign/${campaignId}/party`">Party</NuxtLink> page.
            </p>
            <table v-else class="spp-table">
                <thead>
                    <tr>
                        <th class="spp-name-h">Character</th>
                        <th title="Perception">Per</th>
                        <th title="Fortitude">Fort</th>
                        <th title="Reflex">Ref</th>
                        <th title="Will">Will</th>
                        <th title="Hero points">HP★</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="c in pcs" :key="c.id">
                        <td class="spp-name">
                            <NuxtLink v-if="c.npcEntityId" :to="`/campaign/${campaignId}/npcs/${c.npcEntityId}`">{{ c.name }}</NuxtLink>
                            <span v-else>{{ c.name }}</span>
                            <span class="spp-level">{{ c.level }}</span>
                        </td>
                        <td>{{ mod(def(c)?.perception) }}</td>
                        <td>{{ mod(def(c)?.fort) }}</td>
                        <td>{{ mod(def(c)?.ref) }}</td>
                        <td>{{ mod(def(c)?.will) }}</td>
                        <td class="spp-hero">
                            <span>{{ hero(c) ?? '–' }}</span>
                            <button
                                v-if="c.pbPlayerId"
                                class="spp-plus"
                                :disabled="sent.has(c.id)"
                                :title="sent.has(c.id) ? 'Offered' : 'Offer a hero point (the player accepts it in Play Buddy)'"
                                @click="offer(c)"
                            >+1</button>
                        </td>
                    </tr>
                </tbody>
            </table>
            <p v-if="pcs.length && !pcs.some(c => def(c))" class="spp-hint">
                Perception, saves and hero points come from players on Play Buddy who share them.
            </p>
        </template>
    </div>
</template>

<script setup lang="ts">
import { useParty, type Character } from '~/composables/useParty'
import { usePlayBuddy } from '~/composables/usePlayBuddy'
import { lsKey } from '~/utils/appNamespace'

const props = defineProps<{ campaignId: number }>()

const party = useParty()
const playBuddy = usePlayBuddy()

const CORNERS = ['br', 'bl', 'tl', 'tr'] as const
type Corner = typeof CORNERS[number]
const KEY = lsKey('session.partyPanel')

function readPrefs(): { corner: Corner; collapsed: boolean } {
    try {
        const v = JSON.parse(localStorage.getItem(KEY) ?? '{}')
        return { corner: CORNERS.includes(v.corner) ? v.corner : 'br', collapsed: !!v.collapsed }
    } catch { return { corner: 'br', collapsed: false } }
}
const prefs = readPrefs()
const corner = ref<Corner>(prefs.corner)
const collapsed = ref(prefs.collapsed)
watch([corner, collapsed], () => {
    try { localStorage.setItem(KEY, JSON.stringify({ corner: corner.value, collapsed: collapsed.value })) } catch { /* private mode */ }
})
function nextCorner() { corner.value = CORNERS[(CORNERS.indexOf(corner.value) + 1) % CORNERS.length] }

const pcs = computed(() => party.characters.value.filter(c => c.campaignId === props.campaignId && c.role === 'pc'))
const def = (c: Character) => c.pbStatus?.defenses ?? null
const hero = (c: Character) => c.pbStatus?.basic?.heroPoints ?? null
const mod = (n: number | undefined) => (n == null ? '–' : n >= 0 ? `+${n}` : String(n))

const sent = ref(new Set<number>())
async function offer(c: Character) {
    sent.value = new Set([...sent.value, c.id])
    await playBuddy.offerHeroPoint(props.campaignId, c, 1, 'Session')
}

onMounted(() => party.load(props.campaignId))
</script>

<style scoped>
.spp {
    position: absolute; z-index: 15; width: 340px; max-width: calc(100% - 24px);
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: var(--r2);
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.35); font-size: 12.5px;
}
.spp--br { right: 12px; bottom: 12px; }
.spp--bl { left: 12px; bottom: 12px; }
.spp--tl { left: 12px; top: 12px; }
.spp--tr { right: 12px; top: 12px; }
.spp-head { display: flex; align-items: center; gap: 6px; padding: 6px 8px 6px 10px; color: var(--text2); }
.spp-title { font-family: var(--fh); font-size: 13px; color: var(--text); }
.spp-spacer { flex: 1; }
.spp-icon { display: flex; background: none; border: none; color: var(--text3); cursor: pointer; padding: 2px; border-radius: 4px; }
.spp-icon:hover { color: var(--text); background: var(--bg2); }
.spp-empty, .spp-hint { margin: 0; padding: 4px 10px 10px; color: var(--text3); font-size: 11.5px; line-height: 1.45; }
.spp-table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
.spp-table th { font-size: 9.5px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--text3); text-align: center; padding: 2px 4px; }
.spp-table td { text-align: center; padding: 4px; border-top: 1px solid var(--border); font-variant-numeric: tabular-nums; color: var(--text2); }
.spp-name-h { text-align: left !important; padding-left: 10px !important; }
.spp-table td.spp-name { text-align: left; padding-left: 10px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 130px; }
.spp-name a { color: var(--text); text-decoration: none; }
.spp-name a:hover { color: var(--accent-l); }
.spp-level { margin-left: 5px; font-size: 10px; color: var(--text3); }
.spp-hero { white-space: nowrap; }
.spp-plus { margin-left: 4px; font-size: 10.5px; padding: 0 5px; border-radius: 4px; background: var(--accent-bg); border: 1px solid var(--accent); color: var(--accent-l); cursor: pointer; }
.spp-plus:disabled { opacity: 0.4; cursor: default; }
</style>

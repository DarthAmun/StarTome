<template>
    <div class="scb" :style="{ '--log': LOG_TYPE_COLORS[logType] }">
        <div class="scb-target" :title="target ? 'New logs attach to this panel. Click another panel to change it.' : 'Not attached: logged as improvised play'">
            <template v-if="target">
                <span class="scb-arrow">↳</span>
                <span class="scb-target-kind" :style="{ color: PANEL_KINDS[target.kind].color }">{{ PANEL_KINDS[target.kind].label }}</span>
                <span class="scb-target-name">{{ target.title || 'untitled' }}</span>
                <button class="scb-x" title="Log without attaching (improvised)" @click="$emit('clear-target')">×</button>
            </template>
            <span v-else class="scb-target-none">improvised</span>
        </div>

        <div class="scb-input-wrap">
            <input
                ref="inputRef"
                v-model="text"
                class="scb-input"
                placeholder="What happened? Enter to log · @ or {{ to link"
                @input="onInput"
                @keydown="onKeydown"
                @blur="closeSoon"
            />
            <div v-if="ac.show" class="scb-ac">
                <button
                    v-for="(item, i) in ac.items"
                    :key="`${item.type}:${item.name}`"
                    class="scb-ac-item"
                    :class="{ active: i === ac.cursor }"
                    @mousedown.prevent="apply(item)"
                >
                    <span class="scb-ac-dot" :style="{ background: typeColorMap[item.type] ?? '#888' }" />
                    <span class="scb-ac-name">{{ item.name }}</span>
                    <span class="scb-ac-type">{{ item.type }}</span>
                </button>
            </div>
        </div>

        <div class="scb-types">
            <button
                v-for="t in LOG_TYPES"
                :key="t"
                :class="{ on: logType === t }"
                :style="logType === t ? { color: LOG_TYPE_COLORS[t], borderColor: LOG_TYPE_COLORS[t] } : {}"
                :title="LOG_TYPE_HINTS[t]"
                @click="logType = t"
            >{{ t }}</button>
        </div>
        <button
            class="scb-know"
            :class="{ on: shouldKnow }"
            title="Players should know: comes up in the next session's recap"
            @click="shouldKnow = !shouldKnow"
        >
            <OhVueIcon name="fa-eye" scale="0.7" />
        </button>
        <button class="scb-send" :disabled="!text.trim()" @click="submit">Log</button>
    </div>
</template>

<script setup lang="ts">
import type { Ref } from 'vue'
import { PANEL_KINDS, LOG_TYPES, LOG_TYPE_COLORS, type LogType } from '~/utils/sessionBoard'
import { useLinkAutocomplete, type LinkCandidate } from '~/composables/useLinkAutocomplete'
import { typeColorMap } from '~/composables/useEntityRendering'
import type { SessionPanel } from '~/composables/useSessionBoard'
import type { GameId } from '~/types/game'

const props = defineProps<{
    target: SessionPanel | null
    campaignId: number
    encounters: { id: number; name: string }[]
    gameId: GameId
}>()
const emit = defineEmits<{
    submit: [entry: { text: string; logType: LogType; playersShouldKnow: boolean }]
    'clear-target': []
}>()

const LOG_TYPE_HINTS: Record<LogType, string> = {
    happened: 'Went as planned',
    changed: 'Went differently than planned',
    improvised: 'Nothing was planned for this',
    consequence: 'Will matter later',
}

const text = ref('')
const logType = ref<LogType>('happened')
const shouldKnow = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

// Nothing planned to attach to: it's improvised unless picked otherwise
watch(() => props.target, (t) => {
    if (!t && logType.value === 'happened') logType.value = 'improvised'
    else if (t && logType.value === 'improvised') logType.value = 'happened'
}, { immediate: true })

// ── Autocomplete ({{type: …}} and @mentions) ───────────────────────────
const encountersRef = computed(() => props.encounters) as unknown as Ref<{ id: number; name: string }[]>
const gameRef = computed(() => props.gameId) as unknown as Ref<GameId>
const { linkCandidates, mentionCandidates } = useLinkAutocomplete(() => props.campaignId, encountersRef, gameRef)
const ac = ref<{ show: boolean; items: LinkCandidate[]; start: number; cursor: number }>({ show: false, items: [], start: 0, cursor: 0 })

async function onInput() {
    const el = inputRef.value
    if (!el) return
    const before = text.value.slice(0, el.selectionStart ?? text.value.length)
    const found = (await linkCandidates(before)) ?? mentionCandidates(before)
    ac.value = found && found.items.length ? { show: true, items: found.items, start: found.triggerStart, cursor: 0 } : { ...ac.value, show: false }
}

function apply(item: LinkCandidate) {
    const el = inputRef.value
    const pos = el?.selectionStart ?? text.value.length
    const before = text.value.slice(0, ac.value.start)
    const after = text.value.slice(pos)
    const link = `{{${item.type}: ${item.name}}}`
    text.value = `${before}${link}${after.startsWith(' ') ? '' : ' '}${after}`
    ac.value.show = false
    nextTick(() => {
        const p = before.length + link.length + 1
        el?.setSelectionRange(p, p)
        el?.focus()
    })
}

function onKeydown(e: KeyboardEvent) {
    if (ac.value.show && ac.value.items.length) {
        if (e.key === 'ArrowDown' || e.key === 'Tab') { e.preventDefault(); ac.value.cursor = (ac.value.cursor + 1) % ac.value.items.length; return }
        if (e.key === 'ArrowUp') { e.preventDefault(); ac.value.cursor = (ac.value.cursor - 1 + ac.value.items.length) % ac.value.items.length; return }
        if (e.key === 'Enter') { e.preventDefault(); apply(ac.value.items[ac.value.cursor]); return }
        if (e.key === 'Escape') { e.preventDefault(); ac.value.show = false; return }
    }
    if (e.key === 'Enter') { e.preventDefault(); submit() }
}

function closeSoon() { setTimeout(() => { ac.value.show = false }, 150) }

function submit() {
    const t = text.value.trim()
    if (!t) return
    emit('submit', { text: t, logType: logType.value, playersShouldKnow: shouldKnow.value })
    text.value = ''
    shouldKnow.value = false
    ac.value.show = false
    inputRef.value?.focus()
}

defineExpose({ focus: () => inputRef.value?.focus() })
</script>

<style scoped>
.scb {
    --log: #7cc44e;
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
    padding: 8px 12px; border-top: 1px solid var(--border); background: var(--bg2); flex-shrink: 0;
}
.scb-target { display: flex; align-items: center; gap: 5px; font-size: 12px; max-width: 260px; min-width: 0; }
.scb-arrow { color: var(--text3); }
.scb-target-kind { font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; flex-shrink: 0; }
.scb-target-name { color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.scb-target-none { font-size: 11px; color: var(--text3); font-style: italic; }
.scb-x { background: none; border: none; color: var(--text3); cursor: pointer; font-size: 14px; padding: 0 3px; line-height: 1; }
.scb-x:hover { color: var(--text); }

.scb-input-wrap { flex: 1; min-width: 220px; position: relative; }
.scb-input {
    width: 100%; box-sizing: border-box; padding: 7px 10px; font-size: 13.5px;
    background: var(--surface); color: var(--text); outline: none;
    border: 1px solid var(--border); border-left: 3px solid var(--log); border-radius: var(--r1);
}
.scb-input:focus { border-color: var(--log); }
.scb-ac {
    position: absolute; bottom: calc(100% + 4px); left: 0; min-width: 260px; z-index: 30;
    background: var(--surface-hi); border: 1px solid var(--border-hi); border-radius: var(--r1);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35); padding: 3px; display: flex; flex-direction: column;
}
.scb-ac-item { display: flex; align-items: center; gap: 8px; padding: 5px 8px; border-radius: 4px; background: none; border: none; color: var(--text); font-size: 13px; cursor: pointer; text-align: left; }
.scb-ac-item.active, .scb-ac-item:hover { background: var(--accent-bg); }
.scb-ac-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.scb-ac-name { flex: 1; }
.scb-ac-type { font-size: 10.5px; color: var(--text3); }

.scb-types { display: flex; gap: 3px; }
.scb-types button {
    font-size: 11px; padding: 3px 8px; border-radius: 99px; cursor: pointer;
    background: none; border: 1px solid var(--border); color: var(--text3);
}
.scb-types button.on { background: color-mix(in oklch, currentColor 12%, transparent); }
.scb-know {
    display: flex; align-items: center; justify-content: center; width: 30px; height: 28px; border-radius: var(--r1);
    background: none; border: 1px solid var(--border); color: var(--text3); cursor: pointer;
}
.scb-know.on { color: var(--accent-l); border-color: var(--accent); background: var(--accent-bg); }
.scb-send {
    padding: 6px 14px; border-radius: var(--r1); font-size: 12.5px; font-weight: 600; cursor: pointer;
    background: var(--log); color: #10140c; border: none;
}
.scb-send:disabled { opacity: 0.4; cursor: default; }
</style>

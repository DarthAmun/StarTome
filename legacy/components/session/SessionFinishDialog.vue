<template>
    <AppDialog class="sfd" title="Finish session" @close="$emit('close')">
                <div class="pv-dialog-content">
                    <p v-if="!rows.length" class="sfd-dim">Everything you planned came up. Nothing to carry over.</p>
                    <template v-else>
                        <p class="sfd-dim">
                            Prep that didn't come up. <b>Next</b> puts it on {{ nextLabel }},
                            <b>Drawer</b> keeps it for any later session, <b>Leave</b> keeps it here{{ hasScenes ? ' (scenes are marked skipped)' : '' }}.
                        </p>
                        <div v-for="(r, i) in rows" :key="r.panel.id" class="sfd-row">
                            <span class="sfd-kind" :style="{ color: PANEL_KINDS[r.panel.kind].color }">{{ PANEL_KINDS[r.panel.kind].label }}</span>
                            <div class="sfd-body">
                                <div class="sfd-title">{{ r.panel.title || 'Untitled' }}</div>
                                <div class="sfd-reason">{{ r.reason }}{{ r.copy && choices[i] === 'next' ? ' · a copy goes on, this one stays' : '' }}</div>
                            </div>
                            <div class="sfd-seg">
                                <button
                                    v-for="c in r.choices"
                                    :key="c"
                                    :class="{ on: choices[i] === c }"
                                    @click="choices[i] = c"
                                >{{ LABELS[c] }}</button>
                            </div>
                        </div>
                    </template>
                </div>
                <div class="pv-dialog-footer sfd-footer">
                    <button class="sfd-btn" @click="$emit('close')">Not now</button>
                    <button class="sfd-btn sfd-btn--primary" :disabled="busy" @click="confirm">
                        {{ rows.length ? 'Finish and carry over' : 'Finish' }}
                    </button>
                </div>
        </AppDialog>
</template>

<script setup lang="ts">
import { PANEL_KINDS, type FinishChoice, type FinishRow } from '~/utils/sessionBoard'
import type { SessionPanel } from '~/composables/useSessionBoard'

const props = defineProps<{ rows: FinishRow<SessionPanel>[]; nextLabel: string }>()
const emit = defineEmits<{ close: []; confirm: [choices: FinishChoice[]] }>()

const LABELS: Record<FinishChoice, string> = { next: 'Next', drawer: 'Drawer', leave: 'Leave' }
const choices = ref<FinishChoice[]>(props.rows.map(r => r.choice))
const hasScenes = computed(() => props.rows.some(r => r.panel.kind === 'scene'))
const busy = ref(false)

function confirm() {
    busy.value = true
    emit('confirm', [...choices.value])
}
</script>

<style scoped>
.sfd { width: 640px; max-width: 94vw; }
.sfd-dim { font-size: 12.5px; color: var(--text3); margin: 0 0 10px; line-height: 1.5; }
.sfd-dim b { color: var(--text2); }
.sfd-row { display: flex; align-items: center; gap: 10px; padding: 7px 0; border-bottom: 1px solid var(--border); }
.sfd-kind { width: 78px; flex-shrink: 0; font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; }
.sfd-body { flex: 1; min-width: 0; }
.sfd-title { font-size: 13.5px; color: var(--text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sfd-reason { font-size: 11px; color: var(--text3); }
.sfd-seg { display: flex; border: 1px solid var(--border); border-radius: var(--r1); overflow: hidden; flex-shrink: 0; }
.sfd-seg button { font-size: 11.5px; padding: 4px 10px; background: none; border: none; border-right: 1px solid var(--border); color: var(--text3); cursor: pointer; }
.sfd-seg button:last-child { border-right: none; }
.sfd-seg button.on { background: var(--accent-bg); color: var(--accent-l); }
.sfd-footer { display: flex; justify-content: flex-end; gap: 8px; }
.sfd-btn { padding: 6px 14px; border-radius: var(--r1); font-size: 12.5px; cursor: pointer; background: var(--surface); border: 1px solid var(--border); color: var(--text); }
.sfd-btn:disabled { opacity: 0.5; }
.sfd-btn--primary { background: var(--accent); border-color: var(--accent); color: #fff; }
</style>

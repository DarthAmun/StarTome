<template>
    <AppDialog v-if="open" class="cm-dialog" title="Connection" @close="$emit('close')">
                <div class="pv-dialog-content">
                    <div class="cm-endpoints">
                        <span class="cm-endpoint">{{ sourceName }}</span>
                        <span class="cm-arrow">→</span>
                        <span class="cm-endpoint">{{ targetName }}</span>
                    </div>

                    <div class="dlg-field">
                        <label class="f-label">Label</label>
                        <input v-model="draft.label" class="f-input-box" placeholder="optional label…" />
                    </div>

                    <div class="dlg-field">
                        <label class="f-label">Direction</label>
                        <select v-model="draft.direction" class="f-input-box">
                            <option value="one-way">One-way →</option>
                            <option value="two-way">Bidirectional ↔</option>
                            <option value="none">Undirected —</option>
                        </select>
                    </div>

                    <div class="dlg-field">
                        <label class="f-label">Edge style</label>
                        <select v-model="draft.edgeType" class="f-input-box">
                            <option value="smoothstep">Smooth step</option>
                            <option value="default">Bezier</option>
                            <option value="straight">Straight</option>
                            <option value="step">Step</option>
                        </select>
                    </div>

                    <div class="dlg-field">
                        <label class="f-label">Color</label>
                        <div class="cm-colors">
                            <button
                                v-for="c in COLOR_PRESETS"
                                :key="c ?? 'default'"
                                class="cm-color-btn"
                                :class="{ active: draft.color === c }"
                                :style="{ background: c ?? 'var(--border-hi)', borderColor: draft.color === c ? (c ?? 'var(--accent)') : 'transparent' }"
                                @click="draft.color = c"
                            />
                        </div>
                    </div>
                </div>
                <div class="pv-dialog-footer">
                    <button
                        v-if="connection"
                        class="ghost-btn cm-delete-btn"
                        @click="onDelete"
                    >Delete</button>
                    <span class="cm-spacer" />
                    <button class="ghost-btn" @click="$emit('close')">Cancel</button>
                    <button class="seal-btn" @click="onSave">Save</button>
                </div>
        </AppDialog>
</template>

<script setup lang="ts">
import type { DbEntityConnection } from '~/composables/useDb'

const props = defineProps<{
    open: boolean
    connection: DbEntityConnection | null
    sourceName: string
    targetName: string
}>()

const emit = defineEmits<{
    close: []
    saved: [connection: DbEntityConnection]
    deleted: [id: number]
}>()

const COLOR_PRESETS: (string | null)[] = [
    null,
    '#e05555',
    '#e8924a',
    '#ebbd34',
    '#7cc44e',
    '#4ab8e8',
    '#b87de8',
]

const draft = ref({
    label: '',
    direction: 'one-way' as 'one-way' | 'two-way' | 'none',
    color: null as string | null,
    edgeType: 'smoothstep' as 'default' | 'straight' | 'step' | 'smoothstep',
})

watch(() => props.connection, (conn) => {
    if (conn) {
        draft.value = {
            label: conn.label,
            direction: conn.direction,
            color: conn.color,
            edgeType: conn.edgeType ?? 'smoothstep',
        }
    } else {
        draft.value = { label: '', direction: 'one-way', color: null, edgeType: 'smoothstep' }
    }
}, { immediate: true })

function onSave() {
    if (!props.connection) return
    emit('saved', {
        ...props.connection,
        label: draft.value.label,
        direction: draft.value.direction,
        color: draft.value.color,
        edgeType: draft.value.edgeType,
    })
}

function onDelete() {
    if (!props.connection?.id) return
    emit('deleted', props.connection.id)
}
</script>

<style scoped>
.cm-dialog { width: 360px; }

.cm-endpoints {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
    font-size: 13px;
}
.cm-endpoint {
    font-weight: 600;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 130px;
}
.cm-arrow { color: var(--text3); flex-shrink: 0; }

.cm-colors {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
}
.cm-color-btn {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: border-color 0.12s, transform 0.1s;
}
.cm-color-btn:hover { transform: scale(1.15); }
.cm-color-btn.active { border-color: var(--accent); transform: scale(1.15); }

.cm-delete-btn { color: var(--danger) !important; }
.cm-spacer { flex: 1; }
</style>

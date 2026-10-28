<template>
  <div class="rte-root">
    <EditorHeader v-if="entity" :entity="entity" @delete="onDelete" @rename="onRename">
      <template #actions>
        <button class="hdr-btn" :class="{ active: showAttributes }" @click="showAttributes = !showAttributes">
          <OhVueIcon name="md-editnote" scale="0.8" />
          <span>Table</span>
        </button>
      </template>
    </EditorHeader>

    <div v-if="showAttributes && entity" class="rte-attrs">
      <!-- Die selector -->
      <div class="rte-die-row">
        <span class="rte-label">Die</span>
        <div class="rte-die-btns">
          <button
            v-for="d in DICE"
            :key="d"
            :class="['rte-die-btn', { active: attrs.die === d }]"
            @click="setDie(d)"
          >{{ d }}</button>
        </div>
        <button class="rte-roll-btn" :disabled="!canRoll" @click="roll">
          🎲 Roll
        </button>
        <span v-if="rollResult !== null" class="rte-roll-result" v-html="renderedRollResult" @click="onResultClick" />
      </div>

      <!-- Rows grid -->
      <div class="rte-rows">
        <div class="rte-rows-head">
          <span class="rte-col-label rte-col-min">Min</span>
          <span class="rte-col-label rte-col-max">Max</span>
          <span class="rte-col-label rte-col-result">Result</span>
          <span class="rte-col-del" />
        </div>
        <div v-for="(row, i) in rows" :key="i" class="rte-row">
          <input class="rte-num-input" type="number" v-model.number="row.min" min="1" :max="dieMax" @change="saveRows" />
          <input class="rte-num-input" type="number" v-model.number="row.max" min="1" :max="dieMax" @change="saveRows" />
          <div class="rte-result-wrap">
            <input
              :ref="(el) => setInputRef(el as HTMLInputElement | null, i)"
              class="rte-result-input"
              type="text"
              v-model="row.result"
              placeholder="Result…"
              @input="(e) => { saveRows(); checkAc(e as InputEvent, i) }"
              @keydown="(e) => onResultKeydown(e as KeyboardEvent, i)"
              @blur="hideAc"
            />
            <div v-if="ac.show && ac.rowIdx === i" class="rte-ac-dropdown">
              <button
                v-for="(item, idx) in ac.items"
                :key="`${item.type}:${item.name}`"
                class="rte-ac-item"
                :class="{ 'rte-ac-item--active': ac.cursorIdx === idx }"
                @mousedown.prevent="applyAc(i)"
              >
                <span class="rte-ac-dot" :style="{ background: typeColorMap[item.type] ?? '#888' }" />
                <span class="rte-ac-name">{{ item.name }}</span>
                <span class="rte-ac-type">{{ item.type }}</span>
              </button>
              <p v-if="!ac.items.length" class="rte-ac-empty">No matches</p>
            </div>
          </div>
          <button class="rte-del-btn" @click="removeRow(i)">✕</button>
        </div>
        <button class="rte-add-row-btn" @click="addRow">+ Add row</button>
      </div>
    </div>

    <MarkdownEditor
      v-if="entity"
      :entity-id="props.entityId"
      :campaign-id="props.campaignId"
      :content="draftContent"
      show-tab-bar
      @update:content="onContentUpdate"
      @navigate="(t, n) => $emit('navigate', t, n)"
    >
      <template #below-content>
        <LinkBar
          :entity-id="props.entityId"
          :campaign-id="props.campaignId"
          entity-type="random-table"
          @navigate="(t, n) => $emit('navigate', t, n)"
        />
      </template>
    </MarkdownEditor>
  </div>
</template>

<script setup lang="ts">
import { rulesRefRoute } from '~/composables/useRules'
import { useEntities } from '~/composables/useEntities'
import type { RandomTableAttributes, RandomTableRow } from '~/types/entities'
import { useEntityMarkdown } from '~/composables/useEntityMarkdown'
import { useEntityRendering, typeColorMap } from '~/composables/useEntityRendering'

const props = defineProps<{ entityId: number; campaignId: number }>()
const emit = defineEmits<{ navigate: [type: string, name: string]; deleted: [] }>()

const store = useEntities()
const { renderInline } = useEntityMarkdown()
const { entityLookup, extraTypes, campaignSystemId, systemEntityTypes, campaignGameId } = useEntityRendering(() => props.campaignId)
const router = useRouter()
const entity = computed(() => store.entities.find(e => e.id === props.entityId) ?? store.currentEntity)

const inputRefs: (HTMLInputElement | null)[] = []
function setInputRef(el: HTMLInputElement | null, i: number) { inputRefs[i] = el }

const ac = ref({ show: false, items: [] as { type: string; name: string }[], triggerStart: 0, cursorIdx: 0, rowIdx: -1 })

function checkAc(e: InputEvent, rowIdx: number) {
  const el = e.target as HTMLInputElement
  const pos = el.selectionStart ?? 0
  const match = el.value.slice(0, pos).match(/\{\{([\w-]*):\s*([^}@]*)$/)
  if (!match) { ac.value.show = false; return }
  const partialType = match[1].toLowerCase()
  const partialName = match[2]
  const candidates = store.entities
    .filter(ent =>
      ent.campaignId === props.campaignId &&
      (!partialType || ent.type.startsWith(partialType)) &&
      (!partialName || ent.name.toLowerCase().includes(partialName.toLowerCase()))
    )
    .map(ent => ({ type: ent.type, name: ent.name }))
    .slice(0, 8)
  ac.value = { show: candidates.length > 0, items: candidates, triggerStart: pos - match[0].length, cursorIdx: 0, rowIdx }
}

function applyAc(rowIdx: number) {
  const item = ac.value.items[ac.value.cursorIdx]
  const el = inputRefs[rowIdx]
  const row = rows.value[rowIdx]
  if (!item || !el || !row) return
  const pos = el.selectionStart ?? 0
  const triggerStart = ac.value.triggerStart
  const replacement = `{{${item.type}: ${item.name}}}`
  row.result = `${row.result.slice(0, triggerStart)}${replacement}${row.result.slice(pos)}`
  ac.value.show = false
  saveRows()
  nextTick(() => { el.setSelectionRange(triggerStart + replacement.length, triggerStart + replacement.length); el.focus() })
}

function onResultKeydown(e: KeyboardEvent, rowIdx: number) {
  if (!ac.value.show || ac.value.rowIdx !== rowIdx) return
  const items = ac.value.items
  if (e.key === 'Escape') { e.preventDefault(); ac.value.show = false; return }
  if (!items.length) return
  if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) { e.preventDefault(); ac.value.cursorIdx = (ac.value.cursorIdx + 1) % items.length }
  else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) { e.preventDefault(); ac.value.cursorIdx = (ac.value.cursorIdx - 1 + items.length) % items.length }
  else if (e.key === 'Enter') { e.preventDefault(); applyAc(rowIdx) }
}

function hideAc() { setTimeout(() => { ac.value.show = false; ac.value.rowIdx = -1 }, 150) }

async function onResultClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest('[data-entity-type]') as HTMLElement | null
  if (!el) return
  const type = el.dataset.entityType!
  const name = el.dataset.entityName!
  const rulesRoute = await rulesRefRoute(type, name, campaignGameId.value)
  if (rulesRoute) { router.push(rulesRoute); return }
  const sysType = systemEntityTypes.value.find(t => t.id.toLowerCase() === type.toLowerCase())
  if (sysType && campaignSystemId.value) {
    router.push(`/system/${campaignSystemId.value}/${sysType.id}?open=${encodeURIComponent(name)}`)
  } else {
    emit('navigate', type, name)
  }
}
const attrs = computed(() => (entity.value?.attributes ?? {}) as RandomTableAttributes)

const DICE = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'] as const
const dieMax = computed(() => {
  const m = attrs.value.die?.replace('d', '')
  return m ? parseInt(m) : 20
})

const showAttributes = ref(true)
const draftContent = ref('')
const rows = ref<RandomTableRow[]>([])
const rollResult = ref<string | null>(null)
const renderedRollResult = computed(() =>
  rollResult.value ? renderInline(`→ ${rollResult.value}`, { entityLookup, extraTypes: extraTypes.value }) : ''
)

watch(() => props.entityId, async (id) => {
  await store.loadEntity(id)
  draftContent.value = entity.value?.content ?? ''
  rows.value = (attrs.value.rows ?? []).map(r => ({ ...r }))
}, { immediate: true })

watch(() => attrs.value.rows, (r) => {
  rows.value = (r ?? []).map(row => ({ ...row }))
}, { deep: true })

const canRoll = computed(() => rows.value.length > 0)

function roll() {
  const max = dieMax.value
  const n = Math.floor(Math.random() * max) + 1
  const matched = rows.value.find(r => n >= r.min && n <= r.max)
  rollResult.value = matched ? `${n} — ${matched.result}` : `${n} — (no match)`
}

function setDie(d: string) {
  store.updateEntity(props.entityId, { attributes: { ...attrs.value, die: d as any } })
}

function addRow() {
  const last = rows.value[rows.value.length - 1]
  const min = last ? last.max + 1 : 1
  const max = dieMax.value
  rows.value.push({ min, max, result: '' })
  saveRows()
}

function removeRow(i: number) {
  rows.value.splice(i, 1)
  inputRefs.splice(i, 1)
  saveRows()
}

function saveRows() {
  store.updateEntity(props.entityId, { attributes: { ...attrs.value, rows: rows.value.map(r => ({ ...r })) } })
}

function onContentUpdate(value: string) {
  store.updateEntity(props.entityId, { content: value })
}

async function onRename(name: string) {
  await store.updateEntity(props.entityId, { name })
}

async function onDelete() {
  await store.deleteEntity(props.entityId)
  emit('deleted')
}
</script>

<style scoped>
.rte-root { display: flex; flex-direction: column; flex: 1; min-height: 0; overflow: hidden; }

.rte-attrs {
  flex-shrink: 0;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rte-die-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.rte-label { font-size: 11px; font-weight: 600; color: var(--text3); font-family: var(--fm); text-transform: uppercase; letter-spacing: 0.06em; }
.rte-die-btns { display: flex; gap: 4px; }
.rte-die-btn {
  padding: 3px 8px; border-radius: 5px; font-size: 11px; font-weight: 700;
  border: 1px solid var(--border); background: var(--bg); color: var(--text2);
  cursor: pointer; font-family: var(--fm); transition: all 0.1s;
}
.rte-die-btn:hover { border-color: var(--border-hi); color: var(--text); }
.rte-die-btn.active { background: var(--accent-bg); border-color: var(--accent); color: var(--accent-l); }

.rte-roll-btn {
  padding: 3px 10px; border-radius: 5px; font-size: 12px; font-weight: 600;
  border: 1px solid var(--border); background: var(--bg); color: var(--text2);
  cursor: pointer; transition: all 0.1s;
}
.rte-roll-btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent-l); }
.rte-roll-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.rte-roll-result { font-size: 12px; color: var(--accent-l); font-weight: 600; font-family: var(--fm); }

.rte-rows { display: flex; flex-direction: column; gap: 4px; }
.rte-rows-head { display: grid; grid-template-columns: 56px 56px 1fr 24px; gap: 4px; padding: 0 2px; }
.rte-col-label { font-size: 9px; font-weight: 600; color: var(--text3); text-transform: uppercase; letter-spacing: 0.08em; font-family: var(--fm); }

.rte-row { display: grid; grid-template-columns: 56px 56px 1fr 24px; gap: 4px; align-items: center; }
.rte-num-input {
  width: 100%; padding: 4px 6px; border-radius: 5px;
  background: var(--bg); border: 1px solid var(--border);
  font-size: 12px; color: var(--text); font-family: var(--fm);
  -moz-appearance: textfield;
}
.rte-num-input::-webkit-outer-spin-button, .rte-num-input::-webkit-inner-spin-button { -webkit-appearance: none; }
.rte-num-input:focus { outline: none; border-color: var(--border-hi); }

.rte-result-input {
  width: 100%; padding: 4px 8px; border-radius: 5px;
  background: var(--bg); border: 1px solid var(--border);
  font-size: 12.5px; color: var(--text);
}
.rte-result-input:focus { outline: none; border-color: var(--border-hi); }
.rte-result-input::placeholder { color: var(--text3); }

.rte-del-btn {
  width: 22px; height: 22px; border-radius: 4px; font-size: 10px;
  border: 1px solid transparent; background: none; color: var(--text3);
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: all 0.1s;
}
.rte-del-btn:hover { border-color: var(--danger); color: var(--danger); }

.rte-add-row-btn {
  align-self: flex-start; padding: 4px 10px; border-radius: 5px; font-size: 11px;
  border: 1px dashed var(--border); background: none; color: var(--text3);
  cursor: pointer; transition: all 0.12s; margin-top: 2px;
}
.rte-add-row-btn:hover { border-color: var(--accent); color: var(--accent-l); }

.rte-result-wrap { position: relative; min-width: 0; }

.rte-ac-dropdown {
  position: absolute; top: calc(100% + 2px); left: 0; z-index: 200;
  background: var(--surface-solid); border: 1px solid var(--border-hi);
  border-radius: var(--r2); width: 260px; overflow: hidden; box-shadow: var(--sh-md);
}
.rte-ac-item {
  display: flex; align-items: center; gap: 8px; padding: 6px 10px; width: 100%;
  background: transparent; border: none; cursor: pointer; color: var(--text);
  transition: background 0.1s; text-align: left; font-size: 12px;
}
.rte-ac-item:hover, .rte-ac-item--active { background: var(--surface-hi); }
.rte-ac-item--active { border-left: 2px solid var(--accent); padding-left: 8px; }
.rte-ac-dot { width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; }
.rte-ac-name { flex: 1; }
.rte-ac-type { font-size: 10px; color: var(--text3); font-family: var(--fm); }
.rte-ac-empty { padding: 8px 10px; font-size: 11px; color: var(--text3); font-style: italic; margin: 0; }
.rte-roll-result :deep(.entity-ref) { cursor: pointer; }
</style>

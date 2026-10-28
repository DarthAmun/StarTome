<template>
  <div class="wng-body" v-bind="$attrs">
    <div class="wng-form">
      <div class="wng-row">
        <label class="wng-lbl">Gender</label>
        <select v-model="gender" class="wng-select">
          <option value="male">Male</option>
          <option value="female">Female</option>
          <option value="neutral">Neutral</option>
        </select>
      </div>
      <div class="wng-row">
        <label class="wng-lbl">Race</label>
        <div v-if="config.raceSource" class="wng-linked">
          <span class="wng-linked-label">{{ linkedRaceLabel }}</span>
          <span class="wng-linked-badge">random</span>
        </div>
        <input v-else v-model="race" class="wng-input" placeholder="Human, Elf, Dwarf…" />
      </div>
      <div class="wng-row">
        <label class="wng-lbl">Class</label>
        <div v-if="config.roleSource" class="wng-linked">
          <span class="wng-linked-label">{{ linkedRoleLabel }}</span>
          <span class="wng-linked-badge">random</span>
        </div>
        <input v-else v-model="role" class="wng-input" placeholder="Fighter, Wizard…" />
      </div>
      <button class="wng-btn wng-btn--gen" @click="generate">🎲 Generate</button>
    </div>

    <div v-if="result" class="wng-result">
      <div class="wng-result-name">{{ result.firstName }} {{ result.lastName }}</div>
      <div class="wng-result-sub">
        {{ [cap(result.gender), result.race, result.role].filter(Boolean).join(' · ') }}
      </div>
      <div class="wng-actions">
        <button class="wng-btn" @click="generate">↻ Reroll</button>
        <button class="wng-btn wng-btn--save" :disabled="saved || saving" @click="save">
          {{ saved ? '✓ Saved' : '💾 Save as NPC' }}
        </button>
      </div>
    </div>
  </div>

  <Teleport to="body">
    <div v-if="showConfig" class="wng-backdrop" @click.self="showConfig = false">
      <div class="wng-modal" @click.stop>
        <div class="wng-modal-head">
          <span>NPC Generator Config</span>
          <button class="wng-modal-x" @click="showConfig = false">✕</button>
        </div>
        <div class="wng-modal-body">
          <div class="wng-cfg-row">
            <label class="wng-cfg-lbl">Race source</label>
            <select v-model="config.raceSource" class="wng-select">
              <option :value="null">Free text input</option>
              <option v-for="et in entityTypes" :key="et.id" :value="et.id">
                {{ et.name }}
                <template v-if="recordNamesByType[et.id]?.length"> ({{ recordNamesByType[et.id].length }})</template>
              </option>
            </select>
          </div>
          <div class="wng-cfg-row">
            <label class="wng-cfg-lbl">Class source</label>
            <select v-model="config.roleSource" class="wng-select">
              <option :value="null">Free text input</option>
              <option v-for="et in entityTypes" :key="et.id" :value="et.id">
                {{ et.name }}
                <template v-if="recordNamesByType[et.id]?.length"> ({{ recordNamesByType[et.id].length }})</template>
              </option>
            </select>
          </div>
          <p v-if="systemId && !entityTypes.length" class="wng-cfg-note">
            No entity types found in linked system.
          </p>
          <p v-else-if="!systemId" class="wng-cfg-note">
            No system linked to this campaign. Link one in campaign settings.
          </p>
        </div>
        <div class="wng-modal-foot">
          <button class="wng-btn wng-btn--gen" @click="showConfig = false">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { lsKey } from '~/utils/appNamespace'
import { generateFullName, pick, cap, type NameGender } from '~/composables/useNameGenerator'
import { useEntities } from '~/composables/useEntities'
import { getDb } from '~/composables/useDb'
import type { NpcAttributes, EntityTypeSchema } from '~/types/entities'

defineOptions({ inheritAttrs: false })

const props = defineProps<{ campaignId: number; systemId: number | null }>()
const store = useEntities()

const LS_KEY = lsKey(`dmscreen-npcgen-v1-${props.campaignId}`)

const config = reactive<{ raceSource: string | null; roleSource: string | null }>({
  raceSource: null,
  roleSource: null,
})

onMounted(() => {
  try {
    const saved = localStorage.getItem(LS_KEY)
    if (saved) {
      const parsed = JSON.parse(saved)
      // migrate old "entityTypeId::fieldKey" format → reset to null
      if (typeof parsed.raceSource === 'string' && parsed.raceSource.includes('::')) parsed.raceSource = null
      if (typeof parsed.roleSource === 'string' && parsed.roleSource.includes('::')) parsed.roleSource = null
      Object.assign(config, parsed)
    }
  } catch {}
})

watch(() => props.systemId, (id) => { if (id != null) loadSystemSchema() }, { immediate: true })

watch(config, () => {
  localStorage.setItem(LS_KEY, JSON.stringify({ raceSource: config.raceSource, roleSource: config.roleSource }))
}, { deep: true })

const entityTypes       = ref<EntityTypeSchema[]>([])
const recordNamesByType = ref<Record<string, string[]>>({})

async function loadSystemSchema() {
  if (!props.systemId) return
  const db = getDb()
  const [sys, allRecords] = await Promise.all([
    db.systems.get(props.systemId),
    db.records.where('systemId').equals(props.systemId).toArray(),
  ])
  if (!sys) return

  entityTypes.value = typeof sys.entityTypes === 'string'
    ? JSON.parse(sys.entityTypes || '[]')
    : (sys.entityTypes ?? [])

  const map: Record<string, string[]> = {}
  for (const r of allRecords) {
    if (!map[r.entityTypeId]) map[r.entityTypeId] = []
    map[r.entityTypeId].push(r.name)
  }
  recordNamesByType.value = map
}

function resolveEntityTypeLabel(source: string | null): string {
  if (!source) return ''
  const et    = entityTypes.value.find(e => e.id === source)
  const count = recordNamesByType.value[source]?.length ?? 0
  return et ? `${et.name}${count ? ` · ${count} records` : ''}` : source
}

function pickFromSource(source: string | null): string | null {
  if (!source) return null
  const names = recordNamesByType.value[source]
  if (!names?.length) return null
  return pick(names)
}

const linkedRaceLabel = computed(() => resolveEntityTypeLabel(config.raceSource))
const linkedRoleLabel = computed(() => resolveEntityTypeLabel(config.roleSource))

const gender = ref<NameGender>('male')
const race   = ref('')
const role   = ref('')

interface NpcResult {
  firstName: string
  lastName: string
  gender: NameGender
  race: string
  role: string
}

const result  = ref<NpcResult | null>(null)
const saved   = ref(false)
const saving  = ref(false)

function generate() {
  const resolvedRace = (pickFromSource(config.raceSource) ?? race.value) || 'human'
  const resolvedRole = pickFromSource(config.roleSource) ?? role.value
  const { first, last } = generateFullName(gender.value, resolvedRace)
  result.value = { firstName: first, lastName: last, gender: gender.value, race: resolvedRace, role: resolvedRole }
  saved.value = false
}

async function save() {
  if (!result.value || saving.value) return
  saving.value = true
  try {
    const entity = await store.createEntity(props.campaignId, 'npc', `${result.value.firstName} ${result.value.lastName}`)
    if (entity?.id) {
      await store.updateEntity(entity.id, {
        attributes: {
          race: result.value.race || undefined,
          role: result.value.role || undefined,
          isAlive: true,
        } as NpcAttributes,
      })
    }
    saved.value = true
  } finally {
    saving.value = false
  }
}

// ── Config modal ─────────────────────────────────────────────────────────────
const showConfig = ref(false)
function openConfig() { showConfig.value = true }
defineExpose({ openConfig })
</script>

<style scoped>
.wng-body {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  gap: 10px; padding: 10px 12px; overflow-y: auto;
}

.wng-form { display: flex; flex-direction: column; gap: 6px; }

.wng-row { display: flex; align-items: center; gap: 8px; }

.wng-lbl {
  width: 40px; flex-shrink: 0;
  font-size: 10.5px; font-weight: 600; color: var(--text3);
  font-family: var(--fm); text-transform: uppercase; letter-spacing: 0.05em;
}

.wng-select,
.wng-input {
  flex: 1; min-width: 0;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 8px;
  font-size: 12px; color: var(--text); appearance: none;
}
.wng-select:focus,
.wng-input:focus { outline: none; border-color: var(--border-hi); }
.wng-input::placeholder { color: var(--text3); }

.wng-linked {
  flex: 1; display: flex; align-items: center; gap: 6px;
  background: var(--surface); border: 1px solid var(--border);
  border-radius: 6px; padding: 4px 8px;
}
.wng-linked-label { font-size: 11.5px; color: var(--text2); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.wng-linked-badge {
  font-size: 9.5px; font-family: var(--fm); font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; padding: 1px 6px; border-radius: 99px;
  background: color-mix(in oklch, var(--accent) 12%, transparent);
  border: 1px solid color-mix(in oklch, var(--accent) 35%, transparent);
  color: var(--accent-l); flex-shrink: 0;
}

.wng-btn {
  padding: 5px 14px; border-radius: 7px; font-size: 12px; font-weight: 600;
  border: 1px solid var(--border); background: var(--surface); color: var(--text2);
  cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.wng-btn:hover:not(:disabled) { background: var(--surface-hi); border-color: var(--border-hi); color: var(--text); }
.wng-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.wng-btn--gen {
  margin-top: 2px; width: 100%;
  background: var(--accent-bg); border-color: color-mix(in oklch, var(--accent) 45%, transparent);
  color: var(--accent-l);
}
.wng-btn--gen:hover {
  background: color-mix(in oklch, var(--accent) 15%, transparent);
  border-color: var(--accent);
}

.wng-result {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px; border-radius: 8px;
  background: var(--surface); border: 1px solid var(--border);
  text-align: center;
}
.wng-result-name { font-size: 18px; font-weight: 700; color: var(--text); line-height: 1.2; }
.wng-result-sub  { font-size: 11px; color: var(--text3); font-family: var(--fm); }

.wng-actions { display: flex; gap: 6px; margin-top: 2px; }

.wng-btn--save {
  background: color-mix(in oklch, #5db870 12%, transparent);
  border-color: color-mix(in oklch, #5db870 40%, transparent);
  color: #5db870;
}
.wng-btn--save:hover:not(:disabled) {
  background: color-mix(in oklch, #5db870 22%, transparent);
  border-color: #5db870; color: var(--text);
}

/* ── Config modal ── */
.wng-backdrop {
  position: fixed; inset: 0; z-index: 9000;
  background: rgba(0, 0, 0, 0.55);
  display: flex; align-items: center; justify-content: center;
}

.wng-modal {
  background: var(--bg); border: 1px solid var(--border-hi);
  border-radius: 12px; box-shadow: 0 8px 32px rgba(0,0,0,0.45);
  width: 340px; max-width: calc(100vw - 32px);
  display: flex; flex-direction: column; overflow: hidden;
}

.wng-modal-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid var(--border);
  font-size: 13px; font-weight: 600; color: var(--text);
}

.wng-modal-x {
  width: 24px; height: 24px; border-radius: 5px; border: none;
  background: none; color: var(--text3); cursor: pointer; font-size: 13px;
  display: flex; align-items: center; justify-content: center; transition: all 0.12s;
}
.wng-modal-x:hover { background: var(--surface-hi); color: var(--text); }

.wng-modal-body { display: flex; flex-direction: column; gap: 14px; padding: 16px; }

.wng-cfg-row { display: flex; flex-direction: column; gap: 5px; }

.wng-cfg-lbl {
  font-size: 10.5px; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text3); font-family: var(--fm);
}

.wng-cfg-note {
  font-size: 11.5px; color: var(--text3); margin: 0;
  padding: 8px; background: var(--surface); border-radius: 6px;
  border: 1px solid var(--border);
}

.wng-modal-foot {
  padding: 12px 16px; border-top: 1px solid var(--border);
  display: flex; justify-content: flex-end;
}
</style>

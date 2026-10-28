<template>
  <div class="wrl-body">
    <div class="wrl-top">
      <input
        ref="inputRef"
        v-model="query"
        class="wrl-input"
        :placeholder="source === 'compendium' ? 'Search the compendium…' : 'Search rules…'"
        autocomplete="off"
        spellcheck="false"
      />
    </div>

    <div v-if="systemId" class="wrl-filters">
      <button :class="['wrl-chip', { active: source === 'compendium' }]" @click="source = 'compendium'">Compendium</button>
      <button :class="['wrl-chip', { active: source === 'library' }]" @click="source = 'library'">Rules library (legacy)</button>
    </div>

    <!-- ── Compendium ─────────────────────────────────────────── -->
    <template v-if="source === 'compendium'">
      <div class="wrl-filters">
        <button :class="['wrl-chip', { active: rulesKind === null }]" @click="rulesKind = null">All</button>
        <button
          v-for="k in LOOKUP_KINDS" :key="k"
          :class="['wrl-chip', { active: rulesKind === k }]"
          :style="rulesKind === k ? { '--chip-color': RULES_KIND_CONFIG[k].color } : {}"
          @click="rulesKind = rulesKind === k ? null : k"
        >{{ RULES_KIND_CONFIG[k].plural }}</button>
      </div>
      <div class="wrl-results">
        <div v-if="!query.trim()" class="wrl-empty">Type to search items, creatures, spells, conditions…</div>
        <div v-else-if="!rulesHits.length" class="wrl-empty">No matches.</div>
        <template v-else>
          <div
            v-for="e in rulesHits" :key="e.id"
            :class="['wrl-item', { 'wrl-item--open': expandedRulesId === e.id }]"
          >
            <button class="wrl-item-row wrl-item-toggle" @click="expandedRulesId = expandedRulesId === e.id ? null : e.id">
              <span class="wrl-item-name">{{ e.name }}</span>
              <span class="wrl-item-type" :style="{ color: RULES_KIND_CONFIG[e.kind].color }">
                {{ RULES_KIND_CONFIG[e.kind].label }}{{ RULES_KIND_CONFIG[e.kind].hasLevel ? ` ${e.level}` : '' }}
              </span>
            </button>
            <div v-if="expandedRulesId === e.id" class="wrl-item-detail wrl-statblock">
              <RulesStatBlock :entity="e" :game="game" />
            </div>
          </div>
        </template>
      </div>
    </template>

    <div v-if="source === 'library' && entityTypes.length > 1" class="wrl-filters">
      <button :class="['wrl-chip', { active: activeType === null }]" @click="activeType = null">All</button>
      <button
        v-for="t in entityTypes" :key="t.id"
        :class="['wrl-chip', { active: activeType === t.id }]"
        :style="activeType === t.id ? { '--chip-color': t.color } : {}"
        @click="activeType = activeType === t.id ? null : t.id"
      >{{ t.name }}</button>
    </div>

    <div v-if="source === 'library'" class="wrl-results">
      <div v-if="loading" class="wrl-empty">
        <OhVueIcon name="md-autorenew" scale="1" class="wrl-spin" /> Loading…
      </div>
      <div v-else-if="!systemId" class="wrl-empty">No system linked to this campaign.</div>
      <div v-else-if="allRecords.length === 0" class="wrl-empty">No records in linked system.</div>
      <div v-else-if="filtered.length === 0" class="wrl-empty">No matches.</div>
      <template v-else>
        <button
          v-for="r in filtered" :key="r.id"
          :class="['wrl-item', { 'wrl-item--open': expandedId === r.id }]"
          @click="expandedId = expandedId === r.id ? null : r.id"
        >
          <div class="wrl-item-row">
            <span class="wrl-item-name">{{ r.name }}</span>
            <span class="wrl-item-type" :style="{ color: r.color }">{{ r.typeName }}</span>
          </div>
          <div v-if="expandedId === r.id" class="wrl-item-detail">
            <div v-if="r.fields.length" class="wrl-item-fields">
              <div v-for="f in r.fields" :key="f.label" class="wrl-item-field">
                <span class="wrl-field-label">{{ f.label }}</span>
                <span class="wrl-field-val">{{ f.value }}</span>
              </div>
            </div>
            <p v-if="r.body" class="wrl-item-body">{{ r.body }}</p>
            <em v-if="!r.fields.length && !r.body" class="wrl-empty-inline">No details.</em>
          </div>
        </button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getDb, parseRecordData } from '~/composables/useDb'
import { rulesQuery, rulesSearch } from '~/composables/useRules'
import type { GameId } from '~/types/game'
import { RULES_KIND_CONFIG, type RulesEntity, type RulesKind } from '~/types/rules'

const props = defineProps<{ systemId: number | null; game?: GameId }>()

const query = ref('')
const activeType = ref<string | null>(null)
const expandedId = ref<number | null>(null)
const loading = ref(false)

// ── Compendium search ──────────────────────────────────────────────────────
const LOOKUP_KINDS: RulesKind[] = ['condition', 'action', 'spell', 'item', 'creature', 'hazard', 'feat']
const source = ref<'compendium' | 'library'>('compendium')
const rulesKind = ref<RulesKind | null>(null)
const rulesHits = ref<RulesEntity[]>([])
const expandedRulesId = ref<string | null>(null)
let rulesTimer: ReturnType<typeof setTimeout> | null = null

async function searchCompendium() {
  const q = query.value.trim()
  if (!q) { rulesHits.value = []; return }
  const games = props.game ? [props.game] : undefined
  rulesHits.value = rulesKind.value
    ? (await rulesQuery({ kind: rulesKind.value, text: q, games, limit: 30 })).items
    : await rulesSearch(q, 30, games)
}


const SKIP_KEYS = new Set(['id', 'systemId', 'entityTypeId', 'name', 'createdAt', 'updatedAt'])
const BODY_KEYS = /\b(description|desc|summary|effect|text|body|rules|detail|notes)\b/i

interface RuleRecord {
  id: number
  name: string
  entityTypeId: string
  typeName: string
  color: string
  fields: { label: string; value: string }[]
  body: string
}

interface EntityType { id: string; name: string; color: string }

const allRecords = ref<RuleRecord[]>([])
const entityTypes = ref<EntityType[]>([])

async function load() {
  if (!props.systemId) return
  loading.value = true
  try {
    const db = getDb()
    const sys = await db.systems.get(props.systemId)
    if (!sys) return

    const etList: any[] = typeof sys.entityTypes === 'string'
      ? JSON.parse(sys.entityTypes || '[]')
      : (sys.entityTypes ?? [])

    const typeMap = new Map<string, EntityType>(
      etList.map((et: any) => [et.id as string, { id: et.id, name: et.name, color: et.color || 'var(--accent)' }])
    )

    const recs = await db.records.where('systemId').equals(props.systemId).toArray()

    allRecords.value = recs.map((r: any): RuleRecord => {
      const data: Record<string, any> = parseRecordData(r.data)

      const fields = Object.entries(data)
        .filter(([k, v]) => !SKIP_KEYS.has(k) && !BODY_KEYS.test(k) && v != null && String(v).trim())
        .map(([k, v]) => ({ label: k.replace(/([A-Z])/g, ' $1').trim(), value: String(v) }))
        .slice(0, 8)

      let body = ''
      for (const [k, v] of Object.entries(data)) {
        if (BODY_KEYS.test(k) && typeof v === 'string' && v.trim()) { body = v.trim(); break }
      }

      const et = typeMap.get(r.entityTypeId)
      return {
        id: r.id!,
        name: r.name,
        entityTypeId: r.entityTypeId,
        typeName: et?.name ?? r.entityTypeId,
        color: et?.color ?? 'var(--accent)',
        fields,
        body,
      }
    }).sort((a, b) => a.name.localeCompare(b.name))

    entityTypes.value = etList
      .filter((et: any) => allRecords.value.some(r => r.entityTypeId === et.id))
      .map((et: any) => ({ id: et.id, name: et.name, color: et.color || 'var(--accent)' }))
  } finally {
    loading.value = false
  }
}

const filtered = computed(() => {
  const q = query.value.toLowerCase().trim()
  return allRecords.value.filter(r => {
    if (activeType.value && r.entityTypeId !== activeType.value) return false
    if (q && !r.name.toLowerCase().includes(q)) return false
    return true
  })
})

onMounted(load)
watch(() => props.systemId, load)
watch([() => query.value, rulesKind, () => props.game], () => {
  if (rulesTimer) clearTimeout(rulesTimer)
  rulesTimer = setTimeout(searchCompendium, 150)
})
</script>

<style scoped>
.wrl-body { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.wrl-top { padding: 8px 10px 4px; flex-shrink: 0; }
.wrl-input {
  width: 100%; padding: 5px 10px; border-radius: 7px;
  background: var(--surface); border: 1px solid var(--border);
  font-size: 12.5px; color: var(--text);
  transition: border-color 0.12s;
}
.wrl-input:focus { outline: none; border-color: var(--border-hi); }
.wrl-input::placeholder { color: var(--text3); }

.wrl-filters {
  display: flex; flex-wrap: wrap; gap: 4px;
  padding: 0 10px 6px; flex-shrink: 0;
}
.wrl-chip {
  padding: 2px 8px; border-radius: 99px; font-size: 10.5px; font-weight: 600;
  border: 1px solid var(--border); background: var(--surface); color: var(--text3);
  cursor: pointer; transition: all 0.12s;
}
.wrl-chip:hover { color: var(--text2); border-color: var(--border-hi); }
.wrl-chip.active {
  background: color-mix(in oklch, var(--chip-color, var(--accent)) 15%, transparent);
  border-color: color-mix(in oklch, var(--chip-color, var(--accent)) 45%, transparent);
  color: var(--chip-color, var(--accent-l));
}

.wrl-results { flex: 1; min-height: 0; overflow-y: auto; padding: 0 6px 8px; }

.wrl-empty {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 20px; font-size: 12px; color: var(--text3); font-style: italic;
}
.wrl-spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.wrl-item {
  display: block; width: 100%; text-align: left; cursor: pointer;
  padding: 5px 8px; border-radius: 7px; margin-bottom: 2px;
  border: 1px solid transparent; background: none;
  transition: all 0.1s;
}
.wrl-item:hover { background: var(--surface); border-color: var(--border); }
.wrl-item--open { background: var(--surface); border-color: var(--border-hi); }

.wrl-item-row { display: flex; align-items: baseline; gap: 6px; }
.wrl-item-name { flex: 1; font-size: 12.5px; font-weight: 600; color: var(--text); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.wrl-item-type { font-size: 10px; font-weight: 600; font-family: var(--fm); text-transform: uppercase; letter-spacing: 0.06em; flex-shrink: 0; }

.wrl-item-detail { margin-top: 6px; }
.wrl-item-toggle { width: 100%; background: none; border: none; padding: 0; cursor: pointer; text-align: left; }
.wrl-statblock { padding: 4px 2px 6px; cursor: default; }
.wrl-statblock :deep(.rsb) { font-size: 12.5px; }
.wrl-statblock :deep(.rsb-name) { font-size: 16px; }
.wrl-item-fields { display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); gap: 4px; margin-bottom: 6px; }
.wrl-item-field {
  background: var(--surface-hi); border: 1px solid var(--border); border-radius: 5px;
  padding: 4px 7px;
}
.wrl-field-label { display: block; font-size: 9px; font-weight: 600; text-transform: capitalize; letter-spacing: 0.06em; color: var(--text3); margin-bottom: 1px; font-family: var(--fm); }
.wrl-field-val { font-size: 11.5px; color: var(--text); font-weight: 500; }
.wrl-item-body { font-size: 11.5px; color: var(--text2); line-height: 1.6; white-space: pre-wrap; margin: 0; }
.wrl-empty-inline { font-size: 11px; color: var(--text3); }
</style>

<template>
  <Teleport to="body">
    <div class="pv-dialog-mask" @click.self="emit('close')">
      <div class="pv-dialog eld" role="dialog" aria-label="Encounter loot">
        <div class="pv-dialog-header">
          <span class="pv-dialog-title">Loot · {{ name }}</span>
          <button class="pv-dialog-close" aria-label="Close" @click="emit('close')">
            <OhVueIcon name="md-close" scale="0.85" />
          </button>
        </div>
        <div class="pv-dialog-content eld-body">
          <PartyInventory :campaign-id="campaignId" :game="game" :characters="characters" :party-level="party.level" :lock-owner="owner" />

          <!-- Enemies' gear -->
          <section v-if="gear.length" class="eld-gear">
            <div class="eld-title">From the enemies' gear</div>
            <div v-for="g in gear" :key="g.key" class="eld-row">
              <span class="eld-name">{{ g.quantity > 1 ? `${g.quantity}× ` : '' }}{{ g.name }}</span>
              <span class="eld-dim">{{ g.from.join(', ') }}</span>
              <span v-if="!g.itemId" class="eld-dim" title="Foundry gave no compendium link; it's added as free text">free text</span>
              <button class="ghost-btn eld-btn" @click="addGear(g)">+ Add</button>
            </div>
          </section>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** The encounter's loot (FEATURES_PLAN.md §5): inventory entries owned by the encounter, plus suggestions from the enemies' compendium gear. */
import { useInventory } from '~/composables/useInventory'
import { useParty } from '~/composables/useParty'
import { useResolution } from '~/composables/useResolution'
import { tokenSides } from '~/rules/encounter'
import { encounterOwner } from '~/rules/inventory'
import { partyMembers } from '~/rules/party'
import type { GameId } from '~/types/game'
import type { Creature } from '~/types/rules'

const props = defineProps<{ encounterId: number; campaignId: number; game: GameId; name: string }>()
const emit = defineEmits<{ close: [] }>()

const { characters, party, load, loadedCampaign } = useParty()
const { addEntry } = useInventory()
const owner = computed(() => encounterOwner(props.encounterId))

interface GearRow { key: string; itemId: string | null; name: string; quantity: number; from: string[] }
const gear = ref<GearRow[]>([])

onMounted(async () => {
  if (loadedCampaign.value !== props.campaignId) await load(props.campaignId)
  const ctx = await useResolution().loadResolveContext(props.encounterId)
  if (!ctx) return
  const partyNpcIds = new Set(partyMembers(characters.value).map(c => c.npcEntityId).filter((id): id is number => id !== null))
  const { enemies } = tokenSides(ctx.tokens.map(t => ({
    linkedRulesId: t.linked_rules_id ?? null, linkedEntityId: t.linked_entity_id ?? null,
    adjustment: t.rules_adjustment ?? null, isPlayerToken: !!t.is_player_token, isAlly: !!t.is_ally,
  })), partyNpcIds)
  const rows = new Map<string, GearRow>()
  for (const t of enemies) {
    const e = ctx.entries.get(t.linkedRulesId!)
    if (e?.kind !== 'creature') continue
    for (const it of (e as Creature).inventory ?? []) {
      const key = it.itemId ?? `name:${it.name.toLowerCase()}`
      const row = rows.get(key) ?? { key, itemId: it.itemId ?? null, name: it.name, quantity: 0, from: [] }
      row.quantity += Math.max(1, it.quantity || 1)
      if (!row.from.includes(e.name)) row.from.push(e.name)
      rows.set(key, row)
    }
  }
  gear.value = [...rows.values()].sort((a, b) => a.name.localeCompare(b.name))
})

async function addGear(g: GearRow) {
  await addEntry({ campaignId: props.campaignId, owner: owner.value, itemId: g.itemId, name: g.name, quantity: g.quantity })
}
</script>

<style scoped>
.eld { width: min(860px, 94vw); max-height: 90vh; display: flex; flex-direction: column; }
.eld-body { overflow-y: auto; }
.eld-gear { border-top: 1px solid var(--border); padding-top: 12px; }
.eld-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); margin-bottom: 6px; }
.eld-row { display: flex; align-items: center; gap: 10px; padding: 4px 6px; border-radius: 6px; }
.eld-row:hover { background: var(--surface-hi); }
.eld-name { flex: 1; font-size: 13px; color: var(--text); }
.eld-dim { font-size: 11px; color: var(--text3); }
.eld-btn { padding: 2px 8px; font-size: 12px; }
</style>

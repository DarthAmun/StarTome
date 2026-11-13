<script setup lang="ts">
/**
 * An encounter's loot: stacks and coins that wait on the encounter and go to
 * the party stash when it is resolved. Add by hand, take what the enemies
 * carry, or roll a share of the level's treasure.
 */
import { computed, ref } from 'vue'
import { formatMoney } from '@/domain/rules/format'
import { encounterOwner } from '@/domain/rules/inventory'
import { isPartyMember, partyLevel } from '@/domain/rules/party'
import { addEntry } from '@/data/inventory'
import { campaignSettings, partyOf } from '@/data/party'
import { loadWealth } from '@/data/wealth'
import AppDialog from '@/ui/components/AppDialog.vue'
import { reportError } from '@/ui/dialogs'
import type { LootPrompt } from '@/ui/partyPrompts'
import { useLive } from '@/ui/useLive'
import InventoryPanel from './InventoryPanel.vue'
import TreasureRoll from './TreasureRoll.vue'

const props = defineProps<{ prompt: LootPrompt }>()
const emit = defineEmits<{ close: [] }>()

const owner = encounterOwner(props.prompt.encounterId)
const characters = useLive(() => partyOf(props.prompt.campaignId), [])
const settings = useLive(() => campaignSettings(props.prompt.campaignId), null)
const party = computed(() => partyLevel(characters.value))
const wealth = useLive(async () => (party.value.level === null ? null : loadWealth(props.prompt.campaignId, { level: party.value.level, size: party.value.size, xps: characters.value.filter(isPartyMember).map(c => c.xp) })), null, [party])
const inv = ref<InstanceType<typeof InventoryPanel> | null>(null)
const rolling = ref(false)
const taken = ref(new Set<number>())

async function take(i: number) {
  const g = props.prompt.gear[i]
  if (!g) return
  try {
    await addEntry({ campaignId: props.prompt.campaignId, owner, itemId: g.itemId ?? null, name: g.name, quantity: g.quantity })
    taken.value = new Set([...taken.value, i])
  } catch (err) { reportError('Adding the item', err) }
}
</script>

<template>
  <AppDialog :title="`Loot · ${prompt.name}`" wide @close="emit('close')">
    <p class="faint">What is here goes to the party stash when the encounter is resolved, and counts as treasure then.</p>
    <p v-if="wealth?.pace && settings" class="dim">This level: {{ formatMoney({ cp: wealth.pace.awarded }, settings.game) }} of {{ formatMoney({ cp: wealth.pace.expected }, settings.game) }} awarded ({{ Math.round(wealth.pace.fraction * 100) }}%).</p>
    <div v-if="prompt.gear.length" class="gear">
      <span class="label">The enemies carry</span>
      <button v-for="(g, i) in prompt.gear" :key="i" class="chip" :disabled="taken.has(i)" @click="take(i)">{{ g.quantity > 1 ? `${g.quantity} × ` : '' }}{{ g.name }}{{ taken.has(i) ? ' ✓' : ' +' }}</button>
    </div>
    <InventoryPanel v-if="settings" ref="inv" :campaign-id="prompt.campaignId" :game="settings.game" :characters="characters" :party-level="party.level" :rules="settings.rules" :lock-owner="owner" :lock-name="prompt.name" />
    <button v-if="party.level !== null && !rolling" class="btn roll" @click="rolling = true">Roll treasure…</button>
    <TreasureRoll v-if="rolling && settings && party.level !== null" class="panel rollbox" :campaign-id="prompt.campaignId" :game="settings.game" :owner="owner" :level="party.level" :party-size="party.size" :pace="wealth?.pace ?? null" :stacks="inv?.ctx.stacks.value ?? []" @added="rolling = false" />
    <template #footer><button class="btn btn-primary" @click="emit('close')">Done</button></template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; } .gear { display: flex; flex-wrap: wrap; gap: .3rem; align-items: center; } .gear .label { width: 100%; margin: 0; }
.gear .chip { background: none; cursor: pointer; } .gear .chip:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }
.roll { align-self: flex-start; } .rollbox { padding: .7rem; }
</style>

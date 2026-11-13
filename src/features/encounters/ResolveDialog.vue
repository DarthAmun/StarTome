<script setup lang="ts">
/**
 * Resolving an encounter: the enemies and their XP at the party's level, who
 * took part, accomplishment XP on top, and the loot that goes to the stash.
 * Milestone campaigns record the XP for pacing only.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { ACCOMPLISHMENT_XP, defaultParticipants } from '@/domain/rules/advancement'
import { THREAT_LABEL } from '@/domain/rules/encounter'
import { formatMoney } from '@/domain/rules/format'
import { loadResolveContext, resolveEncounter, type ResolveContext } from '@/data/resolution'
import AppDialog from '@/ui/components/AppDialog.vue'
import { notify, reportError } from '@/ui/dialogs'
import { levelUpPrompt } from '@/ui/partyPrompts'
import { rate } from './difficulty'

const props = defineProps<{ encounterId: string }>()
const emit = defineEmits<{ close: []; resolved: [] }>()

const ctx = shallowRef<ResolveContext | null>(null)
const who = ref(new Set<string>())
const accomplishment = ref(0)
const busy = ref(false)

watch(() => props.encounterId, async (id) => {
  const c = ctx.value = await loadResolveContext(id)
  if (c) who.value = new Set(defaultParticipants(c.party, c.combatants.map(t => ({ entryId: t.ref.kind === 'entry' ? t.ref.entryId : c.party.find(p => t.ref.kind === 'character' && p.id === t.ref.characterId)?.entryId ?? null, actorId: t.actorId }))))
}, { immediate: true })

const rated = computed(() => (ctx.value ? rate(ctx.value.game, ctx.value.combatants, ctx.value.defeated, ctx.value.entries, ctx.value.party, ctx.value.encounter.partyLevel) : null))
const each = computed(() => (rated.value?.award ?? 0) + (Number(accomplishment.value) || 0))
function toggle(id: string) { const s = new Set(who.value); if (s.has(id)) s.delete(id); else s.add(id); who.value = s }

async function resolve() {
  const c = ctx.value, r = rated.value
  if (!c || !r) return
  busy.value = true
  try {
    const ready = await resolveEncounter({ encounterId: c.encounter.id, participants: [...who.value], xpTotal: r.difficulty.xp, partyLevel: r.level, accomplishment: Number(accomplishment.value) || 0, xpAwarded: each.value })
    notify(`“${c.encounter.name}” resolved${c.loot.count || c.loot.cp ? ': its loot is in the party stash' : ''}.`, 'ok')
    if (ready.length) levelUpPrompt.value = { campaignId: c.encounter.campaignId, trigger: 'encounter', refId: c.encounter.id, reason: `${ready.map(x => x.name).join(', ')} reached 1,000 XP.`, selected: ready.map(x => x.id) }
    emit('resolved')
    emit('close')
  } catch (err) { reportError('Resolving the encounter', err) } finally { busy.value = false }
}
</script>

<template>
  <AppDialog :title="`Resolve · ${ctx?.encounter.name ?? ''}`" @close="emit('close')">
    <template v-if="ctx && rated">
      <p><b>{{ THREAT_LABEL[rated.rating.threat] }}</b> · {{ rated.difficulty.xp }} XP at party level {{ rated.level }} · <b class="num" data-test="resolve-award">{{ rated.award }} XP</b> each (as for four characters)</p>
      <ul class="foes"><li v-for="(r, i) in rated.difficulty.rows" :key="i"><span class="num">{{ r.xp }}</span> {{ r.name }} <span class="faint">level {{ r.level }}{{ r.defeated ? ' · removed during the fight' : '' }}</span></li></ul>
      <p v-if="!rated.difficulty.rows.length" class="faint">No enemy with a stat block: no encounter XP.</p>
      <span class="label">Who took part</span>
      <div class="who"><label v-for="c in ctx.party" :key="c.id"><input type="checkbox" :checked="who.has(c.id)" @change="toggle(c.id)" /> {{ c.name }}</label><span v-if="!ctx.party.length" class="faint">No party members yet.</span></div>
      <label><span class="label">Accomplishment XP on top, each</span>
        <span class="acc"><input v-model.number="accomplishment" type="number" min="0" class="input num" /><button v-for="(xp, k) in ACCOMPLISHMENT_XP" :key="k" class="btn" @click="accomplishment = xp">{{ k }} {{ xp }}</button></span>
      </label>
      <p>{{ ctx.loot.count }} loot {{ ctx.loot.count === 1 ? 'stack' : 'stacks' }}<template v-if="ctx.loot.cp"> and {{ formatMoney({ cp: ctx.loot.cp }, ctx.game) }}</template> go to the party stash.</p>
      <p v-if="!ctx.xpCampaign" class="faint">Milestone campaign: the XP is recorded to pace level-ups, nobody's XP changes.</p>
    </template>
    <template #footer>
      <button class="btn" @click="emit('close')">Cancel</button>
      <button class="btn btn-primary" :disabled="busy || !ctx" data-test="confirm-resolve" @click="resolve">{{ ctx?.xpCampaign ? `Resolve and award ${each} XP` : 'Resolve' }}</button>
    </template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; } .foes { list-style: none; margin: 0; padding: 0; max-height: 9rem; overflow: auto; font-size: .9rem; } .foes .num { display: inline-block; width: 2.6rem; color: var(--accent); }
.who { display: flex; flex-wrap: wrap; gap: .3rem 1rem; } .acc { display: flex; gap: .4rem; align-items: center; flex-wrap: wrap; } .acc .num { width: 6rem; }
</style>

<script setup lang="ts">
/**
 * The two party prompts, mounted once in the shell: level up (by hand, by a
 * milestone quest, or when someone reaches 1,000 XP) and award XP.
 */
import { computed, onUnmounted, ref, watch } from 'vue'
import { onDomainEvent } from '@/domain/events'
import { ACCOMPLISHMENT_XP, XP_PER_LEVEL } from '@/domain/rules/advancement'
import { isPartyMember, MAX_LEVEL } from '@/domain/rules/party'
import type { Character } from '@/domain/schema'
import { awardXp, campaignSettings, levelUp, partyOf } from '@/data/party'
import AppDialog from '@/ui/components/AppDialog.vue'
import { notify, reportError } from '@/ui/dialogs'
import { levelUpPrompt, xpPrompt } from '@/ui/partyPrompts'

const rows = ref<Character[]>([])
const selected = ref(new Set<string>())
const amount = ref<number>(ACCOMPLISHMENT_XP.moderate)
const reason = ref('')
const busy = ref(false)

// A completed quest: a milestone campaign may level up, an XP campaign may award quest XP
const stop = onDomainEvent('questCompleted', async ({ campaignId, entryId, name, milestone }) => {
  const { rules } = await campaignSettings(campaignId)
  if (rules.advancement === 'milestone' && milestone) levelUpPrompt.value = { campaignId, trigger: 'quest', refId: entryId, reason: `Milestone reached: ${name}` }
  if (rules.advancement === 'xp') xpPrompt.value = { campaignId, refType: 'quest', refId: entryId, reason: `Quest: ${name}` }
})
onUnmounted(stop)

// Party members first, then companions who don't count (they can be ticked)
const sorted = (list: Character[]) => [...list].sort((a, b) => Number(isPartyMember(b)) - Number(isPartyMember(a)))
watch(levelUpPrompt, async (p) => {
  if (!p) return
  rows.value = sorted(await partyOf(p.campaignId))
  const preset = p.selected ? new Set(p.selected) : null
  selected.value = new Set(rows.value.filter(c => (preset ? preset.has(c.id) : isPartyMember(c)) && c.level < MAX_LEVEL).map(c => c.id))
})
watch(xpPrompt, async (p) => {
  if (!p) return
  rows.value = sorted(await partyOf(p.campaignId))
  selected.value = new Set(rows.value.filter(isPartyMember).map(c => c.id))
  amount.value = p.amount ?? ACCOMPLISHMENT_XP.moderate
  reason.value = p.reason
})
function toggle(id: string) { const next = new Set(selected.value); if (!next.delete(id)) next.add(id); selected.value = next }
const levelCount = computed(() => rows.value.filter(c => selected.value.has(c.id) && c.level < MAX_LEVEL).length)

async function confirmLevelUp() {
  const p = levelUpPrompt.value
  if (!p) return
  busy.value = true
  try { await levelUp(p.campaignId, [...selected.value], p.trigger, p.refId); levelUpPrompt.value = null }
  catch (err) { reportError('Levelling up', err) } finally { busy.value = false }
}
async function confirmXp() {
  const p = xpPrompt.value
  if (!p || !(amount.value > 0)) return
  busy.value = true
  try {
    xpPrompt.value = null
    const done = await awardXp({ campaignId: p.campaignId, amount: amount.value, characterIds: [...selected.value], source: 'accomplishment', refType: p.refType, refId: p.refId, reason: reason.value.trim() })
    if (done) notify(`Awarded ${done.entry.amount} XP to ${done.entry.characterIds.length}.`, 'ok')
    // Anyone who reached 1,000 XP is offered a level-up
    if (done?.ready.length) {
      levelUpPrompt.value = { campaignId: p.campaignId, trigger: p.refType === 'quest' ? 'quest' : 'manual', refId: p.refId, selected: done.ready.map(c => c.id),
        reason: `${done.ready.map(c => c.name).join(', ')} reached ${XP_PER_LEVEL.toLocaleString()} XP. Levelling up costs ${XP_PER_LEVEL.toLocaleString()} XP each.` }
    }
  } catch (err) { reportError('Awarding XP', err) } finally { busy.value = false }
}
</script>

<template>
  <AppDialog v-if="levelUpPrompt" title="Level up the party?" @close="levelUpPrompt = null">
    <p class="dim">{{ levelUpPrompt.reason }}</p>
    <p v-if="!rows.length" class="faint">No party members yet. Add them on the Party page.</p>
    <label v-for="c in rows" :key="c.id" class="who" :class="{ off: !selected.has(c.id) }">
      <input type="checkbox" :checked="selected.has(c.id)" :disabled="c.level >= MAX_LEVEL" @change="toggle(c.id)" />
      <span class="name">{{ c.name }}</span><span v-if="c.role === 'companion'" class="chip">companion</span>
      <span class="num">{{ c.level }}<template v-if="selected.has(c.id) && c.level < MAX_LEVEL"> → <b>{{ c.level + 1 }}</b></template></span>
    </label>
    <p v-if="rows.length" class="faint">Untick anyone who stays behind, for example a player who missed the arc. You can undo this on the Party page.</p>
    <template #footer>
      <button class="btn" @click="levelUpPrompt = null">Not now</button>
      <button class="btn btn-primary" :disabled="!levelCount || busy" data-test="confirm-level-up" @click="confirmLevelUp">Level up {{ levelCount }} {{ levelCount === 1 ? 'character' : 'characters' }}</button>
    </template>
  </AppDialog>

  <AppDialog v-if="xpPrompt" title="Award XP" @close="xpPrompt = null">
    <label><span class="label">For</span><input v-model="reason" class="input" placeholder="e.g. Talked the guards down" /></label>
    <div class="sizes">
      <button v-for="(xp, size) in ACCOMPLISHMENT_XP" :key="size" class="btn" :class="{ 'btn-primary': amount === xp }" @click="amount = xp"><b>{{ xp }}</b> {{ size }}</button>
      <input v-model.number="amount" class="input amount" type="number" min="1" title="XP per character" aria-label="XP per character" /><span class="faint">XP each</span>
    </div>
    <p v-if="!rows.length" class="faint">No party members yet. Add them on the Party page.</p>
    <label v-for="c in rows" :key="c.id" class="who" :class="{ off: !selected.has(c.id) }">
      <input type="checkbox" :checked="selected.has(c.id)" @change="toggle(c.id)" />
      <span class="name">{{ c.name }}</span><span v-if="c.role === 'companion'" class="chip">companion</span>
      <span class="num">{{ c.xp }}<template v-if="selected.has(c.id) && amount > 0"> → <b>{{ c.xp + amount }}</b></template></span>
    </label>
    <p class="faint">GM Core: minor 10, moderate 30, major 80 per character. Anyone reaching {{ XP_PER_LEVEL.toLocaleString() }} XP is offered a level-up.</p>
    <template #footer>
      <button class="btn" @click="xpPrompt = null">Not now</button>
      <button class="btn btn-primary" :disabled="!selected.size || !(amount > 0) || busy" data-test="confirm-xp" @click="confirmXp">Award {{ amount > 0 ? amount : 0 }} XP to {{ selected.size }}</button>
    </template>
  </AppDialog>
</template>

<style scoped>
p { margin: 0; }
.who { display: flex; align-items: center; gap: .6rem; padding: .25rem .2rem; border-bottom: var(--frame); }
.who.off { color: var(--text-faint); }
.name { flex: 1; }
.sizes { display: flex; align-items: center; gap: .4rem; flex-wrap: wrap; }
.amount { width: 5rem; }
</style>

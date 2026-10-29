<template>
  <Teleport to="body">
    <div v-if="xpPrompt" class="pv-dialog-mask" @click.self="dismissXpPrompt()">
      <div class="pv-dialog axd" role="dialog" aria-labelledby="axd-title">
        <div class="pv-dialog-header">
          <span id="axd-title" class="pv-dialog-title">Award XP</span>
          <button class="pv-dialog-close" aria-label="Close" @click="dismissXpPrompt()">
            <OhVueIcon name="md-close" scale="0.85" />
          </button>
        </div>
        <div class="pv-dialog-content">
          <label class="axd-field">
            <span class="f-label">For</span>
            <input v-model="reason" class="f-input-box" placeholder="e.g. Talked the guards down" />
          </label>
          <div class="axd-sizes">
            <button v-for="(xp, size) in ACCOMPLISHMENT_XP" :key="size" class="axd-size" :class="{ active: amount === xp }" @click="amount = xp">
              <b>{{ xp }}</b> {{ size }}
            </button>
            <input v-model.number="amount" class="f-input-box axd-amount" type="number" min="1" title="XP per character" />
            <span class="axd-dim">XP each</span>
          </div>
          <div v-if="!rows.length" class="axd-dim">
            No party members yet. Add them on the <NuxtLink :to="`/campaign/${xpPrompt.campaignId}/party`" @click="dismissXpPrompt()">Party</NuxtLink> page.
          </div>
          <label v-for="c in rows" :key="c.id" class="axd-row" :class="{ 'axd-row--off': !selected.has(c.id) }">
            <input type="checkbox" :checked="selected.has(c.id)" @change="toggle(c.id)" />
            <span class="axd-name">{{ c.name }}</span>
            <span v-if="c.role === 'companion'" class="axd-tag">companion</span>
            <span class="axd-xp">
              {{ c.xp }}<template v-if="selected.has(c.id) && amount > 0"> → <b>{{ c.xp + amount }}</b></template>
            </span>
          </label>
          <p class="axd-dim axd-hint">GM Core: minor 10, moderate 30, major 80 per character. Anyone reaching {{ XP_PER_LEVEL.toLocaleString() }} XP is offered a level-up.</p>
        </div>
        <div class="pv-dialog-footer">
          <button class="ghost-btn" @click="dismissXpPrompt()">Not now</button>
          <button class="seal-btn" :disabled="!selected.size || !(amount > 0) || busy" @click="confirm">
            Award {{ amount > 0 ? amount : 0 }} XP to {{ selected.size }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** Accomplishment XP: opened from the Party page or a completed quest (useParty().xpPrompt). */
import { useParty } from '~/composables/useParty'
import { ACCOMPLISHMENT_XP, XP_PER_LEVEL } from '~/rules/advancement'
import { isPartyMember } from '~/rules/party'

const { xpPrompt, characters, load, awardXp, dismissXpPrompt, loadedCampaign } = useParty()

const selected = ref(new Set<number>())
const amount = ref<number>(ACCOMPLISHMENT_XP.moderate)
const reason = ref('')
const busy = ref(false)

const rows = computed(() => [...characters.value].sort((a, b) => Number(isPartyMember(b)) - Number(isPartyMember(a))))

watch(xpPrompt, async (p) => {
  if (!p) return
  if (loadedCampaign.value !== p.campaignId) await load(p.campaignId)
  selected.value = new Set(characters.value.filter(isPartyMember).map(c => c.id))
  amount.value = p.amount ?? ACCOMPLISHMENT_XP.moderate
  reason.value = p.reason
}, { immediate: true })

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function confirm() {
  const p = xpPrompt.value
  if (!p || !(amount.value > 0)) return
  busy.value = true
  try {
    dismissXpPrompt()
    await awardXp({
      campaignId: p.campaignId, amount: amount.value, characterIds: [...selected.value],
      source: 'accomplishment', refType: p.refType, refId: p.refId, reason: reason.value.trim(),
    })
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.axd { width: 460px; }
.axd-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.axd-sizes { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
.axd-size {
  padding: 4px 9px; border: 1px solid var(--border); border-radius: 6px; background: transparent;
  color: var(--text2); font-size: 12px; text-transform: capitalize; cursor: pointer;
}
.axd-size b { font-family: var(--fm); color: var(--text); }
.axd-size.active { border-color: var(--accent); color: var(--accent); }
.axd-amount { width: 72px; }
.axd-row { display: flex; align-items: center; gap: 10px; padding: 7px 8px; border-radius: 6px; cursor: pointer; }
.axd-row:hover { background: var(--surface-hi); }
.axd-row--off .axd-name { color: var(--text3); }
.axd-name { flex: 1; font-size: 14px; color: var(--text); }
.axd-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.axd-xp { font-family: var(--fm); font-size: 13px; color: var(--text2); }
.axd-xp b { color: var(--accent-l, var(--accent)); }
.axd-dim { font-size: 12px; color: var(--text3); }
.axd-hint { margin: 12px 0 0; }
</style>

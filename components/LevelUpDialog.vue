<template>
  <Teleport to="body">
    <div v-if="prompt" class="pv-dialog-mask" @click.self="dismissPrompt()">
      <div class="pv-dialog lud" role="dialog" aria-labelledby="lud-title">
        <div class="pv-dialog-header">
          <span id="lud-title" class="pv-dialog-title">Level up the party?</span>
          <button class="pv-dialog-close" aria-label="Close" @click="dismissPrompt()">
            <OhVueIcon name="md-close" scale="0.85" />
          </button>
        </div>
        <div class="pv-dialog-content">
          <p class="lud-reason">{{ prompt.reason }}</p>
          <div v-if="!rows.length" class="lud-empty">
            No party members yet. Add them on the <NuxtLink :to="`/campaign/${prompt.campaignId}/party`" @click="dismissPrompt()">Party</NuxtLink> page.
          </div>
          <label v-for="c in rows" :key="c.id" class="lud-row" :class="{ 'lud-row--off': !selected.has(c.id) }">
            <input type="checkbox" :checked="selected.has(c.id)" :disabled="c.level >= MAX_LEVEL" @change="toggle(c.id)" />
            <span class="lud-name">{{ c.name }}</span>
            <span v-if="c.role === 'companion'" class="lud-tag">companion</span>
            <span class="lud-level">
              {{ c.level }}<template v-if="selected.has(c.id) && c.level < MAX_LEVEL"> → <b>{{ c.level + 1 }}</b></template>
            </span>
          </label>
          <p v-if="rows.length" class="lud-hint">Untick anyone who stays behind, e.g. a player who missed the arc. You can undo this on the Party page.</p>
        </div>
        <div class="pv-dialog-footer">
          <button class="ghost-btn" @click="dismissPrompt()">Not now</button>
          <button class="seal-btn" :disabled="!selectedCount || busy" @click="confirm">
            Level up {{ selectedCount }} {{ selectedCount === 1 ? 'character' : 'characters' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
/** "Level up party": opened from the Party page or by a completed milestone quest (useParty().prompt). */
import { useParty } from '~/composables/useParty'
import { MAX_LEVEL, isPartyMember } from '~/rules/party'

const { prompt, characters, load, levelUp, dismissPrompt, loadedCampaign } = useParty()

const selected = ref(new Set<number>())
const busy = ref(false)

// Party members first, then companions who don't count (selectable, unticked)
const rows = computed(() => [...characters.value].sort((a, b) => Number(isPartyMember(b)) - Number(isPartyMember(a))))
const selectedCount = computed(() => rows.value.filter(c => selected.value.has(c.id) && c.level < MAX_LEVEL).length)

watch(prompt, async (p) => {
  if (!p) return
  if (loadedCampaign.value !== p.campaignId) await load(p.campaignId)
  const preset = p.selected ? new Set(p.selected) : null
  selected.value = new Set(characters.value.filter(c => (preset ? preset.has(c.id) : isPartyMember(c)) && c.level < MAX_LEVEL).map(c => c.id))
}, { immediate: true })

function toggle(id: number) {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

async function confirm() {
  const p = prompt.value
  if (!p) return
  busy.value = true
  try {
    await levelUp(p.campaignId, [...selected.value], p.trigger, p.refId)
    dismissPrompt()
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.lud { width: 440px; }
.lud-reason { margin: 0 0 12px; color: var(--text2); font-size: 13px; }
.lud-empty { font-size: 13px; color: var(--text3); }
.lud-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 8px; border-radius: 6px; cursor: pointer;
}
.lud-row:hover { background: var(--surface-hi); }
.lud-row--off .lud-name { color: var(--text3); }
.lud-name { flex: 1; font-size: 14px; color: var(--text); }
.lud-tag { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); }
.lud-level { font-family: var(--fm); font-size: 13px; color: var(--text2); }
.lud-level b { color: var(--accent-l, var(--accent)); }
.lud-hint { margin: 12px 0 0; font-size: 12px; color: var(--text3); }
</style>

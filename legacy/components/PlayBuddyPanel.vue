<template>
  <section class="party-section pb">
    <div class="pb-head">
      <div class="party-section-title">Play Buddy</div>
      <span v-if="linkInfo" class="pb-live" :class="{ on: live && !pb.error.value }" :title="pb.error.value || 'Following the game'">
        {{ live && !pb.error.value ? 'live' : 'offline' }}
      </span>
      <span class="pb-spacer" />
      <label class="ghost-btn pb-small" title="Load a share file a player exported from Play Buddy">
        Import share file
        <input type="file" accept=".json,application/json" class="pb-file" @change="onShareFile" />
      </label>
    </div>

    <p v-if="pb.error.value" class="pb-error">{{ pb.error.value }}</p>
    <p v-if="systemMismatch" class="pb-error">
      Play Buddy's game is a {{ pb.game.value!.system === 'sf2e' ? 'Starfinder' : 'Pathfinder' }} game, this campaign is {{ game === 'sf2e' ? 'Starfinder' : 'Pathfinder' }}:
      items and skills won't match. Open the right game in Play Buddy.
    </p>
    <p v-else-if="game === 'sf2e' && !pb.connected.value" class="pb-dim pb-note">
      Starfinder support needs a Play Buddy version that reports Starfinder games (PLAYBUDDY_API.md, "Starfinder 2e"). Until then, enter crew skills on the Starship page.
    </p>

    <!-- Share file: which character it's for -->
    <div v-if="share" class="pb-box">
      <span>Share file for <b>{{ share.name }}</b>. Update which character?</span>
      <select v-model="shareTarget" class="pb-input">
        <option :value="null">— choose —</option>
        <option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option>
      </select>
      <button class="seal-btn pb-small" :disabled="shareTarget == null" @click="applyShare">Update</button>
      <button class="ghost-btn pb-small" @click="share = null">Cancel</button>
    </div>

    <!-- Not paired -->
    <div v-if="!pb.connected.value" class="pb-box pb-connect">
      <p class="pb-text">
        Link this campaign to the players' <b>Play Buddy</b> game: their characters' HP, defenses and items show up here,
        loot goes to them as offers, and their rolls come in. Open Play Buddy in GM mode on this computer, switch on the
        GM API and enter the pair code it shows.
      </p>
      <label class="pb-field">Port <input v-model.number="port" class="pb-input pb-port" type="number" min="1" max="65535" /></label>
      <label class="pb-field">Pair code <input v-model="code" class="pb-input pb-code" inputmode="numeric" placeholder="123456" @keydown.enter="connect" /></label>
      <button class="seal-btn pb-small" :disabled="!code.trim() || pb.busy.value" @click="connect">{{ pb.busy.value ? 'Pairing…' : 'Pair' }}</button>
    </div>

    <!-- Paired, campaign not linked -->
    <div v-else-if="!linkInfo" class="pb-box">
      <template v-if="pb.game.value">
        <span>Play Buddy has <b>{{ pb.game.value.name }}</b> open with {{ pb.game.value.players.length }} {{ pb.game.value.players.length === 1 ? 'player' : 'players' }}.</span>
        <button class="seal-btn pb-small" @click="linkCampaign">Link this campaign</button>
      </template>
      <span v-else class="pb-dim">No game open in Play Buddy.</span>
      <button class="ghost-btn pb-small" @click="pb.loadGame()">Check again</button>
      <span class="pb-spacer" />
      <button class="ghost-btn pb-small" @click="pb.disconnect()">Unpair</button>
    </div>

    <!-- Linked -->
    <template v-else>
      <div class="pb-meta">
        Linked to <b>{{ linkInfo.gameName }}</b>
        <span class="pb-spacer" />
        <button class="ghost-btn pb-small" :disabled="!characters.some(c => c.pbPlayerId)" title="One hero point to every linked character" @click="pb.heroPointsForAll(campaignId, characters)">Hero points for all</button>
        <button class="ghost-btn pb-small" @click="refresh">Refresh</button>
        <button class="ghost-btn pb-small" @click="unlinkCampaign">Unlink campaign</button>
        <button class="ghost-btn pb-small" @click="pb.disconnect()">Unpair</button>
      </div>

      <div v-for="p in players" :key="p.playerId" class="pb-player">
        <div class="pb-who">
          <span class="pb-dot" :class="{ on: p.online }" :title="p.online ? 'Online' : 'Offline'" />
          <b>{{ p.characterName ?? '—' }}</b>
          <span class="pb-dim">{{ p.name }}{{ p.className ? ` · ${p.className} ${p.level ?? ''}` : '' }}</span>
          <span v-for="s in p.shares" :key="s" class="pb-chip" :title="`Shares ${s}`">{{ s }}</span>
        </div>

        <template v-if="charOf(p)">
          <div class="pb-status">
            <template v-if="charOf(p)!.pbStatus?.basic">
              <span>HP <b>{{ charOf(p)!.pbStatus!.basic!.hp.value }}</b>/{{ charOf(p)!.pbStatus!.basic!.hp.max }}<template v-if="charOf(p)!.pbStatus!.basic!.hp.temp"> +{{ charOf(p)!.pbStatus!.basic!.hp.temp }}</template></span>
              <span v-if="charOf(p)!.pbStatus!.basic!.heroPoints != null" class="pb-hero" :title="`${charOf(p)!.pbStatus!.basic!.heroPoints} of 3 hero points`">
                <span v-for="n in 3" :key="n" class="pb-hero-pip" :class="{ on: n <= charOf(p)!.pbStatus!.basic!.heroPoints! }" />
              </span>
              <span v-for="k in charOf(p)!.pbStatus!.basic!.conditions" :key="k.slug" class="pb-cond">{{ k.name }}{{ k.value ? ` ${k.value}` : '' }}</span>
            </template>
            <span v-if="charOf(p)!.pbStatus?.defenses">AC <b>{{ charOf(p)!.pbStatus!.defenses!.ac }}</b> · Perception {{ signed(charOf(p)!.pbStatus!.defenses!.perception) }}</span>
            <span v-if="charOf(p)!.pbStatus?.at" class="pb-dim">as of {{ formatTime(charOf(p)!.pbStatus!.at) }}</span>
            <span class="pb-spacer" />
            <button class="ghost-btn pb-small" title="Unlink: the character stays in the party with its last known items" @click="pb.unlinkCharacter(campaignId, charOf(p)!.id)">Unlink</button>
          </div>
          <div class="pb-actions">
            <button class="ghost-btn pb-small" :disabled="pendingLevel(charOf(p)!) != null"
              :title="pendingLevel(charOf(p)!) != null ? 'Waiting for the player to accept' : `Level up in the party's history; ${p.name} accepts it in Play Buddy`"
              @click="party.levelUp(campaignId, [charOf(p)!.id])">
              {{ pendingLevel(charOf(p)!) != null ? `Level ${pendingLevel(charOf(p)!)} offered` : `Level ${charOf(p)!.level + 1}` }}
            </button>
            <button class="ghost-btn pb-small" :disabled="(charOf(p)!.pbStatus?.basic?.heroPoints ?? 0) >= 3" title="Award a hero point" @click="pb.offerHeroPoint(campaignId, charOf(p)!)">+ Hero point</button>
            <span class="pb-group">
              <input v-model.number="coins[p.playerId]" class="pb-input pb-num" type="number" min="0" placeholder="gp" />
              <button class="ghost-btn pb-small" :disabled="!(coins[p.playerId] > 0)" title="From the party stash; comes back if declined" @click="sendCoins(p)">Send gp</button>
            </span>
            <span class="pb-group">
              <select v-model="checks[p.playerId]" class="pb-input">
                <option v-for="c in checkOptions(p)" :key="c.value" :value="c.value">{{ c.label }}</option>
              </select>
              <label class="pb-check"><input v-model="secret[p.playerId]" type="checkbox" /> secret</label>
              <button class="ghost-btn pb-small" @click="askRoll(p)">Ask to roll</button>
            </span>
          </div>
        </template>

        <div v-else class="pb-actions">
          <select v-model="linkTo[p.playerId]" class="pb-input">
            <option :value="null">— link to a party character —</option>
            <option v-for="c in unlinked" :key="c.id" :value="c.id">{{ c.name }}</option>
          </select>
          <button class="seal-btn pb-small" :disabled="linkTo[p.playerId] == null" @click="linkPlayer(p)">Link</button>
          <button class="ghost-btn pb-small" :disabled="!p.characterName" @click="pb.addFromPlayer(campaignId, p)">Add {{ p.characterName ?? 'character' }} to the party</button>
        </div>
      </div>

      <div v-if="pb.offers.value.length" class="pb-list">
        <div class="pb-list-head">
          <span>Offers and requests</span>
          <button class="ghost-btn pb-small" @click="pb.clearAnswered(campaignId)">Clear answered</button>
        </div>
        <div v-for="o in pb.offers.value.slice(0, 20)" :key="o.id" class="pb-row">
          <span class="pb-state" :class="`pb-state--${o.state}`">{{ STATE_LABEL[o.state] }}</span>
          <span class="pb-summary">{{ o.summary }}</span>
          <span v-if="o.reason" class="pb-dim">{{ o.reason }}</span>
          <button v-if="isOpen(o.state)" class="ghost-btn pb-small" @click="pb.withdraw(o)">Withdraw</button>
        </div>
      </div>

      <div v-if="pb.rolls.value.length" class="pb-list">
        <div class="pb-list-head"><span>Rolls</span></div>
        <div v-for="r in pb.rolls.value.slice(0, 12)" :key="r.rollId" class="pb-row">
          <span class="pb-roll-total">{{ r.total }}</span>
          <span class="pb-summary"><b>{{ r.characterName }}</b> · {{ r.label }} <span class="pb-dim">{{ r.formula }}</span></span>
          <span v-if="r.degree" class="pb-degree" :class="`pb-degree--${r.degree}`">{{ DEGREE_LABEL[r.degree] }}</span>
          <span v-if="r.secret" class="pb-chip">secret</span>
          <span class="pb-dim">{{ formatTime(r.at) }}</span>
        </div>
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
import type { GameId } from '~/types/game'
import { useParty, type Character } from '~/composables/useParty'
import { usePlayBuddy } from '~/composables/usePlayBuddy'
import { readShareFile } from '~/partylink/convert'
import type { Degree, LinkedPlayer } from '~/partylink/port'
import { signed } from '~/rules/format'

const props = defineProps<{ campaignId: number; characters: Character[]; game?: GameId }>()

const pb = usePlayBuddy()
const party = useParty()
/** The level a linked character was offered and hasn't answered yet, from the party's level-up history. */
const pendingLevel = (c: Character) => party.levelUps.value.find(l => !l.undoneAt && l.changes.some(ch => ch.characterId === c.id && ch.offer?.state === 'pending'))
  ?.changes.find(ch => ch.characterId === c.id)?.to ?? null
const port = ref(pb.conn.value.port)
const code = ref('')
const linkInfo = ref<{ gameId: string; gameName: string; lastSeq: number } | null>(null)
const linkTo = reactive<Record<string, number | null>>({})
const coins = reactive<Record<string, number>>({})
const checks = reactive<Record<string, string>>({})
const secret = reactive<Record<string, boolean>>({})

const STATE_LABEL: Record<string, string> = {
  outbox: 'Outbox', queued: 'Queued', delivered: 'Waiting', accepted: 'Accepted', declined: 'Declined',
  withdrawn: 'Withdrawn', expired: 'Expired', failed: 'Failed',
}
const DEGREE_LABEL: Record<Degree, string> = { criticalSuccess: 'Crit success', success: 'Success', failure: 'Failure', criticalFailure: 'Crit failure' }

const live = computed(() => pb.liveCampaign.value === props.campaignId)
const players = computed(() => pb.game.value?.players ?? [])
const unlinked = computed(() => props.characters.filter(c => !c.pbPlayerId))
const charOf = (p: LinkedPlayer) => props.characters.find(c => c.pbPlayerId === p.playerId) ?? null
const isOpen = (s: string) => s === 'outbox' || s === 'queued' || s === 'delivered'

async function loadLink() {
  linkInfo.value = await pb.campaignLink(props.campaignId)
}

onMounted(async () => {
  await loadLink()
  await pb.loadOffers(props.campaignId)
  if (pb.connected.value && !pb.game.value) await pb.loadGame()
})

async function connect() {
  await pb.connect(port.value, code.value)
  if (!pb.error.value) code.value = ''
}

async function linkCampaign() {
  await pb.linkCampaign(props.campaignId)
  await loadLink()
}

async function unlinkCampaign() {
  if (!confirm('Unlink this campaign from the Play Buddy game? Characters stay in the party with their last known items.')) return
  await pb.unlinkCampaign(props.campaignId)
  await loadLink()
}

async function linkPlayer(p: LinkedPlayer) {
  const id = linkTo[p.playerId]
  if (id == null) return
  await pb.linkCharacter(props.campaignId, id, p)
  linkTo[p.playerId] = null
}

async function refresh() {
  await pb.loadGame()
  await pb.refreshStatus(props.campaignId)
}

async function sendCoins(p: LinkedPlayer) {
  const c = charOf(p)
  const gp = coins[p.playerId]
  if (!c || !(gp > 0)) return
  await pb.offerCoins(props.campaignId, c, Math.round(gp * 100), `${gp} gp`)
  coins[p.playerId] = 0
}

/** Perception, saves and the skills the player shares. */
function checkOptions(p: LinkedPlayer) {
  const skills = Object.keys(charOf(p)?.pbStatus?.skills?.skills ?? {}).sort()
  return [
    { value: 'perception', label: 'Perception' }, { value: 'fortitude', label: 'Fortitude' },
    { value: 'reflex', label: 'Reflex' }, { value: 'will', label: 'Will' },
    ...skills.map(s => ({ value: `skill:${s}`, label: s.replace(/-/g, ' ').replace(/\b\w/g, x => x.toUpperCase()) })),
  ]
}

async function askRoll(p: LinkedPlayer) {
  const c = charOf(p)
  if (!c) return
  const check = checks[p.playerId] ?? 'perception'
  const label = checkOptions(p).find(o => o.value === check)?.label ?? check
  await pb.requestRoll(props.campaignId, c, check, { secret: !!secret[p.playerId], label })
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

// ── Share file ──
const share = ref<{ name: string; text: string } | null>(null)
const shareTarget = ref<number | null>(null)

async function onShareFile(e: Event) {
  const input = e.target as HTMLInputElement
  const f = input.files?.[0]
  input.value = ''
  if (!f) return
  const text = await f.text()
  const file = readShareFile(text)
  if (!file) { pb.error.value = `${f.name} is not a Play Buddy share file.`; return }
  share.value = { name: file.status.basic?.name ?? f.name, text }
  shareTarget.value = props.characters.find(c => c.name === file.status.basic?.name)?.id ?? null
}

async function applyShare() {
  if (!share.value || shareTarget.value == null) return
  const err = await pb.importShareFile(props.campaignId, shareTarget.value, share.value.text)
  if (err) pb.error.value = err
  share.value = null
}

defineExpose({ openShare: (name: string, text: string) => { share.value = { name, text }; shareTarget.value = props.characters.find(c => c.name === name)?.id ?? null } })
/** Play Buddy's game is the other system (it says which since API "Starfinder 2e"). */
const systemMismatch = computed(() => !!pb.game.value && (pb.game.value.system ?? 'pf2e') !== (props.game ?? 'pf2e'))
</script>

<style scoped>
/* Shared with the party page (its styles are scoped) */
.party-section { margin-bottom: 28px; }
.party-section-title { font-family: var(--fh, serif); font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--text3); }

.pb-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.pb-spacer { flex: 1; }
.pb-small { padding: 3px 10px; font-size: 12px; }
.pb-file { display: none; }
.pb-live { font-size: 11px; padding: 1px 7px; border-radius: 10px; border: 1px solid var(--border); color: var(--text3); }
.pb-live.on { color: #5fc98a; border-color: #5fc98a66; }
.pb-error { color: #e87a7a; font-size: 12.5px; margin: 0 0 8px; }
.pb-box { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--text2); margin-bottom: 8px; }
.pb-box b, .pb-meta b, .pb-who b, .pb-status b { color: var(--text); }
.pb-connect { align-items: flex-end; }
.pb-text { flex-basis: 100%; margin: 0 0 4px; line-height: 1.55; }
.pb-field { display: flex; flex-direction: column; gap: 3px; font-size: 11px; color: var(--text3); }
.pb-input { background: var(--bg); color: var(--text); border: 1px solid var(--border-hi); border-radius: 5px; padding: 3px 8px; font-size: 12px; }
.pb-port { width: 80px; }
.pb-code { width: 110px; font-family: var(--fm); letter-spacing: 0.1em; }
.pb-num { width: 70px; }
.pb-dim { color: var(--text3); font-size: 12px; }
.pb-meta { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text2); margin-bottom: 8px; }

.pb-player { border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; margin-bottom: 6px; display: flex; flex-direction: column; gap: 6px; }
.pb-who { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-size: 13px; }
.pb-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--text3); }
.pb-dot.on { background: #5fc98a; }
.pb-chip { font-size: 10.5px; padding: 0 6px; border-radius: 8px; border: 1px solid var(--border); color: var(--text3); }
.pb-status { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: var(--text2); }
.pb-hero { display: inline-flex; gap: 3px; }
.pb-hero-pip { width: 9px; height: 9px; border-radius: 50%; border: 1px solid #e8c44a99; }
.pb-hero-pip.on { background: #e8c44a; }
.pb-cond { font-size: 11px; padding: 0 6px; border-radius: 4px; background: oklch(54% 0.2 25 / 0.15); color: #e8a07a; }
.pb-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pb-group { display: inline-flex; align-items: center; gap: 4px; }
.pb-check { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--text2); }

.pb-list { margin-top: 10px; border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
.pb-list-head { display: flex; align-items: center; justify-content: space-between; padding: 5px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text3); background: var(--surface); }
.pb-row { display: flex; align-items: center; gap: 8px; padding: 5px 10px; border-top: 1px solid var(--border); font-size: 12.5px; color: var(--text2); }
.pb-summary { flex: 1; min-width: 0; }
.pb-summary b { color: var(--text); }
.pb-state { font-size: 10.5px; padding: 1px 7px; border-radius: 8px; border: 1px solid var(--border); color: var(--text3); white-space: nowrap; }
.pb-state--accepted { color: #5fc98a; border-color: #5fc98a66; }
.pb-state--declined, .pb-state--failed { color: #e87a7a; border-color: #e87a7a66; }
.pb-state--delivered, .pb-state--queued, .pb-state--outbox { color: #e8c44a; border-color: #e8c44a66; }
.pb-roll-total { font-family: var(--fm); font-size: 15px; font-weight: 700; color: var(--text); min-width: 28px; text-align: right; }
.pb-degree { font-size: 11px; }
.pb-degree--criticalSuccess, .pb-degree--success { color: #5fc98a; }
.pb-degree--failure, .pb-degree--criticalFailure { color: #e87a7a; }
</style>

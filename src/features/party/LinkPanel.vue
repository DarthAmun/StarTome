<script setup lang="ts">
/**
 * Play Buddy on the Party page: pair with the players' character app on this
 * computer, link the campaign to its open game and party members to its
 * players, ask for rolls, and see what was sent and what came back.
 */
import { computed, onMounted, ref } from 'vue'
import { Link2, RefreshCw, Unplug } from 'lucide-vue-next'
import type { GameId } from '@/domain/game'
import type { Character } from '@/domain/schema'
import { addFromPlayer, connect, disconnect, heroPointsForAll, importShareFile, link, linkCampaign, linkCharacter, loadGame, paired, ready, refreshHealth, unlinkCampaign, unlinkCharacter, type LinkedPlayer } from '@/services/characterLink/link'
import { confirmDialog, notify, reportError } from '@/ui/dialogs'
import { takePendingImport } from '@/ui/pendingImport'
import { campaign } from '@/ui/workbench'
import LinkOutbox from './LinkOutbox.vue'
import LinkRollForm from './LinkRollForm.vue'

const props = defineProps<{ campaignId: string; game: GameId; characters: Character[] }>()

const port = ref(link.port)
const code = ref('')
const info = computed(() => campaign.value?.characterLink ?? null)
const linked = computed(() => props.characters.filter(c => c.link))
const free = computed(() => props.characters.filter(c => !c.link && c.role === 'pc'))
const characterOf = (p: LinkedPlayer) => props.characters.find(c => c.link?.playerId === p.playerId)
const mismatch = computed(() => (link.game && link.game.system !== props.game ? `Play Buddy's game is ${link.game.system === 'sf2e' ? 'Starfinder' : 'Pathfinder'}, this campaign is ${props.game === 'sf2e' ? 'Starfinder' : 'Pathfinder'}: items will not match.` : ''))
const otherGame = computed(() => !!info.value && !!link.game && link.game.gameId !== info.value.gameId)
const run = (what: string, work: Promise<unknown>) => { void work.catch(err => reportError(what, err)) }

// A share file dropped on Import & Backup lands here
const shareText = ref<string | null>(null)
const shareFor = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
async function takeFile(file: File | null | undefined) { if (file) { shareText.value = await file.text(); shareFor.value ||= props.characters[0]?.id ?? '' } }

onMounted(async () => {
  await takeFile(takePendingImport())
  await ready()
  port.value = link.port
  if (paired() && !link.game) { await refreshHealth(); await loadGame() }
})

async function pairNow() {
  if (await connect(port.value, code.value, __APP_VERSION__)) { code.value = ''; notify('Paired with Play Buddy.', 'ok') }
}
async function unpair() {
  if (await confirmDialog({ title: 'Unpair from Play Buddy?', body: 'Linked characters stay linked and keep their last known numbers; nothing is sent or received until you pair again.', confirmLabel: 'Unpair' })) run('Unpairing', disconnect())
}
async function retry() { await refreshHealth(); await loadGame() }
async function unlinkAll() {
  if (await confirmDialog({ title: 'Unlink this campaign?', body: 'Every linked character becomes a plain party member again and keeps the items last seen in their app.', confirmLabel: 'Unlink' })) run('Unlinking', unlinkCampaign(props.campaignId))
}
function choose(p: LinkedPlayer, e: Event) {
  const v = (e.target as HTMLSelectElement).value
  if (v === 'new') run('Adding the character', addFromPlayer(props.campaignId, p))
  else if (v) run('Linking the character', linkCharacter(v, p))
}
async function heroPoints() {
  const n = await heroPointsForAll(props.campaignId).catch((err) => { reportError('Giving hero points', err); return 0 })
  if (n) notify(`Sent a hero point to ${n} ${n === 1 ? 'player' : 'players'}.`, 'ok')
}
async function importShare() {
  if (!shareText.value || !shareFor.value) return
  const problem = await importShareFile(shareFor.value, shareText.value).catch(err => String(err))
  if (problem) { notify(problem, 'error'); return }
  notify('Share file imported.', 'ok')
  shareText.value = null
}
</script>

<template>
  <section class="pb" data-test="link-panel">
    <div class="head">
      <h2>Play Buddy</h2>
      <span v-if="!paired()" class="faint">The players' character app. Not paired.</span>
      <span v-else-if="link.health && !link.health.ok" class="warn">{{ link.health.message }}</span>
      <span v-else-if="link.game" class="faint">Game “{{ link.game.name }}” · {{ link.game.players.filter(p => p.online).length }} of {{ link.game.players.length }} online<template v-if="link.liveCampaignId === campaignId"> · <span class="ok">following</span></template></span>
      <span class="grow" />
      <template v-if="paired()">
        <button class="btn btn-ghost btn-icon" title="Read the game again" @click="retry"><RefreshCw :size="14" /></button>
        <button v-if="info" class="btn" @click="unlinkAll">Unlink campaign</button>
        <button class="btn" title="Forget the pairing with Play Buddy on this computer" @click="unpair"><Unplug :size="14" /> Unpair</button>
      </template>
    </div>
    <p v-if="link.error" class="warn" data-test="link-error">{{ link.error }}</p>

    <div v-if="!paired()" class="line">
      <span class="dim">Open Play Buddy in GM mode on this computer, switch its API on, and type the code it shows.</span>
      <label class="field"><span class="label">Port</span><input v-model.number="port" class="input port" type="number" min="1" max="65535" aria-label="Play Buddy port" /></label>
      <label class="field"><span class="label">Code</span><input v-model="code" class="input code" inputmode="numeric" placeholder="123 456" data-test="link-code" @keydown.enter="pairNow" /></label>
      <button class="btn btn-primary" :disabled="link.busy || code.replace(/\D/g, '').length < 6" data-test="link-pair" @click="pairNow"><Link2 :size="14" /> Pair</button>
    </div>

    <template v-else-if="link.game">
      <p v-if="mismatch" class="warn">{{ mismatch }}</p>
      <div v-if="!info" class="line">
        <span>Play Buddy has “{{ link.game.name }}” open.</span>
        <button class="btn btn-primary" data-test="link-campaign" @click="run('Linking the campaign', linkCampaign(campaignId))">Link this campaign to it</button>
      </div>
      <p v-else-if="otherGame" class="warn">This campaign is linked to “{{ info.gameName }}”, but Play Buddy has “{{ link.game.name }}” open. Open the other game there, or unlink and link again.</p>
      <template v-else>
        <div v-for="p in link.game.players" :key="p.playerId" class="player" :data-player="p.name">
          <span class="dot" :class="{ on: p.online }" :title="p.online ? 'Online' : 'Offline: what you send waits for them'" />
          <b>{{ p.name }}</b>
          <span class="dim">{{ [p.characterName ?? 'no character chosen', p.level ? `level ${p.level}` : '', p.className ?? ''].filter(Boolean).join(' · ') }}</span>
          <span class="faint shares" :title="`Shares: ${p.shares.join(', ') || 'nothing'}`">shares {{ p.shares.join(', ') || 'nothing' }}</span>
          <template v-if="characterOf(p)">
            <span class="chip linked">→ {{ characterOf(p)?.name }}</span>
            <button class="btn" @click="run('Unlinking', unlinkCharacter(characterOf(p)!))">Unlink</button>
          </template>
          <select v-else class="input pick" :aria-label="`Party member of ${p.name}`" @change="choose(p, $event); ($event.target as HTMLSelectElement).value = ''">
            <option value="">link to…</option>
            <option v-for="c in free" :key="c.id" :value="c.id">{{ c.name }}</option>
            <option value="new">+ new party member{{ p.characterName ? `: ${p.characterName}` : '' }}</option>
          </select>
        </div>
        <div v-if="linked.length" class="line">
          <button class="btn" title="One hero point to every linked player, as at the start of a session" data-test="link-hero-all" @click="heroPoints">Hero point for everyone</button>
          <LinkRollForm :characters="linked" />
        </div>
      </template>
    </template>
    <p v-else-if="link.health?.ok && !link.health.gameOpen" class="dim">Play Buddy is running, but no game is open in GM mode.</p>

    <div class="line">
      <input ref="fileInput" type="file" accept=".json,application/json" hidden @change="takeFile(($event.target as HTMLInputElement).files?.[0])" />
      <template v-if="shareText">
        <span>Share file ready for</span>
        <select v-model="shareFor" class="input pick" aria-label="Character the share file is for"><option v-for="c in characters" :key="c.id" :value="c.id">{{ c.name }}</option></select>
        <button class="btn btn-primary" :disabled="!shareFor" data-test="share-import" @click="importShare">Import</button>
        <button class="btn" @click="shareText = null">Cancel</button>
      </template>
      <button v-else class="btn btn-ghost" :disabled="!characters.length" title="Without the live link: a file a player exported from Play Buddy, with the numbers and items they chose to share" @click="fileInput?.click()">Import a share file…</button>
    </div>

    <LinkOutbox :campaign-id="campaignId" />
  </section>
</template>

<style scoped>
.pb { display: flex; flex-direction: column; gap: .5rem; }
.head, .line, .player { display: flex; align-items: center; gap: .6rem; flex-wrap: wrap; }
.grow { flex: 1; }
.warn { color: var(--warn); margin: 0; } .ok { color: var(--ok); }
.field { display: flex; align-items: center; gap: .4rem; } .field .label { margin: 0; }
.port { width: 6rem; } .code { width: 7rem; letter-spacing: .12em; } .pick { width: auto; min-width: 11rem; }
.player { padding: .3rem .2rem; border-bottom: var(--frame); }
.player .shares { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--line-strong); } .dot.on { background: var(--ok); }
.chip.linked { color: var(--accent); border-color: color-mix(in srgb, var(--accent) 45%, var(--line)); }
</style>

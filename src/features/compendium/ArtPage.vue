<script setup lang="ts">
/**
 * Art from a folder: pick a folder of images, the files are matched to
 * compendium entries by name, you review the matches, and they become
 * portraits or token art. A sync never touches them.
 */
import { computed, onUnmounted, ref, shallowRef } from 'vue'
import { FolderOpen } from 'lucide-vue-next'
import { GAME_CONFIG, GAME_IDS, type GameId } from '@/domain/game'
import { bestMatch, MATCH_MIN, MATCH_SURE, normalizeName } from '@/domain/imageMatch'
import { RULES_KIND_CONFIG, RULES_KINDS, type RulesKind } from '@/domain/rules/types'
import { rulesNameList, rulesUpdate } from '@/data/rules'
import { storeImage, toJpeg } from '@/services/images'
import { reportError } from '@/ui/dialogs'
import { campaign } from '@/ui/workbench'
import CompendiumTabs from './CompendiumTabs.vue'

type Phase = 'configure' | 'matching' | 'review' | 'applying' | 'done'
interface Row { file: File; url: string; score: number; selectedId: string | null; apply: boolean }

const phase = ref<Phase>('configure')
const game = ref<GameId>(campaign.value?.game ?? 'pf2e')
const kind = ref<RulesKind>('creature')
const field = ref<'img' | 'tokenImg'>('img')
const jpeg = ref(false)
const files = shallowRef<File[]>([])
const rows = ref<Row[]>([])
const records = shallowRef<{ id: string; name: string }[]>([])
const showUnmatched = ref(false)
const progress = ref(0)
const done = ref({ updated: 0, skipped: 0 })
const urls: string[] = []
const input = ref<HTMLInputElement | null>(null)

const IMAGE = /\.(jpe?g|png|webp|gif|bmp|avif)$/i
function onFolder(e: Event) {
  const el = e.target as HTMLInputElement
  files.value = Array.from(el.files ?? []).filter(f => IMAGE.test(f.name) || f.type.startsWith('image/'))
  el.value = ''
}
function urlFor(file: File): string { const u = URL.createObjectURL(file); urls.push(u); return u }
function revoke() { for (const u of urls) URL.revokeObjectURL(u); urls.length = 0 }
onUnmounted(revoke)

async function match() {
  phase.value = 'matching'; progress.value = 0
  try {
    records.value = (await rulesNameList(kind.value, [game.value])).sort((a, b) => a.name.localeCompare(b.name))
    const norm = records.value.map(r => ({ id: r.id, norm: normalizeName(r.name) }))
    revoke()
    const out: Row[] = []
    for (let i = 0; i < files.value.length; i++) {
      const file = files.value[i] as File
      const m = bestMatch(file.name, norm)
      // Unmatched files get their preview only when they are shown
      out.push({ file, url: m.id ? urlFor(file) : '', score: m.score, selectedId: m.id, apply: !!m.id })
      if (i % 150 === 149) { progress.value = Math.round((i / files.value.length) * 100); await new Promise(r => setTimeout(r, 0)) }
    }
    rows.value = out.sort((a, b) => Number(b.apply) - Number(a.apply) || b.score - a.score)
    phase.value = 'review'
  } catch (err) { reportError('Matching the images', err); phase.value = 'configure' }
}

const visible = computed(() => (showUnmatched.value ? rows.value : rows.value.filter(r => r.score >= MATCH_MIN)))
function revealUnmatched() { showUnmatched.value = !showUnmatched.value; if (showUnmatched.value) for (const r of rows.value) r.url ||= urlFor(r.file) }
const count = (test: (r: Row) => boolean) => rows.value.filter(test).length
const applyCount = computed(() => count(r => r.apply && r.selectedId !== null))
function pick(r: Row, id: string) { r.selectedId = id || null; r.apply = !!id }
const tone = (s: number) => (s >= MATCH_SURE ? 'sure' : s >= MATCH_MIN ? 'maybe' : 'none')

async function apply() {
  const todo = rows.value.filter(r => r.apply && r.selectedId !== null)
  phase.value = 'applying'; progress.value = 0; done.value = { updated: 0, skipped: 0 }
  for (const [i, r] of todo.entries()) {
    try {
      const ref = await storeImage(jpeg.value ? await toJpeg(r.file) : r.file)
      const saved = 'imageId' in ref && r.selectedId ? await rulesUpdate(r.selectedId, field.value, `img:${ref.imageId}`) : undefined
      if (saved) done.value.updated++; else done.value.skipped++
    } catch { done.value.skipped++ }
    progress.value = Math.round(((i + 1) / todo.length) * 100)
  }
  phase.value = 'done'
}
function reset() { phase.value = 'configure'; files.value = []; rows.value = []; revoke(); showUnmatched.value = false }
</script>

<template>
  <div class="wrap">
    <CompendiumTabs />
    <div class="page">
      <div class="page-head"><h1>Art from a folder</h1></div>

      <section v-if="phase === 'configure'">
        <p class="dim">Files are matched to entries by name: <code>goblin-warrior.png</code> finds “Goblin Warrior”. You review every match before anything is stored. Images keep their format unless you ask for JPEG.</p>
        <div class="grid">
          <label><span class="label">Game</span><select v-model="game" class="input"><option v-for="g in GAME_IDS" :key="g" :value="g">{{ GAME_CONFIG[g].label }}</option></select></label>
          <label><span class="label">Entries</span><select v-model="kind" class="input" @change="field = 'img'"><option v-for="k in RULES_KINDS" :key="k" :value="k">{{ RULES_KIND_CONFIG[k].plural }}</option></select></label>
          <label><span class="label">Use as</span><select v-model="field" class="input"><option value="img">Portrait</option><option v-if="kind === 'creature'" value="tokenImg">Token art</option></select></label>
        </div>
        <label class="dim"><input v-model="jpeg" type="checkbox" /> Convert to JPEG (smaller; transparency is lost)</label>
        <div class="actions">
          <input ref="input" type="file" webkitdirectory multiple hidden @change="onFolder" />
          <button class="btn" @click="input?.click()"><FolderOpen :size="15" /> Choose a folder…</button>
          <span v-if="files.length" class="dim">{{ files.length.toLocaleString() }} images</span>
          <span class="grow" />
          <button class="btn btn-primary" :disabled="!files.length" @click="match">Match to {{ RULES_KIND_CONFIG[kind].plural.toLowerCase() }}</button>
        </div>
      </section>

      <section v-if="phase === 'matching' || phase === 'applying'">
        <div class="bar"><div :style="{ width: `${progress}%` }" /></div>
        <p class="dim">{{ phase === 'matching' ? 'Matching file names…' : 'Storing images…' }} {{ progress }}%</p>
      </section>

      <section v-if="phase === 'review'">
        <div class="actions">
          <span class="chip sure">{{ count(r => r.score >= MATCH_SURE) }} sure</span><span class="chip maybe">{{ count(r => r.score >= MATCH_MIN && r.score < MATCH_SURE) }} likely</span>
          <button class="chip none" @click="revealUnmatched">{{ count(r => r.score < MATCH_MIN) }} unmatched · {{ showUnmatched ? 'hide' : 'show' }}</button>
          <span class="grow" />
          <button class="btn" @click="rows.forEach(r => { if (r.score < MATCH_SURE) r.apply = false })">Only the sure ones</button>
          <button class="btn" @click="reset">Start over</button>
          <button class="btn btn-primary" :disabled="!applyCount" @click="apply">Use {{ applyCount }} image{{ applyCount === 1 ? '' : 's' }}</button>
        </div>
        <div class="matches">
          <div v-for="r in visible" :key="r.file.webkitRelativePath || r.file.name" class="match panel" :class="{ off: !r.apply }">
            <img v-if="r.url" :src="r.url" alt="" loading="lazy" />
            <div class="info">
              <span class="file" :title="r.file.name">{{ r.file.name }}</span>
              <select class="input" :value="r.selectedId ?? ''" @change="pick(r, ($event.target as HTMLSelectElement).value)"><option value="">not used</option><option v-for="rec in records" :key="rec.id" :value="rec.id">{{ rec.name }}</option></select>
              <label class="faint"><input v-model="r.apply" type="checkbox" :disabled="!r.selectedId" /> use <span class="num" :class="tone(r.score)">{{ Math.round(r.score * 100) }}%</span></label>
            </div>
          </div>
        </div>
      </section>

      <section v-if="phase === 'done'">
        <h2>{{ done.updated }} {{ field === 'img' ? 'portraits' : 'token images' }} set</h2>
        <p v-if="done.skipped" class="dim">{{ done.skipped }} could not be stored.</p>
        <div class="actions"><button class="btn" @click="reset">Import another folder</button><RouterLink class="btn btn-primary" :to="{ name: 'compendium', query: { kind } }">Open the compendium</RouterLink></div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.wrap { height: 100%; display: flex; flex-direction: column; }
.page { flex: 1; }
section { display: flex; flex-direction: column; gap: .8rem; max-width: 1100px; }
section p { margin: 0; }
.grid { display: grid; grid-template-columns: repeat(3, 220px); gap: .8rem; }
.actions { display: flex; align-items: center; gap: .5rem; flex-wrap: wrap; }
.grow { flex: 1; }
.bar { height: 6px; background: var(--bg-sunken); border: var(--frame); }
.bar div { height: 100%; background: var(--accent); }
.matches { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: .5rem; }
.match { display: flex; gap: .6rem; padding: .4rem; }
.match.off { opacity: .55; }
.match img { width: 64px; height: 64px; object-fit: cover; border-radius: var(--radius); flex: none; }
.info { display: flex; flex-direction: column; gap: .2rem; min-width: 0; flex: 1; }
.file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .85rem; }
.sure { color: var(--ok); } .maybe { color: var(--warn); } .none { color: var(--text-faint); background: none; cursor: pointer; }
</style>

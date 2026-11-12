/** Legacy conversion, part 4: sounds, map assets, compendium rows, and what v0.42 kept in localStorage. */
import { arr, bool, dropped, imageRef, iso, mapped, note, noteImageIds, num, numOrNull, obj, push, rowsOf, str, strOrNull, tally, type Ctx, type IdMap, type Row } from './context'
import { workspaceId } from '@/domain/schema'

export function convertSounds(ctx: Ctx): void {
  for (const s of rowsOf(ctx, 'soundTracks')) {
    const t = tally(ctx, 'soundTracks'); t.read++
    const id = mapped(ctx.map.track, s.id)
    if (!id) { dropped(ctx, 'soundTracks', s, 'it has no id'); continue }
    const type = s.type === 'url' || s.type === 'spotify' ? s.type : 'file'
    const handle = obj(s.fileHandle)
    const ts = iso(s.updatedAt, ctx.now)
    push(ctx, 'soundTracks', {
      id, name: str(s.name, 'Track'), type, src: str(s.src), fileName: strOrNull(s.fileName) ?? strOrNull(handle.name),
      duration: numOrNull(s.duration), tags: arr(s.tags).map(x => str(x)).filter(Boolean), createdAt: iso(s.createdAt, ts), updatedAt: ts,
    })
    t.converted++
  }
  for (const p of rowsOf(ctx, 'soundPlaylists')) {
    const t = tally(ctx, 'soundPlaylists'); t.read++
    const id = mapped(ctx.map.list, p.id)
    if (!id) { dropped(ctx, 'soundPlaylists', p, 'it has no id'); continue }
    const ts = iso(p.updatedAt, ctx.now)
    push(ctx, 'soundPlaylists', {
      id, name: str(p.name, 'Playlist'), description: str(p.description), color: strOrNull(p.color),
      trackIds: arr(p.trackIds).map(x => mapped(ctx.map.track, x)).filter((x): x is string => x !== null),
      loop: bool(p.loop), shuffle: bool(p.shuffle), createdAt: iso(p.createdAt, ts), updatedAt: ts,
    })
    t.converted++
  }
}

export function convertMapAssets(ctx: Ctx): void {
  for (const a of rowsOf(ctx, 'mapAssets')) {
    const t = tally(ctx, 'mapAssets'); t.read++
    const id = mapped(ctx.map.asset, a.id), ref = imageRef(ctx, a.image)
    if (!id || !ref || !('imageId' in ref)) { dropped(ctx, 'mapAssets', a, 'it has no stored image'); continue }
    push(ctx, 'mapAssets', { id, name: str(a.name, 'Asset'), imageId: ref.imageId, pxWidth: num(a.px_width), pxHeight: num(a.px_height), folder: strOrNull(a.folder), createdAt: iso(a.created_at, ctx.now) })
    t.converted++
  }
}

/** Compendium rows keep their shape and their string ids; only their images are noted. */
export function convertRules(ctx: Ctx): void {
  for (const r of rowsOf(ctx, 'rules')) {
    const t = tally(ctx, 'rules'); t.read++
    if (typeof r.id !== 'string' || typeof r.kind !== 'string' || typeof r.name !== 'string') { dropped(ctx, 'rules', r, 'it has no id, kind or name'); continue }
    noteImageIds(ctx, [r.img, r.tokenImg])
    push(ctx, 'rules', { ...r, sortName: str(r.sortName, r.name.toLowerCase()), level: num(r.level), origin: r.origin === 'foundry' || r.origin === 'legacy' ? r.origin : 'user', game: r.game === 'sf2e' || r.game === 'both' ? r.game : 'pf2e' })
    t.converted++
  }
  for (const o of rowsOf(ctx, 'rulesOverlays')) {
    const t = tally(ctx, 'rulesOverlays'); t.read++
    if (typeof o.id !== 'string') { t.dropped++; continue }
    noteImageIds(ctx, [o.img, o.tokenImg])
    push(ctx, 'rulesOverlays', o)
    t.converted++
  }
  for (const s of rowsOf(ctx, 'syncState')) {
    if (s.game === 'pf2e' || s.game === 'sf2e') push(ctx, 'syncState', s)
  }
}

// ── localStorage ───────────────────────────────────────────────────────────

const ACCENTS: Record<string, string> = {
  crimson: '#dc2626', gold: '#d97706', forest: '#16a34a', ocean: '#2563eb', rose: '#e11d48', teal: '#0d9488', ember: '#ea580c',
}

function json(raw: string | undefined): unknown {
  if (raw === undefined) return undefined
  try { return JSON.parse(raw) } catch { return undefined }
}

/** Rewrites `entityId` / `encounterId` wherever they sit in a saved layout; a widget whose target is gone keeps null. */
function remapWidgets(ctx: Ctx, value: unknown): unknown {
  if (Array.isArray(value)) return value.map(v => remapWidgets(ctx, v))
  if (!value || typeof value !== 'object') return value
  const out: Row = {}
  for (const [k, v] of Object.entries(value)) {
    if (k === 'entityId') out.entryId = mapped(ctx.map.ent, v)
    else if (k === 'encounterId') out.encounterId = mapped(ctx.map.enc, v)
    else out[k] = remapWidgets(ctx, v)
  }
  return out
}

function setWorkspace(ctx: Ctx, campaignId: string, key: string, value: unknown): void {
  push(ctx, 'workspace', { id: workspaceId(campaignId, key), campaignId, key, value, updatedAt: ctx.now })
}

/** Keys that end in a campaign's old id: `startome.<prefix><id>`. */
function perCampaign(state: Record<string, string>, prefix: string, m: IdMap): [string, string][] {
  const out: [string, string][] = []
  for (const [key, raw] of Object.entries(state)) {
    if (!key.startsWith(prefix)) continue
    const campaignId = mapped(m, key.slice(prefix.length))
    if (campaignId) out.push([campaignId, raw])
  }
  return out
}

/**
 * GM screen layouts, saved layouts, scratchpad, NPC generator, builder draft and
 * settings become rows. Bookmarks and view preferences are kept as they were
 * under `legacy.*` keys; the phases that rebuild those screens read them.
 */
export function convertLocalState(ctx: Ctx): void {
  const state = ctx.payload.localState
  if (!state || typeof state !== 'object') {
    note(ctx, 'This file has no saved layouts or settings (backups before v0.42 did not include them): GM screen layouts, bookmarks and settings start fresh')
    return
  }
  const ns = 'startome.'
  let converted = 0
  for (const [campaignId, raw] of perCampaign(state, `${ns}dmscreen-v4-`, ctx.map.camp)) {
    const widgets = json(raw)
    if (Array.isArray(widgets)) { setWorkspace(ctx, campaignId, 'desk.layout', remapWidgets(ctx, widgets)); converted++ }
  }
  for (const [campaignId, raw] of perCampaign(state, `${ns}dmscreen-presets-`, ctx.map.camp)) {
    const presets = json(raw)
    if (Array.isArray(presets)) { setWorkspace(ctx, campaignId, 'desk.presets', remapWidgets(ctx, presets)); converted++ }
  }
  for (const [campaignId, raw] of perCampaign(state, `${ns}dmscreen-scratch-v2-`, ctx.map.camp)) {
    if (raw) { setWorkspace(ctx, campaignId, 'desk.scratchpad', raw); converted++ }
  }
  for (const [campaignId, raw] of perCampaign(state, `${ns}dmscreen-npcgen-v1-`, ctx.map.camp)) {
    const cfg = json(raw)
    if (cfg !== undefined) { setWorkspace(ctx, campaignId, 'desk.npcgen', cfg); converted++ }
  }
  for (const [campaignId, raw] of perCampaign(state, `${ns}encounterBuilder.`, ctx.map.camp)) {
    const draft = json(raw)
    if (draft !== undefined) { setWorkspace(ctx, campaignId, 'builder.draft', draft); converted++ }
  }

  const old = obj(json(state[`${ns}settings`]))
  if (Object.keys(old).length) {
    const preset = str(old.accentPreset)
    push(ctx, 'settings', {
      id: 'app', mode: old.theme === 'light' || old.theme === 'parchment' ? 'light' : 'dark',
      accent: preset === 'custom' ? strOrNull(old.accentCustom) : ACCENTS[preset] ?? null,
      size: old.fontSize === 'compact' || old.fontSize === 'large' ? old.fontSize : 'normal',
      reduceMotion: old.pageAnimations === false,
    })
    converted++
  }

  // Not rebuilt yet: kept word for word
  const rest: Record<string, string> = {}
  for (const [key, raw] of Object.entries(state)) {
    if (/^startome\.(bookmarks|overview\.|compendium\.|editor\.viewmode|playerView|session\.|cmd-ctx|homebrew-game)/.test(key)) rest[key.slice(ns.length)] = raw
  }
  if (Object.keys(rest).length) setWorkspace(ctx, '', 'legacy.localState', rest)
  tally(ctx, 'localState').read = Object.keys(state).length
  tally(ctx, 'localState').converted = converted + Object.keys(rest).length
}

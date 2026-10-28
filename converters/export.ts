/**
 * StarTome's own export format, kept compatible with DM's Tome's `version: 1`
 * files: lore tables stay byte-compatible, compendium data travels under new
 * keys (FORK_PLAN §8.5).
 *
 * - `rules`: user and legacy entries in full.
 * - `rulesOverlays`: only the user-owned fields of synced Foundry entries
 *   (portraits, notes, favourites, local edits …). The synced content itself is
 *   never exported: an import re-attaches the overlays to the entries the
 *   receiving browser has synced, and `syncState` says which version that was.
 * - `images`: the blobs the exported entries reference, as data URLs.
 *
 * Pure functions; the settings page does the IO.
 */
import { USER_OWNED_FIELDS } from '~/rules/edits'
import { isImageRef, imageRefId } from '~/rules/images'
import { stripGmOnly } from '~/utils/gmContent'
import { ENTITY_REGEX } from '~/composables/useEntityParser'
import type { GameId } from '~/types/game'
import type { Item, Money, Rarity, RulesEntity } from '~/types/rules'

export type RulesOverlay = { id: string } & Record<string, unknown>

export interface ExportedImage { id: string; mime: string; data: string }

function hasValue(v: unknown): boolean {
  if (v === undefined || v === null || v === '' || v === false) return false
  if (Array.isArray(v)) return v.length > 0
  if (typeof v === 'object') return Object.keys(v as object).length > 0
  return true
}

/** Splits compendium rows into full entries (user/legacy) and overlays (synced). */
export function rulesForExport(rows: RulesEntity[]): { entries: RulesEntity[]; overlays: RulesOverlay[] } {
  const entries: RulesEntity[] = []
  const overlays: RulesOverlay[] = []
  for (const row of rows) {
    if (row.origin !== 'foundry') { entries.push(row); continue }
    const overlay: RulesOverlay = { id: row.id }
    for (const key of USER_OWNED_FIELDS) {
      const v = (row as unknown as Record<string, unknown>)[key]
      if (hasValue(v)) overlay[key] = v
    }
    if (Object.keys(overlay).length > 1) overlays.push(overlay)
  }
  return { entries, overlays }
}

/** Image-store ids referenced by `img`/`tokenImg` of entries and overlays. */
export function imageIdsOf(items: Array<Record<string, unknown>>): string[] {
  const ids = new Set<string>()
  for (const item of items) {
    for (const key of ['img', 'tokenImg']) {
      const v = item[key]
      if (isImageRef(v)) ids.add(imageRefId(v))
    }
  }
  return [...ids]
}

export interface RulesImportPlan {
  put: RulesEntity[]
  /** Overlays whose synced entry isn't in this browser's compendium. */
  missing: string[]
}

/**
 * What to write for an imported `rules`/`rulesOverlays` pair. Entries replace
 * rows of the same id; overlays are merged onto synced rows (their fields win,
 * the synced content stays).
 */
export function planRulesImport(
  existing: Map<string, RulesEntity>,
  entries: RulesEntity[],
  overlays: RulesOverlay[],
  now: string,
): RulesImportPlan {
  const put: RulesEntity[] = entries.map(e => ({ ...e, sortName: e.sortName ?? e.name.toLowerCase() }))
  const missing: string[] = []
  for (const { id, ...fields } of overlays) {
    const row = existing.get(id)
    if (!row || row.origin !== 'foundry') { missing.push(id); continue }
    const owned = Object.fromEntries(Object.entries(fields).filter(([k]) => USER_OWNED_FIELDS.has(k)))
    put.push({ ...row, ...owned, updatedAt: now } as RulesEntity)
  }
  return { put, missing }
}

// ── Quest board ─────────────────────────────────────────────────────────────

/** Names of `{{item: Name}}` refs (parseEntityRefs only returns lore types). */
export function itemRefNames(markdown: string): string[] {
  const re = new RegExp(ENTITY_REGEX.source, 'g')
  const out: string[] = []
  for (const m of markdown.matchAll(re)) if (m[1].toLowerCase() === 'item') out.push(m[2].trim())
  return out
}

export interface QuestBoardItem {
  name: string
  compendiumId: string | null
  level: number | null
  price: Money | null
  rarity: Rarity | null
  traits: string[]
}

export interface QuestBoardQuest {
  id: number
  name: string
  status: string | null
  giver: string | null
  description: string
  reward: string
  rewardItems: QuestBoardItem[]
}

export interface QuestBoardExport {
  version: 1
  app: string
  type: 'questboard'
  exportedAt: string
  campaign: { name: string; game: GameId }
  quests: QuestBoardQuest[]
}

export interface QuestInput {
  id: number
  name: string
  content: string
  attributes: { status?: string; questGiver?: string; reward?: string } & Record<string, unknown>
}

/**
 * Player-safe quest list: GM-only blocks stripped from description and reward,
 * `{{item: Name}}` refs in either resolved against the compendium.
 */
export function buildQuestBoard(
  app: string,
  campaign: { name: string; game: GameId },
  quests: QuestInput[],
  resolveItem: (name: string) => Item | undefined,
  exportedAt: string,
): QuestBoardExport {
  return {
    version: 1,
    app,
    type: 'questboard',
    exportedAt,
    campaign,
    quests: quests.map((q) => {
      const description = stripGmOnly(q.content ?? '')
      const reward = stripGmOnly(q.attributes.reward ?? '')
      const names = new Map<string, string>()
      for (const name of [...itemRefNames(reward), ...itemRefNames(description)]) names.set(name.toLowerCase(), name)
      const rewardItems = [...names.values()].map((name): QuestBoardItem => {
        const item = resolveItem(name)
        return item
          ? { name: item.name, compendiumId: item.id, level: item.level, price: item.price, rarity: item.rarity, traits: item.traits }
          : { name, compendiumId: null, level: null, price: null, rarity: null, traits: [] }
      })
      return {
        id: q.id,
        name: q.name,
        status: q.attributes.status ?? null,
        giver: q.attributes.questGiver ?? null,
        description,
        reward,
        rewardItems,
      }
    }),
  }
}

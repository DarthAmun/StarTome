/**
 * The character link's state, one per app: the pairing with Play Buddy on
 * this computer, its health, the open game and its players, recent rolls.
 * The screens read this; link.ts and outbox.ts change it.
 */
import { reactive } from 'vue'
import type { ShareLevel } from '@/domain/schema'
import { pairing } from '@/data/link'
import { baseUrlFor, createClient, DEFAULT_PORT, type LinkClient, type Probe } from './client'
import type * as W from './wire'

export interface LinkedPlayer {
  playerId: string
  name: string
  online: boolean
  shares: ShareLevel[]
  autoAccept: { items: boolean; coins: boolean; levelUp: boolean; heroPoints: boolean; rolls: boolean; damage: boolean }
  characterId: string | null
  characterName: string | null
  level: number | null
  className: string | null
}
export interface LinkedGame { gameId: string; name: string; system: W.System; players: LinkedPlayer[] }
export interface RollLine { id: string; at: string; who: string; line: string; secret: boolean }

export const link = reactive({
  port: DEFAULT_PORT,
  token: null as string | null,
  clientId: null as string | null,
  health: null as Probe | null,
  game: null as LinkedGame | null,
  error: '',
  busy: false,
  /** Recent rolls of this sitting, newest first. */
  rolls: [] as RollLine[],
  /** The campaign whose game is being followed. */
  liveCampaignId: null as string | null,
})

export const paired = (): boolean => !!link.token

let loaded: Promise<void> | null = null
/** Reads the pairing kept on this device, once. */
export function ready(): Promise<void> {
  loaded ??= pairing.get(DEFAULT_PORT).then((p) => { Object.assign(link, p) }).catch(() => undefined)
  return loaded
}
export const savePairing = () => pairing.set({ port: link.port, token: link.token, clientId: link.clientId })

let fetcher: typeof fetch | undefined
/** Tests reach the mock server with Node's fetch. */
export function useFetchForTests(f: typeof fetch | undefined): void { fetcher = f }
export const client = (): LinkClient => createClient({ baseUrl: baseUrlFor(link.port), token: link.token }, fetcher)
export const currentFetch = () => fetcher

export function playerFromWire(p: W.PlayerInfo, sheet: W.Sheet | null | undefined, before?: LinkedPlayer): LinkedPlayer {
  const b = sheet?.basic, a = p.autoAccept ?? {}
  return {
    playerId: p.playerId, name: p.displayName, online: p.online, shares: p.shares ?? [],
    autoAccept: { items: !!a.items, coins: !!a.coins, levelUp: !!a.levelUp, heroPoints: !!a.heroPoints, rolls: !!a.rolls, damage: !!a.damage },
    characterId: sheet?.characterId ?? before?.characterId ?? null,
    characterName: b?.name ?? before?.characterName ?? null,
    level: b?.level ?? before?.level ?? null,
    className: b ? [b.class, b.class2].filter(Boolean).join(' / ') || null : before?.className ?? null,
  }
}

export type NoticeKind = 'info' | 'ok' | 'error'
let noticeHandler: (text: string, kind: NoticeKind) => void = () => undefined
/** The shell shows the link's notices the way it shows every other. */
export function onLinkNotice(handler: (text: string, kind: NoticeKind) => void): void { noticeHandler = handler }
export const say = (text: string, kind: NoticeKind = 'info') => noticeHandler(text, kind)
export const explain = (err: unknown): string => (err instanceof Error ? err.message : String(err))

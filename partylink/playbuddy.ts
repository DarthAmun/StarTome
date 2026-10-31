/**
 * PlayBuddyLink: the PartyLink port over Play Buddy's GM API v1
 * (PLAYBUDDY_API.md). HTTP to the GM's own Play Buddy on 127.0.0.1, Bearer
 * token from pairing, long-polled events. Wire ⇄ port through convert/.
 */
import {
  deliveriesFromWire, eventFromWire, gameFromWire, offerToWire, requestToWire, statusFromWire, type ItemResolver,
} from '~/partylink/convert'
import { LinkError, type LinkEvent, type PartyLink } from '~/partylink/port'
import type * as W from '~/partylink/wire/v1'

export const DEFAULT_PORT = 47110
export const API_MAJOR = '1'

export interface PlayBuddyConnection {
  baseUrl: string
  token: string | null
  clientId: string | null
}

export function baseUrlFor(port: number) {
  return `http://127.0.0.1:${port}`
}

type Fetch = typeof fetch

/** One HTTP call; API errors become LinkErrors with Play Buddy's code. */
async function call<T>(conn: PlayBuddyConnection, f: Fetch, method: string, path: string, opts: { body?: unknown; key?: string; signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.auth !== false && conn.token) headers.Authorization = `Bearer ${conn.token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.key) headers['Idempotency-Key'] = opts.key
  let res: Response
  try {
    res = await f(`${conn.baseUrl}${path}`, {
      method, headers, signal: opts.signal,
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new LinkError('unreachable', `Play Buddy isn't reachable at ${conn.baseUrl}. Is it open in GM mode with the API switched on?`)
  }
  if (res.status === 204) return undefined as T
  let data: any = null
  try { data = await res.json() } catch {}
  if (!res.ok) {
    const e = (data as W.ApiError | null)?.error
    throw new LinkError(e?.code ?? `http-${res.status}`, e?.message ?? `Play Buddy answered ${res.status}`)
  }
  return data as T
}

/** Pairing: trades the code Play Buddy shows for a token. */
export async function pair(baseUrl: string, code: string, clientVersion: string, f: Fetch = fetch): Promise<W.PairResponse> {
  return call<W.PairResponse>({ baseUrl, token: null, clientId: null }, f, 'POST', '/v1/pair', {
    auth: false, body: { code: code.replace(/\s+/g, ''), client: 'StarTome', clientVersion } satisfies W.PairRequest,
  })
}

export function createPlayBuddyLink(conn: PlayBuddyConnection, resolve: ItemResolver, f: Fetch = (...a) => fetch(...a)): PartyLink {
  const get = <T>(path: string, signal?: AbortSignal) => call<T>(conn, f, 'GET', path, { signal })

  return {
    id: 'playbuddy',
    capabilities: { status: true, offers: true, requests: true, catalog: true, live: true },

    async probe() {
      let h: W.Health
      try { h = await call<W.Health>(conn, f, 'GET', '/v1/health', { auth: false }) }
      catch (err) { return { ok: false, reason: 'unreachable', message: (err as Error).message } }
      if (h.app !== 'playbuddy' || h.apiVersion.split('.')[0] !== API_MAJOR) {
        return { ok: false, reason: 'incompatible', message: `${h.app} API ${h.apiVersion}; StarTome speaks ${API_MAJOR}.x` }
      }
      if (!conn.token) return { ok: false, reason: 'unauthorized', message: 'Not paired yet' }
      return { ok: true, appVersion: h.appVersion, apiVersion: h.apiVersion, rulesVersion: h.rulesVersion, gameOpen: h.game.open, apiEnabled: h.game.apiEnabled }
    },

    async game() {
      return gameFromWire(await get<W.Game>('/v1/game'))
    },

    async status(playerIds, levels) {
      const q = `levels=${levels.join(',')}`
      if (playerIds === 'all') {
        const res = await get<{ players: W.StatusResponse[] }>(`/v1/status?${q}`)
        return res.players.map(s => statusFromWire(s, resolve))
      }
      const out = []
      for (const id of playerIds) {
        try { out.push(statusFromWire(await get<W.StatusResponse>(`/v1/players/${encodeURIComponent(id)}/status?${q}`), resolve)) }
        catch (err) {
          // Nothing of what was asked is shared: that's an answer, not a failure
          if (err instanceof LinkError && err.code === 'notShared') out.push({ playerId: id, characterId: '', at: new Date().toISOString(), notShared: levels })
          else throw err
        }
      }
      return out
    },

    async sendOffer(key, to, offer, note) {
      const body: W.OfferRequest = { to, payload: offerToWire(offer), ...(note ? { note } : {}) }
      const o = await call<W.Offer>(conn, f, 'POST', '/v1/offers', { body, key })
      return { offerId: o.offerId, deliveries: deliveriesFromWire(o.deliveries) }
    },

    async getOffer(offerId) {
      const o = await get<W.Offer>(`/v1/offers/${encodeURIComponent(offerId)}`)
      return { offerId: o.offerId, deliveries: deliveriesFromWire(o.deliveries) }
    },

    async withdrawOffer(offerId) {
      const o = await call<W.Offer>(conn, f, 'DELETE', `/v1/offers/${encodeURIComponent(offerId)}`)
      return { offerId: o.offerId, deliveries: deliveriesFromWire(o.deliveries) }
    },

    async sendRequest(key, to, request) {
      const r = await call<W.RequestCreated>(conn, f, 'POST', '/v1/requests', { body: requestToWire(to, request), key })
      return { requestId: r.requestId, deliveries: deliveriesFromWire(r.deliveries) }
    },

    async withdrawRequest(requestId) {
      await call<unknown>(conn, f, 'DELETE', `/v1/requests/${encodeURIComponent(requestId)}`)
    },

    async searchCatalog(q) {
      const res = await get<{ items: W.CatalogItem[] }>(`/v1/catalog/items?q=${encodeURIComponent(q)}&limit=20`)
      return res.items.map(i => ({ slug: i.ref.slug, foundryId: i.ref.foundryId ?? null, name: i.name, level: i.level, priceCp: i.price }))
    },

    async events(after, waitS, signal) {
      const res = await get<W.EventsResponse>(`/v1/events?after=${after}&wait=${Math.min(30, Math.max(0, waitS))}`, signal)
      const events = res.events.map(e => eventFromWire(e, resolve)).filter((e): e is LinkEvent => !!e)
      return { events, lastSeq: res.lastSeq, resetRequired: !!res.resetRequired }
    },
  }
}

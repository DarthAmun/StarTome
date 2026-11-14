/**
 * The HTTP client for Play Buddy's GM API (PLAYBUDDY_API.md): the GM's own
 * Play Buddy on 127.0.0.1, a Bearer token from pairing, long-polled events.
 */
import type * as W from './wire'

export const DEFAULT_PORT = 47110
export const API_MAJOR = '1'
export const baseUrlFor = (port: number) => `http://127.0.0.1:${port}`

export interface Connection { baseUrl: string; token: string | null }
type Fetch = typeof fetch

/** A failure the screens can explain: a code from the API, or `unreachable`. */
export class LinkError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message)
    this.name = 'LinkError'
  }
}

interface CallOptions { body?: unknown; key?: string; signal?: AbortSignal; auth?: boolean }

async function call<T>(conn: Connection, f: Fetch, method: string, path: string, opts: CallOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  if (opts.auth !== false && conn.token) headers.Authorization = `Bearer ${conn.token}`
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json'
  if (opts.key) headers['Idempotency-Key'] = opts.key
  let res: Response
  try {
    res = await f(`${conn.baseUrl}${path}`, { method, headers, signal: opts.signal, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new LinkError('unreachable', `Play Buddy isn't reachable at ${conn.baseUrl}. Is it open in GM mode with the API switched on?`)
  }
  if (res.status === 204) return undefined as T
  const data = await res.json().catch(() => null) as unknown
  if (!res.ok) {
    const e = (data as W.ApiError | null)?.error
    throw new LinkError(e?.code ?? `http-${res.status}`, e?.message ?? `Play Buddy answered ${res.status}`)
  }
  return data as T
}

/** Pairing: trades the code Play Buddy shows for a token. */
export function pair(baseUrl: string, code: string, clientVersion: string, f: Fetch = (...a) => fetch(...a)): Promise<W.PairResponse> {
  return call<W.PairResponse>({ baseUrl, token: null }, f, 'POST', '/v1/pair', { auth: false, body: { code: code.replace(/\s+/g, ''), client: 'StarTome', clientVersion } })
}

export type Probe =
  | { ok: true; appVersion: string; apiVersion: string; gameOpen: boolean; apiEnabled: boolean }
  | { ok: false; reason: 'unreachable' | 'unauthorized' | 'incompatible'; message: string }

export type LinkClient = ReturnType<typeof createClient>

export function createClient(conn: Connection, f: Fetch = (...a) => fetch(...a)) {
  const get = <T>(path: string, signal?: AbortSignal) => call<T>(conn, f, 'GET', path, { signal })
  return {
    async probe(): Promise<Probe> {
      let h: W.Health
      try { h = await call<W.Health>(conn, f, 'GET', '/v1/health', { auth: false }) }
      catch (err) { return { ok: false, reason: 'unreachable', message: (err as Error).message } }
      if (h.app !== 'playbuddy' || h.apiVersion.split('.')[0] !== API_MAJOR) return { ok: false, reason: 'incompatible', message: `${h.app} speaks API ${h.apiVersion}; StarTome speaks ${API_MAJOR}.x` }
      if (!conn.token) return { ok: false, reason: 'unauthorized', message: 'Not paired yet' }
      return { ok: true, appVersion: h.appVersion, apiVersion: h.apiVersion, gameOpen: h.game.open, apiEnabled: h.game.apiEnabled }
    },
    game: () => get<W.Game>('/v1/game'),
    /** `key` is the idempotency key: sending it twice makes one message. */
    send: (key: string, request: W.MessageRequest) => call<W.Message>(conn, f, 'POST', '/v1/messages', { body: request, key }),
    messages: (ids: string[]) => get<{ messages: W.Message[]; unknown: string[] }>(`/v1/messages?ids=${ids.map(encodeURIComponent).join(',')}`),
    withdraw: (messageId: string) => call<W.Message>(conn, f, 'DELETE', `/v1/messages/${encodeURIComponent(messageId)}`),
    /** Long poll: waits up to `waitS` seconds for events after `after`. */
    events: (after: number, waitS: number, signal?: AbortSignal) => get<W.EventsResponse>(`/v1/events?after=${after}&wait=${Math.min(30, Math.max(0, waitS))}`, signal),
    unpair: () => call<void>(conn, f, 'DELETE', '/v1/pair'),
  }
}

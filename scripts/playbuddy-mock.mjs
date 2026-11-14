#!/usr/bin/env node
/**
 * Mock Play Buddy GM API v1, draft 2 (PLAYBUDDY_API.md), for development and
 * tests. An in-memory game with two players. Implements every /v1 endpoint
 * plus /mock/* controls that play the players' side.
 *
 *   node scripts/playbuddy-mock.mjs [--port 47110] [--manual] [--system sf2e]
 *
 * Pair code: 123456. Without --manual the players answer by themselves after
 * a moment: gifts are accepted, rolls rolled, damage taken.
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PAIR_CODE = '123456'
const iso = () => new Date().toISOString()
const d20 = () => 1 + Math.floor(Math.random() * 20)
const FINAL = ['accepted', 'declined', 'withdrawn', 'expired', 'failed']
const facts = (name, type, level, price, bulk, extra = {}) => ({ name, type, level, price, priceFor: 1, bulk, rarity: 'common', traits: [], ...extra })

function seedPlayers(system) {
  if (system === 'sf2e') {
    return [
      {
        playerId: 'p_carl', displayName: 'Carl', online: true, shares: ['basic', 'defenses', 'skills', 'inventory'],
        autoAccept: { items: false, coins: false, levelUp: false, heroPoints: true, rolls: false, damage: false },
        character: {
          characterId: 'c_tarkus', name: 'Tarkus', level: 3, ancestry: 'Vesk', class: 'Soldier',
          hp: { current: 52, max: 52, temp: 0 }, conditions: [], heroPoints: 1,
          defenses: { ac: 20, saves: { fortitude: 11, reflex: 7, will: 8 }, perception: 8, speeds: { land: 25 } },
          skills: { attributes: { str: 4, dex: 1, con: 3, int: 0, wis: 1, cha: 0 }, skills: { athletics: 11, piloting: 6, crafting: 5, intimidation: 7 }, classDc: 20, attacks: { ranged: 10, melee: 12 } },
          coins: 12000,
          items: [
            { entryId: 'i1', ref: { slug: 'laser-pistol', foundryId: 'qIgcUV22LaDCzmb2', pack: 'equipment', system: 'sf2e' }, facts: facts('Laser Pistol', 'weapon', 0, 300, 1), quantity: 1, identified: true, grade: 'tactical' },
            { entryId: 'i2', facts: facts('Dermal Plating', 'gear', 2, 2500, 0), quantity: 1, identified: true, implanted: true },
          ],
          nextEntry: 3,
        },
      },
      {
        playerId: 'p_mira', displayName: 'Mira', online: true, shares: ['basic', 'defenses', 'skills'],
        autoAccept: { items: false, coins: true, levelUp: false, heroPoints: true, rolls: false, damage: false },
        character: {
          characterId: 'c_sel', name: 'Sel', level: 3, ancestry: 'Android', class: 'Operative',
          hp: { current: 38, max: 38, temp: 0 }, conditions: [], heroPoints: 1,
          defenses: { ac: 19, saves: { fortitude: 7, reflex: 11, will: 8 }, perception: 9, speeds: { land: 30 } },
          skills: { attributes: { str: 0, dex: 4, con: 1, int: 2, wis: 1, cha: 0 }, skills: { computers: 9, piloting: 10, stealth: 11 }, classDc: 19, attacks: { ranged: 11, melee: 7 } },
          coins: 4000, items: [], nextEntry: 1,
        },
      },
    ]
  }
  return [
    {
      playerId: 'p_carl', displayName: 'Carl', online: true, shares: ['basic', 'defenses', 'skills', 'inventory'],
      autoAccept: { items: false, coins: false, levelUp: false, heroPoints: true, rolls: false, damage: false },
      character: {
        characterId: 'c_groknar', name: 'Groknar', level: 7, ancestry: 'Orc', heritage: 'Corpsefolk', class: 'Magus', class2: 'Psychic',
        hp: { current: 98, max: 112, temp: 0 }, conditions: [], heroPoints: 1,
        defenses: { ac: 25, saves: { fortitude: 16, reflex: 13, will: 14 }, perception: 13, speeds: { land: 25 } },
        skills: { attributes: { str: 4, dex: 1, con: 2, int: 3, wis: 1, cha: 0 }, skills: { athletics: 16, arcana: 14, stealth: 8, 'warfare-lore': 12 }, classDc: 24, spellDc: 24 },
        coins: 41260,
        items: [
          { entryId: 'i1', ref: { slug: 'longsword', foundryId: 'X9Ps5cz8oIRRo4zv', pack: 'equipment-srd' }, facts: facts('Longsword', 'weapon', 0, 100, 10), quantity: 1, identified: true, attachments: [
            { entryId: 'i1r1', kind: 'rune', ref: { slug: 'weapon-potency-1' }, facts: facts('Weapon Potency (+1)', 'gear', 2, 3500, 0), identified: true },
            { entryId: 'i1r2', kind: 'rune', ref: { slug: 'striking' }, facts: facts('Striking', 'gear', 4, 6500, 0), identified: true },
          ] },
          { entryId: 'i2', ref: { slug: 'healing-potion-minor' }, facts: facts('Healing Potion (Minor)', 'consumable', 1, 400, 1), quantity: 2, identified: true },
        ],
        nextEntry: 3,
      },
    },
    {
      playerId: 'p_mira', displayName: 'Mira', online: true, shares: ['basic', 'defenses'],
      autoAccept: { items: false, coins: true, levelUp: false, heroPoints: true, rolls: false, damage: false },
      character: {
        characterId: 'c_sel', name: 'Sel', level: 7, ancestry: 'Elf', class: 'Cleric',
        hp: { current: 71, max: 71, temp: 0 }, conditions: [{ id: 'frightened', name: 'Frightened', value: 1 }], heroPoints: 1,
        defenses: { ac: 23, saves: { fortitude: 13, reflex: 12, will: 17 }, perception: 15, speeds: { land: 30 } },
        skills: { attributes: { str: 0, dex: 2, con: 1, int: 0, wis: 4, cha: 1 }, skills: { religion: 15, medicine: 15 }, spellDc: 25 },
        coins: 30000, items: [], nextEntry: 1,
      },
    },
  ]
}

export function createMockServer({ port = 47110, manual = false, delayMs = 1200, system = 'pf2e' } = {}) {
  const tokens = new Set()
  let state
  const waiters = new Set()
  const reset = () => { state = { gameId: `g_${randomUUID().slice(0, 8)}`, players: seedPlayers(system), messages: new Map(), keys: new Map(), events: [], seq: 0, apiEnabled: true } }
  reset()

  function push(ev) {
    const e = { seq: ++state.seq, at: iso(), ...ev }
    state.events.push(e)
    if (state.events.length > 1000) state.events.shift()
    for (const w of [...waiters]) w()
    return e
  }
  const player = id => state.players.find(p => p.playerId === id)
  const info = p => ({ playerId: p.playerId, displayName: p.displayName, online: p.online, shares: p.shares, autoAccept: p.autoAccept })

  function blocks(p, levels = p.shares) {
    const c = p.character, out = {}
    if (levels.includes('basic') && p.shares.includes('basic')) out.basic = { name: c.name, level: c.level, ancestry: c.ancestry, ...(c.heritage ? { heritage: c.heritage } : {}), class: c.class, ...(c.class2 ? { class2: c.class2 } : {}), hp: { ...c.hp }, conditions: c.conditions.map(x => ({ ...x })), heroPoints: c.heroPoints }
    if (levels.includes('defenses') && p.shares.includes('defenses')) out.defenses = c.defenses
    if (levels.includes('skills') && p.shares.includes('skills')) out.skills = c.skills
    if (levels.includes('inventory') && p.shares.includes('inventory')) out.inventory = { coins: c.coins, bulk: c.items.reduce((n, i) => n + i.facts.bulk * i.quantity, 0), invested: 0, items: c.items }
    return out
  }
  const sheet = p => ({ characterId: p.character.characterId, at: iso(), ...blocks(p) })
  const changed = (p, levels) => push({ type: 'sheet', playerId: p.playerId, characterId: p.character.characterId, sheetAt: iso(), blocks: blocks(p, levels) })
  const gameView = () => ({ gameId: state.gameId, name: system === 'sf2e' ? 'Tech Core' : 'The Codex', system, eventSeq: state.seq, players: state.players.map(p => ({ ...info(p), sheet: sheet(p) })) })

  function roll(p, { label, check = 'flat', messageId, dc, secret = false, kind, total }) {
    const c = p.character
    const modifier = check === 'perception' ? c.defenses.perception : c.defenses.saves[check] ?? c.skills.skills[check.replace('skill:', '')] ?? 0
    const sum = total ?? d20() + modifier
    const degree = dc === undefined ? undefined : sum >= dc + 10 ? 'criticalSuccess' : sum >= dc ? 'success' : sum <= dc - 10 ? 'criticalFailure' : 'failure'
    const r = { rollId: `roll_${randomUUID().slice(0, 8)}`, playerId: p.playerId, at: iso(), ...(messageId ? { messageId } : {}), kind: kind ?? (check === 'perception' ? 'perception' : check.startsWith('skill:') ? 'skill' : check === 'flat' ? 'flat' : 'save'), label: label ?? check, formula: `1d20+${modifier}`, total: sum, ...(dc !== undefined ? { dc, degree } : {}), secret }
    push({ type: 'roll', roll: r })
    return r
  }

  /** The player's app applies an accepted message. */
  function apply(m, p, total) {
    const c = p.character, b = m.body
    if (b.kind === 'items') {
      for (const g of b.items) {
        c.items.push({
          entryId: `i${c.nextEntry++}`, ...(g.ref ? { ref: g.ref } : {}), facts: g.identified === false ? { ...g.facts, name: g.unidentifiedName ?? 'Unidentified item' } : g.facts, trueName: g.facts.name,
          quantity: g.quantity, identified: g.identified !== false, ...(g.relic ? { relic: g.relic } : {}), ...(g.grade ? { grade: g.grade } : {}),
          attachments: (g.attachments ?? []).map((a, n) => ({ entryId: `i${c.nextEntry - 1}a${n}`, kind: a.kind, ...(a.ref ? { ref: a.ref } : {}), facts: a.facts, identified: a.identified !== false, ...(a.tier ? { tier: a.tier } : {}) })),
        })
      }
      changed(p, ['inventory'])
    } else if (b.kind === 'coins') { c.coins += b.cp; changed(p, ['inventory']) }
    else if (b.kind === 'levelUp') { c.level = b.toLevel; changed(p, ['basic']) }
    else if (b.kind === 'heroPoints') { c.heroPoints = Math.min(3, c.heroPoints + b.amount); changed(p, ['basic']) }
    else if (b.kind === 'identify') {
      for (const i of c.items) {
        if (i.entryId === b.entryId) { i.identified = true; i.facts = { ...i.facts, name: i.trueName ?? i.facts.name }; for (const a of i.attachments ?? []) a.identified = true }
        for (const a of i.attachments ?? []) if (a.entryId === b.entryId) a.identified = true
      }
      changed(p, ['inventory'])
    } else if (b.kind === 'roll') m.roll = roll(p, { label: b.label, check: b.check, messageId: m.messageId, dc: b.dc, secret: !!b.secret, kind: b.initiative ? 'initiative' : undefined, total })
    else if (b.kind === 'damage') {
      const sum = (b.damage ?? []).filter(d => !d.persistent).reduce((n, d) => n + d.amount, 0)
      c.hp.current = Math.min(c.hp.max, Math.max(0, c.hp.current - sum) + (b.healing ?? 0))
      for (const k of b.conditions ?? []) if (!c.conditions.some(x => x.id === k.id)) c.conditions.push({ id: k.id, name: k.id.charAt(0).toUpperCase() + k.id.slice(1), ...(k.value ? { value: k.value } : {}) })
      changed(p, ['basic'])
    }
  }

  function setState(m, next, reason, total) {
    if (FINAL.includes(m.state)) return m
    if (next === 'accepted') apply(m, player(m.to), total)
    Object.assign(m, { state: next, at: iso() })
    if (reason) m.reason = reason
    push({ type: 'message', message: m })
    return m
  }

  const AUTO = { items: 'items', coins: 'coins', levelUp: 'levelUp', heroPoints: 'heroPoints', identify: 'items', roll: 'rolls', damage: 'damage' }

  function createMessage(key, req) {
    const p = player(req.to)
    const m = { messageId: `m_${randomUUID().slice(0, 8)}`, to: req.to, createdAt: iso(), ...(req.note ? { note: req.note } : {}), body: req.body, state: p.online ? 'delivered' : 'queued', at: iso() }
    state.messages.set(m.messageId, m)
    state.keys.set(key, { id: m.messageId, body: JSON.stringify(req) })
    // What the player lets through applies at once; the rest waits for them (or, unless --manual, a moment)
    if (p.online && (p.autoAccept[AUTO[req.body.kind]] || req.body.kind === 'identify')) setState(m, 'accepted')
    else if (p.online && !manual) setTimeout(() => setState(m, 'accepted'), delayMs)
    return m
  }

  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin') }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { 'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' })
      return res.end()
    }
    const url = new URL(req.url, 'http://127.0.0.1')
    const path = url.pathname
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)) }
    const fail = (status, code, message) => send(status, { error: { code, message } })
    let body = {}
    if (req.method === 'POST') {
      const chunks = []
      for await (const c of req) chunks.push(c)
      try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {} } catch { return fail(400, 'invalidPayload', 'The body is not JSON') }
    }

    // ── The players' side, by hand ──
    if (path.startsWith('/mock/')) {
      if (path === '/mock/reset') { reset(); return send(200, { ok: true }) }
      if (path === '/mock/state') return send(200, { players: state.players, messages: [...state.messages.values()], seq: state.seq })
      const answer = /^\/mock\/messages\/([^/]+)\/answer$/.exec(path)
      if (answer) {
        const m = state.messages.get(answer[1])
        if (!m) return fail(404, 'messageNotFound', 'No such message')
        return send(200, setState(m, body.state ?? 'accepted', body.reason, body.total))
      }
      const p = player(body.playerId)
      if (!p) return fail(404, 'playerNotFound', 'No such player')
      if (path === '/mock/roll') return send(200, roll(p, body))
      if (path === '/mock/hp') { Object.assign(p.character.hp, { current: body.current }); if (body.conditions) p.character.conditions = body.conditions; changed(p, ['basic']); return send(200, { ok: true }) }
      if (path === '/mock/shares') {
        const dropped = p.shares.filter(s => !body.shares.includes(s))
        p.shares = body.shares
        push({ type: 'player', player: info(p) })
        push({ type: 'sheet', playerId: p.playerId, characterId: p.character.characterId, sheetAt: iso(), blocks: blocks(p), ...(dropped.length ? { unshared: dropped } : {}) })
        return send(200, { ok: true })
      }
      if (path === '/mock/online') {
        p.online = !!body.online
        push({ type: 'player', player: info(p) })
        if (p.online) for (const m of state.messages.values()) if (m.to === p.playerId && m.state === 'queued') setState(m, 'delivered')
        return send(200, { ok: true })
      }
      if (path === '/mock/return') {
        const i = p.character.items.findIndex(x => x.entryId === body.entryId)
        if (i < 0) return fail(404, 'invalidPayload', 'No such entry')
        const [item] = p.character.items.splice(i, 1)
        changed(p, ['inventory'])
        push({ type: 'itemReturned', playerId: p.playerId, item, ...(body.note ? { note: body.note } : {}) })
        return send(200, { ok: true })
      }
      return fail(404, 'invalidPayload', 'Unknown mock control')
    }

    // ── The API ──
    if (path === '/v1/health') return send(200, { app: 'playbuddy', appVersion: 'mock', apiVersion: '1.0', rulesVersion: `${system}@mock`, game: { open: true, apiEnabled: state.apiEnabled } })
    if (path === '/v1/pair' && req.method === 'POST') {
      if (String(body.code) !== PAIR_CODE) return fail(400, 'pairCodeInvalid', 'That is not the code Play Buddy shows')
      const token = randomUUID()
      tokens.add(token)
      return send(201, { token, clientId: `c_${token.slice(0, 8)}` })
    }
    const token = (req.headers.authorization ?? '').replace(/^Bearer /, '')
    if (!tokens.has(token)) return fail(401, 'unauthorized', 'Pair StarTome with Play Buddy first')
    if (path === '/v1/pair' && req.method === 'DELETE') { tokens.delete(token); res.writeHead(204); return res.end() }
    if (path === '/v1/game') return send(200, gameView())

    if (path === '/v1/messages' && req.method === 'POST') {
      const key = req.headers['idempotency-key']
      if (!key) return fail(400, 'invalidPayload', 'Idempotency-Key is required')
      const known = state.keys.get(key)
      if (known) return known.body === JSON.stringify(body) ? send(200, state.messages.get(known.id)) : fail(409, 'conflict', 'That key was used with another message')
      if (!player(body.to)) return fail(404, 'playerNotFound', 'No such player')
      if (!body.body?.kind || (body.body.kind === 'roll' && body.body.check === 'flat' && body.body.dc === undefined)) return fail(400, 'invalidPayload', 'The message body is incomplete')
      return send(201, createMessage(key, body))
    }
    if (path === '/v1/messages' && req.method === 'GET') {
      const ids = (url.searchParams.get('ids') ?? '').split(',').filter(Boolean)
      return send(200, { messages: ids.map(id => state.messages.get(id)).filter(Boolean), unknown: ids.filter(id => !state.messages.has(id)) })
    }
    const one = /^\/v1\/messages\/([^/]+)$/.exec(path)
    if (one && req.method === 'DELETE') {
      const m = state.messages.get(one[1])
      return m ? send(200, setState(m, 'withdrawn')) : fail(404, 'messageNotFound', 'No such message')
    }

    if (path === '/v1/events') {
      const after = Number(url.searchParams.get('after') ?? 0)
      const wait = Math.min(30, Number(url.searchParams.get('wait') ?? 25)) * 1000
      const answer = () => send(200, after > state.seq ? { events: [], lastSeq: state.seq, resetRequired: true } : { events: state.events.filter(e => e.seq > after), lastSeq: state.seq })
      if (state.seq !== after || wait <= 0) return answer()
      let timer = null
      const wake = () => { clearTimeout(timer); waiters.delete(wake); if (!res.writableEnded) answer() }
      timer = setTimeout(wake, wait)
      waiters.add(wake)
      req.on('close', () => { clearTimeout(timer); waiters.delete(wake) })
      return undefined
    }
    return fail(404, 'invalidPayload', `No such endpoint: ${req.method} ${path}`)
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const url = `http://127.0.0.1:${server.address().port}`
      resolve({ url, close: () => new Promise((done) => { for (const w of [...waiters]) w(); server.closeAllConnections?.(); server.close(() => done()) }) })
    })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = name => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? undefined : process.argv[i + 1] }
  const manual = process.argv.includes('--manual')
  const { url } = await createMockServer({ port: Number(arg('port') ?? 47110), manual, system: arg('system') === 'sf2e' ? 'sf2e' : 'pf2e' })
  console.log(`Mock Play Buddy on ${url} — pair code ${PAIR_CODE}${manual ? ' (manual: answer via /mock/*)' : ' (players answer by themselves)'}`)
}

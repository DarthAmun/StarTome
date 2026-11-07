#!/usr/bin/env node
/**
 * Mock Play Buddy GM API v1 (PLAYBUDDY_API.md) for development and tests.
 * In-memory game with two players. Implements every /v1 endpoint plus
 * /mock/* controls that play the players' side (accept offers, roll, return
 * items, take damage).
 *
 *   node scripts/playbuddy-mock.mjs [--port 47110] [--manual] [--system sf2e]
 *
 * --system sf2e: a Starfinder 2e game (PLAYBUDDY_API.md "Starfinder 2e"): the
 * game reports `system: 'sf2e'`, the crew has SF2e skills and items carry
 * SF2e Foundry refs.
 *
 * Pair code: 123456. Without --manual, players answer by themselves after a
 * moment: offers are accepted, roll requests rolled, damage applied.
 */
import { createServer } from 'node:http'
import { randomUUID } from 'node:crypto'

const PAIR_CODE = '123456'
const ORIGINS = ['https://darthamun.github.io', 'http://localhost:3001', 'http://127.0.0.1:3001']

const iso = () => new Date().toISOString()
const d20 = () => 1 + Math.floor(Math.random() * 20)

function seedPlayers() {
  return [
    {
      playerId: 'p_carl', displayName: 'Carl', online: true,
      shares: ['basic', 'defenses', 'skills', 'inventory'],
      autoAccept: { items: false, coins: false, levelUp: false, heroPoints: true, requests: false },
      character: {
        characterId: 'c_groknar', name: 'Groknar', level: 7, ancestry: 'Orc', heritage: 'Corpsefolk', class: 'Magus', class2: 'Psychic',
        hp: { current: 98, max: 112, temp: 0 }, conditions: [], heroPoints: 1,
        defenses: { ac: 25, saves: { fortitude: 16, reflex: 13, will: 14 }, perception: 13, speeds: { land: 25 } },
        skills: { attributes: { str: 4, dex: 1, con: 2, int: 3, wis: 1, cha: 0 }, skills: { athletics: 16, arcana: 14, stealth: 8, 'warfare-lore': 12 }, classDc: 24, spellcasting: [{ source: 'magus', tradition: 'arcane', dc: 24, attack: 14 }] },
        coins: { pp: 0, gp: 412, sp: 6, cp: 0 },
        items: [
          { entryId: 'i1', ref: { slug: 'longsword', foundryId: 'X9Ps5cz8oIRRo4zv', pack: 'equipment-srd' }, custom: false, name: 'Longsword', quantity: 1, level: 0, rarity: 'common', type: 'weapon', price: 100, priceFor: 1, bulk: 1, location: 'held', attachments: [
            { entryId: 'i1r1', kind: 'rune', ref: { slug: 'weapon-potency-1' }, name: 'Weapon Potency (+1)', level: 2, price: 3500 },
            { entryId: 'i1r2', kind: 'rune', ref: { slug: 'striking' }, name: 'Striking', level: 4, price: 6500 },
          ], identified: true },
          { entryId: 'i2', ref: { slug: 'healing-potion-minor' }, custom: false, name: 'Healing Potion (Minor)', quantity: 2, level: 1, rarity: 'common', type: 'consumable', price: 400, priceFor: 1, bulk: 0.1, location: 'stowed', identified: true },
        ],
        nextEntry: 3,
      },
    },
    {
      playerId: 'p_lena', displayName: 'Lena', online: true,
      shares: ['basic', 'defenses'],
      autoAccept: { items: false, coins: true, levelUp: false, heroPoints: true, requests: false },
      character: {
        characterId: 'c_mirelle', name: 'Mirelle', level: 7, ancestry: 'Elf', class: 'Cleric',
        hp: { current: 71, max: 71, temp: 0 }, conditions: [{ id: 'frightened', name: 'Frightened', value: 1 }], heroPoints: 1,
        defenses: { ac: 23, saves: { fortitude: 13, reflex: 12, will: 17 }, perception: 15, speeds: { land: 30 } },
        skills: { attributes: { str: 0, dex: 2, con: 1, int: 0, wis: 4, cha: 1 }, skills: { religion: 15, medicine: 15 }, spellcasting: [{ source: 'cleric', tradition: 'divine', dc: 25, attack: 15 }] },
        coins: { pp: 0, gp: 300, sp: 0, cp: 0 },
        items: [],
        nextEntry: 1,
      },
    },
  ]
}

/** A Starfinder crew (STARFINDER_PLAN.md P10). Prices in cp: 1 credit = 10 cp. */
function seedSf2ePlayers() {
  return [
    {
      playerId: 'p_carl', displayName: 'Carl', online: true,
      shares: ['basic', 'defenses', 'skills', 'inventory'],
      autoAccept: { items: false, coins: false, levelUp: false, heroPoints: true, requests: false },
      character: {
        characterId: 'c_vesk', name: 'Tarkus', level: 3, ancestry: 'Vesk', class: 'Soldier',
        hp: { current: 52, max: 52, temp: 0 }, conditions: [], heroPoints: 1,
        defenses: { ac: 20, saves: { fortitude: 11, reflex: 7, will: 8 }, perception: 8, speeds: { land: 25 } },
        skills: { attributes: { str: 4, dex: 1, con: 3, int: 0, wis: 1, cha: 0 }, skills: { athletics: 11, piloting: 6, crafting: 5, intimidation: 7 }, classDc: 20, attacks: { ranged: 10, melee: 12 }, spellcasting: [] },
        coins: { pp: 0, gp: 0, sp: 1200, cp: 0 },
        items: [
          { entryId: 'i1', ref: { slug: 'laser-pistol', foundryId: 'qIgcUV22LaDCzmb2', pack: 'equipment', system: 'sf2e' }, custom: false, name: 'Laser Pistol', quantity: 1, level: 0, rarity: 'common', type: 'weapon', price: 300, priceFor: 1, bulk: 0.1, location: 'held', grade: 'tactical', attachments: [] },
        ],
        nextEntry: 2,
      },
    },
    {
      playerId: 'p_lena', displayName: 'Lena', online: true,
      shares: ['basic', 'defenses', 'skills'],
      autoAccept: { items: false, coins: true, levelUp: false, heroPoints: true, requests: false },
      character: {
        characterId: 'c_ysoki', name: 'Pip', level: 3, ancestry: 'Ysoki', class: 'Mechanic',
        hp: { current: 31, max: 31, temp: 0 }, conditions: [], heroPoints: 1,
        defenses: { ac: 18, saves: { fortitude: 8, reflex: 10, will: 7 }, perception: 9, speeds: { land: 25 } },
        skills: { attributes: { str: 0, dex: 2, con: 1, int: 4, wis: 1, cha: 0 }, skills: { computers: 11, crafting: 11, piloting: 9 }, classDc: 21, attacks: { ranged: 9 }, spellcasting: [] },
        coins: { pp: 0, gp: 0, sp: 400, cp: 0 },
        items: [],
        nextEntry: 1,
      },
    },
  ]
}

const CHECK_MODS = { perception: c => c.defenses.perception, fortitude: c => c.defenses.saves.fortitude, reflex: c => c.defenses.saves.reflex, will: c => c.defenses.saves.will }

export function createMockServer({ port = 47110, manual = false, delayMs = 1200, system = 'pf2e' } = {}) {
  const state = {
    gameId: 'g_mock', name: system === 'sf2e' ? 'Mock Starfinder Game' : 'Mock Game', tokens: new Set(), players: system === 'sf2e' ? seedSf2ePlayers() : seedPlayers(),
    offers: new Map(), byKey: new Map(), requests: new Map(), events: [], seq: 0, waiters: [],
  }
  const player = id => state.players.find(p => p.playerId === id)

  function push(ev) {
    state.seq++
    state.events.push({ seq: state.seq, at: iso(), ...ev })
    if (state.events.length > 1000) state.events.shift()
    for (const w of state.waiters.splice(0)) w()
  }

  // ── Views ────────────────────────────────────────────────────────────────
  function gameView() {
    return {
      gameId: state.gameId, name: state.name, startedAt: iso(), eventSeq: state.seq, ...(system === 'sf2e' ? { system } : {}),
      players: state.players.map(p => ({
        playerId: p.playerId, displayName: p.displayName, online: p.online, lastSeenAt: iso(),
        character: { characterId: p.character.characterId, name: p.character.name, level: p.character.level, ancestry: p.character.ancestry, class: p.character.class, ...(p.character.class2 ? { class2: p.character.class2 } : {}) },
        shares: p.shares, autoAccept: p.autoAccept,
      })),
    }
  }

  function statusView(p, levels) {
    const c = p.character
    const out = { playerId: p.playerId, characterId: c.characterId, at: iso(), notShared: levels.filter(l => !p.shares.includes(l)) }
    const has = l => levels.includes(l) && p.shares.includes(l)
    if (has('basic')) out.basic = { name: c.name, level: c.level, ancestry: c.ancestry, ...(c.heritage ? { heritage: c.heritage } : {}), class: c.class, ...(c.class2 ? { class2: c.class2 } : {}), hp: c.hp, conditions: c.conditions, heroPoints: c.heroPoints, size: 'med' }
    if (has('defenses')) out.defenses = c.defenses
    if (has('skills')) out.skills = c.skills
    if (has('inventory')) {
      const carried = c.items.reduce((n, i) => n + i.bulk * i.quantity, 0)
      out.inventory = { coins: c.coins, bulk: { carried: Math.round(carried * 10) / 10, encumberedAt: 9, limit: 14 }, invested: { count: 0, limit: 10 }, items: c.items }
    }
    return out
  }

  // ── Player side (what the real app would do on the player's device) ───────
  function applyOffer(offer, p) {
    const c = p.character
    const pl = offer.payload
    if (pl.kind === 'coins') for (const k of ['pp', 'gp', 'sp', 'cp']) c.coins[k] += pl.coins[k] ?? 0
    if (pl.kind === 'levelUp') c.level = Math.max(c.level, pl.toLevel)
    if (pl.kind === 'heroPoint') c.heroPoints = Math.min(3, c.heroPoints + pl.amount)
    if (pl.kind === 'identify') {
      const it = c.items.find(i => i.entryId === pl.entryId)
      if (it && it.trueName) { it.name = it.trueName; delete it.trueName }
      if (it) it.identified = true
    }
    if (pl.kind === 'item') {
      for (const o of pl.items) {
        const name = o.ref ? o.ref.slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ') : o.definition.name
        const unidentified = o.identified === false
        c.items.push({
          entryId: `i${c.nextEntry++}`, ref: o.ref ?? { slug: o.definition.id }, custom: !o.ref, name: unidentified ? o.unidentifiedName : name,
          ...(unidentified ? { trueName: name } : {}),
          quantity: o.quantity, level: o.definition?.level ?? 1, rarity: o.definition?.rarity ?? 'common', type: o.definition?.type ?? 'gear',
          price: o.definition?.price ?? 0, priceFor: o.definition?.priceFor ?? 1, bulk: o.definition?.bulk ?? 0.1, location: 'stowed',
          ...(o.runes ? { runes: o.runes } : {}), identified: !unidentified,
        })
      }
    }
  }

  function answerOffer(offerId, playerId, answer, reason) {
    const offer = state.offers.get(offerId)
    const d = offer?.deliveries.find(x => x.playerId === playerId)
    if (!d || !['queued', 'delivered'].includes(d.state)) return false
    d.state = answer; d.at = iso(); if (reason) d.reason = reason
    if (answer === 'accepted') applyOffer(offer, player(playerId))
    push({ type: 'offerChanged', offerId, playerId, state: answer, ...(reason ? { reason } : {}) })
    if (answer === 'accepted') push({ type: 'statusChanged', playerId, levels: ['levelUp', 'heroPoint'].includes(offer.payload.kind) ? ['basic'] : ['inventory', 'basic'] })
    return true
  }

  function roll(p, { label, check, requestId, dc, secret = false, kind = 'check', modifier }) {
    const c = p.character
    const mod = modifier ?? (CHECK_MODS[check]?.(c) ?? c.skills.skills[check?.replace(/^skill:/, '')] ?? 0)
    const die = d20()
    const total = die + mod
    const degree = dc === undefined ? undefined
      : (total >= dc + 10 ? 2 : total >= dc ? 1 : total <= dc - 10 ? -1 : 0) + (die === 20 ? 1 : die === 1 ? -1 : 0)
    const deg = degree === undefined ? undefined : ['criticalFailure', 'failure', 'success', 'criticalSuccess'][Math.max(0, Math.min(3, degree + 1))]
    const r = {
      rollId: `roll_${randomUUID().slice(0, 8)}`, playerId: p.playerId, characterId: c.characterId, at: iso(),
      ...(requestId ? { requestId } : {}), kind, label, formula: `1d20${mod >= 0 ? '+' : ''}${mod}`,
      dice: [{ die: 20, result: die }], modifier: mod, total, ...(dc !== undefined ? { dc, degree: deg } : {}), secret,
    }
    push({ type: 'roll', roll: r })
    return r
  }

  function answerRequest(requestId, playerId, answer = 'accepted', total) {
    const req = state.requests.get(requestId)
    const d = req?.deliveries.find(x => x.playerId === playerId)
    const p = player(playerId)
    if (!d || !p || !['queued', 'delivered'].includes(d.state)) return false
    d.state = answer; d.at = iso()
    if (answer === 'accepted' && req.body.kind === 'roll') {
      const b = req.body
      const r = roll(p, { label: b.label ?? b.check, check: b.check, requestId, dc: b.dc, secret: b.secret, kind: b.purpose === 'initiative' ? 'initiative' : 'check' })
      if (total !== undefined) { r.total = total }
    }
    if (answer === 'accepted' && req.body.kind === 'damage') {
      const c = p.character
      const dmg = (req.body.damage ?? []).reduce((n, x) => n + x.amount, 0)
      const fromTemp = Math.min(c.hp.temp, dmg)
      c.hp.temp -= fromTemp
      c.hp.current = Math.max(0, c.hp.current - (dmg - fromTemp))
      for (const k of req.body.conditions ?? []) {
        const at = c.conditions.find(x => x.id === k.id)
        if (at) at.value = k.value ?? at.value
        else c.conditions.push({ id: k.id, name: k.id[0].toUpperCase() + k.id.slice(1), ...(k.value !== undefined ? { value: k.value } : {}) })
      }
      push({ type: 'statusChanged', playerId, levels: ['basic'] })
    }
    push({ type: 'requestChanged', requestId, playerId, state: answer })
    return true
  }

  function autoAnswer(fn) { if (!manual) setTimeout(fn, delayMs) }

  // ── HTTP ─────────────────────────────────────────────────────────────────
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin
    if (origin && ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin)
      res.setHeader('Vary', 'Origin')
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key',
        'Access-Control-Allow-Private-Network': 'true',
        'Access-Control-Max-Age': '600',
      })
      return res.end()
    }
    const url = new URL(req.url, 'http://127.0.0.1')
    const path = url.pathname
    const send = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(body === undefined ? '' : JSON.stringify(body)) }
    const fail = (status, code, message) => send(status, { error: { code, message } })
    let body
    if (req.method === 'POST') {
      let raw = ''
      for await (const chunk of req) raw += chunk
      try { body = raw ? JSON.parse(raw) : {} } catch { return fail(400, 'invalidPayload', 'Body is not JSON') }
    }

    // Mock controls: the players' side
    if (path.startsWith('/mock/')) {
      if (path === '/mock/reset' && req.method === 'POST') {
        // Fresh players and no offers; pairing and the event sequence stay
        state.players = system === 'sf2e' ? seedSf2ePlayers() : seedPlayers(); state.offers.clear(); state.requests.clear(); state.byKey.clear()
        return send(200, { ok: true })
      }
      if (path === '/mock/state' && req.method === 'GET') return send(200, { players: state.players, offers: [...state.offers.values()], requests: [...state.requests.values()].map(r => ({ requestId: r.requestId, ...r.body, deliveries: r.deliveries })), seq: state.seq })
      const m = path.match(/^\/mock\/(offers|requests)\/([^/]+)\/answer$/)
      if (m && req.method === 'POST') {
        const ok = m[1] === 'offers' ? answerOffer(m[2], body.playerId, body.state ?? 'accepted', body.reason) : answerRequest(m[2], body.playerId, body.state ?? 'accepted', body.total)
        return ok ? send(200, { ok: true }) : fail(404, 'offerNotFound', 'No open delivery')
      }
      const p = player(body?.playerId)
      if (!p) return fail(404, 'playerNotFound', 'Unknown player')
      if (path === '/mock/roll') return send(200, roll(p, body))
      if (path === '/mock/hp') { p.character.hp.current = body.current; push({ type: 'statusChanged', playerId: p.playerId, levels: ['basic'] }); return send(200, { ok: true }) }
      if (path === '/mock/shares') { p.shares = body.shares; push({ type: 'sharesChanged', playerId: p.playerId, shares: p.shares }); return send(200, { ok: true }) }
      if (path === '/mock/return') {
        const i = p.character.items.findIndex(x => x.entryId === body.entryId)
        if (i < 0) return fail(404, 'invalidPayload', 'No such entry')
        const [item] = p.character.items.splice(i, 1)
        push({ type: 'itemReturned', playerId: p.playerId, item, note: body.note ?? 'For the party' })
        push({ type: 'statusChanged', playerId: p.playerId, levels: ['inventory'] })
        return send(200, { ok: true })
      }
      return fail(404, 'invalidPayload', 'Unknown mock control')
    }

    if (path === '/v1/health' && req.method === 'GET') {
      return send(200, { app: 'playbuddy', appVersion: '0.0.0-mock', apiVersion: '1.0', rulesVersion: 'pf2e@mock', game: { open: true, apiEnabled: true } })
    }
    if (path === '/v1/pair' && req.method === 'POST') {
      if (String(body.code) !== PAIR_CODE) return fail(400, 'pairCodeInvalid', 'Wrong pair code')
      const token = randomUUID()
      state.tokens.add(token)
      return send(201, { token, clientId: `c_${token.slice(0, 6)}` })
    }
    const token = (req.headers.authorization ?? '').replace(/^Bearer\s+/, '')
    if (!state.tokens.has(token)) return fail(401, 'unauthorized', 'Pair first')
    if (path === '/v1/pair' && req.method === 'DELETE') { state.tokens.delete(token); return send(204) }

    if (path === '/v1/game' && req.method === 'GET') return send(200, gameView())

    const levels = (url.searchParams.get('levels') ?? 'basic').split(',').filter(Boolean)
    if (path === '/v1/status' && req.method === 'GET') return send(200, { players: state.players.map(p => statusView(p, levels)) })
    const sm = path.match(/^\/v1\/players\/([^/]+)\/status$/)
    if (sm && req.method === 'GET') {
      const p = player(decodeURIComponent(sm[1]))
      if (!p) return fail(404, 'playerNotFound', 'Unknown player')
      const v = statusView(p, levels)
      if (v.notShared.length === levels.length) return send(403, { error: { code: 'notShared', message: 'The player shares none of these' } })
      return send(200, v)
    }

    if (path === '/v1/offers' && req.method === 'POST') {
      const key = req.headers['idempotency-key']
      if (!key) return fail(400, 'invalidPayload', 'Idempotency-Key is required')
      if (state.byKey.has(key)) return send(200, state.offers.get(state.byKey.get(key)))
      if (!Array.isArray(body.to) || !body.to.length || !body.payload) return fail(400, 'invalidPayload', 'to and payload are required')
      for (const id of body.to) if (!player(id)) return fail(404, 'playerNotFound', `Unknown player ${id}`)
      if (body.payload.kind === 'item') {
        for (const it of body.payload.items ?? []) {
          if (!it.ref === !it.definition) return fail(400, 'invalidPayload', 'Each item needs ref or definition')
          if (it.ref && it.ref.slug === 'unknown-item') return fail(400, 'unknownItem', `Not in the catalog: ${it.ref.slug}`)
        }
      }
      const offer = {
        offerId: `o_${randomUUID().slice(0, 8)}`, idempotencyKey: key, createdAt: iso(), to: body.to, payload: body.payload,
        ...(body.note ? { note: body.note } : {}),
        deliveries: body.to.map(id => ({ playerId: id, state: player(id).online ? 'delivered' : 'queued', at: iso() })),
      }
      state.offers.set(offer.offerId, offer)
      state.byKey.set(key, offer.offerId)
      for (const id of body.to) {
        const p = player(id)
        const auto = body.payload.kind === 'coins' ? p.autoAccept.coins : body.payload.kind === 'heroPoint' ? p.autoAccept.heroPoints : body.payload.kind === 'identify'
        if (auto) answerOffer(offer.offerId, id, 'accepted')
        else autoAnswer(() => answerOffer(offer.offerId, id, 'accepted'))
      }
      return send(201, offer)
    }
    if (path === '/v1/offers' && req.method === 'GET') {
      const open = url.searchParams.get('open') === 'true'
      return send(200, { offers: [...state.offers.values()].filter(o => !open || o.deliveries.some(d => ['queued', 'delivered'].includes(d.state))) })
    }
    const om = path.match(/^\/v1\/offers\/([^/]+)$/)
    if (om) {
      const offer = state.offers.get(decodeURIComponent(om[1]))
      if (!offer) return fail(404, 'offerNotFound', 'No such offer')
      if (req.method === 'GET') return send(200, offer)
      if (req.method === 'DELETE') {
        for (const d of offer.deliveries) {
          if (['queued', 'delivered'].includes(d.state)) { d.state = 'withdrawn'; d.at = iso(); push({ type: 'offerChanged', offerId: offer.offerId, playerId: d.playerId, state: 'withdrawn' }) }
        }
        return send(200, offer)
      }
    }

    if (path === '/v1/requests' && req.method === 'POST') {
      const key = req.headers['idempotency-key']
      if (!key) return fail(400, 'invalidPayload', 'Idempotency-Key is required')
      if (state.byKey.has(key)) { const r = state.requests.get(state.byKey.get(key)); return send(200, { requestId: r.requestId, deliveries: r.deliveries }) }
      if (!['roll', 'damage'].includes(body.kind) || !Array.isArray(body.to)) return fail(400, 'invalidPayload', 'kind and to are required')
      const r = { requestId: `r_${randomUUID().slice(0, 8)}`, body, deliveries: body.to.map(id => ({ playerId: id, state: 'delivered', at: iso() })) }
      state.requests.set(r.requestId, r)
      state.byKey.set(key, r.requestId)
      for (const id of body.to) autoAnswer(() => answerRequest(r.requestId, id, 'accepted'))
      return send(201, { requestId: r.requestId, deliveries: r.deliveries })
    }
    const rm = path.match(/^\/v1\/requests\/([^/]+)$/)
    if (rm && req.method === 'DELETE') {
      const r = state.requests.get(decodeURIComponent(rm[1]))
      if (!r) return fail(404, 'offerNotFound', 'No such request')
      for (const d of r.deliveries) if (['queued', 'delivered'].includes(d.state)) { d.state = 'withdrawn'; push({ type: 'requestChanged', requestId: r.requestId, playerId: d.playerId, state: 'withdrawn' }) }
      return send(200, { requestId: r.requestId, deliveries: r.deliveries })
    }

    if (path === '/v1/catalog/items' && req.method === 'GET') {
      const q = (url.searchParams.get('q') ?? '').toLowerCase()
      const all = [
        { ref: { slug: 'longsword', foundryId: 'X9Ps5cz8oIRRo4zv', pack: 'equipment-srd' }, name: 'Longsword', level: 0, price: 100, priceFor: 1, rarity: 'common', type: 'weapon' },
        { ref: { slug: 'healing-potion-minor' }, name: 'Healing Potion (Minor)', level: 1, price: 400, priceFor: 1, rarity: 'common', type: 'consumable' },
      ]
      return send(200, { items: all.filter(i => i.name.toLowerCase().includes(q)) })
    }

    if (path === '/v1/events' && req.method === 'GET') {
      const after = Number(url.searchParams.get('after') ?? 0)
      const wait = Math.min(30, Number(url.searchParams.get('wait') ?? 0))
      const oldest = state.events[0]?.seq ?? state.seq + 1
      if (after < oldest - 1 && state.events.length >= 1000) return send(200, { events: [], lastSeq: state.seq, resetRequired: true })
      const ready = () => state.events.filter(e => e.seq > after)
      if (!ready().length && wait > 0) {
        await new Promise(resolve => {
          const timer = setTimeout(resolve, wait * 1000)
          state.waiters.push(() => { clearTimeout(timer); resolve() })
          req.on('close', () => { clearTimeout(timer); resolve() })
        })
      }
      if (res.writableEnded || res.destroyed) return
      return send(200, { events: ready(), lastSeq: state.seq })
    }

    return fail(404, 'invalidPayload', `No route ${req.method} ${path}`)
  })

  return new Promise((resolve) => {
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address()
      resolve({
        url: `http://127.0.0.1:${addr.port}`, state,
        close: () => new Promise(r => { for (const w of state.waiters.splice(0)) w(); server.closeAllConnections?.(); server.close(() => r()) }),
      })
    })
  })
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const port = Number(args[args.indexOf('--port') + 1]) || 47110
  const manual = args.includes('--manual')
  const system = args.includes('--system') ? args[args.indexOf('--system') + 1] : 'pf2e'
  createMockServer({ port, manual, system }).then(({ url }) => {
    console.log(`Mock Play Buddy on ${url} — pair code ${PAIR_CODE}${manual ? ' (manual: answer via /mock/*)' : ' (players answer by themselves)'}`)
  })
}

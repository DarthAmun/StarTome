/** Legacy conversion, part 3: characters, the advancement ledger, inventory, purses, starships. */
import { arr, bool, dropped, imageRef, iso, mapped, note, num, numOrNull, obj, oneOf, push, rowsOf, str, strOrNull, tally, type Ctx, type Row } from './context'

type Owner = { kind: 'stash' } | { kind: 'character'; id: string } | { kind: 'encounter'; id: string }

/** 'stash' | 'character:12' | 'encounter:7' → a typed owner with the new id. */
function ownerOf(ctx: Ctx, raw: unknown): Owner | null {
  const s = str(raw)
  if (s === 'stash') return { kind: 'stash' }
  const [kind, oldId] = s.split(':')
  const id = kind === 'character' ? mapped(ctx.map.chr, oldId) : kind === 'encounter' ? mapped(ctx.map.enc, oldId) : null
  return id && (kind === 'character' || kind === 'encounter') ? { kind, id } : null
}

const keyOf = (o: Owner) => (o.kind === 'stash' ? 'stash' : `${o.kind}:${o.id}`)

/** One inventory row; also used for the rows kept inside an encounter's resolution record. */
function inventoryRow(ctx: Ctx, e: Row, id: string, campaignId: string, owner: Owner): Row {
  const ts = iso(e.updated_at, ctx.now)
  const remote = strOrNull(e.pb_entry_id)
  return {
    id, campaignId, owner, ownerKey: keyOf(owner), itemId: strOrNull(e.item_id), quantity: num(e.quantity, 1),
    nameOverride: strOrNull(e.name_override), priceOverride: numOrNull(e.price_override), bulkOverride: numOrNull(e.bulk_override),
    notes: str(e.notes), identified: bool(e.identified, true), playerName: strOrNull(e.player_name), playerDescription: strOrNull(e.player_description),
    runes: e.runes && typeof e.runes === 'object' ? obj(e.runes) : null, grade: strOrNull(e.grade),
    containerId: mapped(ctx.map.inv, e.container_id), attachedTo: mapped(ctx.map.inv, e.attached_to), attachKind: strOrNull(e.attach_kind),
    relic: e.relic && typeof e.relic === 'object' ? { aspects: arr(obj(e.relic).aspects).map(a => str(a)) } : null,
    implanted: bool(e.implanted), upgradeSlots: numOrNull(e.upgrade_slots),
    // A pending offer (pb_offer_id) is not carried over: the outbox starts empty
    link: remote ? { remoteEntryId: remote, offerId: null } : null,
    createdAt: iso(e.created_at, ts), updatedAt: ts,
  }
}

export function convertCharacters(ctx: Ctx): void {
  const withCharacter = new Set<number>()
  for (const c of rowsOf(ctx, 'characters')) {
    const t = tally(ctx, 'characters'); t.read++
    const id = mapped(ctx.map.chr, c.id), campaignId = mapped(ctx.map.camp, c.campaign_id)
    if (!id || !campaignId) { dropped(ctx, 'characters', c, 'its campaign is not in the file'); continue }
    const npc = numOrNull(c.npc_entity_id)
    if (npc !== null) withCharacter.add(npc)
    const ts = iso(c.updated_at, ctx.now)
    const playerId = strOrNull(c.pb_player_id)
    push(ctx, 'characters', {
      id, campaignId, name: str(c.name, 'Character'), role: oneOf(c.role, ['pc', 'companion']) ?? 'pc', level: num(c.level, 1), xp: num(c.xp),
      treatAsPc: bool(c.treat_as_pc), strMod: numOrNull(c.str_mod), entryId: mapped(ctx.map.ent, npc), actorId: mapped(ctx.map.tok, c.token_id),
      link: playerId ? { provider: 'playbuddy', playerId, characterId: strOrNull(c.pb_character_id), mirror: c.pb_status && typeof c.pb_status === 'object' ? obj(c.pb_status) : null } : null,
      companion: c.companion && typeof c.companion === 'object' ? obj(c.companion) : null, companionRulesId: strOrNull(c.companion_rules_id),
      skills: c.sf_skills && typeof c.sf_skills === 'object' ? Object.fromEntries(Object.entries(obj(c.sf_skills)).map(([k, v]) => [k, num(v)])) : null,
      createdAt: iso(c.created_at, ts), updatedAt: ts,
    })
    t.converted++
  }
  // v0.42 made a character for every NPC flagged "Player Character" when the party page loaded; do it here for the ones it never saw
  for (const e of rowsOf(ctx, 'entities')) {
    const a = obj(e.attributes)
    const old = numOrNull(e.id)
    if (e.type !== 'npc' || !bool(a.isPlayerCharacter) || old === null || withCharacter.has(old)) continue
    const campaignId = mapped(ctx.map.camp, e.campaign_id), entryId = mapped(ctx.map.ent, old)
    if (!campaignId || !entryId) continue
    const level = Number.parseInt(str(a.level), 10)
    push(ctx, 'characters', {
      id: ctx.ids(), campaignId, name: str(e.name), role: 'pc', level: Number.isFinite(level) && level > 0 ? level : 1, xp: 0, entryId,
      createdAt: ctx.now, updatedAt: ctx.now,
    })
    note(ctx, `“${str(e.name)}” was flagged as a player character without being in the party; a party member was added for them`)
  }
}

export function convertLedger(ctx: Ctx): void {
  const refOf = (type: unknown, id: unknown) => (type === 'quest' ? mapped(ctx.map.ent, id) : type === 'encounter' ? mapped(ctx.map.enc, id) : null)
  for (const u of rowsOf(ctx, 'levelUps')) {
    const t = tally(ctx, 'levelUps'); t.read++
    const id = mapped(ctx.map.lvl, u.id), campaignId = mapped(ctx.map.camp, u.campaign_id)
    if (!id || !campaignId) { dropped(ctx, 'levelUps', u, 'its campaign is not in the file'); continue }
    const changes = arr(u.changes).map(obj).flatMap((c) => {
      const characterId = mapped(ctx.map.chr, c.characterId)
      return characterId ? [{ characterId, from: num(c.from), to: num(c.to), ...(typeof c.xpFrom === 'number' ? { xpFrom: c.xpFrom } : {}), ...(typeof c.xpTo === 'number' ? { xpTo: c.xpTo } : {}) }] : []
    })
    push(ctx, 'partyLedger', {
      id, campaignId, kind: 'levelUp', at: iso(u.at, ctx.now), undoneAt: strOrNull(u.undone_at),
      trigger: oneOf(u.trigger, ['manual', 'quest', 'encounter']) ?? 'manual', refId: refOf(u.trigger, u.ref_id), changes,
    })
    t.converted++
  }
  for (const a of rowsOf(ctx, 'xpAwards')) {
    const t = tally(ctx, 'xpAwards'); t.read++
    const id = mapped(ctx.map.xp, a.id), campaignId = mapped(ctx.map.camp, a.campaign_id)
    if (!id || !campaignId) { dropped(ctx, 'xpAwards', a, 'its campaign is not in the file'); continue }
    push(ctx, 'partyLedger', {
      id, campaignId, kind: 'xpAward', at: iso(a.at, ctx.now), undoneAt: strOrNull(a.undone_at),
      source: oneOf(a.source, ['encounter', 'accomplishment']) ?? 'accomplishment', refType: oneOf(a.ref_type, ['encounter', 'quest']),
      refId: refOf(a.ref_type, a.ref_id), amount: num(a.amount), reason: str(a.reason),
      characterIds: arr(a.character_ids).map(c => mapped(ctx.map.chr, c)).filter((c): c is string => c !== null),
    })
    t.converted++
  }
  for (const a of rowsOf(ctx, 'treasureAwards')) {
    const t = tally(ctx, 'treasureAwards'); t.read++
    const id = mapped(ctx.map.treasure, a.id), campaignId = mapped(ctx.map.camp, a.campaign_id)
    if (!id || !campaignId) { dropped(ctx, 'treasureAwards', a, 'its campaign is not in the file'); continue }
    push(ctx, 'partyLedger', {
      id, campaignId, kind: 'treasureAward', at: iso(a.at, ctx.now), undoneAt: strOrNull(a.undone_at),
      value: num(a.value), consumables: num(a.consumables), label: str(a.label),
    })
    t.converted++
  }
  // A resolved encounter's record becomes a ledger entry
  for (const e of rowsOf(ctx, 'encounters')) {
    const encounterId = mapped(ctx.map.enc, e.id), campaignId = mapped(ctx.map.camp, e.campaign_id)
    const rec = obj(e.resolution)
    if (!encounterId || !campaignId || !Object.keys(rec).length) continue
    const loot = obj(rec.loot)
    const entries = arr(loot.entries).map(obj).flatMap((r) => {
      const owner = ownerOf(ctx, r.owner) ?? { kind: 'encounter' as const, id: encounterId }
      // Rows in a record are a memory of what left the encounter: they keep an id only if that row still exists
      return [inventoryRow(ctx, r, mapped(ctx.map.inv, r.id) ?? ctx.ids(), campaignId, owner)]
    })
    push(ctx, 'partyLedger', {
      id: ctx.ids(), campaignId, kind: 'encounterResolved', at: iso(e.resolved_at, iso(e.updated_at, ctx.now)), undoneAt: null, encounterId,
      participants: arr(rec.participants).map(c => mapped(ctx.map.chr, c)).filter((c): c is string => c !== null),
      xpAwardId: mapped(ctx.map.xp, rec.xpAwardId), accomplishment: num(rec.accomplishment),
      loot: { ...loot, entries }, treasure: rec.treasure && typeof rec.treasure === 'object' ? obj(rec.treasure) : null,
    })
  }
}

export function convertInventory(ctx: Ctx): void {
  for (const e of rowsOf(ctx, 'inventory')) {
    const t = tally(ctx, 'inventory'); t.read++
    const id = mapped(ctx.map.inv, e.id), campaignId = mapped(ctx.map.camp, e.campaign_id), owner = ownerOf(ctx, e.owner)
    if (!id || !campaignId) { dropped(ctx, 'inventory', e, 'its campaign is not in the file'); continue }
    if (!owner) { dropped(ctx, 'inventory', e, `its owner “${str(e.owner)}” no longer exists`); continue }
    push(ctx, 'inventory', inventoryRow(ctx, e, id, campaignId, owner))
    t.converted++
  }
  for (const p of rowsOf(ctx, 'purses')) {
    const t = tally(ctx, 'purses'); t.read++
    const campaignId = mapped(ctx.map.camp, p.campaign_id), owner = ownerOf(ctx, p.owner)
    if (!campaignId || !owner) { dropped(ctx, 'purses', p, 'its campaign or owner no longer exists'); continue }
    push(ctx, 'purses', { id: ctx.ids(), campaignId, owner, ownerKey: keyOf(owner), cp: num(p.cp), updatedAt: iso(p.updated_at, ctx.now) })
    t.converted++
  }
}

export function convertStarships(ctx: Ctx): void {
  const crewOf = (list: unknown) => arr(list).map(obj).flatMap((c) => {
    const characterId = mapped(ctx.map.chr, c.characterId)
    return characterId ? [{ characterId, slot: numOrNull(c.slot), activity: strOrNull(c.activity) }] : []
  })
  for (const s of rowsOf(ctx, 'starships')) {
    const t = tally(ctx, 'starships'); t.read++
    const id = mapped(ctx.map.ship, s.id), campaignId = mapped(ctx.map.camp, s.campaign_id)
    if (!id || !campaignId) { dropped(ctx, 'starships', s, 'its campaign is not in the file'); continue }
    const ts = iso(s.updated_at, ctx.now)
    push(ctx, 'starships', {
      id, campaignId, name: str(s.name, 'Starship'), active: bool(s.active), frameId: strOrNull(s.frame_id), levelPinned: numOrNull(s.level_pinned),
      stations: arr(s.stations).map(obj), bays: arr(s.bays).map(obj), hpCurrent: numOrNull(s.hp_current), spCurrent: numOrNull(s.sp_current),
      conditions: arr(s.conditions).map(obj).map(c => ({ name: str(c.name), value: numOrNull(c.value) })),
      crew: crewOf(s.crew), presets: arr(s.presets).map(obj).map(p => ({ name: str(p.name), crew: crewOf(p.crew) })),
      interiorEncounterId: mapped(ctx.map.enc, s.interior_encounter_id), notes: str(s.notes), image: imageRef(ctx, s.img),
      createdAt: iso(s.created_at, ts), updatedAt: ts,
    })
    t.converted++
  }
}

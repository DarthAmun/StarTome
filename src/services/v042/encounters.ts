/** Legacy conversion, part 2: the token library, encounters, their maps, placed tokens and logs. */
import { arr, bool, dropped, imageRef, iso, mapped, noteImageIds, num, numOrNull, obj, oneOf, push, rowsOf, str, strOrNull, tally, type Ctx, type Row } from './context'

type Ref = { kind: 'rules'; rulesId: string; adjustment: 'weak' | 'elite' | null } | { kind: 'entry'; entryId: string } | { kind: 'character'; characterId: string } | { kind: 'none' }

function statBlockOf(r: Row): { rulesId: string; adjustment: 'weak' | 'elite' | null } | null {
  return typeof r.linked_rules_id === 'string' && r.linked_rules_id
    ? { rulesId: r.linked_rules_id, adjustment: oneOf(r.rules_adjustment, ['weak', 'elite']) }
    : null
}

/** v0.42's three links (party character, NPC entry, compendium entry) as the one thing the token stands for. */
function refOf(ctx: Ctx, r: Row, characterOfToken: Map<number, string>, tokenId: number | null): { ref: Ref; statBlock: ReturnType<typeof statBlockOf> } {
  const stat = statBlockOf(r)
  const characterId = tokenId !== null ? characterOfToken.get(tokenId) : undefined
  if (characterId) return { ref: { kind: 'character', characterId }, statBlock: stat }
  const entryId = mapped(ctx.map.ent, r.linked_entity_id)
  if (entryId) return { ref: { kind: 'entry', entryId }, statBlock: stat }
  if (stat) return { ref: { kind: 'rules', ...stat }, statBlock: null }
  return { ref: { kind: 'none' }, statBlock: null }
}

export function convertActors(ctx: Ctx): Map<number, string> {
  const characterOfToken = new Map<number, string>()
  for (const c of rowsOf(ctx, 'characters')) {
    const tokenId = numOrNull(c.token_id), id = mapped(ctx.map.chr, c.id)
    if (tokenId !== null && id) characterOfToken.set(tokenId, id)
  }
  for (const t of rowsOf(ctx, 'tokens')) {
    const tl = tally(ctx, 'tokens'); tl.read++
    const id = mapped(ctx.map.tok, t.id)
    if (!id) { dropped(ctx, 'tokens', t, 'it has no id'); continue }
    const { ref, statBlock } = refOf(ctx, t, characterOfToken, numOrNull(t.id))
    push(ctx, 'actors', {
      id, name: str(t.name, 'Token'), image: imageRef(ctx, t.image_source), ref, statBlock, syncImage: bool(t.sync_image),
      pinned: bool(t.is_player_character) && ref.kind !== 'character', createdAt: iso(t.created_at, ctx.now),
    })
    tl.converted++
  }
  return characterOfToken
}

const COVER_FROM_5E: Record<string, string> = { 'three-quarter': 'greater', half: 'standard', quarter: 'lesser' }

export function convertEncounters(ctx: Ctx, characterOfToken: Map<number, string>): void {
  const wallsOf = new Map<number, Row[]>()
  for (const w of rowsOf(ctx, 'encounterWalls')) {
    tally(ctx, 'encounterWalls').read++
    const list = wallsOf.get(num(w.encounter_id)) ?? []
    list.push(w)
    wallsOf.set(num(w.encounter_id), list)
  }

  for (const e of rowsOf(ctx, 'encounters')) {
    const t = tally(ctx, 'encounters'); t.read++
    const id = mapped(ctx.map.enc, e.id), campaignId = mapped(ctx.map.camp, e.campaign_id)
    if (!id || !campaignId) { dropped(ctx, 'encounters', e, 'its campaign is not in the file'); continue }
    const ts = iso(e.updated_at, ctx.now)
    const starship = e.starship && typeof e.starship === 'object' ? { ...obj(e.starship), shipId: mapped(ctx.map.ship, obj(e.starship).shipId) } : null
    push(ctx, 'encounters', {
      id, campaignId, name: str(e.name, 'Encounter'), status: oneOf(e.status, ['prepared', 'active', 'resolved']) ?? 'prepared',
      map: imageRef(ctx, e.map_source),
      grid: { size: num(e.grid_size, 40), offsetX: num(e.grid_offset_x), offsetY: num(e.grid_offset_y) },
      fovEnabled: bool(e.fov_enabled), playlistId: mapped(ctx.map.list, e.sound_playlist_id), initiativeFormula: strOrNull(e.initiative_formula),
      partyLevel: numOrNull(e.party_level), turn: { index: num(e.current_turn_index), round: num(e.round_number, 1) },
      defeated: arr(e.defeated).map(obj), resolvedAt: strOrNull(e.resolved_at), xpTotal: numOrNull(e.xp_total), xpAwarded: numOrNull(e.xp_awarded),
      partyLevelAtResolve: numOrNull(e.party_level_at_resolve), starship, createdAt: iso(e.created_at, ts), updatedAt: ts,
    })
    t.converted++

    const vp = obj(e.viewport)
    const walls = (wallsOf.get(num(e.id)) ?? []).map((w) => {
      tally(ctx, 'encounterWalls').converted++
      const cover = str(w.coverType, 'full')
      return {
        id: ctx.ids(), points: arr(w.points).map(obj).map(p => ({ x: num(p.x), y: num(p.y) })),
        kind: oneOf(COVER_FROM_5E[cover] ?? cover, ['full', 'greater', 'standard', 'lesser', 'window', 'door', 'secret']) ?? 'full',
        open: bool(w.isOpen), generated: bool(w.generated),
      }
    })
    // An emanation follows its token
    const areas = arr(e.areas).map(obj).map(a => ('attachedTokenId' in a ? { ...a, attachedTokenId: mapped(ctx.map.encTok, a.attachedTokenId) } : a))
    const battlemap = e.battlemap && typeof e.battlemap === 'object' ? obj(e.battlemap) : null
    noteImageIds(ctx, battlemap)
    push(ctx, 'encounterMaps', {
      id, fog: Object.fromEntries(Object.entries(obj(e.fog_data)).map(([k, v]) => [k, str(v)])),
      viewport: { x: num(vp.x), y: num(vp.y), scale: num(vp.scale, 1) }, walls, areas, battlemap,
      sensorMap: e.sensor_map && typeof e.sensor_map === 'object' ? obj(e.sensor_map) : null,
    })

    arr(e.combat_log).map(obj).forEach((l, seq) => {
      const { id: _old, round, timestamp, tokenId, tokenName, type, ...detail } = l
      push(ctx, 'combatLog', {
        id: ctx.ids(), encounterId: id, seq, round: num(round),
        at: typeof timestamp === 'number' ? new Date(timestamp).toISOString() : ts,
        combatantId: mapped(ctx.map.encTok, tokenId), combatantName: str(tokenName), type: str(type, 'note'), detail,
      })
    })
  }
  // Walls whose encounter is gone were counted as read; say so
  const orphanWalls = tally(ctx, 'encounterWalls')
  orphanWalls.dropped = orphanWalls.read - orphanWalls.converted

  for (const p of rowsOf(ctx, 'encounterTokens')) {
    const t = tally(ctx, 'encounterTokens'); t.read++
    const id = mapped(ctx.map.encTok, p.id), encounterId = mapped(ctx.map.enc, p.encounter_id)
    if (!id || !encounterId) { dropped(ctx, 'encounterTokens', p, 'its encounter is not in the file'); continue }
    const tokenId = numOrNull(p.token_id)
    const { ref, statBlock } = refOf(ctx, p, characterOfToken, tokenId)
    push(ctx, 'combatants', {
      id, encounterId, actorId: mapped(ctx.map.tok, tokenId), ref, statBlock, label: strOrNull(p.label), image: imageRef(ctx, p.image_source),
      x: num(p.grid_x), y: num(p.grid_y), size: num(p.size, 1), visible: bool(p.is_visible, true), dead: bool(p.is_dead),
      hp: { current: numOrNull(p.hp_current), max: numOrNull(p.hp_max), temp: num(p.temp_hp) }, ac: numOrNull(p.ac), initiative: numOrNull(p.initiative),
      notes: str(p.notes), visionRange: numOrNull(p.vision_range), playerToken: bool(p.is_player_token), elevation: numOrNull(p.elevation),
      conditions: arr(p.conditions).map(obj), timers: arr(p.timers).map(obj), actsWhileHidden: bool(p.acts_while_hidden), ally: bool(p.is_ally),
      usesDying: typeof p.uses_dying === 'boolean' ? p.uses_dying : null,
      sensor: numOrNull(p.sensor_zone) !== null
        ? { zone: num(p.sensor_zone), heading: numOrNull(p.sensor_heading), role: oneOf(p.sensor_role, ['player-ship', 'ship', 'hazard']), shields: numOrNull(p.shield_points), shieldsMax: numOrNull(p.shield_max) }
        : null,
    })
    t.converted++
  }
}

/**
 * Starship damage and destruction (STARFINDER_PLAN.md P7; Tech Core pp. 172–173).
 * Pure; the encounter store applies the results.
 *
 * - Damage reduces Shield Points first, then Hull Points; `bypassing` goes
 *   straight to HP. Healing HP never restores SP.
 * - A player starship at 0 HP becomes compromised 1 (2 on a critical hit or
 *   its own critical failure) plus its wrecked value, and every battle station
 *   malfunctions; it enters initiative right before the turn that dropped it.
 *   Nonlethal damage makes it inoperable instead.
 * - Each of its turns: hull integrity flat check DC 10 + compromised.
 *   Crit success −2, success −1, failure +1, crit failure +2. Compromised 10
 *   destroys it.
 * - Damage that gets past SP while compromised: +1 (+2 crit), and all stations
 *   malfunction again.
 * - Compromised ends at 0 or when it has 1+ HP: wrecked +1, it leaves
 *   initiative and stops being inoperable.
 */
import type { Degree } from '~/rules/dcs'

export interface ShipDamage { sp: number; hp: number; absorbed: number }

/** Shield Points take the damage first unless it's bypassing. */
export function shipDamage(state: { sp: number; hp: number }, amount: number, bypassing = false): ShipDamage {
  const dmg = Math.max(0, Math.round(amount))
  const absorbed = bypassing ? 0 : Math.min(Math.max(0, state.sp), dmg)
  return { sp: state.sp - absorbed, hp: Math.max(0, state.hp - (dmg - absorbed)), absorbed }
}

export interface PlayerShipState {
  compromised: number | null
  wrecked: number
  inoperable: boolean
}

export interface ShipStateChange extends PlayerShipState {
  /** Every battle station malfunctions now. */
  malfunctionAll: boolean
  /** The ship joins (true) or leaves (false) initiative; undefined = no change. */
  initiative?: boolean
  destroyed: boolean
  notes: string[]
}

export const HULL_DESTROYED_AT = 10

export function hullIntegrityDc(compromised: number): number {
  return 10 + compromised
}

function done(state: PlayerShipState, extra: Partial<ShipStateChange> = {}): ShipStateChange {
  const destroyed = (state.compromised ?? 0) >= HULL_DESTROYED_AT
  return { ...state, malfunctionAll: false, destroyed, notes: [], ...extra, ...(destroyed ? { destroyed: true } : {}) }
}

/** The player ship's HP went from `from` to `to`. */
export function playerShipHpChange(state: PlayerShipState, from: number, to: number, opts: { critical?: boolean; nonlethal?: boolean; hullDamage?: number } = {}): ShipStateChange {
  const step = opts.critical ? 2 : 1
  // Damage that reached the hull (at 0 HP the HP don't move, so the caller says how much got past the shields)
  if ((opts.hullDamage ?? Math.max(0, from - to)) > 0) {
    if (state.compromised != null) {
      const c = Math.min(HULL_DESTROYED_AT, state.compromised + step)
      return done({ ...state, compromised: c }, { malfunctionAll: true, notes: [`Compromised ${c}${c >= HULL_DESTROYED_AT ? ': the starship is destroyed' : ''}; every battle station malfunctions.`] })
    }
    if (to === 0 && from > 0) {
      if (opts.nonlethal) return done({ ...state, inoperable: true }, { malfunctionAll: true, notes: ['Inoperable at 0 HP (nonlethal); every battle station malfunctions.'] })
      const c = Math.min(HULL_DESTROYED_AT, step + state.wrecked)
      return done({ ...state, compromised: c, inoperable: true }, { malfunctionAll: true, initiative: true, notes: [`Compromised ${c}; every battle station malfunctions. It now rolls a hull integrity check on its turn.`] })
    }
    return done(state)
  }
  // Repairs: 1+ HP ends compromised (and the inoperable that came with it)
  if (to > 0 && from <= 0 && (state.compromised != null || state.inoperable)) {
    return loseCompromised(state)
  }
  return done(state)
}

function loseCompromised(state: PlayerShipState): ShipStateChange {
  if (state.compromised == null) return done({ ...state, inoperable: false }, { notes: ['No longer inoperable.'] })
  const wrecked = state.wrecked + 1
  return done({ compromised: null, wrecked, inoperable: false }, { initiative: false, notes: [`No longer compromised; wrecked ${wrecked}.`] })
}

/** The hull integrity check on the compromised ship's turn. */
export function hullIntegrityCheck(state: PlayerShipState, degree: Degree): ShipStateChange {
  if (state.compromised == null) return done(state)
  const delta = { 'critical-success': -2, success: -1, failure: 1, 'critical-failure': 2 }[degree]
  const c = Math.max(0, Math.min(HULL_DESTROYED_AT, state.compromised + delta))
  if (c === 0) return loseCompromised({ ...state, compromised: 0 })
  return done({ ...state, compromised: c }, { notes: [c >= HULL_DESTROYED_AT ? 'Compromised 10: the starship is destroyed.' : `Compromised ${c}.`] })
}

/** The ship's state from its token conditions. */
export function shipStateOf(conditions: { name: string; value: number | null }[]): PlayerShipState {
  const val = (n: string) => conditions.find(c => c.name.toLowerCase() === n)
  return {
    compromised: val('compromised') ? val('compromised')!.value ?? 1 : null,
    wrecked: val('wrecked')?.value ?? 0,
    inoperable: !!val('inoperable'),
  }
}

/** Conditions with the ship's state written into them (other conditions stay). */
export function withShipState<C extends { name: string; value: number | null }>(conditions: C[], state: PlayerShipState, make: (name: string, value: number | null) => C): C[] {
  const rest = conditions.filter(c => !['compromised', 'wrecked', 'inoperable'].includes(c.name.toLowerCase()))
  if (state.compromised != null) rest.push(make('Compromised', state.compromised))
  if (state.wrecked > 0) rest.push(make('Wrecked', state.wrecked))
  if (state.inoperable) rest.push(make('Inoperable', null))
  return rest
}

/** Generate Shields: 1d4, +1d4 at 3rd level and every 2 levels after (Tech Core generator). */
export function generateShieldsDice(level: number): number {
  return 1 + Math.max(0, Math.floor((level - 1) / 2))
}

/** Repair Self (non-player starships): HP equal to its level, and one station stops malfunctioning. */
export function repairSelfHp(level: number): number {
  return Math.max(1, level)
}

// ── Emergency Repairs (exploration, Tech Core p. 174) ──────────────────────

export type RepairRank = 'trained' | 'expert' | 'master' | 'legendary'

/** DC at a port and far from one, and the extra HP on a success, by the rank you choose to attempt at. */
export const EMERGENCY_REPAIRS: Record<RepairRank, { port: number; remote: number; bonus: number }> = {
  trained: { port: 15, remote: 20, bonus: 0 },
  expert: { port: 20, remote: 25, bonus: 10 },
  master: { port: 30, remote: 35, bonus: 30 },
  legendary: { port: 40, remote: 45, bonus: 50 },
}

export function emergencyRepairsDc(rank: RepairRank, remote: boolean): number {
  const r = EMERGENCY_REPAIRS[rank]
  return remote ? r.remote : r.port
}

export interface RepairOutcome {
  /** Dice to roll for the Hull Points regained (or the damage on a critical failure). */
  dice: string | null
  /** Flat HP added on a success (higher rank), already doubled for a day of work. */
  bonus: number
  /** Multiplier for the rolled HP (a full day doubles them). */
  multiplier: number
  /** Removes the wrecked condition. */
  clearsWrecked: boolean
  /** A critical failure damages the starship instead. */
  damage: boolean
}

export function emergencyRepairs(degree: Degree, rank: RepairRank, fullDay: boolean): RepairOutcome {
  const mult = fullDay ? 2 : 1
  const bonus = EMERGENCY_REPAIRS[rank].bonus * mult
  switch (degree) {
    case 'critical-success': return { dice: '4d8', bonus, multiplier: mult, clearsWrecked: true, damage: false }
    case 'success': return { dice: '2d8', bonus, multiplier: mult, clearsWrecked: true, damage: false }
    case 'failure': return { dice: null, bonus: 0, multiplier: 1, clearsWrecked: false, damage: false }
    case 'critical-failure': return { dice: '1d8', bonus: 0, multiplier: 1, clearsWrecked: false, damage: true }
  }
}

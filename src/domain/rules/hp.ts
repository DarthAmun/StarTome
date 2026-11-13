/**
 * Temporary Hit Points (COMBAT_PLAN.md §1). Player Core p. 410, same in SF2e:
 * damage takes temporary HP first, healing doesn't restore them, and they
 * don't stack: a new grant keeps the higher value.
 */

export interface HpPool {
  hp: number
  temp: number
}

export interface DamageResult extends HpPool {
  /** Damage the temporary HP took. */
  absorbed: number
}

/** `amount` damage taken by temporary HP first, the rest by HP (never below 0). */
export function damageWithTemp(pool: HpPool, amount: number): DamageResult {
  const dmg = Math.max(0, Math.floor(amount))
  const temp = Math.max(0, pool.temp)
  const absorbed = Math.min(temp, dmg)
  return { hp: Math.max(0, pool.hp - (dmg - absorbed)), temp: temp - absorbed, absorbed }
}

/** Temporary HP after gaining `amount` more: they don't stack, the higher value stays. */
export function grantTemp(current: number, amount: number): number {
  return Math.max(0, current, Math.floor(amount))
}

/**
 * A first guess at the order of map images uploaded together, from their file
 * names (FLOORS_PLAN.md step 3). The GM checks it in the order dialog, so a
 * wrong guess costs a drag, not a map.
 *
 * Words that name a level outright (basement, cellar, Keller, B1, UG, -1,
 * ground, EG, OG2, 2F, attic, roof …) set it. Plain numbers ("Tavern 1",
 * "Floor 2", "level_3") count up from the ground floor: the lowest is the
 * ground floor unless a name says "ground" itself. Names that say nothing
 * go on top in natural order. Equal guesses keep natural order.
 */
import { defaultFloorName } from './floors'

type Guess = { kind: 'level'; level: number; name?: string } | { kind: 'number'; n: number } | { kind: 'top'; name: string } | null

const BELOW = /\b(basement|cellar|keller|crypt|dungeon|undercroft|sewers?|vault|catacombs?|untergeschoss|souterrain|lower)\b/
const GROUND = /\b(ground|groundfloor|erdgeschoss|eg|gf|main|street|entrance|entry)\b/
const TOP = /\b(attic|loft|roof|rooftop|dach|dachboden|spire|top)\b/

function stem(file: string): string {
  return file.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[_.]+/g, ' ')
    // Sizes and grid notes are not floors: 1920x1080, 30x20, 140ppi, 70px, v2
    .replace(/\d+\s*[x×]\s*\d+/gi, ' ').replace(/\d+\s*(ppi|dpi|px)\b/gi, ' ').replace(/\bv\d+\b/gi, ' ')
    .toLowerCase()
}

/** What one file name says about its floor. */
export function guessOne(file: string): Guess {
  const s = stem(file)
  // Explicit codes first: B1, UG2, U1, -1, OG1, 2F, 1st floor …
  const below = /\b(?:b|ug|u|sub ?level ?|basement ?|cellar ?|keller ?)(\d+)\b/.exec(s) ?? /(?:^|[\s-])-(\d+)\b/.exec(s)
  if (below) return { kind: 'level', level: -Number(below[1]) }
  if (BELOW.test(s)) return { kind: 'level', level: -1 }
  if (TOP.test(s)) return { kind: 'top', name: (TOP.exec(s)?.[1] ?? 'top').replace(/^\w/, c => c.toUpperCase()) }
  const og = /\b(?:og|obergeschoss|stock|etage) ?(\d+)\b/.exec(s) ?? /\b(\d+) ?(?:og|f|fl)\b/.exec(s) ?? /\b(\d+)(?:st|nd|rd|th)\b/.exec(s)
  if (og) return { kind: 'level', level: Number(og[1]) }
  if (GROUND.test(s)) return { kind: 'level', level: 0 }
  const n = /(\d+)(?!.*\d)/.exec(s)
  return n ? { kind: 'number', n: Number(n[1]) } : null
}

const natural = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

export interface FloorOrderGuess {
  /** Indexes into the names, bottom to top. */
  order: number[]
  /** The index of the ground floor. */
  ground: number
  /** A floor name for each index. */
  names: string[]
}

export function guessFloorOrder(files: string[]): FloorOrderGuess {
  const guesses = files.map(guessOne)
  const explicitGround = guesses.some(g => g?.kind === 'level' && g.level === 0)
  const numbers = guesses.flatMap(g => (g?.kind === 'number' ? [g.n] : []))
  // Plain numbers count from the ground floor: the lowest is it, unless a name says "ground"
  const base = explicitGround ? 0 : Math.min(...numbers)
  const known = guesses.map(g => (g?.kind === 'level' ? g.level : g?.kind === 'number' ? g.n - base : null))
  const top = Math.max(0, ...known.filter((l): l is number => l !== null))
  // Unknown names above the known ones, then attics and roofs
  const level = guesses.map((g, i) => known[i] ?? (g?.kind === 'top' ? top + 2 : top + 1))
  const order = files.map((_, i) => i).sort((a, b) => level[a]! - level[b]! || natural.compare(files[a]!, files[b]!))
  const ground = order.find(i => level[i] === 0) ?? order.find(i => level[i]! > 0) ?? order[0] ?? 0
  const at = order.indexOf(ground)
  const names = files.map((_, i) => {
    const g = guesses[i]
    return g?.kind === 'top' ? g.name : defaultFloorName(order.indexOf(i) - at)
  })
  return { order, ground, names }
}

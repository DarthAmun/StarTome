/**
 * Expression evaluator for initiative (and other) formulas.
 * Supports: numbers, dice (d20, 2d6), +−×÷, parentheses,
 * functions (floor/ceil/round/abs/min/max), and field references.
 *
 * Example: "d20 + floor(perception / 2)"
 */

type Tok =
  | { k: 'num';   v: number }
  | { k: 'dice';  count: number; sides: number }
  | { k: 'ident'; v: string }
  | { k: 'op';    v: '+' | '-' | '*' | '/' }
  | { k: '(' }
  | { k: ')' }
  | { k: ',' }
  | { k: 'eof' }

function tokenize(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  while (i < src.length) {
    if (/\s/.test(src[i])) { i++; continue }

    // Dice: [count]d[sides]  — must come before num to catch "2d6"
    const dm = src.slice(i).match(/^(\d*)d(\d+)/i)
    if (dm) {
      out.push({ k: 'dice', count: dm[1] ? parseInt(dm[1]) : 1, sides: parseInt(dm[2]) })
      i += dm[0].length
      continue
    }

    // Number
    const nm = src.slice(i).match(/^\d+(\.\d+)?/)
    if (nm) {
      out.push({ k: 'num', v: parseFloat(nm[0]) })
      i += nm[0].length
      continue
    }

    // Identifier / function name
    const im = src.slice(i).match(/^[a-zA-Z_][a-zA-Z0-9_]*/)
    if (im) {
      out.push({ k: 'ident', v: im[0].toLowerCase() })
      i += im[0].length
      continue
    }

    const ch = src[i]
    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      out.push({ k: 'op', v: ch as any })
    } else if (ch === '(') { out.push({ k: '(' }) }
    else if (ch === ')') { out.push({ k: ')' }) }
    else if (ch === ',') { out.push({ k: ',' }) }
    i++
  }
  out.push({ k: 'eof' })
  return out
}

const FUNS: Record<string, (...a: number[]) => number> = {
  floor: Math.floor,
  ceil:  Math.ceil,
  round: Math.round,
  abs:   Math.abs,
  min:   Math.min,
  max:   Math.max,
  sqrt:  Math.sqrt,
}

function rollDice(count: number, sides: number): number {
  let s = 0
  for (let i = 0; i < Math.max(1, count); i++) s += Math.floor(Math.random() * sides) + 1
  return s
}

class Parser {
  private pos = 0
  constructor(private ts: Tok[], private scope: Record<string, number>) {}

  private peek(): Tok  { return this.ts[this.pos] }
  private eat(): Tok   { return this.ts[this.pos++] }

  parse(): number { return this.expr() }

  private expr(): number {
    let v = this.term()
    while (this.peek().k === 'op') {
      const op = (this.peek() as any).v as string
      if (op !== '+' && op !== '-') break
      this.eat()
      const r = this.term()
      v = op === '+' ? v + r : v - r
    }
    return v
  }

  private term(): number {
    let v = this.factor()
    while (this.peek().k === 'op') {
      const op = (this.peek() as any).v as string
      if (op !== '*' && op !== '/') break
      this.eat()
      const r = this.factor()
      v = op === '*' ? v * r : r !== 0 ? v / r : 0
    }
    return v
  }

  private factor(): number {
    if (this.peek().k === 'op' && (this.peek() as any).v === '-') {
      this.eat()
      return -this.primary()
    }
    return this.primary()
  }

  private primary(): number {
    const t = this.peek()
    if (t.k === 'num')  { this.eat(); return t.v }
    if (t.k === 'dice') { this.eat(); return rollDice(t.count, t.sides) }
    if (t.k === 'ident') {
      this.eat()
      if (this.peek().k === '(') {
        this.eat()
        const fn = FUNS[t.v]
        const args: number[] = []
        if (this.peek().k !== ')') {
          args.push(this.expr())
          while (this.peek().k === ',') { this.eat(); args.push(this.expr()) }
        }
        if (this.peek().k === ')') this.eat()
        return fn ? fn(...args) : 0
      }
      return this.scope[t.v] ?? 0
    }
    if (t.k === '(') {
      this.eat()
      const v = this.expr()
      if (this.peek().k === ')') this.eat()
      return v
    }
    return 0
  }
}

/**
 * Evaluate a formula string with an optional numeric scope.
 * Returns an integer result (rounded). Returns 0 on parse error.
 */
export function evaluateFormula(formula: string, scope: Record<string, number> = {}): number {
  try {
    const ts = tokenize(formula.trim())
    return Math.round(new Parser(ts, scope).parse())
  } catch {
    return 0
  }
}

/**
 * Returns true if the formula string parses without error
 * (evaluated with an empty scope, so field refs produce 0).
 */
export function validateFormula(formula: string): boolean {
  try {
    new Parser(tokenize(formula.trim()), {}).parse()
    return true
  } catch {
    return false
  }
}

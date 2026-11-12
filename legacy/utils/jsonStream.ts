/**
 * Reading JSON files too big for one string.
 *
 * V8 caps a string at ~512 MB (2^29 − 24 chars): `file.text()` on a bigger
 * file comes back empty, and JSON.parse never gets a chance. Backups with
 * their images, and DM's Tome exports, get there. `parseJsonStream` reads the
 * file in chunks and parses the top-level object one member at a time, and
 * the members' arrays one row at a time, so no string is ever bigger than one
 * row. Any formatting works; only the top level has to be an object.
 */

/** Files above this are streamed; smaller ones are read in one go (faster). */
export const STREAM_JSON_ABOVE = 128 * 1024 * 1024

/** Reads a JSON file, streaming it when it is big. */
export async function readJsonFile(file: Blob): Promise<unknown> {
  if (file.size <= STREAM_JSON_ABOVE) return JSON.parse(await file.text())
  return parseJsonStream(file)
}

const enum Phase { Start, Key, Value, AfterValue, Elem, AfterElem, Done }

const WS = new Set([0x20, 0x0a, 0x0d, 0x09, 0xfeff])
const STRING_STOP = /["\\]/g

/** Parses a JSON object from a blob without building one string of the whole file. */
export function parseJsonStream(source: Blob): Promise<Record<string, unknown>> {
  return parseJsonChunks(chunksOf(source))
}

async function* chunksOf(source: Blob): AsyncGenerator<string> {
  const reader = source.stream().pipeThrough(new TextDecoderStream()).getReader()
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return
      yield value
    }
  } finally { reader.releaseLock() }
}

/** The parser behind parseJsonStream, over any sequence of text chunks. */
export async function parseJsonChunks(chunks: AsyncIterable<string> | Iterable<string>): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = {}
  let phase = Phase.Start
  let depth = 0          // nesting at the current position (1 = inside the top-level object)
  let inStr = false
  let esc = false        // the previous chunk ended on a backslash inside a string
  let capturing = false
  let capDepth = 0       // depth at which the captured value ends at , : ] }
  let parts: string[] = []
  let capStart = 0
  let key = ''
  let arr: unknown[] | null = null

  const fail = (msg: string): never => { throw new SyntaxError(`Not valid JSON: ${msg}`) }

  const finish = (s: string, end: number): unknown => {
    parts.push(s.slice(capStart, end))
    const text = parts.join('').trim()
    parts = []
    capturing = false
    return JSON.parse(text)
  }

  for await (const s of chunks) {
    capStart = 0
    let i = 0
    if (esc) { esc = false; i = 1 }
    while (i < s.length) {
      if (inStr) {
        STRING_STOP.lastIndex = i
        const m = STRING_STOP.exec(s)
        if (!m) { i = s.length; break }
        if (m[0] === '\\') {
          if (m.index + 1 >= s.length) { esc = true; i = s.length; break }
          i = m.index + 2
          continue
        }
        inStr = false
        i = m.index + 1
        continue
      }
      const c = s.charCodeAt(i)
      if (c === 0x22) { // "
        if (!capturing) {
          if (phase !== Phase.Key && phase !== Phase.Value && phase !== Phase.Elem) fail('unexpected string')
          capturing = true; capStart = i; capDepth = depth
        }
        inStr = true
        i++
        continue
      }
      if (capturing) {
        if (c === 0x7b || c === 0x5b) { depth++; i++; continue } // { [
        const close = c === 0x7d || c === 0x5d                    // } ]
        const sep = c === 0x2c || c === 0x3a                      // , :
        // Inside the captured value: only its own brackets matter
        if (depth > capDepth) { if (close) depth--; i++; continue }
        if (!close && !sep) { i++; continue }
        // The captured value ends here; the delimiter is handled below
        const v = finish(s, i)
        if (phase === Phase.Key) {
          if (c !== 0x3a || typeof v !== 'string') fail('expected a key')
          key = v as string
          phase = Phase.Value
          i++
          continue
        }
        if (phase === Phase.Value) { out[key] = v; phase = Phase.AfterValue }
        else if (phase === Phase.Elem) { arr!.push(v); phase = Phase.AfterElem }
        // fall through: the delimiter belongs to the container
      } else if (WS.has(c)) { i++; continue }

      switch (phase) {
        case Phase.Start:
          if (c !== 0x7b) fail('the file is not a JSON object')
          depth = 1; phase = Phase.Key
          break
        case Phase.Key:
          if (c === 0x7d) { depth = 0; phase = Phase.Done } else fail('expected a key')
          break
        case Phase.Value:
          if (c === 0x5b) { depth = 2; arr = []; out[key] = arr; phase = Phase.Elem; break }
          capturing = true; capStart = i; capDepth = 1
          if (c === 0x7b) depth++
          break
        case Phase.Elem:
          if (c === 0x5d) { depth = 1; phase = Phase.AfterValue; break }
          capturing = true; capStart = i; capDepth = 2
          if (c === 0x7b || c === 0x5b) depth++
          break
        case Phase.AfterElem:
          if (c === 0x2c) phase = Phase.Elem
          else if (c === 0x5d) { depth = 1; phase = Phase.AfterValue }
          else fail('expected , or ] in an array')
          break
        case Phase.AfterValue:
          if (c === 0x2c) phase = Phase.Key
          else if (c === 0x7d) { depth = 0; phase = Phase.Done }
          else fail('expected , or }')
          break
        case Phase.Done:
          fail('text after the end')
      }
      i++
    }
    if (capturing) parts.push(s.slice(capStart))
  }
  if (phase !== Phase.Done) fail('the file ends early')
  return out
}

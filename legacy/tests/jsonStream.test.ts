import { describe, expect, it } from 'vitest'
import { parseJsonChunks, parseJsonStream, readJsonFile } from '~/utils/jsonStream'
import { jsonBlob } from '~/sync/backup'

const DOC = {
  version: 2,
  app: 'startome',
  empty: [],
  emptyObj: {},
  nested: { a: [1, { b: '}]' }], c: null },
  entities: [
    { id: 1, name: 'Quote " and \\ backslash', attributes: { tags: ['a', 'b'], deep: [[1, 2], [3]] } },
    { id: 2, name: 'Brackets [{]} , : inside', content: 'Ünïcödé — 🐉 \u0001' },
    'a string row',
    42, -1.5e3, true, false, null,
  ],
  last: 'end',
}
const TEXT = JSON.stringify(DOC, null, 2)

describe('parseJsonChunks', () => {
  it('parses a document in one chunk', async () => {
    expect(await parseJsonChunks([TEXT])).toEqual(DOC)
  })

  it('parses compact JSON too', async () => {
    expect(await parseJsonChunks([JSON.stringify(DOC)])).toEqual(DOC)
  })

  it('gives the same result wherever the chunks are cut', async () => {
    const text = JSON.stringify(DOC)
    for (let cut = 1; cut < text.length; cut++) {
      expect(await parseJsonChunks([text.slice(0, cut), text.slice(cut)])).toEqual(DOC)
    }
  })

  it('handles one character per chunk (escapes split across chunks)', async () => {
    expect(await parseJsonChunks([...JSON.stringify(DOC)])).toEqual(DOC)
  })

  it('reads an empty object', async () => {
    expect(await parseJsonChunks([' { } '])).toEqual({})
  })

  it('rejects what is not a JSON object', async () => {
    await expect(parseJsonChunks(['[1, 2]'])).rejects.toThrow(SyntaxError)
    await expect(parseJsonChunks(['{"a": [1, 2'])).rejects.toThrow(/ends early/)
    await expect(parseJsonChunks(['{"a": 1} x'])).rejects.toThrow(SyntaxError)
    await expect(parseJsonChunks(['{"a": nope}'])).rejects.toThrow(SyntaxError)
    await expect(parseJsonChunks(['not json'])).rejects.toThrow(SyntaxError)
  })
})

describe('parseJsonStream / readJsonFile', () => {
  it('reads a backup file written by jsonBlob', async () => {
    const payload = { version: 2, app: 'startome', type: 'all', entities: DOC.entities, images: [{ id: 'x', data: 'data:image/png;base64,AAAA' }] }
    expect(await parseJsonStream(jsonBlob(payload))).toEqual(payload)
  })

  it('reads a byte stream with multi-byte characters', async () => {
    const blob = new Blob([new TextEncoder().encode(TEXT)])
    expect(await parseJsonStream(blob)).toEqual(DOC)
    expect(await readJsonFile(blob)).toEqual(DOC)
  })
})

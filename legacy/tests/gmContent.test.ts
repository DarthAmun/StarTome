import { describe, expect, it } from 'vitest'
import { hasGmOnly, stripGmOnly } from '~/utils/gmContent'

describe('stripGmOnly', () => {
  it('leaves text without GM blocks unchanged', () => {
    const md = '# Title\n\nSome text.\n\n> [!note]\n> A normal callout.'
    expect(stripGmOnly(md)).toBe(md)
    expect(hasGmOnly(md)).toBe(false)
  })

  it('removes a hidden callout written by the editor lock toggle', () => {
    const md = 'Public intro.\n\n> [!hidden]\n> The duke is the cult leader.\n> He fears fire.\n\nPublic outro.'
    expect(stripGmOnly(md)).toBe('Public intro.\n\nPublic outro.')
    expect(hasGmOnly(md)).toBe(true)
  })

  it('removes hidden callouts with a title, any case, and blank quote lines', () => {
    const md = 'A\n\n> [!HIDDEN] Secret\n> line one\n>\n> line two\n\nB'
    expect(stripGmOnly(md)).toBe('A\n\nB')
  })

  it('removes several blocks and keeps other callouts', () => {
    const md = '> [!hidden]\n> x\n\n> [!tip]\n> keep\n\nmiddle\n\n> [!hidden]\n> y'
    expect(stripGmOnly(md)).toBe('> [!tip]\n> keep\n\nmiddle')
  })

  it('stops at the first non-quote line', () => {
    const md = '> [!hidden]\n> secret\nvisible right after'
    expect(stripGmOnly(md)).toBe('visible right after')
  })

  it('ignores [!hidden] inside code fences', () => {
    const md = 'Syntax:\n\n```md\n> [!hidden]\n> example\n```\n\nEnd.'
    expect(stripGmOnly(md)).toBe(md)
    expect(hasGmOnly(md)).toBe(false)
  })

  it('handles CRLF and empty input', () => {
    expect(stripGmOnly('a\r\n\r\n> [!hidden]\r\n> b\r\n\r\nc')).toBe('a\n\nc')
    expect(stripGmOnly('')).toBe('')
  })
})

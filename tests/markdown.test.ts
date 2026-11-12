import { describe, expect, it } from 'vitest'
import { advanceClock, isHiddenBlock, joinBlocks, splitBlocks, taskProgress, toggleHiddenBlock, toggleTask } from '@/domain/markdownBlocks'

describe('markdown blocks', () => {
  it('splits at blank lines but never inside a code fence, and joins back', () => {
    const text = '# Title\n\nPara one\nstill one\n\n```\ncode\n\nmore code\n```\n\n- a\n- b'
    const blocks = splitBlocks(text)
    expect(blocks).toEqual(['# Title', 'Para one\nstill one', '```\ncode\n\nmore code\n```', '- a\n- b'])
    expect(joinBlocks(blocks)).toBe(text)
    expect(joinBlocks(['a', '  ', 'b\n\n'])).toBe('a\n\nb')
  })

  it('marks a block GM-only and back', () => {
    const hidden = toggleHiddenBlock('The vendor is a spy.\nReally.')
    expect(hidden).toBe('> [!hidden]\n> The vendor is a spy.\n> Really.')
    expect(isHiddenBlock(hidden)).toBe(true)
    expect(toggleHiddenBlock(hidden)).toBe('The vendor is a spy.\nReally.')
    expect(toggleHiddenBlock('> [!hidden] Secret\n> text')).toBe('**Secret**\ntext')
  })

  it('ticks the n-th task and counts progress', () => {
    const text = '- [ ] ask\n- [x] dig\n  1. [ ] deep'
    expect(toggleTask(text, 0)).toBe('- [x] ask\n- [x] dig\n  1. [ ] deep')
    expect(toggleTask(text, 1)).toBe('- [ ] ask\n- [ ] dig\n  1. [ ] deep')
    expect(toggleTask(text, 2)).toBe('- [ ] ask\n- [x] dig\n  1. [x] deep')
    expect(taskProgress(text)).toEqual({ done: 1, total: 3 })
    expect(taskProgress('no tasks')).toBeNull()
  })

  it('advances the n-th clock and wraps a full one', () => {
    const text = '::clock[Hunt | 1/4] and ::clock[Doom|4/4]'
    expect(advanceClock(text, 0)).toBe('::clock[Hunt | 2/4] and ::clock[Doom|4/4]')
    expect(advanceClock(text, 1)).toBe('::clock[Hunt | 1/4] and ::clock[Doom | 0/4]')
  })
})

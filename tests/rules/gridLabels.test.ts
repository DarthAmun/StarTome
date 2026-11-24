import { describe, expect, it } from 'vitest'
import { cellName, colorNumber, columnName, rulerStep } from '@/domain/rules/gridLabels'

describe('square names', () => {
  it('letters for columns, after Z come AA, AB …', () => {
    expect(columnName(0)).toBe('A')
    expect(columnName(25)).toBe('Z')
    expect(columnName(26)).toBe('AA')
    expect(columnName(27)).toBe('AB')
    expect(columnName(51)).toBe('AZ')
    expect(columnName(52)).toBe('BA')
    expect(columnName(701)).toBe('ZZ')
    expect(columnName(702)).toBe('AAA')
  })

  it('numbers for rows from 1', () => {
    expect(cellName(0, 0)).toBe('A1')
    expect(cellName(0, 4)).toBe('A5')
    expect(cellName(2, 6)).toBe('C7')
    expect(cellName(26, 99)).toBe('AA100')
  })

  it('no name outside the grid', () => {
    expect(cellName(-1, 3)).toBe('')
    expect(cellName(3, -1)).toBe('')
    expect(columnName(-1)).toBe('')
  })
})

describe('grid look', () => {
  it('names every square on a ruler while there is room, else every 2nd, 5th, 10th …', () => {
    expect(rulerStep(40, 22)).toBe(1)
    expect(rulerStep(22, 22)).toBe(1)
    expect(rulerStep(15, 22)).toBe(2)
    expect(rulerStep(6, 22)).toBe(5)
    expect(rulerStep(2, 22)).toBe(20)
  })

  it('reads the grid colour, falling back to the default', () => {
    expect(colorNumber('#ff8000')).toBe(0xff8000)
    expect(colorNumber('#FF8000')).toBe(0xff8000)
    expect(colorNumber('red')).toBe(0xeeeeee)
  })
})

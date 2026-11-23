import { describe, expect, it } from 'vitest'
import { cellName, columnName } from '@/domain/rules/gridLabels'

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

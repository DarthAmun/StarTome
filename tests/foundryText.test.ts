import { describe, expect, it } from 'vitest'
import { convertEnrichers, foundryText, htmlToMarkdown, type TextContext } from '~/converters/foundry/text'

const KNOWN: Record<string, { kind: string; name: string }> = {
  'Compendium.pf2e.spells-srd.Item.sxQZ6yqTn0czJxVd': { kind: 'spell', name: 'Fireball' },
  'Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL': { kind: 'condition', name: 'Frightened' },
  'Compendium.pf2e.actionspf2e.Item.SkZAQRkLLkmBQNB9': { kind: 'action', name: 'Escape' },
}

function ctx(issues: string[] = []): TextContext {
  return {
    resolveUuid: uuid => KNOWN[uuid] ?? null,
    localize: key => ({
      'PF2E.NPC.Abilities.Glossary.Grab': '<p>The creature can @UUID[Compendium.pf2e.actionspf2e.Item.SkZAQRkLLkmBQNB9]{Escape}.</p>',
    } as Record<string, string>)[key] ?? null,
    onIssue: (code, detail) => issues.push(`${code}:${detail}`),
  }
}

describe('Foundry enrichers', () => {
  it('turns UUID links into compendium refs or labels', () => {
    expect(convertEnrichers('cast @UUID[Compendium.pf2e.spells-srd.Item.sxQZ6yqTn0czJxVd]', ctx())).toBe('cast {{spell: Fireball}}')
    expect(convertEnrichers('@UUID[Compendium.pf2e.conditionitems.Item.TBSHQspnbcqxsmjL]{Frightened 1}', ctx())).toBe('{{condition: Frightened}} 1')
    expect(convertEnrichers('@UUID[Compendium.pf2e.spells-srd.Item.sxQZ6yqTn0czJxVd]{a fireball}', ctx())).toBe('a fireball')
    expect(convertEnrichers('@UUID[Compendium.pf2e.spell-effects.Item.abc]{Effect: Bless}', ctx())).toBe('Effect: Bless')
  })

  it('writes checks the way the books do', () => {
    expect(convertEnrichers('@Check[reflex|dc:22|basic]', ctx())).toBe('DC 22 basic Reflex')
    expect(convertEnrichers('@Check[thievery|dc:22|name:Erase the Rune]', ctx())).toBe('DC 22 Thievery')
    expect(convertEnrichers('@Check[flat|dc:5]', ctx())).toBe('DC 5 flat check')
    expect(convertEnrichers('@Check[fortitude]', ctx())).toBe('Fortitude')
    expect(convertEnrichers('@Check[athletics|dc:18]{Athletics DC 18}', ctx())).toBe('Athletics DC 18')
  })

  it('turns damage into dice chips, and keeps unrollable formulas readable', () => {
    expect(convertEnrichers('@Damage[6d6[fire]]', ctx())).toBe('::dice[6d6] fire')
    expect(convertEnrichers('@Damage[(1d8+5)[healing]]', ctx())).toBe('::dice[1d8+5] healing')
    expect(convertEnrichers('@Damage[1d6[persistent,acid]]', ctx())).toBe('::dice[1d6] persistent acid')
    expect(convertEnrichers('@Damage[2d6[bludgeoning],1d6[fire]]', ctx())).toBe('::dice[2d6] bludgeoning plus ::dice[1d6] fire')
    expect(convertEnrichers('@Damage[4d8[untyped]]', ctx())).toBe('::dice[4d8]')
    const issues: string[] = []
    expect(convertEnrichers('@Damage[(ceil(@actor.level/2)+2)d4[untyped]]', ctx(issues))).toBe('(half level+2)d4')
    expect(issues[0]).toMatch(/^damage-formula/)
  })

  it('handles templates, localize and inline rolls', () => {
    expect(convertEnrichers('@Template[burst|distance:20]', ctx())).toBe('20-foot burst')
    expect(convertEnrichers('@Template[type:emanation|distance:30]', ctx())).toBe('30-foot emanation')
    expect(convertEnrichers('@Localize[PF2E.NPC.Abilities.Glossary.Grab]', ctx())).toBe('<p>The creature can {{action: Escape}}.</p>')
    expect(convertEnrichers('Roll [[/gmr 1d10 #Routine Result]]{d10}.', ctx())).toBe('Roll ::button[d10 | 1d10].')
    expect(convertEnrichers('regain [[/r 2d8]] HP', ctx())).toBe('regain ::dice[2d8] HP')
    expect(convertEnrichers('[[/act sense-direction]]{Survival}', ctx())).toBe('Survival')
    expect(convertEnrichers('[[/act escape dc=20]]', ctx())).toBe('Escape')
  })

  it('reports what it could not resolve', () => {
    const issues: string[] = []
    convertEnrichers('@UUID[Compendium.pf2e.nope.Item.x] @Localize[Missing.Key] @Weird[x]', ctx(issues))
    expect(issues).toEqual(['uuid-unresolved:Compendium.pf2e.nope.Item.x', 'localize-missing:Missing.Key', 'enricher-unknown:Weird'])
  })
})

describe('Foundry HTML → markdown', () => {
  it('converts paragraphs, emphasis, rules and action glyphs', () => {
    const html = '<p><strong>Activate</strong> <span class="action-glyph">A</span> (manipulate)</p><hr /><p>A <em>healing potion</em> heals.</p>'
    expect(htmlToMarkdown(html)).toBe('**Activate** ◆ (manipulate)\n\n---\n\nA *healing potion* heals.')
  })

  it('moves whitespace out of emphasis and drops empty emphasis', () => {
    expect(htmlToMarkdown('<p><strong>Trigger </strong>You fall.<strong></strong></p>')).toBe('**Trigger** You fall.')
  })

  it('converts lists, headings and entities', () => {
    const html = '<h2>Effects</h2><ul><li>One &amp; two</li><li>Three&nbsp;four</li></ul><ol><li>First</li><li>Second</li></ol>'
    expect(htmlToMarkdown(html)).toBe('### Effects\n\n- One & two\n\n- Three four\n\n1. First\n\n2. Second')
  })

  it('converts tables with a header row', () => {
    const html = '<table><thead><tr><th>d10</th><th>Result</th></tr></thead><tbody><tr><td>1–4</td><td>Slam</td></tr><tr><td>5</td><td>Spin | twist</td></tr></tbody></table>'
    expect(htmlToMarkdown(html)).toBe('| d10 | Result |\n| --- | --- |\n| 1–4 | Slam |\n| 5 | Spin \\| twist |')
  })

  it('runs the whole pipeline on a real hazard description', () => {
    const html = '<p><strong>Trigger</strong> A living creature enters the sensor area</p>\n<hr />\n<p><strong>Effect</strong> The rune detonates a @UUID[Compendium.pf2e.spells-srd.Item.sxQZ6yqTn0czJxVd] that deals @Damage[6d6[fire]] damage (@Check[reflex|dc:22|basic] save).</p>'
    expect(foundryText(html, ctx())).toBe(
      '**Trigger** A living creature enters the sensor area\n\n---\n\n**Effect** The rune detonates a {{spell: Fireball}} that deals ::dice[6d6] fire damage (DC 22 basic Reflex save).',
    )
  })
})

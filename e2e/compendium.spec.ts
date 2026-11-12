import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'

/** Phase 3: the compendium. A miniature Foundry release is synced, then browsed, rolled from, edited and extended with homebrew. */

interface Doc { name: string; _stats?: { systemVersion?: string } }
const dir = fileURLToPath(new URL('../tests/fixtures/foundry/', import.meta.url))
const fixtures: { game: string; pack: string; doc: Doc }[] = JSON.parse(readFileSync(`${dir}docs.json`, 'utf8'))
const lang: Record<string, string> = JSON.parse(readFileSync(`${dir}context.json`, 'utf8')).lang

/** A small pf2e json-assets.zip built from the unit tests' fixtures. */
async function releaseZip(): Promise<Buffer> {
  const zip = new JSZip()
  for (const pack of ['conditions', 'equipment', 'pathfinder-monster-core', 'spells', 'classes', 'feats']) {
    zip.file(`packs/${pack}.json`, JSON.stringify(fixtures.filter(f => f.game === 'pf2e' && f.pack === pack).map(f => f.doc)))
  }
  const en: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(lang)) {
    const parts = key.split('.')
    let node = en
    for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>
    node[parts.at(-1) ?? ''] = value
  }
  zip.file('lang/en.json', JSON.stringify(en))
  return zip.generateAsync({ type: 'nodebuffer' })
}

async function sync(page: Page) {
  await page.goto('/#/compendium/sync')
  await page.getByTestId('sync-file').setInputFiles({ name: 'json-assets.zip', mimeType: 'application/zip', buffer: await releaseZip() })
  await expect(page.getByText(/Pathfinder 2e \d/).first()).toBeVisible()
  await page.getByTestId('sync-run').click()
  await expect(page.getByTestId('sync-report')).toContainText('synced in')
}

test('a Foundry release syncs, and a creature is found, read, rolled from and edited', async ({ page }) => {
  await sync(page)
  await expect(page.getByTestId('sync-report')).toContainText('new')
  await page.getByRole('button', { name: 'Open the compendium' }).click()

  // Browse: kind and search narrow the list; the stat block shows beside it
  await page.getByRole('button', { name: /^Creatures/ }).click()
  await page.getByTestId('rules-search').fill('goblin')
  await page.getByRole('button', { name: /Goblin Warrior/ }).click()
  const stat = page.locator('.stat')
  await expect(stat.getByRole('heading', { name: 'Goblin Warrior' })).toBeVisible()
  await expect(stat).toContainText('Recall Knowledge')
  await expect(stat).toContainText('Perception')
  await page.screenshot({ path: 'test-results/shots/compendium-creature.png' })

  // Rolls land in the dice panel
  await stat.getByTitle('First attack').first().click()
  await expect(page.getByTestId('dice-result')).toContainText('Goblin Warrior:')
  await stat.getByTitle('Roll damage').first().click()
  await expect(page.getByTestId('dice-result')).toContainText('damage')
  await page.screenshot({ path: 'test-results/shots/compendium-dice.png' })
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // Field notes: the creature as sentences without numbers
  await stat.getByRole('button', { name: 'Field notes' }).click()
  await expect(page.getByRole('heading', { name: 'Field notes: Goblin Warrior' })).toBeVisible()
  await page.getByRole('button', { name: 'Close', exact: true }).click()

  // An edit to a synced entry is kept as a local edit, and can be dropped again
  await page.getByTestId('rules-edit').click()
  await page.getByLabel('HP', { exact: true }).fill('99')
  await page.getByLabel('HP', { exact: true }).blur()
  await page.screenshot({ path: 'test-results/shots/compendium-editor.png' })
  await page.getByTestId('rules-edit').click()
  await expect(stat).toContainText('HP 99')
  await expect(page.locator('.view .chip', { hasText: 'edited' })).toBeVisible()
  await page.getByRole('button', { name: 'Reset' }).click()
  await page.getByRole('button', { name: 'Drop edits' }).click()
  await expect(stat).not.toContainText('HP 99')

  // The command bar finds rules entries and opens them beside your work
  await page.goto('/#/settings')
  await page.keyboard.press('Control+k')
  await page.keyboard.type('fireb')
  await expect(page.getByRole('button', { name: /Fireball/ })).toBeVisible()
  await page.getByRole('button', { name: /Fireball/ }).click()
  await expect(page.getByLabel('Peek').getByRole('heading', { name: 'Fireball' })).toBeVisible()
  await page.keyboard.press('Control+k')
  await page.keyboard.type('dc 5 hard')
  await expect(page.getByRole('button', { name: /DC 22/ })).toBeVisible()
})

test('homebrew is imported from pasted text, a creature is built, and a pack is listed', async ({ page }) => {
  await page.goto('/#/compendium/homebrew')
  await page.getByRole('button', { name: 'PF2e', exact: true }).click()
  await page.getByPlaceholder('none').fill('Homebrew: Test')
  await page.getByTestId('homebrew-paste').fill('```json\n[{ "kind": "item", "name": "Singing Sword", "level": "3", "category": "weapon", "price": "60 gp", "bogus": 1 }, { "kind": "gizmo", "name": "Nope" }]\n```')
  await page.getByRole('button', { name: 'Check' }).click()
  await expect(page.getByText('Can’t import')).toBeVisible()
  await expect(page.getByText(/fixed/).first()).toBeVisible()
  await page.getByTestId('homebrew-apply').click()
  await expect(page.getByRole('heading', { name: 'Imported 1 entry' })).toBeVisible()
  await expect(page.getByText('Homebrew: Test')).toBeVisible()
  await page.getByRole('link', { name: 'Singing Sword' }).click()
  await expect(page.locator('.stat')).toContainText('Price 60 gp')

  // Build a creature from the tables
  await page.getByRole('button', { name: /^Everything/ }).click()
  await page.getByRole('button', { name: 'Build creature' }).click()
  await page.getByTestId('builder-name').fill('Clockwork Hound')
  await page.getByRole('combobox').filter({ hasText: 'Custom (all moderate)' }).selectOption('brute')
  await page.screenshot({ path: 'test-results/shots/compendium-builder.png' })
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.locator('.stat').getByRole('heading', { name: 'Clockwork Hound' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Rebuild' })).toBeVisible()

  // A new entry of a kind opens in the editor
  await page.getByRole('button', { name: /^Spells/ }).click()
  await page.getByTestId('rules-new').click()
  await page.locator('.editor').getByLabel('Name', { exact: true }).fill('Moonbeam Lash')
  await page.locator('.editor').getByLabel('Name', { exact: true }).blur()
  await page.getByTestId('rules-edit').click()
  await expect(page.locator('.stat').getByRole('heading', { name: 'Moonbeam Lash' })).toBeVisible()
})

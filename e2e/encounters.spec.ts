import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { expect, test, type Page } from '@playwright/test'
import JSZip from 'jszip'

/** Phase 5: encounters. A fight is set up by hand and from the builder, run with damage, conditions and turns, shown to the players, resolved and re-opened. */

interface Doc { name: string }
const dir = fileURLToPath(new URL('../tests/fixtures/foundry/', import.meta.url))
const fixtures: { game: string; pack: string; doc: Doc }[] = JSON.parse(readFileSync(`${dir}docs.json`, 'utf8'))
const lang: Record<string, string> = JSON.parse(readFileSync(`${dir}context.json`, 'utf8')).lang

async function syncCompendium(page: Page) {
  const zip = new JSZip()
  for (const pack of ['conditions', 'equipment', 'pathfinder-monster-core']) zip.file(`packs/${pack}.json`, JSON.stringify(fixtures.filter(f => f.game === 'pf2e' && f.pack === pack).map(f => f.doc)))
  const en: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(lang)) {
    const parts = key.split('.')
    let node = en
    for (const p of parts.slice(0, -1)) node = (node[p] ??= {}) as Record<string, unknown>
    node[parts.at(-1) ?? ''] = value
  }
  zip.file('lang/en.json', JSON.stringify(en))
  await page.goto('/#/compendium/sync')
  await page.getByTestId('sync-file').setInputFiles({ name: 'json-assets.zip', mimeType: 'application/zip', buffer: await zip.generateAsync({ type: 'nodebuffer' }) })
  await expect(page.getByText(/Pathfinder 2e \d/).first()).toBeVisible()
  await page.getByTestId('sync-run').click()
  await expect(page.getByTestId('sync-report')).toContainText('synced in')
}

async function newCampaign(page: Page, name: string, members: string[] = []) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill(name)
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  if (members.length) await page.getByRole('link', { name: 'Party' }).click()
  for (const m of members) {
    await page.getByTestId('party-add').fill(m)
    await page.getByRole('button', { name: '+ PC' }).last().click()
    await expect(page.locator(`[data-member="${m}"]`)).toBeVisible()
  }
  await page.getByRole('link', { name: 'Encounters' }).click()
  await expect(page.getByRole('heading', { name: 'Encounters', exact: true })).toBeVisible()
}

const turn = (page: Page, name: string) => page.locator(`[data-turn="${name}"]`)
const hp = (page: Page, name: string) => page.locator(`[data-hp="${name}"]`)

async function addByHand(page: Page, name: string, hpMax: number, count = 1) {
  await page.getByTestId('quick-add').click()
  await page.getByTestId('quick-token').click()
  await page.getByLabel('Token name').fill(name)
  await page.getByLabel('Token HP').fill(String(hpMax))
  await page.getByLabel('How many').fill(String(count))
  await page.getByTestId('quick-add-confirm').click()
}

test('a fight by hand: tokens, damage, conditions, turns, the log, and the players\' window', async ({ page, context }) => {
  await newCampaign(page, 'Skirmish')
  await page.getByTestId('new-encounter').click()
  await expect(page.getByTestId('encounter-map').locator('canvas')).toBeVisible()
  await page.getByLabel('Encounter name').fill('Bridge fight')
  await page.getByLabel('Encounter name').press('Enter')

  await addByHand(page, 'Bandit', 20, 2)
  await addByHand(page, 'Hero', 30)
  await expect(turn(page, 'Bandit 1')).toBeVisible()
  await expect(turn(page, 'Bandit 2')).toBeVisible()

  // Initiative by hand decides the order
  await page.getByLabel('Initiative of Hero').fill('20'); await page.getByLabel('Initiative of Hero').press('Enter')
  await page.getByLabel('Initiative of Bandit 1').fill('15'); await page.getByLabel('Initiative of Bandit 1').press('Enter')
  await page.getByLabel('Initiative of Bandit 2').fill('10'); await page.getByLabel('Initiative of Bandit 2').press('Enter')
  await expect(page.getByTestId('turn-order').locator('li').first()).toContainText('Hero')

  await page.getByTestId('mode-run').click()
  await expect(page.getByTestId('round')).toHaveText('1')
  await expect(turn(page, 'Hero')).toHaveClass(/active/)

  // Damage and healing from the row
  await page.getByLabel('Damage to Bandit 1').fill('7'); await page.getByLabel('Damage to Bandit 1').press('Enter')
  await expect(hp(page, 'Bandit 1')).toHaveText('13')
  await page.getByLabel('Damage to Bandit 1').fill('-2'); await page.getByLabel('Damage to Bandit 1').press('Enter')
  await expect(hp(page, 'Bandit 1')).toHaveText('15')

  // Frightened 2 goes down by one at the end of the bandit's turn, and comes back when the turn is stepped back
  await turn(page, 'Bandit 1').locator('.conds').click()
  await page.getByTestId('condition-search').fill('Frightened')
  await page.getByTestId('condition-search').press('Enter')
  await page.getByRole('button', { name: 'Raise Frightened' }).click()
  await expect(page.locator('[data-condition="Frightened"]')).toContainText('2')
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByTestId('next-turn').click()
  await expect(turn(page, 'Bandit 1')).toHaveClass(/active/)
  await page.getByTestId('next-turn').click()
  await expect(turn(page, 'Bandit 1')).toContainText('FRT1')
  await page.getByTestId('prev-turn').click()
  await expect(turn(page, 'Bandit 1')).toContainText('FRT2')
  await page.getByTestId('next-turn').click()
  await page.getByTestId('next-turn').click()
  await expect(page.getByTestId('round')).toHaveText('2')

  // A token without dying rules is down at 0 HP and leaves the order
  await page.getByLabel('Damage to Bandit 2').fill('25'); await page.getByLabel('Damage to Bandit 2').press('Enter')
  await expect(turn(page, 'Bandit 2')).toHaveClass(/out/)
  await page.getByTestId('tab-log').click()
  await expect(page.getByTestId('combat-log')).toContainText('Bandit 2 is down')
  await expect(page.getByTestId('combat-log')).toContainText('Bandit 1 takes 7 damage')
  await page.screenshot({ path: 'test-results/shots/encounter-run.png' })

  // The players' window follows: names and the round, never the bandits' HP numbers
  const players = await context.newPage()
  await players.goto('/#/player/encounter')
  await expect(players.getByTestId('player-turns')).toContainText('Round 2')
  await expect(players.getByTestId('player-turns')).toContainText('Bandit 1')
  await expect(players.getByTestId('player-turns')).toContainText('Frightened 1')
  await expect(players.getByTestId('player-turns')).not.toContainText('15')
  await players.screenshot({ path: 'test-results/shots/encounter-players.png' })
  await players.close()

  // It is all still there after a reload
  await page.reload()
  await expect(page.getByTestId('round')).toHaveText('2')
  await expect(hp(page, 'Bandit 1')).toHaveText('15')
})

test('an area asks for saves and applies damage by degree', async ({ page }) => {
  await newCampaign(page, 'Fireball')
  await page.getByTestId('new-encounter').click()
  await addByHand(page, 'Ogre', 40)
  await expect(turn(page, 'Ogre')).toBeVisible()
  // A 60-foot burst at the map's corner covers the ogre, wherever it was put
  await page.locator('[data-tool="area"]').click()
  await page.getByLabel('Area size in feet').fill('60')
  const box = await page.getByTestId('encounter-map').boundingBox()
  if (!box) throw new Error('no map')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
  await page.getByTestId('map-menu').getByRole('button', { name: 'Effect…' }).click()
  await page.getByTestId('area-has-effect').check()
  await page.getByLabel('Save DC').fill('20')
  await page.getByLabel('Damage formula').fill('10')
  await page.getByTestId('area-ask-saves').click()
  const row = page.locator('[data-save="Ogre"]')
  await expect(row).toBeVisible()
  await page.getByLabel('Damage rolled').fill('10'); await page.getByLabel('Damage rolled').press('Enter')
  await row.getByLabel('Save modifier of Ogre').fill('5'); await row.getByLabel('Save modifier of Ogre').press('Enter')
  await row.getByLabel('d20 of Ogre').fill('2'); await row.getByLabel('d20 of Ogre').press('Enter')
  await expect(row).toContainText(/critical failure/i)
  await page.getByTestId('area-apply').click()
  await expect(hp(page, 'Ogre')).toHaveText('20')
})

test('the builder makes an encounter with the party; resolving awards XP and re-opening takes it back', async ({ page }) => {
  await syncCompendium(page)
  await newCampaign(page, 'Builder', ['Ana', 'Zed'])
  await page.getByRole('link', { name: 'Builder' }).click()
  await page.getByTestId('builder-search').fill('goblin warrior')
  await page.getByRole('button', { name: 'Add Goblin Warrior' }).click()
  await page.getByRole('button', { name: 'One more' }).click()
  await expect(page.getByTestId('builder-selection')).toContainText('Goblin Warrior')
  await expect(page.getByTestId('threat')).toBeVisible()
  await page.getByLabel('Encounter name').fill('Goblin raid')
  await page.screenshot({ path: 'test-results/shots/encounter-builder.png' })
  await page.getByTestId('create-encounter').click()

  await expect(turn(page, 'Goblin Warrior 1')).toBeVisible()
  await expect(turn(page, 'Goblin Warrior 2')).toBeVisible()
  await expect(turn(page, 'Ana')).toBeVisible()
  await expect(page.getByTestId('difficulty')).toContainText('XP')
  await page.screenshot({ path: 'test-results/shots/encounter-prepare.png' })

  // The stat block opens beside the map; its attack lands in the log under the goblin
  await turn(page, 'Goblin Warrior 1').click()
  await page.getByTestId('open-stat').click()
  await expect(page.locator('.stat').getByRole('heading', { name: 'Goblin Warrior' })).toBeVisible()
  await page.getByLabel('Target').selectOption({ label: 'Ana' })
  await page.locator('.stat').getByTitle('First attack').first().click()
  await expect(page.getByTestId('dice-result').first()).toContainText('vs Ana')

  await page.getByTestId('resolve').click()
  await expect(page.getByTestId('resolve-award')).not.toHaveText('0 XP')
  const award = Number((await page.getByTestId('resolve-award').innerText()).replace(/\D/g, ''))
  await page.getByTestId('confirm-resolve').click()
  await expect(page.getByText(/Resolved · \d+ XP each/)).toBeVisible()
  await page.getByRole('link', { name: 'Party' }).click()
  await expect(page.locator('[data-member="Ana"]').getByLabel('XP')).toHaveValue(String(award))

  await page.getByRole('link', { name: 'Encounters' }).click()
  await expect(page.locator('[data-encounter="Goblin raid"]')).toContainText('Resolved')
  await page.locator('[data-encounter="Goblin raid"]').getByRole('button', { name: 'Re-open' }).click()
  await page.getByRole('button', { name: 'Re-open' }).last().click()
  await expect(page.locator('[data-encounter="Goblin raid"]')).toContainText('Prepared')
  await page.getByRole('link', { name: 'Party' }).click()
  await expect(page.locator('[data-member="Ana"]').getByLabel('XP')).toHaveValue('0')
})

test('the map maker paints a room and makes it the encounter\'s map with walls', async ({ page }) => {
  await newCampaign(page, 'Dungeon')
  await page.getByTestId('new-encounter').click()
  await page.getByTestId('open-map-maker').click()
  const canvas = page.getByTestId('mm-canvas')
  await expect(canvas).toBeVisible()
  const box = await canvas.boundingBox()
  if (!box) throw new Error('no canvas')
  // The room tool is in hand: drag a room, then put a door in its wall with the brush
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.4)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.6, { steps: 5 })
  await page.mouse.up()
  await expect(page.getByTestId('mm-undo')).toBeEnabled()
  await page.locator('[data-tile="door"]').click()
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.4)
  await page.screenshot({ path: 'test-results/shots/map-maker.png' })
  await page.getByTestId('mm-save').click()
  await expect(page.getByText(/Map saved with \d+ walls and doors/)).toBeVisible()
  // Back on the encounter: the image is its map, the grid fits it, sight is on
  await expect(page.getByTestId('encounter-map').locator('canvas')).toBeVisible()
  await expect(page.getByLabel('Grid square size')).toHaveValue('70')
  await expect(page.getByTestId('fov-switch')).toBeChecked()
  await page.screenshot({ path: 'test-results/shots/encounter-map.png' })
})

test('preparing: the map menu, the token editor, fog, walls, sight and the loot dialog work without errors', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newCampaign(page, 'Prep')
  await page.getByTestId('new-encounter').click()
  const map = page.getByTestId('encounter-map')
  await expect(map.locator('canvas')).toBeVisible()
  const box = await map.boundingBox()
  if (!box) throw new Error('no map')
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2

  // Right-click the bare map: a token by hand, placed there
  await page.mouse.click(cx, cy, { button: 'right' })
  await page.getByTestId('menu-add-token').click()
  await page.getByLabel('Token name').fill('Guard')
  await page.getByLabel('Token HP').fill('10')
  await page.getByTestId('quick-add-confirm').click()
  await expect(turn(page, 'Guard')).toBeVisible()

  // Right-click the token: its menu; the editor renames it and gives it a timer
  await page.mouse.click(cx + 4, cy + 4, { button: 'right' })
  await expect(page.getByTestId('map-menu')).toContainText('Guard')
  await page.getByTestId('map-menu').getByRole('button', { name: 'Prone' }).click()
  await page.getByTestId('map-menu').getByRole('button', { name: 'Edit…' }).click()
  await page.getByLabel('Token label').fill('Captain'); await page.getByLabel('Token label').press('Enter')
  await page.getByLabel('Timer name').fill('Breath'); await page.getByLabel('Timer name').press('Enter')
  await expect(page.getByTestId('token-dialog')).toContainText('3 / 3')
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(turn(page, 'Captain')).toContainText('PRN')

  // Fog, a wall, and sight
  await page.locator('[data-tool="fog"]').click()
  await page.getByTestId('fog-cover').click()
  await page.mouse.move(cx - 60, cy - 60); await page.mouse.down(); await page.mouse.move(cx - 20, cy - 60, { steps: 3 }); await page.mouse.up()
  await page.locator('[data-tool="wall"]').click()
  await page.mouse.click(cx + 80, cy - 80)
  await page.waitForTimeout(400)   // a quick second click would be a double-click, which ends the wall
  await page.mouse.click(cx + 80, cy + 80)
  await page.waitForTimeout(400)
  await page.mouse.click(cx + 80, cy + 80, { button: 'right' })
  await page.locator('[data-tool="select"]').click()
  await page.mouse.click(cx + 80, cy, { button: 'right' })
  await expect(page.getByTestId('map-menu')).toContainText('Wall')
  await page.getByTestId('map-menu').getByRole('button', { name: 'Make it: door' }).click()
  await page.getByTestId('fov-switch').check()
  await page.locator('[data-tool="ping"]').click()
  await page.mouse.click(cx, cy)

  await page.getByTestId('open-loot').click()
  await expect(page.getByRole('heading', { name: /Loot ·/ })).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await page.getByTestId('mode-run').click()
  await page.getByRole('button', { name: 'Party', exact: true }).click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'test-results/shots/encounter-sight.png' })
  expect(errors).toEqual([])
})

import { expect, test, type Page } from '@playwright/test'
import { createMockServer } from '../scripts/playbuddy-mock.mjs'

/** Phase 8: the character link, against the mock Play Buddy (players answer by themselves after a moment). */

let mock: { url: string; close(): Promise<void> }
test.beforeAll(async () => { mock = await createMockServer({ port: 0, delayMs: 250 }) })
test.afterAll(async () => { await mock.close() })
const control = (path: string, body: unknown) => fetch(`${mock.url}${path}`, { method: 'POST', body: JSON.stringify(body) })
const member = (page: Page, name: string) => page.locator(`[data-member="${name}"]`)
const sent = (page: Page, text: string) => page.locator('[data-sent]', { hasText: text })

async function pairAndLink(page: Page, name: string) {
  await control('/mock/reset', {})
  await page.goto('/')
  await page.getByLabel('New campaign name').fill(name)
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('link', { name: 'Party' }).click()
  await page.getByLabel('Play Buddy port').fill(new URL(mock.url).port)
  await page.getByTestId('link-code').fill('123456')
  await page.getByTestId('link-pair').click()
  await page.getByTestId('link-campaign').click()
  await page.getByLabel('Party member of Carl').selectOption('new')
  await expect(member(page, 'Groknar')).toBeVisible()
}

test('pair, link a player, see their sheet, give loot, coins and hero points, and ask for a roll', async ({ page }) => {
  await pairAndLink(page, 'Linked')
  // The player's app owns the sheet: level 7 from there, HP and hero points shown
  await expect(member(page, 'Groknar').getByLabel('Level', { exact: true })).toHaveValue('7')
  await expect(member(page, 'Groknar').getByTestId('member-hp')).toContainText('98/112 HP')
  await expect(page.getByTestId('link-panel')).toContainText('following')

  // Their inventory is read from the app
  await page.getByRole('tab', { name: /Groknar/ }).click()
  await expect(page.locator('[data-item="Longsword"]')).toContainText('in their app')
  await expect(page.locator('[data-item="Longsword"]')).toContainText('+1 striking')

  // A gift from the stash is an offer; accepted, it leaves the stash and shows up on them
  await page.getByRole('tab', { name: /Party stash/ }).click()
  await page.getByTestId('inv-add').fill('Ruby')
  await page.getByRole('button', { name: /Add “Ruby” as written/ }).click()
  await page.locator('[data-item="Ruby"]').getByRole('button').first().click()
  await page.getByLabel('Move to').selectOption({ label: 'Groknar' })
  await page.getByTestId('move-item').click()
  await expect(sent(page, 'Ruby → Groknar')).toContainText('accepted')
  await expect(page.locator('[data-item="Ruby"]')).toHaveCount(0)
  await page.getByRole('tab', { name: /Groknar/ }).click()
  await expect(page.locator('[data-item="Ruby"]')).toBeVisible()

  // Hero points and a roll
  await page.getByTestId('link-hero-all').click()
  await expect(member(page, 'Groknar').getByTestId('member-hp')).toContainText('●●○')
  await page.getByTestId('link-roll-ask').click()
  await expect(page.getByTestId('link-rolls')).toContainText('Groknar · Perception:')
  await page.screenshot({ path: 'test-results/shots/party-playbuddy.png', fullPage: true })

  // What happens in their app shows here
  await control('/mock/hp', { playerId: 'p_carl', current: 12, conditions: [{ id: 'dying', name: 'Dying', value: 1 }] })
  await expect(member(page, 'Groknar').getByTestId('member-hp')).toContainText('12/112 HP')
  await expect(member(page, 'Groknar').getByTestId('member-hp')).toContainText('Dying 1')
})

test('in an encounter a linked token follows the app, rolls initiative there and is sent the damage it takes', async ({ page }) => {
  await pairAndLink(page, 'Linked fight')
  await page.getByRole('link', { name: 'Build encounter' }).click()
  await page.getByLabel('Encounter name').fill('Ambush')
  await page.getByTestId('create-encounter').click()
  const row = page.locator('[data-turn="Groknar"]')
  await expect(row.locator('[data-hp="Groknar"]')).toHaveText('98')

  await page.getByTestId('ask-initiative').click()
  await expect(row.getByLabel('Initiative of Groknar')).not.toHaveValue('')

  // Their numbers stand where a stat block would
  await row.click()
  await expect(page.getByTestId('linked-sheet')).toContainText('Fort +16')
  await page.screenshot({ path: 'test-results/shots/encounter-playbuddy.png' })

  await page.getByTestId('mode-run').click()
  await row.getByLabel('Damage to Groknar').fill('8')
  await row.getByLabel('Damage to Groknar').press('Enter')
  await expect(row.locator('[data-hp="Groknar"]')).toHaveText('90')
  await expect.poll(async () => (await (await fetch(`${mock.url}/mock/state`)).json()).players[0].character.hp.current).toBe(90)
})

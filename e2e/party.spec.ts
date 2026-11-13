import { expect, test, type Page } from '@playwright/test'

/** Phase 4: the party. Members, levels and XP, the inventory with coins and moves, the wealth readout. */

async function newCampaign(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill(name)
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await page.getByRole('link', { name: 'Party' }).click()
  await expect(page.getByRole('heading', { name: 'Party', exact: true })).toBeVisible()
}
const member = (page: Page, name: string) => page.locator(`[data-member="${name}"]`)
async function addMember(page: Page, name: string, role: 'PC' | 'Companion' = 'PC') {
  await page.getByTestId('party-add').fill(name)
  await page.getByRole('button', { name: `+ ${role}` }).last().click()
  await expect(member(page, name)).toBeVisible()
}

test('members level up, earn XP and can be undone', async ({ page }) => {
  await newCampaign(page, 'Levels')
  await addMember(page, 'Ana')
  await addMember(page, 'Zed')
  await addMember(page, 'Biter', 'Companion')
  await expect(page.getByText('Level 1 · 2 members')).toBeVisible()

  // XP: 1,000 offers a level-up, which costs it again
  await page.getByTestId('award-xp').click()
  await page.getByLabel('For').fill('Saved the town')
  await page.getByLabel('XP per character').fill('1000')
  await page.getByTestId('confirm-xp').click()
  await expect(page.getByText(/reached 1,000 XP/)).toBeVisible()
  await page.getByTestId('confirm-level-up').click()
  await expect(member(page, 'Ana').getByLabel('Level', { exact: true })).toHaveValue('2')
  await expect(member(page, 'Ana').getByLabel('XP')).toHaveValue('0')
  await expect(member(page, 'Biter').getByLabel('Level', { exact: true })).toHaveValue('1')
  await expect(page.getByText('Saved the town')).toBeVisible()
  await page.screenshot({ path: 'test-results/shots/party-roster.png' })

  await page.getByTestId('undo-level-up').click()
  await expect(member(page, 'Ana').getByLabel('Level', { exact: true })).toHaveValue('1')
  await expect(member(page, 'Ana').getByLabel('XP')).toHaveValue('1000')

  // A level set by hand, and a member leaving
  await member(page, 'Zed').getByRole('button', { name: 'Raise level' }).click()
  await expect(page.getByText(/mixed 1–2/)).toBeVisible()
  await member(page, 'Zed').getByTitle(/Remove from the party/).click()
  await page.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(member(page, 'Zed')).toHaveCount(0)
})

test('items and coins are added, moved and counted, and the players\' view hides what they do not know', async ({ page }) => {
  await newCampaign(page, 'Loot')
  await addMember(page, 'Ana')
  await addMember(page, 'Zed')

  // Coins into the stash as treasure, then split
  await page.getByLabel('Coins', { exact: true }).fill('100 gp')
  await page.getByText('as treasure').first().click()
  await page.getByTitle('Add coins').click()
  await expect(page.locator('.purse')).toHaveText('100 gp')
  await page.getByRole('button', { name: 'Split evenly' }).click()
  await expect(page.getByText(/Gave 50 gp to each of 2 members/)).toBeVisible()
  await expect(page.getByRole('tab', { name: /Ana/ })).toContainText('50 gp')

  // A free-text item with a price, unidentified, moved to a character
  await page.getByTestId('inv-add').fill('Odd Idol')
  await page.getByText('unidentified').click()
  await page.getByRole('button', { name: /Add “Odd Idol” as written/ }).click()
  const row = page.locator('[data-item="Odd Idol"]')
  await row.locator('.main').click()
  await row.getByLabel('Price each').fill('25 gp')
  await row.getByLabel('Price each').blur()
  await expect(row.locator('.price')).toHaveText('25 gp')
  await row.getByLabel('Name the players see').fill('Strange statuette')
  await row.getByLabel('Name the players see').blur()
  await page.screenshot({ path: 'test-results/shots/party-inventory.png' })

  await page.getByTestId('inv-view').click()
  await expect(page.locator('[data-item="Strange statuette"] .price')).toHaveText('?')
  await expect(page.getByText('Players know of')).toBeVisible()
  await page.getByTestId('inv-view').click()

  await row.getByLabel('Move to').selectOption({ label: 'Ana' })
  await row.getByRole('button', { name: 'Move', exact: true }).click()
  await expect(page.locator('[data-item="Odd Idol"]')).toHaveCount(0)
  await page.getByRole('tab', { name: /Ana/ }).click()
  await expect(page.locator('[data-item="Odd Idol"]')).toBeVisible()

  // The coins counted as treasure; a recorded award and its undo move the readout
  await expect(page.getByText(/other awards \+100 gp/)).toBeVisible()
  await page.getByLabel('Award value').fill('40 gp')
  await page.getByLabel('Award label').fill('Guild reward')
  await page.getByTestId('record-award').click()
  await expect(page.getByText(/other awards \+140 gp/)).toBeVisible()
  await page.screenshot({ path: 'test-results/shots/party-wealth.png', fullPage: true })
  await page.locator('.log', { hasText: 'Guild reward' }).getByRole('button', { name: 'Undo' }).click()
  await expect(page.getByText(/other awards \+100 gp/)).toBeVisible()
})

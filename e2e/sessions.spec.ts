import { expect, test, type Page } from '@playwright/test'

/** Phase 6: sessions and the table. A board is planned, run with the capture bar, finished with a carry-over, and read back in the log. */

async function newCampaign(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill(name)
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}
const panel = (page: Page, title: string) => page.locator(`[data-panel="${title}"]`)

async function addPanel(page: Page, kind: string, title: string) {
  await page.locator(`[data-add="${kind}"]`).click()
  await page.getByLabel('Panel title').fill(title)
  await page.getByRole('button', { name: 'Close editor' }).click()
  await expect(panel(page, title)).toBeVisible()
}

test('a session is planned, run, logged and finished; what did not come up moves on', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newCampaign(page, 'Chronicle')
  await page.getByRole('link', { name: 'Sessions' }).click()
  await page.getByTestId('new-session').click()
  await expect(page.getByLabel('Session name')).toHaveValue('Session 1')

  await addPanel(page, 'scene', 'The gate')
  await addPanel(page, 'scene', 'The vault')
  await addPanel(page, 'beat', 'Meet the guard')
  await page.screenshot({ path: 'test-results/shots/session-board.png' })

  // Run: the recap comes up, then the capture bar logs onto the selected panel
  await page.getByTestId('session-run').click()
  await page.getByTestId('recap-done').click()
  await panel(page, 'The gate').click()
  await page.getByLabel('What happened').fill('They bribed their way in.')
  await page.getByLabel('What happened').press('Enter')
  await expect(page.getByText('They bribed their way in.')).toBeVisible()
  await expect(panel(page, 'The gate')).toContainText('played')
  // Nothing selected: improvised
  await page.getByText('on: The gate ×').click()
  await page.getByLabel('What happened').fill('A storm broke.')
  await page.getByLabel('What happened').press('Enter')
  await expect(page.getByText('A storm broke.')).toBeVisible()

  // Finish: the unplayed scene goes to the drawer, the open beat to the next session
  await page.getByTestId('session-finish').click()
  await expect(page.getByText('not played')).toBeVisible()
  await page.getByTestId('confirm-finish').click()
  await expect(page.getByText(/1 panel carried over/)).toBeVisible()
  await expect(panel(page, 'The vault')).toHaveCount(0)
  await page.getByTestId('open-drawer').click()
  await expect(page.locator('[data-drawer="The vault"]')).toBeVisible()

  // The list knows both sessions; the log reads back what was written
  await page.getByTitle('All sessions').click()
  await expect(page.locator('[data-session="Session 2"]')).toBeVisible()
  await expect(page.locator('[data-session="Session 1"]')).toContainText('Played')
  await page.getByTestId('session-log-tab').click()
  await expect(page.getByTestId('session-log')).toContainText('They bribed their way in.')
  await expect(page.getByTestId('session-log')).toContainText('on The gate')
  await page.locator('[data-session="Session 2"]').waitFor({ state: 'detached' })
  await page.screenshot({ path: 'test-results/shots/session-log.png' })
  expect(errors).toEqual([])
})

test('the table bar logs to the running session from anywhere', async ({ page }) => {
  await newCampaign(page, 'Table')
  await page.getByRole('link', { name: 'Sessions' }).click()
  await page.getByTestId('new-session').click()
  await page.getByTestId('session-run').click()
  await page.getByTestId('recap-done').click()
  await page.getByRole('link', { name: 'World' }).click()
  await expect(page.getByTestId('table-bar')).toContainText('Session 1')
  await page.getByLabel('Log to the running session').fill('The bard insulted the duke.')
  await page.getByLabel('Log to the running session').press('Enter')
  await expect(page.getByText('Logged.')).toBeVisible()
  await page.getByTestId('table-bar').getByRole('link', { name: /Session 1/ }).click()
  await expect(page.getByText('The bard insulted the duke.')).toBeVisible()
})

test('the Desk keeps its layout, rolls a DC and generates an NPC; the scratchpad survives a clear', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newCampaign(page, 'Desk')
  await page.getByRole('link', { name: 'Desk' }).click()
  await expect(page.locator('[data-widget="Scratchpad"]')).toBeVisible()
  await expect(page.getByTestId('level-dc')).toHaveText('DC 15')
  await page.getByLabel('Level for the DC').fill('5')
  await expect(page.getByTestId('level-dc')).toHaveText('DC 20')
  await page.getByRole('textbox', { name: 'Scratchpad' }).fill('Remember the storm.')
  await page.locator('[data-tool="npc-generator"]').dblclick()
  await page.getByTestId('npc-generate').click()
  await expect(page.getByTestId('npc-result')).not.toBeEmpty()
  await page.screenshot({ path: 'test-results/shots/desk.png' })
  await page.waitForTimeout(600)

  // The layout and the scratchpad are the campaign's: still there after a reload
  await page.reload()
  await expect(page.locator('[data-widget="NPC generator"]')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Scratchpad' })).toHaveValue('Remember the storm.')
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('button', { name: 'Clear', exact: true }).last().click()
  await expect(page.locator('[data-widget]')).toHaveCount(0)
  await page.locator('[data-tool="scratchpad"]').dblclick()
  await expect(page.getByRole('textbox', { name: 'Scratchpad' })).toHaveValue('Remember the storm.')
  expect(errors).toEqual([])
})

test('sounds: a track by web address, a playlist, and the player bar', async ({ page }) => {
  await page.goto('/#/sounds')
  await page.getByTestId('add-sound-url').click()
  await page.getByLabel('Track address').fill('https://example.invalid/rain.mp3')
  await page.getByLabel('Track name').fill('Rain')
  await page.getByLabel('Track tags').fill('ambience')
  await page.getByTestId('save-track').click()
  await expect(page.locator('[data-track="Rain"]')).toBeVisible()
  await page.getByLabel('New playlist name').fill('Storm')
  await page.getByLabel('New playlist name').press('Enter')
  await page.getByRole('button', { name: 'Add from library' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.locator('[data-playlist="Storm"]')).toContainText('1')
  await page.getByTestId('play-all').click()
  await expect(page.getByTestId('sound-bar')).toContainText('Rain')
  await page.getByRole('button', { name: '#ambience' }).click()
  await expect(page.locator('[data-track="Rain"]')).toBeVisible()
})

test('the start page: the demo campaign, a copy of it, settings and delete', async ({ page }) => {
  await page.goto('/')
  await page.getByTestId('demo-campaign').click()
  await expect(page.getByRole('heading', { name: 'Welcome to StarTome' })).toBeVisible()
  await page.getByTestId('open-board').click()
  await expect(page.locator('[data-panel="Arriving in Brindlemoor"]')).toBeVisible()
  await page.goto('/')
  const card = page.locator('[data-campaign="Welcome to StarTome"]')
  await expect(card).toContainText('NPCs')
  await card.getByRole('button', { name: 'Copy Welcome to StarTome' }).click()
  const copy = page.locator('[data-campaign="Welcome to StarTome (Copy)"]')
  await expect(copy).toContainText('8 entries')
  await copy.getByRole('button', { name: 'Edit Welcome to StarTome (Copy)' }).click()
  await page.getByLabel('Campaign name', { exact: true }).fill('Second table')
  await page.getByLabel('Advancement').selectOption('milestone')
  await page.getByTestId('save-campaign').click()
  await expect(page.locator('[data-campaign="Second table"]')).toBeVisible()
  // The copy has its own board and encounter
  await page.locator('[data-campaign="Second table"] a').first().click()
  await expect(page.getByText('milestones')).toBeVisible()
  await page.getByTestId('open-board').click()
  await expect(page.locator('[data-panel="Wolves at the ford"]')).toContainText('prepared')
  await page.goto('/')
  await page.locator('[data-campaign="Second table"]').getByRole('button', { name: 'Delete Second table' }).click()
  await page.getByRole('button', { name: 'Delete the campaign' }).click()
  await expect(page.locator('[data-campaign="Second table"]')).toHaveCount(0)
  await expect(card).toBeVisible()
})

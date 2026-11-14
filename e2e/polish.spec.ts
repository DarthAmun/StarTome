import { expect, test, type Page } from '@playwright/test'

/** Phase 8b and the small things of plan section 11b: the cheat sheet and settings, commands that set a field, callouts, folding groups, links in the capture bar, the Desk's entry widgets, a single initiative roll. */

async function newCampaign(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill(name)
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}
const bar = (page: Page) => page.getByPlaceholder('Go to a place, find an entry, look up a rule…')
async function command(page: Page, text: string) {
  await page.keyboard.press('Control+k')
  await bar(page).fill(text)
  await page.keyboard.press('Enter')
  await expect(bar(page)).toBeHidden()
}

test('the cheat sheet opens with ?, and Settings lists the shortcuts and the app\'s state', async ({ page }) => {
  await newCampaign(page, 'Keys')
  await page.keyboard.press('?')
  const sheet = page.getByTestId('cheat-sheet')
  await expect(sheet.getByRole('heading', { name: 'Keyboard shortcuts' })).toBeVisible()
  await expect(sheet).toContainText('Quick add while the fight runs')
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()

  await command(page, 'settings')
  await expect(page.getByTestId('settings-app')).toContainText('Works offline')
  await expect(page.getByTestId('install')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Map maker' })).toBeVisible()

  await command(page, 'import')
  await expect(page.getByTestId('unused-images')).toContainText('None are waiting.')
})

test('a command sets a field of the open entry, a callout is drawn as one, and groups fold', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newCampaign(page, 'Fields')
  await command(page, 'new npc Mara')
  const dock = page.getByLabel('Peek')
  await expect(dock.locator('h1')).toHaveText('Mara')
  await command(page, 'set status Imprisoned in the Fort')
  await dock.getByTitle('Fields').click()
  await expect(dock.getByLabel('Status', { exact: true })).toHaveValue('Imprisoned in the Fort')
  await expect(dock.getByLabel('Alive')).toBeChecked()
  await command(page, 'set dead')
  await expect(dock.getByLabel('Alive')).not.toBeChecked()
  await dock.getByTitle('Fields').click()
  await command(page, 'append > [!warning] Careful')
  await expect(dock.locator('blockquote.callout-warn')).toContainText('Careful')

  await command(page, 'new faction The Ledger')
  await command(page, 'world')
  await page.getByLabel('Group by').selectOption('type')
  const groups = page.getByTestId('world-group')
  await expect(groups).toHaveCount(2)
  await expect(page.locator('.row-name')).toHaveCount(2)
  await groups.filter({ hasText: 'NPCs' }).click()
  await expect(page.locator('.row-name')).toHaveText(['The Ledger'])
  await expect(groups.filter({ hasText: 'NPCs' })).toContainText('Mara')
  await groups.filter({ hasText: 'NPCs' }).click()
  await expect(page.locator('.row-name')).toHaveCount(2)
  expect(errors).toEqual([])
})

test('the capture bar links an entry typed with @, and a rename reaches the panel', async ({ page }) => {
  await newCampaign(page, 'Mentions')
  await command(page, 'new npc Orla Venn')
  await page.getByRole('link', { name: 'Sessions' }).click()
  await page.getByTestId('new-session').click()
  await page.getByTestId('session-run').click()
  await page.getByTestId('recap-done').click()
  const what = page.getByLabel('What happened')
  await what.click()
  await page.keyboard.type('Met @Orl')
  await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('Orla Venn')
  // The editor ignores a key pressed in the first instant after the list appears (so a fast typist does not accept by accident)
  await page.waitForTimeout(200)
  await page.keyboard.press('Enter')
  await page.keyboard.type(' at the docks.')
  await page.keyboard.press('Enter')
  const log = page.locator('.panel-node').filter({ hasText: 'at the docks.' })
  await expect(log.locator('a.ref')).toHaveText('Orla Venn')
  await expect(what.locator('.cm-line')).not.toContainText('docks')

  // The entry is still open beside; renamed there, the log follows
  await command(page, 'rename Orla Varn')
  await expect(log.locator('a.ref')).toHaveText('Orla Varn')
})

test('on the Desk an entry is edited in place and a weather list becomes a random table', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newCampaign(page, 'Desk two')
  await command(page, 'new note House rules')
  await page.getByRole('link', { name: 'Desk' }).click()
  await page.getByPlaceholder(/Search/).first().fill('House')
  await page.getByRole('button', { name: /House rules/ }).first().dblclick()
  const widget = page.locator('[data-widget="House rules"]')
  await expect(widget).toBeVisible()
  await widget.getByTestId('desk-entry-pencil').click()
  await expect(widget.getByTestId('desk-entry-edit').locator('h1')).toHaveText('House rules')
  await widget.getByRole('button', { name: 'Done' }).click()
  await expect(widget.getByTestId('desk-entry-edit')).toHaveCount(0)

  await page.locator('[data-tool="weather"]').dblclick()
  const weather = page.locator('[data-widget="Weather"]')
  for (const w of ['Clear', 'Rain', 'Storm']) {
    await weather.getByPlaceholder(/Add weather/).fill(w)
    await weather.getByPlaceholder(/Add weather/).press('Enter')
  }
  await weather.getByTestId('weather-table').click()
  await expect(weather.getByRole('button', { name: 'Roll d4' })).toBeVisible()
  await weather.getByRole('button', { name: 'Roll d4' }).click()
  await expect(weather).toContainText(/\d: (Clear|Rain|Storm)/)
  expect(errors).toEqual([])
})

test('one token\'s initiative is rolled by itself', async ({ page }) => {
  await newCampaign(page, 'One roll')
  await page.getByRole('link', { name: 'Encounters' }).click()
  await page.getByTestId('new-encounter').click()
  await expect(page.getByTestId('encounter-map').locator('canvas')).toBeVisible()
  for (const name of ['Bandit', 'Hero']) {
    await page.getByTestId('quick-add').click()
    await page.getByTestId('quick-token').click()
    await page.getByLabel('Token name').fill(name)
    await page.getByLabel('Token HP').fill('20')
    await page.getByTestId('quick-add-confirm').click()
  }
  await expect(page.getByLabel('Initiative of Bandit')).toHaveValue('')
  await page.locator('[data-roll-init="Bandit"]').click()
  await expect(page.getByLabel('Initiative of Bandit')).not.toHaveValue('')
  await expect(page.getByLabel('Initiative of Hero')).toHaveValue('')
})

test('an NPC joins a faction from its fields, and the faction lists it as a member', async ({ page }) => {
  await newCampaign(page, 'Factions')
  await command(page, 'new faction Lantern Wardens')
  await command(page, 'new npc Kib')
  const dock = page.getByLabel('Peek')
  await expect(dock.locator('h1')).toHaveText('Kib')
  await dock.getByTitle('Fields').click()
  const pick = dock.getByTestId('npc-factions').getByRole('combobox')
  await pick.fill('Lantern Wardens')
  await pick.press('Enter')
  await expect(dock.getByTestId('npc-factions')).toContainText('Lantern Wardens')
  await dock.getByTitle('Fields').click()
  await dock.locator('.rel').getByRole('button', { name: 'Lantern Wardens' }).click()
  await expect(dock.locator('h1')).toHaveText('Lantern Wardens')
  await expect(dock.locator('.rel')).toContainText('Kib')
})

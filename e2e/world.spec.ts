import { expect, test, type Page } from '@playwright/test'

async function newCampaign(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill(name)
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
  await page.getByRole('link', { name: 'World' }).click()
}

async function newEntry(page: Page, type: string, name: string) {
  await page.getByRole('button', { name: 'New', exact: true }).click()
  await page.locator('.menu').getByRole('button', { name: type, exact: true }).click()
  const dock = page.getByLabel('Peek')
  await dock.locator('h1').click()
  await dock.getByLabel('Name').fill(name)
  await dock.getByLabel('Name').press('Enter')
  await expect(dock.locator('h1')).toHaveText(name)
  return dock
}

/** Phase 2: entries are written, linked and renamed without leaving the list. */
test('write an entry, link another, and a rename rewrites the link', async ({ page }) => {
  await newCampaign(page, 'World Test')
  await newEntry(page, 'NPC', 'Kib')
  const dock = await newEntry(page, 'Note', 'Plans')

  // Source mode: the whole text as one document
  await dock.getByRole('radio', { name: 'Source' }).click()
  await dock.locator('.cm-content').click()
  await page.keyboard.type('Ask {{npc: Kib')
  await page.keyboard.press('Escape')
  await page.keyboard.type('}} about the seal.\n\n- [ ] dig')
  await dock.getByRole('radio', { name: 'Read' }).click()
  await expect(dock.locator('.prose .ref')).toHaveText('Kib')
  await expect(dock.locator('.prose .ref')).not.toHaveClass(/unresolved/)

  // Ticking a task in rendered text changes the text
  await dock.locator('.prose input[type=checkbox]').check()
  await dock.getByRole('radio', { name: 'Source' }).click()
  await expect(dock.locator('.cm-content')).toContainText('- [x] dig')

  // The link opens Kib beside; Kib shows who references it
  await dock.getByRole('radio', { name: 'Read' }).click()
  await dock.locator('.prose .ref').click()
  await expect(dock.locator('h1')).toHaveText('Kib')
  await expect(dock.getByText('Referenced by')).toBeVisible()

  // Renaming Kib rewrites the note
  await dock.locator('h1').click()
  await dock.getByLabel('Name').fill('Kib the Bold')
  await dock.getByLabel('Name').press('Enter')
  await dock.locator('.backlinks').getByRole('button', { name: /Plans/ }).click()
  await expect(dock.locator('.prose .ref')).toHaveText('Kib the Bold')

  // It survives a reload
  await page.reload()
  await expect(page.locator('.row-name', { hasText: 'Kib the Bold' })).toBeVisible()
})

test('typed fields save, the live editor edits a block in place, and a region needs no map', async ({ page }) => {
  await newCampaign(page, 'Fields Test')
  const dock = await newEntry(page, 'NPC', 'Mara')
  await dock.getByTitle('Fields').click()
  await dock.getByLabel('Title').fill('Harbour Master')
  await dock.getByLabel('Title').press('Tab')
  await expect(page.locator('.row', { hasText: 'Mara' })).toContainText('Harbour Master')

  await dock.getByRole('radio', { name: 'Live' }).click()
  await dock.getByRole('button', { name: 'Write here…' }).click()
  await page.keyboard.type('Runs the docks.')
  await page.keyboard.press('Escape')
  await expect(dock.locator('.block .prose')).toHaveText('Runs the docks.')
  await dock.locator('.block .prose').click()
  await page.keyboard.type(' Hates fog.')
  await page.keyboard.press('Escape')
  await expect(dock.locator('.block .prose')).toHaveText('Runs the docks. Hates fog.')

  await newEntry(page, 'Region', 'Old Town')
  await expect(dock.getByText('Not on a map yet.')).toBeVisible()
  await page.getByRole('button', { name: /Regions/ }).click()
  await expect(page.locator('.row', { hasText: 'Old Town' })).toBeVisible()
})

test('a graph takes entries and the timeline lists events', async ({ page }) => {
  await newCampaign(page, 'Graph Test')
  await newEntry(page, 'NPC', 'Kib')
  await newEntry(page, 'Event', 'The Fire')
  await page.getByRole('link', { name: 'Graphs' }).click()
  await page.getByRole('button', { name: 'New graph' }).click()
  await page.getByLabel('Add an entry').fill('Kib')
  await page.getByLabel('Add an entry').press('Enter')
  await expect(page.locator('.vue-flow__node', { hasText: 'Kib' })).toBeVisible()
  await page.getByRole('link', { name: 'Timeline' }).click()
  await expect(page.locator('.line h3')).toHaveText('The Fire')
})

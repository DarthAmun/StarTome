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

test('commands, field filters, table view and an embedded card', async ({ page }) => {
  await newCampaign(page, 'Leftovers')
  const bar = page.getByPlaceholder('Go to a place, find an entry, look up a rule…')
  for (const [name, ancestry] of [['Zed', 'Goblin'], ['Ana', 'Elf']] as const) {
    await page.keyboard.press('Control+k')
    await bar.fill(`new npc ${name}`)
    await page.keyboard.press('Enter')
    const dock = page.getByLabel('Peek')
    await expect(dock.locator('h1')).toHaveText(name)
    await dock.getByTitle('Fields').click()
    await dock.getByLabel('Ancestry').fill(ancestry)
    await dock.getByLabel('Ancestry').press('Tab')
    await dock.getByTitle('Fields').click()
  }
  // One type chosen: its fields can be filtered
  await page.locator('.filters').getByRole('button', { name: /NPCs/ }).click()
  await page.locator('.filters').getByRole('button', { name: /Goblin/ }).click()
  await expect(page.locator('.row-name')).toHaveText(['Zed'])
  await page.locator('.tools').getByTitle('Table').click()
  await expect(page.locator('table.table tbody tr')).toHaveCount(1)
  await expect(page.locator('table.table th', { hasText: 'Ancestry' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await page.locator('.tools').getByTitle('Gallery').click()
  await expect(page.locator('.card-name')).toHaveCount(2)

  // An embedded card shows the entry's facts in place
  await page.keyboard.press('Control+k')
  await bar.fill('new note Cast')
  await page.keyboard.press('Enter')
  const dock = page.getByLabel('Peek')
  await dock.getByRole('radio', { name: 'Source' }).click()
  await dock.locator('.cm-content').click()
  await page.keyboard.type('{{npc: Zed | entry')
  await page.keyboard.press('Escape')
  await page.keyboard.type('}}')
  await dock.getByRole('radio', { name: 'Read' }).click()
  await expect(dock.locator('a.embed .embed-meta')).toHaveText('Goblin')

  // A command on the open entry
  await page.keyboard.press('Control+k')
  await bar.fill('rename Dramatis Personae')
  await page.keyboard.press('Enter')
  await expect(dock.locator('h1')).toHaveText('Dramatis Personae')
})

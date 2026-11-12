import { expect, test } from '@playwright/test'

/** Phase 1: the shell. A campaign can be made, places are reached from the command bar, the skin follows the game. */
test('a new campaign opens on Tonight in its game\'s skin, and the command bar goes places', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Which table tonight?' })).toBeVisible()
  await expect(page.getByText('Nothing here yet')).toBeVisible()

  await page.getByLabel('New campaign name').fill('Test Run')
  await page.getByLabel('Game').selectOption('sf2e')
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name: 'Test Run' })).toBeVisible()
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'star')

  await page.keyboard.press('Control+k')
  await page.getByPlaceholder('Go to a place, find an entry, look up a rule…').fill('world')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('heading', { name: 'World' })).toBeVisible()
  await expect(page.getByText('This campaign has no entries yet.')).toBeVisible()

  await page.keyboard.press('Control+k')
  await page.keyboard.type('settings')
  await page.keyboard.press('Enter')
  await page.getByRole('button', { name: 'Light' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light')
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-mode', 'light')
})

test('a full backup downloads and restores into an empty app', async ({ page, browser }) => {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill('Keepsake')
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name: 'Keepsake' })).toBeVisible()
  await page.goto('/#/data')
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download a full backup' }).click()])
  expect(download.suggestedFilename()).toMatch(/^startome-all-\d{4}-\d{2}-\d{2}\.startome\.zip$/)
  const path = await download.path()

  const other = await (await browser.newContext()).newPage()
  await other.goto('/#/data')
  const chooser = other.waitForEvent('filechooser')
  await other.getByRole('button', { name: 'Restore a backup…' }).click()
  await (await chooser).setFiles({ name: 'backup.startome.zip', mimeType: 'application/zip', buffer: await (await import('node:fs/promises')).readFile(path) })
  await other.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(other.getByText(/Restored: 1 campaigns/)).toBeVisible()
  await other.goto('/')
  await expect(other.getByRole('heading', { name: 'Keepsake' })).toBeVisible()
})

import { expect, test, type Page } from '@playwright/test'

/** FLOORS_PLAN.md step 2: floors on the game table. A floor is added, a token moved up through the menu and down the stairs. */

async function newEncounter(page: Page) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill('Tower')
  await page.getByRole('button', { name: 'Begin' }).click()
  await expect(page.getByRole('heading', { name: 'Tower' })).toBeVisible()
  await page.getByRole('link', { name: 'Encounters' }).click()
  await page.getByTestId('new-encounter').click()
  await expect(page.getByTestId('encounter-map').locator('canvas')).toBeVisible()
}

const floorName = (page: Page) => page.getByTestId('floor-current')
const menu = (page: Page) => page.getByTestId('map-menu')

test('floors: add one, move a token up from its menu, and take the stairs back down', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await newEncounter(page)
  const box = await page.getByTestId('encounter-map').boundingBox()
  if (!box) throw new Error('no map')
  // Without an image the engine fits 30 × 20 squares of 40 px (engine.fit): the middle of square c, r on screen
  const scale = Math.max(0.1, Math.min(4, Math.min(box.width / 1200, box.height / 800) * 0.95)), cell = 40 * scale
  const at = (c: number, r: number) => [box.x + (box.width - 1200 * scale) / 2 + (c + 0.5) * cell, box.y + (box.height - 800 * scale) / 2 + (r + 0.5) * cell] as const
  const [cx, cy] = at(12, 8)
  const [sx] = at(8, 8), [ax] = at(15, 8)
  const rightClick = async (x: number, y: number) => { await page.keyboard.press('Escape'); await page.mouse.click(x, y, { button: 'right' }) }

  await page.mouse.click(cx, cy, { button: 'right' })
  await page.getByTestId('menu-add-token').click()
  await page.getByLabel('Token name').fill('Kip')
  await page.getByTestId('quick-add-confirm').click()
  await expect(page.locator('[data-turn="Kip"]')).toBeVisible()

  // One floor: the bar only offers adding one
  await expect(floorName(page)).toHaveText('Floors')
  await floorName(page).click()
  await page.getByTestId('floor-add-above').click()
  await expect(floorName(page)).toHaveText('Floor 2')
  await expect(page.getByText('Map · Floor 2')).toBeVisible()

  // Kip stands on the ground floor, not up here
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Add creature here')
  await page.keyboard.press('Escape')
  await page.keyboard.press('PageDown')
  await expect(floorName(page)).toHaveText('Ground floor')
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Kip')
  await page.getByTestId('menu-floor-up').click()
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Add creature here')
  await page.keyboard.press('Escape')
  await page.getByTestId('floor-up').click()
  await expect(floorName(page)).toHaveText('Floor 2')
  await rightClick(cx, cy)
  await expect(menu(page)).toContainText('Kip')
  await expect(menu(page)).toContainText('Move down to Ground floor')
  await page.keyboard.press('Escape')

  // Stairs from Kip's square up here to a square on the ground floor
  await page.locator('[data-tool="stairs"]').click()
  await page.mouse.click(cx, cy)
  await expect(page.getByTestId('stairs-opts')).toContainText('One end on Floor 2')
  await page.keyboard.press('PageDown')
  await page.mouse.click(sx, cy)
  await expect(page.getByText('Stairs to Floor 2 placed.')).toBeVisible()
  await page.locator('[data-tool="select"]').click()
  await rightClick(sx, cy)
  await expect(menu(page)).toContainText('Stairs up')
  await page.keyboard.press('Escape')

  // Walking off the stairs and back onto them offers the way down
  await page.keyboard.press('PageUp')
  const drag = async (fx: number, tx: number) => { await page.mouse.move(fx, cy); await page.mouse.down(); await page.mouse.move(tx, cy, { steps: 5 }); await page.mouse.up() }
  await drag(cx, ax)
  await expect(page.getByTestId('stair-prompt')).toBeHidden()
  await drag(ax, cx)
  await expect(page.getByTestId('stair-prompt')).toContainText('Kip is on the stairs down to Ground floor')
  await page.getByTestId('stair-go').click()
  await expect(floorName(page)).toHaveText('Ground floor')
  await rightClick(sx, cy)
  await expect(menu(page)).toContainText('Kip')
  await page.keyboard.press('Escape')

  // Removing the floor above keeps Kip, who is down here now
  await page.getByTestId('floor-up').click()
  await floorName(page).click()
  await page.getByTestId('floor-remove').click()
  await page.getByRole('button', { name: 'Remove floor' }).click()
  await expect(floorName(page)).toHaveText('Floors')
  await expect(page.locator('[data-turn="Kip"]')).toBeVisible()
  expect(errors).toEqual([])
})

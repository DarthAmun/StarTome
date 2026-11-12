import { expect, test } from '@playwright/test'
import { openSeeded, seededIds } from './helpers'

test.describe('encounter page', () => {
  test.beforeEach(async ({ page }) => {
    await openSeeded(page)
    const { encounterId } = await seededIds(page)
    await page.goto(`/#/encounter/${encounterId}`)
    await expect(page.locator('canvas').first()).toBeVisible()
  })

  test('right-click on the map: menu at the cursor, then a dialog from it', async ({ page }) => {
    const canvas = page.locator('canvas').first()
    const box = (await canvas.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    await page.mouse.click(x, y, { button: 'right' })

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const m = (await menu.boundingBox())!
    expect(Math.abs(m.x - x)).toBeLessThan(12)
    expect(Math.abs(m.y - y)).toBeLessThan(12)

    await menu.getByRole('menuitem', { name: /Add Creature Here/ }).click()
    await expect(menu).toBeHidden()
    const dialog = page.getByRole('dialog', { name: 'Add to the fight' })
    await expect(dialog).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
  })

  test('map tools show a tooltip on hover', async ({ page }) => {
    const tool = page.getByRole('button', { name: 'Ruler' })
    await tool.hover()
    await expect(page.getByRole('tooltip')).toHaveText('Ruler')
  })
})

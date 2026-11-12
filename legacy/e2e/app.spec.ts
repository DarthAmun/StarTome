import { expect, test } from '@playwright/test'
import { openSeeded, seededIds } from './helpers'

test.describe('dialogs, search and pickers', () => {
  test('a dialog takes focus, and Escape or the mask closes it', async ({ page }) => {
    await openSeeded(page)
    const card = page.locator('.home-camp-card').filter({ hasText: 'Welcome to StarTome' }).first()
    await card.hover()
    await card.getByRole('button', { name: 'Edit' }).click()

    const dialog = page.getByRole('dialog', { name: 'Edit Campaign' })
    await expect(dialog).toBeVisible()
    // Focus goes to the first field, not the close button
    await expect(dialog.locator('input').first()).toBeFocused()

    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()

    await card.hover()
    await card.getByRole('button', { name: 'Edit' }).click()
    await expect(dialog).toBeVisible()
    await page.mouse.click(5, 5)   // the dimmed mask
    await expect(dialog).toBeHidden()
  })

  test('Ctrl+K search finds an entry and closes with Escape', async ({ page }) => {
    await openSeeded(page)
    // The search loads lazily; its shortcut works once its button is there
    await expect(page.locator('.gs-pill-trigger')).toBeVisible()
    await page.keyboard.press('Control+k')
    const search = page.getByRole('dialog', { name: 'Search' })
    await expect(search).toBeVisible()
    await page.keyboard.type('Aldric')
    await expect(search.getByText('Aldric Vane').first()).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(search).toBeHidden()
  })

  test('search forgives typos and looks into entry text', async ({ page }) => {
    await openSeeded(page)
    await expect(page.locator('.gs-pill-trigger')).toBeVisible()
    await page.keyboard.press('Control+k')
    const search = page.getByRole('dialog', { name: 'Search' })
    const input = search.locator('input').first()

    await input.fill('aldirc')   // two letters swapped
    await expect(search.getByText('Aldric Vane').first()).toBeVisible()

    // Only in the faction's text, not in any name
    await input.fill('fugitive')
    await expect(search.getByText('The Obsidian Circle').first()).toBeVisible()
  })

  test('filter pills: ticking a value keeps the menu open', async ({ page }) => {
    await openSeeded(page)
    const { campaignId } = await seededIds(page)
    await page.goto(`/#/campaign/${campaignId}/sessions`)

    await page.locator('.efp-pill', { hasText: 'Mode' }).click()
    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    const first = menu.getByRole('menuitemcheckbox').first()
    await first.click()
    await expect(menu).toBeVisible()
    await expect(first).toHaveAttribute('aria-checked', 'true')
    await expect(page.locator('.efp-pill', { hasText: 'Mode' }).locator('.efp-badge')).toHaveText('1')

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('quest giver: pick an NPC with the keyboard, or keep typed text', async ({ page }) => {
    await openSeeded(page)
    const { campaignId, questId } = await seededIds(page)
    await page.goto(`/#/campaign/${campaignId}/quests/${questId}`)
    await page.getByRole('button', { name: /Attributes/ }).click()

    const clear = page.locator('.giver-clear')
    if (await clear.isVisible()) await clear.click()

    const input = page.locator('.giver-input')
    await input.click()
    await input.fill('Ald')
    const option = page.getByRole('option', { name: /Aldric Vane/ })
    await expect(option).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(page.locator('.giver-name')).toHaveText('Aldric Vane')

    // Typed text that matches nothing stays as a free-text giver
    await page.locator('.giver-clear').click()
    await input.fill('A hooded stranger')
    await input.blur()
    await expect(input).toHaveValue('A hooded stranger')
    await expect(page.locator('.giver-name')).toHaveCount(0)
  })
})

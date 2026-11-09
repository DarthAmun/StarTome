import { expect, test, type Page } from '@playwright/test'
import { openSeeded, seededIds } from './helpers'

/** The last characters of the edit-mode document */
function docTail(page: Page, n = 60) {
  return page.evaluate((n) => {
    const host = document.querySelector('.editor-code') as any
    let c = host.__vueParentComponent
    while (c && c.type.__name !== 'CodeEditor') c = c.parent
    return (c.exposed.view.value.state.doc.toString() as string).slice(-n)
  }, n)
}

/** Aldric's page, once his note has loaded (the editor is replaced when the entry arrives) */
async function openAldric(page: Page) {
  await openSeeded(page)
  const { campaignId, npcId } = await seededIds(page)
  await page.goto(`/#/campaign/${campaignId}/npcs/${npcId}`)
  await expect(page.getByRole('heading', { name: 'NPC Entries' })).toBeVisible()
}

/** Aldric's page with the editor in Edit mode, cursor at the end of the text */
async function editAldric(page: Page) {
  await openAldric(page)
  await page.getByRole('button', { name: 'Edit', exact: true }).click()
  const editor = page.locator('.editor-code .cm-content')
  await expect(editor).toBeVisible()
  await editor.click()
  await page.keyboard.press('Control+End')
  return editor
}

test.describe('note editor (CodeMirror)', () => {
  test('{{ completion links an entry; undo takes it back', async ({ page }) => {
    const editor = await editAldric(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Allied with {{fac')

    const option = page.locator('.cm-tooltip-autocomplete li', { hasText: 'The Obsidian Circle' })
    await expect(option).toBeVisible()
    await page.waitForTimeout(150)   // CodeMirror ignores Enter in the first moments of a list, against accidental picks
    await page.keyboard.press('Enter')
    expect(await docTail(page)).toMatch(/Allied with \{\{faction: The Obsidian Circle\}\}$/)
    await expect(editor.locator('.cm-ref', { hasText: 'The Obsidian Circle' }).last()).toBeVisible()

    await page.keyboard.press('Control+z')
    expect(await docTail(page)).toMatch(/Allied with \{\{fac$/)
  })

  test('a link typed inside toolbar braces gets no doubled braces', async ({ page }) => {
    const editor = await editAldric(page)
    await page.keyboard.press('Enter')
    await page.locator('button[title="Link Factions"]').click()   // inserts {{faction: }} with the cursor inside
    await page.keyboard.type('Obsid')
    await page.locator('.cm-tooltip-autocomplete li', { hasText: 'The Obsidian Circle' }).click()
    await expect(editor).toContainText('{{faction: The Obsidian Circle}}')
    await expect(editor).not.toContainText('}}}}')
  })

  test('toolbar bold wraps the cursor and undoes in one step; lists continue on Enter', async ({ page }) => {
    const editor = await editAldric(page)
    const tail = () => docTail(page, 40)
    await page.keyboard.press('Enter')
    const before = await tail()
    await page.locator('button[title="Bold"]').click()
    await page.keyboard.type('brave')
    expect(await tail()).toMatch(/\*\*brave\*\*$/)
    // The marks and the word typed straight after them are one step (CodeMirror groups quick edits)
    await page.keyboard.press('Control+z')
    expect(await tail()).toBe(before)

    await page.keyboard.type('- first')
    await page.keyboard.press('Enter')
    await page.keyboard.type('second')
    expect(await tail()).toMatch(/\n- first\n- second$/)
    void editor
  })

  test('what you type is saved', async ({ page }) => {
    const editor = await editAldric(page)
    await page.keyboard.press('Enter')
    await page.keyboard.type('Owes the party a favour.')
    await page.waitForTimeout(1200)   // saving waits for a pause in typing
    await page.reload()
    await expect(page.locator('.editor-code .cm-content')).toBeVisible()   // Edit mode is remembered
    await expect(page.locator('.editor-code .cm-content')).toContainText('Owes the party a favour.')
    void editor
  })

  test('mixed mode: a new paragraph opens focused, Escape shows it rendered', async ({ page }) => {
    await openAldric(page)
    await page.getByRole('button', { name: '+ paragraph' }).click()

    const block = page.locator('.mixed-code .cm-content')
    await expect(block).toBeFocused()
    await page.keyboard.type('A **new** paragraph')
    await page.keyboard.press('Escape')
    await expect(block).toHaveCount(0)
    await expect(page.locator('.mixed-preview strong', { hasText: 'new' })).toBeVisible()
  })
})

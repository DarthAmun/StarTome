import { expect, test, type Page } from '@playwright/test'
import { givePortrait, openSeeded, seededIds } from './helpers'

async function openBoard(page: Page) {
  await openSeeded(page)
  const ids = await seededIds(page)
  await page.goto(`/#/campaign/${ids.campaignId}/sessions/${ids.sessionId}`)
  await expect(page.locator('.vue-flow__node').first()).toBeVisible()
  // Panels are measured before edges get real coordinates
  await expect(page.locator('.vue-flow__edge').first()).toBeAttached()
  return ids
}

test.describe('session board', () => {
  test('opening a session shows no dialog by itself', async ({ page }) => {
    await openBoard(page)
    await page.waitForTimeout(800)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('arrows run between the sides of their panels that face each other', async ({ page }) => {
    const ids = await openBoard(page)
    await page.waitForTimeout(500)
    const results = await page.evaluate(async (sessionId) => {
      const db = await new Promise<IDBDatabase>(res => { const rq = indexedDB.open('startome'); rq.onsuccess = () => res(rq.result) })
      const get = <T>(store: string, key?: number) => new Promise<T>(res => {
        const os = db.transaction(store).objectStore(store)
        const rq = key == null ? os.getAll() : os.get(key)
        rq.onsuccess = () => res(rq.result as T)
      })
      const session = await get<{ attributes: any }>('entities', sessionId)
      const attrs = typeof session.attributes === 'string' ? JSON.parse(session.attributes) : session.attributes
      const panels = await get<{ id: number; uid: string }[]>('sessionPanels')
      const nodeOf = (uid: string) => { const p = panels.find(x => x.uid === uid); return p ? document.querySelector<HTMLElement>(`.vue-flow__node[data-id="p${p.id}"]`) : null }

      type Side = 'left' | 'right' | 'top' | 'bottom'
      const sideOn = (r: DOMRect, x: number, y: number): Side | null => {
        const d: [Side, number][] = [['left', Math.abs(x - r.left)], ['right', Math.abs(x - r.right)], ['top', Math.abs(y - r.top)], ['bottom', Math.abs(y - r.bottom)]]
        d.sort((a, b) => a[1] - b[1])
        return d[0]![1] <= 3 ? d[0]![0] : null
      }
      const facing = (a: DOMRect, b: DOMRect): [Side, Side] => {
        const dx = (b.left + b.width / 2) - (a.left + a.width / 2)
        const dy = (b.top + b.height / 2) - (a.top + a.height / 2)
        const gapX = Math.abs(dx) - (a.width + b.width) / 2
        const gapY = Math.abs(dy) - (a.height + b.height) / 2
        if (gapX >= gapY) return dx >= 0 ? ['right', 'left'] : ['left', 'right']
        return dy >= 0 ? ['bottom', 'top'] : ['top', 'bottom']
      }

      const out: { id: string; expected: string; got: string }[] = []
      for (const e of (attrs?.board?.edges ?? []) as { id: string; source: string; target: string }[]) {
        const a = nodeOf(e.source), b = nodeOf(e.target)
        const path = document.querySelector<SVGPathElement>(`.vue-flow__edge[data-id="${e.id}"] path.vue-flow__edge-path`)
        if (!a || !b || !path) continue
        const ctm = path.getScreenCTM()!
        const at = (len: number) => { const p = path.getPointAtLength(len); return new DOMPoint(p.x, p.y).matrixTransform(ctm) }
        const start = at(0), end = at(path.getTotalLength())
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect()
        const [sa, sb] = facing(ra, rb)
        out.push({ id: e.id, expected: `${sa}→${sb}`, got: `${sideOn(ra, start.x, start.y)}→${sideOn(rb, end.x, end.y)}` })
      }
      return out
    }, ids.sessionId)

    expect(results.length).toBeGreaterThan(0)
    for (const r of results) expect(r.got, `edge ${r.id}`).toBe(r.expected)
  })

  test('right-click on the board opens the add menu at the cursor', async ({ page }) => {
    await openBoard(page)
    // An empty spot of the board, as near the bottom-right as possible (floating
    // buttons sit in the very corner): the menu has to flip to stay on screen
    const { x, y } = await page.evaluate(() => {
      const r = document.querySelector('.vue-flow__pane')!.getBoundingClientRect()
      for (let dy = 60; dy < r.height; dy += 20) {
        for (let dx = 60; dx < r.width; dx += 20) {
          const x = r.right - dx, y = r.bottom - dy
          if (document.elementFromPoint(x, y)?.classList.contains('vue-flow__pane')) return { x, y }
        }
      }
      throw new Error('no empty spot on the board')
    })
    await page.mouse.click(x, y, { button: 'right' })

    const menu = page.getByRole('menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByRole('menuitem', { name: 'Scene' })).toBeVisible()
    const m = (await menu.boundingBox())!
    expect(m.x + m.width).toBeLessThanOrEqual(1440)
    expect(m.y + m.height).toBeLessThanOrEqual(900)

    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
  })

  test('an NPC mention in panel text shows the NPC portrait', async ({ page }) => {
    await openSeeded(page)
    const ids = await seededIds(page)
    await givePortrait(page, ids.npcId)
    await page.goto(`/#/campaign/${ids.campaignId}/sessions/${ids.sessionId}`)
    await page.reload()

    const avatar = page.locator('.vue-flow__node .entity-ref[data-entity-name="Aldric Vane"] img.entity-ref-avatar').first()
    await expect(avatar).toHaveAttribute('src', /^blob:/)
    await expect.poll(() => avatar.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  })

  test('a new session starts in Planning', async ({ page }) => {
    await openSeeded(page)
    const { campaignId } = await seededIds(page)
    await page.goto(`/#/campaign/${campaignId}/sessions`)
    await page.getByRole('button', { name: 'New Session' }).first().click()

    const modes = page.getByRole('radiogroup', { name: 'Session mode' })
    await expect(modes.getByRole('radio', { name: 'Planning' })).toHaveAttribute('aria-checked', 'true')
    // The list shows the mode as well
    await expect(page.locator('.erow.active, .erow').filter({ hasText: 'New Session' }).first()).toContainText(/Planning/i)
  })
})

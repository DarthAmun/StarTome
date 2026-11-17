import { crc32, deflateSync } from 'node:zlib'
import { expect, test, type Page } from '@playwright/test'

/** The map maker's palette: starship tiles, image tiles with a role, and the asset library at any size. */

async function openMapMaker(page: Page) {
  await page.goto('/')
  await page.getByLabel('New campaign name').fill('Station')
  await page.getByRole('button', { name: 'Begin' }).click()
  await page.getByRole('link', { name: 'Encounters' }).click()
  await page.getByTestId('new-encounter').click()
  await page.getByTestId('open-map-maker').click()
  await expect(page.getByTestId('mm-canvas')).toBeVisible()
  await page.keyboard.press('0')
}

/** A plain-coloured PNG of w × h pixels. */
function png(w: number, h: number): Buffer {
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 4, Buffer.from([90, 140, 70, 255]))])
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])) >>> 0); return Buffer.concat([len, Buffer.from(t), d, crc]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 6, 0, 0, 0], 8)
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.concat(Array(h).fill(row)))), chunk('IEND', Buffer.alloc(0))])
}

test('a steel room with hull walls and an airlock, and a floor painted with an image tile', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await openMapMaker(page)
  const box = (await page.getByTestId('mm-canvas').boundingBox())!
  const z = Math.min((box.width - 64) / 24, (box.height - 64) / 18)
  const at = (c: number, r: number) => [box.x + (box.width - 24 * z) / 2 + (c + 0.5) * z, box.y + (box.height - 18 * z) / 2 + (r + 0.5) * z] as const

  // The tools show icons with their names for screen readers
  await expect(page.getByRole('button', { name: 'Room' })).toBeVisible()
  // Hull walls and a steel deck: the room tool takes the last wall and the last floor picked
  await page.locator('[data-tile="hull"]').click()
  await page.locator('[data-tile="steel"]').click()
  await page.locator('[data-tool="room"]').click()
  await page.mouse.move(...at(6, 4)); await page.mouse.down(); await page.mouse.move(...at(14, 11), { steps: 5 }); await page.mouse.up()
  await page.locator('[data-tile="airlock"]').click()
  await page.mouse.click(...at(10, 4))

  // An image tile: uploaded, named, a floor
  await page.getByTestId('mm-new-tile').click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByTestId('tile-image').click()
  await (await chooser).setFiles({ name: 'moss.png', mimeType: 'image/png', buffer: png(64, 64) })
  await expect(page.getByLabel('Tile name')).toHaveValue('moss')
  await page.getByLabel('Tile role').selectOption('floor')
  await page.getByTestId('tile-save').click()
  await page.locator('[data-tool="brush"]').click()
  await expect(page.locator('[data-tile="asset:moss"]')).toHaveClass(/on/)
  await page.mouse.click(...at(8, 6))
  await page.mouse.click(...at(9, 6))

  await page.getByTestId('mm-save').click()
  // Hull walls around the room and the airlock as a door: walls were made
  await expect(page.getByText(/Map saved with \d+ walls and doors/)).toBeVisible()
  const map = (await page.getByTestId('encounter-map').boundingBox())!
  const s = Math.max(0.1, Math.min(4, Math.min(map.width / (24 * 70), map.height / (18 * 70)) * 0.95))
  const vtt = (c: number, r: number) => [map.x + (map.width - 24 * 70 * s) / 2 + (c + 0.5) * 70 * s, map.y + (map.height - 18 * 70 * s) / 2 + (r + 0.5) * 70 * s] as const
  await expect(async () => {
    await page.keyboard.press('Escape')
    await page.mouse.click(...vtt(10, 4), { button: 'right' })
    await expect(page.getByTestId('map-menu')).toContainText('Door', { timeout: 500 })
  }).toPass()
  expect(errors).toEqual([])
})

test('the asset library keeps its thumbnails full size with many assets', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await openMapMaker(page)
  const chooser = page.waitForEvent('filechooser')
  await page.getByTitle('Import image files').click()
  await (await chooser).setFiles(Array.from({ length: 40 }, (_, i) => ({ name: `thing ${i}.png`, mimeType: 'image/png', buffer: png(i % 2 ? 300 : 100, i % 2 ? 100 : 300) })))
  await expect(page.locator('[data-asset="thing 39"]')).toBeAttached()
  const heights = await page.locator('[data-asset]').evaluateAll(list => list.map(li => li.getBoundingClientRect().height))
  expect(Math.min(...heights)).toBeGreaterThan(50)
  // Image tiles stay out of the library; a library asset can become one
  await page.locator('[data-asset="thing 0"]').hover()
  await page.getByLabel('Make a tile from thing 0').click()
  await page.getByLabel('Tile role').selectOption('wall')
  await page.getByTestId('tile-save').click()
  await expect(page.locator('[data-tile="asset:thing 0"]')).toBeVisible()
  await expect(page.locator('[data-asset="thing 0"]')).toHaveCount(1)
})

import { expect, type Page } from '@playwright/test'

/** Opens the app and waits for the demo campaign the first start seeds. */
export async function openSeeded(page: Page) {
  await page.goto('/')
  await expect(page.getByText('Welcome to StarTome').first()).toBeVisible()
}

/** Ids of the seeded rows, read from IndexedDB (a fresh profile numbers them from 1, but don't rely on it). */
export async function seededIds(page: Page) {
  return page.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const rq = indexedDB.open('startome')
      rq.onsuccess = () => res(rq.result)
      rq.onerror = () => rej(rq.error)
    })
    const all = <T>(store: string) => new Promise<T[]>(res => {
      const rq = db.transaction(store).objectStore(store).getAll()
      rq.onsuccess = () => res(rq.result as T[])
    })
    type Row = { id: number; name: string; type?: string; campaign_id?: number }
    const campaigns = await all<Row>('campaigns')
    const entities = await all<Row>('entities')
    const encounters = await all<Row>('encounters')
    const panels = await all<{ session_id: number; content: string }>('sessionPanels')
    const campaign = campaigns.find(c => c.name === 'Welcome to StarTome')!
    // The session whose board mentions Aldric in a panel's text
    const mentioned = panels.find(p => /\{\{npc: Aldric Vane\}\}/.test(p.content ?? ''))
    return {
      campaignId: campaign.id,
      sessionId: mentioned?.session_id ?? entities.find(e => e.type === 'session')!.id,
      questId: entities.find(e => e.type === 'quest')!.id,
      npcId: entities.find(e => e.name === 'Aldric Vane')!.id,
      encounterId: encounters[0]!.id,
    }
  })
}

/** Gives an entry a stored portrait, the way an upload does (an image row + an img:<id> ref). */
export async function givePortrait(page: Page, entityId: number) {
  await page.evaluate(async (id) => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 64
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#c33'; ctx.fillRect(0, 0, 64, 64)
    const blob = await new Promise<Blob>(r => canvas.toBlob(b => r(b!), 'image/png'))
    const db = await new Promise<IDBDatabase>(res => { const rq = indexedDB.open('startome'); rq.onsuccess = () => res(rq.result) })
    const imageId = crypto.randomUUID()
    await new Promise<void>(res => {
      const tx = db.transaction(['images', 'entities'], 'readwrite')
      tx.objectStore('images').put({ id: imageId, blob, mime: 'image/png', createdAt: new Date().toISOString() })
      const store = tx.objectStore('entities')
      const rq = store.get(id)
      rq.onsuccess = () => {
        const row = rq.result
        const attrs = typeof row.attributes === 'string' ? JSON.parse(row.attributes) : (row.attributes ?? {})
        attrs.portraitSource = `img:${imageId}`
        row.attributes = typeof row.attributes === 'string' ? JSON.stringify(attrs) : attrs
        store.put(row)
      }
      tx.oncomplete = () => res()
    })
  }, entityId)
}

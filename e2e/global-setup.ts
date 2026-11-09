import { chromium, type FullConfig } from '@playwright/test'

/**
 * Opens the heavy pages once before the tests. On a dev server that just
 * started, Vite bundles a page's dependencies (PixiJS, Vue Flow, …) on the
 * first visit and then reloads the page, which would break whichever test
 * got there first.
 */
export default async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]!.use.baseURL!
  const browser = await chromium.launch()
  const page = await browser.newPage()
  try {
    await page.goto(baseURL)
    await page.getByText('Welcome to StarTome').first().waitFor({ timeout: 120_000 })
    const ids = await page.evaluate(async () => {
      const db = await new Promise<IDBDatabase>(res => { const rq = indexedDB.open('startome'); rq.onsuccess = () => res(rq.result) })
      const all = (s: string) => new Promise<any[]>(res => { const rq = db.transaction(s).objectStore(s).getAll(); rq.onsuccess = () => res(rq.result) })
      const entities = await all('entities')
      return { campaign: entities[0].campaign_id, session: entities.find(e => e.type === 'session').id, npc: entities.find(e => e.type === 'npc').id, encounter: (await all('encounters'))[0].id }
    })
    for (const path of [`/#/campaign/${ids.campaign}/sessions/${ids.session}`, `/#/encounter/${ids.encounter}`, `/#/campaign/${ids.campaign}/quests`, `/#/campaign/${ids.campaign}/npcs/${ids.npc}`]) {
      await page.goto(baseURL + path)
      await page.waitForLoadState('networkidle', { timeout: 120_000 })
    }
    // The note editor (CodeMirror) loads in Edit mode
    await page.getByRole('button', { name: 'Edit', exact: true }).click()
    await page.waitForLoadState('networkidle', { timeout: 60_000 })
    await page.keyboard.press('Control+k')
    await page.waitForLoadState('networkidle', { timeout: 60_000 })
  } finally {
    await browser.close()
  }
}

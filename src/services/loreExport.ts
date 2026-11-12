/** Writes the lore exports of a campaign as downloadable files. */
import { strToU8, zipSync } from 'fflate'
import { buildQuestBoard, itemRefNames, markdownFiles, singleMarkdown, type ItemLookup } from '@/domain/loreExport'
import { nowIso } from '@/domain/ids'
import { campaigns, entries, rulesByName } from '@/data/repo'

export interface ExportFile { name: string; blob: Blob }
const safe = (s: string) => s.replace(/[/\\:*?"<>|]/g, '_')
const day = () => nowIso().slice(0, 10)

async function load(campaignId: string) {
  const campaign = await campaigns.get(campaignId)
  if (!campaign) throw new Error('The campaign no longer exists.')
  return { campaign, list: await entries.ofCampaign(campaignId) }
}

export async function exportMarkdownFolder(campaignId: string, includeGmOnly: boolean): Promise<ExportFile> {
  const { campaign, list } = await load(campaignId)
  const files = Object.fromEntries(markdownFiles(list, includeGmOnly).map(f => [f.path, strToU8(f.text)]))
  return { name: `startome-${safe(campaign.name)}-markdown-${day()}.zip`, blob: new Blob([zipSync(files) as BlobPart], { type: 'application/zip' }) }
}

export async function exportSingleMarkdown(campaignId: string, includeGmOnly: boolean): Promise<ExportFile> {
  const { campaign, list } = await load(campaignId)
  return { name: `startome-${safe(campaign.name)}-${day()}.md`, blob: new Blob([singleMarkdown(campaign, list, includeGmOnly)], { type: 'text/markdown' }) }
}

export async function exportQuestBoard(campaignId: string): Promise<ExportFile> {
  const { campaign, list } = await load(campaignId)
  // Every item a quest names is looked up once, so the builder itself stays synchronous
  const found = new Map<string, ReturnType<ItemLookup>>()
  for (const e of list) {
    if (e.type !== 'quest') continue
    for (const name of itemRefNames(`${e.data.reward}\n${e.body}`)) if (!found.has(name)) found.set(name, await rulesByName(name, 'item'))
  }
  const board = buildQuestBoard(campaign, list, name => found.get(name), nowIso())
  return { name: `startome-questboard-${safe(campaign.name)}-${day()}.json`, blob: new Blob([JSON.stringify(board, null, 2)], { type: 'application/json' }) }
}

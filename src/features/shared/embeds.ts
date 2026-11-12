/**
 * Embedded entry cards: `{{npc: Name | entry}}` shows the entry's picture,
 * facts and first lines in place. The markdown renderer leaves a marked link;
 * this fills it in once the text is on screen.
 */
import { isEntryTypeName } from '@/domain/links'
import { findEntryByName } from '@/data/repo'
import { imageUrlOf } from '@/ui/imageUrl'
import { esc, excerpt } from '@/ui/markdown'
import { ENTRY_TYPE_INFO } from '@/ui/entryTypes'
import { entryImage, entryMeta } from './facts'

export async function fillEmbeds(root: HTMLElement, campaignId: string): Promise<void> {
  for (const el of root.querySelectorAll<HTMLElement>('a.ref.embed:not([data-filled])')) {
    el.dataset.filled = '1'
    const type = el.dataset.refType ?? ''
    if (!isEntryTypeName(type)) continue
    const entry = await findEntryByName(campaignId, type, el.dataset.refName ?? '')
    if (!entry) continue
    const image = await imageUrlOf(entryImage(entry))
    const text = excerpt(entry.body, 220)
    el.innerHTML = `${image ? `<img src="${esc(image)}" alt="">` : ''}<span class="embed-text"><span class="embed-type">${esc(ENTRY_TYPE_INFO[type].label)}</span><strong>${esc(entry.name)}</strong>`
      + `<span class="embed-meta">${esc(entryMeta(entry))}</span>${text ? `<span class="embed-body">${esc(text)}</span>` : ''}</span>`
  }
}

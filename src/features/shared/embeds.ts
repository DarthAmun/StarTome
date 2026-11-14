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

/**
 * Pictures on plain links, as v0.42 drew them: `{{npc: Name}}` gets the NPC's portrait in front of
 * the name, a location or faction its picture, a note its icon. Links without a picture stay text.
 */
export async function fillFaces(root: HTMLElement, campaignId: string): Promise<void> {
  const found = new Map<string, Promise<HTMLElement | null>>()
  for (const a of root.querySelectorAll<HTMLElement>('a.ref:not(.embed):not(.unresolved):not([data-face])')) {
    a.dataset.face = '1'
    const type = a.dataset.refType ?? '', name = a.dataset.refName ?? ''
    if (!isEntryTypeName(type)) continue
    const key = `${type}|${name.toLowerCase()}`
    if (!found.has(key)) found.set(key, faceOf(campaignId, type, name))
    const face = await found.get(key)
    if (face && a.isConnected && !a.querySelector('.ref-face')) a.prepend(face.cloneNode(true))
  }
}

async function faceOf(campaignId: string, type: Parameters<typeof findEntryByName>[1], name: string): Promise<HTMLElement | null> {
  const entry = await findEntryByName(campaignId, type, name)
  if (!entry) return null
  const url = await imageUrlOf(entryImage(entry))
  if (url) {
    const img = document.createElement('img')
    img.src = url; img.alt = ''; img.className = 'ref-face'
    return img
  }
  const iconName = entry.type === 'note' ? entry.data.icon : ''
  const icon = iconName ? (await import('@/ui/gameIcons.gen')).GAME_ICONS[iconName] : undefined
  if (!icon) return null
  const span = document.createElement('span')
  span.className = 'ref-face ref-icon'
  // Generated at build time from the icon set, never user text
  span.innerHTML = `<svg viewBox="${icon.box}" fill="currentColor" aria-hidden="true">${icon.body}</svg>`
  return span
}

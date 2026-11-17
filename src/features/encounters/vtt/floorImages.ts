/**
 * Map images for the open encounter: one goes on the floor shown, several
 * open the order dialog (FloorImagesDialog.vue) and go on the floors around
 * the ground floor (FLOORS_PLAN.md step 3).
 */
import { shallowRef } from 'vue'
import { setFloorImages } from '@/data/encounters'
import { MAIN_FLOOR } from '@/domain/rules/floors'
import { storeImage } from '@/services/images'
import { floors, flushSaves, live, reloadMap, saveFloor } from './live'

/** Images waiting in the order dialog. */
export const pendingImages = shallowRef<File[] | null>(null)

/** Images picked or dropped: one is the shown floor's map, several are ordered first. */
export async function offerImages(files: File[]): Promise<void> {
  const list = files.filter(f => f.type.startsWith('image/'))
  if (list.length === 1) saveFloor({ image: await storeImage(list[0]!) })
  else if (list.length > 1) pendingImages.value = list
}

/** Stores the images and puts them on the floors, bottom to top, `ground` on the ground floor; shows that floor. */
export async function applyImages(items: { file: File; name: string }[], ground: number): Promise<void> {
  if (!live.encounter) return
  const stored = await Promise.all(items.map(async i => ({ image: await storeImage(i.file), name: i.name })))
  await flushSaves()
  await setFloorImages(live.encounter.id, stored, ground)
  await reloadMap()
  live.floorId = floors().find(f => f.level === 0)?.id ?? MAIN_FLOOR
}

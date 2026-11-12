/** Shapes shared by every collection (REWORK_PLAN.md §9). */
import { z } from 'zod'

export const zId = z.string().min(1)
export const zIso = z.string()

/** An image: a blob in the `images` collection, or a web address. Never a data URL. */
export const zImageRef = z.union([
  z.object({ imageId: zId }).strict(),
  z.object({ url: z.string().min(1) }).strict(),
])
export type ImageRef = z.infer<typeof zImageRef>

export const zPoint = z.object({ x: z.number(), y: z.number() })

/** Values a later phase gives a schema of its own; kept as they are until then. */
export const zOpaque = z.record(z.string(), z.unknown())
export type Opaque = z.infer<typeof zOpaque>

export function imageIdOf(ref: ImageRef | null | undefined): string | null {
  return ref && 'imageId' in ref ? ref.imageId : null
}

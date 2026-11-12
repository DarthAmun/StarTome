/**
 * What is open right now: the campaign, the peek dock and the tray. One
 * shared state for the shell and every feature.
 *
 * The dock is the rule the redesign is built on (REWORK_PLAN.md §6): a link
 * opens here, beside what you are doing, instead of taking you away from it.
 */
import { computed, reactive, ref, watch } from 'vue'
import type { Campaign, Settings } from '@/domain/schema'
import { DEFAULT_SETTINGS } from '@/domain/schema'
import { settings as settingsRepo, workspace } from '@/data/repo'

export type PeekTarget = { kind: 'entry'; id: string } | { kind: 'rules'; id: string }
export interface Pin { kind: PeekTarget['kind']; id: string; label: string; type: string }

export const campaigns = ref<Campaign[]>([])
export const campaignId = ref<string | null>(null)
export const campaign = computed(() => campaigns.value.find(c => c.id === campaignId.value) ?? null)
export const settings = ref<Settings>(DEFAULT_SETTINGS)

export async function patchSettings(change: Partial<Omit<Settings, 'id'>>): Promise<void> {
  settings.value = await settingsRepo.patch(change)
}

// ── Peek dock ──────────────────────────────────────────────────────────────

export const dock = reactive({ open: false, stack: [] as PeekTarget[], active: 0 })

const same = (a: PeekTarget, b: PeekTarget) => a.kind === b.kind && a.id === b.id

export function peek(target: PeekTarget): void {
  const at = dock.stack.findIndex(t => same(t, target))
  if (at >= 0) dock.active = at
  else { dock.stack.push(target); dock.active = dock.stack.length - 1 }
  dock.open = true
}

export function closePeek(index: number): void {
  dock.stack.splice(index, 1)
  dock.active = Math.max(0, Math.min(dock.active, dock.stack.length - 1))
  if (!dock.stack.length) dock.open = false
}

export function closeDock(): void {
  dock.open = false
}

// ── Tray: what you pinned, per campaign, kept in the database ──────────────

export const pins = ref<Pin[]>([])

watch(campaignId, async (id) => {
  pins.value = id ? await workspace.get<Pin[]>(id, 'tray', []) : []
  dock.stack = []
  dock.open = false
}, { immediate: true })

async function savePins(): Promise<void> {
  if (campaignId.value) await workspace.set(campaignId.value, 'tray', pins.value.map(p => ({ ...p })))
}

export function isPinned(target: PeekTarget): boolean {
  return pins.value.some(p => p.kind === target.kind && p.id === target.id)
}

export async function togglePin(pin: Pin): Promise<void> {
  pins.value = isPinned(pin) ? pins.value.filter(p => !(p.kind === pin.kind && p.id === pin.id)) : [...pins.value, pin]
  await savePins()
}

// ── Command bar ────────────────────────────────────────────────────────────

export const commandBarOpen = ref(false)

/**
 * Colours you chose for conditions. A colour picked on one token is the colour that
 * condition gets the next time it is added, in every campaign (kept with the app's workspace,
 * so a backup has it). The compendium entry is not touched: a sync would overwrite it there.
 */
import { reactive } from 'vue'
import { workspace } from '@/data/repo'

const KEY = 'conditionColors'
const chosen = reactive<Record<string, string>>({})
let loaded: Promise<void> | null = null

export function loadConditionColors(): Promise<void> {
  loaded ??= workspace.get<Record<string, string>>('', KEY, {}).then((saved) => { Object.assign(chosen, saved) })
  return loaded
}

const keyOf = (name: string) => name.trim().toLowerCase()

export function chosenConditionColor(name: string): string | undefined {
  return chosen[keyOf(name)]
}

export async function rememberConditionColor(name: string, color: string): Promise<void> {
  await loadConditionColors()
  chosen[keyOf(name)] = color
  await workspace.set('', KEY, { ...chosen })
}

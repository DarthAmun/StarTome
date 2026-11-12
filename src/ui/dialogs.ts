/** In-app confirm and notices, in place of the browser's confirm() and alert(). */
import { reactive } from 'vue'

export interface ConfirmRequest { title: string; body: string; confirmLabel: string; danger: boolean; resolve: (ok: boolean) => void }

export const dialogs = reactive({ confirm: null as ConfirmRequest | null })

export function confirmDialog(opts: { title: string; body: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  return new Promise((resolve) => {
    dialogs.confirm = { title: opts.title, body: opts.body, confirmLabel: opts.confirmLabel ?? 'Confirm', danger: opts.danger ?? false, resolve }
  })
}

export function answerConfirm(ok: boolean): void {
  dialogs.confirm?.resolve(ok)
  dialogs.confirm = null
}

export interface Notice { id: number; kind: 'info' | 'ok' | 'error'; text: string }

export const notices = reactive({ list: [] as Notice[] })
let nextNotice = 1

export function notify(text: string, kind: Notice['kind'] = 'info', ms = 6000): void {
  const id = nextNotice++
  notices.list.push({ id, kind, text })
  if (kind !== 'error') setTimeout(() => dismissNotice(id), ms)
}

export function dismissNotice(id: number): void {
  notices.list = notices.list.filter(n => n.id !== id)
}

/** Shows a failure where the user sees it instead of only in the console. */
export function reportError(what: string, err: unknown): void {
  console.error(what, err)
  notify(`${what} failed: ${err instanceof Error ? err.message : String(err)}`, 'error')
}

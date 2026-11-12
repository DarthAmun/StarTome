import type { InjectionKey } from 'vue'

export interface DmScreenCtx {
  onEntityClick: (type: string, name: string) => boolean
}

export const DM_SCREEN_CTX_KEY: InjectionKey<DmScreenCtx> = Symbol('dm-screen-context')

export function useDmScreenContext(): DmScreenCtx | null {
  return inject(DM_SCREEN_CTX_KEY, null)
}

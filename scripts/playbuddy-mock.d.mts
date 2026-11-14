export function createMockServer(options?: { port?: number; manual?: boolean; delayMs?: number; system?: 'pf2e' | 'sf2e' }): Promise<{ url: string; close(): Promise<void> }>

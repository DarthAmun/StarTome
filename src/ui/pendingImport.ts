/** A file dropped on Import & Backup that belongs to another screen: handed over once, then gone. */
let pending: File | null = null

export function handOver(file: File): void {
  pending = file
}

export function takePendingImport(): File | null {
  const f = pending
  pending = null
  return f
}

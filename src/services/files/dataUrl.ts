/** Data URLs ⇄ blobs, for images that arrive inline in old files. */

export function dataUrlToBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',')
  const head = comma >= 0 ? dataUrl.slice(0, comma) : ''
  const mime = /^data:([^;,]+)/.exec(head)?.[1] ?? 'application/octet-stream'
  const body = comma >= 0 ? dataUrl.slice(comma + 1) : ''
  if (!/;base64/i.test(head)) return new Blob([decodeURIComponent(body)], { type: mime })
  const binary = atob(body)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

export function mimeOfDataUrl(dataUrl: string): string {
  return /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? 'application/octet-stream'
}

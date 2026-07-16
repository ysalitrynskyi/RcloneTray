const AllowedExternalProtocols = new Set(['http:', 'https:', 'ftp:'])

export function isAllowedExternalUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl)
    return AllowedExternalProtocols.has(parsed.protocol)
  } catch {
    return false
  }
}

export function assertAllowedExternalUrl(rawUrl: string): string {
  if (!isAllowedExternalUrl(rawUrl)) {
    throw new Error(`Blocked unsupported external URL: ${rawUrl}`)
  }
  return rawUrl
}

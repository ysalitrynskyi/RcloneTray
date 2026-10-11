import * as path from 'path'

function normalizePlatformPath(input: string, platform: NodeJS.Platform): string {
  const trimmed = input.trim()
  return platform === 'win32'
    ? path.win32.resolve(trimmed)
    : path.posix.resolve(trimmed)
}

export function isRootOrDrivePath(input: string, platform: NodeJS.Platform = process.platform): boolean {
  const trimmed = input.trim()
  if (!trimmed) {
    return false
  }

  if (platform === 'win32' && /^[a-zA-Z]:[\\/]*$/.test(trimmed)) {
    return true
  }

  if (platform === 'win32') {
    const withoutSlash = trimmed.replace(/[\\/]+$/, '')
    if (/^\\\\\?\\[a-zA-Z]:$/i.test(withoutSlash)) {
      return true
    }
    if (/^\\\\\?\\UNC\\[^\\]+\\[^\\]+$/i.test(withoutSlash)) {
      return true
    }
    if (/^\\\\[^\\]+\\[^\\]+$/i.test(withoutSlash)) {
      return true
    }
  }

  const normalized = normalizePlatformPath(trimmed, platform)
  const parsed = platform === 'win32'
    ? path.win32.parse(normalized)
    : path.posix.parse(normalized)

  if (normalized === parsed.root) {
    return true
  }

  return platform === 'darwin' && normalized === '/Volumes'
}

export function getSyncLocalPathError(localPath: string | undefined, platform: NodeJS.Platform = process.platform): string | null {
  if (!localPath || !localPath.trim()) {
    return 'Local path mapping is not set for this remote.'
  }

  const pathApi = platform === 'win32' ? path.win32 : path.posix
  if (!pathApi.isAbsolute(localPath.trim())) {
    return `Refusing to sync a relative local path: ${localPath}`
  }

  if (isRootOrDrivePath(localPath, platform)) {
    return `Refusing to sync a root or drive path: ${localPath}`
  }

  return null
}

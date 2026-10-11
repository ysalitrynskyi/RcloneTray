function parseVersion(value: string): { core: number[]; prerelease: string } {
  const [core, prerelease = ''] = value.trim().replace(/^v/, '').split('-', 2)
  return { core: core.split('.').map((part) => Number.parseInt(part, 10) || 0), prerelease }
}

/**
 * True when `candidate` is a newer release than `current` (semver order;
 * a pre-release is older than its final release).
 */
export function isNewerVersion(candidate: string, current: string): boolean {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  for (let index = 0; index < Math.max(a.core.length, b.core.length); index++) {
    const left = a.core[index] || 0
    const right = b.core[index] || 0
    if (left !== right) {
      return left > right
    }
  }
  if (a.prerelease === b.prerelease) {
    return false
  }
  if (!a.prerelease) {
    return true
  }
  if (!b.prerelease) {
    return false
  }
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true }) > 0
}

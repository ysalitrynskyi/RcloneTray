/**
 * Same rule as rclone's fspath.CheckConfigName (v1.74.4):
 * letters, numbers, "_", "-", ".", "+", "@" and spaces, but not a
 * leading "-" or space and not a trailing space.
 */
const CONFIG_NAME = /^[\w\p{L}\p{N}.+@]+(?:[ -]+[\w\p{L}\p{N}.+@-]+)*$/u

export const REMOTE_NAME_RULE = 'Remote names may contain letters, numbers, "_", "-", ".", "+", "@" and spaces. They cannot start with "-" or a space, or end with a space.'

export function remoteNameError(name: string, platform: NodeJS.Platform = process.platform): string | null {
  if (!CONFIG_NAME.test(name)) {
    return REMOTE_NAME_RULE
  }
  if (platform === 'win32' && /^[a-zA-Z]$/.test(name)) {
    return `The name "${name}" is a single letter, which Windows treats as a drive. Choose a longer name.`
  }
  return null
}

export function assertNewRemoteName(value: unknown, platform: NodeJS.Platform = process.platform): string {
  if (typeof value !== 'string') {
    throw new Error(REMOTE_NAME_RULE)
  }
  const error = remoteNameError(value, platform)
  if (error) {
    throw new Error(error)
  }
  return value
}

/**
 * Update and delete are allowed for any existing section, including names
 * rclone accepted and this app used to reject. Only reject values that
 * cannot be a config section.
 */
export function assertExistingRemoteName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\0]/.test(value)) {
    throw new Error('Invalid remote name.')
  }
  return value
}

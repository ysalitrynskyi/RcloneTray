const DROP_ALWAYS = new Set([
  '--daemon',
  '--log-file',
  '--log-level',
  '--use-json-log',
  '--syslog',
  '--syslog-facility',
  '--log-systemd',
  '--progress',
  '-P',
  '-q',
  '--quiet'
])

const DROP_WITH_VALUE = new Set([
  '--log-file',
  '--log-level',
  '--syslog-facility'
])

const VFS_VALUE_FLAGS = new Set([
  '--vfs-cache-mode',
  '--vfs-cache-max-age',
  '--vfs-cache-max-size',
  '--vfs-cache-min-free-space',
  '--vfs-cache-poll-interval',
  '--vfs-read-ahead',
  '--vfs-read-chunk-size',
  '--vfs-read-chunk-size-limit',
  '--vfs-read-chunk-streams',
  '--vfs-write-back',
  '--vfs-write-wait',
  '--vfs-read-wait',
  '--vfs-disk-space-total-size',
  '--dir-cache-time',
  '--poll-interval',
  '--dir-perms',
  '--file-perms',
  '--umask',
  '--uid',
  '--gid'
])

const VFS_BOOLEAN_FLAGS = new Set([
  '--read-only',
  '--no-modtime',
  '--no-checksum',
  '--no-seek',
  '--vfs-case-insensitive',
  '--vfs-fast-fingerprint',
  '--vfs-used-is-size',
  '--vfs-links',
  '--vfs-refresh'
])

const MOUNT_VALUE_FLAGS = new Set([
  '--attr-timeout',
  '--volname',
  '--option',
  '-o',
  '--fuse-flag',
  '--devname',
  '--max-read-ahead'
])

const MOUNT_BOOLEAN_FLAGS = new Set([
  '--network-mode',
  '--allow-other',
  '--allow-root',
  '--allow-non-empty',
  '--async-read',
  '--default-permissions',
  '--debug-fuse',
  '--write-back-cache',
  '--direct-io',
  '--mount-case-insensitive',
  '--noappledouble',
  '--noapplexattr'
])

/**
 * Split like a shell: whitespace separates arguments, single or double quotes
 * group characters (also inside an argument, as in --flag="a b").
 */
export function splitCommandArgs(input: string): string[] {
  const args: string[] = []
  let current = ''
  let hasToken = false
  let quote: '"' | "'" | null = null
  for (const char of input) {
    if (quote) {
      if (char === quote) {
        quote = null
      } else {
        current += char
      }
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      hasToken = true
      continue
    }
    if (/\s/.test(char)) {
      if (hasToken && current) {
        args.push(current)
      }
      current = ''
      hasToken = false
      continue
    }
    current += char
    hasToken = true
  }
  if (hasToken && current) {
    args.push(current)
  }
  return args
}

function flagName(token: string): string {
  const equals = token.indexOf('=')
  return equals === -1 ? token : token.slice(0, equals)
}

type CommandKind = 'mount' | 'serve' | 'other'

function commandKind(command: string[]): CommandKind {
  if (command.includes('mount')) {
    return 'mount'
  }
  if (command.includes('serve')) {
    return 'serve'
  }
  return 'other'
}

/**
 * Drop flags that hide or reroute logs, daemonise the process, or do not
 * exist for the command being run (VFS flags outside mount/serve, mount flags
 * outside mount). The placeholder `--vfs-cache-mode full` must not reach sync.
 */
export function sanitizeCustomArgs(args: string[], command: string[]): string[] {
  const kind = commandKind(command)
  const kept: string[] = []
  for (let index = 0; index < args.length; index++) {
    const token = args[index]
    const name = flagName(token)
    const hasInlineValue = token.includes('=')
    let drop = false
    let takesValue = false
    if (DROP_ALWAYS.has(name)) {
      drop = true
      takesValue = DROP_WITH_VALUE.has(name)
    } else if (kind !== 'mount' && (MOUNT_VALUE_FLAGS.has(name) || MOUNT_BOOLEAN_FLAGS.has(name))) {
      drop = true
      takesValue = MOUNT_VALUE_FLAGS.has(name)
    } else if (kind === 'other' && (VFS_VALUE_FLAGS.has(name) || VFS_BOOLEAN_FLAGS.has(name) || name.startsWith('--vfs-'))) {
      drop = true
      takesValue = VFS_VALUE_FLAGS.has(name)
    }
    if (!drop) {
      kept.push(token)
      continue
    }
    if (takesValue && !hasInlineValue && index + 1 < args.length && !args[index + 1].startsWith('-')) {
      index += 1
    }
  }
  return kept
}

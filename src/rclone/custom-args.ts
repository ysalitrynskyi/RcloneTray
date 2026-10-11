const DROP_ALWAYS = new Set([
  '--daemon',
  '--log-file',
  '--use-json-log',
  '--progress',
  '-q',
  '--quiet'
])

const DROP_WITH_VALUE = new Set([
  '--log-file'
])

const MOUNT_ONLY = new Set([
  '--vfs-cache-mode',
  '--attr-timeout',
  '--dir-cache-time',
  '--volname',
  '--network-mode',
  '--daemon'
])

/** Split on whitespace, keeping double-quoted and single-quoted values intact. */
export function splitCommandArgs(input: string): string[] {
  const args: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(input))) {
    const token = match[1] ?? match[2] ?? match[3]
    if (token && token.trim()) {
      args.push(token)
    }
  }
  return args
}

function flagName(token: string): string {
  const equals = token.indexOf('=')
  return equals === -1 ? token : token.slice(0, equals)
}

/**
 * Drop flags that hide logs, daemonise the process, or (outside mount)
 * belong only to the mount command. The placeholder `--vfs-cache-mode full`
 * must not be appended to sync.
 */
export function sanitizeCustomArgs(args: string[], command: string[]): string[] {
  const mount = command.includes('mount')
  const kept: string[] = []
  for (let index = 0; index < args.length; index++) {
    const token = args[index]
    const name = flagName(token)
    const drop = DROP_ALWAYS.has(name) || (!mount && MOUNT_ONLY.has(name))
    if (!drop) {
      kept.push(token)
      continue
    }
    if (!token.includes('=') && (DROP_WITH_VALUE.has(name) || (!mount && MOUNT_ONLY.has(name) && name !== '--daemon'))) {
      index += 1
    }
  }
  return kept
}

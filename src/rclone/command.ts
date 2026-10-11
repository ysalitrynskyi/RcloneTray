export function shouldAppendAutoConfirm(command: string[]): boolean {
  const [scope, action] = command
  if (scope === 'version' || scope === 'obscure' || scope === 'listremotes') {
    return false
  }
  if (scope === 'config' && ['dump', 'providers', 'file', 'show'].includes(action || '')) {
    return false
  }
  return true
}

export function enquoteCommand(command: string[]): string[] {
  return command.map((arg) => {
    if (arg.substring(0, 2) !== '--') {
      return JSON.stringify(arg)
    }
    return arg
  })
}

function quotePosixArg(arg: string): string {
  if (arg === '') {
    return "''"
  }
  return `'${arg.replace(/'/g, `'\\''`)}'`
}

export function formatTerminalCommand(command: string[], platform: NodeJS.Platform = process.platform): string {
  const quote = platform === 'win32' ? quoteCmdArg : quotePosixArg
  return command.map(quote).join(' ')
}

/**
 * cmd.exe does not understand backslash escapes. Quote each argument with
 * plain double quotes (Windows paths cannot contain them) and caret-escape
 * nothing: everything runs inside one quoted /k string.
 */
function quoteCmdArg(arg: string): string {
  return `"${arg.replace(/"/g, '')}"`
}

/**
 * The verbatim argument string for `cmd.exe` that opens a new console window
 * titled `title` and runs `command` in it, keeping the window open afterwards.
 * Must be spawned with windowsVerbatimArguments so Node adds no quoting.
 */
export function windowsConsoleArgs(title: string, command: string[]): string {
  const inner = command.map(quoteCmdArg).join(' ')
  return `/d /s /c "start "${title.replace(/"/g, '')}" cmd /k "${inner}""`
}

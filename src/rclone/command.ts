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

function quoteWindowsArg(arg: string): string {
  if (arg === '') {
    return '""'
  }
  return `"${arg.replace(/(["\\])/g, '\\$1')}"`
}

export function formatTerminalCommand(command: string[], platform: NodeJS.Platform = process.platform): string {
  const quote = platform === 'win32' ? quoteWindowsArg : quotePosixArg
  return command.map(quote).join(' ')
}

export interface ParsedLogLine {
  level: string
  message: string
  objectName?: string
}

export type WatchedJobKind = 'transfer' | 'mount' | 'serve' | 'other'

/**
 * rclone --use-json-log line, or the older "date LEVEL: message" line.
 * The object name stays out of the message so a file called "Failed to copy"
 * cannot look like a fatal error.
 */
export function parseLogLine(line: string): ParsedLogLine {
  const trimmed = line.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as { level?: unknown; msg?: unknown; object?: unknown }
      return {
        level: String(parsed.level || 'unknown').toLowerCase(),
        message: typeof parsed.msg === 'string' ? parsed.msg : '',
        objectName: typeof parsed.object === 'string' ? parsed.object : undefined
      }
    } catch {
      // Not JSON. Fall through to the text format.
    }
  }
  const match = trimmed.match(/^\d{4}\/\d{2}\/\d{2}[ T]\d{2}:\d{2}:\d{2}\s+([A-Za-z]+)\s*:\s*([\s\S]*)$/)
  if (match) {
    return { level: match[1].toLowerCase(), message: match[2] }
  }
  return { level: 'unknown', message: trimmed }
}

/** First http(s) URL in a serve line, ignoring the brackets rclone prints around it. */
export function extractServeUrl(message: string): string | null {
  const http = message.match(/https?:\/\/[^\s\]\[,"]+/)
  if (http) {
    return http[0]
  }
  const ftp = message.match(/Serving FTP on\s+(\S+)/i)
  if (ftp) {
    return `ftp://${ftp[1]}`
  }
  return null
}

export function isFatalLog(parsed: ParsedLogLine, kind: WatchedJobKind): boolean {
  if (kind === 'transfer' || kind === 'other') {
    return false
  }
  if (parsed.level === 'critical' || /^fatal error\b/i.test(parsed.message)) {
    return true
  }
  return /address already in use/i.test(parsed.message)
}

export function isMountAttemptLine(parsed: ParsedLogLine): boolean {
  return /Mounting on "/i.test(parsed.message)
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B'
  }
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let size = value
  let unit = 0
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024
    unit += 1
  }
  return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export function progressFromLog(line: string): string | null {
  if (!line.trim().startsWith('{')) {
    return null
  }
  try {
    const parsed = JSON.parse(line) as { stats?: { bytes?: number; totalBytes?: number; speed?: number; errors?: number } }
    const stats = parsed.stats
    if (!stats) {
      return null
    }
    const bytes = Number(stats.bytes || 0)
    const total = Number(stats.totalBytes || 0)
    if (!bytes && !total) {
      return null
    }
    const errors = Number(stats.errors || 0)
    return `${formatBytes(bytes)} of ${formatBytes(total)} at ${formatBytes(Number(stats.speed || 0))}/s${errors ? `, ${errors} errors` : ''}`
  } catch {
    return null
  }
}

export function redactSecrets(line: string, secrets: string[]): string {
  let out = line
  for (const secret of secrets) {
    if (secret) {
      out = out.split(secret).join('XXXX')
    }
  }
  return out
    .replace(/--pass(?:=|\s+)\S+/g, '--pass XXXX')
    .replace(/RCLONE_PASS="[^"]*"/g, 'RCLONE_PASS="XXXX"')
}

/** A JSON log line as "HH:MM:SS LEVEL object: message" for the Activity window. */
export function formatLogLine(line: string): string {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) {
    return trimmed
  }
  try {
    const parsed = JSON.parse(trimmed) as { time?: unknown; level?: unknown; msg?: unknown; object?: unknown }
    const time = typeof parsed.time === 'string' ? (parsed.time.match(/T(\d{2}:\d{2}:\d{2})/) || [])[1] || '' : ''
    const level = String(parsed.level || '').toUpperCase()
    const object = typeof parsed.object === 'string' && parsed.object ? `${parsed.object}: ` : ''
    const message = typeof parsed.msg === 'string' ? parsed.msg.trim() : ''
    return [time, level, `${object}${message}`].filter(Boolean).join(' ')
  } catch {
    return trimmed
  }
}

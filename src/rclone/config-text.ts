export class ConfigEditError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ConfigEditError'
  }
}

const HEADER_RE = /^[ \t]*\[([^\]\r\n]+)\][ \t]*$/

interface TextLine {
  text: string
  ending: string
}

export interface ConfigTextEdit {
  section: string
  /** Creating a remote. Refuses to merge into a section that already exists. */
  createType?: string
  set?: Record<string, string>
  unset?: string[]
  removeSection?: boolean
}

function splitBom(content: string): { bom: string; rest: string } {
  if (content.charCodeAt(0) === 0xFEFF) {
    return { bom: '\uFEFF', rest: content.slice(1) }
  }
  return { bom: '', rest: content }
}

function splitLines(content: string): TextLine[] {
  const lines: TextLine[] = []
  const re = /\r\n|\n/g
  let last = 0
  let match: RegExpExecArray | null
  while ((match = re.exec(content))) {
    lines.push({ text: content.slice(last, match.index), ending: match[0] })
    last = match.index + match[0].length
  }
  if (last < content.length) {
    lines.push({ text: content.slice(last), ending: '' })
  }
  return lines
}

function joinLines(lines: TextLine[]): string {
  let out = ''
  for (const line of lines) {
    out += line.text + line.ending
  }
  return out
}

function newlineStyle(content: string): string {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

function headerName(text: string): string | null {
  const match = HEADER_RE.exec(text)
  return match ? match[1] : null
}

export function isEncryptedRcloneConfig(content: string): boolean {
  const head = content.slice(0, 8192)
  return head.includes('RCLONE_ENCRYPT_V0:') || head.includes('# Encrypted rclone configuration')
}

export function listConfigSections(content: string): string[] {
  const { rest } = splitBom(content)
  const names: string[] = []
  for (const line of splitLines(rest)) {
    const name = headerName(line.text)
    if (name) {
      names.push(name)
    }
  }
  return names
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function keyValue(text: string, key: string): string | null {
  const match = new RegExp(`^[ \\t]*${escapeRegExp(key)}[ \\t]*=[ \\t]*([\\s\\S]*)$`).exec(text)
  return match ? match[1] : null
}

function assertPlain(label: string, value: string): void {
  if (/[\r\n\0]/.test(value)) {
    throw new ConfigEditError(`${label} contains a newline, which rclone config cannot store.`)
  }
}

/**
 * Edit one remote section and leave every other byte alone.
 * rclone's own `config create` rewrites the file (drops comments, un-indents
 * headers). This writer only appends a new section or replaces lines inside
 * the named section.
 */
export function editConfigText(original: string, edit: ConfigTextEdit): string {
  if (isEncryptedRcloneConfig(original)) {
    throw new ConfigEditError('This rclone config is encrypted. RcloneTray will not change it. Decrypt it, or edit it with rclone config.')
  }
  assertPlain('Remote name', edit.section)
  if (!edit.section.trim()) {
    throw new ConfigEditError('Invalid remote name.')
  }

  const { bom, rest } = splitBom(original)
  const lines = splitLines(rest)
  const sections: Array<{ index: number; name: string }> = []
  lines.forEach((line, index) => {
    const name = headerName(line.text)
    if (name) {
      sections.push({ index, name })
    }
  })
  const found = sections.find((item) => item.name === edit.section)
  const nl = newlineStyle(rest)

  if (edit.removeSection) {
    if (!found) {
      return original
    }
    const nextHeader = sections.find((item) => item.index > found.index)
    const end = nextHeader ? nextHeader.index : lines.length
    return bom + joinLines(lines.slice(0, found.index).concat(lines.slice(end)))
  }

  if (found && edit.createType) {
    throw new ConfigEditError(`A remote named "${edit.section}" already exists.`)
  }

  const assignments = edit.set || {}
  const unset = new Set(edit.unset || [])
  for (const [key, value] of Object.entries(assignments)) {
    assertPlain(key, key)
    assertPlain(key, value)
  }

  if (!found) {
    if (!edit.createType) {
      throw new ConfigEditError(`Remote "${edit.section}" does not exist.`)
    }
    assertPlain('type', edit.createType)
    if (rest.length > 0 && !rest.endsWith('\n') && lines.length > 0) {
      lines[lines.length - 1].ending = nl
    }
    const extra: TextLine[] = [
      { text: `[${edit.section}]`, ending: nl },
      { text: `type = ${edit.createType}`, ending: nl }
    ]
    for (const [key, value] of Object.entries(assignments)) {
      if (key === 'type') {
        continue
      }
      extra.push({ text: `${key} = ${value}`, ending: nl })
    }
    return bom + joinLines(lines.concat(extra))
  }

  const nextHeader = sections.find((item) => item.index > found.index)
  const end = nextHeader ? nextHeader.index : lines.length
  const body = lines.slice(found.index + 1, end)
  const kept: TextLine[] = []
  const seen = new Set<string>()

  for (const line of body) {
    let matched: string | null = null
    for (const key of Object.keys(assignments)) {
      if (keyValue(line.text, key) !== null) {
        matched = key
        break
      }
    }
    if (!matched) {
      for (const key of unset) {
        if (keyValue(line.text, key) !== null) {
          matched = key
          break
        }
      }
    }
    if (matched && unset.has(matched) && !Object.prototype.hasOwnProperty.call(assignments, matched)) {
      continue
    }
    if (matched && Object.prototype.hasOwnProperty.call(assignments, matched)) {
      seen.add(matched)
      const current = keyValue(line.text, matched)
      if (current === assignments[matched]) {
        kept.push(line)
      } else {
        kept.push({ text: `${matched} = ${assignments[matched]}`, ending: line.ending || nl })
      }
      continue
    }
    kept.push(line)
  }

  for (const [key, value] of Object.entries(assignments)) {
    if (seen.has(key)) {
      continue
    }
    kept.push({ text: `${key} = ${value}`, ending: nl })
  }

  return bom + joinLines(lines.slice(0, found.index + 1).concat(kept, lines.slice(end)))
}

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
  return match ? match[1].trim() : null
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

function parseKeyLine(text: string): { key: string; value: string } | null {
  const trimmed = text.trim()
  if (!trimmed || trimmed[0] === ';' || trimmed[0] === '#' || headerName(text) !== null) {
    return null
  }
  const split = text.search(/[=:]/)
  if (split < 0) {
    return null
  }
  return { key: text.slice(0, split).trim(), value: text.slice(split + 1).trim() }
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
  const sections: Array<{ index: number; name: string; end: number }> = []
  lines.forEach((line, index) => {
    const name = headerName(line.text)
    if (name !== null) {
      if (sections.length > 0) {
        sections[sections.length - 1].end = index
      }
      sections.push({ index, name, end: lines.length })
    }
  })
  const blocks = sections.filter((item) => item.name === edit.section)
  const nl = newlineStyle(rest)

  if (edit.removeSection) {
    if (blocks.length === 0) {
      return original
    }
    const doomed = new Set<number>()
    for (const block of blocks) {
      for (let i = block.index; i < block.end; i++) {
        doomed.add(i)
      }
    }
    return bom + joinLines(lines.filter((_line, index) => !doomed.has(index)))
  }

  if (blocks.length > 0 && edit.createType) {
    throw new ConfigEditError(`A remote named "${edit.section}" already exists.`)
  }

  const assignments = edit.set || {}
  const unset = new Set(edit.unset || [])
  for (const [key, value] of Object.entries(assignments)) {
    assertPlain(key, key)
    assertPlain(key, value)
  }

  if (blocks.length === 0) {
    if (!edit.createType) {
      throw new ConfigEditError(`Remote "${edit.section}" does not exist.`)
    }
    assertPlain('type', edit.createType)
    if (rest.length > 0 && !rest.endsWith('\n') && lines.length > 0) {
      lines[lines.length - 1].ending = nl
    }
    const extra: TextLine[] = []
    if (lines.length > 0 && lines[lines.length - 1].text.trim() !== '') {
      extra.push({ text: '', ending: nl })
    }
    extra.push({ text: `[${edit.section}]`, ending: nl }, { text: `type = ${edit.createType}`, ending: nl })
    for (const [key, value] of Object.entries(assignments)) {
      if (key === 'type') {
        continue
      }
      extra.push({ text: `${key} = ${value}`, ending: nl })
    }
    return bom + joinLines(lines.concat(extra))
  }

  const lastDefinition = new Map<string, number>()
  const dropped = new Set<number>()
  for (const block of blocks) {
    for (let i = block.index + 1; i < block.end; i++) {
      const parsed = parseKeyLine(lines[i].text)
      if (!parsed) {
        continue
      }
      if (Object.prototype.hasOwnProperty.call(assignments, parsed.key)) {
        lastDefinition.set(parsed.key, i)
      } else if (unset.has(parsed.key)) {
        dropped.add(i)
      }
    }
  }

  const lastBlock = blocks[blocks.length - 1]
  let anchor = lastBlock.index
  for (let i = lastBlock.index + 1; i < lastBlock.end; i++) {
    if (parseKeyLine(lines[i].text)) {
      anchor = i
    }
  }

  const missing = Object.entries(assignments).filter(([key]) => !lastDefinition.has(key))
  const out: TextLine[] = []
  lines.forEach((line, index) => {
    if (!dropped.has(index)) {
      const parsed = parseKeyLine(line.text)
      if (parsed && lastDefinition.get(parsed.key) === index && parsed.value !== assignments[parsed.key]) {
        out.push({ text: `${parsed.key} = ${assignments[parsed.key]}`, ending: line.ending })
      } else {
        out.push(line)
      }
    }
    if (index === anchor && missing.length > 0) {
      const tail = out[out.length - 1]
      if (tail && tail.ending === '') {
        tail.ending = nl
      }
      for (const [key, value] of missing) {
        out.push({ text: `${key} = ${value}`, ending: nl })
      }
    }
  })

  return bom + joinLines(out)
}

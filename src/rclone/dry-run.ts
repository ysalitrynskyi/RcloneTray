export interface DryRunSummary {
  transfers: number
  deletes: number
  errors: number
  lines: string[]
  text: string
}

const MaxFileLines = 40

const TransferPattern = /skipped copy|skipped move|would copy|would move/i
const DeletePattern = /not deleting|would delete|skipped delete/i
const FilePattern = /skipped |not deleting|would /i
const ErrorPattern = /^(?:\d{4}\/\d{2}\/\d{2}[ T]\d{2}:\d{2}:\d{2}\s+)?(?:ERROR|CRITICAL)\s*:/i

/**
 * Counts a dry-run while it streams, so a long run is not truncated before it
 * is summarised.
 */
export class DryRunCounter {
  private transfers = 0
  private deletes = 0
  private errors = 0
  private fileLines: string[] = []
  private pending = ''

  write(chunk: string): void {
    const text = this.pending + chunk
    const parts = text.split(/\r?\n/)
    this.pending = parts.pop() || ''
    parts.forEach((line) => this.addLine(line))
  }

  end(): void {
    if (this.pending) {
      this.addLine(this.pending)
      this.pending = ''
    }
  }

  private addLine(raw: string): void {
    const line = raw.trim()
    if (!line) {
      return
    }
    if (ErrorPattern.test(line)) {
      this.errors += 1
    } else if (TransferPattern.test(line)) {
      this.transfers += 1
    } else if (DeletePattern.test(line)) {
      this.deletes += 1
    }
    if (FilePattern.test(line) || ErrorPattern.test(line)) {
      this.fileLines.push(line)
      if (this.fileLines.length > MaxFileLines) {
        this.fileLines.shift()
      }
    }
  }

  summary(): DryRunSummary {
    const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`
    const header = [
      this.transfers ? `${plural(this.transfers, 'file')} to copy` : '',
      this.deletes ? `${plural(this.deletes, 'file')} to delete` : '',
      this.errors ? plural(this.errors, 'error') : ''
    ].filter(Boolean).join(', ')
    const lines = [...this.fileLines]
    const text = [header || 'Dry-run completed. No file changes reported.', lines.join('\n')].filter(Boolean).join('\n')
    return { transfers: this.transfers, deletes: this.deletes, errors: this.errors, lines, text }
  }
}

/** Turn rclone --dry-run output into a short count plus the last file lines. */
export function summarizeDryRun(output: string): DryRunSummary {
  const counter = new DryRunCounter()
  counter.write(output)
  counter.end()
  return counter.summary()
}

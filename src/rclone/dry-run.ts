export interface DryRunSummary {
  transfers: number
  deletes: number
  errors: number
  lines: string[]
  text: string
}

/** Turn rclone --dry-run output into a short count plus the file lines. */
export function summarizeDryRun(output: string): DryRunSummary {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const transfers = lines.filter((line) => /skipped copy|skipped move|would copy|would move/i.test(line)).length
  const deletes = lines.filter((line) => /not deleting|would delete|skipped delete/i.test(line)).length
  const errors = lines.filter((line) => /\berror\b|failed to/i.test(line)).length
  const fileLines = lines.filter((line) => /skipped |not deleting|would /i.test(line)).slice(-40)
  const header = [
    transfers ? `${transfers} file${transfers === 1 ? '' : 's'} to copy` : '',
    deletes ? `${deletes} file${deletes === 1 ? '' : 's'} to delete` : '',
    errors ? `${errors} error line${errors === 1 ? '' : 's'}` : ''
  ].filter(Boolean).join(', ')
  const body = fileLines.join('\n')
  const text = [header || 'Dry-run completed. No file changes reported.', body].filter(Boolean).join('\n')
  return { transfers, deletes, errors, lines: fileLines, text }
}

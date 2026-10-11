import { describe, expect, it } from 'vitest'
import { summarizeDryRun } from '../../src/rclone/dry-run'

describe('dry-run summary', () => {
  it('counts copies and deletes and keeps the file lines', () => {
    const output = [
      'NOTICE: a.txt: Skipped copy as --dry-run is set',
      'NOTICE: b.txt: Skipped copy as --dry-run is set',
      'NOTICE: old.txt: Not deleting as --dry-run',
      'ERROR: locked.txt: Failed to copy: file in use'
    ].join('\n')
    const summary = summarizeDryRun(output)
    expect(summary.transfers).toBe(2)
    expect(summary.deletes).toBe(1)
    expect(summary.errors).toBe(1)
    expect(summary.text).toContain('2 files to copy')
    expect(summary.text).toContain('a.txt')
  })
})

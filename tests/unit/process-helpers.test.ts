import { describe, expect, it } from 'vitest'
import { spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { sanitizeCustomArgs, splitCommandArgs } from '../../src/rclone/custom-args'
import { DryRunCounter, summarizeDryRun } from '../../src/rclone/dry-run'
import { windowsConsoleArgs } from '../../src/rclone/command'

describe('custom argument parsing', () => {
  it('keeps quoted values inside a flag together', () => {
    expect(splitCommandArgs('--exclude="My Documents/**" --bwlimit 1M')).toEqual(['--exclude=My Documents/**', '--bwlimit', '1M'])
    expect(splitCommandArgs(`--header 'X-Auth: a b'`)).toEqual(['--header', 'X-Auth: a b'])
  })

  it('drops log routing flags that would blind the watchdog', () => {
    const args = ['--log-level', 'ERROR', '--syslog', '--log-systemd', '--transfers', '4', '--log-level=INFO']
    expect(sanitizeCustomArgs(args, ['mount', 'x:', 'y'])).toEqual(['--transfers', '4'])
  })

  it('treats --network-mode as a boolean and does not swallow the next flag', () => {
    expect(sanitizeCustomArgs(['--network-mode', '--transfers', '4'], ['sync', 'a', 'b'])).toEqual(['--transfers', '4'])
    expect(sanitizeCustomArgs(['--network-mode', '--transfers', '4'], ['mount', 'a', 'b'])).toEqual(['--network-mode', '--transfers', '4'])
  })

  it('keeps VFS flags for serve but not mount-only flags', () => {
    expect(sanitizeCustomArgs(['--vfs-cache-mode', 'full', '--read-only', '--volname', 'x'], ['serve', 'http', 'r:'])).toEqual(['--vfs-cache-mode', 'full', '--read-only'])
    expect(sanitizeCustomArgs(['--vfs-cache-mode', 'full', '--read-only'], ['copy', 'a', 'b'])).toEqual([])
  })
})

describe('dry-run counting', () => {
  it('counts while streaming across chunk boundaries', () => {
    const counter = new DryRunCounter()
    counter.write('2026/10/11 10:00:00 NOTICE: a.txt: Skipped copy as --dry-run is set\n2026/10/11 10:00:00 NOTICE: b.t')
    counter.write('xt: Skipped copy as --dry-run is set\n2026/10/11 10:00:00 NOTICE: old.txt: Skipped delete as --dry-run is set\n')
    counter.end()
    const summary = counter.summary()
    expect(summary.transfers).toBe(2)
    expect(summary.deletes).toBe(1)
    expect(summary.errors).toBe(0)
  })

  it('does not count a file named "Failed to copy" as an error', () => {
    const summary = summarizeDryRun('2026/10/11 10:00:00 NOTICE: Failed to copy.txt: Skipped copy as --dry-run is set\n2026/10/11 10:00:00 ERROR : locked.txt: Failed to copy: in use')
    expect(summary.transfers).toBe(1)
    expect(summary.errors).toBe(1)
  })

  it('keeps exact counts for runs far longer than the kept file lines', () => {
    const counter = new DryRunCounter()
    for (let i = 0; i < 20000; i++) {
      counter.write(`2026/10/11 10:00:00 NOTICE: dir/file-${i}.bin: Skipped copy as --dry-run is set\n`)
    }
    counter.end()
    const summary = counter.summary()
    expect(summary.transfers).toBe(20000)
    expect(summary.lines.length).toBeLessThanOrEqual(40)
    expect(summary.text).toContain('20000 files to copy')
  })
})

describe('Windows console command', () => {
  it('quotes each argument with plain double quotes inside one /k string', () => {
    expect(windowsConsoleArgs('RcloneTray', ['C:\\Program Files\\rclone.exe', 'ncdu', 'remote:a b']))
      .toBe('/d /s /c "start "RcloneTray" cmd /k ""C:\\Program Files\\rclone.exe" "ncdu" "remote:a b"""')
  })

  it.runIf(process.platform === 'win32')('runs a path with spaces through cmd.exe', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rt cmd '))
    const script = path.join(dir, 'echo args.cmd')
    fs.writeFileSync(script, '@echo [%1] [%2]\r\n')
    const inner = [script, 'one', 'two words'].map((arg) => `"${arg}"`).join(' ')
    const cmdExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    const result = spawnSync(cmdExe, [`/d /s /c "${inner}"`], { windowsVerbatimArguments: true, encoding: 'utf8' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe('["one"] ["two words"]')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

import { describe, expect, it } from 'vitest'
import { formatTerminalCommand } from '../../src/rclone/command'
import { isAllowedExternalUrl } from '../../src/rclone/external-links'
import { getSyncLocalPathError, isRootOrDrivePath } from '../../src/rclone/path-safety'

describe('path safety', () => {
  it('blocks POSIX root sync targets', () => {
    expect(isRootOrDrivePath('/', 'darwin')).toBe(true)
    expect(getSyncLocalPathError('/', 'linux')).toContain('Refusing')
  })

  it('blocks Windows drive roots', () => {
    expect(isRootOrDrivePath('C:\\', 'win32')).toBe(true)
    expect(isRootOrDrivePath('D:/', 'win32')).toBe(true)
  })

  it('allows nested local folders', () => {
    expect(getSyncLocalPathError('/Users/test/backup', 'darwin')).toBeNull()
    expect(getSyncLocalPathError('C:\\Users\\test\\backup', 'win32')).toBeNull()
  })
})

describe('external link safety', () => {
  it('allows expected public protocols', () => {
    expect(isAllowedExternalUrl('https://rclone.org')).toBe(true)
    expect(isAllowedExternalUrl('http://127.0.0.1:8080')).toBe(true)
    expect(isAllowedExternalUrl('ftp://127.0.0.1')).toBe(true)
  })

  it('blocks script and file URLs', () => {
    expect(isAllowedExternalUrl('javascript:alert(1)')).toBe(false)
    expect(isAllowedExternalUrl('file:///etc/passwd')).toBe(false)
  })
})

describe('terminal command formatting', () => {
  it('quotes every POSIX argument', () => {
    expect(formatTerminalCommand(['rclone', 'ncdu', "remote:path with 'quote'"], 'darwin'))
      .toBe("'rclone' 'ncdu' 'remote:path with '\\''quote'\\'''")
  })

  it('quotes Windows arguments', () => {
    expect(formatTerminalCommand(['rclone.exe', 'ncdu', 'remote:path with space'], 'win32'))
      .toBe('"rclone.exe" "ncdu" "remote:path with space"')
  })
})

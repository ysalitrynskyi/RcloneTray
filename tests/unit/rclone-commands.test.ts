import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Real unit tests for the pure rclone command builders.
 *
 * These import the actual functions from src/rclone.ts (electron, fs, chokidar
 * and the sibling modules are mocked) and assert on the produced argument arrays.
 */

const mockSettings: Record<string, unknown> = {
  custom_args: '',
  rclone_use_bundled: true,
  rclone_cache_files: 3,
  rclone_cache_directories: 10,
  rclone_serving_username: '',
  rclone_serving_password: ''
}

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getAppPath: vi.fn().mockReturnValue('/test/app'),
    getPath: vi.fn().mockReturnValue('/tmp')
  },
  shell: {
    openExternal: vi.fn()
  }
}))

vi.mock('electron-is-dev', () => ({ default: false }))

vi.mock('../../src/settings', () => ({
  get: vi.fn((key: string) => mockSettings[key]),
  default: {
    get: vi.fn((key: string) => mockSettings[key])
  }
}))

vi.mock('../../src/dialogs', () => ({
  notification: vi.fn(),
  missingRclone: vi.fn(),
  confirmExit: vi.fn(),
  default: {
    notification: vi.fn(),
    missingRclone: vi.fn(),
    confirmExit: vi.fn()
  }
}))

vi.mock('chokidar', () => ({
  default: {
    watch: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis() })
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn(),
  appendFileSync: vi.fn(),
  readdirSync: vi.fn().mockReturnValue([]),
  mkdirSync: vi.fn()
}))

import {
  appendCustomRcloneCommandArgs,
  buildServeCommand,
  buildMountArgs,
  enquoteCommand
} from '../../src/rclone'

describe('appendCustomRcloneCommandArgs', () => {
  beforeEach(() => {
    mockSettings.custom_args = ''
  })

  it('filters out -v, -vv and -vvv verbose flags', () => {
    mockSettings.custom_args = '-v -vv -vvv --transfers=4'
    const result = appendCustomRcloneCommandArgs(['mount'])
    expect(result).not.toContain('-v')
    expect(result).not.toContain('-vv')
    expect(result).not.toContain('-vvv')
    expect(result).toContain('--transfers=4')
  })

  it('keeps non-verbose flags', () => {
    mockSettings.custom_args = '--transfers=4 --checkers=8'
    const result = appendCustomRcloneCommandArgs([])
    expect(result).toEqual(['--transfers=4', '--checkers=8'])
  })

  it('splits args on newlines as well as spaces', () => {
    mockSettings.custom_args = '--transfers=4\n--checkers=8'
    const result = appendCustomRcloneCommandArgs([])
    expect(result).toEqual(['--transfers=4', '--checkers=8'])
  })

  it('returns the base command unchanged when custom_args is empty', () => {
    mockSettings.custom_args = ''
    const result = appendCustomRcloneCommandArgs(['mount', 'remote:'])
    expect(result).toEqual(['mount', 'remote:'])
  })

  it('drops empty/whitespace-only tokens', () => {
    mockSettings.custom_args = '   '
    const result = appendCustomRcloneCommandArgs(['serve'])
    expect(result).toEqual(['serve'])
  })
})

describe('buildServeCommand', () => {
  beforeEach(() => {
    mockSettings.rclone_serving_username = ''
    mockSettings.rclone_serving_password = ''
    mockSettings.rclone_cache_files = 3
    mockSettings.rclone_cache_directories = 10
  })

  it('builds a basic http serve command with cache flags', () => {
    const cmd = buildServeCommand('http', 'myremote:/')
    expect(cmd.slice(0, 4)).toEqual(['serve', 'http', 'myremote:/', '-vv'])
    expect(cmd).toContain('--attr-timeout')
    expect(cmd).toContain('--dir-cache-time')
  })

  it('adds --user when a username is set', () => {
    mockSettings.rclone_serving_username = 'alice'
    const cmd = buildServeCommand('http', 'r:/')
    const idx = cmd.indexOf('--user')
    expect(idx).toBeGreaterThan(-1)
    expect(cmd[idx + 1]).toBe('alice')
  })

  it('adds --pass when a password is set', () => {
    mockSettings.rclone_serving_password = 's3cret'
    const cmd = buildServeCommand('ftp', 'r:/')
    const idx = cmd.indexOf('--pass')
    expect(idx).toBeGreaterThan(-1)
    expect(cmd[idx + 1]).toBe('s3cret')
  })

  it('adds both --user and --pass when both are set', () => {
    mockSettings.rclone_serving_username = 'alice'
    mockSettings.rclone_serving_password = 's3cret'
    const cmd = buildServeCommand('webdav', 'r:/')
    expect(cmd).toContain('--user')
    expect(cmd).toContain('--pass')
  })

  it('omits auth flags when neither username nor password is set', () => {
    const cmd = buildServeCommand('http', 'r:/')
    expect(cmd).not.toContain('--user')
    expect(cmd).not.toContain('--pass')
  })

  it('does not add cache flags for restic', () => {
    const cmd = buildServeCommand('restic', 'r:/')
    expect(cmd).not.toContain('--attr-timeout')
    expect(cmd).not.toContain('--dir-cache-time')
  })

  it('omits --attr-timeout for webdav but keeps --dir-cache-time', () => {
    const cmd = buildServeCommand('webdav', 'r:/')
    expect(cmd).not.toContain('--attr-timeout')
    expect(cmd).toContain('--dir-cache-time')
  })
})

describe('buildMountArgs', () => {
  beforeEach(() => {
    mockSettings.rclone_cache_files = 3
    mockSettings.rclone_cache_directories = 10
  })

  it('builds a mount argument array', () => {
    const args = buildMountArgs('myremote:/', '/mnt/point', 'myremote')
    expect(args[0]).toBe('mount')
    expect(args[1]).toBe('myremote:/')
    expect(args[2]).toBe('/mnt/point')
    expect(args).toContain('--allow-non-empty')
    expect(args).toContain('--volname')
    expect(args[args.indexOf('--volname') + 1]).toBe('myremote')
    expect(args).toContain('-vv')
  })

  it('enforces a minimum cache time of 1 second', () => {
    mockSettings.rclone_cache_files = 0
    mockSettings.rclone_cache_directories = 0
    const args = buildMountArgs('r:/', '/mnt', 'r')
    expect(args[args.indexOf('--attr-timeout') + 1]).toBe('1s')
    expect(args[args.indexOf('--dir-cache-time') + 1]).toBe('1s')
  })
})

describe('enquoteCommand', () => {
  it('quotes value arguments but leaves --flags untouched', () => {
    const result = enquoteCommand(['mount', 'remote:/path with space', '--vv'])
    expect(result[0]).toBe('"mount"')
    expect(result[1]).toBe('"remote:/path with space"')
    expect(result[2]).toBe('--vv')
  })
})

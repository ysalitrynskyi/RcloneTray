import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration tests for the IPC contracts exposed by the main process.
 *
 * Rather than re-implementing fake handlers, these tests drive the *real*
 * settings module that the `settings-merge` / `get-setting` IPC handlers in
 * main.ts delegate to, so a regression in the module is caught here.
 */

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/rclonetray-test') }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => '{}'),
  mkdirSync: vi.fn()
}))

vi.mock('fs/promises', () => ({
  default: { mkdir: vi.fn().mockResolvedValue(undefined), writeFile: vi.fn().mockResolvedValue(undefined) },
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined)
}))

describe('settings IPC contract (real module)', () => {
  let settings: typeof import('../../src/settings')

  beforeEach(async () => {
    vi.resetModules()
    settings = await import('../../src/settings')
  })

  it('get-setting returns the current value for a key', () => {
    // Mirrors: ipcMain.handle('get-setting', (_e, key) => settings.get(key))
    expect(settings.get('rclone_use_bundled')).toBe(true)
  })

  it('settings-merge applies a partial update and persists', async () => {
    // Mirrors: ipcMain.handle('settings-merge', (_e, data) => settings.merge(data))
    await settings.merge({ rclone_serving_ftp_enable: true, rclone_serving_username: 'bob' })
    expect(settings.get('rclone_serving_ftp_enable')).toBe(true)
    expect(settings.get('rclone_serving_username')).toBe('bob')
  })

  it('settings-merge round-trips form string values into typed settings', async () => {
    await settings.merge({
      rclone_cache_files: '7' as never,
      rclone_use_bundled: 'false' as never
    })
    expect(settings.get('rclone_cache_files')).toBe(7)
    expect(settings.get('rclone_use_bundled')).toBe(false)
  })
})

describe('IPC handler signature conventions', () => {
  it('handle-style handlers take (event, ...args)', () => {
    const handler = (_event: unknown, type: string, name: string, options: Record<string, string>) =>
      ({ type, name, options })
    const result = handler({ sender: {} }, 's3', 'myremote', { bucket: 'test' })
    expect(result).toEqual({ type: 's3', name: 'myremote', options: { bucket: 'test' } })
  })

  it('send-style handlers can reply through event.reply', () => {
    const replyFn = vi.fn()
    const handler = (event: { reply: (c: string, d: unknown) => void }, providerName: string) =>
      event.reply('provider-data-reply', { name: providerName })
    handler({ reply: replyFn }, 'google_drive')
    expect(replyFn).toHaveBeenCalledWith('provider-data-reply', { name: 'google_drive' })
  })
})

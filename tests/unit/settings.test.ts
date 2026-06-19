import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron app before importing settings
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/rclonetray-test')
  }
}))

// Mutable fs mock state so individual tests can simulate file contents.
const fsState: { exists: boolean; content: string } = { exists: false, content: '{}' }

vi.mock('fs', () => ({
  existsSync: vi.fn(() => fsState.exists),
  readFileSync: vi.fn(() => fsState.content),
  mkdirSync: vi.fn()
}))

// Mock fs/promises (used for async writes)
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined)
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  writeFile: vi.fn().mockResolvedValue(undefined)
}))

describe('Settings Module', () => {
  let settings: typeof import('../../src/settings')

  beforeEach(async () => {
    fsState.exists = false
    fsState.content = '{}'
    vi.resetModules()
    settings = await import('../../src/settings')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('get', () => {
    it('returns default values for known settings', () => {
      expect(settings.get('tray_menu_show_type')).toBe(true)
      expect(settings.get('rclone_use_bundled')).toBe(true)
      expect(settings.get('rclone_config')).toBe('')
      expect(settings.get('rclone_cache_files')).toBe(3)
      expect(settings.get('rclone_cache_directories')).toBe(10)
      expect(settings.get('rclone_sync_autoupload_delay')).toBe(5)
      expect(settings.get('rclone_serving_username')).toBe('')
    })
  })

  describe('has', () => {
    it('returns true for known settings', () => {
      expect(settings.has('tray_menu_show_type')).toBe(true)
      expect(settings.has('rclone_config')).toBe(true)
    })

    it('returns false for unknown settings', () => {
      expect(settings.has('unknown_setting' as never)).toBe(false)
    })
  })

  describe('set', () => {
    it('updates a boolean setting', () => {
      settings.set('tray_menu_show_type', false)
      expect(settings.get('tray_menu_show_type')).toBe(false)
    })

    it('updates a numeric setting', () => {
      settings.set('rclone_cache_files', 10)
      expect(settings.get('rclone_cache_files')).toBe(10)
    })

    it('updates a string setting', () => {
      settings.set('rclone_config', '/path/to/config')
      expect(settings.get('rclone_config')).toBe('/path/to/config')
    })
  })

  describe('merge', () => {
    it('merges multiple settings at once', () => {
      settings.merge({
        tray_menu_show_type: false,
        rclone_cache_files: 20,
        rclone_serving_http_enable: true
      })
      expect(settings.get('tray_menu_show_type')).toBe(false)
      expect(settings.get('rclone_cache_files')).toBe(20)
      expect(settings.get('rclone_serving_http_enable')).toBe(true)
    })

    it('does not affect unrelated settings', () => {
      const original = settings.get('rclone_use_bundled')
      settings.merge({ tray_menu_show_type: false })
      expect(settings.get('rclone_use_bundled')).toBe(original)
    })

    it('ignores unknown keys', () => {
      settings.merge({ not_a_real_setting: 'x' } as never)
      expect(settings.has('not_a_real_setting' as never)).toBe(false)
    })

    it('coerces string numbers into numbers (renderer sends strings)', () => {
      settings.merge({ rclone_cache_files: '42' as never })
      expect(settings.get('rclone_cache_files')).toBe(42)
      expect(typeof settings.get('rclone_cache_files')).toBe('number')
    })

    it('coerces truthy strings into booleans', () => {
      settings.merge({ rclone_serving_http_enable: 'true' as never })
      expect(settings.get('rclone_serving_http_enable')).toBe(true)
      settings.merge({ rclone_serving_http_enable: 'false' as never })
      expect(settings.get('rclone_serving_http_enable')).toBe(false)
    })
  })

  describe('getAll', () => {
    it('returns a copy, not the original reference', () => {
      const all = settings.getAll()
      all.tray_menu_show_type = false
      expect(settings.get('tray_menu_show_type')).toBe(true)
    })
  })

  describe('remove', () => {
    it('resets a setting to its default value', () => {
      settings.set('tray_menu_show_type', false)
      settings.remove('tray_menu_show_type')
      expect(settings.get('tray_menu_show_type')).toBe(true)
    })

    it('returns false for unknown settings', () => {
      expect(settings.remove('unknown_setting' as never)).toBe(false)
    })
  })

  describe('persisted file loading', () => {
    it('loads values from a valid settings file', async () => {
      fsState.exists = true
      fsState.content = JSON.stringify({ tray_menu_show_type: false, rclone_cache_files: 99 })
      vi.resetModules()
      const fresh = await import('../../src/settings')
      expect(fresh.get('tray_menu_show_type')).toBe(false)
      expect(fresh.get('rclone_cache_files')).toBe(99)
    })

    it('falls back to defaults when the file is corrupt', async () => {
      fsState.exists = true
      fsState.content = '{ this is not valid json'
      vi.resetModules()
      const fresh = await import('../../src/settings')
      expect(fresh.get('tray_menu_show_type')).toBe(true)
      expect(fresh.get('rclone_cache_files')).toBe(3)
    })
  })
})

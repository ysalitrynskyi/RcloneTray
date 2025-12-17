import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mock electron app before importing settings
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/rclonetray-test')
  }
}))

// Mock fs/promises
vi.mock('fs/promises', () => ({
  default: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockRejectedValue(new Error('File not found')),
    readFile: vi.fn().mockResolvedValue('{}'),
    writeFile: vi.fn().mockResolvedValue(undefined)
  },
  mkdir: vi.fn().mockResolvedValue(undefined),
  stat: vi.fn().mockRejectedValue(new Error('File not found')),
  readFile: vi.fn().mockResolvedValue('{}'),
  writeFile: vi.fn().mockResolvedValue(undefined)
}))

describe('Settings Module', () => {
  let settings: typeof import('../../src/settings')

  beforeEach(async () => {
    // Clear module cache and re-import
    vi.resetModules()
    settings = await import('../../src/settings')
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  describe('get', () => {
    it('should return default values for known settings', () => {
      expect(settings.get('tray_menu_show_type')).toBe(true)
      expect(settings.get('rclone_use_bundled')).toBe(true)
      expect(settings.get('rclone_config')).toBe('')
      expect(settings.get('rclone_cache_files')).toBe(3)
      expect(settings.get('rclone_cache_directories')).toBe(10)
      expect(settings.get('rclone_sync_enable')).toBe(true)
      expect(settings.get('rclone_sync_autoupload_delay')).toBe(5)
      expect(settings.get('rclone_ncdu_enable')).toBe(false)
      expect(settings.get('rclone_serving_http_enable')).toBe(false)
      expect(settings.get('rclone_serving_ftp_enable')).toBe(false)
      expect(settings.get('rclone_serving_restic_enable')).toBe(false)
      expect(settings.get('rclone_serving_webdav_enable')).toBe(false)
      expect(settings.get('rclone_serving_username')).toBe('')
      expect(settings.get('rclone_serving_password')).toBe('')
    })
  })

  describe('has', () => {
    it('should return true for known settings', () => {
      expect(settings.has('tray_menu_show_type')).toBe(true)
      expect(settings.has('rclone_use_bundled')).toBe(true)
      expect(settings.has('rclone_config')).toBe(true)
    })

    it('should return false for unknown settings', () => {
      expect(settings.has('unknown_setting' as any)).toBe(false)
    })
  })

  describe('set', () => {
    it('should update a setting value', () => {
      settings.set('tray_menu_show_type', false)
      expect(settings.get('tray_menu_show_type')).toBe(false)
    })

    it('should update numeric settings', () => {
      settings.set('rclone_cache_files', 10)
      expect(settings.get('rclone_cache_files')).toBe(10)
    })

    it('should update string settings', () => {
      settings.set('rclone_config', '/path/to/config')
      expect(settings.get('rclone_config')).toBe('/path/to/config')
    })
  })

  describe('merge', () => {
    it('should merge multiple settings at once', () => {
      settings.merge({
        tray_menu_show_type: false,
        rclone_cache_files: 20,
        rclone_serving_http_enable: true
      })
      
      expect(settings.get('tray_menu_show_type')).toBe(false)
      expect(settings.get('rclone_cache_files')).toBe(20)
      expect(settings.get('rclone_serving_http_enable')).toBe(true)
    })

    it('should not affect other settings when merging', () => {
      const originalValue = settings.get('rclone_use_bundled')
      settings.merge({ tray_menu_show_type: false })
      expect(settings.get('rclone_use_bundled')).toBe(originalValue)
    })
  })

  describe('getAll', () => {
    it('should return all settings', () => {
      const all = settings.getAll()
      
      expect(all).toHaveProperty('tray_menu_show_type')
      expect(all).toHaveProperty('rclone_use_bundled')
      expect(all).toHaveProperty('rclone_config')
      expect(all).toHaveProperty('custom_args')
      expect(all).toHaveProperty('rclone_cache_files')
      expect(all).toHaveProperty('rclone_cache_directories')
      expect(all).toHaveProperty('rclone_sync_enable')
      expect(all).toHaveProperty('rclone_sync_autoupload_delay')
      expect(all).toHaveProperty('rclone_ncdu_enable')
      expect(all).toHaveProperty('rclone_serving_http_enable')
      expect(all).toHaveProperty('rclone_serving_ftp_enable')
      expect(all).toHaveProperty('rclone_serving_restic_enable')
      expect(all).toHaveProperty('rclone_serving_webdav_enable')
      expect(all).toHaveProperty('rclone_serving_username')
      expect(all).toHaveProperty('rclone_serving_password')
    })

    it('should return a copy of settings, not the original', () => {
      const all = settings.getAll()
      all.tray_menu_show_type = false
      expect(settings.get('tray_menu_show_type')).toBe(true)
    })
  })

  describe('remove', () => {
    it('should reset a setting to its default value', () => {
      settings.set('tray_menu_show_type', false)
      expect(settings.get('tray_menu_show_type')).toBe(false)
      
      settings.remove('tray_menu_show_type')
      expect(settings.get('tray_menu_show_type')).toBe(true)
    })

    it('should return true when removing an existing setting', () => {
      expect(settings.remove('tray_menu_show_type')).toBe(true)
    })

    it('should return false when trying to remove an unknown setting', () => {
      expect(settings.remove('unknown_setting' as any)).toBe(false)
    })
  })
})


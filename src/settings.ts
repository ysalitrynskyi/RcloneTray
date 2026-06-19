'use strict'

import * as path from 'path'
import * as fs from 'fs/promises'
import { readFileSync, existsSync, mkdirSync } from 'fs'
import { app } from 'electron'
import { Settings, SettingKey, SettingValue } from './types'

/**
 * Default settings. Used both as initial cache and to restore on `remove`.
 */
const DEFAULTS: Settings = {
  tray_menu_show_type: true,
  rclone_use_bundled: true,
  rclone_config: '',
  custom_args: '',

  rclone_cache_files: 3,
  rclone_cache_directories: 10,
  rclone_mount_vfs_cache_mode: 'writes',
  rclone_sync_enable: true,
  rclone_sync_autoupload_delay: 5,
  rclone_ncdu_enable: false,
  rclone_serving_http_enable: false,
  rclone_serving_ftp_enable: false,
  rclone_serving_restic_enable: false,
  rclone_serving_webdav_enable: false,
  rclone_serving_username: '',
  rclone_serving_password: ''
}

/**
 * Directory that holds settings.json.
 * Can be overridden with RCLONETRAY_SETTINGS_DIR (used for tests/isolated profiles).
 */
const settingsDir: string = process.env.RCLONETRAY_SETTINGS_DIR || app.getPath('userData')

/**
 * Path to settings.json file
 */
const settingsFile: string = path.join(settingsDir, 'settings.json')

/**
 * Cache for current settings (starts from defaults).
 */
const cache: Settings = { ...DEFAULTS }

/**
 * Coerce an incoming value to the type of its default, so values coming from the
 * renderer form (where numbers/booleans may arrive as strings) stay consistent.
 */
function coerceSettingValue<K extends SettingKey>(key: K, value: unknown): Settings[K] {
  const defaultValue = DEFAULTS[key]
  if (typeof defaultValue === 'boolean') {
    return ([true, 'true', 1, '1', 'yes'].includes(value as string | number | boolean)) as Settings[K]
  }
  if (typeof defaultValue === 'number') {
    const parsed = Number(value)
    return (Number.isFinite(parsed) ? parsed : defaultValue) as Settings[K]
  }
  return (value == null ? '' : String(value)) as Settings[K]
}

/**
 * Check if setting exists
 */
export function has(item: string): item is SettingKey {
  return Object.prototype.hasOwnProperty.call(cache, item)
}

/**
 * Get setting value
 */
export function get<K extends SettingKey>(item: K): Settings[K]
export function get<K extends SettingKey>(item: K, defaultValue: Settings[K]): Settings[K]
export function get(item: SettingKey, defaultValue?: SettingValue): SettingValue {
  return has(item) ? cache[item] : (defaultValue as SettingValue)
}

/**
 * Set setting value
 */
export function set<K extends SettingKey>(item: K, newValue: Settings[K]): void {
  cache[item] = newValue
  updateFile()
}

/**
 * Remove setting - resets to undefined (not actually possible with current types)
 */
export function remove(item: SettingKey): boolean {
  if (has(item)) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (cache as any)[item] = DEFAULTS[item]
    updateFile()
    return true
  }

  return false
}

/**
 * Merge current settings
 */
export function merge(newSettings: Partial<Settings>): Promise<void> {
  Object.keys(newSettings).forEach(function (key) {
    const k = key as SettingKey
    if (has(k)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cache as any)[k] = coerceSettingValue(k, newSettings[k])
    }
  })
  return updateFile()
}

/**
 * Get all settings
 */
export function getAll(): Settings {
  return { ...cache }
}

/**
 * Update the settings file asynchronously.
 */
async function updateFile(): Promise<void> {
  try {
    const jsonContent = JSON.stringify(cache)
    await fs.mkdir(settingsDir, { recursive: true })
    await fs.writeFile(settingsFile, jsonContent)
  } catch (err) {
    console.error('Error updating settings file:', err)
  }
}

/**
 * Read the settings file synchronously and initialize the settings cache.
 *
 * This is intentionally synchronous: other modules (e.g. rclone.init) read
 * settings during app startup, so the cache must be populated before then.
 * Corrupt or unreadable files fall back to defaults instead of crashing.
 */
function readFileSyncInit(): void {
  try {
    if (!existsSync(settingsDir)) {
      mkdirSync(settingsDir, { recursive: true })
    }

    if (existsSync(settingsFile)) {
      const content = readFileSync(settingsFile, 'utf-8')
      const parsed = JSON.parse(content) as Partial<Settings>
      Object.keys(parsed).forEach((key) => {
        const k = key as SettingKey
        if (has(k)) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (cache as any)[k] = coerceSettingValue(k, parsed[k])
        }
      })
    }
  } catch (err) {
    console.error('Error reading settings file, using defaults:', err)
  }
}

// Initialize settings cache by reading the settings file (synchronously).
readFileSyncInit()

export default { set, get, has, getAll, remove, merge }

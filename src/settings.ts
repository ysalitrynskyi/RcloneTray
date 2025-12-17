'use strict'

import * as path from 'path'
import * as fs from 'fs/promises'
import { app } from 'electron'
import { Settings, SettingKey, SettingValue } from './types'

/**
 * Path to settings.json file
 */
const settingsFile: string = path.join(app.getPath('userData'), 'settings.json')

/**
 * Cache for current settings and predefine defaults.
 */
const cache: Settings = {
  tray_menu_show_type: true,
  rclone_use_bundled: true,
  rclone_config: '',
  custom_args: '',

  rclone_cache_files: 3,
  rclone_cache_directories: 10,
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
    // Reset to default values based on type
    const defaults: Settings = {
      tray_menu_show_type: true,
      rclone_use_bundled: true,
      rclone_config: '',
      custom_args: '',
      rclone_cache_files: 3,
      rclone_cache_directories: 10,
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(cache as any)[item] = defaults[item]
    updateFile()
    return true
  }

  return false
}

/**
 * Merge current settings
 */
export function merge(newSettings: Partial<Settings>): void {
  Object.keys(newSettings).forEach(function (key) {
    const k = key as SettingKey
    if (has(k)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(cache as any)[k] = newSettings[k]
    }
  })
  updateFile()
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
    await fs.writeFile(settingsFile, jsonContent)
  } catch (err) {
    console.error('Error updating settings file:', err)
  }
}

/**
 * Read the settings file and initialize the settings cache asynchronously.
 */
async function readFile(): Promise<void> {
  try {
    // Create the directory if not exists yet.
    await fs.mkdir(app.getPath('userData'), { recursive: true })

    // Check if the settings file exists before reading
    try {
      await fs.stat(settingsFile)
      const content = await fs.readFile(settingsFile, 'utf-8')
      const settings = JSON.parse(content) as Partial<Settings>
      Object.assign(cache, settings)
    } catch {
      // File doesn't exist, use defaults
    }
  } catch (err) {
    console.error('Error reading settings file:', err)
  }
}

// Initialize settings cache by reading the settings file.
readFile()

export default { set, get, has, getAll, remove, merge }


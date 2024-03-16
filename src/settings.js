'use strict'

const path = require('path')
const fs = require('fs').promises
const { app } = require('electron')

/**
 * Path to settings.json file
 * @private
 */
const settingsFile = path.join(app.getPath('userData'), 'settings.json')

/**
 * Cache for current settings and predefine defaults.
 * @private
 */
const cache = {
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
 * @param {string} item
 * @returns {boolean}
 */
const has = function (item) {
  return cache.hasOwnProperty(item)
}

/**
 * Get setting value
 * @param {string} item
 * @param {*} defaultValue
 * @returns {*}
 */
const get = function (item, defaultValue) {
  return has(item) ? cache[item] : defaultValue
}

/**
 * Set setting value
 * @param {string} item
 * @param {*} newValue
 */
const set = function (item, newValue) {
  cache[item] = newValue
  updateFile()
}

/**
 * Remove setting
 * @param {string} item
 * @returns {boolean}
 */
const remove = function (item) {
  if (has(item)) {
    delete cache[item]
    updateFile()
    return true
  }

  return false
}

/**
 * Merge current settings
 * @param settings
 */
const merge = function (settings) {
  Object.keys(settings).forEach(function (key) {
    cache[key] = settings[key]
  })
  updateFile()
}

/**
 * Get all settings
 * @returns {{}}
 */
const getAll = function () {
  return cache
}

/**
 * Update the settings file asynchronously.
 */
const updateFile = async function () {
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
const readFile = async function () {
  try {
    // Create the directory if not exists yet.
    await fs.mkdir(app.getPath('userData'), { recursive: true })

    // Check if the settings file exists before reading
    const fileExists = await fs.stat(settingsFile).catch(() => false)
    if (fileExists) {
      const settings = JSON.parse(await fs.readFile(settingsFile))
      Object.assign(cache, settings)
    }
  } catch (err) {
    console.error('Error reading settings file:', err)
  }
}

// Initialize settings cache by reading the settings file.
readFile()

module.exports = { set, get, has, getAll, remove, merge }

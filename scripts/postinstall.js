'use strict'

// Runs after `npm install`. npm 11 may skip dependency install scripts that are
// not approved, which leaves Electron without its binary; install it here.
// A failed rclone download must not break `npm install` (offline, proxies):
// it only warns, and `npm run fetch-rclone` can be run later.

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')

function electronBinaryPresent() {
  try {
    const pathFile = path.join(root, 'node_modules', 'electron', 'path.txt')
    if (!fs.existsSync(pathFile)) {
      return false
    }
    const relative = fs.readFileSync(pathFile, 'utf8').trim()
    return fs.existsSync(path.join(root, 'node_modules', 'electron', 'dist', relative))
  } catch {
    return false
  }
}

const electronInstaller = path.join(root, 'node_modules', 'electron', 'install.js')
if (fs.existsSync(electronInstaller) && !electronBinaryPresent()) {
  const electron = spawnSync(process.execPath, [electronInstaller], { cwd: path.dirname(electronInstaller), stdio: 'inherit' })
  if (electron.status !== 0) {
    console.warn('Could not download the Electron binary. Run: node node_modules/electron/install.js')
  }
}

const fetch = spawnSync(process.execPath, [path.join(__dirname, 'fetch-rclone.js')], { cwd: root, stdio: 'inherit' })
if (fetch.status !== 0) {
  console.warn('Could not download the bundled rclone. Run "npm run fetch-rclone" when you are online.')
}

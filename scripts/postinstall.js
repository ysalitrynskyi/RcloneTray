'use strict'

const { spawnSync } = require('child_process')
const path = require('path')

const root = path.join(__dirname, '..')
const fetch = spawnSync(process.execPath, [path.join(__dirname, 'fetch-rclone.js')], {
  cwd: root,
  stdio: 'inherit'
})
if (fetch.status !== 0) {
  process.exit(fetch.status || 1)
}

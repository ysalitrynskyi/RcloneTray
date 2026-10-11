'use strict'

const fs = require('fs')
const path = require('path')

const archNames = { 0: 'ia32', 1: 'x64', 2: 'armv7l', 3: 'arm64', 4: 'universal' }
const rcloneArch = { x64: 'amd64', ia32: '386', arm64: 'arm64', armv7l: 'arm-v7' }

exports.default = async function stageRclone(context) {
  const electronArch = archNames[context.arch] || 'x64'
  const folderArch = rcloneArch[electronArch]
  if (!folderArch) {
    return
  }
  const platform = context.electronPlatformName
  const source = path.join(context.packager.projectDir, 'rclone', platform, folderArch)
  const stagedRoot = path.join(context.packager.projectDir, 'rclone', 'staged')
  fs.rmSync(stagedRoot, { recursive: true, force: true })
  if (!fs.existsSync(source)) {
    throw new Error(`Missing rclone binary for ${platform}/${folderArch}. Run the rclone fetch before packaging.`)
  }
  const dest = path.join(stagedRoot, platform, folderArch)
  fs.mkdirSync(dest, { recursive: true })
  for (const name of fs.readdirSync(source)) {
    fs.copyFileSync(path.join(source, name), path.join(dest, name))
  }
}

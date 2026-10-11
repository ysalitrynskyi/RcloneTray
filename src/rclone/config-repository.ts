import * as fs from 'fs'
import * as path from 'path'
import { isEncryptedRcloneConfig } from './config-text'

const backedUp = new Set<string>()

export function resetConfigSessionForTests(): void {
  backedUp.clear()
}

export function readConfigText(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return ''
  }
  return fs.readFileSync(filePath, 'utf8')
}

/**
 * One timestamped copy per config path per process, before the first write.
 * Mode 0600 where the platform honours it.
 */
export function backupConfigOnce(filePath: string): string | null {
  const key = path.resolve(filePath)
  if (backedUp.has(key)) {
    return null
  }
  backedUp.add(key)
  if (!fs.existsSync(filePath)) {
    return null
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = `${filePath}.${stamp}.bak`
  fs.copyFileSync(filePath, dest)
  try {
    fs.chmodSync(dest, 0o600)
  } catch {
    // Windows ACLs do not map 0600. The copy still exists.
  }
  return dest
}

function unlinkQuiet(filePath: string): void {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch {
    // The caller reports the original error.
  }
}

/**
 * Replace the config text. A symlink is written through, not replaced by a
 * regular file. A failed rename deletes the temp file instead of leaving a
 * second copy of the config behind.
 */
export function writeConfigText(filePath: string, content: string): void {
  if (isEncryptedRcloneConfig(content)) {
    throw new Error('Refusing to write an encrypted rclone config.')
  }
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`)
  try {
    fs.writeFileSync(tmpPath, content, { mode: 0o600, flag: 'wx' })
    try {
      fs.chmodSync(tmpPath, 0o600)
    } catch {
      // See backupConfigOnce.
    }
    let link = false
    try {
      link = fs.lstatSync(filePath).isSymbolicLink()
    } catch {
      link = false
    }
    if (link) {
      const fd = fs.openSync(filePath, 'w')
      try {
        fs.writeFileSync(fd, content)
      } finally {
        fs.closeSync(fd)
      }
      unlinkQuiet(tmpPath)
      return
    }
    fs.renameSync(tmpPath, filePath)
    try {
      fs.chmodSync(filePath, 0o600)
    } catch {
      // See backupConfigOnce.
    }
  } catch (error) {
    unlinkQuiet(tmpPath)
    throw error
  }
}

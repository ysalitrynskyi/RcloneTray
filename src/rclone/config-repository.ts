import * as fs from 'fs'
import * as path from 'path'
import { isEncryptedRcloneConfig } from './config-text'

const backedUp = new Set<string>()

const KEPT_BACKUPS = 3
const RENAME_RETRY_CODES = new Set(['EPERM', 'EBUSY', 'EACCES'])
const RENAME_BACKOFF_MS = [20, 40, 80, 160, 320]

export function resetConfigSessionForTests(): void {
  backedUp.clear()
}

/**
 * The config is read as raw bytes, one character per byte (latin1), so text
 * that is not valid UTF-8 survives an edit unchanged. config-text.ts expects
 * and returns this byte-per-character form.
 */
export function readConfigText(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return ''
  }
  return fs.readFileSync(filePath, 'latin1')
}

function pruneBackups(filePath: string): void {
  try {
    const dir = path.dirname(filePath)
    const prefix = `${path.basename(filePath)}.`
    const backups = fs.readdirSync(dir)
      .filter((name) => name.startsWith(prefix) && name.endsWith('.bak'))
      .sort()
    for (const name of backups.slice(0, Math.max(0, backups.length - KEPT_BACKUPS))) {
      fs.unlinkSync(path.join(dir, name))
    }
  } catch {
    // Old backups stay. The new one is already safe.
  }
}

/**
 * One timestamped copy per config path per process, before the first write.
 * Mode 0600 where the platform honours it. Only the three newest are kept.
 */
export function backupConfigOnce(filePath: string): string | null {
  const key = path.resolve(filePath)
  if (backedUp.has(key)) {
    return null
  }
  if (!fs.existsSync(filePath)) {
    backedUp.add(key)
    return null
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = `${filePath}.${stamp}.bak`
  fs.copyFileSync(filePath, dest)
  backedUp.add(key)
  try {
    fs.chmodSync(dest, 0o600)
  } catch {
    // Windows ACLs do not map 0600. The copy still exists.
  }
  pruneBackups(filePath)
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

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Windows antivirus scanners and rclone itself can hold the config open for a
 * moment, which makes the rename fail with EPERM, EBUSY or EACCES.
 */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to)
      return
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (!code || !RENAME_RETRY_CODES.has(code) || attempt >= RENAME_BACKOFF_MS.length) {
        throw error
      }
      sleepSync(RENAME_BACKOFF_MS[attempt])
    }
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
    fs.writeFileSync(tmpPath, content, { encoding: 'latin1', mode: 0o600, flag: 'wx' })
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
        fs.writeFileSync(fd, content, 'latin1')
      } finally {
        fs.closeSync(fd)
      }
      unlinkQuiet(tmpPath)
      return
    }
    renameWithRetry(tmpPath, filePath)
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

import * as path from 'path'
import * as fs from 'fs/promises'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`)
  try {
    await fs.writeFile(tmpPath, JSON.stringify(value), { mode: 0o600 })
    try {
      await fs.chmod(tmpPath, 0o600)
    } catch {
      // Windows does not map POSIX modes.
    }
    let lastError: unknown
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        await fs.rename(tmpPath, filePath)
        return
      } catch (error) {
        lastError = error
        const code = (error as NodeJS.ErrnoException).code
        if (attempt < 4 && (code === 'EPERM' || code === 'EBUSY' || code === 'EACCES')) {
          await delay(25 * (attempt + 1))
          continue
        }
        throw error
      }
    }
    throw lastError
  } catch (error) {
    await fs.unlink(tmpPath).catch(() => undefined)
    throw error
  }
}

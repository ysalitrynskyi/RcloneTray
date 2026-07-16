import * as path from 'path'
import * as fs from 'fs/promises'

export async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  const dir = path.dirname(filePath)
  await fs.mkdir(dir, { recursive: true })
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  await fs.writeFile(tmpPath, JSON.stringify(value))
  await fs.rename(tmpPath, filePath)
}

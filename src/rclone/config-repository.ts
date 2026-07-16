import * as fs from 'fs'
import * as path from 'path'
import * as ini from 'ini'

type IniConfig = Record<string, Record<string, string>>

function atomicWriteFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  const tmpPath = path.join(dir, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(tmpPath, content)
  fs.renameSync(tmpPath, filePath)
}

export function readRcloneConfig(configFile: string): IniConfig {
  const configContent = fs.existsSync(configFile) ? fs.readFileSync(configFile).toString() : ''
  return ini.decode(configContent) as IniConfig
}

export function writeRcloneConfig(configFile: string, config: IniConfig): void {
  atomicWriteFile(configFile, ini.encode(config, { whitespace: true }))
}

export function mergeBookmarkConfig(configFile: string, bookmarkName: string, values: Record<string, string>): void {
  const config = readRcloneConfig(configFile)
  config[bookmarkName] = Object.assign(config[bookmarkName] || {}, values)
  writeRcloneConfig(configFile, config)
}

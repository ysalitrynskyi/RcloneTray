import { backupConfigOnce, readConfigText, writeConfigText } from './config-repository'
import { withConfigLock } from './config-lock'
import { ConfigEditError, editConfigText, isEncryptedRcloneConfig, listConfigSections } from './config-text'

export interface ConfigFields {
  set: Record<string, string>
  unset: string[]
}

const ENCRYPTED_MESSAGE = 'This rclone config is encrypted. RcloneTray will not change it. Decrypt it, or edit it with rclone config.'

function readEditable(configFile: string): string {
  const current = readConfigText(configFile)
  if (isEncryptedRcloneConfig(current)) {
    throw new ConfigEditError(ENCRYPTED_MESSAGE)
  }
  return current
}

/**
 * Every function here reads the file, edits the text and writes it inside one
 * lock with nothing awaited in between, so it works on the file as it is now,
 * not as it was when the user opened the dialog.
 */
export function createRemote(configFile: string, name: string, type: string, fields: ConfigFields): Promise<void> {
  return withConfigLock(() => {
    const current = readEditable(configFile)
    if (listConfigSections(current).includes(name)) {
      throw new ConfigEditError(`A remote named "${name}" already exists.`)
    }
    backupConfigOnce(configFile)
    writeConfigText(configFile, editConfigText(current, {
      section: name,
      createType: type,
      set: fields.set,
      unset: fields.unset
    }))
  })
}

/**
 * Resolves to false when there was nothing to change and nothing was written.
 */
export function updateRemote(configFile: string, name: string, fields: ConfigFields): Promise<boolean> {
  return withConfigLock(() => {
    const current = readEditable(configFile)
    if (!listConfigSections(current).includes(name)) {
      throw new ConfigEditError(`Remote "${name}" does not exist. It was not recreated.`)
    }
    if (Object.keys(fields.set).length === 0 && fields.unset.length === 0) {
      return false
    }
    backupConfigOnce(configFile)
    writeConfigText(configFile, editConfigText(current, {
      section: name,
      set: fields.set,
      unset: fields.unset
    }))
    return true
  })
}

export function deleteRemote(configFile: string, name: string): Promise<void> {
  return withConfigLock(() => {
    const current = readEditable(configFile)
    backupConfigOnce(configFile)
    writeConfigText(configFile, editConfigText(current, { section: name, removeSection: true }))
  })
}

/**
 * Undo createRemote: removes the one section that call added and leaves
 * everything else, including changes made by others since, in place.
 */
export function rollbackCreatedRemote(configFile: string, name: string): Promise<void> {
  return withConfigLock(() => {
    const current = readConfigText(configFile)
    if (isEncryptedRcloneConfig(current)) {
      return
    }
    const next = editConfigText(current, { section: name, removeSection: true })
    if (next !== current) {
      writeConfigText(configFile, next)
    }
  })
}

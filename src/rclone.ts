'use strict'

import { exec, execSync, spawn, ChildProcess } from 'child_process'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import chokidar from 'chokidar'
import * as ini from 'ini'
import { app, shell } from 'electron'
import isDev from 'electron-is-dev'
import * as settings from './settings'
import * as dialogs from './dialogs'
import {
  Bookmark,
  BookmarksCache,
  ProvidersCache,
  Provider,
  RcloneCache,
  ProcessRegistry,
  ProcessRegistryEntry,
  AutomaticUploadRegistry as AutoUploadRegistryType,
  ServeProtocol,
  ServeProtocols
} from './types'

/**
 * Define unsupported provider types
 */
const UnsupportedRcloneProviders: string[] = [
  'union',
  'crypt'
]

/**
 * Define providers that require buckets and cannot works with root.
 */
const BucketRequiredProviders: string[] = [
  'b2',
  'swift',
  's3',
  'gsc',
  'hubic'
]

/**
 * Rclone executable filename
 */
const RcloneBinaryName: string = process.platform === 'win32' ? 'rclone.exe' : 'rclone'

/**
 * Bundled Rclone path
 */
const RcloneBinaryBundled: string = app.isPackaged
  ? path.join(process.resourcesPath, 'rclone', process.platform, process.arch, RcloneBinaryName)
  : path.join(app.getAppPath(), 'rclone', process.platform, process.arch, RcloneBinaryName)

/**
 * System's temp directory
 */
const tempDir: string = app.getPath('temp')

/**
 * Rclone settings cache
 */
const Cache: RcloneCache = {
  version: null,
  configFile: '',
  providers: {},
  bookmarks: {}
}

/**
 * Update callbacks registry
 */
const UpdateCallbacksRegistry: Array<(eventName?: string) => void> = []

/**
 * BookmarkProcessManager registry
 */
const BookmarkProcessRegistry: ProcessRegistry = {}

/**
 * Automatic Upload for bookmark registry
 */
const AutomaticUploadRegistry: AutoUploadRegistryType = {}

/**
 * Enquote command
 */
function enquoteCommand(command: string[]): string[] {
  return command.map((arg) => {
    if (arg.substring(0, 2) !== '--') {
      return JSON.stringify(arg)
    }
    return arg
  })
}

/**
 * Prepare array to Rclone command, rclone binary should be ommited
 */
function prepareRcloneCommand(command: string[]): string[] {
  const config = getConfigFile()
  if (config) {
    command.unshift('--config', config)
  }

  if (settings.get('rclone_use_bundled')) {
    command.unshift(RcloneBinaryBundled)
  } else {
    command.unshift(RcloneBinaryName)
  }

  command.push('--auto-confirm')

  return command
}

/**
 * Append custom rclone args to command array
 */
function appendCustomRcloneCommandArgs(commandArray: string[], bookmarkName?: string): string[] {
  const verboseCommandStrPattern = /^-v+$/
  const filterOutVerboseArgs = (arg: string): boolean => {
    return !verboseCommandStrPattern.test(arg.trim())
  }

  const argsSplitterPattern = /[\n\s]+/

  const customArgsStr = settings.get('custom_args') || ''
  if (customArgsStr.trim()) {
    let customGlobalArgs = customArgsStr.trim().split(argsSplitterPattern)
    customGlobalArgs = customGlobalArgs.filter(filterOutVerboseArgs)
    commandArray = commandArray.concat(customGlobalArgs)
  }

  if (bookmarkName) {
    const bookmark = getBookmark(bookmarkName)
    if (bookmark._rclonetray_custom_args && bookmark._rclonetray_custom_args.trim()) {
      let customBookmarkArgs = bookmark._rclonetray_custom_args.trim().split(argsSplitterPattern)
      customBookmarkArgs = customBookmarkArgs.filter(filterOutVerboseArgs)
      commandArray = commandArray.concat(customBookmarkArgs)
    }
  }

  return commandArray.filter((element) => element && element.trim())
}

/**
 * Execute async Rclone command
 */
function doCommand(command: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let cmd = prepareRcloneCommand(command)
    cmd = enquoteCommand(cmd)
    if (isDev) {
      console.info('Rclone[A]', cmd)
    }
    exec(cmd.join(' '), (err, stdout) => {
      if (err) {
        console.error('Rclone', err)
        reject(new Error('Rclone command error.'))
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * Execute synchronious Rclone command and return the output
 */
function doCommandSync(command: string[]): string {
  let cmd = prepareRcloneCommand(command)
  cmd = enquoteCommand(cmd)
  if (isDev) {
    console.info('Rclone[S]', cmd)
  }
  return execSync(cmd.join(' ')).toString()
}

/**
 * Execute command in terminal
 */
function doCommandInTerminal(command: string[]): void {
  let cmd = enquoteCommand(command)
  const cmdStr = cmd.join(' ')

  if (isDev) {
    console.log('Rclone[T]', cmdStr)
  }

  if (process.platform === 'darwin') {
    const escapedCmd = cmdStr.replace(/"/g, '\\"')
    spawn('/usr/bin/osascript', ['-e', `tell application "Terminal" to do script "${escapedCmd}" activate`])
  } else if (process.platform === 'linux') {
    const tempCmdWrapper = path.join(tempDir, 'rclonetray-linux-cmd-wrapper.sh')
    const data = new Uint8Array(Buffer.from(cmdStr))
    fs.writeFile(tempCmdWrapper, data, (err) => {
      if (err) {
        throw new Error('Cannot open terminal')
      } else {
        fs.chmodSync(tempCmdWrapper, 0o755)
        exec(`x-terminal-emulator -e "${tempCmdWrapper}"`)
      }
    })
  } else if (process.platform === 'win32') {
    exec(`start cmd.exe /K "${cmdStr}"`)
  }
}

/**
 * Simple process tracker. Used to track the rclone command processes status and output.
 */
class BookmarkProcessManager {
  id: string
  bookmarkName: string
  processName: string

  constructor(processName: string, bookmarkName: string) {
    this.id = `${bookmarkName}:${processName}`
    this.bookmarkName = bookmarkName
    this.processName = processName
  }

  /**
   * Create new monitored process
   */
  create(command: string[]): void {
    if (!command || command.length < 1) {
      throw new Error('Broken Rclone command')
    }
    if (this.exists()) {
      console.error(`Trying to create new ${this.processName} over existing for ${this.bookmarkName}.`)
      throw new Error('There is already such process.')
    }
    const id = this.id

    let cmd = prepareRcloneCommand(command)
    cmd = appendCustomRcloneCommandArgs(cmd, this.bookmarkName)

    BookmarkProcessRegistry[id] = {
      bookmarkName: this.bookmarkName,
      processName: this.processName,
      process: spawn(cmd[0], cmd.slice(1)),
      data: {
        OK: false
      }
    }

    if (isDev) {
      console.log('Rclone[BP]', cmd)
    }

    BookmarkProcessRegistry[id].process.stderr?.on('data', this.rcloneProcessWatchdog.bind(this))

    BookmarkProcessRegistry[id].process.on('close', () => {
      if (BookmarkProcessRegistry[id]?.data.OK) {
        if (BookmarkProcessRegistry[id].processName === 'download') {
          dialogs.notification(`Downloading from ${BookmarkProcessRegistry[id].bookmarkName} is finished`)
        } else if (BookmarkProcessRegistry[id].processName === 'upload') {
          dialogs.notification(`Uploading to ${BookmarkProcessRegistry[id].bookmarkName} is finished`)
        } else if (BookmarkProcessRegistry[id].processName === 'mount') {
          dialogs.notification(`Unmounted ${BookmarkProcessRegistry[id].bookmarkName}`)
        } else if (BookmarkProcessRegistry[id].processName.startsWith('serve_')) {
          const protocol = BookmarkProcessRegistry[id].data.protocol as ServeProtocol
          const servingProtocolName = getAvailableServeProtocols()[protocol]
          dialogs.notification(`${servingProtocolName} server for ${BookmarkProcessRegistry[id].bookmarkName} is stopped`)
        }
      }
      delete BookmarkProcessRegistry[id]
      fireRcloneUpdateActions()
    })
  }

  /**
   * Get the process
   */
  getProcess(): ChildProcess {
    return BookmarkProcessRegistry[this.id].process
  }

  /**
   * Set meta data
   */
  set<K extends keyof ProcessRegistryEntry['data']>(key: K, value: ProcessRegistryEntry['data'][K]): boolean {
    if (this.exists()) {
      BookmarkProcessRegistry[this.id].data[key] = value
      return true
    }
    return false
  }

  /**
   * Get meta data
   */
  get<K extends keyof ProcessRegistryEntry['data']>(key: K): ProcessRegistryEntry['data'][K] {
    return BookmarkProcessRegistry[this.id].data[key]
  }

  /**
   * Check if process is existing and running
   */
  exists(): boolean {
    return Object.prototype.hasOwnProperty.call(BookmarkProcessRegistry, this.id)
  }

  /**
   * Kill the process wit signal
   */
  kill(signal?: NodeJS.Signals): void {
    if (this.exists()) {
      BookmarkProcessRegistry[this.id].process.kill(signal || 'SIGTERM')
    } else {
      throw new Error('No such process')
    }
  }

  /**
   * Kill all processes for given bookmark
   */
  static killAll(bookmarkName?: string): void {
    Object.values(BookmarkProcessRegistry).forEach((item) => {
      if (!bookmarkName || item.bookmarkName === bookmarkName) {
        item.process.kill()
      }
    })
  }

  /**
   * Get count of active processes
   */
  static getActiveProcessesCount(): number {
    return Object.values(BookmarkProcessRegistry).length
  }

  /**
   * Process rclone output line and do action
   */
  rcloneProcessWatchdogLine(logLine: string): void {
    interface LineInfo {
      time: string
      level: string
      message: string
    }

    const lineInfo: LineInfo = {
      time: logLine.substring(0, 19),
      level: '',
      message: ''
    }

    const logParts = logLine.substring(19).trim().split(':')
    const potentialLevel = (logParts[0] || '').toString().toUpperCase().trim()

    if (['ERROR', 'NOTICE', 'INFO', 'DEBUG'].indexOf(potentialLevel) === -1) {
      lineInfo.level = 'UNKNOWN'
      lineInfo.message = logParts.join(':').trim()
    } else {
      lineInfo.level = potentialLevel
      lineInfo.message = logParts.slice(1).join(':').trim()
    }

    if (/rclone.*finishing/i.test(lineInfo.message)) {
      fireRcloneUpdateActions()
      return
    }

    if (/(Error while|Failed to|Fatal Error|coudn't connect)/i.test(lineInfo.message)) {
      dialogs.notification(lineInfo.message)
      BookmarkProcessRegistry[this.id].process.kill()
      fireRcloneUpdateActions()
      return
    }

    if (/Mounting on "/.test(lineInfo.message)) {
      dialogs.notification(`Mounted ${this.bookmarkName}`)
      fireRcloneUpdateActions()
      this.set('OK', true)
      return
    }

    const addressInUse = lineInfo.message.match(/Opening listener.*address already in use/i)
    if (addressInUse) {
      dialogs.notification(addressInUse[0])
      BookmarkProcessRegistry[this.id].process.kill()
      fireRcloneUpdateActions()
      return
    }

    const matchingString = lineInfo.message.match(/(Serving FTP on|Serving on|Server started on|Serving restic REST API on)\s*(.*)$/i)
    if (matchingString && matchingString[2]) {
      dialogs.notification(matchingString[0])
      this.set('OK', true)
      if (matchingString[1] === 'Serving FTP on') {
        this.set('URI', 'ftp://' + matchingString[2])
      } else {
        this.set('URI', matchingString[2])
      }
      fireRcloneUpdateActions()
      return
    }

    if (isDev) {
      console.log('Rclone Watchdog', lineInfo)
    }
  }

  /**
   * Helper function that split stream to lines and send to rcloneProcessWatchdogLine for processing
   */
  rcloneProcessWatchdog(data: Buffer): void {
    if (!BookmarkProcessRegistry[this.id].lineBuffer) {
      BookmarkProcessRegistry[this.id].lineBuffer = ''
    }

    const splitted = data.toString().split(/\r?\n/)
    const inTactLines = splitted.slice(0, splitted.length - 1)

    if (inTactLines.length > 0) {
      inTactLines[0] = (BookmarkProcessRegistry[this.id].lineBuffer || '') + inTactLines[0]
    }

    BookmarkProcessRegistry[this.id].lineBuffer = splitted[splitted.length - 1]

    for (let i = 0; i < inTactLines.length; ++i) {
      const line = inTactLines[i].trim()
      if (line) {
        this.rcloneProcessWatchdogLine(line)
      }
    }
  }
}

/**
 * Get current config file location
 */
export function getConfigFile(): string {
  return Cache.configFile
}

/**
 * Update version cache
 */
function updateVersionCache(): void {
  const output = doCommandSync(['version'])
  const version = output.trim().split(/\r?\n/).shift()?.split(/\s+/).pop() || 'Unknown'
  Cache.version = version
}

/**
 * Update bookmarks cache
 */
function updateBookmarksCache(): void {
  doCommand(['config', 'dump'])
    .then((bookmarksStr) => {
      Cache.bookmarks = {}
      try {
        const bookmarks = JSON.parse(bookmarksStr) as Record<string, Omit<Bookmark, '$name'>>

        Object.keys(bookmarks).forEach((key) => {
          const bookmark = bookmarks[key]
          if (!bookmark.type || UnsupportedRcloneProviders.indexOf(bookmark.type) !== -1) {
            return
          }
          Cache.bookmarks[key] = { ...bookmark, $name: key } as Bookmark
        })
      } catch (err) {
        throw new Error('Problem reading bookmarks list.')
      }
      fireRcloneUpdateActions()
    })
}

/**
 * Update providers cache, add $type options objects
 */
function updateProvidersCache(): void {
  doCommand(['config', 'providers'])
    .then((providersStr) => {
      let providers: Provider[]
      try {
        providers = JSON.parse(providersStr)
      } catch (err) {
        throw new Error('Cannot read providers list.')
      }

      Cache.providers = {}
      providers.forEach((provider) => {
        if (UnsupportedRcloneProviders.indexOf(provider.Prefix) !== -1) {
          return
        }

        if (BucketRequiredProviders.indexOf(provider.Prefix) !== -1) {
          provider.Options.unshift({
            $Label: 'Bucket or Path',
            $Type: 'string',
            Name: '_rclonetray_remote_path',
            Help: '',
            Required: true,
            Hide: false,
            Advanced: false
          })
        }

        provider.Options = provider.Options.map((optionDefinition) => {
          optionDefinition.$Type = 'string'
          if (optionDefinition.Default === true || optionDefinition.Default === false) {
            optionDefinition.$Type = 'boolean'
          } else if (typeof optionDefinition.Default === 'number' && !isNaN(optionDefinition.Default) && isFinite(optionDefinition.Default)) {
            optionDefinition.$Type = 'number'
          } else if (optionDefinition.IsPassword) {
            optionDefinition.$Type = 'password'
          }

          optionDefinition.$Namespace = 'options'
          return optionDefinition
        })

        provider.Options.push({
          $Label: 'Local Path',
          $Type: 'directory',
          Name: '_rclonetray_local_path_map',
          Help: 'Set local directory that could coresponding to the remote root. This option is required in order to use upload and download functions.',
          Required: false,
          Hide: false,
          Advanced: false
        })

        provider.Options.push({
          $Label: 'Custom Args',
          $Type: 'text',
          Name: '_rclonetray_custom_args',
          Help: `Custom arguments separated by space or new-line.\nRead more about options at https://rclone.org/${provider.Name}/#standard-options`,
          Required: false,
          Hide: false,
          Advanced: true
        })

        provider.Options = provider.Options.map((item) => {
          if (!item.$Label) {
            item.$Label = item.Name
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, (string) => string.charAt(0).toUpperCase() + string.substring(1))
              .trim()
          }
          return item
        })

        Cache.providers[provider.Prefix] = provider
      })

      fireRcloneUpdateActions()
    })
}

/**
 * Trigger for register update cache listeners
 */
function fireRcloneUpdateActions(eventName?: string): void {
  UpdateCallbacksRegistry.forEach((callback) => {
    callback(eventName)
  })
}

/**
 * Perform Rclone sync command
 */
function sync(method: 'upload' | 'download', bookmark: Bookmark): void {
  if (!bookmark._rclonetray_local_path_map) {
    console.error('Rclone', 'Sync', 'Local Path Map is not set for this bookmark', bookmark)
    throw new Error('Local Path Map is not set for this bookmark')
  }

  const localPathMapParsed = path.parse(bookmark._rclonetray_local_path_map)
  if (!localPathMapParsed.dir) {
    console.error('Rclone', 'Sync', 'Trying to sync from/to root', bookmark)
    throw new Error('Operations with root drive are not permited because are dangerous, set more inner directory for bookmark directory mapping or use cli for this purpose.')
  }

  const cmd = ['sync']
  if (method === 'upload') {
    cmd.push(bookmark._rclonetray_local_path_map, getBookmarkRemoteWithRoot(bookmark))
  } else {
    cmd.push(getBookmarkRemoteWithRoot(bookmark), bookmark._rclonetray_local_path_map)
  }
  cmd.push('-vv')

  if (method === 'upload') {
    if (!fs.readdirSync(bookmark._rclonetray_local_path_map).length) {
      throw new Error('Cannot upload empty directory.')
    }
  }

  const oppositeMethod = method === 'download' ? 'upload' : 'download'

  if (new BookmarkProcessManager(oppositeMethod, bookmark.$name).exists()) {
    throw new Error('Cannot perform downloading and uploading in same time.')
  }

  const proc = new BookmarkProcessManager(method, bookmark.$name)
  proc.create(cmd)
  proc.set('OK', true)
  fireRcloneUpdateActions()
}

/**
 * Get bookmark
 */
export function getBookmark(bookmark: Bookmark | string): Bookmark {
  if (typeof bookmark === 'object') {
    return bookmark
  } else if (bookmark in Cache.bookmarks) {
    return Cache.bookmarks[bookmark]
  } else {
    throw new Error(`No such bookmark ${bookmark}`)
  }
}

/**
 * Add callback to execute when Rclone config is changed.
 */
export function onUpdate(callback: (eventName?: string) => void): void {
  UpdateCallbacksRegistry.push(callback)
}

/**
 * Get available providers
 */
export function getProviders(): ProvidersCache {
  return Cache.providers
}

/**
 * Get specific provider
 */
export function getProvider(providerName: string): Provider {
  if (Object.prototype.hasOwnProperty.call(Cache.providers, providerName)) {
    return Cache.providers[providerName]
  } else {
    throw new Error(`No such provider ${providerName}`)
  }
}

/**
 * Get bookmarks
 */
export function getBookmarks(): BookmarksCache {
  return Cache.bookmarks
}

/**
 * Check if bookmark options are valid
 */
function validateBookmarkOptions(providerObject: Provider, values: Record<string, string>): void {
  providerObject.Options.forEach((optionDefinition) => {
    const fieldName = optionDefinition.$Label || optionDefinition.Name
    if (optionDefinition.Required && (!Object.prototype.hasOwnProperty.call(values, optionDefinition.Name) || !values[optionDefinition.Name])) {
      throw new Error(`${fieldName} field is required`)
    }
  })
}

/**
 * Update existing bookmark's fields
 */
function updateBookmarkFields(bookmarkName: string, providerObject: Provider, values: Record<string, string>, oldValues?: Record<string, string>): void {
  const valuesPlain: Record<string, string> = {}

  providerObject.Options.forEach((optionDefinition) => {
    if (optionDefinition.$Type === 'password') {
      if (!oldValues || oldValues[optionDefinition.Name] !== values[optionDefinition.Name]) {
        doCommandSync(['config', 'password', bookmarkName, optionDefinition.Name, values[optionDefinition.Name] || ''])
      }
    } else {
      if (optionDefinition.$Type === 'boolean') {
        if (optionDefinition.Name in values && ['true', 'yes', true, 1].includes(values[optionDefinition.Name] as unknown as string | number | boolean)) {
          values[optionDefinition.Name] = 'true'
        } else {
          values[optionDefinition.Name] = 'false'
        }
      }
      valuesPlain[optionDefinition.Name] = values[optionDefinition.Name]
    }
  })

  try {
    const configContent = fs.readFileSync(getConfigFile()).toString()
    const configIniStruct = ini.decode(configContent) as Record<string, Record<string, string>>
    configIniStruct[bookmarkName] = Object.assign(configIniStruct[bookmarkName] || {}, valuesPlain)
    fs.writeFileSync(getConfigFile(), ini.encode(configIniStruct, {
      whitespace: true
    }))
  } catch (err) {
    console.error(err)
    throw new Error('Cannot update bookmark fields.')
  }
  console.log('Rclone', 'Updated bookmark', bookmarkName)
}

/**
 * Create new bookmark
 */
export function addBookmark(type: string, bookmarkName: string, values: Record<string, string>): Promise<void> {
  const providerObject = getProvider(type)
  const configFile = getConfigFile()

  return new Promise((resolve, reject) => {
    if (!/^([a-zA-Z0-9\-_]{1,32})$/.test(bookmarkName)) {
      reject(new Error('Invalid name.\nName should be 1-32 chars long, and should contain only letters, digits - and _'))
      return
    }

    validateBookmarkOptions(providerObject, values)

    if (Object.prototype.hasOwnProperty.call(Cache.bookmarks, bookmarkName)) {
      reject(new Error(`There "${bookmarkName}" bookmark already`))
      return
    }

    try {
      const iniBlock = `\n[${bookmarkName}]\nconfig_automatic = no\ntype = ${type}\n`
      fs.appendFileSync(configFile, iniBlock)
      console.log('Rclone', 'Creating new bookmark', bookmarkName)
      try {
        updateBookmarkFields(bookmarkName, providerObject, values)
        dialogs.notification(`Bookmark ${bookmarkName} is created`)
        resolve()
      } catch (err) {
        console.error('Rclone', 'Reverting bookmark because of a problem', bookmarkName, err)
        doCommand(['config', 'delete', bookmarkName])
          .then(() => {
            reject(new Error('Cannot write bookmark options to config.'))
          })
          .catch(reject)
      }
    } catch (err) {
      console.error(err)
      reject(new Error('Cannot create new bookmark'))
    }
  })
}

/**
 * Update existing bookmark
 */
export function updateBookmark(bookmark: Bookmark | string, values: Record<string, string>): Promise<void> {
  const bm = getBookmark(bookmark)
  const providerObject = getProvider(bm.type)
  return new Promise((resolve, reject) => {
    validateBookmarkOptions(providerObject, values)

    try {
      updateBookmarkFields(bm.$name, providerObject, values, bm as unknown as Record<string, string>)
      dialogs.notification(`Bookmark ${bm.$name} is updated.`)
      resolve()
    } catch (err) {
      reject(err)
    }
  })
}

/**
 * Delete existing bookmark
 */
export function deleteBookmark(bookmark: Bookmark | string): Promise<void> {
  const bm = getBookmark(bookmark)
  return new Promise((resolve, reject) => {
    doCommand(['config', 'delete', bm.$name])
      .then(() => {
        BookmarkProcessManager.killAll(bm.$name)
        dialogs.notification(`Bookmark ${bm.$name} is deleted.`)
        resolve()
      })
      .catch(reject)
  })
}

/**
 * Get bookmark remote with root
 */
function getBookmarkRemoteWithRoot(bookmark: Bookmark): string {
  return bookmark.$name + ':' + (bookmark._rclonetray_remote_path || '/')
}

/**
 * Free directory that we use for mountpoints
 */
function freeMountpointDirectory(directoryPath: string): boolean {
  if (fs.existsSync(directoryPath)) {
    fs.readdir(directoryPath, (err, files) => {
      if (err) {
        throw err
      }
      if (!files.length) {
        fs.rmdirSync(directoryPath)
      }
    })
  }
  return true
}

/**
 * On windows find free drive letter.
 */
function win32GetFreeLetter(): string {
  const allLetters = ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z']
  const usedDriveLettersOutput = execSync('wmic logicaldisk get name')
  const usedDriveLetters = usedDriveLettersOutput.toString()
    .split(/\n/)
    .map((line) => {
      const letter = line.trim().match(/^([A-Z]):/)
      return letter ? letter[1] : null
    })
    .filter((letter): letter is string => !!letter)

  const freeLetter = allLetters.find((letter) => usedDriveLetters.indexOf(letter) === -1)

  if (!freeLetter) {
    throw new Error('Not available free drive letter')
  }

  return freeLetter + ':'
}

/**
 * Mount given bookmark
 */
export function mount(bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)
  const proc = new BookmarkProcessManager('mount', bm.$name)

  if (proc.exists()) {
    throw new Error(`Bookmark ${bm.$name} already mounted.`)
  }

  let mountpoint: string
  if (process.platform === 'win32') {
    mountpoint = win32GetFreeLetter()
  } else if (process.platform === 'linux') {
    mountpoint = path.join(os.homedir(), `mount.${bm.type}.${bm.$name}`)
  } else {
    mountpoint = path.join('/', 'Volumes', `${bm.type}.${bm.$name}`)
  }

  const mountpointDirectoryExists = fs.existsSync(mountpoint)
  if (!mountpoint || (mountpointDirectoryExists && fs.readdirSync(mountpoint).length > 0)) {
    throw new Error(`Destination mountpoint "${mountpoint}" is not free.`)
  }
  if (process.platform === 'linux' && !mountpointDirectoryExists) {
    fs.mkdirSync(mountpoint)
  }

  proc.create([
    'mount',
    getBookmarkRemoteWithRoot(bm),
    mountpoint,
    '--attr-timeout', Math.max(1, parseInt(String(settings.get('rclone_cache_files')))) + 's',
    '--dir-cache-time', Math.max(1, parseInt(String(settings.get('rclone_cache_directories')))) + 's',
    '--allow-non-empty',
    '--volname', bm.$name,
    '-vv'
  ])
  proc.set('mountpoint', mountpoint)

  if (process.platform === 'linux') {
    proc.getProcess().on('close', () => {
      freeMountpointDirectory(mountpoint)
      if (fs.existsSync(mountpoint)) {
        fs.readdir(mountpoint, (err, files) => {
          if (err) {
            throw err
          }
          if (!files.length) {
            fs.rmdir(mountpoint, () => { })
          }
        })
      }
    })
  }

  fireRcloneUpdateActions()
}

/**
 * Check is given bookmark is mounted
 */
export function getMountStatus(bookmark: Bookmark | string): string | false {
  const bm = getBookmark(bookmark)
  const proc = new BookmarkProcessManager('mount', bm.$name)
  if (proc.exists()) {
    const mountpoint = proc.get('mountpoint')
    if (mountpoint && fs.existsSync(mountpoint)) {
      return mountpoint
    }
  }
  return false
}

/**
 * Unmount given bookmark
 */
export function unmount(bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)
  const proc = new BookmarkProcessManager('mount', bm.$name)
  if (proc.exists()) {
    proc.kill()
  }
}

/**
 * Open mounted directory bookmark in platform's file browser
 */
export function openMountPoint(bookmark: Bookmark | string): void {
  const mountpoint = getMountStatus(bookmark)
  if (mountpoint) {
    shell.openExternal(`file://${mountpoint}`)
  } else {
    console.error('Trying to open non-mounted drive.')
  }
}

/**
 * Perform download task
 */
export function download(bookmark: Bookmark | string): void {
  sync('download', getBookmark(bookmark))
}

/**
 * Perform upload task
 */
export function upload(bookmark: Bookmark | string): void {
  sync('upload', getBookmark(bookmark))
}

/**
 * Check if current is uploading
 */
export function isUpload(bookmark: Bookmark | string): boolean {
  const bm = getBookmark(bookmark)
  return new BookmarkProcessManager('upload', bm.$name).exists()
}

/**
 * Check if current is downloading
 */
export function isDownload(bookmark: Bookmark | string): boolean {
  const bm = getBookmark(bookmark)
  return new BookmarkProcessManager('download', bm.$name).exists()
}

/**
 * Stop currently running downloading process
 */
export function stopDownload(bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)
  new BookmarkProcessManager('download', bm.$name).kill()
}

/**
 * Stop currently running uploading process
 */
export function stopUpload(bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)
  new BookmarkProcessManager('upload', bm.$name).kill()
}

/**
 * Check if automatic upload is enabled for bookmark
 */
export function isAutomaticUpload(bookmark: Bookmark | string): boolean {
  const bm = getBookmark(bookmark)
  return Object.prototype.hasOwnProperty.call(AutomaticUploadRegistry, bm.$name)
}

/**
 * Toggle automatic upload for bookmark
 */
export function toggleAutomaticUpload(bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)

  if (Object.prototype.hasOwnProperty.call(AutomaticUploadRegistry, bm.$name)) {
    if (AutomaticUploadRegistry[bm.$name].timer) {
      clearTimeout(AutomaticUploadRegistry[bm.$name].timer as NodeJS.Timeout)
    }
    AutomaticUploadRegistry[bm.$name].watcher?.close()
    delete AutomaticUploadRegistry[bm.$name]
  } else if (bm._rclonetray_local_path_map) {
    AutomaticUploadRegistry[bm.$name] = {
      watcher: null,
      timer: null
    }

    AutomaticUploadRegistry[bm.$name].watcher = chokidar.watch(bm._rclonetray_local_path_map, {
      ignoreInitial: true,
      disableGlobbing: true,
      usePolling: false,
      useFsEvents: true,
      persistent: true,
      alwaysStat: true,
      atomic: true
    })

    AutomaticUploadRegistry[bm.$name].watcher!.on('raw', () => {
      if (AutomaticUploadRegistry[bm.$name].timer) {
        clearTimeout(AutomaticUploadRegistry[bm.$name].timer as NodeJS.Timeout)
      }
      const delaySeconds = parseInt(String(settings.get('rclone_sync_autoupload_delay'))) || 5
      AutomaticUploadRegistry[bm.$name].timer = setTimeout(() => {
        sync('upload', bm)
      }, delaySeconds * 1000)
    })
  }

  fireRcloneUpdateActions()
}

/**
 * Open local path mapping
 */
export function openLocal(bookmark: Bookmark | string): boolean | void {
  const bm = getBookmark(bookmark)
  if (bm._rclonetray_local_path_map) {
    if (fs.existsSync(bm._rclonetray_local_path_map)) {
      return shell.openExternal(`file://${bm._rclonetray_local_path_map}`) as unknown as boolean
    } else {
      console.error('Rclone', 'Local path does not exists.', bm._rclonetray_local_path_map, bm.$name)
      throw new Error(`Local path ${bm._rclonetray_local_path_map} does not exists`)
    }
  }
  return false
}

/**
 * Get available serving protocols
 */
export function getAvailableServeProtocols(): ServeProtocols {
  const protocols: ServeProtocols = {}
  if (settings.get('rclone_serving_http_enable')) {
    protocols.http = 'HTTP'
  }
  if (settings.get('rclone_serving_ftp_enable')) {
    protocols.ftp = 'FTP'
  }
  if (settings.get('rclone_serving_webdav_enable')) {
    protocols.webdav = 'WebDAV'
  }
  if (settings.get('rclone_serving_restic_enable')) {
    protocols.restic = 'Restic'
  }
  return protocols
}

/**
 * Start serving protocol+bookmark
 */
export function serveStart(protocol: ServeProtocol, bookmark: Bookmark | string): void {
  if (!Object.prototype.hasOwnProperty.call(getAvailableServeProtocols(), protocol)) {
    throw new Error(`Protocol "${protocol}" is not supported`)
  }

  const bm = getBookmark(bookmark)
  const proc = new BookmarkProcessManager(`serve_${protocol}`, bm.$name)

  if (proc.exists()) {
    throw new Error(`${bm.$name} is already serving.`)
  }

  const command = [
    'serve',
    protocol,
    getBookmarkRemoteWithRoot(bm),
    '-vv'
  ]

  if (protocol !== 'restic') {
    if (protocol !== 'webdav') {
      command.push('--attr-timeout', Math.max(1, parseInt(String(settings.get('rclone_cache_files')))) + 's')
    }
    command.push('--dir-cache-time', Math.max(1, parseInt(String(settings.get('rclone_cache_directories')))) + 's')
  }

  const servingUsername = settings.get('rclone_serving_username')
  const servingPassword = settings.get('rclone_serving_password')

  if (servingUsername) {
    command.push('--user', servingUsername)
  }
  if (servingPassword) {
    command.push('--pass', servingPassword)
  }

  proc.create(command)
  proc.set('protocol', protocol)
  fireRcloneUpdateActions()
}

/**
 * Stop serving protocol+bookmark
 */
export function serveStop(protocol: ServeProtocol, bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)
  if (serveStatus(protocol, bookmark) !== false) {
    const proc = new BookmarkProcessManager(`serve_${protocol}`, bm.$name)
    if (proc.exists()) {
      proc.kill()
    }
  }
}

/**
 * Check if current protocol+bookmark is in serving
 */
export function serveStatus(protocol: ServeProtocol, bookmark: Bookmark | string): string | false {
  const bm = getBookmark(bookmark)
  const proc = new BookmarkProcessManager(`serve_${protocol}`, bm.$name)
  if (proc.exists()) {
    return proc.get('URI') || ''
  }
  return false
}

/**
 * Open NCDU in platform's terminal emulator
 */
export function openNCDU(bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)
  let command = prepareRcloneCommand(['ncdu', getBookmarkRemoteWithRoot(bm)])
  command = appendCustomRcloneCommandArgs(command, bm.$name)
  doCommandInTerminal(command)
}

/**
 * Get version of installed Rclone
 */
export function getVersion(): string {
  return Cache.version || 'Unknown'
}

/**
 * Get the full rclone config as JSON
 */
export function getConfig(): Promise<BookmarksCache> {
  return doCommand(['config', 'dump'])
    .then((output) => {
      try {
        return JSON.parse(output)
      } catch (err) {
        throw new Error('Cannot parse rclone config')
      }
    })
}

/**
 * Init Rclone
 */
export function init(): void {
  if (process.platform === 'linux' || process.platform === 'darwin') {
    process.env.PATH += ':' + path.join('/', 'usr', 'local', 'bin')
  }

  try {
    updateVersionCache()
  } catch (err) {
    dialogs.missingRclone()
    updateVersionCache()
  }

  if (settings.get('rclone_config')) {
    Cache.configFile = settings.get('rclone_config')
  } else {
    const output = doCommandSync(['config', 'file'])
    Cache.configFile = output.trim().split(/\r?\n/).pop() || ''
  }

  if (!fs.existsSync(getConfigFile())) {
    fs.appendFileSync(getConfigFile(), '')
  }

  chokidar.watch(getConfigFile(), {
    ignoreInitial: true,
    disableGlobbing: true,
    usePolling: false,
    useFsEvents: true,
    persistent: true,
    alwaysStat: true,
    atomic: true
  })
    .on('change', updateBookmarksCache)

  updateProvidersCache()
  updateBookmarksCache()
}

/**
 * Prepare app to quit, show dialog if there is running processes
 */
export function prepareQuit(event: Electron.Event): void {
  if (BookmarkProcessManager.getActiveProcessesCount() < 1) {
    return
  }

  if (!dialogs.confirmExit()) {
    event.preventDefault()
    return
  }

  BookmarkProcessManager.killAll()
}

export default {
  getConfigFile,
  getConfig,

  getProviders,
  getProvider,

  getBookmark,
  getBookmarks,
  addBookmark,
  updateBookmark,
  deleteBookmark,

  mount,
  unmount,
  getMountStatus,
  openMountPoint,

  download,
  stopDownload,
  isDownload,

  upload,
  stopUpload,
  isUpload,
  isAutomaticUpload,
  toggleAutomaticUpload,

  openLocal,

  getAvailableServeProtocols,
  serveStart,
  serveStop,
  serveStatus,

  openNCDU,

  getVersion,

  onUpdate,

  init,

  prepareQuit
}


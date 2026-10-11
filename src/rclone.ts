'use strict'

import { execFile, execFileSync, spawn, spawnSync, ChildProcess } from 'child_process'
import { StringDecoder } from 'string_decoder'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as fs from 'fs'
import chokidar from 'chokidar'
import { app, powerMonitor, shell } from 'electron'
import isDev from 'electron-is-dev'
import * as settings from './settings'
import * as dialogs from './dialogs'
import { formatTerminalCommand, shouldAppendAutoConfirm } from './rclone/command'
import { AUTO_UPLOAD_IGNORED, automaticUploadDelay } from './rclone/auto-upload'
import { sanitizeCustomArgs, splitCommandArgs } from './rclone/custom-args'
import { extractServeUrl, isFatalLog, isMountAttemptLine, parseLogLine, progressFromLog, redactSecrets, WatchedJobKind } from './rclone/log-lines'
import { summarizeDryRun } from './rclone/dry-run'
import { backupConfigOnce, readConfigText, writeConfigText } from './rclone/config-repository'
import { ConfigEditError, editConfigText, isEncryptedRcloneConfig, listConfigSections } from './rclone/config-text'
import { assertAllowedExternalUrl } from './rclone/external-links'
import {
  displayDefault,
  fieldKind,
  isBucketBasedPrefix,
  isOptionHidden,
  isProviderOptionActive,
  providerDocsUrl,
  providerNeedsOAuth,
  remotePathSpec,
  selectConfigFields
} from './rclone/provider-fields'
import { assertNewRemoteName } from './rclone/remote-name'
import { getJobStates as listJobStates, startJob, appendJobLog, updateJob, finishJob, clearFinishedJobs as dropFinishedJobs, JobKind } from './rclone/job-state'
import { getSyncLocalPathError } from './rclone/path-safety'
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

export { enquoteCommand, shouldAppendAutoConfirm } from './rclone/command'
export { isProviderOptionActive } from './rclone/provider-fields'

/**
 * Define unsupported provider types
 */
const UnsupportedRcloneProviders: string[] = [
  'union',
  'crypt'
]

const ProviderAliases: Record<string, string> = {}
const createsInFlight = new Set<string>()

/**
 * Rclone executable filename
 */
const RcloneBinaryName: string = process.platform === 'win32' ? 'rclone.exe' : 'rclone'

/**
 * Map Node's process.arch values to the architecture folder names produced by
 * update-rclone-binaries.sh (which uses rclone/Go naming). Without this mapping
 * the bundled binary cannot be found on x64 (Node) vs amd64 (rclone) etc.
 */
const RcloneArchMap: Record<string, string> = {
  x64: 'amd64',
  ia32: '386',
  arm64: 'arm64',
  arm: 'arm-v7'
}
const RcloneBinaryArch: string = RcloneArchMap[process.arch] || process.arch

/**
 * Bundled Rclone path.
 * Can be overridden with RCLONETRAY_RCLONE_PATH (useful for tests and power users).
 */
const RcloneBinaryBundled: string = process.env.RCLONETRAY_RCLONE_PATH
  ? process.env.RCLONETRAY_RCLONE_PATH
  : app.isPackaged
    ? path.join(process.resourcesPath, 'rclone', process.platform, RcloneBinaryArch, RcloneBinaryName)
    : path.join(app.getAppPath(), 'rclone', process.platform, RcloneBinaryArch, RcloneBinaryName)

let bundledRclonePrepared = false
let sessionUseBundled: boolean | null = null
let activeBundledBinary = RcloneBinaryBundled

function useBundledRclone(): boolean {
  if (sessionUseBundled === null) {
    sessionUseBundled = settings.get('rclone_use_bundled')
  }
  return sessionUseBundled
}

export function useSystemRclone(): void {
  settings.set('rclone_use_bundled', false)
  sessionUseBundled = false
  bundledRclonePrepared = false
}

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
 * Prepare array to Rclone command, rclone binary should be ommited
 */
function prepareRcloneCommand(command: string[]): string[] {
  const appendAutoConfirm = shouldAppendAutoConfirm(command)
  const config = getConfigFile()
  if (config) {
    command.unshift('--config', config)
  }
  command.unshift('--ask-password=false')

  if (useBundledRclone()) {
    prepareBundledRcloneBinary()
    command.unshift(activeBundledBinary)
  } else {
    command.unshift(resolveOnPath(RcloneBinaryName))
  }

  if (appendAutoConfirm) {
    command.push('--auto-confirm')
  }
  const verb = command.find((part) => ['mount', 'serve', 'sync', 'copy', 'move', 'ncdu'].includes(part))
  if (verb) {
    appendPerformanceFlags(command)
  }

  return command
}

/**
 * Find an executable on PATH, skipping empty entries (those are the current
 * directory on Windows, which must not win over a real install).
 */
function resolveOnPath(fileName: string): string {
  const extra = process.platform === 'darwin'
    ? ['/opt/homebrew/bin', '/usr/local/bin']
    : process.platform === 'linux'
      ? ['/usr/local/bin', '/home/linuxbrew/.linuxbrew/bin']
      : []
  const dirs = (process.env.PATH || '').split(path.delimiter).concat(extra).filter((dir) => dir.trim())
  for (const dir of dirs) {
    const candidate = path.join(dir, fileName)
    try {
      if (fs.existsSync(candidate)) {
        return candidate
      }
    } catch {
      // Unreadable PATH entry. Try the next one.
    }
  }
  return fileName
}

function ensureExecutableCopy(binaryPath: string): string {
  const canRun = (target: string): boolean => {
    try {
      fs.accessSync(target, fs.constants.X_OK)
      return true
    } catch {
      return false
    }
  }
  if (!canRun(binaryPath)) {
    try {
      fs.chmodSync(binaryPath, 0o755)
    } catch {
      // Read-only install (.deb, AppImage, DMG). Copy below.
    }
  }
  if (canRun(binaryPath)) {
    return binaryPath
  }
  const dest = path.join(app.getPath('userData'), 'bin', RcloneBinaryName)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.copyFileSync(binaryPath, dest)
  try {
    fs.chmodSync(dest, 0o755)
  } catch {
    // The copy is in a user-writable directory; launch will report a real error.
  }
  return dest
}

function prepareBundledRcloneBinary(): void {
  if (bundledRclonePrepared) {
    return
  }

  if (!fs.existsSync(RcloneBinaryBundled)) {
    throw new Error(`Bundled rclone binary not found: ${RcloneBinaryBundled}`)
  }

  if (process.platform !== 'win32') {
    activeBundledBinary = ensureExecutableCopy(RcloneBinaryBundled)
  }

  if (process.platform === 'darwin') {
    try {
      execFileSync('/usr/bin/xattr', ['-dr', 'com.apple.quarantine', path.dirname(activeBundledBinary)], {
        stdio: 'ignore'
      })
    } catch {
      // No quarantine attribute or no xattr permission. Let the real rclone
      // launch error drive the user-facing message.
    }
  }

  bundledRclonePrepared = true
}

/**
 * Append custom rclone args to command array
 */
export function appendCustomRcloneCommandArgs(commandArray: string[], bookmarkName?: string): string[] {
  const verboseCommandStrPattern = /^-v+$/
  const collect = (raw: string): string[] => sanitizeCustomArgs(
    splitCommandArgs(raw).filter((arg) => !verboseCommandStrPattern.test(arg)),
    commandArray
  )

  let custom: string[] = []
  const customArgsStr = settings.get('custom_args') || ''
  if (customArgsStr.trim()) {
    custom = custom.concat(collect(customArgsStr))
  }

  if (bookmarkName) {
    const bookmark = getBookmark(bookmarkName)
    if (bookmark._rclonetray_custom_args && bookmark._rclonetray_custom_args.trim()) {
      custom = custom.concat(collect(bookmark._rclonetray_custom_args))
    }
  }

  return commandArray.concat(custom)
}

/**
 * Maximum output buffer for rclone commands (config dump can be large)
 */
const RcloneExecMaxBuffer = 32 * 1024 * 1024

/**
 * Execute async Rclone command.
 * Uses execFile (no shell) to avoid quoting/escaping bugs and shell injection.
 */
function doCommand(command: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const cmd = prepareRcloneCommand(command)
    if (isDev) {
      console.info('Rclone[A]', cmd)
    }
    execFile(cmd[0], cmd.slice(1), { maxBuffer: RcloneExecMaxBuffer, windowsHide: true }, (err, stdout, stderr) => {
      if (err) {
        console.error('Rclone', err)
        const detail = stderr.toString().trim() || err.message
        reject(new Error(`Rclone command error: ${detail}`))
      } else {
        resolve(stdout)
      }
    })
  })
}

/**
 * Execute synchronious Rclone command and return the output.
 * Uses execFileSync (no shell) to avoid quoting/escaping bugs and shell injection.
 */
function doCommandSync(command: string[]): string {
  const cmd = prepareRcloneCommand(command)
  if (isDev) {
    console.info('Rclone[S]', cmd)
  }
  return execFileSync(cmd[0], cmd.slice(1), { maxBuffer: RcloneExecMaxBuffer, windowsHide: true }).toString()
}

/**
 * Execute command in terminal
 */
function doCommandInTerminal(command: string[]): void {
  const cmdStr = formatTerminalCommand(command)

  if (isDev) {
    console.log('Rclone[T]', cmdStr)
  }

  if (process.platform === 'darwin') {
    const escapedCmd = cmdStr.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    spawn('/usr/bin/osascript', ['-e', `tell application "Terminal" to do script "${escapedCmd}" activate`], { windowsHide: true })
    return
  }
  if (process.platform === 'win32') {
    const cmdExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    spawn(cmdExe, ['/d', '/s', '/c', 'start', 'RcloneTray', 'cmd', '/k', cmdStr], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore'
    }).unref()
    return
  }
  const tempCmdDir = fs.mkdtempSync(path.join(tempDir, 'rclonetray-'))
  fs.chmodSync(tempCmdDir, 0o700)
  const tempCmdWrapper = path.join(tempCmdDir, 'cmd-wrapper.sh')
  const script = `#!/usr/bin/env sh\n${cmdStr}\nstatus=$?\nif [ "$status" -ne 0 ]; then\n  echo\n  echo "rclone exited with status $status. Press Enter to close."\n  read _unused\nfi\nexit "$status"\n`
  fs.writeFileSync(tempCmdWrapper, script, { mode: 0o700 })
  const terminals = ['x-terminal-emulator', 'gnome-terminal', 'konsole', 'xfce4-terminal', 'xterm']
  const tryTerminal = (index: number): void => {
    if (index >= terminals.length) {
      dialogs.notification('Could not open a terminal. Install x-terminal-emulator, gnome-terminal, or xterm.', 'error')
      return
    }
    const terminal = terminals[index]
    const args = terminal === 'gnome-terminal' || terminal === 'xfce4-terminal'
      ? ['--', tempCmdWrapper]
      : terminal === 'konsole'
        ? ['-e', tempCmdWrapper]
        : ['-e', tempCmdWrapper]
    const child = spawn(terminal, args, { detached: true, stdio: 'ignore' })
    child.once('error', () => tryTerminal(index + 1))
    child.unref()
  }
  tryTerminal(0)
}

/**
 * Simple process tracker. Used to track the rclone command processes status and output.
 */
class BookmarkProcessManager {
  id: string
  bookmarkName: string
  processName: string
  private decoder = new StringDecoder('utf8')
  private pendingLine = ''
  private mountTimer: ReturnType<typeof setTimeout> | null = null
  private childEnv: NodeJS.ProcessEnv | null = null

  constructor(processName: string, bookmarkName: string) {
    this.id = `${bookmarkName}:${processName}`
    this.bookmarkName = bookmarkName
    this.processName = processName
  }

  private watchedKind(): WatchedJobKind {
    if (this.processName === 'mount') return 'mount'
    if (this.processName === 'download' || this.processName === 'upload') return 'transfer'
    if (this.processName.startsWith('serve_')) return 'serve'
    return 'other'
  }

  private clearMountTimer(): void {
    if (this.mountTimer) {
      clearTimeout(this.mountTimer)
      this.mountTimer = null
    }
  }

  private getJobKind(): JobKind {
    if (this.processName === 'mount') return 'mount'
    if (this.processName === 'download') return 'download'
    if (this.processName === 'upload') return 'upload'
    if (this.processName.startsWith('serve_')) return 'serve'
    if (this.processName === 'ncdu') return 'ncdu'
    return 'other'
  }

  /**
   * Create new monitored process
   */
  create(command: string[], env?: NodeJS.ProcessEnv): void {
    this.childEnv = env || null
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
    if (!cmd.includes('--use-json-log')) {
      cmd.push('--use-json-log')
    }

    const child = spawn(cmd[0], cmd.slice(1), {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: this.childEnv || process.env
    })
    BookmarkProcessRegistry[id] = {
      bookmarkName: this.bookmarkName,
      processName: this.processName,
      process: child,
      data: {
        OK: false
      }
    }
    startJob({
      id,
      bookmarkName: this.bookmarkName,
      kind: this.getJobKind(),
      label: `${this.processName} ${this.bookmarkName}`,
      pid: child.pid
    })

    if (isDev) {
      console.log('Rclone[BP]', cmd)
    }

    BookmarkProcessRegistry[id].process.stderr?.on('data', this.rcloneProcessWatchdog.bind(this))

    BookmarkProcessRegistry[id].process.on('error', (error) => {
      console.error('Rclone process failed:', error)
      dialogs.notification(`Rclone ${this.processName} failed: ${error.message}`)
      finishJob(id, 'failed', error.message)
      delete BookmarkProcessRegistry[id]
      fireRcloneUpdateActions()
    })

    BookmarkProcessRegistry[id].process.on('close', (code, signal) => {
      this.clearMountTimer()
      const entry = BookmarkProcessRegistry[id]
      if (!entry) {
        return
      }
      const transfer = entry.processName === 'download' || entry.processName === 'upload'
      const success = code === 0 && !signal
      if (transfer) {
        if (success) {
          const verb = entry.processName === 'download' ? 'Downloading from' : 'Uploading to'
          dialogs.notification(`${verb} ${entry.bookmarkName} is finished`)
          finishJob(id, 'succeeded')
        } else {
          const message = signal ? `Stopped by ${signal}` : `Exited with code ${code ?? 'unknown'}`
          finishJob(id, signal ? 'cancelled' : 'failed', message)
        }
        const pending = AutomaticUploadRegistry[entry.bookmarkName]
        if (entry.processName === 'upload' && pending?.dirty) {
          pending.dirty = false
          scheduleAutomaticUpload(entry.bookmarkName)
        }
      } else if (entry.data.OK) {
        if (entry.processName === 'mount') {
          dialogs.notification(`Unmounted ${entry.bookmarkName}`)
        } else if (entry.processName.startsWith('serve_')) {
          const protocol = entry.data.protocol as ServeProtocol
          const servingProtocolName = getAvailableServeProtocols()[protocol]
          dialogs.notification(`${servingProtocolName} server for ${entry.bookmarkName} is stopped`)
        }
        finishJob(id, 'succeeded')
      } else {
        const message = signal ? `Stopped by ${signal}` : `Exited with code ${code ?? 'unknown'}`
        finishJob(id, signal ? 'cancelled' : 'failed', message)
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
      finishJob(this.id, 'cancelled', 'Stopped by user')
      BookmarkProcessRegistry[this.id].process.kill(signal || 'SIGTERM')
    } else {
      throw new Error('No such process')
    }
  }

  /**
   * Kill all processes for given bookmark
   */
  static killAll(bookmarkName?: string, signal?: NodeJS.Signals): void {
    Object.values(BookmarkProcessRegistry).forEach((item) => {
      if (!bookmarkName || item.bookmarkName === bookmarkName) {
        try {
          item.process.kill(signal)
        } catch {
          // Already gone.
        }
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
  private failWatchedJob(message: string): void {
    this.clearMountTimer()
    dialogs.notification(message)
    finishJob(this.id, 'failed', message)
    const child = BookmarkProcessRegistry[this.id]?.process
    if (child && !child.killed) {
      child.kill()
    }
    fireRcloneUpdateActions()
  }

  rcloneProcessWatchdogLine(logLine: string): void {
    const secret = String(settings.get('rclone_serving_password') || '')
    const safeLine = redactSecrets(logLine, secret ? [secret] : [])
    appendJobLog(this.id, safeLine)
    const parsed = parseLogLine(safeLine)
    const progress = progressFromLog(safeLine)
    if (progress) {
      updateJob(this.id, { progress })
    }
    const kind = this.watchedKind()

    if (isFatalLog(parsed, kind)) {
      this.failWatchedJob(parsed.message || 'Rclone failed')
      return
    }

    if (kind === 'mount' && isMountAttemptLine(parsed) && !this.mountTimer && !this.get('OK')) {
      const letter = parsed.message.match(/Mounting on "([A-Za-z]:)/)
      if (letter) {
        this.set('mountpoint', letter[1])
      }
      this.mountTimer = setTimeout(() => {
        this.mountTimer = null
        if (!this.exists() || this.get('OK')) {
          return
        }
        this.set('OK', true)
        dialogs.notification(`Mounted ${this.bookmarkName}`)
        fireRcloneUpdateActions()
      }, 750)
      return
    }

    if (kind === 'serve') {
      const uri = extractServeUrl(parsed.message)
      if (uri) {
        dialogs.notification(parsed.message)
        this.set('OK', true)
        this.set('URI', uri)
        updateJob(this.id, { uri })
        fireRcloneUpdateActions()
      }
    }
  }

  /**
   * Reassemble stderr across chunks without splitting a UTF-8 character.
   */
  rcloneProcessWatchdog(data: Buffer): void {
    const text = this.pendingLine + this.decoder.write(data)
    const parts = text.split(/\r?\n/)
    this.pendingLine = parts.pop() || ''
    for (const line of parts) {
      if (line.trim()) {
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
let bookmarkCacheGeneration = 0

function updateBookmarksCache(): Promise<void> {
  const generation = ++bookmarkCacheGeneration
  return doCommand(['config', 'dump'])
    .then((bookmarksStr) => {
      if (generation !== bookmarkCacheGeneration) {
        return
      }
      const next: BookmarksCache = {}
      try {
        const bookmarks = JSON.parse(bookmarksStr) as Record<string, Omit<Bookmark, '$name'>>

        Object.keys(bookmarks).forEach((key) => {
          const bookmark = bookmarks[key]
          const stored = { ...bookmark, $name: key } as Bookmark
          if (!bookmark.type) {
            stored.$broken = '1'
          } else if (UnsupportedRcloneProviders.indexOf(bookmark.type) !== -1) {
            stored.$limited = '1'
          }
          next[key] = stored
        })
      } catch (err) {
        throw new Error('Problem reading bookmarks list.')
      }
      Cache.bookmarks = next
      fireRcloneUpdateActions()
      armSavedAutomaticUploads()
      armAutoMounts()
    })
    .catch((err) => {
      console.error('Rclone', 'Cannot update bookmarks cache:', err)
      throw err
    })
}

/**
 * Update providers cache, add $type options objects
 */
function updateProvidersCache(): Promise<void> {
  return doCommand(['config', 'providers'])
    .then((providersStr) => {
      let providers: Provider[]
      try {
        providers = JSON.parse(providersStr)
      } catch (err) {
        throw new Error('Cannot read providers list.')
      }

      Cache.providers = {}
      Object.keys(ProviderAliases).forEach((key) => {
        delete ProviderAliases[key]
      })
      providers.forEach((provider) => {
        if (UnsupportedRcloneProviders.indexOf(provider.Prefix) !== -1) {
          return
        }

        const bucketBased = isBucketBasedPrefix(provider.Prefix)
        provider.Options.unshift({
          $Label: bucketBased ? 'Bucket or Path' : 'Remote path',
          $Type: 'string',
          Name: '_rclonetray_remote_path',
          Help: bucketBased
            ? 'Container, bucket, or a path inside it. Upload and Download refuse an empty path so a sync cannot delete every container.'
            : 'Path on the remote. Leave this empty to use the remote default. For SFTP and FTP that is the home directory, not the filesystem root.',
          Required: false,
          Hide: false,
          Advanced: false
        })

        provider.Options.push({
          $Label: 'Local Path',
          $Type: 'directory',
          Name: '_rclonetray_local_path_map',
          Help: 'Local directory that corresponds to the remote path. Required for upload and download.',
          Required: false,
          Hide: false,
          Advanced: false
        })
        provider.Options.push({
          $Label: 'Mount read only',
          $Type: 'boolean',
          Name: '_rclonetray_mount_read_only',
          Help: 'Mount this remote read-only.',
          Required: false,
          Hide: false,
          Advanced: true
        })
        provider.Options.push({
          $Label: 'Mount VFS mode',
          $Type: 'string',
          Name: '_rclonetray_vfs_cache_mode',
          Help: 'Overrides the Preferences VFS mode for this remote. Leave empty to use the global setting. off, minimal, writes, or full.',
          Required: false,
          Hide: false,
          Advanced: true
        })
        provider.Options.push({
          $Label: 'Mount cache size',
          $Type: 'string',
          Name: '_rclonetray_vfs_cache_max_size',
          Help: 'Optional VFS cache size, for example 1G.',
          Required: false,
          Hide: false,
          Advanced: true
        })
        provider.Options.push({
          $Label: 'Exclude patterns',
          $Type: 'text',
          Name: '_rclonetray_exclude',
          Help: 'One rclone --exclude pattern per line. Used by Upload and Download.',
          Required: false,
          Hide: false,
          Advanced: true
        })
        provider.Options.push({
          $Label: 'Mount at launch',
          $Type: 'boolean',
          Name: '_rclonetray_auto_mount',
          Help: 'Mount this remote when RcloneTray starts.',
          Required: false,
          Hide: false,
          Advanced: true
        })

        provider.Options.push({
          $Label: 'Custom Args',
          $Type: 'text',
          Name: '_rclonetray_custom_args',
          Help: `Custom arguments separated by space or newline.\nRead more about options at ${providerDocsUrl(provider.Prefix)}`,
          Required: false,
          Hide: false,
          Advanced: true
        })

        provider.Options = provider.Options.map((optionDefinition) => {
          const kind = fieldKind(optionDefinition)
          if (kind === 'boolean') {
            optionDefinition.$Type = 'boolean'
          } else if (kind === 'tristate') {
            optionDefinition.$Type = 'tristate'
            optionDefinition.Default = displayDefault(optionDefinition)
          } else if (kind === 'number') {
            optionDefinition.$Type = 'number'
          } else if (kind === 'password') {
            optionDefinition.$Type = 'password'
          } else if (kind === 'directory' || kind === 'file' || kind === 'text') {
            optionDefinition.$Type = kind
          } else {
            optionDefinition.$Type = 'string'
            if (optionDefinition.DefaultStr) {
              optionDefinition.Default = displayDefault(optionDefinition)
            }
          }
          optionDefinition.Hide = isOptionHidden(optionDefinition.Hide)
          optionDefinition.$Namespace = 'options'
          if (!optionDefinition.$Label) {
            optionDefinition.$Label = optionDefinition.Name
              .replace(/_/g, ' ')
              .replace(/\w\S*/g, (string) => string.charAt(0).toUpperCase() + string.substring(1))
              .trim()
          }
          return optionDefinition
        })

        Cache.providers[provider.Prefix] = provider
        ProviderAliases[provider.Prefix.toLowerCase()] = provider.Prefix
        if (provider.Name) {
          ProviderAliases[provider.Name.toLowerCase()] = provider.Prefix
        }
      })

      fireRcloneUpdateActions()
    })
    .catch((err) => {
      console.error('Rclone', 'Cannot update providers cache:', err)
      throw err
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
function buildTransferCommand(method: 'upload' | 'download', bookmark: Bookmark, transferMode: 'sync' | 'copy' = 'sync'): string[] {
  const cmd: string[] = [transferMode]
  if (method === 'upload') {
    cmd.push(bookmark._rclonetray_local_path_map || '', getBookmarkRemoteWithRoot(bookmark))
  } else {
    cmd.push(getBookmarkRemoteWithRoot(bookmark), bookmark._rclonetray_local_path_map || '')
  }
  cmd.push('-vv')
  const excludes = String(bookmark._rclonetray_exclude || '').split(/\n/).map((pattern) => pattern.trim()).filter(Boolean)
  excludes.forEach((pattern) => {
    cmd.push('--exclude', pattern)
  })
  const maxDelete = Number(settings.get('rclone_sync_max_delete') || 0)
  if (maxDelete > 0 && transferMode === 'sync') {
    cmd.push('--max-delete', String(maxDelete))
  }
  const backupDir = String(settings.get('rclone_sync_backup_dir') || '').trim()
  if (backupDir && transferMode === 'sync') {
    cmd.push('--backup-dir', backupDir)
  }
  return cmd
}

function appendPerformanceFlags(command: string[]): void {
  const transfers = Number(settings.get('rclone_transfers') || 0)
  const checkers = Number(settings.get('rclone_checkers') || 0)
  const bwlimit = String(settings.get('rclone_bwlimit') || '').trim()
  if (transfers > 0) {
    command.push('--transfers', String(transfers))
  }
  if (checkers > 0) {
    command.push('--checkers', String(checkers))
  }
  if (bwlimit) {
    command.push('--bwlimit', bwlimit)
  }
}

const RclonePreviewTimeoutMsLong = 5 * 60 * 1000
let activePreview: ChildProcess | null = null

function collectCommand(command: string[], timeoutMs: number, bookmarkName?: string): Promise<{ ok: boolean; timedOut: boolean; text: string }> {
  const cmd = prepareRcloneCommand(appendCustomRcloneCommandArgs(command, bookmarkName))
  return new Promise((resolve) => {
    const child = spawn(cmd[0], cmd.slice(1), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] })
    activePreview = child
    const decoder = new StringDecoder('utf8')
    let output = ''
    const take = (chunk: Buffer): void => {
      output += decoder.write(chunk)
      if (output.length > 400000) {
        output = output.slice(-400000)
      }
    }
    child.stdout?.on('data', take)
    child.stderr?.on('data', take)
    let settled = false
    const finish = (result: { ok: boolean; timedOut: boolean; text: string }): void => {
      if (settled) {
        return
      }
      settled = true
      if (activePreview === child) {
        activePreview = null
      }
      resolve(result)
    }
    const timer = setTimeout(() => {
      child.kill()
      finish({ ok: false, timedOut: true, text: output })
    }, timeoutMs)
    child.on('error', (error) => {
      clearTimeout(timer)
      finish({ ok: false, timedOut: false, text: error.message })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      output += decoder.end()
      finish({ ok: code === 0, timedOut: false, text: output })
    })
  })
}

export function cancelActivePreview(): void {
  if (activePreview && !activePreview.killed) {
    activePreview.kill()
  }
}

async function buildSyncPreview(method: 'upload' | 'download', bookmark: Bookmark): Promise<{ ok: boolean; timedOut: boolean; text: string }> {
  const previewCommand = [...buildTransferCommand(method, bookmark), '--dry-run']
  const result = await collectCommand(previewCommand, RclonePreviewTimeoutMsLong, bookmark.$name)
  if (result.timedOut) {
    return {
      ok: true,
      timedOut: true,
      text: 'The dry-run did not finish in time. You can continue without a complete preview, or cancel and try again.'
    }
  }
  if (!result.ok) {
    return {
      ok: false,
      timedOut: false,
      text: `Dry-run failed before the real sync could start:\n${result.text.trim()}`
    }
  }
  return { ok: true, timedOut: false, text: summarizeDryRun(result.text).text }
}

async function sync(method: 'upload' | 'download', bookmark: Bookmark, options: { skipConfirm?: boolean } = {}): Promise<void> {
  const localPath = bookmark._rclonetray_local_path_map || ''
  const localPathError = getSyncLocalPathError(localPath)
  if (localPathError) {
    console.error('Rclone', 'Sync', localPathError, bookmark)
    throw new Error(localPathError)
  }
  assertBucketPath(bookmark)

  if (method === 'upload') {
    const names = fs.readdirSync(localPath).filter((name) => !AUTO_UPLOAD_IGNORED.test(name))
    if (!names.length) {
      throw new Error('Nothing to upload yet. The folder is empty.')
    }
  }

  const oppositeMethod = method === 'download' ? 'upload' : 'download'

  if (new BookmarkProcessManager(oppositeMethod, bookmark.$name).exists()) {
    throw new Error('A transfer is already running for this remote.')
  }

  const cmd = buildTransferCommand(method, bookmark, options.skipConfirm ? 'copy' : 'sync')
  if (!options.skipConfirm) {
    const preview = await buildSyncPreview(method, bookmark)
    if (!preview.ok) {
      throw new Error(preview.text)
    }
    const source = method === 'upload' ? localPath : getBookmarkRemoteWithRoot(bookmark)
    const destination = method === 'upload' ? getBookmarkRemoteWithRoot(bookmark) : localPath
    const proceed = await dialogs.confirmTransferAsync(method, bookmark.$name, source, destination, preview.text)
    if (!proceed) {
      return
    }
  }

  const proc = new BookmarkProcessManager(method, bookmark.$name)
  proc.create(cmd)
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
export async function getProviders(): Promise<ProvidersCache> {
  if (Object.keys(Cache.providers).length === 0) {
    await updateProvidersCache()
  }
  return Cache.providers
}

/**
 * Get specific provider
 */
export function getProvider(providerName: string): Provider {
  if (Object.prototype.hasOwnProperty.call(Cache.providers, providerName)) {
    return Cache.providers[providerName]
  }
  const alias = ProviderAliases[providerName.toLowerCase()]
  if (alias && Cache.providers[alias]) {
    return Cache.providers[alias]
  }
  throw new Error(`No such provider ${providerName}`)
}

/**
 * Get bookmarks
 */
export function getBookmarks(): BookmarksCache {
  return Cache.bookmarks
}



function validateBookmarkOptions(providerObject: Provider, values: Record<string, unknown>, existing?: Record<string, unknown>): void {
  const activeValues = { ...(existing || {}), ...values }
  providerObject.Options.forEach((optionDefinition) => {
    if (!isProviderOptionActive(optionDefinition, activeValues)) {
      return
    }
    if (!optionDefinition.Required) {
      return
    }
    const submitted = Object.prototype.hasOwnProperty.call(values, optionDefinition.Name) ? values[optionDefinition.Name] : undefined
    const already = existing ? existing[optionDefinition.Name] : undefined
    if (!submitted && !already) {
      throw new Error(`${optionDefinition.$Label || optionDefinition.Name} field is required`)
    }
  })
}

async function obscurePasswordFields(fields: { set: Record<string, string>; obscure: string[] }): Promise<void> {
  for (const key of fields.obscure) {
    const plain = fields.set[key]
    let obscured = ''
    try {
      obscured = (await doCommand(['obscure', '--', plain])).trim()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      throw new Error(`Could not store ${key}. ${message}`)
    }
    if (!obscured || obscured === plain) {
      throw new Error(`Could not store ${key}.`)
    }
    fields.set[key] = obscured
  }
}

function configErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ConfigEditError) {
    return error.message
  }
  if (error instanceof Error && error.message) {
    return error.message
  }
  return fallback
}

/**
 * Create new bookmark
 */
export async function addBookmark(type: string, bookmarkName: string, values: Record<string, unknown>): Promise<void> {
  const providerObject = getProvider(type)
  assertNewRemoteName(bookmarkName)
  validateBookmarkOptions(providerObject, values)

  if (createsInFlight.has(bookmarkName)) {
    throw new Error(`Remote "${bookmarkName}" is already being created.`)
  }
  createsInFlight.add(bookmarkName)
  const configFile = getConfigFile()
  let original = ''
  let wrote = false
  try {
    original = readConfigText(configFile)
    if (isEncryptedRcloneConfig(original)) {
      throw new ConfigEditError('This rclone config is encrypted. RcloneTray will not change it. Decrypt it, or edit it with rclone config.')
    }
    if (listConfigSections(original).includes(bookmarkName)) {
      throw new ConfigEditError(`A remote named "${bookmarkName}" already exists.`)
    }
    const fields = selectConfigFields(providerObject.Options, values, 'create')
    await obscurePasswordFields(fields)
    backupConfigOnce(configFile)
    const next = editConfigText(original, {
      section: bookmarkName,
      createType: providerObject.Prefix,
      set: fields.set,
      unset: fields.unset
    })
    writeConfigText(configFile, next)
    wrote = true
    await updateBookmarksCache()
    dialogs.notification(`Bookmark ${bookmarkName} is created`)
    if (providerNeedsOAuth(providerObject.Options)) {
      reconnectRemote(bookmarkName)
    }
  } catch (err) {
    if (wrote) {
      try {
        writeConfigText(configFile, original)
        await updateBookmarksCache()
      } catch (rollbackError) {
        console.error('Rclone', 'Cannot rollback failed bookmark creation:', rollbackError)
      }
    }
    console.error('Rclone', 'Cannot create bookmark', bookmarkName, err)
    throw new Error(configErrorMessage(err, 'Cannot write bookmark options to config.'))
  } finally {
    createsInFlight.delete(bookmarkName)
  }
}

/**
 * Update existing bookmark
 */
export async function updateBookmark(bookmark: Bookmark | string, values: Record<string, unknown>): Promise<void> {
  const bm = getBookmark(bookmark)
  const providerObject = getProvider(bm.type)
  validateBookmarkOptions(providerObject, values, bm as unknown as Record<string, unknown>)
  stopAutomaticUpload(bm.$name)
  const configFile = getConfigFile()
  const original = readConfigText(configFile)
  if (isEncryptedRcloneConfig(original)) {
    throw new ConfigEditError('This rclone config is encrypted. RcloneTray will not change it. Decrypt it, or edit it with rclone config.')
  }
  if (!listConfigSections(original).includes(bm.$name)) {
    throw new ConfigEditError(`Remote "${bm.$name}" does not exist. It was not recreated.`)
  }
  const fields = selectConfigFields(providerObject.Options, values, 'update', bm as unknown as Record<string, unknown>)
  await obscurePasswordFields(fields)
  if (Object.keys(fields.set).length === 0 && fields.unset.length === 0) {
    dialogs.notification(`Bookmark ${bm.$name} is updated.`)
    return
  }
  backupConfigOnce(configFile)
  try {
    const next = editConfigText(original, {
      section: bm.$name,
      set: fields.set,
      unset: fields.unset
    })
    writeConfigText(configFile, next)
    await updateBookmarksCache()
    dialogs.notification(`Bookmark ${bm.$name} is updated.`)
  } catch (err) {
    console.error('Rclone', 'Cannot update bookmark', bm.$name, err)
    throw new Error(configErrorMessage(err, 'Cannot update bookmark fields.'))
  }
}

/**
 * Delete existing bookmark
 */
export async function deleteBookmark(bookmark: Bookmark | string): Promise<void> {
  const bm = getBookmark(bookmark)
  const configFile = getConfigFile()
  const original = readConfigText(configFile)
  if (isEncryptedRcloneConfig(original)) {
    throw new ConfigEditError('This rclone config is encrypted. RcloneTray will not change it.')
  }
  backupConfigOnce(configFile)
  writeConfigText(configFile, editConfigText(original, { section: bm.$name, removeSection: true }))
  stopAutomaticUpload(bm.$name)
  BookmarkProcessManager.killAll(bm.$name)
  await updateBookmarksCache()
  dialogs.notification(`Bookmark ${bm.$name} is deleted.`)
}

/**
 * Get bookmark remote with root
 */
function getBookmarkRemoteWithRoot(bookmark: Bookmark): string {
  return remotePathSpec(bookmark.$name, bookmark._rclonetray_remote_path)
}

function assertBucketPath(bookmark: Bookmark): void {
  const provider = (() => {
    try {
      return getProvider(bookmark.type)
    } catch {
      return null
    }
  })()
  const bucketBased = isBucketBasedPrefix(bookmark.type) || isBucketBasedPrefix(provider?.Prefix)
  if (bucketBased && !bookmark._rclonetray_remote_path) {
    throw new Error(`Set a bucket or path for ${bookmark.$name} before uploading or downloading. Syncing the account root can delete every container.`)
  }
}

/**
 * Build the rclone "mount" argument array (without the binary itself).
 * Extracted as a pure-ish function for testability.
 */
export function buildMountArgs(remoteWithRoot: string, mountpoint: string, volname: string): string[] {
  const args = [
    'mount',
    remoteWithRoot,
    mountpoint,
    '--attr-timeout', Math.max(1, parseInt(String(settings.get('rclone_cache_files')))) + 's',
    '--dir-cache-time', Math.max(1, parseInt(String(settings.get('rclone_cache_directories')))) + 's',
    '--volname', volname,
    '-vv'
  ]

  // VFS cache mode is the single most important flag for a mount that behaves
  // like a real disk: without it many apps cannot write/seek/truncate files and
  // copies through Finder/Explorer fail. Default to "writes"; user-configurable.
  const vfsCacheMode = String(settings.get('rclone_mount_vfs_cache_mode') || 'writes').trim()
  if (vfsCacheMode && vfsCacheMode !== 'off') {
    args.push('--vfs-cache-mode', vfsCacheMode)
  }
  if (settings.get('rclone_mount_network_mode') && process.platform === 'win32') {
    args.push('--network-mode')
  }

  return args
}

/**
 * Build the rclone "serve" command array (without the binary itself).
 * Includes cache and authentication flags based on current settings.
 * Extracted as a pure-ish function for testability.
 */
export function buildServeCommand(protocol: ServeProtocol, remoteWithRoot: string, addr?: string): string[] {
  const command = [
    'serve',
    protocol,
    remoteWithRoot,
    '-vv'
  ]

  if (addr) {
    command.push('--addr', addr)
  }

  if (protocol !== 'restic') {
    command.push('--dir-cache-time', Math.max(1, parseInt(String(settings.get('rclone_cache_directories')))) + 's')
  }
  if (settings.get('rclone_serve_read_only') && protocol === 'restic') {
    command.push('--append-only')
  }
  if (settings.get('rclone_serve_read_only') && protocol !== 'restic') {
    command.push('--read-only')
  }

  return command
}

/**
 * Credentials go in the environment so they are not in argv or the startup line.
 * A password without a username is rejected: rclone ignores it for HTTP, WebDAV and Restic.
 */
export function serveAuthEnv(username: string, password: string): { RCLONE_USER: string; RCLONE_PASS: string } | null {
  if (password && !username) {
    throw new Error('Set a serving username as well as a password. A password alone leaves the server open.')
  }
  if (!username && !password) {
    return null
  }
  return { RCLONE_USER: username, RCLONE_PASS: password }
}

/**
 * Free directory that we use for mountpoints
 */
function freeMountpointDirectory(directoryPath: string): void {
  fs.readdir(directoryPath, (err, files) => {
    if (err || files.length) {
      return
    }
    fs.rmdir(directoryPath, () => undefined)
  })
}

function recoverStaleMount(mountpoint: string): void {
  if (process.platform === 'win32' || mountpoint === '*') {
    return
  }
  try {
    const stat = fs.lstatSync(mountpoint)
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(mountpoint)
      if (entries.length === 0) {
        return
      }
    }
  } catch {
    spawnSync('fusermount', ['-u', mountpoint], { windowsHide: true })
    spawnSync('fusermount3', ['-u', mountpoint], { windowsHide: true })
    try {
      fs.rmdirSync(mountpoint)
    } catch {
      // The next mount attempt reports a real error if it is still busy.
    }
  }
}

export function mountDriverProblem(): { message: string; url: string } | null {
  if (process.platform === 'win32') {
    const candidates = [
      'C:\\Program Files\\WinFsp\\bin\\winfsp-x64.dll',
      'C:\\Program Files (x86)\\WinFsp\\bin\\winfsp-x64.dll',
      'C:\\Program Files\\WinFsp\\bin\\winfsp-a64.dll'
    ]
    if (!candidates.some((candidate) => fs.existsSync(candidate))) {
      return { message: 'Mounting on Windows needs WinFsp.', url: 'https://winfsp.dev/rel/' }
    }
  } else if (process.platform === 'darwin') {
    const fuse = ['/Library/Filesystems/macfuse.fs', '/Library/Filesystems/fuse-t.fs'].some((candidate) => fs.existsSync(candidate))
    if (!fuse) {
      return { message: 'Mounting on macOS needs macFUSE or FUSE-T.', url: 'https://osxfuse.github.io/' }
    }
  } else if (!resolveOnPath('fusermount').includes(path.sep) && !resolveOnPath('fusermount3').includes(path.sep)) {
    return { message: 'Mounting on Linux needs fusermount.', url: 'https://github.com/libfuse/libfuse' }
  }
  return null
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

  const driver = mountDriverProblem()
  if (driver) {
    const proceed = dialogs.confirmAction(`${driver.message}\n${driver.url}\n\nTry to mount anyway?`, 'Mount anyway')
    if (!proceed) {
      throw new Error(driver.message)
    }
  }

  let mountpoint: string
  if (process.platform === 'win32') {
    // Let WinFsp choose a free letter. Picking one ourselves races when two mounts start together.
    mountpoint = '*'
  } else if (process.platform === 'linux') {
    mountpoint = path.join(os.homedir(), `mount.${bm.type}.${bm.$name}`)
  } else {
    mountpoint = path.join('/', 'Volumes', `${bm.type}.${bm.$name}`)
  }

  if (process.platform !== 'win32') {
    recoverStaleMount(mountpoint)
  }
  const mountpointDirectoryExists = fs.existsSync(mountpoint)
  let mountpointBusy = false
  if (mountpointDirectoryExists && mountpoint !== '*') {
    try {
      mountpointBusy = fs.readdirSync(mountpoint).length > 0
    } catch {
      recoverStaleMount(mountpoint)
      mountpointBusy = fs.existsSync(mountpoint)
    }
  }
  if (!mountpoint || mountpointBusy) {
    throw new Error(`Destination mountpoint "${mountpoint}" is not free.`)
  }
  if (process.platform === 'linux' && !mountpointDirectoryExists) {
    fs.mkdirSync(mountpoint)
  }

  const mountArgs = buildMountArgs(getBookmarkRemoteWithRoot(bm), mountpoint, bm.$name)
  if (bm._rclonetray_vfs_cache_mode && bm._rclonetray_vfs_cache_mode !== 'default') {
    mountArgs.push('--vfs-cache-mode', bm._rclonetray_vfs_cache_mode)
  }
  if (bm._rclonetray_mount_read_only === 'true') {
    mountArgs.push('--read-only')
  }
  if (bm._rclonetray_vfs_cache_max_size) {
    mountArgs.push('--vfs-cache-max-size', bm._rclonetray_vfs_cache_max_size)
  }
  proc.create(mountArgs)
  proc.set('mountpoint', mountpoint)

  if (process.platform === 'linux') {
    proc.getProcess().on('close', () => {
      freeMountpointDirectory(mountpoint)
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
    return proc.get('mountpoint') || ''
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
    void shell.openPath(mountpoint).then((error) => {
      if (error) {
        console.error('Cannot open mount point:', error)
      }
    })
  } else {
    console.error('Trying to open non-mounted drive.')
  }
}

/**
 * Perform download task
 */
export function download(bookmark: Bookmark | string): Promise<void> {
  return sync('download', getBookmark(bookmark))
}

/**
 * Perform upload task
 */
export function upload(bookmark: Bookmark | string): Promise<void> {
  return sync('upload', getBookmark(bookmark))
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

function stopAutomaticUpload(name: string): void {
  const entry = AutomaticUploadRegistry[name]
  if (!entry) {
    return
  }
  if (entry.timer) {
    clearTimeout(entry.timer)
  }
  try {
    entry.watcher?.close()
  } catch (error) {
    console.error('Rclone', 'Cannot close automatic upload watcher:', error)
  }
  delete AutomaticUploadRegistry[name]
}

function scheduleAutomaticUpload(name: string): void {
  const entry = AutomaticUploadRegistry[name]
  const bookmark = Cache.bookmarks[name]
  if (!entry || !bookmark) {
    return
  }
  if (new BookmarkProcessManager('upload', name).exists()) {
    entry.dirty = true
    return
  }
  const delayMs = (parseInt(String(settings.get('rclone_sync_autoupload_delay'))) || 5) * 1000
  const now = Date.now()
  if (!entry.firstEventAt) {
    entry.firstEventAt = now
  }
  const wait = automaticUploadDelay(entry.firstEventAt, now, delayMs, Math.max(delayMs * 10, 60000))
  if (entry.timer) {
    clearTimeout(entry.timer)
  }
  entry.timer = setTimeout(() => {
    const current = AutomaticUploadRegistry[name]
    if (!current) {
      return
    }
    current.timer = null
    current.firstEventAt = null
    if (new BookmarkProcessManager('upload', name).exists()) {
      current.dirty = true
      return
    }
    void sync('upload', getBookmark(name), { skipConfirm: true }).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error)
      if (/already such process|already running/i.test(message)) {
        current.dirty = true
        return
      }
      const prefix = /Nothing to upload/i.test(message) ? '' : `Automatic upload failed for ${name}: `
      dialogs.notification(`${prefix}${message}`)
      console.error('Rclone', 'Automatic upload failed:', error)
    })
  }, wait)
}

function watchAutomaticUpload(name: string, directory: string): { close: () => void } {
  const onChange = (filename?: string | null): void => {
    if (filename && AUTO_UPLOAD_IGNORED.test(filename)) {
      return
    }
    if (!AutomaticUploadRegistry[name]) {
      return
    }
    scheduleAutomaticUpload(name)
  }
  const onError = (error: Error): void => {
    dialogs.notification(`Automatic upload stopped for ${name}: ${error.message}`)
    stopAutomaticUpload(name)
    fireRcloneUpdateActions()
  }
  if (process.platform === 'win32' || process.platform === 'darwin') {
    const watcher = fs.watch(directory, { recursive: true }, (_event, filename) => onChange(filename))
    watcher.on('error', onError)
    return { close: () => watcher.close() }
  }
  const watcher = chokidar.watch(directory, {
    ignoreInitial: true,
    followSymlinks: false,
    disableGlobbing: true,
    ignored: AUTO_UPLOAD_IGNORED,
    atomic: true
  })
  watcher.on('error', onError)
  watcher.on('add', (filePath) => onChange(filePath))
  watcher.on('change', (filePath) => onChange(filePath))
  watcher.on('unlink', (filePath) => onChange(filePath))
  return { close: () => { void watcher.close() } }
}

function rememberAutomaticUploads(): void {
  settings.set('rclone_autoupload_names', Object.keys(AutomaticUploadRegistry).join('\n'))
}

let autoMountsArmed = false
let savedUploadsArmed = false

function armAutoMounts(): void {
  if (autoMountsArmed) {
    return
  }
  autoMountsArmed = true
  Object.values(Cache.bookmarks).forEach((bookmark) => {
    if (bookmark._rclonetray_auto_mount === 'true' && bookmark.$limited !== '1' && bookmark.$broken !== '1') {
      try {
        mount(bookmark)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        dialogs.notification(`Could not mount ${bookmark.$name} at launch: ${message}`, 'error')
      }
    }
  })
}

function armSavedAutomaticUploads(): void {
  if (savedUploadsArmed) {
    return
  }
  savedUploadsArmed = true
  const names = String(settings.get('rclone_autoupload_names') || '').split(/\n/).map((name) => name.trim()).filter(Boolean)
  names.forEach((name) => {
    const bookmark = Cache.bookmarks[name]
    if (bookmark && !AutomaticUploadRegistry[name]) {
      try {
        startAutomaticUpload(bookmark)
      } catch (error) {
        console.error('Rclone', 'Cannot restore automatic upload:', error)
      }
    }
  })
}

export function flushAutomaticUploads(): void {
  Object.keys(AutomaticUploadRegistry).forEach((name) => {
    const entry = AutomaticUploadRegistry[name]
    if (!entry) {
      return
    }
    if (entry.timer) {
      clearTimeout(entry.timer)
      entry.timer = null
    }
    entry.dirty = true
    entry.firstEventAt = Date.now() - 120000
    scheduleAutomaticUpload(name)
  })
}

/**
 * Toggle automatic upload for bookmark
 */
export function toggleAutomaticUpload(bookmark: Bookmark | string): void {
  const bm = getBookmark(bookmark)

  if (Object.prototype.hasOwnProperty.call(AutomaticUploadRegistry, bm.$name)) {
    stopAutomaticUpload(bm.$name)
  } else if (bm._rclonetray_local_path_map) {
    const localPath = bm._rclonetray_local_path_map
    const localPathError = getSyncLocalPathError(localPath)
    if (localPathError) {
      throw new Error(localPathError)
    }
    let stat: fs.Stats
    try {
      stat = fs.statSync(localPath)
    } catch {
      throw new Error(`Local path does not exist: ${localPath}`)
    }
    if (!stat.isDirectory()) {
      throw new Error(`Local path is not a directory: ${localPath}`)
    }
    void dialogs.confirmAutomaticUploadAsync(bm.$name, localPath, getBookmarkRemoteWithRoot(bm)).then((accepted) => {
      if (!accepted) {
        fireRcloneUpdateActions()
        return
      }
      startAutomaticUpload(bm)
      rememberAutomaticUploads()
      fireRcloneUpdateActions()
    })
    return
  }

  rememberAutomaticUploads()
  fireRcloneUpdateActions()
}

function startAutomaticUpload(bm: Bookmark): void {
  if (AutomaticUploadRegistry[bm.$name] || !bm._rclonetray_local_path_map) {
    return
  }
  const localPath = bm._rclonetray_local_path_map
  AutomaticUploadRegistry[bm.$name] = {
    watcher: null,
    timer: null,
    dirty: false,
    firstEventAt: null
  }
  AutomaticUploadRegistry[bm.$name].watcher = watchAutomaticUpload(bm.$name, localPath)
}

/**
 * Open local path mapping
 */
export function openLocal(bookmark: Bookmark | string): boolean | void {
  const bm = getBookmark(bookmark)
  if (bm._rclonetray_local_path_map) {
    const localPath = bm._rclonetray_local_path_map
    if (fs.existsSync(localPath)) {
      let directory = false
      try {
        directory = fs.statSync(localPath).isDirectory()
      } catch {
        directory = false
      }
      if (!directory) {
        shell.showItemInFolder(localPath)
        return true
      }
      void shell.openPath(localPath).then((error) => {
        if (error) {
          console.error('Cannot open local path:', error)
        }
      })
      return true
    } else {
      console.error('Rclone', 'Local path does not exists.', bm._rclonetray_local_path_map, bm.$name)
      throw new Error(`Local path ${bm._rclonetray_local_path_map} does not exists`)
    }
  }
  return false
}

export function openExternalUrl(rawUrl: string): void {
  const safeUrl = assertAllowedExternalUrl(rawUrl)
  void shell.openExternal(safeUrl).catch((error) => {
    console.error('Cannot open external URL:', error)
  })
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
function allocateLocalPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((closeError) => {
        if (closeError || !port) {
          reject(closeError || new Error('Could not allocate a port'))
          return
        }
        resolve(port)
      })
    })
  })
}

export function serveStart(protocol: ServeProtocol, bookmark: Bookmark | string): void {
  if (!Object.prototype.hasOwnProperty.call(getAvailableServeProtocols(), protocol)) {
    throw new Error(`Protocol "${protocol}" is not supported`)
  }

  const bm = getBookmark(bookmark)
  const proc = new BookmarkProcessManager(`serve_${protocol}`, bm.$name)

  if (proc.exists()) {
    throw new Error(`${bm.$name} is already serving.`)
  }

  const auth = serveAuthEnv(
    String(settings.get('rclone_serving_username') || ''),
    String(settings.get('rclone_serving_password') || '')
  )
  void allocateLocalPort().then((port) => {
    if (proc.exists()) {
      return
    }
    const command = buildServeCommand(protocol, getBookmarkRemoteWithRoot(bm), `127.0.0.1:${port}`)
    proc.create(command, auth ? { ...process.env, ...auth } : undefined)
    proc.set('protocol', protocol)
    fireRcloneUpdateActions()
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    dialogs.notification(`Could not start ${protocol} for ${bm.$name}: ${message}`)
  })
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

export function getJobStates() {
  return listJobStates()
}

export function clearFinishedJobs() {
  return dropFinishedJobs()
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
export function bookmarkNeedsReconnect(bookmark: Bookmark): boolean {
  try {
    return providerNeedsOAuth(getProvider(bookmark.type).Options) && !bookmark.token
  } catch {
    return false
  }
}

export function reconnectRemote(bookmarkName: string): void {
  const command = prepareRcloneCommand(['config', 'reconnect', `${bookmarkName}:`])
  dialogs.notification(`Finish sign-in for ${bookmarkName} in the window that opened.`)
  if (process.platform === 'win32') {
    const cmdExe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    const script = formatTerminalCommand(command)
    spawn(cmdExe, ['/d', '/s', '/c', 'start', 'rclone sign-in', 'cmd', '/k', script], {
      detached: true,
      windowsHide: true,
      stdio: 'ignore'
    }).unref()
    return
  }
  doCommandInTerminal(command)
}

export function init(): void {
  sessionUseBundled = settings.get('rclone_use_bundled')
  powerMonitor.on('resume', () => {
    Object.keys(AutomaticUploadRegistry).forEach((name) => {
      const entry = AutomaticUploadRegistry[name]
      if (entry) {
        entry.dirty = true
        scheduleAutomaticUpload(name)
      }
    })
  })
  if (process.platform === 'linux' || process.platform === 'darwin') {
    process.env.PATH += ':' + path.join('/', 'usr', 'local', 'bin')
  }

  try {
    updateVersionCache()
  } catch (err) {
    const choice = dialogs.missingRclone(err)
    if (choice === 3) {
      useSystemRclone()
    } else if (choice !== 1) {
      return
    }
    bundledRclonePrepared = false
    try {
      updateVersionCache()
    } catch (retryErr) {
      dialogs.missingRclone(retryErr)
      return
    }
  }

  // Allow overriding the rclone config location via environment (used for tests
  // and isolated profiles). RCLONETRAY_CONFIG_FILE wins over RCLONETRAY_CONFIG_DIR.
  const envConfigFile = process.env.RCLONETRAY_CONFIG_FILE
    ? process.env.RCLONETRAY_CONFIG_FILE
    : process.env.RCLONETRAY_CONFIG_DIR
      ? path.join(process.env.RCLONETRAY_CONFIG_DIR, 'rclone.conf')
      : ''

  if (envConfigFile) {
    Cache.configFile = envConfigFile
  } else if (settings.get('rclone_config')) {
    Cache.configFile = settings.get('rclone_config')
  } else {
    const output = doCommandSync(['config', 'file'])
    Cache.configFile = output.trim().split(/\r?\n/).pop() || ''
  }

  const ensureConfigLocation = (): void => {
    const configDir = path.dirname(getConfigFile())
    if (configDir && !fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true })
    }
    if (!fs.existsSync(getConfigFile())) {
      fs.writeFileSync(getConfigFile(), '', { mode: 0o600 })
    }
  }

  try {
    ensureConfigLocation()
  } catch (error) {
    const saved = Cache.configFile
    console.error('Rclone config path is not available:', saved, error)
    try {
      const output = doCommandSync(['config', 'file'])
      Cache.configFile = output.trim().split(/\r?\n/).pop() || ''
      ensureConfigLocation()
      dialogs.notification(`Saved rclone config path is not available (${saved}). Using ${Cache.configFile} for this session.`)
    } catch (fallbackError) {
      console.error('Rclone', 'Cannot fall back to the default config:', fallbackError)
      dialogs.notification('rclone config path is not available, and the default config could not be opened. Open Preferences after fixing the path.')
      return
    }
  }

  if (isEncryptedRcloneConfig(readConfigText(getConfigFile()))) {
    dialogs.notification('rclone.conf is encrypted. RcloneTray will not edit it. Decrypt it, or change it with rclone config.')
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
    .on('change', () => {
      void updateBookmarksCache().catch(() => undefined)
    })

  void updateProvidersCache().catch(() => undefined)
  void updateBookmarksCache().catch(() => undefined)
}

/**
 * Prepare app to quit, show dialog if there is running processes
 */
let allowQuit = false
let quitPromptOpen = false
let relaunchOnQuit = false

let relaunchExecPath = ''

export function requestRelaunch(): void {
  relaunchOnQuit = true
  if (process.platform === 'linux' && process.env.APPIMAGE) {
    relaunchExecPath = process.env.APPIMAGE
  }
  app.quit()
}

export function stopAllProcesses(): void {
  BookmarkProcessManager.killAll()
}

export function stopJob(id: string): void {
  const entry = BookmarkProcessRegistry[id]
  if (!entry) {
    throw new Error('That job is not running.')
  }
  try {
    entry.process.kill()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(message)
  }
}

export async function testRemoteConnection(bookmarkName: string): Promise<string> {
  const bookmark = getBookmark(bookmarkName)
  const result = await collectCommand(['lsf', getBookmarkRemoteWithRoot(bookmark), '--max-depth', '1'], 20000, bookmark.$name)
  if (result.timedOut) {
    throw new Error('Connection test timed out.')
  }
  if (!result.ok) {
    throw new Error(result.text.trim() || 'Connection test failed.')
  }
  const lines = result.text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 20)
  return lines.length ? `Connected. First entries:\n${lines.join('\n')}` : 'Connected. The remote path is empty.'
}

export function prepareQuit(event: Electron.Event): void {
  if (BookmarkProcessManager.getActiveProcessesCount() < 1) {
    if (relaunchOnQuit) {
      app.relaunch(relaunchExecPath ? { execPath: relaunchExecPath } : undefined)
      relaunchOnQuit = false
    }
    return
  }
  if (allowQuit) {
    return
  }
  event.preventDefault()
  if (quitPromptOpen) {
    return
  }
  quitPromptOpen = true
  void dialogs.confirmExitAsync().then((confirmed) => {
    quitPromptOpen = false
    if (!confirmed) {
      relaunchOnQuit = false
      return
    }
    flushAutomaticUploads()
    BookmarkProcessManager.killAll()
    const deadline = Date.now() + 4000
    const waitForChildren = (): void => {
      if (BookmarkProcessManager.getActiveProcessesCount() < 1 || Date.now() >= deadline) {
        allowQuit = true
        if (relaunchOnQuit) {
          app.relaunch(relaunchExecPath ? { execPath: relaunchExecPath } : undefined)
          BookmarkProcessManager.killAll(undefined, 'SIGKILL')
        }
        app.quit()
        return
      }
      setTimeout(waitForChildren, 100)
    }
    waitForChildren()
  })
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
  openExternalUrl,

  getAvailableServeProtocols,
  serveStart,
  serveStop,
  serveStatus,

  openNCDU,

  getVersion,
  getJobStates,

  onUpdate,

  init,

  prepareQuit
}
